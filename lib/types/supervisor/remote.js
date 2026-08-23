var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
import { randomBytes } from 'node:crypto';
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { decodeWorkflowCursor, encodeWorkflowCursor } from './cursors.js';
const PAGE_MIN = 1;
const PAGE_MAX = 200;
const PAGE_DEFAULT = 50;
const ARTIFACT_MIN = 4;
const ARTIFACT_MAX = 131_072;
const ARTIFACT_DEFAULT = 32_768;
function sessionIdOf(agent) {
    const value = agent.session?.id;
    return typeof value === 'string' ? value : '';
}
function failure(code, message, details) {
    if (code === 'revision-conflict') {
        return { ok: false, error: { code, message: 'workflow run changed; refresh it before applying a control', details: details } };
    }
    if (code === 'action-unavailable') {
        return { ok: false, error: { code, message, details: details } };
    }
    return { ok: false, error: { code, message, ...(details === undefined ? {} : { details }) } };
}
function validPageLimit(value) {
    const limit = value ?? PAGE_DEFAULT;
    return Number.isSafeInteger(limit) && limit >= PAGE_MIN && limit <= PAGE_MAX ? limit : undefined;
}
function validArtifactLimit(value) {
    const limit = value ?? ARTIFACT_DEFAULT;
    return Number.isSafeInteger(limit) && limit >= ARTIFACT_MIN && limit <= ARTIFACT_MAX ? limit : undefined;
}
function isAbort(error) {
    return (error instanceof DOMException && error.name === 'AbortError')
        || (error instanceof Error && error.name === 'AbortError');
}
function errorCode(error) {
    if (typeof error !== 'object' || error === null || !('code' in error))
        return undefined;
    const code = error.code;
    return typeof code === 'string' ? code : undefined;
}
function errorMessage(error) {
    return error instanceof Error ? error.message : '';
}
/** HMAC page bound is retained/pageable length; evicted/omitted stay metadata. */
function pageableTotal(kind, page) {
    if (kind === 'logs')
        return Math.max(0, Number(page.total) - Number(page.evicted ?? 0));
    if (kind === 'artifacts')
        return Math.max(0, Number(page.total) - Number(page.omitted ?? 0));
    return Number(page.total);
}
function unavailable(error, kind, extras) {
    if (isAbort(error))
        throw error;
    const code = errorCode(error);
    const message = errorMessage(error);
    if (code === 'WORKFLOW_CURSOR_INVALID') {
        return failure('invalid-cursor', 'workflow page cursor is invalid or belongs to another collection');
    }
    if (code === 'WORKFLOW_STALE_REVISION') {
        if (kind === 'artifact') {
            return failure('artifact-changed', 'workflow artifact collection changed; refresh it before reading', extras?.revision === undefined ? undefined : { revision: extras.revision });
        }
        return failure('stale-cursor', 'workflow page cursor is stale; refresh the collection');
    }
    if (code === 'WORKFLOW_LIMIT') {
        if (kind === 'artifact' || /maxBytes/u.test(message)) {
            return failure('invalid-artifact-limit', 'workflow artifact maxBytes must be a safe integer from 4 through 131072', { min: 4, max: 131_072 });
        }
        return failure('invalid-page-limit', 'workflow page limit must be a safe integer from 1 through 200', { min: 1, max: 200 });
    }
    if (code === 'WORKFLOW_STORAGE_CORRUPT') {
        return failure('stale-cursor', 'workflow page cursor is stale; refresh the collection');
    }
    if (code === 'WORKFLOW_STORAGE_UNSUPPORTED' || code === 'WORKFLOW_STORAGE_LIMIT') {
        return failure('storage-unavailable', kind === 'artifact'
            ? 'workflow scratch artifacts are unavailable'
            : 'workflow retained details are unavailable');
    }
    // Only authorization/identity misses become indistinguishable not-found.
    // UNSAFE and unexpected faults stay outer so they are not laundered as a
    // missing id.
    if (code === 'WORKFLOW_RUN_NOT_FOUND' || code === 'WORKFLOW_RUN_NOT_OWNED' || code === 'WORKFLOW_INVALID_STATE') {
        if (kind === 'member')
            return failure('member-not-found', 'workflow member was not found in this run');
        if (kind === 'artifact')
            return failure('artifact-not-found', 'workflow scratch artifact was not found');
        return failure('run-not-found', 'workflow run was not found');
    }
    throw error;
}
/** Direct Agent-authorized run API. Protected values are never event payloads. */
let WorkflowRunsRemote = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _list_decorators;
    let _detail_decorators;
    let _members_decorators;
    let _memberDetail_decorators;
    let _logs_decorators;
    let _result_decorators;
    let _artifacts_decorators;
    let _artifact_decorators;
    let _control_decorators;
    return class WorkflowRunsRemote extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _list_decorators = [Remote('list')];
            _detail_decorators = [Remote('detail')];
            _members_decorators = [Remote('members')];
            _memberDetail_decorators = [Remote('memberDetail')];
            _logs_decorators = [Remote('logs')];
            _result_decorators = [Remote('result')];
            _artifacts_decorators = [Remote('artifacts')];
            _artifact_decorators = [Remote('artifact')];
            _control_decorators = [Remote('control')];
            __esDecorate(this, null, _list_decorators, { kind: "method", name: "list", static: false, private: false, access: { has: obj => "list" in obj, get: obj => obj.list }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _detail_decorators, { kind: "method", name: "detail", static: false, private: false, access: { has: obj => "detail" in obj, get: obj => obj.detail }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _members_decorators, { kind: "method", name: "members", static: false, private: false, access: { has: obj => "members" in obj, get: obj => obj.members }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _memberDetail_decorators, { kind: "method", name: "memberDetail", static: false, private: false, access: { has: obj => "memberDetail" in obj, get: obj => obj.memberDetail }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _logs_decorators, { kind: "method", name: "logs", static: false, private: false, access: { has: obj => "logs" in obj, get: obj => obj.logs }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _result_decorators, { kind: "method", name: "result", static: false, private: false, access: { has: obj => "result" in obj, get: obj => obj.result }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _artifacts_decorators, { kind: "method", name: "artifacts", static: false, private: false, access: { has: obj => "artifacts" in obj, get: obj => obj.artifacts }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _artifact_decorators, { kind: "method", name: "artifact", static: false, private: false, access: { has: obj => "artifact" in obj, get: obj => obj.artifact }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _control_decorators, { kind: "method", name: "control", static: false, private: false, access: { has: obj => "control" in obj, get: obj => obj.control }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        static inject = ['workflowSupervisor'];
        supervisor = __runInitializers(this, _instanceExtraInitializers);
        cursorSecret = randomBytes(32);
        processEpoch = randomBytes(16).toString('hex');
        constructor(ctx) {
            super(ctx, 'workflowRunsRemote', { namespace: 'workflowRuns' });
            this.supervisor = ctx.workflowSupervisor;
        }
        cursorOffset(cursor, kind, sessionId, entityId, revision, total) {
            if (cursor === undefined)
                return { ok: true, value: 0 };
            const decoded = decodeWorkflowCursor(this.cursorSecret, String(cursor), {
                kind, sessionId, entityId, processEpoch: this.processEpoch, revision, total,
            });
            if (decoded.ok)
                return { ok: true, value: decoded.value.offset };
            return decoded.reason === 'stale'
                ? failure('stale-cursor', 'workflow page cursor is stale; refresh the collection')
                : failure('invalid-cursor', 'workflow page cursor is invalid or belongs to another collection');
        }
        nextCursor(kind, sessionId, entityId, revision, offset, returned, total) {
            const next = offset + returned;
            // A zero-length page must not mint a continuation token; that is the
            // retained-vs-evicted-total loop that HMAC paging is here to prevent.
            if (returned === 0 || next >= total)
                return undefined;
            return encodeWorkflowCursor(this.cursorSecret, {
                version: 1, kind, sessionId, entityId, processEpoch: this.processEpoch,
                revision, offset: next,
            });
        }
        async list(agent, request, signal) {
            signal.throwIfAborted();
            const limit = validPageLimit(request?.limit);
            if (limit === undefined) {
                return failure('invalid-page-limit', 'workflow page limit must be a safe integer from 1 through 200', { min: 1, max: 200 });
            }
            try {
                const sessionId = sessionIdOf(agent);
                // A cursorless request defines a new snapshot, so its page is the
                // baseline. Reading a one-row baseline first creates an avoidable race:
                // an actively running workflow can advance between the two reads and
                // make opening/refreshing the dashboard fail as a stale cursor even
                // though the caller supplied no cursor at all.
                if (request?.cursor === undefined) {
                    const page = await this.supervisor.list(agent, { limit }, signal);
                    signal.throwIfAborted();
                    const items = page.items.slice(0, limit);
                    const revision = page.sessionRevision;
                    const nextCursor = this.nextCursor('runs', sessionId, '', revision, 0, items.length, page.total);
                    return { ok: true, value: {
                            epoch: this.processEpoch,
                            sessionRevision: revision, items, total: page.total,
                            ...(nextCursor === undefined ? {} : { nextCursor }),
                        } };
                }
                // Obtain the current authorized baseline before accepting its cursor.
                const baseline = await this.supervisor.list(agent, { limit: 1 }, signal);
                signal.throwIfAborted();
                const revision = baseline.sessionRevision;
                const offsetResult = this.cursorOffset(request?.cursor, 'runs', sessionId, '', revision, baseline.total);
                if (!offsetResult.ok)
                    return offsetResult;
                const offset = offsetResult.value;
                const page = offset === 0 && limit === 1
                    ? baseline
                    : await this.supervisor.list(agent, { limit, cursor: String(offset) }, signal);
                signal.throwIfAborted();
                // A mutation during the second read makes the requested baseline stale.
                if (page.sessionRevision !== revision || String(page.epoch) !== String(baseline.epoch)) {
                    return failure('stale-cursor', 'workflow page cursor is stale; refresh the collection');
                }
                const items = page.items.slice(0, limit);
                const nextCursor = this.nextCursor('runs', sessionId, '', revision, offset, items.length, baseline.total);
                return { ok: true, value: {
                        epoch: this.processEpoch,
                        sessionRevision: revision, items, total: baseline.total,
                        ...(nextCursor === undefined ? {} : { nextCursor }),
                    } };
            }
            catch (error) {
                return unavailable(error, 'run');
            }
        }
        async detail(agent, request, signal) {
            signal.throwIfAborted();
            try {
                const detail = await this.supervisor.detail(agent, request.runId, signal);
                signal.throwIfAborted();
                // Absolute script projections are Host-only execution authority.
                const { scriptPath: _scriptPath, ...redacted } = detail;
                return { ok: true, value: redacted };
            }
            catch (error) {
                return unavailable(error, 'run');
            }
        }
        async page(agent, request, signal, kind, read) {
            const limit = validPageLimit(request.limit);
            if (limit === undefined) {
                return failure('invalid-page-limit', 'workflow page limit must be a safe integer from 1 through 200', { min: 1, max: 200 });
            }
            signal.throwIfAborted();
            try {
                // Authorize the selected run before any cursor distinction is exposed.
                await this.supervisor.detail(agent, request.runId, signal);
                // As with the run list, a cursorless page establishes (rather than
                // continues) a snapshot. Use that one read both as the page and as the
                // revision/total bound for the first authenticated continuation token.
                if (request.cursor === undefined) {
                    const value = await read({ ...request, limit });
                    signal.throwIfAborted();
                    const items = value.items.slice(0, limit);
                    const hmac = this.nextCursor(kind, sessionIdOf(agent), String(request.runId), value.revision, 0, items.length, pageableTotal(kind, value));
                    const rest = { ...value, nextCursor: undefined };
                    delete rest.nextCursor;
                    return { ok: true, value: { ...rest, items, ...(hmac === undefined ? {} : { nextCursor: hmac }) } };
                }
                const baseline = await read({ ...request, cursor: undefined, limit: 1 });
                signal.throwIfAborted();
                const bound = pageableTotal(kind, baseline);
                const offsetResult = this.cursorOffset(request.cursor, kind, sessionIdOf(agent), String(request.runId), baseline.revision, bound);
                if (!offsetResult.ok)
                    return offsetResult;
                const offset = offsetResult.value;
                const value = await read({ ...request, cursor: String(offset), limit });
                signal.throwIfAborted();
                if (value.revision !== baseline.revision)
                    return failure('stale-cursor', 'workflow page cursor is stale; refresh the collection');
                const items = value.items.slice(0, limit);
                const hmac = this.nextCursor(kind, sessionIdOf(agent), String(request.runId), value.revision, offset, items.length, pageableTotal(kind, value));
                const rest = { ...value, nextCursor: undefined };
                delete rest.nextCursor;
                return { ok: true, value: { ...rest, items, ...(hmac === undefined ? {} : { nextCursor: hmac }) } };
            }
            catch (error) {
                return unavailable(error, 'run');
            }
        }
        async members(agent, request, signal) {
            if (this.supervisor.members === undefined)
                return failure('storage-unavailable', 'workflow retained member details are unavailable');
            return this.page(agent, request, signal, 'members', value => this.supervisor.members(agent, value, signal));
        }
        async memberDetail(agent, request, signal) {
            signal.throwIfAborted();
            try {
                await this.supervisor.detail(agent, request.runId, signal);
            }
            catch (error) {
                return unavailable(error, 'run');
            }
            try {
                if (this.supervisor.memberDetail === undefined)
                    return failure('member-not-found', 'workflow member was not found in this run');
                const value = await this.supervisor.memberDetail(agent, request, signal);
                signal.throwIfAborted();
                return { ok: true, value };
            }
            catch (error) {
                return unavailable(error, 'member');
            }
        }
        async logs(agent, request, signal) {
            if (this.supervisor.logs === undefined)
                return failure('storage-unavailable', 'workflow retained logs are unavailable');
            return this.page(agent, request, signal, 'logs', value => this.supervisor.logs(agent, value, signal));
        }
        async result(agent, request, signal) {
            signal.throwIfAborted();
            try {
                await this.supervisor.detail(agent, request.runId, signal);
            }
            catch (error) {
                return unavailable(error, 'run');
            }
            try {
                if (this.supervisor.result === undefined)
                    return failure('storage-unavailable', 'workflow retained result is unavailable');
                const value = await this.supervisor.result(agent, request.runId, signal);
                signal.throwIfAborted();
                return { ok: true, value };
            }
            catch (error) {
                return unavailable(error, 'run');
            }
        }
        async artifacts(agent, request, signal) {
            if (this.supervisor.artifacts === undefined)
                return failure('storage-unavailable', 'workflow scratch artifacts are unavailable');
            return this.page(agent, request, signal, 'artifacts', value => this.supervisor.artifacts(agent, value, signal));
        }
        async artifact(agent, request, signal) {
            signal.throwIfAborted();
            const maxBytes = validArtifactLimit(request.maxBytes);
            if (maxBytes === undefined) {
                return failure('invalid-artifact-limit', 'workflow artifact maxBytes must be a safe integer from 4 through 131072', { min: 4, max: 131_072 });
            }
            let revision = 0;
            try {
                const detail = await this.supervisor.detail(agent, request.runId, signal);
                revision = detail.run.artifactsRevision;
            }
            catch (error) {
                return unavailable(error, 'run');
            }
            try {
                if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(request.name)) {
                    return failure('artifact-not-found', 'workflow scratch artifact was not found');
                }
                if (request.expectedRevision !== undefined && request.expectedRevision !== revision) {
                    return failure('artifact-changed', 'workflow artifact collection changed; refresh it before reading', { revision });
                }
                if (this.supervisor.artifact === undefined)
                    return failure('artifact-not-found', 'workflow scratch artifact was not found');
                let offset = 0;
                let first;
                if (request.cursor !== undefined) {
                    // The backend will verify the exact current byte total. First read at
                    // offset zero obtains that protected total after run authorization.
                    first = await this.supervisor.artifact(agent, { ...request, cursor: undefined, maxBytes: ARTIFACT_MIN }, signal);
                    if (request.expectedRevision !== undefined && first.revision !== request.expectedRevision) {
                        return failure('artifact-changed', 'workflow artifact collection changed; refresh it before reading', { revision: first.revision });
                    }
                    const decoded = this.cursorOffset(request.cursor, 'artifact', sessionIdOf(agent), `${request.runId}\0${request.name}`, first.revision, first.totalBytes);
                    if (!decoded.ok)
                        return decoded;
                    offset = decoded.value;
                }
                const value = await this.supervisor.artifact(agent, { ...request, cursor: String(offset), maxBytes }, signal);
                signal.throwIfAborted();
                // Second-read CAS: a raced rewrite of identity/revision/length must not
                // return mixed page bytes from two generations.
                if ((request.expectedRevision !== undefined && value.revision !== request.expectedRevision)
                    || (first !== undefined && (value.revision !== first.revision
                        || value.totalBytes !== first.totalBytes
                        || value.artifact.name !== first.artifact.name
                        || value.artifact.bytes !== first.artifact.bytes))) {
                    return failure('artifact-changed', 'workflow artifact collection changed; refresh it before reading', { revision: value.revision });
                }
                const hmac = this.nextCursor('artifact', sessionIdOf(agent), `${request.runId}\0${request.name}`, value.revision, value.offsetBytes, value.returnedBytes, value.totalBytes);
                const rest = { ...value, nextCursor: undefined };
                delete rest.nextCursor;
                return { ok: true, value: { ...rest, ...(hmac === undefined ? {} : { nextCursor: hmac }) } };
            }
            catch (error) {
                return unavailable(error, 'artifact', { revision });
            }
        }
        async control(agent, request, signal) {
            signal.throwIfAborted();
            let current;
            try {
                current = await this.supervisor.detail(agent, request.runId, signal);
            }
            catch (error) {
                return unavailable(error, 'run');
            }
            const run = current.run;
            if (!Number.isSafeInteger(request.expectedRevision) || request.expectedRevision !== run.revision) {
                return failure('revision-conflict', 'workflow run changed; refresh it before applying a control', { run });
            }
            if (!run.allowedActions.includes(request.action)) {
                if (request.action === 'resume' && run.status === 'budget-limited') {
                    return failure('action-unavailable', `workflow "${run.displayName}" requires a higher agent_budget to resume`, { reason: 'budget-limited', run });
                }
                const reason = request.action === 'save' ? 'save-ineligible' : 'invalid-state';
                return failure('action-unavailable', `workflow action "${request.action}" is not available while run status is "${run.status}"`, { reason, run });
            }
            try {
                let updated;
                switch (request.action) {
                    case 'pause':
                        updated = await this.supervisor.pause(run.displayName, agent, signal);
                        break;
                    case 'resume':
                        updated = await this.supervisor.resume(run.displayName, agent, signal);
                        break;
                    case 'stop':
                        updated = await this.supervisor.stop(run.displayName, agent, signal);
                        break;
                    case 'save':
                        await this.supervisor.save(run.displayName, agent, undefined, signal);
                        updated = (await this.supervisor.detail(agent, request.runId, signal)).run;
                        break;
                }
                return { ok: true, value: { run: updated } };
            }
            catch (error) {
                if (isAbort(error))
                    throw error;
                const code = errorCode(error);
                if (code === 'WORKFLOW_STALE_REVISION') {
                    try {
                        const latest = (await this.supervisor.detail(agent, request.runId, signal)).run;
                        return failure('revision-conflict', 'workflow run changed; refresh it before applying a control', { run: latest });
                    }
                    catch (reread) {
                        return unavailable(reread, 'run');
                    }
                }
                if (code === 'WORKFLOW_RUN_NOT_FOUND' || code === 'WORKFLOW_RUN_NOT_OWNED')
                    return unavailable(error, 'run');
                if (code === 'WORKFLOW_INVALID_STATE' || code === 'WORKFLOW_LIMIT') {
                    const reason = request.action === 'save' ? 'save-ineligible' : 'invalid-state';
                    if (request.action === 'resume' && run.status === 'budget-limited') {
                        return failure('action-unavailable', `workflow "${run.displayName}" requires a higher agent_budget to resume`, { reason: 'budget-limited', run });
                    }
                    return failure('action-unavailable', `workflow action "${request.action}" is not available while run status is "${run.status}"`, { reason, run });
                }
                throw error;
            }
        }
    };
})();
export { WorkflowRunsRemote };
//# sourceMappingURL=remote.js.map