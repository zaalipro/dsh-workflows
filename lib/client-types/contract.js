export class WorkflowRunsRemoteError extends Error {
    code;
    details;
    name = 'WorkflowRunsRemoteError';
    constructor(code, message, details) {
        super(message);
        this.code = code;
        this.details = details;
    }
}
/** Unwrap both Typert's transport carrier and the package's business carrier. */
export function unwrapWorkflowRemoteResult(input) {
    let value = input;
    // A direct package Remote returns WorkflowRemoteResult<T>. Depending on the
    // mounted Typert face that value may itself be inside RemoteResult<...>.
    // Iterating, rather than assuming one layer, keeps both faces identical.
    for (let depth = 0; depth < 2; depth += 1) {
        if (typeof value !== 'object' || value === null || !Object.hasOwn(value, 'ok'))
            break;
        const carrier = value;
        if (carrier.ok === true) {
            value = carrier.value;
            continue;
        }
        if (carrier.ok === false) {
            const failure = typeof carrier.error === 'object' && carrier.error !== null
                ? carrier.error
                : carrier;
            throw new WorkflowRunsRemoteError(String(failure.code ?? 'storage-unavailable'), String(failure.message ?? 'Unable to load workflow data. Retry.'), typeof failure.details === 'object' && failure.details !== null
                ? failure.details
                : undefined);
        }
        break;
    }
    return value;
}
//# sourceMappingURL=contract.js.map