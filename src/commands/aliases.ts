import type { WorkflowDefinitionSummary } from '../registry/types.js'
/** Allocate aliases in deterministic name order, yielding to occupied commands. */
export function allocateWorkflowCommandNames(definitions: readonly Pick<WorkflowDefinitionSummary,'name'>[], occupiedNames: ReadonlySet<string>): ReadonlyMap<string,string> {
  const used = new Set(occupiedNames); const result = new Map<string,string>()
  for (const definition of [...definitions].sort((a,b)=>a.name.localeCompare(b.name))) { let candidate=definition.name; while(used.has(candidate))candidate=`workflow-${candidate}`;used.add(candidate);result.set(definition.name,candidate) }
  return result
}
