import { parseWorkflowDefinition, validateDefinitionEnvelope } from '../registry/definition.js'
import type { WorkflowRegistry } from '../registry/index.js'
import type { WorkflowDefinitionEnvelope } from '../registry/types.js'
import { repairObjectLiteralSemicolons } from '../supervisor/canned-validate.js'
import { VALIDATION_NOTE } from '../supervisor/index.js'
import type { WorkflowSupervisor } from '../supervisor/index.js'
import { FsError } from '@deepseek-ai/dsh-fs'
import { assertNever } from '@deepseek-ai/dsh-llm'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolCallView, ToolResultView } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-session'
import { constants as fsConstants } from 'node:fs'
import { lstat as localLstat, open as localOpen } from 'node:fs/promises'
import { isAbsolute as isLocalAbsolute, resolve as resolveLocalPath } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { WorkflowToolArgs } from './schema.js'
import { parseWorkflowToolRequest, WORKFLOW_TOOL_PARAMETERS, WORKFLOW_TOOL_SCHEMA } from './schema.js'

export * from './schema.js'
export { VALIDATION_NOTE }

/**
 * Opaque contribution identities for a Host that exposes atomic replacement.
 * Until the Host exports these exact objects, identity matching uses this
 * package freeze plus an explicit official marker; a same-name custom tool is
 * never treated as official.
 */
export const WORKFLOW_TOOL_DEFINITION = Object.freeze({
  name: 'workflow',
  description: 'official DeepSeek Harness workflow tool',
  parameters: WORKFLOW_TOOL_SCHEMA,
}) as any
export const WORKFLOW_PROMPT_SECTION = Object.freeze({
  name: 'tool:workflow',
  order: 115,
  text: 'official DeepSeek Harness workflow guidance',
}) as any

const OFFICIAL_MARKER = Symbol.for('deepseek-harness.workflow.official-contribution')
const MAX_RESULT_CHARS = 50_000
const MISSING_AGENT = 'workflow tool requires a calling agent (exec.agent was undefined)'
const MISSING_SHADOW = 'workflow package requires either verified atomic replacement seams or Agent-scoped tools.register and systemPrompt.section'
const MISSING_FS = 'workflow script_path requires either Host fs.readBytesNoFollow or the published RC2 local filesystem capability'

/*
 * Stock 0.1.1-rc.2 predates the opaque contribution marker and atomic
 * replacement seam. Its public registry deliberately supports an Agent-local
 * definition shadowing a global definition with the same name, but it exposes
 * no package provenance for that global. Match the complete, distinctive
 * public stock schema plus stable description boundaries before using that
 * public fallback. A same-name custom tool does not pass this check. A future
 * verified atomic seam takes the identity/marker compare-and-swap route below.
 */
const STOCK_DESCRIPTION_START = 'Run a JavaScript workflow script that orchestrates subagents at scale.'
const STOCK_DESCRIPTION_END = 'The run executes in the foreground: this call returns when the whole script finishes.'

function ownKeysExactly(value: unknown, expected: readonly string[]): value is Record<string, any> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index])
}

function stringSetExactly(value: unknown, expected: readonly string[]): boolean {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) return false
  const actual = [...value].sort()
  const wanted = [...expected].sort()
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index])
}

/** Public-fingerprint check used only for stock's Agent-scoped shadow seam. */
export function isStockOfficialWorkflowTool(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false
  const tool = value as Record<string, any>
  if (tool.name !== 'workflow' || typeof tool.description !== 'string'
    || !tool.description.startsWith(STOCK_DESCRIPTION_START)
    || !tool.description.endsWith(STOCK_DESCRIPTION_END)
    || typeof tool.execute !== 'function') return false

  const parameters = tool.parameters
  if (!ownKeysExactly(parameters, ['type', 'properties', 'required'])
    || parameters.type !== 'object'
    || !stringSetExactly(parameters.required, ['script', 'meta'])
    || !ownKeysExactly(parameters.properties, ['script', 'meta', 'args'])) return false
  const script = parameters.properties.script
  const meta = parameters.properties.meta
  const args = parameters.properties.args
  if (script?.type !== 'string' || meta?.type !== 'object' || meta?.additionalProperties !== true
    || args?.type !== 'object' || args?.additionalProperties !== true
    || !ownKeysExactly(meta.properties, ['name', 'description', 'whenToUse', 'phases'])
    || !stringSetExactly(meta.required, ['name', 'description'])
    || meta.properties.name?.type !== 'string'
    || meta.properties.description?.type !== 'string'
    || meta.properties.whenToUse?.type !== 'string') return false
  const phase = meta.properties.phases
  const phaseItem = phase?.items
  if (phase?.type !== 'array' || phaseItem?.type !== 'object'
    || phaseItem.additionalProperties !== true
    || !ownKeysExactly(phaseItem.properties, ['title', 'detail', 'provider', 'model'])
    || !stringSetExactly(phaseItem.required, ['title'])
    || Object.values(phaseItem.properties).some((field: any) => field?.type !== 'string')) return false

  const output = tool.output
  const outputSchema = output?.schema
  return typeof output?.render === 'function'
    && ownKeysExactly(outputSchema, ['type', 'additionalProperties', 'properties', 'required'])
    && outputSchema.type === 'object'
    && outputSchema.additionalProperties === false
    && ownKeysExactly(outputSchema.properties, ['runId', 'agentsStarted', 'result'])
    && stringSetExactly(outputSchema.required, ['runId', 'agentsStarted', 'result'])
    && outputSchema.properties.runId?.type === 'string'
    && outputSchema.properties.agentsStarted?.type === 'integer'
}

