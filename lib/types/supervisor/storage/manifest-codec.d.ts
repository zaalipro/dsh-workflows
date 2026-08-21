import type { WorkflowSessionManifest } from './manifest-types.js';
/** Parse a display handle back to its session-local launch ordinal.
 * The unnumbered first handle is `name` itself (ordinal 1), including kebab
 * names that already end in digits such as `gpt-4` or `review-2`. */
export declare function displayOrdinal(name: string, displayName: string): number;
/** Decode a bounded canonical version-2 Session manifest. */
export declare function decodeWorkflowSessionManifest(input: Uint8Array | string, file: string, maxBytes: number): WorkflowSessionManifest;
/** Encode a canonical version-2 Session manifest. */
export declare function encodeWorkflowSessionManifest(value: WorkflowSessionManifest, maxBytes: number): Uint8Array;
//# sourceMappingURL=manifest-codec.d.ts.map