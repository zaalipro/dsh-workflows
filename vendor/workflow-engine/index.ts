/**
 * Worker-thread workflow engine. Each run executes its model-written script in
 * an escapable vm context on a fresh worker and bridges `agent()` calls to host
 * subagents. The thread prevents synchronous script work from blocking the host
 * and permits forced termination, but it is containment rather than a security boundary.
 * @module @deepseek-ai/dsh-workflow-worker-thread
 */

import { randomUUID } from 'node:crypto'
import { availableParallelism } from 'node:os'
import * as vm from 'node:vm'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { WorkflowRunId } from '@deepseek-ai/dsh-workflow'
import type { WorkflowRun, WorkflowRunInfo } from '@deepseek-ai/dsh-workflow'
import { WorkflowError, type WorkflowStartRequest } from './compat-seam.ts'
import type { WorkflowJournalEntry } from './types.ts'
import { snapshotJsonValue } from '@deepseek-ai/dsh-session'
import { WorkerRun } from './host.ts'
import { validateMeta } from './meta.ts'
import type { WorkerHostLimits, WorkerInit, WorkerLimits } from './types.ts'

export { validateMeta } from './meta.ts'
export { materializeFromRealm, MaterializeError } from './realm.ts'
export type {
  ChildHandle,
  ChildPort,
  ChildResult,
  ChildStartRequest,
  WorkerInit,
  WorkerLimits,
} from './types.ts'

/** Plugin config (all optional — `static Config` supplies the defaults). */
export interface Config {
  /** The `ctx.subagents` provider children run on (default `spawn`). */
  provider?: string
  /** Concurrent `agent()` ceiling; `0` (the default) auto-resolves to `min(16, max(1, cores - 2))`. */
  maxConcurrentAgents?: number
  /** Total `agent()` calls one run may start — the runaway-loop backstop (default 1024). */
  maxTotalAgents?: number
  /** Items accepted by a single `parallel()`/`pipeline()` call (default 4096). */
  maxItemsPerCall?: number
  /** vm timeout for the script's initial synchronous slice, inside the worker (default 5000 ms). */
  syncTimeoutMs?: number
  /**
   * How long after a cancellation an unsettled script may keep running before
   * the run force-settles `cancelled` and its worker is TERMINATED (default
   * 5000 ms); also bounds `dispose()`.
   */
  disposeGraceMs?: number
  /** Maximum encoded bytes accepted for one worker protocol message (default 8 MiB). */
  maxProtocolMessageBytes?: number
  /** Maximum UTF-8 JSON bytes committed to one run's host-call journal (default 64 MiB). */
  maxJournalBytes?: number
  /** Maximum UTF-8 bytes accepted in one child prompt (default 1 MiB). */
  maxChildPromptBytes?: number
  /** Maximum UTF-8 bytes accepted in one progress event string (default 64 KiB). */
  maxEventTextBytes?: number
  /** Maximum scratch reads and writes admitted over one engine attempt (default 4096). */
  scratchMaxOperations?: number
  /** Maximum scratch reads and writes pending at once (default 64). */
  scratchMaxPendingOperations?: number
  /** Maximum scratch files in one run (default 64). */
  scratchMaxFiles?: number
  /** Maximum UTF-8 bytes in one scratch file (default 1 MiB). */
  scratchMaxFileBytes?: number
  /** Maximum UTF-8 bytes across one run's scratch files (default 8 MiB). */
  scratchMaxTotalBytes?: number
  /** Hard wall-clock bound for validate-only execution (default 10000 ms). */
  validationTimeoutMs?: number
}

type ResolvedConfig = Required<Config>

/** A body that still carries the Claude Code-style meta header (meta rides the seam as data here). */
const META_STATEMENT = /^\s*export\s+const\s+meta\b/

/**
 * Parse-check the body with the SAME wrapper the worker-side runtime
 * compiles, so `start()` keeps the seam's synchronous `SCRIPT_PARSE` throw
 * (the worker's own compile happens a thread away, after `start()` returned).
 * One redundant parse per run, bought deliberately for the contract. A body
 * opening with `export const meta` gets a pointed message instead of the
 * wrapper's bare SyntaxError — the model's likeliest authoring slip.
 */
