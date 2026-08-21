import type { WorkflowDefinition, WorkflowDefinitionEnvelope, WorkflowScope } from './types.js';
/**
 * Parse a byte-bounded, fatal-UTF-8 workflow envelope and verify that its
 * metadata name equals the filename-derived expected name.
 */
export declare function parseWorkflowDefinition(bytes: Uint8Array, path: string, scope: WorkflowScope, expectedName: string, maxBytes: number): WorkflowDefinition;
/**
 * Compatibility parser for already-decoded definition text. Filesystem
 * callers should prefer {@link parseWorkflowDefinition} so the byte cap and
 * fatal UTF-8 decoding occur at the same boundary.
 */
export declare function parseDefinitionFile(raw: string, path: string, expectedName: string): Omit<WorkflowDefinition, 'scope'>;
/** Validate an in-memory envelope and return a normalized detached copy. */
export declare function validateDefinitionEnvelope(envelope: WorkflowDefinitionEnvelope, source?: string): WorkflowDefinitionEnvelope;
/**
 * Serialize a revalidated envelope to canonical UTF-8 bytes. Key order is
 * `meta`, then `script`, indentation is two spaces, and exactly one LF follows.
 */
export declare function serializeWorkflowDefinition(envelope: WorkflowDefinitionEnvelope): Uint8Array;
/** Legacy string serializer retained for source compatibility. */
export declare function serializeDefinition(envelope: WorkflowDefinitionEnvelope): string;
/** Extract the name candidate from one direct definition entry. */
export declare function filenameStem(path: string): string;
//# sourceMappingURL=definition.d.ts.map