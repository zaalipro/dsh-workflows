import { createHash, randomBytes } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { validateDefinitionEnvelope } from '../registry/definition.js';
import { openRunScratch } from './storage/run-files.js';
import { WorkflowCompletionNotifier } from './completion-notice.js';
import { childTranscriptValue, memberOutcomeWithTranscript, snapshotWorkflowJsonValue, workflowRunValueView, } from './value-view.js';
import { VALIDATION_NOTE, } from './types.js';
import { WorkflowPackageError } from '../invariant.js';
import { scriptWithJobMapParallel } from './parallel-compat.js';
import { adaptEngineHandle, rejectPartialEngineHandle, } from './engine-compat.js';
export * from './types.js';
export * from './value-view.js';
export * from './completion-notice.js';
export * from './engine-compat.js';
const TERMINAL = new Set(['completed', 'failed', 'cancelled', 'interrupted']);
const ACTIVE = new Set(['running', 'pausing', 'stopping', 'needs-input', 'paused', 'budget-limited']);
const SCRATCH_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;
const encoder = new TextEncoder();
function opaqueId() { return randomBytes(16).toString('hex'); }
function sessionOf(agent) {
    const value = agent?.session?.id ?? agent?.session?.header?.id ?? agent?.sessionId;
    if (typeof value !== 'string' || value.length === 0)
        throw new WorkflowPackageError('workflow start requires a calling Agent with a Session', 'WORKFLOW_INVALID_STATE');
    return value;
}
function renderThrown(error) {
    try {
        return error instanceof Error ? error.message : String(error);
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
/** Relabel engine `workflow:${meta.name}` frames with the package filename. */
function rewriteValidationDiagnostic(message, filename, metaName) {
    let rewritten = message;
    if (metaName.length > 0)
        rewritten = rewritten.replaceAll(`workflow:${metaName}`, filename);
    if (rewritten.includes(filename))
        return rewritten;
    return `${filename}: ${rewritten}`;
}
/** Collapse every gate smoke-stop into one product string. */
function productWouldPause(value, maxBytes) {
    const raw = utf8Prefix(String(value ?? ''), maxBytes);
    const message = raw.replace(/^would pause(?:\s*\([^)]*\))?:\s*/iu, '').trim();
    return `would pause: ${message}`;
}
function numericCursor(cursor, total) {
    if (cursor === undefined)
        return 0;
    if (!/^\d+$/u.test(String(cursor)))
        throw new WorkflowPackageError('workflow page cursor is invalid', 'WORKFLOW_CURSOR_INVALID');
    const value = Number(cursor);
    if (!Number.isSafeInteger(value) || value < 0 || value > total)
        throw new WorkflowPackageError('workflow page cursor is invalid', 'WORKFLOW_CURSOR_INVALID');
    return value;
}
function pageLimit(value) {
    const result = value ?? 50;
    if (!Number.isSafeInteger(result) || result < 1 || result > 200)
        throw new WorkflowPackageError('workflow page limit must be a safe integer from 1 through 200', 'WORKFLOW_LIMIT');
    return result;
}
function nextCursor(offset, count, total) {
    return offset + count < total ? String(offset + count) : undefined;
}
function memberCounts(detail) {
    const members = detail.members ?? [];
    return {
        total: members.length,
        running: members.filter(member => member.status === 'running').length,
        completed: members.filter(member => member.status === 'completed').length,
        failed: members.filter(member => member.status === 'failed').length,
        cancelled: members.filter(member => member.status === 'cancelled').length,
    };
}
function headView(head) {
    const terminal = TERMINAL.has(head.status) && head.stopReason !== undefined
        ? {
            stopReason: head.stopReason === 'budget-limited' ? 'error' : head.stopReason,
            resultState: head.status === 'completed' ? 'available' : 'not-produced',
            ...(head.terminalPreview === undefined ? {} : { preview: head.terminalPreview }),
            ...(head.error === undefined ? {} : { error: head.error }),
        }
        : undefined;
    return {
        runId: head.runId,
        displayName: head.displayName,
        name: head.name,
        description: head.description ?? '',
        status: head.status,
        ...(head.phase === undefined ? {} : { phase: head.phase }),
        budget: { ...head.budget }, memberCounts: { ...head.memberCounts },
        startedAt: head.startedAt,
        ...(head.settledAt === undefined ? {} : { settledAt: head.settledAt }),
        ...(terminal === undefined ? {} : { terminal }),
        allowedActions: (head.allowedActions ?? []),
        revision: head.revision, detailRevision: head.detailRevision,
        membersRevision: head.membersRevision, logsRevision: head.logsRevision,
        resultRevision: head.resultRevision, artifactsRevision: head.artifactsRevision,
    };
}
function checkpointCallCompare(left, right) {
    const size = Math.max(left.callId.length, right.callId.length);
    for (let index = 0; index < size; index += 1) {
        const a = left.callId[index];
        const b = right.callId[index];
        if (a === undefined)
            return -1;
        if (b === undefined)
            return 1;
        if (a !== b)
            return a - b;
    }
    return 0;
}
function isJsonRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function valueViewFromStored(value, outcome, maxBytes) {
    if (outcome === 'pending')
        return { state: 'pending' };
    if (outcome === 'not-produced')
        return { state: 'not-produced' };
    if (outcome === 'evicted')
        return { state: 'evicted' };
    // `available` is meaningful even when the value is JSON null.  A malformed
    // old sidecar is treated as an evicted projection rather than allowing an
    // untrusted undefined value to cross the browser boundary.
    if (value === undefined)
        return { state: 'evicted' };
    try {
        return workflowRunValueView(value, maxBytes);
    }
    catch {
        return { state: 'evicted' };
    }
}
/** Durable logical-run supervisor backed only by the compatible official engine. */
export class WorkflowSupervisor {
    ctx;
    static inject = ['workflowEngine', 'workflows'];
    config;
    store;
    registry;
    runs = new Map();
    byDisplay = new Map();
    /** Persisted rows recovered after process death have inspection authority
     * but deliberately no executable `InternalRun`/Agent authority. */
    recoveredById = new Map();
    recoveredByDisplay = new Map();
    executions = new Map();
    sessionRevisions = new Map();
    activeSessions = new Map();
    activeTotal = 0;
    pendingStarts = new Set();
    closedOwners = new WeakSet();
    ownerDisposals = new Map();
    listenerDisposers = [];
    notifier;
    ownsStore;
    feedEpoch = opaqueId();
    initializePromise;
    admission = true;
    disposed = false;
    disposal;
    constructor(ctx, config = {}, store) {
        this.ctx = ctx;
        this.config = {
            defaultAgentBudget: config.defaultAgentBudget ?? 128,
            maxAgentBudget: config.maxAgentBudget ?? 1_024,
            maxConcurrentAgents: config.maxConcurrentAgents ?? 32,
            maxActiveRunsPerSession: config.maxActiveRunsPerSession ?? 64,
            maxActiveRunsGlobal: config.maxActiveRunsGlobal ?? config.maxActiveRuns ?? 1_024,
            saveScope: config.saveScope ?? 'project',
            completionNoticeMaxBytes: config.completionNoticeMaxBytes ?? 16_384,
            completionCohortMaxItems: config.completionCohortMaxItems ?? 20,
            completionCohortMaxBytes: config.completionCohortMaxBytes ?? 262_144,
            maxConsecutiveCompletionWakes: config.maxConsecutiveCompletionWakes ?? 3,
            memberOutcomeMaxBytes: config.memberOutcomeMaxBytes ?? 131_072,
            maxRetainedRunsPerSession: config.maxRetainedRunsPerSession ?? 256,
            maxWorkflowNamesPerSession: config.maxWorkflowNamesPerSession ?? 4_096,
            maxRecoveryEntries: config.maxRecoveryEntries ?? 4_096,
            maxMembersPerRun: config.maxMembersPerRun ?? 2_048,
            maxManifestBytes: config.maxManifestBytes ?? 8_388_608,
            maxRunDetailsBytes: config.maxRunDetailsBytes ?? 33_554_432,
            maxRunStoreBytes: config.maxRunStoreBytes ?? 536_870_912,
            maxLogLines: config.maxLogLines ?? 4_096,
            maxLogLineBytes: config.maxLogLineBytes ?? 65_536,
            maxLogTotalBytes: config.maxLogTotalBytes ?? 33_554_432,
            maxEventTextBytes: config.maxEventTextBytes ?? 65_536,
            remoteHeadTextMaxBytes: config.remoteHeadTextMaxBytes ?? 131_072,
            maxScriptProjectionBytes: config.maxScriptProjectionBytes ?? 1_048_576,
            maxRetainedArtifactsPerRun: config.maxRetainedArtifactsPerRun ?? 256,
            artifactChunkDefaultBytes: config.artifactChunkDefaultBytes ?? 32_768,
            artifactChunkMaxBytes: config.artifactChunkMaxBytes ?? 131_072,
            scratchMaxOperations: config.scratchMaxOperations ?? 4_096,
            scratchMaxPendingOperations: config.scratchMaxPendingOperations ?? 64,
            scratchMaxFiles: config.scratchMaxFiles ?? 64,
            scratchMaxFileBytes: config.scratchMaxFileBytes ?? 1_048_576,
            scratchMaxTotalBytes: config.scratchMaxTotalBytes ?? 8_388_608,
            maxActiveRuns: config.maxActiveRuns ?? 1_024,
        };
        if (this.config.defaultAgentBudget > this.config.maxAgentBudget || this.config.maxAgentBudget > 1_024)
            throw new RangeError('workflow supervisor agent budget configuration is invalid');
        if (this.config.maxActiveRunsPerSession > this.config.maxActiveRunsGlobal)
            throw new RangeError('maxActiveRunsPerSession must not exceed maxActiveRunsGlobal');
        if (this.config.maxMembersPerRun < this.config.maxAgentBudget)
            throw new RangeError('maxMembersPerRun must be at least maxAgentBudget');
        this.ownsStore = store === undefined && ctx?.workflowStore === undefined;
        this.store = store ?? ctx?.workflowStore;
        if (this.store === undefined)
            throw new WorkflowPackageError('workflow storage is unavailable', 'WORKFLOW_STORAGE_UNSUPPORTED');
        this.registry = ctx?.workflows;
        this.notifier = new WorkflowCompletionNotifier(ctx, this.store, {
            maxBytes: this.config.completionNoticeMaxBytes,
            maxItems: this.config.completionCohortMaxItems,
            maxCohortBytes: this.config.completionCohortMaxBytes,
            maxConsecutiveWakes: this.config.maxConsecutiveCompletionWakes,
        });
        this.attachEngineObservers();
    }
    listen(event, callback) {
        const result = this.ctx?.on?.(event, callback);
        if (typeof result === 'function')
            this.listenerDisposers.push(result);
    }
    attachEngineObservers() {
        this.listen('workflow/phase', (info, title) => {
            this.withAttempt(info?.id, (run, attempt) => this.enqueue(run, async () => {
                if (!this.currentAttempt(run, attempt))
                    return;
                const phase = utf8Prefix(String(title), this.config.maxEventTextBytes);
                await this.commitActive(run, { phase }, 'detail');
            }));
        });
        this.listen('workflow/log', (info, message) => {
            this.withAttempt(info?.id, (run, attempt) => this.enqueue(run, async () => {
                if (!this.currentAttempt(run, attempt))
                    return;
                const text = utf8Prefix(String(message), Math.min(this.config.maxLogLineBytes, this.config.maxEventTextBytes));
                const logs = [...(run.detail.logs ?? []), { index: (run.detail.logs?.at(-1)?.index ?? -1) + 1, text }];
                let bytes = logs.reduce((total, line) => total + encoder.encode(line.text).byteLength, 0);
                while (logs.length > this.config.maxLogLines || bytes > this.config.maxLogTotalBytes) {
                    const removed = logs.shift();
                    if (removed !== undefined)
                        bytes -= encoder.encode(removed.text).byteLength;
                }
                run.detail = { ...run.detail, logs };
                await this.commitActive(run, {}, 'logs');
            }));
        });
        this.listen('workflow/agent-start', (info, member) => {
            this.withAttempt(info?.id, (run, attempt) => this.enqueue(run, async () => {
                if (!this.currentAttempt(run, attempt))
                    return;
                const sequence = Number(member?.seq);
                if (!Number.isSafeInteger(sequence) || sequence < 1 || run.detail.members?.some(item => item.seq === sequence))
                    return;
                if ((run.detail.members?.length ?? 0) >= this.config.maxMembersPerRun) {
                    attempt.intent = 'stop';
                    attempt.handle.cancel('workflow member retention limit exceeded');
                    return;
                }
                const stored = {
                    memberId: opaqueId(), seq: sequence,
                    label: utf8Prefix(String(member?.label ?? ''), this.config.maxEventTextBytes) || `member-${sequence}`,
                    ...(member?.phase === undefined ? {} : { phase: utf8Prefix(String(member.phase), this.config.maxEventTextBytes) }),
                    status: 'running', outcome: 'pending',
                    ...(typeof member?.childId === 'string' && member.childId.length > 0 ? { childSessionId: member.childId } : {}),
                    startedAt: Date.now(),
                };
                run.detail = { ...run.detail, members: [...(run.detail.members ?? []), stored] };
                const spent = run.head.budget.spent + 1;
                run.head = {
                    ...run.head,
                    budget: { ...run.head.budget, spent, remaining: Math.max(0, run.head.budget.total - spent) },
                };
                await this.commitActive(run, { budget: run.head.budget }, 'members');
                await this.publishLifecycle(run, 'workflows/member-start', this.info(run), this.memberLifecycle(stored));
            }));
        });
        this.listen('workflow/journal-commit', (info, entry) => {
            this.withAttempt(info?.id, (run, attempt) => this.enqueue(run, async () => {
                if (!this.currentAttempt(run, attempt) || entry?.kind !== 'agent' || !Number.isSafeInteger(entry?.seq))
                    return;
                const members = [...(run.detail.members ?? [])];
                const index = members.findIndex(member => member.seq === entry.seq);
                if (index < 0)
                    return;
                let value;
                try {
                    value = snapshotWorkflowJsonValue(entry.result);
                }
                catch {
                    return;
                }
                members[index] = { ...members[index], outcome: 'available', value };
                run.detail = { ...run.detail, members };
                await this.commitActive(run, {}, 'members');
            }));
        });
        this.listen('workflow/agent-end', (info, member) => {
            this.withAttempt(info?.id, (run, attempt) => this.enqueue(run, async () => {
                if (!this.currentAttempt(run, attempt) || !Number.isSafeInteger(member?.seq))
                    return;
                const members = [...(run.detail.members ?? [])];
                const index = members.findIndex(candidate => candidate.seq === member.seq);
                if (index < 0 || members[index].status !== 'running')
                    return;
                const status = member?.outcome === 'completed' || member?.outcome === 'failed' || member?.outcome === 'cancelled'
                    ? member.outcome : 'failed';
                let captured;
                if (members[index].outcome === 'pending') {
                    const raw = member.result ?? member.value;
                    if (raw !== undefined) {
                        try {
                            captured = snapshotWorkflowJsonValue(raw);
                        }
                        catch {
                            captured = undefined;
                        }
                    }
                    captured ??= childTranscriptValue(this.ctx, member?.childId ?? members[index].childSessionId);
                }
                const stored = {
                    ...members[index], status, settledAt: Date.now(),
                    ...(captured !== undefined
                        ? { outcome: 'available', value: captured }
                        : members[index].outcome === 'pending' ? { outcome: 'not-produced' } : {}),
                };
                members[index] = stored;
                run.detail = { ...run.detail, members };
                await this.commitActive(run, {}, 'members');
                await this.publishLifecycle(run, 'workflows/member-end', this.info(run), this.memberLifecycle(stored));
            }));
        });
        this.listen('workflow/gate', (info, gate) => {
            this.withAttempt(info?.id, (run, attempt) => this.enqueue(run, async () => {
                if (!this.currentAttempt(run, attempt) || run.head.status === 'stopping' || run.head.status === 'pausing')
                    return;
                this.clearGate(run);
                const bounded = {
                    kind: ['user', 'back_off', 'no_progress', 'verification', 'infra'].includes(String(gate?.kind)) ? gate.kind : 'infra',
                    message: utf8Prefix(String(gate?.message ?? ''), this.config.maxEventTextBytes),
                    resumable: gate?.resumable === true,
                };
                const record = {
                    generation: attempt.generation, executionId: attempt.executionId,
                    gateId: opaqueId(), gate: bounded, abort: new AbortController(),
                };
                run.gate = record;
                await this.commitActive(run, { status: 'needs-input' }, 'detail');
                this.emit('workflows/gate-request', {
                    info: this.info(run), executionId: record.executionId, gateId: record.gateId,
                    gate: bounded, parent: run.parent, signal: record.abort.signal,
                });
            }));
        });
        this.listen('agent/disposed', ({ agent }) => { void this.disposeOwner(agent); });
    }
    async initialize(signal) {
        if (this.initializePromise === undefined) {
            this.initializePromise = (async () => {
                signal?.throwIfAborted();
                const recovered = await this.store.initialize(signal);
                for (const recoveredHead of recovered) {
                    const sessionId = typeof recoveredHead.sessionId === 'string' ? String(recoveredHead.sessionId) : undefined;
                    if (sessionId !== undefined) {
                        this.sessionRevisions.set(sessionId, Math.max(this.sessionRevisions.get(sessionId) ?? 0, recoveredHead.revision));
                        this.recoveredById.set(recoveredHead.runId, recoveredHead);
                        this.recoveredByDisplay.set(this.displayKey(sessionId, recoveredHead.displayName), recoveredHead);
                    }
                }
            })();
        }
        return this.initializePromise;
    }
    emit(name, ...args) {
        try {
            if (typeof this.ctx?.emit === 'function')
                this.ctx.emit(name, ...args);
            else if (this.ctx?.events?.dispatch !== undefined) {
                for (const callback of this.ctx.events.dispatch('emit', [name, ...args])) {
                    try {
                        void Promise.resolve(callback(...args)).catch(error => this.ctx?.logger?.warn?.(`workflow supervisor ${name} listener rejected`, error));
                    }
                    catch (error) {
                        this.ctx?.logger?.warn?.(`workflow supervisor ${name} listener threw`, error);
                    }
                }
            }
        }
        catch (error) {
            this.ctx?.logger?.warn?.(`workflow supervisor ${name} observer failed`, error);
        }
    }
    publishLifecycle(run, name, ...args) {
        const operation = run.lifecycleTail.then(() => { this.emit(name, ...args); });
        run.lifecycleTail = operation.catch(error => { this.ctx?.logger?.warn?.('workflow lifecycle publication failed', error); });
        return operation;
    }
    publishChange(run) {
        const revision = (this.sessionRevisions.get(run.sessionId) ?? 0) + 1;
        this.sessionRevisions.set(run.sessionId, revision);
        this.emit('workflows/run-change', { kind: 'invalidate', sessionId: run.sessionId, revision });
    }
    enqueue(run, operation) {
        const result = run.tail.then(operation, operation);
        run.tail = result.then(() => undefined, error => { this.ctx?.logger?.warn?.('workflow run mutation failed', error); });
        return result;
    }
    withAttempt(executionId, callback) {
        if (typeof executionId !== 'string')
            return;
        const lookup = this.executions.get(executionId);
        if (lookup === undefined)
            return;
        const attempt = lookup.run.attempt;
        if (attempt === undefined || attempt.generation !== lookup.generation || attempt.executionId !== executionId)
            return;
        callback(lookup.run, attempt);
    }
    currentAttempt(run, attempt) {
        return run.attempt === attempt && run.generation === attempt.generation;
    }
    info(run) {
        return { id: run.id, displayName: run.head.displayName, name: run.meta.name };
    }
    memberLifecycle(member) {
        return {
            memberId: member.memberId, seq: member.seq, label: member.label,
            ...(member.phase === undefined ? {} : { phase: member.phase }),
            childSessionId: member.childSessionId ?? '', status: member.status,
        };
    }
    resolveSource(spec) {
        if (spec.definition !== undefined) {
            if (spec.script !== undefined || spec.meta !== undefined)
                throw new WorkflowPackageError('workflow launch must select either a definition or an inline script plus meta', 'WORKFLOW_DEFINITION_INVALID');
            const meta = {
                name: spec.definition.name, description: spec.definition.description,
                ...(spec.definition.whenToUse === undefined ? {} : { whenToUse: spec.definition.whenToUse }),
                ...(spec.definition.phases === undefined ? {} : { phases: [...spec.definition.phases] }),
            };
            const clean = validateDefinitionEnvelope({ meta, script: spec.definition.script });
            return { script: clean.script, meta: clean.meta, builtIn: spec.definition.scope === 'bundled' };
        }
        if (spec.script === undefined || spec.meta === undefined)
            throw new WorkflowPackageError('inline workflow launch requires both script and meta', 'WORKFLOW_DEFINITION_INVALID');
        const clean = validateDefinitionEnvelope({ meta: spec.meta, script: spec.script });
        return { script: clean.script, meta: clean.meta, builtIn: false };
    }
    resolveBudget(value) {
        const budget = value ?? this.config.defaultAgentBudget;
        if (!Number.isSafeInteger(budget) || budget < 1 || budget > this.config.maxAgentBudget) {
            throw new WorkflowPackageError(`agent_budget must be a safe integer from 1 through ${this.config.maxAgentBudget}`, 'WORKFLOW_LIMIT');
        }
        return budget;
    }
    snapshotArgs(value) {
        const snapshot = snapshotWorkflowJsonValue(value ?? {});
        if (snapshot === null || Array.isArray(snapshot) || typeof snapshot !== 'object')
            throw new WorkflowPackageError('workflow args must be a JSON object (wrap arrays/scalars in a field)', 'WORKFLOW_DEFINITION_INVALID');
        return snapshot;
    }
    reserveStart(parent) {
        if (!this.admission || this.disposed)
            throw new WorkflowPackageError('workflow supervisor is shutting down', 'WORKFLOW_INVALID_STATE');
        if (typeof parent === 'object' && parent !== null && this.closedOwners.has(parent)) {
            throw new WorkflowPackageError('workflow owner is shutting down', 'WORKFLOW_INVALID_STATE');
        }
        const sessionId = sessionOf(parent);
        const sessionCount = (this.activeSessions.get(sessionId) ?? 0) + [...this.pendingStarts].filter(item => item.sessionId === sessionId).length;
        if (sessionCount >= this.config.maxActiveRunsPerSession) {
            throw new WorkflowPackageError(`workflow active-run limit reached for this Session (${this.config.maxActiveRunsPerSession})`, 'WORKFLOW_LIMIT');
        }
        if (this.activeTotal + this.pendingStarts.size >= this.config.maxActiveRunsGlobal) {
            throw new WorkflowPackageError(`workflow global active-run limit reached (${this.config.maxActiveRunsGlobal})`, 'WORKFLOW_LIMIT');
        }
        let finish;
        const done = new Promise(resolve => { finish = resolve; });
        const record = { controller: new AbortController(), sessionId, parent, durable: false, done, finish };
        this.pendingStarts.add(record);
        return record;
    }
    releaseStart(record) {
        if (!this.pendingStarts.delete(record))
            return;
        record.finish();
    }
    scratchLimits() {
        return {
            maxOperations: this.config.scratchMaxOperations,
            maxPendingOperations: this.config.scratchMaxPendingOperations,
            maxFiles: this.config.scratchMaxFiles,
            maxFileBytes: this.config.scratchMaxFileBytes,
            maxTotalBytes: this.config.scratchMaxTotalBytes,
        };
    }
    async createScratch(head) {
        const layout = this.ctx?.workflowStorage?.layout;
        if (layout !== undefined)
            return openRunScratch(layout, head.runDirectory, this.scratchLimits());
        throw new WorkflowPackageError('descriptor-rooted workflow scratch access is unavailable', 'WORKFLOW_STORAGE_UNSUPPORTED');
    }
    /** Admit one run durably, attach a deferred attempt, then return before settlement. */
    async start(spec) {
        if (!spec.parent)
            throw new WorkflowPackageError('workflow start requires a calling agent', 'WORKFLOW_INVALID_STATE');
        const source = this.resolveSource(spec);
        const args = this.snapshotArgs(spec.args);
        const budget = this.resolveBudget(spec.agentBudget);
        const pending = this.reserveStart(spec.parent);
        const admissionSignal = spec.signal === undefined
            ? pending.controller.signal
            : AbortSignal.any([spec.signal, pending.controller.signal]);
        // This variable is switched by the store's durable callback, not by the
        // insertion promise's eventual return.  That distinction closes the tiny
        // but important window where a caller abort can otherwise cancel setup
        // after the manifest has become durable.
        let setupSignal = admissionSignal;
        let committedHead;
        let runId;
        let startedAt = 0;
        let run;
        try {
            await this.initialize(admissionSignal);
            admissionSignal.throwIfAborted();
            runId = opaqueId();
            startedAt = Date.now();
            const inserted = await this.store.insertWithNextDisplayName({
                sessionId: pending.sessionId, name: source.meta.name, runId,
                script: source.script, description: source.meta.description,
                args: args, budgetTotal: budget,
                onDurable: head => {
                    pending.durable = true;
                    committedHead = head;
                    setupSignal = pending.controller.signal;
                },
            }, identity => {
                const saveAvailable = !source.builtIn && !identity.numberedHandle;
                return {
                    head: {
                        description: source.meta.description, status: 'running',
                        budget: { total: budget, spent: 0, remaining: budget },
                        memberCounts: { total: 0, running: 0, completed: 0, failed: 0, cancelled: 0 },
                        startedAt, detailRevision: 1, membersRevision: 1, logsRevision: 1,
                        resultRevision: 1, artifactsRevision: 1, executionAvailable: true,
                        saveAvailable, allowedActions: saveAvailable ? ['pause', 'stop', 'save'] : ['pause', 'stop'],
                    },
                    detail: {
                        members: [], logs: [], result: { state: 'pending' },
                        ...(source.meta.phases === undefined ? {} : { phases: source.meta.phases.map(phase => ({ title: phase.title })) }),
                        artifacts: [],
                    },
                };
            }, admissionSignal);
            // Stores predating the callback seam still reach this fallback; the
            // built-in file store invokes it at the manifest commit point above.
            pending.durable = true;
            setupSignal = pending.controller.signal;
            run = {
                id: runId, sessionId: pending.sessionId, meta: source.meta, script: source.script,
                args, parent: spec.parent, runDirectory: inserted.runDirectory,
                ownerController: pending.controller,
                scriptPath: inserted.scriptPath ?? '', builtIn: source.builtIn, startedAt,
                head: inserted,
                detail: {
                    members: [], logs: [], result: { state: 'pending' },
                    ...(source.meta.phases === undefined ? {} : { phases: source.meta.phases.map(phase => ({ title: phase.title })) }),
                    artifacts: [],
                },
                generation: 0, tail: Promise.resolve(), lifecycleTail: Promise.resolve(), active: true,
            };
            setupSignal.throwIfAborted();
            run.scratch = await this.createScratch(inserted);
            const attempt = this.createAttempt(run);
            run.attempt = attempt;
            run.generation = attempt.generation;
            this.executions.set(attempt.executionId, { run, generation: attempt.generation });
            this.runs.set(run.id, run);
            this.byDisplay.set(this.displayKey(run.sessionId, run.head.displayName), run);
            if (!this.admission && run.closing === undefined)
                run.closing = 'supervisor';
            this.activeTotal += 1;
            this.activeSessions.set(run.sessionId, (this.activeSessions.get(run.sessionId) ?? 0) + 1);
            this.startObservation(run, attempt);
            await this.publishLifecycle(run, 'workflows/run-start', this.info(run));
            this.publishChange(run);
            try {
                this.releaseDeferredAttempt(run, attempt);
            }
            catch (error) {
                attempt.intent = 'running';
                attempt.handle.cancel('workflow deferred release failed');
                await attempt.quiescent.catch(() => undefined);
                await this.enqueue(run, () => this.failAfterAdmission(run, `workflow launch failed: ${renderThrown(error)}`));
                throw error;
            }
            return { status: 'started', displayName: inserted.displayName, runId, scriptPath: inserted.scriptPath };
        }
        catch (error) {
            // A store may fail during post-publication accounting.  The callback
            // still gave us the committed head, so retain/terminalize that history
            // rather than pretending the insertion was rolled back.
            if (pending.durable && run === undefined && committedHead !== undefined) {
                run = {
                    id: runId,
                    sessionId: pending.sessionId, meta: source.meta, script: source.script,
                    args, parent: spec.parent, ownerController: pending.controller,
                    runDirectory: committedHead.runDirectory, scriptPath: committedHead.scriptPath ?? '',
                    builtIn: source.builtIn, startedAt,
                    head: committedHead,
                    detail: {
                        members: [], logs: [], result: { state: 'pending' },
                        ...(source.meta.phases === undefined ? {} : { phases: source.meta.phases.map(phase => ({ title: phase.title })) }),
                        artifacts: [],
                    },
                    generation: 0, tail: Promise.resolve(), lifecycleTail: Promise.resolve(), active: true,
                };
            }
            if (pending.durable && run !== undefined && !this.runs.has(run.id)) {
                this.runs.set(run.id, run);
                this.byDisplay.set(this.displayKey(run.sessionId, run.head.displayName), run);
                if (!this.admission && run.closing === undefined)
                    run.closing = 'supervisor';
                this.activeTotal += 1;
                this.activeSessions.set(run.sessionId, (this.activeSessions.get(run.sessionId) ?? 0) + 1);
                await this.failAfterAdmission(run, `workflow launch failed: ${renderThrown(error)}`).catch(failure => this.ctx?.logger?.warn?.('workflow admission terminalization failed', failure));
            }
            throw error;
        }
        finally {
            this.releaseStart(pending);
        }
    }
    createAttempt(run) {
        const engine = this.ctx?.workflowEngine;
        if (engine === undefined || typeof engine.start !== 'function')
            throw new WorkflowPackageError('workflow engine is unavailable', 'WORKFLOW_INVALID_STATE');
        const generation = run.generation + 1;
        const checkpoint = run.checkpoint;
        const scratch = run.scratch;
        const request = {
            script: scriptWithJobMapParallel(run.script), meta: run.meta, args: run.args,
            maxTotalAgents: run.head.budget.total,
            parent: run.parent,
            signal: run.ownerController.signal,
            deferStart: true,
            ...(checkpoint === undefined ? { replay: {} } : { replay: { checkpoint } }),
            ...(scratch === undefined ? {} : {
                scratch: {
                    read: (name, signal) => scratch.read(name, signal),
                    write: (name, content, signal) => scratch.write(name, content, signal),
                },
            }),
        };
        let raw;
        try {
            raw = engine.start(request);
        }
        catch (error) {
            throw new WorkflowPackageError(`workflow engine could not start: ${renderThrown(error)}`, 'WORKFLOW_INVALID_STATE', { cause: error });
        }
        const handle = adaptEngineHandle(raw);
        if (handle === undefined) {
            rejectPartialEngineHandle(raw);
            throw new WorkflowPackageError('workflow engine returned an invalid run handle', 'WORKFLOW_INVALID_STATE');
        }
        const executionId = typeof handle.id === 'string' && handle.id.length > 0 ? handle.id : opaqueId();
        const quiescent = (async () => {
            let result;
            let resultFailure;
            try {
                result = await handle.result;
            }
            catch (error) {
                resultFailure = error;
            }
            let cleanupError;
            try {
                await handle.dispose();
            }
            catch (error) {
                cleanupError = renderThrown(error);
            }
            let captured;
            try {
                captured = handle.checkpoint();
            }
            catch (error) {
                // Every supervisor attempt opts into replay, so unavailable checkpoint
                // authority after quiescence is actionable even for the first attempt.
                if (resultFailure === undefined)
                    resultFailure = error;
            }
            if (resultFailure !== undefined)
                throw resultFailure;
            if (result === undefined)
                throw new WorkflowPackageError('workflow attempt settled without a result', 'WORKFLOW_INVALID_STATE');
            return { result, checkpoint: captured, ...(cleanupError === undefined ? {} : { cleanupError }) };
        })();
        const attempt = {
            generation, executionId, handle, intent: 'running', quiescent, observation: Promise.resolve(),
        };
        // Keep the executor's promise observed even when a caller abandons a
        // control wait. The supervisor remains owner after durable admission.
        void quiescent.catch(error => this.ctx?.logger?.warn?.('workflow attempt settlement failed', error));
        return attempt;
    }
    /** One-shot release is skipped after owner/supervisor teardown or cancel so
     * a racing start/resume cannot Go a cancelled inert attempt. */
    shouldReleaseAttempt(run, attempt) {
        return run.closing === undefined
            && !this.disposed
            && !run.ownerController.signal.aborted
            && attempt.intent === 'running';
    }
    releaseDeferredAttempt(run, attempt) {
        if (!this.shouldReleaseAttempt(run, attempt))
            return;
        attempt.handle.release();
    }
    startObservation(run, attempt) {
        attempt.observation = attempt.quiescent.then(outcome => this.enqueue(run, () => this.settleAttempt(run, attempt, outcome)), error => this.enqueue(run, () => this.settleAttempt(run, attempt, {
            result: { value: null, stopReason: 'error', error: renderThrown(error), agentsStarted: run.head.budget.spent },
        }))).then(() => undefined);
        void attempt.observation.catch(error => this.ctx?.logger?.warn?.('workflow attempt observer failed', error));
    }
    async settleAttempt(run, attempt, outcome) {
        if (!this.currentAttempt(run, attempt))
            return;
        this.executions.delete(attempt.executionId);
        run.attempt = undefined;
        this.clearGate(run);
        const result = outcome.result;
        if (outcome.checkpoint !== undefined) {
            try {
                this.acceptCheckpoint(run, outcome.checkpoint);
            }
            catch (error) {
                if (attempt.intent === 'running' || attempt.intent === 'pause') {
                    await this.terminalize(run, 'failed', `workflow replay checkpoint diverged: ${renderThrown(error)}`, undefined);
                    return;
                }
            }
        }
        const spent = Math.max(run.head.budget.spent, Number(result.agentsStarted) || 0, outcome.checkpoint?.agentSpend ?? 0);
        if (outcome.cleanupError !== undefined && attempt.intent !== 'teardown') {
            await this.terminalize(run, 'failed', `workflow attempt cleanup failed: ${outcome.cleanupError}`, undefined, spent);
            return;
        }
        if (attempt.intent === 'pause') {
            if (outcome.checkpoint === undefined) {
                await this.terminalize(run, 'failed', 'workflow checkpoint is unavailable after pause', undefined, spent);
                return;
            }
            run.head = { ...run.head, budget: { ...run.head.budget, spent, remaining: Math.max(0, run.head.budget.total - spent) } };
            await this.commitActive(run, { status: 'paused', budget: run.head.budget }, 'result');
            return;
        }
        if (attempt.intent === 'stop') {
            await this.terminalize(run, 'cancelled', result.error ?? 'stopped by user', undefined, spent);
            return;
        }
        if (attempt.intent === 'teardown') {
            await this.terminalize(run, 'interrupted', 'Process exited before workflow settlement.', undefined, spent);
            return;
        }
        if (result.errorCode === 'AGENT_CAP') {
            const ended = this.settleRunningMembers(run);
            run.head = { ...run.head, budget: { ...run.head.budget, spent, remaining: Math.max(0, run.head.budget.total - spent) } };
            await this.commitActive(run, { status: 'budget-limited', budget: run.head.budget }, 'members');
            for (const member of ended)
                await this.publishLifecycle(run, 'workflows/member-end', this.info(run), member);
            return;
        }
        // A worker cancellation without a supervisor intent is an execution
        // failure (for example worker death or an unowned abort), not a user Stop.
        const status = result.stopReason === 'completed' ? 'completed' : 'failed';
        await this.terminalize(run, status, result.error, status === 'completed' ? result.value : undefined, spent);
    }
    acceptCheckpoint(run, checkpoint) {
        if (!Array.isArray(checkpoint.journal)
            || !Number.isSafeInteger(checkpoint.agentSpend) || checkpoint.agentSpend < 0
            || !Number.isSafeInteger(checkpoint.agentSeq) || checkpoint.agentSeq < 0) {
            throw new WorkflowPackageError('workflow checkpoint is invalid', 'WORKFLOW_INVALID_STATE');
        }
        const callIds = new Set();
        const agentSequences = new Set();
        let agentEntries = 0;
        let maximumSequence = 0;
        for (const entry of checkpoint.journal) {
            if (entry === null || typeof entry !== 'object'
                || !Array.isArray(entry.callId) || entry.callId.length === 0
                || entry.callId.some((part) => !Number.isSafeInteger(part) || part <= 0)
                || !/^[a-f0-9]{64}$/u.test(entry.fingerprint)
                || !['agent', 'phase', 'log', 'scratch-read', 'scratch-write', 'await-user'].includes(entry.kind)) {
                throw new WorkflowPackageError('workflow checkpoint is invalid', 'WORKFLOW_INVALID_STATE');
            }
            const address = entry.callId.join('.');
            if (callIds.has(address))
                throw new WorkflowPackageError('workflow checkpoint contains a repeated call id', 'WORKFLOW_INVALID_STATE');
            callIds.add(address);
            if (entry.kind === 'agent') {
                const seq = entry.seq;
                if (!Number.isSafeInteger(seq) || Number(seq) <= 0 || agentSequences.has(Number(seq))) {
                    throw new WorkflowPackageError('workflow checkpoint contains an invalid agent sequence', 'WORKFLOW_INVALID_STATE');
                }
                agentSequences.add(Number(seq));
                maximumSequence = Math.max(maximumSequence, Number(seq));
                agentEntries += 1;
            }
        }
        if (checkpoint.agentSpend < agentEntries || checkpoint.agentSeq < maximumSequence) {
            throw new WorkflowPackageError('workflow checkpoint counters are inconsistent', 'WORKFLOW_INVALID_STATE');
        }
        // The engine normally returns canonical order, but the supervisor owns
        // the durable representation and therefore normalizes a detached copy
        // instead of treating harmless observer/transport ordering as divergence.
        const incoming = [...checkpoint.journal].sort(checkpointCallCompare);
        if (run.checkpoint !== undefined) {
            const previous = [...run.checkpoint.journal].sort(checkpointCallCompare);
            if (incoming.length < previous.length
                || checkpoint.agentSpend < run.checkpoint.agentSpend
                || checkpoint.agentSeq < run.checkpoint.agentSeq) {
                throw new WorkflowPackageError('workflow replay journal diverged', 'WORKFLOW_INVALID_STATE');
            }
            for (let index = 0; index < previous.length; index += 1) {
                if (!isDeepStrictEqual(previous[index], incoming[index]))
                    throw new WorkflowPackageError('workflow replay journal diverged', 'WORKFLOW_INVALID_STATE');
            }
        }
        run.checkpoint = { journal: incoming, agentSpend: checkpoint.agentSpend, agentSeq: checkpoint.agentSeq };
    }
    clearGate(run) {
        const gate = run.gate;
        if (gate === undefined)
            return;
        run.gate = undefined;
        gate.abort.abort('workflow gate is no longer current');
    }
    allowedActions(run, status) {
        const save = !run.builtIn && !run.head.numberedHandle && status !== 'interrupted';
        switch (status) {
            case 'running': return save ? ['pause', 'stop', 'save'] : ['pause', 'stop'];
            case 'needs-input':
            case 'paused': return save ? ['resume', 'stop', 'save'] : ['resume', 'stop'];
            case 'budget-limited': return save ? ['stop', 'save'] : ['stop'];
            case 'completed':
            case 'failed':
            case 'cancelled': return save ? ['save'] : [];
            default: return [];
        }
    }
    async commitActive(run, patch, aspect) {
        if (TERMINAL.has(run.head.status))
            return run.head;
        const nextDetail = run.detail;
        const counts = memberCounts(nextDetail);
        const next = {
            ...run.head, ...patch, memberCounts: counts,
            budget: patch.budget ?? run.head.budget,
            allowedActions: this.allowedActions(run, patch.status ?? run.head.status),
            saveAvailable: this.allowedActions(run, patch.status ?? run.head.status).includes('save'),
            revision: run.head.revision + 1,
            detailRevision: aspect === 'detail' ? run.head.detailRevision + 1 : run.head.detailRevision,
            membersRevision: aspect === 'members' ? run.head.membersRevision + 1 : run.head.membersRevision,
            logsRevision: aspect === 'logs' ? run.head.logsRevision + 1 : run.head.logsRevision,
            resultRevision: aspect === 'result' ? run.head.resultRevision + 1 : run.head.resultRevision,
            artifactsRevision: aspect === 'artifacts' ? run.head.artifactsRevision + 1 : run.head.artifactsRevision,
        };
        const { detail: _detail, completionNotice: _notice, scriptPath: _path, ...durable } = next;
        const saved = await this.store.commitRun({ sessionId: run.sessionId, runId: run.id, expectedRevision: run.head.revision, head: durable, detail: nextDetail });
        run.head = saved;
        this.publishChange(run);
        return saved;
    }
    async failAfterAdmission(run, reason) {
        if (TERMINAL.has(run.head.status))
            return;
        await this.terminalize(run, 'failed', reason, undefined);
    }
    async terminalize(run, status, error, value, spent = run.head.budget.spent) {
        if (TERMINAL.has(run.head.status))
            return;
        const runningBefore = [...(run.detail.members ?? [])].filter(member => member.status === 'running');
        const members = [...(run.detail.members ?? [])].map(member => member.status === 'running'
            ? { ...member, status: 'cancelled', outcome: member.outcome === 'available' ? member.outcome : 'not-produced', settledAt: Date.now() }
            : member);
        let artifacts = run.detail.artifacts ?? [];
        let report;
        try {
            await run.scratch?.list();
        }
        catch (drainError) {
            this.ctx?.logger?.warn?.('workflow scratch drain failed during settlement', drainError);
        }
        try {
            const snapshot = await this.scanArtifacts(run, run.head);
            artifacts = snapshot.items.map(({ name, bytes }) => ({ name, bytes }));
        }
        catch (artifactError) {
            this.ctx?.logger?.warn?.('workflow artifact snapshot failed during settlement', artifactError);
        }
        try {
            if (typeof this.store.readRunReport === 'function')
                report = await this.store.readRunReport(run.runDirectory, this.config.completionNoticeMaxBytes);
            else {
                const raw = await run.scratch?.read('report.md');
                if (raw !== undefined)
                    report = utf8Prefix(raw, this.config.completionNoticeMaxBytes);
            }
        }
        catch (reportError) {
            this.ctx?.logger?.warn?.('workflow completion report read failed during settlement', reportError);
        }
        // The scan/report operations above are capability-rooted and bounded.  A
        // final scratch drain/disposal now closes the authority before the
        // terminal manifest commit, so no admitted write can follow the roster.
        await run.scratch?.dispose().catch(error2 => this.ctx?.logger?.warn?.('workflow scratch disposal failed', error2));
        const artifactsChanged = !isDeepStrictEqual(artifacts, run.detail.artifacts ?? []);
        run.detail = { ...run.detail, members,
            result: status === 'completed'
                ? this.resultPayload(value)
                : { state: 'not-produced' },
            artifacts,
        };
        let terminalPreview;
        if (status === 'completed') {
            try {
                const projection = workflowRunValueView(value, this.config.remoteHeadTextMaxBytes);
                terminalPreview = projection.state === 'available'
                    ? projection.content.kind === 'preview'
                        ? projection.content.text
                        : utf8Prefix(JSON.stringify(projection.content.value), this.config.remoteHeadTextMaxBytes)
                    : undefined;
            }
            catch {
                terminalPreview = undefined;
            }
        }
        const terminalHead = {
            ...run.head,
            status,
            stopReason: status === 'completed' ? 'completed' : status === 'cancelled' ? 'cancelled' : status === 'interrupted' ? 'interrupted' : 'error',
            ...(error === undefined ? {} : { error: utf8Prefix(error, this.config.maxEventTextBytes) }),
            ...(terminalPreview === undefined ? {} : { terminalPreview }),
            settledAt: Date.now(),
            budget: { ...run.head.budget, spent: Math.min(run.head.budget.total, spent), remaining: Math.max(0, run.head.budget.total - spent) },
            memberCounts: memberCounts(run.detail),
            allowedActions: this.allowedActions(run, status), executionAvailable: false,
            saveAvailable: this.allowedActions(run, status).includes('save'),
            revision: run.head.revision + 1,
            membersRevision: run.head.membersRevision + (runningBefore.length > 0 ? 1 : 0),
            resultRevision: run.head.resultRevision + 1,
            artifactsRevision: run.head.artifactsRevision + (artifactsChanged ? 1 : 0),
        };
        const { detail: _detail, completionNotice: _notice, scriptPath: _scriptPath, ...durable } = terminalHead;
        let saved;
        try {
            saved = await this.store.commitTerminalAndClaimNotice({ sessionId: run.sessionId, runId: run.id, expectedRevision: run.head.revision, head: durable, detail: run.detail });
        }
        catch (failure) {
            this.ctx?.logger?.warn?.('workflow terminal persistence failed', failure);
            // Do not expose a false terminal row as durable; retain the in-memory
            // state for teardown/retry and surface the storage failure to callers.
            throw failure;
        }
        run.head = saved;
        run.active = false;
        this.activeTotal = Math.max(0, this.activeTotal - 1);
        this.activeSessions.set(run.sessionId, Math.max(0, (this.activeSessions.get(run.sessionId) ?? 1) - 1));
        this.clearGate(run);
        this.publishChange(run);
        const endedIds = new Set(runningBefore.map(member => member.memberId));
        const lifecycleMembers = members.filter(member => endedIds.has(member.memberId)).map(member => this.memberLifecycle(member));
        for (const member of lifecycleMembers)
            await this.publishLifecycle(run, 'workflows/member-end', this.info(run), member);
        const stopReason = status === 'failed' ? 'error' : status;
        await this.publishLifecycle(run, 'workflows/run-end', this.info(run), { stopReason, ...(error === undefined ? {} : { error }), agentsStarted: spent });
        this.notifier.reserve(run.id, run.parent);
        const delivery = (async () => {
            let noticeResult;
            if (status === 'completed') {
                try {
                    noticeResult = workflowRunValueView(value, this.config.memberOutcomeMaxBytes);
                }
                catch {
                    noticeResult = { state: 'not-produced' };
                }
            }
            await this.notifier.notify({
                runId: run.id, sessionId: run.sessionId, displayName: run.head.displayName, status,
                parent: run.parent, head: run.head, error, result: noticeResult,
                ...(report === undefined ? {} : { report }),
            });
            // Notice finalization is a durable head revision. Refresh that exact row
            // so subsequent list/control baselines do not merge a stale live head.
            const rows = await this.store.readSession(run.sessionId);
            const finalized = rows.find(candidate => candidate.runId === String(run.id));
            if (finalized !== undefined && finalized.revision > run.head.revision) {
                run.head = finalized;
                this.publishChange(run);
            }
        })();
        run.delivery = delivery;
        void delivery.catch(error2 => this.ctx?.logger?.warn?.('workflow completion notice failed', error2)).finally(() => {
            if (run.delivery === delivery)
                run.delivery = undefined;
        });
    }
    resultPayload(value) {
        try {
            const view = workflowRunValueView(value, this.config.memberOutcomeMaxBytes);
            return view.state === 'available' && view.content.kind === 'value'
                ? { state: 'available', value: view.content.value, totalBytes: view.totalBytes, truncated: false }
                : view.state === 'available' && view.content.kind === 'preview'
                    ? { state: 'available', preview: view.content.text, totalBytes: view.totalBytes, truncated: true }
                    : { state: view.state };
        }
        catch {
            return { state: 'available', preview: '[result could not be serialized]', totalBytes: 31, truncated: true };
        }
    }
    displayKey(sessionId, displayName) { return `${sessionId}\0${displayName}`; }
    requireOwned(displayName, agent, interruptedMessage) {
        const sessionId = sessionOf(agent);
        const run = this.byDisplay.get(this.displayKey(sessionId, displayName));
        if (run === undefined) {
            const recovered = this.recoveredByDisplay.get(this.displayKey(sessionId, displayName));
            if (recovered !== undefined) {
                throw new WorkflowPackageError(interruptedMessage ?? `workflow "${displayName}" was interrupted by process exit and cannot resume`, 'WORKFLOW_INVALID_STATE');
            }
            throw new WorkflowPackageError(`workflow "${displayName}" was not found`, 'WORKFLOW_RUN_NOT_FOUND');
        }
        if (run.parent !== agent)
            throw new WorkflowPackageError(`workflow "${displayName}" is not owned by this Agent`, 'WORKFLOW_RUN_NOT_OWNED');
        return run;
    }
    requireOwnedId(runId, agent) {
        const run = this.runs.get(runId);
        if (run === undefined) {
            const recovered = this.recoveredById.get(String(runId));
            if (recovered !== undefined && recovered.sessionId === sessionOf(agent)) {
                throw new WorkflowPackageError(`workflow "${recovered.displayName}" was interrupted by process exit and cannot resume`, 'WORKFLOW_INVALID_STATE');
            }
            throw new WorkflowPackageError('workflow run was not found', 'WORKFLOW_RUN_NOT_FOUND');
        }
        if (run.parent !== agent || run.sessionId !== sessionOf(agent))
            throw new WorkflowPackageError('workflow run is not owned by this Agent', 'WORKFLOW_RUN_NOT_OWNED');
        return run;
    }
    async awaitCaller(promise, signal) {
        if (signal === undefined)
            return promise;
        signal.throwIfAborted();
        return await new Promise((resolve, reject) => {
            let done = false;
            const cleanup = () => signal.removeEventListener('abort', abort);
            const abort = () => {
                if (done)
                    return;
                done = true;
                cleanup();
                reject(signal.reason ?? new DOMException('This operation was aborted', 'AbortError'));
            };
            signal.addEventListener('abort', abort, { once: true });
            void promise.then(value => { if (!done) {
                done = true;
                cleanup();
                resolve(value);
            } }, error => { if (!done) {
                done = true;
                cleanup();
                reject(error);
            } });
        });
    }
    /** Quiesce and durably pause one running attempt. */
    async pause(displayName, agent, signal) {
        const run = this.requireOwned(displayName, agent, `workflow "${displayName}" is not running (interrupted)`);
        const owned = this.enqueue(run, async () => {
            if (run.head.status !== 'running' || run.attempt === undefined)
                throw new WorkflowPackageError(`workflow "${displayName}" is not running (${run.head.status})`, 'WORKFLOW_INVALID_STATE');
            const attempt = run.attempt;
            attempt.intent = 'pause';
            this.clearGate(run);
            await this.commitActive(run, { status: 'pausing' }, 'detail');
            try {
                attempt.handle.cancel('paused by user');
            }
            catch (error) {
                await this.terminalize(run, 'failed', `workflow pause cancellation failed: ${renderThrown(error)}`);
                return this.publicHead(run);
            }
            let outcome;
            try {
                outcome = await attempt.quiescent;
            }
            catch (error) {
                if (this.currentAttempt(run, attempt)) {
                    this.executions.delete(attempt.executionId);
                    run.attempt = undefined;
                    await this.terminalize(run, 'failed', `workflow attempt settlement failed: ${renderThrown(error)}`);
                }
                return this.publicHead(run);
            }
            if (!this.currentAttempt(run, attempt))
                return headView(run.head);
            this.executions.delete(attempt.executionId);
            run.attempt = undefined;
            if (outcome.cleanupError !== undefined) {
                await this.terminalize(run, 'failed', `workflow attempt cleanup failed: ${outcome.cleanupError}`);
                return this.publicHead(run);
            }
            if (outcome.checkpoint === undefined) {
                await this.terminalize(run, 'failed', 'workflow checkpoint is unavailable after pause');
                return this.publicHead(run);
            }
            try {
                this.acceptCheckpoint(run, outcome.checkpoint);
            }
            catch (error) {
                await this.terminalize(run, 'failed', `workflow replay checkpoint diverged: ${renderThrown(error)}`);
                return this.publicHead(run);
            }
            const ended = this.settleRunningMembers(run);
            const spent = Math.max(run.head.budget.spent, outcome.checkpoint.agentSpend, outcome.result.agentsStarted);
            run.head = { ...run.head, budget: { ...run.head.budget, spent, remaining: Math.max(0, run.head.budget.total - spent) } };
            const saved = await this.commitActive(run, { status: 'paused', budget: run.head.budget }, 'result');
            for (const member of ended)
                await this.publishLifecycle(run, 'workflows/member-end', this.info(run), member);
            return headView(saved);
        });
        return this.awaitCaller(owned, signal);
    }
    settleRunningMembers(run) {
        const ended = [];
        const members = [...(run.detail.members ?? [])].map(member => {
            if (member.status !== 'running')
                return member;
            const settled = {
                ...member, status: 'cancelled', settledAt: Date.now(),
                outcome: member.outcome === 'available' ? 'available' : 'not-produced',
            };
            ended.push(this.memberLifecycle(settled));
            return settled;
        });
        run.detail = { ...run.detail, members };
        return ended;
    }
    /** Stop one nonterminal run only after attempt and scratch cleanup. */
    async stop(displayName, agent, signal) {
        const run = this.requireOwned(displayName, agent, `workflow "${displayName}" already settled (interrupted)`);
        const owned = this.enqueue(run, async () => {
            if (TERMINAL.has(run.head.status))
                throw new WorkflowPackageError(`workflow "${displayName}" already settled (${run.head.status})`, 'WORKFLOW_INVALID_STATE');
            this.clearGate(run);
            const attempt = run.attempt;
            if (attempt !== undefined) {
                attempt.intent = 'stop';
                await this.commitActive(run, { status: 'stopping' }, 'detail');
                try {
                    attempt.handle.cancel('stopped by user');
                }
                catch (error) {
                    await this.terminalize(run, 'failed', `workflow stop cancellation failed: ${renderThrown(error)}`);
                    return this.publicHead(run);
                }
                let outcome;
                try {
                    outcome = await attempt.quiescent;
                }
                catch (error) {
                    if (this.currentAttempt(run, attempt)) {
                        this.executions.delete(attempt.executionId);
                        run.attempt = undefined;
                        await this.terminalize(run, 'failed', `workflow attempt settlement failed: ${renderThrown(error)}`);
                    }
                    return this.publicHead(run);
                }
                if (this.currentAttempt(run, attempt)) {
                    this.executions.delete(attempt.executionId);
                    run.attempt = undefined;
                    if (outcome.checkpoint !== undefined) {
                        try {
                            this.acceptCheckpoint(run, outcome.checkpoint);
                        }
                        catch (error) {
                            await this.terminalize(run, 'failed', `workflow replay checkpoint diverged: ${renderThrown(error)}`);
                            return this.publicHead(run);
                        }
                    }
                    if (outcome.cleanupError !== undefined) {
                        await this.terminalize(run, 'failed', `workflow attempt cleanup failed: ${outcome.cleanupError}`);
                        return this.publicHead(run);
                    }
                    await this.terminalize(run, 'cancelled', outcome.result.error ?? 'stopped by user', undefined, Math.max(run.head.budget.spent, outcome.result.agentsStarted, outcome.checkpoint?.agentSpend ?? 0));
                }
            }
            else
                await this.terminalize(run, 'cancelled', 'stopped by user', undefined);
            return headView(run.head);
        });
        return this.awaitCaller(owned, signal);
    }
    /** Resume a paused run or acknowledge its current live gate. */
    async resume(displayName, agent, signal) {
        const run = this.requireOwned(displayName, agent);
        const owned = this.enqueue(run, () => this.resumeRecord(run, undefined, signal));
        return this.awaitCaller(owned, signal);
    }
    async resumeById(runId, agent, higherBudget, signal) {
        const run = this.requireOwnedId(runId, agent);
        const owned = this.enqueue(run, async () => {
            if (run.head.status === 'budget-limited') {
                if (!Number.isSafeInteger(higherBudget) || higherBudget <= run.head.budget.total || higherBudget > this.config.maxAgentBudget) {
                    throw new WorkflowPackageError(`workflow "${run.head.displayName}" requires a higher agent_budget to resume`, 'WORKFLOW_INVALID_STATE');
                }
                return this.resumeRecord(run, higherBudget, signal);
            }
            if (higherBudget !== undefined && higherBudget !== run.head.budget.total)
                throw new WorkflowPackageError('agent_budget may be raised only when resuming a budget-limited workflow', 'WORKFLOW_INVALID_STATE');
            return this.resumeRecord(run, undefined, signal);
        });
        return this.awaitCaller(owned, signal);
    }
    async resumeRecord(run, higherBudget, signal) {
        signal?.throwIfAborted();
        if (this.disposed || !this.admission || run.closing !== undefined) {
            throw new WorkflowPackageError('workflow supervisor is shutting down', 'WORKFLOW_INVALID_STATE');
        }
        if (run.head.status === 'budget-limited' && higherBudget === undefined)
            throw new WorkflowPackageError(`workflow "${run.head.displayName}" requires a higher agent_budget to resume`, 'WORKFLOW_INVALID_STATE');
        if (run.head.status === 'needs-input') {
            const gate = run.gate;
            const attempt = run.attempt;
            if (gate === undefined || attempt === undefined)
                throw new WorkflowPackageError(`workflow "${run.head.displayName}" has no live input gate`, 'WORKFLOW_INVALID_STATE');
            if (gate.gate.resumable) {
                this.clearGate(run);
                const saved = await this.commitActive(run, { status: 'running' }, 'detail');
                attempt.handle.resume();
                return headView(saved);
            }
            return this.replaceGateAttempt(run, attempt, higherBudget);
        }
        if (run.head.status !== 'paused' && run.head.status !== 'budget-limited')
            throw new WorkflowPackageError(`workflow "${run.head.displayName}" cannot resume from ${run.head.status}`, 'WORKFLOW_INVALID_STATE');
        if (run.checkpoint === undefined)
            throw new WorkflowPackageError(`workflow "${run.head.displayName}" has no same-process replay authority`, 'WORKFLOW_INVALID_STATE');
        const oldBudget = run.head.budget;
        const oldStatus = run.head.status;
        if (higherBudget !== undefined)
            run.head = { ...run.head, budget: { total: higherBudget, spent: oldBudget.spent, remaining: Math.max(0, higherBudget - oldBudget.spent) } };
        let attempt;
        let committed = false;
        try {
            attempt = this.createAttempt(run);
            run.attempt = attempt;
            run.generation = attempt.generation;
            this.executions.set(attempt.executionId, { run, generation: attempt.generation });
            if (!this.admission && run.closing === undefined)
                run.closing = 'supervisor';
            this.startObservation(run, attempt);
            const saved = await this.commitActive(run, { status: 'running', budget: run.head.budget }, 'result');
            committed = true;
            this.releaseDeferredAttempt(run, attempt);
            return headView(saved);
        }
        catch (error) {
            if (attempt !== undefined) {
                this.executions.delete(attempt.executionId);
                if (run.attempt === attempt)
                    run.attempt = undefined;
                attempt.handle.cancel('workflow resume rolled back');
                await attempt.quiescent.catch(() => undefined);
            }
            run.head = { ...run.head, budget: oldBudget };
            if (committed && !TERMINAL.has(run.head.status)) {
                try {
                    await this.commitActive(run, { status: oldStatus, budget: oldBudget }, 'result');
                }
                catch (rollbackError) {
                    this.ctx?.logger?.warn?.('workflow resume rollback persistence failed', rollbackError);
                    await this.terminalize(run, 'failed', `workflow resume failed: ${renderThrown(error)}`).catch(() => undefined);
                }
            }
            throw error;
        }
    }
    async replaceGateAttempt(run, attempt, higherBudget) {
        attempt.intent = 'pause';
        this.clearGate(run);
        await this.commitActive(run, { status: 'pausing' }, 'detail');
        attempt.handle.cancel('replaying workflow pause gate');
        const outcome = await attempt.quiescent;
        if (!this.currentAttempt(run, attempt))
            return headView(run.head);
        this.executions.delete(attempt.executionId);
        run.attempt = undefined;
        if (outcome.cleanupError !== undefined) {
            await this.terminalize(run, 'failed', `workflow attempt cleanup failed: ${outcome.cleanupError}`);
            return this.publicHead(run);
        }
        if (outcome.checkpoint === undefined) {
            await this.terminalize(run, 'failed', 'workflow checkpoint is unavailable after gate');
            return this.publicHead(run);
        }
        try {
            this.acceptCheckpoint(run, outcome.checkpoint);
        }
        catch (error) {
            await this.terminalize(run, 'failed', `workflow replay checkpoint diverged: ${renderThrown(error)}`);
            return this.publicHead(run);
        }
        const ended = this.settleRunningMembers(run);
        await this.commitActive(run, { status: 'paused' }, 'result');
        for (const member of ended)
            await this.publishLifecycle(run, 'workflows/member-end', this.info(run), member);
        return this.resumeRecord(run, higherBudget);
    }
    /** Acknowledge only the exact still-current gate fence. */
    async resumeGate(runId, executionId, gateId, agent, signal) {
        const run = this.runs.get(runId);
        if (run === undefined || run.parent !== agent || run.sessionId !== sessionOf(agent))
            return false;
        const operation = this.enqueue(run, async () => {
            signal?.throwIfAborted();
            const gate = run.gate;
            const attempt = run.attempt;
            if (run.head.status !== 'needs-input' || gate === undefined || attempt === undefined)
                return false;
            if (gate.executionId !== executionId || gate.gateId !== gateId || gate.generation !== attempt.generation || !this.currentAttempt(run, attempt))
                return false;
            if (gate.gate.resumable) {
                this.clearGate(run);
                await this.commitActive(run, { status: 'running' }, 'detail');
                attempt.handle.resume();
            }
            else
                await this.replaceGateAttempt(run, attempt);
            return true;
        });
        return this.awaitCaller(operation, signal);
    }
    /** Save a safe, current editable projection without changing live authority. */
    async save(displayName, agent, scope = this.config.saveScope, signal) {
        const run = this.requireOwned(displayName, agent, `workflow "${displayName}" cannot be saved after process interruption`);
        return this.awaitCaller(this.enqueue(run, async () => {
            signal?.throwIfAborted();
            if (run.builtIn)
                throw new WorkflowPackageError(`workflow "${displayName}" is a built-in: save an edited copy under a new meta.name`, 'WORKFLOW_INVALID_STATE');
            if (run.head.numberedHandle)
                throw new WorkflowPackageError(`workflow "${displayName}" is a numbered handle: save an edited copy under a new unique meta.name`, 'WORKFLOW_INVALID_STATE');
            if (run.head.status === 'interrupted')
                throw new WorkflowPackageError(`workflow "${displayName}" cannot be saved after process interruption`, 'WORKFLOW_INVALID_STATE');
            if (!this.registry)
                throw new WorkflowPackageError('workflow registry is unavailable', 'WORKFLOW_REGISTRY_DISABLED');
            const readProjection = this.store.readRunScript;
            // Small in-memory stores used by embedders/tests may not expose a file
            // capability; their immutable source is the only projection available.
            // A Host-backed FileWorkflowRunStore always takes the descriptor branch.
            const script = typeof readProjection === 'function'
                ? await readProjection.call(this.store, run.runDirectory, this.config.maxScriptProjectionBytes, signal)
                : run.script;
            const saved = await this.registry.save({ meta: run.meta, script }, { scope, cwd: agent?.session?.header?.cwd, signal });
            return saved.path;
        }), signal);
    }
    publicHead(run) {
        const raw = headView(run.head);
        // Recovered rows deliberately have no live Agent or editable authority.
        // Never let persisted `allowedActions` turn into a capability after a
        // process restart.
        const actions = run.parent === undefined ? [] : this.allowedActions(run, raw.status);
        return {
            ...raw,
            allowedActions: actions,
        };
    }
    publicHeadRecord(head) {
        const raw = headView(head);
        return {
            ...raw,
            allowedActions: head.executionAvailable === false ? [] : raw.allowedActions,
        };
    }
    async storedHeadFor(agent, runId, signal) {
        const sessionId = sessionOf(agent);
        signal?.throwIfAborted();
        const live = this.runs.get(String(runId));
        if (live !== undefined) {
            if (live.sessionId !== sessionId)
                throw new WorkflowPackageError('workflow run was not found', 'WORKFLOW_RUN_NOT_FOUND');
            return live.head;
        }
        const rows = await this.store.readSession(sessionId, signal);
        const head = rows.find(candidate => candidate.runId === String(runId));
        if (head === undefined)
            throw new WorkflowPackageError('workflow run was not found', 'WORKFLOW_RUN_NOT_FOUND');
        return head;
    }
    async readDetailValue(runId, kind, request = {}, signal) {
        const result = await this.store.readDetails(runId, { kind, ...request }, signal);
        return result;
    }
    async readAllMembers(runId, signal) {
        const members = [];
        let cursor;
        do {
            signal?.throwIfAborted();
            const page = await this.readDetailValue(runId, 'members', { cursor, limit: 200 }, signal);
            if (Array.isArray(page.value))
                members.push(...page.value);
            cursor = page.nextCursor;
            if (members.length > this.config.maxMembersPerRun)
                throw new WorkflowPackageError('workflow member retention limit exceeded', 'WORKFLOW_STORAGE_LIMIT');
        } while (cursor !== undefined);
        return members;
    }
    memberHead(member) {
        return {
            memberId: member.memberId,
            seq: member.seq,
            label: member.label,
            ...(member.phase === undefined ? {} : { phase: member.phase }),
            status: member.status,
            ...(member.startedAt === undefined ? {} : { startedAt: member.startedAt }),
            ...(member.settledAt === undefined ? {} : { settledAt: member.settledAt }),
            outcome: member.outcome,
            ...(member.childSessionId === undefined ? {} : { childSessionId: member.childSessionId }),
        };
    }
    memberHeadWithTranscript(member) {
        const head = this.memberHead(member);
        return { ...head, outcome: memberOutcomeWithTranscript(this.ctx, member) };
    }
    async authorizedHead(agent, runId, signal) {
        const live = this.runs.get(String(runId));
        if (live !== undefined) {
            if (live.sessionId !== sessionOf(agent))
                throw new WorkflowPackageError('workflow run was not found', 'WORKFLOW_RUN_NOT_FOUND');
            return { head: live.head, live };
        }
        return { head: await this.storedHeadFor(agent, runId, signal) };
    }
    /** List the authorized Session's retained logical runs. */
    async list(agent, request = {}, signal) {
        const sessionId = sessionOf(agent);
        const rows = await this.store.readSession(sessionId, signal);
        signal?.throwIfAborted();
        const liveById = new Map([...this.runs.values()].filter(run => run.sessionId === sessionId).map(run => [String(run.id), run]));
        const merged = rows.map(head => liveById.get(head.runId)?.head ?? head);
        // A store implementation may return a newly recovered row that was not
        // present in the in-memory map.  Keep list reads authoritative without
        // manufacturing executable authority for it.
        const known = new Set(merged.map(head => head.runId));
        for (const run of liveById.values())
            if (!known.has(String(run.id)))
                merged.push(run.head);
        merged.sort((left, right) => {
            const leftActive = ACTIVE.has(left.status) ? 0 : 1;
            const rightActive = ACTIVE.has(right.status) ? 0 : 1;
            if (leftActive !== rightActive)
                return leftActive - rightActive;
            if (leftActive === 0)
                return left.startedAt - right.startedAt || left.displayName.localeCompare(right.displayName);
            return (right.settledAt ?? 0) - (left.settledAt ?? 0)
                || right.startedAt - left.startedAt
                || left.displayName.localeCompare(right.displayName);
        });
        const total = merged.length;
        const limit = pageLimit(request.limit);
        const offset = numericCursor(request.cursor, total);
        const items = merged.slice(offset, offset + limit).map(head => {
            const run = this.runs.get(head.runId);
            return run === undefined ? this.publicHeadRecord(head) : this.publicHead(run);
        });
        const currentRevision = this.sessionRevisions.get(sessionId)
            ?? merged.reduce((max, head) => Math.max(max, head.revision), 0);
        if (!this.sessionRevisions.has(sessionId))
            this.sessionRevisions.set(sessionId, currentRevision);
        return {
            epoch: this.feedEpoch,
            sessionRevision: currentRevision,
            items,
            total,
            ...(nextCursor(offset, items.length, total) === undefined ? {} : { nextCursor: nextCursor(offset, items.length, total) }),
        };
    }
    /** Return selected-run metadata after Session authorization. */
    async detail(agent, runId, signal) {
        const found = await this.authorizedHead(agent, runId, signal);
        signal?.throwIfAborted();
        const run = found.live;
        let phases = run?.meta.phases?.map(phase => ({
            title: utf8Prefix(phase.title, this.config.maxEventTextBytes),
            ...(phase.detail === undefined ? {} : { detail: utf8Prefix(phase.detail, this.config.maxEventTextBytes) }),
            ...(phase.provider === undefined ? {} : { provider: utf8Prefix(phase.provider, this.config.maxEventTextBytes) }),
            ...(phase.model === undefined ? {} : { model: utf8Prefix(phase.model, this.config.maxEventTextBytes) }),
        }));
        if (phases === undefined || phases.length === 0) {
            try {
                const stored = await this.readDetailValue(String(found.head.runId), 'phases', { limit: 200 }, signal);
                const rows = Array.isArray(stored.value) ? stored.value : [];
                const recovered = rows
                    .filter((phase) => typeof phase?.title === 'string' && phase.title.length > 0)
                    .map(phase => ({
                    title: utf8Prefix(phase.title, this.config.maxEventTextBytes),
                    ...(typeof phase.detail === 'string' ? { detail: utf8Prefix(phase.detail, this.config.maxEventTextBytes) } : {}),
                }));
                if (recovered.length > 0)
                    phases = recovered;
            }
            catch { /* completed runs without a phases sidecar stay phase-less */ }
        }
        const gate = run?.gate?.gate;
        const error = found.head.error;
        return {
            run: run === undefined ? this.publicHeadRecord(found.head) : this.publicHead(run),
            ...(phases === undefined ? {} : { phases }),
            ...(gate === undefined ? {} : { gate }),
            ...(error === undefined ? {} : { error }),
            ...(found.head.scriptPath === undefined ? {} : { scriptPath: found.head.scriptPath }),
        };
    }
    /** Return a bounded retained member page. */
    async members(agent, request, signal) {
        const found = await this.authorizedHead(agent, request.runId, signal);
        const limit = pageLimit(request.limit);
        const offset = numericCursor(request.cursor, Number.MAX_SAFE_INTEGER);
        const value = await this.readDetailValue(String(request.runId), 'members', {
            cursor: String(offset), limit,
        }, signal);
        const rows = Array.isArray(value.value) ? value.value : [];
        const items = rows.map(member => this.memberHeadWithTranscript(member));
        const total = value.total;
        const cursor = nextCursor(offset, items.length, total);
        return {
            items, total, revision: found.head.membersRevision,
            ...(cursor === undefined ? {} : { nextCursor: cursor }),
        };
    }
    /** Return one retained member outcome, including JSON null when present. */
    async memberDetail(agent, request, signal) {
        await this.authorizedHead(agent, request.runId, signal);
        const members = await this.readAllMembers(String(request.runId), signal);
        const member = members.find(candidate => candidate.memberId === String(request.memberId));
        if (member === undefined)
            throw new WorkflowPackageError('workflow member was not found in this run', 'WORKFLOW_RUN_NOT_FOUND');
        let outcome = valueViewFromStored(member.value, member.outcome, this.config.memberOutcomeMaxBytes);
        if (outcome.state === 'not-produced' || (outcome.state === 'pending' && member.status !== 'running')) {
            const recovered = childTranscriptValue(this.ctx, member.childSessionId);
            if (recovered !== undefined) {
                outcome = valueViewFromStored(recovered, 'available', this.config.memberOutcomeMaxBytes);
            }
        }
        return {
            member: this.memberHeadWithTranscript(member),
            ...(member.childSessionId === undefined ? {} : { childSessionId: member.childSessionId }),
            outcome,
        };
    }
    /** Return retained log lines with deterministic eviction metadata. */
    async logs(agent, request, signal) {
        const found = await this.authorizedHead(agent, request.runId, signal);
        const limit = pageLimit(request.limit);
        const rawOffset = numericCursor(request.cursor, Number.MAX_SAFE_INTEGER);
        const value = await this.readDetailValue(String(request.runId), 'logs', { cursor: String(rawOffset), limit }, signal);
        const rows = Array.isArray(value.value) ? value.value : [];
        const items = rows.map(line => ({ index: line.index, text: utf8Prefix(line.text, this.config.maxLogLineBytes) }));
        const retainedTotal = value.total;
        const omitted = value.omitted ?? (items.length > 0 ? items[0].index : 0);
        if (rawOffset > retainedTotal) {
            throw new WorkflowPackageError('workflow page cursor is invalid', 'WORKFLOW_CURSOR_INVALID');
        }
        const cursor = nextCursor(rawOffset, items.length, retainedTotal);
        return {
            items, nextCursor: cursor, evicted: omitted, total: omitted + retainedTotal,
            revision: found.head.logsRevision,
        };
    }
    /** Return the retained terminal result projection. */
    async result(agent, runId, signal) {
        const found = await this.authorizedHead(agent, runId, signal);
        const value = await this.readDetailValue(String(runId), 'result', {}, signal);
        const payload = value.value;
        let view;
        if (payload?.state === 'available' && Object.prototype.hasOwnProperty.call(payload, 'value')) {
            view = valueViewFromStored(payload.value, 'available', this.config.memberOutcomeMaxBytes);
        }
        else if (payload?.state === 'available' && typeof payload.preview === 'string') {
            view = {
                state: 'available',
                content: { kind: 'preview', text: payload.preview },
                totalBytes: Number(payload.totalBytes) || encoder.encode(payload.preview).byteLength,
                truncated: payload.truncated !== false,
            };
        }
        else if (payload?.state === 'pending' || payload?.state === 'not-produced' || payload?.state === 'evicted') {
            view = { state: payload.state };
        }
        else
            view = { state: TERMINAL.has(found.head.status) ? 'not-produced' : 'pending' };
        return { value: view, ...(found.head.error === undefined ? {} : { error: found.head.error }), revision: found.head.resultRevision };
    }
    async scanArtifacts(run, head, signal) {
        const capability = this.store.listRunArtifacts;
        if (typeof capability === 'function') {
            const inventory = await capability.call(this.store, head.runDirectory, this.config.maxRetainedArtifactsPerRun, signal);
            return {
                items: inventory.items.map(item => ({
                    name: item.name, bytes: item.bytes,
                    identity: `${item.identity.dev}:${item.identity.ino}:${item.identity.mtimeMs}:${item.identity.size}`,
                    capabilityIdentity: item.identity,
                })),
                total: inventory.total,
            };
        }
        if (run?.scratch !== undefined) {
            const names = (await run.scratch.list(signal)).filter(name => SCRATCH_NAME.test(name)).sort();
            const records = [];
            for (const name of names) {
                signal?.throwIfAborted();
                const content = await run.scratch.read(name, signal);
                if (content === undefined)
                    continue;
                const bytes = encoder.encode(content);
                const digest = createHash('sha256').update(bytes).digest('hex');
                records.push({ name, bytes: bytes.byteLength, identity: `scratch:${digest}` });
            }
            return { items: records.slice(0, this.config.maxRetainedArtifactsPerRun), total: records.length };
        }
        throw new WorkflowPackageError('descriptor-rooted workflow artifact access is unavailable', 'WORKFLOW_STORAGE_UNSUPPORTED');
    }
    /** Refresh and page bounded scratch artifact metadata. */
    async artifacts(agent, request, signal) {
        const found = await this.authorizedHead(agent, request.runId, signal);
        const scanned = await this.scanArtifacts(found.live, found.head, signal);
        const prior = found.live?.detail.artifacts ?? [];
        const next = scanned.items.map(item => ({ name: item.name, bytes: item.bytes }));
        if (found.live !== undefined && !isDeepStrictEqual(prior, next) && !TERMINAL.has(found.live.head.status)) {
            found.live.detail = { ...found.live.detail, artifacts: next };
            await this.commitActive(found.live, {}, 'artifacts');
        }
        const limit = pageLimit(request.limit);
        const offset = numericCursor(request.cursor, scanned.items.length);
        const items = scanned.items.slice(offset, offset + limit).map(item => ({ name: item.name, bytes: item.bytes }));
        const cursor = nextCursor(offset, items.length, scanned.items.length);
        return { items, total: scanned.total, omitted: Math.max(0, scanned.total - scanned.items.length), revision: found.head.artifactsRevision + (isDeepStrictEqual(prior, next) ? 0 : 1), ...(cursor === undefined ? {} : { nextCursor: cursor }) };
    }
    /** Read one UTF-8-safe artifact chunk through an opened no-follow handle. */
    async artifact(agent, request, signal) {
        const found = await this.authorizedHead(agent, request.runId, signal);
        if (!SCRATCH_NAME.test(request.name))
            throw new WorkflowPackageError('workflow scratch artifact was not found', 'WORKFLOW_RUN_NOT_FOUND');
        const scanned = await this.scanArtifacts(found.live, found.head, signal);
        const artifact = scanned.items.find(item => item.name === request.name);
        if (artifact === undefined)
            throw new WorkflowPackageError('workflow scratch artifact was not found', 'WORKFLOW_RUN_NOT_FOUND');
        const revision = found.live?.head.artifactsRevision ?? found.head.artifactsRevision;
        if (request.expectedRevision !== undefined && request.expectedRevision !== revision)
            throw new WorkflowPackageError('workflow artifact collection changed; refresh it before reading', 'WORKFLOW_STALE_REVISION');
        const offset = numericCursor(request.cursor, artifact.bytes);
        const maxBytes = request.maxBytes ?? this.config.artifactChunkDefaultBytes;
        if (!Number.isSafeInteger(maxBytes) || maxBytes < 4 || maxBytes > this.config.artifactChunkMaxBytes)
            throw new WorkflowPackageError(`workflow artifact maxBytes must be a safe integer from 4 through ${this.config.artifactChunkMaxBytes}`, 'WORKFLOW_LIMIT');
        const capability = this.store.readRunArtifact;
        const capabilityIdentity = artifact.capabilityIdentity;
        if (typeof capability === 'function' && capabilityIdentity !== undefined) {
            const read = await capability.call(this.store, found.head.runDirectory, request.name, offset, maxBytes, capabilityIdentity, signal);
            const next = offset + read.returnedBytes < read.totalBytes ? String(offset + read.returnedBytes) : undefined;
            return {
                artifact: { name: request.name, bytes: read.totalBytes }, text: read.text,
                offsetBytes: offset, returnedBytes: read.returnedBytes, totalBytes: read.totalBytes,
                revision, ...(next === undefined ? {} : { nextCursor: next }),
            };
        }
        if (found.live?.scratch !== undefined) {
            const content = await found.live.scratch.read(request.name, signal);
            if (content === undefined)
                throw new WorkflowPackageError('workflow scratch artifact was not found', 'WORKFLOW_RUN_NOT_FOUND');
            const bytes = encoder.encode(content);
            const identity = `scratch:${createHash('sha256').update(bytes).digest('hex')}`;
            if (identity !== artifact.identity)
                throw new WorkflowPackageError('workflow artifact changed; refresh it before reading', 'WORKFLOW_STALE_REVISION');
            const available = bytes.subarray(offset, Math.min(bytes.byteLength, offset + maxBytes));
            const decoder = new TextDecoder('utf-8', { fatal: true });
            let returned = available.byteLength;
            let text = '';
            for (let candidate = returned; candidate >= Math.max(0, returned - 3); candidate -= 1) {
                try {
                    text = decoder.decode(available.subarray(0, candidate));
                    returned = candidate;
                    break;
                }
                catch { /* trim an incomplete trailing code point */ }
            }
            const next = offset + returned < bytes.byteLength ? String(offset + returned) : undefined;
            return { artifact: { name: artifact.name, bytes: bytes.byteLength }, text, offsetBytes: offset, returnedBytes: returned, totalBytes: bytes.byteLength, revision, ...(next === undefined ? {} : { nextCursor: next }) };
        }
        throw new WorkflowPackageError('descriptor-rooted workflow artifact access is unavailable', 'WORKFLOW_STORAGE_UNSUPPORTED');
    }
    /** Return one atomic lifecycle projection for the Chat recorder. */
    async recordingSnapshot(agent, runId, signal) {
        const sessionId = sessionOf(agent);
        signal?.throwIfAborted();
        const live = this.runs.get(String(runId));
        if (live !== undefined && live.sessionId === sessionId) {
            const stopReason = live.head.stopReason;
            return {
                info: this.info(live), run: this.publicHead(live),
                members: [...(live.detail.members ?? [])].sort((a, b) => a.seq - b.seq).map(member => this.memberLifecycle(member)),
                ...(stopReason === undefined ? {} : {
                    result: {
                        stopReason: stopReason === 'budget-limited' ? 'error' : stopReason,
                        ...(live.head.error === undefined ? {} : { error: live.head.error }),
                        agentsStarted: live.head.budget.spent,
                    },
                }),
            };
        }
        const head = await this.storedHeadFor(agent, runId, signal).catch(error => {
            if (error instanceof WorkflowPackageError && error.code === 'WORKFLOW_RUN_NOT_FOUND')
                return undefined;
            throw error;
        });
        if (head === undefined)
            return undefined;
        const members = (await this.readAllMembers(String(runId), signal)).sort((a, b) => a.seq - b.seq);
        const stopReason = head.stopReason;
        const info = { id: head.runId, displayName: head.displayName, name: head.name };
        return {
            info,
            run: this.publicHeadRecord(head),
            members: members.map(member => this.memberLifecycle(member)),
            ...(stopReason === undefined ? {} : {
                result: {
                    stopReason: stopReason === 'budget-limited' ? 'error' : stopReason,
                    ...(head.error === undefined ? {} : { error: head.error }),
                    agentsStarted: head.budget.spent,
                },
            }),
        };
    }
    /** Wait until work owned by one exact Agent reaches a quiescent fixed point. */
    async whenOwnerQuiescent(agent, signal) {
        for (;;) {
            signal?.throwIfAborted();
            const owned = [...this.runs.values()].filter(run => run.parent === agent);
            const waits = [];
            waits.push(...[...this.pendingStarts].filter(item => item.parent === agent).map(item => item.done));
            for (const run of owned) {
                waits.push(run.tail, run.lifecycleTail);
                if (run.attempt !== undefined && (run.head.status === 'running' || run.head.status === 'pausing' || run.head.status === 'stopping'))
                    waits.push(run.attempt.observation);
                if (run.delivery !== undefined)
                    waits.push(run.delivery);
            }
            waits.push(this.notifier.whenOwnerQuiescent(agent, signal));
            if (waits.length > 0)
                await Promise.allSettled(waits);
            signal?.throwIfAborted();
            const still = [...this.pendingStarts].some(item => item.parent === agent)
                || [...this.runs.values()].some(run => run.parent === agent
                    && (run.delivery !== undefined
                        || run.head.status === 'running'
                        || run.head.status === 'pausing'
                        || run.head.status === 'stopping'));
            if (!still) {
                await this.notifier.whenOwnerQuiescent(agent, signal);
                return;
            }
        }
    }
    /** Close new admission at a synchronous linearization point. */
    closeAdmissionSync() {
        if (!this.admission)
            return;
        this.admission = false;
        for (const pending of this.pendingStarts)
            pending.controller.abort(new Error('workflow supervisor admission closed'));
        for (const run of this.runs.values()) {
            if (run.closing === undefined)
                run.closing = 'supervisor';
        }
    }
    /** Compatibility spelling used by lifecycle effects; the close itself is synchronous. */
    closeAdmission() { this.closeAdmissionSync(); }
    async disposeOwner(agent) {
        if (typeof agent === 'object' && agent !== null)
            this.closedOwners.add(agent);
        for (const pending of [...this.pendingStarts]) {
            if (pending.parent === agent)
                pending.controller.abort(new Error('workflow owner disposed'));
        }
        for (const run of this.runs.values()) {
            if (run.parent === agent && run.closing === undefined)
                run.closing = 'owner';
        }
        await Promise.allSettled([...this.pendingStarts].filter(item => item.parent === agent).map(item => item.done));
        const runs = [...this.runs.values()].filter(run => run.parent === agent && !TERMINAL.has(run.head.status));
        for (const run of runs) {
            const attempt = run.attempt;
            this.clearGate(run);
            if (attempt !== undefined) {
                attempt.intent = 'teardown';
                try {
                    attempt.handle.cancel('workflow owner disposed');
                }
                catch { /* contained */ }
                await attempt.observation.catch(error => this.ctx?.logger?.warn?.('workflow owner disposal observation failed', error));
            }
            else {
                await this.enqueue(run, () => this.terminalize(run, 'interrupted', 'Process exited before workflow settlement.')).catch(error => this.ctx?.logger?.warn?.('workflow owner terminalization failed', error));
            }
            await run.tail.catch(() => undefined);
            await run.delivery?.catch(() => undefined);
        }
        await this.whenOwnerQuiescent(agent).catch(() => undefined);
    }
    /** Idempotent global teardown with admission, attempts, publications, and notices drained. */
    async dispose() {
        if (this.disposal !== undefined)
            return this.disposal;
        this.closeAdmissionSync();
        this.disposed = true;
        this.disposal = (async () => {
            // First make every pre-admission operation observe cancellation and wait
            // for its transaction promise.  No directory/ordinal can be published
            // after this point.
            await Promise.allSettled([...this.pendingStarts].map(item => item.done));
            for (const run of [...this.runs.values()]) {
                if (TERMINAL.has(run.head.status))
                    continue;
                const attempt = run.attempt;
                this.clearGate(run);
                if (attempt !== undefined) {
                    attempt.intent = 'teardown';
                    try {
                        attempt.handle.cancel('workflow supervisor disposed');
                    }
                    catch { /* contained */ }
                }
                else {
                    await this.enqueue(run, () => this.terminalize(run, 'interrupted', 'Process exited before workflow settlement.')).catch(error => this.ctx?.logger?.warn?.('workflow teardown terminalization failed', error));
                }
            }
            for (;;) {
                const waits = [];
                for (const run of this.runs.values()) {
                    waits.push(run.tail, run.lifecycleTail);
                    if (run.attempt !== undefined)
                        waits.push(run.attempt.observation);
                    if (run.delivery !== undefined)
                        waits.push(run.delivery);
                }
                if (waits.length > 0)
                    await Promise.allSettled(waits);
                const live = [...this.runs.values()].filter(run => !TERMINAL.has(run.head.status) || run.attempt !== undefined || run.delivery !== undefined);
                if (live.length === 0)
                    break;
                for (const run of live) {
                    if (run.attempt !== undefined) {
                        run.attempt.intent = 'teardown';
                        try {
                            run.attempt.handle.cancel('workflow supervisor disposed');
                        }
                        catch { /* contained */ }
                    }
                }
            }
            await this.notifier.dispose();
            for (const remove of this.listenerDisposers.splice(0)) {
                try {
                    remove();
                }
                catch { /* contained */ }
            }
            if (this.ownsStore)
                await this.store.dispose();
        })();
        return this.disposal;
    }
    /** Side-effect-free one-path validation through H's dedicated API. */
    async validate(spec) {
        if (!spec.parent)
            return { ok: false, status: 'error', error: 'validate_only requires a calling agent' };
        let metaName = typeof spec.meta?.name === 'string'
            ? spec.meta.name
            : typeof spec.definition?.name === 'string' ? spec.definition.name : '';
        try {
            const source = this.resolveSource(spec);
            metaName = source.meta.name;
            const budget = this.resolveBudget(spec.agentBudget);
            const args = this.snapshotArgs(spec.args);
            const engine = this.ctx?.workflowEngine;
            if (typeof engine?.validate !== 'function') {
                return { ok: false, status: 'error', error: `${spec.filename}: workflow engine validation is unavailable` };
            }
            const result = await engine.validate({
                script: scriptWithJobMapParallel(source.script),
                meta: source.meta,
                args,
                maxTotalAgents: budget,
                ...(spec.signal === undefined ? {} : { signal: spec.signal }),
            });
            return this.presentValidation(result, spec.filename, metaName);
        }
        catch (error) {
            if (spec.signal?.aborted)
                throw error;
            return { ok: false, status: 'error', error: rewriteValidationDiagnostic(renderThrown(error), spec.filename, metaName) };
        }
    }
    presentValidation(result, filename, metaName) {
        if (result?.ok === true && result.status === 'completed') {
            return { ok: true, status: 'completed', value: snapshotWorkflowJsonValue(result.value), note: VALIDATION_NOTE };
        }
        if (result?.ok === true && result.status === 'would-pause') {
            return { ok: true, status: 'would-pause', value: productWouldPause(result.value, this.config.maxEventTextBytes), note: VALIDATION_NOTE };
        }
        const diagnostic = rewriteValidationDiagnostic(String(result?.error ?? 'workflow smoke check failed'), filename, metaName);
        return {
            ok: false, status: 'error', error: diagnostic,
            ...(result?.errorCode === undefined ? {} : { errorCode: String(result.errorCode) }),
        };
    }
}
export default WorkflowSupervisor;
//# sourceMappingURL=index.js.map