import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { WorkflowSupervisor } from '../src/supervisor/index.js'
import type {
  DetailReadRequest,
  DetailReadResult,
  WorkflowCompletionNoticeFinalization,
  WorkflowRunCommitRequest,
  WorkflowRunDetailPayloadV2,
  WorkflowRunHeadRecord,
  WorkflowRunInsertRequest,
  WorkflowRunStore,
  WorkflowTerminalCommitRequest,
} from '../src/supervisor/storage/manifest-types.js'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

class EventBus {
  private readonly listeners = new Map<string, Set<(...args: any[]) => void>>()
  on(name: string, listener: (...args: any[]) => void) {
    const bucket = this.listeners.get(name) ?? new Set()
    bucket.add(listener)
    this.listeners.set(name, bucket)
    return () => bucket.delete(listener)
  }
  emit(name: string, ...args: unknown[]) {
    for (const listener of this.listeners.get(name) ?? []) listener(...args)
  }
}

class MemoryStore implements WorkflowRunStore {
  readonly entries = new Map<string, { sessionId: string; head: WorkflowRunHeadRecord; detail: WorkflowRunDetailPayloadV2 }>()
  recovered: any[] = []
  private sequence = 0
  constructor(readonly root: string) {}
  async initialize(): Promise<readonly any[]> { return this.recovered }
  async insertWithNextDisplayName(request: WorkflowRunInsertRequest, create: (identity: any) => { head: any; detail: WorkflowRunDetailPayloadV2 }, signal?: AbortSignal) {
    signal?.throwIfAborted()
    const displayName = request.name
    const runDirectory = (this.sequence += 1).toString(16).padStart(32, '0')
    await mkdir(join(this.root, runDirectory, 'scratch'), { recursive: true, mode: 0o700 })
    await writeFile(join(this.root, runDirectory, 'script.js'), request.script, { mode: 0o600 })
    const draft = create({ displayName, numberedHandle: false, runDirectory })
    const head: WorkflowRunHeadRecord = {
      ...draft.head, runId: request.runId, name: request.name, displayName, numberedHandle: false, runDirectory, revision: 1,
      detail: { id: 'a'.repeat(32), bytes: 1, sha256: 'b'.repeat(64), snapshotRevision: 1 },
      detailRevision: 1, completionNotice: { state: 'none' }, scriptPath: join(this.root, runDirectory, 'script.js'),
    }
    this.entries.set(request.runId, { sessionId: request.sessionId, head, detail: draft.detail })
    request.onDurable?.(head)
    return { ...head }
  }
  async commitRun(request: WorkflowRunCommitRequest) {
    const entry = this.entries.get(request.runId)!
    entry.detail = request.detail ?? entry.detail
    entry.head = { ...entry.head, ...request.head, revision: entry.head.revision + 1, detail: entry.head.detail, completionNotice: entry.head.completionNotice, scriptPath: entry.head.scriptPath }
    return { ...entry.head }
  }
  async commitTerminalAndClaimNotice(request: WorkflowTerminalCommitRequest) {
    const entry = this.entries.get(request.runId)!
    entry.detail = request.detail ?? entry.detail
    entry.head = { ...entry.head, ...request.head, revision: entry.head.revision + 1, completionNotice: { state: 'claimed', claimId: 'c'.repeat(32), processEpoch: 'd'.repeat(32), claimedAt: 10 }, scriptPath: entry.head.scriptPath }
    return { ...entry.head }
  }
  async finalizeCompletionNotice(_sessionId: string, runId: string, expectedRevision: number, finalization: WorkflowCompletionNoticeFinalization) {
    const entry = this.entries.get(runId)!
    entry.head = { ...entry.head, revision: expectedRevision + 1, completionNotice: finalization }
    return { ...entry.head }
  }
  async readSession(sessionId: string) {
    return [...this.entries.values()].filter(entry => entry.sessionId === sessionId).map(entry => ({ ...entry.head }))
  }
  async readDetails(runId: string, request: DetailReadRequest): Promise<DetailReadResult> {
    const entry = this.entries.get(runId)!
    const value = request.kind === 'members' ? entry.detail.members ?? [] : entry.detail.result ?? { state: 'not-produced' }
    return { value: value as any, revision: entry.head.detailRevision, total: Array.isArray(value) ? value.length : 1 }
  }
  async dispose() { /* test store */ }
}