const DESCRIPTION = `Run a JavaScript workflow script that orchestrates subagents at scale. Use this for work that fans out across many independent pieces — an audit over many files, a migration, multi-angle research, adversarial verification of findings — where you write the orchestration as a script instead of delegating turn by turn.

Supply EXACTLY ONE source: \`name\` (a saved workflow in .dsh/workflows), \`script\` (an inline plain-JS body, plus the required \`meta\` object), or \`script_path\` (a .workflow.json envelope or a script file on disk, plus \`meta\` for a bare file).

The workflow's identity rides \`meta\` as JSON: required \`name\` (short kebab-case) and \`description\` strings, optional \`whenToUse\` string and \`phases\` array (\`{title, detail?, provider?, model?}\`). The script body is plain JavaScript ONLY (NOT TypeScript, and NO \`export const meta\` statement — meta is data beside the body), running with top-level await.

Script-body hooks:
- \`agent(prompt, opts?): Promise<any>\` — run one subagent to completion. Without \`opts.schema\` it resolves to the child's final text; with \`opts.schema\` (an object-rooted JSON Schema using ONLY type/properties/required/additionalProperties/items/minItems/maxItems/enum/const/oneOf — no pattern, format, minimum/maximum, or other keywords) it resolves to the validated object. \`minItems\` and \`maxItems\` are inclusive array-length bounds: each must be a non-negative safe integer (not \`-0\`), may appear only on a \`type: "array"\` node, must satisfy \`minItems <= maxItems\`, and is forbidden beside \`oneOf\`. The package validates these declarations before child launch, removes only those two keywords from the copy sent to stock RC2, and post-validates the structured child result against the authored bounds. Resolves \`null\` when the child fails or returns a schema-invalid value (filter with \`.filter(Boolean)\`). Other opts: \`label\` (display), \`phase\` (progress group), and independent \`provider\`/\`model\` LLM target overrides (either may be provided alone). Anything else is rejected loudly.
- \`parallel(items): Promise<any[]>\` — run zero-argument functions OR job maps \`{prompt, label?, phase?, schema?, provider?, model?}\` concurrently and await ALL (a barrier). Failed slots resolve to \`null\`.
- \`pipeline(items, ...stages): Promise<any[]>\` — run each item through the stages independently with NO barrier between stages. Each stage receives \`(prev, item, index)\`.
- \`phase(title)\` — start a progress phase; \`log(message)\` — narrate progress; \`args\` — the tool call's \`args\` input, verbatim.
- \`complete(value)\` — end the run successfully with a JSON value (first call wins). Stock workers have no native \`complete\`; this package injects one. \`return value\` also settles the run.
- \`await_user(kind, message)\` — park the run for a human answer; resume continues past it. \`pause(kind, message)\` — park a run for a condition resume cannot change; resume re-fires it. Kinds: user, back_off, no_progress, verification, infra.
- \`budget(): { total, spent, reserved, remaining }\` — this run's logical agent budget. \`write_scratch_file(name, content)\` / \`read_scratch_file(name)\` — per-run scratch storage (single-component names).

Misused hooks (bad arguments, unknown options, unsupported schemas, tripped caps) throw errors that ALWAYS kill the script — they never dissolve into a per-item \`null\`.

Launch is BACKGROUND for a saved definition (\`name\` / \`script_path\`): the call returns immediately with \`{ displayName, runId, script_path, status: "started" }\`. Inline \`script\` authoring DEFAULTS to \`validate_only: true\` (canned stubs, no children, milliseconds) and SAVES on a successful smoke. \`save_scope\` selects \`project\` (default, \`.dsh/workflows\`) or \`user\` (\`$DSH_HOME/workflows\`); it is valid only for this inline validate-only save. Pass \`validate_only: false\` only to launch that inline script live. Object literals are plain JavaScript (commas, never semicolons — \`{ a: 1, b: 2 }\` not \`{ a: 1; b: 2 }\`). To resume a paused, needs-input, or budget-limited run, supply only \`resume_from_run_id\` and optionally a higher \`agent_budget\` for a budget-limited run.`

