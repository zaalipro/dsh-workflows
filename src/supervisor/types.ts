import type { JsonValue, WorkflowRunHeadRecord, WorkflowRunStatus, WorkflowRunOutcomeState } from './storage/manifest-types.js'
import type { WorkflowScope } from '../registry/types.js'
export type { WorkflowRunStatus, WorkflowRunOutcomeState }
export type SupervisedWorkflowRunId = string & { readonly __brand: 'SupervisedWorkflowRunId' }
export type WorkflowMemberId = string & { readonly __brand: 'WorkflowMemberId' }
export type WorkflowGateId = string & { readonly __brand: 'WorkflowGateId' }
export type WorkflowRunCursor = string & { readonly __brand: 'WorkflowRunCursor' }
export type WorkflowRunFeedEpoch = string & { readonly __brand: 'WorkflowRunFeedEpoch' }
export interface WorkflowPhase { readonly title: string; readonly detail?: string; readonly provider?: string; readonly model?: string }
export interface WorkflowGateInfo { readonly id?: WorkflowGateId; readonly kind: 'user'|'back_off'|'no_progress'|'verification'|'infra'; readonly message: string; readonly resumable: boolean }
export interface SupervisedWorkflowRunInfo { readonly id: SupervisedWorkflowRunId; readonly displayName: string; readonly name: string }
export type SupervisedWorkflowStopReason = 'completed'|'cancelled'|'error'|'interrupted'
export interface SupervisedWorkflowResultInfo { readonly stopReason: SupervisedWorkflowStopReason; readonly error?: string; readonly agentsStarted: number }
export interface SupervisedWorkflowMemberLifecycleInfo {
  readonly memberId: WorkflowMemberId
  readonly seq: number
  readonly label: string
  readonly phase?: string
  readonly childSessionId: string
  readonly status: 'running' | 'completed' | 'failed' | 'cancelled'
}
export interface WorkflowGateRequest {
  readonly info: SupervisedWorkflowRunInfo
  readonly executionId: string
  readonly gateId: WorkflowGateId
  readonly gate: WorkflowGateInfo
  readonly parent: unknown
  readonly signal: AbortSignal
}
export interface WorkflowRunRecordingSnapshot {
  readonly info: SupervisedWorkflowRunInfo
  readonly run: WorkflowRunHead
  readonly members: readonly SupervisedWorkflowMemberLifecycleInfo[]
  readonly result?: SupervisedWorkflowResultInfo
}
export interface WorkflowRunMemberCounts { readonly total:number;readonly running:number;readonly completed:number;readonly failed:number;readonly cancelled:number }
export type WorkflowRunAction='pause'|'resume'|'stop'|'save'
export interface WorkflowRunTerminalSummary {
  readonly stopReason: 'completed'|'cancelled'|'error'|'interrupted'
  readonly resultState: Exclude<WorkflowRunOutcomeState, 'pending'>
  readonly preview?: string
  readonly error?: string
}
export interface WorkflowRunHead {readonly runId:SupervisedWorkflowRunId;readonly displayName:string;readonly name:string;readonly description:string;readonly status:WorkflowRunStatus;readonly phase?:string;readonly budget:{readonly total:number;readonly spent:number;readonly remaining:number};readonly memberCounts:WorkflowRunMemberCounts;readonly startedAt:number;readonly settledAt?:number;readonly terminal?:WorkflowRunTerminalSummary;readonly allowedActions:readonly WorkflowRunAction[];readonly revision:number;readonly detailRevision:number;readonly membersRevision:number;readonly logsRevision:number;readonly resultRevision:number;readonly artifactsRevision:number}
export interface WorkflowRunListRequest { readonly cursor?: WorkflowRunCursor; readonly limit?: number }
export interface WorkflowRunListPage { readonly epoch: WorkflowRunFeedEpoch; readonly sessionRevision:number; readonly items:readonly WorkflowRunHead[]; readonly nextCursor?:WorkflowRunCursor; readonly total:number }
export interface WorkflowRunRequest { readonly runId:SupervisedWorkflowRunId }
export interface WorkflowRunDetail { readonly run:WorkflowRunHead; readonly phases?:readonly WorkflowPhase[];readonly gate?:WorkflowGateInfo;readonly error?:string;readonly scriptPath?:string }
export interface WorkflowRunMemberHead {readonly memberId:WorkflowMemberId;readonly seq:number;readonly label:string;readonly phase?:string;readonly status:'running'|'completed'|'failed'|'cancelled';readonly startedAt?:number;readonly settledAt?:number;readonly outcome:WorkflowRunOutcomeState;readonly childSessionId?:string}
export interface WorkflowRunMemberPage {readonly items:readonly WorkflowRunMemberHead[];readonly nextCursor?:WorkflowRunCursor;readonly total:number;readonly revision:number}
export interface WorkflowRunMembersRequest extends WorkflowRunRequest {readonly cursor?:WorkflowRunCursor;readonly limit?:number}
export type WorkflowRunValueView={readonly state:'pending'|'not-produced'|'evicted'}|{readonly state:'available';readonly content:{readonly kind:'value';readonly value:JsonValue}|{readonly kind:'preview';readonly text:string};readonly totalBytes:number;readonly truncated:boolean}
export interface WorkflowRunMemberDetail {readonly member:WorkflowRunMemberHead;readonly childSessionId?:string;readonly outcome:WorkflowRunValueView}
export interface WorkflowRunMemberRequest extends WorkflowRunRequest {readonly memberId:WorkflowMemberId}
export interface WorkflowRunLogLine {readonly index:number;readonly text:string}
export interface WorkflowRunLogPage {readonly items:readonly WorkflowRunLogLine[];readonly nextCursor?:WorkflowRunCursor;readonly evicted:number;readonly total:number;readonly revision:number}
export interface WorkflowRunLogsRequest extends WorkflowRunRequest {readonly cursor?:WorkflowRunCursor;readonly limit?:number}
export interface WorkflowRunResultView {readonly value:WorkflowRunValueView;readonly error?:string;readonly revision:number}
export interface WorkflowRunArtifactView {readonly name:string;readonly bytes:number}
export interface WorkflowRunArtifactChunk {readonly artifact:WorkflowRunArtifactView;readonly text:string;readonly offsetBytes:number;readonly returnedBytes:number;readonly totalBytes:number;readonly revision:number;readonly nextCursor?:WorkflowRunCursor}
export interface WorkflowRunArtifactPage {readonly items:readonly WorkflowRunArtifactView[];readonly nextCursor?:WorkflowRunCursor;readonly omitted:number;readonly total:number;readonly revision:number}
export interface WorkflowRunArtifactsRequest extends WorkflowRunRequest {readonly cursor?:WorkflowRunCursor;readonly limit?:number}
export interface WorkflowRunArtifactRequest extends WorkflowRunRequest {readonly name:string;readonly cursor?:WorkflowRunCursor;readonly maxBytes?:number;readonly expectedRevision?:number}
export interface WorkflowRunControlRequest extends WorkflowRunRequest {readonly action:WorkflowRunAction;readonly expectedRevision:number}
export interface WorkflowRunControlResult {readonly run:WorkflowRunHead}
export type WorkflowRunChange={readonly kind:'invalidate-all'}|{readonly kind:'invalidate';readonly sessionId:string;readonly revision:number}
export type WorkflowRemoteFailureCode=
  |'invalid-page-limit'|'invalid-artifact-limit'|'invalid-cursor'|'stale-cursor'
  |'workspace-unavailable'|'definition-invalid'|'run-not-found'|'member-not-found'
  |'artifact-not-found'|'artifact-changed'|'revision-conflict'
  |'action-unavailable'|'storage-unavailable'
