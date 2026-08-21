import { BoundedFileError } from './bounded-file.js';
import { snapshotWorkflowJsonValue } from '../value-view.js';
const COMPONENT = /^[a-f0-9]{32}$/u;
const SAFE_ARTIFACT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;
const OUTCOMES = new Set(['pending', 'available', 'not-produced', 'evicted']);
const MEMBER_STATUSES = new Set(['running', 'completed', 'failed', 'cancelled']);
const encoder = new TextEncoder();
function corrupt(message) {
    throw new BoundedFileError(message, 'WORKFLOW_STORAGE_CORRUPT');
}
function overLimit(message) {
    throw new BoundedFileError(message, 'WORKFLOW_STORAGE_LIMIT');
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function own(value, key) {
    return Object.prototype.hasOwnProperty.call(value, key);
}
function exactKeys(value, allowed, required, path) {
    const accepted = new Set(allowed);
    for (const key of Object.keys(value))
        if (!accepted.has(key))
            corrupt(`${path}.${key} is not allowed`);
    for (const key of required)
        if (!own(value, key))
            corrupt(`${path}.${key} is required`);
}
function safeNonNegative(value, path) {
    if (!Number.isSafeInteger(value) || Number(value) < 0)
        corrupt(`${path} must be a non-negative safe integer`);
    return value;
}
function nonEmptyText(value, path) {
    if (typeof value !== 'string' || value.length === 0)
        corrupt(`${path} must be a non-empty string`);
    return value;
}
function assertLimits(limits) {
    for (const [name, value] of Object.entries(limits)) {
        if (!Number.isSafeInteger(value) || value <= 0)
            overLimit(`${name} must be a positive safe integer`);
    }
    if (limits.memberOutcomeMaxBytes > limits.maxRunDetailsBytes
        || limits.maxTerminalResultBytes > limits.maxRunDetailsBytes
        || limits.maxLogLineBytes > limits.maxRunDetailsBytes) {
        overLimit('workflow detail field limits must not exceed maxRunDetailsBytes');
    }
}
function sortObject(value) {
    if (Array.isArray(value))
        return value.map(sortObject);
    if (!isRecord(value))
        return value;
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, sortObject(value[key])]));
}
function canonicalBytes(value) {
    return encoder.encode(`${JSON.stringify(sortObject(value), null, 2)}\n`);
}
function compactBytes(value) {
    return encoder.encode(JSON.stringify(value)).byteLength;
}
function prettyValueText(value) {
    return JSON.stringify(value, null, 2);
}
function prettyValueBytes(value) {
    return encoder.encode(prettyValueText(value)).byteLength;
}
function utf8Prefix(text, maxBytes) {
    let result = '';
    let retained = 0;
    for (const point of text) {
        const bytes = encoder.encode(point).byteLength;
        if (retained + bytes > maxBytes)
            break;
        result += point;
        retained += bytes;
    }
    return result;
}
function jsonSnapshot(value, path) {
    try {
        return snapshotWorkflowJsonValue(value);
    }
    catch (error) {
        corrupt(`${path} is not lossless JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
}
function validateMember(value, index, limits, enforceQuotas) {
    const path = `detail.payload.members[${index}]`;
    if (!isRecord(value))
        corrupt(`${path} must be an object`);
    exactKeys(value, ['memberId', 'seq', 'label', 'phase', 'status', 'outcome', 'value', 'childSessionId', 'startedAt', 'settledAt'], ['memberId', 'seq', 'label', 'status', 'outcome'], path);
    nonEmptyText(value.memberId, `${path}.memberId`);
    safeNonNegative(value.seq, `${path}.seq`);
    nonEmptyText(value.label, `${path}.label`);
    if (own(value, 'phase') && typeof value.phase !== 'string')
        corrupt(`${path}.phase must be a string`);
    if (!MEMBER_STATUSES.has(String(value.status)))
        corrupt(`${path}.status is invalid`);
    if (!OUTCOMES.has(String(value.outcome)))
        corrupt(`${path}.outcome is invalid`);
    if (own(value, 'childSessionId'))
        nonEmptyText(value.childSessionId, `${path}.childSessionId`);
    const startedAt = own(value, 'startedAt') ? safeNonNegative(value.startedAt, `${path}.startedAt`) : undefined;
    const settledAt = own(value, 'settledAt') ? safeNonNegative(value.settledAt, `${path}.settledAt`) : undefined;
    if (startedAt !== undefined && settledAt !== undefined && settledAt < startedAt)
        corrupt(`${path}.settledAt precedes startedAt`);
    if (value.status === 'running' && settledAt !== undefined)
        corrupt(`${path} is running but settled`);
    if (value.outcome === 'available') {
        if (!own(value, 'value'))
            corrupt(`${path}.value is required for an available outcome`);
        const snapshot = jsonSnapshot(value.value, `${path}.value`);
        if (enforceQuotas && prettyValueBytes(snapshot) > limits.memberOutcomeMaxBytes)
            overLimit(`${path}.value exceeds the member outcome limit`);
    }
    else if (own(value, 'value')) {
        corrupt(`${path}.value is forbidden for outcome ${String(value.outcome)}`);
    }
    return value;
}
function validateResult(value, limits, enforceQuotas) {
    const path = 'detail.payload.result';
    if (!isRecord(value))
        corrupt(`${path} must be an object`);
    exactKeys(value, ['state', 'value', 'preview', 'totalBytes', 'truncated'], ['state'], path);
    if (!OUTCOMES.has(String(value.state)))
        corrupt(`${path}.state is invalid`);
    if (value.state !== 'available') {
        if (Object.keys(value).some(key => key !== 'state'))
            corrupt(`${path} non-available state carries a projection`);
        return;
    }
    const hasValue = own(value, 'value');
    const hasPreview = own(value, 'preview');
    if (hasValue === hasPreview)
        corrupt(`${path} must contain exactly one of value or preview`);
    if (hasValue) {
        const snapshot = jsonSnapshot(value.value, `${path}.value`);
        const totalBytes = prettyValueBytes(snapshot);
        if (enforceQuotas && totalBytes > limits.maxTerminalResultBytes)
            overLimit(`${path}.value exceeds the terminal result limit`);
        if (own(value, 'truncated') && value.truncated !== false)
            corrupt(`${path}.truncated must be false with value`);
        if (own(value, 'totalBytes') && safeNonNegative(value.totalBytes, `${path}.totalBytes`) !== totalBytes)
            corrupt(`${path}.totalBytes does not match value`);
    }
    else {
        if (typeof value.preview !== 'string')
            corrupt(`${path}.preview must be a string`);
        if (value.truncated !== true)
            corrupt(`${path}.truncated must be true with preview`);
        const totalBytes = safeNonNegative(value.totalBytes, `${path}.totalBytes`);
        const previewBytes = encoder.encode(value.preview).byteLength;
        if (previewBytes > totalBytes)
            corrupt(`${path}.preview exceeds totalBytes`);
        if (enforceQuotas && previewBytes > limits.maxTerminalResultBytes)
            overLimit(`${path}.preview exceeds the terminal result limit`);
    }
}
function validatePayload(value, limits, enforceQuotas) {
    if (!isRecord(value))
        corrupt('detail.payload must be an object');
    exactKeys(value, ['members', 'logs', 'result', 'phases', 'artifacts'], [], 'detail.payload');
    if (own(value, 'members')) {
        if (!Array.isArray(value.members))
            corrupt('detail.payload.members must be an array');
        const ids = new Set();
        const sequences = new Set();
        for (let index = 0; index < value.members.length; index += 1) {
            const member = validateMember(value.members[index], index, limits, enforceQuotas);
            const id = member.memberId;
            const seq = member.seq;
            if (ids.has(id))
                corrupt(`detail.payload.members[${index}].memberId is duplicated`);
            if (sequences.has(seq))
                corrupt(`detail.payload.members[${index}].seq is duplicated`);
            ids.add(id);
            sequences.add(seq);
        }
    }
    if (own(value, 'logs')) {
        if (!Array.isArray(value.logs))
            corrupt('detail.payload.logs must be an array');
        let previous;
        for (let index = 0; index < value.logs.length; index += 1) {
            const path = `detail.payload.logs[${index}]`;
            const log = value.logs[index];
            if (!isRecord(log))
                corrupt(`${path} must be an object`);
            exactKeys(log, ['index', 'text'], ['index', 'text'], path);
            const current = safeNonNegative(log.index, `${path}.index`);
            if (previous !== undefined && current !== previous + 1)
                corrupt(`${path}.index is not contiguous`);
            previous = current;
            if (typeof log.text !== 'string')
                corrupt(`${path}.text must be a string`);
            if (enforceQuotas && encoder.encode(log.text).byteLength > limits.maxLogLineBytes)
                overLimit(`${path}.text exceeds the log line limit`);
        }
    }
    if (own(value, 'result'))
        validateResult(value.result, limits, enforceQuotas);
    if (own(value, 'phases')) {
        if (!Array.isArray(value.phases))
            corrupt('detail.payload.phases must be an array');
        for (let index = 0; index < value.phases.length; index += 1) {
            const path = `detail.payload.phases[${index}]`;
            const phase = value.phases[index];
            if (!isRecord(phase))
                corrupt(`${path} must be an object`);
            exactKeys(phase, ['title', 'startedAt', 'endedAt'], ['title'], path);
            nonEmptyText(phase.title, `${path}.title`);
            const startedAt = own(phase, 'startedAt') ? safeNonNegative(phase.startedAt, `${path}.startedAt`) : undefined;
            const endedAt = own(phase, 'endedAt') ? safeNonNegative(phase.endedAt, `${path}.endedAt`) : undefined;
            if (startedAt !== undefined && endedAt !== undefined && endedAt < startedAt)
                corrupt(`${path}.endedAt precedes startedAt`);
        }
    }
    if (own(value, 'artifacts')) {
        if (!Array.isArray(value.artifacts))
            corrupt('detail.payload.artifacts must be an array');
        const names = new Set();
        for (let index = 0; index < value.artifacts.length; index += 1) {
            const path = `detail.payload.artifacts[${index}]`;
            const artifact = value.artifacts[index];
            if (!isRecord(artifact))
                corrupt(`${path} must be an object`);
            exactKeys(artifact, ['name', 'bytes'], ['name', 'bytes'], path);
            const name = nonEmptyText(artifact.name, `${path}.name`);
            if (!SAFE_ARTIFACT.test(name) || name === '.' || name === '..')
                corrupt(`${path}.name is unsafe`);
            if (names.has(name))
                corrupt(`${path}.name is duplicated`);
            names.add(name);
            safeNonNegative(artifact.bytes, `${path}.bytes`);
        }
    }
}
function validateSnapshot(value, limits, enforceQuotas) {
    if (!isRecord(value))
        corrupt('detail snapshot must be an object');
    exactKeys(value, ['version', 'sessionId', 'runId', 'runDirectory', 'detailId', 'snapshotRevision', 'payload'], ['version', 'sessionId', 'runId', 'runDirectory', 'detailId', 'snapshotRevision', 'payload'], 'detail');
    if (value.version !== 2)
        corrupt('detail.version must be 2');
    nonEmptyText(value.sessionId, 'detail.sessionId');
    nonEmptyText(value.runId, 'detail.runId');
    if (typeof value.runDirectory !== 'string' || !COMPONENT.test(value.runDirectory))
        corrupt('detail.runDirectory is unsafe');
    if (typeof value.detailId !== 'string' || !COMPONENT.test(value.detailId))
        corrupt('detail.detailId is unsafe');
    safeNonNegative(value.snapshotRevision, 'detail.snapshotRevision');
    validatePayload(value.payload, limits, enforceQuotas);
}
function normalizePayload(value, limits) {
    validatePayload(value, limits, false);
    const output = {};
    if (value.members !== undefined) {
        output.members = [...value.members].sort((left, right) => left.seq - right.seq).map(member => {
            const detached = { ...member };
            if (member.outcome === 'available' && own(member, 'value')) {
                const snapshot = jsonSnapshot(member.value, `member ${member.memberId} value`);
                if (prettyValueBytes(snapshot) > limits.memberOutcomeMaxBytes) {
                    delete detached.value;
                    detached.outcome = 'evicted';
                }
                else
                    detached.value = snapshot;
            }
            return detached;
        });
    }
    if (value.logs !== undefined) {
        output.logs = [...value.logs].sort((left, right) => left.index - right.index)
            .map(log => ({ ...log, text: utf8Prefix(log.text, limits.maxLogLineBytes) }));
    }
    if (value.result !== undefined) {
        if (value.result.state === 'available' && own(value.result, 'value')) {
            const snapshot = jsonSnapshot(value.result.value, 'terminal result');
            const text = prettyValueText(snapshot);
            const totalBytes = encoder.encode(text).byteLength;
            output.result = totalBytes <= limits.maxTerminalResultBytes
                ? { state: 'available', value: snapshot, totalBytes, truncated: false }
                : { state: 'available', preview: utf8Prefix(text, limits.maxTerminalResultBytes), totalBytes, truncated: true };
        }
        else
            output.result = { ...value.result };
    }
    if (value.phases !== undefined)
        output.phases = value.phases.map(phase => ({ ...phase }));
    if (value.artifacts !== undefined) {
        output.artifacts = [...value.artifacts].sort((left, right) => left.name.localeCompare(right.name)).map(artifact => ({ ...artifact }));
    }
    return output;
}
function fitPayload(initial, fits) {
    let output = initial;
    let logs = output.logs === undefined ? undefined : [...output.logs];
    let members = output.members === undefined ? undefined : [...output.members];
    // Preserve the newest bounded log when member bodies can make the snapshot
    // fit.  Older log bodies are always evicted before any member body; the
    // final log is removed only when no outcome eviction is sufficient.
    while (!fits(output) && logs !== undefined && logs.length > 1) {
        logs = logs.slice(1);
        output = { ...output, logs };
    }
    while (!fits(output) && members !== undefined) {
        const index = members.findIndex(member => member.outcome === 'available' && own(member, 'value'));
        if (index < 0)
            break;
        const member = { ...members[index], outcome: 'evicted' };
        delete member.value;
        members[index] = member;
        output = { ...output, members };
    }
    while (!fits(output) && logs !== undefined && logs.length > 0) {
        logs = logs.slice(1);
        output = { ...output, logs };
    }
    if (!fits(output))
        overLimit('fixed workflow detail metadata exceeds the run limit');
    return output;
}
/** Deterministically compact a detail payload to its fixed quotas. */
export function compactWorkflowRunDetails(value, limits) {
    assertLimits(limits);
    return fitPayload(normalizePayload(value, limits), payload => compactBytes(payload) <= limits.maxRunDetailsBytes);
}
/** Encode one immutable version-2 detail sidecar. */
export function encodeWorkflowRunDetails(value, limits) {
    assertLimits(limits);
    validateSnapshot(value, limits, false);
    const normalized = normalizePayload(value.payload, limits);
    const payload = fitPayload(normalized, candidate => canonicalBytes({ ...value, payload: candidate }).byteLength <= limits.maxRunDetailsBytes);
    const compact = { ...value, payload };
    validateSnapshot(compact, limits, true);
    const bytes = canonicalBytes(compact);
    if (bytes.byteLength > limits.maxRunDetailsBytes)
        overLimit('workflow detail snapshot exceeds the run limit');
    return bytes;
}
/** Decode one immutable version-2 detail sidecar. */
export function decodeWorkflowRunDetails(input, file, limits) {
    assertLimits(limits);
    const bytes = typeof input === 'string' ? encoder.encode(input) : input;
    if (bytes.byteLength > limits.maxRunDetailsBytes)
        overLimit(`${file} exceeds the ${limits.maxRunDetailsBytes}-byte run detail limit`);
    let value;
    try {
        value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    }
    catch (error) {
        throw new BoundedFileError(`${file} is malformed UTF-8 or JSON`, 'WORKFLOW_STORAGE_CORRUPT', { cause: error });
    }
    validateSnapshot(value, limits, true);
    return value;
}
//# sourceMappingURL=details-codec.js.map