const PROMPT_TEXT = 'Use the workflow tool ONLY when the user explicitly asks for a workflow or for large multi-agent orchestration: you write a JavaScript script (the tool description documents the exact format) that fans work out across many subagents with phases and structured results. Inline script + meta defaults to validate_only and saves to save_scope project (default) or user — do not pass validate_only: false while authoring, and never put semicolons between object fields. For one or two delegations, prefer plain subagent calls.'

type WorkflowToolOutput =
  | { status: 'started'; displayName: string; runId: string; script_path?: string }
  | { status: 'resumed'; displayName: string; runId: string }
  | { status: 'validated'; ok: true; result?: JsonValue; saved_path?: string }

export interface WorkflowToolServices {
  readonly registry: WorkflowRegistry
  readonly supervisor: WorkflowSupervisor
  readonly recorder?: { launch(session: any, start: () => Promise<any>): Promise<any> }
  readonly fs?: HostWorkflowFs
  readonly definitionMaxBytes?: number
  readonly maxResultChars?: number
}

interface HostWorkflowFs {
  readBytesNoFollow?(
    path: string,
    options: { cwd?: string },
    signal?: AbortSignal,
    maxBytes?: number,
  ): Promise<Uint8Array>
  resolve?(path: string, options?: { cwd?: string; signal?: AbortSignal }): Promise<unknown>
  lstat?(path: string, options?: { cwd?: string }, signal?: AbortSignal): Promise<unknown>
  processPath?(target: unknown): string
  fileUrl?(target: unknown): string
  readBytes?(target: unknown, signal: AbortSignal | undefined, maxBytes: number): Promise<Uint8Array>
}

function officialContribution(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<PropertyKey, unknown>
  return record[OFFICIAL_MARKER] === true || record.__officialWorkflowContribution === true
}

/** Verified identity/marker or stock fingerprint; custom same-name tools are not official. */
export function isOfficialWorkflowTool(definition: unknown): boolean {
  return definition === WORKFLOW_TOOL_DEFINITION
    || officialContribution(definition)
    || isStockOfficialWorkflowTool(definition)
}

function isOfficialWorkflowPrompt(section: unknown): boolean {
  return section === WORKFLOW_PROMPT_SECTION || officialContribution(section)
}

function visibleWorkflowTool(agent: any): any {
  const tools = agent?.ctx?.tools
  if (typeof tools?.get === 'function') {
    try { return tools.get('workflow', agent) ?? tools.get('workflow') } catch { /* inspect other faces */ }
  }
  if (typeof tools?.list === 'function') {
    try {
      const list = tools.list(agent)
      return Array.isArray(list) ? list.find((item: any) => item?.name === 'workflow') : undefined
    } catch { /* absent on minimal fixtures */ }
  }
  return tools?.workflow
}

function visibleWorkflowPrompt(agent: any): any {
  const prompt = agent?.ctx?.systemPrompt
  if (typeof prompt?.get === 'function') {
    try { return prompt.get('tool:workflow') } catch { /* absent */ }
  }
  if (typeof prompt?.section === 'function') {
    try { return prompt.section('tool:workflow') } catch { /* absent */ }
  }
  return prompt?.sections?.get?.('tool:workflow') ?? prompt?.workflowSection
}

function presentWorkflowCall(args: WorkflowToolArgs): ToolCallView {
  const title = args.name ?? (args.meta && typeof args.meta.name === 'string' ? args.meta.name : 'workflow')
  return {
    card: 'generic',
    title: `workflow: ${title}`,
    ...(args.script !== undefined ? { rawInput: args.script } : {}),
  }
}

function presentWorkflowResult(_args: WorkflowToolArgs, _result: { content: ContentBlock[]; isError: boolean }): ToolResultView {
  return { card: 'generic' }
}

/** Render the launch/validate outcome for the tool result. */
export function renderLaunch(value: WorkflowToolOutput, maxChars = MAX_RESULT_CHARS): string {
  switch (value.status) {
    case 'validated': {
      const rendered = JSON.stringify(value.result ?? null, null, 2)
      const clipped = rendered.length > maxChars ? `${rendered.slice(0, maxChars)}\n… [truncated]` : rendered
      const saved = typeof value.saved_path === 'string' && value.saved_path.length > 0
        ? `Saved ${value.saved_path}. Launch with /workflow <name> (do not start children unless the user asks).\n`
        : 'No new workflow definition was saved by this validation.\n'
      return `workflow smoke check passed.\n${VALIDATION_NOTE}\n${saved}Result:\n${clipped}`
    }
    case 'started':
    case 'resumed':
      return JSON.stringify(value)
    default:
      return assertNever(value, 'workflow tool output')
  }
}

function replacementPrompt(official: any): any {
  return {
    ...official,
    name: 'tool:workflow',
    order: typeof official?.order === 'number' ? official.order : 115,
    text: PROMPT_TEXT,
  }
}