function scratchLayout() {
  const directory = (path: string): any => ({
    path,
    openDirectory: async (name: string) => directory(join(path, name)),
    listEntries: async () => [],
    readBytes: async () => new Uint8Array(),
    writeText: async () => ({ operation: 'createIfAbsent' }),
    assertIdentity: async () => undefined,
    close: async () => undefined,
  })
  return { lease: { assertCurrent: async () => undefined }, runs: { openDirectory: async (name: string) => directory(join('/fake-runs', name)) } }
}

function engine() {
  const handles: Array<{ released: number; resumeCalls: number; request: any }> = []
  return {
    handles,
    start(request: any) {
      expect(request.deferStart).toBe(true)
      let settle!: (value: any) => void
      let settled = false
      let disposed = false
      const result = new Promise(resolve => { settle = resolve })
      const record = { released: 0, resumeCalls: 0, request }
      handles.push(record)
      return {
        id: `execution-${handles.length}`,
        result,
        release: () => { record.released += 1 },
        resume: () => { record.resumeCalls += 1 },
        cancel: (reason: string) => {
          if (!settled) {
            settled = true
            settle({ value: null, stopReason: 'cancelled', error: reason, agentsStarted: 0 })
          }
        },
        dispose: async () => { disposed = true },
        checkpoint: () => {
          if (!settled || !disposed) throw Object.assign(new Error('CHECKPOINT_NOT_READY'), { code: 'CHECKPOINT_NOT_READY' })
          return { journal: [], agentSpend: 0, agentSeq: 0 }
        },
      }
    },
  }
}

