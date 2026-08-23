/**
 * Stock `@deepseek-ai/dsh-workflow-worker-thread` only accepts `parallel(thunks)`,
 * has no `complete()`, and rejects `minItems`/`maxItems` in agent schemas.
 * Prefix+wrap the admitted script so Grok-style job maps, `complete(value)`,
 * and bounded array schemas still settle. The saved definition on disk is left
 * unchanged.
 */
export const STOCK_SCRIPT_MARKER = '/* dsh-workflows-stock-compat v1 */\n';
/** Private result envelope used only when the stock worker has no scratch RPC. */
export const STOCK_RESULT_ENVELOPE = '__dsh_workflows_stock_result_v1__';
export const PARALLEL_JOB_MAP_PRELUDE = 'parallel = (function (hostParallel) {'
    + 'return function (items) {'
    + 'if (!Array.isArray(items)) return hostParallel(items);'
    + 'return hostParallel(items.map(function (item, index) {'
    + 'if (typeof item === "function") return item;'
    + 'if (item != null && typeof item === "object" && typeof item.prompt === "string" && item.prompt.length > 0) {'
    + 'return function () {'
    + 'var opts = {};'
    + 'if (item.label != null) opts.label = item.label;'
    + 'if (item.phase != null) opts.phase = item.phase;'
    + 'if (item.schema != null) opts.schema = item.schema;'
    + 'if (item.provider != null) opts.provider = item.provider;'
    + 'if (item.model != null) opts.model = item.model;'
    + 'return agent(item.prompt, opts);'
    + '};'
    + '}'
    + 'throw new TypeError("parallel() item " + index + " is not a function or job map");'
    + '}));'
    + '};'
    + '})(parallel);\n';
export const SCHEMA_STRIP_PRELUDE = 'agent = (function (hostAgent) {'
    + 'function stripSchema(schema) {'
    + 'if (schema == null || typeof schema !== "object") return schema;'
    + 'if (Array.isArray(schema)) {'
    + 'var copy = [];'
    + 'for (var i = 0; i < schema.length; i++) copy.push(stripSchema(schema[i]));'
    + 'return copy;'
    + '}'
    + 'var out = {};'
    + 'var keys = Object.keys(schema);'
    + 'for (var k = 0; k < keys.length; k++) {'
    + 'var key = keys[k];'
    + 'if (key === "minItems" || key === "maxItems") continue;'
    + 'out[key] = stripSchema(schema[key]);'
    + '}'
    + 'return out;'
    + '}'
    + 'function withStrippedSchema(opts) {'
    + 'if (opts == null || typeof opts !== "object") return opts;'
    + 'var next = {};'
    + 'var optKeys = Object.keys(opts);'
    + 'for (var j = 0; j < optKeys.length; j++) {'
    + 'if (opts[optKeys[j]] != null) next[optKeys[j]] = opts[optKeys[j]];'
    + '}'
    + 'if (next.schema != null) next.schema = stripSchema(next.schema);'
    + 'return next;'
    + '}'
    + 'return function (prompt, opts) { return hostAgent(prompt, withStrippedSchema(opts)); };'
    + '})(agent);\n';
export const COMPLETE_PRELUDE = 'var __dshWfComplete = { done: false };'
    + 'function complete(value) {'
    + 'if (!__dshWfComplete.done) {'
    + '__dshWfComplete.done = true;'
    + '__dshWfComplete.value = value;'
    + 'agent = function () { throw __dshWfComplete; };'
    + 'parallel = function () { throw __dshWfComplete; };'
    + 'pipeline = function () { throw __dshWfComplete; };'
    + 'phase = function () { throw __dshWfComplete; };'
    + 'log = function () { throw __dshWfComplete; };'
    + 'budget = function () { throw __dshWfComplete; };'
    + 'write_scratch_file = function () { throw __dshWfComplete; };'
    + 'read_scratch_file = function () { throw __dshWfComplete; };'
    + '}'
    + 'throw __dshWfComplete;'
    + '}'
    + 'try { globalThis.complete = complete } catch (__dshWfCompleteBind) {}'
    + '\n';
const COMPLETE_TRY = 'try {\nvar __dshWfResult = await (async function () {\n';
const COMPLETE_CATCH = '\n})();\n'
    + 'return __dshWfStockFinish(__dshWfComplete.done ? __dshWfComplete.value : __dshWfResult);\n'
    + '} catch (__dshWfErr) {\n'
    + 'if (__dshWfErr === __dshWfComplete) return __dshWfStockFinish(__dshWfComplete.value);\n'
    + 'throw __dshWfErr;\n'
    + '}\n';
function positiveInteger(value, fallback) {
    return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}
/**
 * Add hooks which can be implemented faithfully inside the stock evaluator.
 * Native engine hooks always win. On the compatibility evaluator, budget is counted at the agent-call
 * boundary and scratch is retained in the worker until the terminal result,
 * then unwrapped and persisted by the supervisor.
 */
