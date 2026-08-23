import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

import { resolveWorkflowPackageConfig } from '../src/config.js'
import { WorkflowRegistry } from '../src/registry/index.js'
import { WorkflowRunsRemote } from '../src/supervisor/remote.js'
import { openWorkflowStorage } from '../src/supervisor/storage/index.js'
import { WorkflowSupervisor } from '../src/supervisor/index.js'

const hasProviderKey = typeof process.env.DEEPSEEK_API_KEY === 'string'
  && process.env.DEEPSEEK_API_KEY.trim().length > 0
const WORKFLOW_NAME = 'real-provider-check'
const MODEL = 'deepseek-v4-flash'
const RUN_TIMEOUT_MS = 120_000
const CLEANUP_TIMEOUT_MS = 15_000

/**
 * The worker and AgentLoop are Harness-owned prerequisites, not package
 * runtime dependencies.  Prefer a built, read-only Harness checkout when one
 * is available; the package-name fallback is what an installed official profile
 * supplies.  All imports stay inside the key-gated test body.
 */
const HARNESS_CANDIDATES = [
  process.env.DSH_HARNESS_CHECKOUT,
  '/Users/zaali/dev/deepseek-harness',
  '/Users/zaali/dev/research/deepseek-harness',
].filter((value): value is string => typeof value === 'string' && value.length > 0)

const WORKFLOW_SCRIPT = `
const results = await parallel([
  {
    label: 'alpha',
    provider: 'spawn',
    model: '${MODEL}',
    prompt: 'Use the Bash tool in the current workspace. Run exactly: printf %s alpha > alpha.txt. The file must contain exactly the five bytes alpha, with no trailing newline. Then return exactly the JSON object {"label":"alpha"}. Do not write any other file.',
    schema: { type: 'object', properties: { label: { type: 'string', enum: ['alpha'] } }, required: ['label'], additionalProperties: false },
  },
  {
    label: 'beta',
    provider: 'spawn',
    model: '${MODEL}',
    prompt: 'Use the Bash tool in the current workspace. Run exactly: printf %s beta > beta.txt. The file must contain exactly the four bytes beta, with no trailing newline. Then return exactly the JSON object {"label":"beta"}. Do not write any other file.',
    schema: { type: 'object', properties: { label: { type: 'string', enum: ['beta'] } }, required: ['label'], additionalProperties: false },
  },
])
return { alpha: results[0].label, beta: results[1].label }
`.trimStart()

type ModuleValue = Record<string, any>

interface HarnessModules {
  readonly Context: any
  readonly SessionId: (value: string) => any
  readonly mountAgentLoopTestDependencies: (ctx: any) => Promise<void>
  readonly AgentLoop: any
  readonly LlmDeepSeek: any
  readonly LocalSubprocessRuntime: any
  readonly ShellEnv: any
  readonly LocalBashExecutor: any
  readonly ToolBash: any
  readonly SubagentRuntime: any
  readonly Spawn: any
  readonly WorkerThreadWorkflowEngine: any
}

interface ExecutionStats {
  maxSeq: number
}

interface EngineInstallation {
  readonly original: any
  readonly restore: () => void
}

function moduleDefault(module: ModuleValue, named: string): any {
  return module[named] ?? module.default
}

async function importModule(specifier: string): Promise<ModuleValue> {
  return await import(/* @vite-ignore */ specifier) as ModuleValue
}

async function harnessModule(relativePath: string, packageName: string): Promise<ModuleValue> {
  for (const root of HARNESS_CANDIDATES) {
    const path = resolve(root, relativePath)
    if (!existsSync(path)) continue
    try {
      return await importModule(pathToFileURL(path).href)
    } catch {
      // A source-only checkout is not a runnable provider fixture.  Try the
      // next read-only checkout, then the installed official package below.
    }
  }
  return importModule(packageName)
}

