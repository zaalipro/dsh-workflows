import type { FileHandle } from 'node:fs/promises';
export interface WorkflowStorageAnchor {
    readonly root: string;
    readonly anchorPath: string;
    readonly file: FileHandle;
    readonly rootFile: FileHandle;
    readonly rootIdentity: {
        readonly dev: number;
        readonly ino: number;
    };
    readonly identity: {
        readonly dev: number;
        readonly ino: number;
    };
    assertCurrent(signal?: AbortSignal): Promise<void>;
    close(): Promise<void>;
}
export interface WorkflowStorageLease {
    readonly anchor: WorkflowStorageAnchor;
    assertCurrent(signal?: AbortSignal): Promise<void>;
    release(): Promise<void>;
}
export interface WorkflowStorageLockAdapter {
    readonly tryLock: (fd: number) => boolean;
    readonly unlock: (fd: number) => void;
}
/** Open and identity-pin the owner-only runs root and permanent lock anchor. */
export declare function openWorkflowStorageAnchor(options: {
    readonly runsRoot: string;
    readonly signal?: AbortSignal;
}): Promise<WorkflowStorageAnchor>;
/** Acquire the native cooperating-process lifetime lease. */
export declare function acquireWorkflowStorageLease(anchor: WorkflowStorageAnchor, signal?: AbortSignal, adapter?: WorkflowStorageLockAdapter): Promise<WorkflowStorageLease>;
//# sourceMappingURL=lease.d.ts.map