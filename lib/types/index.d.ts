import type { Context } from '@deepseek-ai/cordis';
import { resolveWorkflowPackageConfig, Config, type Config as WorkflowConfig, type ResolvedWorkflowPackageConfig } from './config.js';
import { WorkflowPackageError, type WorkflowPackageErrorCode, applyInvariant } from './invariant.js';
export { Config, resolveWorkflowPackageConfig, WorkflowPackageError, applyInvariant };
export type { WorkflowConfig, ResolvedWorkflowPackageConfig, WorkflowPackageErrorCode };
export declare const name = "dsh-workflows";
export declare const version = "0.1.0-rc.1";
/** The exact Host services required by the aggregate. Loader waits for these. */
export declare const inject: readonly ["agents", "commands", "fs", "skills", "userQuestions", "workflowEngine", "apiRemoteEvents"];
/** Manifest `dsh.compatibility` mirrored for the runtime marker check. */
export declare const HOST_COMPATIBILITY: Readonly<{
    release: "H";
    reject: readonly string[];
    verifiedLaterReleases: readonly string[];
}>;
/** Verify H's explicit compatibility declaration before package I/O. */
export declare function assertCompatibleHost(ctx: Context | any): void;
/** Compose the complete Host-side workflow product as one lifecycle unit. */
export declare function apply(ctx: Context | any, input?: WorkflowConfig): Promise<void>;
export * from './types.js';
export * from './registry/index.js';
export { WorkflowSupervisor } from './supervisor/index.js';
export type { SupervisorConfig, WorkflowLaunchSpec, WorkflowValidateSpec } from './supervisor/index.js';
export { WorkflowDefinitionsRemote } from './registry/remote.js';
export { WorkflowRunsRemote } from './supervisor/remote.js';
//# sourceMappingURL=index.d.ts.map