function assertBodyParses(body: string, name: string): void {
  if (META_STATEMENT.test(body)) {
    throw new WorkflowError('workflow meta rides the `meta` request field, not the script: remove the `export const meta = {...}` statement from the body', 'SCRIPT_PARSE')
  }
  try {
    // Parse only — the script object is discarded, nothing executes.
    void new vm.Script(`(async () => {\n${body}\n})()`, { filename: `workflow:${name}`, lineOffset: -1 })
  } catch (error: unknown) {
    throw new WorkflowError(`workflow script does not parse: ${String(error)}`, 'SCRIPT_PARSE', { cause: error })
  }
}

/** Resolve one run's provider route before publishing work. */
function resolveSubagentProvider(ctx: Context, configured: string, override: string | undefined): string {
  const provider = override ?? configured
  if (provider.length === 0 || provider !== provider.trim()) {
    throw new WorkflowError(
      'workflow subagentProvider must be a non-empty normalized string',
      'INVALID_ARGUMENT',
    )
  }
  if (ctx.subagents.getProvider(provider) === undefined) {
    throw new WorkflowError(`no subagent provider registered for "${provider}"`, 'AGENT_START')
  }
  return provider
}

/** Resolve one run's total-child cap against the engine deployment ceiling. */
function resolveMaxTotalAgents(requested: number | undefined, ceiling: number): number {
  if (requested === undefined) return ceiling
  if (!Number.isSafeInteger(requested) || requested < 1) {
    throw new WorkflowError('workflow maxTotalAgents must be a positive safe integer', 'INVALID_ARGUMENT')
  }
  if (requested > ceiling) {
    throw new WorkflowError(
      `workflow maxTotalAgents ${requested} exceeds the engine ceiling ${ceiling}`,
      'INVALID_ARGUMENT',
    )
  }
  return requested
}

/** Validate cumulative spend supplied by a logical-run supervisor. */
function resolveInitialAgentSpend(
  requested: number | undefined,
  total: number,
  journal: WorkflowStartRequest['journal'],
): number {
  const committed = journal?.filter(entry => entry.kind === 'agent').length ?? 0
  const resolved = requested ?? committed
  if (!Number.isSafeInteger(resolved) || resolved < committed || resolved > total) {
    throw new WorkflowError(
      `workflow initialAgentSpend must be a safe integer between the committed journal count (${committed}) and maxTotalAgents (${total})`,
      'INVALID_ARGUMENT',
    )
  }
  return resolved
}

/** Validate the monotonic member sequence seed supplied by a logical-run supervisor. */
function resolveInitialAgentSeq(
  requested: number | undefined,
  spend: number,
  total: number,
  journal: WorkflowStartRequest['journal'],
): number {
  let journalMaximum = 0
  for (const entry of journal ?? []) {
    if (entry.kind !== 'agent') continue
    journalMaximum = Math.max(journalMaximum, entry.seq)
  }
  const minimum = Math.max(spend, journalMaximum)
  const resolved = requested ?? minimum
  if (!Number.isSafeInteger(resolved)
    || resolved < minimum
    || resolved > Number.MAX_SAFE_INTEGER - (total - spend)) {
    throw new WorkflowError(
      `workflow initialAgentSeq must be a safe integer no less than prior spend or journal sequence (${minimum}) with room for the remaining logical-agent budget`,
      'INVALID_ARGUMENT',
    )
  }
  return resolved
}

