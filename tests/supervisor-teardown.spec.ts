import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

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
  readonly events: Array<{ readonly name: string; readonly args: readonly unknown[] }> = []
  private readonly listeners = new Map<string, Set<(...args: any[]) => void>>()
  on(name: string, listener: (...args: any[]) => void) {
    const bucket = this.listeners.get(name) ?? new Set()
    bucket.add(listener)
    this.listeners.set(name, bucket)
    return () => bucket.delete(listener)
  }
  emit(name: string, ...args: unknown[]) {
    this.events.push({ name, args })
    for (const listener of this.listeners.get(name) ?? []) listener(...args)
  }
}

class MemoryStore implements WorkflowRunStore {
  readonly entries = new Map<string, { sessionId: string; head: WorkflowRunHeadRecord; detail: WorkflowRunDetailPayloadV2 }>()
  insertionGate?: Promise<void>
  insertionStarted?: () => void
  terminalFailure?: Error
  terminalCommits = 0
  private sequence = 0
  constructor(readonly root: string) {}
  async initialize(): Promise<readonly any[]> { return [] }
  async insertWithNextDisplayName(request: WorkflowRunInsertRequest, create: (identity: any) => { head: any; detail: WorkflowRunDetailPayloadV2 }, signal?: AbortSignal) {
    this.insertionStarted?.()
    if (this.insertionGate !== undefined) await this.insertionGate
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
    this.terminalCommits += 1
    if (this.terminalFailure !== undefined) throw this.terminalFailure
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

describe('workflow supervisor teardown', () => {
  it('fails forward when terminal persistence is permanently unavailable', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-supervisor-terminal-failure-'))
    roots.push(root)
    const store = new MemoryStore(root)
    const terminalFailure = new Error('terminal manifest commit failed')
    store.terminalFailure = terminalFailure
    const bus = new EventBus()
    let settle!: (value: any) => void
    const result = new Promise(resolve => { settle = resolve })
    const handle = {
      id: 'execution-terminal-failure',
      result,
      release: () => undefined,
      resume: () => undefined,
      cancel: () => undefined,
      dispose: async () => undefined,
      checkpoint: () => ({ journal: [], agentSpend: 0, agentSeq: 0 }),
    }
    const supervisor = new WorkflowSupervisor({
      workflowEngine: { start: () => handle },
      on: bus.on.bind(bus),
      emit: bus.emit.bind(bus),
      logger: { warn: () => undefined },
      workflows: { save: async () => ({ path: '/tmp/unused' }) },
      workflowStorage: { layout: scratchLayout() },
    }, { defaultAgentBudget: 8, maxAgentBudget: 8, maxMembersPerRun: 8 }, store)
    await supervisor.initialize()
    const agent = { session: { id: 'session-terminal-failure', header: { cwd: '/tmp' } }, followup: async () => undefined }
    const launched = await supervisor.start({
      script: 'return 1', meta: { name: 'terminal-failure', description: 'terminal failure' }, parent: agent,
    })
    settle({ value: { ok: true }, stopReason: 'completed', agentsStarted: 0 })

    // Let the attempt observer clear its Attempt before teardown. Its failed
    // terminal commit deliberately leaves the durable row nonterminal.
    await vi.waitFor(() => { expect(store.terminalCommits).toBe(1) })
    expect(store.entries.get(launched.runId)?.head.status).toBe('running')
    expect(bus.events.filter(event => event.name === 'workflows/run-end')).toHaveLength(0)

    const first = supervisor.dispose()
    const second = supervisor.dispose()
    await expect(Promise.race([
      first,
      new Promise((_, reject) => setTimeout(() => reject(new Error('dispose timed out')), 1_000)),
    ])).rejects.toBe(terminalFailure)
    await expect(second).rejects.toBe(terminalFailure)
    await expect(supervisor.dispose()).rejects.toBe(terminalFailure)
    expect(store.terminalCommits).toBe(2)
    expect(store.entries.get(launched.runId)?.head.status).toBe('running')
    expect(store.entries.get(launched.runId)?.detail.result).toEqual({ state: 'pending' })
    expect(bus.events.filter(event => event.name === 'workflows/run-end')).toHaveLength(0)
  })

  it('skips deferred release when admission closes after public maps', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-supervisor-teardown-'))
    roots.push(root)
    const store = new MemoryStore(root)
    const bus = new EventBus()
    let released = 0
    let settle!: (value: any) => void
    const result = new Promise(resolve => { settle = resolve })
    const handle = {
      id: 'execution-teardown',
      result,
      release: () => { released += 1 },
      resume: () => undefined,
      cancel: (reason: string) => {
        settle({ value: null, stopReason: 'cancelled', error: reason, agentsStarted: 0 })
      },
      dispose: async () => undefined,
      checkpoint: () => ({ journal: [], agentSpend: 0, agentSeq: 0 }),
    }
    const supervisor = new WorkflowSupervisor({
      workflowEngine: { start: (request: any) => { expect(request.deferStart).toBe(true); return handle } },
      on: bus.on.bind(bus),
      emit: bus.emit.bind(bus),
      logger: { warn: () => undefined },
      workflows: { save: async () => ({ path: '/tmp/unused' }) },
      workflowStorage: { layout: scratchLayout() },
    }, { defaultAgentBudget: 8, maxAgentBudget: 8, maxMembersPerRun: 8 }, store)
    await supervisor.initialize()
    bus.on('workflows/run-start', () => { supervisor.closeAdmissionSync() })
    const agent = { session: { id: 'session-teardown', header: { cwd: '/tmp' } }, followup: async () => undefined }
    try {
      const launched = await supervisor.start({
        script: 'return 1',
        meta: { name: 'teardown-check', description: 'teardown' },
        parent: agent,
        agentBudget: 2,
      })
      expect(launched.status).toBe('started')
      expect(released).toBe(0)
      await expect(supervisor.start({
        script: 'return 2',
        meta: { name: 'after-close', description: 'closed' },
        parent: agent,
        agentBudget: 2,
      })).rejects.toMatchObject({
        code: 'WORKFLOW_INVALID_STATE',
        message: 'workflow supervisor is shutting down',
      })
      const first = supervisor.dispose()
      const second = supervisor.dispose()
      await Promise.all([first, second])
      expect((await store.readSession(agent.session.id))[0]?.status).toBe('interrupted')
    } finally {
      await supervisor.dispose()
    }
  })

  it('aborts a pending start at the insert gate and never publishes it', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-supervisor-pending-'))
    roots.push(root)
    const store = new MemoryStore(root)
    let releaseInsert!: () => void
    store.insertionGate = new Promise<void>(resolve => { releaseInsert = resolve })
    let started!: () => void
    store.insertionStarted = () => started?.()
    const insertionStarted = new Promise<void>(resolve => { started = resolve })
    const bus = new EventBus()
    const supervisor = new WorkflowSupervisor({
      workflowEngine: { start: () => { throw new Error('must not start') } },
      on: bus.on.bind(bus),
      emit: bus.emit.bind(bus),
      logger: { warn: () => undefined },
      workflows: { save: async () => ({ path: '/tmp/unused' }) },
      workflowStorage: { layout: scratchLayout() },
    }, { defaultAgentBudget: 8, maxAgentBudget: 8, maxMembersPerRun: 8 }, store)
    await supervisor.initialize()
    const agent = { session: { id: 'session-pending', header: { cwd: '/tmp' } } }
    try {
      const pending = supervisor.start({
        script: 'return 1', meta: { name: 'pending-start', description: 'pending' }, parent: agent, agentBudget: 2,
      })
      await insertionStarted
      supervisor.closeAdmissionSync()
      releaseInsert()
      await expect(pending).rejects.toThrow()
      expect(store.entries.size).toBe(0)
      expect(bus.events.filter(event => event.name === 'workflows/run-start')).toHaveLength(0)
    } finally {
      await supervisor.dispose()
    }
  })
})
