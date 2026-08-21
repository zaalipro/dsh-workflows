import type { WorkflowRunChange } from './supervisor/types.js';
/** Canonical H ApiProxy registration for workflow invalidation hints. */
export type WorkflowRemoteEvent = WorkflowRunChange;
/** Spec name for the invalidate-only `workflows/run-change` payload. */
export type WorkflowRunInvalidation = WorkflowRunChange;
export interface WorkflowRemoteEventConfig {
    readonly remoteQueueMaxSessions?: number;
}
declare module '@deepseek-ai/cordis' {
    interface Events {
        /**
         * Invalidation-only workflow run hint. Never carries a run head.
         * @mode emit
         */
        'workflows/run-change'(change: WorkflowRunChange): void;
    }
}
declare module '@deepseek-ai/dsh-typert-protocol' {
    interface TypertRemoteEventSelection {
        'workflows/run-change': true;
    }
}
interface ApiRemoteEventsLike {
    register?: (event: string, policy: {
        readonly kind: 'keyed-latest';
        readonly maxKeys: number;
        readonly select: (change: WorkflowRemoteEvent) => {
            readonly kind: 'key';
            readonly key: string;
        } | {
            readonly kind: 'invalidate-all';
        };
        readonly invalidationArgs: readonly [WorkflowRemoteEvent];
    }) => unknown;
}
/** Register one effect-owned bounded H event lane; no package-local queue is retained. */
export declare function registerWorkflowRemoteEvents(ctx: {
    readonly apiRemoteEvents?: ApiRemoteEventsLike;
}, config?: WorkflowRemoteEventConfig): () => void;
export declare const applyRemoteEvents: typeof registerWorkflowRemoteEvents;
export {};
//# sourceMappingURL=remote-events.d.ts.map