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
import { decodeWorkflowCursor, encodeWorkflowCursor } from '../supervisor/cursors.js';
const PAGE_MIN = 1;
const PAGE_MAX = 200;
const PAGE_DEFAULT = 50;
function sessionIdOf(agent) {
    const value = agent.session?.id;
    return typeof value === 'string' && value.length > 0 ? value : '';
}
function failure(code, message, details) {
    return { ok: false, error: { code, message, ...(details === undefined ? {} : { details }) } };
}
function pageLimit(value) {
    const limit = value ?? PAGE_DEFAULT;
    return Number.isSafeInteger(limit) && limit >= PAGE_MIN && limit <= PAGE_MAX ? limit : undefined;
}
/** Agent-authorized, path-redacting saved-definition Remote service. */
let WorkflowDefinitionsRemote = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _list_decorators;
    return class WorkflowDefinitionsRemote extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _list_decorators = [Remote('list')];
            __esDecorate(this, null, _list_decorators, { kind: "method", name: "list", static: false, private: false, access: { has: obj => "list" in obj, get: obj => obj.list }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        static inject = ['workflows'];
        registry = __runInitializers(this, _instanceExtraInitializers);
        cursorSecret = randomBytes(32);
        processEpoch = randomBytes(16).toString('hex');
        constructor(ctx) {
            super(ctx, 'workflowDefinitionsRemote', { namespace: 'workflowDefinitions' });
            this.registry = ctx.workflows;
        }
        async list(agent, request, signal) {
            signal.throwIfAborted();
            const limit = pageLimit(request?.limit);
            if (limit === undefined) {
                return failure('invalid-page-limit', 'workflow page limit must be a safe integer from 1 through 200', { min: PAGE_MIN, max: PAGE_MAX });
            }
            const cwd = agent.session?.header?.cwd;
            if (typeof cwd !== 'string' || cwd.length === 0) {
                return failure('workspace-unavailable', 'workflow definition listing requires a session cwd');
            }
            const sessionId = sessionIdOf(agent);
            if (sessionId.length === 0) {
                return failure('workspace-unavailable', 'workflow definition listing requires a session cwd');
            }
            let snapshot;
            do {
                signal.throwIfAborted();
                snapshot = await this.registry.snapshot({ cwd, signal });
                signal.throwIfAborted();
            } while (!snapshot.complete);
            const revision = snapshot.revision ?? 0;
            const total = snapshot.definitions.length;
            let offset = 0;
            if (request.cursor !== undefined) {
                const decoded = decodeWorkflowCursor(this.cursorSecret, String(request.cursor), {
                    kind: 'definitions', sessionId, entityId: '', processEpoch: this.processEpoch,
                    revision, total,
                });
                if (!decoded.ok) {
                    return decoded.reason === 'stale'
                        ? failure('stale-cursor', 'workflow page cursor is stale; refresh the collection')
                        : failure('invalid-cursor', 'workflow page cursor is invalid or belongs to another collection');
                }
                offset = decoded.value.offset;
            }
            const items = snapshot.definitions
                .slice(offset, offset + limit)
                .map(({ name, description, whenToUse, scope }) => ({
                name, description, ...(whenToUse === undefined ? {} : { whenToUse }), scope,
            }));
            const nextOffset = offset + items.length;
            const nextCursor = nextOffset < total
                ? encodeWorkflowCursor(this.cursorSecret, {
                    version: 1, kind: 'definitions', sessionId, entityId: '',
                    processEpoch: this.processEpoch, revision, offset: nextOffset,
                })
                : undefined;
            signal.throwIfAborted();
            return {
                ok: true,
                value: { items, total, revision, ...(nextCursor === undefined ? {} : { nextCursor }) },
            };
        }
    };
})();
export { WorkflowDefinitionsRemote };
//# sourceMappingURL=remote.js.map