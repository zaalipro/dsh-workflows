import type { DetailReadRequest, DetailReadResult, RecoveredRun, WorkflowCompletionNoticeFinalization, WorkflowRunCommitRequest, WorkflowRunDetailPayloadV2, WorkflowRunArtifactIdentity, WorkflowRunArtifactInventory, WorkflowRunArtifactRead, WorkflowRunHeadRecord, WorkflowRunIdentity, WorkflowRunInsertRequest, WorkflowRunStore, WorkflowStoreOptions, WorkflowTerminalCommitRequest } from './manifest-types.js';
import type { WorkflowStorageLayout } from './private-root.js';
export declare class FileWorkflowRunStore implements WorkflowRunStore {
    private readonly options;
    private readonly lease?;
    private readonly layout?;
    private readonly sessions;
    private readonly details;
    private mutationTail;
    private disposed;
    private initialized;
    private recovered;
    constructor(options: WorkflowStoreOptions, lease?: {
        assertCurrent(): Promise<void>;
    } | undefined, layout?: WorkflowStorageLayout | undefined);
    private guard;
    private mutate;
    private manifestPath;
    private runPath;
    private empty;
    /** Traverse a retained storage capability and close only capabilities this
     * operation opened.  The root/category descriptors belong to the bootstrap
     * layout and are never closed here. */
    private withDirectory;
    private withRunDirectory;
    private withCategory;
    /** Remove a manifest-selected tree only through retained directory
     * capabilities.  The local path helpers below are reserved for the
     * standalone fallback store; a Host layout without a removal primitive
     * fails closed instead of recursing through strings. */
    private removeCapabilityTree;
    private removeCapabilitySubtree;
    private capabilityTreeBytes;
    private committedBytes;
    private removeRunTree;
    private removeStagingTree;
    /** Rename an identity-pinned run or staging tree into quarantine, then
     * delete only through the quarantined child.  An identity change aborts
     * cleanup with UNSAFE rather than following a substituted path. */
    private quarantineThenRemove;
    private readCapabilityFile;
    private writeCapabilityFile;
    private removeCapabilityFile;
    private persist;
    private load;
    private readDetail;
    /** Read the editable projection through the retained storage capability.
     * The caller supplies only the manifest-selected single component; no
     * absolute path is opened here. */
    readRunScript(runDirectory: string, maxBytes: number, signal?: AbortSignal): Promise<string>;
    /** Inventory scratch files relative to a descriptor-pinned run directory. */
    listRunArtifacts(runDirectory: string, maxItems: number, signal?: AbortSignal): Promise<WorkflowRunArtifactInventory>;
    /** Read a bounded UTF-8 artifact window while retaining the descriptor for
     * both identity checks. */
    readRunArtifact(runDirectory: string, name: string, offsetBytes: number, maxBytes: number, expected: WorkflowRunArtifactIdentity, signal?: AbortSignal): Promise<WorkflowRunArtifactRead>;
    readRunReport(runDirectory: string, maxBytes: number, signal?: AbortSignal): Promise<string | undefined>;
    private validateRunFiles;
    /** Read and decode every detail sidecar in one run during the read-only
     * recovery preflight.  In particular, unreferenced immutable snapshots are
     * decoded too: silently deleting a malformed transaction residue would turn
     * a corrupt store into a successful partial recovery. */
    private validateLocalRunInventory;
    private capabilityEntries;
    private validateCapabilityRunInventory;
    /** Complete, read-only recovery validation.  Nothing is cached or removed
     * until this method has checked every category, manifest, run, and detail
     * sidecar. */
    private validateRecoveryInventory;
    /** Remove only residue whose complete identity/shape was validated by the
     * preflight.  A referenced run is retained; only its superseded immutable
     * detail snapshots are removed. */
    private reconcileRecoveryResidue;
    private initializeUnlocked;
    initialize(signal?: AbortSignal): Promise<readonly RecoveredRun[]>;
    private ensureInitialized;
    private evictForSession;
    private enforceGlobalLimit;
    /**
     * Make the *next* insert fit before its run directory or manifest row is
     * published.  The old implementation enforced the root cap only after the
     * durable callback, which could report an admitted run and then reject the
     * insertion.  This preflight keeps the durable linearization point honest:
     * eligible terminal rows are evicted in the same deterministic order as
     * normal retention, and an impossible insert fails while it is still in
     * staging.
     */
    private preflightTransactionCapacity;
    insertWithNextDisplayName(request: WorkflowRunInsertRequest, create: (identity: WorkflowRunIdentity) => {
        readonly head: any;
        readonly detail: WorkflowRunDetailPayloadV2;
    }, signal?: AbortSignal): Promise<WorkflowRunHeadRecord>;
    commitRun(request: WorkflowRunCommitRequest, signal?: AbortSignal): Promise<WorkflowRunHeadRecord>;
    commitTerminalAndClaimNotice(request: WorkflowTerminalCommitRequest, signal?: AbortSignal): Promise<WorkflowRunHeadRecord>;
    finalizeCompletionNotice(sessionId: string, runId: string, expectedRevision: number, finalization: WorkflowCompletionNoticeFinalization, signal?: AbortSignal): Promise<WorkflowRunHeadRecord>;
    readSession(sessionId: string, signal?: AbortSignal): Promise<readonly WorkflowRunHeadRecord[]>;
    readDetails(runId: string, request: DetailReadRequest, signal?: AbortSignal): Promise<DetailReadResult>;
    dispose(): Promise<void>;
}
//# sourceMappingURL=manifest-store.d.ts.map