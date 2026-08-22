import { describe, expect, it } from 'vitest'

import {
  childTranscriptValue,
  lastAssistantText,
  memberOutcomeWithTranscript,
  snapshotWorkflowJsonValue,
  workflowRunValueView,
} from '../src/supervisor/value-view.js'

describe('workflowRunValueView', () => {
  it.each([
    null,
    true,
    42,
    'done',
    [1, 'two', null],
    { findings: [{ file: 'a.ts', real: true }] },
  ])('returns a detached complete JSON value for %j', (value) => {
    const view = workflowRunValueView(value, 1_024)
    const serialized = JSON.stringify(value, null, 2)
    expect(view).toEqual({
      state: 'available',
      content: { kind: 'value', value },
      totalBytes: new TextEncoder().encode(serialized).byteLength,
      truncated: false,
    })
    if (value !== null && typeof value === 'object' && view.content.kind === 'value') {
      expect(view.content.value).not.toBe(value)
    }
  })

  it('uses pretty JSON and keeps the exact byte boundary complete', () => {
    const value = { answer: 42 }
    const bytes = new TextEncoder().encode(JSON.stringify(value, null, 2)).byteLength
    expect(workflowRunValueView(value, bytes)).toMatchObject({
      content: { kind: 'value', value },
      totalBytes: bytes,
      truncated: false,
    })
    expect(workflowRunValueView(value, bytes - 1)).toMatchObject({
      content: { kind: 'preview' },
      totalBytes: bytes,
      truncated: true,
    })
  })

  it('returns a UTF-8-safe preview and complete formatted byte count', () => {
    const value = { report: '😀😀😀' }
    const serialized = JSON.stringify(value, null, 2)
    const view = workflowRunValueView(value, 18)
    expect(view).toEqual({
      state: 'available',
      content: { kind: 'preview', text: '{\n  "report": "' },
      totalBytes: new TextEncoder().encode(serialized).byteLength,
      truncated: true,
    })
    expect(view.content.kind === 'preview' && view.content.text).not.toContain('\ufffd')
    expect(view.content.kind === 'preview' && new TextEncoder().encode(view.content.text).byteLength)
      .toBeLessThanOrEqual(18)
  })

  it('keeps hostile keys as detached own data properties', () => {
    const value = JSON.parse('{"__proto__":{"polluted":true}}')
    const view = workflowRunValueView(value, 1_024)
    if (view.content.kind !== 'value') throw new Error('expected complete value')
    expect(Object.getOwnPropertyDescriptor(view.content.value as object, '__proto__')?.value)
      .toEqual({ polluted: true })
    expect(Object.prototype).not.toHaveProperty('polluted')
  })

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN])(
    'rejects invalid byte cap %s',
    (maxBytes) => {
      expect(() => workflowRunValueView(null, maxBytes)).toThrow(/positive safe integer/u)
    },
  )
})

describe('snapshotWorkflowJsonValue', () => {
  it('returns a deep detached lossless JSON snapshot', () => {
    const input = Object.assign(Object.create(null), {
      nested: [null, true, 1, 'text', { value: 2 }],
    })
    const snapshot = snapshotWorkflowJsonValue(input)
    expect(snapshot).toEqual(input)
    expect(snapshot).not.toBe(input)
    expect((snapshot as { nested: unknown }).nested).not.toBe(input.nested)
  })

  it.each([
    undefined,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    -0,
    1n,
    Symbol('x'),
    () => undefined,
    new Date(),
    { value: undefined },
  ])('rejects non-JSON value %s', (value) => {
    expect(() => snapshotWorkflowJsonValue(value)).toThrow(/lossless JSON/u)
  })

  it('rejects cycles, sparse arrays, and decorated arrays', () => {
    const cyclic: { self?: unknown } = {}
    cyclic.self = cyclic
    expect(() => snapshotWorkflowJsonValue(cyclic)).toThrow(/cyclic/u)
    expect(() => snapshotWorkflowJsonValue(new Array(1))).toThrow(/sparse or decorated/u)
    const decorated = [1] as number[] & { extra?: number }
    decorated.extra = 2
    expect(() => snapshotWorkflowJsonValue(decorated)).toThrow(/sparse or decorated/u)
  })
})

