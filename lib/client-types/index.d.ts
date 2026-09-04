import type { Context as ClientContext } from '@deepseek-ai/cordis';
export * from './contract.js';
export * from './controller.js';
export * from './adapter.js';
export * from './store.js';
export * from './locales.js';
export * from './WorkflowsDashboard.js';
export * from './WorkflowRunPanel.js';
export * from './WorkflowMemberInspector.js';
export * from './workflow-definition.js';
/** Services consumed by the browser half of the package. */
export declare const inject: readonly ["connection", "remote", "sessions", "slots", "conversationEvents", "commandUi", "inputTriggers", "locale"];
/**
 * Register one complete browser aggregate.  The generated Remote is mounted
 * first; every consumer and listener is created in that mount's effect and
 * is disposed before the contribution is unmounted.
 */
export declare function apply(ctx: ClientContext): Promise<void>;
//# sourceMappingURL=index.d.ts.map