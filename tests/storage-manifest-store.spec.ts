import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { FileWorkflowRunStore } from '../src/supervisor/storage/manifest-store.js'
import type {
  WorkflowRunDetailPayloadV2,
  WorkflowRunHeadDraftV2,
  WorkflowRunHeadRecord,
} from '../src/supervisor/storage/manifest-types.js'

const sessionId = 'manifest-store-session'
const script = 'return { ok: true }\n'
const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

function options(runsRoot: string) {
  return {
    runsRoot,
    maxManifestBytes: 8_388_608,
    maxRunDetailsBytes: 33_554_432,
    maxRunStoreBytes: 16_777_216,
    maxRetainedRunsPerSession: 8,
    maxWorkflowNamesPerSession: 8,
    maxMembersPerRun: 4,
    maxRecoveryEntries: 64,
  }
}

function draft(): { readonly head: WorkflowRunHeadDraftV2; readonly detail: WorkflowRunDetailPayloadV2 } {
  return {
    head: {
      status: 'running',
      budget: { total: 8, spent: 0, remaining: 8 },
      memberCounts: { total: 0, running: 0, completed: 0, failed: 0, cancelled: 0 },
      startedAt: 10,
      detailRevision: 1,
      membersRevision: 1,
      logsRevision: 1,
      resultRevision: 0,
      artifactsRevision: 0,
      executionAvailable: true,
      saveAvailable: true,
      allowedActions: ['pause', 'stop', 'save'],
    },
    detail: { members: [], logs: [], result: { state: 'pending' }, artifacts: [] },
  }
}

async function openStore() {
  const root = await mkdtemp(join(tmpdir(), 'dsh-manifest-store-'))
  roots.push(root)
  const runsRoot = join(root, 'runs')
  const store = new FileWorkflowRunStore(options(runsRoot))
  await store.initialize()
  return { store, runsRoot }
}

async function insert(store: FileWorkflowRunStore, runId: string, name: string) {
  return store.insertWithNextDisplayName({ sessionId, name, runId, script }, () => draft())
}

describe('workflow Session manifest store', () => {
  it('allocates name then name-2 and persists digit-suffixed kebab first handles', async () => {
    const { store } = await openStore()
    try {
      const first = await insert(store, 'run-audit', 'audit')
      const second = await insert(store, 'run-audit-2', 'audit')
      expect(first.displayName).toBe('audit')
      expect(first.numberedHandle).toBe(false)
      expect(second.displayName).toBe('audit-2')
      expect(second.numberedHandle).toBe(true)
      expect(await readFile(first.scriptPath!, 'utf8')).toBe(script)

      const model = await insert(store, 'run-gpt-4', 'gpt-4')
      expect(model).toMatchObject({ name: 'gpt-4', displayName: 'gpt-4', numberedHandle: false })
      const modelTwo = await insert(store, 'run-gpt-4-2', 'gpt-4')
      expect(modelTwo).toMatchObject({ name: 'gpt-4', displayName: 'gpt-4-2', numberedHandle: true })

      const review = await insert(store, 'run-review-2', 'review-2')
      expect(review).toMatchObject({ name: 'review-2', displayName: 'review-2', numberedHandle: false })
    } finally {
      await store.dispose()
    }
  })

  it('reloads digit-suffixed handles and skips a cross-name display collision', async () => {
    const { store, runsRoot } = await openStore()
    let review: WorkflowRunHeadRecord
    let collided: WorkflowRunHeadRecord
    try {
      await insert(store, 'run-review', 'review')
      await insert(store, 'run-review-second', 'review')
      collided = await insert(store, 'run-review-2-name', 'review-2')
      expect(collided.displayName).toBe('review-2-2')
      expect(collided.numberedHandle).toBe(true)
      review = collided
    } finally {
      await store.dispose()
    }

    const reopened = new FileWorkflowRunStore(options(runsRoot))
    try {
      const recovered = await reopened.initialize()
      expect(recovered.map(row => row.displayName).sort()).toEqual(['review', 'review-2', 'review-2-2'])
      const rows = await reopened.readSession(sessionId)
      expect(rows.map(row => row.displayName).sort()).toEqual(['review', 'review-2', 'review-2-2'])
      expect(rows.find(row => row.runId === review.runId)?.numberedHandle).toBe(true)
    } finally {
      await reopened.dispose()
    }
  })

  it('invokes onDurable only after the initial manifest row is committed', async () => {
    const { store } = await openStore()
    try {
      const seen: string[] = []
      const head = await store.insertWithNextDisplayName(
        { sessionId, name: 'durable-check', runId: 'run-durable', script, onDurable: row => { seen.push(row.runId) } },
        () => draft(),
      )
      expect(seen).toEqual(['run-durable'])
      expect(head.revision).toBe(1)
      const [row] = await store.readSession(sessionId)
      expect(row.runId).toBe('run-durable')
    } finally {
      await store.dispose()
    }
  })
})
