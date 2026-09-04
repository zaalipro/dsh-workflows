import type { Context } from '@deepseek-ai/cordis';
import { resolveWorkflowPackageConfig, Config, type Config as WorkflowConfig, type ResolvedWorkflowPackageConfig } from './config.js';
import { WorkflowPackageError, type WorkflowPackageErrorCode, applyInvariant } from './invariant.js';
export { Config, resolveWorkflowPackageConfig, WorkflowPackageError, applyInvariant };
export type { WorkflowConfig, ResolvedWorkflowPackageConfig, WorkflowPackageErrorCode };
export declare const name = "dsh-workflows";
export declare const version = "0.1.0-rc.4";
/** Host services the loader must wait for. Remote events are optional (absent on stock dsh). */
export declare const inject: readonly ["agents", "commands", "fs", "skills", "subagents", "userQuestions", "workflowEngine"];
/** Exact package compatibility contract mirrored from package.json. */
export declare const HOST_COMPATIBILITY: Readonly<{
    host: "@deepseek-ai/dsh";
    versions: readonly ["0.1.2-rc.1"];
    evaluator: "plugin-compat-engine-v1";
}>;
type InstalledHostVersions = readonly [host: unknown, workflow: unknown];
export declare function isSupportedHostVersion(value: unknown): value is '0.1.2-rc.1';
/** Both official workflow seams are lockstep release witnesses. */
export declare function isSupportedHostVersions(hostVersion: unknown, workflowVersion: unknown): boolean;
export declare function assertSupportedHostVersions(hostVersion: unknown, workflowVersion: unknown): void;
/** Exported for executable-identity regression tests and embedders' diagnostics. */
export declare function resolveInstalledHostVersions(entrypoint?: string | undefined): InstalledHostVersions | undefined;
/**
 * Verify both lockstep workflow packages exposed by the running CLI's module
 * graph. Neither a context marker nor service method guessing can widen the
 * package manifest's exact support window.
 */
export declare function isSupportedStockHost(): boolean;
/** True only for the exact official release supported by this artifact. */
export declare function isCompatibleHost(_ctx?: Context | any): boolean;
/** Verify the installed official release before opening plugin storage. */
export declare function assertCompatibleHost(_ctx?: Context | any): void;
/** Compose the complete Host-side workflow product as one lifecycle unit. */
export declare function apply(ctx: Context | any, input?: WorkflowConfig): Promise<void>;
export * from './types.js';
export * from './registry/index.js';
export { WorkflowSupervisor } from './supervisor/index.js';
export type { SupervisorConfig, WorkflowLaunchSpec, WorkflowValidateSpec } from './supervisor/index.js';
export { WorkflowDefinitionsRemote } from './registry/remote.js';
export { WorkflowRunsRemote } from './supervisor/remote.js';
//# sourceMappingURL=index.d.ts.map