import { homedir } from 'node:os';
import { readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, join, parse, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolveWorkflowPackageConfig, Config, } from './config.js';
import { WorkflowPackageError, applyInvariant } from './invariant.js';
import { WorkflowRegistry } from './registry/index.js';
import { WorkflowDefinitionsRemote } from './registry/remote.js';
import { WorkflowSupervisor } from './supervisor/index.js';
import { WorkflowRunsRemote } from './supervisor/remote.js';
import { openWorkflowStorage } from './supervisor/storage/index.js';
import { WorkflowRunRecorder } from './run-recorder.js';
import { apply as applyUserQuestions } from './user-questions.js';
import { applyCommands, readPackagedSkill, registerTrustedWorkflowSkillSync, } from './commands/index.js';
import { applyToolShadow } from './tool/index.js';
import { registerWorkflowRemoteEvents } from './remote-events.js';
export { Config, resolveWorkflowPackageConfig, WorkflowPackageError, applyInvariant };
export const name = 'dsh-workflows';
export const version = '0.1.0-rc.3';
/** Host services the loader must wait for. Remote events are optional (absent on stock dsh). */
export const inject = [
    'agents',
    'commands',
    'fs',
    'skills',
    'subagents',
    'userQuestions',
    'workflowEngine',
];
/** Exact package compatibility contract mirrored from package.json. */
export const HOST_COMPATIBILITY = Object.freeze({
    host: '@deepseek-ai/dsh',
    versions: Object.freeze(['0.1.1-rc.2']),
    evaluator: 'plugin-compat-engine-v1',
});
const INCOMPATIBLE_MESSAGE = '@zaalipro/dsh-workflows 0.1.0-rc.3 supports exactly official DeepSeek Harness 0.1.1-rc.2';
const require = createRequire(import.meta.url);
export function isSupportedHostVersion(value) {
    return typeof value === 'string'
        && HOST_COMPATIBILITY.versions.includes(value);
}
/** Both official workflow seams are lockstep release witnesses. */
export function isSupportedHostVersions(hostVersion, workflowVersion) {
    return isSupportedHostVersion(hostVersion) && isSupportedHostVersion(workflowVersion);
}
export function assertSupportedHostVersions(hostVersion, workflowVersion) {
    if (!isSupportedHostVersions(hostVersion, workflowVersion)) {
        throw new WorkflowPackageError(INCOMPATIBLE_MESSAGE, 'WORKFLOW_INCOMPATIBLE_HOST');
    }
}
function readPackageManifest(path) {
    try {
        const value = JSON.parse(readFileSync(path, 'utf8'));
        return typeof value === 'object' && value !== null && !Array.isArray(value)
            ? value
            : undefined;
    }
    catch {
        return undefined;
    }
}
function nearestPackage(entrypoint) {
    let directory = dirname(entrypoint);
    const filesystemRoot = parse(directory).root;
    while (true) {
        const manifest = readPackageManifest(join(directory, 'package.json'));
        if (manifest !== undefined)
            return { root: directory, manifest };
        if (directory === filesystemRoot)
            return undefined;
        directory = dirname(directory);
    }
}
function manifestBinTargets(manifest) {
    if (typeof manifest.bin === 'string')
        return [manifest.bin];
    if (typeof manifest.bin !== 'object' || manifest.bin === null || Array.isArray(manifest.bin))
        return [];
    return Object.values(manifest.bin).filter((value) => typeof value === 'string');
}
function isManifestBin(entrypoint, root, manifest) {
    return manifestBinTargets(manifest).some(target => {
        try {
            return realpathSync(resolve(root, target)) === entrypoint;
        }
        catch {
            return false;
        }
    });
}
/**
 * Resolve the Host from the executable Node actually launched, not from the
 * plugin's own dependency graph. A real DSH entrypoint is authoritative even
 * when it is unsupported or incomplete; only non-DSH programs (Vitest,
 * embedders, direct imports) may use the package-local fallback below.
 */
