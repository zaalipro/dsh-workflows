import { constants } from 'node:fs';
import { lstat, mkdir, open, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { BoundedFileError, assertSafeComponent } from './bounded-file.js';
const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;
const decoder = new TextDecoder('utf-8', { fatal: true });
const encoder = new TextEncoder();
function checkName(name) {
    if (!NAME.test(name) || name === '.' || name === '..' || name.includes('/') || name.includes('\\')) {
        throw new BoundedFileError(`scratch name "${name}" is invalid`, 'WORKFLOW_STORAGE_UNSAFE');
    }
    return name;
}
function errorCode(error) {
    return typeof error === 'object' && error !== null && 'code' in error
        ? String(error.code)
        : undefined;
}
/** Only explicit filesystem absence codes are allowed to become an
 * `undefined` scratch read.  Message matching is intentionally forbidden:
 * provider identity/permission failures often contain the words "not found"
 * and must remain fatal. */
function isNotFound(error) {
    const code = errorCode(error);
    return code === 'ENOENT' || code === 'FS_NOT_FOUND';
}
function hasStableIdentity(identity) {
    if (identity === undefined || !Number.isSafeInteger(Number(identity.size)) || Number(identity.size) < 0)
        return false;
    if (identity.nlink !== undefined && identity.nlink !== 1)
        return false;
    const posix = Number.isSafeInteger(Number(identity.dev)) && Number.isSafeInteger(Number(identity.ino))
        && !Number.isNaN(Number(identity.dev)) && !Number.isNaN(Number(identity.ino));
    return posix || identity.version !== undefined;
}
function assertLimits(limits) {
    for (const [name, value] of Object.entries(limits)) {
        if (!Number.isSafeInteger(value) || value < 1)
            throw new RangeError(`${name} must be a positive safe integer`);
    }
    if (limits.maxPendingOperations > limits.maxOperations)
        throw new RangeError('maxPendingOperations must not exceed maxOperations');
    if (limits.maxFileBytes > limits.maxTotalBytes)
        throw new RangeError('maxFileBytes must not exceed maxTotalBytes');
}
/** Run-scoped scratch authority with operation, pending, file, and byte quotas. */
export class RunScratchStore {
    limits;
    operations = 0;
    pending = 0;
    closed = false;
    initialized = false;
    files = new Map();
    total = 0;
    tail = Promise.resolve();
    inflight = new Set();
    lifetime = new AbortController();
    directory;
    path;
    constructor(directoryOrPath, limits) {
        this.limits = limits;
        assertLimits(limits);
        if (typeof directoryOrPath === 'string')
            this.path = directoryOrPath;
        else {
            this.directory = directoryOrPath;
            this.path = directoryOrPath.path;
        }
    }
    signal(signal) {
        return signal === undefined ? this.lifetime.signal : AbortSignal.any([signal, this.lifetime.signal]);
    }
    /** Wait for a fixed point.  A single snapshot of `inflight` is not enough:
     * a queued write can settle the same turn that a read's finally-handler is
     * removing itself.  Rechecking the tail, set, and counter prevents list or
     * disposal from inventorying/closing while an admitted operation is still
     * capable of touching scratch. */
    async drain() {
        for (;;) {
            const tail = this.tail;
            const inflight = [...this.inflight];
            await Promise.allSettled([tail, ...inflight]);
            if (tail === this.tail && this.inflight.size === 0 && this.pending === 0)
                return;
        }
    }
    begin(name, supplied) {
        if (this.closed)
            throw new BoundedFileError('scratch store is disposed');
        checkName(name);
        const signal = this.signal(supplied);
        signal.throwIfAborted();
        if (this.operations >= this.limits.maxOperations)
            throw new BoundedFileError('scratch operation quota exceeded', 'WORKFLOW_STORAGE_LIMIT');
        if (this.pending >= this.limits.maxPendingOperations)
            throw new BoundedFileError('scratch pending-operation quota exceeded', 'WORKFLOW_STORAGE_LIMIT');
        this.operations += 1;
        this.pending += 1;
        return signal;
    }
    track(operation) {
        this.inflight.add(operation);
        void operation.finally(() => { this.inflight.delete(operation); this.pending -= 1; }).catch(() => undefined);
        return operation;
    }
    async ensureDirectory(signal) {
        signal.throwIfAborted();
        if (this.directory !== undefined) {
            await this.directory.assertIdentity(signal);
            return this.directory;
        }
        await mkdir(this.path, { recursive: true, mode: 0o700 });
        return undefined;
    }
    async inventory(signal) {
        if (this.initialized)
            return;
        const directory = await this.ensureDirectory(signal);
        const entries = directory?.listEntries !== undefined
            ? await directory.listEntries(signal)
            : (await readdir(this.path)).sort().map(name => ({ name, type: 'file' }));
        if (entries.length > this.limits.maxFiles)
            throw new BoundedFileError('scratch file quota exceeded', 'WORKFLOW_STORAGE_LIMIT');
        let total = 0;
        for (const entry of entries) {
            const name = entry.name;
            checkName(name);
            if (entry.type !== 'file' || entry.identity?.nlink !== undefined && entry.identity.nlink !== 1) {
                throw new BoundedFileError(`workflow storage path "${join(this.path, name)}" is unsafe: scratch entry is not a regular file`, 'WORKFLOW_STORAGE_UNSAFE');
            }
            let identity = entry.identity;
            if (identity === undefined && directory !== undefined) {
                if (directory.fileInfo === undefined)
                    throw new BoundedFileError('descriptor-rooted scratch metadata is unavailable', 'WORKFLOW_STORAGE_UNSUPPORTED');
                identity = await directory.fileInfo(name, signal);
            }
            if (directory !== undefined && !hasStableIdentity(identity)) {
                throw new BoundedFileError(`descriptor-rooted scratch metadata for "${name}" is unavailable`, 'WORKFLOW_STORAGE_UNSUPPORTED');
            }
            const size = identity?.size ?? (await lstat(join(this.path, name))).size;
            if (!Number.isSafeInteger(Number(size)) || Number(size) < 0)
                throw new BoundedFileError('scratch file metadata is invalid', 'WORKFLOW_STORAGE_UNSUPPORTED');
            if (size > this.limits.maxFileBytes)
                throw new BoundedFileError('scratch file exceeds per-file quota', 'WORKFLOW_STORAGE_LIMIT');
            total += size;
            if (total > this.limits.maxTotalBytes)
                throw new BoundedFileError('scratch total quota exceeded', 'WORKFLOW_STORAGE_LIMIT');
            this.files.set(name, size);
        }
        this.total = total;
        this.initialized = true;
    }
    async read(name, supplied) {
        const signal = this.begin(name, supplied);
        const operation = (async () => {
            await this.inventory(signal);
            const directory = await this.ensureDirectory(signal);
            try {
                let bytes;
                if (directory !== undefined)
                    bytes = await directory.readBytes(name, signal, this.limits.maxFileBytes);
                else {
                    if (process.platform === 'win32' || !constants.O_NOFOLLOW)
                        throw new BoundedFileError(`safe workflow storage is unavailable on ${process.platform}`, 'WORKFLOW_STORAGE_UNSUPPORTED');
                    const handle = await open(join(this.path, name), constants.O_RDONLY | constants.O_NOFOLLOW);
                    try {
                        const info = await handle.stat();
                        if (!info.isFile() || info.nlink !== 1 || info.size > this.limits.maxFileBytes)
                            throw new BoundedFileError('scratch file is unsafe or oversized', 'WORKFLOW_STORAGE_UNSAFE');
                        bytes = new Uint8Array(await handle.readFile());
                    }
                    finally {
                        await handle.close();
                    }
                }
                signal.throwIfAborted();
                return decoder.decode(bytes);
            }
            catch (error) {
                if (isNotFound(error))
                    return undefined;
                throw error;
            }
        })();
        return this.track(operation);
    }
    async write(name, content, supplied) {
        const signal = this.begin(name, supplied);
        const operation = this.tail.then(async () => {
            await this.inventory(signal);
            const bytes = encoder.encode(content);
            if (bytes.byteLength > this.limits.maxFileBytes)
                throw new BoundedFileError('scratch file exceeds per-file quota', 'WORKFLOW_STORAGE_LIMIT');
            const previous = this.files.get(name) ?? 0;
            if (!this.files.has(name) && this.files.size >= this.limits.maxFiles)
                throw new BoundedFileError('scratch file quota exceeded', 'WORKFLOW_STORAGE_LIMIT');
            const nextTotal = this.total - previous + bytes.byteLength;
            if (nextTotal > this.limits.maxTotalBytes)
                throw new BoundedFileError('scratch total quota exceeded', 'WORKFLOW_STORAGE_LIMIT');
            const directory = await this.ensureDirectory(signal);
            if (directory === undefined)
                throw new BoundedFileError('descriptor-rooted scratch publication is unavailable', 'WORKFLOW_STORAGE_UNSUPPORTED');
            let expected;
            if (this.files.has(name)) {
                let info;
                if (directory.fileInfo !== undefined)
                    info = await directory.fileInfo(name, signal);
                else
                    throw new BoundedFileError('descriptor-rooted scratch metadata is unavailable', 'WORKFLOW_STORAGE_UNSUPPORTED');
                if (!hasStableIdentity(info))
                    throw new BoundedFileError('scratch destination changed', 'WORKFLOW_STORAGE_UNSAFE');
                expected = { kind: 'replaceIfVersion', version: info };
            }
            else
                expected = { kind: 'createIfAbsent' };
            await directory.writeText(name, content, expected, signal);
            await directory.assertIdentity(signal);
            this.files.set(name, bytes.byteLength);
            this.total = nextTotal;
        });
        this.tail = operation.catch(() => undefined);
        return this.track(operation);
    }
    async list(supplied) {
        if (this.closed)
            throw new BoundedFileError('scratch store is disposed');
        const signal = this.signal(supplied);
        supplied?.throwIfAborted();
        await this.drain();
        await this.inventory(signal);
        signal.throwIfAborted();
        return [...this.files.keys()].sort();
    }
    cancel(reason = new Error('scratch operation cancelled')) {
        if (!this.lifetime.signal.aborted)
            this.lifetime.abort(reason);
    }
    async dispose() {
        if (this.closed)
            return;
        this.closed = true;
        this.cancel(new Error('scratch store disposed'));
        await this.drain();
        let first;
        try {
            await this.directory?.close();
        }
        catch (error) {
            first = error;
        }
        this.directory = undefined;
        if (first !== undefined)
            throw first;
    }
}
/** Own the run-directory parent for as long as a scratch capability is live.
 * A child PrivateDirectory retains its parent descriptor, but the parent must
 * also receive the caller's close request so its descriptor is eventually
 * released after the child drains. */
class RetainedScratchStore {
    inner;
    parent;
    disposed = false;
    constructor(inner, parent) {
        this.inner = inner;
        this.parent = parent;
    }
    read(name, signal) { return this.inner.read(name, signal); }
    write(name, content, signal) { return this.inner.write(name, content, signal); }
    list(signal) { return this.inner.list(signal); }
    cancel(reason) { this.inner.cancel?.(reason); }
    async dispose() {
        if (this.disposed)
            return;
        this.disposed = true;
        let first;
        try {
            await this.inner.dispose();
        }
        catch (error) {
            first = error;
        }
        try {
            await this.parent.close();
        }
        catch (error) {
            first ??= error;
        }
        if (first !== undefined)
            throw first;
    }
}
/** Open the scratch component of one already-published run directory. */
export async function openRunScratch(layout, runDirectory, limits) {
    assertSafeComponent(runDirectory, 'run directory');
    await layout.lease.assertCurrent();
    const run = await layout.runs.openDirectory(runDirectory);
    let transferred = false;
    try {
        const scratch = await run.openDirectory('scratch');
        const result = new RetainedScratchStore(new RunScratchStore(scratch, limits), run);
        transferred = true;
        return result;
    }
    finally {
        if (!transferred)
            await run.close();
    }
}
/** Create an immutable projection and descriptor-rooted run scratch authority. */
export async function createRunFiles(layout, runDirectory, scriptBytes, limits) {
    assertSafeComponent(runDirectory, 'run directory');
    const maxScriptBytes = limits.maxScriptBytes ?? 1_048_576;
    if (scriptBytes.byteLength > maxScriptBytes)
        throw new BoundedFileError('workflow script exceeds configured limit', 'WORKFLOW_STORAGE_LIMIT');
    await layout.lease.assertCurrent();
    const run = await layout.runs.openDirectory(runDirectory, undefined, { create: true });
    let transferred = false;
    try {
        await run.writeText('script.js', decoder.decode(scriptBytes), { kind: 'createIfAbsent' });
        const scratchDirectory = await run.openDirectory('scratch', undefined, { create: true });
        const details = await run.openDirectory('details', undefined, { create: true });
        await details.close();
        const scratch = new RetainedScratchStore(new RunScratchStore(scratchDirectory, limits), run);
        transferred = true;
        let disposed = false;
        return {
            runDirectory,
            scriptPath: join(layout.runs.path, runDirectory, 'script.js'),
            script: new Uint8Array(scriptBytes),
            scratch,
            detailsPath: join(layout.runs.path, runDirectory, 'details'),
            async dispose() { if (disposed)
                return; disposed = true; await scratch.dispose(); },
        };
    }
    finally {
        if (!transferred)
            await run.close();
    }
}
/** Derive a run directory from an exposed script projection without leaking it to the engine. */
export function scratchDirectoryFromScriptPath(scriptPath) {
    return dirname(scriptPath);
}
//# sourceMappingURL=run-files.js.map