export type WorkflowCommand =
  | { readonly kind: 'empty' }
  | { readonly kind: 'launch'; readonly name: string; readonly args: Record<string, unknown> }
  | { readonly kind: 'pause'|'resume'|'stop'|'save'; readonly displayName: string }
  | { readonly kind: 'malformed'; readonly error: string }

export const WORKFLOW_COMMAND_HELP = [
  'Usage: /workflow <name> [<json-object>]',
  '       /workflow pause <display-name>',
  '       /workflow resume <display-name>',
  '       /workflow stop <display-name>',
  '       /workflow save <display-name>',
  '',
  'Examples:',
  '  /workflow review-changes {"branch":"main"}',
  '  /workflow pause review-changes',
  '  /workflow resume review-changes',
  '  /workflow stop review-changes',
  '  /workflow save review-changes',
].join('\n')

/** Parse workflow command text without resolving definitions or causing effects. */
export function parseWorkflowCommand(rawInput: string): WorkflowCommand {
  const input = rawInput.trim()
  if (input === '') return { kind: 'empty' }
  const parts = input.split(/\s+/u)
  const verb = parts[0]
  if (verb === 'pause' || verb === 'resume' || verb === 'stop' || verb === 'save') {
    if (parts.length !== 2 || parts[1] === '') return { kind: 'malformed', error: `Usage: /workflow ${verb} <display-name>` }
    return { kind: verb, displayName: parts[1] }
  }
  const name = verb
  const rest = input.slice(name.length).trim()
  if (rest === '') return { kind: 'launch', name, args: {} }
  let value: unknown
  try { value = JSON.parse(rest) } catch { return { kind: 'malformed', error: `trailing args for "${name}" must be one JSON object — ${rest}` } }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return { kind: 'malformed', error: `trailing args for "${name}" must be a JSON object (wrap arrays/scalars in a field)` }
  return { kind: 'launch', name, args: value as Record<string, unknown> }
}
