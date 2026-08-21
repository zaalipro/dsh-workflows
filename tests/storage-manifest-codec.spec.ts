import { describe, expect, it } from 'vitest'

import {
  decodeWorkflowSessionManifest,
  encodeWorkflowSessionManifest,
} from '../src/supervisor/storage/manifest-codec.js'
import { BoundedFileError } from '../src/supervisor/storage/bounded-file.js'
import type {
  WorkflowCompletionNoticeState,
  WorkflowRunHeadRecord,
  WorkflowRunStatus,
  WorkflowSessionManifest,
} from '../src/supervisor/storage/manifest-types.js'

const hex32 = (digit: string) => digit.repeat(32)
const hex64 = (digit: string) => digit.repeat(64)

function head(overrides: Partial<WorkflowRunHeadRecord> = {}): WorkflowRunHeadRecord {
  return {
    runId: 'run-1',
    name: 'audit',
    displayName: 'audit',
    numberedHandle: false,
    description: 'Audit the project',
    status: 'running',
    budget: { total: 128, spent: 2, remaining: 126 },
    memberCounts: { total: 2, running: 1, completed: 1, failed: 0, cancelled: 0 },
    startedAt: 1_000,
    runDirectory: hex32('a'),
    revision: 3,
    detail: { id: hex32('b'), bytes: 256, sha256: hex64('c'), snapshotRevision: 2 },
    detailRevision: 2,
    membersRevision: 2,
    logsRevision: 1,
    resultRevision: 0,
    artifactsRevision: 0,
    completionNotice: { state: 'none' },
    executionAvailable: true,
    saveAvailable: true,
    allowedActions: ['pause', 'stop', 'save'],
    ...overrides,
  }
}

function manifest(overrides: Partial<WorkflowSessionManifest> = {}): WorkflowSessionManifest {
  return {
    version: 2,
    sessionId: 'session-1',
    revision: 3,
    nextOrdinal: 2,
    ordinals: [{ name: 'audit', next: 2 }],
    heads: [head()],
    ...overrides,
  }
}

function terminal(
  status: Extract<WorkflowRunStatus, 'completed' | 'failed' | 'cancelled' | 'interrupted'>,
  completionNotice: WorkflowCompletionNoticeState = {
    state: 'claimed', claimId: hex32('d'), processEpoch: hex32('e'), claimedAt: 2_000,
  },
): WorkflowRunHeadRecord {
  const reasons = {
    completed: 'completed', failed: 'error', cancelled: 'cancelled', interrupted: 'interrupted',
  } as const
  return head({
    status,
    stopReason: reasons[status],
    settledAt: 2_000,
    memberCounts: { total: 2, running: 0, completed: status === 'completed' ? 2 : 1, failed: status === 'failed' ? 1 : 0, cancelled: status === 'cancelled' || status === 'interrupted' ? 1 : 0 },
    completionNotice,
    allowedActions: [],
    saveAvailable: false,
  })
}

function decodeObject(value: unknown) {
  return decodeWorkflowSessionManifest(`${JSON.stringify(value)}\n`, 'manifest.json', 1_000_000)
}

