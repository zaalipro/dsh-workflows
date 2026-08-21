import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { WorkflowRemoteResult, WorkflowRunArtifactChunk, WorkflowRunArtifactPage, WorkflowRunArtifactRequest, WorkflowRunArtifactsRequest, WorkflowRunControlRequest, WorkflowRunControlResult, WorkflowRunDetail, WorkflowRunListPage, WorkflowRunListRequest, WorkflowRunLogPage, WorkflowRunLogsRequest, WorkflowRunMemberDetail, WorkflowRunMemberPage, WorkflowRunMemberRequest, WorkflowRunMembersRequest, WorkflowRunRequest, WorkflowRunResultView } from './types.js';
/** Direct Agent-authorized run API. Protected values are never event payloads. */
export declare class WorkflowRunsRemote extends TypertRemoteService {
    static readonly inject: readonly ["workflowSupervisor"];
    private readonly supervisor;
    private readonly cursorSecret;
    private readonly processEpoch;
    constructor(ctx: Context);
    private cursorOffset;
    private nextCursor;
    list(agent: Agent, request: WorkflowRunListRequest, signal: AbortSignal): Promise<WorkflowRemoteResult<WorkflowRunListPage>>;
    detail(agent: Agent, request: WorkflowRunRequest, signal: AbortSignal): Promise<WorkflowRemoteResult<WorkflowRunDetail>>;
    private page;
    members(agent: Agent, request: WorkflowRunMembersRequest, signal: AbortSignal): Promise<WorkflowRemoteResult<WorkflowRunMemberPage>>;
    memberDetail(agent: Agent, request: WorkflowRunMemberRequest, signal: AbortSignal): Promise<WorkflowRemoteResult<WorkflowRunMemberDetail>>;
    logs(agent: Agent, request: WorkflowRunLogsRequest, signal: AbortSignal): Promise<WorkflowRemoteResult<WorkflowRunLogPage>>;
    result(agent: Agent, request: WorkflowRunRequest, signal: AbortSignal): Promise<WorkflowRemoteResult<WorkflowRunResultView>>;
    artifacts(agent: Agent, request: WorkflowRunArtifactsRequest, signal: AbortSignal): Promise<WorkflowRemoteResult<WorkflowRunArtifactPage>>;
    artifact(agent: Agent, request: WorkflowRunArtifactRequest, signal: AbortSignal): Promise<WorkflowRemoteResult<WorkflowRunArtifactChunk>>;
    control(agent: Agent, request: WorkflowRunControlRequest, signal: AbortSignal): Promise<WorkflowRemoteResult<WorkflowRunControlResult>>;
}
//# sourceMappingURL=remote.d.ts.map