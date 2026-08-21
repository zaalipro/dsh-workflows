import type { PrivateDirectory, WorkflowStorageLayout } from './private-root.js';
export interface ScratchStoreOptions {
    readonly maxOperations: number;
    readonly maxPendingOperations: number;
    readonly maxFiles: number;
    readonly maxFileBytes: number;
    readonly maxTotalBytes: number;
}
export interface WorkflowScratchStore {
    read(name: string, signal?: AbortSignal): Promise<string | undefined>;
    write(name: string, content: string, signal?: AbortSignal): Promise<void>;
    list(signal?: AbortSignal): Promise<readonly string[]>;
    /** Cancel every operation admitted to this logical run.  Cancellation is
     * deliberately separate from dispose so the supervisor can stop scratch
     * traffic before it begins terminal publication. */
    cancel?(reason?: unknown): void;
    dispose(): Promise<void>;
}
export interface WorkflowRunFiles {
    readonly runDirectory: string;
    readonly scriptPath: string;
    readonly script: Uint8Array;
    readonly scratch: WorkflowScratchStore;
    readonly detailsPath: string;
    dispose(): Promise<void>;
}
/** Run-scoped scratch authority with operation, pending, file, and byte quotas. */
export declare class RunScratchStore implements WorkflowScratchStore {
    private readonly limits;
    private operations;
    private pending;
    private closed;
    private initialized;
    private readonly files;
    private total;
    private tail;
    private readonly inflight;
    private readonly lifetime;
    private directory?;
    private readonly path;
    constructor(directoryOrPath: PrivateDirectory | string, limits: ScratchStoreOptions);
    private signal;
    /** Wait for a fixed point.  A single snapshot of `inflight` is not enough:
     * a queued write can settle the same turn that a read's finally-handler is
     * removing itself.  Rechecking the tail, set, and counter prevents list or
     * disposal from inventorying/closing while an admitted operation is still
     * capable of touching scratch. */
    private drain;
    private begin;
    private track;
    private ensureDirectory;
    private inventory;
    read(name: string, supplied?: AbortSignal): Promise<string | undefined>;
    write(name: string, content: string, supplied?: AbortSignal): Promise<void>;
    list(supplied?: AbortSignal): Promise<readonly string[]>;
    cancel(reason?: unknown): void;
    dispose(): Promise<void>;
}
/** Open the scratch component of one already-published run directory. */
export declare function openRunScratch(layout: WorkflowStorageLayout, runDirectory: string, limits: ScratchStoreOptions): Promise<WorkflowScratchStore>;
/** Create an immutable projection and descriptor-rooted run scratch authority. */
export declare function createRunFiles(layout: WorkflowStorageLayout, runDirectory: string, scriptBytes: Uint8Array, limits: ScratchStoreOptions & {
    readonly maxScriptBytes?: number;
}): Promise<WorkflowRunFiles>;
/** Derive a run directory from an exposed script projection without leaking it to the engine. */
export declare function scratchDirectoryFromScriptPath(scriptPath: string): string;
//# sourceMappingURL=run-files.d.ts.map