describe('workflow supervisor resume', () => {
  it('replays a paused run from the post-dispose checkpoint and rejects Interrupted rows', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-supervisor-resume-'))
    roots.push(root)
    const store = new MemoryStore(root)
    const bus = new EventBus()
    const workflowEngine = engine()
    const supervisor = new WorkflowSupervisor({
      workflowEngine,
      on: bus.on.bind(bus),
      emit: bus.emit.bind(bus),
      logger: { warn: () => undefined },
      workflows: { save: async () => ({ path: '/tmp/unused' }) },
      workflowStorage: { layout: scratchLayout() },
    }, { defaultAgentBudget: 8, maxAgentBudget: 16, maxMembersPerRun: 16 }, store)
    await supervisor.initialize()
    const agent = { session: { id: 'session-resume', header: { cwd: '/tmp' } }, followup: async () => undefined }
    try {
      await supervisor.start({
        script: 'await pause("again")',
        meta: { name: 'resume-check', description: 'resume' },
        parent: agent,
        agentBudget: 4,
      })
      await supervisor.pause('resume-check', agent)
      const resumed = await supervisor.resume('resume-check', agent)
      expect(resumed.status).toBe('running')
      expect(workflowEngine.handles[1]?.released).toBe(1)
      expect(workflowEngine.handles[1]?.request.replay).toEqual({ checkpoint: { journal: [], agentSpend: 0, agentSeq: 0 } })

      await expect(supervisor.resume('missing', agent)).rejects.toMatchObject({ code: 'WORKFLOW_RUN_NOT_FOUND' })
    } finally {
      await supervisor.dispose()
    }
  })

  it('hydrates recovered Interrupted maps from the first store.initialize() result', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-supervisor-interrupted-'))
    roots.push(root)
    const store = new MemoryStore(root)
    store.recovered = [{
      runId: 'run-dead',
      name: 'dead-run',
      displayName: 'dead-run',
      numberedHandle: false,
      status: 'interrupted',
      stopReason: 'interrupted',
      error: 'Process exited before workflow settlement.',
      budget: { total: 4, spent: 0, remaining: 4 },
      memberCounts: { total: 0, running: 0, completed: 0, failed: 0, cancelled: 0 },
      startedAt: 1,
      settledAt: 2,
      runDirectory: 'a'.repeat(32),
      revision: 2,
      detail: { id: 'b'.repeat(32), bytes: 1, sha256: 'c'.repeat(64), snapshotRevision: 1 },
      detailRevision: 1,
      membersRevision: 1,
      logsRevision: 1,
      resultRevision: 1,
      artifactsRevision: 0,
      completionNotice: { state: 'abandoned', finalizedAt: 2, reason: 'process-lost' },
      executionAvailable: false,
      sessionId: 'session-resume',
    }]
    const bus = new EventBus()
    const supervisor = new WorkflowSupervisor({
      workflowEngine: { start() { throw new Error('no live engine') } },
      on: bus.on.bind(bus),
      emit: bus.emit.bind(bus),
      logger: { warn: () => undefined },
      workflows: { save: async () => ({ path: '/tmp/unused' }) },
      workflowStorage: { layout: scratchLayout() },
    }, { defaultAgentBudget: 8, maxAgentBudget: 8, maxMembersPerRun: 8 }, store)
    await supervisor.initialize()
    const agent = { session: { id: 'session-resume', header: { cwd: '/tmp' } } }
    try {
      await expect(supervisor.resume('dead-run', agent)).rejects.toMatchObject({
        code: 'WORKFLOW_INVALID_STATE',
        message: 'workflow "dead-run" was interrupted by process exit and cannot resume',
      })
    } finally {
      await supervisor.dispose()
    }
  })

  it('requires a higher agent_budget to resume a budget-limited run', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-supervisor-budget-'))
    roots.push(root)
    let settle!: (value: any) => void
    const result = new Promise(resolve => { settle = resolve })
    const handle = {
      id: 'execution-budget',
      result,
      release: () => undefined,
      resume: () => undefined,
      cancel: () => undefined,
      dispose: async () => undefined,
      checkpoint: () => ({ journal: [], agentSpend: 2, agentSeq: 0 }),
    }
    const store = new MemoryStore(root)
    const bus = new EventBus()
    const supervisor = new WorkflowSupervisor({
      workflowEngine: { start: () => handle },
      on: bus.on.bind(bus),
      emit: bus.emit.bind(bus),
      logger: { warn: () => undefined },
      workflows: { save: async () => ({ path: '/tmp/unused' }) },
      workflowStorage: { layout: scratchLayout() },
    }, { defaultAgentBudget: 8, maxAgentBudget: 16, maxMembersPerRun: 16 }, store)
    await supervisor.initialize()
    const agent = { session: { id: 'session-budget', header: { cwd: '/tmp' } }, followup: async () => undefined }
    try {
      const launched = await supervisor.start({
        script: 'return 1', meta: { name: 'budget-run', description: 'cap' }, parent: agent, agentBudget: 2,
      })
      settle({ value: null, stopReason: 'error', error: 'cap', errorCode: 'AGENT_CAP', agentsStarted: 2 })
      await supervisor.whenOwnerQuiescent(agent)
      await expect(supervisor.resume('budget-run', agent)).rejects.toMatchObject({
        message: 'workflow "budget-run" requires a higher agent_budget to resume',
      })
      await expect(supervisor.resumeById(launched.runId, agent, 2)).rejects.toMatchObject({
        message: 'workflow "budget-run" requires a higher agent_budget to resume',
      })
    } finally {
      await supervisor.dispose()
    }
  })

  it('resumes a live await_user gate on the parked attempt and ignores a stale fence', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-supervisor-gate-'))
    roots.push(root)
    const store = new MemoryStore(root)
    const bus = new EventBus()
    const workflowEngine = engine()
    let gate: { executionId: string; gateId: string } | undefined
    const gated = new Promise<void>(resolve => {
      bus.on('workflows/gate-request', (request: any) => {
        gate = { executionId: request.executionId, gateId: request.gateId }
        resolve()
      })
    })
    const supervisor = new WorkflowSupervisor({
      workflowEngine,
      on: bus.on.bind(bus),
      emit: bus.emit.bind(bus),
      logger: { warn: () => undefined },
      workflows: { save: async () => ({ path: '/tmp/unused' }) },
      workflowStorage: { layout: scratchLayout() },
    }, { defaultAgentBudget: 8, maxAgentBudget: 16, maxMembersPerRun: 16 }, store)
    await supervisor.initialize()
    const agent = { session: { id: 'session-resume', header: { cwd: '/tmp' } }, followup: async () => undefined }
    try {
      const launched = await supervisor.start({
        script: 'await await_user("user", "need a decision")',
        meta: { name: 'gate-check', description: 'gate' },
        parent: agent,
        agentBudget: 4,
      })
      bus.emit('workflow/gate', { id: 'execution-1' }, { kind: 'user', message: 'need a decision', resumable: true })
      await gated
      expect(gate).toBeDefined()
      expect((await store.readSession(agent.session.id))[0]?.status).toBe('needs-input')
      await expect(supervisor.resumeGate(launched.runId, gate!.executionId, gate!.gateId as any, agent)).resolves.toBe(true)
      expect(workflowEngine.handles[0]?.resumeCalls).toBe(1)
      expect((await store.readSession(agent.session.id))[0]?.status).toBe('running')
      await expect(supervisor.resumeGate(launched.runId, gate!.executionId, gate!.gateId as any, agent)).resolves.toBe(false)
      expect(workflowEngine.handles[0]?.resumeCalls).toBe(1)
    } finally {
      await supervisor.dispose()
    }
  })
})
