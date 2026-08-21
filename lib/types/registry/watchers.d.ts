import type { WorkflowRoot } from './roots.js';
export interface ChokidarHandle {
    on(event: 'all', listener: (event: string, path: string) => void): this;
    close(): void | Promise<void>;
}
export type ChokidarWatchOptions = {
    readonly ignoreInitial: boolean;
    readonly usePolling: boolean;
    readonly interval: number;
    readonly depth: 0;
    readonly followSymlinks: false;
};
export type ChokidarFactory = (paths: string | readonly string[], options: ChokidarWatchOptions) => ChokidarHandle;
export interface WorkflowWatcherScheduler {
    schedule(callback: () => void, delayMs: number): unknown;
    cancel(handle: unknown): void;
}
export interface WorkflowDefinitionWatcherOptions {
    readonly maxProjects?: number;
    readonly usePolling?: boolean;
    readonly stabilityThresholdMs?: number;
    readonly pollIntervalMs?: number;
    readonly watchFactory?: ChokidarFactory;
    readonly scheduler?: WorkflowWatcherScheduler;
    readonly logger?: {
        warn(...args: unknown[]): void;
    };
}
/** Bounded, generation-fenced chokidar ownership for workflow roots. */
export declare class WorkflowDefinitionWatchers {
    private readonly onChange;
    private readonly options;
    private readonly factory;
    private readonly clock;
    private readonly logger?;
    private readonly permanent;
    private readonly projects;
    private readonly pending;
    private chain;
    private timer;
    private ticks;
    private generationValue;
    private dead;
    private ending?;
    constructor(onChange: () => void, options?: WorkflowDefinitionWatcherOptions);
    constructor(options: WorkflowDefinitionWatcherOptions & {
        onChange: () => void;
    });
    get generation(): number;
    get projectCount(): number;
    observeProject(projectRoot: string, roots: readonly WorkflowRoot[]): Promise<void>;
    dispose(): Promise<void>;
    private enqueue;
    private create;
    private live;
    private coalesce;
    private close;
}
export interface DefinitionWatcher {
    readonly roots: readonly WorkflowRoot[];
    readonly generation: number;
    dispose(): Promise<void>;
}
export declare function createDefinitionWatcher(roots: readonly WorkflowRoot[], onChange: () => void, options?: {
    maxProjects?: number;
    polling?: boolean;
    stabilityThresholdMs?: number;
    pollIntervalMs?: number;
}): DefinitionWatcher;
//# sourceMappingURL=watchers.d.ts.map