import type { JsonValue } from './storage/manifest-types.js'
import type { WorkflowRunValueView } from './types.js'

const encoder = new TextEncoder()

/** Project a complete JSON value or a UTF-8-safe bounded preview. */
export function workflowValueView(value: JsonValue, maxBytes: number): WorkflowRunValueView {
  const text = JSON.stringify(value)
  const totalBytes = encoder.encode(text).byteLength
  if (totalBytes <= maxBytes) {
    return { state: 'available', content: { kind: 'value', value: structuredClone(value) }, totalBytes, truncated: false }
  }
  let preview = ''
  for (const codePoint of text) {
    if (encoder.encode(preview + codePoint).byteLength > maxBytes) break
    preview += codePoint
  }
  return { state: 'available', content: { kind: 'preview', text: preview }, totalBytes, truncated: true }
}

/** Validate that a value is lossless JSON data. */
export function snapshotWorkflowJsonValue(value: unknown): JsonValue {
  const stack = new Set<object>()
  const walk = (input: unknown): JsonValue => {
    if (input === null || typeof input === 'string' || typeof input === 'boolean') return input
    if (typeof input === 'number' && Number.isFinite(input) && !Object.is(input, -0)) return input
    if (typeof input !== 'object') throw new TypeError('workflow value is not lossless JSON')
    if (stack.has(input)) throw new TypeError('workflow value is cyclic')
    stack.add(input)
    try {
      if (Array.isArray(input)) {
        if (Object.keys(input).some(key => !/^(?:0|[1-9][0-9]*)$/u.test(key) || Number(key) >= input.length)) throw new TypeError('workflow array is sparse or decorated')
        return input.map(walk)
      }
      if (Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null) throw new TypeError('workflow value is not a plain object')
      return Object.fromEntries(Object.entries(input as Record<string, unknown>).map(([key, nested]) => [key, walk(nested)]))
    } finally { stack.delete(input) }
  }
  return walk(value)
}