/** Snapshot and validate replay data before it crosses into workerData. */
function resolveJournal(journal: WorkflowStartRequest['journal']): readonly WorkflowJournalEntry[] | undefined {
  if (journal === undefined) return undefined
  let snapshot: unknown
  try {
    snapshot = snapshotJsonValue<unknown>(journal)
  } catch (error: unknown) {
    throw new WorkflowError('workflow journal must be lossless JSON data', 'JOURNAL_DIVERGENCE', { cause: error })
  }
  if (snapshot === undefined || !Array.isArray(snapshot)) {
    throw new WorkflowError('workflow journal must be lossless JSON data', 'JOURNAL_DIVERGENCE')
  }
  const entries = snapshot as readonly unknown[]
  const callIds = new Set<string>()
  const agentSeqs = new Set<number>()
  let priorOrdinal = 0
  for (const candidate of entries) {
    if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
      throw new WorkflowError('workflow journal entries must be objects', 'JOURNAL_DIVERGENCE')
    }
    const entry = candidate as Record<string, unknown>
    const ordinal = entry.ordinal
    if (typeof ordinal !== 'number' || !Number.isSafeInteger(ordinal) || ordinal !== priorOrdinal + 1) {
      throw new WorkflowError('workflow journal entry ordinal must be the next positive safe integer', 'JOURNAL_DIVERGENCE')
    }
    priorOrdinal = ordinal
    const callId = entry.callId
    const callKey = Array.isArray(callId) ? callId.join('.') : ''
    if (!Array.isArray(callId) || callId.length === 0
      || callId.some(part => !Number.isSafeInteger(part) || part <= 0)
      || callIds.has(callKey)) {
      throw new WorkflowError('workflow journal call identities must be non-empty and unique', 'JOURNAL_DIVERGENCE')
    }
    callIds.add(callKey)
    const fingerprint = entry.fingerprint
    if (typeof fingerprint !== 'string' || !/^[a-f0-9]{64}$/u.test(fingerprint)) {
      throw new WorkflowError('workflow journal fingerprint must be a lowercase SHA-256 digest', 'JOURNAL_DIVERGENCE')
    }
    switch (entry.kind) {
      case 'agent':
        if (Object.keys(entry).some(key => !['kind', 'ordinal', 'callId', 'fingerprint', 'seq', 'result'].includes(key))
          || !Object.hasOwn(entry, 'result')) {
          throw new WorkflowError('workflow agent journal fields are not recognized', 'JOURNAL_DIVERGENCE')
        }
        if (typeof entry.seq !== 'number' || !Number.isSafeInteger(entry.seq) || entry.seq < 1) {
          throw new WorkflowError('workflow journal agent seq must be a positive safe integer', 'JOURNAL_DIVERGENCE')
        }
        if (agentSeqs.has(entry.seq)) {
          throw new WorkflowError(`workflow journal repeats agent sequence ${entry.seq}`, 'JOURNAL_DIVERGENCE')
        }
        agentSeqs.add(entry.seq)
        break
      case 'phase':
        if (Object.keys(entry).some(key => !['kind', 'ordinal', 'callId', 'fingerprint', 'title'].includes(key))) {
          throw new WorkflowError('workflow phase journal fields are not recognized', 'JOURNAL_DIVERGENCE')
        }
        if (typeof entry.title !== 'string' || entry.title.length === 0) {
          throw new WorkflowError('workflow phase journal title must be a non-empty string', 'JOURNAL_DIVERGENCE')
        }
        break
      case 'log':
        if (Object.keys(entry).some(key => !['kind', 'ordinal', 'callId', 'fingerprint', 'message'].includes(key))) {
          throw new WorkflowError('workflow log journal fields are not recognized', 'JOURNAL_DIVERGENCE')
        }
        if (typeof entry.message !== 'string') {
          throw new WorkflowError('workflow log journal message must be a string', 'JOURNAL_DIVERGENCE')
        }
        break
      case 'scratch-read':
        if (Object.keys(entry).some(key => !['kind', 'ordinal', 'callId', 'fingerprint', 'content'].includes(key))) {
          throw new WorkflowError('workflow scratch-read journal fields are not recognized', 'JOURNAL_DIVERGENCE')
        }
        if (entry.content !== undefined && typeof entry.content !== 'string') {
          throw new WorkflowError('workflow scratch-read journal content must be a string', 'JOURNAL_DIVERGENCE')
        }
        break
      case 'scratch-write':
      case 'await-user':
        if (Object.keys(entry).some(key => !['kind', 'ordinal', 'callId', 'fingerprint'].includes(key))) {
          throw new WorkflowError(`workflow ${entry.kind} journal fields are not recognized`, 'JOURNAL_DIVERGENCE')
        }
        break
      default:
        throw new WorkflowError('workflow journal entry kind is not recognized', 'JOURNAL_DIVERGENCE')
    }
  }
  return entries as unknown as readonly WorkflowJournalEntry[]
}

