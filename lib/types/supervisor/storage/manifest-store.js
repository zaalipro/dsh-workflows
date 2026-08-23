import { createHash, randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, readdir, rename, rmdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { isWorkflowDefinitionName } from '../../registry/names.js';
import { decodeWorkflowSessionManifest, displayOrdinal, encodeWorkflowSessionManifest } from './manifest-codec.js';
import { compactWorkflowRunDetails, decodeWorkflowRunDetails, encodeWorkflowRunDetails } from './details-codec.js';
import { BoundedFileError, assertSafeComponent, readBoundedUtf8, writeBoundedAtomic } from './bounded-file.js';
const SESSION_ADDRESS = /^[a-f0-9]{64}$/u;
const COMPONENT32 = /^[a-f0-9]{32}$/u;
const DETAIL_FILE = /^([a-f0-9]{32})\.json$/u;
const TERMINAL = new Set(['completed', 'failed', 'cancelled', 'interrupted']);
const ACTIVE = new Set(['running', 'pausing', 'stopping', 'needs-input', 'paused', 'budget-limited']);
const STORAGE_CATEGORIES = ['sessions', 'runs', 'staging', 'quarantine'];
const encoder = new TextEncoder();
const now = () => Date.now();
const id = () => randomBytes(16).toString('hex');
const sessionAddress = (sessionId) => createHash('sha256').update(sessionId).digest('hex');
const clone = (value) => structuredClone(value);
const terminal = (status) => TERMINAL.has(status);
const descriptorFileCeiling = 1_048_576;
const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
function artifactIdentityOf(value) {
    return {
        dev: Number(value.dev), ino: Number(value.ino), size: Number(value.size),
        mtimeMs: Number(value.mtimeMs),
        ...(value.ctimeMs === undefined ? {} : { ctimeMs: Number(value.ctimeMs) }),
        ...(value.mode === undefined ? {} : { mode: Number(value.mode) }),
        ...(value.nlink === undefined ? {} : { nlink: Number(value.nlink) }),
        ...(value.version === undefined ? {} : { version: value.version }),
    };
}
function sameArtifactIdentity(left, right) {
    if (left.version !== undefined || right.version !== undefined) {
        return left.version !== undefined && right.version !== undefined && isSameOpaque(left.version, right.version)
            && left.size === right.size;
    }
    return left.dev === right.dev && left.ino === right.ino && left.size === right.size
        && left.mtimeMs === right.mtimeMs
        && (left.ctimeMs === undefined || right.ctimeMs === undefined || left.ctimeMs === right.ctimeMs)
        && (left.nlink === undefined || right.nlink === undefined || left.nlink === right.nlink);
}
function isSameOpaque(left, right) {
    if (Object.is(left, right))
        return true;
    try {
        return JSON.stringify(left) === JSON.stringify(right);
    }
    catch {
        return false;
    }
}
function sameLocalIdentity(left, right) {
    return Number(left.dev) === Number(right.dev)
        && Number(left.ino) === Number(right.ino)
        && Number(left.size) === Number(right.size)
        && Number(left.mtimeMs) === Number(right.mtimeMs)
        && Number(left.ctimeMs) === Number(right.ctimeMs);
}
/** Decode a bounded UTF-8 byte window without exposing a split code point. */
function decodeArtifactWindow(bytes, maxBytes) {
    const capacity = Math.min(bytes.byteLength, maxBytes);
    for (let count = capacity; count >= Math.max(0, capacity - 3); count -= 1) {
        try {
            return { text: utf8Decoder.decode(bytes.subarray(0, count)), returnedBytes: count };
        }
        catch { /* trim an incomplete trailing code point */ }
    }
    throw new BoundedFileError('workflow artifact is not valid UTF-8', 'WORKFLOW_STORAGE_CORRUPT');
}
function exposedHead(head, runsRoot) {
    return { ...head, scriptPath: join(runsRoot, 'runs', head.runDirectory, 'script.js') };
}
function durableHead(head) {
    const { scriptPath: _scriptPath, ...rest } = head;
    return rest;
}
function detailLimits(options) {
    return {
        memberOutcomeMaxBytes: options.memberOutcomeMaxBytes ?? 131_072,
        maxTerminalResultBytes: options.maxTerminalResultBytes ?? 1_048_576,
        maxLogLineBytes: options.maxLogLineBytes ?? 65_536,
        maxRunDetailsBytes: options.maxRunDetailsBytes,
    };
}
function unsafe(root, detail, cause) {
    return new BoundedFileError(`workflow storage path "${root}" is unsafe: ${detail}`, 'WORKFLOW_STORAGE_UNSAFE', cause === undefined ? undefined : { cause });
}
/** Only explicit absence codes may become an empty/missing observation. */
function isNotFound(error) {
    if (typeof error !== 'object' || error === null || !('code' in error))
        return false;
    const code = String(error.code);
    return code === 'ENOENT' || code === 'FS_NOT_FOUND';
}
async function ownerDirectory(path, create = false) {
    try {
        const info = await lstat(path);
        if (info.isSymbolicLink() || !info.isDirectory() || (typeof process.getuid === 'function' && info.uid !== process.getuid()) || (info.mode & 0o777) !== 0o700)
            throw unsafe(path, 'expected owner-only 0700 directory');
    }
    catch (error) {
        if (error.code !== 'ENOENT' || !create)
            throw error;
        await mkdir(path, { recursive: true, mode: 0o700 });
        const info = await lstat(path);
        if (info.isSymbolicLink() || !info.isDirectory() || (info.mode & 0o777) !== 0o700)
            throw unsafe(path, 'created directory is unsafe');
    }
}
async function ownerFile(path, maxBytes) {
    const nofollow = constants.O_NOFOLLOW;
    if (!nofollow || process.platform === 'win32')
        throw new BoundedFileError(`safe workflow storage is unavailable on ${process.platform}`, 'WORKFLOW_STORAGE_UNSUPPORTED');
    const handle = await open(path, constants.O_RDONLY | nofollow);
    try {
        const info = await handle.stat();
        if (!info.isFile() || info.nlink !== 1 || (typeof process.getuid === 'function' && info.uid !== process.getuid()) || (info.mode & 0o777) !== 0o600)
            throw unsafe(path, 'expected owner-only 0600 regular file');
        if (info.size > maxBytes)
            throw new BoundedFileError(`${path} exceeds ${maxBytes} bytes`, 'WORKFLOW_STORAGE_LIMIT');
    }
    finally {
        await handle.close();
    }
}
async function safeRemoveTree(path) {
    const info = await lstat(path);
    if (info.isSymbolicLink())
        throw unsafe(path, 'symbolic links are not removable');
    if (info.isDirectory()) {
        const identity = { dev: Number(info.dev), ino: Number(info.ino), size: Number(info.size), mtimeMs: Number(info.mtimeMs), ctimeMs: Number(info.ctimeMs) };
        for (const name of (await readdir(path)).sort()) {
            assertSafeComponent(name, 'storage entry');
            const before = await lstat(join(path, name));
            if (before.isSymbolicLink())
                throw unsafe(join(path, name), 'symbolic links are not removable');
            await safeRemoveTree(join(path, name));
        }
        const beforeRemove = await lstat(path);
        if (!beforeRemove.isDirectory() || Number(beforeRemove.dev) !== identity.dev || Number(beforeRemove.ino) !== identity.ino)
            throw unsafe(path, 'directory identity changed during cleanup');
        await rmdir(path);
    }
    else {
        if (!info.isFile() || info.nlink !== 1)
            throw unsafe(path, 'unexpected removable file');
        const current = await lstat(path);
        if (!current.isFile() || Number(current.dev) !== Number(info.dev) || Number(current.ino) !== Number(info.ino) || Number(current.size) !== Number(info.size) || Number(current.mtimeMs) !== Number(info.mtimeMs) || Number(current.ctimeMs) !== Number(info.ctimeMs))
            throw unsafe(path, 'file identity changed during cleanup');
        await unlink(path);
    }
}
async function treeBytes(path) {
    const info = await lstat(path);
    if (info.isSymbolicLink())
        throw unsafe(path, 'symbolic links are not countable');
    if (!info.isDirectory())
        return info.size;
    let total = 0;
    for (const name of await readdir(path)) {
        assertSafeComponent(name, 'storage entry');
        total += await treeBytes(join(path, name));
    }
    return total;
}
/** Count every enumerated entry, not just Session manifests.  Recovery uses a
 * single budget so a hostile/deep tree cannot bypass the eager-scan bound by
 * placing entries under runs, scratch, staging, or quarantine. */
async function countEntries(path, limit, seen) {
    const info = await lstat(path);
    if (info.isSymbolicLink())
        throw unsafe(path, 'symbolic links are not allowed during recovery');
    seen.value += 1;
    if (seen.value > limit || !info.isDirectory())
        return;
    for (const name of (await readdir(path)).sort()) {
        assertSafeComponent(name, 'storage entry');
        await countEntries(join(path, name), limit, seen);
        if (seen.value > limit)
            return;
    }
}
async function countCapabilityEntries(directory, limit, seen, signal) {
    signal?.throwIfAborted();
    if (directory.listEntries === undefined) {
        throw new BoundedFileError('descriptor-rooted recovery listing is unavailable', 'WORKFLOW_STORAGE_UNSUPPORTED');
    }
    const entries = await directory.listEntries(signal);
    for (const entry of entries) {
        signal?.throwIfAborted();
        assertSafeComponent(entry.name, 'storage entry');
        seen.value += 1;
        if (seen.value > limit)
            throw new BoundedFileError(`workflow storage path "${directory.path}" is unsafe: recovery scan exceeds ${limit} entries`, 'WORKFLOW_STORAGE_UNSAFE');
        if (entry.type === 'symlink')
            throw unsafe(directory.path, `symbolic link encountered at "${entry.name}"`);
        if (entry.type === 'directory') {
            const child = await directory.openDirectory(entry.name, signal, { create: false });
            try {
                await countCapabilityEntries(child, limit, seen, signal);
            }
            finally {
                await child.close().catch(() => undefined);
            }
        }
    }
}
function recoveryLimitError(root, limit) {
    return unsafe(root, `recovery scan exceeds ${limit} entries`);
}
function isSafeCapabilityIdentity(identity) {
    if (typeof identity !== 'object' || identity === null)
        return false;
    const value = identity;
    const size = Number(value.size);
    const nlink = Number(value.nlink);
    if (!Number.isSafeInteger(size) || size < 0 || nlink !== 1)
        return false;
    const hasOpaqueVersion = value.version !== undefined;
    const hasPosixIdentity = Number.isSafeInteger(Number(value.dev)) && Number.isSafeInteger(Number(value.ino))
        && !Number.isNaN(Number(value.dev)) && !Number.isNaN(Number(value.ino));
    return hasOpaqueVersion || hasPosixIdentity;
}
/** Validate and count a local descriptor tree without reading file bodies.
 * This is used only by the standalone (no Host capability) fixture seam. */
async function inspectLocalTree(path, root, limit, count, maxFileBytes, signal) {
    signal?.throwIfAborted();
    let info;
    try {
        info = await lstat(path);
    }
    catch (error) {
        if (error.code === 'ENOENT')
            throw error;
        throw error;
    }
    if (info.isSymbolicLink())
        throw unsafe(root, `symbolic link encountered at "${path}"`);
    count.value += 1;
    if (count.value > limit)
        throw recoveryLimitError(root, limit);
    if (info.isDirectory()) {
        await ownerDirectory(path);
        let total = 0;
        for (const name of (await readdir(path)).sort()) {
            assertSafeComponent(name, 'storage entry');
            total += await inspectLocalTree(join(path, name), root, limit, count, maxFileBytes, signal);
        }
        return total;
    }
    if (!info.isFile())
        throw unsafe(root, `unexpected entry type at "${path}"`);
    await ownerFile(path, maxFileBytes);
    return Number(info.size);
}
/** Count and validate a retained descriptor tree.  No path is composed here;
 * every descendant is opened through the already-pinned parent capability. */
async function inspectCapabilityTree(directory, root, limit, count, maxFileBytes, signal) {
    signal?.throwIfAborted();
    if (directory.listEntries === undefined)
        throw new BoundedFileError('descriptor-rooted recovery listing is unavailable', 'WORKFLOW_STORAGE_UNSUPPORTED');
    await directory.assertIdentity(signal);
    const entries = await directory.listEntries(signal);
    let total = 0;
    for (const entry of entries) {
        signal?.throwIfAborted();
        assertSafeComponent(entry.name, 'storage entry');
        count.value += 1;
        if (count.value > limit)
            throw recoveryLimitError(root, limit);
        if (entry.type === 'symlink')
            throw unsafe(root, `symbolic link encountered at "${entry.name}"`);
        if (entry.type === 'other')
            throw unsafe(root, `unexpected entry type at "${entry.name}"`);
        if (entry.type === 'directory') {
            const child = await directory.openDirectory(entry.name, signal, { create: false });
            try {
                total += await inspectCapabilityTree(child, root, limit, count, maxFileBytes, signal);
            }
            finally {
                await child.close().catch(() => undefined);
            }
            continue;
        }
        const identity = entry.identity ?? (directory.fileInfo === undefined ? undefined : await directory.fileInfo(entry.name, signal));
        if (!isSafeCapabilityIdentity(identity))
            throw new BoundedFileError(`descriptor-rooted recovery metadata for "${entry.name}" is unavailable`, 'WORKFLOW_STORAGE_UNSUPPORTED');
        if (Number(identity.size) > maxFileBytes)
            throw new BoundedFileError(`descriptor-rooted file "${entry.name}" exceeds ${maxFileBytes} bytes`, 'WORKFLOW_STORAGE_LIMIT');
        total += Number(identity.size);
    }
    await directory.assertIdentity(signal);
    return total;
}
/** File-backed version-2 retained store. All durable mutations are serialized. */
function allocateDisplayIdentity(manifest, name) {
    let ordinal = manifest.ordinals.find(item => item.name === name)?.next ?? 1;
    for (;;) {
        if (!Number.isSafeInteger(ordinal) || ordinal < 1) {
            throw new BoundedFileError(`workflow display ordinal for "${name}" is exhausted`, 'WORKFLOW_STORAGE_LIMIT');
        }
        const displayName = ordinal === 1 ? name : `${name}-${ordinal}`;
        const collision = manifest.ordinals.some(entry => {
            try {
                return displayOrdinal(entry.name, displayName) < entry.next;
            }
            catch {
                return false;
            }
        });
        if (!collision)
            return { ordinal, displayName };
        ordinal += 1;
    }
}
export class FileWorkflowRunStore {
    options;
    lease;
    layout;
    sessions = new Map();
    details = new Map();
    mutationTail = Promise.resolve();
    disposed = false;
    initialized = false;
    recovered = [];
    constructor(options, lease, layout) {
        this.options = options;
        this.lease = lease;
        this.layout = layout;
        for (const [name, value] of Object.entries(options)) {
            if (name !== 'runsRoot' && value !== undefined && (!Number.isSafeInteger(value) || Number(value) <= 0))
                throw new RangeError(`${name} must be a positive safe integer`);
        }
        if (options.maxManifestBytes > 8_388_608 || options.maxRunDetailsBytes > 33_554_432 || options.maxRunStoreBytes > 536_870_912 || options.maxRecoveryEntries > 4_096)
            throw new RangeError('workflow storage limits exceed fixed ceilings');
    }
    async guard(signal) {
        if (this.disposed)
            throw new BoundedFileError('workflow run store is disposed');
        signal?.throwIfAborted();
        await this.lease?.assertCurrent();
        signal?.throwIfAborted();
        if (this.layout !== undefined) {
            await this.layout.root.assertIdentity(signal);
            for (const directory of [this.layout.sessions, this.layout.runs, this.layout.staging, this.layout.quarantine])
                await directory.assertIdentity(signal);
        }
    }
    async mutate(operation) {
        const previous = this.mutationTail;
        let release;
        this.mutationTail = new Promise(resolve => { release = resolve; });
        await previous;
        try {
            return await operation();
        }
        finally {
            release();
        }
    }
    manifestPath(sessionId) { return join(this.options.runsRoot, 'sessions', sessionAddress(sessionId), 'manifest.json'); }
    runPath(runDirectory) { assertSafeComponent(runDirectory, 'run directory'); return join(this.options.runsRoot, 'runs', runDirectory); }
    empty(sessionId) { return { version: 2, sessionId, revision: 0, nextOrdinal: 1, ordinals: [], heads: [] }; }
    /** Traverse a retained storage capability and close only capabilities this
     * operation opened.  The root/category descriptors belong to the bootstrap
     * layout and are never closed here. */
    async withDirectory(parts, operation, create = false, signal) {
        if (this.layout === undefined)
            throw new BoundedFileError('descriptor-rooted workflow storage is unavailable', 'WORKFLOW_STORAGE_UNSUPPORTED');
        let directory = this.layout.root;
        const opened = [];
        try {
            for (const part of parts) {
                signal?.throwIfAborted();
                directory = await directory.openDirectory(part, signal, { create });
                opened.push(directory);
            }
            signal?.throwIfAborted();
            return await operation(directory);
        }
        finally {
            for (const child of opened.reverse())
                await child.close().catch(() => undefined);
        }
    }
    async withRunDirectory(runDirectory, operation, signal) {
        assertSafeComponent(runDirectory, 'run directory');
        if (this.layout === undefined)
            throw new BoundedFileError('descriptor-rooted workflow storage is unavailable', 'WORKFLOW_STORAGE_UNSUPPORTED');
        return this.withDirectory(['runs', runDirectory], operation, false, signal);
    }
    async withCategory(category, operation) {
        if (this.layout === undefined)
            throw new BoundedFileError('descriptor-rooted workflow storage is unavailable', 'WORKFLOW_STORAGE_UNSUPPORTED');
        const directory = this.layout[category];
        await directory.assertIdentity();
        try {
            return await operation(directory);
        }
        finally {
            await directory.assertIdentity().catch(() => undefined);
        }
    }
    /** Remove a manifest-selected tree only through retained directory
     * capabilities.  The local path helpers below are reserved for the
     * standalone fallback store; a Host layout without a removal primitive
     * fails closed instead of recursing through strings. */
    async removeCapabilityTree(category, name, signal) {
        if (this.layout === undefined)
            throw new BoundedFileError('descriptor-rooted workflow cleanup is unavailable', 'WORKFLOW_STORAGE_UNSUPPORTED');
        assertSafeComponent(name, 'storage entry');
        const parent = this.layout[category];
        await parent.assertIdentity(signal);
        const child = await parent.openDirectory(name, signal, { create: false });
        try {
            const entries = child.listEntries === undefined ? undefined : await child.listEntries(signal);
            if (entries === undefined)
                throw new BoundedFileError('descriptor-rooted workflow cleanup listing is unavailable', 'WORKFLOW_STORAGE_UNSUPPORTED');
            for (const entry of entries) {
                signal?.throwIfAborted();
                assertSafeComponent(entry.name, 'storage entry');
                if (entry.type === 'file') {
                    if (child.removeFile === undefined)
                        throw new BoundedFileError('descriptor-rooted workflow file cleanup is unavailable', 'WORKFLOW_STORAGE_UNSUPPORTED');
                    await child.removeFile(entry.name, entry.identity, signal);
                }
                else if (entry.type === 'directory') {
                    // Recurse relative to the retained child, never from a joined path.
                    await this.removeCapabilitySubtree(child, entry.name, signal);
                }
                else
                    throw unsafe(this.options.runsRoot, `unsafe entry ${entry.name} during cleanup`);
            }
        }
        finally {
            await child.close().catch(() => undefined);
        }
        if (parent.removeDirectory === undefined)
            throw new BoundedFileError('descriptor-rooted workflow directory cleanup is unavailable', 'WORKFLOW_STORAGE_UNSUPPORTED');
        await parent.removeDirectory(name, undefined, signal);
        await parent.assertIdentity(signal);
    }
    async removeCapabilitySubtree(parent, name, signal) {
        assertSafeComponent(name, 'storage entry');
        const child = await parent.openDirectory(name, signal, { create: false });
        try {
            const entries = child.listEntries === undefined ? undefined : await child.listEntries(signal);
            if (entries === undefined)
                throw new BoundedFileError('descriptor-rooted workflow cleanup listing is unavailable', 'WORKFLOW_STORAGE_UNSUPPORTED');
            for (const entry of entries) {
                signal?.throwIfAborted();
                assertSafeComponent(entry.name, 'storage entry');
                if (entry.type === 'file') {
                    if (child.removeFile === undefined)
                        throw new BoundedFileError('descriptor-rooted workflow file cleanup is unavailable', 'WORKFLOW_STORAGE_UNSUPPORTED');
                    await child.removeFile(entry.name, entry.identity, signal);
                }
                else if (entry.type === 'directory')
                    await this.removeCapabilitySubtree(child, entry.name, signal);
                else
                    throw unsafe(this.options.runsRoot, `unsafe entry ${entry.name} during cleanup`);
            }
        }
        finally {
            await child.close().catch(() => undefined);
        }
        if (parent.removeDirectory === undefined)
            throw new BoundedFileError('descriptor-rooted workflow directory cleanup is unavailable', 'WORKFLOW_STORAGE_UNSUPPORTED');
        await parent.removeDirectory(name, undefined, signal);
    }
    async capabilityTreeBytes(directory, signal) {
        const entries = directory.listEntries === undefined ? undefined : await directory.listEntries(signal);
        if (entries === undefined)
            throw new BoundedFileError('descriptor-rooted storage accounting is unavailable', 'WORKFLOW_STORAGE_UNSUPPORTED');
        let total = 0;
        for (const entry of entries) {
            signal?.throwIfAborted();
            assertSafeComponent(entry.name, 'storage entry');
            if (entry.type === 'file') {
                const identity = entry.identity ?? (directory.fileInfo === undefined ? undefined : await directory.fileInfo(entry.name, signal));
                if (identity === undefined || !Number.isSafeInteger(Number(identity.size)) || Number(identity.size) < 0) {
                    throw new BoundedFileError(`descriptor-rooted storage size for "${entry.name}" is unavailable`, 'WORKFLOW_STORAGE_UNSUPPORTED');
                }
                total += Number(identity.size);
            }
            else if (entry.type === 'directory') {
                const child = await directory.openDirectory(entry.name, signal, { create: false });
                try {
                    total += await this.capabilityTreeBytes(child, signal);
                }
                finally {
                    await child.close().catch(() => undefined);
                }
            }
            else
                throw unsafe(this.options.runsRoot, `unsafe entry ${entry.name} during accounting`);
        }
        return total;
    }
    async committedBytes(signal) {
        if (this.layout === undefined) {
            let total = 0;
            for (const category of ['sessions', 'runs', 'staging', 'quarantine'])
                total += await treeBytes(join(this.options.runsRoot, category));
            return total;
        }
        let total = 0;
        for (const category of ['sessions', 'runs', 'staging', 'quarantine'])
            total += await this.capabilityTreeBytes(this.layout[category], signal);
        return total;
    }
    async removeRunTree(runDirectory, signal) {
        await this.quarantineThenRemove('runs', runDirectory, signal);
    }
    async removeStagingTree(stageId, signal) {
        await this.quarantineThenRemove('staging', stageId, signal);
    }
    /** Rename an identity-pinned run or staging tree into quarantine, then
     * delete only through the quarantined child.  An identity change aborts
     * cleanup with UNSAFE rather than following a substituted path. */
    async quarantineThenRemove(category, name, signal) {
        assertSafeComponent(name, 'storage entry');
        const quarantineId = id();
        try {
            if (this.layout !== undefined) {
                const source = this.layout[category];
                if (typeof source.publishDirectory !== 'function') {
                    throw new BoundedFileError('descriptor-rooted workflow directory publication is unavailable', 'WORKFLOW_STORAGE_UNSUPPORTED');
                }
                await source.assertIdentity(signal);
                await this.layout.quarantine.assertIdentity(signal);
                await source.publishDirectory(name, this.layout.quarantine, quarantineId, signal);
                await this.removeCapabilityTree('quarantine', quarantineId, signal);
                return;
            }
            const from = join(this.options.runsRoot, category, name);
            const to = join(this.options.runsRoot, 'quarantine', quarantineId);
            await ownerDirectory(join(this.options.runsRoot, 'quarantine'), true);
            await rename(from, to);
            await safeRemoveTree(to);
        }
        catch (error) {
            if (isNotFound(error))
                return;
            throw error;
        }
    }
    async readCapabilityFile(parts, name, maxBytes, signal) {
        return this.withDirectory(parts, directory => directory.readBytes(name, signal, maxBytes), false);
    }
    async writeCapabilityFile(parts, name, content, maxBytes, createOnly = false, signal) {
        const bytes = encoder.encode(content);
        if (bytes.byteLength > maxBytes)
            throw new BoundedFileError(`workflow storage file exceeds ${maxBytes} bytes`, 'WORKFLOW_STORAGE_LIMIT');
        await this.withDirectory(parts, async (directory) => {
            let current = directory.fileInfo === undefined ? undefined : await directory.fileInfo(name, signal);
            if (directory.fileInfo === undefined && directory.listEntries !== undefined) {
                const observed = (await directory.listEntries(signal)).find(entry => entry.name === name);
                if (observed !== undefined) {
                    if (observed.type !== 'file')
                        throw unsafe(directory.path, `entry "${name}" is not a regular file`);
                    current = observed.identity;
                }
            }
            if (createOnly && current !== undefined)
                throw new BoundedFileError(`private file "${name}" already exists`, 'WORKFLOW_STORAGE_UNSAFE');
            if (current !== undefined && current.version === undefined && Number.isNaN(current.dev)) {
                throw new BoundedFileError(`descriptor-rooted version for "${name}" is unavailable`, 'WORKFLOW_STORAGE_UNSUPPORTED');
            }
            const expected = current === undefined ? { kind: 'createIfAbsent' } : { kind: 'replaceIfVersion', version: current };
            await directory.writeText(name, content, expected, signal);
        }, true);
    }
    async removeCapabilityFile(parts, name, signal) {
        if (this.layout === undefined) {
            await unlink(join(this.options.runsRoot, ...parts, name)).catch(error => { if (error.code !== 'ENOENT')
                throw error; });
            return;
        }
        await this.withDirectory(parts, async (directory) => {
            if (directory.removeFile === undefined)
                throw new BoundedFileError('descriptor-rooted file removal is unavailable', 'WORKFLOW_STORAGE_UNSUPPORTED');
            await directory.removeFile(name, undefined, signal);
        }, false);
    }
    async persist(manifest) {
        const durable = { ...manifest, heads: manifest.heads.map(durableHead) };
        const bytes = encodeWorkflowSessionManifest(durable, this.options.maxManifestBytes);
        const directory = join(this.options.runsRoot, 'sessions', sessionAddress(manifest.sessionId));
        if (this.layout !== undefined) {
            await this.writeCapabilityFile(['sessions', sessionAddress(manifest.sessionId)], 'manifest.json', new TextDecoder().decode(bytes), this.options.maxManifestBytes);
        }
        else {
            await ownerDirectory(directory, true);
            await writeBoundedAtomic(join(directory, 'manifest.json'), new TextDecoder().decode(bytes), { maxBytes: this.options.maxManifestBytes });
        }
        this.sessions.set(manifest.sessionId, clone(durable));
    }
    async load(sessionId) {
        const cached = this.sessions.get(sessionId);
        if (cached)
            return clone(cached);
        const path = this.manifestPath(sessionId);
        try {
            const bytes = this.layout === undefined
                ? encoder.encode(await (async () => { await ownerFile(path, this.options.maxManifestBytes); return readBoundedUtf8(path, this.options.maxManifestBytes); })())
                : await this.readCapabilityFile(['sessions', sessionAddress(sessionId)], 'manifest.json', this.options.maxManifestBytes);
            const manifest = decodeWorkflowSessionManifest(new TextDecoder().decode(bytes), path, this.options.maxManifestBytes);
            if (manifest.sessionId !== sessionId)
                throw unsafe(this.options.runsRoot, 'Session manifest identity mismatch');
            this.sessions.set(sessionId, clone(manifest));
            return clone(manifest);
        }
        catch (error) {
            if (isNotFound(error)) {
                const empty = this.empty(sessionId);
                this.sessions.set(sessionId, empty);
                return clone(empty);
            }
            throw error;
        }
    }
    async readDetail(head, sessionId, cache = true) {
        const cached = this.details.get(head.runId);
        if (cache && cached?.detailId === head.detail.id)
            return clone(cached);
        const path = join(this.runPath(head.runDirectory), 'details', `${head.detail.id}.json`);
        const bytes = this.layout === undefined
            ? encoder.encode(await (async () => { await ownerFile(path, this.options.maxRunDetailsBytes); return readBoundedUtf8(path, this.options.maxRunDetailsBytes); })())
            : await this.readCapabilityFile(['runs', head.runDirectory, 'details'], `${head.detail.id}.json`, this.options.maxRunDetailsBytes);
        if (bytes.byteLength !== head.detail.bytes || createHash('sha256').update(bytes).digest('hex') !== head.detail.sha256)
            throw unsafe(this.options.runsRoot, `detail ${head.detail.id} digest or byte count does not match its manifest head`);
        const detail = decodeWorkflowRunDetails(bytes, path, detailLimits(this.options));
        if (detail.sessionId !== sessionId || detail.runId !== head.runId || detail.runDirectory !== head.runDirectory || detail.detailId !== head.detail.id || detail.snapshotRevision !== head.detail.snapshotRevision)
            throw unsafe(this.options.runsRoot, 'detail identity does not match its manifest head');
        if (cache)
            this.details.set(head.runId, clone(detail));
        return detail;
    }
    /** Read the editable projection through the retained storage capability.
     * The caller supplies only the manifest-selected single component; no
     * absolute path is opened here. */
    async readRunScript(runDirectory, maxBytes, signal) {
        if (!Number.isSafeInteger(maxBytes) || maxBytes < 0 || maxBytes > descriptorFileCeiling)
            throw new BoundedFileError('workflow script projection limit is invalid', 'WORKFLOW_STORAGE_LIMIT');
        await this.mutate(async () => {
            await this.guard(signal);
            await this.ensureInitialized(signal);
        });
        return this.withRunDirectory(runDirectory, async (directory) => {
            const bytes = await directory.readBytes('script.js', signal, maxBytes);
            try {
                return utf8Decoder.decode(bytes);
            }
            catch (error) {
                throw new BoundedFileError('workflow script projection is not valid UTF-8', 'WORKFLOW_STORAGE_CORRUPT', { cause: error });
            }
        }, signal);
    }
    /** Inventory scratch files relative to a descriptor-pinned run directory. */
    async listRunArtifacts(runDirectory, maxItems, signal) {
        if (!Number.isSafeInteger(maxItems) || maxItems < 1)
            throw new BoundedFileError('workflow artifact limit is invalid', 'WORKFLOW_STORAGE_LIMIT');
        await this.mutate(async () => {
            await this.guard(signal);
            await this.ensureInitialized(signal);
        });
        return this.withRunDirectory(runDirectory, async (directory) => {
            const scratch = await directory.openDirectory('scratch', signal, { create: false });
            try {
                if (scratch.listEntries === undefined) {
                    throw new BoundedFileError('descriptor-rooted scratch listing is unavailable', 'WORKFLOW_STORAGE_UNSUPPORTED');
                }
                const entries = await scratch.listEntries(signal);
                const all = [];
                for (const entry of entries) {
                    signal?.throwIfAborted();
                    assertSafeComponent(entry.name, 'scratch artifact');
                    if (entry.type !== 'file')
                        throw unsafe(this.options.runsRoot, `unsafe scratch artifact ${entry.name}`);
                    const identity = entry.identity ?? (scratch.fileInfo === undefined ? undefined : await scratch.fileInfo(entry.name, signal));
                    if (identity === undefined)
                        throw new BoundedFileError('descriptor-rooted scratch metadata is unavailable', 'WORKFLOW_STORAGE_UNSUPPORTED');
                    if (identity.nlink !== 1)
                        throw unsafe(this.options.runsRoot, `unsafe scratch artifact ${entry.name}`);
                    const size = Number(identity.size);
                    if (!Number.isSafeInteger(size) || size < 0 || size > descriptorFileCeiling)
                        throw new BoundedFileError(`workflow artifact ${entry.name} exceeds ${descriptorFileCeiling} bytes`, 'WORKFLOW_STORAGE_LIMIT');
                    all.push({ name: entry.name, bytes: size, identity: artifactIdentityOf(identity) });
                }
                all.sort((left, right) => left.name.localeCompare(right.name));
                return { items: all.slice(0, maxItems), total: all.length };
            }
            finally {
                await scratch.close().catch(() => undefined);
            }
        }, signal);
    }
    /** Read a bounded UTF-8 artifact window while retaining the descriptor for
     * both identity checks. */
    async readRunArtifact(runDirectory, name, offsetBytes, maxBytes, expected, signal) {
        assertSafeComponent(name, 'scratch artifact');
        if (!Number.isSafeInteger(offsetBytes) || offsetBytes < 0 || !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 131_072)
            throw new BoundedFileError('workflow artifact read limit is invalid', 'WORKFLOW_STORAGE_LIMIT');
        await this.mutate(async () => {
            await this.guard(signal);
            await this.ensureInitialized(signal);
        });
        return this.withRunDirectory(runDirectory, async (directory) => {
            const scratch = await directory.openDirectory('scratch', signal, { create: false });
            try {
                const before = scratch.fileInfo === undefined ? undefined : await scratch.fileInfo(name, signal);
                if (before === undefined || before.nlink !== 1 || before.size < offsetBytes || !sameArtifactIdentity(artifactIdentityOf(before), expected))
                    throw new BoundedFileError('workflow artifact changed; refresh it before reading', 'WORKFLOW_STALE_REVISION');
                const bytes = await scratch.readBytes(name, signal, before.size);
                const window = bytes.subarray(offsetBytes, Math.min(bytes.byteLength, offsetBytes + maxBytes));
                const decoded = decodeArtifactWindow(window, maxBytes);
                const after = scratch.fileInfo === undefined ? before : await scratch.fileInfo(name, signal);
                if (after === undefined || !sameArtifactIdentity(artifactIdentityOf(after), expected))
                    throw new BoundedFileError('workflow artifact changed while it was being read', 'WORKFLOW_STALE_REVISION');
                return {
                    text: decoded.text, offsetBytes, returnedBytes: decoded.returnedBytes,
                    totalBytes: before.size, identity: artifactIdentityOf(after),
                };
            }
            finally {
                await scratch.close().catch(() => undefined);
            }
        }, signal);
    }
    async readRunReport(runDirectory, maxBytes, signal) {
        if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > descriptorFileCeiling)
            throw new BoundedFileError('workflow report limit is invalid', 'WORKFLOW_STORAGE_LIMIT');
        await this.mutate(async () => { await this.guard(signal); await this.ensureInitialized(signal); });
        return this.withRunDirectory(runDirectory, async (directory) => {
            const scratch = await directory.openDirectory('scratch', signal, { create: false });
            try {
                if (scratch.fileInfo === undefined) {
                    throw new BoundedFileError('descriptor-rooted scratch metadata is unavailable', 'WORKFLOW_STORAGE_UNSUPPORTED');
                }
                const info = await scratch.fileInfo('report.md', signal);
                if (info === undefined)
                    return undefined;
                if (info.nlink !== 1 || info.size > maxBytes)
                    throw new BoundedFileError('workflow report exceeds its bound', 'WORKFLOW_STORAGE_LIMIT');
                const bytes = await scratch.readBytes('report.md', signal, maxBytes);
                return utf8Decoder.decode(bytes);
            }
            catch (error) {
                if (isNotFound(error))
                    return undefined;
                throw error;
            }
            finally {
                await scratch.close().catch(() => undefined);
            }
        }, signal);
    }
    async validateRunFiles(head, sessionId) {
        const run = this.runPath(head.runDirectory);
        if (this.layout !== undefined) {
            await this.withDirectory(['runs', head.runDirectory], async (runDirectory) => {
                await runDirectory.readBytes('script.js', undefined, 1_048_576);
                const scratch = await runDirectory.openDirectory('scratch', undefined, { create: false });
                const details = await runDirectory.openDirectory('details', undefined, { create: false });
                try {
                    if (details.listEntries === undefined)
                        throw new BoundedFileError('descriptor-rooted detail listing is unavailable', 'WORKFLOW_STORAGE_UNSUPPORTED');
                    const entries = await details.listEntries();
                    let bytes = 0;
                    for (const entry of entries) {
                        if (!/^[a-f0-9]{32}\.json$/u.test(entry.name) || entry.type !== 'file')
                            throw unsafe(this.options.runsRoot, `unsafe detail entry ${entry.name}`);
                        const identity = entry.identity ?? (details.fileInfo === undefined ? undefined : await details.fileInfo(entry.name));
                        if (identity === undefined)
                            throw new BoundedFileError(`descriptor-rooted detail metadata for "${entry.name}" is unavailable`, 'WORKFLOW_STORAGE_UNSUPPORTED');
                        bytes += Number(identity.size);
                        if (bytes > this.options.maxRunDetailsBytes)
                            throw new BoundedFileError(`run ${head.runDirectory} details exceed ${this.options.maxRunDetailsBytes} bytes`, 'WORKFLOW_STORAGE_LIMIT');
                    }
                }
                finally {
                    await details.close().catch(() => undefined);
                    await scratch.close().catch(() => undefined);
                }
            }, false);
            await this.readDetail(head, sessionId);
            return;
        }
        await ownerDirectory(run);
        await ownerFile(join(run, 'script.js'), 1_048_576);
        await ownerDirectory(join(run, 'scratch'));
        await ownerDirectory(join(run, 'details'));
        let bytes = 0;
        for (const name of await readdir(join(run, 'details'))) {
            if (!/^[a-f0-9]{32}\.json$/u.test(name))
                throw unsafe(this.options.runsRoot, `unsafe detail entry ${name}`);
            const path = join(run, 'details', name);
            await ownerFile(path, this.options.maxRunDetailsBytes);
            bytes += (await stat(path)).size;
            if (bytes > this.options.maxRunDetailsBytes)
                throw new BoundedFileError(`run ${head.runDirectory} details exceed ${this.options.maxRunDetailsBytes} bytes`, 'WORKFLOW_STORAGE_LIMIT');
        }
        await this.readDetail(head, sessionId);
    }
    /** Read and decode every detail sidecar in one run during the read-only
     * recovery preflight.  In particular, unreferenced immutable snapshots are
     * decoded too: silently deleting a malformed transaction residue would turn
     * a corrupt store into a successful partial recovery. */
    async validateLocalRunInventory(runDirectory, inventory) {
        const run = this.runPath(runDirectory);
        const children = (await readdir(run)).sort();
        if (children.length !== 3 || children.join('\u0000') !== ['details', 'scratch', 'script.js'].join('\u0000')) {
            throw unsafe(this.options.runsRoot, `run ${runDirectory} has an unexpected layout`);
        }
        await ownerFile(join(run, 'script.js'), 1_048_576);
        await ownerDirectory(join(run, 'scratch'));
        await ownerDirectory(join(run, 'details'));
        let total = 0;
        for (const name of (await readdir(join(run, 'details'))).sort()) {
            const match = name.match(DETAIL_FILE);
            if (!match)
                throw unsafe(this.options.runsRoot, `unsafe detail entry ${name}`);
            const path = join(run, 'details', name);
            await ownerFile(path, this.options.maxRunDetailsBytes);
            const info = await stat(path);
            total += Number(info.size);
            if (total > this.options.maxRunDetailsBytes) {
                throw new BoundedFileError(`run ${runDirectory} details exceed ${this.options.maxRunDetailsBytes} bytes`, 'WORKFLOW_STORAGE_LIMIT');
            }
            const bytes = encoder.encode(await readBoundedUtf8(path, this.options.maxRunDetailsBytes));
            const snapshot = decodeWorkflowRunDetails(new TextDecoder().decode(bytes), path, detailLimits(this.options));
            if (snapshot.runDirectory !== runDirectory || snapshot.detailId !== match[1]) {
                throw unsafe(this.options.runsRoot, `detail ${name} identity does not match run ${runDirectory}`);
            }
            const key = `${runDirectory}/${match[1]}`;
            if (inventory.details.has(key))
                throw unsafe(this.options.runsRoot, `detail ${match[1]} is duplicated`);
            inventory.details.set(key, snapshot);
            inventory.detailDigests.set(key, { bytes: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex') });
        }
    }
    async capabilityEntries(directory, signal) {
        if (directory.listEntries === undefined)
            throw new BoundedFileError('descriptor-rooted recovery listing is unavailable', 'WORKFLOW_STORAGE_UNSUPPORTED');
        return directory.listEntries(signal);
    }
    async validateCapabilityRunInventory(runDirectory, inventory, signal) {
        const run = await this.layout.runs.openDirectory(runDirectory, signal, { create: false });
        try {
            const children = await this.capabilityEntries(run, signal);
            const names = children.map(entry => entry.name).sort();
            if (names.length !== 3 || names.join('\u0000') !== ['details', 'scratch', 'script.js'].join('\u0000')) {
                throw unsafe(this.options.runsRoot, `run ${runDirectory} has an unexpected layout`);
            }
            const script = children.find(entry => entry.name === 'script.js');
            if (script?.type !== 'file')
                throw unsafe(this.options.runsRoot, `run ${runDirectory} script is not a regular file`);
            const scriptIdentity = script.identity ?? (run.fileInfo === undefined ? undefined : await run.fileInfo('script.js', signal));
            if (!isSafeCapabilityIdentity(scriptIdentity) || Number(scriptIdentity.size) > 1_048_576) {
                throw new BoundedFileError(`descriptor-rooted script metadata for ${runDirectory} is unavailable or oversized`, 'WORKFLOW_STORAGE_LIMIT');
            }
            const scratchEntry = children.find(entry => entry.name === 'scratch');
            const detailsEntry = children.find(entry => entry.name === 'details');
            if (scratchEntry?.type !== 'directory' || detailsEntry?.type !== 'directory')
                throw unsafe(this.options.runsRoot, `run ${runDirectory} scratch/details layout is unsafe`);
            const details = await run.openDirectory('details', signal, { create: false });
            const scratch = await run.openDirectory('scratch', signal, { create: false });
            try {
                // A scratch entry is allowed to be empty or to contain model-created
                // artifacts, but every entry must still be accounted for by the
                // aggregate inventory pass above.
                void await this.capabilityEntries(scratch, signal);
                const detailEntries = await this.capabilityEntries(details, signal);
                let total = 0;
                for (const entry of detailEntries) {
                    signal?.throwIfAborted();
                    const match = entry.name.match(DETAIL_FILE);
                    if (!match || entry.type !== 'file')
                        throw unsafe(this.options.runsRoot, `unsafe detail entry ${entry.name}`);
                    const identity = entry.identity ?? (details.fileInfo === undefined ? undefined : await details.fileInfo(entry.name, signal));
                    if (!isSafeCapabilityIdentity(identity))
                        throw new BoundedFileError(`descriptor-rooted detail metadata for "${entry.name}" is unavailable`, 'WORKFLOW_STORAGE_UNSUPPORTED');
                    total += Number(identity.size);
                    if (total > this.options.maxRunDetailsBytes)
                        throw new BoundedFileError(`run ${runDirectory} details exceed ${this.options.maxRunDetailsBytes} bytes`, 'WORKFLOW_STORAGE_LIMIT');
                    const bytes = await details.readBytes(entry.name, signal, this.options.maxRunDetailsBytes);
                    await details.assertIdentity(signal);
                    const file = join(this.options.runsRoot, 'runs', runDirectory, 'details', entry.name);
                    const snapshot = decodeWorkflowRunDetails(bytes, file, detailLimits(this.options));
                    if (snapshot.runDirectory !== runDirectory || snapshot.detailId !== match[1])
                        throw unsafe(this.options.runsRoot, `detail ${entry.name} identity does not match run ${runDirectory}`);
                    const key = `${runDirectory}/${match[1]}`;
                    if (inventory.details.has(key))
                        throw unsafe(this.options.runsRoot, `detail ${match[1]} is duplicated`);
                    inventory.details.set(key, snapshot);
                    inventory.detailDigests.set(key, { bytes: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex') });
                }
            }
            finally {
                await details.close().catch(() => undefined);
                await scratch.close().catch(() => undefined);
            }
        }
        finally {
            await run.close().catch(() => undefined);
        }
    }
    /** Complete, read-only recovery validation.  Nothing is cached or removed
     * until this method has checked every category, manifest, run, and detail
     * sidecar. */
    async validateRecoveryInventory(signal) {
        const count = { value: 0 };
        const details = new Map();
        const detailDigests = new Map();
        const manifests = [];
        const runDirectories = new Set();
        let bytes = 0;
        if (this.layout === undefined) {
            for (const category of STORAGE_CATEGORIES) {
                const categoryPath = join(this.options.runsRoot, category);
                for (const name of (await readdir(categoryPath)).sort()) {
                    assertSafeComponent(name, 'storage entry');
                    const topInfo = await lstat(join(categoryPath, name));
                    if (!topInfo.isDirectory() || topInfo.isSymbolicLink())
                        throw unsafe(this.options.runsRoot, `${category} entry ${name} is not a directory`);
                    // The top-level address/transaction/run component is itself part of
                    // the shared recovery budget.
                    bytes += await inspectLocalTree(join(categoryPath, name), this.options.runsRoot, this.options.maxRecoveryEntries, count, this.options.maxRunStoreBytes, signal);
                    if (category === 'sessions' && !SESSION_ADDRESS.test(name))
                        throw unsafe(this.options.runsRoot, `invalid Session directory ${name}`);
                    if ((category === 'runs' || category === 'staging' || category === 'quarantine') && !COMPONENT32.test(name))
                        throw unsafe(this.options.runsRoot, `invalid ${category} entry ${name}`);
                }
            }
            const sessionNames = (await readdir(join(this.options.runsRoot, 'sessions'))).sort();
            for (const address of sessionNames) {
                const directory = join(this.options.runsRoot, 'sessions', address);
                const children = (await readdir(directory)).sort();
                if (children.length !== 1 || children[0] !== 'manifest.json')
                    throw unsafe(this.options.runsRoot, `Session directory ${address} has an unexpected layout`);
                const path = join(directory, 'manifest.json');
                await ownerFile(path, this.options.maxManifestBytes);
                const manifest = decodeWorkflowSessionManifest(await readBoundedUtf8(path, this.options.maxManifestBytes), path, this.options.maxManifestBytes);
                if (sessionAddress(manifest.sessionId) !== address)
                    throw unsafe(this.options.runsRoot, `Session directory ${address} does not match its manifest identity`);
                manifests.push(manifest);
            }
            for (const runDirectory of (await readdir(join(this.options.runsRoot, 'runs'))).sort()) {
                runDirectories.add(runDirectory);
                await this.validateLocalRunInventory(runDirectory, { details, detailDigests });
            }
        }
        else {
            for (const category of STORAGE_CATEGORIES) {
                bytes += await inspectCapabilityTree(this.layout[category], this.options.runsRoot, this.options.maxRecoveryEntries, count, this.options.maxRunStoreBytes, signal);
            }
            const sessionEntries = await this.capabilityEntries(this.layout.sessions, signal);
            for (const entry of sessionEntries) {
                if (entry.type !== 'directory' || !SESSION_ADDRESS.test(entry.name))
                    throw unsafe(this.options.runsRoot, `invalid Session directory ${entry.name}`);
                const directory = await this.layout.sessions.openDirectory(entry.name, signal, { create: false });
                try {
                    const children = await this.capabilityEntries(directory, signal);
                    if (children.length !== 1 || children[0].name !== 'manifest.json' || children[0].type !== 'file')
                        throw unsafe(this.options.runsRoot, `Session directory ${entry.name} has an unexpected layout`);
                    const manifestBytes = await directory.readBytes('manifest.json', signal, this.options.maxManifestBytes);
                    await directory.assertIdentity(signal);
                    const path = join(this.options.runsRoot, 'sessions', entry.name, 'manifest.json');
                    const manifest = decodeWorkflowSessionManifest(manifestBytes, path, this.options.maxManifestBytes);
                    if (sessionAddress(manifest.sessionId) !== entry.name)
                        throw unsafe(this.options.runsRoot, `Session directory ${entry.name} does not match its manifest identity`);
                    manifests.push(manifest);
                }
                finally {
                    await directory.close().catch(() => undefined);
                }
            }
            const runEntries = await this.capabilityEntries(this.layout.runs, signal);
            for (const entry of runEntries) {
                if (entry.type !== 'directory' || !COMPONENT32.test(entry.name))
                    throw unsafe(this.options.runsRoot, `invalid run entry ${entry.name}`);
                runDirectories.add(entry.name);
                await this.validateCapabilityRunInventory(entry.name, { details, detailDigests }, signal);
            }
            for (const category of ['staging', 'quarantine']) {
                for (const entry of await this.capabilityEntries(this.layout[category], signal)) {
                    if (!COMPONENT32.test(entry.name))
                        throw unsafe(this.options.runsRoot, `invalid ${category} entry ${entry.name}`);
                }
            }
        }
        const referenced = new Set();
        const referencedDetails = new Set();
        for (const manifest of manifests) {
            for (const head of manifest.heads) {
                if (!runDirectories.has(head.runDirectory))
                    throw unsafe(this.options.runsRoot, `run directory ${head.runDirectory} is missing`);
                if (referenced.has(head.runDirectory))
                    throw unsafe(this.options.runsRoot, `run directory ${head.runDirectory} is referenced more than once`);
                referenced.add(head.runDirectory);
                const key = `${head.runDirectory}/${head.detail.id}`;
                const detail = details.get(key);
                if (detail === undefined)
                    throw unsafe(this.options.runsRoot, `detail ${head.detail.id} is missing`);
                if (referencedDetails.has(key))
                    throw unsafe(this.options.runsRoot, `detail ${head.detail.id} is referenced more than once`);
                referencedDetails.add(key);
                if (detail.sessionId !== manifest.sessionId || detail.runId !== head.runId || detail.runDirectory !== head.runDirectory || detail.detailId !== head.detail.id || detail.snapshotRevision !== head.detail.snapshotRevision) {
                    throw unsafe(this.options.runsRoot, `detail ${head.detail.id} identity does not match its manifest head`);
                }
                const digest = detailDigests.get(key);
                if (digest === undefined || digest.bytes !== head.detail.bytes || digest.sha256 !== head.detail.sha256) {
                    throw unsafe(this.options.runsRoot, `detail ${head.detail.id} digest or byte count does not match its manifest head`);
                }
            }
        }
        if (count.value > this.options.maxRecoveryEntries)
            throw recoveryLimitError(this.options.runsRoot, this.options.maxRecoveryEntries);
        return { entries: count.value, bytes, manifests, runDirectories, details, detailDigests };
    }
    /** Remove only residue whose complete identity/shape was validated by the
     * preflight.  A referenced run is retained; only its superseded immutable
     * detail snapshots are removed. */
    async reconcileRecoveryResidue(inventory, signal) {
        const referencedRuns = new Set();
        const referencedDetails = new Set();
        for (const manifest of inventory.manifests)
            for (const head of manifest.heads) {
                referencedRuns.add(head.runDirectory);
                referencedDetails.add(`${head.runDirectory}/${head.detail.id}`);
            }
        if (this.layout === undefined) {
            for (const runDirectory of [...inventory.runDirectories].sort()) {
                signal?.throwIfAborted();
                if (!referencedRuns.has(runDirectory)) {
                    await this.quarantineThenRemove('runs', runDirectory, signal);
                    continue;
                }
                const detailsPath = join(this.runPath(runDirectory), 'details');
                for (const name of (await readdir(detailsPath)).sort()) {
                    const match = name.match(DETAIL_FILE);
                    if (!match)
                        throw unsafe(this.options.runsRoot, `unsafe detail entry ${name}`);
                    if (referencedDetails.has(`${runDirectory}/${match[1]}`))
                        continue;
                    const path = join(detailsPath, name);
                    const before = await lstat(path);
                    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1)
                        throw unsafe(this.options.runsRoot, `unsafe detail entry ${name}`);
                    const current = await lstat(path);
                    if (!sameLocalIdentity(before, current))
                        throw unsafe(this.options.runsRoot, `detail ${name} identity changed during recovery`);
                    await unlink(path);
                }
            }
            for (const name of (await readdir(join(this.options.runsRoot, 'staging'))).sort()) {
                assertSafeComponent(name, 'storage entry');
                await this.quarantineThenRemove('staging', name, signal);
            }
            for (const name of (await readdir(join(this.options.runsRoot, 'quarantine'))).sort()) {
                assertSafeComponent(name, 'storage entry');
                await safeRemoveTree(join(this.options.runsRoot, 'quarantine', name));
            }
            return;
        }
        for (const runDirectory of [...inventory.runDirectories].sort()) {
            signal?.throwIfAborted();
            if (!referencedRuns.has(runDirectory)) {
                await this.quarantineThenRemove('runs', runDirectory, signal);
                continue;
            }
            const run = await this.layout.runs.openDirectory(runDirectory, signal, { create: false });
            try {
                const details = await run.openDirectory('details', signal, { create: false });
                try {
                    for (const entry of await this.capabilityEntries(details, signal)) {
                        const match = entry.name.match(DETAIL_FILE);
                        if (!match)
                            throw unsafe(this.options.runsRoot, `unsafe detail entry ${entry.name}`);
                        if (!referencedDetails.has(`${runDirectory}/${match[1]}`))
                            await this.removeCapabilityFile(['runs', runDirectory, 'details'], entry.name, signal);
                    }
                }
                finally {
                    await details.close().catch(() => undefined);
                }
            }
            finally {
                await run.close().catch(() => undefined);
            }
        }
        for (const entry of await this.capabilityEntries(this.layout.staging, signal)) {
            if (entry.type !== 'directory')
                throw unsafe(this.options.runsRoot, `staging entry ${entry.name} is not a directory`);
            await this.quarantineThenRemove('staging', entry.name, signal);
        }
        for (const entry of await this.capabilityEntries(this.layout.quarantine, signal)) {
            if (entry.type !== 'directory')
                throw unsafe(this.options.runsRoot, `quarantine entry ${entry.name} is not a directory`);
            await this.removeCapabilityTree('quarantine', entry.name, signal);
        }
    }
    async initializeUnlocked(signal) {
        await this.guard(signal);
        if (this.initialized)
            return this.recovered;
        if (this.layout === undefined) {
            await ownerDirectory(this.options.runsRoot, true);
            for (const category of STORAGE_CATEGORIES)
                await ownerDirectory(join(this.options.runsRoot, category), true);
        }
        else {
            await this.layout.root.assertIdentity(signal);
            for (const category of STORAGE_CATEGORIES)
                await this.layout[category].assertIdentity(signal);
        }
        // This is the only read-only preflight.  It inventories all four
        // categories, decodes every manifest/detail (including orphan residue),
        // and validates every retained identity before the first row mutation.
        const inventory = await this.validateRecoveryInventory(signal);
        await this.reconcileRecoveryResidue(inventory, signal);
        // Install the validated immutable observations only after preflight and
        // residue validation have succeeded.  A malformed later Session can no
        // longer leave an earlier Session visible through this store instance.
        this.sessions.clear();
        this.details.clear();
        for (const manifest of inventory.manifests)
            this.sessions.set(manifest.sessionId, clone(manifest));
        for (const manifest of inventory.manifests)
            for (const head of manifest.heads) {
                const snapshot = inventory.details.get(`${head.runDirectory}/${head.detail.id}`);
                if (snapshot !== undefined)
                    this.details.set(head.runId, clone(snapshot));
            }
        // Enforce the whole-store cap on the validated, residue-free state before
        // recovery can add replacement snapshots.  This also handles stores that
        // were already over a lowered operator limit at process start.
        await this.enforceGlobalLimit(signal);
        const plans = [];
        const recoveryTime = now();
        for (const manifest of [...this.sessions.values()].sort((left, right) => left.sessionId.localeCompare(right.sessionId))) {
            const heads = [];
            const replacements = [];
            for (const original of manifest.heads) {
                let head = original;
                if (ACTIVE.has(original.status)) {
                    const detail = inventory.details.get(`${original.runDirectory}/${original.detail.id}`);
                    if (detail === undefined)
                        throw unsafe(this.options.runsRoot, `detail ${original.detail.id} is missing during recovery planning`);
                    const payload = {
                        ...detail.payload,
                        members: (detail.payload.members ?? []).map(member => member.status === 'running'
                            ? { ...member, status: 'cancelled', outcome: member.outcome === 'pending' ? 'not-produced' : member.outcome, settledAt: recoveryTime }
                            : member),
                    };
                    const replacement = { ...detail, detailId: id(), snapshotRevision: detail.snapshotRevision + 1, payload };
                    const detailBytes = encodeWorkflowRunDetails(replacement, detailLimits(this.options));
                    replacements.push({ old: original, snapshot: replacement, bytes: detailBytes });
                    head = durableHead({
                        ...original,
                        status: 'interrupted', stopReason: 'interrupted', error: 'Process exited before workflow settlement.', settledAt: recoveryTime,
                        executionAvailable: false, saveAvailable: false, allowedActions: [], revision: original.revision + 1,
                        detail: { id: replacement.detailId, bytes: detailBytes.byteLength, sha256: createHash('sha256').update(detailBytes).digest('hex'), snapshotRevision: replacement.snapshotRevision },
                        detailRevision: replacement.snapshotRevision, membersRevision: original.membersRevision + 1,
                        completionNotice: { state: 'abandoned', finalizedAt: recoveryTime, reason: 'process-lost' },
                    });
                }
                else if (original.completionNotice.state === 'claimed') {
                    head = durableHead({ ...original, revision: original.revision + 1, completionNotice: { ...original.completionNotice, state: 'abandoned', finalizedAt: recoveryTime, reason: 'process-lost' } });
                }
                heads.push(head);
            }
            plans.push({ manifest, heads, replacements });
        }
        const recoveredRuns = [];
        for (const plan of plans) {
            signal?.throwIfAborted();
            for (const replacement of plan.replacements) {
                const text = new TextDecoder().decode(replacement.bytes);
                if (this.layout !== undefined)
                    await this.writeCapabilityFile(['runs', replacement.old.runDirectory, 'details'], `${replacement.snapshot.detailId}.json`, text, this.options.maxRunDetailsBytes, true, signal);
                else
                    await writeBoundedAtomic(join(this.runPath(replacement.old.runDirectory), 'details', `${replacement.snapshot.detailId}.json`), text, { maxBytes: this.options.maxRunDetailsBytes, createOnly: true });
            }
            if (plan.heads.some((head, index) => head !== plan.manifest.heads[index])) {
                await this.persist({ ...plan.manifest, revision: plan.manifest.revision + 1, heads: plan.heads });
            }
            for (const replacement of plan.replacements) {
                this.details.set(replacement.old.runId, clone(replacement.snapshot));
                // The manifest now points at the replacement.  Remove the old file
                // only after that durable commit; a failure leaves harmless residue
                // for the next bounded recovery pass rather than a dangling reference.
                await this.removeCapabilityFile(['runs', replacement.old.runDirectory, 'details'], `${replacement.old.detail.id}.json`, signal).catch(error => {
                    if (!isNotFound(error))
                        throw error;
                });
            }
            for (const head of plan.heads) {
                if (head.status === 'interrupted') {
                    recoveredRuns.push({ ...head, executionAvailable: false, sessionId: plan.manifest.sessionId });
                }
            }
        }
        await this.enforceGlobalLimit(signal);
        this.initialized = true;
        this.recovered = recoveredRuns;
        return this.recovered;
    }
    async initialize(signal) { return this.mutate(() => this.initializeUnlocked(signal)); }
    async ensureInitialized(signal) { if (!this.initialized)
        await this.initializeUnlocked(signal); }
    async evictForSession(manifest, extra) {
        let current = manifest;
        while (current.heads.length + extra > this.options.maxRetainedRunsPerSession) {
            const victim = current.heads.filter(head => terminal(head.status) && (head.completionNotice.state === 'delivered' || head.completionNotice.state === 'abandoned')).sort((a, b) => (a.settledAt ?? 0) - (b.settledAt ?? 0) || a.startedAt - b.startedAt || a.runId.localeCompare(b.runId))[0];
            if (!victim)
                throw new BoundedFileError(`workflow Session "${manifest.sessionId}" cannot retain another run`, 'WORKFLOW_STORAGE_LIMIT');
            current = { ...current, revision: current.revision + 1, heads: current.heads.filter(head => head.runId !== victim.runId) };
            await this.persist(current);
            await this.removeRunTree(victim.runDirectory).catch(error => { if (error.code !== 'ENOENT')
                throw error; });
            this.details.delete(victim.runId);
        }
        return current;
    }
    async enforceGlobalLimit(signal) {
        let bytes = await this.committedBytes(signal);
        while (bytes > this.options.maxRunStoreBytes) {
            signal?.throwIfAborted();
            const victim = [...this.sessions.values()].flatMap(manifest => manifest.heads.filter(head => terminal(head.status) && (head.completionNotice.state === 'delivered' || head.completionNotice.state === 'abandoned')).map(head => ({ manifest, head }))).sort((a, b) => (a.head.settledAt ?? 0) - (b.head.settledAt ?? 0) || a.head.startedAt - b.head.startedAt || a.head.runId.localeCompare(b.head.runId))[0];
            if (!victim)
                throw new BoundedFileError(`workflow run store exceeds the ${this.options.maxRunStoreBytes}-byte limit`, 'WORKFLOW_STORAGE_LIMIT');
            await this.persist({ ...victim.manifest, revision: victim.manifest.revision + 1, heads: victim.manifest.heads.filter(head => head.runId !== victim.head.runId) });
            await this.removeRunTree(victim.head.runDirectory, signal);
            this.details.delete(victim.head.runId);
            bytes = await this.committedBytes(signal);
        }
    }
    /**
     * Make the *next* insert fit before its run directory or manifest row is
     * published.  The old implementation enforced the root cap only after the
     * durable callback, which could report an admitted run and then reject the
     * insertion.  This preflight keeps the durable linearization point honest:
     * eligible terminal rows are evicted in the same deterministic order as
     * normal retention, and an impossible insert fails while it is still in
     * staging.
     */
    async preflightTransactionCapacity(previous, candidate, initialFileBytes, signal) {
        if (!Number.isSafeInteger(initialFileBytes) || initialFileBytes < 0) {
            throw new BoundedFileError('workflow initial publication size is invalid', 'WORKFLOW_STORAGE_UNSUPPORTED');
        }
        let next = candidate;
        for (;;) {
            signal?.throwIfAborted();
            const currentBytes = await this.committedBytes(signal);
            const nextBytes = encodeWorkflowSessionManifest(next, this.options.maxManifestBytes).byteLength;
            /*
             * The candidate is an insertion, not a replacement: the currently
             * published manifest remains in place while the new run is staged and
             * while the atomic manifest writer holds its temporary file.  Charge
             * that peak, rather than only the eventual post-rename total.  This is
             * deliberately conservative for a new Session as well and means a
             * caller never receives the durable callback for an insertion which
             * could only fit after a transient quota breach.
             */
            const projectedPeak = currentBytes + initialFileBytes + nextBytes;
            if (projectedPeak <= this.options.maxRunStoreBytes)
                return next;
            const victim = [...this.sessions.values()]
                .flatMap(manifest => manifest.heads
                .filter(head => terminal(head.status) && (head.completionNotice.state === 'delivered' || head.completionNotice.state === 'abandoned'))
                .map(head => ({ manifest, head })))
                .sort((left, right) => (left.head.settledAt ?? 0) - (right.head.settledAt ?? 0)
                || left.head.startedAt - right.head.startedAt
                || left.head.runId.localeCompare(right.head.runId))[0];
            if (victim === undefined) {
                throw new BoundedFileError(`workflow run store exceeds the ${this.options.maxRunStoreBytes}-byte limit`, 'WORKFLOW_STORAGE_LIMIT');
            }
            const reduced = {
                ...victim.manifest,
                revision: victim.manifest.revision + 1,
                heads: victim.manifest.heads.filter(head => head.runId !== victim.head.runId),
            };
            await this.persist(reduced);
            await this.removeRunTree(victim.head.runDirectory, signal);
            this.details.delete(victim.head.runId);
            if (victim.manifest.sessionId === previous.sessionId) {
                previous = reduced;
                next = {
                    ...next,
                    // The eviction manifest was committed first.  The insertion is the
                    // next Session transaction and therefore must advance once more.
                    revision: reduced.revision + 1,
                    heads: next.heads.filter(head => head.runId !== victim.head.runId),
                };
            }
        }
    }
    async insertWithNextDisplayName(request, create, signal) {
        return this.mutate(async () => {
            await this.guard(signal);
            await this.ensureInitialized(signal);
            if (!isWorkflowDefinitionName(request.name))
                throw new BoundedFileError(`invalid workflow name "${request.name}"`, 'WORKFLOW_STORAGE_CORRUPT');
            const scriptBytes = encoder.encode(request.script);
            if (scriptBytes.byteLength > 1_048_576)
                throw new BoundedFileError('workflow script exceeds 1048576 bytes', 'WORKFLOW_STORAGE_LIMIT');
            let manifest = await this.load(request.sessionId);
            const ordinalEntry = manifest.ordinals.find(item => item.name === request.name);
            if (!ordinalEntry && manifest.ordinals.length >= this.options.maxWorkflowNamesPerSession)
                throw new BoundedFileError(`workflow Session has reached the ${this.options.maxWorkflowNamesPerSession}-name limit`, 'WORKFLOW_STORAGE_LIMIT');
            manifest = await this.evictForSession(manifest, 1);
            const { ordinal, displayName } = allocateDisplayIdentity(manifest, request.name);
            const numberedHandle = ordinal !== 1;
            const runDirectory = id();
            const identity = { displayName, numberedHandle, runDirectory };
            const draft = create(identity);
            const detailId = id();
            const detail = { version: 2, sessionId: request.sessionId, runId: request.runId, runDirectory, detailId, snapshotRevision: 1, payload: compactWorkflowRunDetails(draft.detail, detailLimits(this.options)) };
            const detailBytes = encodeWorkflowRunDetails(detail, detailLimits(this.options));
            const head = durableHead({ ...draft.head, runId: request.runId, name: request.name, displayName, numberedHandle, runDirectory, revision: 1, detail: { id: detailId, bytes: detailBytes.byteLength, sha256: createHash('sha256').update(detailBytes).digest('hex'), snapshotRevision: 1 }, detailRevision: 1, completionNotice: { state: 'none' }, executionAvailable: true });
            const ordinals = ordinalEntry ? manifest.ordinals.map(item => item.name === request.name ? { ...item, next: Math.max(item.next, ordinal + 1) } : item) : [...manifest.ordinals, { name: request.name, next: ordinal + 1 }];
            const candidate = {
                ...manifest,
                revision: manifest.revision + 1,
                nextOrdinal: Math.max(manifest.nextOrdinal + 1, ordinal + 1),
                ordinals,
                heads: [...manifest.heads, head],
            };
            /*
             * Admission happens before creating a staging directory.  In
             * particular, a global-quota rejection must not leave a published run
             * directory behind and must not invoke onDurable.  preflight may evict
             * eligible retained rows, but it returns the manifest revision that the
             * initial insert must commit.
             */
            const fitting = await this.preflightTransactionCapacity(manifest, candidate, scriptBytes.byteLength + detailBytes.byteLength, signal);
            const stageId = id();
            const stage = join(this.options.runsRoot, 'staging', stageId);
            const run = this.runPath(runDirectory);
            try {
                if (this.layout !== undefined) {
                    const stageDirectory = await this.layout.staging.openDirectory(stageId, signal, { create: true });
                    const scratchDirectory = await stageDirectory.openDirectory('scratch', signal, { create: true });
                    const detailsDirectory = await stageDirectory.openDirectory('details', signal, { create: true });
                    try {
                        await stageDirectory.writeText('script.js', request.script, { kind: 'createIfAbsent' }, signal);
                        await detailsDirectory.writeText(`${detailId}.json`, new TextDecoder().decode(detailBytes), { kind: 'createIfAbsent' }, signal);
                    }
                    finally {
                        await detailsDirectory.close().catch(() => undefined);
                        await scratchDirectory.close().catch(() => undefined);
                        await stageDirectory.close().catch(() => undefined);
                    }
                    await this.layout.staging.assertIdentity(signal);
                    await this.layout.runs.assertIdentity(signal);
                }
                else {
                    await ownerDirectory(stage, true);
                    await ownerDirectory(join(stage, 'scratch'), true);
                    await ownerDirectory(join(stage, 'details'), true);
                    await writeBoundedAtomic(join(stage, 'script.js'), request.script, { maxBytes: 1_048_576, createOnly: true });
                    await writeBoundedAtomic(join(stage, 'details', `${detailId}.json`), new TextDecoder().decode(detailBytes), { maxBytes: this.options.maxRunDetailsBytes, createOnly: true });
                }
                if (this.layout !== undefined) {
                    // A Host capability must provide an atomic descriptor-rooted
                    // publication primitive.  Never fall back to `rename(stage, run)`
                    // once descriptor-backed Host storage is active.
                    if (this.layout.staging.publishDirectory === undefined) {
                        throw new BoundedFileError('descriptor-rooted workflow directory publication is unavailable', 'WORKFLOW_STORAGE_UNSUPPORTED');
                    }
                    await this.layout.staging.publishDirectory(stageId, this.layout.runs, runDirectory, signal);
                    await this.layout.staging.assertIdentity(signal);
                    await this.layout.runs.assertIdentity(signal);
                }
                else {
                    await rename(stage, run);
                }
                await this.persist(fitting);
                const published = exposedHead(head, this.options.runsRoot);
                // This is the durable linearization point.  Invoke the supervisor's
                // callback before global accounting or any promise return so caller
                // cancellation can no longer own the admitted run.
                this.details.set(request.runId, detail);
                request.onDurable?.(published);
                return published;
            }
            catch (error) {
                if (this.layout !== undefined) {
                    await this.removeStagingTree(stageId).catch(() => undefined);
                    // The run may have been published before a later manifest/accounting
                    // failure.  Remove it only through the retained capability and only
                    // when it is not referenced by the committed Session head.
                    const current = this.sessions.get(request.sessionId);
                    if (!current?.heads.some(candidate => candidate.runId === request.runId))
                        await this.removeRunTree(runDirectory).catch(() => undefined);
                }
                else {
                    await safeRemoveTree(stage).catch(() => undefined);
                    await safeRemoveTree(run).catch(() => undefined);
                }
                throw error;
            }
        });
    }
    async commitRun(request, signal) {
        return this.mutate(async () => {
            await this.guard(signal);
            await this.ensureInitialized(signal);
            const manifest = await this.load(request.sessionId);
            const index = manifest.heads.findIndex(head => head.runId === request.runId);
            if (index < 0)
                throw new BoundedFileError('workflow run not found', 'WORKFLOW_RUN_NOT_FOUND');
            const old = manifest.heads[index];
            if (old.revision !== request.expectedRevision)
                throw new BoundedFileError('workflow run changed; refresh it before applying a control', 'WORKFLOW_STALE_REVISION');
            if (terminal(request.head.status))
                throw new BoundedFileError('terminal updates must claim a completion notice', 'WORKFLOW_STORAGE_CORRUPT');
            let reference = old.detail;
            let replacement;
            let replacementBytes;
            if (request.detail !== undefined) {
                replacement = { version: 2, sessionId: request.sessionId, runId: request.runId, runDirectory: old.runDirectory, detailId: id(), snapshotRevision: old.detailRevision + 1, payload: compactWorkflowRunDetails(request.detail, detailLimits(this.options)) };
                replacementBytes = encodeWorkflowRunDetails(replacement, detailLimits(this.options));
                reference = { id: replacement.detailId, bytes: replacementBytes.byteLength, sha256: createHash('sha256').update(replacementBytes).digest('hex'), snapshotRevision: replacement.snapshotRevision };
            }
            const head = durableHead({ ...request.head, runId: old.runId, name: old.name, displayName: old.displayName, numberedHandle: old.numberedHandle, runDirectory: old.runDirectory, revision: old.revision + 1, detail: reference, detailRevision: reference.snapshotRevision, completionNotice: old.completionNotice });
            const candidate = { ...manifest, revision: manifest.revision + 1, heads: manifest.heads.toSpliced(index, 1, head) };
            const fitting = await this.preflightTransactionCapacity(manifest, candidate, replacementBytes?.byteLength ?? 0, signal);
            let replacementWritten = false;
            try {
                if (replacement !== undefined && replacementBytes !== undefined) {
                    if (this.layout !== undefined)
                        await this.writeCapabilityFile(['runs', old.runDirectory, 'details'], `${replacement.detailId}.json`, new TextDecoder().decode(replacementBytes), this.options.maxRunDetailsBytes, true);
                    else
                        await writeBoundedAtomic(join(this.runPath(old.runDirectory), 'details', `${replacement.detailId}.json`), new TextDecoder().decode(replacementBytes), { maxBytes: this.options.maxRunDetailsBytes, createOnly: true });
                    replacementWritten = true;
                }
                await this.persist(fitting);
            }
            catch (error) {
                if (replacementWritten && replacement !== undefined)
                    await this.removeCapabilityFile(['runs', old.runDirectory, 'details'], `${replacement.detailId}.json`).catch(() => undefined);
                throw error;
            }
            if (replacement !== undefined) {
                this.details.set(request.runId, replacement);
                await this.removeCapabilityFile(['runs', old.runDirectory, 'details'], `${old.detail.id}.json`).catch(() => undefined);
            }
            await this.enforceGlobalLimit(signal);
            return exposedHead(head, this.options.runsRoot);
        });
    }
    async commitTerminalAndClaimNotice(request, signal) {
        return this.mutate(async () => {
            await this.guard(signal);
            await this.ensureInitialized(signal);
            const manifest = await this.load(request.sessionId);
            const index = manifest.heads.findIndex(head => head.runId === request.runId);
            if (index < 0)
                throw new BoundedFileError('workflow run not found', 'WORKFLOW_RUN_NOT_FOUND');
            const old = manifest.heads[index];
            if (old.revision !== request.expectedRevision)
                throw new BoundedFileError('workflow run changed; refresh it before applying a control', 'WORKFLOW_STALE_REVISION');
            if (!terminal(request.head.status))
                throw new BoundedFileError('terminal commit requires a terminal status', 'WORKFLOW_STORAGE_CORRUPT');
            let reference = old.detail;
            let replacement;
            let replacementBytes;
            if (request.detail !== undefined) {
                replacement = {
                    version: 2,
                    sessionId: request.sessionId,
                    runId: request.runId,
                    runDirectory: old.runDirectory,
                    detailId: id(),
                    snapshotRevision: old.detailRevision + 1,
                    payload: compactWorkflowRunDetails(request.detail, detailLimits(this.options)),
                };
                replacementBytes = encodeWorkflowRunDetails(replacement, detailLimits(this.options));
                reference = {
                    id: replacement.detailId,
                    bytes: replacementBytes.byteLength,
                    sha256: createHash('sha256').update(replacementBytes).digest('hex'),
                    snapshotRevision: replacement.snapshotRevision,
                };
            }
            const head = durableHead({
                ...request.head,
                runId: old.runId,
                name: old.name,
                displayName: old.displayName,
                numberedHandle: old.numberedHandle,
                runDirectory: old.runDirectory,
                revision: old.revision + 1,
                detail: reference,
                detailRevision: reference.snapshotRevision,
                completionNotice: { state: 'claimed', claimId: id(), processEpoch: id(), claimedAt: now() },
            });
            const candidate = { ...manifest, revision: manifest.revision + 1, heads: manifest.heads.toSpliced(index, 1, head) };
            const fitting = await this.preflightTransactionCapacity(manifest, candidate, replacementBytes?.byteLength ?? 0, signal);
            let replacementWritten = false;
            try {
                if (replacement !== undefined && replacementBytes !== undefined) {
                    if (this.layout !== undefined)
                        await this.writeCapabilityFile(['runs', old.runDirectory, 'details'], `${replacement.detailId}.json`, new TextDecoder().decode(replacementBytes), this.options.maxRunDetailsBytes, true);
                    else
                        await writeBoundedAtomic(join(this.runPath(old.runDirectory), 'details', `${replacement.detailId}.json`), new TextDecoder().decode(replacementBytes), { maxBytes: this.options.maxRunDetailsBytes, createOnly: true });
                    replacementWritten = true;
                }
                await this.persist(fitting);
            }
            catch (error) {
                if (replacementWritten && replacement !== undefined) {
                    await this.removeCapabilityFile(['runs', old.runDirectory, 'details'], `${replacement.detailId}.json`).catch(() => undefined);
                }
                throw error;
            }
            if (replacement !== undefined) {
                this.details.set(request.runId, replacement);
                await this.removeCapabilityFile(['runs', old.runDirectory, 'details'], `${old.detail.id}.json`).catch(() => undefined);
            }
            await this.enforceGlobalLimit(signal);
            return exposedHead(head, this.options.runsRoot);
        });
    }
    async finalizeCompletionNotice(sessionId, runId, expectedRevision, finalization, signal) {
        return this.mutate(async () => {
            await this.guard(signal);
            await this.ensureInitialized(signal);
            const manifest = await this.load(sessionId);
            const index = manifest.heads.findIndex(head => head.runId === runId);
            if (index < 0)
                throw new BoundedFileError('workflow run not found', 'WORKFLOW_RUN_NOT_FOUND');
            const old = manifest.heads[index];
            if (old.revision !== expectedRevision)
                throw new BoundedFileError('workflow run changed; refresh it before applying a control', 'WORKFLOW_STALE_REVISION');
            if (old.completionNotice.state !== 'claimed')
                throw new BoundedFileError('completion notice is not claimable', 'WORKFLOW_STORAGE_CORRUPT');
            if (finalization.claimId !== old.completionNotice.claimId || finalization.processEpoch !== old.completionNotice.processEpoch || finalization.claimedAt !== old.completionNotice.claimedAt || finalization.finalizedAt < finalization.claimedAt)
                throw new BoundedFileError('completion notice claim does not match its owner', 'WORKFLOW_STALE_REVISION');
            const head = durableHead({ ...old, revision: old.revision + 1, completionNotice: finalization });
            const candidate = { ...manifest, revision: manifest.revision + 1, heads: manifest.heads.toSpliced(index, 1, head) };
            const fitting = await this.preflightTransactionCapacity(manifest, candidate, 0, signal);
            await this.persist(fitting);
            await this.enforceGlobalLimit(signal);
            return exposedHead(head, this.options.runsRoot);
        });
    }
    async readSession(sessionId, signal) {
        return this.mutate(async () => { await this.guard(signal); await this.ensureInitialized(signal); return (await this.load(sessionId)).heads.map(head => clone(exposedHead(head, this.options.runsRoot))); });
    }
    async readDetails(runId, request, signal) {
        return this.mutate(async () => {
            await this.guard(signal);
            await this.ensureInitialized(signal);
            let found;
            for (const manifest of this.sessions.values()) {
                const head = manifest.heads.find(item => item.runId === runId);
                if (head) {
                    found = { head, sessionId: manifest.sessionId };
                    break;
                }
            }
            if (!found)
                throw new BoundedFileError('workflow run details not found', 'WORKFLOW_RUN_NOT_FOUND');
            const snapshot = await this.readDetail(found.head, found.sessionId);
            const payload = snapshot.payload;
            const raw = request.kind === 'members' ? payload.members ?? []
                : request.kind === 'logs' ? payload.logs ?? []
                    : request.kind === 'result' ? payload.result ?? { state: 'not-produced' }
                        : request.kind === 'phases' ? payload.phases ?? []
                            : request.kind === 'artifacts' ? payload.artifacts ?? []
                                : (payload.artifacts ?? []).find((item) => item.name === request.name) ?? null;
            const collection = Array.isArray(raw);
            let start = 0;
            if (request.cursor !== undefined) {
                if (!/^\d+$/u.test(request.cursor))
                    throw new BoundedFileError('workflow detail cursor is invalid', 'WORKFLOW_STORAGE_CORRUPT');
                start = Number(request.cursor);
                if (!Number.isSafeInteger(start) || start < 0 || (collection && start > raw.length))
                    throw new BoundedFileError('workflow detail cursor is invalid', 'WORKFLOW_STORAGE_CORRUPT');
            }
            const limit = request.limit ?? 200;
            if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200)
                throw new BoundedFileError('workflow detail page limit is invalid', 'WORKFLOW_STORAGE_LIMIT');
            const value = Array.isArray(raw) ? raw.slice(start, start + limit) : raw;
            const total = Array.isArray(raw) ? raw.length : raw === null ? 0 : 1;
            const omitted = request.kind === 'logs' && Array.isArray(raw) && raw.length > 0
                ? Math.max(0, Number(raw[0]?.index) || 0)
                : 0;
            return {
                value: clone(value),
                revision: snapshot.snapshotRevision,
                total,
                ...(omitted > 0 ? { omitted } : {}),
                ...(Array.isArray(raw) && start + limit < raw.length ? { nextCursor: String(start + limit) } : {}),
            };
        });
    }
    async dispose() { if (this.disposed)
        return; await this.mutationTail; this.disposed = true; this.sessions.clear(); this.details.clear(); }
}
//# sourceMappingURL=manifest-store.js.map