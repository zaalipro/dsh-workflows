import { constants } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { chmod, link, lstat, mkdir, open, readdir, realpath, rename, rmdir, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, join, parse } from 'node:path';
import { BoundedFileError, assertSafeComponent } from './bounded-file.js';
/** Close every layout descriptor, retaining the first failure. */
export async function closeWorkflowStorageLayout(layout) {
    let first;
    // Close children before the lease.  The order is deliberately stable so a
    // teardown cannot race a still-open descriptor while the root is released.
    for (const directory of [layout.sessions, layout.runs, layout.staging, layout.quarantine]) {
        try {
            await directory.close();
        }
        catch (error) {
            first ??= error;
        }
    }
    try {
        await layout.root.close();
    }
    catch (error) {
        first ??= error;
    }
    if (first !== undefined)
        throw first;
}
const O_DIRECTORY = constants.O_DIRECTORY ?? 0;
const O_NOFOLLOW = constants.O_NOFOLLOW;
const encoder = new TextEncoder();
function failUnsupported() {
    throw new BoundedFileError(`safe workflow storage is unavailable on ${process.platform}`, 'WORKFLOW_STORAGE_UNSUPPORTED');
}
function unsupportedCapability(detail) {
    return new BoundedFileError(`descriptor-rooted workflow storage ${detail} is unavailable`, 'WORKFLOW_STORAGE_UNSUPPORTED');
}
/** Refuse malformed or incomplete Host capabilities before the package creates
 * any category directory.  A structural cast is not a security boundary: all
 * required descriptor operations must be callable at runtime. */
