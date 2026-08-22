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

function assistantTextBlocks(message: unknown): string {
  const content = (message as { content?: unknown } | undefined)?.content
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) {
    return typeof (message as { text?: unknown } | undefined)?.text === 'string'
      ? String((message as { text: string }).text).trim()
      : ''
  }
  const parts: string[] = []
  for (const block of content) {
    if (typeof block !== 'object' || block === null) continue
    if ((block as { type?: unknown }).type !== 'text') continue
    if (typeof (block as { text?: unknown }).text !== 'string') continue
    const text = (block as { text: string }).text.trim()
    if (text.length > 0) parts.push(text)
  }
  return parts.join('\n')
}

/** Last non-empty assistant/message text in a child session log. */
export function lastAssistantText(events: unknown): string | undefined {
  if (!Array.isArray(events)) return undefined
  let last: string | undefined
  for (const event of events) {
    if (typeof event !== 'object' || event === null) continue
    if ((event as { type?: unknown }).type !== 'assistant/message') continue
    const data = (event as { data?: unknown }).data
    const message = (data as { message?: unknown } | undefined)?.message ?? data
    const text = assistantTextBlocks(message)
    if (text.length > 0) last = text
  }
  return last
}

function serviceGet(ctx: unknown, name: string): unknown {
  const record = ctx as { [key: string]: unknown; get?: (id: string) => unknown }
  if (record?.[name] != null) return record[name]
  if (typeof record?.get === 'function') return record.get(name)
  return undefined
}

function eventsFromAgent(record: unknown): unknown {
  return (record as { session?: { events?: unknown } } | undefined)?.session?.events
}

function eventsFromSession(record: unknown): unknown {
  return (record as { events?: unknown } | undefined)?.events
}

/** Recover a stock child agent's reply when journal-commit never fired. */
export function childTranscriptValue(ctx: unknown, childId: unknown): JsonValue | undefined {
  if (typeof childId !== 'string' || childId.length === 0) return undefined
  try {
    const agents = serviceGet(ctx, 'agents') as { get?: (id: string) => unknown } | undefined
    const sessions = serviceGet(ctx, 'sessions') as { get?: (id: string) => unknown } | undefined
    const text = lastAssistantText(eventsFromAgent(agents?.get?.(childId)))
      ?? lastAssistantText(eventsFromSession(sessions?.get?.(childId)))
    if (text === undefined) return undefined
    return snapshotWorkflowJsonValue(text)
  } catch {
    return undefined
  }
}

/** Promote a stored not-produced/pending member when a child transcript is still reachable. */
export function memberOutcomeWithTranscript(
  ctx: unknown,
  member: { readonly outcome: 'pending' | 'available' | 'not-produced' | 'evicted'; readonly status: string; readonly childSessionId?: string },
): 'pending' | 'available' | 'not-produced' | 'evicted' {
  if (member.outcome === 'available' || member.outcome === 'evicted') return member.outcome
  if (member.outcome === 'pending' && member.status === 'running') return 'pending'
  if (childTranscriptValue(ctx, member.childSessionId) !== undefined) return 'available'
  return member.outcome
}
