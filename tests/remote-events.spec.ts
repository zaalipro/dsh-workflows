import { describe, expect, it } from 'vitest'

import {
  registerWorkflowRemoteEvents,
  applyRemoteEvents,
  type WorkflowRemoteEvent,
} from '../src/remote-events.js'

interface KeyedLatestPolicy {
  readonly kind: 'keyed-latest'
  readonly maxKeys: number
  readonly select: (change: WorkflowRemoteEvent) => { readonly kind: 'key'; readonly key: string } | { readonly kind: 'invalidate-all' }
  readonly invalidationArgs: readonly [WorkflowRemoteEvent]
}

/** H-shaped keyed-latest lane used to prove the package policy, not a local queue. */
class FakeKeyedLatest {
  name?: string
  policy?: KeyedLatestPolicy
  disposed = false
  lane: Map<string, WorkflowRemoteEvent> | WorkflowRemoteEvent = new Map()

  register(event: string, policy: KeyedLatestPolicy): () => void {
    this.name = event
    this.policy = policy
    return () => { this.disposed = true }
  }

  push(change: WorkflowRemoteEvent): void {
    const policy = this.policy
    if (policy === undefined) throw new Error('unregistered')
    if (!(this.lane instanceof Map)) return
    const selected = policy.select(change)
    if (selected.kind === 'invalidate-all') {
      this.lane = policy.invalidationArgs[0]
      return
    }
    if (this.lane.size >= policy.maxKeys && !this.lane.has(selected.key)) {
      this.lane = policy.invalidationArgs[0]
      return
    }
    this.lane.set(selected.key, change)
  }

  snapshot(): WorkflowRemoteEvent[] {
    if (this.lane instanceof Map) return [...this.lane.values()]
    return [this.lane]
  }
}

describe('bounded invalidation-only workflow events (RC8)', () => {
  it('registers keyed-latest workflows/run-change with invalidate-all overflow args', () => {
    const registry = new FakeKeyedLatest()
    const dispose = registerWorkflowRemoteEvents({ apiRemoteEvents: registry })
    expect(registry.name).toBe('workflows/run-change')
    expect(registry.policy).toMatchObject({
      kind: 'keyed-latest',
      maxKeys: 256,
      invalidationArgs: [{ kind: 'invalidate-all' }],
    })
    expect(applyRemoteEvents).toBe(registerWorkflowRemoteEvents)
    dispose()
    expect(registry.disposed).toBe(true)
  })

  it('projects only invalidate payloads and keeps the latest revision per Session', () => {
    const registry = new FakeKeyedLatest()
    registerWorkflowRemoteEvents({ apiRemoteEvents: registry })
    const first: WorkflowRemoteEvent = { kind: 'invalidate', sessionId: 'sess-a', revision: 1 }
    const later: WorkflowRemoteEvent = { kind: 'invalidate', sessionId: 'sess-a', revision: 4 }
    const other: WorkflowRemoteEvent = { kind: 'invalidate', sessionId: 'sess-b', revision: 2 }
    registry.push(first)
    registry.push(later)
    registry.push(other)
    expect(registry.snapshot()).toEqual([later, other])
    expect(JSON.stringify(later)).toBe('{"kind":"invalidate","sessionId":"sess-a","revision":4}')
    expect(later).not.toHaveProperty('epoch')
    expect(later).not.toHaveProperty('head')
    expect(later).not.toHaveProperty('displayName')
  })

  it('collapses the 257th Session key to sticky invalidate-all and ignores later addressed hints', () => {
    const registry = new FakeKeyedLatest()
    registerWorkflowRemoteEvents({ apiRemoteEvents: registry, remoteQueueMaxSessions: 256 })
    for (let index = 0; index < 256; index += 1) {
      registry.push({ kind: 'invalidate', sessionId: `sess-${index}`, revision: index + 1 })
    }
    expect(registry.snapshot()).toHaveLength(256)
    registry.push({ kind: 'invalidate', sessionId: 'sess-overflow', revision: 1 })
    expect(registry.snapshot()).toEqual([{ kind: 'invalidate-all' }])
    registry.push({ kind: 'invalidate', sessionId: 'sess-0', revision: 99 })
    expect(registry.snapshot()).toEqual([{ kind: 'invalidate-all' }])
    registry.push({ kind: 'invalidate-all' })
    expect(registry.snapshot()).toEqual([{ kind: 'invalidate-all' }])
  })

  it('honors an explicit invalidate-all and fails closed on a missing or invalid registry', () => {
    const registry = new FakeKeyedLatest()
    const dispose = registerWorkflowRemoteEvents({ apiRemoteEvents: registry, remoteQueueMaxSessions: 2 })
    registry.push({ kind: 'invalidate', sessionId: 'a', revision: 1 })
    registry.push({ kind: 'invalidate-all' })
    expect(registry.snapshot()).toEqual([{ kind: 'invalidate-all' }])
    dispose()
    expect(() => registerWorkflowRemoteEvents({})).toThrow(/workflow Remote event registry is unavailable/u)
    expect(() => registerWorkflowRemoteEvents({ apiRemoteEvents: {} })).toThrow(/workflow Remote event registry is unavailable/u)
    expect(() => registerWorkflowRemoteEvents({ apiRemoteEvents: registry }, { remoteQueueMaxSessions: 0 })).toThrow(RangeError)
    expect(() => registerWorkflowRemoteEvents({ apiRemoteEvents: registry }, { remoteQueueMaxSessions: 257 })).toThrow(RangeError)
    expect(() => registerWorkflowRemoteEvents({ apiRemoteEvents: registry }, { remoteQueueMaxSessions: 1.5 })).toThrow(RangeError)
  })

  it('accepts dispose() objects and no-op disposers from the Host registry', () => {
    const closed: string[] = []
    const withDispose = {
      register() { return { dispose() { closed.push('dispose') } } },
    }
    const noop = { register() { return undefined } }
    registerWorkflowRemoteEvents({ apiRemoteEvents: withDispose })()
    registerWorkflowRemoteEvents({ apiRemoteEvents: noop })()
    expect(closed).toEqual(['dispose'])
  })
})
