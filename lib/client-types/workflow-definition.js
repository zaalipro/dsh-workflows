/**
 * Build a stable phase key without conflating an omitted field and `''`.
 * @param phase - exact phase text, or null when the field was omitted.
 * @returns a collision-free renderer key.
 */
export function workflowPhaseKey(phase) {
    return phase === null ? 'missing' : `value:${phase.length}:${phase}`;
}
function eventOf(event) {
    return event;
}
function statusFromStopReason(stopReason) {
    switch (stopReason) {
        case 'completed': return 'completed';
        case 'cancelled':
        case 'interrupted': return 'cancelled';
        case 'error':
        case 'failed': return 'failed';
        default: return 'failed';
    }
}
function statusFromOutcome(outcome) {
    switch (outcome) {
        case 'completed': return 'completed';
        case 'cancelled':
        case 'interrupted': return 'cancelled';
        case 'error':
        case 'failed': return 'failed';
        default: return 'failed';
    }
}
function projectWorkflow(context, _location) {
    const state = context.state;
    const phases = new Map();
    for (const member of state.members) {
        const phase = member.phase === undefined ? null : member.phase;
        const key = workflowPhaseKey(phase);
        let group = phases.get(key);
        if (group === undefined) {
            group = { phase, members: [] };
            phases.set(key, group);
        }
        group.members.push({
            seq: member.seq,
            label: member.label,
            childId: member.childId,
            status: member.outcome === undefined
                ? 'running'
                : statusFromOutcome(member.outcome),
        });
    }
    return {
        name: state.name,
        status: state.stopReason === undefined ? 'running' : statusFromStopReason(state.stopReason),
        phases: [...phases].map(([key, phase]) => ({
            key,
            phase: phase.phase,
            members: phase.members,
        })),
    };
}
function updateAgentStart(state, data) {
    const seq = Number(data.seq);
    if (!Number.isSafeInteger(seq) || seq < 1 || state.members.some(member => member.seq === seq))
        return state;
    const member = {
        seq,
        label: String(data.label ?? ''),
        childId: String(data.childId ?? data.childSessionId ?? ''),
        ...(data.phase === undefined ? {} : { phase: String(data.phase) }),
    };
    return { ...state, members: [...state.members, member] };
}
function updateAgentEnd(state, data) {
    const seq = Number(data.seq);
    return {
        ...state,
        members: state.members.map(member => member.seq === seq
            ? { ...member, outcome: String(data.outcome ?? 'error') }
            : member),
    };
}
/** Fold only the four official durable workflow events into one keyed Chat node. */
export const workflowRunDefinition = {
    kind: 'workflow-run',
    target: 'chat',
    match: (rawEvent) => {
        const event = eventOf(rawEvent);
        if (event.type === 'tool-workflow/run-start') {
            return { id: String(event.data.runId), role: 'start' };
        }
        if (event.type === 'tool-workflow/agent-start'
            || event.type === 'tool-workflow/agent-end'
            || event.type === 'tool-workflow/run-end') {
            return { id: String(event.data.runId), role: 'update' };
        }
        return null;
    },
    start: (_context, match) => {
        const event = eventOf(match.event);
        if (event.type !== 'tool-workflow/run-start') {
            throw new Error('workflow-run start requires tool-workflow/run-start');
        }
        return { name: String(event.data.name ?? ''), members: [] };
    },
    update: (context, match) => {
        const event = eventOf(match.event);
        if (event.type === 'tool-workflow/agent-start')
            return updateAgentStart(context.state, event.data);
        if (event.type === 'tool-workflow/agent-end')
            return updateAgentEnd(context.state, event.data);
        if (event.type === 'tool-workflow/run-end') {
            return { ...context.state, stopReason: String(event.data.stopReason ?? 'error') };
        }
        return context.state;
    },
    buildViewNode: (context) => {
        if (context.start === undefined || context.state === undefined)
            return null;
        const data = projectWorkflow(context, context.start.location);
        return {
            key: context.key,
            kind: 'workflow-run',
            id: context.id,
            target: 'chat',
            anchorSeq: context.start.event.seq,
            location: context.start.location,
            visibility: 'visible',
            data,
        };
    },
};
/** Backward-compatible public name used by some Chat registration faces. */
export const workflowMessageDefinition = workflowRunDefinition;
//# sourceMappingURL=workflow-definition.js.map