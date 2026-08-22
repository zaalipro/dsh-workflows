import type { JsonValue } from './storage/manifest-types.js';
import type { WorkflowRunValueView } from './types.js';
/** Project a detached, complete JSON value or a UTF-8-safe bounded preview. */
export declare function workflowRunValueView(value: unknown, maxBytes: number): WorkflowRunValueView;
/** Backwards-compatible spelling used by early package previews. */
export declare const workflowValueView: typeof workflowRunValueView;
/** Validate that a value is lossless JSON data and return a deep snapshot. */
export declare function snapshotWorkflowJsonValue(value: unknown): JsonValue;
/** Last non-empty assistant/message text in a child session log. */
export declare function lastAssistantText(events: unknown): string | undefined;
/** Recover a stock child agent's reply when journal-commit never fired. */
export declare function childTranscriptValue(ctx: unknown, childId: unknown): JsonValue | undefined;
/** Promote a stored not-produced/pending member when a child transcript is still reachable. */
export declare function memberOutcomeWithTranscript(ctx: unknown, member: {
    readonly outcome: 'pending' | 'available' | 'not-produced' | 'evicted';
    readonly status: string;
    readonly childSessionId?: string;
}): 'pending' | 'available' | 'not-produced' | 'evicted';
//# sourceMappingURL=value-view.d.ts.map