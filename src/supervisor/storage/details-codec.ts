import type {
  JsonValue,
  WorkflowRunDetailPayloadV2,
  WorkflowRunDetailSnapshotV2,
} from './manifest-types.js'
import { BoundedFileError } from './bounded-file.js'

export interface WorkflowRunDetailLimits {
  readonly memberOutcomeMaxBytes: number
  readonly maxTerminalResultBytes: number
  readonly maxLogLineBytes: number
  readonly maxRunDetailsBytes: number
}

const COMPONENT = /^[a-f0-9]{32}$/u
const encoder = new TextEncoder()

function byteLength(value: unknown): number {
  return encoder.encode(JSON.stringify(value)).byteLength
}

function utf8Prefix(text: string, maxBytes: number): string {
  let result = ''
  for (const point of text) {
    if (encoder.encode(result + point).byteLength > maxBytes) break
    result += point
  }
  return result
}

function projectValue(value: JsonValue, maxBytes: number): {
  readonly value?: JsonValue
  readonly preview?: string
  readonly totalBytes: number
  readonly truncated: boolean
} {
  const text = JSON.stringify(value)
  const totalBytes = encoder.encode(text).byteLength
  return totalBytes <= maxBytes
    ? { value, totalBytes, truncated: false }
    : { preview: utf8Prefix(text, maxBytes), totalBytes, truncated: true }
}

/** Deterministically compact a detail payload to its fixed quotas. */
export function compactWorkflowRunDetails(
  value: WorkflowRunDetailPayloadV2,
  limits: WorkflowRunDetailLimits,
): WorkflowRunDetailPayloadV2 {
  let logs = [...(value.logs ?? [])].map(log => {
    const bytes = encoder.encode(log.text).byteLength
    return bytes <= limits.maxLogLineBytes
      ? log
      : { ...log, text: utf8Prefix(log.text, limits.maxLogLineBytes) }
  })
  let members = [...(value.members ?? [])].sort((left, right) => left.seq - right.seq).map(member => {
    if (member.value === undefined || byteLength(member.value) <= limits.memberOutcomeMaxBytes) return member
    return { ...member, value: undefined, outcome: 'evicted' as const }
  })
  let result = value.result
  if (result?.value !== undefined) {
    const projected = projectValue(result.value, limits.maxTerminalResultBytes)
    result = projected.truncated
      ? { ...result, value: undefined, preview: projected.preview, totalBytes: projected.totalBytes, truncated: true }
      : { ...result, totalBytes: projected.totalBytes, truncated: false }
  }
  let output: WorkflowRunDetailPayloadV2 = { ...value, members, logs, ...(result === undefined ? {} : { result }) }
  while (byteLength(output) > limits.maxRunDetailsBytes && logs.length > 0) {
    logs = logs.slice(1)
    output = { ...output, logs }
  }
  while (byteLength(output) > limits.maxRunDetailsBytes) {
    const index = members.findIndex(member => member.outcome === 'available')
    if (index < 0) break
    members[index] = { ...members[index], value: undefined, outcome: 'evicted' }
    output = { ...output, members }
  }
  if (byteLength(output) > limits.maxRunDetailsBytes) {
    throw new BoundedFileError('fixed workflow detail metadata exceeds the run limit', 'WORKFLOW_STORAGE_LIMIT')
  }
  return output
}

/** Encode one immutable version-2 detail sidecar. */
export function encodeWorkflowRunDetails(
  value: WorkflowRunDetailSnapshotV2,
  limits: WorkflowRunDetailLimits,
): Uint8Array {
  if (value.version !== 2 || !COMPONENT.test(value.runDirectory) || !COMPONENT.test(value.detailId)
      || !Number.isSafeInteger(value.snapshotRevision) || value.snapshotRevision < 0) {
    throw new BoundedFileError('workflow detail identity is invalid', 'WORKFLOW_STORAGE_CORRUPT')
  }
  const compact = { ...value, payload: compactWorkflowRunDetails(value.payload, limits) }
  const bytes = encoder.encode(`${JSON.stringify(compact)}\n`)
  if (bytes.byteLength > limits.maxRunDetailsBytes) {
    throw new BoundedFileError('workflow detail snapshot exceeds the run limit', 'WORKFLOW_STORAGE_LIMIT')
  }
  return bytes
}

/** Decode one immutable version-2 detail sidecar. */
export function decodeWorkflowRunDetails(
  input: Uint8Array | string,
  file: string,
  limits: WorkflowRunDetailLimits,
): WorkflowRunDetailSnapshotV2 {
  const bytes = typeof input === 'string' ? encoder.encode(input) : input
  if (bytes.byteLength > limits.maxRunDetailsBytes) {
    throw new BoundedFileError(`${file} exceeds the run detail limit`, 'WORKFLOW_STORAGE_LIMIT')
  }
  let value: unknown
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch (error) {
    throw new BoundedFileError(`${file} is malformed`, 'WORKFLOW_STORAGE_CORRUPT', { cause: error })
  }
  const candidate = value as Partial<WorkflowRunDetailSnapshotV2>
  if (candidate.version !== 2 || typeof candidate.sessionId !== 'string' || typeof candidate.runId !== 'string'
      || typeof candidate.runDirectory !== 'string' || !COMPONENT.test(candidate.runDirectory)
      || typeof candidate.detailId !== 'string' || !COMPONENT.test(candidate.detailId)
      || !Number.isSafeInteger(candidate.snapshotRevision) || candidate.payload === undefined) {
    throw new BoundedFileError(`${file} is not a valid version-2 detail snapshot`, 'WORKFLOW_STORAGE_CORRUPT')
  }
  return candidate as WorkflowRunDetailSnapshotV2
}
