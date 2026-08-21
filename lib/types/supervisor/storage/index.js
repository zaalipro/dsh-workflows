import { openWorkflowStorageAnchor, acquireWorkflowStorageLease } from './lease.js';
import { closeWorkflowStorageLayout, initializePrivateLayout } from './private-root.js';
import { FileWorkflowRunStore } from './manifest-store.js';
import { recoverWorkflowStorage } from './recovery.js';
export * from './lease.js';
export * from './private-root.js';
export * from './bounded-file.js';
export * from './manifest-types.js';
export * from './manifest-codec.js';
export * from './details-codec.js';
export * from './manifest-store.js';
export * from './run-files.js';
export * from './recovery.js';
/** Bootstrap the leased storage root and eagerly recover retained state. */
export async function openWorkflowStorage(config, hostFileSystem) {
    const anchor = await openWorkflowStorageAnchor({ runsRoot: config.runsRoot });
    let lease;
    let layout;
    let store;
    try {
        lease = await acquireWorkflowStorageLease(anchor);
        layout = await initializePrivateLayout(anchor, lease, hostFileSystem);
        store = new FileWorkflowRunStore({
            // The anchor canonicalizes harmless OS alias components (notably
            // macOS /var and /tmp).  Every later store operation must use that same
            // pinned spelling rather than returning to the caller's lexical path.
            runsRoot: anchor.root,
            maxManifestBytes: config.maxManifestBytes,
            maxRunDetailsBytes: config.maxRunDetailsBytes,
            maxRunStoreBytes: config.maxRunStoreBytes,
            maxRetainedRunsPerSession: config.maxRetainedRunsPerSession,
            maxWorkflowNamesPerSession: config.maxWorkflowNamesPerSession,
            maxMembersPerRun: config.maxMembersPerRun,
            maxRecoveryEntries: config.maxRecoveryEntries,
            maxTerminalResultBytes: config.maxTerminalResultBytes,
            memberOutcomeMaxBytes: config.memberOutcomeMaxBytes,
            maxLogLines: config.maxLogLines,
            maxLogLineBytes: config.maxLogLineBytes,
        }, lease, layout);
        // Recovery receives the retained descriptor layout, not the lexical root
        // string.  In Host mode this is the security boundary: inventory and all
        // subsequent reconciliation stay relative to the capabilities opened
        // after the lifetime lease was acquired.  The recovered Interrupted
        // heads must remain available to the supervisor: a later store.initialize()
        // is idempotent and must not report an empty rewrite.
        const recovered = await recoverWorkflowStorage(layout, store, { maxRecoveryEntries: config.maxRecoveryEntries });
        let disposed = false;
        let disposePromise;
        return {
            anchor,
            lease,
            layout,
            store,
            recovered: recovered.runs,
            dispose() {
                disposePromise ??= (async () => {
                    if (disposed)
                        return;
                    disposed = true;
                    let first;
                    try {
                        await store.dispose();
                    }
                    catch (error) {
                        first = error;
                    }
                    try {
                        await closeWorkflowStorageLayout(layout);
                    }
                    catch (error) {
                        first ??= error;
                    }
                    try {
                        await lease.release();
                    }
                    catch (error) {
                        first ??= error;
                    }
                    if (first !== undefined)
                        throw first;
                })();
                return disposePromise;
            },
        };
    }
    catch (error) {
        // Bootstrap can fail after any of the four layout descriptors or the
        // store has been created.  Close each layer before releasing the lease;
        // never leave a partial layout holding descriptors into the next boot.
        await store?.dispose().catch(() => undefined);
        if (layout !== undefined)
            await closeWorkflowStorageLayout(layout).catch(() => undefined);
        if (lease !== undefined)
            await lease.release().catch(() => undefined);
        else
            await anchor.close().catch(() => undefined);
        throw error;
    }
}
//# sourceMappingURL=index.js.map