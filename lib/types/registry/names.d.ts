/**
 * Return whether `value` is a safe saved-workflow definition name.
 *
 * The check does not coerce, normalize, or truncate its input. In particular,
 * the length is JavaScript string length (UTF-16 code units), matching the
 * durable filename contract.
 */
export declare function isWorkflowDefinitionName(value: unknown): value is string;
/** Official workflow vocabulary alias retained for package consumers. */
export declare const isWorkflowName: typeof isWorkflowDefinitionName;
/**
 * Assert that `value` is a saved-workflow definition name and return the exact
 * input string. The diagnostic contains only the caller-supplied source; this
 * helper never invents or discloses a filesystem path.
 */
export declare function assertWorkflowDefinitionName(value: unknown, source: string): string;
/** Official workflow vocabulary alias retained for package consumers. */
export declare const assertWorkflowName: typeof assertWorkflowDefinitionName;
//# sourceMappingURL=names.d.ts.map