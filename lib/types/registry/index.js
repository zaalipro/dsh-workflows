/** Saved workflow-definition registry and its bounded Host-facing adapter. */
import { constants as fsConstants } from 'node:fs';
import { lstat as localLstat, mkdir as localMkdir, open as localOpen, readdir as localReaddir, unlink as localUnlink, link as localLink, chmod as localChmod, } from 'node:fs/promises';
import { filenameStem, parseWorkflowDefinition, serializeWorkflowDefinition, validateDefinitionEnvelope, } from './definition.js';
import { assertWorkflowDefinitionName, isWorkflowDefinitionName } from './names.js';
import { resolveWorkflowRoots, workflowPathApi } from './roots.js';
import { WorkflowDefinitionWatchers } from './watchers.js';
export * from './types.js';
export * from './names.js';
export * from './definition.js';
export * from './roots.js';
export * from './watchers.js';
/** Stable package error for malformed/unsafe registry observations. */
export class WorkflowRegistryError extends Error {
    code;
    constructor(message, code = 'WORKFLOW_DEFINITION_INVALID', options) {
        super(message, options);
        this.name = 'WorkflowRegistryError';
        this.code = code;
    }
}
const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
function isHostContext(value) {
    return typeof value === 'object' && value !== null && ('fs' in value || 'emit' in value || 'logger' in value);
}
function aborted(signal) {
    signal?.throwIfAborted();
}
/** Stable code-unit ordering independent of host locale. */
function compareCodeUnits(left, right) {
    if (left < right)
        return -1;
    if (left > right)
        return 1;
    /* c8 ignore start -- catalog names are unique after first-wins merge */
    return 0;
    /* c8 ignore stop */
}
function joinRoot(root, name) {
    return workflowPathApi(root.path).join(root.path, name);
}
function localPathContains(base, child) {
    const api = workflowPathApi(base);
    const rel = api.relative(api.normalize(base), api.normalize(child));
    return rel === '' || (rel !== '..' && !rel.startsWith(`..${api.sep}`) && !api.isAbsolute(rel));
}
function errorCode(error) {
    return typeof error === 'object' && error !== null && 'code' in error
        ? String(error.code)
        : undefined;
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
function isAbortError(error) {
    return error instanceof DOMException && error.name === 'AbortError'
        || errorCode(error) === 'ABORT_ERR'
        || errorCode(error) === 'FS_ABORTED';
}
function asRegistryError(path, error) {
    if (error instanceof WorkflowRegistryError)
        return error;
    if (isAbortError(error))
        throw error;
    const code = errorCode(error);
    const message = errorMessage(error);
    const prefixed = message === path || message.startsWith(`${path}:`) ? message : `${path}: ${message}`;
    if (code === 'FS_NOT_REGULAR_FILE') {
        return new WorkflowRegistryError(`${path}: workflow definition must be a regular file; symbolic-link definitions are not allowed`, 'WORKFLOW_DEFINITION_INVALID', { cause: error });
    }
    if (code === 'FS_TOO_LARGE') {
        const limit = /(?:exceeds the |limit )(\d+)/u.exec(message)?.[1];
        return new WorkflowRegistryError(`${path}: definition exceeds the ${limit ?? 'configured'}-byte limit`, 'WORKFLOW_DEFINITION_INVALID', { cause: error });
    }
    return new WorkflowRegistryError(prefixed, code ?? 'WORKFLOW_DEFINITION_INVALID', { cause: error });
}
/** One unreadable `.workflow.json` must not hide the rest of the catalog. */
function skipInvalidDefinition(path, error, onInvalid) {
    if (error instanceof WorkflowRegistryError
        && error.code !== 'WORKFLOW_DEFINITION_INVALID'
        && error.code !== 'WORKFLOW_DEFINITION_MISSING') {
        throw error;
    }
    const wrapped = asRegistryError(path, error);
    if (errorCode(error) === 'FS_NOT_REGULAR_FILE')
        throw wrapped;
    if (wrapped.code === 'WORKFLOW_DEFINITION_INVALID' || wrapped.code === 'WORKFLOW_DEFINITION_MISSING') {
        onInvalid?.(wrapped);
        return true;
    }
    throw wrapped;
}
async function localEntry(path) {
    try {
        const info = await localLstat(path);
        return {
            type: info.isSymbolicLink() ? 'symlink' : info.isFile() ? 'file' : info.isDirectory() ? 'directory' : 'other',
            size: info.size,
            nlink: info.nlink,
        };
    }
    catch (error) {
        if (errorCode(error) === 'ENOENT')
            return undefined;
        /* c8 ignore start -- unexpected local lstat faults stay loud */
        throw error;
        /* c8 ignore stop */
    }
}
function localVersionFromStats(info) {
    return {
        dev: info.dev,
        ino: info.ino,
        size: info.size,
        mtimeNs: info.mtimeNs,
        ctimeNs: info.ctimeNs,
        mode: info.mode,
        nlink: info.nlink,
    };
}
/** Capture the same final-entry identity/version fields used by the stock Host fs. */
async function localFileVersion(path) {
    try {
        const info = await localLstat(path, { bigint: true });
        if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1n) {
            throw new WorkflowRegistryError(`${path}: workflow definition must be a regular file; symbolic-link definitions are not allowed`, 'WORKFLOW_DEFINITION_INVALID');
        }
        return localVersionFromStats(info);
    }
    catch (error) {
        if (errorCode(error) === 'ENOENT')
            return undefined;
        throw error;
    }
}
function sameLocalFileVersion(left, right) {
    return left.dev === right.dev
        && left.ino === right.ino
        && left.size === right.size
        && left.mtimeNs === right.mtimeNs
        && left.ctimeNs === right.ctimeNs
        && left.mode === right.mode
        && left.nlink === right.nlink;
}
/** Exchange changes ctime itself; these fields identify the entry across it. */
function sameLocalFileAfterExchange(left, right) {
    return left.dev === right.dev
        && left.ino === right.ino
        && left.size === right.size
        && left.mtimeNs === right.mtimeNs
        && left.mode === right.mode
        && left.nlink === right.nlink;
}
function sameBytes(left, right) {
    if (left.byteLength !== right.byteLength)
        return false;
    for (let index = 0; index < left.byteLength; index += 1) {
        if (left[index] !== right[index])
            return false;
    }
    return true;
}
// Path-local serialization avoids needless same-process exchange/rollback while
// preserving optimistic semantics: every writer observes before joining this
// queue, then must still match that exact observation at its commit point.
const localPublicationTails = new Map();
async function withLocalPublicationLock(path, action) {
    const previous = localPublicationTails.get(path) ?? Promise.resolve();
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const tail = previous.then(() => gate);
    localPublicationTails.set(path, tail);
    await previous;
    try {
        return await action();
    }
    finally {
        release();
        if (localPublicationTails.get(path) === tail)
            localPublicationTails.delete(path);
    }
}
/** Make the destination directory entry durable before reporting success. */
async function fsyncLocalDirectory(path) {
    /* c8 ignore start -- local durable publication requires POSIX directory fsync */
    if (process.platform === 'win32' || (fsConstants.O_DIRECTORY ?? 0) === 0 || (fsConstants.O_NOFOLLOW ?? 0) === 0) {
        throw new WorkflowRegistryError(`${path}: durable no-follow definition publication is unavailable on ${process.platform}`, 'WORKFLOW_REGISTRY_UNSUPPORTED');
    }
    /* c8 ignore stop */
    const handle = await localOpen(path, fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW);
    try {
        const info = await handle.stat();
        if (!info.isDirectory())
            throw new WorkflowRegistryError(`${path}: workflow root must be a directory`, 'WORKFLOW_ROOT_UNSAFE');
        await handle.sync();
    }
    finally {
        await handle.close().catch(() => undefined);
    }
}
async function requireNativePublication(path) {
    /* c8 ignore start -- native exchange is intentionally unsupported elsewhere */
    if (process.platform !== 'linux' && process.platform !== 'darwin') {
        throw new WorkflowRegistryError(`${path}: atomic definition exchange is unavailable on ${process.platform}`, 'WORKFLOW_REGISTRY_UNSUPPORTED');
    }
    try {
        const native = await import('fs-native-extensions');
        if (typeof native.swap !== 'function'
            || typeof native.waitForLock !== 'function'
            || typeof native.unlock !== 'function') {
            throw new TypeError('atomic swap/lock exports are unavailable');
        }
        return native;
    }
    catch (error) {
        throw new WorkflowRegistryError(`${path}: atomic definition exchange is unavailable`, 'WORKFLOW_REGISTRY_UNSUPPORTED', { cause: error });
    }
    /* c8 ignore stop */
}
/**
 * Lock a stable, never-unlinked sibling entry. Locking the destination inode
 * is insufficient because an exchange changes which inode future writers see.
 */
