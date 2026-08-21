import { type ReactElement } from 'react';
import type { WorkflowRunMemberDetail, WorkflowRunMemberHead, WorkflowRunValueView } from './contract.js';
import { type DashboardLabels } from './locales.js';
export interface WorkflowMemberInspectorProps {
    /** A member head is accepted for loading/empty states. */
    readonly member?: WorkflowRunMemberHead;
    /** Either the complete Remote value or a wrapper containing `outcome`. */
    readonly detail?: WorkflowRunMemberDetail | {
        readonly outcome?: WorkflowRunValueView;
        readonly childSessionId?: string;
    };
    readonly outcome?: WorkflowRunValueView;
    readonly loading?: boolean;
    readonly error?: unknown;
    readonly onRetry?: () => void;
    readonly onClose?: () => void;
    /** Optional child navigation callback. It must already perform catalog proof. */
    readonly onOpenChild?: () => Promise<boolean> | boolean;
    readonly labels?: DashboardLabels;
}
/** Bounded Markdown/plain-text renderer. Strings must not be JSON.stringified. */
export declare function MarkdownText({ text }: {
    readonly text: string;
}): ReactElement;
/** Render one bounded member outcome without conflating null, absence, or eviction. */
export declare function WorkflowMemberInspector({ member, detail, outcome: explicitOutcome, loading, error, onRetry, onClose, onOpenChild, labels: labelOverrides, }: WorkflowMemberInspectorProps): ReactElement;
export default WorkflowMemberInspector;
//# sourceMappingURL=WorkflowMemberInspector.d.ts.map