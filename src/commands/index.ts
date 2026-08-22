import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { readFileSync } from 'node:fs'
import { parseWorkflowCommand, WORKFLOW_COMMAND_HELP } from './parser.js'
import { allocateWorkflowCommandNames } from './aliases.js'
import type { WorkflowDefinitionSummary } from '../registry/types.js'
import type { WorkflowRegistry } from '../registry/index.js'
import type { WorkflowSupervisor } from '../supervisor/index.js'

export * from './parser.js'
export * from './aliases.js'

export const name = 'commands'
export interface CommandsConfig {
  readonly enabled?: boolean
  /** Root composition registers the protected skill as a separate child. */
  readonly registerSkill?: boolean
}
export const CommandsConfig = { enabled: true } as const
export interface CommandResult { readonly content: string; readonly isError?: boolean }
export const COMMAND_SUCCESS = {
  pause: (display: string) => `Paused workflow "${display}". Open /workflows to resume or stop it.`,
  resume: (display: string) => `Resumed workflow "${display}". Open /workflows to watch it.`,
  stop: (display: string) => `Stopped workflow "${display}".`,
}
export const CREATE_WORKFLOW_COMMAND_DESCRIPTION =
  'Author, smoke-check, and save a new workflow (create-workflow skill)'
export const WORKFLOWS_COMMAND_DESCRIPTION = 'Open the live workflow run dashboard'
export const WORKFLOWS_COMMAND_SUCCESS = 'Opened the workflow dashboard.'
const DEFAULT_SKILL_DESCRIPTION =
  'Author, smoke-check, and save a new saved workflow (invoke via /create-workflow).'
