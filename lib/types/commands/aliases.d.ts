import type { WorkflowDefinitionSummary } from '../registry/types.js';
/** Allocate aliases in UTF-16 name order without stealing a sibling's bare name. */
export declare function allocateWorkflowCommandNames(definitions: readonly Pick<WorkflowDefinitionSummary, 'name'>[], occupiedNames: ReadonlySet<string>): ReadonlyMap<string, string>;
//# sourceMappingURL=aliases.d.ts.map