import { type ReactElement } from 'react';
import type { ChatConversationViewNode } from '@deepseek-ai/dsh-client-runtime/client';
import type { WorkflowRunChatData, WorkflowRunStatus } from './workflow-definition.js';
export interface WorkflowRunPanelProps {
    readonly node: ChatConversationViewNode & {
        readonly kind: 'workflow-run';
        readonly data: WorkflowRunChatData;
    };
    readonly sessionId: string;
    readonly resolveAndOpenChild: (childId: string) => Promise<boolean>;
    /** Optional synchronous catalog proof supplied by the owning Client plugin. */
    readonly isChildAvailable?: (childId: string) => boolean;
    readonly labels?: Partial<WorkflowRunPanelLabels>;
}
export interface WorkflowRunPanelLabels {
    readonly noMembers: string;
    readonly unphased: string;
    readonly emptyPhase: string;
    readonly emptyMember: string;
    readonly childUnavailable: string;
    readonly childFailed: string;
    readonly inspect: (count: number) => string;
    readonly status: Readonly<Record<WorkflowRunStatus, string>>;
    readonly statusCount: (status: WorkflowRunStatus, count: number) => string;
    readonly openMember: (label: string) => string;
}
export type DisclosureMode = 'clean' | 'running' | 'abnormal';
export interface DisclosureFacts {
    readonly mode: DisclosureMode;
    readonly count: number;
}
export interface DisclosureChoice {
    readonly open: boolean;
    readonly mode: DisclosureMode;
    readonly count: number;
}
export declare function initialWorkflowDisclosure(facts: DisclosureFacts): DisclosureChoice;
/** Force abnormal/running open; auto-fold a clean completion once. */
export declare function advanceWorkflowDisclosure(current: DisclosureChoice, facts: DisclosureFacts): DisclosureChoice;
/** Render one durable workflow run without exposing logical run or child ids. */
export declare function WorkflowRunPanel({ node, resolveAndOpenChild, isChildAvailable, labels: labelOverrides, }: WorkflowRunPanelProps): ReactElement;
export default WorkflowRunPanel;
//# sourceMappingURL=WorkflowRunPanel.d.ts.map