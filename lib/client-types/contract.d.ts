/** Browser-only copy of the generated Remote data contract. No Host imports. */
export type JsonValue = null | boolean | number | string | readonly JsonValue[] | {
    readonly [key: string]: JsonValue;
};
export type ClientRunStatus = 'running' | 'pausing' | 'stopping' | 'needs-input' | 'paused' | 'budget-limited' | 'completed' | 'failed' | 'cancelled' | 'interrupted';
export type WorkflowRunAction = 'pause' | 'resume' | 'stop' | 'save';
export type WorkflowRunOutcomeState = 'pending' | 'available' | 'not-produced' | 'evicted';
export interface WorkflowRunTerminalSummary {
    readonly stopReason: 'completed' | 'cancelled' | 'error' | 'interrupted';
    readonly resultState: Exclude<WorkflowRunOutcomeState, 'pending'>;
    readonly preview?: string;
    readonly error?: string;
}
export interface WorkflowRunHead {
    readonly runId: string;
    readonly displayName: string;
    readonly name: string;
    readonly description: string;
    readonly status: ClientRunStatus;
    readonly phase?: string;
    readonly budget: {
        readonly total: number;
        readonly spent: number;
        readonly remaining: number;
    };
    readonly memberCounts: {
        readonly total: number;
        readonly running: number;
        readonly completed: number;
        readonly failed: number;
        readonly cancelled: number;
    };
    readonly startedAt: number;
    readonly settledAt?: number;
    readonly terminal?: WorkflowRunTerminalSummary;
    readonly allowedActions: readonly WorkflowRunAction[];
    readonly revision: number;
    readonly detailRevision: number;
    readonly membersRevision: number;
    readonly logsRevision: number;
    readonly resultRevision: number;
    readonly artifactsRevision: number;
}
export interface WorkflowRunDetail {
    readonly run: WorkflowRunHead;
    readonly phases?: readonly {
        readonly title: string;
        readonly detail?: string;
        readonly provider?: string;
        readonly model?: string;
    }[];
    readonly gate?: {
        readonly kind: string;
        readonly message: string;
        readonly resumable: boolean;
    };
    readonly error?: string;
}
export interface WorkflowRunMemberHead {
    readonly memberId: string;
    readonly seq: number;
    readonly label: string;
    readonly phase?: string;
    readonly status: 'running' | 'completed' | 'failed' | 'cancelled';
    readonly startedAt?: number;
    readonly settledAt?: number;
    readonly outcome: WorkflowRunOutcomeState;
    readonly childSessionId?: string;
}
export type WorkflowRunValueView = {
    readonly state: 'pending' | 'not-produced' | 'evicted';
} | {
    readonly state: 'available';
    readonly content: {
        readonly kind: 'value';
        readonly value: JsonValue;
    } | {
        readonly kind: 'preview';
        readonly text: string;
    };
    readonly totalBytes: number;
    readonly truncated: boolean;
};
export interface WorkflowRunMemberPage {
    readonly items: readonly WorkflowRunMemberHead[];
    readonly nextCursor?: string;
    readonly total: number;
    readonly revision: number;
}
export interface WorkflowRunMemberDetail {
    readonly member: WorkflowRunMemberHead;
    readonly childSessionId?: string;
    readonly outcome: WorkflowRunValueView;
}
export interface WorkflowRunLogPage {
    readonly items: readonly {
        readonly index: number;
        readonly text: string;
    }[];
    readonly nextCursor?: string;
    readonly evicted: number;
    readonly total: number;
    readonly revision: number;
}
export interface WorkflowRunResultView {
    readonly value: WorkflowRunValueView;
    readonly error?: string;
    readonly revision: number;
}
export interface WorkflowRunArtifactPage {
    readonly items: readonly {
        readonly name: string;
        readonly bytes: number;
    }[];
    readonly nextCursor?: string;
    readonly omitted: number;
    readonly total: number;
    readonly revision: number;
}
export interface WorkflowRunArtifactChunk {
    readonly artifact: {
        readonly name: string;
        readonly bytes: number;
    };
    readonly text: string;
    readonly offsetBytes: number;
    readonly returnedBytes: number;
    readonly totalBytes: number;
    readonly revision: number;
    readonly nextCursor?: string;
}
export interface WorkflowRunControlResult {
    readonly run: WorkflowRunHead;
}
export type WorkflowRemoteFailureCode = 'invalid-page-limit' | 'invalid-artifact-limit' | 'invalid-cursor' | 'stale-cursor' | 'workspace-unavailable' | 'definition-invalid' | 'run-not-found' | 'member-not-found' | 'artifact-not-found' | 'artifact-changed' | 'revision-conflict' | 'action-unavailable' | 'storage-unavailable';
export interface WorkflowRunsSourceSnapshot {
    readonly sessionId: string;
    readonly phase: 'idle' | 'loading' | 'ready' | 'error' | 'reconnecting';
    readonly runs: readonly WorkflowRunHead[];
    readonly total: number;
    readonly nextCursor?: string;
    readonly epoch?: string;
    readonly sessionRevision?: number;
    readonly error?: string;
    /** Compatibility aliases used by early package consumers. */
    readonly status: 'idle' | 'loading' | 'ready' | 'error' | 'reconnecting';
    readonly revision: number;
}
export interface WorkflowRunsSource {
    getSnapshot(): WorkflowRunsSourceSnapshot;
    subscribe(listener: () => void): () => void;
}
export interface WorkflowRemoteClient {
    readonly [method: string]: ((...args: any[]) => Promise<unknown>) | unknown;
}
export interface ClientAgentCatalog {
    readonly list?: {
        getSnapshot(): any;
        subscribe?(listener: () => void): () => void;
    };
    readonly sessions?: any;
}
export interface WorkflowDefinitionCard {
    readonly name: string;
    readonly description: string;
    readonly whenToUse?: string;
    readonly scope?: string;
}
export interface WorkflowCatalogOperations {
    listDefinitions(sessionId: string, signal?: AbortSignal): Promise<readonly WorkflowDefinitionCard[]>;
    launchDefinition(sessionId: string, name: string, signal?: AbortSignal): Promise<void>;
}
export interface WorkflowRunsOperations {
    observe(sessionId: string | undefined): void;
    source(sessionId: string): WorkflowRunsSource;
    refresh(sessionId: string, signal?: AbortSignal): Promise<WorkflowRunsSourceSnapshot>;
    loadMore(sessionId: string, signal?: AbortSignal): Promise<WorkflowRunsSourceSnapshot>;
    detail(sessionId: string, runId: string, signal?: AbortSignal): Promise<WorkflowRunDetail>;
    members(sessionId: string, runId: string, cursor?: string, signal?: AbortSignal): Promise<WorkflowRunMemberPage>;
    memberDetail(sessionId: string, runId: string, memberId: string, signal?: AbortSignal): Promise<WorkflowRunMemberDetail>;
    logs(sessionId: string, runId: string, cursor?: string, signal?: AbortSignal): Promise<WorkflowRunLogPage>;
    result(sessionId: string, runId: string, signal?: AbortSignal): Promise<WorkflowRunResultView>;
    artifacts(sessionId: string, runId: string, cursor?: string, signal?: AbortSignal): Promise<WorkflowRunArtifactPage>;
    artifact(sessionId: string, runId: string, name: string, cursor?: string, expectedRevision?: number, signal?: AbortSignal): Promise<WorkflowRunArtifactChunk>;
    control(sessionId: string, runId: string, action: WorkflowRunAction, expectedRevision: number, signal?: AbortSignal): Promise<WorkflowRunControlResult>;
    resolveAndOpenChild(parentSessionId: string, childSessionId: string): Promise<boolean>;
    handleChange(change: {
        readonly kind: 'invalidate-all';
    } | {
        readonly kind: 'invalidate';
        readonly sessionId: string;
        readonly revision: number;
    }): void;
    handleDisconnected(): void;
    handleConnected(): void;
    handleReset(): void;
    removeSession(sessionId: string): void;
    dispose(): void;
}
export declare class WorkflowRunsRemoteError extends Error {
    readonly code: WorkflowRemoteFailureCode;
    readonly details?: Readonly<Record<string, unknown>> | undefined;
    readonly name = "WorkflowRunsRemoteError";
    constructor(code: WorkflowRemoteFailureCode, message: string, details?: Readonly<Record<string, unknown>> | undefined);
}
/** Unwrap both Typert's transport carrier and the package's business carrier. */
export declare function unwrapWorkflowRemoteResult<T>(input: unknown): T;
export type ClientRunHead = WorkflowRunHead;
export type ClientRunSource = WorkflowRunsSourceSnapshot;
//# sourceMappingURL=contract.d.ts.map