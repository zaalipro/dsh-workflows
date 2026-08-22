import { type ReactElement } from 'react';
import type { ClientRunHead, WorkflowRunArtifactChunk, WorkflowRunDetail, WorkflowRunMemberHead, WorkflowRunsOperations, WorkflowRunsSourceSnapshot } from './contract.js';
import type { DashboardWorkflowRunsAdapter } from './adapter.js';
import type { WorkflowRunsController } from './controller.js';
import { type DashboardLabels } from './locales.js';
import type { WorkflowsState, WorkflowsStoreInstance } from './store.js';
export declare const GENERIC_LOAD_ERROR = "Unable to load workflow data. Retry.";
export declare const GENERIC_CONTROL_ERROR = "Unable to update workflow. Retry.";
export declare const STALE_CONTROL_ERROR = "workflow run changed; refresh it before applying a control";
type DashboardOperations = WorkflowRunsOperations & Partial<{
    get(sessionId: string): WorkflowRunsSourceSnapshot;
    subscribe(sessionId: string, listener: (snapshot: WorkflowRunsSourceSnapshot) => void): () => void;
}>;
/** Business dependencies supplied by the browser plugin slot. */
export interface WorkflowsDashboardInjected {
    readonly operations: WorkflowRunsOperations;
    readonly labels?: DashboardLabels;
}
export interface WorkflowsDashboardProps {
    /** Bounded reads and controls. */
    readonly operations?: DashboardOperations;
    /** Compatibility name retained for the package's first preview. */
    readonly controller?: WorkflowRunsController | DashboardWorkflowRunsAdapter;
    /** Slot-owned observable value. Omit when `operations.subscribe` is present. */
    readonly source?: WorkflowRunsSourceSnapshot;
    readonly sessionId?: string;
    readonly open?: boolean;
    readonly invoker?: HTMLElement | null;
    readonly onClose?: () => void;
    /** Interaction store snapshot. When present, selection and mobile view are store-owned. */
    readonly store?: WorkflowsState;
    readonly storeActions?: WorkflowsStoreInstance['actions'];
    readonly labels?: DashboardLabels;
}
/** Stable active-oldest/history-newest ordering required by the dashboard. */
export declare function orderWorkflowRuns(rows: readonly ClientRunHead[]): ClientRunHead[];
/** Prefer Remote phases; otherwise recover titles from members or the live phase. */
export declare function declaredWorkflowPhases(execution: WorkflowRunDetail | undefined, selectedRun: ClientRunHead, members: readonly WorkflowRunMemberHead[]): NonNullable<WorkflowRunDetail['phases']>;
/**
 * Join only a same-revision chunk beginning at the exact prior UTF-8 byte end.
 * Returning undefined forces the UI to preserve the good prefix and retry.
 */
export declare function appendArtifactChunk(previous: WorkflowRunArtifactChunk, next: WorkflowRunArtifactChunk): WorkflowRunArtifactChunk | undefined;
/** Full-screen, lazy, revision-aware workflow dashboard. */
export declare function WorkflowsDashboard({ operations: suppliedOperations, controller, source: suppliedSource, sessionId, open: openProp, invoker, onClose, store, storeActions, labels: labelOverrides, }: WorkflowsDashboardProps): ReactElement | null;
export default WorkflowsDashboard;
//# sourceMappingURL=WorkflowsDashboard.d.ts.map