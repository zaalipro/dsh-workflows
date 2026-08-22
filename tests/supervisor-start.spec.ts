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

type Listener = (...args: any[]) => void

class EventBus {
  readonly events: Array<{ readonly name: string; readonly args: readonly unknown[] }> = []
  private readonly listeners = new Map<string, Set<Listener>>()
  on(name: string, listener: Listener): () => void {
    const bucket = this.listeners.get(name) ?? new Set<Listener>()
    bucket.add(listener)
    this.listeners.set(name, bucket)
    return () => bucket.delete(listener)
  }
  emit(name: string, ...args: unknown[]): void {
    this.events.push({ name, args })
    for (const listener of this.listeners.get(name) ?? []) listener(...args)
  }
}

interface MemoryEntry { sessionId: string; head: WorkflowRunHeadRecord; detail: WorkflowRunDetailPayloadV2 }

class MemoryStore implements WorkflowRunStore {
  readonly entries = new Map<string, MemoryEntry>()
  readonly inserted: string[] = []
  private sequence = 0
  private insertTail = Promise.resolve()
  constructor(readonly root: string) {}
  async initialize(): Promise<readonly any[]> { return [] }
  async insertWithNextDisplayName(
    request: WorkflowRunInsertRequest,
    create: (identity: { displayName: string; numberedHandle: boolean; runDirectory: string }) => { head: any; detail: WorkflowRunDetailPayloadV2 },
    signal?: AbortSignal,
  ): Promise<WorkflowRunHeadRecord> {
    const previousInsert = this.insertTail
    let releaseInsert!: () => void
    this.insertTail = new Promise<void>(resolve => { releaseInsert = resolve })
    await previousInsert
    try {
    signal?.throwIfAborted()
    const previous = [...this.entries.values()].filter(entry => entry.sessionId === request.sessionId && entry.head.name === request.name).length
    const numberedHandle = previous > 0
    const displayName = numberedHandle ? `${request.name}-${previous + 1}` : request.name
    const runDirectory = (this.sequence += 1).toString(16).padStart(32, '0')
    const path = join(this.root, runDirectory)
    await mkdir(join(path, 'scratch'), { recursive: true, mode: 0o700 })
    await writeFile(join(path, 'script.js'), request.script, { mode: 0o600 })
    const draft = create({ displayName, numberedHandle, runDirectory })
    const head: WorkflowRunHeadRecord = {
      ...draft.head,
      runId: request.runId, name: request.name, displayName, numberedHandle, runDirectory, revision: 1,
      detail: { id: 'a'.repeat(32), bytes: 1, sha256: 'b'.repeat(64), snapshotRevision: 1 },
      detailRevision: 1, completionNotice: { state: 'none' }, scriptPath: join(path, 'script.js'),
    }
    this.entries.set(request.runId, { sessionId: request.sessionId, head, detail: draft.detail })
    this.inserted.push(request.runId)
    request.onDurable?.(head)
    return { ...head }
    } finally { releaseInsert() }
  }
  async commitRun(request: WorkflowRunCommitRequest): Promise<WorkflowRunHeadRecord> {
    const entry = this.require(request.runId)
    entry.detail = request.detail ?? entry.detail
    entry.head = { ...entry.head, ...request.head, revision: entry.head.revision + 1, detail: entry.head.detail, completionNotice: entry.head.completionNotice, scriptPath: entry.head.scriptPath }
    return { ...entry.head }
  }
  async commitTerminalAndClaimNotice(request: WorkflowTerminalCommitRequest): Promise<WorkflowRunHeadRecord> {
    const entry = this.require(request.runId)
    entry.detail = request.detail ?? entry.detail
    entry.head = {
      ...entry.head, ...request.head, revision: entry.head.revision + 1,
      completionNotice: { state: 'claimed', claimId: 'c'.repeat(32), processEpoch: 'd'.repeat(32), claimedAt: 10 },
      scriptPath: entry.head.scriptPath,
    }
    return { ...entry.head }
  }
  async finalizeCompletionNotice(sessionId: string, runId: string, expectedRevision: number, finalization: WorkflowCompletionNoticeFinalization): Promise<WorkflowRunHeadRecord> {
    const entry = this.require(runId)
    entry.head = { ...entry.head, revision: expectedRevision + 1, completionNotice: finalization }
    return { ...entry.head }
  }
  async readSession(sessionId: string): Promise<readonly WorkflowRunHeadRecord[]> {
    return [...this.entries.values()].filter(entry => entry.sessionId === sessionId).map(entry => ({ ...entry.head }))
  }
  async readDetails(runId: string, request: DetailReadRequest): Promise<DetailReadResult> {
    const entry = this.require(runId)
    const value = request.kind === 'members' ? entry.detail.members ?? [] : request.kind === 'result' ? entry.detail.result ?? { state: 'not-produced' } : []
    return { value: value as any, revision: entry.head.detailRevision, total: Array.isArray(value) ? value.length : 1 }
  }
  async dispose(): Promise<void> { /* test store */ }
  private require(runId: string): MemoryEntry {
    const entry = this.entries.get(runId)
    if (entry === undefined) throw new Error(`missing run ${runId}`)
    return entry
  }
}

