import type { WorkflowRunChange } from './supervisor/types.js'

/** Canonical H ApiProxy registration for workflow invalidation hints. */
export type WorkflowRemoteEvent = WorkflowRunChange
/** Spec name for the invalidate-only `workflows/run-change` payload. */
export type WorkflowRunInvalidation = WorkflowRunChange

export interface WorkflowRemoteEventConfig { readonly remoteQueueMaxSessions?: number }

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * Invalidation-only workflow run hint. Never carries a run head.
     * @mode emit
     */
    'workflows/run-change'(change: WorkflowRunChange): void
  }
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteEventSelection {
    'workflows/run-change': true
  }
}

interface ApiRemoteEventsLike {
  register?: (event: string, policy: {
    readonly kind: 'keyed-latest'
    readonly maxKeys: number
    readonly select: (change: WorkflowRemoteEvent) => { readonly kind: 'key'; readonly key: string } | { readonly kind: 'invalidate-all' }
    readonly invalidationArgs: readonly [WorkflowRemoteEvent]
  }) => unknown
}

/** Register one effect-owned bounded H event lane; no package-local queue is retained. */
export function registerWorkflowRemoteEvents(
  ctx: { readonly apiRemoteEvents?: ApiRemoteEventsLike },
  config: WorkflowRemoteEventConfig = {},
): () => void {
  const registry = ctx.apiRemoteEvents
  if (typeof registry?.register !== 'function') throw new Error('workflow Remote event registry is unavailable')
  const maxKeys = config.remoteQueueMaxSessions ?? 256
  if (!Number.isSafeInteger(maxKeys) || maxKeys < 1 || maxKeys > 256) throw new RangeError('remoteQueueMaxSessions must be a safe integer from 1 through 256')
  const disposer = registry.register('workflows/run-change', {
    kind: 'keyed-latest', maxKeys,
    select: change => change.kind === 'invalidate-all' ? { kind: 'invalidate-all' } : { kind: 'key', key: String(change.sessionId) },
    invalidationArgs: [{ kind: 'invalidate-all' }],
  })
  if (typeof disposer === 'function') return disposer as () => void
  if (typeof (disposer as any)?.dispose === 'function') return () => { void (disposer as any).dispose() }
  return () => undefined
}

export const applyRemoteEvents = registerWorkflowRemoteEvents
