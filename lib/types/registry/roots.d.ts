import { type PlatformPath } from 'node:path';
import type { WorkflowScope } from './types.js';
/** Minimum execution-world filesystem seam needed while locating a project. */
export interface WorkflowRootFileSystem {
    lstat(path: string, options?: {
        cwd?: string;
    }, signal?: AbortSignal): Promise<{
        readonly type: string;
    } | undefined>;
    resolve?(path: string, options?: {
        cwd?: string;
        signal?: AbortSignal;
    }): Promise<unknown>;
    contains?(parent: unknown, child: unknown): boolean;
}
/** One saved-definition root and the scope boundary which authorizes it. */
export interface WorkflowRoot {
    readonly scope: WorkflowScope;
    readonly path: string;
    readonly basePath: string;
    readonly projectRoot?: string;
}
/** Select path operations from execution-world spelling, not the Host OS. */
export declare function workflowPathApi(path: string): PlatformPath;
/**
 * Walk upward in the execution filesystem to the nearest regular `.git` file
 * or directory. When no marker exists, return the original normalized cwd.
 */
export declare function findWorkflowProjectRoot(fileSystem: WorkflowRootFileSystem, cwd: string, signal?: AbortSignal): Promise<string>;
/**
 * Compatibility helper which uses the local process only for `.git` marker
 * discovery. Registry I/O itself never uses this adapter; it always supplies
 * the compatible Host filesystem capability.
 */
export declare function findProjectRoot(cwd: string, signal?: AbortSignal): Promise<string>;
/** Resolve bundled, project, and user roots in fixed first-wins order. */
export declare function resolveWorkflowRoots(options: {
    readonly fileSystem?: WorkflowRootFileSystem;
    readonly cwd?: string;
    readonly dshHome: string;
    readonly bundledDefinitionsDir?: string;
    readonly signal?: AbortSignal;
}): Promise<readonly WorkflowRoot[]>;
//# sourceMappingURL=roots.d.ts.map