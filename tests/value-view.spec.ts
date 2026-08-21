import { describe, expect, it } from 'vitest'

import {
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
