import type { JsonValue } from './storage/manifest-types.js'
import type { WorkflowRunValueView } from './types.js'

const encoder = new TextEncoder()

function utf8Prefix(text: string, maxBytes: number): string {
  let result = ''
  let retainedBytes = 0
  for (const codePoint of text) {
    const codePointBytes = encoder.encode(codePoint).byteLength
    if (retainedBytes + codePointBytes > maxBytes) break
    result += codePoint
    retainedBytes += codePointBytes
  }
  return result
}

/** Project a detached, complete JSON value or a UTF-8-safe bounded preview. */
export function workflowRunValueView(value: unknown, maxBytes: number): WorkflowRunValueView {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new TypeError('workflow member outcome maxBytes must be a positive safe integer')
  }
  const snapshot = snapshotWorkflowJsonValue(value)
  const text = JSON.stringify(snapshot, null, 2)
  const totalBytes = encoder.encode(text).byteLength
  if (totalBytes <= maxBytes) {
    return {
      state: 'available',
      content: { kind: 'value', value: snapshot },
      totalBytes,
      truncated: false,
    }
  }
  return {
    state: 'available',
    content: { kind: 'preview', text: utf8Prefix(text, maxBytes) },
    totalBytes,
    truncated: true,
  }
}

/** Backwards-compatible spelling used by early package previews. */
export const workflowValueView = workflowRunValueView

/** Validate that a value is lossless JSON data and return a deep snapshot. */
export function snapshotWorkflowJsonValue(value: unknown): JsonValue {
  const stack = new Set<object>()

  const invalid = (): never => {
    throw new TypeError('workflow value is not lossless JSON')
  }

  const walk = (input: unknown): JsonValue => {
    if (input === null || typeof input === 'string' || typeof input === 'boolean') return input
    if (typeof input === 'number') {
      if (!Number.isFinite(input) || Object.is(input, -0)) return invalid()
      return input
    }
    if (typeof input !== 'object') return invalid()
    if (stack.has(input)) throw new TypeError('workflow value is cyclic')

    stack.add(input)
    try {
      if (Array.isArray(input)) {
        const keys = Object.keys(input)
        if (keys.length !== input.length
          || keys.some((key, index) => key !== String(index))
          || Reflect.ownKeys(input).some(key => typeof key === 'symbol')) {
          throw new TypeError('workflow array is sparse or decorated')
        }
        const output: JsonValue[] = []
        for (let index = 0; index < input.length; index += 1) {
          const descriptor = Object.getOwnPropertyDescriptor(input, String(index))
          if (descriptor === undefined || !('value' in descriptor)) {
            throw new TypeError('workflow array is sparse or decorated')
          }
          output.push(walk(descriptor.value))
        }
        return output
      }

      const prototype = Object.getPrototypeOf(input)
      if (prototype !== Object.prototype && prototype !== null) return invalid()
      const output = Object.create(null) as Record<string, JsonValue>
      for (const key of Reflect.ownKeys(input)) {
        if (typeof key !== 'string') return invalid()
        const descriptor = Object.getOwnPropertyDescriptor(input, key)
        if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) return invalid()
        Object.defineProperty(output, key, {
          value: walk(descriptor.value),
          enumerable: true,
          configurable: true,
          writable: true,
        })
      }
      return output
    } finally {
      stack.delete(input)
    }
  }

  return walk(value)
}
