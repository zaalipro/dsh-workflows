import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { WorkflowSupervisor } from '../src/supervisor/index.js'
import { openWorkflowStorage } from '../src/supervisor/storage/index.js'
import { inventoryWorkflowStorage } from '../src/supervisor/storage/recovery.js'
import { resolveWorkflowPackageConfig } from '../src/config.js'
import type {
  WorkflowRunDetailPayloadV2,
  WorkflowRunHeadDraftV2,
} from '../src/supervisor/storage/manifest-types.js'

const sessionId = 'recovery-session'
const script = 'return { recovered: true }\n'
const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

function config(root: string) {
  return resolveWorkflowPackageConfig({
    dshHome: join(root, 'home'),
    runsRoot: join(root, 'runs'),
    definitionWatch: false,
    maxRetainedRunsPerSession: 8,
    maxWorkflowNamesPerSession: 8,
    maxMembersPerRun: 4,
    maxRecoveryEntries: 64,
  }, join(root, 'home'))
}

function draft(): { readonly head: WorkflowRunHeadDraftV2; readonly detail: WorkflowRunDetailPayloadV2 } {
  return {
    head: {
      status: 'running',
      budget: { total: 4, spent: 0, remaining: 4 },
      memberCounts: { total: 1, running: 1, completed: 0, failed: 0, cancelled: 0 },
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
    detail: {
      members: [{ memberId: 'member-alpha', seq: 1, label: 'alpha', status: 'running', outcome: 'pending', startedAt: 10 }],
      logs: [],
      result: { state: 'pending' },
      artifacts: [],
    },
  }
}

function parent() {
  return { session: { id: sessionId, header: { cwd: '/tmp' } } }
}

describe('workflow storage recovery', () => {
  it('rewrites active rows to Interrupted and hydrates supervisor inspection maps', async () => {
    if (process.platform === 'win32') return
    const root = await mkdtemp(join(tmpdir(), 'dsh-storage-recovery-'))
    roots.push(root)
    const resolved = config(root)
    const owner = await openWorkflowStorage(resolved)
    const active = await owner.store.insertWithNextDisplayName(
      { sessionId, name: 'recover-me', runId: 'run-recover', script },
      () => draft(),
    )
    await owner.dispose()

    const reopened = await openWorkflowStorage(resolved)
    try {
      expect(reopened.recovered).toHaveLength(1)
      expect(reopened.recovered[0]).toMatchObject({
        runId: active.runId,
        displayName: 'recover-me',
        status: 'interrupted',
        stopReason: 'interrupted',
        error: 'Process exited before workflow settlement.',
        executionAvailable: false,
        saveAvailable: false,
        sessionId,
        completionNotice: { state: 'abandoned', reason: 'process-lost' },
      })
      expect(await reopened.store.initialize()).toEqual(reopened.recovered)

      const members = await reopened.store.readDetails(active.runId, { kind: 'members' })
      expect(members.value).toEqual([
        expect.objectContaining({ memberId: 'member-alpha', status: 'cancelled', outcome: 'not-produced' }),
      ])

      const bus = { on: () => () => undefined, emit: () => undefined, logger: { warn: () => undefined } }
      const supervisor = new WorkflowSupervisor({
        ...bus,
        workflowEngine: { start() { throw new Error('recovered rows must not start') } },
        workflows: { save: async () => ({ path: '/tmp/unused' }) },
        workflowStorage: { layout: reopened.layout },
        workflowStore: reopened.store,
      }, { defaultAgentBudget: 8, maxAgentBudget: 8, maxMembersPerRun: 8 }, reopened.store)
      await supervisor.initialize()
      await expect(supervisor.resume('recover-me', parent())).rejects.toMatchObject({
        code: 'WORKFLOW_INVALID_STATE',
        message: 'workflow "recover-me" was interrupted by process exit and cannot resume',
      })
      await expect(supervisor.save('recover-me', parent())).rejects.toMatchObject({
        code: 'WORKFLOW_INVALID_STATE',
        message: 'workflow "recover-me" cannot be saved after process interruption',
      })
      await supervisor.dispose()
    } finally {
      await reopened.dispose()
    }
  })

  it('fails the shared inventory before any Session rewrite when the scan exceeds the cap', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-storage-recovery-cap-'))
    roots.push(root)
    const layoutRoot = join(root, 'runs')
    for (const category of ['sessions', 'runs', 'staging', 'quarantine']) {
      await mkdir(join(layoutRoot, category), { recursive: true, mode: 0o700 })
    }
    await writeFile(join(layoutRoot, 'staging', 'one'), '', { mode: 0o600 })
    await writeFile(join(layoutRoot, 'staging', 'two'), '', { mode: 0o600 })
    await expect(inventoryWorkflowStorage({ root: layoutRoot }, { maxRecoveryEntries: 1 })).rejects.toMatchObject({
      code: 'WORKFLOW_STORAGE_UNSAFE',
      message: `workflow storage path "${layoutRoot}" is unsafe: recovery scan exceeds 1 entries`,
    })
  })
})
