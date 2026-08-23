import { type ReactElement } from 'react';
import type { WorkflowRunsOperations, WorkflowRunsSourceSnapshot } from './contract.js';
import type { DashboardLabels } from './locales.js';
import type { WorkflowsState, WorkflowsStoreInstance } from './store.js';
import { type WorkflowRunPanelProps } from './WorkflowRunPanel.js';
type SelectorHook<T> = <Selected>(selector: (value: T) => Selected) => Selected;
interface SessionListView {
    readonly current?: string;
}
/** Structural slot props isolate the package from nonessential Host UI types. */
export interface WorkflowsDashboardSlotProps {
    readonly useSessions: SelectorHook<SessionListView>;
    readonly useStore: SelectorHook<WorkflowsState>;
    readonly useWorkflowRuns: SelectorHook<WorkflowRunsSourceSnapshot>;
    readonly actions: WorkflowsStoreInstance['actions'];
    readonly operations: WorkflowRunsOperations;
    readonly invoker?: HTMLElement | null;
    readonly onClose?: () => void;
    /** Notifies the owner after the slot-backed dashboard has committed. */
    readonly onPresenceChange?: (visible: boolean) => void;
    /** Distinguishes slot removal from an ordinary store-backed close. */
    readonly onUnmount?: () => void;
    readonly labels?: DashboardLabels;
}
/** Translate the official slot standard kit into the package-owned dialog. */
export declare function WorkflowsDashboardSlot(props: WorkflowsDashboardSlotProps): ReactElement | null;
export interface WorkflowRunChatSlotProps extends Omit<WorkflowRunPanelProps, 'resolveAndOpenChild' | 'isChildAvailable'> {
    readonly operations: Pick<WorkflowRunsOperations, 'resolveAndOpenChild'>;
    readonly childAvailable?: (parentSessionId: string, childSessionId: string) => boolean;
    readonly useSessions?: SelectorHook<{
        readonly current?: string;
        readonly subagentsByParent?: unknown;
    }>;
}
/** Keyed durable-Chat renderer with exact-parent child navigation. */
export declare function WorkflowRunChatSlot(props: WorkflowRunChatSlotProps): ReactElement;
export {};
//# sourceMappingURL=slot-components.d.ts.map