function assertHostDirectoryDelegate(value) {
    if (typeof value !== 'object' || value === null)
        throw unsupportedCapability('directory capability');
    for (const member of ['openDirectory', 'readBytes', 'writeText', 'assertIdentity', 'close']) {
        if (typeof value[member] !== 'function')
            throw unsupportedCapability(`directory ${member}`);
    }
}
function assertHostStorageCapabilities(provider, root) {
    const canList = typeof root.listEntries === 'function'
        || typeof provider.listDir === 'function' && root.target !== undefined;
    if (!canList)
        throw unsupportedCapability('directory listing');
    if (typeof root.fileInfo !== 'function' && !(root.target !== undefined && typeof provider.fileInfoChild === 'function'))
        throw unsupportedCapability('file metadata');
    if (typeof root.publishDirectory !== 'function' && !(root.target !== undefined && typeof provider.publishDirectory === 'function'))
        throw unsupportedCapability('directory publication');
    if (typeof root.removeFile !== 'function' && !(root.target !== undefined && typeof provider.removeFile === 'function'))
        throw unsupportedCapability('file removal');
    if (typeof root.removeDirectory !== 'function' && !(root.target !== undefined && typeof provider.removeDirectory === 'function'))
        throw unsupportedCapability('directory removal');
}
function component(name) {
    return assertSafeComponent(name, 'private path component');
}
function ownerOk(info) {
    return typeof process.getuid !== 'function' || info.uid === process.getuid();
}
function assertDirectoryInfo(info, path, allowSystemRoot = false) {
    if (!info.isDirectory() || info.nlink < 1 || (!allowSystemRoot && !ownerOk(info)) || (!allowSystemRoot && (info.mode & 0o777) !== 0o700)) {
        throw new BoundedFileError(`workflow storage path "${path}" is unsafe: expected owner-only directory`, 'WORKFLOW_STORAGE_UNSAFE');
    }
}
function assertAncestorDirectoryInfo(info, path) {
    if (!info.isDirectory() || info.nlink < 1) {
        throw new BoundedFileError(`workflow storage path "${path}" is unsafe: expected directory`, 'WORKFLOW_STORAGE_UNSAFE');
    }
}
function assertFileInfo(info, path) {
    if (!info.isFile() || info.nlink !== 1 || !ownerOk(info) || (info.mode & 0o777) !== 0o600) {
        throw new BoundedFileError(`workflow storage path "${path}" is unsafe: expected owner-only regular file`, 'WORKFLOW_STORAGE_UNSAFE');
    }
}
function identityOf(info) {
    return {
        dev: Number(info.dev), ino: Number(info.ino), size: Number(info.size),
        mtimeMs: Number(info.mtimeMs), ctimeMs: Number(info.ctimeMs), mode: Number(info.mode & 0o777),
        nlink: Number(info.nlink), ...(info.uid === undefined ? {} : { uid: Number(info.uid) }),
    };
}
function sameIdentity(a, b, content = false) {
    if (Number(a.dev) !== Number(b.dev) || Number(a.ino) !== Number(b.ino))
        return false;
    if (!content)
        return true;
    return Number(a.size) === Number(b.size)
        && Number(a.mtimeMs) === Number(b.mtimeMs)
        && Number(a.ctimeMs) === Number(b.ctimeMs)
        && Number(a.mode) === Number(b.mode)
        && Number(a.nlink) === Number(b.nlink);
}
/** A retained directory descriptor. Relative operations revalidate its identity. */
class LocalPrivateDirectory {
    path;
    handle;
    identity;
    parent;
    systemRoot;
    strict;
    closed = false;
    handleClosed = false;
    children = new Set();
    closePromise;
    constructor(path, handle, identity, parent, systemRoot = false, strict = true) {
        this.path = path;
        this.handle = handle;
        this.identity = identity;
        this.parent = parent;
        this.systemRoot = systemRoot;
        this.strict = strict;
        parent?.children.add(this);
    }
    ensureOpen(signal) {
        if (this.closed)
            throw new BoundedFileError('private directory is closed');
        signal?.throwIfAborted();
    }
    /** Check this descriptor and all retained ancestors without requiring them
     * to remain open for new operations.  A child capability keeps its parent
     * object alive, so closing a parent merely releases the caller's reference;
     * the descriptor is closed after the last child releases it. */
    async assertRetainedIdentity(signal) {
        signal?.throwIfAborted();
        if (this.handleClosed)
            throw new BoundedFileError('private directory is closed', 'WORKFLOW_STORAGE_UNSAFE');
        const retained = await this.handle.stat();
        const current = await lstat(this.path);
        if (!retained.isDirectory() || !current.isDirectory() || !sameIdentity(retained, current)
            || retained.dev !== this.identity.dev || retained.ino !== this.identity.ino) {
            throw new BoundedFileError(`workflow storage path "${this.path}" is unsafe: directory identity changed`, 'WORKFLOW_STORAGE_UNSAFE');
        }
        if (this.strict)
            assertDirectoryInfo(current, this.path, this.systemRoot);
        else
            assertAncestorDirectoryInfo(current, this.path);
        if (this.parent !== undefined)
            await this.parent.assertRetainedIdentity(signal);
    }
    async assertIdentity(signal) {
        this.ensureOpen(signal);
        await this.assertRetainedIdentity(signal);
    }
    async openDirectory(name, signal, options = { create: false }) {
        component(name);
        this.ensureOpen(signal);
        await this.assertIdentity(signal);
        if (O_NOFOLLOW === undefined || O_NOFOLLOW === 0 || process.platform === 'win32')
            failUnsupported();
        const childPath = join(this.path, name);
        let created = false;
        try {
            const existing = await lstat(childPath);
            if (existing.isSymbolicLink() || !existing.isDirectory()) {
                throw new BoundedFileError(`workflow storage path "${childPath}" is unsafe: expected directory`, 'WORKFLOW_STORAGE_UNSAFE');
            }
            assertDirectoryInfo(existing, childPath);
        }
        catch (error) {
            if (error.code !== 'ENOENT' || options.create === false)
                throw error;
            await mkdir(childPath, { mode: 0o700 });
            created = true;
        }
        try {
            await chmod(childPath, 0o700);
            const childHandle = await open(childPath, constants.O_RDONLY | O_DIRECTORY | O_NOFOLLOW);
            const childInfo = await childHandle.stat();
            assertDirectoryInfo(childInfo, childPath);
            const pathInfo = await lstat(childPath);
            if (!sameIdentity(childInfo, pathInfo))
                throw new BoundedFileError(`workflow storage path "${childPath}" is unsafe: identity changed`, 'WORKFLOW_STORAGE_UNSAFE');
            await this.assertRetainedIdentity(signal);
            return new LocalPrivateDirectory(childPath, childHandle, { dev: Number(childInfo.dev), ino: Number(childInfo.ino) }, this);
        }
        catch (error) {
            if (created) {
                // Remove only the directory just created; never recursively remove. A
                // failed identity check leaves pre-existing data untouched.
                await import('node:fs/promises').then(fs => fs.rmdir(childPath)).catch(() => undefined);
            }
            throw error;
        }
    }
    async listEntries(signal) {
        this.ensureOpen(signal);
        await this.assertRetainedIdentity(signal);
        const entries = await readdir(this.path, { withFileTypes: true });
        const result = [];
        for (const entry of entries.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0)) {
            signal?.throwIfAborted();
            component(entry.name);
            const info = await lstat(join(this.path, entry.name));
            const type = info.isSymbolicLink() ? 'symlink' : info.isDirectory() ? 'directory' : info.isFile() ? 'file' : 'other';
            result.push({ name: entry.name, type, ...(type === 'file' || type === 'directory' ? { identity: identityOf(info) } : {}) });
        }
        await this.assertRetainedIdentity(signal);
        return result;
    }
    async fileInfo(name, signal) {
        component(name);
        this.ensureOpen(signal);
        await this.assertRetainedIdentity(signal);
        try {
            const info = await lstat(join(this.path, name));
            if (info.isSymbolicLink())
                throw new BoundedFileError(`workflow storage path "${join(this.path, name)}" is unsafe: symbolic link`, 'WORKFLOW_STORAGE_UNSAFE');
            await this.assertRetainedIdentity(signal);
            return identityOf(info);
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                // An ENOENT is not proof of absence when the retained directory may
                // have been replaced concurrently.  Revalidate before returning the
                // negative observation so callers never turn an ancestor swap into a
                // guarded create.
                await this.assertRetainedIdentity(signal);
                return undefined;
            }
            throw error;
        }
    }
    async removeFile(name, expected, signal) {
        component(name);
        this.ensureOpen(signal);
        await this.assertRetainedIdentity(signal);
        const target = join(this.path, name);
        const before = await lstat(target);
        if (before.isSymbolicLink() || !before.isFile())
            throw new BoundedFileError(`workflow storage path "${target}" is unsafe: destination is not a regular file`, 'WORKFLOW_STORAGE_UNSAFE');
        assertFileInfo(before, target);
        if (expected !== undefined && !sameVersion(expected, before))
            throw new BoundedFileError(`private file "${name}" has changed`, 'WORKFLOW_STALE_REVISION');
        await unlink(target);
        await this.assertRetainedIdentity(signal);
    }
    async removeDirectory(name, expected, signal) {
        component(name);
        this.ensureOpen(signal);
        await this.assertRetainedIdentity(signal);
        const target = join(this.path, name);
        const before = await lstat(target);
        if (!before.isDirectory() || before.isSymbolicLink() || before.nlink < 1)
            throw new BoundedFileError(`workflow storage path "${target}" is unsafe: destination is not an empty directory`, 'WORKFLOW_STORAGE_UNSAFE');
        if (expected !== undefined && !sameVersion(expected, before))
            throw new BoundedFileError(`private directory "${name}" has changed`, 'WORKFLOW_STALE_REVISION');
        try {
            await rmdir(target);
        }
        catch (error) {
            if (error.code === 'ENOTEMPTY')
                throw new BoundedFileError(`private directory "${name}" is not empty`, 'WORKFLOW_STORAGE_UNSAFE', { cause: error });
            throw error;
        }
        await this.assertRetainedIdentity(signal);
    }
    async publishDirectory(name, target, targetName, signal) {
        component(name);
        component(targetName);
        this.ensureOpen(signal);
        await this.assertRetainedIdentity(signal);
        await target.assertIdentity(signal);
        if (!(target instanceof LocalPrivateDirectory))
            throw new BoundedFileError('private directory publication providers do not match', 'WORKFLOW_STORAGE_UNSUPPORTED');
        const sourcePath = join(this.path, name);
        const destinationPath = join(target.path, targetName);
        const source = await lstat(sourcePath);
        if (!source.isDirectory() || source.isSymbolicLink())
            throw new BoundedFileError(`workflow storage path "${sourcePath}" is unsafe: staging entry is not a directory`, 'WORKFLOW_STORAGE_UNSAFE');
        const destination = await lstat(destinationPath).catch(error => error.code === 'ENOENT' ? undefined : Promise.reject(error));
        if (destination !== undefined)
            throw new BoundedFileError(`workflow storage path "${destinationPath}" already exists`, 'WORKFLOW_STORAGE_UNSAFE');
        signal?.throwIfAborted();
        await rename(sourcePath, destinationPath);
        await this.assertRetainedIdentity(signal);
        await target.assertIdentity(signal);
    }
    async readBytes(name, signal, maxBytes) {
        component(name);
        if (!Number.isSafeInteger(maxBytes) || maxBytes < 0)
            throw new RangeError('maxBytes must be a non-negative safe integer');
        this.ensureOpen(signal);
        await this.assertIdentity(signal);
        if (O_NOFOLLOW === undefined || O_NOFOLLOW === 0 || process.platform === 'win32')
            failUnsupported();
        const filePath = join(this.path, name);
        const file = await open(filePath, constants.O_RDONLY | O_NOFOLLOW);
        try {
            signal?.throwIfAborted();
            const info = await file.stat();
            assertFileInfo(info, filePath);
            if (info.size > maxBytes)
                throw new BoundedFileError(`workflow storage file "${filePath}" exceeds ${maxBytes} bytes`, 'WORKFLOW_STORAGE_LIMIT');
            const chunks = [];
            let total = 0;
            while (total <= maxBytes) {
                signal?.throwIfAborted();
                const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, maxBytes - total + 1));
                const { bytesRead } = await file.read(chunk, 0, chunk.length, null);
                if (bytesRead === 0)
                    break;
                total += bytesRead;
                if (total > maxBytes)
                    throw new BoundedFileError(`workflow storage file "${filePath}" exceeds ${maxBytes} bytes`, 'WORKFLOW_STORAGE_LIMIT');
                chunks.push(chunk.subarray(0, bytesRead));
            }
            const after = await file.stat();
            if (!sameIdentity(info, after, true))
                throw new BoundedFileError(`workflow storage file "${filePath}" changed while reading`, 'WORKFLOW_STORAGE_UNSAFE');
            return new Uint8Array(Buffer.concat(chunks, total));
        }
        finally {
            await file.close();
            await this.assertIdentity(signal);
        }
    }
    async writeText(name, content, expected, signal) {
        component(name);
        this.ensureOpen(signal);
        await this.assertIdentity(signal);
        if (expected.kind !== 'createIfAbsent' && expected.kind !== 'replaceIfVersion')
            throw new BoundedFileError('unguarded private write');
        const target = join(this.path, name);
        let before;
        try {
            before = await lstat(target);
            if (before.isSymbolicLink() || !before.isFile())
                throw new BoundedFileError(`workflow storage path "${target}" is unsafe: destination is not a regular file`, 'WORKFLOW_STORAGE_UNSAFE');
            assertFileInfo(before, target);
        }
        catch (error) {
            if (error.code !== 'ENOENT')
                throw error;
        }
        if (expected.kind === 'createIfAbsent' && before !== undefined)
            throw new BoundedFileError(`private file "${name}" already exists`, 'WORKFLOW_STORAGE_UNSAFE');
        if (expected.kind === 'replaceIfVersion' && !before)
            throw new BoundedFileError(`private file "${name}" does not exist`, 'WORKFLOW_STALE_REVISION');
        if (expected.kind === 'replaceIfVersion' && expected.version !== undefined) {
            const candidate = expected.version;
            if (typeof candidate !== 'object' || candidate === null || !sameVersion(candidate, before)) {
                throw new BoundedFileError(`private file "${name}" has changed`, 'WORKFLOW_STALE_REVISION');
            }
        }
        signal?.throwIfAborted();
        const temp = join(this.path, `.${name}.${randomBytes(16).toString('hex')}.tmp`);
        const bytes = encoder.encode(content);
        let tempHandle;
        try {
            tempHandle = await open(temp, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | O_NOFOLLOW, 0o600);
            let offset = 0;
            while (offset < bytes.byteLength) {
                const written = await tempHandle.write(bytes, offset, bytes.byteLength - offset, offset);
                if (written.bytesWritten <= 0)
                    throw new BoundedFileError(`workflow storage file "${temp}" was short-written`, 'WORKFLOW_STORAGE_UNSAFE');
                offset += written.bytesWritten;
            }
            await tempHandle.sync();
            await tempHandle.close();
            tempHandle = undefined;
            await this.assertIdentity(signal);
            const latest = await lstat(target).catch(error => {
                if (error.code === 'ENOENT')
                    return undefined;
                throw error;
            });
            if (expected.kind === 'createIfAbsent' && latest !== undefined)
                throw new BoundedFileError(`private file "${name}" already exists`, 'WORKFLOW_STORAGE_UNSAFE');
            if (expected.kind === 'replaceIfVersion' && (!latest || (before && !sameIdentity(before, latest, true))))
                throw new BoundedFileError(`private file "${name}" has changed`, 'WORKFLOW_STALE_REVISION');
            if (expected.kind === 'createIfAbsent') {
                // `link` is the POSIX no-replace publication primitive. It fails with
                // EEXIST instead of overwriting a destination created after our check.
                try {
                    await link(temp, target);
                }
                catch (error) {
                    if (error.code === 'EEXIST') {
                        throw new BoundedFileError(`private file "${name}" already exists`, 'WORKFLOW_STORAGE_UNSAFE', { cause: error });
                    }
                    throw error;
                }
                await unlink(temp);
            }
            else {
                await rename(temp, target);
            }
            const after = await lstat(target);
            assertFileInfo(after, target);
            const parent = await open(this.path, constants.O_RDONLY | O_DIRECTORY);
            try {
                await parent.sync();
            }
            finally {
                await parent.close();
            }
            await this.assertRetainedIdentity(signal);
            return { operation: expected.kind, version: identityOf(after), before: before ? identityOf(before) : null, after: content };
        }
        finally {
            await tempHandle?.close().catch(() => undefined);
            await unlink(temp).catch(() => undefined);
        }
    }
    async close() {
        if (this.closePromise !== undefined)
            return this.closePromise;
        this.closed = true;
        this.closePromise = new Promise((resolve, reject) => {
            this.closeWaiters.push({ resolve, reject });
            void this.closeWhenUnreferenced();
        });
        return this.closePromise;
    }
    closeWaiters = [];
    async closeWhenUnreferenced() {
        if (!this.handleClosed && this.children.size === 0) {
            this.handleClosed = true;
            let error;
            try {
                await this.handle.close();
            }
            catch (cause) {
                error = cause;
            }
            this.parent?.children.delete(this);
            // A child keeps its ancestor descriptor alive, but does not implicitly
            // close an ancestor that the caller still owns.  If the parent was
            // explicitly closed while this child was retained, complete that
            // deferred close now.
            if (this.parent?.closed)
                await this.parent.closeWhenUnreferenced();
            for (const waiter of this.closeWaiters.splice(0))
                error === undefined ? waiter.resolve() : waiter.reject(error);
        }
    }
}
/** Adapter for the official H descriptor capability.  No operation below
 * opens a path with Node; the path is retained only for diagnostics and for
 * the provider's own `openPrivateDirectory` bootstrap seam. */
