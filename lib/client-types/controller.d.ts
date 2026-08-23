import type { ClientAgentCatalog, WorkflowRemoteClient, WorkflowRunsSource, WorkflowRunsSourceSnapshot, WorkflowRunAction, WorkflowRunArtifactChunk, WorkflowRunArtifactPage, WorkflowRunDetail, WorkflowRunLogPage, WorkflowRunMemberDetail, WorkflowRunMemberPage, WorkflowRunResultView, WorkflowRunControlResult, WorkflowRunsOperations } from './contract.js';
/**
 * Stock Harness does not expose the optional workflow invalidation event lane.
 * Keep the currently observed dashboard Session live without allowing a slow
 * request to build up an interval backlog.
 */
export declare const WORKFLOW_RUN_POLL_INTERVAL_MS = 2000;
type Change = {
    readonly kind: 'invalidate-all';
} | {
    readonly kind: 'invalidate';
    readonly sessionId: string;
    readonly revision: number;
};
/** Lazy, revision-fenced browser source for retained workflow runs. */
export declare class WorkflowRunsController implements WorkflowRunsOperations {
    private readonly connection?;
    private readonly states;
    /** Exact workflowRuns namespace. The client plugin replaces its empty
     * pre-mount transport with root.get('remote.workflowRuns'). */
    private remoteNamespace;
    private readonly agents?;
    private connectionGeneration;
    private connected;
    private observed?;
    private disposed;
    private pollTimer?;
    private pollGeneration;
    private pollFlightGeneration?;
    constructor(remote: WorkflowRemoteClient, agents?: ClientAgentCatalog, connection?: {
        readonly rpc?: {
            call(channel: string, endpoint: string, payload: unknown, signal?: AbortSignal): Promise<unknown>;
        };
    } | undefined);
    /** Replace the transport with the exact mounted workflowRuns namespace. */
    setRemote(remote: any): void;
    /** Access the exact namespace; never traverse remote.workflowRuns through a
     * traced aggregate (Cordis requires an explicit nested inject for that). */
    private get remote();
    private state;
    get(sessionId: string): WorkflowRunsSourceSnapshot;
    source(sessionId: string): WorkflowRunsSource;
    subscribe(sessionId: string, listener: (snapshot: WorkflowRunsSourceSnapshot) => void): () => void;
    observe(sessionId: string | undefined): void;
    private clearPollTimer;
    /**
     * Chain polls after settlement rather than using setInterval: a hung or slow
     * transport owns at most one poll wait, while refresh() still coalesces an
     * event-driven invalidation landing during that wait.
     */
    private schedulePoll;
    private publish;
    private request;
    private retire;
    private call;
    /** Stock may leave the typed stub unmounted; the Host still serves namespace/method over /api. */
    private callRpc;
    refresh(sessionId: string, supplied?: AbortSignal): Promise<WorkflowRunsSourceSnapshot>;
    private refreshWithMode;
    loadMore(sessionId: string, supplied?: AbortSignal): Promise<WorkflowRunsSourceSnapshot>;
    private read;
    detail(sessionId: string, runId: string, signal?: AbortSignal): Promise<WorkflowRunDetail>;
    members(sessionId: string, runId: string, cursor?: string, signal?: AbortSignal): Promise<WorkflowRunMemberPage>;
    memberDetail(sessionId: string, runId: string, memberId: string, signal?: AbortSignal): Promise<WorkflowRunMemberDetail>;
    logs(sessionId: string, runId: string, cursor?: string, signal?: AbortSignal): Promise<WorkflowRunLogPage>;
    result(sessionId: string, runId: string, signal?: AbortSignal): Promise<WorkflowRunResultView>;
    artifacts(sessionId: string, runId: string, cursor?: string, signal?: AbortSignal): Promise<WorkflowRunArtifactPage>;
    artifact(sessionId: string, runId: string, name: string, cursor?: string, expectedRevision?: number, signal?: AbortSignal): Promise<WorkflowRunArtifactChunk>;
    control(sessionId: string, runId: string, action: WorkflowRunAction, expectedRevision: number, signal?: AbortSignal): Promise<WorkflowRunControlResult>;
    handleChange(change: Change): void;
    handleDisconnected(): void;
    /** Fence an explicit connection/reset even when description loss was not observed. */
    handleReset(): void;
    handleConnected(): void;
    removeSession(sessionId: string): void;
    resolveAndOpenChild(parentSessionId: string, childSessionId: string): Promise<boolean>;
    dispose(): void;
    /** Compatibility names used by early package consumers. */
    invalidate(change: Change): void;
    reconnecting(): void;
}
export default WorkflowRunsController;
//# sourceMappingURL=controller.d.ts.map