type OfficialCommandResult = { readonly kind: 'success'|'error'; readonly text?: string }
function renderThrown(error: unknown): string {
  try { return error instanceof Error ? error.message : String(error) }
  catch { return '[unrenderable workflow command failure]' }
}
function cwdOf(agent: any): { readonly cwd?: string } {
  const cwd = agent?.session?.header?.cwd
  return typeof cwd === 'string' && cwd.length > 0 ? { cwd } : {}
}
function commandSuccess(text: string): OfficialCommandResult { return { kind: 'success', text } }
function commandError(error: unknown): OfficialCommandResult { return { kind: 'error', text: renderThrown(error) } }
function officialFromCommandResult(result: CommandResult): OfficialCommandResult {
  return result.isError === true ? { kind: 'error', text: result.content } : commandSuccess(result.content)
}
function isAbortError(error: unknown, signal?: AbortSignal): boolean {
  return signal?.aborted === true
    || (typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError')
}

export interface WorkflowCommandServices {
  readonly registry: Pick<WorkflowRegistry, 'get'>
  readonly supervisor: Pick<WorkflowSupervisor, 'start'|'pause'|'resume'|'stop'|'save'>
  readonly agent: any
  readonly recorder?: { launch?(session: any, start: () => Promise<any>): Promise<any> }
  readonly cwd?: string
  readonly signal?: AbortSignal
}

/** Execute a parsed command in small standalone fixtures as well as a Host. */
export async function executeWorkflowCommand(input: string, services: WorkflowCommandServices): Promise<CommandResult> {
  const command = parseWorkflowCommand(input)
  if (command.kind === 'empty') return { content: WORKFLOW_COMMAND_HELP }
  if (command.kind === 'malformed') return { content: command.error, isError: true }
  const signal = services.signal
  try {
    signal?.throwIfAborted()
    if (command.kind === 'launch') {
      const definition = await services.registry.get(command.name, { cwd: services.cwd ?? cwdOf(services.agent).cwd, signal })
      if (definition === undefined) return { content: `no saved workflow named "${command.name}"`, isError: true }
      const start = () => services.supervisor.start({ definition, args: command.args, parent: services.agent, signal })
      const launched = typeof services.recorder?.launch === 'function'
        ? await services.recorder.launch(services.agent.session, start)
        : await start()
      return { content: `Started workflow "${launched.displayName}" in the background. Open /workflows to watch it.` }
    }
    if (command.kind === 'pause') {
      await services.supervisor.pause(command.displayName, services.agent, signal)
      return { content: COMMAND_SUCCESS.pause(command.displayName) }
    }
    if (command.kind === 'resume') {
      await services.supervisor.resume(command.displayName, services.agent, signal)
      return { content: COMMAND_SUCCESS.resume(command.displayName) }
    }
    if (command.kind === 'stop') {
      await services.supervisor.stop(command.displayName, services.agent, signal)
      return { content: COMMAND_SUCCESS.stop(command.displayName) }
    }
    const path = await services.supervisor.save(command.displayName, services.agent, undefined, signal)
    return { content: `Saved workflow "${command.displayName}" to ${path}.` }
  } catch (error) { return { content: renderThrown(error), isError: true } }
}

/** Resolve candidate packaged-skill URLs from source or an installed lib layout. */
export function packagedSkillCandidates(here: string | URL = import.meta.url): readonly URL[] {
  const base = typeof here === 'string' ? new URL(here) : here
  return [
    new URL('../../skills/create-workflow/SKILL.md', base),
    new URL('../../../skills/create-workflow/SKILL.md', base),
  ]
}

/** Resolve the shipped skill asset from source or an installed lib layout. */
export function packagedSkillPath(here: string | URL = import.meta.url): URL {
  return packagedSkillCandidates(here)[baseUsesLibLayout(here) ? 1 : 0] as URL
}

function baseUsesLibLayout(here: string | URL): boolean {
  const path = String(typeof here === 'string' ? here : here.pathname)
  return path.includes('/lib/')
}

function validSkill(text: string): boolean {
  return /^---\s*\n/u.test(text)
    && /^name:\s*create-workflow\s*$/mu.test(text)
    && /\/create-workflow/u.test(text)
    && /^user-invocable:\s*false\s*$/mu.test(text)
    && /^model-invocable:\s*true\s*$/mu.test(text)
}

/** Split YAML frontmatter from the registered Markdown body. */
export function parsePackagedSkillDocument(text: string): { readonly description: string; readonly content: string } {
  if (!validSkill(text)) throw new Error('invalid skill')
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/u.exec(text)
  const content = (match?.[1] ?? '').replace(/^\uFEFF/u, '').replace(/^(?:\r?\n)+/u, '')
  const description = text.match(/^description:\s*(.+)$/mu)?.[1]?.trim() || DEFAULT_SKILL_DESCRIPTION
  return { description, content }
}

export async function readPackagedSkillFrom(candidates: readonly URL[]): Promise<string> {
  const fs = await import('node:fs/promises')
  let last: unknown
  for (const candidate of candidates) {
    try {
      const text = await fs.readFile(candidate, 'utf8')
      if (!validSkill(text)) throw new Error('invalid skill')
      return text
    } catch (error) { last = error }
  }
  throw new Error(`packaged create-workflow skill is missing or invalid: ${renderThrown(last)}`)
}

export function readPackagedSkillSyncFrom(candidates: readonly URL[]): string {
  let last: unknown
  for (const candidate of candidates) {
    try {
      const text = readFileSync(candidate, 'utf8')
      if (!validSkill(text)) throw new Error('invalid skill')
      return text
    } catch (error) { last = error }
  }
  throw new Error(`packaged create-workflow skill is missing or invalid: ${renderThrown(last)}`)
}

export async function readPackagedSkill(): Promise<string> {
  return readPackagedSkillFrom(packagedSkillCandidates())
}

export function readPackagedSkillSync(): string {
  return readPackagedSkillSyncFrom(packagedSkillCandidates())
}

function registrationForSkill(text: string): Record<string, unknown> {
  const parsed = parsePackagedSkillDocument(text)
  return {
    name: 'create-workflow',
    description: parsed.description,
    content: parsed.content,
    source: 'bundled',
    invocation: { modelInvocable: true, userInvocable: false },
  }
}

function asDisposer(value: unknown): () => unknown {
  if (typeof value === 'function') return value as () => unknown
  if (typeof (value as { dispose?: unknown } | null)?.dispose === 'function') {
    return () => (value as { dispose(): unknown }).dispose()
  }
  return () => undefined
}

/** Use H's protected package binding; never emulate trust with a low rank. */
export async function registerTrustedWorkflowSkill(ctx: any): Promise<() => void> {
  const content = await readPackagedSkill()
  const register = ctx?.skills?.registerTrustedPackageSkill
  if (typeof register !== 'function') throw new Error('trusted packaged skill registration is unavailable')
  return asDisposer(register.call(ctx.skills, registrationForSkill(content), { protectedName: 'create-workflow' })) as () => void
}

export function registerTrustedWorkflowSkillSync(ctx: any, options: { readonly required?: boolean } = {}): () => unknown {
  const trusted = ctx?.skills?.registerTrustedPackageSkill
  if (typeof trusted === 'function') {
    return asDisposer(trusted.call(ctx.skills, registrationForSkill(readPackagedSkillSync()), { protectedName: 'create-workflow' }))
  }
  const register = ctx?.skills?.register
  if (typeof register === 'function') {
    return asDisposer(register.call(ctx.skills, registrationForSkill(readPackagedSkillSync())))
  }
  if (options.required !== false) throw new Error('trusted packaged skill registration is unavailable')
  return () => undefined
}

interface AliasRegistration {
  readonly commandName: string
  readonly description: string
  readonly handler: (invocation: any) => unknown
  readonly dispose: () => unknown
}
interface AliasState {
  readonly agent: any
  readonly registrations: Map<string, AliasRegistration>
  readonly definitions: Map<string, WorkflowDefinitionSummary>
  abort?: AbortController
  disposed: boolean
  refreshQueued: boolean
  reconcileQueued: boolean
}
function on(ctx: any, event: string, listener: (...args: any[]) => void): () => void {
  const disposer = ctx?.on?.(event, listener)
  return typeof disposer === 'function' ? disposer : () => undefined
}
function agentList(ctx: any): readonly any[] {
  const value = ctx?.agents?.list?.()
  return Array.isArray(value) ? value : []
}
function effectiveCommandNames(ctx: any, agent: any): Set<string> {
  const names = new Set<string>()
  const list = ctx?.commands?.list?.(agent)
  if (Array.isArray(list)) for (const item of list) if (typeof item?.name === 'string') names.add(item.name)
  return names
}
function occupiedCommandNames(ctx: any, state: AliasState): Set<string> {
  const ownHandlers = new Set([...state.registrations.values()].map(registration => registration.handler))
  const occupied = new Set<string>()
  for (const name of effectiveCommandNames(ctx, state.agent)) {
    const found = ctx?.commands?.find?.(state.agent, name)
    if (found !== undefined && ownHandlers.has(found.handler)) continue
    if (found === undefined && [...state.registrations.values()].some(registration => registration.commandName === name)) continue
    occupied.add(name)
  }
  return occupied
}
function queueRefresh(
  ctx: any,
  state: AliasState,
  supervisor: any,
  track: (task: Promise<unknown>) => void,
): void {
  if (state.disposed || state.refreshQueued) return
  state.refreshQueued = true
  queueMicrotask(() => {
    state.refreshQueued = false
    if (!state.disposed) track(refreshAliases(ctx, state, supervisor))
  })
}
function scheduleReconcile(ctx: any, state: AliasState, supervisor: any): void {
  if (state.disposed || state.reconcileQueued) return
  state.reconcileQueued = true
  queueMicrotask(() => {
    state.reconcileQueued = false
    if (state.disposed) return
    try { reconcileAliases(ctx, state, supervisor) }
    catch { /* contained: owner inject is probed at attach */ }
  })
}
async function refreshAliases(ctx: any, state: AliasState, supervisor: any): Promise<void> {
  state.abort?.abort(new Error('workflow alias refresh superseded'))
  const abort = new AbortController()
  state.abort = abort
  let definitions: readonly WorkflowDefinitionSummary[]
  try {
    definitions = await ctx.workflows.list({ ...cwdOf(state.agent), signal: abort.signal })
  } catch (error) {
    if (abort.signal.aborted || state.disposed || isAbortError(error, abort.signal)) return
    ctx?.logger?.warn?.(`workflow alias catalog refresh failed: ${error instanceof Error ? error.message : String(error)}`)
    return
  }
  if (abort.signal.aborted || state.disposed) return
  state.definitions.clear()
  for (const definition of definitions) state.definitions.set(definition.name, definition)
  reconcileAliases(ctx, state, supervisor)
}
function reconcileAliases(ctx: any, state: AliasState, supervisor: any): void {
  if (state.disposed) return
  const allocations = allocateWorkflowCommandNames([...state.definitions.values()], occupiedCommandNames(ctx, state))
  for (const [canonical, registration] of [...state.registrations]) {
    const definition = state.definitions.get(canonical)
    if (
      definition !== undefined
      && registration.description === definition.description
      && registration.commandName === allocations.get(canonical)
    ) continue
    try { void registration.dispose() } catch { /* contained */ }
    state.registrations.delete(canonical)
  }
  for (const definition of state.definitions.values()) {
    if (state.registrations.has(definition.name)) continue
    const alias = allocations.get(definition.name)
    if (alias === undefined) continue
    state.registrations.set(definition.name, makeAlias(ctx, state, supervisor, definition, alias))
  }
}
function makeAlias(
  ctx: any,
  state: AliasState,
  supervisor: any,
  definition: WorkflowDefinitionSummary,
  commandName: string,
): AliasRegistration {
  const handler = async (invocation: any): Promise<OfficialCommandResult> => {
    const raw = String(invocation?.rawInput ?? '').trim()
    let args: Record<string, unknown> = {}
    if (raw !== '') {
      try {
        const parsed = JSON.parse(raw)
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('object')
        args = parsed as Record<string, unknown>
      } catch {
        return { kind: 'error', text: `/${commandName} args must be one JSON object (wrap arrays/scalars in a field)` }
      }
    }
    const agent = invocation.agent
    try {
      const full = await ctx.workflows.get(definition.name, { ...cwdOf(agent), signal: invocation.signal })
      if (full === undefined) return { kind: 'error', text: `no saved workflow named "${definition.name}"` }
      const launch = () => supervisor.start({ definition: full, args, parent: agent, signal: invocation.signal })
      const launched = typeof ctx.workflowRunRecorder?.launch === 'function'
        ? await ctx.workflowRunRecorder.launch(agent.session, launch)
        : await launch()
      return commandSuccess(`Started workflow "${launched.displayName}" in the background. Open /workflows to watch it.`)
    } catch (error) { return commandError(error) }
  }
  const contribution = {
    name: commandName,
    description: commandName === definition.name
      ? definition.description
      : `Saved workflow "${definition.name}": ${definition.description}`,
    input: { hint: '[json-args]' },
    handler,
  }
  const owner = state.agent?.ctx
  const hasFallback = typeof ctx?.commands?.registerFallback === 'function'
  if (hasFallback) {
    if (typeof owner?.inject !== 'function') {
      throw new Error('workflow command aliases require exact-Agent command injection')
    }
    const fiber = owner.inject(['commands'], (registrationCtx: any) => {
      if (typeof registrationCtx?.commands?.registerFallback !== 'function') {
        throw new Error('workflow command aliases require H registerFallback')
      }
      registrationCtx.commands.registerFallback(contribution)
    })
    const dispose = asDisposer(fiber)
    if (fiber === undefined || (typeof fiber !== 'function' && typeof fiber?.dispose !== 'function')) {
      throw new Error('workflow command aliases require exact-Agent command injection')
    }
    return { commandName, description: definition.description, handler, dispose }
  }
  const register = ctx?.commands?.register
  if (typeof register !== 'function') {
    throw new Error('workflow command aliases require exact-Agent command injection')
  }
  return {
    commandName,
    description: definition.description,
    handler,
    dispose: asDisposer(register.call(ctx.commands, contribution)),
  }
}

/** Mount Host commands and exact-Agent definition aliases. */
export function applyCommands(ctx: any, config: CommandsConfig = {}): (() => Promise<void>) | undefined {
  if (config.enabled === false) return
  const cleanup: Array<() => unknown> = []
  const commands = ctx?.commands
  if (typeof commands?.register !== 'function') throw new Error('workflow command registry is unavailable')
  const hasFallback = typeof commands.registerFallback === 'function'
  const supervisor: WorkflowSupervisor = ctx.workflowSupervisor
  if (config.registerSkill !== false && ctx?.skills?.registerTrustedPackageSkill !== undefined) {
    cleanup.push(asDisposer(registerTrustedWorkflowSkillSync(ctx)))
  }
  const workflowCommand = commands.register({
    name: 'workflow',
    description: 'Launch a saved workflow or pause/resume/stop/save a run',
    input: { hint: '<name> [json-args] | pause|resume|stop|save <display-name>' },
    handler: async (invocation: any): Promise<OfficialCommandResult> => {
      try {
        invocation.signal?.throwIfAborted()
        return officialFromCommandResult(await executeWorkflowCommand(String(invocation?.rawInput ?? ''), {
          registry: ctx.workflows,
          supervisor,
          agent: invocation.agent,
          recorder: ctx.workflowRunRecorder,
          signal: invocation.signal,
        }))
      } catch (error) { return commandError(error) }
    },
  })
  cleanup.push(asDisposer(workflowCommand))
  const workflowsCommand = commands.register({
    name: 'workflows',
    description: WORKFLOWS_COMMAND_DESCRIPTION,
    handler: async (invocation: any): Promise<OfficialCommandResult> => {
      try {
        invocation.signal?.throwIfAborted()
        return commandSuccess(WORKFLOWS_COMMAND_SUCCESS)
      } catch (error) { return commandError(error) }
    },
  })
  cleanup.push(asDisposer(workflowsCommand))
  const createCommand = commands.register({
    name: 'create-workflow',
    description: CREATE_WORKFLOW_COMMAND_DESCRIPTION,
    input: { hint: '[what the workflow should do]' },
    handler: (invocation: any): OfficialCommandResult => {
      try {
        invocation.signal?.throwIfAborted()
        const detail = String(invocation.rawInput ?? '').trim()
        invocation.agent.steer(createUserMessage({
          content: [{ type: 'text', text: `/create-workflow${detail === '' ? '' : ` ${detail}`}` }],
          source: { kind: 'user' },
        }))
        return commandSuccess('Opened the workflow authoring skill.')
      } catch (error) { return commandError(error) }
    },
  })
  cleanup.push(asDisposer(createCommand))
  const states = new Map<any, AliasState>()
  const pendingDisposals = new Set<Promise<unknown>>()
  const track = (task: Promise<unknown>): void => {
    pendingDisposals.add(task.catch(error => {
      if (isAbortError(error)) return undefined
      const message = error instanceof Error ? error.message : String(error)
      if (/registerFallback|exact-Agent command injection/u.test(message)) return undefined
      throw error
    }))
  }
  const addAgent = (agent: any): void => {
    if (agent === undefined || states.has(agent)) return
    if (!hasFallback) {
      const cwd = cwdOf(agent).cwd
      if (cwd === undefined) return
      for (const existing of states.keys()) {
        if (cwdOf(existing).cwd === cwd) return
      }
    }
    if (hasFallback) {
      if (typeof agent?.ctx?.inject !== 'function') {
        throw new Error('workflow command aliases require exact-Agent command injection')
      }
      const probe = agent.ctx.inject(['commands'], (registrationCtx: any) => {
        if (typeof registrationCtx?.commands?.registerFallback !== 'function') {
          throw new Error('workflow command aliases require H registerFallback')
        }
      })
      try { void asDisposer(probe)() } catch { /* contained */ }
    }
    const state: AliasState = {
      agent,
      registrations: new Map(),
      definitions: new Map(),
      disposed: false,
      refreshQueued: false,
      reconcileQueued: false,
    }
    states.set(agent, state)
    track(refreshAliases(ctx, state, supervisor))
  }
  const removeAgent = (agent: any): void => {
    const state = states.get(agent)
    if (state === undefined) return
    state.disposed = true
    state.abort?.abort(new Error('workflow alias owner disposed'))
    for (const registration of state.registrations.values()) {
      try {
        const result = registration.dispose()
        if (result !== undefined && typeof (result as Promise<unknown>)?.then === 'function') {
          const pending = Promise.resolve(result)
          pendingDisposals.add(pending)
          void pending.then(() => pendingDisposals.delete(pending), () => pendingDisposals.delete(pending))
        }
      } catch { /* contained */ }
    }
    state.registrations.clear()
    states.delete(agent)
  }
  for (const agent of agentList(ctx)) addAgent(agent)
  cleanup.push(on(ctx, 'agent/created', event => addAgent(event?.agent ?? event)))
  cleanup.push(on(ctx, 'agent/disposed', event => removeAgent(event?.agent ?? event)))
  cleanup.push(on(ctx, 'workflows/change', () => { for (const state of states.values()) queueRefresh(ctx, state, supervisor, track) }))
  cleanup.push(on(ctx, 'commands/change', () => { for (const state of states.values()) scheduleReconcile(ctx, state, supervisor) }))
  let disposed = false
  let disposal: Promise<void> | undefined
  const dispose = (): Promise<void> => {
    if (disposal !== undefined) return disposal
    disposed = true
    disposal = (async () => {
      for (const agent of [...states.keys()]) removeAgent(agent)
      for (const item of cleanup.splice(0)) { try { await item() } catch { /* contained */ } }
      await Promise.allSettled([...pendingDisposals])
      pendingDisposals.clear()
    })()
    return disposal
  }
  void disposed
  if (typeof ctx.effect === 'function') ctx.effect(() => dispose, 'dsh-workflows: commands')
  return dispose
}

export const apply = applyCommands

export { allocateWorkflowCommandNames }
