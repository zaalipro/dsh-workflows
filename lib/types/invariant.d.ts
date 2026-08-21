/** Package error taxonomy and lifecycle invariant diagnostics. */
import type { Context } from '@deepseek-ai/cordis';
import { HarnessError } from '@deepseek-ai/dsh-llm';
/** Stable package failure codes exposed across tool, command, and Remote boundaries. */
export type WorkflowPackageErrorCode = 'WORKFLOW_INCOMPATIBLE_HOST' | 'WORKFLOW_REGISTRY_DISABLED' | 'WORKFLOW_DEFINITION_INVALID' | 'WORKFLOW_STORAGE_OWNED' | 'WORKFLOW_STORAGE_UNSUPPORTED' | 'WORKFLOW_STORAGE_UNSAFE' | 'WORKFLOW_STORAGE_CORRUPT' | 'WORKFLOW_STORAGE_LIMIT' | 'WORKFLOW_RUN_NOT_FOUND' | 'WORKFLOW_RUN_NOT_OWNED' | 'WORKFLOW_INVALID_STATE' | 'WORKFLOW_STALE_REVISION' | 'WORKFLOW_LIMIT' | 'WORKFLOW_CURSOR_INVALID';
/** Package-owned error retaining Harness's machine-routable error identity. */
export declare class WorkflowPackageError extends HarnessError {
    readonly code: WorkflowPackageErrorCode;
    constructor(message: string, code: WorkflowPackageErrorCode, options?: ErrorOptions);
}
/** Return diagnostics for the package's registry/storage lifecycle invariants. */
export declare function checkWorkflowRegistryStorageInvariant(state: unknown): readonly string[];
/**
 * Runtime-invariant companion hook.
 *
 * The package keeps this entrypoint side-effect free when the optional official
 * invariant registry is not part of a profile. Lifecycle ownership checks are
 * enforced by the concrete components and their tests.
 */
export declare function applyInvariant(ctx: Context): void;
//# sourceMappingURL=invariant.d.ts.map