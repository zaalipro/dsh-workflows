import type { ReactElement } from 'react'
import type { ConversationNodeDefinition } from '@deepseek-ai/dsh-client-runtime/client'
import { WorkflowRunPanel, type WorkflowRunPanelProps } from './WorkflowRunPanel.js'
import { workflowRunDefinition, type WorkflowState } from './workflow-definition.js'

/** Chat registration name used by the package Client wiring. */
export const workflowMessageDefinition: ConversationNodeDefinition<WorkflowState> = workflowRunDefinition

/** Keyed Chat renderer kept separate from the full workflows dashboard. */
export function WorkflowRunRenderer(props: WorkflowRunPanelProps): ReactElement {
  return <WorkflowRunPanel {...props} />
}

export default WorkflowRunRenderer
