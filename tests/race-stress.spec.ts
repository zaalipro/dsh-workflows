import { mkdir, rm, writeFile } from 'node:fs/promises'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { resolveWorkflowPackageConfig } from '../src/config.js'
import { WorkflowSupervisor } from '../src/supervisor/index.js'
import { openWorkflowStorage } from '../src/supervisor/storage/index.js'
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

const SEED = 20_260_821
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

interface MemoryEntry {
  readonly sessionId: string
  head: WorkflowRunHeadRecord
  detail: WorkflowRunDetailPayloadV2
}

class MemoryStore implements WorkflowRunStore {
  readonly entries = new Map<string, MemoryEntry>()
  readonly inserted: string[] = []
  readonly terminalized: string[] = []
  private sequence = 0
  private disposed = false
  readonly root: string
  onInserted?: (runId: string) => void
  insertionStarted?: () => void
  insertionGate?: Promise<void>

  constructor(root: string) { this.root = root }

  async initialize(): Promise<readonly any[]> {
    return [...this.entries.values()]
      .filter(entry => ['running', 'paused', 'needs-input'].includes(entry.head.status))
      .map(entry => ({ ...entry.head, sessionId: entry.sessionId }))
  }

  async insertWithNextDisplayName(
    request: WorkflowRunInsertRequest,
    create: (identity: { displayName: string; numberedHandle: boolean; runDirectory: string }) => { head: any; detail: WorkflowRunDetailPayloadV2 },
    signal?: AbortSignal,
  ): Promise<WorkflowRunHeadRecord> {
    if (this.disposed) throw new Error('store disposed')
    signal?.throwIfAborted()
    this.insertionStarted?.()
    if (this.insertionGate !== undefined) await this.insertionGate
    signal?.throwIfAborted()
    const previous = [...this.entries.values()].filter(entry => entry.sessionId === request.sessionId && entry.head.name === request.name).length
    const numberedHandle = previous > 0
    const displayName = numberedHandle ? `${request.name}-${previous + 1}` : request.name
    const runDirectory = (this.sequence += 1).toString(16).padStart(32, '0')
    const path = join(this.root, runDirectory)
    await mkdir(join(path, 'scratch'), { recursive: true, mode: 0o700 })
    await mkdir(join(path, 'details'), { recursive: true, mode: 0o700 })
    await writeFile(join(path, 'script.js'), request.script, { mode: 0o600 })
    const draft = create({ displayName, numberedHandle, runDirectory })
    const head: WorkflowRunHeadRecord = {
      ...draft.head,
      runId: request.runId,
      name: request.name,
      displayName,
      numberedHandle,
      runDirectory,
      revision: 1,
      detail: { id: 'a'.repeat(32), bytes: 1, sha256: 'b'.repeat(64), snapshotRevision: 1 },
      detailRevision: 1,
      completionNotice: { state: 'none' },
      scriptPath: join(path, 'script.js'),
    }
    this.entries.set(request.runId, { sessionId: request.sessionId, head, detail: draft.detail })
    this.inserted.push(request.runId)
    request.onDurable?.(head)
    this.onInserted?.(request.runId)
    return { ...head }
  }

  async commitRun(request: WorkflowRunCommitRequest): Promise<WorkflowRunHeadRecord> {
    const entry = this.require(request.runId)
    if (entry.head.revision !== request.expectedRevision) throw new Error('workflow run changed; refresh it before applying a control')
    entry.detail = request.detail ?? entry.detail
    entry.head = {
      ...entry.head,
      ...request.head,
      revision: entry.head.revision + 1,
      detail: entry.head.detail,
      completionNotice: entry.head.completionNotice,
      scriptPath: entry.head.scriptPath,
    }
    return { ...entry.head }
  }

  async commitTerminalAndClaimNotice(request: WorkflowTerminalCommitRequest): Promise<WorkflowRunHeadRecord> {
    const entry = this.require(request.runId)
    if (entry.head.revision !== request.expectedRevision) throw new Error('workflow run changed; refresh it before applying a control')
    entry.detail = request.detail ?? entry.detail
    entry.head = {
      ...entry.head,
      ...request.head,
      revision: entry.head.revision + 1,
      completionNotice: { state: 'claimed', claimId: 'c'.repeat(32), processEpoch: 'd'.repeat(32), claimedAt: 10 },
      scriptPath: entry.head.scriptPath,
    }
    this.terminalized.push(request.runId)
    return { ...entry.head }
  }