/**
 * The worker-thread engine service. `start()` validates the script up front
 * (meta + a host-side body parse) and returns a {@link WorkflowRun} whose
 * `result` never rejects; the `workflow/*` events fire around the run per
 * the seam contract.
 */
class WorkerThreadWorkflowEngine {
  /** Signals the package supervisor not to inject stock evaluator preludes. */
  readonly dshWorkflowsNative = true
  static inject = ['subagents']

  static Config: z<Config> = z.object({
    provider: z.string().default('spawn'),
    maxConcurrentAgents: z.natural().default(0),
    maxTotalAgents: z.natural().min(1).default(1024),
    maxItemsPerCall: z.natural().min(1).default(4096),
    syncTimeoutMs: z.natural().min(1).default(5000),
    disposeGraceMs: z.natural().default(5000),
    maxProtocolMessageBytes: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(8 * 1024 * 1024),
    maxJournalBytes: z.number().step(1).min(2).max(Number.MAX_SAFE_INTEGER).default(64 * 1024 * 1024),
    maxChildPromptBytes: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(1024 * 1024),
    maxEventTextBytes: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(64 * 1024),
    scratchMaxOperations: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(4096),
    scratchMaxPendingOperations: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(64),
    scratchMaxFiles: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(64),
    scratchMaxFileBytes: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(1024 * 1024),
    scratchMaxTotalBytes: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(8 * 1024 * 1024),
  })

  private readonly config: ResolvedConfig

  constructor(private readonly ctx: Context, config: Config = {}) {
    this.config = {
      provider: config.provider ?? 'spawn',
      maxConcurrentAgents: config.maxConcurrentAgents ?? 0,
      maxTotalAgents: config.maxTotalAgents ?? 1024,
      maxItemsPerCall: config.maxItemsPerCall ?? 4096,
      syncTimeoutMs: config.syncTimeoutMs ?? 5000,
      disposeGraceMs: config.disposeGraceMs ?? 5000,
      maxProtocolMessageBytes: config.maxProtocolMessageBytes ?? 8 * 1024 * 1024,
      maxJournalBytes: config.maxJournalBytes ?? 64 * 1024 * 1024,
      maxChildPromptBytes: config.maxChildPromptBytes ?? 1024 * 1024,
      maxEventTextBytes: config.maxEventTextBytes ?? 64 * 1024,
      scratchMaxOperations: config.scratchMaxOperations ?? 4096,
      scratchMaxPendingOperations: config.scratchMaxPendingOperations ?? 64,
      scratchMaxFiles: config.scratchMaxFiles ?? 64,
      scratchMaxFileBytes: config.scratchMaxFileBytes ?? 1024 * 1024,
      scratchMaxTotalBytes: config.scratchMaxTotalBytes ?? 8 * 1024 * 1024,
      validationTimeoutMs: config.validationTimeoutMs ?? 10_000,
    }
    if (this.config.scratchMaxFileBytes > this.config.scratchMaxTotalBytes) {
      throw new WorkflowError('workflow scratchMaxFileBytes cannot exceed scratchMaxTotalBytes', 'INVALID_ARGUMENT')
    }
    if (this.config.scratchMaxPendingOperations > this.config.scratchMaxOperations) {
      throw new WorkflowError(
        'workflow scratchMaxPendingOperations cannot exceed scratchMaxOperations',
        'INVALID_ARGUMENT',
      )
    }
  }

