import type { WorkflowRunCursor, WorkflowRunFeedEpoch } from './types.js';
/** Collections which may be paged through the authorized workflow Remote. */
export type WorkflowCursorKind = 'definitions' | 'runs' | 'members' | 'logs' | 'artifacts' | 'artifact';
/** Canonical authenticated cursor payload. No protected data belongs here. */
export interface WorkflowCursorPayload {
    readonly version: 1;
    readonly kind: WorkflowCursorKind;
    /** Exact owning Session identity. */
    readonly sessionId: string;
    /** Selected run/member owner; empty for Session-wide collections. */
    readonly entityId: string;
    /** Process epoch which issued the baseline. */
    readonly processEpoch: string;
    /** Collection revision at which this offset was produced. */
    readonly revision: number;
    /** Row offset, or UTF-8 byte offset for `artifact`. */
    readonly offset: number;
}
export interface WorkflowCursorExpectation {
    readonly version?: 1;
    readonly kind: WorkflowCursorKind;
    readonly sessionId: string;
    readonly entityId: string;
    readonly processEpoch: string;
    readonly revision: number;
    /** Inclusive upper bound for the next offset. */
    readonly total: number;
}
export type WorkflowCursorDecodeResult = {
    readonly ok: true;
    readonly value: WorkflowCursorPayload;
} | {
    readonly ok: false;
    readonly reason: 'invalid' | 'stale';
};
/** Compatibility error used by the early package Remote adapter. */
export declare class WorkflowCursorError extends Error {
    readonly code: 'invalid-cursor' | 'stale-cursor';
    constructor(message: string, code: 'invalid-cursor' | 'stale-cursor');
}
/**
 * Encode an authenticated cursor. The two-argument form is the public API;
 * the one-argument form remains for early package consumers and uses the
 * process-local secret.
 */
export declare function encodeWorkflowCursor(secret: Uint8Array, payload: WorkflowCursorPayload): WorkflowRunCursor;
export declare function encodeWorkflowCursor(payload: WorkflowCursorPayload | LegacyCursorPayload): WorkflowRunCursor;
/** Decode a cursor with the authenticated three-argument API. */
export declare function decodeWorkflowCursor(secret: Uint8Array, cursor: string, expected: WorkflowCursorExpectation): WorkflowCursorDecodeResult;
/** Compatibility decoder used by the original Remote adapter. */
export declare function decodeWorkflowCursor(cursor: WorkflowRunCursor, expected: LegacyCursorExpectation): WorkflowCursorPayload;
interface LegacyCursorPayload {
    readonly owner?: string;
    readonly collection?: string;
    readonly epoch?: string;
    readonly revision: number;
    readonly offset: number;
    readonly kind?: WorkflowCursorKind;
    readonly sessionId?: string;
    readonly entityId?: string;
    readonly collectionOwner?: string;
    readonly processEpoch?: string;
}
interface LegacyCursorExpectation extends LegacyCursorPayload {
    readonly total?: number;
}
export type { WorkflowRunCursor, WorkflowRunFeedEpoch };
//# sourceMappingURL=cursors.d.ts.map