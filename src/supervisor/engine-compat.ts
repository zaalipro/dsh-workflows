import { randomBytes } from 'node:crypto'

/** Settlement payload the supervisor already understands. */
export interface EngineResult {
  readonly value: unknown
  readonly stopReason: 'completed' | 'cancelled' | 'error'
  readonly error?: string
  readonly errorCode?: string
  readonly agentsStarted: number
}

/** Replay journal captured after dispose. Empty on stock RC8 workers. */
export interface WorkflowCheckpoint {
  readonly journal: readonly {
    readonly callId: readonly [number, ...number[]]
    readonly fingerprint: string
    readonly kind: string
    readonly [key: string]: unknown
  }[]
  readonly agentSpend: number
  readonly agentSeq: number
}

/** Supervisor-facing live attempt. Stock RC8 implements a subset. */
export interface EngineHandle {
  readonly id: string
  readonly result: Promise<EngineResult>
  cancel(reason?: string): void
  resume(): void
  release(): void
  checkpoint(): WorkflowCheckpoint
  dispose(): Promise<void>
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return value != null && typeof (value as { then?: unknown }).then === 'function'
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : undefined
}

/** True when the engine already exposes H's deferred-start and replay face. */
export function isCompleteEngineHandle(raw: unknown): raw is EngineHandle {
  const handle = asRecord(raw)
  if (handle === undefined) return false
  return isThenable(handle.result)
    && typeof handle.cancel === 'function'
    && typeof handle.release === 'function'
    && typeof handle.resume === 'function'
    && typeof handle.dispose === 'function'
    && typeof handle.checkpoint === 'function'
}

function normalizeResult(value: unknown): EngineResult {
  const record = asRecord(value)
  const stop = record?.stopReason
  const stopReason = stop === 'completed' || stop === 'cancelled' || stop === 'error' ? stop : 'error'
  const agentsStarted = Number(record?.agentsStarted)
  return {
    value: record === undefined ? value : record.value,
    stopReason,
    ...(typeof record?.error === 'string' ? { error: record.error } : {}),
    ...(typeof record?.errorCode === 'string' ? { errorCode: record.errorCode } : {}),
    agentsStarted: Number.isFinite(agentsStarted) && agentsStarted > 0 ? Math.trunc(agentsStarted) : 0,
  }
}

/**
 * Stock `@deepseek-ai/dsh-workflow` `WorkflowRun` is `id`/`result`/`cancel`/`dispose`.
 * H adds `release` (deferStart), `resume`, and `checkpoint`. Wrap the thin face
 * so the supervisor can admit a run instead of failing with "invalid run handle".
 */
export function adaptEngineHandle(raw: unknown): EngineHandle | undefined {
  if (isCompleteEngineHandle(raw)) return raw
  const handle = asRecord(raw)
  if (handle === undefined || !isThenable(handle.result)
    || typeof handle.cancel !== 'function' || typeof handle.dispose !== 'function') {
    return undefined
  }
  const id = typeof handle.id === 'string' && handle.id.length > 0
    ? handle.id
    : randomBytes(16).toString('hex')
  let settled: EngineResult | undefined
  let disposed = false
  const result = Promise.resolve(handle.result).then(value => {
    settled = normalizeResult(value)
    return settled
  })
  const cancel = handle.cancel as (reason?: string) => void
  const resume = typeof handle.resume === 'function' ? handle.resume as () => void : () => undefined
  const release = typeof handle.release === 'function' ? handle.release as () => void : () => undefined
  const disposeRaw = handle.dispose as () => unknown
  const nativeCheckpoint = typeof handle.checkpoint === 'function'
    ? handle.checkpoint as () => WorkflowCheckpoint
    : undefined
  return {
    id,
    result,
    cancel: (reason?: string) => { cancel(reason) },
    resume: () => { resume() },
    release: () => { release() },
    async dispose() {
      try {
        await disposeRaw()
      } catch {
        // Stock WorkerRun.dispose() can throw after the worker has already
        // died (`undefined.disposed`). The supervisor treats cleanup errors
        // as terminal, so contain them here and still allow checkpoint().
      } finally {
        disposed = true
      }
    },
    checkpoint() {
      if (nativeCheckpoint !== undefined) return nativeCheckpoint()
      if (settled === undefined || !disposed) throw new Error('workflow checkpoint is not ready')
      const spend = settled.agentsStarted
      return { journal: [], agentSpend: spend, agentSeq: spend }
    },
  }
}

/** Best-effort cancel/dispose of a handle the supervisor will not keep. */
export function rejectPartialEngineHandle(raw: unknown): void {
  const handle = asRecord(raw)
  if (handle === undefined) return
  if (typeof handle.cancel === 'function') {
    try { (handle.cancel as (reason?: string) => void)('invalid workflow run handle') }
    catch { /* contained */ }
  }
  if (typeof handle.dispose === 'function') {
    void Promise.resolve((handle.dispose as () => unknown)()).catch(() => undefined)
  }
}
