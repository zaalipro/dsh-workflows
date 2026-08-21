import { BoundedFileError } from './bounded-file.js';
import { isWorkflowDefinitionName } from '../../registry/names.js';
const COMPONENT = /^[a-f0-9]{32}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const STATUSES = new Set([
    'running', 'pausing', 'stopping', 'needs-input', 'paused', 'budget-limited',
    'completed', 'failed', 'cancelled', 'interrupted',
]);
const STOP_REASONS = new Set(['completed', 'cancelled', 'error', 'interrupted', 'budget-limited']);
const TERMINAL = new Set(['completed', 'failed', 'cancelled', 'interrupted']);
const ACTIVE = new Set(['running', 'pausing', 'stopping', 'needs-input', 'paused', 'budget-limited']);
const MEMBER_STATUSES = new Set(['running', 'completed', 'failed', 'cancelled']);
const ACTIONS = new Set(['pause', 'resume', 'stop', 'save']);
function corrupt(message) {
    throw new BoundedFileError(message, 'WORKFLOW_STORAGE_CORRUPT');
}
const NUMBERED_ORDINAL = /^(?:[2-9]|[1-9][0-9]+)$/u;
/** Parse a display handle back to its session-local launch ordinal.
 * The unnumbered first handle is `name` itself (ordinal 1), including kebab
 * names that already end in digits such as `gpt-4` or `review-2`. */
