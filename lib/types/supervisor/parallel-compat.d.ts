/**
 * Stock `@deepseek-ai/dsh-workflow-worker-thread` only accepts `parallel(thunks)`,
 * has no `complete()`, and rejects `minItems`/`maxItems` in agent schemas.
 * Prefix+wrap the admitted script so Grok-style job maps, `complete(value)`,
 * and bounded array schemas still settle. The saved definition on disk is left
 * unchanged.
 */
export declare const STOCK_SCRIPT_MARKER = "/* dsh-workflows-stock-compat v1 */\n";
export declare const PARALLEL_JOB_MAP_PRELUDE: string;
export declare const SCHEMA_STRIP_PRELUDE: string;
export declare const COMPLETE_PRELUDE: string;
/** Wrap a workflow script so stock workers accept Grok job maps, complete(), and array bounds. */
export declare function scriptWithJobMapParallel(script: string): string;
//# sourceMappingURL=parallel-compat.d.ts.map