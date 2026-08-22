/** Stable observable adapter for the dashboard slot. */
const EMPTY = Object.freeze({
    sessionId: '', phase: 'idle', status: 'idle', runs: Object.freeze([]), total: 0,
    sessionRevision: 0, revision: 0,
});
export class DashboardWorkflowRunsAdapter {
    controller;
    snapshot = EMPTY;
    listeners = new Set();
    observedSessionId;
    observedSource;
    unsubscribe;
    disposed = false;
    listDefinitions;
    launchDefinition;
    source;
    constructor(controller) {
        this.controller = controller;
        const callable = ((sessionId) => this.controller.source(sessionId));
        callable.getSnapshot = () => this.snapshot;
        callable.subscribe = listener => {
            if (this.disposed)
                return () => undefined;
            this.listeners.add(listener);
            return () => { this.listeners.delete(listener); };
        };
        this.source = callable;
    }
    get(sessionId) {
        return this.controller.get(sessionId);
    }
    subscribe(sessionId, listener) {
        return this.controller.subscribe(sessionId, listener);
    }
    observe(sessionId) {
        if (this.disposed || sessionId === this.observedSessionId)
            return;
        this.unsubscribe?.();
        this.unsubscribe = undefined;
        this.observedSessionId = sessionId;
        const source = sessionId === undefined ? undefined : this.controller.source(sessionId);
        this.observedSource = source;
        this.publish(source?.getSnapshot() ?? { ...EMPTY, sessionId: sessionId ?? '' }, true);
        if (source !== undefined) {
            this.unsubscribe = source.subscribe(() => {
                if (this.observedSource === source)
                    this.publish(source.getSnapshot(), false);
            });
        }
    }
    /** Compatibility aliases used by the initial package prototype. */
    show(sessionId) { this.observe(sessionId); }
    close() { this.observe(undefined); }
    refresh(...args) { return this.controller.refresh(...args); }
    loadMore(...args) { return this.controller.loadMore(...args); }
    detail(...args) { return this.controller.detail(...args); }
    members(...args) { return this.controller.members(...args); }
    memberDetail(...args) { return this.controller.memberDetail(...args); }
    logs(...args) { return this.controller.logs(...args); }
    result(...args) { return this.controller.result(...args); }
    artifacts(...args) { return this.controller.artifacts(...args); }
    artifact(...args) { return this.controller.artifact(...args); }
    control(...args) { return this.controller.control(...args); }
    resolveAndOpenChild(...args) { return this.controller.resolveAndOpenChild(...args); }
    handleChange(...args) { this.controller.handleChange(...args); }
    handleDisconnected(...args) { this.controller.handleDisconnected(...args); }
    handleConnected(...args) { this.controller.handleConnected(...args); }
    handleReset(...args) { this.controller.handleReset(...args); }
    removeSession(...args) { this.controller.removeSession(...args); }
    dispose() {
        if (this.disposed)
            return;
        this.disposed = true;
        this.unsubscribe?.();
        this.unsubscribe = undefined;
        this.observedSource = undefined;
        this.observedSessionId = undefined;
        this.listeners.clear();
    }
    publish(snapshot, force) {
        if (!force && snapshot === this.snapshot)
            return;
        this.snapshot = snapshot;
        for (const listener of [...this.listeners]) {
            try {
                listener();
            }
            catch { /* contain a bad UI listener */ }
        }
    }
}
export default DashboardWorkflowRunsAdapter;
//# sourceMappingURL=adapter.js.map