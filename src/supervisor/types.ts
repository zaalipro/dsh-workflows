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
export interface WorkflowRunMemberCounts { readonly total:number;readonly running:number;readonly completed:number;readonly failed:number;readonly cancelled:number }
export type WorkflowRunAction='pause'|'resume'|'stop'|'save'
export interface WorkflowRunHead {readonly runId:SupervisedWorkflowRunId;readonly displayName:string;readonly name:string;readonly description:string;readonly status:WorkflowRunStatus;readonly phase?:string;readonly budget:{readonly total:number;readonly spent:number;readonly remaining:number};readonly memberCounts:WorkflowRunMemberCounts;readonly startedAt:number;readonly settledAt?:number;readonly allowedActions:readonly WorkflowRunAction[];readonly revision:number;readonly detailRevision:number;readonly membersRevision:number;readonly logsRevision:number;readonly resultRevision:number;readonly artifactsRevision:number}
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
export interface WorkflowRunArtifactPage {readonly items:readonly WorkflowRunArtifactView[];readonly nextCursor?:WorkflowRunCursor;readonly omitted:number;readonly total:number;readonly revision:number}
export interface WorkflowRunArtifactsRequest extends WorkflowRunRequest {readonly cursor?:WorkflowRunCursor;readonly limit?:number}
export interface WorkflowRunArtifactRequest extends WorkflowRunRequest {readonly name:string;readonly cursor?:WorkflowRunCursor;readonly maxBytes?:number;readonly expectedRevision?:number}
export interface WorkflowRunControlRequest extends WorkflowRunRequest {readonly action:WorkflowRunAction;readonly expectedRevision?:number}
export interface WorkflowRunControlResult {readonly run:WorkflowRunHead}
export type WorkflowRunChange={readonly kind:'invalidate-all'}|{readonly kind:'invalidate';readonly sessionId:string;readonly revision:number}
export interface WorkflowLaunched {readonly displayName:string;readonly runId:SupervisedWorkflowRunId;readonly scriptPath?:string;readonly status:'started'}
export type WorkflowValidation={readonly ok:true;readonly status:'completed';readonly value:JsonValue}|{readonly ok:true;readonly status:'would-pause';readonly value:string}|{readonly ok:false;readonly status:'error';readonly error:string;readonly errorCode?:string}
export type WorkflowSaveScope=Extract<WorkflowScope,'project'|'user'>
