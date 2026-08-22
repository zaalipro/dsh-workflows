/**
 * Stock `@deepseek-ai/dsh-workflow-worker-thread` only accepts `parallel(thunks)`,
 * has no `complete()`, and rejects `minItems`/`maxItems` in agent schemas.
 * Prefix+wrap the admitted script so Grok-style job maps, `complete(value)`,
 * and bounded array schemas still settle. The saved definition on disk is left
 * unchanged.
 */

export const STOCK_SCRIPT_MARKER = '/* dsh-workflows-stock-compat v1 */\n'

export const PARALLEL_JOB_MAP_PRELUDE =
  'parallel = (function (hostParallel) {'
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
  + '})(parallel);\n'

export const SCHEMA_STRIP_PRELUDE =
  'agent = (function (hostAgent) {'
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
  + '})(agent);\n'

export const COMPLETE_PRELUDE =
  'var __dshWfComplete = { done: false };'
  + 'function complete(value) {'
  + 'if (!__dshWfComplete.done) {'
  + '__dshWfComplete.done = true;'
  + '__dshWfComplete.value = value;'
  + 'agent = function () { throw __dshWfComplete; };'
  + 'parallel = function () { throw __dshWfComplete; };'
  + 'pipeline = function () { throw __dshWfComplete; };'
  + 'phase = function () { throw __dshWfComplete; };'
  + 'log = function () { throw __dshWfComplete; };'
  + '}'
  + 'throw __dshWfComplete;'
  + '}'
  + 'try { globalThis.complete = complete } catch (__dshWfCompleteBind) {}'
  + '\n'

const COMPLETE_TRY = 'try {\nvar __dshWfResult = await (async function () {\n'
const COMPLETE_CATCH =
  '\n})();\n'
  + 'return __dshWfComplete.done ? __dshWfComplete.value : __dshWfResult;\n'
  + '} catch (__dshWfErr) {\n'
  + 'if (__dshWfErr === __dshWfComplete) return __dshWfComplete.value;\n'
  + 'throw __dshWfErr;\n'
  + '}\n'

/** Wrap a workflow script so stock workers accept Grok job maps, complete(), and array bounds. */
export function scriptWithJobMapParallel(script: string): string {
  if (script.startsWith(STOCK_SCRIPT_MARKER)) return script
  return (
    STOCK_SCRIPT_MARKER
    + SCHEMA_STRIP_PRELUDE
    + PARALLEL_JOB_MAP_PRELUDE
    + COMPLETE_PRELUDE
    + COMPLETE_TRY
    + script
    + COMPLETE_CATCH
  )
}
