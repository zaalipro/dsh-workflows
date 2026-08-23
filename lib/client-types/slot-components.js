import { jsx as _jsx } from "react/jsx-runtime";
import { useLayoutEffect } from 'react';
import { WorkflowsDashboard } from './WorkflowsDashboard.js';
import { WorkflowRunPanel } from './WorkflowRunPanel.js';
/** Translate the official slot standard kit into the package-owned dialog. */
export function WorkflowsDashboardSlot(props) {
    const sessionId = props.useSessions(value => value.current);
    const state = props.useStore(value => value);
    const source = props.useWorkflowRuns(value => value);
    useLayoutEffect(() => {
        props.onPresenceChange?.(state.open);
    }, [state.open, props.onPresenceChange]);
    useLayoutEffect(() => () => { props.onUnmount?.(); }, [props.onUnmount]);
    return (_jsx(WorkflowsDashboard, { operations: props.operations, source: source, sessionId: sessionId, open: state.open, store: state, storeActions: props.actions, invoker: props.invoker, onClose: props.onClose ?? props.actions.close, labels: props.labels }));
}
/** Keyed durable-Chat renderer with exact-parent child navigation. */
export function WorkflowRunChatSlot(props) {
    if (props.useSessions !== undefined)
        props.useSessions(value => value);
    return (_jsx(WorkflowRunPanel, { node: props.node, sessionId: props.sessionId, labels: props.labels, isChildAvailable: childId => props.childAvailable?.(props.sessionId, childId) === true, resolveAndOpenChild: childId => props.operations.resolveAndOpenChild(props.sessionId, childId) }));
}
//# sourceMappingURL=slot-components.js.map