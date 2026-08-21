/** Stable observable adapter for the dashboard slot. */
import type { WorkflowRunArtifactChunk, WorkflowRunArtifactPage, WorkflowRunControlResult, WorkflowRunDetail, WorkflowRunLogPage, WorkflowRunMemberDetail, WorkflowRunMemberPage, WorkflowRunResultView, WorkflowRunsOperations, WorkflowRunsSource, WorkflowRunsSourceSnapshot } from './contract.js';
import type { WorkflowRunsController } from './controller.js';
export interface WorkflowRunsControllerFace extends WorkflowRunsOperations {
    get(sessionId: string): WorkflowRunsSourceSnapshot;
    subscribe(sessionId: string, listener: (snapshot: WorkflowRunsSourceSnapshot) => void): () => void;
    source(sessionId: string): WorkflowRunsSource;
}
/**
 * One stable source is exposed to slot consumers. Switching the observed
 * Session swaps the internal subscription without replacing this source.
 */
export type DashboardSource = WorkflowRunsSource & ((sessionId: string) => WorkflowRunsSource);
export declare class DashboardWorkflowRunsAdapter implements Omit<WorkflowRunsOperations, 'source'> {
    private readonly controller;
    private snapshot;
    private readonly listeners;
    private observedSessionId;
    private observedSource;
    private unsubscribe;
    private disposed;
    readonly source: DashboardSource;
    constructor(controller: WorkflowRunsControllerFace | WorkflowRunsController);
    get(sessionId: string): WorkflowRunsSourceSnapshot;
    subscribe(sessionId: string, listener: (snapshot: WorkflowRunsSourceSnapshot) => void): () => void;
    observe(sessionId: string | undefined): void;
    /** Compatibility aliases used by the initial package prototype. */
    show(sessionId: string): void;
    close(): void;
    refresh(...args: Parameters<WorkflowRunsOperations['refresh']>): ReturnType<WorkflowRunsOperations['refresh']>;
    loadMore(...args: Parameters<WorkflowRunsOperations['loadMore']>): ReturnType<WorkflowRunsOperations['loadMore']>;
    detail(...args: Parameters<WorkflowRunsOperations['detail']>): Promise<WorkflowRunDetail>;
    members(...args: Parameters<WorkflowRunsOperations['members']>): Promise<WorkflowRunMemberPage>;
    memberDetail(...args: Parameters<WorkflowRunsOperations['memberDetail']>): Promise<WorkflowRunMemberDetail>;
    logs(...args: Parameters<WorkflowRunsOperations['logs']>): Promise<WorkflowRunLogPage>;
    result(...args: Parameters<WorkflowRunsOperations['result']>): Promise<WorkflowRunResultView>;
    artifacts(...args: Parameters<WorkflowRunsOperations['artifacts']>): Promise<WorkflowRunArtifactPage>;
    artifact(...args: Parameters<WorkflowRunsOperations['artifact']>): Promise<WorkflowRunArtifactChunk>;
    control(...args: Parameters<WorkflowRunsOperations['control']>): Promise<WorkflowRunControlResult>;
    resolveAndOpenChild(...args: Parameters<WorkflowRunsOperations['resolveAndOpenChild']>): Promise<boolean>;
    handleChange(...args: Parameters<WorkflowRunsOperations['handleChange']>): void;
    handleDisconnected(...args: Parameters<WorkflowRunsOperations['handleDisconnected']>): void;
    handleConnected(...args: Parameters<WorkflowRunsOperations['handleConnected']>): void;
    handleReset(...args: Parameters<WorkflowRunsOperations['handleReset']>): void;
    removeSession(...args: Parameters<WorkflowRunsOperations['removeSession']>): void;
    dispose(): void;
    private publish;
}
export default DashboardWorkflowRunsAdapter;
//# sourceMappingURL=adapter.d.ts.map