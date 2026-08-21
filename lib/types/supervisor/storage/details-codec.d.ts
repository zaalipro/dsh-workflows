import type { WorkflowRunDetailPayloadV2, WorkflowRunDetailSnapshotV2 } from './manifest-types.js';
export interface WorkflowRunDetailLimits {
    readonly memberOutcomeMaxBytes: number;
    readonly maxTerminalResultBytes: number;
    readonly maxLogLineBytes: number;
    readonly maxRunDetailsBytes: number;
}
/** Deterministically compact a detail payload to its fixed quotas. */
export declare function compactWorkflowRunDetails(value: WorkflowRunDetailPayloadV2, limits: WorkflowRunDetailLimits): WorkflowRunDetailPayloadV2;
/** Encode one immutable version-2 detail sidecar. */
export declare function encodeWorkflowRunDetails(value: WorkflowRunDetailSnapshotV2, limits: WorkflowRunDetailLimits): Uint8Array;
/** Decode one immutable version-2 detail sidecar. */
export declare function decodeWorkflowRunDetails(input: Uint8Array | string, file: string, limits: WorkflowRunDetailLimits): WorkflowRunDetailSnapshotV2;
//# sourceMappingURL=details-codec.d.ts.map