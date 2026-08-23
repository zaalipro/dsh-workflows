/** Settlement payload the supervisor already understands. */
export interface EngineResult {
    readonly value: unknown;
    readonly stopReason: 'completed' | 'cancelled' | 'error';
    readonly error?: string;
    readonly errorCode?: string;
    readonly agentsStarted: number;
}
/** Replay journal captured after dispose. Unavailable on partial stock workers. */
export interface WorkflowCheckpoint {
    readonly journal: readonly {
        readonly callId: readonly [number, ...number[]];
        readonly fingerprint: string;
        readonly kind: string;
        readonly [key: string]: unknown;
    }[];
    readonly agentSpend: number;
    readonly agentSeq: number;
}
/** Supervisor-facing live attempt. The stock worker handle implements a subset. */
export interface EngineHandle {
    readonly id: string;
    readonly result: Promise<EngineResult>;
    /**
     * False only for a compatibility wrapper which cannot provide the replay
     * authority required by Pause/Resume. Complete handles predate this hint, so
     * an absent value means supported.
     */
    readonly supportsReplay?: boolean;
    cancel(reason?: string): void;
    resume(): void;
    release(): void;
    checkpoint(): WorkflowCheckpoint | undefined;
    dispose(): Promise<void>;
}
/** True when the engine exposes the complete deferred-start and replay face. */
export declare function isCompleteEngineHandle(raw: unknown): raw is EngineHandle;
/**
 * Stock `@deepseek-ai/dsh-workflow` `WorkflowRun` may expose only
 * `id`/`result`/`cancel`/`dispose`. Wrap that thin face so the supervisor can
 * admit a run instead of failing with "invalid run handle".
 */
export declare function adaptEngineHandle(raw: unknown): EngineHandle | undefined;
/** Whether Pause/Resume can be offered without replaying committed effects. */
export declare function supportsEngineReplay(handle: EngineHandle): boolean;
/** Best-effort cancel/dispose of a handle the supervisor will not keep. */
export declare function rejectPartialEngineHandle(raw: unknown): void;
//# sourceMappingURL=engine-compat.d.ts.map