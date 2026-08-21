import type { FsPrivateDirectory } from './private-root.js';
export type BoundedFileErrorCode = 'WORKFLOW_STORAGE_UNSAFE' | 'WORKFLOW_STORAGE_LIMIT' | 'WORKFLOW_STORAGE_CORRUPT' | 'WORKFLOW_STORAGE_UNSUPPORTED' | 'WORKFLOW_STORAGE_OWNED' | 'WORKFLOW_RUN_NOT_FOUND' | 'WORKFLOW_STALE_REVISION';
export declare class BoundedFileError extends Error {
    readonly code: BoundedFileErrorCode;
    constructor(message: string, code?: BoundedFileErrorCode, options?: ErrorOptions);
}
/** Structural equivalents of the compatible Host filesystem write vocabulary. */
export type OwnedFileWriteIntent = {
    readonly kind: 'createIfAbsent';
} | {
    readonly kind: 'replaceIfVersion';
    readonly version: unknown;
};
export interface OwnedFileWriteOutcome {
    readonly operation: string;
    readonly version: unknown;
    readonly before: unknown;
    readonly after: unknown;
}
/** Validate a value before it is used as a descriptor-relative component. */
export declare function assertSafeComponent(value: string, label?: string): string;
/** Read through a retained private-directory authority with a fixed byte cap. */
export declare function readOwnedRegularFile(directory: FsPrivateDirectory, name: string, options: {
    readonly maxBytes: number;
    readonly signal?: AbortSignal;
}): Promise<Uint8Array>;
/** Publish through the compatible Host's guarded private-directory operation. */
export declare function writeOwnedFileAtomic(directory: FsPrivateDirectory, name: string, bytes: Uint8Array, options: {
    readonly maxBytes: number;
    readonly expected: OwnedFileWriteIntent;
    readonly signal?: AbortSignal;
}): Promise<OwnedFileWriteOutcome>;
/** Legacy path-shaped bounded read, retained for compatibility with early consumers. */
export declare function readBoundedUtf8(path: string, maxBytes: number): Promise<string>;
/** Legacy path-shaped atomic publication with fsync and final-component checks. */
export declare function writeBoundedAtomic(path: string, content: string, options: {
    readonly maxBytes: number;
    readonly mode?: number;
    readonly createOnly?: boolean;
}): Promise<void>;
//# sourceMappingURL=bounded-file.d.ts.map