async function acquireLocalPublicationLock(lockPath, native) {
    let handle;
    let locked = false;
    try {
        handle = await localOpen(lockPath, fsConstants.O_RDWR | fsConstants.O_CREAT | fsConstants.O_NOFOLLOW, 0o600);
        const openedStats = await handle.stat({ bigint: true });
        const opened = localVersionFromStats(openedStats);
        if (!openedStats.isFile() || opened.nlink !== 1n) {
            throw new WorkflowRegistryError(`${lockPath}: publication lock must be a regular single-link file`, 'WORKFLOW_ROOT_UNSAFE');
        }
        await native.waitForLock(handle.fd);
        locked = true;
        const held = localVersionFromStats(await handle.stat({ bigint: true }));
        const lexical = await localFileVersion(lockPath);
        if (lexical === undefined
            || !sameLocalFileVersion(opened, held)
            || !sameLocalFileVersion(held, lexical)) {
            throw new WorkflowRegistryError(`${lockPath}: publication lock identity changed while held`, 'WORKFLOW_ROOT_UNSAFE');
        }
        const retained = handle;
        const assertIdentity = async () => {
            const descriptor = localVersionFromStats(await retained.stat({ bigint: true }));
            const entry = await localFileVersion(lockPath);
            if (entry === undefined
                || !sameLocalFileVersion(held, descriptor)
                || !sameLocalFileVersion(descriptor, entry)) {
                throw new WorkflowRegistryError(`${lockPath}: publication lock identity changed while held`, 'WORKFLOW_ROOT_UNSAFE');
            }
        };
        return {
            handle: retained,
            assertIdentity,
            release: async () => {
                try {
                    native.unlock(retained.fd);
                }
                catch { /* close also releases the advisory lock */ }
                await retained.close().catch(() => undefined);
            },
        };
    }
    catch (error) {
        if (locked && handle !== undefined) {
            try {
                native.unlock(handle.fd);
            }
            catch { /* close below releases it */ }
        }
        await handle?.close().catch(() => undefined);
        if (errorCode(error) === 'ELOOP') {
            throw new WorkflowRegistryError(`${lockPath}: symbolic-link publication lock is not allowed`, 'WORKFLOW_ROOT_UNSAFE', { cause: error });
        }
        throw error;
    }
}
/** Reject symlink ancestors and lexical escapes before local fallback I/O. */
async function assertLocalRootSafe(root) {
    /* c8 ignore start -- resolveWorkflowRoots never emits a lexically escaped root */
    if (!localPathContains(root.basePath, root.path)) {
        throw new WorkflowRegistryError(`${root.path}: workflow root escapes its ${root.scope} scope through a symbolic-link ancestor`, 'WORKFLOW_ROOT_UNSAFE');
    }
    /* c8 ignore stop */
    const api = workflowPathApi(root.path);
    const normalizedBase = api.normalize(root.basePath);
    const normalizedRoot = api.normalize(root.path);
    const rel = api.relative(normalizedBase, normalizedRoot);
    const parts = rel === '' ? [] : rel.split(/[\\/]+/u).filter(Boolean);
    let current = normalizedBase;
    for (const part of parts) {
        current = api.join(current, part);
        const info = await localEntry(current);
        if (info?.type === 'symlink') {
            throw new WorkflowRegistryError(`${current}: symbolic-link workflow root ancestor is not allowed`, 'WORKFLOW_ROOT_UNSAFE');
        }
        if (info !== undefined && info.type !== 'directory') {
            throw new WorkflowRegistryError(`${current}: workflow root ancestor must be a directory`, 'WORKFLOW_ROOT_UNSAFE');
        }
        if (info === undefined)
            break;
    }
}
async function readLocalNoFollow(path, maxBytes, signal) {
    aborted(signal);
    /* c8 ignore start -- local no-follow reads require POSIX O_NOFOLLOW */
    if (process.platform === 'win32' || (fsConstants.O_NOFOLLOW ?? 0) === 0) {
        throw new WorkflowRegistryError(`${path}: safe no-follow definition reads are unavailable on ${process.platform}`, 'WORKFLOW_REGISTRY_UNSUPPORTED');
    }
    /* c8 ignore stop */
    let handle;
    try {
        handle = await localOpen(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
        const info = await handle.stat();
        if (!info.isFile() || info.nlink !== 1) {
            /* c8 ignore next -- discoverLocalRoot already rejected non-regular final entries */
            throw new WorkflowRegistryError(`${path}: workflow definition must be a regular file; symbolic-link definitions are not allowed`, 'WORKFLOW_DEFINITION_INVALID');
        }
        if (info.size > maxBytes)
            throw new WorkflowRegistryError(`${path}: definition exceeds the ${maxBytes}-byte limit`, 'WORKFLOW_DEFINITION_INVALID');
        const chunks = [];
        let total = 0;
        while (true) {
            aborted(signal);
            const chunk = Buffer.alloc(Math.min(64 * 1024, maxBytes + 1 - total));
            /* c8 ignore next -- the size check above rejects oversized files before the loop */
            if (chunk.length === 0)
                throw new WorkflowRegistryError(`${path}: definition exceeds the ${maxBytes}-byte limit`, 'WORKFLOW_DEFINITION_INVALID');
            const { bytesRead } = await handle.read(chunk, 0, chunk.length, null);
            if (bytesRead === 0)
                break;
            total += bytesRead;
            chunks.push(chunk.subarray(0, bytesRead));
            /* c8 ignore next -- handle.stat size already rejected files above the cap */
            if (total > maxBytes)
                throw new WorkflowRegistryError(`${path}: definition exceeds the ${maxBytes}-byte limit`, 'WORKFLOW_DEFINITION_INVALID');
        }
        return new Uint8Array(Buffer.concat(chunks));
    }
    catch (error) {
        if (error instanceof WorkflowRegistryError)
            throw error;
        /* c8 ignore start -- raced unlink between lstat and open */
        if (errorCode(error) === 'ENOENT')
            throw new WorkflowRegistryError(`${path}: definition not found`, 'WORKFLOW_DEFINITION_MISSING', { cause: error });
        throw error;
        /* c8 ignore stop */
    }
    finally {
        await handle?.close().catch(() => undefined);
    }
}
async function discoverLocalRoot(root, maxDefinitions, maxBytes, signal, onInvalid) {
    aborted(signal);
    await assertLocalRootSafe(root);
    const info = await localEntry(root.path);
    if (info === undefined)
        return [];
    /* c8 ignore start -- assertLocalRootSafe already rejected symlink/file roots */
    if (info.type === 'symlink')
        throw new WorkflowRegistryError(`${root.path}: symbolic-link workflow roots are not allowed`, 'WORKFLOW_ROOT_UNSAFE');
    if (info.type !== 'directory')
        throw new WorkflowRegistryError(`${root.path}: workflow root must be a directory`, 'WORKFLOW_ROOT_UNSAFE');
    /* c8 ignore stop */
    const entries = (await localReaddir(root.path, { withFileTypes: true }))
        .filter(entry => entry.name.endsWith('.workflow.json'))
        .sort((left, right) => compareCodeUnits(left.name, right.name));
    if (entries.length > maxDefinitions)
        throw new WorkflowRegistryError(`${root.path}: found ${entries.length} workflow definitions; maximum is ${maxDefinitions}`, 'WORKFLOW_DEFINITION_LIMIT');
    const definitions = [];
    for (const entry of entries) {
        aborted(signal);
        const path = joinRoot(root, entry.name);
        const name = filenameStem(entry.name);
        if (!isWorkflowDefinitionName(name))
            throw new WorkflowRegistryError(`${path}: filename stem "${name}" is not a valid workflow name`, 'WORKFLOW_DEFINITION_INVALID');
        const finalInfo = await localEntry(path);
        if (finalInfo?.type === 'symlink' || finalInfo?.type !== 'file' || finalInfo.nlink !== 1) {
            throw new WorkflowRegistryError(`${path}: workflow definition must be a regular file; symbolic-link definitions are not allowed`, 'WORKFLOW_DEFINITION_INVALID');
        }
        try {
            definitions.push(parseWorkflowDefinition(await readLocalNoFollow(path, maxBytes, signal), path, root.scope, name, maxBytes));
        }
        catch (error) {
            if (skipInvalidDefinition(path, error, onInvalid))
                continue;
        }
    }
    return definitions;
}
async function discoverHostRoot(fs, root, maxDefinitions, maxBytes, signal, onInvalid) {
    aborted(signal);
    let rootInfo;
    try {
        rootInfo = await fs.lstat(root.path, {}, signal);
    }
    catch (error) {
        throw asRegistryError(root.path, error);
    }
    if (rootInfo === undefined)
        return [];
    if (rootInfo.type === 'symlink')
        throw new WorkflowRegistryError(`${root.path}: symbolic-link workflow roots are not allowed`, 'WORKFLOW_ROOT_UNSAFE');
    if (rootInfo.type !== 'directory')
        throw new WorkflowRegistryError(`${root.path}: workflow root must be a directory`, 'WORKFLOW_ROOT_UNSAFE');
    if (typeof fs.openPrivateDirectory !== 'function') {
        return discoverLocalRoot(root, maxDefinitions, maxBytes, signal);
    }
    let baseTarget;
    let rootTarget;
    try {
        [baseTarget, rootTarget] = await Promise.all([
            fs.resolve(root.basePath, { signal }),
            fs.resolve(root.path, { signal }),
        ]);
        if (!fs.contains(baseTarget, rootTarget)) {
            throw new WorkflowRegistryError(`${root.path}: workflow root escapes its ${root.scope} scope through a symbolic-link ancestor`, 'WORKFLOW_ROOT_UNSAFE');
        }
    }
    catch (error) {
        throw asRegistryError(root.path, error);
    }
    let directory;
    try {
        directory = await fs.openPrivateDirectory(root.path, { create: false }, signal);
        await directory.assertIdentity(signal);
        const descriptor = directory;
        const descriptorList = descriptor.listEntries ?? descriptor.listDir;
        if (descriptorList === undefined) {
            throw new WorkflowRegistryError(`${root.path}: descriptor-rooted workflow definition listing is unavailable`, 'WORKFLOW_REGISTRY_UNSUPPORTED');
        }
        const entries = (await descriptorList.call(directory, signal))
            .filter(entry => entry.name.endsWith('.workflow.json'))
            .sort((left, right) => compareCodeUnits(left.name, right.name));
        if (entries.length > maxDefinitions)
            throw new WorkflowRegistryError(`${root.path}: found ${entries.length} workflow definitions; maximum is ${maxDefinitions}`, 'WORKFLOW_DEFINITION_LIMIT');
        const definitions = [];
        for (const entry of entries) {
            aborted(signal);
            if (entry.name.includes('/') || entry.name.includes('\\') || entry.name === '.' || entry.name === '..') {
                throw new WorkflowRegistryError(`${joinRoot(root, entry.name)}: unsafe workflow filename`, 'WORKFLOW_DEFINITION_INVALID');
            }
            const path = joinRoot(root, entry.name);
            const name = filenameStem(entry.name);
            if (!isWorkflowDefinitionName(name))
                throw new WorkflowRegistryError(`${path}: filename stem "${name}" is not a valid workflow name`, 'WORKFLOW_DEFINITION_INVALID');
            if (entry.type !== 'file')
                throw new WorkflowRegistryError(`${path}: workflow definition must be a regular file; symbolic-link definitions are not allowed`, 'WORKFLOW_DEFINITION_INVALID');
            try {
                const bytes = await directory.readBytes(entry.name, signal, maxBytes);
                definitions.push(parseWorkflowDefinition(bytes, path, root.scope, name, maxBytes));
            }
            catch (error) {
                if (skipInvalidDefinition(path, error, onInvalid))
                    continue;
            }
        }
        await directory.assertIdentity(signal);
        return definitions;
    }
    catch (error) {
        throw asRegistryError(root.path, error);
    }
    finally {
        await directory?.close().catch(() => undefined);
    }
}
function summarize(definition) {
    return {
        name: definition.name,
        description: definition.description,
        ...(definition.whenToUse === undefined ? {} : { whenToUse: definition.whenToUse }),
        ...(definition.phases === undefined ? {} : { phases: definition.phases }),
        scope: definition.scope,
        path: definition.path,
    };
}
/** Saved-definition registry. Host capability I/O is authoritative when supplied. */
export class WorkflowRegistry {
    static inject = ['fs'];
    config;
    ctx;
    dshHome;
    fs;
    watchers;
    revision = 0;
    disposed = false;
    watcherGeneration = 0;
    constructor(ctxOrConfig, config) {
        this.ctx = config === undefined && isHostContext(ctxOrConfig) ? ctxOrConfig : config === undefined ? undefined : ctxOrConfig;
        const supplied = config ?? (isHostContext(ctxOrConfig) ? {} : ctxOrConfig) ?? {};
        this.fs = this.ctx?.fs;
        const homeValue = supplied.dshHome ?? process.env.DSH_HOME ?? (typeof process.env.HOME === 'string' ? `${process.env.HOME}/.dsh` : '/.dsh');
        this.dshHome = workflowPathApi(homeValue).normalize(homeValue);
        this.config = {
            enabled: supplied.enabled ?? true,
            definitionWatch: supplied.definitionWatch ?? true,
            definitionMaxBytes: supplied.definitionMaxBytes ?? 1_048_576,
            maxDefinitionsPerRoot: supplied.maxDefinitionsPerRoot ?? 256,
            watchMaxProjects: supplied.watchMaxProjects ?? 128,
            watchStabilityThresholdMs: supplied.watchStabilityThresholdMs ?? 200,
            watchPollIntervalMs: supplied.watchPollIntervalMs ?? 100,
            ...supplied,
        };
        if (!Number.isSafeInteger(this.config.definitionMaxBytes) || this.config.definitionMaxBytes < 1)
            throw new TypeError('definitionMaxBytes must be a positive safe integer');
        if (!Number.isSafeInteger(this.config.maxDefinitionsPerRoot) || this.config.maxDefinitionsPerRoot < 1)
            throw new TypeError('maxDefinitionsPerRoot must be a positive safe integer');
        if (this.config.definitionWatch && this.config.enabled && this.ctx?.emit !== undefined) {
            this.watchers = new WorkflowDefinitionWatchers(() => {
                if (this.disposed)
                    return;
                this.watcherGeneration = this.watchers === undefined ? this.watcherGeneration + 1 : this.watchers.generation;
                this.revision += 1;
                this.ctx?.emit?.('workflows/change');
            }, {
                maxProjects: this.config.watchMaxProjects,
                usePolling: this.config.watchUsePolling,
                stabilityThresholdMs: this.config.watchStabilityThresholdMs,
                pollIntervalMs: this.config.watchPollIntervalMs,
                logger: this.ctx?.logger,
                watchFactory: this.config.watchFactory,
                scheduler: this.config.watchScheduler,
            });
        }
    }
    async roots(options = {}) {
        return resolveWorkflowRoots({
            fileSystem: this.fs,
            cwd: options.cwd,
            dshHome: this.dshHome,
            bundledDefinitionsDir: this.config.bundledDefinitionsDir,
            signal: options.signal,
        });
    }
    async ensureWatchers(roots) {
        if (this.watchers === undefined || this.disposed)
            return;
        const project = roots.find(root => root.scope === 'project')?.projectRoot
            ?? roots.find(root => root.scope === 'project')?.basePath;
        /* c8 ignore start -- resolveWorkflowRoots always emits a project root */
        if (project === undefined)
            return;
        /* c8 ignore stop */
        await this.watchers.observeProject(project, roots);
        this.watcherGeneration = this.watchers.generation;
    }
    async discoverRoot(root, signal) {
        const onInvalid = error => {
            this.ctx?.logger?.warn?.(error.message);
        };
        return this.fs === undefined
            ? discoverLocalRoot(root, this.config.maxDefinitionsPerRoot, this.config.definitionMaxBytes, signal, onInvalid)
            : discoverHostRoot(this.fs, root, this.config.maxDefinitionsPerRoot, this.config.definitionMaxBytes, signal, onInvalid);
    }
    requireLookupCwd(options, action) {
        if (typeof options.cwd !== 'string' || options.cwd.length === 0) {
            throw new WorkflowRegistryError(action === 'save'
                ? 'workflow definition save requires a session cwd'
                : 'workflow definition listing requires a session cwd', 'WORKFLOW_ROOT_UNSAFE');
        }
        return options.cwd;
    }
    /** List all winning definitions, sorted by UTF-16 code units. */
    async list(options = {}) {
        if (!this.config.enabled)
            return [];
        this.requireLookupCwd(options, 'listing');
        aborted(options.signal);
        const roots = await this.roots(options);
        await this.ensureWatchers(roots);
        const byName = new Map();
        for (const root of roots) {
            for (const definition of await this.discoverRoot(root, options.signal)) {
                if (!byName.has(definition.name))
                    byName.set(definition.name, definition);
            }
        }
        aborted(options.signal);
        return [...byName.values()]
            .sort((left, right) => compareCodeUnits(left.name, right.name))
            .map(summarize);
    }
    /** Return a bounded catalog snapshot; complete is false if a watcher raced it. */
    async snapshot(options = {}) {
        if (!this.config.enabled)
            return { definitions: [], complete: true };
        const revision = this.revision;
        const generation = this.watcherGeneration;
        const definitions = await this.list(options);
        return {
            definitions,
            complete: revision === this.revision && generation === this.watcherGeneration,
            revision,
        };
    }
    /** Resolve one full winning definition (script is never exposed by list). */
    async get(name, options = {}) {
        if (!this.config.enabled)
            return undefined;
        this.requireLookupCwd(options, 'listing');
        assertWorkflowDefinitionName(name, 'workflow lookup');
        aborted(options.signal);
        const roots = await this.roots(options);
        await this.ensureWatchers(roots);
        let winner;
        for (const root of roots) {
            const definitions = await this.discoverRoot(root, options.signal);
            if (winner === undefined)
                winner = definitions.find(definition => definition.name === name);
        }
        return winner;
    }
    /**
     * Save a canonical definition through the Host descriptor capability. The
     * guarded local path is also the stock RC2 compatibility seam when its Host
     * filesystem does not expose retained private-directory descriptors.
     */
    async save(envelope, options) {
        if (!this.config.enabled)
            throw new WorkflowRegistryError('workflow registry is disabled', 'WORKFLOW_REGISTRY_DISABLED');
        if (options.scope !== 'project' && options.scope !== 'user') {
            throw new WorkflowRegistryError('workflow definitions can only be saved to project or user scope', 'WORKFLOW_SAVE_SCOPE_INVALID');
        }
        if (options.scope === 'project')
            this.requireLookupCwd(options, 'save');
        const clean = validateDefinitionEnvelope(envelope);
        const bytes = serializeWorkflowDefinition(clean);
        if (bytes.byteLength > this.config.definitionMaxBytes) {
            throw new WorkflowRegistryError(`definition exceeds the ${this.config.definitionMaxBytes}-byte limit`, 'WORKFLOW_DEFINITION_INVALID');
        }
        const root = options.scope === 'user'
            ? {
                scope: 'user',
                path: workflowPathApi(this.dshHome).join(this.dshHome, 'workflows'),
                basePath: this.dshHome,
            }
            : (await this.roots(options)).find(candidate => candidate.scope === options.scope);
        if (root === undefined)
            throw new WorkflowRegistryError(`workflow ${options.scope} root is unavailable`, 'WORKFLOW_ROOT_UNSAFE');
        return this.fs === undefined
            ? this.saveLocal(clean, bytes, root, options.signal)
            : this.saveHost(clean, bytes, root, options.signal);
    }
    async saveHost(envelope, bytes, root, signal) {
        const fs = this.fs;
        if (typeof fs.openPrivateDirectory !== 'function') {
            return this.saveLocal(envelope, bytes, root, signal);
        }
        // Pin/check the allowed base before any directory creation.
        let baseTarget;
        let rootTarget;
        try {
            [baseTarget, rootTarget] = await Promise.all([
                fs.resolve(root.basePath, { signal }),
                fs.resolve(root.path, { signal }),
            ]);
            if (!fs.contains(baseTarget, rootTarget)) {
                throw new WorkflowRegistryError(`${root.path}: workflow root escapes its ${root.scope} scope through a symbolic-link ancestor`, 'WORKFLOW_ROOT_UNSAFE');
            }
        }
        catch (error) {
            throw asRegistryError(root.path, error);
        }
        aborted(signal);
        let directory;
        try {
            directory = await fs.openPrivateDirectory(root.path, { create: true }, signal);
            await directory.assertIdentity(signal);
            const filename = `${envelope.meta.name}.workflow.json`;
            const path = joinRoot(root, filename);
            // Observe the final lexical entry without resolving/following it.  The
            // retained directory performs the guarded publication; resolving this
            // path to a target would reintroduce a final-link substitution race.
            const current = await fs.lstat(path, {}, signal);
            let expected;
            if (current === undefined) {
                expected = { kind: 'createIfAbsent' };
            }
            else {
                if (current.type !== 'file')
                    throw new WorkflowRegistryError(`${path}: workflow definition must be a regular file; symbolic-link definitions are not allowed`, 'WORKFLOW_DEFINITION_INVALID');
                if (current.version === undefined)
                    throw new WorkflowRegistryError(`${path}: Host filesystem did not return a final-entry version`, 'WORKFLOW_REGISTRY_UNSUPPORTED');
                expected = { kind: 'replaceIfVersion', version: current.version };
            }
            await directory.writeText(filename, utf8Decoder.decode(bytes), expected, signal);
            await directory.assertIdentity(signal);
            const published = await directory.readBytes(filename, signal, this.config.definitionMaxBytes);
            const definition = parseWorkflowDefinition(published, path, root.scope, envelope.meta.name, this.config.definitionMaxBytes);
            this.emitChange();
            return definition;
        }
        catch (error) {
            throw asRegistryError(root.path, error);
        }
        finally {
            await directory?.close().catch(() => undefined);
        }
    }
    async saveLocal(envelope, bytes, root, signal) {
        aborted(signal);
        /* c8 ignore start -- the guarded local algorithm deliberately fails before mutation on Windows */
        if (process.platform === 'win32' || (fsConstants.O_NOFOLLOW ?? 0) === 0 || (fsConstants.O_DIRECTORY ?? 0) === 0) {
            throw new WorkflowRegistryError(`${root.path}: durable no-follow definition publication is unavailable on ${process.platform}`, 'WORKFLOW_REGISTRY_UNSUPPORTED');
        }
        /* c8 ignore stop */
        // Resolve the native CAS primitive before creating a root or staging file.
        const nativePublication = await requireNativePublication(root.path);
        await assertLocalRootSafe(root);
        await localMkdir(root.path, { recursive: true, mode: 0o700 });
        await localChmod(root.path, 0o700).catch(() => undefined);
        const filename = `${envelope.meta.name}.workflow.json`;
        const path = joinRoot(root, filename);
        const lockPath = joinRoot(root, `.${filename}.lock`);
        const current = await localFileVersion(path);
        const observedBytes = current === undefined
            ? undefined
            : await readLocalNoFollow(path, this.config.definitionMaxBytes, signal);
        if (current !== undefined) {
            const afterRead = await localFileVersion(path);
            if (afterRead === undefined || !sameLocalFileVersion(current, afterRead)) {
                throw new WorkflowRegistryError(`${path}: target changed during observation`, 'WORKFLOW_STALE_VERSION');
            }
        }
        const temp = joinRoot(root, `.${filename}.${randomHex(12)}.tmp`);
        let tempHandle;
        let preserveTemp = false;
        try {
            tempHandle = await localOpen(temp, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL, 0o600);
            await tempHandle.writeFile(bytes);
            aborted(signal);
            await tempHandle.sync();
            await tempHandle.close();
            tempHandle = undefined;
            aborted(signal);
            return await withLocalPublicationLock(path, async () => {
                let cleanOwnedTemp = true;
                let publicationLock;
                try {
                    publicationLock = await acquireLocalPublicationLock(lockPath, nativePublication);
                    // Waiting for a cooperating publisher is not a commit. Honor a late
                    // abort now; after the first mutation recovery must run to completion.
                    aborted(signal);
                    if (current === undefined) {
                        await publicationLock.assertIdentity();
                        try {
                            await localLink(temp, path);
                        }
                        catch (error) {
                            if (errorCode(error) === 'EEXIST') {
                                throw new WorkflowRegistryError(`${path}: create publication raced another entry`, 'WORKFLOW_STALE_VERSION', { cause: error });
                            }
                            throw error;
                        }
                        // Drop the staging directory entry before the guarded reader checks
                        // link count; the published file itself must have exactly one link.
                        await localUnlink(temp);
                    }
                    else {
                        let before;
                        try {
                            before = await localFileVersion(path);
                        }
                        catch (error) {
                            if (error instanceof WorkflowRegistryError && error.code === 'WORKFLOW_DEFINITION_INVALID') {
                                throw new WorkflowRegistryError(`${path}: target changed before publication`, 'WORKFLOW_STALE_VERSION', { cause: error });
                            }
                            throw error;
                        }
                        if (before === undefined || !sameLocalFileVersion(current, before)) {
                            throw new WorkflowRegistryError(`${path}: target changed before publication`, 'WORKFLOW_STALE_VERSION');
                        }
                        const proposed = await localFileVersion(temp);
                        /* c8 ignore next -- the retained staging handle just created this entry */
                        if (proposed === undefined)
                            throw new WorkflowRegistryError(`${temp}: staging entry disappeared`, 'WORKFLOW_STALE_VERSION');
                        await publicationLock.assertIdentity();
                        await nativePublication.swap(temp, path);
                        cleanOwnedTemp = false;
                        let displaced;
                        try {
                            displaced = await localFileVersion(temp);
                        }
                        catch {
                            // A non-file substitution at the displaced path is equally stale.
                        }
                        let displacedBytes;
                        if (displaced !== undefined) {
                            try {
                                displacedBytes = await readLocalNoFollow(temp, this.config.definitionMaxBytes);
                            }
                            catch {
                                // Treat an unreadable displaced entry as stale and roll it back.
                            }
                        }
                        if (displaced === undefined
                            || displacedBytes === undefined
                            || observedBytes === undefined
                            || !sameLocalFileAfterExchange(current, displaced)
                            || !sameBytes(observedBytes, displacedBytes)) {
                            // Roll back only while the destination is still exactly our staged
                            // inode. A third writer wins without being overwritten by cleanup.
                            let destination;
                            try {
                                destination = await localFileVersion(path);
                            }
                            catch {
                                // Unsafe substitution: do not exchange through it.
                            }
                            let destinationBytes;
                            if (destination !== undefined) {
                                try {
                                    destinationBytes = await readLocalNoFollow(path, this.config.definitionMaxBytes);
                                }
                                catch {
                                    // Unsafe/read-raced destination: do not exchange through it.
                                }
                            }
                            if (destination === undefined
                                || destinationBytes === undefined
                                || !sameLocalFileAfterExchange(proposed, destination)
                                || !sameBytes(bytes, destinationBytes)) {
                                preserveTemp = true;
                                throw new WorkflowRegistryError(`${path}: target changed during publication; displaced entry retained at ${temp}`, 'WORKFLOW_STALE_VERSION');
                            }
                            try {
                                await nativePublication.swap(temp, path);
                                cleanOwnedTemp = true;
                                await fsyncLocalDirectory(root.path);
                            }
                            catch (error) {
                                preserveTemp = true;
                                throw new WorkflowRegistryError(`${path}: stale publication rollback failed; displaced entry retained at ${temp}`, 'WORKFLOW_STALE_VERSION', { cause: error });
                            }
                            throw new WorkflowRegistryError(`${path}: target changed before publication`, 'WORKFLOW_STALE_VERSION');
                        }
                        try {
                            await localUnlink(temp);
                        }
                        catch (error) {
                            preserveTemp = true;
                            await fsyncLocalDirectory(root.path).catch(() => undefined);
                            throw new WorkflowRegistryError(`${path}: publication cleanup failed; displaced entry retained at ${temp}`, 'WORKFLOW_STALE_VERSION', { cause: error });
                        }
                        cleanOwnedTemp = true;
                    }
                    await fsyncLocalDirectory(root.path);
                    const published = await readLocalNoFollow(path, this.config.definitionMaxBytes);
                    if (!sameBytes(published, bytes)) {
                        throw new WorkflowRegistryError(`${path}: target changed after publication`, 'WORKFLOW_STALE_VERSION');
                    }
                    const definition = parseWorkflowDefinition(published, path, root.scope, envelope.meta.name, this.config.definitionMaxBytes);
                    this.emitChange();
                    return definition;
                }
                finally {
                    // When exchange could not be safely rolled back, temp contains the
                    // displaced entry and is deliberately not treated as owned staging.
                    if (cleanOwnedTemp)
                        await localUnlink(temp).catch(() => undefined);
                    await publicationLock?.release();
                }
            });
        }
        finally {
            await tempHandle?.close().catch(() => undefined);
            if (!preserveTemp)
                await localUnlink(temp).catch(() => undefined);
        }
    }
    emitChange() {
        if (this.disposed)
            return;
        this.revision += 1;
        this.ctx?.emit?.('workflows/change');
    }
    /** Await watcher teardown; no late callback can publish a change hint. */
    async dispose() {
        if (this.disposed)
            return;
        this.disposed = true;
        await this.watchers?.dispose();
    }
}
function randomHex(bytes) {
    // Avoid importing crypto in browser-adjacent builds; cryptographic uniqueness
    // is not an authority for registry temp names (wx is the race guard).
    const values = new Uint8Array(bytes);
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function')
        crypto.getRandomValues(values);
    /* c8 ignore next -- Node always exposes crypto.getRandomValues */
    else
        for (let index = 0; index < values.length; index += 1)
            values[index] = Math.floor(Math.random() * 256);
    return [...values].map(value => value.toString(16).padStart(2, '0')).join('');
}
//# sourceMappingURL=index.js.map