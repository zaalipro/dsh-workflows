import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { FileWorkflowRunStore } from '../src/supervisor/storage/manifest-store.js'
import type {
  WorkflowRunDetailPayloadV2,
  WorkflowRunHeadDraftV2,
  WorkflowRunHeadRecord,
} from '../src/supervisor/storage/manifest-types.js'

const sessionId = 'retention-session'
const script = 'return null\n'
const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

function options(runsRoot: string, retained = 2) {
  return {
    runsRoot,
    maxManifestBytes: 8_388_608,
    maxRunDetailsBytes: 33_554_432,
    maxRunStoreBytes: 16_777_216,
    maxRetainedRunsPerSession: retained,
    maxWorkflowNamesPerSession: 8,
    maxMembersPerRun: 4,
    maxRecoveryEntries: 64,
  }
}

function draft(): { readonly head: WorkflowRunHeadDraftV2; readonly detail: WorkflowRunDetailPayloadV2 } {
  return {
    head: {
      status: 'running',
      budget: { total: 4, spent: 0, remaining: 4 },
      memberCounts: { total: 0, running: 0, completed: 0, failed: 0, cancelled: 0 },
      startedAt: 10,
      detailRevision: 1,
      membersRevision: 1,
      logsRevision: 1,
      resultRevision: 0,
      artifactsRevision: 0,
      executionAvailable: true,
    },
    detail: { members: [], logs: [], result: { state: 'pending' }, artifacts: [] },
  }
}

function withoutDurable(head: WorkflowRunHeadRecord, patch: Record<string, unknown> = {}) {
  const { detail: _detail, completionNotice: _notice, scriptPath: _scriptPath, ...durable } = head
  const result = { ...durable, ...patch }
  for (const [key, value] of Object.entries(result)) if (value === undefined) delete result[key]
  return result
}

async function deliver(store: FileWorkflowRunStore, head: WorkflowRunHeadRecord, settledAt: number) {
  const terminal = await store.commitTerminalAndClaimNotice({
    sessionId,
    runId: head.runId,
    expectedRevision: head.revision,
    head: withoutDurable(head, {
      status: 'completed',
      stopReason: 'completed',
      settledAt,
      executionAvailable: false,
      saveAvailable: false,
      allowedActions: [],
      memberCounts: { total: 0, running: 0, completed: 0, failed: 0, cancelled: 0 },
    }),
  })
  if (terminal.completionNotice.state !== 'claimed') throw new Error('expected claimed notice')
  return store.finalizeCompletionNotice(sessionId, terminal.runId, terminal.revision, {
    state: 'delivered',
    claimId: terminal.completionNotice.claimId,
    processEpoch: terminal.completionNotice.processEpoch,
    claimedAt: terminal.completionNotice.claimedAt,
    finalizedAt: terminal.completionNotice.claimedAt + 1,
    lane: 'followup',
  })
}

describe('workflow storage retention', () => {
  it('evicts oldest delivered terminal rows into quarantine and keeps ordinals', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-storage-retention-'))
    roots.push(root)
    const runsRoot = join(root, 'runs')
    const store = new FileWorkflowRunStore(options(runsRoot, 2))
    await store.initialize()
    try {
      const first = await store.insertWithNextDisplayName(
        { sessionId, name: 'retain', runId: 'run-one', script },
        () => draft(),
      )
      const second = await store.insertWithNextDisplayName(
        { sessionId, name: 'retain', runId: 'run-two', script },
        () => draft(),
      )
      await deliver(store, first, 100)
      await deliver(store, second, 200)
      const third = await store.insertWithNextDisplayName(
        { sessionId, name: 'retain', runId: 'run-three', script },
        () => draft(),
      )
      const rows = await store.readSession(sessionId)
      expect(rows.map(row => row.runId).sort()).toEqual(['run-three', 'run-two'].sort())
      expect(rows.some(row => row.runId === first.runId)).toBe(false)
      expect(third.displayName).toBe('retain-3')
      expect(await readdir(join(runsRoot, 'runs'))).not.toContain(first.runDirectory)
      expect(await readdir(join(runsRoot, 'quarantine'))).toEqual([])
    } finally {
      await store.dispose()
    }
  })

  it('pins claimed terminal rows against eviction', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-storage-retention-claim-'))
    roots.push(root)
    const store = new FileWorkflowRunStore(options(join(root, 'runs'), 1))
    await store.initialize()
    try {
      const live = await store.insertWithNextDisplayName(
        { sessionId, name: 'pinned', runId: 'run-pinned', script },
        () => draft(),
      )
      await store.commitTerminalAndClaimNotice({
        sessionId,
        runId: live.runId,
        expectedRevision: live.revision,
        head: withoutDurable(live, {
          status: 'completed',
          stopReason: 'completed',
          settledAt: 50,
          executionAvailable: false,
          allowedActions: [],
          memberCounts: { total: 0, running: 0, completed: 0, failed: 0, cancelled: 0 },
        }),
      })
      await expect(store.insertWithNextDisplayName(
        { sessionId, name: 'pinned', runId: 'run-next', script },
        () => draft(),
      )).rejects.toMatchObject({ code: 'WORKFLOW_STORAGE_LIMIT' })
      const rows = await store.readSession(sessionId)
      expect(rows).toHaveLength(1)
      expect(rows[0]?.runId).toBe('run-pinned')
      expect(rows[0]?.completionNotice.state).toBe('claimed')
    } finally {
      await store.dispose()
    }
  })
})
