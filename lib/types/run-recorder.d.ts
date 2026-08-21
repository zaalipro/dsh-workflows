export declare const name = "workflow-run-recorder";
export declare const inject: readonly ["workflowSupervisor", "agents"];
/**
 * Best-effort durable projection for explicitly attributed top-level launches.
 * Recording failures never alter execution and disable only the corrupt prefix.
 */
export declare class WorkflowRunRecorder {
    private readonly ctx;
    private readonly attribution;
    private readonly active;
    private readonly recoveries;
    private readonly listeners;
    private readonly lifetime;
    private disposed;
    private disposal?;
    constructor(ctx?: any);
    private listen;
    /** Attribute exactly the first synchronously published logical id. */
    launch<T extends {
        readonly runId: string;
        readonly displayName: string;
    }>(session: any, start: () => Promise<T>): Promise<T>;
    private empty;
    private warn;
    private append;
    private buffer;
    private replayBeforePublication;
    private onRunStart;
    private onMemberStart;
    private appendMemberStart;
    private onMemberEnd;
    private appendMemberEnd;
    private onRunEnd;
    private seed;
    /** Reconcile unfinished durable Chat prefixes from one atomic supervisor snapshot. */
    reconcile(agent: any): Promise<void>;
    private reconcileSnapshot;
    private closeOpenMembers;
    private closeMissing;
    private activate;
    dispose(): Promise<void>;
}
export default WorkflowRunRecorder;
//# sourceMappingURL=run-recorder.d.ts.map