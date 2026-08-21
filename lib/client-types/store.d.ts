/** Framework-neutral interaction store for the workflow dashboard. */
/** Sections available in the selected-run inspector. */
export type WorkflowInspectorTab = 'members' | 'logs' | 'result' | 'artifacts';
/** Narrow-screen route. */
export type WorkflowMobileView = 'runs' | 'execution' | 'inspector';
/** Overlay navigation state. Workflow business data remains in the controller. */
export interface WorkflowsState {
    open: boolean;
    selectedRunId: string | undefined;
    selectedMemberId: string | undefined;
    selectedArtifactName: string | undefined;
    inspectorTab: WorkflowInspectorTab;
    mobileView: WorkflowMobileView;
}
/** Draft-based actions can be adapted directly to DSH's Immer store runtime. */
export interface WorkflowsActions {
    open(draft: WorkflowsState): void;
    close(draft: WorkflowsState): void;
    selectRun(draft: WorkflowsState, runId: string): void;
    reconcileRun(draft: WorkflowsState, runId: string | undefined, visibleRunIds?: readonly string[]): void;
    selectMember(draft: WorkflowsState, memberId: string): void;
    selectArtifact(draft: WorkflowsState, name: string | undefined): void;
    selectTab(draft: WorkflowsState, tab: WorkflowInspectorTab): void;
    showRuns(draft: WorkflowsState): void;
    showExecution(draft: WorkflowsState): void;
    /** Compatibility spelling used by early package consumers. */
    showRun(draft: WorkflowsState): void;
}
export interface WorkflowsStoreHandle {
    readonly init: () => WorkflowsState;
    readonly actions: WorkflowsActions;
    readonly spec: {
        readonly init: () => WorkflowsState;
        readonly actions: WorkflowsActions;
    };
    readonly state: WorkflowsState;
    getState(): WorkflowsState;
    dispatch<K extends keyof WorkflowsActions>(action: K, ...args: ActionArguments<WorkflowsActions[K]>): void;
    subscribe(listener: () => void): () => void;
    /** Slot-runtime compatible instance factory. */
    create(): WorkflowsStoreInstance;
    dispose(): void;
}
type ActionArguments<T> = T extends (draft: WorkflowsState, ...args: infer A) => void ? A : never;
export interface WorkflowsStoreInstance {
    readonly actions: {
        [K in keyof WorkflowsActions]: (...args: ActionArguments<WorkflowsActions[K]>) => void;
    };
    getSnapshot(): WorkflowsState;
    subscribe(listener: () => void): () => void;
    clearPersisted(): void;
    readonly store: {
        getSnapshot(): WorkflowsState;
        subscribe(listener: () => void): () => void;
        update(mutator: (draft: WorkflowsState) => void): void;
        set(next: WorkflowsState): void;
    };
}
/** Pure dashboard state transitions. */
export declare const workflowsActions: WorkflowsActions;
/**
 * Create a store definition plus a small standalone runtime.  Its `init` and
 * `actions` fields mirror the official store contract, while `dispatch` makes
 * it directly testable without importing a second browser state library.
 */
export declare function createWorkflowsStore(): WorkflowsStoreHandle;
export declare const createWorkflowStore: typeof createWorkflowsStore;
export {};
//# sourceMappingURL=store.d.ts.map