  /** Dispatch through the host event registry without registering a global service. */
  private emitWorkflowEvent(name: string, ...args: unknown[]): void {
    const dispatch = (this.ctx as any)?.events?.dispatch
    if (typeof dispatch !== 'function') return
    for (const callback of dispatch.call((this.ctx as any).events, 'emit', [name, ...args]) ?? []) {
      try { void Promise.resolve(callback(...args)).catch(error => (this.ctx as any)?.logger?.warn?.(`workflow: ${name} listener rejected`, error)) }
      catch (error) { (this.ctx as any)?.logger?.warn?.(`workflow: ${name} listener threw`, error) }
    }
  }

  /** Side-effect-free smoke validation through the same worker runtime. */
  async validate(request: WorkflowStartRequest): Promise<Record<string, unknown>> {
    const timeout = new AbortController()
    const timer = setTimeout(() => timeout.abort(new Error('workflow validation timed out')), this.config.validationTimeoutMs)
    timer.unref()
    const callerSignal = (request as any).signal as AbortSignal | undefined
    const signal = callerSignal === undefined ? timeout.signal : AbortSignal.any([callerSignal, timeout.signal])
    const files = new Map<string, string>()
    let operations = 0
    let pending = 0
    const bytes = (value: string) => Buffer.byteLength(value, 'utf8')
    const begin = () => {
      operations += 1; pending += 1
      if (operations > this.config.scratchMaxOperations) throw new RangeError('workflow scratch operation limit exceeded')
      if (pending > this.config.scratchMaxPendingOperations) throw new RangeError('workflow scratch pending-operation limit exceeded')
    }
    const scratch = {
      read: async (name: string) => { begin(); try { return files.get(name) } finally { pending -= 1 } },
      write: async (name: string, content: string) => {
        begin()
        try {
          const size = bytes(content)
          if (size > this.config.scratchMaxFileBytes) throw new RangeError('workflow scratch file limit exceeded')
          if (!files.has(name) && files.size >= this.config.scratchMaxFiles) throw new RangeError('workflow scratch file-count limit exceeded')
          let total = size
          for (const [other, value] of files) if (other !== name) total += bytes(value)
          if (total > this.config.scratchMaxTotalBytes) throw new RangeError('workflow scratch total-byte limit exceeded')
          files.set(name, content)
        } finally { pending -= 1 }
      },
    }
    const run = this.start({ ...(request as any), signal, scratch, validateOnly: true, deferStart: true }) as any
    let result: any
    try {
      run.release()
      result = await run.result
      if (callerSignal?.aborted) {
        throw callerSignal.reason ?? new DOMException('This operation was aborted', 'AbortError')
      }
    } finally {
      clearTimeout(timer)
      run.cancel('workflow validation finished')
      await run.dispose()
    }
    if (result.stopReason !== 'completed') {
      return { ok: false, status: 'error', error: result.error ?? 'workflow validation failed', errorCode: result.errorCode }
    }
    if (typeof result.value === 'string' && /^would (?:pause|await_user)\b/u.test(result.value)) {
      return { ok: true, status: 'would-pause', value: result.value }
    }
    return { ok: true, status: 'completed', value: result.value }
  }