describe('workflow Session manifest codec', () => {
  it('round-trips canonical pretty JSON with one final LF', () => {
    const bytes = encodeWorkflowSessionManifest(manifest(), 1_000_000)
    const text = new TextDecoder().decode(bytes)
    expect(text).toMatch(/^\{\n  "heads":/u)
    expect(text.endsWith('\n')).toBe(true)
    expect(text.endsWith('\n\n')).toBe(false)
    const decoded = decodeWorkflowSessionManifest(bytes, 'manifest.json', 1_000_000)
    expect(decoded).toEqual(manifest())
    expect(encodeWorkflowSessionManifest(decoded, 1_000_000)).toEqual(bytes)
  })

  it.each(['completed', 'failed', 'cancelled', 'interrupted'] as const)(
    'round-trips a legal %s row and completion notice variants',
    (status) => {
      const notices: WorkflowCompletionNoticeState[] = [
        { state: 'claimed', claimId: hex32('d'), processEpoch: hex32('e'), claimedAt: 2_000 },
        { state: 'delivered', claimId: hex32('d'), processEpoch: hex32('e'), claimedAt: 2_000, finalizedAt: 2_001, lane: 'followup' },
        { state: 'abandoned', claimId: hex32('d'), processEpoch: hex32('e'), claimedAt: 2_000, finalizedAt: 2_001, reason: 'process-lost', error: 'owner exited' },
        { state: 'abandoned', finalizedAt: 2_001, reason: 'process-lost' },
      ]
      for (const notice of notices) {
        const value = manifest({ heads: [terminal(status, notice)] })
        expect(decodeWorkflowSessionManifest(
          encodeWorkflowSessionManifest(value, 1_000_000),
          'manifest.json',
          1_000_000,
        )).toEqual(value)
      }
    },
  )

  it('enforces the file byte limit and fatal UTF-8 decoding', () => {
    const bytes = encodeWorkflowSessionManifest(manifest(), 1_000_000)
    expect(() => decodeWorkflowSessionManifest(bytes, 'manifest.json', bytes.byteLength - 1))
      .toMatchObjectError('WORKFLOW_STORAGE_LIMIT')
    expect(() => decodeWorkflowSessionManifest(new Uint8Array([0xff]), 'manifest.json', 10))
      .toMatchObjectError('WORKFLOW_STORAGE_CORRUPT')
    expect(() => encodeWorkflowSessionManifest(manifest(), 8))
      .toMatchObjectError('WORKFLOW_STORAGE_LIMIT')
  })

  it.each([
    ['wrong version', { ...manifest(), version: 3 }],
    ['unknown root field', { ...manifest(), index: [] }],
    ['unknown ordinal field', { ...manifest(), ordinals: [{ name: 'audit', next: 2, offset: 0 }] }],
    ['unknown head field', { ...manifest(), heads: [{ ...head(), script: 'secret' }] }],
    ['unknown budget field', { ...manifest(), heads: [{ ...head(), budget: { ...head().budget, reserved: 0 } }] }],
    ['unknown detail field', { ...manifest(), heads: [{ ...head(), detail: { ...head().detail, filename: 'mutable.json' } }] }],
    ['unknown notice field', { ...manifest(), heads: [{ ...terminal('completed'), completionNotice: { state: 'claimed', claimId: hex32('d'), processEpoch: hex32('e'), claimedAt: 2_000, retry: true } }] }],
  ])('rejects %s', (_label, value) => {
    expect(() => decodeObject(value)).toMatchObjectError('WORKFLOW_STORAGE_CORRUPT')
  })

  it.each([
    ['unsafe run directory', { ...head(), runDirectory: '../escape' }],
    ['unsafe detail id', { ...head(), detail: { ...head().detail, id: 'ABC' } }],
    ['invalid digest', { ...head(), detail: { ...head().detail, sha256: 'x'.repeat(64) } }],
    ['detail revision mismatch', { ...head(), detailRevision: 3 }],
    ['budget overspend', { ...head(), budget: { total: 2, spent: 3, remaining: 0 } }],
    ['budget remaining mismatch', { ...head(), budget: { total: 3, spent: 1, remaining: 1 } }],
    ['member count mismatch', { ...head(), memberCounts: { total: 3, running: 1, completed: 1, failed: 0, cancelled: 0 } }],
    ['terminal none notice', { ...terminal('completed'), completionNotice: { state: 'none' } }],
    ['active terminal reason', { ...head(), stopReason: 'cancelled' }],
    ['terminal missing settlement', { ...terminal('failed'), settledAt: undefined }],
    ['wrong stop reason', { ...terminal('failed'), stopReason: 'completed' }],
    ['incomplete abandoned tuple', { ...terminal('failed'), completionNotice: { state: 'abandoned', finalizedAt: 3_000, reason: 'process-lost', claimId: hex32('d') } }],
  ])('rejects impossible head: %s', (_label, badHead) => {
    expect(() => decodeObject(manifest({ heads: [badHead as WorkflowRunHeadRecord] })))
      .toMatchObjectError('WORKFLOW_STORAGE_CORRUPT')
  })

  it('rejects duplicate identities, ordinals, and display handles', () => {
    const second = head({ runId: 'run-2', runDirectory: hex32('d'), detail: { ...head().detail, id: hex32('e') } })
    for (const heads of [
      [head(), { ...second, runId: 'run-1' }],
      [head(), { ...second, displayName: 'audit' }],
      [head(), { ...second, runDirectory: hex32('a') }],
      [head(), { ...second, detail: { ...second.detail, id: hex32('b') } }],
    ]) {
      expect(() => decodeObject(manifest({ heads }))).toMatchObjectError('WORKFLOW_STORAGE_CORRUPT')
    }
    expect(() => decodeObject(manifest({ ordinals: [{ name: 'audit', next: 2 }, { name: 'audit', next: 3 }] })))
      .toMatchObjectError('WORKFLOW_STORAGE_CORRUPT')
  })

  it('validates runtime values before encoding', () => {
    const value = { ...manifest(), heads: [{ ...head(), status: 'mystery' }] } as unknown as WorkflowSessionManifest
    expect(() => encodeWorkflowSessionManifest(value, 1_000_000))
      .toMatchObjectError('WORKFLOW_STORAGE_CORRUPT')
  })

  it('round-trips kebab names that already end in digits as unnumbered first handles', () => {
    for (const name of ['gpt-4', 'review-2']) {
      const value = manifest({
        nextOrdinal: 2,
        ordinals: [{ name, next: 2 }],
        heads: [head({ name, displayName: name, numberedHandle: false })],
      })
      expect(decodeWorkflowSessionManifest(
        encodeWorkflowSessionManifest(value, 1_000_000),
        'manifest.json',
        1_000_000,
      )).toEqual(value)
    }
  })

  it('round-trips the numbered second handle of a digit-suffixed name', () => {
    const value = manifest({
      nextOrdinal: 3,
      ordinals: [{ name: 'gpt-4', next: 3 }],
      heads: [head({
        name: 'gpt-4',
        displayName: 'gpt-4-2',
        numberedHandle: true,
      })],
    })
    expect(decodeWorkflowSessionManifest(
      encodeWorkflowSessionManifest(value, 1_000_000),
      'manifest.json',
      1_000_000,
    )).toEqual(value)
  })
})

expect.extend({
  toMatchObjectError(received: () => unknown, code: string) {
    try {
      received()
      return { pass: false, message: () => `expected function to throw ${code}` }
    } catch (error) {
      const pass = error instanceof BoundedFileError && error.code === code
      return {
        pass,
        message: () => `expected ${String(error)} to be BoundedFileError(${code})`,
      }
    }
  },
})

declare module 'vitest' {
  interface Assertion<T = any> {
    toMatchObjectError(code: string): T
  }
}
