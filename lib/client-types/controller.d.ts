import type { ClientAgentCatalog, WorkflowRemoteClient, WorkflowRunsSource, WorkflowRunsSourceSnapshot, WorkflowRunAction, WorkflowRunArtifactChunk, WorkflowRunArtifactPage, WorkflowRunDetail, WorkflowRunLogPage, WorkflowRunMemberDetail, WorkflowRunMemberPage, WorkflowRunResultView, WorkflowRunControlResult, WorkflowRunsOperations } from './contract.js';
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
    private readonly parentRemote;
    private readonly agents?;
    private connectionGeneration;
    private connected;
    private observed?;
    private disposed;
    constructor(remote: WorkflowRemoteClient, agents?: ClientAgentCatalog, connection?: {
        readonly rpc?: {
            call(channel: string, endpoint: string, payload: unknown, signal?: AbortSignal): Promise<unknown>;
        };
    } | undefined);
    /** Resolve after typert $mount; construction may run before the namespace exists. */
    private get remote();
    private state;
    get(sessionId: string): WorkflowRunsSourceSnapshot;
    source(sessionId: string): WorkflowRunsSource;
    subscribe(sessionId: string, listener: (snapshot: WorkflowRunsSourceSnapshot) => void): () => void;
    observe(sessionId: string | undefined): void;
    private publish;
    private request;
    private retire;
    private call;
    /** Stock may leave the typed stub unmounted; the Host still serves namespace/method over /api. */
    private callRpc;
    refresh(sessionId: string, supplied?: AbortSignal): Promise<WorkflowRunsSourceSnapshot>;
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