/** Shadow one Agent via atomic CAS or rollback-safe scoped registrations. */
export function installWorkflowShadow(
  agent: any,
  servicesOrTool: WorkflowToolServices | any,
): () => void {
  const ctx = agent?.ctx
  const tools = ctx?.tools
  const systemPrompt = ctx?.systemPrompt
  const isServices = typeof servicesOrTool === 'object' && servicesOrTool?.registry !== undefined
  const suppliedReplacement = !isServices && typeof servicesOrTool === 'object' && servicesOrTool?.name === 'workflow'
  const visible = visibleWorkflowTool(agent)
  const candidateVisible = visible ?? (!suppliedReplacement ? servicesOrTool : undefined)
  if (!isOfficialWorkflowTool(candidateVisible)) return () => undefined
  const services = isServices ? servicesOrTool as WorkflowToolServices : ctx?.workflowToolServices
  if (services === undefined && !suppliedReplacement) return () => undefined
  const replacement = suppliedReplacement ? servicesOrTool : createWorkflowTool({
    ...services,
    fs: services.fs ?? ctx?.fs,
  })

  // Replace only exact visible official objects and restore both contributions
  // atomically. This remains the stronger preferred seam when available.
  if (typeof tools?.replace === 'function' && typeof systemPrompt?.replaceSection === 'function') {
    const promptVisible = visibleWorkflowPrompt(agent)
    if (promptVisible === undefined || !isOfficialWorkflowPrompt(promptVisible)) return () => undefined
    let restoreTool: (() => unknown) | undefined
    try {
      restoreTool = tools.replace('workflow', candidateVisible, replacement)
      if (typeof restoreTool !== 'function') throw new Error('workflow tool replacement did not return a disposer')
      const restorePrompt = systemPrompt.replaceSection('tool:workflow', promptVisible, replacementPrompt(promptVisible))
      if (typeof restorePrompt !== 'function') throw new Error('workflow prompt replacement did not return a disposer')
      let disposed = false
      return () => {
        if (disposed) return
        disposed = true
        try { restorePrompt() } finally { restoreTool?.() }
      }
    } catch (error) {
      try { restoreTool?.() } catch { /* preserve original failure */ }
      throw error
    }
  }

  // Stock 0.1.1-rc.2: the ToolRuntime and SystemPrompt public APIs scope a
  // registration made through agent.ctx to that exact Agent.  Such a local
  // contribution shadows the stock global one and its prompt section.  Never
  // use this route for a marker-only contribution: without CAS that would
  // weaken the exact-identity guarantee.
  if (!isStockOfficialWorkflowTool(candidateVisible)) throw new Error(MISSING_SHADOW)
  if (typeof tools?.register !== 'function' || typeof systemPrompt?.section !== 'function') {
    throw new Error(MISSING_SHADOW)
  }
  let restoreTool: (() => unknown) | undefined
  try {
    restoreTool = tools.register(replacement)
    if (typeof restoreTool !== 'function') throw new Error('workflow Agent-scoped tool registration did not return a disposer')
    const restorePrompt = systemPrompt.section({ name: 'tool:workflow', order: 115, text: PROMPT_TEXT })
    if (typeof restorePrompt !== 'function') throw new Error('workflow Agent-scoped prompt registration did not return a disposer')
    let disposed = false
    return () => {
      if (disposed) return
      disposed = true
      try { restorePrompt() } finally { restoreTool?.() }
    }
  } catch (error) {
    try { restoreTool?.() } catch { /* preserve original failure */ }
    throw error
  }
}

export interface ToolShadowConfig {
  readonly enabled?: boolean
  readonly services?: WorkflowToolServices
}

