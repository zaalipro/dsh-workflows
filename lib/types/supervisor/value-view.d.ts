import type { JsonValue } from './storage/manifest-types.js';
import type { WorkflowRunValueView } from './types.js';
/** Project a detached, complete JSON value or a UTF-8-safe bounded preview. */
export declare function workflowRunValueView(value: unknown, maxBytes: number): WorkflowRunValueView;
/** Backwards-compatible spelling used by early package previews. */
export declare const workflowValueView: typeof workflowRunValueView;
/** Validate that a value is lossless JSON data and return a deep snapshot. */
export declare function snapshotWorkflowJsonValue(value: unknown): JsonValue;
//# sourceMappingURL=value-view.d.ts.map