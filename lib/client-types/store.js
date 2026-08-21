/** Framework-neutral interaction store for the workflow dashboard. */
const initial = () => ({
    open: false,
    selectedRunId: undefined,
    selectedMemberId: undefined,
    selectedArtifactName: undefined,
    inspectorTab: 'members',
    mobileView: 'runs',
});
/** Pure dashboard state transitions. */
export const workflowsActions = {
    open: draft => { draft.open = true; },
    close: draft => { draft.open = false; },
    selectRun: (draft, runId) => {
        if (draft.selectedRunId !== runId) {
            draft.selectedMemberId = undefined;
            draft.selectedArtifactName = undefined;
            draft.inspectorTab = 'members';
        }
        draft.selectedRunId = runId;
        draft.mobileView = 'execution';
    },
    reconcileRun: (draft, runId, visibleRunIds) => {
        const candidate = runId === undefined
            ? visibleRunIds?.[0]
            : visibleRunIds === undefined || visibleRunIds.includes(runId)
                ? runId
                : visibleRunIds[0];
        if (candidate !== draft.selectedRunId) {
            draft.selectedMemberId = undefined;
            draft.selectedArtifactName = undefined;
            draft.inspectorTab = 'members';
        }
        draft.selectedRunId = candidate;
        // Reconciliation intentionally preserves the current mobile route.
    },
    selectMember: (draft, memberId) => {
        draft.selectedMemberId = memberId;
        draft.inspectorTab = 'members';
        draft.mobileView = 'inspector';
    },
    selectArtifact: (draft, name) => {
        draft.selectedArtifactName = name;
        draft.inspectorTab = 'artifacts';
        draft.mobileView = 'inspector';
    },
    selectTab: (draft, tab) => {
        draft.inspectorTab = tab;
        if (tab === 'members') {
            draft.mobileView = 'execution';
            draft.selectedArtifactName = undefined;
        }
        else {
            draft.mobileView = 'inspector';
            if (tab !== 'artifacts')
                draft.selectedArtifactName = undefined;
            draft.selectedMemberId = undefined;
        }
    },
    showRuns: draft => { draft.mobileView = 'runs'; },
    showExecution: draft => { draft.mobileView = 'execution'; },
    showRun: draft => { draft.mobileView = 'execution'; },
};
/**
 * Create a store definition plus a small standalone runtime.  Its `init` and
 * `actions` fields mirror the official store contract, while `dispatch` makes
 * it directly testable without importing a second browser state library.
 */
export function createWorkflowsStore() {
    const standalone = createRuntime();
    return {
        init: initial,
        actions: workflowsActions,
        spec: { init: initial, actions: workflowsActions },
        get state() { return standalone.getSnapshot(); },
        getState: standalone.getSnapshot,
        dispatch: (action, ...args) => { standalone.run(action, args); },
        subscribe: standalone.subscribe,
        create: createBoundInstance,
        dispose: standalone.dispose,
    };
}
function createRuntime() {
    let current = initial();
    const listeners = new Set();
    const publish = () => {
        for (const listener of [...listeners]) {
            try {
                listener();
            }
            catch { /* one observer cannot starve later observers */ }
        }
    };
    const set = (next) => { current = next; publish(); };
    const update = (mutator) => {
        const draft = { ...current };
        mutator(draft);
        set(draft);
    };
    return {
        getSnapshot: () => current,
        subscribe: (listener) => {
            listeners.add(listener);
            return () => { listeners.delete(listener); };
        },
        run: (action, args) => {
            update(draft => { workflowsActions[action](draft, ...args); });
        },
        update,
        set,
        dispose: () => { listeners.clear(); },
    };
}
function createBoundInstance() {
    const runtime = createRuntime();
    const actions = {};
    for (const action of Object.keys(workflowsActions)) {
        ;
        actions[action] = (...args) => { runtime.run(action, args); };
    }
    return {
        actions,
        getSnapshot: runtime.getSnapshot,
        subscribe: runtime.subscribe,
        clearPersisted: () => undefined,
        store: {
            getSnapshot: runtime.getSnapshot,
            subscribe: runtime.subscribe,
            update: runtime.update,
            set: runtime.set,
        },
    };
}
export const createWorkflowStore = createWorkflowsStore;
//# sourceMappingURL=store.js.map