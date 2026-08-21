import { parseWorkflowDefinition, validateDefinitionEnvelope } from '../registry/definition.js'
import type { WorkflowRegistry } from '../registry/index.js'
import type { WorkflowDefinitionEnvelope } from '../registry/types.js'
import { VALIDATION_NOTE } from '../supervisor/index.js'
import type { WorkflowSupervisor } from '../supervisor/index.js'
import { FsError } from '@deepseek-ai/dsh-fs'
import { assertNever } from '@deepseek-ai/dsh-llm'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolCallView, ToolResultView } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-session'
import type { WorkflowToolArgs } from './schema.js'
import { parseWorkflowToolRequest, WORKFLOW_TOOL_PARAMETERS, WORKFLOW_TOOL_SCHEMA } from './schema.js'

export * from './schema.js'
export { VALIDATION_NOTE }

/**
 * Opaque H contribution identities.  Release H U36 re-exports/uses these exact
 * objects when it mounts the official workflow contribution.  Until that
 * export exists, identity matching uses this package freeze plus an explicit
 * official marker; a same-name custom tool is never treated as official.
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
const MISSING_REPLACE = 'workflow package requires tools.replace and systemPrompt.replaceSection from Harness release H'
const MISSING_FS = 'workflow package requires fs.readBytesNoFollow from Harness release H'

const DESCRIPTION = `Run a JavaScript workflow script that orchestrates subagents at scale. Use this for work that fans out across many independent pieces — an audit over many files, a migration, multi-angle research, adversarial verification of findings — where you write the orchestration as a script instead of delegating turn by turn.

Supply EXACTLY ONE source: \`name\` (a saved workflow in .dsh/workflows), \`script\` (an inline plain-JS body, plus the required \`meta\` object), or \`script_path\` (a .workflow.json envelope or a script file on disk, plus \`meta\` for a bare file).

The workflow's identity rides \`meta\` as JSON: required \`name\` (short kebab-case) and \`description\` strings, optional \`whenToUse\` string and \`phases\` array (\`{title, detail?, provider?, model?}\`). The script body is plain JavaScript ONLY (NOT TypeScript, and NO \`export const meta\` statement — meta is data beside the body), running with top-level await.

Script-body hooks:
- \`agent(prompt, opts?): Promise<any>\` — run one subagent to completion. Without \`opts.schema\` it resolves to the child's final text; with \`opts.schema\` (an object-rooted JSON Schema using ONLY type/properties/required/additionalProperties/items/minItems/maxItems/enum/const/oneOf — \`minItems\`/\`maxItems\` are array-only non-negative integer bounds; no pattern/format/numeric bounds) it resolves to the validated object. Resolves \`null\` when the child fails (filter with \`.filter(Boolean)\`). Other opts: \`label\` (display), \`phase\` (progress group), and independent \`provider\`/\`model\` LLM target overrides (either may be provided alone). Anything else is rejected loudly.
- \`parallel(items): Promise<any[]>\` — run zero-argument functions OR job maps \`{prompt, label?, phase?, schema?, provider?, model?}\` concurrently and await ALL (a barrier). Failed slots resolve to \`null\`.
- \`pipeline(items, ...stages): Promise<any[]>\` — run each item through the stages independently with NO barrier between stages. Each stage receives \`(prev, item, index)\`.
- \`phase(title)\` — start a progress phase; \`log(message)\` — narrate progress; \`args\` — the tool call's \`args\` input, verbatim.
- \`complete(value)\` — end the run successfully with a JSON value (use this instead of \`return\`).
- \`await_user(kind, message)\` — park the run for a human answer; resume continues past it. \`pause(kind, message)\` — park a run for a condition resume cannot change; resume re-fires it. Kinds: user, back_off, no_progress, verification, infra.
- \`budget(): { total, spent, reserved, remaining }\` — this run's logical agent budget. \`write_scratch_file(name, content)\` / \`read_scratch_file(name)\` — per-run scratch storage (single-component names).

Misused hooks (bad arguments, unknown options, unsupported schemas, tripped caps) throw errors that ALWAYS kill the script — they never dissolve into a per-item \`null\`.

Launch is BACKGROUND: the call returns immediately with \`{ displayName, runId, script_path, status: "started" }\`; the supervisor owns the run and posts the final report to the conversation when it settles. Concurrency and total-agent caps apply; no filesystem, network, timers, or Node.js APIs are provided to the script — the agents do the work, the script only coordinates them. Set \`validate_only: true\` to smoke-check one canned-host path without launching children. To resume a paused, needs-input, or budget-limited run, supply only \`resume_from_run_id\` and optionally a higher \`agent_budget\` for a budget-limited run.`

const PROMPT_TEXT = 'Use the workflow tool ONLY when the user explicitly asks for a workflow or for large multi-agent orchestration: you write a JavaScript script (the tool description documents the exact format) that fans work out across many subagents with phases and structured results. For one or two delegations, prefer plain subagent calls.'

type WorkflowToolOutput =
  | { status: 'started'; displayName: string; runId: string; script_path?: string }
  | { status: 'resumed'; displayName: string; runId: string }
  | { status: 'validated'; ok: true; result?: JsonValue }

export interface WorkflowToolServices {
  readonly registry: WorkflowRegistry
  readonly supervisor: WorkflowSupervisor
  readonly recorder?: { launch(session: any, start: () => Promise<any>): Promise<any> }
  readonly fs?: HostWorkflowFs
  readonly definitionMaxBytes?: number
  readonly maxResultChars?: number
}

interface HostWorkflowFs {
  readBytesNoFollow(
    path: string,
    options: { cwd?: string },
    signal?: AbortSignal,
    maxBytes?: number,
  ): Promise<Uint8Array>
}

function officialContribution(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<PropertyKey, unknown>
  return record[OFFICIAL_MARKER] === true || record.__officialWorkflowContribution === true
}

/** Strict identity/marker predicate; a same-name custom tool is not official. */
export function isOfficialWorkflowTool(definition: unknown): boolean {
  return definition === WORKFLOW_TOOL_DEFINITION || officialContribution(definition)
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
      return `workflow smoke check passed.\n${VALIDATION_NOTE}\nResult:\n${clipped}`
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

/** Atomically shadow one exact Agent's official tool and prompt contribution. */
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
  if (typeof tools?.replace !== 'function' || typeof systemPrompt?.replaceSection !== 'function') {
    throw new Error(MISSING_REPLACE)
  }
  const services = isServices ? servicesOrTool as WorkflowToolServices : ctx?.workflowToolServices
  if (services === undefined && !suppliedReplacement) return () => undefined
  const replacement = suppliedReplacement ? servicesOrTool : createWorkflowTool({
    ...services,
    fs: services.fs ?? ctx?.fs,
  })
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
  const states = new Map<any, { restore?: () => unknown; queued: boolean; disposed: boolean; selfChange: boolean }>()
  const reconcile = (agent: any): void => {
    const state = states.get(agent)
    if (state === undefined || state.disposed) return
    state.selfChange = true
    try { state.restore?.() } catch { /* restoration is best-effort during churn */ }
    state.restore = undefined
    const visible = visibleWorkflowTool(agent)
    try {
      if (isOfficialWorkflowTool(visible)) state.restore = installWorkflowShadow(agent, resolved)
    } catch (error) {
      ctx.logger?.warn?.(`workflow tool shadow failed: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      queueMicrotask(() => { state.selfChange = false })
    }
  }
  const schedule = (agent: any): void => {
    const state = states.get(agent); if (state === undefined || state.queued || state.disposed) return
    state.queued = true
    queueMicrotask(() => { state.queued = false; if (!state.disposed) reconcile(agent) })
  }
  const add = (agent: any): void => {
    if (agent === undefined || states.has(agent)) return
    states.set(agent, { queued: false, disposed: false, selfChange: false })
    reconcile(agent)
  }
  const remove = (agent: any): void => {
    const state = states.get(agent); if (state === undefined) return
    state.disposed = true; state.selfChange = true; try { state.restore?.() } catch { /* contained */ }; state.restore = undefined; states.delete(agent)
  }
  for (const agent of (Array.isArray(ctx.agents?.list?.()) ? ctx.agents.list() : [])) add(agent)
  const cleanups: Array<() => unknown> = []
  for (const [event, handler] of [['agent/created', (event: any) => add(event?.agent ?? event)], ['agent/disposed', (event: any) => remove(event?.agent ?? event)]] as const) {
    const dispose = ctx.on?.(event, handler); if (typeof dispose === 'function') cleanups.push(dispose)
  }
  const toolsChanged = (): void => { for (const [agent, state] of states) if (!state.selfChange) schedule(agent) }
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

async function readSourceBytes(ctx: any, path: string, options: ResolveOptions, maxBytes: number): Promise<Uint8Array> {
  const cwd = options.agent?.session?.header?.cwd
  if (!isAbsolutePath(path) && (typeof cwd !== 'string' || cwd.trim().length === 0 || !isAbsolutePath(cwd))) {
    throw new Error('workflow script_path must be absolute when the calling Session has no absolute cwd')
  }
  if (typeof ctx.fs?.readBytesNoFollow !== 'function') throw new Error(MISSING_FS)
  let bytes: Uint8Array
  try {
    bytes = await ctx.fs.readBytesNoFollow(
      path,
      typeof cwd === 'string' && cwd.trim().length > 0 ? { cwd } : {},
      options.signal,
      maxBytes,
    )
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
      if (request.validateOnly) {
        const validation = await services.supervisor.validate({
          script: source.script,
          meta: source.meta,
          args: source.args,
          parent: exec.agent,
          filename: source.filename,
          agentBudget: request.agentBudget,
          signal: exec.signal,
        })
        if (!validation.ok) throw new Error(validation.error)
        return {
          status: 'validated',
          ok: true,
          ...(validation.value === undefined ? {} : { result: validation.value as JsonValue }),
        }
      }
      const start = () => services.supervisor.start({
        script: source.script,
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
