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

describe('workflow supervisor settlement', () => {
  it('captures checkpoint only after result and dispose, then commits completed', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-supervisor-settlement-'))
    roots.push(root)
    const order: string[] = []
    let settle!: (value: any) => void
    const result = new Promise(resolve => { settle = resolve })
    let disposed = false
    let settled = false
    const handle = {
      id: 'execution-1',
      result,
      release: () => { order.push('release') },
      resume: () => undefined,
      cancel: () => undefined,
      dispose: async () => { order.push('dispose'); disposed = true },
      checkpoint: () => {
        order.push('checkpoint')
        if (!settled || !disposed) throw Object.assign(new Error('CHECKPOINT_NOT_READY'), { code: 'CHECKPOINT_NOT_READY' })
        return {
          journal: [{ callId: [1], fingerprint: 'a'.repeat(64), kind: 'phase' }],
          agentSpend: 0,
          agentSeq: 0,
        }
      },
    }
    const bus = new EventBus()
    const store = new MemoryStore(root)
    const supervisor = new WorkflowSupervisor({
      workflowEngine: {
        start: (request: any) => {
          expect(request.deferStart).toBe(true)
          return handle
        },
      },
      on: bus.on.bind(bus),
      emit: bus.emit.bind(bus),
      logger: { warn: () => undefined },
      workflows: { save: async () => ({ path: '/tmp/unused' }) },
      workflowStorage: { layout: scratchLayout() },
    }, { defaultAgentBudget: 8, maxAgentBudget: 8, maxMembersPerRun: 8 }, store)
    await supervisor.initialize()
    const agent = { session: { id: 'session-settle', header: { cwd: '/tmp' } }, followup: async () => undefined }
    try {
      await supervisor.start({
        script: 'complete({ ok: true })',
        meta: { name: 'settle-check', description: 'settlement' },
        parent: agent,
        agentBudget: 2,
      })
      expect(order).toEqual(['release'])
      settled = true
      settle({ value: { ok: true }, stopReason: 'completed', agentsStarted: 0 })
      await supervisor.whenOwnerQuiescent(agent)
      expect(order).toEqual(['release', 'dispose', 'checkpoint'])
      expect((await store.readSession('session-settle'))[0]?.status).toBe('completed')
      expect(bus.events.some(event => event.name === 'workflows/run-end')).toBe(true)
    } finally {
      await supervisor.dispose()
    }
  })

  it('maps AGENT_CAP to budget-limited instead of a regex on the error text', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-supervisor-cap-'))
    roots.push(root)
    let settle!: (value: any) => void
    const result = new Promise(resolve => { settle = resolve })
    const handle = {
      id: 'execution-cap',
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
    }, { defaultAgentBudget: 8, maxAgentBudget: 8, maxMembersPerRun: 8 }, store)
    await supervisor.initialize()
    const agent = { session: { id: 'session-cap', header: { cwd: '/tmp' } }, followup: async () => undefined }
    try {
      await supervisor.start({
        script: 'return 1', meta: { name: 'budget-check', description: 'cap' }, parent: agent, agentBudget: 2,
      })
      settle({ value: null, stopReason: 'error', error: 'agent capacity exhausted', errorCode: 'AGENT_CAP', agentsStarted: 2 })
      await supervisor.whenOwnerQuiescent(agent)
      expect((await store.readSession('session-cap'))[0]?.status).toBe('budget-limited')
    } finally {
      await supervisor.dispose()
    }
  })

  it('maps an unowned cancellation to failed and ignores budget text without AGENT_CAP', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-supervisor-failed-'))
    roots.push(root)
    let settle!: (value: any) => void
    const result = new Promise(resolve => { settle = resolve })
    const handle = {
      id: 'execution-failed',
      result,
      release: () => undefined,
      resume: () => undefined,
      cancel: () => undefined,
      dispose: async () => undefined,
      checkpoint: () => ({ journal: [], agentSpend: 0, agentSeq: 0 }),
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
    }, { defaultAgentBudget: 8, maxAgentBudget: 8, maxMembersPerRun: 8 }, store)
    await supervisor.initialize()
    const agent = { session: { id: 'session-failed', header: { cwd: '/tmp' } }, followup: async () => undefined }
    try {
      await supervisor.start({
        script: 'return 1', meta: { name: 'fail-check', description: 'fail' }, parent: agent, agentBudget: 2,
      })
      settle({ value: null, stopReason: 'cancelled', error: 'agent capacity exhausted', agentsStarted: 0 })
      await supervisor.whenOwnerQuiescent(agent)
      expect((await store.readSession('session-failed'))[0]?.status).toBe('failed')
    } finally {
      await supervisor.dispose()
    }
  })

  it('recovers a stock child transcript from ctx.sessions after agent-end', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-supervisor-transcript-'))
    roots.push(root)
    let settle!: (value: any) => void
    const result = new Promise(resolve => { settle = resolve })
    const handle = {
      id: 'execution-transcript',
      result,
      release: () => undefined,
      resume: () => undefined,
      cancel: () => undefined,
      dispose: async () => undefined,
      checkpoint: () => ({ journal: [], agentSpend: 1, agentSeq: 1 }),
    }
    const bus = new EventBus()
    const store = new MemoryStore(root)
    const supervisor = new WorkflowSupervisor({
      workflowEngine: { start: () => handle },
      on: bus.on.bind(bus),
      emit: bus.emit.bind(bus),
      logger: { warn: () => undefined },
      workflows: { save: async () => ({ path: '/tmp/unused' }) },
      workflowStorage: { layout: scratchLayout() },
      sessions: {
        get(id: string) {
          if (id !== 'child-alpha') return undefined
          return {
            events: [
              { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: 'alpha-ready' }] } } },
            ],
          }
        },
      },
    }, { defaultAgentBudget: 8, maxAgentBudget: 8, maxMembersPerRun: 8 }, store)
    await supervisor.initialize()
    const agent = { session: { id: 'session-transcript', header: { cwd: '/tmp' } }, followup: async () => undefined }
    try {
      const launched = await supervisor.start({
        script: 'return 1', meta: { name: 'trace-check', description: 'transcript' }, parent: agent, agentBudget: 2,
      })
      const started = new Promise<void>(resolve => {
        const off = bus.on('workflows/member-start', () => { off(); resolve() })
      })
      bus.emit('workflow/agent-start', { id: 'execution-transcript' }, {
        seq: 1, label: 'alpha', phase: 'Fanout', childId: 'child-alpha',
      })
      await started
      const ended = new Promise<void>(resolve => {
        const off = bus.on('workflows/member-end', () => { off(); resolve() })
      })
      bus.emit('workflow/agent-end', { id: 'execution-transcript' }, { seq: 1, outcome: 'completed' })
      await ended
      settle({ value: { ok: true }, stopReason: 'completed', agentsStarted: 1 })
      await supervisor.whenOwnerQuiescent(agent)
      const page = await supervisor.members(agent, { runId: launched.runId as never, limit: 10 })
      expect(page.items).toEqual([expect.objectContaining({
        label: 'alpha', status: 'completed', outcome: 'available', childSessionId: 'child-alpha',
      })])
      const detail = await supervisor.memberDetail(agent, {
        runId: launched.runId as never, memberId: page.items[0]!.memberId as never,
      })
      expect(detail.outcome).toMatchObject({
        state: 'available',
        content: { kind: 'value', value: 'alpha-ready' },
      })
      const stored = store.entries.get(launched.runId)!.detail.members![0]!
      store.entries.get(launched.runId)!.detail.members = [{
        ...stored, outcome: 'not-produced',
      }]
      delete (store.entries.get(launched.runId)!.detail.members![0] as { value?: unknown }).value
      const recoveredPage = await supervisor.members(agent, { runId: launched.runId as never, limit: 10 })
      expect(recoveredPage.items[0]?.outcome).toBe('available')
      const recovered = await supervisor.memberDetail(agent, {
        runId: launched.runId as never, memberId: recoveredPage.items[0]!.memberId as never,
      })
      expect(recovered.outcome).toMatchObject({
        state: 'available',
        content: { kind: 'value', value: 'alpha-ready' },
      })
    } finally {
      await supervisor.dispose()
    }
  })
})
