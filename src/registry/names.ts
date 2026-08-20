const RESERVED = new Set(['pause','resume','save','stop','workflow','workflows','create-workflow']);
const DEVICES = new Set(['con','prn','aux','nul', ...Array.from({length:9},(_,i)=>`com${i+1}`), ...Array.from({length:9},(_,i)=>`lpt${i+1}`)]);
const PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;
/** Return whether a value is a valid saved workflow definition name. */
export function isWorkflowDefinitionName(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 1 && value.length <= 64 && PATTERN.test(value) && !RESERVED.has(value) && !DEVICES.has(value.toLowerCase());
}
/** Alias retained for callers using the official workflow vocabulary. */
export const isWorkflowName = isWorkflowDefinitionName;
/** Validate and return an unchanged workflow name, including source context in errors. */
export function assertWorkflowDefinitionName(value: unknown, source: string): string {
  if (!isWorkflowDefinitionName(value)) throw new Error(`${source}: invalid workflow name ${safe(value)}; expected 1–64 UTF-16 units, lowercase kebab-case beginning with a letter, excluding reserved command and Windows device names`);
  return value;
}
export const assertWorkflowName = assertWorkflowDefinitionName;
function safe(value: unknown): string { try { return JSON.stringify(value); } catch { return '<unrenderable>'; } }
