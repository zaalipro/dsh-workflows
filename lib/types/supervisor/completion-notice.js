import { boundContextSummary, createUserMessage } from '@deepseek-ai/dsh-llm';
const encoder = new TextEncoder();
const FOOTER = 'Open /workflows to inspect the run.';
const REPORT_REFERENCE = 'The complete report is retained as scratch/report.md.';
const TRUNCATED = '[notice truncated]';
function renderThrown(error) {
    try {
        return String(error);
    }
    catch {
        return '[unrenderable thrown value]';
    }
}
function utf8Prefix(text, maxBytes) {
    let output = '';
    let bytes = 0;
    for (const point of text) {
        const size = encoder.encode(point).byteLength;
        if (bytes + size > maxBytes)
            break;
        output += point;
        bytes += size;
    }
    return output;
}
function jsonText(value) {
    try {
        return JSON.stringify(value, null, 2);
    }
    catch {
        return '[result could not be serialized]';
    }
}
function statusClause(status) {
    switch (status) {
        case 'completed': return 'completed';
        case 'failed': return 'failed';
        case 'cancelled': return 'was stopped';
        case 'interrupted': return 'was interrupted';
    }
}
function resultText(input) {
    if (input.status !== 'completed')
        return input.error === undefined || input.error === '' ? '' : `\nReason: ${input.error}`;
    const value = input.result;
    if (value?.state !== 'available')
        return '\nResult:\nNo workflow result was retained.';
    return value.content.kind === 'value'
        ? `\nResult:\n${jsonText(value.content.value)}`
        : `\nResult preview:\n${value.content.text}`;
}
function fitNotice(content, footer, maxBytes) {
    const complete = `${content}\n${footer}`;
    if (encoder.encode(complete).byteLength <= maxBytes)
        return complete;
    const fixed = `\n${TRUNCATED}\n${footer}`;
    const fixedBytes = encoder.encode(fixed).byteLength;
    if (fixedBytes >= maxBytes)
        return utf8Prefix(fixed, maxBytes);
    return `${utf8Prefix(content, maxBytes - fixedBytes)}${fixed}`;
}
/** Render one bounded owner-visible notice while preserving the dashboard footer. */
export function renderWorkflowCompletionNotice(input, maxBytes = 16_384, report = input.report) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
        throw new TypeError('workflow completion notice maxBytes must be a positive safe integer');
    }
    const heading = `workflow "${input.displayName}" ${statusClause(input.status)}.`;
    const detail = report === undefined ? resultText(input) : `\nScratch report:\n${report}`;
    const footer = report === undefined ? FOOTER : `${REPORT_REFERENCE}\n${FOOTER}`;
    return fitNotice(`${heading}${detail}`, footer, maxBytes);
}
function isStore(value) {
    return typeof value === 'object' && value !== null
        && typeof value.finalizeCompletionNotice === 'function';
}
/**
 * At-most-once completion outbox. Durable `claimed` state authorizes one
 * enqueue; this class finalizes that exact claim as delivered or abandoned.
 */
