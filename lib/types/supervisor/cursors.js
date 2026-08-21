import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
/** Compatibility error used by the early package Remote adapter. */
export class WorkflowCursorError extends Error {
    code;
    constructor(message, code) {
        super(message);
        this.name = 'WorkflowCursorError';
        this.code = code;
    }
}
const PROCESS_SECRET = randomBytes(32);
const MAX_CURSOR_CHARS = 4096;
const BASE64URL = /^[A-Za-z0-9_-]+$/u;
const KINDS = new Set(['definitions', 'runs', 'members', 'logs', 'artifacts', 'artifact']);
const encoder = new TextEncoder();
function secretBytes(value) {
    if (!(value instanceof Uint8Array) || value.byteLength !== 32) {
        throw new TypeError('workflow cursor secret must be exactly 32 bytes');
    }
    return value;
}
function canonicalJson(value) {
    // Deliberately spell the key order. JSON object insertion order is stable,
    // but making it explicit prevents an innocuous refactor from invalidating
    // every cursor in a running Client.
    return JSON.stringify({
        version: value.version,
        kind: value.kind,
        sessionId: value.sessionId,
        entityId: value.entityId,
        processEpoch: value.processEpoch,
        revision: value.revision,
        offset: value.offset,
    });
}
function b64(value) {
    return Buffer.from(value).toString('base64url');
}
function decodeB64(value) {
    if (!BASE64URL.test(value))
        return undefined;
    try {
        const bytes = Buffer.from(value, 'base64url');
        // Node accepts non-canonical spellings. Round-tripping closes that gap.
        if (bytes.length === 0 || b64(bytes) !== value)
            return undefined;
        return new Uint8Array(bytes);
    }
    catch {
        return undefined;
    }
}
function validText(value) {
    return typeof value === 'string' && value.length > 0 && encoder.encode(value).byteLength <= 1024;
}
function validPayload(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        return false;
    const object = value;
    const keys = Object.keys(object);
    if (keys.length !== 7 || !keys.every(key => ['version', 'kind', 'sessionId', 'entityId', 'processEpoch', 'revision', 'offset'].includes(key)))
        return false;
    return object.version === 1
        && typeof object.kind === 'string' && KINDS.has(object.kind)
        && validText(object.sessionId)
        && typeof object.entityId === 'string' && encoder.encode(object.entityId).byteLength <= 1024
        && validText(object.processEpoch)
        && Number.isSafeInteger(object.revision) && Number(object.revision) >= 0
        && Number.isSafeInteger(object.offset) && Number(object.offset) >= 0;
}
function validExpectation(expected) {
    return (expected.version === undefined || expected.version === 1)
        && KINDS.has(expected.kind)
        && validText(expected.sessionId)
        && typeof expected.entityId === 'string'
        && validText(expected.processEpoch)
        && Number.isSafeInteger(expected.revision) && expected.revision >= 0
        && Number.isSafeInteger(expected.total) && expected.total >= 0;
}
function encodeWithSecret(secret, payload) {
    secretBytes(secret);
    if (!validPayload(payload))
        throw new TypeError('workflow cursor payload is invalid');
    const body = b64(encoder.encode(canonicalJson(payload)));
    const mac = b64(createHmac('sha256', secret).update(body, 'utf8').digest());
    return `${body}.${mac}`;
}
export function encodeWorkflowCursor(secretOrPayload, maybePayload) {
    if (maybePayload !== undefined)
        return encodeWithSecret(secretBytes(secretOrPayload), maybePayload);
    const legacy = secretOrPayload;
    const payload = {
        version: 1,
        kind: legacy.kind ?? legacy.collection,
        sessionId: legacy.sessionId ?? legacy.owner ?? '',
        entityId: legacy.entityId ?? legacy.collectionOwner ?? '',
        processEpoch: legacy.processEpoch ?? legacy.epoch ?? '',
        revision: legacy.revision,
        offset: legacy.offset,
    };
    return encodeWithSecret(PROCESS_SECRET, payload);
}
function decodeWithSecret(secret, cursor, expected) {
    try {
        secretBytes(secret);
        if (typeof cursor !== 'string' || cursor.length === 0 || cursor.length > MAX_CURSOR_CHARS)
            return { ok: false, reason: 'invalid' };
        if (!validExpectation(expected))
            return { ok: false, reason: 'invalid' };
        const separator = cursor.indexOf('.');
        if (separator <= 0 || separator !== cursor.lastIndexOf('.'))
            return { ok: false, reason: 'invalid' };
        const bodyText = cursor.slice(0, separator);
        const macText = cursor.slice(separator + 1);
        const body = decodeB64(bodyText);
        const suppliedMac = decodeB64(macText);
        if (!body || !suppliedMac || suppliedMac.byteLength !== 32)
            return { ok: false, reason: 'invalid' };
        const actualMac = createHmac('sha256', secret).update(bodyText, 'utf8').digest();
        if (!timingSafeEqual(actualMac, Buffer.from(suppliedMac)))
            return { ok: false, reason: 'invalid' };
        const decodedText = new TextDecoder('utf-8', { fatal: true }).decode(body);
        const parsed = JSON.parse(decodedText);
        if (!validPayload(parsed) || JSON.stringify(parsed) !== decodedText)
            return { ok: false, reason: 'invalid' };
        if (parsed.kind !== expected.kind || parsed.sessionId !== expected.sessionId || parsed.entityId !== expected.entityId || parsed.processEpoch !== expected.processEpoch)
            return { ok: false, reason: 'invalid' };
        if (parsed.offset > expected.total)
            return { ok: false, reason: 'invalid' };
        if (parsed.revision !== expected.revision)
            return { ok: false, reason: 'stale' };
        return { ok: true, value: parsed };
    }
    catch {
        return { ok: false, reason: 'invalid' };
    }
}
export function decodeWorkflowCursor(secretOrCursor, cursorOrExpected, maybeExpected) {
    if (maybeExpected !== undefined)
        return decodeWithSecret(secretBytes(secretOrCursor), cursorOrExpected, maybeExpected);
    const expected = cursorOrExpected;
    const result = decodeWithSecret(PROCESS_SECRET, secretOrCursor, {
        version: 1,
        kind: (expected.kind ?? expected.collection),
        sessionId: expected.sessionId ?? expected.owner ?? '',
        entityId: expected.entityId ?? expected.collectionOwner ?? '',
        processEpoch: expected.processEpoch ?? expected.epoch ?? '',
        revision: expected.revision,
        total: expected.total ?? Number.MAX_SAFE_INTEGER,
    });
    if (!result.ok) {
        if (result.reason === 'stale')
            throw new WorkflowCursorError('workflow page cursor is stale; refresh the collection', 'stale-cursor');
        throw new WorkflowCursorError('workflow page cursor is invalid or belongs to another collection', 'invalid-cursor');
    }
    return result.value;
}
//# sourceMappingURL=cursors.js.map