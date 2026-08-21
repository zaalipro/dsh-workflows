/**
 * Stock `@deepseek-ai/dsh-workflow-worker-thread` only accepts `parallel(thunks)`.
 * Grok / the authoring skill also emit declarative job maps. Prefix the script
 * so the frozen `parallel` global is replaced with a wrapper that materializes
 * `{ prompt, label?, phase?, schema?, provider?, model? }` into thunks.
 * The saved definition on disk is left unchanged.
 */
export declare const PARALLEL_JOB_MAP_PRELUDE: string;
/** Wrap a workflow script so stock `parallel()` accepts Grok job maps. */
export declare function scriptWithJobMapParallel(script: string): string;
//# sourceMappingURL=parallel-compat.d.ts.map