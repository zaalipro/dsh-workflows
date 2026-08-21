export const WORKFLOW_COMMAND_HELP = [
    'Launch or control a workflow.',
    '',
    'Usage:',
    '/workflow <name> [<json-args>]',
    '/workflow pause <display-name>',
    '/workflow resume <display-name>',
    '/workflow stop <display-name>',
    '/workflow save <display-name>',
    '',
    'Examples:',
    '/workflow review-changes {"target":"origin/main...HEAD"}',
    '/workflow pause review-changes',
    '/workflow resume review-changes',
    '/workflow stop review-changes-2',
    '/workflow save review-changes',
].join('\n');
/** Parse workflow command text without resolving definitions or causing effects. */
export function parseWorkflowCommand(rawInput) {
    const input = rawInput.trim();
    if (input === '')
        return { kind: 'empty' };
    const parts = input.split(/\s+/u);
    const verb = parts[0];
    if (verb === 'pause' || verb === 'resume' || verb === 'stop' || verb === 'save') {
        if (parts.length !== 2 || parts[1] === '')
            return { kind: 'malformed', error: `Usage: /workflow ${verb} <display-name>` };
        return { kind: verb, displayName: parts[1] };
    }
    const name = verb;
    const rest = input.slice(name.length).trim();
    if (rest === '')
        return { kind: 'launch', name, args: {} };
    let value;
    try {
        value = JSON.parse(rest);
    }
    catch {
        return { kind: 'malformed', error: `trailing args for "${name}" must be one JSON object — ${rest}` };
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        return { kind: 'malformed', error: `trailing args for "${name}" must be a JSON object (wrap arrays/scalars in a field)` };
    return { kind: 'launch', name, args: value };
}
//# sourceMappingURL=parser.js.map