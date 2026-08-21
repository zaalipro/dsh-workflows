export interface WorkflowToolArgs {
    readonly name?: string;
    readonly script?: string;
    readonly script_path?: string;
    readonly meta?: Record<string, unknown>;
    readonly args?: Record<string, unknown>;
    readonly validate_only?: boolean;
    readonly resume_from_run_id?: string;
    readonly agent_budget?: number;
}
export type ParsedWorkflowToolRequest = {
    readonly kind: 'fresh';
    readonly source: {
        readonly kind: 'name';
        readonly name: string;
    } | {
        readonly kind: 'script';
        readonly script: string;
        readonly meta: Record<string, unknown>;
    } | {
        readonly kind: 'script_path';
        readonly path: string;
        readonly meta?: Record<string, unknown>;
    };
    readonly args: Record<string, unknown>;
    readonly validateOnly: boolean;
    readonly agentBudget?: number;
} | {
    readonly kind: 'resume';
    readonly runId: string;
    readonly agentBudget?: number;
};
/** Validate model-facing workflow request before any source or runtime side effect. */
export declare function parseWorkflowToolRequest(value: unknown): ParsedWorkflowToolRequest;
export declare const WORKFLOW_TOOL_SCHEMA: {
    readonly type: "object";
    readonly additionalProperties: false;
    readonly properties: {
        readonly name: {
            readonly type: "string";
        };
        readonly script: {
            readonly type: "string";
        };
        readonly script_path: {
            readonly type: "string";
        };
        readonly meta: {
            readonly type: "object";
        };
        readonly args: {
            readonly type: "object";
        };
        readonly validate_only: {
            readonly type: "boolean";
        };
        readonly resume_from_run_id: {
            readonly type: "string";
        };
        readonly agent_budget: {
            readonly type: "integer";
            readonly minimum: 1;
            readonly maximum: 1024;
        };
    };
};
/** defineTool parameter map for the replacement; parseWorkflowToolRequest remains the cross-field gate. */
export declare const WORKFLOW_TOOL_PARAMETERS: {
    readonly name: {
        readonly type: "string";
        readonly description: "Saved workflow definition name to launch (one of name/script/script_path).";
    };
    readonly script: {
        readonly type: "string";
        readonly description: "The plain-JS workflow script body (top-level await allowed; NO `export const meta` statement). Requires `meta`.";
    };
    readonly script_path: {
        readonly type: "string";
        readonly description: "A .workflow.json envelope or a bare script file on disk to launch. A bare file requires `meta`.";
    };
    readonly meta: {
        readonly type: "object";
        readonly additionalProperties: false;
        readonly description: "The workflow identity block (plain JSON — never code); required with script or a bare script_path.";
        readonly properties: {
            readonly name: {
                readonly type: "string";
                readonly required: true;
                readonly description: "Short kebab-case workflow name.";
            };
            readonly description: {
                readonly type: "string";
                readonly required: true;
                readonly description: "One-line description of what the workflow does.";
            };
            readonly whenToUse: {
                readonly type: "string";
                readonly description: "Optional guidance on when this workflow applies.";
            };
            readonly phases: {
                readonly type: "array";
                readonly description: "Optional phase declarations matched by phase() calls.";
                readonly items: {
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly properties: {
                        readonly title: {
                            readonly type: "string";
                            readonly required: true;
                            readonly description: "The phase title phase() calls match by exact string.";
                        };
                        readonly detail: {
                            readonly type: "string";
                            readonly description: "Optional one-line description of the phase.";
                        };
                        readonly provider: {
                            readonly type: "string";
                            readonly description: "Optional provider override this phase is expected to use.";
                        };
                        readonly model: {
                            readonly type: "string";
                            readonly description: "Optional model override this phase is expected to use.";
                        };
                    };
                };
            };
        };
    };
    readonly args: {
        readonly type: "object";
        readonly additionalProperties: true;
        readonly description: "Optional JSON input exposed to the script as the `args` global (wrap a bare list as a field, e.g. {\"files\": [...]}).";
    };
    readonly validate_only: {
        readonly type: "boolean";
        readonly description: "Smoke-check one canned-host path instead of starting a live run (no children, no run record).";
    };
    readonly resume_from_run_id: {
        readonly type: "string";
        readonly description: "Resume a same-process paused run by its run id; reject combining with name/script/script_path.";
    };
    readonly agent_budget: {
        readonly type: "integer";
        readonly description: "Absolute logical-agent cap for this run (default 128, allowed 1–1024).";
    };
};
//# sourceMappingURL=schema.d.ts.map