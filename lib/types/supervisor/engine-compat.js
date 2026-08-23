import { randomBytes } from 'node:crypto';
function isThenable(value) {
    return value != null && typeof value.then === 'function';
}
function asRecord(value) {
    return typeof value === 'object' && value !== null ? value : undefined;
}
/** True when the engine exposes the complete deferred-start and replay face. */
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
 * Stock `@deepseek-ai/dsh-workflow` `WorkflowRun` may expose only
 * `id`/`result`/`cancel`/`dispose`. Wrap that thin face so the supervisor can
 * admit a run instead of failing with "invalid run handle".
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
    const result = Promise.resolve(handle.result).then(value => {
        return normalizeResult(value);
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
        // Stock methods are receiver-sensitive class methods.  Calling an
        // extracted `cancel` caused `this` to be undefined and surfaced as
        // `Cannot read properties of undefined (reading 'settled')` on Stop.
        // A handle reaching this adapter is missing at least one required replay
        // primitives; the set is atomic, so a partial subset is not authority.
        supportsReplay: false,
        cancel: (reason) => { Reflect.apply(cancel, handle, [reason]); },
        resume: () => { Reflect.apply(resume, handle, []); },
        release: () => { Reflect.apply(release, handle, []); },
        async dispose() {
            try {
                await Reflect.apply(disposeRaw, handle, []);
            }
            catch {
                // Stock WorkerRun.dispose() can throw after the worker has already
                // died (`undefined.disposed`). The supervisor treats cleanup errors
                // as terminal, so contain them here and still allow checkpoint().
            }
        },
        checkpoint() {
            // Never manufacture an empty journal.  It cannot prove which effects
            // committed and would make a resumed stock run repeat them.
            if (nativeCheckpoint === undefined)
                return undefined;
            return Reflect.apply(nativeCheckpoint, handle, []);
        },
    };
}
/** Whether Pause/Resume can be offered without replaying committed effects. */
export function supportsEngineReplay(handle) {
    return handle.supportsReplay !== false;
}
/** Best-effort cancel/dispose of a handle the supervisor will not keep. */
export function rejectPartialEngineHandle(raw) {
    const handle = asRecord(raw);
    if (handle === undefined)
        return;
    if (typeof handle.cancel === 'function') {
        try {
            Reflect.apply(handle.cancel, handle, ['invalid workflow run handle']);
        }
        catch { /* contained */ }
    }
    if (typeof handle.dispose === 'function') {
        let disposed;
        try {
            disposed = Reflect.apply(handle.dispose, handle, []);
        }
        catch {
            return;
        }
        void Promise.resolve(disposed).catch(() => undefined);
    }
}
//# sourceMappingURL=engine-compat.js.map