async function loadHarnessModules(): Promise<HarnessModules> {
  const [cordis, session, testkit, agentLoop, llmDeepSeek, subprocess, shellEnv, bash,
    toolBash, subagent, spawn, worker] = await Promise.all([
    harnessModule('vendor/cordis/lib/index.js', '@deepseek-ai/cordis'),
    harnessModule('packages/core/session/lib/index.js', '@deepseek-ai/dsh-session'),
    harnessModule('packages/test-support/agent-loop-testkit/lib/index.js', '@deepseek-ai/dsh-agent-loop-testkit'),
    harnessModule('packages/core/agent-loop/lib/index.js', '@deepseek-ai/dsh-agent-loop'),
    harnessModule('packages/llm/llm-deepseek/lib/index.js', '@deepseek-ai/dsh-llm-deepseek'),
    harnessModule('packages/subprocess/subprocess-local/lib/index.js', '@deepseek-ai/dsh-subprocess-local'),
    harnessModule('packages/shell/shell-env/lib/index.js', '@deepseek-ai/dsh-shell-env'),
    harnessModule('packages/shell/bash-local/lib/index.js', '@deepseek-ai/dsh-bash-local'),
    harnessModule('packages/shell/tool-bash/lib/index.js', '@deepseek-ai/dsh-tool-bash'),
    harnessModule('packages/subagent/subagent/lib/index.js', '@deepseek-ai/dsh-subagent'),
    harnessModule('packages/subagent/subagent-spawn-in-process/lib/index.js', '@deepseek-ai/dsh-subagent-spawn-in-process'),
    harnessModule('packages/workflow/workflow-worker-thread/lib/index.js', '@deepseek-ai/dsh-workflow-worker-thread'),
  ])

  const Context = moduleDefault(cordis, 'Context')
  const SessionId = moduleDefault(session, 'SessionId')
  const mountAgentLoopTestDependencies = moduleDefault(testkit, 'mountAgentLoopTestDependencies')
  const AgentLoop = moduleDefault(agentLoop, 'AgentLoop')
  const WorkerThreadWorkflowEngine = moduleDefault(worker, 'WorkerThreadWorkflowEngine')
  const LocalSubprocessRuntime = moduleDefault(subprocess, 'LocalSubprocessRuntime')
  const LocalBashExecutor = moduleDefault(bash, 'LocalBashExecutor')
  if (typeof Context !== 'function'
    || typeof SessionId !== 'function'
    || typeof mountAgentLoopTestDependencies !== 'function'
    || AgentLoop === undefined
    || WorkerThreadWorkflowEngine === undefined
    || LocalSubprocessRuntime === undefined
    || LocalBashExecutor === undefined) {
    throw new Error('real-provider Harness prerequisites are unavailable')
  }
  return {
    Context,
    SessionId,
    mountAgentLoopTestDependencies,
    AgentLoop,
    LlmDeepSeek: llmDeepSeek,
    LocalSubprocessRuntime,
    ShellEnv: shellEnv,
    LocalBashExecutor,
    ToolBash: toolBash,
    SubagentRuntime: subagent,
    Spawn: spawn,
    WorkerThreadWorkflowEngine,
  }
}

function bounded<T>(operation: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(label)), timeoutMs)
    timer.unref?.()
  })
  return Promise.race([operation, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer)
  })
}

async function closeResource(resource: unknown, label: string): Promise<void> {
  if (resource === undefined || resource === null) return
  const disposer = typeof resource === 'function'
    ? resource as () => unknown
    : typeof (resource as { dispose?: unknown }).dispose === 'function'
      ? () => (resource as { dispose(): unknown }).dispose()
      : undefined
  if (disposer === undefined) return
  await bounded(Promise.resolve().then(disposer), CLEANUP_TIMEOUT_MS, `${label} cleanup timed out`)
}

/**
 * A partial stock worker handle can omit release/checkpoint. Keep this
 * compatibility adapter local to the opt-in test: it preserves the worker's
 * execution id and result, adds the supervisor's required lifecycle face, and
 * deliberately exposes an empty replay journal after settlement. A complete
 * worker handle takes the direct branch and exercises its replay authority.
 */
