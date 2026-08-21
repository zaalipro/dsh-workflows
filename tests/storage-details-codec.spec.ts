import { describe, expect, it } from 'vitest'

import {
  compactWorkflowRunDetails,
  decodeWorkflowRunDetails,
  encodeWorkflowRunDetails,
  type WorkflowRunDetailLimits,
} from '../src/supervisor/storage/details-codec.js'
import { BoundedFileError } from '../src/supervisor/storage/bounded-file.js'
import type {
  WorkflowRunDetailPayloadV2,
  WorkflowRunDetailSnapshotV2,
} from '../src/supervisor/storage/manifest-types.js'

const hex32 = (digit: string) => digit.repeat(32)

const limits: WorkflowRunDetailLimits = {
  memberOutcomeMaxBytes: 1_024,
  maxTerminalResultBytes: 1_024,
  maxLogLineBytes: 1_024,
  maxRunDetailsBytes: 16_384,
}

function snapshot(
  payload: WorkflowRunDetailPayloadV2 = {},
  overrides: Partial<WorkflowRunDetailSnapshotV2> = {},
): WorkflowRunDetailSnapshotV2 {
  return {
    version: 2,
    sessionId: 'session-1',
    runId: hex32('1'),
    runDirectory: hex32('a'),
    detailId: hex32('b'),
    snapshotRevision: 2,
    payload,
    ...overrides,
  }
}

function decodeObject(value: unknown, customLimits = limits) {
  return decodeWorkflowRunDetails(`${JSON.stringify(value)}\n`, 'detail.json', customLimits)
}

function expectStorageError(operation: () => unknown, code = 'WORKFLOW_STORAGE_CORRUPT') {
  try {
    operation()
    throw new Error('operation unexpectedly succeeded')
  } catch (error) {
    expect(error).toBeInstanceOf(BoundedFileError)
    expect((error as BoundedFileError).code).toBe(code)
  }
}

