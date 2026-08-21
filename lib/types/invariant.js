import { HarnessError } from '@deepseek-ai/dsh-llm';
/** Package-owned error retaining Harness's machine-routable error identity. */
export class WorkflowPackageError extends HarnessError {
    constructor(message, code, options) {
        super(message, code, options);
        this.name = 'WorkflowPackageError';
    }
}
const TERMINAL_HEAD_STATUSES = new Set(['completed', 'failed', 'cancelled', 'interrupted']);
/** Return diagnostics for the package's registry/storage lifecycle invariants. */
export function checkWorkflowRegistryStorageInvariant(state) {
    const value = state;
    const errors = [];
    if (value?.registry?.enabled === false && (value.registry.watchers ?? 0) > 0) {
        errors.push('disabled registry has active watchers');
    }
    if (value?.storage?.recovered === false && value.storage.exposed === true) {
        errors.push('storage is exposed before recovery');
    }
    for (const issue of value?.issues ?? [])
        errors.push(String(issue));
    if (value?.disposed === true && value.storage?.leaseOwned === true) {
        errors.push('disposed storage still owns a lease/descriptor/operation');
    }
    let missingIdentity = false;
    let digestMismatch = false;
    let terminalNone = false;
    for (const head of value?.heads ?? []) {
        if (head.runDirectoryExists === false || head.detailFileExists === false)
            missingIdentity = true;
        if (typeof head.detailSha256 === 'string'
            && typeof head.fileSha256 === 'string'
            && head.detailSha256 !== head.fileSha256)
            digestMismatch = true;
        if (typeof head.detailRevision === 'number'
            && typeof head.fileRevision === 'number'
            && head.detailRevision !== head.fileRevision)
            digestMismatch = true;
        if (TERMINAL_HEAD_STATUSES.has(String(head.status)) && head.completionNotice?.state === 'none') {
            terminalNone = true;
        }
    }
    if (missingIdentity) {
        errors.push('a manifest references a missing/identity-mismatched run directory or immutable detail file');
    }
    if (digestMismatch)
        errors.push('a detail snapshot/revision/digest disagrees with its head');
    if (terminalNone)
        errors.push("a terminal row has completionNotice.state === 'none'");
    return errors;
}
/**
 * Runtime-invariant companion hook.
 *
 * The package keeps this entrypoint side-effect free when the optional official
 * invariant registry is not part of a profile. Lifecycle ownership checks are
 * enforced by the concrete components and their tests.
 */
export function applyInvariant(ctx) {
    const invariants = ctx.invariants;
    if (typeof invariants?.register !== 'function')
        return;
    invariants.register('@zaalipro/dsh-workflows', () => undefined);
}
//# sourceMappingURL=invariant.js.map