/** Reconcile exact-Agent shadows on Agent/tool lifecycle changes. */
export function applyToolShadow(ctx: any, config: ToolShadowConfig = {}): (() => void) | undefined {
  if (config.enabled === false) return
  const services: WorkflowToolServices = config.services ?? {
    registry: ctx.workflows,
    supervisor: ctx.workflowSupervisor,
    recorder: ctx.workflowRunRecorder,
    fs: ctx.fs,
  }
  if (services.registry === undefined || services.supervisor === undefined) throw new Error('workflow tool shadow services are unavailable')
  const resolved: WorkflowToolServices = { ...services, fs: services.fs ?? ctx.fs }
  const states = new Map<any, { restore?: () => unknown; queued: boolean; disposed: boolean }>()
  // Stock ToolRuntime emits one unscoped tools/change for every scoped
  // registration and removal.  Suppress the whole package-owned mutation,
  // rather than only the Agent being reconciled: an A mutation must not queue
  // B, whose mutation would otherwise queue A again on a multi-Agent Host.
  let internalMutations = 0
  const mutate = (operation: () => void): void => {
    internalMutations += 1
    try { operation() } finally { internalMutations -= 1 }
  }
  const reconcile = (agent: any): void => {
    const state = states.get(agent)
    if (state === undefined || state.disposed) return
    mutate(() => {
      try { state.restore?.() } catch { /* restoration is best-effort during churn */ }
      state.restore = undefined
      const visible = visibleWorkflowTool(agent)
      try {
        if (isOfficialWorkflowTool(visible)) state.restore = installWorkflowShadow(agent, resolved)
      } catch (error) {
        ctx.logger?.warn?.(`workflow tool shadow failed: ${error instanceof Error ? error.message : String(error)}`)
      }
    })
  }
  const schedule = (agent: any): void => {
    const state = states.get(agent); if (state === undefined || state.queued || state.disposed) return
    state.queued = true
    queueMicrotask(() => { state.queued = false; if (!state.disposed) reconcile(agent) })
  }
  const add = (agent: any): void => {
    if (agent === undefined || states.has(agent)) return
    states.set(agent, { queued: false, disposed: false })
    reconcile(agent)
  }
  const remove = (agent: any): void => {
    const state = states.get(agent); if (state === undefined) return
    state.disposed = true
    mutate(() => { try { state.restore?.() } catch { /* contained */ } })
    state.restore = undefined
    states.delete(agent)
  }
  for (const agent of (Array.isArray(ctx.agents?.list?.()) ? ctx.agents.list() : [])) add(agent)
  const cleanups: Array<() => unknown> = []
  for (const [event, handler] of [['agent/created', (event: any) => add(event?.agent ?? event)], ['agent/disposed', (event: any) => remove(event?.agent ?? event)]] as const) {
    const dispose = ctx.on?.(event, handler); if (typeof dispose === 'function') cleanups.push(dispose)
  }
  const toolsChanged = (): void => {
    if (internalMutations > 0) return
    for (const agent of states.keys()) schedule(agent)
  }
  const changed = ctx.on?.('tools/change', toolsChanged); if (typeof changed === 'function') cleanups.push(changed)
  let disposed = false
  const dispose = (): void => {
    if (disposed) return
    disposed = true
    for (const agent of [...states.keys()]) remove(agent)
    for (const cleanup of cleanups.splice(0)) { try { cleanup() } catch { /* contained */ } }
  }
  if (typeof ctx.effect === 'function') ctx.effect(() => dispose, 'dsh-workflows: tool shadow')
  return dispose
}

export interface ResolvedWorkflowSource {
  readonly script: string
  readonly meta: WorkflowDefinitionEnvelope['meta']
  readonly args: Record<string, unknown>
  readonly filename: string
}

interface ResolveOptions {
  readonly agent?: any
  readonly signal?: AbortSignal
  readonly definitionMaxBytes?: number
}

function boundedLimit(value: number | undefined): number {
  const limit = value ?? 1_048_576
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1_048_576) {
    throw new RangeError('workflow definitionMaxBytes must be a safe integer from 1 through 1048576')
  }
  return limit
}

function fsErrorCode(error: unknown): string | undefined {
  if (error instanceof FsError) return error.code
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code
    return typeof code === 'string' ? code : undefined
  }
}

function translateScriptPathError(path: string, error: unknown, maxBytes: number): never {
  const code = fsErrorCode(error)
  if (code === 'FS_NOT_FOUND' || code === 'ENOENT') {
    throw new Error(`workflow script_path "${path}" was not found`, { cause: error })
  }
  if (code === 'FS_NOT_REGULAR_FILE') {
    throw new Error(
      `workflow script_path "${path}" must be a regular file and must not be a symbolic link`,
      { cause: error },
    )
  }
  if (code === 'FS_TOO_LARGE') {
    throw new Error(`workflow script_path "${path}" exceeds the ${maxBytes}-byte limit`, { cause: error })
  }
  throw error
}

interface Rc2PathInfo {
  readonly version: unknown
  readonly type: 'file' | 'directory' | 'symlink' | 'other'
  readonly size?: number
}

interface Rc2Target {
  readonly targetKey: string
  readonly displayPath: string
}

function rc2PathInfo(value: unknown): Rc2PathInfo | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const info = value as Record<string, unknown>
  if (!['file', 'directory', 'symlink', 'other'].includes(String(info.type))) return undefined
  if (info.size !== undefined && (!Number.isSafeInteger(info.size) || (info.size as number) < 0)) return undefined
  return info as unknown as Rc2PathInfo
}

function rc2Target(value: unknown): Rc2Target | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const target = value as Record<string, unknown>
  if (typeof target.targetKey !== 'string' || typeof target.displayPath !== 'string') return undefined
  return target as unknown as Rc2Target
}

function sameLocalIdentity(
  left: { dev: bigint; ino: bigint },
  right: { dev: bigint; ino: bigint },
): boolean {
  return left.dev === right.dev && left.ino === right.ino
}

function sameLocalSnapshot(
  left: { dev: bigint; ino: bigint; size: bigint; mtimeNs: bigint; ctimeNs: bigint },
  right: { dev: bigint; ino: bigint; size: bigint; mtimeNs: bigint; ctimeNs: bigint },
): boolean {
  return sameLocalIdentity(left, right)
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs
}

function rc2Abort(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new FsError('workflow script_path read aborted', 'FS_ABORTED')
}