  async finalizeCompletionNotice(
    sessionId: string,
    runId: string,
    expectedRevision: number,
    finalization: WorkflowCompletionNoticeFinalization,
  ): Promise<WorkflowRunHeadRecord> {
    const entry = this.require(runId)
    if (entry.sessionId !== sessionId || entry.head.revision !== expectedRevision) throw new Error('stale notice')
    entry.head = { ...entry.head, revision: expectedRevision + 1, completionNotice: finalization }
    return { ...entry.head }
  }

  async readSession(sessionId: string): Promise<readonly WorkflowRunHeadRecord[]> {
    return [...this.entries.values()].filter(entry => entry.sessionId === sessionId).map(entry => ({ ...entry.head }))
  }

  async readDetails(runId: string, request: DetailReadRequest): Promise<DetailReadResult> {
    const entry = this.require(runId)
    const value = request.kind === 'members' ? entry.detail.members ?? []
      : request.kind === 'logs' ? entry.detail.logs ?? []
        : request.kind === 'result' ? entry.detail.result ?? { state: 'not-produced' }
          : request.kind === 'artifacts' ? entry.detail.artifacts ?? [] : null
    return { value: value as any, revision: entry.head.detailRevision, total: Array.isArray(value) ? value.length : value === null ? 0 : 1 }
  }

  async dispose(): Promise<void> { this.disposed = true }

  private require(runId: string): MemoryEntry {
    const entry = this.entries.get(runId)
    if (entry === undefined) throw new Error(`missing run ${runId}`)
    return entry
  }
}

interface FakeHandle {
  readonly id: string
  readonly request: any
  readonly released: () => boolean
  readonly releaseCalls: () => number
  readonly cancelled: () => boolean
  readonly disposed: () => boolean
  readonly went: () => boolean
  readonly checkpointAfterDispose: () => boolean
  resolve(result?: { value: unknown; stopReason: 'completed' | 'cancelled' | 'error'; error?: string; errorCode?: string; agentsStarted: number }): void
}

function failIteration(iteration: number, error: unknown): never {
  const message = error instanceof Error ? error.stack ?? error.message : String(error)
  throw new Error(`RD11 iteration ${iteration} seed ${SEED}: ${message}`)
}

/** Replay-capable fake: deferStart, CHECKPOINT_NOT_READY until result+dispose, and
 * release after cancel/settle is a no-op so a racing Go cannot restart. */
function fakeEngine(handles: FakeHandle[]): { start(request: any): any } {
  let next = 0
  return {
    start(request: any) {
      expect(request.deferStart).toBe(true)
      expect(request.journal).toBeUndefined()
      expect(request.scratchDir).toBeUndefined()
      expect(request.validateOnly).toBeUndefined()
      expect(request.initialAgentSpend).toBeUndefined()
      let released = 0
      let cancelled = false
      let disposed = false
      let settled = false
      let went = false
      let checkpointAfterDispose = false
      let settle!: (value: any) => void
      const result = new Promise(resolve => { settle = resolve })
      const handle: any = {
        id: `execution-${++next}`,
        result,
        release: () => {
          if (cancelled || settled || disposed) return
          released += 1
          went = true
        },
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
          checkpointAfterDispose = true
          return { journal: [], agentSpend: 0, agentSeq: 0 }
        },
      }
      handles.push({
        id: handle.id,
        request,
        released: () => released > 0,
        releaseCalls: () => released,
        cancelled: () => cancelled,
        disposed: () => disposed,
        went: () => went,
        checkpointAfterDispose: () => checkpointAfterDispose,
        resolve: value => {
          if (settled) return
          settled = true
          settle(value ?? { value: { ok: true }, stopReason: 'completed', agentsStarted: 0 })
        },
      })
      return handle
    },
  }
}

function parent(id = 'session-race'): any {
  return {
    session: { id, header: { cwd: '/tmp' } },
    followup: async () => undefined,
    inject: async () => undefined,
  }
}

function launchSpec(agent: any, name = 'race-check') {
  return {
    script: 'return null',
    meta: { name, description: 'deterministic race fixture' },
    parent: agent,
    agentBudget: 2,
  }
}

