import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import {
  resolveWorkflowPackageConfig,
  Config,
  type Config as WorkflowConfig,
  type ResolvedWorkflowPackageConfig,
} from './config.js'
import { WorkflowPackageError, type WorkflowPackageErrorCode, applyInvariant } from './invariant.js'
import { WorkflowRegistry } from './registry/index.js'
import { WorkflowDefinitionsRemote } from './registry/remote.js'
import { WorkflowSupervisor, type SupervisorConfig } from './supervisor/index.js'
import { WorkflowRunsRemote } from './supervisor/remote.js'
import { openWorkflowStorage, type WorkflowStorage } from './supervisor/storage/index.js'
import { WorkflowRunRecorder } from './run-recorder.js'
import { apply as applyUserQuestions } from './user-questions.js'
import {
  applyCommands,
  readPackagedSkill,
  registerTrustedWorkflowSkillSync,
} from './commands/index.js'
import { applyToolShadow } from './tool/index.js'
import { registerWorkflowRemoteEvents } from './remote-events.js'

export { Config, resolveWorkflowPackageConfig, WorkflowPackageError, applyInvariant }
export type { WorkflowConfig, ResolvedWorkflowPackageConfig, WorkflowPackageErrorCode }
export const name = 'dsh-workflows'
export const version = '0.1.0-rc.1'

/** Host services the loader must wait for. Remote events are optional (absent on stock dsh). */
export const inject = [
  'agents',
  'commands',
  'fs',
  'skills',
  'userQuestions',
  'workflowEngine',
] as const

/** Manifest `dsh.compatibility` mirrored for the runtime marker check. */
export const HOST_COMPATIBILITY = Object.freeze({
  release: 'H',
  reject: Object.freeze(['0.1.0-rc.8']),
  verifiedLaterReleases: Object.freeze([] as readonly string[]),
})

const INCOMPATIBLE_MESSAGE =
  '@zaalipro/dsh-workflows requires a DeepSeek Harness release with the external workflow prerequisites; 0.1.0-rc.8 is not compatible'

const UNVERIFIED_DSH_RELEASE = /^0\.1\.\d+(?:-rc\.\d+)?$/u

type AnyRecord = Record<PropertyKey, unknown>
type Cleanup = () => void | Promise<void>

function isRecord(value: unknown): value is AnyRecord {
  return typeof value === 'object' && value !== null
}

/** Read an optional Cordis property without making a missing service throw. */
function optionalProperty(target: unknown, key: PropertyKey): unknown {
  if (!isRecord(target) && typeof target !== 'function') return undefined
  try { return (target as AnyRecord)[key] } catch { return undefined }
}

function markerFromContext(ctx: unknown): AnyRecord | undefined {
  // H may expose its declaration directly, on the workflow service, or under
  // the package-compatible legacy spelling.  We never infer H from methods.
  const direct = optionalProperty(ctx, 'workflowPrerequisites')
  if (isRecord(direct)) return direct
  const engine = optionalProperty(ctx, 'workflowEngine')
  const fromEngine = optionalProperty(engine, 'prerequisites')
  if (isRecord(fromEngine)) return fromEngine
  const legacy = optionalProperty(ctx, 'dshWorkflowPrerequisites')
  return isRecord(legacy) ? legacy : undefined
}

function isRejectedHostRelease(value: unknown): boolean {
  if (typeof value === 'string') {
    return !(HOST_COMPATIBILITY.verifiedLaterReleases as readonly string[]).includes(value)
      && ((HOST_COMPATIBILITY.reject as readonly string[]).includes(value) || UNVERIFIED_DSH_RELEASE.test(value))
  }
  if (!isRecord(value)) return false
  return ['version', 'hostVersion', 'harnessVersion', 'releaseVersion']
    .some(key => isRejectedHostRelease(value[key]))
}

/** True when the Host declared the symbolic H workflow package contract. */
export function isCompatibleHost(ctx: Context | any): boolean {
  try {
    assertCompatibleHost(ctx)
    return true
  } catch {
    return false
  }
}

/** Verify H's explicit compatibility declaration before package I/O. */
export function assertCompatibleHost(ctx: Context | any): void {
  const marker = markerFromContext(ctx)
  // Never infer H from method presence. Research 0.1.1-rc.1 is not H.
  if (!marker || marker.release !== HOST_COMPATIBILITY.release || isRejectedHostRelease(marker)
    || marker.compatible === false || marker.externalWorkflows === false
    || marker.workflowPackage === false) {
    throw new WorkflowPackageError(INCOMPATIBLE_MESSAGE, 'WORKFLOW_INCOMPATIBLE_HOST')
  }
}