function localReadError(path: string, error: unknown): never {
  const code = fsErrorCode(error)
  if (code === 'ENOENT' || code === 'ENOTDIR') {
    throw new FsError(`cannot read "${path}": not found`, 'FS_NOT_FOUND', { cause: error })
  }
  if (code === 'ELOOP' || code === 'EISDIR') {
    throw new FsError(`cannot read "${path}": not a regular file or is a symbolic link`, 'FS_NOT_REGULAR_FILE', { cause: error })
  }
  throw error
}

/**
 * Published 0.1.1-rc.2 has resolve/lstat/processPath/readBytes but not the
 * later path-shaped readBytesNoFollow method. For that exact local service
 * shape, authorize and normalize through the Host, then open the Host's
 * lexical display path with O_NOFOLLOW and read a bounded snapshot from the
 * retained descriptor. Unknown/remote providers fail closed rather than
 * treating an execution-world process path as a path on this Node host.
 */
async function readPublishedRc2LocalBytes(
  fs: HostWorkflowFs,
  path: string,
  cwd: string | undefined,
  signal: AbortSignal | undefined,
  maxBytes: number,
): Promise<Uint8Array> {
  /* c8 ignore next -- stock RC2 compatibility reads require POSIX O_NOFOLLOW. */
  if (process.platform === 'win32' || typeof fsConstants.O_NOFOLLOW !== 'number'
    || fsConstants.O_NOFOLLOW === 0) throw new Error(MISSING_FS)
  if (typeof fs.resolve !== 'function' || typeof fs.lstat !== 'function'
    || typeof fs.processPath !== 'function' || typeof fs.fileUrl !== 'function'
    || typeof fs.readBytes !== 'function') throw new Error(MISSING_FS)

  rc2Abort(signal)
  const options = cwd === undefined ? {} : { cwd }
  const first = rc2PathInfo(await fs.lstat(path, options, signal))
  rc2Abort(signal)
  if (first === undefined) throw new FsError(`cannot read "${path}": not found`, 'FS_NOT_FOUND')
  if (first.type !== 'file') {
    throw new FsError(`cannot read "${path}": not a regular file or is a symbolic link`, 'FS_NOT_REGULAR_FILE')
  }
  if (first.size !== undefined && first.size > maxBytes) {
    throw new FsError(`cannot read "${path}": exceeds ${maxBytes} bytes`, 'FS_TOO_LARGE')
  }

  const target = rc2Target(await fs.resolve(path, { ...options, ...(signal === undefined ? {} : { signal }) }))
  rc2Abort(signal)
  if (target === undefined || !isLocalAbsolute(target.displayPath)) throw new Error(MISSING_FS)

  // These are the published local/sandbox-local RC2 invariants. In
  // particular, targetKey/processPath is a canonical local path while
  // displayPath preserves the lexical Session-world path that must be opened
  // no-follow. Requiring all of them prevents accidental use on remote fs
  // providers whose execution-world path is not on this Node host.
  const expectedDisplay = resolveLocalPath(cwd ?? process.cwd(), path)
  let processPath: string
  let fileUrl: string
  try {
    processPath = fs.processPath(target)
    fileUrl = fs.fileUrl(target)
  } catch {
    throw new Error(MISSING_FS)
  }
  if (target.displayPath !== expectedDisplay || target.targetKey !== processPath
    || !isLocalAbsolute(processPath) || fileUrl !== pathToFileURL(processPath).href) {
    throw new Error(MISSING_FS)
  }

  let handle
  try {
    rc2Abort(signal)
    handle = await localOpen(target.displayPath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW)
    rc2Abort(signal)
    const before = await handle.stat({ bigint: true })
    if (!before.isFile()) {
      throw new FsError(`cannot read "${path}": not a regular file`, 'FS_NOT_REGULAR_FILE')
    }
    if (before.size > BigInt(maxBytes)) {
      throw new FsError(`cannot read "${path}": exceeds ${maxBytes} bytes`, 'FS_TOO_LARGE')
    }

    // Confirm that the descriptor opened from the lexical no-follow path is
    // the same local identity authorized by the Host target.
    const canonical = await localLstat(processPath, { bigint: true })
    if (!canonical.isFile() || !sameLocalIdentity(before, canonical)) {
      throw new FsError(`cannot read "${path}": path identity changed during authorization`, 'FS_IO_ERROR')
    }

    // Allocate only maxBytes + the one byte needed to distinguish an exact-cap
    // file from a growing/oversized file. FileHandle.read pins the opened file;
    // it never re-opens the user-controlled path.
    const buffer = new Uint8Array(maxBytes + 1)
    let offset = 0
    while (offset < buffer.byteLength) {
      rc2Abort(signal)
      const result = await handle.read(buffer, offset, buffer.byteLength - offset, null)
      if (result.bytesRead === 0) break
      offset += result.bytesRead
    }
    rc2Abort(signal)
    if (offset > maxBytes) throw new FsError(`cannot read "${path}": exceeds ${maxBytes} bytes`, 'FS_TOO_LARGE')

    const after = await handle.stat({ bigint: true })
    const finalPath = await localLstat(target.displayPath, { bigint: true })
    const finalHost = rc2PathInfo(await fs.lstat(path, options, signal))
    rc2Abort(signal)
    if (!sameLocalSnapshot(before, after) || !finalPath.isFile()
      || !sameLocalIdentity(before, finalPath)
      || finalHost === undefined || finalHost.type !== 'file'
      || finalHost.version !== first.version) {
      throw new FsError(`cannot read "${path}": file changed while it was being read`, 'FS_IO_ERROR')
    }
    return buffer.slice(0, offset)
  } catch (error) {
    localReadError(path, error)
  } finally {
    await handle?.close().catch(() => undefined)
  }
  /* c8 ignore next -- the catch above always rethrows through localReadError. */
  throw new Error(MISSING_FS)
}

