/** Register one effect-owned bounded Host event lane; no package-local queue is retained. */
export function registerWorkflowRemoteEvents(ctx, config = {}) {
    const registry = ctx.apiRemoteEvents;
    if (typeof registry?.register !== 'function')
        throw new Error('workflow Remote event registry is unavailable');
    const maxKeys = config.remoteQueueMaxSessions ?? 256;
    if (!Number.isSafeInteger(maxKeys) || maxKeys < 1 || maxKeys > 256)
        throw new RangeError('remoteQueueMaxSessions must be a safe integer from 1 through 256');
    const disposer = registry.register('workflows/run-change', {
        kind: 'keyed-latest', maxKeys,
        select: change => change.kind === 'invalidate-all' ? { kind: 'invalidate-all' } : { kind: 'key', key: String(change.sessionId) },
        invalidationArgs: [{ kind: 'invalidate-all' }],
    });
    if (typeof disposer === 'function')
        return disposer;
    if (typeof disposer?.dispose === 'function')
        return () => { void disposer.dispose(); };
    return () => undefined;
}
export const applyRemoteEvents = registerWorkflowRemoteEvents;
//# sourceMappingURL=remote-events.js.map