import type { WorkflowStorageAnchor, WorkflowStorageLease } from './lease.js';
export interface PrivateDirectory {
    readonly path: string;
    /** Open a direct child directory while retaining this capability as an ancestor. */
    openDirectory(name: string, signal?: AbortSignal, options?: {
        readonly create?: boolean;
    }): Promise<PrivateDirectory>;
    /** List direct children without reading their contents. */
    readonly listEntries?: (signal?: AbortSignal) => Promise<readonly PrivateDirectoryEntry[]>;
    /** Read the current no-follow metadata for one direct child. */
    readonly fileInfo?: (name: string, signal?: AbortSignal) => Promise<PrivateFileIdentity | undefined>;
    /** Remove one direct regular file after an optional identity check. */
    readonly removeFile?: (name: string, expected?: unknown, signal?: AbortSignal) => Promise<void>;
    /** Remove one now-empty direct directory after an identity check. */
    readonly removeDirectory?: (name: string, expected?: unknown, signal?: AbortSignal) => Promise<void>;
    /** Atomically publish a direct child directory into another retained
     * directory capability without following either parent. */
    readonly publishDirectory?: (name: string, target: PrivateDirectory, targetName: string, signal?: AbortSignal) => Promise<void>;
    readBytes(name: string, signal: AbortSignal | undefined, maxBytes: number): Promise<Uint8Array>;
    writeText(name: string, content: string, expected: {
        readonly kind: 'createIfAbsent' | 'replaceIfVersion';
        readonly version?: unknown;
    }, signal?: AbortSignal): Promise<{
        readonly operation: string;
        readonly version: unknown;
        readonly before: unknown;
        readonly after: unknown;
    }>;
    assertIdentity(signal?: AbortSignal): Promise<void>;
    close(): Promise<void>;
}
export type FsPrivateDirectory = PrivateDirectory;
/** Minimal compatible H filesystem face used by the package.  It is kept
 * structural so the package does not duplicate the official DSH filesystem
 * runtime identity. */
export interface HostPrivateDirectoryProvider {
    openPrivateDirectory(path: string, options: {
        readonly cwd?: string;
        readonly create?: boolean;
    }, signal?: AbortSignal): Promise<{
        /** H's required relative child opener.  Future providers may expose an
         * opaque target on the returned object; it is used for descriptor-rooted
         * listing and is never interpreted by the package. */
        openDirectory(name: string, signal?: AbortSignal, options?: {
            readonly create?: boolean;
        }): Promise<unknown>;
        readBytes(name: string, signal: AbortSignal | undefined, maxBytes: number): Promise<Uint8Array>;
        writeText(name: string, content: string, expected: unknown, signal?: AbortSignal): Promise<unknown>;
        assertIdentity(signal?: AbortSignal): Promise<void>;
        close(): Promise<void>;
        readonly target?: unknown;
        readonly listEntries?: (signal?: AbortSignal) => Promise<readonly {
            readonly name: string;
            readonly type: string;
            readonly version?: unknown;
            readonly size?: number;
            readonly nlink?: number;
        }[]>;
        readonly fileInfo?: (name: string, signal?: AbortSignal) => Promise<PrivateFileIdentity | undefined>;
        readonly removeFile?: (name: string, expected?: unknown, signal?: AbortSignal) => Promise<void>;
        readonly removeDirectory?: (name: string, expected?: unknown, signal?: AbortSignal) => Promise<void>;
        readonly publishDirectory?: (name: string, target: unknown, targetName: string, signal?: AbortSignal) => Promise<void>;
    }>;
    resolve?(path: string, options?: {
        readonly cwd?: string;
        readonly signal?: AbortSignal;
    }): Promise<unknown>;
    /** Descriptor-rooted child creation/metadata seams.  These consume opaque
     * retained targets; a lexical path is never accepted as their authority. */
    openPrivateDirectoryChild?(parent: unknown, name: string, options?: {
        readonly create?: boolean;
    }, signal?: AbortSignal): Promise<unknown>;
    fileInfoChild?(parent: unknown, name: string, signal?: AbortSignal): Promise<PrivateFileIdentity | undefined>;
    listDir?(target: unknown, signal?: AbortSignal): Promise<readonly {
        readonly name: string;
        readonly type: string;
        readonly version?: unknown;
        readonly size?: number;
        readonly nlink?: number;
    }[]>;
    /** Optional provider-level directory publication/removal seams.  H's
     * minimum public capability does not expose these operations; callers must
     * fail closed when neither the capability nor one of these equivalent
     * provider primitives is present. */
    publishDirectory?(sourceParent: unknown, name: string, targetParent: unknown, targetName: string, signal?: AbortSignal): Promise<void>;
    removeFile?(target: unknown, name: string, expected?: unknown, signal?: AbortSignal): Promise<void>;
    removeDirectory?(target: unknown, name: string, expected?: unknown, signal?: AbortSignal): Promise<void>;
    lstat?(path: string, options?: {
        readonly cwd?: string;
    }, signal?: AbortSignal): Promise<{
        readonly type: string;
        readonly version?: unknown;
        readonly size?: number;
        readonly nlink?: number;
    } | undefined>;
    /** Test-only compatibility switch for pre-H structural fixtures.  Real H
     * providers must expose an opaque child primitive instead. */
    readonly allowLegacyPathFallback?: boolean;
}
export interface PrivateDirectoryEntry {
    readonly name: string;
    readonly type: 'file' | 'directory' | 'symlink' | 'other';
    readonly identity?: PrivateFileIdentity;
}
/** Metadata used for guarded publication and post-I/O identity checks. */
export interface PrivateFileIdentity {
    readonly dev: number;
    readonly ino: number;
    readonly size: number;
    readonly mtimeMs: number;
    readonly ctimeMs: number;
    readonly mode: number;
    readonly nlink: number;
    readonly uid?: number;
    /** Provider-specific guarded-write version (opaque to the package). */
    readonly version?: unknown;
}
export interface WorkflowStorageLayout {
    readonly anchor: WorkflowStorageAnchor;
    /** Retained root capability.  It must outlive every category capability. */
    readonly root: PrivateDirectory;
    /** Design spelling retained as an alias for consumers of the upstream seam. */
    readonly rootDirectory: PrivateDirectory;
    readonly lease: WorkflowStorageLease;
    readonly sessions: PrivateDirectory;
    readonly runs: PrivateDirectory;
    readonly staging: PrivateDirectory;
    readonly quarantine: PrivateDirectory;
}
/** Close every layout descriptor, retaining the first failure. */
export declare function closeWorkflowStorageLayout(layout: WorkflowStorageLayout): Promise<void>;
/** Open one owner-only private directory and pin its descriptor identity. */
export declare function openPrivateDirectory(path: string, create?: boolean): Promise<PrivateDirectory>;
export declare function openVerifiedRunDirectory(layout: WorkflowStorageLayout, runDirectory: string): Promise<{
    readonly id: string;
    readonly directory: PrivateDirectory;
    readonly scriptPath: string;
    assertIdentity(): Promise<void>;
}>;
export declare function initializePrivateLayout(anchor: WorkflowStorageAnchor, lease: WorkflowStorageLease, hostFileSystem?: HostPrivateDirectoryProvider): Promise<WorkflowStorageLayout>;
/** Alias using the name from the storage design. */
export declare const initializeLeasedWorkflowStorage: typeof initializePrivateLayout;
//# sourceMappingURL=private-root.d.ts.map