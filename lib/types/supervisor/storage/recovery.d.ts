import type { RecoveredRun, WorkflowStoreOptions } from './manifest-types.js';
import type { WorkflowRunStore } from './manifest-types.js';
import type { WorkflowStorageLayout } from './private-root.js';
type RecoveryLayout = WorkflowStorageLayout | {
    readonly root: string;
};
export declare function inventoryWorkflowStorage(layout: RecoveryLayout, limits: Pick<WorkflowStoreOptions, 'maxRecoveryEntries'>, signal?: AbortSignal): Promise<number>;
/** Recover all persisted Sessions only after the bounded inventory passes. */
export declare function recoverWorkflowStorage(layout: RecoveryLayout, store: WorkflowRunStore, limits: Pick<WorkflowStoreOptions, 'maxRecoveryEntries'>, signal?: AbortSignal): Promise<{
    readonly runs: readonly RecoveredRun[];
    readonly entries: number;
}>;
export {};
//# sourceMappingURL=recovery.d.ts.map