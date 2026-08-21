/**
 * Stock `@deepseek-ai/dsh-workflow-worker-thread` only accepts `parallel(thunks)`.
 * Grok / the authoring skill also emit declarative job maps. Prefix the script
 * so the frozen `parallel` global is replaced with a wrapper that materializes
 * `{ prompt, label?, phase?, schema?, provider?, model? }` into thunks.
 * The saved definition on disk is left unchanged.
 */
export const PARALLEL_JOB_MAP_PRELUDE =
  'parallel = (function (hostParallel) {'
  + 'return function (items) {'
  + 'if (!Array.isArray(items)) return hostParallel(items);'
  + 'return hostParallel(items.map(function (item, index) {'
  + 'if (typeof item === "function") return item;'
  + 'if (item != null && typeof item === "object" && typeof item.prompt === "string" && item.prompt.length > 0) {'
  + 'return function () { return agent(item.prompt, {'
  + 'label: item.label, phase: item.phase, schema: item.schema,'
  + 'provider: item.provider, model: item.model'
  + '}); };'
  + '}'
  + 'throw new TypeError("parallel() item " + index + " is not a function or job map");'
  + '}));'
  + '};'
  + '})(parallel);\n'

/** Wrap a workflow script so stock `parallel()` accepts Grok job maps. */
export function scriptWithJobMapParallel(script: string): string {
  if (script.startsWith(PARALLEL_JOB_MAP_PRELUDE)) return script
  return `${PARALLEL_JOB_MAP_PRELUDE}${script}`
}