describe('workflow run detail codec', () => {
  it('round-trips one canonical pretty immutable snapshot', () => {
    const value = snapshot({
      members: [
        { memberId: 'member-1', seq: 1, label: 'review', status: 'completed', outcome: 'available', value: null, startedAt: 10, settledAt: 20 },
      ],
      logs: [{ index: 0, text: 'started' }, { index: 1, text: 'done' }],
      result: { state: 'available', value: { answer: 42 } },
      phases: [{ title: 'Review', startedAt: 10, endedAt: 20 }],
      artifacts: [{ name: 'report.md', bytes: 42 }],
    })
    const bytes = encodeWorkflowRunDetails(value, limits)
    const text = new TextDecoder().decode(bytes)
    expect(text).toMatch(/^\{\n  /u)
    expect(text.endsWith('\n')).toBe(true)
    const decoded = decodeWorkflowRunDetails(bytes, 'detail.json', limits)
    expect(decoded).toEqual(JSON.parse(text))
    expect(encodeWorkflowRunDetails(decoded, limits)).toEqual(bytes)
  })

  it('preserves JSON null distinctly from absent outcomes', () => {
    const compact = compactWorkflowRunDetails({
      members: [
        { memberId: 'one', seq: 1, label: 'one', status: 'completed', outcome: 'available', value: null },
        { memberId: 'two', seq: 2, label: 'two', status: 'completed', outcome: 'not-produced' },
      ],
      result: { state: 'available', value: null },
    }, limits)
    expect(compact.members?.[0]).toMatchObject({ outcome: 'available', value: null })
    expect(compact.members?.[1]).toEqual(expect.objectContaining({ outcome: 'not-produced' }))
    expect(compact.members?.[1]).not.toHaveProperty('value')
    expect(compact.result).toMatchObject({ state: 'available', value: null, truncated: false })
  })

  it('truncates result and log text only at UTF-8 code-point boundaries', () => {
    const custom = { ...limits, maxTerminalResultBytes: 18, maxLogLineBytes: 7 }
    const value = compactWorkflowRunDetails({
      logs: [{ index: 0, text: 'abc😀xyz' }],
      result: { state: 'available', value: { report: '😀😀😀' } },
    }, custom)
    expect(value.logs).toEqual([{ index: 0, text: 'abc😀' }])
    expect(value.result).toEqual({
      state: 'available',
      preview: '{\n  "report": "',
      totalBytes: new TextEncoder().encode(JSON.stringify({ report: '😀😀😀' }, null, 2)).byteLength,
      truncated: true,
    })
    expect(value.result?.preview).not.toContain('\ufffd')
  })

  it('evicts over-quota member bodies and does not mutate caller data', () => {
    const payload: WorkflowRunDetailPayloadV2 = {
      members: [
        { memberId: 'two', seq: 2, label: 'two', status: 'completed', outcome: 'available', value: 'x'.repeat(200) },
        { memberId: 'one', seq: 1, label: 'one', status: 'completed', outcome: 'available', value: { ok: true } },
      ],
    }
    const compact = compactWorkflowRunDetails(payload, { ...limits, memberOutcomeMaxBytes: 32 })
    expect(compact.members?.map(member => [member.seq, member.outcome])).toEqual([
      [1, 'available'], [2, 'evicted'],
    ])
    expect(compact.members?.[1]).not.toHaveProperty('value')
    expect(payload.members?.[0]).toHaveProperty('value')
    expect(compactWorkflowRunDetails(compact, { ...limits, memberOutcomeMaxBytes: 32 })).toEqual(compact)
  })

  it('deterministically drops oldest logs and then oldest member bodies to fit', () => {
    const payload: WorkflowRunDetailPayloadV2 = {
      logs: Array.from({ length: 6 }, (_, index) => ({ index, text: `${index}:${'x'.repeat(80)}` })),
      members: Array.from({ length: 3 }, (_, index) => ({
        memberId: `member-${index}`,
        seq: index,
        label: `member ${index}`,
        status: 'completed' as const,
        outcome: 'available' as const,
        value: { text: 'y'.repeat(80) },
      })),
      result: { state: 'available', value: 'terminal' },
    }
    const compactLimits = {
      ...limits,
      memberOutcomeMaxBytes: 200,
      maxTerminalResultBytes: 200,
      maxLogLineBytes: 100,
      maxRunDetailsBytes: 640,
    }
    const compact = compactWorkflowRunDetails(payload, compactLimits)
    expect(compact.logs!.length).toBeLessThan(payload.logs!.length)
    expect(compact.logs?.[0]!.index).toBeGreaterThan(0)
    expect(new TextEncoder().encode(JSON.stringify(compact)).byteLength).toBeLessThanOrEqual(640)
    expect(compactWorkflowRunDetails(payload, compactLimits)).toEqual(compact)
  })

  it('enforces byte limits and malformed UTF-8', () => {
    const bytes = encodeWorkflowRunDetails(snapshot(), limits)
    expectStorageError(
      () => decodeWorkflowRunDetails(bytes, 'detail.json', { ...limits, maxRunDetailsBytes: bytes.byteLength - 1 }),
      'WORKFLOW_STORAGE_LIMIT',
    )
    expectStorageError(
      () => decodeWorkflowRunDetails(new Uint8Array([0xff]), 'detail.json', limits),
      'WORKFLOW_STORAGE_CORRUPT',
    )
  })

  it.each([
    ['wrong version', { ...snapshot(), version: 3 }],
    ['unknown root field', { ...snapshot(), index: [] }],
    ['unknown payload field', snapshot({ script: 'secret' } as never)],
    ['unsafe run directory', snapshot({}, { runDirectory: '../escape' })],
    ['unsafe detail id', snapshot({}, { detailId: 'ABC' })],
    ['negative revision', snapshot({}, { snapshotRevision: -1 })],
    ['unknown member field', snapshot({ members: [{ memberId: 'one', seq: 1, label: 'one', status: 'completed', outcome: 'available', value: null, journal: [] } as never] })],
    ['unknown log field', snapshot({ logs: [{ index: 0, text: 'one', offset: 0 } as never] })],
    ['unknown result field', snapshot({ result: { state: 'available', value: null, cut: 0 } as never })],
    ['unsafe artifact name', snapshot({ artifacts: [{ name: '../secret', bytes: 2 }] })],
  ])('rejects %s', (_label, value) => {
    expectStorageError(() => decodeObject(value))
  })

  it('rejects duplicate members, malformed log indexes, and outcome contradictions', () => {
    const member = { memberId: 'one', seq: 1, label: 'one', status: 'completed' as const, outcome: 'available' as const, value: null }
    expectStorageError(() => decodeObject(snapshot({ members: [member, { ...member, seq: 2 }] })))
    expectStorageError(() => decodeObject(snapshot({ members: [member, { ...member, memberId: 'two' }] })))
    expectStorageError(() => decodeObject(snapshot({ logs: [{ index: 0, text: 'a' }, { index: 2, text: 'b' }] })))
    expectStorageError(() => decodeObject(snapshot({ members: [{ ...member, outcome: 'evicted', value: null }] })))
    expectStorageError(() => decodeObject(snapshot({ result: { state: 'available' } })))
    expectStorageError(() => decodeObject(snapshot({ result: { state: 'evicted', value: null } })))
  })

  it('rejects fixed metadata that cannot fit and validates before encoding', () => {
    expectStorageError(
      () => encodeWorkflowRunDetails(snapshot({ phases: [{ title: 'x'.repeat(1_000) }] }), {
        memberOutcomeMaxBytes: 50,
        maxTerminalResultBytes: 50,
        maxLogLineBytes: 50,
        maxRunDetailsBytes: 100,
      }),
      'WORKFLOW_STORAGE_LIMIT',
    )
    expectStorageError(() => encodeWorkflowRunDetails(
      snapshot({ logs: [{ index: -1, text: 'bad' }] }),
      limits,
    ))
  })
})