class HostPrivateDirectory {
    path;
    provider;
    delegate;
    closed = false;
    constructor(path, provider, delegate) {
        this.path = path;
        this.provider = provider;
        this.delegate = delegate;
        assertHostDirectoryDelegate(delegate);
    }
    ensure(signal) {
        if (this.closed)
            throw new BoundedFileError('private directory is closed', 'WORKFLOW_STORAGE_UNSAFE');
        signal?.throwIfAborted();
    }
    async openDirectory(name, signal, options = {}) {
        component(name);
        this.ensure(signal);
        await this.delegate.assertIdentity(signal);
        try {
            const child = await this.delegate.openDirectory(name, signal, options);
            assertHostDirectoryDelegate(child);
            await this.delegate.assertIdentity(signal);
            return new HostPrivateDirectory(join(this.path, name), this.provider, child);
        }
        catch (error) {
            // Only the provider's explicit not-found result may enter the create
            // fallback.  Treating an arbitrary delegate failure (including an
            // identity/link failure) as absence would silently reopen a mutable path
            // and defeat the descriptor guarantee.
            const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
            const missing = code === 'ENOENT' || code === 'FS_NOT_FOUND';
            if (options.create !== true || !missing)
                throw error;
            await this.delegate.assertIdentity(signal);
            let child;
            if (this.delegate.target !== undefined && typeof this.provider.openPrivateDirectoryChild === 'function') {
                child = await this.provider.openPrivateDirectoryChild(this.delegate.target, name, { create: true }, signal);
            }
            else if (this.provider.allowLegacyPathFallback === true) {
                // This path-shaped adapter is retained only for explicitly marked
                // pre-H test fixtures.  A real Host provider must expose an opaque
                // child primitive; never infer fixture status from the shape of a
                // target or silently reopen a lexical path after an absent result.
                child = await this.provider.openPrivateDirectory(join(this.path, name), { create: true }, signal);
            }
            else {
                throw unsupportedCapability('relative child creation');
            }
            try {
                assertHostDirectoryDelegate(child);
                await this.delegate.assertIdentity(signal);
                return new HostPrivateDirectory(join(this.path, name), this.provider, child);
            }
            catch (creationError) {
                if (typeof child.close === 'function')
                    await child.close().catch(() => undefined);
                throw creationError;
            }
        }
    }
    async listEntries(signal) {
        this.ensure(signal);
        await this.delegate.assertIdentity(signal);
        const direct = this.delegate.listEntries;
        const list = this.provider.listDir;
        let entries;
        if (direct !== undefined)
            entries = await direct.call(this.delegate, signal);
        else if (list !== undefined && this.delegate.target !== undefined) {
            // The retained opaque target is consumed directly; no lexical path is
            // resolved or reopened here.
            entries = await list(this.delegate.target, signal);
        }
        else
            throw new BoundedFileError('descriptor-rooted directory listing is unavailable', 'WORKFLOW_STORAGE_UNSUPPORTED');
        const result = [];
        for (const entry of entries) {
            signal?.throwIfAborted();
            component(entry.name);
            const type = entry.type === 'file' ? 'file' : entry.type === 'directory' ? 'directory' : entry.type === 'symlink' ? 'symlink' : 'other';
            // Provider versions are opaque.  Do not manufacture dev/ino values for
            // H entries: a zero identity is indistinguishable from a real identity
            // and would turn an unverified cleanup into a false capability claim.
            // A provider version is opaque metadata, not a POSIX dev/ino pair.  Do
            // not manufacture NaN/zero fields and present them as an identity: the
            // caller must obtain a real guarded fileInfo observation (or fail
            // closed) before it can read, account, or remove the entry.
            const hasPosixIdentity = Number.isSafeInteger(Number(entry.dev))
                && Number.isSafeInteger(Number(entry.ino))
                && Number.isSafeInteger(Number(entry.size))
                && Number(entry.size) >= 0;
            result.push({ name: entry.name, type, ...(hasPosixIdentity ? {
                    identity: {
                        dev: Number(entry.dev), ino: Number(entry.ino), size: Number(entry.size),
                        mtimeMs: Number(entry.mtimeMs ?? 0), ctimeMs: Number(entry.ctimeMs ?? 0),
                        mode: Number(entry.mode ?? 0), nlink: Number(entry.nlink ?? 1),
                        ...(entry.version === undefined ? {} : { version: entry.version }),
                    },
                } : {}) });
        }
        await this.delegate.assertIdentity(signal);
        return result;
    }
    async fileInfo(name, signal) {
        component(name);
        this.ensure(signal);
        const direct = this.delegate.fileInfo;
        await this.delegate.assertIdentity(signal);
        if (direct !== undefined) {
            const result = await direct.call(this.delegate, name, signal);
            await this.delegate.assertIdentity(signal);
            return result;
        }
        if (this.delegate.target === undefined || typeof this.provider.fileInfoChild !== 'function')
            throw new BoundedFileError('descriptor-rooted file metadata is unavailable', 'WORKFLOW_STORAGE_UNSUPPORTED');
        const result = await this.provider.fileInfoChild(this.delegate.target, name, signal);
        await this.delegate.assertIdentity(signal);
        return result;
    }
    async removeFile(name, expected, signal) {
        component(name);
        this.ensure(signal);
        const remover = this.delegate.removeFile;
        if (typeof remover === 'function')
            await remover.call(this.delegate, name, expected, signal);
        else if (typeof this.provider.removeFile === 'function' && this.delegate.target !== undefined) {
            await this.provider.removeFile(this.delegate.target, name, expected, signal);
        }
        else
            throw new BoundedFileError('descriptor-rooted file removal is unavailable', 'WORKFLOW_STORAGE_UNSUPPORTED');
        await this.delegate.assertIdentity(signal);
    }
    async removeDirectory(name, expected, signal) {
        component(name);
        this.ensure(signal);
        const remover = this.delegate.removeDirectory;
        if (typeof remover === 'function')
            await remover.call(this.delegate, name, expected, signal);
        else if (typeof this.provider.removeDirectory === 'function' && this.delegate.target !== undefined) {
            await this.provider.removeDirectory(this.delegate.target, name, expected, signal);
        }
        else
            throw new BoundedFileError('descriptor-rooted directory removal is unavailable', 'WORKFLOW_STORAGE_UNSUPPORTED');
        await this.delegate.assertIdentity(signal);
    }
    async publishDirectory(name, target, targetName, signal) {
        component(name);
        component(targetName);
        this.ensure(signal);
        await this.delegate.assertIdentity(signal);
        await target.assertIdentity(signal);
        if (!(target instanceof HostPrivateDirectory))
            throw new BoundedFileError('private directory publication providers do not match', 'WORKFLOW_STORAGE_UNSUPPORTED');
        const direct = this.delegate.publishDirectory;
        if (typeof direct === 'function') {
            await direct.call(this.delegate, name, target.delegate, targetName, signal);
        }
        else if (typeof this.provider.publishDirectory === 'function' && this.delegate.target !== undefined && target.delegate.target !== undefined) {
            await this.provider.publishDirectory(this.delegate.target, name, target.delegate.target, targetName, signal);
        }
        else
            throw new BoundedFileError('descriptor-rooted directory publication is unavailable', 'WORKFLOW_STORAGE_UNSUPPORTED');
        await this.delegate.assertIdentity(signal);
        await target.delegate.assertIdentity(signal);
    }
    async readBytes(name, signal, maxBytes) {
        component(name);
        this.ensure(signal);
        return this.delegate.readBytes(name, signal, maxBytes);
    }
    async writeText(name, content, expected, signal) {
        component(name);
        this.ensure(signal);
        const guarded = expected.kind === 'replaceIfVersion' && expected.version !== undefined
            && typeof expected.version === 'object' && expected.version !== null && 'version' in expected.version
            ? { ...expected, version: expected.version.version }
            : expected;
        const outcome = await this.delegate.writeText(name, content, guarded, signal);
        return outcome;
    }
    async assertIdentity(signal) { this.ensure(signal); await this.delegate.assertIdentity(signal); }
    async close() { if (this.closed)
        return; this.closed = true; await this.delegate.close(); }
}
function sameVersion(candidate, before) {
    const expected = identityOf(before);
    let compared = false;
    // A local guarded write must carry the stable device/inode pair.  Accepting
    // an empty or unrelated object here would turn replaceIfVersion into an
    // unconditional rename.  Host-backed directories do their opaque-version
    // comparison in the provider adapter and do not call this helper.
    for (const key of ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs', 'mode', 'nlink']) {
        if (candidate[key] === undefined)
            continue;
        compared = true;
        const value = Number(candidate[key]);
        if (!Number.isFinite(value) || value !== expected[key])
            return false;
    }
    if (candidate.version !== undefined) {
        compared = true;
        const beforeVersion = before.version;
        if (beforeVersion === undefined || !isSameOpaque(candidate.version, beforeVersion))
            return false;
    }
    return compared && candidate.dev !== undefined && candidate.ino !== undefined;
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
async function canonicalPrivatePath(path) {
    const parsed = parse(path);
    const allowedAliases = process.platform === 'darwin' ? new Set(['/var', '/tmp', '/etc']) : new Set();
    let lexical = parsed.root;
    for (const part of path.slice(parsed.root.length).split(/[\\/]+/u).filter(Boolean)) {
        lexical = join(lexical, part);
        try {
            const entry = await lstat(lexical);
            if (entry.isSymbolicLink() && !allowedAliases.has(lexical))
                throw new BoundedFileError(`workflow storage path "${path}" is unsafe: ancestor "${lexical}" is a symbolic link`, 'WORKFLOW_STORAGE_UNSAFE');
        }
        catch (error) {
            if (error.code === 'ENOENT')
                break;
            throw error;
        }
    }
    let current = path;
    const missing = [];
    while (true) {
        try {
            const info = await lstat(current);
            if (info.isSymbolicLink() && missing.length === 0)
                throw new BoundedFileError(`workflow storage path "${path}" is unsafe: symbolic-link directory`, 'WORKFLOW_STORAGE_UNSAFE');
            if (!info.isDirectory() && !info.isSymbolicLink() && missing.length > 0)
                throw new BoundedFileError(`workflow storage path "${current}" is unsafe: ancestor is not a directory`, 'WORKFLOW_STORAGE_UNSAFE');
            const resolved = await realpath(current);
            return missing.length === 0 ? resolved : join(resolved, ...missing);
        }
        catch (error) {
            if (error.code !== 'ENOENT')
                throw error;
            const parent = dirname(current);
            if (parent.length === 0 || parent === current || current === parsed.root)
                throw error;
            const componentName = current.slice(parent.length + 1);
            missing.unshift(componentName);
            current = parent;
        }
    }
}
/** Open one owner-only private directory and pin its descriptor identity. */
export async function openPrivateDirectory(path, create = true) {
    if (O_NOFOLLOW === undefined || O_NOFOLLOW === 0 || process.platform === 'win32')
        failUnsupported();
    if (!isAbsolute(path))
        throw new BoundedFileError(`workflow storage path "${path}" is unsafe: path must be absolute`, 'WORKFLOW_STORAGE_UNSAFE');
    const normalized = await canonicalPrivatePath(path.replace(/[\\/]+$/u, '') || parse(path).root);
    const parsed = parse(normalized);
    const parts = normalized.slice(parsed.root.length).split(/[\\/]+/u).filter(Boolean);
    let currentPath = parsed.root;
    let parent;
    let current;
    const opened = [];
    try {
        // Open every ancestor one component at a time.  This retains the full
        // descriptor chain instead of opening a deep path after a string-only
        // lstat walk, which is vulnerable to an ancestor substitution race.
        const rootHandle = await open(parsed.root, constants.O_RDONLY | O_DIRECTORY | O_NOFOLLOW);
        const rootInfo = await rootHandle.stat();
        assertDirectoryInfo(rootInfo, parsed.root, true);
        current = new LocalPrivateDirectory(parsed.root, rootHandle, { dev: Number(rootInfo.dev), ino: Number(rootInfo.ino) }, undefined, true);
        opened.push(current);
        parent = current;
        for (const [partIndex, part] of parts.entries()) {
            const childPath = join(currentPath, part);
            let childInfo;
            try {
                childInfo = await lstat(childPath);
                if (childInfo.isSymbolicLink() || !childInfo.isDirectory())
                    throw new BoundedFileError(`workflow storage path "${childPath}" is unsafe: expected directory`, 'WORKFLOW_STORAGE_UNSAFE');
                if (partIndex === parts.length - 1)
                    assertDirectoryInfo(childInfo, childPath);
                else
                    assertAncestorDirectoryInfo(childInfo, childPath);
            }
            catch (error) {
                if (error.code !== 'ENOENT' || !create)
                    throw error;
                await mkdir(childPath, { mode: 0o700 });
                await chmod(childPath, 0o700);
                childInfo = await lstat(childPath);
                if (partIndex === parts.length - 1)
                    assertDirectoryInfo(childInfo, childPath);
                else
                    assertAncestorDirectoryInfo(childInfo, childPath);
            }
            const childHandle = await open(childPath, constants.O_RDONLY | O_DIRECTORY | O_NOFOLLOW);
            try {
                const retained = await childHandle.stat();
                if (partIndex === parts.length - 1)
                    assertDirectoryInfo(retained, childPath);
                else
                    assertAncestorDirectoryInfo(retained, childPath);
                const pathInfo = await lstat(childPath);
                if (!sameIdentity(retained, pathInfo))
                    throw new BoundedFileError(`workflow storage path "${childPath}" is unsafe: identity changed`, 'WORKFLOW_STORAGE_UNSAFE');
                const previousParent = parent;
                current = new LocalPrivateDirectory(childPath, childHandle, { dev: Number(retained.dev), ino: Number(retained.ino) }, previousParent, false, partIndex === parts.length - 1);
                opened.push(current);
                if (previousParent !== undefined)
                    void previousParent.close();
                parent = current;
                currentPath = childPath;
            }
            catch (error) {
                await childHandle.close().catch(() => undefined);
                throw error;
            }
        }
        return current;
    }
    catch (error) {
        // Close leaf-to-root so each retained ancestor can release immediately.
        for (const directory of opened.reverse())
            await directory.close().catch(() => undefined);
        throw error;
    }
}
export async function openVerifiedRunDirectory(layout, runDirectory) {
    component(runDirectory);
    const directory = await layout.runs.openDirectory(runDirectory);
    return { id: runDirectory, directory, scriptPath: join(layout.runs.path, runDirectory, 'script.js'), assertIdentity: () => directory.assertIdentity() };
}
export async function initializePrivateLayout(anchor, lease, hostFileSystem) {
    await anchor.assertCurrent();
    await lease.assertCurrent();
    if (hostFileSystem !== undefined) {
        if (typeof hostFileSystem.openPrivateDirectory !== 'function')
            failUnsupported();
        const rootDelegate = await hostFileSystem.openPrivateDirectory(anchor.root, { create: false });
        try {
            assertHostDirectoryDelegate(rootDelegate);
            assertHostStorageCapabilities(hostFileSystem, rootDelegate);
            await rootDelegate.assertIdentity();
        }
        catch (error) {
            if (typeof rootDelegate.close === 'function')
                await rootDelegate.close().catch(() => undefined);
            throw error;
        }
        const root = new HostPrivateDirectory(anchor.root, hostFileSystem, rootDelegate);
        const opened = [];
        try {
            // Create/open categories through the retained root capability.  Do not
            // reopen an absolute child path after the anchor has been pinned: that
            // would reintroduce an ancestor substitution window in Host adapters.
            const sessions = await root.openDirectory('sessions', undefined, { create: true });
            opened.push(sessions);
            const runs = await root.openDirectory('runs', undefined, { create: true });
            opened.push(runs);
            const staging = await root.openDirectory('staging', undefined, { create: true });
            opened.push(staging);
            const quarantine = await root.openDirectory('quarantine', undefined, { create: true });
            opened.push(quarantine);
            return { anchor, lease, root, rootDirectory: root, sessions, runs, staging, quarantine };
        }
        catch (error) {
            for (const directory of opened.reverse())
                await directory.close().catch(() => undefined);
            await root.close().catch(() => undefined);
            throw error;
        }
    }
    const root = await openPrivateDirectory(anchor.root, false);
    const opened = [];
    try {
        const sessions = await root.openDirectory('sessions', undefined, { create: true });
        opened.push(sessions);
        const runs = await root.openDirectory('runs', undefined, { create: true });
        opened.push(runs);
        const staging = await root.openDirectory('staging', undefined, { create: true });
        opened.push(staging);
        const quarantine = await root.openDirectory('quarantine', undefined, { create: true });
        opened.push(quarantine);
        // Keep the root capability alive for the lifetime of every child.  The
        // child capabilities also retain this parent, but making it explicit in
        // the layout gives teardown and Host implementations one authoritative
        // owner and prevents accidental use-after-close during cleanup.
        return { anchor, lease, root, rootDirectory: root, sessions, runs, staging, quarantine };
    }
    catch (error) {
        // A partially-created layout must not leave descriptors behind.  Keep the
        // original bootstrap error authoritative while making best-effort cleanup.
        for (const directory of opened.reverse())
            await directory.close().catch(() => undefined);
        await root.close().catch(() => undefined);
        throw error;
    }
}
/** Alias using the name from the storage design. */
export const initializeLeasedWorkflowStorage = initializePrivateLayout;
//# sourceMappingURL=private-root.js.map