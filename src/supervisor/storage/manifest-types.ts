/** Version-2 durable workflow vocabulary. */
export type JsonPrimitive = null | boolean | number | string;
export type JsonValue = JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };
export type WorkflowRunManifestText = string;
export type WorkflowRunStatus = 'running'|'pausing'|'stopping'|'needs-input'|'paused'|'budget-limited'|'completed'|'failed'|'cancelled'|'interrupted';
export type WorkflowStopReason = 'completed'|'cancelled'|'error'|'interrupted'|'budget-limited';
export type WorkflowMemberStatus = 'running'|'completed'|'failed'|'cancelled';
export type WorkflowRunOutcomeState = 'pending'|'available'|'not-produced'|'evicted';
export type WorkflowCompletionNoticeState =
 | {readonly state:'none'}
 | {readonly state:'claimed';readonly claimId:string;readonly processEpoch:string;readonly claimedAt:number}
 | {readonly state:'delivered';readonly claimId:string;readonly processEpoch:string;readonly claimedAt:number;readonly finalizedAt:number;readonly lane:'followup'|'inject'}
 | {readonly state:'abandoned';readonly finalizedAt:number;readonly reason:'process-lost'|'owner-disposed'|'enqueue-failed'|'teardown';readonly claimId?:string;readonly processEpoch?:string;readonly claimedAt?:number;readonly error?:WorkflowRunManifestText};
export type WorkflowCompletionNoticeFinalization =
 | {readonly state:'delivered';readonly claimId:string;readonly processEpoch:string;readonly claimedAt:number;readonly finalizedAt:number;readonly lane:'followup'|'inject'}
 | {readonly state:'abandoned';readonly claimId:string;readonly processEpoch:string;readonly claimedAt:number;readonly finalizedAt:number;readonly reason:'owner-disposed'|'enqueue-failed'|'teardown';readonly error?:string};
export interface WorkflowRunDetailReferenceV2 {readonly id:string;readonly bytes:number;readonly sha256:string;readonly snapshotRevision:number}
export interface WorkflowRunMemberDetail {readonly memberId:string;readonly seq:number;readonly label:string;readonly phase?:string;readonly status:WorkflowMemberStatus;readonly outcome:WorkflowRunOutcomeState;readonly value?:JsonValue;readonly childSessionId?:string;readonly startedAt?:number;readonly settledAt?:number}
export interface WorkflowRunLogDetail {readonly index:number;readonly text:string}
export interface WorkflowRunDetailPayloadV2 {readonly members?:readonly WorkflowRunMemberDetail[];readonly logs?:readonly WorkflowRunLogDetail[];readonly result?:{readonly state:WorkflowRunOutcomeState;readonly value?:JsonValue;readonly preview?:string;readonly totalBytes?:number;readonly truncated?:boolean};readonly phases?:readonly {readonly title:string;readonly startedAt?:number;readonly endedAt?:number}[];readonly artifacts?:readonly {readonly name:string;readonly bytes:number}[]}
export interface WorkflowRunDetailSnapshotV2 {readonly version:2;readonly sessionId:string;readonly runId:string;readonly runDirectory:string;readonly detailId:string;readonly snapshotRevision:number;readonly payload:WorkflowRunDetailPayloadV2}
export interface WorkflowRunMemberCounts {readonly total:number;readonly running:number;readonly completed:number;readonly failed:number;readonly cancelled:number}
export interface WorkflowRunHeadRecord {
 readonly runId:string; readonly name:string; readonly displayName:string; readonly numberedHandle:boolean; readonly description?:string; readonly status:WorkflowRunStatus; readonly stopReason?:WorkflowStopReason; readonly error?:string; readonly phase?:string; readonly terminalPreview?:string; readonly budget:{readonly total:number;readonly spent:number;readonly remaining:number}; readonly memberCounts:WorkflowRunMemberCounts; readonly startedAt:number; readonly settledAt?:number; readonly runDirectory:string; readonly revision:number; readonly detail:WorkflowRunDetailReferenceV2; readonly detailRevision:number; readonly membersRevision:number; readonly logsRevision:number; readonly resultRevision:number; readonly artifactsRevision:number; readonly completionNotice:WorkflowCompletionNoticeState; readonly executionAvailable?:boolean; readonly scriptPath?:string; readonly saveAvailable?:boolean; readonly allowedActions?:readonly string[];
}
export interface WorkflowSessionManifest {readonly version:2;readonly sessionId:string;readonly revision:number;readonly nextOrdinal:number;readonly ordinals:readonly {readonly name:string;readonly next:number}[];readonly heads:readonly WorkflowRunHeadRecord[]}
export type WorkflowRunHeadDraftV2 = Omit<WorkflowRunHeadRecord,'runId'|'name'|'displayName'|'numberedHandle'|'runDirectory'|'revision'|'detail'|'completionNotice'> & Partial<Pick<WorkflowRunHeadRecord,'completionNotice'>>;
export interface WorkflowRunIdentity {readonly displayName:string;readonly numberedHandle:boolean;readonly runDirectory:string}
export interface WorkflowStoreOptions {readonly runsRoot:string;readonly maxManifestBytes:number;readonly maxRunDetailsBytes:number;readonly maxRunStoreBytes:number;readonly maxRetainedRunsPerSession:number;readonly maxWorkflowNamesPerSession:number;readonly maxMembersPerRun:number;readonly maxRecoveryEntries:number;readonly maxTerminalResultBytes?:number;readonly memberOutcomeMaxBytes?:number;readonly maxLogLines?:number;readonly maxLogLineBytes?:number}
/**
 * The insertion callback is the durable linearization hook.  A store must call
 * it synchronously after the initial manifest row is committed and before any
 * later best-effort accounting/cleanup work.  This lets a supervisor detach
 * caller cancellation at the exact commit point rather than guessing from a
 * promise's eventual resolution.
 */
