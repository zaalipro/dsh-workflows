import type { WorkflowDefinition, WorkflowMeta } from '../registry/types.js';
import type { WorkflowRunStore } from './storage/manifest-types.js';
import { type SupervisedWorkflowRunId, type WorkflowGateId, type WorkflowLaunched, type WorkflowRunArtifactChunk, type WorkflowRunArtifactPage, type WorkflowRunArtifactRequest, type WorkflowRunArtifactsRequest, type WorkflowRunDetail, type WorkflowRunHead, type WorkflowRunRecordingSnapshot, type WorkflowRunListPage, type WorkflowRunListRequest, type WorkflowRunLogPage, type WorkflowRunLogsRequest, type WorkflowRunMemberDetail, type WorkflowRunMemberPage, type WorkflowRunMemberRequest, type WorkflowRunMembersRequest, type WorkflowRunResultView, type WorkflowValidation } from './types.js';
export * from './types.js';
export * from './value-view.js';
export * from './completion-notice.js';
export interface SupervisorConfig {
    readonly defaultAgentBudget?: number;
    readonly maxAgentBudget?: number;
    readonly maxConcurrentAgents?: number;
    readonly maxActiveRunsPerSession?: number;
    readonly maxActiveRunsGlobal?: number;
    readonly saveScope?: 'project' | 'user';
    readonly completionNoticeMaxBytes?: number;
    readonly completionCohortMaxItems?: number;
    readonly completionCohortMaxBytes?: number;
    readonly maxConsecutiveCompletionWakes?: number;
    readonly memberOutcomeMaxBytes?: number;
    readonly maxRetainedRunsPerSession?: number;
    readonly maxWorkflowNamesPerSession?: number;
    readonly maxRecoveryEntries?: number;
    readonly maxMembersPerRun?: number;
    readonly maxManifestBytes?: number;
    readonly maxRunDetailsBytes?: number;
    readonly maxRunStoreBytes?: number;
    readonly maxLogLines?: number;
    readonly maxLogLineBytes?: number;
    readonly maxLogTotalBytes?: number;
    readonly maxEventTextBytes?: number;
    readonly remoteHeadTextMaxBytes?: number;
    readonly maxScriptProjectionBytes?: number;
    readonly maxRetainedArtifactsPerRun?: number;
    readonly artifactChunkDefaultBytes?: number;
    readonly artifactChunkMaxBytes?: number;
    readonly scratchMaxOperations?: number;
    readonly scratchMaxPendingOperations?: number;
    readonly scratchMaxFiles?: number;
    readonly scratchMaxFileBytes?: number;
    readonly scratchMaxTotalBytes?: number;
    /** Deprecated spelling retained for early package callers. */
    readonly maxActiveRuns?: number;
}
export interface WorkflowLaunchSpec {
    readonly definition?: WorkflowDefinition;
    readonly script?: string;
    readonly meta?: WorkflowMeta;
    readonly args?: Readonly<Record<string, unknown>>;
    readonly agentBudget?: number;
    readonly parent: any;
    readonly signal?: AbortSignal;
}
export interface WorkflowValidateSpec extends Omit<WorkflowLaunchSpec, 'definition' | 'parent'> {
    readonly definition?: WorkflowDefinition;
    readonly parent?: any;
    readonly filename: string;
}
/** Durable logical-run supervisor backed only by the compatible official engine. */
export declare class WorkflowSupervisor {
    private readonly ctx;
    static readonly inject: readonly ["workflowEngine", "workflows"];
    private readonly config;
    private readonly store;
    private readonly registry?;
    private readonly runs;
    private readonly byDisplay;
    /** Persisted rows recovered after process death have inspection authority
     * but deliberately no executable `InternalRun`/Agent authority. */
    private readonly recoveredById;
    private readonly recoveredByDisplay;
    private readonly executions;
    private readonly sessionRevisions;
    private readonly activeSessions;
    private activeTotal;
    private readonly pendingStarts;
    private readonly closedOwners;
    private readonly ownerDisposals;
    private readonly listenerDisposers;
    private readonly notifier;
    private readonly ownsStore;
    private readonly feedEpoch;
    private initializePromise?;
    private admission;
    private disposed;
    private disposal?;
    constructor(ctx: any, config?: SupervisorConfig, store?: WorkflowRunStore);
    private listen;
    private attachEngineObservers;
    initialize(signal?: AbortSignal): Promise<void>;
    private emit;
    private publishLifecycle;
    private publishChange;
    private enqueue;
    private withAttempt;
    private currentAttempt;
    private info;
    private memberLifecycle;
    private resolveSource;
    private resolveBudget;
    private snapshotArgs;
    private reserveStart;
    private releaseStart;
    private scratchLimits;
    private createScratch;
    /** Admit one run durably, attach a deferred attempt, then return before settlement. */
    start(spec: WorkflowLaunchSpec): Promise<WorkflowLaunched>;
    private createAttempt;
    /** One-shot release is skipped after owner/supervisor teardown or cancel so
     * a racing start/resume cannot Go a cancelled inert attempt. */
    private shouldReleaseAttempt;
    private releaseDeferredAttempt;
    private startObservation;
    private settleAttempt;
    private acceptCheckpoint;
    private clearGate;
    private allowedActions;
    private commitActive;
    private failAfterAdmission;
    private terminalize;
    private resultPayload;
    private displayKey;
    private requireOwned;
    private requireOwnedId;
    private awaitCaller;
    /** Quiesce and durably pause one running attempt. */
    pause(displayName: string, agent: any, signal?: AbortSignal): Promise<WorkflowRunHead>;
    private settleRunningMembers;
    /** Stop one nonterminal run only after attempt and scratch cleanup. */
    stop(displayName: string, agent: any, signal?: AbortSignal): Promise<WorkflowRunHead>;
    /** Resume a paused run or acknowledge its current live gate. */
    resume(displayName: string, agent: any, signal?: AbortSignal): Promise<WorkflowRunHead>;
    resumeById(runId: SupervisedWorkflowRunId, agent: any, higherBudget?: number, signal?: AbortSignal): Promise<WorkflowRunHead>;
    private resumeRecord;
    private replaceGateAttempt;
    /** Acknowledge only the exact still-current gate fence. */
    resumeGate(runId: SupervisedWorkflowRunId, executionId: string, gateId: WorkflowGateId, agent: any, signal?: AbortSignal): Promise<boolean>;
    /** Save a safe, current editable projection without changing live authority. */
    save(displayName: string, agent: any, scope?: 'project' | 'user', signal?: AbortSignal): Promise<string>;
    private publicHead;
    private publicHeadRecord;
    private storedHeadFor;
    private readDetailValue;
    private readAllMembers;
    private memberHead;
    private authorizedHead;
    /** List the authorized Session's retained logical runs. */
    list(agent: any, request?: WorkflowRunListRequest, signal?: AbortSignal): Promise<WorkflowRunListPage>;
    /** Return selected-run metadata after Session authorization. */
    detail(agent: any, runId: SupervisedWorkflowRunId, signal?: AbortSignal): Promise<WorkflowRunDetail>;
    /** Return a bounded retained member page. */
    members(agent: any, request: WorkflowRunMembersRequest, signal?: AbortSignal): Promise<WorkflowRunMemberPage>;
    /** Return one retained member outcome, including JSON null when present. */
    memberDetail(agent: any, request: WorkflowRunMemberRequest, signal?: AbortSignal): Promise<WorkflowRunMemberDetail>;
    /** Return retained log lines with deterministic eviction metadata. */
    logs(agent: any, request: WorkflowRunLogsRequest, signal?: AbortSignal): Promise<WorkflowRunLogPage>;
    /** Return the retained terminal result projection. */
    result(agent: any, runId: SupervisedWorkflowRunId, signal?: AbortSignal): Promise<WorkflowRunResultView>;
    private scanArtifacts;
    /** Refresh and page bounded scratch artifact metadata. */
    artifacts(agent: any, request: WorkflowRunArtifactsRequest, signal?: AbortSignal): Promise<WorkflowRunArtifactPage>;
    /** Read one UTF-8-safe artifact chunk through an opened no-follow handle. */
    artifact(agent: any, request: WorkflowRunArtifactRequest, signal?: AbortSignal): Promise<WorkflowRunArtifactChunk>;
    /** Return one atomic lifecycle projection for the Chat recorder. */
    recordingSnapshot(agent: any, runId: SupervisedWorkflowRunId, signal?: AbortSignal): Promise<WorkflowRunRecordingSnapshot | undefined>;
    /** Wait until work owned by one exact Agent reaches a quiescent fixed point. */
    whenOwnerQuiescent(agent: any, signal?: AbortSignal): Promise<void>;
    /** Close new admission at a synchronous linearization point. */
    closeAdmissionSync(): void;
    /** Compatibility spelling used by lifecycle effects; the close itself is synchronous. */
    closeAdmission(): void;
    private disposeOwner;
    /** Idempotent global teardown with admission, attempts, publications, and notices drained. */
    dispose(): Promise<void>;
    /** Side-effect-free one-path validation through H's dedicated API. */
    validate(spec: WorkflowValidateSpec): Promise<WorkflowValidation>;
    private presentValidation;
}
export default WorkflowSupervisor;
//# sourceMappingURL=index.d.ts.map