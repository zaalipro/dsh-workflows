import { randomBytes } from 'node:crypto';
function isThenable(value) {
    return value != null && typeof value.then === 'function';
}
function asRecord(value) {
    return typeof value === 'object' && value !== null ? value : undefined;
}
/** True when the engine already exposes H's deferred-start and replay face. */
export function isCompleteEngineHandle(raw) {
    const handle = asRecord(raw);
    if (handle === undefined)
        return false;
    return isThenable(handle.result)
        && typeof handle.cancel === 'function'
        && typeof handle.release === 'function'
        && typeof handle.resume === 'function'
        && typeof handle.dispose === 'function'
        && typeof handle.checkpoint === 'function';
}
function normalizeResult(value) {
    const record = asRecord(value);
    const stop = record?.stopReason;
    const stopReason = stop === 'completed' || stop === 'cancelled' || stop === 'error' ? stop : 'error';
    const agentsStarted = Number(record?.agentsStarted);
    return {
        value: record === undefined ? value : record.value,
        stopReason,
        ...(typeof record?.error === 'string' ? { error: record.error } : {}),
        ...(typeof record?.errorCode === 'string' ? { errorCode: record.errorCode } : {}),
        agentsStarted: Number.isFinite(agentsStarted) && agentsStarted > 0 ? Math.trunc(agentsStarted) : 0,
    };
}
/**
 * Stock `@deepseek-ai/dsh-workflow` `WorkflowRun` is `id`/`result`/`cancel`/`dispose`.
 * H adds `release` (deferStart), `resume`, and `checkpoint`. Wrap the thin face
 * so the supervisor can admit a run instead of failing with "invalid run handle".
 */
export function adaptEngineHandle(raw) {
    if (isCompleteEngineHandle(raw))
        return raw;
    const handle = asRecord(raw);
    if (handle === undefined || !isThenable(handle.result)
        || typeof handle.cancel !== 'function' || typeof handle.dispose !== 'function') {
        return undefined;
    }
    const id = typeof handle.id === 'string' && handle.id.length > 0
        ? handle.id
        : randomBytes(16).toString('hex');
    let settled;
    let disposed = false;
    const result = Promise.resolve(handle.result).then(value => {
        settled = normalizeResult(value);
        return settled;
    });
    const cancel = handle.cancel;
    const resume = typeof handle.resume === 'function' ? handle.resume : () => undefined;
    const release = typeof handle.release === 'function' ? handle.release : () => undefined;
    const disposeRaw = handle.dispose;
    const nativeCheckpoint = typeof handle.checkpoint === 'function'
        ? handle.checkpoint
        : undefined;
    return {
        id,
        result,
        cancel: (reason) => { cancel(reason); },
        resume: () => { resume(); },
        release: () => { release(); },
        async dispose() {
            await disposeRaw();
            disposed = true;
        },
        checkpoint() {
            if (nativeCheckpoint !== undefined)
                return nativeCheckpoint();
            if (settled === undefined || !disposed)
                throw new Error('workflow checkpoint is not ready');
            const spend = settled.agentsStarted;
            return { journal: [], agentSpend: spend, agentSeq: spend };
        },
    };
}
/** Best-effort cancel/dispose of a handle the supervisor will not keep. */
export function rejectPartialEngineHandle(raw) {
    const handle = asRecord(raw);
    if (handle === undefined)
        return;
    if (typeof handle.cancel === 'function') {
        try {
            handle.cancel('invalid workflow run handle');
        }
        catch { /* contained */ }
    }
    if (typeof handle.dispose === 'function') {
        void Promise.resolve(handle.dispose()).catch(() => undefined);
    }
}
//# sourceMappingURL=engine-compat.js.map