async function readSourceBytes(ctx: any, path: string, options: ResolveOptions, maxBytes: number): Promise<Uint8Array> {
  const cwd = options.agent?.session?.header?.cwd
  if (!isAbsolutePath(path) && (typeof cwd !== 'string' || cwd.trim().length === 0 || !isAbsolutePath(cwd))) {
    throw new Error('workflow script_path must be absolute when the calling Session has no absolute cwd')
  }
  const fs = ctx.fs as HostWorkflowFs | undefined
  if (fs === undefined) throw new Error(MISSING_FS)
  let bytes: Uint8Array
  try {
    const cleanCwd = typeof cwd === 'string' && cwd.trim().length > 0 ? cwd : undefined
    bytes = typeof fs.readBytesNoFollow === 'function'
      ? await fs.readBytesNoFollow(path, cleanCwd === undefined ? {} : { cwd: cleanCwd }, options.signal, maxBytes)
      : await readPublishedRc2LocalBytes(fs, path, cleanCwd, options.signal, maxBytes)
  } catch (error) {
    translateScriptPathError(path, error, maxBytes)
  }
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > maxBytes) {
    throw new Error(`workflow script_path "${path}" exceeds the ${maxBytes}-byte limit`)
  }
  return bytes
}

function isAbsolutePath(path: string): boolean {
  return path.startsWith('/') || /^[A-Za-z]:[\\/]/u.test(path)
}

function requireScriptBytes(script: string, maxBytes: number, label: string): void {
  if (new TextEncoder().encode(script).byteLength > maxBytes) {
    throw new Error(`workflow ${label} exceeds the ${maxBytes}-byte limit`)
  }
}