export function stockBudgetScratchPrelude(options = {}) {
    const limits = JSON.stringify({
        total: positiveInteger(options.agentBudget, 128),
        operations: positiveInteger(options.scratchMaxOperations, 4_096),
        files: positiveInteger(options.scratchMaxFiles, 64),
        fileBytes: positiveInteger(options.scratchMaxFileBytes, 1_048_576),
        totalBytes: positiveInteger(options.scratchMaxTotalBytes, 8_388_608),
    });
    return (`var __dshWfStockLimits = ${limits};`
        + 'var __dshWfHostBudget = typeof globalThis.budget === "function" ? globalThis.budget : null;'
        + 'var __dshWfHostWriteScratch = typeof globalThis.write_scratch_file === "function" ? globalThis.write_scratch_file : null;'
        + 'var __dshWfHostReadScratch = typeof globalThis.read_scratch_file === "function" ? globalThis.read_scratch_file : null;'
        + 'var __dshWfStockSpent = 0;'
        + 'if (!__dshWfHostBudget) {'
        + 'agent = (function (hostAgent) { return function (prompt, opts) {'
        + 'if (__dshWfStockSpent < __dshWfStockLimits.total) __dshWfStockSpent += 1;'
        + 'return hostAgent(prompt, opts);'
        + '}; })(agent);'
        + 'budget = function () { return { total: __dshWfStockLimits.total, spent: __dshWfStockSpent, reserved: 0, remaining: Math.max(0, __dshWfStockLimits.total - __dshWfStockSpent) }; };'
        + '} else { budget = function () { return __dshWfHostBudget(); }; }'
        + 'var __dshWfStockScratch = Object.create(null);'
        + 'var __dshWfStockScratchOps = 0;'
        + 'var __dshWfStockScratchUsed = false;'
        + 'function __dshWfUtf8Bytes(text) {'
        + 'var bytes = 0; for (var i = 0; i < text.length; i += 1) {'
        + 'var code = text.charCodeAt(i);'
        + 'if (code < 128) bytes += 1; else if (code < 2048) bytes += 2;'
        + 'else if (code >= 55296 && code <= 56319 && i + 1 < text.length && text.charCodeAt(i + 1) >= 56320 && text.charCodeAt(i + 1) <= 57343) { bytes += 4; i += 1; }'
        + 'else bytes += 3; } return bytes;'
        + '}'
        + 'function __dshWfScratchName(name) {'
        + 'if (typeof name !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) throw new TypeError("scratch file name must be a single component (letters, digits, . _ -)");'
        + 'return name;'
        + '}'
        + 'if (__dshWfHostWriteScratch && __dshWfHostReadScratch) {'
        + 'write_scratch_file = function (name, content) { return __dshWfHostWriteScratch(name, content); };'
        + 'read_scratch_file = function (name) { return __dshWfHostReadScratch(name); };'
        + '} else {'
        + 'write_scratch_file = async function (name, content) {'
        + 'name = __dshWfScratchName(name); if (typeof content !== "string") throw new TypeError("write_scratch_file() content must be a string");'
        + '__dshWfStockScratchOps += 1; if (__dshWfStockScratchOps > __dshWfStockLimits.operations) throw new RangeError("workflow scratch operation limit exceeded");'
        + 'var contentBytes = __dshWfUtf8Bytes(content); if (contentBytes > __dshWfStockLimits.fileBytes) throw new RangeError("workflow scratch file limit exceeded");'
        + 'var names = Object.keys(__dshWfStockScratch); if (!Object.prototype.hasOwnProperty.call(__dshWfStockScratch, name) && names.length >= __dshWfStockLimits.files) throw new RangeError("workflow scratch file-count limit exceeded");'
        + 'var total = contentBytes; for (var i = 0; i < names.length; i += 1) if (names[i] !== name) total += __dshWfUtf8Bytes(__dshWfStockScratch[names[i]]);'
        + 'if (total > __dshWfStockLimits.totalBytes) throw new RangeError("workflow scratch total-byte limit exceeded");'
        + '__dshWfStockScratch[name] = content; __dshWfStockScratchUsed = true;'
        + '};'
        + 'read_scratch_file = async function (name) {'
        + 'name = __dshWfScratchName(name); __dshWfStockScratchOps += 1; if (__dshWfStockScratchOps > __dshWfStockLimits.operations) throw new RangeError("workflow scratch operation limit exceeded");'
        + 'return Object.prototype.hasOwnProperty.call(__dshWfStockScratch, name) ? __dshWfStockScratch[name] : undefined;'
        + '};'
        + '}'
        + `function __dshWfStockFinish(value) { return __dshWfStockUsedResult(value); }`
        + `function __dshWfStockUsedResult(value) { if (!__dshWfStockUsed()) return value; return { ${JSON.stringify(STOCK_RESULT_ENVELOPE)}: true, value: value === undefined ? null : value, scratch: __dshWfStockScratch }; }`
        + 'function __dshWfStockUsed() { return !__dshWfHostWriteScratch && __dshWfStockScratchUsed; }'
        + '\n');
}
/** Read and validate the private stock result envelope without trusting its prototype. */
export function unwrapStockCompatibilityResult(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        return undefined;
    const record = value;
    if (record[STOCK_RESULT_ENVELOPE] !== true
        || typeof record.scratch !== 'object' || record.scratch === null || Array.isArray(record.scratch))
        return undefined;
    const scratch = Object.create(null);
    for (const [name, content] of Object.entries(record.scratch)) {
        if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(name) || typeof content !== 'string')
            return undefined;
        scratch[name] = content;
    }
    return { value: record.value, scratch };
}
/** Wrap a workflow script so stock workers accept the Grok script contract. */
export function scriptWithJobMapParallel(script, options = {}) {
    if (script.startsWith(STOCK_SCRIPT_MARKER))
        return script;
    return (STOCK_SCRIPT_MARKER
        + SCHEMA_STRIP_PRELUDE
        + stockBudgetScratchPrelude(options)
        + PARALLEL_JOB_MAP_PRELUDE
        + COMPLETE_PRELUDE
        + COMPLETE_TRY
        + script
        + COMPLETE_CATCH);
}
//# sourceMappingURL=parallel-compat.js.map