  /**
   * Validate and execute a workflow script in a fresh worker thread. Throws
   * {@link WorkflowError} synchronously (`META_INVALID` for a malformed meta
   * block, `SCRIPT_PARSE` for a body that does not compile) for a request
   * that cannot begin; once a run is returned, every failure resolves through
   * `result.stopReason` instead.
   * @param request - the script body, its meta data and `args`, the parent
   *   agent, and an optional cancel signal.
   * @returns the live run (its `result` resolves when the script settles).
   */
  start(request: WorkflowStartRequest): WorkflowRun {
    const meta = validateMeta(request.meta)
    assertBodyParses(request.script, meta.name)
    const args = request.args === undefined ? undefined : snapshotJsonValue(request.args)
    if (request.args !== undefined && args === undefined) {
      throw new WorkflowError('workflow args must be losslessly JSON-serializable data', 'INVALID_ARGUMENT')
    }
    const checkpoint = (request as any).replay?.checkpoint
    const journal = resolveJournal((request as any).journal ?? checkpoint?.journal)
    const subagentProvider = resolveSubagentProvider(this.ctx, this.config.provider, request.subagentProvider)
    const maxTotalAgents = resolveMaxTotalAgents(request.maxTotalAgents, this.config.maxTotalAgents)
    const initialAgentSpend = resolveInitialAgentSpend(
      (request as any).initialAgentSpend ?? checkpoint?.agentSpend,
      maxTotalAgents,
      journal,
    )
    const initialAgentSeq = resolveInitialAgentSeq(
      (request as any).initialAgentSeq ?? checkpoint?.agentSeq,
      initialAgentSpend,
      maxTotalAgents,
      journal,
    )
    const id = WorkflowRunId(typeof (request as any).runId === 'string' ? (request as any).runId : randomUUID())
    const info: WorkflowRunInfo = { id, meta }
    const limits: WorkerLimits = {
      maxConcurrentAgents: this.config.maxConcurrentAgents === 0
        ? Math.min(16, Math.max(1, availableParallelism() - 2))
        : this.config.maxConcurrentAgents,
      maxTotalAgents,
      maxItemsPerCall: this.config.maxItemsPerCall,
      syncTimeoutMs: this.config.syncTimeoutMs,
    }
    const init: WorkerInit = {
      meta,
      body: request.script,
      ...args !== undefined ? { args } : {},
      ...journal !== undefined ? { journal } : {},
      initialAgentSpend,
      initialAgentSeq,
      ...request.validateOnly !== undefined ? { validateOnly: request.validateOnly } : {},
      limits,
    }
    // Capture the dependency while this service call is still traced through
    // the start() holder. Cordis strips the engine-provider shadow when it
    // returns the SubagentRuntime handle, so an already-returned run can keep
    // starting children after an engine HMR unload removes ctx.workflowEngine.
    // Re-resolving `this.ctx.subagents` later from WorkerRun would instead walk
    // the now-inactive engine fiber and break the seam's holder-owned lifetime.
    const runCtx = this.ctx
    const subagents = runCtx.subagents
    const workerRun = new WorkerRun(
      runCtx,
      subagents,
      id,
      meta,
      request.parent,
      init,
      subagentProvider,
      this.config.disposeGraceMs,
      {
        phase: (title) => { this.emitWorkflowEvent('workflow/phase', info, title) },
        log: (message) => { this.emitWorkflowEvent('workflow/log', info, message) },
        agentStart: (agent) => { this.emitWorkflowEvent('workflow/agent-start', info, agent) },
        agentEnd: (agent) => { this.emitWorkflowEvent('workflow/agent-end', info, agent) },
        gate: (gate) => { this.emitWorkflowEvent('workflow/gate', info, gate) },
        journalCommit: (entry) => { this.emitWorkflowEvent('workflow/journal-commit', info, entry) },
      },
      request.signal,
      request.scratchDir,
      {
        maxProtocolMessageBytes: this.config.maxProtocolMessageBytes,
        maxJournalBytes: this.config.maxJournalBytes,
        maxChildPromptBytes: this.config.maxChildPromptBytes,
        maxEventTextBytes: this.config.maxEventTextBytes,
        scratch: {
          maxOperations: this.config.scratchMaxOperations,
          maxPendingOperations: this.config.scratchMaxPendingOperations,
          maxFiles: this.config.scratchMaxFiles,
          maxFileBytes: this.config.scratchMaxFileBytes,
          maxTotalBytes: this.config.scratchMaxTotalBytes,
        },
      } satisfies WorkerHostLimits,
      (request as any).deferStart === true,
      (request as any).scratch,
    )

    this.emitWorkflowEvent('workflow/start', info)
    // `workflow/end` fires as the (never-rejecting) result settles, with the
    // outcome DATA only — the value stays with the run's holder.
    void workerRun.result.then((settled) => {
      this.emitWorkflowEvent('workflow/end', info, {
        stopReason: settled.stopReason,
        ...settled.error !== undefined ? { error: settled.error } : {},
        ...settled.errorCode !== undefined ? { errorCode: settled.errorCode } : {},
        agentsStarted: settled.agentsStarted,
      })
    })

    return workerRun
  }
}

export default WorkerThreadWorkflowEngine
