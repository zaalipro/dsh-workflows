export type WorkflowCommand = {
    readonly kind: 'empty';
} | {
    readonly kind: 'launch';
    readonly name: string;
    readonly args: Record<string, unknown>;
} | {
    readonly kind: 'pause' | 'resume' | 'stop' | 'save';
    readonly displayName: string;
} | {
    readonly kind: 'malformed';
    readonly error: string;
};
export declare const WORKFLOW_COMMAND_HELP: string;
/** Parse workflow command text without resolving definitions or causing effects. */
export declare function parseWorkflowCommand(rawInput: string): WorkflowCommand;
//# sourceMappingURL=parser.d.ts.map