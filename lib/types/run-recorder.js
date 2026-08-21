import { AsyncLocalStorage } from 'node:async_hooks';
export const name = 'workflow-run-recorder';
export const inject = ['workflowSupervisor', 'agents'];
function renderThrown(error) {
    try {
        return error instanceof Error ? error.message : String(error);
    }
    catch {
        return '[unrenderable thrown value]';
    }
}
function officialStopReason(value) {
    return value === 'completed' ? 'completed' : value === 'cancelled' ? 'cancelled' : value === 'interrupted' ? 'cancelled' : 'error';
}
function officialMemberOutcome(value) {
    return value === 'completed' ? 'completed' : value === 'failed' ? 'failed' : 'cancelled';
}
/**
 * Best-effort durable projection for explicitly attributed top-level launches.
 * Recording failures never alter execution and disable only the corrupt prefix.
 */
export class WorkflowRunRecorder {
    ctx;
    attribution = new AsyncLocalStorage();
    active = new Map();
    recoveries = new Set();
    listeners = [];
    lifetime = new AbortController();
    disposed = false;
    disposal;
    constructor(ctx = {}) {
        this.ctx = ctx;
        this.listen('workflows/run-start', (info) => { this.onRunStart(info); });
        this.listen('workflows/member-start', (info, member) => { this.onMemberStart(info, member); });
        this.listen('workflows/member-end', (info, member) => { this.onMemberEnd(info, member); });
        this.listen('workflows/run-end', (info, result) => { this.onRunEnd(info.id, String(result?.stopReason ?? 'error')); });
        this.listen('agent/created', ({ agent }) => { void this.reconcile(agent); });
        const existing = ctx?.agents?.list?.();
        if (existing && Symbol.iterator in Object(existing))
            for (const agent of existing)
                void this.reconcile(agent);
    }
    listen(event, callback) {
        const remove = this.ctx?.on?.(event, callback);
        if (typeof remove === 'function')
            this.listeners.push(remove);
    }
    /** Attribute exactly the first synchronously published logical id. */
    async launch(session, start) {
        if (this.disposed)
            throw new Error('workflow run recorder is disposed');
        const frame = { session, buffered: new Map() };
        return this.attribution.run(frame, async () => {
            const launched = await start();
            if (frame.runId === undefined) {
                frame.runId = launched.runId;
                if (this.append(session, 'tool-workflow/run-start', { runId: launched.runId, name: launched.displayName })) {
                    this.active.set(launched.runId, this.empty(session));
                    this.replayBeforePublication(frame, launched.runId);
                }
            }
            else if (frame.runId !== launched.runId) {
                this.warn('disabled durable record because launch result changed the logical run id');
                this.active.delete(frame.runId);
            }
            frame.buffered.clear();
            return launched;
        });
    }
    empty(session) {
        return { session, started: new Set(), open: new Set(), pending: [], recovering: false };
    }
    warn(message, error) {
        const suffix = error === undefined ? '' : `: ${renderThrown(error)}`;
        this.ctx?.logger?.warn?.(`workflow-run-recorder: ${message}${suffix}`);
    }
    append(session, type, data) {
        try {
            if (typeof session?.append !== 'function')
                throw new Error('Session.append is unavailable');
            session.append(type, data);
            return true;
        }
        catch (error) {
            this.warn(`disabled durable record after ${type} append failed`, error);
            return false;
        }
    }
    buffer(runId, operation) {
        const frame = this.attribution.getStore();
        if (frame === undefined || frame.runId !== undefined)
            return false;
        const pending = frame.buffered.get(runId) ?? [];
        pending.push(operation);
        frame.buffered.set(runId, pending);
        return true;
    }
    replayBeforePublication(frame, runId) {
        const pending = frame.buffered.get(runId) ?? [];
        frame.buffered.clear();
        for (const operation of pending)
            operation();
    }
    onRunStart(info) {
        const frame = this.attribution.getStore();
        if (frame === undefined || frame.runId !== undefined || this.disposed)
            return;
        frame.runId = info.id;
        if (this.append(frame.session, 'tool-workflow/run-start', { runId: info.id, name: info.displayName })) {
            this.active.set(info.id, this.empty(frame.session));
            this.replayBeforePublication(frame, info.id);
        }
    }
    onMemberStart(info, member) {
        const record = this.active.get(info.id);
        if (record === undefined) {
            this.buffer(info.id, () => this.onMemberStart(info, member));
            return;
        }
        if (record.recovering) {
            record.pending.push({ kind: 'member-start', member });
            return;
        }
        this.appendMemberStart(info.id, record, member);
    }
    appendMemberStart(runId, record, member) {
        if (!Number.isSafeInteger(member.seq) || member.seq < 1 || record.started.has(member.seq)) {
            this.warn(`disabled durable record after duplicate or invalid member start ${String(member.seq)}`);
            this.active.delete(runId);
            return false;
        }
        if (typeof member.childSessionId !== 'string' || member.childSessionId.length === 0) {
            this.warn(`disabled durable record because member start ${String(member.seq)} omitted childId`);
            this.active.delete(runId);
            return false;
        }
        const data = {
            runId, seq: member.seq, label: member.label,
            ...(member.phase === undefined ? {} : { phase: member.phase }),
            childId: member.childSessionId,
        };
        if (!this.append(record.session, 'tool-workflow/agent-start', data)) {
            this.active.delete(runId);
            return false;
        }
        record.started.add(member.seq);
        record.open.add(member.seq);
        return true;
    }
    onMemberEnd(info, member) {
        const record = this.active.get(info.id);
        if (record === undefined) {
            this.buffer(info.id, () => this.onMemberEnd(info, member));
            return;
        }
        if (record.recovering) {
            record.pending.push({ kind: 'member-end', member });
            return;
        }
        this.appendMemberEnd(info.id, record, member);
    }
    appendMemberEnd(runId, record, member) {
        if (!record.started.has(member.seq) || !record.open.has(member.seq) || member.status === 'running') {
            this.warn(`disabled durable record after unpaired member end ${String(member.seq)}`);
            this.active.delete(runId);
            return false;
        }
        if (!this.append(record.session, 'tool-workflow/agent-end', {
            runId, seq: member.seq, outcome: officialMemberOutcome(member.status),
        })) {
            this.active.delete(runId);
            return false;
        }
        record.open.delete(member.seq);
        return true;
    }
    onRunEnd(runId, stopReason) {
        const record = this.active.get(runId);
        if (record === undefined) {
            this.buffer(runId, () => this.onRunEnd(runId, stopReason));
            return;
        }
        if (record.recovering) {
            record.pending.push({ kind: 'run-end', stopReason });
            return;
        }
        if (record.open.size > 0) {
            this.warn('disabled durable record because run-end left members open');
            this.active.delete(runId);
            return;
        }
        this.append(record.session, 'tool-workflow/run-end', { runId, stopReason: officialStopReason(stopReason) });
        this.active.delete(runId);
    }
    seed(session) {
        const open = new Map();
        const events = session?.events;
        if (!events || !(Symbol.iterator in Object(events)))
            return [];
        for (const event of events) {
            const type = event?.type;
            const data = event?.data;
            if (typeof type !== 'string' || !type.startsWith('tool-workflow/') || typeof data?.runId !== 'string')
                continue;
            const runId = data.runId;
            if (type === 'tool-workflow/run-start') {
                if (!open.has(runId))
                    open.set(runId, this.empty(session));
            }
            else if (type === 'tool-workflow/agent-start' && Number.isSafeInteger(data.seq)) {
                open.get(runId)?.started.add(data.seq);
                open.get(runId)?.open.add(data.seq);
            }
            else if (type === 'tool-workflow/agent-end' && Number.isSafeInteger(data.seq))
                open.get(runId)?.open.delete(data.seq);
            else if (type === 'tool-workflow/run-end')
                open.delete(runId);
        }
        const ids = [];
        for (const [runId, record] of open) {
            if (this.active.has(runId))
                continue;
            record.recovering = true;
            this.active.set(runId, record);
            ids.push(runId);
        }
        return ids;
    }
    /** Reconcile unfinished durable Chat prefixes from one atomic supervisor snapshot. */
    async reconcile(agent) {
        if (this.disposed || !agent?.session)
            return;
        const runIds = this.seed(agent.session);
        if (runIds.length === 0)
            return;
        const operation = (async () => {
            const recover = this.ctx?.workflowSupervisor?.recoverSession;
            if (typeof recover === 'function') {
                try {
                    await recover.call(this.ctx.workflowSupervisor, agent, this.lifetime.signal);
                }
                catch (error) {
                    if (!this.lifetime.signal.aborted)
                        this.warn('could not reconcile durable workflow records', error);
                }
            }
            for (const runId of runIds) {
                try {
                    this.lifetime.signal.throwIfAborted();
                    const snapshot = await this.ctx?.workflowSupervisor?.recordingSnapshot?.(agent, runId, this.lifetime.signal);
                    if (snapshot === undefined)
                        this.closeMissing(runId);
                    else
                        this.reconcileSnapshot(runId, snapshot);
                }
                catch (error) {
                    if (!this.lifetime.signal.aborted) {
                        this.warn('could not reconcile durable workflow records', error);
                        this.activate(runId);
                    }
                }
            }
        })();
        this.recoveries.add(operation);
        try {
            await operation;
        }
        finally {
            this.recoveries.delete(operation);
        }
    }
    reconcileSnapshot(runId, snapshot) {
        const record = this.active.get(runId);
        if (record === undefined)
            return;
        const members = Array.isArray(snapshot?.members) ? [...snapshot.members].sort((a, b) => Number(a.seq) - Number(b.seq)) : [];
        for (const member of members)
            if (!record.started.has(member.seq) && !this.appendMemberStart(runId, record, member))
                return;
        for (const member of members)
            if (member.status !== 'running' && record.open.has(member.seq) && !this.appendMemberEnd(runId, record, member))
                return;
        const stopReason = snapshot?.result?.stopReason;
        if (typeof stopReason !== 'string') {
            this.activate(runId);
            return;
        }
        this.closeOpenMembers(runId, record);
        if (!this.active.has(runId))
            return;
        this.append(record.session, 'tool-workflow/run-end', { runId, stopReason: officialStopReason(stopReason) });
        this.active.delete(runId);
    }
    closeOpenMembers(runId, record) {
        for (const seq of [...record.open].sort((a, b) => a - b)) {
            if (!this.append(record.session, 'tool-workflow/agent-end', { runId, seq, outcome: 'cancelled' })) {
                this.active.delete(runId);
                return;
            }
            record.open.delete(seq);
        }
    }
    closeMissing(runId) {
        const record = this.active.get(runId);
        if (record === undefined)
            return;
        this.closeOpenMembers(runId, record);
        if (!this.active.has(runId))
            return;
        this.append(record.session, 'tool-workflow/run-end', { runId, stopReason: 'cancelled' });
        this.active.delete(runId);
    }
    activate(runId) {
        const record = this.active.get(runId);
        if (record === undefined)
            return;
        record.recovering = false;
        const pending = record.pending.splice(0);
        for (const event of pending) {
            if (!this.active.has(runId))
                return;
            if (event.kind === 'member-start') {
                if (!record.started.has(event.member.seq))
                    this.appendMemberStart(runId, record, event.member);
            }
            else if (event.kind === 'member-end') {
                if (!record.started.has(event.member.seq) && !this.appendMemberStart(runId, record, event.member))
                    return;
                if (record.open.has(event.member.seq))
                    this.appendMemberEnd(runId, record, event.member);
            }
            else
                this.onRunEnd(runId, event.stopReason);
        }
    }
    async dispose() {
        if (this.disposal !== undefined)
            return this.disposal;
        this.disposed = true;
        this.lifetime.abort(new Error('workflow run recorder disposed'));
        for (const remove of this.listeners.splice(0)) {
            try {
                remove();
            }
            catch { /* contained */ }
        }
        this.disposal = (async () => {
            await Promise.allSettled([...this.recoveries]);
            this.active.clear();
            this.attribution.disable();
        })();
        return this.disposal;
    }
}
export default WorkflowRunRecorder;
//# sourceMappingURL=run-recorder.js.map