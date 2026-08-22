import type { WorkflowRegistry } from '../registry/index.js';
import type { WorkflowDefinitionEnvelope } from '../registry/types.js';
import { VALIDATION_NOTE } from '../supervisor/index.js';
import type { WorkflowSupervisor } from '../supervisor/index.js';
import type { JsonValue } from '@deepseek-ai/dsh-session';
import { parseWorkflowToolRequest } from './schema.js';
export * from './schema.js';
export { VALIDATION_NOTE };
/**
 * Opaque H contribution identities.  Release H U36 re-exports/uses these exact
 * objects when it mounts the official workflow contribution.  Until that
 * export exists, identity matching uses this package freeze plus an explicit
 * official marker; a same-name custom tool is never treated as official.
 */
export declare const WORKFLOW_TOOL_DEFINITION: any;
export declare const WORKFLOW_PROMPT_SECTION: any;
type WorkflowToolOutput = {
    status: 'started';
    displayName: string;
    runId: string;
    script_path?: string;
} | {
    status: 'resumed';
    displayName: string;
    runId: string;
} | {
    status: 'validated';
    ok: true;
    result?: JsonValue;
    saved_path?: string;
};
export interface WorkflowToolServices {
    readonly registry: WorkflowRegistry;
    readonly supervisor: WorkflowSupervisor;
    readonly recorder?: {
        launch(session: any, start: () => Promise<any>): Promise<any>;
    };
    readonly fs?: HostWorkflowFs;
    readonly definitionMaxBytes?: number;
    readonly maxResultChars?: number;
}
interface HostWorkflowFs {
    readBytesNoFollow(path: string, options: {
        cwd?: string;
    }, signal?: AbortSignal, maxBytes?: number): Promise<Uint8Array>;
}
/** Strict identity/marker predicate; a same-name custom tool is not official. */
export declare function isOfficialWorkflowTool(definition: unknown): boolean;
/** Render the launch/validate outcome for the tool result. */
export declare function renderLaunch(value: WorkflowToolOutput, maxChars?: number): string;
/** Atomically shadow one exact Agent's official tool and prompt contribution. */
export declare function installWorkflowShadow(agent: any, servicesOrTool: WorkflowToolServices | any): () => void;
export interface ToolShadowConfig {
    readonly enabled?: boolean;
    readonly services?: WorkflowToolServices;
}
/** Reconcile exact-Agent shadows on Agent/tool lifecycle changes. */
export declare function applyToolShadow(ctx: any, config?: ToolShadowConfig): (() => void) | undefined;
export interface ResolvedWorkflowSource {
    readonly script: string;
    readonly meta: WorkflowDefinitionEnvelope['meta'];
    readonly args: Record<string, unknown>;
    readonly filename: string;
}
interface ResolveOptions {
    readonly agent?: any;
    readonly signal?: AbortSignal;
    readonly definitionMaxBytes?: number;
}
/** Resolve exactly one validated model source without following its final path component. */
export declare function resolveWorkflowSource(ctx: any, request: ReturnType<typeof parseWorkflowToolRequest>, options?: ResolveOptions): Promise<ResolvedWorkflowSource>;
/** Create the exact model-facing background workflow operation. */
export declare function createWorkflowTool(services: WorkflowToolServices): import("@deepseek-ai/dsh-tools").ToolDefinition;
//# sourceMappingURL=index.d.ts.map