function executableHostVersions(entrypoint) {
    if (typeof entrypoint !== 'string' || entrypoint.trim().length === 0)
        return { kind: 'programmatic' };
    let realEntrypoint;
    try {
        realEntrypoint = realpathSync(resolve(entrypoint));
    }
    catch {
        return /^dsh(?:\.[cm]?js)?$/u.test(basename(entrypoint)) ? { kind: 'dsh' } : { kind: 'programmatic' };
    }
    const owner = nearestPackage(realEntrypoint);
    if (owner?.manifest.name !== HOST_COMPATIBILITY.host) {
        return /^dsh(?:\.[cm]?js)?$/u.test(basename(entrypoint)) ? { kind: 'dsh' } : { kind: 'programmatic' };
    }
    if (!isManifestBin(realEntrypoint, owner.root, owner.manifest))
        return { kind: 'dsh' };
    try {
        const executableRequire = createRequire(pathToFileURL(realEntrypoint));
        const workflowPath = executableRequire.resolve('@deepseek-ai/dsh-workflow/package.json');
        const workflowManifest = readPackageManifest(workflowPath);
        if (workflowManifest?.name !== '@deepseek-ai/dsh-workflow')
            return { kind: 'dsh' };
        return { kind: 'dsh', versions: [owner.manifest.version, workflowManifest.version] };
    }
    catch {
        return { kind: 'dsh' };
    }
}
function packageLocalHostVersions() {
    try {
        const host = require('@deepseek-ai/dsh/package.json');
        const workflow = require('@deepseek-ai/dsh-workflow/package.json');
        if (host.name !== HOST_COMPATIBILITY.host || workflow.name !== '@deepseek-ai/dsh-workflow')
            return undefined;
        return [host.version, workflow.version];
    }
    catch {
        return undefined;
    }
}
/** Exported for executable-identity regression tests and embedders' diagnostics. */
export function resolveInstalledHostVersions(entrypoint = process.argv[1]) {
    const executable = executableHostVersions(entrypoint);
    return executable.kind === 'dsh' ? executable.versions : packageLocalHostVersions();
}
/**
 * Verify both lockstep workflow packages exposed by the running CLI's module
 * graph. Neither a context marker nor service method guessing can widen the
 * package manifest's exact support window.
 */
