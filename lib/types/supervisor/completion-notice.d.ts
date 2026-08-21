import type { WorkflowRunValueView } from './types.js';
import type { WorkflowRunHeadRecord, WorkflowRunStore } from './storage/manifest-types.js';
export interface WorkflowCompletionNoticeInput {
    readonly runId: string;
    readonly sessionId?: string;
    readonly displayName: string;
    readonly status: 'completed' | 'failed' | 'cancelled' | 'interrupted';
    readonly report?: string;
    readonly result?: WorkflowRunValueView;
    readonly error?: string;
    /** Exact process-local owner. It is deliberately never persisted. */
    readonly parent?: any;
    /** Claimed terminal row returned by commitTerminalAndClaimNotice. */
    readonly head?: WorkflowRunHeadRecord;
    /** Legacy fallback for embedders without a descriptor-backed report read. */
    readonly scratchDir?: string;
}
export interface CompletionNoticeOptions {
    readonly maxBytes?: number;
    readonly maxItems?: number;
    readonly maxCohortBytes?: number;
    readonly maxConsecutiveWakes?: number;
}
/** Render one bounded owner-visible notice while preserving the dashboard footer. */
export declare function renderWorkflowCompletionNotice(input: WorkflowCompletionNoticeInput, maxBytes?: number, report?: string | undefined): string;
/**
 * At-most-once completion outbox. Durable `claimed` state authorizes one
 * enqueue; this class finalizes that exact claim as delivered or abandoned.
 */
export declare class WorkflowCompletionNotifier {
    private readonly ctx;
    private readonly store?;
    private readonly options;
    private readonly reservations;
    private readonly attempted;
    private readonly owners;
    /** Survives an empty drain so a later completion cannot open a fourth wake. */
    private readonly consecutiveWakes;
    private readonly listeners;
    private disposed;
    private disposal?;
    constructor(ctx: any, storeOrOptions?: WorkflowRunStore | CompletionNoticeOptions, maybeOptions?: CompletionNoticeOptions);
    reserve(key: string | object, parent: any): void;
    notify(input: WorkflowCompletionNoticeInput): Promise<boolean>;
    private schedule;
    private takeCohort;
    private drainOwner;
    private finalizeDirect;
    private finalize;
    humanInput(agent: any): void;
    whenOwnerQuiescent(agent: any, signal?: AbortSignal): Promise<void>;
    dispose(): Promise<void>;
}
//# sourceMappingURL=completion-notice.d.ts.map