import { isWorkflowDefinitionName } from '../registry/names.js';
import { snapshotWorkflowJsonValue } from '../supervisor/value-view.js';
function record(value) { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function detachedRecord(value, field) {
    let snapshot;
    try {
        snapshot = snapshotWorkflowJsonValue(value);
    }
    catch (cause) {
        throw new Error(`workflow ${field} must contain lossless JSON data`, { cause });
    }
    if (!record(snapshot))
        throw new Error(`workflow ${field} must be a JSON object`);
    return snapshot;
}
/** Validate model-facing workflow request before any source or runtime side effect. */
export function parseWorkflowToolRequest(value) {
    if (!record(value))
        throw new Error('workflow request must be an object');
    const allowed = new Set(['name', 'script', 'script_path', 'meta', 'args', 'validate_only', 'resume_from_run_id', 'agent_budget']);
    for (const key of Object.keys(value))
        if (!allowed.has(key))
            throw new Error(`workflow request has unknown field "${key}"`);
    const v = value;
    const budget = v.agent_budget;
    if (budget !== undefined && (!Number.isSafeInteger(budget) || budget < 1 || budget > 1024))
        throw new Error('workflow agent_budget must be a safe integer from 1 through 1024');
    if (v.args !== undefined && !record(v.args))
        throw new Error('workflow args must be a JSON object (wrap arrays/scalars in a field)');
    if (v.validate_only !== undefined && typeof v.validate_only !== 'boolean')
        throw new Error('workflow validate_only must be a boolean');
    if (v.resume_from_run_id !== undefined) {
        if (typeof v.resume_from_run_id !== 'string' || v.resume_from_run_id === '')
            throw new Error('workflow resume_from_run_id must be a non-empty string');
        for (const key of ['name', 'script', 'script_path', 'meta', 'args', 'validate_only'])
            if (v[key] !== undefined)
                throw new Error('workflow resume_from_run_id cannot be combined with a source, meta, args, or validate_only');
        return { kind: 'resume', runId: v.resume_from_run_id, agentBudget: budget };
    }
    const sources = [v.name !== undefined ? 'name' : undefined, v.script !== undefined ? 'script' : undefined, v.script_path !== undefined ? 'script_path' : undefined].filter(Boolean);
    if (sources.length !== 1)
        throw new Error('workflow requires exactly one source: name, script, or script_path');
    const args = v.args === undefined ? {} : detachedRecord(v.args, 'args');
    if (v.name !== undefined) {
        if (typeof v.name !== 'string' || !isWorkflowDefinitionName(v.name))
            throw new Error(`workflow name "${String(v.name)}" is invalid`);
        if (v.meta !== undefined)
            throw new Error('workflow name source must not include meta');
        return { kind: 'fresh', source: { kind: 'name', name: v.name }, args, validateOnly: v.validate_only ?? false, agentBudget: budget };
    }
    if (v.script !== undefined) {
        if (typeof v.script !== 'string')
            throw new Error('workflow script must be a string');
        if (!record(v.meta))
            throw new Error('workflow script source requires the meta object');
        return { kind: 'fresh', source: { kind: 'script', script: v.script, meta: detachedRecord(v.meta, 'meta') }, args, validateOnly: v.validate_only ?? false, agentBudget: budget };
    }
    if (typeof v.script_path !== 'string' || v.script_path === '')
        throw new Error('workflow script_path must be a non-empty string');
    if (v.script_path.endsWith('.workflow.json') && v.meta !== undefined)
        throw new Error('workflow .workflow.json source must not include meta');
    if (!v.script_path.endsWith('.workflow.json') && !record(v.meta))
        throw new Error('workflow bare script_path requires the meta object');
    return { kind: 'fresh', source: { kind: 'script_path', path: v.script_path, ...(v.meta === undefined ? {} : { meta: detachedRecord(v.meta, 'meta') }) }, args, validateOnly: v.validate_only ?? false, agentBudget: budget };
}
export const WORKFLOW_TOOL_SCHEMA = { type: 'object', additionalProperties: false, properties: { name: { type: 'string' }, script: { type: 'string' }, script_path: { type: 'string' }, meta: { type: 'object' }, args: { type: 'object' }, validate_only: { type: 'boolean' }, resume_from_run_id: { type: 'string' }, agent_budget: { type: 'integer', minimum: 1, maximum: 1024 } } };
/** defineTool parameter map for the replacement; parseWorkflowToolRequest remains the cross-field gate. */
export const WORKFLOW_TOOL_PARAMETERS = {
    name: {
        type: 'string',
        description: 'Saved workflow definition name to launch (one of name/script/script_path).',
    },
    script: {
        type: 'string',
        description: 'The plain-JS workflow script body (top-level await allowed; NO `export const meta` statement). Requires `meta`.',
    },
    script_path: {
        type: 'string',
        description: 'A .workflow.json envelope or a bare script file on disk to launch. A bare file requires `meta`.',
    },
    meta: {
        type: 'object',
        additionalProperties: false,
        description: 'The workflow identity block (plain JSON — never code); required with script or a bare script_path.',
        properties: {
            name: { type: 'string', required: true, description: 'Short kebab-case workflow name.' },
            description: { type: 'string', required: true, description: 'One-line description of what the workflow does.' },
            whenToUse: { type: 'string', description: 'Optional guidance on when this workflow applies.' },
            phases: {
                type: 'array',
                description: 'Optional phase declarations matched by phase() calls.',
                items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        title: { type: 'string', required: true, description: 'The phase title phase() calls match by exact string.' },
                        detail: { type: 'string', description: 'Optional one-line description of the phase.' },
                        provider: { type: 'string', description: 'Optional provider override this phase is expected to use.' },
                        model: { type: 'string', description: 'Optional model override this phase is expected to use.' },
                    },
                },
            },
        },
    },
    args: {
        type: 'object',
        additionalProperties: true,
        description: 'Optional JSON input exposed to the script as the `args` global (wrap a bare list as a field, e.g. {"files": [...]}).',
    },
    validate_only: {
        type: 'boolean',
        description: 'Smoke-check one canned-host path instead of starting a live run (no children, no run record).',
    },
    resume_from_run_id: {
        type: 'string',
        description: 'Resume a same-process paused run by its run id; reject combining with name/script/script_path.',
    },
    agent_budget: {
        type: 'integer',
        description: 'Absolute logical-agent cap for this run (default 128, allowed 1–1024).',
    },
};
//# sourceMappingURL=schema.js.map