function installEngineCompatibilityAdapter(ctx: any, workerFiber: any, starts: readonly { id: string; seq: number }[]): EngineInstallation {
  const original = ctx.workflowEngine
  const stats = new Map<string, ExecutionStats>()
  for (const start of starts) {
    const current = stats.get(start.id) ?? { maxSeq: 0 }
    current.maxSeq = Math.max(current.maxSeq, start.seq)
    stats.set(start.id, current)
  }
  const wrapped = {
    start(request: any): any {
      const raw = original.start.call(original, request)
      if (typeof raw?.release === 'function' && typeof raw?.checkpoint === 'function') return raw
      if (raw === undefined || raw === null || typeof raw.result?.then !== 'function') return raw

      const id = typeof raw.id === 'string' && raw.id.length > 0 ? raw.id : randomUUID()
      const execution = stats.get(id) ?? { maxSeq: 0 }
      stats.set(id, execution)
      let settled: any
      let disposed = false
      const result = Promise.resolve(raw.result).then(value => {
        settled = value
        return value
      })
      return {
        id,
        result,
        cancel: (reason?: string) => raw.cancel?.(reason),
        resume: () => raw.resume?.(),
        // The old worker starts as soon as start() is called.  Its result is
        // still detached from the caller; release is therefore intentionally
        // a no-op for this compatibility path.
        release: () => undefined,
        async dispose() {
          await raw.dispose?.()
          disposed = true
        },
        checkpoint() {
          if (settled === undefined || !disposed) throw new Error('workflow checkpoint is not ready')
          const spend = Math.max(Number(settled?.agentsStarted) || 0, execution.maxSeq)
          return { journal: [], agentSpend: spend, agentSeq: spend }
        },
      }
    },
  }
  const owner = workerFiber?.ctx ?? workerFiber
  owner.reflect.set('workflowEngine', wrapped)
  return {
    original,
    restore: () => owner.reflect.set('workflowEngine', original),
  }
}

function resultValue(view: any): any {
  expect(view?.value?.state).toBe('available')
  expect(view?.value?.content?.kind).toBe('value')
  return view.value.content.value
}

function restoreEnvironment(name: string, previous: string | undefined): void {
  if (previous === undefined) delete process.env[name]
  else process.env[name] = previous
}

