import type { RegistryConfig, WorkflowCatalogSnapshot, WorkflowDefinition, WorkflowDefinitionEnvelope, WorkflowDefinitionSummary, WorkflowLookupOptions, WorkflowSaveOptions } from './types.js';
export * from './types.js';
export * from './names.js';
export * from './definition.js';
export * from './roots.js';
export * from './watchers.js';
/** Stable package error for malformed/unsafe registry observations. */
export declare class WorkflowRegistryError extends Error {
    readonly code: string;
    constructor(message: string, code?: string, options?: ErrorOptions);
}
interface HostDirectory {
    openDirectory?: (name: string, signal?: AbortSignal) => Promise<HostDirectory>;
    readBytes: (name: string, signal: AbortSignal | undefined, maxBytes: number) => Promise<Uint8Array>;
    writeText: (name: string, content: string, expected: HostWriteIntent, signal?: AbortSignal) => Promise<unknown>;
    assertIdentity(signal?: AbortSignal): Promise<void>;
    close(): Promise<void>;
}
type HostWriteIntent = {
    readonly kind: 'createIfAbsent';
} | {
    readonly kind: 'replaceIfVersion';
    readonly version: unknown;
};
interface HostFileSystem {
    resolve(path: string, options?: {
        cwd?: string;
        signal?: AbortSignal;
    }): Promise<unknown>;
    processPath?: (target: unknown) => string;
    contains(parent: unknown, child: unknown): boolean;
    lstat(path: string, options?: {
        cwd?: string;
    }, signal?: AbortSignal): Promise<{
        readonly type: string;
        readonly size?: number;
        readonly version?: unknown;
    } | undefined>;
    stat(target: unknown, signal?: AbortSignal): Promise<{
        readonly type: string;
        readonly version: unknown;
    } | undefined>;
    listDir(target: unknown, signal?: AbortSignal): Promise<readonly {
        readonly name: string;
        readonly type: string;
        readonly target?: unknown;
    }[]>;
    readBytesNoFollow(path: string, options: {
        cwd?: string;
    }, signal: AbortSignal | undefined, maxBytes: number): Promise<Uint8Array>;
    writeTextNoFollow?: (path: string, options: {
        cwd?: string;
    }, content: string, expected: HostWriteIntent, signal?: AbortSignal) => Promise<unknown>;
    openPrivateDirectory?: (path: string, options: {
        cwd?: string;
        create?: boolean;
    }, signal?: AbortSignal) => Promise<HostDirectory>;
}
interface RegistryContext {
    fs?: HostFileSystem;
    emit?: (event: string, ...args: unknown[]) => void;
    logger?: {
        warn(...args: unknown[]): void;
    };
}
/** Saved-definition registry. Host capability I/O is authoritative when supplied. */
export declare class WorkflowRegistry {
    static readonly inject: readonly ["fs"];
    readonly config: Required<Pick<RegistryConfig, 'enabled' | 'definitionWatch' | 'definitionMaxBytes' | 'maxDefinitionsPerRoot' | 'watchMaxProjects' | 'watchStabilityThresholdMs' | 'watchPollIntervalMs'>> & RegistryConfig;
    private readonly ctx?;
    private readonly dshHome;
    private readonly fs?;
    private readonly watchers?;
    private revision;
    private disposed;
    private watcherGeneration;
    constructor(ctxOrConfig?: RegistryContext | RegistryConfig, config?: RegistryConfig);
    private roots;
    private ensureWatchers;
    private discoverRoot;
    private requireLookupCwd;
    /** List all winning definitions, sorted by UTF-16 code units. */
    list(options?: WorkflowLookupOptions): Promise<readonly WorkflowDefinitionSummary[]>;
    /** Return a bounded catalog snapshot; complete is false if a watcher raced it. */
    snapshot(options?: WorkflowLookupOptions): Promise<WorkflowCatalogSnapshot>;
    /** Resolve one full winning definition (script is never exposed by list). */
    get(name: string, options?: WorkflowLookupOptions): Promise<WorkflowDefinition | undefined>;
    /**
     * Save a canonical definition through the Host descriptor capability. The
     * guarded local path is also the stock RC2 compatibility seam when its Host
     * filesystem does not expose retained private-directory descriptors.
     */
    save(envelope: WorkflowDefinitionEnvelope, options: WorkflowSaveOptions): Promise<WorkflowDefinition>;
    private saveHost;
    private saveLocal;
    private emitChange;
    /** Await watcher teardown; no late callback can publish a change hint. */
    dispose(): Promise<void>;
}
//# sourceMappingURL=index.d.ts.map