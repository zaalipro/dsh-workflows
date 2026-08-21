import { describe, expect, it } from 'vitest'

import { WorkflowRunsController } from '../src/client/controller.js'
import {
  WorkflowRunsRemoteError,
  type WorkflowRunHead,
  type WorkflowRunsSourceSnapshot,
} from '../src/client/contract.js'

interface Deferred<T> {
  readonly promise: Promise<T>
  readonly resolve: (value: T) => void
  readonly reject: (error: unknown) => void
  readonly settled: () => boolean
}

function deferred<T>(): Deferred<T> {
  let done = false
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((fulfil, fail) => {
    resolve = value => { done = true; fulfil(value) }
    reject = error => { done = true; fail(error) }
  })
  return { promise, resolve, reject, settled: () => done }
}

function abortError(message = 'workflow request aborted'): Error {
  const error = new Error(message)
  error.name = 'AbortError'
  return error
}

interface RemoteCall {
  readonly method: string
  readonly sessionId: string
  readonly request: any
  readonly signal: AbortSignal
  readonly deferred: Deferred<any>
  aborted: boolean
}

/** A tiny controllable Remote. It rejects on abort by default, but can leave
 * an old response pending to prove the controller's generation fence rather
 * than relying on cooperative transport cancellation. */
class DeferredRemote {
  readonly calls: RemoteCall[] = []
  abortTransport = true

  readonly face = {
    list: (sessionId: string, request: unknown, signal: AbortSignal) => this.call('list', sessionId, request, signal),
    detail: (sessionId: string, request: unknown, signal: AbortSignal) => this.call('detail', sessionId, request, signal),
    members: (sessionId: string, request: unknown, signal: AbortSignal) => this.call('members', sessionId, request, signal),
    logs: (sessionId: string, request: unknown, signal: AbortSignal) => this.call('logs', sessionId, request, signal),
    artifacts: (sessionId: string, request: unknown, signal: AbortSignal) => this.call('artifacts', sessionId, request, signal),
    artifact: (sessionId: string, request: unknown, signal: AbortSignal) => this.call('artifact', sessionId, request, signal),
    control: (sessionId: string, request: unknown, signal: AbortSignal) => this.call('control', sessionId, request, signal),
  }

  call(method: string, sessionId: string, request: unknown, signal: AbortSignal): Promise<any> {
    const item: RemoteCall = {
      method,
      sessionId,
      request,
      signal,
      deferred: deferred<any>(),
      aborted: false,
    }
    this.calls.push(item)
    const onAbort = (): void => {
      item.aborted = true
      if (this.abortTransport) item.deferred.reject(abortError())
    }
    if (signal.aborted) onAbort()
    else signal.addEventListener('abort', onAbort, { once: true })
    return item.deferred.promise
  }

  pending(method: string, occurrence = 0): RemoteCall {
    const matches = this.calls.filter(call => call.method === method)
    const call = matches[occurrence]
    if (call === undefined) throw new Error(`missing ${method} call ${occurrence}`)
    return call
  }

  settleAll(): void {
    for (const call of this.calls) if (!call.deferred.settled()) call.deferred.reject(abortError('test teardown'))
  }
}

const SESSION = 'client-race-session'
const EPOCH = 'epoch-client-race'

function row(
  runId: string,
  revision: number,
  status: WorkflowRunHead['status'] = 'running',
): WorkflowRunHead {
  const terminal = status === 'completed' || status === 'failed' || status === 'cancelled' || status === 'interrupted'
  return {
    runId,
    displayName: `review-${runId}`,
    name: 'review',
    description: 'deterministic race fixture',
    status,
    budget: { total: 8, spent: terminal ? 2 : 1, remaining: terminal ? 6 : 7 },
    memberCounts: terminal
      ? { total: 1, running: 0, completed: status === 'completed' ? 1 : 0, failed: status === 'failed' ? 1 : 0, cancelled: status === 'completed' || status === 'failed' ? 0 : 1 }
      : { total: 1, running: 1, completed: 0, failed: 0, cancelled: 0 },
    startedAt: 1,
    ...(terminal ? {
      settledAt: 2,
      terminal: {
        stopReason: status === 'failed' ? 'error' : status,
        resultState: status === 'completed' ? 'available' : 'not-produced',
      },
    } : {}),
    allowedActions: terminal ? [] : ['pause', 'stop', 'save'],
    revision,
    detailRevision: revision,
    membersRevision: revision,
    logsRevision: revision,
    resultRevision: revision,
    artifactsRevision: revision,
  }
}