describe('real-provider workflow', () => {
  if (!hasProviderKey) {
    it.skip('DEEPSEEK_API_KEY is not set', () => {
      throw new Error('skip-without-key must not run a provider body')
    })
    return
  }

  it('runs two bounded Bash-backed structured children through the package supervisor', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-real-provider-'))
    const workspace = join(root, 'workspace')
    const home = join(root, 'dsh-home')
    const runsRoot = join(root, 'workflow-runs')
    await mkdir(workspace, { recursive: true, mode: 0o700 })
    await mkdir(home, { recursive: true, mode: 0o700 })
    // A marker makes this temporary directory an unambiguous project root for
    // the package's local definition registry.
    await writeFile(join(workspace, '.git'), '', { mode: 0o600 })

    const previousHome = process.env.HOME
    const previousDshHome = process.env.DSH_HOME
    process.env.HOME = home
    process.env.DSH_HOME = home

    let ctx: any
    let workerFiber: any
    let registry: WorkflowRegistry | undefined
    let storage: Awaited<ReturnType<typeof openWorkflowStorage>> | undefined
    let supervisor: WorkflowSupervisor | undefined
    let parentHandle: any
    let engineInstallation: EngineInstallation | undefined
    let eventDisposer: (() => void) | undefined
    const starts: Array<{ id: string; seq: number; label: string }> = []
    const ends: Array<{ id: string; seq: number; outcome: string }> = []
    let bodyFailed = false
    let bodyFailure: unknown
    const cleanupFailures: string[] = []

    try {
      try {
        const harness = await loadHarnessModules()
        ctx = new harness.Context()

        await harness.mountAgentLoopTestDependencies(ctx)
        await ctx.plugin(harness.AgentLoop, { agents: [] })
        await ctx.plugin(harness.LlmDeepSeek, {
          thinking: 'enabled',
          reasoningEffort: 'max',
          maxTokens: 1_024,
        })
        await ctx.plugin(harness.LocalSubprocessRuntime)
        await ctx.plugin(harness.ShellEnv, { dshHome: home })
        await ctx.plugin(harness.LocalBashExecutor, {
          cwd: workspace,
          timeoutMs: 15_000,
          maxTimeoutMs: 20_000,
          maxOutputBytes: 16_384,
        })
        await ctx.plugin(harness.ToolBash, { enableRunInBackground: false })
        await ctx.plugin(harness.SubagentRuntime)
        workerFiber = await ctx.plugin(harness.Spawn, { providerName: 'spawn' })
        const workerEngineFiber = await ctx.plugin(harness.WorkerThreadWorkflowEngine, {
          provider: 'spawn',
          maxTotalAgents: 2,
          maxConcurrentAgents: 2,
          disposeGraceMs: 5_000,
        })

        const removeStart = ctx.on('workflow/agent-start', (info: any, member: any) => {
          if (typeof info?.id !== 'string' || !Number.isSafeInteger(member?.seq)) return
          starts.push({ id: info.id, seq: member.seq, label: String(member.label ?? '') })
        })
        const removeEnd = ctx.on('workflow/agent-end', (info: any, member: any) => {
          if (typeof info?.id !== 'string' || !Number.isSafeInteger(member?.seq)) return
          ends.push({ id: info.id, seq: member.seq, outcome: String(member.outcome ?? '') })
        })
        eventDisposer = () => {
          try { removeStart?.() } finally { removeEnd?.() }
        }
        // The worker engine is the only service that needs this test compatibility
        // shim.  It must be replaced through its owning fiber, not provided a
        // second time (Cordis rejects duplicate service identities).
        engineInstallation = installEngineCompatibilityAdapter(ctx, workerEngineFiber, starts)

        const config = resolveWorkflowPackageConfig({
          dshHome: home,
          runsRoot,
          definitionWatch: false,
          defaultAgentBudget: 2,
          maxAgentBudget: 2,
          maxConcurrentAgents: 2,
          maxMembersPerRun: 2,
        }, home)
        registry = new WorkflowRegistry({ dshHome: home, definitionWatch: false })
        await registry.save({
          meta: { name: WORKFLOW_NAME, description: 'real provider two-child file check' },
          script: WORKFLOW_SCRIPT,
        }, { scope: 'project', cwd: workspace })
        const definition = await registry.get(WORKFLOW_NAME, { cwd: workspace })
        expect(definition).toBeDefined()
        expect(definition?.script).toBe(WORKFLOW_SCRIPT)

        storage = await openWorkflowStorage(config)
        ctx.provide('workflowStorage', storage)
        ctx.provide('workflows', registry)
        supervisor = new WorkflowSupervisor(ctx, {
          defaultAgentBudget: 2,
          maxAgentBudget: 2,
          maxConcurrentAgents: 2,
          maxMembersPerRun: 2,
        }, storage.store)
        ctx.provide('workflowSupervisor', supervisor)
        await bounded(supervisor.initialize(), 10_000, 'workflow supervisor initialization timed out')

        if (typeof ctx.agents?.create !== 'function') throw new Error('real-provider Agent factory is unavailable')
        parentHandle = await ctx.agents.create({
          sessionId: harness.SessionId('real-provider-parent'),
          meta: { cwd: workspace },
          agentOptions: { provider: 'deepseek-official', model: MODEL, maxTokens: 1_024 },
        })
        const parent = parentHandle.agent
        const launched = await bounded(
          supervisor.start({ definition, parent, agentBudget: 2 }),
          15_000,
          'workflow admission timed out',
        )

        await bounded(supervisor.whenOwnerQuiescent(parent), RUN_TIMEOUT_MS, 'real-provider workflow timed out')

        const listed = await bounded(supervisor.list(parent, { limit: 10 }), 10_000, 'workflow list timed out')
        expect(listed.total).toBe(1)
        expect(listed.items).toHaveLength(1)
        expect(listed.items[0]).toMatchObject({
          displayName: WORKFLOW_NAME,
          name: WORKFLOW_NAME,
          status: 'completed',
          memberCounts: { total: 2, running: 0, completed: 2, failed: 0, cancelled: 0 },
        })

        const detail = await bounded(supervisor.detail(parent, launched.runId), 10_000, 'workflow detail timed out')
        expect(detail.run.status).toBe('completed')
        expect(detail.run.memberCounts.total).toBe(2)
        const members = await bounded(supervisor.members(parent, { runId: launched.runId, limit: 10 }), 10_000, 'workflow members timed out')
        expect(members.total).toBe(2)
        expect(members.items).toHaveLength(2)
        const orderedMembers = [...members.items].sort((left, right) => left.seq - right.seq)
        expect(orderedMembers.map(member => member.label)).toEqual(['alpha', 'beta'])
        expect(orderedMembers.every(member => member.status === 'completed' && member.outcome === 'available')).toBe(true)

        const directResult = await bounded(supervisor.result(parent, launched.runId), 10_000, 'workflow result timed out')
        const directValue = resultValue(directResult)
        expect(JSON.stringify(directValue)).toBe('{"alpha":"alpha","beta":"beta"}')
        expect(directValue).toEqual({ alpha: 'alpha', beta: 'beta' })

        const remote = new WorkflowRunsRemote(ctx)
        const remoteList = await bounded(remote.list(parent, { limit: 10 }, new AbortController().signal), 10_000, 'workflow Remote list timed out')
        expect(remoteList.ok).toBe(true)
        if (!remoteList.ok) throw new Error('workflow Remote list was not available')
        expect(remoteList.value.total).toBe(1)
        const remoteDetail = await bounded(remote.detail(parent, { runId: launched.runId }, new AbortController().signal), 10_000, 'workflow Remote detail timed out')
        expect(remoteDetail.ok).toBe(true)
        if (!remoteDetail.ok) throw new Error('workflow Remote detail was not available')
        expect(remoteDetail.value.run.status).toBe('completed')
        expect(remoteDetail.value).not.toHaveProperty('scriptPath')
        const remoteMembers = await bounded(remote.members(parent, { runId: launched.runId, limit: 10 }, new AbortController().signal), 10_000, 'workflow Remote members timed out')
        expect(remoteMembers.ok).toBe(true)
        if (!remoteMembers.ok) throw new Error('workflow Remote members were not available')
        expect(remoteMembers.value.total).toBe(2)
        expect([...remoteMembers.value.items].sort((left, right) => left.seq - right.seq).map(member => member.label)).toEqual(['alpha', 'beta'])
        const remoteResult = await bounded(remote.result(parent, { runId: launched.runId }, new AbortController().signal), 10_000, 'workflow Remote result timed out')
        expect(remoteResult.ok).toBe(true)
        if (!remoteResult.ok) throw new Error('workflow Remote result was not available')
        expect(JSON.stringify(resultValue(remoteResult.value))).toBe('{"alpha":"alpha","beta":"beta"}')

        expect(starts).toHaveLength(2)
        expect(ends).toHaveLength(2)
        expect([...starts].sort((left, right) => left.seq - right.seq).map(start => start.label)).toEqual(['alpha', 'beta'])
        expect([...ends].sort((left, right) => left.seq - right.seq).map(end => end.seq)).toEqual(
          [...starts].sort((left, right) => left.seq - right.seq).map(start => start.seq),
        )
        expect(ends.every(end => end.outcome === 'completed')).toBe(true)
        expect(Buffer.from(await readFile(join(workspace, 'alpha.txt')))).toEqual(Buffer.from('alpha'))
        expect(Buffer.from(await readFile(join(workspace, 'beta.txt')))).toEqual(Buffer.from('beta'))
      } catch (error) {
        bodyFailed = true
        bodyFailure = error
      }
    } finally {
      await closeResource(supervisor, 'workflow supervisor').catch(() => cleanupFailures.push('workflow supervisor'))
      await closeResource(parentHandle, 'parent Agent').catch(() => cleanupFailures.push('parent Agent'))
      try { eventDisposer?.() } catch { cleanupFailures.push('workflow event listener') }
      try { engineInstallation?.restore() } catch { cleanupFailures.push('workflow engine') }
      await closeResource(registry, 'workflow registry').catch(() => cleanupFailures.push('workflow registry'))
      await closeResource(ctx?.fiber, 'Harness context').catch(() => cleanupFailures.push('Harness context'))
      await closeResource(storage, 'workflow storage lease').catch(() => cleanupFailures.push('workflow storage lease'))
      restoreEnvironment('HOME', previousHome)
      restoreEnvironment('DSH_HOME', previousDshHome)
      await rm(root, { recursive: true, force: true }).catch(() => cleanupFailures.push('temporary directory'))
    }

    if (bodyFailed) throw bodyFailure
    if (cleanupFailures.length > 0) throw new Error('real-provider resources did not dispose cleanly')
  }, RUN_TIMEOUT_MS + CLEANUP_TIMEOUT_MS * 2)
})
