/** Saved workflow-definition registry and its bounded Host-facing adapter. */
import { constants as fsConstants } from 'node:fs';
import { lstat as localLstat, mkdir as localMkdir, open as localOpen, readdir as localReaddir, rename as localRename, unlink as localUnlink, writeFile as localWriteFile, link as localLink, chmod as localChmod, } from 'node:fs/promises';
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
async function discoverLocalRoot(root, maxDefinitions, maxBytes, signal) {
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
            throw asRegistryError(path, error);
        }
    }
    return definitions;
}
async function discoverHostRoot(fs, root, maxDefinitions, maxBytes, signal) {
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
                throw asRegistryError(path, error);
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
        return this.fs === undefined
            ? discoverLocalRoot(root, this.config.maxDefinitionsPerRoot, this.config.definitionMaxBytes, signal)
            : discoverHostRoot(this.fs, root, this.config.maxDefinitionsPerRoot, this.config.definitionMaxBytes, signal);
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
        // Discover every root before merging so a malformed shadowed entry fails loudly.
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
     * local fallback is retained for standalone unit use; Host contexts fail
     * closed when the compatible no-follow capability is unavailable.
     */
    async save(envelope, options) {
        if (!this.config.enabled)
            throw new WorkflowRegistryError('workflow registry is disabled', 'WORKFLOW_REGISTRY_DISABLED');
        if (options.scope !== 'project' && options.scope !== 'user') {
            throw new WorkflowRegistryError('workflow definitions can only be saved to project or user scope', 'WORKFLOW_SAVE_SCOPE_INVALID');
        }
        this.requireLookupCwd(options, 'save');
        const clean = validateDefinitionEnvelope(envelope);
        const bytes = serializeWorkflowDefinition(clean);
        if (bytes.byteLength > this.config.definitionMaxBytes) {
            throw new WorkflowRegistryError(`definition exceeds the ${this.config.definitionMaxBytes}-byte limit`, 'WORKFLOW_DEFINITION_INVALID');
        }
        const roots = await this.roots(options);
        const root = roots.find(candidate => candidate.scope === options.scope);
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
        await assertLocalRootSafe(root);
        await localMkdir(root.path, { recursive: true, mode: 0o700 });
        await localChmod(root.path, 0o700).catch(() => undefined);
        const filename = `${envelope.meta.name}.workflow.json`;
        const path = joinRoot(root, filename);
        const current = await localEntry(path);
        if (current !== undefined && (current.type !== 'file' || current.nlink !== 1)) {
            throw new WorkflowRegistryError(`${path}: workflow definition must be a regular file; symbolic-link definitions are not allowed`, 'WORKFLOW_DEFINITION_INVALID');
        }
        const temp = joinRoot(root, `.${filename}.${randomHex(12)}.tmp`);
        await localWriteFile(temp, bytes, { flag: 'wx', mode: 0o600 });
        try {
            aborted(signal);
            if (current === undefined) {
                try {
                    await localLink(temp, path);
                    // Drop the staging directory entry before the guarded reader checks
                    // link count; the published file itself must have exactly one link.
                    await localUnlink(temp);
                }
                catch (error) {
                    /* c8 ignore start -- wx plus link is the create race */
                    throw new WorkflowRegistryError(`${path}: create publication raced another entry`, 'WORKFLOW_STALE_VERSION', { cause: error });
                    /* c8 ignore stop */
                }
            }
            else {
                const before = await localLstat(path);
                /* c8 ignore start -- destination identity is rechecked immediately before rename */
                if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1) {
                    throw new WorkflowRegistryError(`${path}: target changed before publication`, 'WORKFLOW_STALE_VERSION');
                }
                /* c8 ignore stop */
                await localRename(temp, path);
            }
            const published = await readLocalNoFollow(path, this.config.definitionMaxBytes, signal);
            const definition = parseWorkflowDefinition(published, path, root.scope, envelope.meta.name, this.config.definitionMaxBytes);
            this.emitChange();
            return definition;
        }
        finally {
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