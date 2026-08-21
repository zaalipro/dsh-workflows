import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { VALIDATION_NOTE, WorkflowSupervisor } from '../src/supervisor/index.js'
import type {
  DetailReadRequest,
  DetailReadResult,
  WorkflowCompletionNoticeFinalization,
  WorkflowRunCommitRequest,
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
  readonly inserted: string[] = []
  async initialize(): Promise<readonly any[]> { return [] }
  async insertWithNextDisplayName(request: WorkflowRunInsertRequest): Promise<WorkflowRunHeadRecord> {
    this.inserted.push(request.runId)
    throw new Error('validate must not insert a run')
  }
  async commitRun(request: WorkflowRunCommitRequest): Promise<WorkflowRunHeadRecord> {
    throw new Error(`validate must not commit ${request.runId}`)
  }
  async commitTerminalAndClaimNotice(request: WorkflowTerminalCommitRequest): Promise<WorkflowRunHeadRecord> {
    throw new Error(`validate must not terminalize ${request.runId}`)
  }
  async finalizeCompletionNotice(_sessionId: string, runId: string, _expectedRevision: number, _finalization: WorkflowCompletionNoticeFinalization): Promise<WorkflowRunHeadRecord> {
    throw new Error(`validate must not finalize ${runId}`)
  }
  async readSession(): Promise<readonly WorkflowRunHeadRecord[]> { return [] }
  async readDetails(_runId: string, _request: DetailReadRequest): Promise<DetailReadResult> {
    return { value: [], revision: 1, total: 0 }
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

async function boot() {
  const root = await mkdtemp(join(tmpdir(), 'dsh-supervisor-validate-'))
  roots.push(root)
  const store = new MemoryStore()
  const requests: any[] = []
  let starts = 0
  const workflowEngine = {
    start() {
      starts += 1
      throw new Error('validate must not start a live attempt')
    },
    async validate(request: any) {
      requests.push(request)
      expect(request.parent).toBeUndefined()
      expect(request.validateOnly).toBeUndefined()
      expect(request.filename).toBeUndefined()
      expect(request.journal).toBeUndefined()
      expect(request.scratchDir).toBeUndefined()
      if (String(request.script).includes('???')) {
        return { ok: false, status: 'error', error: `workflow:${request.meta.name}:4\nUnexpected token` }
      }
      if (request.args?.gate !== undefined) {
        return { ok: true, status: 'would-pause', value: request.args.gate }
      }
      return { ok: true, status: 'completed', value: { canned: true, args: request.args ?? {} } }
    },
  }
  const supervisor = new WorkflowSupervisor({
    workflowEngine,
    on: () => () => undefined,
    emit: () => undefined,
    logger: { warn: () => undefined },
    workflows: { save: async () => ({ path: '/tmp/unused' }) },
    workflowStorage: { layout: scratchLayout() },
  }, { defaultAgentBudget: 8, maxAgentBudget: 16, maxMembersPerRun: 16 }, store)
  await supervisor.initialize()
  return { supervisor, store, requests, starts: () => starts }
}

describe('workflow supervisor validation', () => {
  it('requires a calling agent and never admits a run', async () => {
    const { supervisor, store, starts } = await boot()
    try {
      await expect(supervisor.validate({
        script: 'return 1',
        meta: { name: 'review-changes', description: 'smoke' },
        filename: '/tmp/review-changes.workflow.json',
      })).resolves.toEqual({ ok: false, status: 'error', error: 'validate_only requires a calling agent' })
      expect(store.inserted).toEqual([])
      expect(starts()).toBe(0)
    } finally {
      await supervisor.dispose()
    }
  })

  it('rewrites workflow:name diagnostics to the package filename and 1-based line', async () => {
    const { supervisor, requests } = await boot()
    const parent = { session: { id: 'session-validate', header: { cwd: '/tmp' } } }
    try {
      const failed = await supervisor.validate({
        script: 'if (false) { ??? } return 1',
        meta: { name: 'review-changes', description: 'smoke' },
        parent,
        filename: '/tmp/review-changes.workflow.json',
        args: { unused: true },
      })
      expect(failed).toEqual({
        ok: false,
        status: 'error',
        error: '/tmp/review-changes.workflow.json:4\nUnexpected token',
      })
      expect(requests[0]).toMatchObject({
        maxTotalAgents: 8,
        args: { unused: true },
      })
      expect(requests[0]).not.toHaveProperty('parent')
    } finally {
      await supervisor.dispose()
    }
  })

  it('returns completed and would-pause product strings with the coverage note', async () => {
    const { supervisor, store, starts } = await boot()
    const parent = { session: { id: 'session-validate', header: { cwd: '/tmp' } } }
    try {
      await expect(supervisor.validate({
        script: 'return { ok: true }',
        meta: { name: 'review-changes', description: 'smoke' },
        parent,
        filename: '/tmp/review-changes.workflow.json',
        args: { path: 'main' },
        agentBudget: 4,
      })).resolves.toEqual({
        ok: true,
        status: 'completed',
        value: { canned: true, args: { path: 'main' } },
        note: VALIDATION_NOTE,
      })

      await expect(supervisor.validate({
        script: 'await pause("retry later")',
        meta: { name: 'review-changes', description: 'smoke' },
        parent,
        filename: '/tmp/review-changes.workflow.json',
        args: { gate: 'retry later' },
      })).resolves.toEqual({
        ok: true,
        status: 'would-pause',
        value: 'would pause: retry later',
        note: VALIDATION_NOTE,
      })

      await expect(supervisor.validate({
        script: 'await pause("again")',
        meta: { name: 'review-changes', description: 'smoke' },
        parent,
        filename: '/tmp/review-changes.workflow.json',
        args: { gate: 'would pause (back_off): retry later' },
      })).resolves.toEqual({
        ok: true,
        status: 'would-pause',
        value: 'would pause: retry later',
        note: VALIDATION_NOTE,
      })

      expect(store.inserted).toEqual([])
      expect(starts()).toBe(0)
    } finally {
      await supervisor.dispose()
    }
  })

  it('propagates caller cancellation without creating storage residue', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-supervisor-validate-abort-'))
    roots.push(root)
    const store = new MemoryStore()
    const controller = new AbortController()
    const supervisor = new WorkflowSupervisor({
      workflowEngine: {
        start() { throw new Error('validate must not start') },
        async validate({ signal }: { signal?: AbortSignal }) {
          controller.abort()
          signal?.throwIfAborted()
        },
      },
      on: () => () => undefined,
      emit: () => undefined,
      logger: { warn: () => undefined },
      workflows: { save: async () => ({ path: '/tmp/unused' }) },
      workflowStorage: { layout: scratchLayout() },
    }, { defaultAgentBudget: 8, maxAgentBudget: 8, maxMembersPerRun: 8 }, store)
    await supervisor.initialize()
    try {
      await expect(supervisor.validate({
        script: 'return 1',
        meta: { name: 'review-changes', description: 'smoke' },
        parent: { session: { id: 'session-validate' } },
        filename: '<inline workflow>',
        signal: controller.signal,
      })).rejects.toThrow()
      expect(store.inserted).toEqual([])
    } finally {
      await supervisor.dispose()
    }
  })
})
