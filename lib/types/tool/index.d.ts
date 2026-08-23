import type { WorkflowRegistry } from '../registry/index.js';
import type { WorkflowDefinitionEnvelope } from '../registry/types.js';
import { VALIDATION_NOTE } from '../supervisor/index.js';
import type { WorkflowSupervisor } from '../supervisor/index.js';
import type { JsonValue } from '@deepseek-ai/dsh-session';
import { parseWorkflowToolRequest } from './schema.js';
export * from './schema.js';
export { VALIDATION_NOTE };
/**
 * Opaque contribution identities for a Host that exposes atomic replacement.
 * Until the Host exports these exact objects, identity matching uses this
 * package freeze plus an explicit official marker; a same-name custom tool is
 * never treated as official.
 */
export declare const WORKFLOW_TOOL_DEFINITION: any;
export declare const WORKFLOW_PROMPT_SECTION: any;
/** Public-fingerprint check used only for stock's Agent-scoped shadow seam. */
export declare function isStockOfficialWorkflowTool(value: unknown): boolean;
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
    readBytesNoFollow?(path: string, options: {
        cwd?: string;
    }, signal?: AbortSignal, maxBytes?: number): Promise<Uint8Array>;
    resolve?(path: string, options?: {
        cwd?: string;
        signal?: AbortSignal;
    }): Promise<unknown>;
    lstat?(path: string, options?: {
        cwd?: string;
    }, signal?: AbortSignal): Promise<unknown>;
    processPath?(target: unknown): string;
    fileUrl?(target: unknown): string;
    readBytes?(target: unknown, signal: AbortSignal | undefined, maxBytes: number): Promise<Uint8Array>;
}
/** Verified identity/marker or stock fingerprint; custom same-name tools are not official. */
export declare function isOfficialWorkflowTool(definition: unknown): boolean;
/** Render the launch/validate outcome for the tool result. */
export declare function renderLaunch(value: WorkflowToolOutput, maxChars?: number): string;
/** Shadow one Agent via atomic CAS or rollback-safe scoped registrations. */
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