function expandHome(value: string): string {
  if (value === '~') return homedir()
  if (value.startsWith('~/') || value.startsWith('~\\')) return join(homedir(), value.slice(2))
  return value
}

function hostHome(ctx: any): string {
  const candidates = [
    optionalProperty(ctx, 'dshHome'),
    optionalProperty(ctx, 'dshHomePath'),
    optionalProperty(optionalProperty(ctx, 'homePaths'), 'dshHome'),
    optionalProperty(optionalProperty(ctx, 'homePaths'), 'path'),
  ]
  for (const candidate of candidates) {
    try {
      const value = typeof candidate === 'function' ? candidate() : candidate
      if (typeof value === 'string' && value.trim().length > 0) return expandHome(value.trim())
    } catch {
      // Never use an ambient process workspace when a host helper is absent.
    }
  }
  const fromEnv = process.env.DSH_HOME
  if (typeof fromEnv === 'string' && fromEnv.trim().length > 0) return expandHome(fromEnv.trim())
  return join(homedir(), '.dsh')
}

function normalizeInputPaths(input: WorkflowConfig): WorkflowConfig {
  const result: WorkflowConfig = { ...input }
  if (result.dshHome !== undefined) (result as { dshHome?: string }).dshHome = expandHome(result.dshHome)
  if (result.runsRoot !== undefined) (result as { runsRoot?: string }).runsRoot = expandHome(result.runsRoot)
  if (result.bundledDefinitionsDir !== undefined) {
    (result as { bundledDefinitionsDir?: string }).bundledDefinitionsDir = expandHome(result.bundledDefinitionsDir)
  }
  return result
}

function readService(ctx: any, service: string): unknown {
  const getter = optionalProperty(ctx, 'get')
  if (typeof getter === 'function') {
    try {
      const value = getter.call(ctx, service)
      if (value !== undefined) return value
    } catch {
      // Small plain fixtures do not implement Cordis reflection.
    }
  }
  return optionalProperty(ctx, service)
}

function requireService(ctx: any, service: string): any {
  const value = readService(ctx, service)
  if (value === undefined || value === null) {
    throw new Error(`workflow package requires the Host service "${service}"`)
  }
  return value
}

function requireFunction(value: unknown, member: string, service: string): void {
  if (typeof value !== 'function') {
    throw new Error(`workflow package requires ${service}.${member} from Harness release H`)
  }
}

function requireHostFace(ctx: any, service: string, member: string): void {
  requireFunction(optionalProperty(requireService(ctx, service), member), member, service)
}

function hasRemoteEventRegistry(ctx: any): boolean {
  const remoteEvents = readService(ctx, 'apiRemoteEvents')
  if (remoteEvents === undefined || remoteEvents === null) return false
  requireFunction(optionalProperty(remoteEvents, 'register'), 'register', 'apiRemoteEvents')
  return true
}

/** Check prerequisite service faces before taking the global storage lease. */
function assertHostFaces(ctx: any): void {
  const agents = requireService(ctx, 'agents')
  const commands = requireService(ctx, 'commands')
  const fs = requireService(ctx, 'fs')
  const skills = requireService(ctx, 'skills')
  const questions = requireService(ctx, 'userQuestions')
  const engine = requireService(ctx, 'workflowEngine')
  requireFunction(optionalProperty(commands, 'register'), 'register', 'commands')
  requireFunction(optionalProperty(commands, 'registerFallback'), 'registerFallback', 'commands')
  requireFunction(optionalProperty(skills, 'registerTrustedPackageSkill'), 'registerTrustedPackageSkill', 'skills')
  requireFunction(optionalProperty(questions, 'ask'), 'ask', 'userQuestions')
  requireFunction(optionalProperty(engine, 'start'), 'start', 'workflowEngine')
  requireFunction(optionalProperty(engine, 'validate'), 'validate', 'workflowEngine')
  requireHostFace(ctx, 'tools', 'replace')
  requireHostFace(ctx, 'systemPrompt', 'replaceSection')
  // These are the H descriptor/no-follow faces.  The Host aggregate must not
  // silently downgrade to the local fallback when a service is present.
  for (const member of ['resolve', 'contains', 'lstat', 'listDir', 'readBytesNoFollow', 'openPrivateDirectory']) {
    requireFunction(optionalProperty(fs, member), member, 'fs')
  }
  if (readService(ctx, 'agents') !== agents) throw new Error('workflow package received an unstable agents service')
  // Headless may omit the Web Remote lane.  Fail closed only when the service
  // is present without register(); skip event registration when it is absent.
  hasRemoteEventRegistry(ctx)
  if (optionalProperty(ctx, 'provide') === undefined
    && optionalProperty(optionalProperty(ctx, 'reflect'), 'provide') === undefined) {
    throw new Error('workflow package requires a Cordis service-registration context')
  }
}

