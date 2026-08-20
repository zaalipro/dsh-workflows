import type {
  WorkflowCompletionNoticeState,
  WorkflowRunHeadRecord,
  WorkflowSessionManifest,
} from './manifest-types.js'
import { BoundedFileError } from './bounded-file.js'

const COMPONENT = /^[a-f0-9]{32}$/u
const SHA256 = /^[a-f0-9]{64}$/u

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSafeNonNegative(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0
}

function assertComponent(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !COMPONENT.test(value)) {
    throw new BoundedFileError(`${label} is not a lowercase 32-hex component`, 'WORKFLOW_STORAGE_CORRUPT')
  }
}

function assertNotice(value: unknown, terminal: boolean): asserts value is WorkflowCompletionNoticeState {
  if (!isRecord(value) || typeof value.state !== 'string') {
    throw new BoundedFileError('invalid completion notice', 'WORKFLOW_STORAGE_CORRUPT')
  }
  if (terminal && value.state === 'none') {
    throw new BoundedFileError('terminal row has completionNotice state none', 'WORKFLOW_STORAGE_CORRUPT')
  }
  if (value.state === 'claimed' || value.state === 'delivered') {
    assertComponent(value.claimId, 'completion claimId')
    assertComponent(value.processEpoch, 'completion processEpoch')
    if (!isSafeNonNegative(value.claimedAt)) {
      throw new BoundedFileError('completion claimedAt is invalid', 'WORKFLOW_STORAGE_CORRUPT')
    }
  }
  if (value.state === 'abandoned') {
    const supplied = [value.claimId, value.processEpoch, value.claimedAt].filter(item => item !== undefined).length
    if (supplied !== 0 && supplied !== 3) {
      throw new BoundedFileError('abandoned completion claim tuple is incomplete', 'WORKFLOW_STORAGE_CORRUPT')
    }
    if (supplied === 3) {
      assertComponent(value.claimId, 'completion claimId')
      assertComponent(value.processEpoch, 'completion processEpoch')
      if (!isSafeNonNegative(value.claimedAt)) {
        throw new BoundedFileError('completion claimedAt is invalid', 'WORKFLOW_STORAGE_CORRUPT')
      }
    }
  }
}

function assertHead(value: unknown): asserts value is WorkflowRunHeadRecord {
  if (!isRecord(value)) throw new BoundedFileError('run head must be an object', 'WORKFLOW_STORAGE_CORRUPT')
  assertComponent(value.runId, 'runId')
  assertComponent(value.runDirectory, 'runDirectory')
  if (typeof value.name !== 'string' || typeof value.displayName !== 'string') {
    throw new BoundedFileError('run identity text is invalid', 'WORKFLOW_STORAGE_CORRUPT')
  }
  if (!isSafeNonNegative(value.revision) || !isSafeNonNegative(value.startedAt)) {
    throw new BoundedFileError('run revision or timestamp is invalid', 'WORKFLOW_STORAGE_CORRUPT')
  }
  if (!isRecord(value.detail)) throw new BoundedFileError('detail reference is invalid', 'WORKFLOW_STORAGE_CORRUPT')
  assertComponent(value.detail.id, 'detail id')
  if (!isSafeNonNegative(value.detail.bytes) || !isSafeNonNegative(value.detail.snapshotRevision)
      || typeof value.detail.sha256 !== 'string' || !SHA256.test(value.detail.sha256)) {
    throw new BoundedFileError('detail reference fields are invalid', 'WORKFLOW_STORAGE_CORRUPT')
  }
  const terminal = ['completed', 'failed', 'cancelled', 'interrupted'].includes(String(value.status))
  assertNotice(value.completionNotice, terminal)
}

/** Decode a bounded canonical version-2 Session manifest. */
export function decodeWorkflowSessionManifest(
  input: Uint8Array | string,
  file: string,
  maxBytes: number,
): WorkflowSessionManifest {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input
  if (bytes.byteLength > maxBytes) {
    throw new BoundedFileError(`${file} exceeds the ${maxBytes}-byte manifest limit`, 'WORKFLOW_STORAGE_LIMIT')
  }
  let value: unknown
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch (error) {
    throw new BoundedFileError(`${file} is malformed UTF-8 or JSON`, 'WORKFLOW_STORAGE_CORRUPT', { cause: error })
  }
  if (!isRecord(value) || value.version !== 2 || typeof value.sessionId !== 'string'
      || !isSafeNonNegative(value.revision) || !isSafeNonNegative(value.nextOrdinal)
      || !Array.isArray(value.ordinals) || !Array.isArray(value.heads)) {
    throw new BoundedFileError(`${file} is not a version-2 Session manifest`, 'WORKFLOW_STORAGE_CORRUPT')
  }
  for (const head of value.heads) assertHead(head)
  return value as unknown as WorkflowSessionManifest
}

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObject)
  if (!isRecord(value)) return value
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, sortObject(value[key])]))
}

/** Encode a canonical version-2 Session manifest. */
export function encodeWorkflowSessionManifest(value: WorkflowSessionManifest, maxBytes: number): Uint8Array {
  if (value.version !== 2) throw new BoundedFileError('manifest version must be 2', 'WORKFLOW_STORAGE_CORRUPT')
  for (const head of value.heads) assertHead(head)
  const bytes = new TextEncoder().encode(`${JSON.stringify(sortObject(value))}\n`)
  if (bytes.byteLength > maxBytes) {
    throw new BoundedFileError(`manifest exceeds the ${maxBytes}-byte limit`, 'WORKFLOW_STORAGE_LIMIT')
  }
  return bytes
}