interface FakeHandle {
  readonly request: any
  readonly released: () => boolean
  readonly releaseCalls: () => number
  readonly disposed: () => boolean
  resolve(result?: { value: unknown; stopReason: 'completed' | 'cancelled' | 'error'; error?: string; errorCode?: string; agentsStarted: number }): void
}

function fakeEngine(handles: FakeHandle[]) {
  let next = 0
  return {
    start(request: any) {
      expect(request.deferStart).toBe(true)
      expect(request.journal).toBeUndefined()
      expect(request.scratchDir).toBeUndefined()
      expect(request.validateOnly).toBeUndefined()
      let released = 0
      let cancelled = false
      let disposed = false
      let settled = false
      let settle!: (value: any) => void
      const result = new Promise(resolve => { settle = resolve })
      const handle: any = {
        id: `execution-${++next}`,
        result,
        release: () => { released += 1 },
        resume: () => undefined,
        cancel: (reason: string) => {
          cancelled = true
          if (!settled) {
            settled = true
            settle({ value: null, stopReason: 'cancelled', error: reason, agentsStarted: 0 })
          }
        },
        dispose: async () => { disposed = true },
        checkpoint: () => {
          if (!settled || !disposed) {
            throw Object.assign(new Error('CHECKPOINT_NOT_READY'), { code: 'CHECKPOINT_NOT_READY' })
          }
          return { journal: [], agentSpend: 0, agentSeq: 0 }
        },
      }
      handles.push({
        request,
        released: () => released > 0,
        releaseCalls: () => released,
        disposed: () => disposed,
        resolve: value => {
          settled = true
          settle(value ?? { value: { ok: true }, stopReason: 'completed', agentsStarted: 0 })
        },
      })
      void cancelled
      return handle
    },
  }
}

function scratchLayout() {
  const files = new Map<string, Map<string, string>>()
  const directory = (path: string): any => ({
    path,
    openDirectory: async (name: string) => directory(join(path, name)),
    listEntries: async () => [...(files.get(path) ?? new Map()).entries()].map(([name, content]) => ({
      name, type: 'file', identity: { dev: 1, ino: 1, size: Buffer.byteLength(content), nlink: 1 },
    })),
    readBytes: async (name: string) => new TextEncoder().encode(files.get(path)?.get(name) ?? ''),
    writeText: async (name: string, content: string) => {
      const bucket = files.get(path) ?? new Map<string, string>()
      files.set(path, bucket)
      bucket.set(name, content)
      return { operation: 'createIfAbsent', version: {}, after: content }
    },
    assertIdentity: async () => undefined,
    close: async () => undefined,
  })
  return { lease: { assertCurrent: async () => undefined }, runs: { openDirectory: async (name: string) => directory(join('/fake-runs', name)) } }
}