/** Faces that exist on stock dsh 0.1.1-rc.2. Missing H seams degrade, they do not hang boot. */
function assertStockFaces(ctx: any): void {
  requireService(ctx, 'agents')
  requireFunction(optionalProperty(requireService(ctx, 'commands'), 'register'), 'register', 'commands')
  requireService(ctx, 'fs')
  requireService(ctx, 'skills')
  requireService(ctx, 'userQuestions')
  requireFunction(optionalProperty(requireService(ctx, 'workflowEngine'), 'start'), 'start', 'workflowEngine')
  if (optionalProperty(ctx, 'provide') === undefined
    && optionalProperty(optionalProperty(ctx, 'reflect'), 'provide') === undefined) {
    throw new Error('workflow package requires a Cordis service-registration context')
  }
}

function asCleanup(value: unknown): Cleanup | undefined {
  if (typeof value === 'function') return value as Cleanup
  if (isRecord(value) && typeof value.dispose === 'function') {
    return () => (value.dispose as () => void | Promise<void>).call(value)
  }
  return undefined
}

function ownEffect(ctx: any, dispose: Cleanup, label: string): void {
  const effect = optionalProperty(ctx, 'effect')
  if (typeof effect === 'function') effect.call(ctx, () => dispose, label)
}

async function invokeCleanup(value: unknown): Promise<void> {
  const cleanup = asCleanup(value)
  if (cleanup !== undefined) await cleanup()
}

/** Provide a package-owned service, with a plain-fixture fallback. */
function provideService(ctx: any, service: string, value: unknown): Cleanup {
  const provide = optionalProperty(ctx, 'provide')
  if (typeof provide === 'function') {
    const disposer = provide.call(ctx, service, value)
    return () => invokeCleanup(disposer)
  }
  const hadOwn = Object.prototype.hasOwnProperty.call(ctx, service)
  const previous = optionalProperty(ctx, service)
  ctx[service] = value
  return async () => {
    if (hadOwn) ctx[service] = previous
    else {
      try { delete ctx[service] } catch { ctx[service] = undefined }
    }
  }
}

interface OwnedResources {
  storage?: WorkflowStorage
  storageService?: Cleanup
  storeService?: Cleanup
  registry?: WorkflowRegistry
  registryService?: Cleanup
  supervisor?: WorkflowSupervisor
  supervisorService?: Cleanup
  recorder?: WorkflowRunRecorder
  recorderService?: Cleanup
  questions?: Cleanup
  commands?: Cleanup
  skill?: Cleanup
  tool?: Cleanup
  definitionsRemote?: unknown
  runsRemote?: unknown
  remotes?: Cleanup
  remoteEvents?: Cleanup
}

/** Build an idempotent, supervisor-first/storage-last aggregate disposer. */
function makeTeardown(resources: OwnedResources): Cleanup {
  let task: Promise<void> | undefined
  return () => {
    if (task !== undefined) return task
    task = (async () => {
      let first: unknown
      const attempt = async (operation: (() => unknown) | undefined): Promise<void> => {
        if (operation === undefined) return
        try { await operation() } catch (error) { first ??= error }
      }
      try { resources.supervisor?.closeAdmissionSync() } catch (error) { first ??= error }
      await attempt(resources.supervisor === undefined ? undefined : () => resources.supervisor!.dispose())
      await attempt(resources.recorder === undefined ? undefined : () => resources.recorder!.dispose())
      await attempt(resources.questions)
      await attempt(resources.commands)
      await attempt(resources.tool)
      await attempt(resources.skill)
      await attempt(resources.remoteEvents)
      await attempt(resources.remotes)
      await attempt(resources.recorderService)
      await attempt(resources.supervisorService)
      await attempt(resources.registry === undefined ? undefined : () => resources.registry!.dispose())
      await attempt(resources.registryService)
      await attempt(resources.storeService)
      await attempt(resources.storageService)
      // Storage.dispose() closes all private directories and releases the
      // lifetime lease last.
      await attempt(resources.storage === undefined ? undefined : () => resources.storage!.dispose())
      if (first !== undefined) throw first
    })()
    return task
  }
}