export class WorkflowCompletionNotifier {
    ctx;
    store;
    options;
    reservations = new Map();
    attempted = new Set();
    owners = new Map();
    /** Survives an empty drain so a later completion cannot open a fourth wake. */
    consecutiveWakes = new WeakMap();
    listeners = [];
    disposed = false;
    disposal;
    constructor(ctx, storeOrOptions, maybeOptions = {}) {
        this.ctx = ctx;
        this.store = isStore(storeOrOptions) ? storeOrOptions : undefined;
        const supplied = isStore(storeOrOptions) ? maybeOptions : (storeOrOptions ?? {});
        this.options = {
            maxBytes: supplied.maxBytes ?? 16_384,
            maxItems: supplied.maxItems ?? 20,
            maxCohortBytes: supplied.maxCohortBytes ?? 262_144,
            maxConsecutiveWakes: supplied.maxConsecutiveWakes ?? 3,
        };
        for (const [name, value] of Object.entries(this.options)) {
            if (!Number.isSafeInteger(value) || value < 1)
                throw new TypeError(`workflow completion ${name} must be a positive safe integer`);
        }
        const remove = ctx?.on?.('agent/inbox/claimed', ({ agent, message }) => {
            if (message?.source?.kind === 'user')
                this.humanInput(agent);
        });
        if (typeof remove === 'function')
            this.listeners.push(remove);
    }
    reserve(key, parent) {
        if (this.disposed)
            return;
        const existing = this.reservations.get(key);
        if (existing !== undefined && existing.parent !== parent)
            throw new Error('workflow completion token changed owner');
        if (existing === undefined)
            this.reservations.set(key, { parent });
    }
    async notify(input) {
        const key = input.runId;
        if (this.attempted.has(key))
            return false;
        const parent = input.parent ?? this.reservations.get(key)?.parent;
        if (parent === undefined)
            return false;
        this.reserve(key, parent);
        this.attempted.add(key);
        const noticeBytes = Math.min(this.options.maxBytes, this.options.maxCohortBytes);
        // Supervisor-owned descriptor reads populate `report` before this queue.
        // Deliberately do not traverse an ambient absolute path here; legacy
        // callers that provide only scratchDir simply fall back to inline result.
        const report = input.report;
        const text = renderWorkflowCompletionNotice(input, noticeBytes, report);
        const bytes = encoder.encode(text).byteLength;
        if (this.disposed) {
            await this.finalizeDirect({ key, input: { ...input, parent }, text, bytes, resolve: () => undefined }, 'abandoned', 'teardown');
            return true;
        }
        return await new Promise(resolve => {
            const owner = this.owners.get(parent) ?? { pending: [], pendingBytes: 0, scheduled: false };
            this.owners.set(parent, owner);
            owner.pending.push({ key, input: { ...input, parent }, text, bytes, resolve });
            owner.pendingBytes += bytes;
            this.schedule(parent, owner);
        });
    }
    schedule(parent, owner) {
        if (owner.scheduled || owner.processing !== undefined)
            return;
        owner.scheduled = true;
        queueMicrotask(() => {
            owner.scheduled = false;
            if (owner.processing !== undefined)
                return;
            owner.processing = this.drainOwner(parent, owner).finally(() => {
                owner.processing = undefined;
                if (owner.pending.length > 0 && !this.disposed)
                    this.schedule(parent, owner);
                else if (owner.pending.length === 0)
                    this.owners.delete(parent);
            });
        });
    }
    takeCohort(owner) {
        const cohort = [];
        let bytes = 0;
        while (owner.pending.length > 0 && cohort.length < this.options.maxItems) {
            const candidate = owner.pending[0];
            const separatorBytes = cohort.length === 0 ? 0 : encoder.encode('\n\n').byteLength;
            if (cohort.length > 0 && bytes + separatorBytes + candidate.bytes > this.options.maxCohortBytes)
                break;
            owner.pending.shift();
            owner.pendingBytes -= candidate.bytes;
            cohort.push(candidate);
            bytes += separatorBytes + candidate.bytes;
            if (bytes >= this.options.maxCohortBytes)
                break;
        }
        return cohort;
    }
    async drainOwner(parent, owner) {
        while (owner.pending.length > 0) {
            const cohort = this.takeCohort(owner);
            if (this.disposed) {
                for (const item of cohort) {
                    await this.finalize(item, 'abandoned', 'teardown');
                    item.resolve(true);
                }
                continue;
            }
            const wakeKey = typeof parent === 'object' && parent !== null ? parent : undefined;
            const wakes = wakeKey === undefined ? 0 : (this.consecutiveWakes.get(wakeKey) ?? 0);
            const canWake = wakes < this.options.maxConsecutiveWakes;
            if (canWake && wakeKey !== undefined)
                this.consecutiveWakes.set(wakeKey, wakes + 1);
            const lane = canWake ? 'followup' : 'inject';
            const text = cohort.map(item => item.text).join('\n\n');
            let delivered = false;
            let failure;
            try {
                const first = cohort[0];
                const message = createUserMessage({
                    content: [{ type: 'text', text }],
                    source: {
                        kind: 'plugin', plugin: 'workflow-supervisor', form: 'notice',
                        summary: boundContextSummary(`workflow ${first.input.displayName} ${statusClause(first.input.status)}`),
                    },
                });
                const append = parent?.[lane];
                if (typeof append !== 'function')
                    throw new Error('workflow owner inbox is unavailable');
                await Promise.resolve(append.call(parent, message));
                delivered = true;
            }
            catch (error) {
                failure = error;
                this.ctx?.logger?.warn?.(`workflow-supervisor: completion notice delivery failed: ${renderThrown(error)}`);
            }
            for (const item of cohort) {
                await this.finalize(item, delivered ? 'delivered' : 'abandoned', delivered ? lane : 'enqueue-failed', failure);
                item.resolve(true);
            }
        }
    }
    async finalizeDirect(item, state, reason) {
        await this.finalize(item, state, reason);
    }
    async finalize(item, state, laneOrReason, error) {
        const head = item.input.head;
        const notice = head?.completionNotice;
        if (this.store === undefined || head === undefined || notice?.state !== 'claimed' || item.input.sessionId === undefined)
            return;
        const base = {
            claimId: notice.claimId,
            processEpoch: notice.processEpoch,
            claimedAt: notice.claimedAt,
            finalizedAt: Math.max(Date.now(), notice.claimedAt),
        };
        const finalization = state === 'delivered'
            ? { state, ...base, lane: laneOrReason }
            : {
                state, ...base, reason: laneOrReason,
                ...(error === undefined ? {} : { error: utf8Prefix(renderThrown(error), 65_536) }),
            };
        try {
            await this.store.finalizeCompletionNotice(item.input.sessionId, item.input.runId, head.revision, finalization);
        }
        catch (failure) {
            this.ctx?.logger?.warn?.(`workflow-supervisor: completion notice finalization failed: ${renderThrown(failure)}`);
        }
    }
    humanInput(agent) {
        if (typeof agent === 'object' && agent !== null)
            this.consecutiveWakes.set(agent, 0);
    }
    async whenOwnerQuiescent(agent, signal) {
        for (;;) {
            signal?.throwIfAborted();
            const owner = this.owners.get(agent);
            if (owner === undefined)
                return;
            if (owner.processing !== undefined)
                await owner.processing;
            else
                await new Promise(resolve => queueMicrotask(resolve));
        }
    }
    async dispose() {
        if (this.disposal !== undefined)
            return this.disposal;
        this.disposed = true;
        for (const remove of this.listeners.splice(0)) {
            try {
                remove();
            }
            catch { /* contained */ }
        }
        this.disposal = (async () => {
            // Once disposal starts no new owner turn may be opened.  Every queued
            // claim is nevertheless finalized so a terminal `claimed` row cannot
            // remain pinned forever.
            const pending = [];
            for (const owner of this.owners.values())
                pending.push(...owner.pending.splice(0));
            await Promise.allSettled(pending.map(async (item) => {
                await this.finalize(item, 'abandoned', 'teardown');
                item.resolve(true);
            }));
            await Promise.allSettled([...this.owners.values()].map(owner => owner.processing).filter((value) => value !== undefined));
            this.owners.clear();
            this.reservations.clear();
        })();
        return this.disposal;
    }
}
//# sourceMappingURL=completion-notice.js.map