describe('lastAssistantText', () => {
  it('returns the last non-empty assistant/message text', () => {
    expect(lastAssistantText([
      { type: 'user/message', data: { content: [{ type: 'text', text: 'hi' }] } },
      { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: 'alpha' }] } } },
      { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: '' }] } } },
      { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: 'beta' }] } } },
    ])).toBe('beta')
  })

  it('reads string content and a top-level text field', () => {
    expect(lastAssistantText([
      { type: 'assistant/message', data: { message: { content: 'plain' } } },
    ])).toBe('plain')
    expect(lastAssistantText([
      { type: 'assistant/message', data: { message: { text: 'legacy' } } },
    ])).toBe('legacy')
    expect(lastAssistantText([
      { type: 'assistant/message', data: { content: [{ type: 'text', text: 'direct' }] } },
    ])).toBe('direct')
  })

  it('skips non-message events and unusable content blocks', () => {
    expect(lastAssistantText(undefined)).toBeUndefined()
    expect(lastAssistantText([
      null,
      'nope',
      { type: 'user/message', data: { content: [{ type: 'text', text: 'hi' }] } },
      { type: 'assistant/message', data: { message: { content: [null, { type: 'image' }, { type: 'text', text: 1 }, { type: 'text', text: '  ' }, { type: 'text', text: 'kept' }] } } },
    ])).toBe('kept')
    expect(lastAssistantText([
      { type: 'assistant/message', data: { message: { content: 1 } } },
    ])).toBeUndefined()
  })
})

describe('childTranscriptValue', () => {
  it('snapshots the child session assistant text through ctx.agents.get', () => {
    const ctx = {
      agents: {
        get(id: string) {
          if (id !== 'child-1') return undefined
          return {
            session: {
              events: [
                { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: 'alpha' }] } } },
              ],
            },
          }
        },
      },
    }
    expect(childTranscriptValue(ctx, 'child-1')).toBe('alpha')
    expect(childTranscriptValue(ctx, 'missing')).toBeUndefined()
    expect(childTranscriptValue({}, 'child-1')).toBeUndefined()
    expect(childTranscriptValue(ctx, '')).toBeUndefined()
  })

  it('falls back to ctx.sessions.get after the child agent has left memory', () => {
    const ctx = {
      sessions: {
        get(id: string) {
          if (id !== 'child-2') return undefined
          return {
            events: [
              { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: 'persisted' }] } } },
            ],
          }
        },
      },
    }
    expect(childTranscriptValue(ctx, 'child-2')).toBe('persisted')
    expect(childTranscriptValue(ctx, 'missing')).toBeUndefined()
  })

  it('resolves agents and sessions through ctx.get', () => {
    const sessionsCtx = {
      get(name: string) {
        if (name === 'sessions') {
          return {
            get(id: string) {
              if (id !== 'via-get') return undefined
              return { events: [{ type: 'assistant/message', data: { message: { text: 'from-get' } } }] }
            },
          }
        }
        return undefined
      },
    }
    const agentsCtx = {
      agents: null,
      get(name: string) {
        if (name !== 'agents') return undefined
        return {
          get(id: string) {
            if (id !== 'via-agents') return undefined
            return {
              session: { events: [{ type: 'assistant/message', data: { message: { text: 'agent-get' } } }] },
            }
          },
        }
      },
    }
    expect(childTranscriptValue(sessionsCtx, 'via-get')).toBe('from-get')
    expect(childTranscriptValue(agentsCtx, 'via-agents')).toBe('agent-get')
    expect(childTranscriptValue({ get: 1 }, 'x')).toBeUndefined()
  })

  it('swallows lookup failures', () => {
    const ctx = {
      agents: {
        get() { throw new Error('gone') },
      },
    }
    expect(childTranscriptValue(ctx, 'child-1')).toBeUndefined()
  })
})

describe('memberOutcomeWithTranscript', () => {
  const sessionCtx = {
    sessions: {
      get(id: string) {
        if (id !== 'child-1') return undefined
        return { events: [{ type: 'assistant/message', data: { message: { text: 'ready' } } }] }
      },
    },
  }

  it('keeps available and evicted outcomes', () => {
    expect(memberOutcomeWithTranscript({}, { outcome: 'available', status: 'completed' })).toBe('available')
    expect(memberOutcomeWithTranscript(sessionCtx, { outcome: 'evicted', status: 'completed', childSessionId: 'child-1' })).toBe('evicted')
  })

  it('keeps a still-running pending member', () => {
    expect(memberOutcomeWithTranscript(sessionCtx, {
      outcome: 'pending', status: 'running', childSessionId: 'child-1',
    })).toBe('pending')
  })

  it('promotes not-produced and settled-pending members when a transcript exists', () => {
    expect(memberOutcomeWithTranscript(sessionCtx, {
      outcome: 'not-produced', status: 'completed', childSessionId: 'child-1',
    })).toBe('available')
    expect(memberOutcomeWithTranscript(sessionCtx, {
      outcome: 'pending', status: 'completed', childSessionId: 'child-1',
    })).toBe('available')
    expect(memberOutcomeWithTranscript({}, {
      outcome: 'not-produced', status: 'completed', childSessionId: 'child-1',
    })).toBe('not-produced')
  })
})