/** Compose the complete Host-side workflow product as one lifecycle unit. */
export async function apply(ctx: Context | any, input: WorkflowConfig = {}): Promise<void> {
  const compatible = isCompatibleHost(ctx)
  if (!compatible) {
    const log = optionalProperty(ctx, 'logger') as { warn?(message: string): void } | undefined
    log?.warn?.(INCOMPATIBLE_MESSAGE)
  }
  const config = resolveWorkflowPackageConfig(normalizeInputPaths(input), hostHome(ctx))
  if (config.enabled === false) return

  // Preflight faces before the process-global storage lease.
  // The Host never imports ./client here.
  if (compatible) assertHostFaces(ctx)
  else assertStockFaces(ctx)
  await readPackagedSkill()

  const resources: OwnedResources = {}
  const teardown = makeTeardown(resources)
  try {
    // The compatible Host's descriptor-rooted filesystem is authoritative for
    // nested workflow storage.  The storage module retains a local-only seam
    // for standalone fixtures when this argument is absent, never as a silent
    // downgrade in a real Host context.
    const hostFs = readService(ctx, 'fs')
    const privateHostFs = typeof optionalProperty(hostFs, 'openPrivateDirectory') === 'function' ? hostFs : undefined
    resources.storage = await openWorkflowStorage(config, privateHostFs)
    resources.storageService = provideService(ctx, 'workflowStorage', resources.storage)
    resources.storeService = provideService(ctx, 'workflowStore', resources.storage.store)
    ownEffect(ctx, resources.storageService, 'dsh-workflows: workflowStorage')
    ownEffect(ctx, resources.storeService, 'dsh-workflows: workflowStore')

    resources.registry = new WorkflowRegistry(ctx, config)
    resources.registryService = provideService(ctx, 'workflows', resources.registry)
    ownEffect(ctx, resources.registryService, 'dsh-workflows: registry')

    resources.supervisor = new WorkflowSupervisor(ctx, config as SupervisorConfig, resources.storage.store)
    resources.supervisorService = provideService(ctx, 'workflowSupervisor', resources.supervisor)
    await resources.supervisor.initialize()
    ownEffect(ctx, resources.supervisorService, 'dsh-workflows: supervisor')

    resources.recorder = new WorkflowRunRecorder(ctx)
    resources.recorderService = provideService(ctx, 'workflowRunRecorder', resources.recorder)
    ownEffect(ctx, resources.recorderService, 'dsh-workflows: recorder')

    resources.questions = asCleanup(applyUserQuestions(ctx)) as Cleanup
    resources.commands = asCleanup(applyCommands(ctx, { enabled: true, registerSkill: false } as any)) as Cleanup
    ownEffect(ctx, resources.questions, 'dsh-workflows: user-questions')
    ownEffect(ctx, resources.commands, 'dsh-workflows: commands')

    // This is a protected H binding, not a low-rank ordinary skill.  The
    // helper re-reads the asset to retain the standalone registration API;
    // the pre-read above guarantees missing assets fail before storage.
    resources.skill = asCleanup(registerTrustedWorkflowSkillSync(ctx, { required: compatible })) as Cleanup
    ownEffect(ctx, resources.skill, 'dsh-workflows: create-workflow skill')

    resources.tool = asCleanup(applyToolShadow(ctx, {
      enabled: true,
      services: { registry: resources.registry!, supervisor: resources.supervisor!, recorder: resources.recorder },
    })) as Cleanup
    ownEffect(ctx, resources.tool, 'dsh-workflows: tool shadow')

    resources.definitionsRemote = new WorkflowDefinitionsRemote(ctx as Context)
    resources.runsRemote = new WorkflowRunsRemote(ctx as Context)
    resources.remotes = async () => {
      await invokeCleanup(resources.runsRemote)
      await invokeCleanup(resources.definitionsRemote)
    }
    ownEffect(ctx, resources.remotes, 'dsh-workflows: remotes')
    if (hasRemoteEventRegistry(ctx)) {
      resources.remoteEvents = asCleanup(registerWorkflowRemoteEvents(ctx, {
        remoteQueueMaxSessions: config.remoteQueueMaxSessions,
      })) as Cleanup
      ownEffect(ctx, resources.remoteEvents, 'dsh-workflows: remote events')
    }

    applyInvariant(ctx)

    const effect = optionalProperty(ctx, 'effect')
    if (typeof effect === 'function') effect.call(ctx, () => teardown, 'dsh-workflows: aggregate teardown')
  } catch (error) {
    const done = teardown()
    await Promise.resolve(done).catch(() => undefined)
    await Promise.resolve(teardown()).catch(() => undefined)
    throw error
  }
}

// Loaders may pass the function itself as the Cordis plugin object.
;(apply as unknown as { inject?: typeof inject; Config?: typeof Config }).inject = inject
;(apply as unknown as { inject?: typeof inject; Config?: typeof Config }).Config = Config

export * from './types.js'
export * from './registry/index.js'
export { WorkflowSupervisor } from './supervisor/index.js'
export type { SupervisorConfig, WorkflowLaunchSpec, WorkflowValidateSpec } from './supervisor/index.js'
export { WorkflowDefinitionsRemote } from './registry/remote.js'
export { WorkflowRunsRemote } from './supervisor/remote.js'