export type WorkflowRemoteFailure =
  | { readonly code: Exclude<WorkflowRemoteFailureCode, 'revision-conflict'|'action-unavailable'>; readonly message: string; readonly details?: Readonly<Record<string, unknown>> }
  | { readonly code: 'revision-conflict'; readonly message: 'workflow run changed; refresh it before applying a control'; readonly details: { readonly run: WorkflowRunHead } }
  | { readonly code: 'action-unavailable'; readonly message: string; readonly details: { readonly reason: 'budget-limited'|'invalid-state'|'save-ineligible'; readonly run?: WorkflowRunHead } }

declare module '@deepseek-ai/cordis' {
  interface Events {
    'workflows/run-start'(info: SupervisedWorkflowRunInfo): void
    'workflows/member-start'(info: SupervisedWorkflowRunInfo, member: SupervisedWorkflowMemberLifecycleInfo): void
    'workflows/member-end'(info: SupervisedWorkflowRunInfo, member: SupervisedWorkflowMemberLifecycleInfo): void
    'workflows/run-end'(info: SupervisedWorkflowRunInfo, result: SupervisedWorkflowResultInfo): void
    'workflows/gate-request'(request: WorkflowGateRequest): void
    /**
     * Invalidation-only workflow run hint. Never carries a run head.
     * @mode emit
     */
    'workflows/run-change'(change: WorkflowRunChange): void
  }
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteEventSelection {
    'workflows/run-change': true
  }
}
export type WorkflowRemoteResult<T>={readonly ok:true;readonly value:T}|{readonly ok:false;readonly error:WorkflowRemoteFailure}
export interface WorkflowLaunched {readonly displayName:string;readonly runId:SupervisedWorkflowRunId;readonly scriptPath?:string;readonly status:'started'}
/** Success coverage sentence required by 6.5 / SH8; never a live-tool claim. */
export const VALIDATION_NOTE = 'Validated one args-selected path with canned agent results; other branches, live tools, and live schema responses were not covered.'
export type WorkflowValidation=
  |{readonly ok:true;readonly status:'completed';readonly value:JsonValue;readonly note:typeof VALIDATION_NOTE}
  |{readonly ok:true;readonly status:'would-pause';readonly value:string;readonly note:typeof VALIDATION_NOTE}
  |{readonly ok:false;readonly status:'error';readonly error:string;readonly errorCode?:string}
export type WorkflowSaveScope=Extract<WorkflowScope,'project'|'user'>
