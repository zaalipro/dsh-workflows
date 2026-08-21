import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { WorkflowRemoteResult } from '../supervisor/types.js';
import type { WorkflowDefinitionListPage, WorkflowDefinitionListRequest } from './types.js';
/** Agent-authorized, path-redacting saved-definition Remote service. */
export declare class WorkflowDefinitionsRemote extends TypertRemoteService {
    static readonly inject: readonly ["workflows"];
    private readonly registry;
    private readonly cursorSecret;
    private readonly processEpoch;
    constructor(ctx: Context);
    list(agent: Agent, request: WorkflowDefinitionListRequest, signal: AbortSignal): Promise<WorkflowRemoteResult<WorkflowDefinitionListPage>>;
}
//# sourceMappingURL=remote.d.ts.map