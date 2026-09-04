import type { ConversationNodeDefinition } from '@deepseek-ai/dsh-client-ui-conversation/client';
/** Status shown for a workflow, phase, or member in the durable Chat row. */
export type WorkflowRunStatus = 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted';
/** One member that actually emitted an official agent-start event. */
export interface WorkflowRunMemberData {
    readonly seq: number;
    readonly label: string;
    readonly childId: string;
    readonly status: WorkflowRunStatus;
}
/** One exact phase identity. `null` is omitted; `''` is an empty phase name. */
export interface WorkflowRunPhaseData {
    readonly key: string;
    readonly phase: string | null;
    readonly members: readonly WorkflowRunMemberData[];
}
/** Durable, human-renderable payload for one workflow-run Chat node. */
export interface WorkflowRunChatData {
    readonly name: string;
    readonly status: WorkflowRunStatus;
    readonly phases: readonly WorkflowRunPhaseData[];
}
declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
    interface ChatNodeDataMap {
        'workflow-run': WorkflowRunChatData;
    }
}
/** Internal fold state for one member; exported so declaration emit is stable. */
export interface WorkflowMemberState {
    readonly seq: number;
    readonly label: string;
    readonly phase?: string;
    readonly childId: string;
    readonly outcome?: string;
}
/** Internal fold state retained by the official conversation projection. */
export interface WorkflowState {
    readonly name: string;
    readonly stopReason?: string;
    readonly members: readonly WorkflowMemberState[];
}
/**
 * Build a stable phase key without conflating an omitted field and `''`.
 * @param phase - exact phase text, or null when the field was omitted.
 * @returns a collision-free renderer key.
 */
export declare function workflowPhaseKey(phase: string | null): string;
/** Fold only the four official durable workflow events into one keyed Chat node. */
export declare const workflowRunDefinition: ConversationNodeDefinition<WorkflowState>;
/** Backward-compatible public name used by some Chat registration faces. */
export declare const workflowMessageDefinition: ConversationNodeDefinition<WorkflowState>;
//# sourceMappingURL=workflow-definition.d.ts.map