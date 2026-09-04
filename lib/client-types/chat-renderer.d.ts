import type { ReactElement } from 'react';
import type { ConversationNodeDefinition } from '@deepseek-ai/dsh-client-ui-conversation/client';
import { type WorkflowRunPanelProps } from './WorkflowRunPanel.js';
import { type WorkflowState } from './workflow-definition.js';
/** Chat registration name used by the package Client wiring. */
export declare const workflowMessageDefinition: ConversationNodeDefinition<WorkflowState>;
/** Keyed Chat renderer kept separate from the full workflows dashboard. */
export declare function WorkflowRunRenderer(props: WorkflowRunPanelProps): ReactElement;
export default WorkflowRunRenderer;
//# sourceMappingURL=chat-renderer.d.ts.map