export function displayOrdinal(name, displayName) {
    if (displayName === name)
        return 1;
    const prefix = `${name}-`;
    if (!displayName.startsWith(prefix)) {
        throw new BoundedFileError(`workflow display name "${displayName}" does not belong to "${name}"`, 'WORKFLOW_STORAGE_CORRUPT');
    }
    const suffix = displayName.slice(prefix.length);
    if (!NUMBERED_ORDINAL.test(suffix)) {
        throw new BoundedFileError(`workflow display name "${displayName}" has an invalid ordinal`, 'WORKFLOW_STORAGE_CORRUPT');
    }
    const ordinal = Number(suffix);
    if (!Number.isSafeInteger(ordinal) || ordinal < 2) {
        throw new BoundedFileError(`workflow display name "${displayName}" has an unsafe ordinal`, 'WORKFLOW_STORAGE_CORRUPT');
    }
    return ordinal;
}
function limit(message) {
    throw new BoundedFileError(message, 'WORKFLOW_STORAGE_LIMIT');
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function own(value, key) {
    return Object.prototype.hasOwnProperty.call(value, key);
}
function exactKeys(value, allowed, required, path) {
    const allowedSet = new Set(allowed);
    for (const key of Object.keys(value))
        if (!allowedSet.has(key))
            corrupt(`${path}.${key} is not allowed`);
    for (const key of required)
        if (!own(value, key))
            corrupt(`${path}.${key} is required`);
}
function text(value, path, options = {}) {
    if (typeof value !== 'string' || (options.nonEmpty && value.length === 0))
        corrupt(`${path} must be ${options.nonEmpty ? 'a non-empty ' : 'a '}string`);
    if (options.max !== undefined && new TextEncoder().encode(value).byteLength > options.max)
        corrupt(`${path} exceeds ${options.max} UTF-8 bytes`);
    return value;
}
function safeNonNegative(value, path) {
    if (!Number.isSafeInteger(value) || Number(value) < 0)
        corrupt(`${path} must be a non-negative safe integer`);
    return value;
}
function safePositive(value, path) {
    if (!Number.isSafeInteger(value) || Number(value) <= 0)
        corrupt(`${path} must be a positive safe integer`);
    return value;
}
function assertComponent(value, label) {
    if (typeof value !== 'string' || !COMPONENT.test(value))
        corrupt(`${label} is not a lowercase 32-hex component`);
}
function assertNotice(value, terminal, path) {
    if (!isRecord(value))
        corrupt(`${path} must be an object`);
    const state = value.state;
    if (typeof state !== 'string')
        corrupt(`${path}.state must be a string`);
    if (state === 'none') {
        exactKeys(value, ['state'], ['state'], path);
        if (terminal)
            corrupt('terminal row has completionNotice state none');
        return;
    }
    if (state === 'claimed') {
        exactKeys(value, ['state', 'claimId', 'processEpoch', 'claimedAt'], ['state', 'claimId', 'processEpoch', 'claimedAt'], path);
        assertComponent(value.claimId, `${path}.claimId`);
        assertComponent(value.processEpoch, `${path}.processEpoch`);
        safeNonNegative(value.claimedAt, `${path}.claimedAt`);
        if (!terminal)
            corrupt('non-terminal row cannot claim a completion notice');
        return;
    }
    if (state === 'delivered') {
        exactKeys(value, ['state', 'claimId', 'processEpoch', 'claimedAt', 'finalizedAt', 'lane'], ['state', 'claimId', 'processEpoch', 'claimedAt', 'finalizedAt', 'lane'], path);
        assertComponent(value.claimId, `${path}.claimId`);
        assertComponent(value.processEpoch, `${path}.processEpoch`);
        const claimedAt = safeNonNegative(value.claimedAt, `${path}.claimedAt`);
        const finalizedAt = safeNonNegative(value.finalizedAt, `${path}.finalizedAt`);
        if (finalizedAt < claimedAt)
            corrupt(`${path}.finalizedAt precedes claimedAt`);
        if (value.lane !== 'followup' && value.lane !== 'inject')
            corrupt(`${path}.lane is invalid`);
        if (!terminal)
            corrupt('non-terminal row cannot finalize a completion notice');
        return;
    }
    if (state === 'abandoned') {
        exactKeys(value, ['state', 'finalizedAt', 'reason', 'claimId', 'processEpoch', 'claimedAt', 'error'], ['state', 'finalizedAt', 'reason'], path);
        const finalizedAt = safeNonNegative(value.finalizedAt, `${path}.finalizedAt`);
        if (!['process-lost', 'owner-disposed', 'enqueue-failed', 'teardown'].includes(String(value.reason)))
            corrupt(`${path}.reason is invalid`);
        const tuple = ['claimId', 'processEpoch', 'claimedAt'].map(key => own(value, key));
        if (tuple.some(Boolean) && !tuple.every(Boolean))
            corrupt(`${path} claim tuple is incomplete`);
        if (tuple.every(Boolean)) {
            assertComponent(value.claimId, `${path}.claimId`);
            assertComponent(value.processEpoch, `${path}.processEpoch`);
            const claimedAt = safeNonNegative(value.claimedAt, `${path}.claimedAt`);
            if (finalizedAt < claimedAt)
                corrupt(`${path}.finalizedAt precedes claimedAt`);
        }
        if (own(value, 'error'))
            text(value.error, `${path}.error`);
        if (!terminal)
            corrupt('non-terminal row cannot abandon a completion notice');
        return;
    }
    corrupt(`${path}.state is invalid`);
}
function assertHead(value, path = 'heads[]') {
    if (!isRecord(value))
        corrupt(`${path} must be an object`);
    exactKeys(value, ['runId', 'name', 'displayName', 'numberedHandle', 'description', 'status', 'stopReason', 'error', 'phase', 'terminalPreview', 'budget', 'memberCounts', 'startedAt', 'settledAt', 'runDirectory', 'revision', 'detail', 'detailRevision', 'membersRevision', 'logsRevision', 'resultRevision', 'artifactsRevision', 'completionNotice', 'executionAvailable', 'scriptPath', 'saveAvailable', 'allowedActions'], ['runId', 'name', 'displayName', 'numberedHandle', 'status', 'budget', 'memberCounts', 'startedAt', 'runDirectory', 'revision', 'detail', 'detailRevision', 'membersRevision', 'logsRevision', 'resultRevision', 'artifactsRevision', 'completionNotice'], path);
    text(value.runId, `${path}.runId`, { nonEmpty: true, max: 512 });
    if (typeof value.name !== 'string' || !isWorkflowDefinitionName(value.name))
        corrupt(`${path}.name is not a valid workflow definition name`);
    text(value.displayName, `${path}.displayName`, { nonEmpty: true, max: 512 });
    if (typeof value.numberedHandle !== 'boolean')
        corrupt(`${path}.numberedHandle must be boolean`);
    if (own(value, 'description'))
        text(value.description, `${path}.description`, { max: 65_536 });
    if (!STATUSES.has(value.status))
        corrupt(`${path}.status is invalid`);
    if (own(value, 'stopReason')) {
        if (!STOP_REASONS.has(String(value.stopReason)))
            corrupt(`${path}.stopReason is invalid`);
    }
    if (own(value, 'error'))
        text(value.error, `${path}.error`, { max: 65_536 });
    if (own(value, 'phase'))
        text(value.phase, `${path}.phase`, { max: 65_536 });
    if (own(value, 'terminalPreview'))
        text(value.terminalPreview, `${path}.terminalPreview`, { max: 131_072 });
    if (!isRecord(value.budget))
        corrupt(`${path}.budget must be an object`);
    exactKeys(value.budget, ['total', 'spent', 'remaining'], ['total', 'spent', 'remaining'], `${path}.budget`);
    const total = safePositive(value.budget.total, `${path}.budget.total`);
    const spent = safeNonNegative(value.budget.spent, `${path}.budget.spent`);
    const remaining = safeNonNegative(value.budget.remaining, `${path}.budget.remaining`);
    if (spent > total || remaining !== total - spent)
        corrupt(`${path}.budget is inconsistent`);
    if (!isRecord(value.memberCounts))
        corrupt(`${path}.memberCounts must be an object`);
    const memberCounts = value.memberCounts;
    exactKeys(memberCounts, ['total', 'running', 'completed', 'failed', 'cancelled'], ['total', 'running', 'completed', 'failed', 'cancelled'], `${path}.memberCounts`);
    const counts = ['total', 'running', 'completed', 'failed', 'cancelled'].map(key => safeNonNegative(memberCounts[key], `${path}.memberCounts.${key}`));
    if (counts[1] + counts[2] + counts[3] + counts[4] !== counts[0])
        corrupt(`${path}.memberCounts are inconsistent`);
    const startedAt = safeNonNegative(value.startedAt, `${path}.startedAt`);
    if (own(value, 'settledAt')) {
        const settledAt = safeNonNegative(value.settledAt, `${path}.settledAt`);
        if (settledAt < startedAt)
            corrupt(`${path}.settledAt precedes startedAt`);
    }
    assertComponent(value.runDirectory, `${path}.runDirectory`);
    safeNonNegative(value.revision, `${path}.revision`);
    if (!isRecord(value.detail))
        corrupt(`${path}.detail must be an object`);
    exactKeys(value.detail, ['id', 'bytes', 'sha256', 'snapshotRevision'], ['id', 'bytes', 'sha256', 'snapshotRevision'], `${path}.detail`);
    assertComponent(value.detail.id, `${path}.detail.id`);
    safeNonNegative(value.detail.bytes, `${path}.detail.bytes`);
    if (typeof value.detail.sha256 !== 'string' || !SHA256.test(value.detail.sha256))
        corrupt(`${path}.detail.sha256 is invalid`);
    safeNonNegative(value.detail.snapshotRevision, `${path}.detail.snapshotRevision`);
    if (value.detail.snapshotRevision !== value.detailRevision)
        corrupt(`${path}.detail.snapshotRevision must equal detailRevision`);
    for (const key of ['detailRevision', 'membersRevision', 'logsRevision', 'resultRevision', 'artifactsRevision'])
        safeNonNegative(value[key], `${path}.${key}`);
    if (own(value, 'executionAvailable') && typeof value.executionAvailable !== 'boolean')
        corrupt(`${path}.executionAvailable must be boolean`);
    if (own(value, 'scriptPath')) {
        const pathValue = text(value.scriptPath, `${path}.scriptPath`, { nonEmpty: true, max: 512 });
        if (pathValue.includes('/') || pathValue.includes('\\') || pathValue.startsWith('.') || pathValue.startsWith('/'))
            corrupt(`${path}.scriptPath must be a relative single component`);
    }
    if (own(value, 'saveAvailable') && typeof value.saveAvailable !== 'boolean')
        corrupt(`${path}.saveAvailable must be boolean`);
    if (own(value, 'allowedActions')) {
        if (!Array.isArray(value.allowedActions) || value.allowedActions.some(action => typeof action !== 'string' || !ACTIONS.has(action)))
            corrupt(`${path}.allowedActions is invalid`);
        if (new Set(value.allowedActions).size !== value.allowedActions.length)
            corrupt(`${path}.allowedActions contains duplicates`);
    }
    const terminal = TERMINAL.has(value.status);
    const active = ACTIVE.has(value.status);
    if (active && (own(value, 'settledAt') || own(value, 'stopReason')))
        corrupt(`${path} active row has terminal fields`);
    if (terminal) {
        if (!own(value, 'settledAt'))
            corrupt(`${path} terminal row requires settledAt`);
        if (!own(value, 'stopReason'))
            corrupt(`${path} terminal row requires stopReason`);
        const expected = value.status === 'completed' ? 'completed' : value.status === 'cancelled' ? 'cancelled' : value.status === 'interrupted' ? 'interrupted' : 'error';
        if (value.stopReason !== expected)
            corrupt(`${path}.stopReason is incompatible with status`);
    }
    if (own(value, 'terminalPreview') && !terminal)
        corrupt(`${path}.terminalPreview is only valid on terminal rows`);
    assertNotice(value.completionNotice, terminal, `${path}.completionNotice`);
}
function validateRoot(value) {
    if (!isRecord(value))
        corrupt('manifest must be an object');
    exactKeys(value, ['version', 'sessionId', 'revision', 'nextOrdinal', 'ordinals', 'heads'], ['version', 'sessionId', 'revision', 'nextOrdinal', 'ordinals', 'heads'], 'manifest');
    if (value.version !== 2)
        corrupt('manifest.version must be 2');
    text(value.sessionId, 'manifest.sessionId', { nonEmpty: true, max: 512 });
    safeNonNegative(value.revision, 'manifest.revision');
    const nextOrdinal = safePositive(value.nextOrdinal, 'manifest.nextOrdinal');
    if (!Array.isArray(value.ordinals))
        corrupt('manifest.ordinals must be an array');
    if (!Array.isArray(value.heads))
        corrupt('manifest.heads must be an array');
    const ordinalNames = new Set();
    for (let index = 0; index < value.ordinals.length; index += 1) {
        const path = `manifest.ordinals[${index}]`;
        const ordinal = value.ordinals[index];
        if (!isRecord(ordinal))
            corrupt(`${path} must be an object`);
        exactKeys(ordinal, ['name', 'next'], ['name', 'next'], path);
        if (typeof ordinal.name !== 'string' || !isWorkflowDefinitionName(ordinal.name))
            corrupt(`${path}.name is invalid`);
        if (ordinalNames.has(ordinal.name))
            corrupt(`${path}.name is duplicated`);
        ordinalNames.add(ordinal.name);
        safePositive(ordinal.next, `${path}.next`);
    }
    const runIds = new Set();
    const displayNames = new Set();
    const directories = new Set();
    const details = new Set();
    for (let index = 0; index < value.heads.length; index += 1) {
        const path = `manifest.heads[${index}]`;
        assertHead(value.heads[index], path);
        const current = value.heads[index];
        if (runIds.has(current.runId))
            corrupt(`${path}.runId is duplicated`);
        if (displayNames.has(current.displayName))
            corrupt(`${path}.displayName is duplicated`);
        if (directories.has(current.runDirectory))
            corrupt(`${path}.runDirectory is duplicated`);
        if (details.has(current.detail.id))
            corrupt(`${path}.detail.id is duplicated`);
        runIds.add(current.runId);
        displayNames.add(current.displayName);
        directories.add(current.runDirectory);
        details.add(current.detail.id);
        if (!ordinalNames.has(current.name))
            corrupt(`${path}.name has no ordinal high-water mark`);
        let ordinal;
        try {
            ordinal = displayOrdinal(current.name, current.displayName);
        }
        catch (error) {
            if (error instanceof BoundedFileError && error.code === 'WORKFLOW_STORAGE_CORRUPT') {
                if (current.numberedHandle)
                    corrupt(`${path}.displayName is not a numbered handle`);
                corrupt(`${path}.displayName must equal name for the first handle`);
            }
            throw error;
        }
        if (current.numberedHandle) {
            if (ordinal < 2)
                corrupt(`${path}.displayName is not a numbered handle`);
        }
        else if (ordinal !== 1 || current.displayName !== current.name) {
            corrupt(`${path}.displayName must equal name for the first handle`);
        }
        const highWater = value.ordinals.find(item => item.name === current.name)?.next ?? 0;
        if (ordinal >= highWater)
            corrupt(`${path}.displayName exceeds ordinal high-water mark`);
    }
    if (nextOrdinal <= value.heads.length && value.heads.length > 0)
        corrupt('manifest.nextOrdinal is not monotonic');
}
/** Decode a bounded canonical version-2 Session manifest. */
export function decodeWorkflowSessionManifest(input, file, maxBytes) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0)
        limit('manifest maxBytes must be a positive safe integer');
    const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
    if (bytes.byteLength > maxBytes)
        limit(`${file} exceeds the ${maxBytes}-byte manifest limit`);
    let value;
    try {
        value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    }
    catch (error) {
        throw new BoundedFileError(`${file} is malformed UTF-8 or JSON`, 'WORKFLOW_STORAGE_CORRUPT', { cause: error });
    }
    validateRoot(value);
    return value;
}
function sortObject(value) {
    if (Array.isArray(value))
        return value.map(sortObject);
    if (!isRecord(value))
        return value;
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, sortObject(value[key])]));
}
/** Encode a canonical version-2 Session manifest. */
export function encodeWorkflowSessionManifest(value, maxBytes) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0)
        limit('manifest maxBytes must be a positive safe integer');
    validateRoot(value);
    const bytes = new TextEncoder().encode(`${JSON.stringify(sortObject(value), null, 2)}\n`);
    if (bytes.byteLength > maxBytes)
        limit(`manifest exceeds the ${maxBytes}-byte limit`);
    return bytes;
}
//# sourceMappingURL=manifest-codec.js.map