export function isSupportedStockHost() {
    const versions = resolveInstalledHostVersions();
    return versions !== undefined && isSupportedHostVersions(...versions);
}
function isRecord(value) {
    return typeof value === 'object' && value !== null;
}
/** Read an optional Cordis property without making a missing service throw. */
function optionalProperty(target, key) {
    if (!isRecord(target) && typeof target !== 'function')
        return undefined;
    try {
        return target[key];
    }
    catch {
        return undefined;
    }
}
/** True only for the exact official release supported by this artifact. */
export function isCompatibleHost(_ctx) {
    try {
        assertCompatibleHost();
        return true;
    }
    catch {
        return false;
    }
}
/** Verify the installed official release before opening plugin storage. */
export function assertCompatibleHost(_ctx) {
    const versions = resolveInstalledHostVersions();
    if (versions === undefined)
        throw new WorkflowPackageError(INCOMPATIBLE_MESSAGE, 'WORKFLOW_INCOMPATIBLE_HOST');
    assertSupportedHostVersions(...versions);
}
function expandHome(value) {
    if (value === '~')
        return homedir();
    if (value.startsWith('~/') || value.startsWith('~\\'))
        return join(homedir(), value.slice(2));
    return value;
}
function hostHome(ctx) {
    const candidates = [
        optionalProperty(ctx, 'dshHome'),
        optionalProperty(ctx, 'dshHomePath'),
        optionalProperty(optionalProperty(ctx, 'homePaths'), 'dshHome'),
        optionalProperty(optionalProperty(ctx, 'homePaths'), 'path'),
    ];
    for (const candidate of candidates) {
        try {
            const value = typeof candidate === 'function' ? candidate() : candidate;
            if (typeof value === 'string' && value.trim().length > 0)
                return expandHome(value.trim());
        }
        catch {
            // Never use an ambient process workspace when a host helper is absent.
        }
    }
    const fromEnv = process.env.DSH_HOME;
    if (typeof fromEnv === 'string' && fromEnv.trim().length > 0)
        return expandHome(fromEnv.trim());
    return join(homedir(), '.dsh');
}
function normalizeInputPaths(input) {
    const result = { ...input };
    if (result.dshHome !== undefined)
        result.dshHome = expandHome(result.dshHome);
    if (result.runsRoot !== undefined)
        result.runsRoot = expandHome(result.runsRoot);
    if (result.bundledDefinitionsDir !== undefined) {
        result.bundledDefinitionsDir = expandHome(result.bundledDefinitionsDir);
    }
    return result;
}
function readService(ctx, service) {
    const getter = optionalProperty(ctx, 'get');
    if (typeof getter === 'function') {
        try {
            const value = getter.call(ctx, service);
            if (value !== undefined)
                return value;
        }
        catch {
            // Small plain fixtures do not implement Cordis reflection.
        }
    }
    return optionalProperty(ctx, service);
}
function requireService(ctx, service) {
    const value = readService(ctx, service);
    if (value === undefined || value === null) {
        throw new Error(`workflow package requires the Host service "${service}"`);
    }
    return value;
}
function requireFunction(value, member, service) {
    if (typeof value !== 'function') {
        throw new Error(`workflow package requires ${service}.${member} from official DeepSeek Harness 0.1.1-rc.2`);
    }
}
function hasRemoteEventRegistry(ctx) {
    const remoteEvents = readService(ctx, 'apiRemoteEvents');
    if (remoteEvents === undefined || remoteEvents === null)
        return false;
    requireFunction(optionalProperty(remoteEvents, 'register'), 'register', 'apiRemoteEvents');
    return true;
}
/** Required service faces on official dsh 0.1.1-rc.2. */
function assertStockFaces(ctx) {
    requireService(ctx, 'agents');
    requireFunction(optionalProperty(requireService(ctx, 'commands'), 'register'), 'register', 'commands');
    requireService(ctx, 'fs');
    const skills = requireService(ctx, 'skills');
    if (typeof optionalProperty(skills, 'registerTrustedPackageSkill') !== 'function'
        && typeof optionalProperty(skills, 'registerProvider') !== 'function') {
        throw new Error('workflow package requires skills.registerProvider on official DeepSeek Harness 0.1.1-rc.2');
    }
    const subagents = requireService(ctx, 'subagents');
    requireFunction(optionalProperty(subagents, 'getProvider'), 'getProvider', 'subagents');
    requireFunction(optionalProperty(subagents, 'start'), 'start', 'subagents');
    requireService(ctx, 'userQuestions');
    requireFunction(optionalProperty(requireService(ctx, 'workflowEngine'), 'start'), 'start', 'workflowEngine');
    // Headless may omit the Web Remote lane; a present partial service is a
    // composition error and must fail before storage is opened.
    hasRemoteEventRegistry(ctx);
    if (optionalProperty(ctx, 'provide') === undefined
        && optionalProperty(optionalProperty(ctx, 'reflect'), 'provide') === undefined) {
        throw new Error('workflow package requires a Cordis service-registration context');
    }
}
function asCleanup(value) {
    if (typeof value === 'function')
        return value;
    if (isRecord(value) && typeof value.dispose === 'function') {
        return () => value.dispose.call(value);
    }
    return undefined;
}
function ownEffect(ctx, dispose, label) {
    const effect = optionalProperty(ctx, 'effect');
    if (typeof effect === 'function')
        effect.call(ctx, () => dispose, label);
}
async function invokeCleanup(value) {
    const cleanup = asCleanup(value);
    if (cleanup !== undefined)
        await cleanup();
}
/** Provide a package-owned service, with a plain-fixture fallback. */
function provideService(ctx, service, value) {
    const provide = optionalProperty(ctx, 'provide');
    if (typeof provide === 'function') {
        const disposer = provide.call(ctx, service, value);
        return () => invokeCleanup(disposer);
    }
    const hadOwn = Object.prototype.hasOwnProperty.call(ctx, service);
    const previous = optionalProperty(ctx, service);
    ctx[service] = value;
    return async () => {
        if (hadOwn)
            ctx[service] = previous;
        else {
            try {
                delete ctx[service];
            }
            catch {
                ctx[service] = undefined;
            }
        }
    };
}
/** Load the private evaluator only on the verified stock host. */
async function createCompatibilityEngine(ctx, config) {
    const subagents = readService(ctx, 'subagents');
    if (subagents === undefined || typeof optionalProperty(subagents, 'getProvider') !== 'function'
        || typeof optionalProperty(subagents, 'start') !== 'function') {
        throw new WorkflowPackageError('official DeepSeek Harness 0.1.1-rc.2 requires the subagents service for plugin workflows', 'WORKFLOW_INCOMPATIBLE_HOST');
    }
    const asset = import.meta.url.endsWith('.ts')
        ? new URL('../lib/compat-engine/index.js', import.meta.url)
        : new URL('../compat-engine/index.js', import.meta.url);
    const module = await import(asset.href);
    return new module.default(ctx, {
        provider: 'spawn',
        maxConcurrentAgents: config.maxConcurrentAgents,
        maxTotalAgents: config.maxAgentBudget,
        maxJournalBytes: config.maxJournalBytes,
        maxChildPromptBytes: config.maxPromptBytes,
        maxEventTextBytes: config.maxEventTextBytes,
        scratchMaxOperations: config.scratchMaxOperations,
        scratchMaxPendingOperations: config.scratchMaxPendingOperations,
        scratchMaxFiles: config.scratchMaxFiles,
        scratchMaxFileBytes: config.scratchMaxFileBytes,
        scratchMaxTotalBytes: config.scratchMaxTotalBytes,
    });
}
/** Build an idempotent, supervisor-first/storage-last aggregate disposer. */
function makeTeardown(resources) {
    let task;
    return () => {
        if (task !== undefined)
            return task;
        task = (async () => {
            let first;
            const attempt = async (operation) => {
                if (operation === undefined)
                    return;
                try {
                    await operation();
                }
                catch (error) {
                    first ??= error;
                }
            };
            try {
                resources.supervisor?.closeAdmissionSync();
            }
            catch (error) {
                first ??= error;
            }
            await attempt(resources.supervisor === undefined ? undefined : () => resources.supervisor.dispose());
            await attempt(resources.recorder === undefined ? undefined : () => resources.recorder.dispose());
            await attempt(resources.questions);
            await attempt(resources.commands);
            await attempt(resources.tool);
            await attempt(resources.skill);
            await attempt(resources.remoteEvents);
            await attempt(resources.remotes);
            await attempt(resources.recorderService);
            await attempt(resources.supervisorService);
            await attempt(resources.registry === undefined ? undefined : () => resources.registry.dispose());
            await attempt(resources.registryService);
            await attempt(resources.storeService);
            await attempt(resources.storageService);
            // Storage.dispose() closes all private directories and releases the
            // lifetime lease last.
            await attempt(resources.storage === undefined ? undefined : () => resources.storage.dispose());
            if (first !== undefined)
                throw first;
        })();
        return task;
    };
}
/** Compose the complete Host-side workflow product as one lifecycle unit. */
export async function apply(ctx, input = {}) {
    // Compatibility is checked before config/home inspection and before any
    // plugin storage or package-asset I/O. Disabled is a supported-Host policy,
    // not an escape hatch for loading this artifact on an unsupported release.
    assertCompatibleHost();
    const config = resolveWorkflowPackageConfig(normalizeInputPaths(input), hostHome(ctx));
    if (config.enabled === false)
        return;
    // Preflight faces before the process-global storage lease.
    // The Host never imports ./client here.
    assertStockFaces(ctx);
    await readPackagedSkill();
    const resources = {};
    const teardown = makeTeardown(resources);
    try {
        // Import and construct the package evaluator before opening storage. The
        // supported stock engine is never used for plugin workflow execution.
        resources.compatibilityEngine = await createCompatibilityEngine(ctx, config);
        // Official 0.1.1-rc.2 exposes fs.openPrivateDirectory(), but its production
        // capability does not include the complete inventory/publication/removal
        // face this retained run store requires. Keep the Host filesystem for
        // workspace definitions and script_path authorization/path normalization;
        // stock RC2 script_path content uses the package's bounded local
        // O_NOFOLLOW compatibility reader. Persistent run storage uses the
        // package-owned local descriptor implementation on this exact Host.
        resources.storage = await openWorkflowStorage(config);
        resources.storageService = provideService(ctx, 'workflowStorage', resources.storage);
        resources.storeService = provideService(ctx, 'workflowStore', resources.storage.store);
        ownEffect(ctx, resources.storageService, 'dsh-workflows: workflowStorage');
        ownEffect(ctx, resources.storeService, 'dsh-workflows: workflowStore');
        resources.registry = new WorkflowRegistry(ctx, config);
        resources.registryService = provideService(ctx, 'workflows', resources.registry);
        ownEffect(ctx, resources.registryService, 'dsh-workflows: registry');
        resources.supervisor = new WorkflowSupervisor(ctx, config, resources.storage.store, resources.compatibilityEngine);
        resources.supervisorService = provideService(ctx, 'workflowSupervisor', resources.supervisor);
        await resources.supervisor.initialize();
        ownEffect(ctx, resources.supervisorService, 'dsh-workflows: supervisor');
        resources.recorder = new WorkflowRunRecorder(ctx);
        resources.recorderService = provideService(ctx, 'workflowRunRecorder', resources.recorder);
        ownEffect(ctx, resources.recorderService, 'dsh-workflows: recorder');
        resources.questions = asCleanup(applyUserQuestions(ctx));
        resources.commands = asCleanup(applyCommands(ctx, { enabled: true, registerSkill: false }));
        ownEffect(ctx, resources.questions, 'dsh-workflows: user-questions');
        ownEffect(ctx, resources.commands, 'dsh-workflows: commands');
        // The helper re-reads the asset to retain the standalone registration API;
        // the pre-read above guarantees missing assets fail before storage.
        resources.skill = asCleanup(registerTrustedWorkflowSkillSync(ctx));
        ownEffect(ctx, resources.skill, 'dsh-workflows: create-workflow skill');
        resources.tool = asCleanup(applyToolShadow(ctx, {
            enabled: true,
            services: { registry: resources.registry, supervisor: resources.supervisor, recorder: resources.recorder },
        }));
        ownEffect(ctx, resources.tool, 'dsh-workflows: tool shadow');
        resources.definitionsRemote = new WorkflowDefinitionsRemote(ctx);
        resources.runsRemote = new WorkflowRunsRemote(ctx);
        resources.remotes = async () => {
            await invokeCleanup(resources.runsRemote);
            await invokeCleanup(resources.definitionsRemote);
        };
        ownEffect(ctx, resources.remotes, 'dsh-workflows: remotes');
        if (hasRemoteEventRegistry(ctx)) {
            resources.remoteEvents = asCleanup(registerWorkflowRemoteEvents(ctx, {
                remoteQueueMaxSessions: config.remoteQueueMaxSessions,
            }));
            ownEffect(ctx, resources.remoteEvents, 'dsh-workflows: remote events');
        }
        try {
            applyInvariant(ctx);
        }
        catch { /* invariants is optional and not injected */ }
        const effect = optionalProperty(ctx, 'effect');
        if (typeof effect === 'function')
            effect.call(ctx, () => teardown, 'dsh-workflows: aggregate teardown');
    }
    catch (error) {
        const done = teardown();
        await Promise.resolve(done).catch(() => undefined);
        await Promise.resolve(teardown()).catch(() => undefined);
        throw error;
    }
}
// Loaders may pass the function itself as the Cordis plugin object.
;
apply.inject = inject;
apply.Config = Config;
export * from './types.js';
export * from './registry/index.js';
export { WorkflowSupervisor } from './supervisor/index.js';
export { WorkflowDefinitionsRemote } from './registry/remote.js';
export { WorkflowRunsRemote } from './supervisor/remote.js';
//# sourceMappingURL=index.js.map