function scratchLayout(): any {
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
      const before = bucket.get(name)
      bucket.set(name, content)
      return { operation: before === undefined ? 'createIfAbsent' : 'replaceIfVersion', version: {}, before, after: content }
    },
    assertIdentity: async () => undefined,
    close: async () => undefined,
  })
  return {
    lease: { assertCurrent: async () => undefined },
    runs: { openDirectory: async (name: string) => directory(join('/fake-runs', name)) },
  }
}

function onceEvent(bus: EventBus, name: string, count = 1): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${name}`)), 5_000)
    timer.unref?.()
    let seen = 0
    const off = bus.on(name, () => {
      seen += 1
      if (seen < count) return
      clearTimeout(timer)
      off()
      resolve()
    })
  })
}

async function admitMembers(bus: EventBus, executionId: string, labels: readonly string[]): Promise<void> {
  const wait = onceEvent(bus, 'workflows/member-start', labels.length)
  for (const [index, label] of labels.entries()) {
    bus.emit('workflow/agent-start', { id: executionId }, { seq: index + 1, label, childId: `child-${label}` })
  }
  await wait
}

function seqs(bus: EventBus, name: string, since: number): number[] {
  return bus.events.slice(since)
    .filter(event => event.name === name)
    .map(event => Number((event.args[1] as { seq?: unknown } | undefined)?.seq))
    .filter(value => Number.isSafeInteger(value))
    .sort((left, right) => left - right)
}

function assertPaired(options: {
  readonly bus: EventBus
  readonly store: MemoryStore
  readonly launched: { readonly runId: string }
  readonly handle: FakeHandle
  readonly since: number
  readonly expectedStatus: string
}): void {
  const startSeqs = seqs(options.bus, 'workflows/member-start', options.since)
  const endSeqs = seqs(options.bus, 'workflows/member-end', options.since)
  expect(endSeqs).toEqual(startSeqs)
  expect(startSeqs.length).toBeGreaterThan(0)
  expect(options.bus.events.slice(options.since).filter(event => event.name === 'workflows/run-end')).toHaveLength(1)
  expect(options.store.terminalized.filter(id => id === options.launched.runId)).toHaveLength(1)
  const notice = options.store.entries.get(options.launched.runId)?.head.completionNotice.state
  expect(notice === 'claimed' || notice === 'delivered' || notice === 'abandoned').toBe(true)
  expect(options.handle.disposed()).toBe(true)
  expect(options.handle.checkpointAfterDispose()).toBe(true)
  expect(options.handle.releaseCalls()).toBeLessThanOrEqual(1)
  expect(options.store.entries.get(options.launched.runId)?.head.status).toBe(options.expectedStatus)
}

function trackRejections(): { readonly stop: () => void } {
  const seen: unknown[] = []
  const onReject = (reason: unknown) => { seen.push(reason) }
  process.on('unhandledRejection', onReject)
  return {
    stop() {
      process.off('unhandledRejection', onReject)
      expect(seen, String(seen[0])).toEqual([])
    },
  }
}

async function supervisorFixture(handles: FakeHandle[] = []): Promise<{
  supervisor: WorkflowSupervisor
  store: MemoryStore
  bus: EventBus
  root: string
  handles: FakeHandle[]
}> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-race-stress-'))
  roots.push(root)
  const store = new MemoryStore(root)
  const bus = new EventBus()
  const ctx = {
    workflowEngine: fakeEngine(handles),
    on: bus.on.bind(bus),
    emit: bus.emit.bind(bus),
    logger: { warn: () => undefined },
    workflows: { save: async () => ({ path: '/tmp/unused' }) },
    workflowStorage: { layout: scratchLayout() },
  }
  const supervisor = new WorkflowSupervisor(ctx, {
    defaultAgentBudget: 2, maxAgentBudget: 2, maxConcurrentAgents: 2,
    maxMembersPerRun: 2, completionCohortMaxItems: 2,
  }, store)
  await supervisor.initialize()
  return { supervisor, store, bus, root, handles }
}

describe('host lifecycle race stress', () => {
  it('cancels an admitted two-member run 100 times with paired teardown', async () => {
    const rejections = trackRejections()
    const fixture = await supervisorFixture()
    try {
      for (let iteration = 0; iteration < 100; iteration += 1) {
        try {
          const agent = parent(`session-cancel-${iteration}`)
          const before = fixture.bus.events.length
          const launched = await fixture.supervisor.start(launchSpec(agent, 'race-check'))
          const handle = fixture.handles.at(-1)
          expect(handle).toBeDefined()
          expect(handle!.released()).toBe(true)
          expect(handle!.went()).toBe(true)
          expect(fixture.store.entries.has(launched.runId)).toBe(true)
          expect(fixture.bus.events.slice(before).map(value => value.name)).toContain('workflows/run-start')
          await admitMembers(fixture.bus, handle!.id, ['alpha', 'beta'])
          await fixture.supervisor.stop('race-check', agent)
          await fixture.supervisor.whenOwnerQuiescent(agent)
          assertPaired({
            bus: fixture.bus,
            store: fixture.store,
            launched,
            handle: handle!,
            since: before,
            expectedStatus: 'cancelled',
          })
          expect(handle!.cancelled()).toBe(true)
          expect(handle!.releaseCalls()).toBe(1)
        } catch (error) {
          failIteration(iteration, error)
        }
      }
      expect(new Set(fixture.store.inserted).size).toBe(100)
      expect(fixture.store.terminalized).toHaveLength(100)
      expect(fixture.handles.every(handle => handle.disposed() && handle.checkpointAfterDispose())).toBe(true)
    } finally {
      await fixture.supervisor.dispose()
      rejections.stop()
    }
  }, 60_000)

  it('does not admit a caller-aborted start before its durable insert, but owns a run after admission', async () => {
    const fixture = await supervisorFixture()
    const handles = fixture.handles
    let releaseInsert!: () => void
    const insertGate = new Promise<void>(resolve => { releaseInsert = resolve })
    fixture.store.insertionGate = insertGate
    let started!: () => void
    fixture.store.insertionStarted = () => started?.()
    const insertionStarted = new Promise<void>(resolve => { started = resolve })
    const agent = parent()
    const abort = new AbortController()
    const pending = fixture.supervisor.start({ ...launchSpec(agent, 'aborted-before-admission'), signal: abort.signal })
    await insertionStarted
    abort.abort(new Error('caller cancelled before durable admission'))
    releaseInsert()
    await expect(pending).rejects.toThrow(/caller cancelled|aborted/u)
    expect(fixture.store.entries.size).toBe(0)
    expect(handles).toHaveLength(0)

    fixture.store.insertionGate = undefined
    let abortAfterInsert: AbortController | undefined
    fixture.store.onInserted = () => abortAfterInsert?.abort(new Error('caller left after admission'))
    abortAfterInsert = new AbortController()
    const launched = await fixture.supervisor.start({ ...launchSpec(agent, 'aborted-after-admission'), signal: abortAfterInsert.signal })
    expect(fixture.store.entries.has(launched.runId)).toBe(true)
    expect(handles.at(-1)?.released()).toBe(true)
    handles.at(-1)!.resolve({ value: null, stopReason: 'completed', agentsStarted: 0 })
    await fixture.supervisor.whenOwnerQuiescent(agent)
    expect((await fixture.store.readSession(agent.session.id)).some(row => row.displayName === 'aborted-after-admission' && row.status === 'completed')).toBe(true)
    await fixture.supervisor.dispose()
  })

  it('pairs admitted members and coalesces stop teardown at one terminal boundary', async () => {
    const fixture = await supervisorFixture()
    try {
      const agent = parent()
      const before = fixture.bus.events.length
      const launched = await fixture.supervisor.start(launchSpec(agent, 'stop-race'))
      const handle = fixture.handles.at(-1)!
      await admitMembers(fixture.bus, handle.id, ['alpha'])
      const firstStop = fixture.supervisor.stop('stop-race', agent)
      const secondStop = fixture.supervisor.stop('stop-race', agent)
      const stops = await Promise.allSettled([firstStop, secondStop])
      expect(stops.filter(result => result.status === 'fulfilled')).toHaveLength(1)
      expect(stops.filter(result => result.status === 'rejected')).toHaveLength(1)
      await fixture.supervisor.whenOwnerQuiescent(agent)
      assertPaired({
        bus: fixture.bus,
        store: fixture.store,
        launched,
        handle,
        since: before,
        expectedStatus: 'cancelled',
      })
      expect(handle.cancelled()).toBe(true)
      expect(handle.releaseCalls()).toBe(1)
      expect(launched.displayName).toBe('stop-race')
    } finally {
      await fixture.supervisor.dispose()
    }
  })

  it('interleaves pending-start close, pause/stop, worker death, and owner teardown 50 times', async () => {
    const rejections = trackRejections()
    const fixture = await supervisorFixture()
    try {
      for (let iteration = 0; iteration < 50; iteration += 1) {
        try {
          const agent = parent(`session-mix-${iteration}`)
          const kind = iteration % 5
          if (kind === 0) {
            let releaseInsert!: () => void
            fixture.store.insertionGate = new Promise<void>(resolve => { releaseInsert = resolve })
            let started!: () => void
            fixture.store.insertionStarted = () => started?.()
            const insertionStarted = new Promise<void>(resolve => { started = resolve })
            const beforeInserted = fixture.store.inserted.length
            const pending = fixture.supervisor.start(launchSpec(agent, 'pending-start'))
            await insertionStarted
            fixture.supervisor.closeAdmissionSync()
            releaseInsert()
            await expect(pending).rejects.toThrow()
            expect(fixture.store.inserted).toHaveLength(beforeInserted)
            expect(fixture.handles.filter(handle => !handle.disposed())).toHaveLength(0)
            fixture.store.insertionGate = undefined
            fixture.store.insertionStarted = undefined
            await fixture.supervisor.dispose()
            const next = await supervisorFixture(fixture.handles)
            fixture.supervisor = next.supervisor
            fixture.store = next.store
            fixture.bus = next.bus
            continue
          }

          const before = fixture.bus.events.length
          const launched = await fixture.supervisor.start(launchSpec(agent, 'mix-check'))
          const handle = fixture.handles.at(-1)!
          await admitMembers(fixture.bus, handle.id, ['alpha', 'beta'])

          if (kind === 1) {
            const pause = fixture.supervisor.pause('mix-check', agent)
            const stop = fixture.supervisor.stop('mix-check', agent)
            await Promise.allSettled([pause, stop])
            await fixture.supervisor.whenOwnerQuiescent(agent)
            const row = (await fixture.store.readSession(agent.session.id))[0]
            expect(row?.status === 'paused' || row?.status === 'cancelled').toBe(true)
            const startSeqs = seqs(fixture.bus, 'workflows/member-start', before)
            const endSeqs = seqs(fixture.bus, 'workflows/member-end', before)
            expect(endSeqs).toEqual(startSeqs)
            expect(handle.disposed()).toBe(true)
            expect(handle.checkpointAfterDispose()).toBe(true)
            if (row?.status === 'paused') await fixture.supervisor.stop('mix-check', agent)
            await fixture.supervisor.whenOwnerQuiescent(agent)
          } else if (kind === 2) {
            handle.resolve({ value: null, stopReason: 'error', error: 'worker died', agentsStarted: 2 })
            await fixture.supervisor.whenOwnerQuiescent(agent)
            assertPaired({
              bus: fixture.bus,
              store: fixture.store,
              launched,
              handle,
              since: before,
              expectedStatus: 'failed',
            })
          } else if (kind === 3) {
            fixture.bus.emit('agent/disposed', { agent })
            await fixture.supervisor.whenOwnerQuiescent(agent)
            expect(handle.cancelled()).toBe(true)
            expect((await fixture.store.readSession(agent.session.id))[0]?.status).toBe('interrupted')
            const startSeqs = seqs(fixture.bus, 'workflows/member-start', before)
            const endSeqs = seqs(fixture.bus, 'workflows/member-end', before)
            expect(endSeqs).toEqual(startSeqs)
            expect(handle.disposed()).toBe(true)
          } else {
            fixture.supervisor.closeAdmissionSync()
            await fixture.supervisor.dispose()
            expect(handle.cancelled()).toBe(true)
            expect(handle.disposed()).toBe(true)
            const startSeqs = seqs(fixture.bus, 'workflows/member-start', before)
            const endSeqs = seqs(fixture.bus, 'workflows/member-end', before)
            expect(endSeqs).toEqual(startSeqs)
            const next = await supervisorFixture(fixture.handles)
            fixture.supervisor = next.supervisor
            fixture.store = next.store
            fixture.bus = next.bus
          }
        } catch (error) {
          failIteration(iteration, error)
        }
      }
    } finally {
      await fixture.supervisor.dispose()
      rejections.stop()
    }
  }, 60_000)

  it('closes admission synchronously, skips a racing release, and makes disposal idempotent', async () => {
    const fixture = await supervisorFixture()
    try {
      const agent = parent()
      fixture.bus.on('workflows/run-start', () => { fixture.supervisor.closeAdmissionSync() })
      const launched = await fixture.supervisor.start(launchSpec(agent, 'skip-release'))
      const handle = fixture.handles.at(-1)!
      expect(launched.status).toBe('started')
      expect(handle.releaseCalls()).toBe(0)
      expect(handle.went()).toBe(false)
      await expect(fixture.supervisor.start(launchSpec(agent, 'after-close'))).rejects.toMatchObject({
        code: 'WORKFLOW_INVALID_STATE',
      })
      const first = fixture.supervisor.dispose()
      const second = fixture.supervisor.dispose()
      await Promise.all([first, second])
      await expect(fixture.supervisor.dispose()).resolves.toBeUndefined()
      expect(handle.cancelled()).toBe(true)
      expect(handle.disposed()).toBe(true)
      expect((await fixture.store.readSession(agent.session.id))[0]?.status).toBe('interrupted')
    } finally {
      await fixture.supervisor.dispose()
    }
  })

  it('drains owned work before the storage lease is released', async () => {
    if (process.platform === 'win32') {
      const root = await mkdtemp(join(tmpdir(), 'dsh-race-lease-win-'))
      roots.push(root)
      await expect(openWorkflowStorage(resolveWorkflowPackageConfig({
        dshHome: join(root, 'home'),
        runsRoot: join(root, 'runs'),
        definitionWatch: false,
      }, join(root, 'home')))).rejects.toMatchObject({ code: 'WORKFLOW_STORAGE_UNSUPPORTED' })
      return
    }

    const root = await mkdtemp(join(tmpdir(), 'dsh-race-lease-'))
    roots.push(root)
    const resolved = resolveWorkflowPackageConfig({
      dshHome: join(root, 'home'),
      runsRoot: join(root, 'runs'),
      definitionWatch: false,
      defaultAgentBudget: 2,
      maxAgentBudget: 2,
      maxConcurrentAgents: 2,
      maxMembersPerRun: 2,
    }, join(root, 'home'))
    const storage = await openWorkflowStorage(resolved)
    const handles: FakeHandle[] = []
    const bus = new EventBus()
    const supervisor = new WorkflowSupervisor({
      workflowEngine: fakeEngine(handles),
      on: bus.on.bind(bus),
      emit: bus.emit.bind(bus),
      logger: { warn: () => undefined },
      workflows: { save: async () => ({ path: '/tmp/unused' }) },
      workflowStorage: storage,
    }, { defaultAgentBudget: 2, maxAgentBudget: 2, maxMembersPerRun: 2 }, storage.store)
    const agent = parent('session-lease')
    try {
      await supervisor.initialize()
      const launched = await supervisor.start(launchSpec(agent, 'lease-check'))
      const handle = handles.at(-1)!
      await admitMembers(bus, handle.id, ['alpha'])
      await supervisor.stop('lease-check', agent)
      await supervisor.whenOwnerQuiescent(agent)
      expect(handle.disposed()).toBe(true)
      const members = await storage.store.readDetails(launched.runId, { kind: 'members' })
      expect((members.value as any[]).map((member: any) => member.seq).sort()).toEqual([1])
      expect((members.value as any[]).every((member: any) => member.status !== 'running')).toBe(true)
    } finally {
      await supervisor.dispose()
      await storage.dispose()
    }
    const reopened = await openWorkflowStorage(resolved)
    try {
      await reopened.lease.assertCurrent()
      const rows = await reopened.store.readSession(agent.session.id)
      expect(rows).toHaveLength(1)
      expect(rows[0]?.status).toBe('cancelled')
      expect(rows[0]?.displayName).toBe('lease-check')
    } finally {
      await reopened.dispose()
    }
  })
})
