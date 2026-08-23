/**
 * Stock `@deepseek-ai/dsh-workflow-worker-thread` only accepts `parallel(thunks)`,
 * has no `complete()`, and rejects `minItems`/`maxItems` in agent schemas.
 * Prefix+wrap the admitted script so Grok-style job maps, `complete(value)`,
 * and bounded array schemas still settle. The saved definition on disk is left
 * unchanged.
 */
export declare const STOCK_SCRIPT_MARKER = "/* dsh-workflows-stock-compat v1 */\n";
/** Private result envelope used only when the stock worker has no scratch RPC. */
export declare const STOCK_RESULT_ENVELOPE = "__dsh_workflows_stock_result_v1__";
export interface StockScriptCompatibilityOptions {
    readonly agentBudget?: number;
    readonly scratchMaxOperations?: number;
    readonly scratchMaxFiles?: number;
    readonly scratchMaxFileBytes?: number;
    readonly scratchMaxTotalBytes?: number;
}
export interface StockCompatibilityResult {
    readonly value: unknown;
    readonly scratch: Readonly<Record<string, string>>;
}
export declare const PARALLEL_JOB_MAP_PRELUDE: string;
export declare const SCHEMA_STRIP_PRELUDE: string;
export declare const COMPLETE_PRELUDE: string;
/**
 * Add hooks which can be implemented faithfully inside the stock evaluator.
 * Native engine hooks always win. On the compatibility evaluator, budget is counted at the agent-call
 * boundary and scratch is retained in the worker until the terminal result,
 * then unwrapped and persisted by the supervisor.
 */
export declare function stockBudgetScratchPrelude(options?: StockScriptCompatibilityOptions): string;
/** Read and validate the private stock result envelope without trusting its prototype. */
export declare function unwrapStockCompatibilityResult(value: unknown): StockCompatibilityResult | undefined;
/** Wrap a workflow script so stock workers accept the Grok script contract. */
export declare function scriptWithJobMapParallel(script: string, options?: StockScriptCompatibilityOptions): string;
//# sourceMappingURL=parallel-compat.d.ts.map