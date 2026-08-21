import { homedir } from 'node:os';
import { join } from 'node:path';
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
export const version = '0.1.0-rc.1';
/** The exact Host services required by the aggregate. Loader waits for these. */
export const inject = [
    'agents',
    'commands',
    'fs',
    'skills',
    'userQuestions',
    'workflowEngine',
    'apiRemoteEvents',
];
/** Manifest `dsh.compatibility` mirrored for the runtime marker check. */
export const HOST_COMPATIBILITY = Object.freeze({
    release: 'H',
    reject: Object.freeze(['0.1.0-rc.8']),
    verifiedLaterReleases: Object.freeze([]),
});
const INCOMPATIBLE_MESSAGE = '@zaalipro/dsh-workflows requires a DeepSeek Harness release with the external workflow prerequisites; 0.1.0-rc.8 is not compatible';
const UNVERIFIED_DSH_RELEASE = /^0\.1\.\d+(?:-rc\.\d+)?$/u;
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
function markerFromContext(ctx) {
    // H may expose its declaration directly, on the workflow service, or under
    // the package-compatible legacy spelling.  We never infer H from methods.
    const direct = optionalProperty(ctx, 'workflowPrerequisites');
    if (isRecord(direct))
        return direct;
    const engine = optionalProperty(ctx, 'workflowEngine');
    const fromEngine = optionalProperty(engine, 'prerequisites');
    if (isRecord(fromEngine))
        return fromEngine;
    const legacy = optionalProperty(ctx, 'dshWorkflowPrerequisites');
    return isRecord(legacy) ? legacy : undefined;
}
function isRejectedHostRelease(value) {
    if (typeof value === 'string') {
        return !HOST_COMPATIBILITY.verifiedLaterReleases.includes(value)
            && (HOST_COMPATIBILITY.reject.includes(value) || UNVERIFIED_DSH_RELEASE.test(value));
    }
    if (!isRecord(value))
        return false;
    return ['version', 'hostVersion', 'harnessVersion', 'releaseVersion']
        .some(key => isRejectedHostRelease(value[key]));
}
/** Verify H's explicit compatibility declaration before package I/O. */
export function assertCompatibleHost(ctx) {
    const marker = markerFromContext(ctx);
    // Never infer H from method presence. Research 0.1.1-rc.1 is not H.
    if (!marker || marker.release !== HOST_COMPATIBILITY.release || isRejectedHostRelease(marker)
        || marker.compatible === false || marker.externalWorkflows === false
        || marker.workflowPackage === false) {
        throw new WorkflowPackageError(INCOMPATIBLE_MESSAGE, 'WORKFLOW_INCOMPATIBLE_HOST');
    }
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
        throw new Error(`workflow package requires ${service}.${member} from Harness release H`);
    }
}
function requireHostFace(ctx, service, member) {
    requireFunction(optionalProperty(requireService(ctx, service), member), member, service);
}
function hasRemoteEventRegistry(ctx) {
    const remoteEvents = readService(ctx, 'apiRemoteEvents');
    if (remoteEvents === undefined || remoteEvents === null)
        return false;
    requireFunction(optionalProperty(remoteEvents, 'register'), 'register', 'apiRemoteEvents');
    return true;
}
/** Check prerequisite service faces before taking the global storage lease. */
function assertHostFaces(ctx) {
    const agents = requireService(ctx, 'agents');
    const commands = requireService(ctx, 'commands');
    const fs = requireService(ctx, 'fs');
    const skills = requireService(ctx, 'skills');
    const questions = requireService(ctx, 'userQuestions');
    const engine = requireService(ctx, 'workflowEngine');
    requireFunction(optionalProperty(commands, 'register'), 'register', 'commands');
    requireFunction(optionalProperty(commands, 'registerFallback'), 'registerFallback', 'commands');
    requireFunction(optionalProperty(skills, 'registerTrustedPackageSkill'), 'registerTrustedPackageSkill', 'skills');
    requireFunction(optionalProperty(questions, 'ask'), 'ask', 'userQuestions');
    requireFunction(optionalProperty(engine, 'start'), 'start', 'workflowEngine');
    requireFunction(optionalProperty(engine, 'validate'), 'validate', 'workflowEngine');
    requireHostFace(ctx, 'tools', 'replace');
    requireHostFace(ctx, 'systemPrompt', 'replaceSection');
    // These are the H descriptor/no-follow faces.  The Host aggregate must not
    // silently downgrade to the local fallback when a service is present.
    for (const member of ['resolve', 'contains', 'lstat', 'listDir', 'readBytesNoFollow', 'openPrivateDirectory']) {
        requireFunction(optionalProperty(fs, member), member, 'fs');
    }
    if (readService(ctx, 'agents') !== agents)
        throw new Error('workflow package received an unstable agents service');
    // Headless may omit the Web Remote lane.  Fail closed only when the service
    // is present without register(); skip event registration when it is absent.
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
    // Keep this before home resolution, skill I/O, and all filesystem access.
    assertCompatibleHost(ctx);
    const config = resolveWorkflowPackageConfig(normalizeInputPaths(input), hostHome(ctx));
    if (config.enabled === false)
        return;
    // Preflight every required face and installed asset before taking the
    // process-global storage lease.  The Host never imports ./client here.
    assertHostFaces(ctx);
    await readPackagedSkill();
    const resources = {};
    const teardown = makeTeardown(resources);
    try {
        // The compatible Host's descriptor-rooted filesystem is authoritative for
        // nested workflow storage.  The storage module retains a local-only seam
        // for standalone fixtures when this argument is absent, never as a silent
        // downgrade in a real Host context.
        resources.storage = await openWorkflowStorage(config, readService(ctx, 'fs'));
        resources.storageService = provideService(ctx, 'workflowStorage', resources.storage);
        resources.storeService = provideService(ctx, 'workflowStore', resources.storage.store);
        ownEffect(ctx, resources.storageService, 'dsh-workflows: workflowStorage');
        ownEffect(ctx, resources.storeService, 'dsh-workflows: workflowStore');
        resources.registry = new WorkflowRegistry(ctx, config);
        resources.registryService = provideService(ctx, 'workflows', resources.registry);
        ownEffect(ctx, resources.registryService, 'dsh-workflows: registry');
        resources.supervisor = new WorkflowSupervisor(ctx, config, resources.storage.store);
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
        // This is a protected H binding, not a low-rank ordinary skill.  The
        // helper re-reads the asset to retain the standalone registration API;
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
        applyInvariant(ctx);
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