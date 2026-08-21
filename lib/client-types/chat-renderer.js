import { jsx as _jsx } from "react/jsx-runtime";
import { WorkflowRunPanel } from './WorkflowRunPanel.js';
import { workflowRunDefinition } from './workflow-definition.js';
/** Chat registration name used by the package Client wiring. */
export const workflowMessageDefinition = workflowRunDefinition;
/** Keyed Chat renderer kept separate from the full workflows dashboard. */
export function WorkflowRunRenderer(props) {
    return _jsx(WorkflowRunPanel, { ...props });
}
export default WorkflowRunRenderer;
//# sourceMappingURL=chat-renderer.js.map