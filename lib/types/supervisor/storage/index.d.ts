import { type ResolvedWorkflowPackageConfig } from '../../config.js';
import { type WorkflowStorageAnchor, type WorkflowStorageLease } from './lease.js';
import { type WorkflowStorageLayout } from './private-root.js';
import { FileWorkflowRunStore } from './manifest-store.js';
import type { RecoveredRun } from './manifest-types.js';
export * from './lease.js';
export * from './private-root.js';
export * from './bounded-file.js';
export * from './manifest-types.js';
export * from './manifest-codec.js';
export * from './details-codec.js';
export * from './manifest-store.js';
export * from './run-files.js';
export * from './recovery.js';
export interface WorkflowStorage {
    readonly anchor: WorkflowStorageAnchor;
    readonly lease: WorkflowStorageLease;
    readonly layout: WorkflowStorageLayout;
    readonly store: FileWorkflowRunStore;
    /** Interrupted inspection rows from the first eager recovery pass. */
    readonly recovered: readonly RecoveredRun[];
    dispose(): Promise<void>;
}
/** Bootstrap the leased storage root and eagerly recover retained state. */
export declare function openWorkflowStorage(config: ResolvedWorkflowPackageConfig, hostFileSystem?: unknown): Promise<WorkflowStorage>;
//# sourceMappingURL=index.d.ts.map