function page(items: readonly WorkflowRunHead[], sessionRevision: number, nextCursor?: string): any {
  return {
    items,
    total: items.length,
    sessionRevision,
    epoch: EPOCH,
    ...(nextCursor === undefined ? {} : { nextCursor }),
  }
}

async function flush(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

describe('browser workflow Remote generation and disposal races', () => {
  it('fences a late pre-reset list response behind the newer epoch baseline', async () => {
    const probe = new DeferredRemote()
    probe.abortTransport = false
    const controller = new WorkflowRunsController(probe.face)
    try {
      controller.observe(SESSION)
      const stale = probe.pending('list')
      controller.handleReset()
      const current = probe.pending('list', 1)
      expect(stale.aborted).toBe(true)

      current.deferred.resolve(page([row('new', 4)], 4))
      await current.deferred.promise
      await flush()
      stale.deferred.resolve(page([row('old', 1)], 1))
      await stale.deferred.promise
      await flush()

      expect(controller.get(SESSION)).toMatchObject({
        phase: 'ready',
        sessionRevision: 4,
        runs: [expect.objectContaining({ runId: 'new', revision: 4 })],
      })
    } finally {
      controller.dispose()
      probe.settleAll()
    }
  })

  it('transitions through reconnecting and refreshes only after connection recovery', async () => {
    const probe = new DeferredRemote()
    const controller = new WorkflowRunsController(probe.face)
    try {
      controller.observe(SESSION)
      const first = probe.pending('list')
      controller.handleDisconnected()
      expect(controller.get(SESSION).phase).toBe('reconnecting')
      expect(first.aborted).toBe(true)

      controller.handleConnected()
      const recovered = probe.pending('list', 1)
      recovered.deferred.resolve(page([row('recovered', 2)], 2))
      await recovered.deferred.promise
      await flush()
      await first.deferred.promise.catch(() => undefined)
      expect(controller.get(SESSION)).toMatchObject({ phase: 'ready', runs: [expect.objectContaining({ runId: 'recovered' })] })
    } finally {
      controller.dispose()
      probe.settleAll()
    }
  })

  it('aborts detail/control work when a Session is removed and does not resurrect it', async () => {
    const probe = new DeferredRemote()
    const controller = new WorkflowRunsController(probe.face)
    try {
      const request = controller.detail(SESSION, 'protected-run')
      const detail = probe.pending('detail')
      controller.removeSession(SESSION)
      expect(detail.aborted).toBe(true)
      await expect(request).rejects.toMatchObject({ name: 'AbortError' })

      // A late transport settlement is harmless, and get() creates only a
      // fresh idle state rather than reviving the removed source.
      detail.deferred.resolve({ run: row('protected-run', 99) })
      await flush()
      expect(controller.get(SESSION)).toMatchObject({ phase: 'idle', runs: [] })
      expect(probe.calls.filter(call => call.method === 'detail')).toHaveLength(1)
    } finally {
      controller.dispose()
      probe.settleAll()
    }
  })

  it('merges the authoritative revision-conflict row before refreshing the list', async () => {
    const probe = new DeferredRemote()
    const controller = new WorkflowRunsController(probe.face)
    try {
      controller.observe(SESSION)
      const initial = probe.pending('list')
      initial.deferred.resolve(page([row('run-1', 1)], 1, 'cursor-1'))
      await initial.deferred.promise
      await flush()

      const authoritative = row('run-1', 2, 'completed')
      const controlPromise = controller.control(SESSION, 'run-1', 'stop', 1)
      const control = probe.pending('control')
      expect(control.sessionId).toBe(SESSION)
      expect(control.request).toEqual({ runId: 'run-1', action: 'stop', expectedRevision: 1 })
      control.deferred.reject(new WorkflowRunsRemoteError(
        'revision-conflict',
        'workflow run changed; refresh it before applying a control',
        { run: authoritative },
      ))
      await expect(controlPromise).rejects.toMatchObject({ code: 'revision-conflict' })
      await flush()

      const refresh = probe.pending('list', 1)
      refresh.deferred.resolve(page([authoritative], 2, 'cursor-1'))
      await refresh.deferred.promise
      await flush()
      expect(controller.get(SESSION).runs).toEqual([authoritative])
    } finally {
      controller.dispose()
      probe.settleAll()
    }
  })

  it('does not let an aborted later page overwrite a fresh reset snapshot', async () => {
    const probe = new DeferredRemote()
    probe.abortTransport = false
    const controller = new WorkflowRunsController(probe.face)
    try {
      controller.observe(SESSION)
      const initial = probe.pending('list')
      initial.deferred.resolve(page([row('prefix', 1)], 1, 'next'))
      await initial.deferred.promise
      await flush()

      const laterPromise = controller.loadMore(SESSION)
      const later = probe.pending('list', 1)
      controller.handleReset()
      const fresh = probe.pending('list', 2)
      expect(later.aborted).toBe(true)
      fresh.deferred.resolve(page([row('fresh', 3)], 3))
      await fresh.deferred.promise
      await flush()
      later.deferred.resolve(page([row('stale-page', 2)], 2))
      await later.deferred.promise
      await flush()
      await expect(laterPromise).resolves.toMatchObject({ runs: [expect.objectContaining({ runId: 'fresh' })] })
      expect(controller.get(SESSION).runs.map(item => item.runId)).toEqual(['fresh'])
    } finally {
      controller.dispose()
      probe.settleAll()
    }
  })

  it('opens only a healthy direct one-shot child with the exact parent/session tuple', async () => {
    const opened: unknown[] = []
    const refreshed: string[] = []
    const parent = 'parent-session'
    const child = 'child-session'
    const agents = {
      sessions: {
        refreshSubagents: async (sessionId: string) => { refreshed.push(sessionId) },
        openSubagent: (address: unknown) => { opened.push(address) },
      },
      list: {
        getSnapshot: () => ({
          subagentsByParent: {
            [parent]: {
              state: 'ready',
              entries: [
                { kind: 'child', id: child, parentSessionId: 'other-parent', mode: 'one-shot' },
                { kind: 'child', id: child, parentSessionId: parent, mode: 'continuation' },
                { kind: 'child', id: child, parentSessionId: parent, mode: 'one-shot' },
              ],
            },
          },
        }),
      },
    }
    const controller = new WorkflowRunsController({}, agents)
    try {
      await expect(controller.resolveAndOpenChild(parent, child)).resolves.toBe(true)
      expect(refreshed).toEqual([parent])
      expect(opened).toEqual([{ parentSessionId: parent, childSessionId: child, mode: 'one-shot' }])

      const forged = new WorkflowRunsController({}, {
        sessions: { refreshSubagents: async () => undefined },
        list: { getSnapshot: () => ({ subagentsByParent: { [parent]: { state: 'ready', entries: [{ kind: 'child', id: child, parentSessionId: 'wrong', mode: 'one-shot' }] } } }) },
      })
      try {
        await expect(forged.resolveAndOpenChild(parent, child)).resolves.toBe(false)
      } finally {
        forged.dispose()
      }
    } finally {
      controller.dispose()
    }
  })

  it('repeats reset fencing deterministically without retaining old Session state', async () => {
    for (let iteration = 0; iteration < 100; iteration += 1) {
      const probe = new DeferredRemote()
      probe.abortTransport = false
      const controller = new WorkflowRunsController(probe.face)
      const session = `race-${iteration}`
      try {
        controller.observe(session)
        const oldCall = probe.pending('list')
        controller.handleReset()
        const newCall = probe.pending('list', 1)
        newCall.deferred.resolve(page([row(`new-${iteration}`, 2)], 2))
        await newCall.deferred.promise
        await flush()
        oldCall.deferred.resolve(page([row(`old-${iteration}`, 1)], 1))
        await oldCall.deferred.promise
        await flush()
        expect(controller.get(session).runs[0]?.runId).toBe(`new-${iteration}`)
        expect(probe.calls.filter(call => !call.deferred.settled())).toHaveLength(0)
      } catch (error) {
        const message = error instanceof Error ? error.stack ?? error.message : String(error)
        throw new Error(`RD13 iteration ${iteration}: ${message}`)
      } finally {
        controller.dispose()
        probe.settleAll()
      }
    }
  })

  it('aborts paged member/log/artifact reads on reset and never recreates a removed Session', async () => {
    const probe = new DeferredRemote()
    const controller = new WorkflowRunsController(probe.face)
    try {
      controller.observe(SESSION)
      probe.pending('list').deferred.resolve(page([row('run-1', 1)], 1, 'next'))
      await probe.pending('list').deferred.promise
      await flush()

      const members = controller.members(SESSION, 'run-1')
      const logs = controller.logs(SESSION, 'run-1')
      const artifacts = controller.artifacts(SESSION, 'run-1')
      controller.handleReset()
      await expect(members).rejects.toMatchObject({ name: 'AbortError' })
      await expect(logs).rejects.toMatchObject({ name: 'AbortError' })
      await expect(artifacts).rejects.toMatchObject({ name: 'AbortError' })
      expect(probe.pending('members').aborted).toBe(true)
      expect(probe.pending('logs').aborted).toBe(true)
      expect(probe.pending('artifacts').aborted).toBe(true)

      const baseline = probe.pending('list', 1)
      baseline.deferred.resolve(page([row('run-1', 2)], 2))
      await baseline.deferred.promise
      await flush()

      controller.removeSession(SESSION)
      expect(controller.get(SESSION)).toMatchObject({ phase: 'idle', runs: [] })
      expect(probe.calls.filter(call => call.method === 'members')).toHaveLength(1)
      expect(probe.calls.filter(call => call.method === 'logs')).toHaveLength(1)
      expect(probe.calls.filter(call => call.method === 'artifacts')).toHaveLength(1)
    } finally {
      controller.dispose()
      probe.settleAll()
      expect(probe.calls.filter(call => !call.deferred.settled())).toHaveLength(0)
    }
  })

  it('keeps a stale control off a foreign Session and tears requests down on dispose', async () => {
    const probe = new DeferredRemote()
    const other = 'other-session'
    const controller = new WorkflowRunsController(probe.face)
    try {
      controller.observe(SESSION)
      probe.pending('list').deferred.resolve(page([row('run-1', 1)], 1))
      await probe.pending('list').deferred.promise
      await flush()
      const stop = controller.source(other).subscribe(() => undefined)
      probe.pending('list', 1).deferred.resolve(page([row('foreign', 1)], 1))
      await probe.pending('list', 1).deferred.promise
      await flush()

      const controlPromise = controller.control(SESSION, 'run-1', 'stop', 1)
      const control = probe.pending('control')
      expect(control.sessionId).toBe(SESSION)
      control.deferred.reject(new WorkflowRunsRemoteError(
        'revision-conflict',
        'workflow run changed; refresh it before applying a control',
        { run: row('run-1', 2, 'cancelled') },
      ))
      await expect(controlPromise).rejects.toMatchObject({ code: 'revision-conflict' })
      await flush()
      expect(controller.get(SESSION).runs[0]).toMatchObject({ runId: 'run-1', revision: 2, status: 'cancelled' })
      expect(controller.get(other).runs[0]?.runId).toBe('foreign')
      stop()
    } finally {
      controller.dispose()
      expect(probe.calls.filter(call => call.method === 'control')).toHaveLength(1)
      probe.settleAll()
      expect(probe.calls.filter(call => !call.deferred.settled())).toHaveLength(0)
      expect(controller.get(SESSION).runs).toEqual([])
    }
  })

  it('fans invalidate-all across observed Sessions and refetches a fresh epoch after reset', async () => {
    const probe = new DeferredRemote()
    const controller = new WorkflowRunsController(probe.face)
    const sessions = Array.from({ length: 8 }, (_, index) => `flood-${index}`)
    const unsubs: Array<() => void> = []
    try {
      for (const sessionId of sessions) unsubs.push(controller.source(sessionId).subscribe(() => undefined))
      for (const sessionId of sessions) {
        const call = probe.calls.filter(item => item.method === 'list' && item.sessionId === sessionId)[0]
        expect(call).toBeDefined()
        call!.deferred.resolve(page([row(`${sessionId}-old`, 1)], 1, undefined))
      }
      await Promise.all(probe.calls.filter(call => call.method === 'list').map(call => call.deferred.promise))
      await flush()

      controller.handleChange({ kind: 'invalidate-all' })
      const liveCalls = sessions.map(sessionId => {
        const refresh = probe.calls.filter(item => item.method === 'list' && item.sessionId === sessionId)[1]
        expect(refresh).toBeDefined()
        refresh!.deferred.resolve(page([row(`${sessionId}-live`, 2)], 2, undefined))
        return refresh!.deferred.promise
      })
      await Promise.all(liveCalls)
      await flush()
      for (const sessionId of sessions) {
        expect(controller.get(sessionId).runs[0]?.runId).toBe(`${sessionId}-live`)
      }

      controller.handleReset()
      const resetCalls = sessions.map(sessionId => {
        const reset = probe.calls.filter(item => item.method === 'list' && item.sessionId === sessionId).at(-1)
        expect(reset).toBeDefined()
        reset!.deferred.resolve(page([row(`${sessionId}-fresh`, 3)], 3, undefined))
        return reset!.deferred.promise
      })
      await Promise.all(resetCalls)
      await flush()
      for (const sessionId of sessions) {
        expect(controller.get(sessionId)).toMatchObject({
          sessionRevision: 3,
          runs: [expect.objectContaining({ runId: `${sessionId}-fresh` })],
        })
      }
    } finally {
      for (const stop of unsubs) stop()
      controller.dispose()
      probe.settleAll()
      expect(probe.calls.filter(call => !call.deferred.settled())).toHaveLength(0)
    }
  })
})