function parent(id = 'session-start') {
  return { session: { id, header: { cwd: '/tmp' } }, followup: async () => undefined }
}

async function fixture(handles: FakeHandle[] = []) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-supervisor-start-'))
  roots.push(root)
  const store = new MemoryStore(root)
  const bus = new EventBus()
  const supervisor = new WorkflowSupervisor({
    workflowEngine: fakeEngine(handles),
    on: bus.on.bind(bus),
    emit: bus.emit.bind(bus),
    logger: { warn: () => undefined },
    workflows: { save: async () => ({ path: '/tmp/unused' }) },
    workflowStorage: { layout: scratchLayout() },
  }, { defaultAgentBudget: 4, maxAgentBudget: 8, maxMembersPerRun: 8, maxActiveRunsPerSession: 2, maxActiveRunsGlobal: 4 }, store)
  await supervisor.initialize()
  return { supervisor, store, bus, handles }
}

describe('workflow supervisor start', () => {
  it('admits durably, attaches a deferred attempt, then releases after public maps', async () => {
    const handles: FakeHandle[] = []
    const { supervisor, store, bus } = await fixture(handles)
    try {
      const agent = parent()
      const launched = await supervisor.start({
        script: 'return { ok: true }',
        meta: { name: 'review-changes', description: 'start fixture' },
        parent: agent,
        agentBudget: 4,
      })
      expect(launched.status).toBe('started')
      expect(launched.displayName).toBe('review-changes')
      expect(launched.runId).toBeTruthy()
      expect(store.entries.has(launched.runId)).toBe(true)
      expect(handles[0]?.released()).toBe(true)
      expect(handles[0]?.request.deferStart).toBe(true)
      expect(handles[0]?.request.replay).toEqual({})
      expect(handles[0]?.request.scratch).toBeDefined()
      expect(bus.events.some(event => event.name === 'workflows/run-start')).toBe(true)
      expect(handles[0]?.disposed()).toBe(false)
      handles[0]!.resolve({ value: { ok: true }, stopReason: 'completed', agentsStarted: 0 })
      await supervisor.whenOwnerQuiescent(agent)
      expect((await store.readSession(agent.session.id))[0]?.status).toBe('completed')
    } finally {
      await supervisor.dispose()
    }
  })

  it('allocates unique display names and rejects a 65th Session-active run before insert', async () => {
    const handles: FakeHandle[] = []
    const { supervisor, store } = await fixture(handles)
    try {
      const agent = parent()
      const first = await supervisor.start({
        script: 'return 1', meta: { name: 'audit', description: 'one' }, parent: agent, agentBudget: 2,
      })
      const second = await supervisor.start({
        script: 'return 2', meta: { name: 'audit', description: 'two' }, parent: agent, agentBudget: 2,
      })
      expect(first.displayName).toBe('audit')
      expect(second.displayName).toBe('audit-2')
      await expect(supervisor.start({
        script: 'return 3', meta: { name: 'audit', description: 'three' }, parent: agent, agentBudget: 2,
      })).rejects.toMatchObject({ code: 'WORKFLOW_LIMIT' })
      expect(store.inserted).toHaveLength(2)
    } finally {
      await supervisor.dispose()
    }
  })

  it('rejects an engine handle missing cancel/dispose without keeping it live', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-supervisor-invalid-'))
    roots.push(root)
    const store = new MemoryStore(root)
    const bus = new EventBus()
    const supervisor = new WorkflowSupervisor({
      workflowEngine: {
        start: () => ({
          result: Promise.resolve({ value: null, stopReason: 'completed', agentsStarted: 0 }),
        }),
      },
      on: bus.on.bind(bus),
      emit: bus.emit.bind(bus),
      logger: { warn: () => undefined },
      workflows: { save: async () => ({ path: '/tmp/unused' }) },
      workflowStorage: { layout: scratchLayout() },
    }, { defaultAgentBudget: 8, maxAgentBudget: 8, maxMembersPerRun: 8 }, store)
    await supervisor.initialize()
    try {
      await expect(supervisor.start({
        script: 'return 1', meta: { name: 'broken-engine', description: 'invalid' }, parent: parent(), agentBudget: 2,
      })).rejects.toMatchObject({
        code: 'WORKFLOW_INVALID_STATE',
        message: 'workflow engine returned an invalid run handle',
      })
      const rows = await store.readSession('session-start')
      expect(rows[0]?.status).toBe('failed')
    } finally {
      await supervisor.dispose()
    }
  })

  it('admits a stock RC8 handle that only exposes result/cancel/dispose', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-supervisor-stock-handle-'))
    roots.push(root)
    const store = new MemoryStore(root)
    const bus = new EventBus()
    let settle!: (value: any) => void
    const result = new Promise(resolve => { settle = resolve })
    const supervisor = new WorkflowSupervisor({
      workflowEngine: {
        start: () => ({
          id: 'stock-execution',
          result,
          cancel() { /* rc8 */ },
          dispose: async () => undefined,
        }),
      },
      on: bus.on.bind(bus),
      emit: bus.emit.bind(bus),
      logger: { warn: () => undefined },
      workflows: { save: async () => ({ path: '/tmp/unused' }) },
      workflowStorage: { layout: scratchLayout() },
    }, { defaultAgentBudget: 8, maxAgentBudget: 8, maxMembersPerRun: 8 }, store)
    await supervisor.initialize()
    const agent = parent()
    try {
      const launched = await supervisor.start({
        script: 'return 1', meta: { name: 'stock-engine', description: 'rc8' }, parent: agent, agentBudget: 2,
      })
      expect(launched.displayName).toBe('stock-engine')
      expect((await store.readSession('session-start'))[0]?.status).toBe('running')
      settle({ value: { ok: true }, stopReason: 'completed', agentsStarted: 1 })
      await supervisor.whenOwnerQuiescent(agent)
      expect((await store.readSession('session-start'))[0]?.status).toBe('completed')
    } finally {
      await supervisor.dispose()
    }
  })

  it('allocates unique display names for simultaneous same-name starts', async () => {
    const handles: FakeHandle[] = []
    const { supervisor } = await fixture(handles)
    const agent = parent()
    try {
      const [first, second] = await Promise.all([
        supervisor.start({ script: 'return 1', meta: { name: 'audit', description: 'one' }, parent: agent, agentBudget: 2 }),
        supervisor.start({ script: 'return 2', meta: { name: 'audit', description: 'two' }, parent: agent, agentBudget: 2 }),
      ])
      expect([first.displayName, second.displayName].sort()).toEqual(['audit', 'audit-2'])
      expect(handles.every(handle => handle.released())).toBe(true)
    } finally {
      await supervisor.dispose()
    }
  })

  it('ignores caller abort after durable admission', async () => {
    const handles: FakeHandle[] = []
    const { supervisor, store } = await fixture(handles)
    const agent = parent()
    const controller = new AbortController()
    const originalInsert = store.insertWithNextDisplayName.bind(store)
    store.insertWithNextDisplayName = async (request, create, signal) => {
      const head = await originalInsert(request, create, signal)
      controller.abort()
      return head
    }
    try {
      const launched = await supervisor.start({
        script: 'return 1',
        meta: { name: 'survive-abort', description: 'durable' },
        parent: agent,
        agentBudget: 2,
        signal: controller.signal,
      })
      expect(launched.status).toBe('started')
      expect(handles[0]?.released()).toBe(true)
      handles[0]!.resolve({ value: { ok: true }, stopReason: 'completed', agentsStarted: 0 })
      await supervisor.whenOwnerQuiescent(agent)
      expect((await store.readSession(agent.session.id))[0]?.status).toBe('completed')
    } finally {
      await supervisor.dispose()
    }
  })
})