export interface WorkflowRunInsertRequest {
 readonly sessionId:string
 readonly name:string
 readonly runId:string
 readonly script:string
 readonly description?:string
 readonly args?:JsonValue
 readonly budgetTotal?:number
 readonly onDurable?:(head: WorkflowRunHeadRecord) => void
}

export interface WorkflowRunArtifactIdentity {
 readonly dev: number
 readonly ino: number
 readonly size: number
 readonly mtimeMs: number
 readonly ctimeMs?: number
 readonly mode?: number
 readonly nlink?: number
 /** Opaque Host-provider freshness token, when POSIX dev/ino metadata is not
  * available. It is never serialized into Remote payloads. */
 readonly version?: unknown
}
export interface WorkflowRunArtifactRecord {
 readonly name: string
 readonly bytes: number
 readonly identity: WorkflowRunArtifactIdentity
}
export interface WorkflowRunArtifactInventory {
 readonly items: readonly WorkflowRunArtifactRecord[]
 readonly total: number
}
export interface WorkflowRunArtifactRead {
 readonly text: string
 readonly offsetBytes: number
 readonly returnedBytes: number
 readonly totalBytes: number
 readonly identity: WorkflowRunArtifactIdentity
}
export interface WorkflowRunCommitRequest {readonly sessionId:string;readonly runId:string;readonly expectedRevision:number;readonly head:Omit<WorkflowRunHeadRecord,'detail'|'completionNotice'>;readonly detail?:WorkflowRunDetailPayloadV2}
export interface WorkflowTerminalCommitRequest extends Omit<WorkflowRunCommitRequest,'head'>{readonly head:Omit<WorkflowRunHeadRecord,'detail'|'completionNotice'>;readonly detail?:WorkflowRunDetailPayloadV2}
export interface DetailReadRequest {
  readonly kind:'members'|'logs'|'result'|'artifacts'|'artifact'
  readonly cursor?:string
  readonly name?:string
  readonly limit?:number
  readonly maxBytes?:number
}
export interface DetailReadResult {
  readonly value:JsonValue
  readonly revision:number
  readonly nextCursor?:string
  /** Total rows before paging for collection reads, otherwise one or zero. */
  readonly total:number
  /** Rows deterministically omitted by retention before the first retained row. */
  readonly omitted?:number
}
export interface RecoveredRun extends WorkflowRunHeadRecord {readonly executionAvailable:false; readonly sessionId?: string}
export interface WorkflowRunStore {
  initialize(signal?: AbortSignal): Promise<readonly RecoveredRun[]>;
  insertWithNextDisplayName(request: WorkflowRunInsertRequest, create: (identity: WorkflowRunIdentity) => { readonly head: WorkflowRunHeadDraftV2; readonly detail: WorkflowRunDetailPayloadV2 }, signal?: AbortSignal): Promise<WorkflowRunHeadRecord>;
  commitRun(request: WorkflowRunCommitRequest, signal?: AbortSignal): Promise<WorkflowRunHeadRecord>;
  commitTerminalAndClaimNotice(request: WorkflowTerminalCommitRequest, signal?: AbortSignal): Promise<WorkflowRunHeadRecord>;
  finalizeCompletionNotice(sessionId: string, runId: string, expectedRevision: number, finalization: WorkflowCompletionNoticeFinalization, signal?: AbortSignal): Promise<WorkflowRunHeadRecord>;
  readSession(sessionId: string, signal?: AbortSignal): Promise<readonly WorkflowRunHeadRecord[]>;
  readDetails(runId: string, request: DetailReadRequest, signal?: AbortSignal): Promise<DetailReadResult>;
  /** Descriptor-rooted editable projection read.  Optional for in-memory test
   * stores; Host-backed stores must implement it rather than opening a path
   * supplied by a retained manifest. */
  readRunScript?(runDirectory: string, maxBytes: number, signal?: AbortSignal): Promise<string>;
  /** Descriptor-rooted scratch inventory/read seams used by the supervisor. */
  listRunArtifacts?(runDirectory: string, maxItems: number, signal?: AbortSignal): Promise<WorkflowRunArtifactInventory>;
  readRunArtifact?(runDirectory: string, name: string, offsetBytes: number, maxBytes: number, expected: WorkflowRunArtifactIdentity, signal?: AbortSignal): Promise<WorkflowRunArtifactRead>;
  readRunReport?(runDirectory: string, maxBytes: number, signal?: AbortSignal): Promise<string | undefined>;
  dispose(): Promise<void>;
}
