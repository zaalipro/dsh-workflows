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

class MemoryStore implements WorkflowRunStore {
  readonly entries = new Map<string, { sessionId: string; head: WorkflowRunHeadRecord; detail: WorkflowRunDetailPayloadV2; script: string }>()
  private sequence = 0
  constructor(readonly root: string) {}
  async initialize(): Promise<readonly any[]> { return [] }
  async insertWithNextDisplayName(request: WorkflowRunInsertRequest, create: (identity: any) => { head: any; detail: WorkflowRunDetailPayloadV2 }, signal?: AbortSignal) {
    signal?.throwIfAborted()
    const previous = [...this.entries.values()].filter(entry => entry.sessionId === request.sessionId && entry.head.name === request.name).length
    const numberedHandle = previous > 0
    const displayName = numberedHandle ? `${request.name}-${previous + 1}` : request.name
    const runDirectory = (this.sequence += 1).toString(16).padStart(32, '0')
    await mkdir(join(this.root, runDirectory, 'scratch'), { recursive: true, mode: 0o700 })
    await writeFile(join(this.root, runDirectory, 'script.js'), request.script, { mode: 0o600 })
    const draft = create({ displayName, numberedHandle, runDirectory })
    const head: WorkflowRunHeadRecord = {
      ...draft.head, runId: request.runId, name: request.name, displayName, numberedHandle, runDirectory, revision: 1,
      detail: { id: 'a'.repeat(32), bytes: 1, sha256: 'b'.repeat(64), snapshotRevision: 1 },
      detailRevision: 1, completionNotice: { state: 'none' }, scriptPath: join(this.root, runDirectory, 'script.js'),
    }
    this.entries.set(request.runId, { sessionId: request.sessionId, head, detail: draft.detail, script: request.script })
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
  async readRunScript(runDirectory: string) {
    const entry = [...this.entries.values()].find(item => item.head.runDirectory === runDirectory)
    if (entry === undefined) throw new Error(`missing projection ${runDirectory}`)
    return `${entry.script}\n// edited projection`
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

function handle() {
  let settle!: (value: any) => void
  const result = new Promise(resolve => { settle = resolve })
  return {
    id: 'execution-save',
    result,
    release: () => undefined,
    resume: () => undefined,
    cancel: (reason: string) => settle({ value: null, stopReason: 'cancelled', error: reason, agentsStarted: 0 }),
    dispose: async () => undefined,
    checkpoint: () => ({ journal: [], agentSpend: 0, agentSeq: 0 }),
  }
}

describe('workflow supervisor save', () => {
  it('saves an unnumbered live projection without mutating the running script', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-supervisor-save-'))
    roots.push(root)
    const store = new MemoryStore(root)
    const saved: any[] = []
    const supervisor = new WorkflowSupervisor({
      workflowEngine: { start: () => handle() },
      on: () => () => undefined,
      emit: () => undefined,
      logger: { warn: () => undefined },
      workflows: {
        save: async (envelope: any, options: any) => {
          saved.push({ envelope, options })
          return { path: `/tmp/${options.scope}/${envelope.meta.name}.workflow.json` }
        },
      },
      workflowStorage: { layout: scratchLayout() },
    }, { defaultAgentBudget: 8, maxAgentBudget: 8, maxMembersPerRun: 8, saveScope: 'project' }, store)
    await supervisor.initialize()
    const agent = { session: { id: 'session-save', header: { cwd: '/work' } }, followup: async () => undefined }
    try {
      await supervisor.start({
        script: 'return { live: true }',
        meta: { name: 'review-changes', description: 'save me' },
        parent: agent,
        agentBudget: 2,
      })
      await expect(supervisor.save('review-changes', agent)).resolves.toBe('/tmp/project/review-changes.workflow.json')
      expect(saved[0]?.options).toMatchObject({ scope: 'project', cwd: '/work' })
      expect(saved[0]?.envelope.script).toContain('// edited projection')
      expect(saved[0]?.envelope.meta).toEqual({ name: 'review-changes', description: 'save me' })
      expect([...store.entries.values()][0]?.script).toBe('return { live: true }')

      await expect(supervisor.save('review-changes', agent, 'user')).resolves.toBe('/tmp/user/review-changes.workflow.json')
    } finally {
      await supervisor.dispose()
    }
  })

  it('rejects bundled, numbered, and interrupted saves', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-supervisor-save-reject-'))
    roots.push(root)
    const store = new MemoryStore(root)
    const supervisor = new WorkflowSupervisor({
      workflowEngine: { start: () => handle() },
      on: () => () => undefined,
      emit: () => undefined,
      logger: { warn: () => undefined },
      workflows: { save: async () => ({ path: '/tmp/unused' }) },
      workflowStorage: { layout: scratchLayout() },
    }, { defaultAgentBudget: 8, maxAgentBudget: 8, maxMembersPerRun: 8 }, store)
    await supervisor.initialize()
    const agent = { session: { id: 'session-save', header: { cwd: '/work' } }, followup: async () => undefined }
    try {
      await supervisor.start({
        definition: {
          name: 'bundled-review',
          description: 'bundled',
          script: 'return 1',
          scope: 'bundled',
          path: '/bundled/bundled-review.workflow.json',
        },
        parent: agent,
        agentBudget: 2,
      })
      await expect(supervisor.save('bundled-review', agent)).rejects.toMatchObject({
        message: 'workflow "bundled-review" is a built-in: save an edited copy under a new meta.name',
      })

      await supervisor.start({
        script: 'return 1', meta: { name: 'review-changes', description: 'one' }, parent: agent, agentBudget: 2,
      })
      await supervisor.start({
        script: 'return 2', meta: { name: 'review-changes', description: 'two' }, parent: agent, agentBudget: 2,
      })
      await expect(supervisor.save('review-changes-2', agent)).rejects.toMatchObject({
        message: 'workflow "review-changes-2" is a numbered handle: save an edited copy under a new unique meta.name',
      })
    } finally {
      await supervisor.dispose()
    }
  })
})