/** Resolve exactly one validated model source without following its final path component. */
export async function resolveWorkflowSource(
  ctx: any,
  request: ReturnType<typeof parseWorkflowToolRequest>,
  options: ResolveOptions = {},
): Promise<ResolvedWorkflowSource> {
  if (request.kind === 'resume') throw new Error('resume request has no source')
  const maxBytes = boundedLimit(options.definitionMaxBytes)
  if (request.source.kind === 'name') {
    const definition = await (ctx.workflows as WorkflowRegistry).get(request.source.name, {
      cwd: options.agent?.session?.header?.cwd,
      signal: options.signal,
    })
    if (definition === undefined) throw new Error(`no saved workflow named "${request.source.name}"`)
    return {
      script: definition.script,
      meta: {
        name: definition.name,
        description: definition.description,
        ...(definition.whenToUse === undefined ? {} : { whenToUse: definition.whenToUse }),
        ...(definition.phases === undefined ? {} : { phases: [...definition.phases] }),
      },
      args: request.args,
      filename: definition.path,
    }
  }
  if (request.source.kind === 'script') {
    requireScriptBytes(request.source.script, maxBytes, 'script')
    const clean = validateDefinitionEnvelope({ meta: request.source.meta as any, script: request.source.script }, '<inline workflow>')
    return { script: clean.script, meta: clean.meta, args: request.args, filename: '<inline workflow>' }
  }

  const path = request.source.path
  const bytes = await readSourceBytes(ctx, path, options, maxBytes)
  if (path.endsWith('.workflow.json')) {
    const filename = path.replaceAll('\\', '/').split('/').at(-1)!
    const name = filename.slice(0, -'.workflow.json'.length)
    const definition = parseWorkflowDefinition(bytes, path, 'project', name, maxBytes)
    return {
      script: definition.script,
      meta: {
        name: definition.name,
        description: definition.description,
        ...(definition.whenToUse === undefined ? {} : { whenToUse: definition.whenToUse }),
        ...(definition.phases === undefined ? {} : { phases: [...definition.phases] }),
      },
      args: request.args,
      filename: path,
    }
  }
  let script: string
  try {
    script = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch (error) {
    throw new Error(`workflow script_path "${path}" is not valid UTF-8`, { cause: error })
  }
  if (request.source.meta === undefined) throw new Error('workflow bare script_path requires the meta object')
  const clean = validateDefinitionEnvelope({ meta: request.source.meta as any, script }, path)
  return { script: clean.script, meta: clean.meta, args: request.args, filename: path }
}

async function saveInlineDefinition(
  registry: WorkflowRegistry | undefined,
  spec: {
    readonly meta: WorkflowDefinitionEnvelope['meta']
    readonly script: string
    readonly cwd?: unknown
    readonly signal?: AbortSignal
    readonly scope: 'project'|'user'
  },
): Promise<string> {
  if (typeof registry?.save !== 'function') {
    throw new Error('workflow inline authoring requires registry.save')
  }
  const cwd = typeof spec.cwd === 'string' && spec.cwd.trim().length > 0 ? spec.cwd : undefined
  if (spec.scope === 'project' && cwd === undefined) {
    throw new Error('workflow inline project save requires a session cwd; use save_scope "user" for a cwd-independent save')
  }
  spec.signal?.throwIfAborted()
  const saved = await registry.save({ meta: spec.meta, script: spec.script }, {
    scope: spec.scope,
    ...(cwd === undefined ? {} : { cwd }),
    ...(spec.signal === undefined ? {} : { signal: spec.signal }),
  })
  spec.signal?.throwIfAborted()
  if (typeof saved !== 'object' || saved === null
    || typeof saved.path !== 'string' || saved.path.trim().length === 0) {
    throw new Error('workflow registry.save returned no valid saved path')
  }
  return saved.path
}

/** Create the exact model-facing background workflow operation. */
export function createWorkflowTool(services: WorkflowToolServices) {
  const maxResultChars = services.maxResultChars ?? MAX_RESULT_CHARS
  return defineTool({
    name: 'workflow',
    description: DESCRIPTION,
    parameters: WORKFLOW_TOOL_PARAMETERS,
    output: {
      schema: {
        oneOf: [
          {
            type: 'object',
            additionalProperties: false,
            properties: {
              status: { type: 'string', const: 'started', required: true },
              displayName: { type: 'string', required: true },
              runId: { type: 'string', required: true },
              script_path: { type: 'string' },
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            properties: {
              status: { type: 'string', const: 'resumed', required: true },
              displayName: { type: 'string', required: true },
              runId: { type: 'string', required: true },
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            properties: {
              status: { type: 'string', const: 'validated', required: true },
              ok: { type: 'boolean', const: true, required: true },
              result: { type: 'json' },
              saved_path: { type: 'string' },
            },
          },
        ],
      },
      render: (_args, value) => [{ type: 'text', text: renderLaunch(value, maxResultChars) }],
    },
    async execute(raw, exec): Promise<WorkflowToolOutput> {
      if (exec?.agent === undefined) throw new Error(MISSING_AGENT)
      const request = parseWorkflowToolRequest(raw)
      if (request.kind === 'resume') {
        const run = await services.supervisor.resumeById(request.runId as any, exec.agent, request.agentBudget, exec.signal)
        return { status: 'resumed', displayName: run.displayName, runId: run.runId }
      }
      const source = await resolveWorkflowSource({
        workflows: services.registry,
        fs: services.fs,
      }, request, {
        agent: exec.agent,
        signal: exec.signal,
        definitionMaxBytes: services.definitionMaxBytes,
      })
      const script = request.source.kind === 'script'
        ? repairObjectLiteralSemicolons(source.script)
        : source.script
      if (request.validateOnly) {
        const validation = await services.supervisor.validate({
          script,
          meta: source.meta,
          args: source.args,
          parent: exec.agent,
          filename: source.filename,
          agentBudget: request.agentBudget,
          signal: exec.signal,
        })
        if (!validation.ok) throw new Error(validation.error)
        const savedPath = request.source.kind === 'script'
          ? await saveInlineDefinition(services.registry, {
            meta: source.meta,
            script,
            cwd: exec.agent?.session?.header?.cwd,
            signal: exec.signal,
            scope: request.saveScope ?? 'project',
          })
          : undefined
        return {
          status: 'validated',
          ok: true,
          ...(validation.value === undefined ? {} : { result: validation.value as JsonValue }),
          ...(savedPath === undefined ? {} : { saved_path: savedPath }),
        }
      }
      const start = () => services.supervisor.start({
        script,
        meta: source.meta,
        args: source.args,
        parent: exec.agent,
        agentBudget: request.agentBudget,
        signal: exec.signal,
      })
      const nested = exec.parent !== undefined
      const launched = services.recorder === undefined || nested
        ? await start()
        : await services.recorder.launch(exec.agent.session, start)
      return {
        status: 'started',
        displayName: launched.displayName,
        runId: launched.runId,
        ...(launched.scriptPath === undefined ? {} : { script_path: launched.scriptPath }),
      }
    },
    presentCall: args => presentWorkflowCall(args),
    presentResult: (args, result) => presentWorkflowResult(args, result),
  })
}
