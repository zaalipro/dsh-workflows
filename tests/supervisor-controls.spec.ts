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
  readonly events: Array<{ readonly name: string }> = []
  private readonly listeners = new Map<string, Set<(...args: any[]) => void>>()
  on(name: string, listener: (...args: any[]) => void) {
    const bucket = this.listeners.get(name) ?? new Set()
    bucket.add(listener)
    this.listeners.set(name, bucket)
    return () => bucket.delete(listener)
  }
  emit(name: string, ...args: unknown[]) {
    this.events.push({ name })
    for (const listener of this.listeners.get(name) ?? []) listener(...args)
  }
}

class MemoryStore implements WorkflowRunStore {
  readonly entries = new Map<string, { sessionId: string; head: WorkflowRunHeadRecord; detail: WorkflowRunDetailPayloadV2 }>()
  private sequence = 0
  constructor(readonly root: string) {}
  async initialize(): Promise<readonly any[]> { return [] }
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

function controlledEngine() {
  const handles: Array<{
    cancelled: boolean
    released: number
    resumeCalls: number
    request: any
    resolve: (value: any) => void
  }> = []
  return {
    handles,
    start(request: any) {
      expect(request.deferStart).toBe(true)
      let settle!: (value: any) => void
      let settled = false
      let disposed = false
      const result = new Promise(resolve => { settle = resolve })
      const record = { cancelled: false, released: 0, resumeCalls: 0, request, resolve: (value: any) => { settled = true; settle(value) } }
      handles.push(record)
      return {
        id: `execution-${handles.length}`,
        result,
        release: () => { record.released += 1 },
        resume: () => { record.resumeCalls += 1 },
        cancel: (reason: string) => {
          record.cancelled = true
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

async function boot() {
  const root = await mkdtemp(join(tmpdir(), 'dsh-supervisor-controls-'))
  roots.push(root)
  const store = new MemoryStore(root)
  const bus = new EventBus()
  const engine = controlledEngine()
  const supervisor = new WorkflowSupervisor({
    workflowEngine: engine,
    on: bus.on.bind(bus),
    emit: bus.emit.bind(bus),
    logger: { warn: () => undefined },
    workflows: { save: async () => ({ path: '/tmp/unused' }) },
    workflowStorage: { layout: scratchLayout() },
  }, { defaultAgentBudget: 8, maxAgentBudget: 8, maxMembersPerRun: 8 }, store)
  await supervisor.initialize()
  const agent = { session: { id: 'session-controls', header: { cwd: '/tmp' } }, followup: async () => undefined }
  return { supervisor, store, bus, engine, agent }
}

describe('workflow supervisor controls', () => {
  it('pauses only after cancel, dispose, and checkpoint, then stops to cancelled', async () => {
    const { supervisor, store, engine, agent } = await boot()
    try {
      await supervisor.start({
        script: 'await pause("wait")',
        meta: { name: 'control-check', description: 'controls' },
        parent: agent,
        agentBudget: 2,
      })
      const paused = await supervisor.pause('control-check', agent)
      expect(paused.status).toBe('paused')
      expect(engine.handles[0]?.cancelled).toBe(true)
      expect((await store.readSession(agent.session.id))[0]?.status).toBe('paused')

      await expect(supervisor.pause('control-check', agent)).rejects.toMatchObject({
        message: 'workflow "control-check" is not running (paused)',
      })

      const resumed = await supervisor.resume('control-check', agent)
      expect(resumed.status).toBe('running')
      expect(engine.handles[1]?.released).toBe(1)
      expect(engine.handles[1]?.request.replay.checkpoint).toEqual({ journal: [], agentSpend: 0, agentSeq: 0 })

      const stopped = await supervisor.stop('control-check', agent)
      expect(stopped.status).toBe('cancelled')
      await expect(supervisor.stop('control-check', agent)).rejects.toMatchObject({
        message: 'workflow "control-check" already settled (cancelled)',
      })
    } finally {
      await supervisor.dispose()
    }
  })

  it('rejects cross-Agent pause and stop without mutating the owner row', async () => {
    const { supervisor, store, agent } = await boot()
    try {
      await supervisor.start({
        script: 'return 1', meta: { name: 'owned', description: 'owner' }, parent: agent, agentBudget: 2,
      })
      const other = { session: { id: 'session-other', header: { cwd: '/tmp' } } }
      await expect(supervisor.pause('owned', other)).rejects.toMatchObject({ code: 'WORKFLOW_RUN_NOT_FOUND' })
      expect((await store.readSession(agent.session.id))[0]?.status).toBe('running')
    } finally {
      await supervisor.dispose()
    }
  })

  it('serializes a pause/stop race through the per-run queue', async () => {
    const { supervisor, store, agent } = await boot()
    try {
      await supervisor.start({
        script: 'await pause("wait")',
        meta: { name: 'race-check', description: 'race' },
        parent: agent,
        agentBudget: 2,
      })
      const pause = supervisor.pause('race-check', agent)
      const stop = supervisor.stop('race-check', agent)
      const paused = await pause
      expect(paused.status).toBe('paused')
      const stopped = await stop
      expect(stopped.status).toBe('cancelled')
      expect((await store.readSession(agent.session.id))[0]?.status).toBe('cancelled')
    } finally {
      await supervisor.dispose()
    }
  })
})
