import { allocateWorkflowCommandNames } from './aliases.js';
import type { WorkflowRegistry } from '../registry/index.js';
import type { WorkflowSupervisor } from '../supervisor/index.js';
export * from './parser.js';
export * from './aliases.js';
export declare const name = "commands";
export interface CommandsConfig {
    readonly enabled?: boolean;
    /** Root composition registers the protected skill as a separate child. */
    readonly registerSkill?: boolean;
}
export declare const CommandsConfig: {
    readonly enabled: true;
};
export interface CommandResult {
    readonly content: string;
    readonly isError?: boolean;
}
export declare const COMMAND_SUCCESS: {
    pause: (display: string) => string;
    resume: (display: string) => string;
    stop: (display: string) => string;
};
export declare const CREATE_WORKFLOW_COMMAND_DESCRIPTION = "Author, smoke-check, and save a new workflow (create-workflow skill)";
export interface WorkflowCommandServices {
    readonly registry: Pick<WorkflowRegistry, 'get'>;
    readonly supervisor: Pick<WorkflowSupervisor, 'start' | 'pause' | 'resume' | 'stop' | 'save'>;
    readonly agent: any;
    readonly recorder?: {
        launch?(session: any, start: () => Promise<any>): Promise<any>;
    };
    readonly cwd?: string;
    readonly signal?: AbortSignal;
}
/** Execute a parsed command in small standalone fixtures as well as a Host. */
export declare function executeWorkflowCommand(input: string, services: WorkflowCommandServices): Promise<CommandResult>;
/** Resolve candidate packaged-skill URLs from source or an installed lib layout. */
export declare function packagedSkillCandidates(here?: string | URL): readonly URL[];
/** Resolve the shipped skill asset from source or an installed lib layout. */
export declare function packagedSkillPath(here?: string | URL): URL;
/** Split YAML frontmatter from the registered Markdown body. */
export declare function parsePackagedSkillDocument(text: string): {
    readonly description: string;
    readonly content: string;
};
export declare function readPackagedSkillFrom(candidates: readonly URL[]): Promise<string>;
export declare function readPackagedSkillSyncFrom(candidates: readonly URL[]): string;
export declare function readPackagedSkill(): Promise<string>;
export declare function readPackagedSkillSync(): string;
/** Use H's protected package binding; never emulate trust with a low rank. */
export declare function registerTrustedWorkflowSkill(ctx: any): Promise<() => void>;
export declare function registerTrustedWorkflowSkillSync(ctx: any): () => unknown;
/** Mount Host commands and exact-Agent definition aliases. */
export declare function applyCommands(ctx: any, config?: CommandsConfig): (() => Promise<void>) | undefined;
export declare const apply: typeof applyCommands;
export { allocateWorkflowCommandNames };
//# sourceMappingURL=index.d.ts.map