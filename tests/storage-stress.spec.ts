import { spawn } from 'node:child_process'
import { link as createHardLink, mkdir, mkdtemp, readFile, readdir, rm, symlink, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

import { resolveWorkflowPackageConfig } from '../src/config.js'
import {
  acquireWorkflowStorageLease,
  openWorkflowStorageAnchor,
} from '../src/supervisor/storage/lease.js'
import { openWorkflowStorage } from '../src/supervisor/storage/index.js'
import { FileWorkflowRunStore } from '../src/supervisor/storage/manifest-store.js'
import { inventoryWorkflowStorage } from '../src/supervisor/storage/recovery.js'
import { openRunScratch } from '../src/supervisor/storage/run-files.js'
import type {
  WorkflowRunDetailPayloadV2,
  WorkflowRunHeadDraftV2,
  WorkflowRunHeadRecord,
  WorkflowRunMemberCounts,
} from '../src/supervisor/storage/manifest-types.js'

const sessionId = 'storage-stress-session'
const script = 'return { stable: true }\n'
const temporaryRoots: string[] = []

afterEach(async () => {
  // The package itself never recursively removes a descriptor-rooted tree.
  // Test-owned temporary fixtures are safe to remove after every lease has
  // been released, and keeping this cleanup here prevents a failed assertion
  // from accumulating large trees across focused reruns.
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

function counts(overrides: Partial<WorkflowRunMemberCounts> = {}): WorkflowRunMemberCounts {
  return {
    total: 2,
    running: 2,
    completed: 0,
    failed: 0,
    cancelled: 0,
    ...overrides,
  }
}

function detail(overrides: Partial<WorkflowRunDetailPayloadV2> = {}): WorkflowRunDetailPayloadV2 {
  return {
    members: [
      { memberId: 'member-alpha', seq: 1, label: 'alpha', status: 'running', outcome: 'pending', startedAt: 10 },
      { memberId: 'member-beta', seq: 2, label: 'beta', status: 'running', outcome: 'pending', startedAt: 11 },
    ],
    logs: [{ index: 0, text: 'started' }],
    result: { state: 'not-produced' },
    ...overrides,
  }
}

function draft(identity: { readonly displayName: string; readonly numberedHandle: boolean; readonly runDirectory: string }): {
  readonly head: WorkflowRunHeadDraftV2
  readonly detail: WorkflowRunDetailPayloadV2
} {
  void identity
  return {
    head: {
      status: 'running',
      phase: 'collect',
      budget: { total: 8, spent: 0, remaining: 8 },
      memberCounts: counts(),
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
    detail: detail(),
  }
}

function config(root: string, overrides: Record<string, unknown> = {}) {
  return resolveWorkflowPackageConfig({
    dshHome: join(root, 'home'),
    runsRoot: join(root, 'runs'),
    definitionWatch: false,
    maxRetainedRunsPerSession: 8,
    maxWorkflowNamesPerSession: 8,
    maxMembersPerRun: 4,
    ...overrides,
  }, join(root, 'home'))
}

async function fixture(overrides: Record<string, unknown> = {}) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-storage-stress-'))
  temporaryRoots.push(root)
  const storage = await openWorkflowStorage(config(root, overrides))
  return { root, storage }
}

function withoutDurableIdentity(head: WorkflowRunHeadRecord, patch: Record<string, unknown> = {}): any {
  const { detail: _detail, completionNotice: _notice, scriptPath: _scriptPath, ...durable } = head
  const result = { ...durable, ...patch }
  for (const [key, value] of Object.entries(result)) if (value === undefined) delete result[key]
  return result
}

async function insert(storage: Awaited<ReturnType<typeof openWorkflowStorage>>, runId: string, name = 'storage-check') {
  return storage.store.insertWithNextDisplayName(
    { sessionId, name, runId, script },
    identity => draft(identity),
  )
}

describe('workflow storage and lease stress', () => {
  it('rejects an impossible global-quota insertion before staging, publication, or the durable callback', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-storage-preflight-'))
    temporaryRoots.push(root)
    const runsRoot = join(root, 'runs')
    const store = new FileWorkflowRunStore({
      runsRoot,
      maxManifestBytes: 8_388_608,
      maxRunDetailsBytes: 33_554_432,
      maxRunStoreBytes: 1,
      maxRetainedRunsPerSession: 8,
      maxWorkflowNamesPerSession: 8,
      maxMembersPerRun: 4,
      maxRecoveryEntries: 64,
    })
    await store.initialize()
    let durableCalls = 0
    try {
      await expect(store.insertWithNextDisplayName(
        { sessionId, name: 'storage-check', runId: 'run-over-global-limit', script, onDurable: () => { durableCalls += 1 } },
        identity => draft(identity),
      )).rejects.toMatchObject({ code: 'WORKFLOW_STORAGE_LIMIT' })
      expect(durableCalls).toBe(0)
      expect(await readdir(join(runsRoot, 'staging'))).toEqual([])
      expect(await readdir(join(runsRoot, 'runs'))).toEqual([])
      expect(await readdir(join(runsRoot, 'sessions'))).toEqual([])
      expect(await store.readSession(sessionId)).toEqual([])
    } finally {
      await store.dispose()
    }
  })

  it('reserves global quota before publishing a replacement detail or head revision', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-storage-commit-preflight-'))
    temporaryRoots.push(root)
    const runsRoot = join(root, 'runs')
    const options = {
      runsRoot,
      maxManifestBytes: 8_388_608,
      maxRunDetailsBytes: 33_554_432,
      maxRunStoreBytes: 16_777_216,
      maxRetainedRunsPerSession: 8,
      maxWorkflowNamesPerSession: 8,
      maxMembersPerRun: 4,
      maxRecoveryEntries: 64,
    }
    const store = new FileWorkflowRunStore(options)
    await store.initialize()
    try {
      const initial = await store.insertWithNextDisplayName(
        { sessionId, name: 'storage-check', runId: 'run-commit-over-global-limit', script },
        identity => draft(identity),
      )
      options.maxRunStoreBytes = 1
      await expect(store.commitRun({
        sessionId,
        runId: initial.runId,
        expectedRevision: initial.revision,
        head: withoutDurableIdentity(initial, { phase: 'would-not-publish' }),
        detail: detail({ logs: [{ index: 0, text: 'replacement' }] }),
      })).rejects.toMatchObject({ code: 'WORKFLOW_STORAGE_LIMIT' })
      const [retained] = await store.readSession(sessionId)
      expect(retained.revision).toBe(initial.revision)
      expect(retained.detail).toEqual(initial.detail)
      expect(retained.phase).toBe(initial.phase)
      expect(await readdir(join(runsRoot, 'runs', initial.runDirectory, 'details'))).toEqual([`${initial.detail.id}.json`])
    } finally {
      await store.dispose()
    }
  })

  it('holds one lifetime lease, rejects contention, and reopens after release', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-storage-lease-'))
    temporaryRoots.push(root)
    const runsRoot = join(root, 'runs')

    if (process.platform === 'win32') {
      await expect(openWorkflowStorageAnchor({ runsRoot })).rejects.toMatchObject({
        code: 'WORKFLOW_STORAGE_UNSUPPORTED',
        message: `safe workflow storage is unavailable on ${process.platform}`,
      })
      return
    }

    const firstAnchor = await openWorkflowStorageAnchor({ runsRoot })
    expect(await readdir(runsRoot)).toEqual(['.workflow-storage.lock'])
    const firstLease = await acquireWorkflowStorageLease(firstAnchor)
    let contenderAnchor: Awaited<ReturnType<typeof openWorkflowStorageAnchor>> | undefined
    try {
      contenderAnchor = await openWorkflowStorageAnchor({ runsRoot })
      await expect(acquireWorkflowStorageLease(contenderAnchor)).rejects.toMatchObject({
        code: 'WORKFLOW_STORAGE_OWNED',
        message: 'workflow storage root is already owned by another live process',
      })
      contenderAnchor = undefined // acquire closes the anchor on a failed lock
      await firstLease.release()

      const reopenedAnchor = await openWorkflowStorageAnchor({ runsRoot })
      const reopenedLease = await acquireWorkflowStorageLease(reopenedAnchor)
      await reopenedLease.assertCurrent()
      await reopenedLease.release()
    } finally {
      await contenderAnchor?.close().catch(() => undefined)
      await firstLease.release().catch(() => undefined)
      await firstAnchor.close().catch(() => undefined)
    }
  })

  it('publishes immutable script/detail snapshots, reserves ordinals, and finalizes one notice', async () => {
    if (process.platform === 'win32') {
      const root = await mkdtemp(join(tmpdir(), 'dsh-storage-win-'))
      temporaryRoots.push(root)
      await expect(openWorkflowStorage(config(root))).rejects.toMatchObject({ code: 'WORKFLOW_STORAGE_UNSUPPORTED' })
      return
    }

    const { root, storage } = await fixture()
    try {
      const first = await insert(storage, 'run-storage-one')
      const second = await insert(storage, 'run-storage-two')
      expect(first.displayName).toBe('storage-check')
      expect(second.displayName).toBe('storage-check-2')
      expect(first.numberedHandle).toBe(false)
      expect(second.numberedHandle).toBe(true)
      expect(first.runDirectory).toMatch(/^[a-f0-9]{32}$/u)
      expect(first.scriptPath).toBe(join(storage.anchor.root, 'runs', first.runDirectory, 'script.js'))
      expect(await readFile(first.scriptPath!, 'utf8')).toBe(script)

      const initialDetails = await storage.store.readDetails('run-storage-one', { kind: 'members' })
      expect(initialDetails.value).toEqual(detail().members)

      const live = await storage.store.commitRun({
        sessionId,
        runId: first.runId,
        expectedRevision: first.revision,
        head: withoutDurableIdentity(first, {
          phase: 'report',
          memberCounts: counts({ running: 0, completed: 2 }),
        }),
        detail: detail({
          members: [
            { memberId: 'member-alpha', seq: 1, label: 'alpha', status: 'completed', outcome: 'available', value: 'alpha', startedAt: 10, settledAt: 20 },
            { memberId: 'member-beta', seq: 2, label: 'beta', status: 'completed', outcome: 'available', value: null, startedAt: 11, settledAt: 21 },
          ],
          result: { state: 'available', value: { alpha: 'alpha', beta: null } },
        }),
      })
      expect(live.revision).toBe(first.revision + 1)
      expect(live.detail.id).not.toBe(first.detail.id)
      await expect(storage.store.commitRun({
        sessionId,
        runId: first.runId,
        expectedRevision: first.revision,
        head: withoutDurableIdentity(first),
      })).rejects.toMatchObject({ code: 'WORKFLOW_STALE_REVISION' })

      const terminal = await storage.store.commitTerminalAndClaimNotice({
        sessionId,
        runId: first.runId,
        expectedRevision: live.revision,
        head: withoutDurableIdentity(live, {
          status: 'completed',
          stopReason: 'completed',
          settledAt: 30,
          phase: undefined,
          memberCounts: counts({ running: 0, completed: 2 }),
          executionAvailable: false,
          saveAvailable: false,
          allowedActions: [],
          terminalPreview: 'completed',
        }),
        detail: detail({
          members: [
            { memberId: 'member-alpha', seq: 1, label: 'alpha', status: 'completed', outcome: 'available', value: 'alpha', startedAt: 10, settledAt: 20 },
            { memberId: 'member-beta', seq: 2, label: 'beta', status: 'completed', outcome: 'available', value: null, startedAt: 11, settledAt: 21 },
          ],
          result: { state: 'available', value: { alpha: 'alpha', beta: null } },
        }),
      })
      expect(terminal.status).toBe('completed')
      expect(terminal.completionNotice.state).toBe('claimed')
      if (terminal.completionNotice.state !== 'claimed') throw new Error('expected a claimed notice')

      const delivered = await storage.store.finalizeCompletionNotice(
        sessionId,
        first.runId,
        terminal.revision,
        {
          state: 'delivered',
          claimId: terminal.completionNotice.claimId,
          processEpoch: terminal.completionNotice.processEpoch,
          claimedAt: terminal.completionNotice.claimedAt,
          finalizedAt: terminal.completionNotice.claimedAt + 1,
          lane: 'followup',
        },
      )
      expect(delivered.completionNotice).toMatchObject({ state: 'delivered', lane: 'followup' })
      expect((await storage.store.readDetails(first.runId, { kind: 'result' })).value).toMatchObject({
        state: 'available', value: { alpha: 'alpha', beta: null },
      })
    } finally {
      await storage.dispose()
    }
  })

  it('recovers active rows as interrupted and preserves truthful member outcomes', async () => {
    if (process.platform === 'win32') {
      const root = await mkdtemp(join(tmpdir(), 'dsh-storage-win-'))
      temporaryRoots.push(root)
      await expect(openWorkflowStorage(config(root))).rejects.toMatchObject({ code: 'WORKFLOW_STORAGE_UNSUPPORTED' })
      return
    }

    const root = await mkdtemp(join(tmpdir(), 'dsh-storage-recovery-'))
    temporaryRoots.push(root)
    const resolved = config(root)
    const owner = await openWorkflowStorage(resolved)
    const active = await insert(owner, 'run-recovered')
    await owner.dispose()

    const reopened = await openWorkflowStorage(resolved)
    try {
      const [row] = await reopened.store.readSession(sessionId)
      expect(row).toMatchObject({
        runId: active.runId,
        status: 'interrupted',
        stopReason: 'interrupted',
        error: 'Process exited before workflow settlement.',
        executionAvailable: false,
        saveAvailable: false,
        allowedActions: [],
        completionNotice: { state: 'abandoned', reason: 'process-lost' },
      })
      const members = await reopened.store.readDetails(active.runId, { kind: 'members' })
      expect(members.value).toEqual(expect.arrayContaining([
        expect.objectContaining({ memberId: 'member-alpha', status: 'cancelled', outcome: 'not-produced' }),
        expect.objectContaining({ memberId: 'member-beta', status: 'cancelled', outcome: 'not-produced' }),
      ]))
      const recovered = await reopened.store.initialize()
      expect(recovered).toHaveLength(1)
      expect(recovered[0]).toMatchObject({
        runId: active.runId,
        status: 'interrupted',
        sessionId,
        executionAvailable: false,
      })
      expect(reopened.recovered).toEqual(recovered)
    } finally {
      await reopened.dispose()
    }
  })

  it('enforces scratch names, quotas, and no-follow hard-link/symlink checks', async () => {
    if (process.platform === 'win32') {
      const root = await mkdtemp(join(tmpdir(), 'dsh-storage-win-'))
      temporaryRoots.push(root)
      await expect(openWorkflowStorage(config(root))).rejects.toMatchObject({ code: 'WORKFLOW_STORAGE_UNSUPPORTED' })
      return
    }

    const { storage } = await fixture()
    try {
      const run = await insert(storage, 'run-scratch')
      const limits = {
        maxOperations: 32,
        maxPendingOperations: 8,
        maxFiles: 4,
        maxFileBytes: 16,
        maxTotalBytes: 32,
      }
      const scratch = await openRunScratch(storage.layout, run.runDirectory, limits)
      await scratch.write('alpha.txt', 'alpha')
      expect(await scratch.read('alpha.txt')).toBe('alpha')
      expect(await scratch.list()).toEqual(['alpha.txt'])
      for (const name of ['', '.', '..', '../outside', 'nested/name']) {
        await expect(scratch.read(name)).rejects.toMatchObject({ code: 'WORKFLOW_STORAGE_UNSAFE' })
      }
      await scratch.dispose()

      const scratchPath = join(storage.layout.runs.path, run.runDirectory, 'scratch')
      const outside = join(storage.anchor.root, 'outside.txt')
      await writeFile(outside, 'outside', { mode: 0o600 })
      await createHardLink(join(scratchPath, 'alpha.txt'), join(scratchPath, 'hard-link.txt'))
      const hardLinked = await openRunScratch(storage.layout, run.runDirectory, limits)
      await expect(hardLinked.list()).rejects.toMatchObject({ code: 'WORKFLOW_STORAGE_UNSAFE' })
      await hardLinked.dispose()
      await unlink(join(scratchPath, 'hard-link.txt'))

      await symlink(outside, join(scratchPath, 'link.txt'))
      const linked = await openRunScratch(storage.layout, run.runDirectory, limits)
      await expect(linked.list()).rejects.toMatchObject({ code: 'WORKFLOW_STORAGE_UNSAFE' })
      await linked.dispose()
      await unlink(join(scratchPath, 'link.txt'))

      const quota = await openRunScratch(storage.layout, run.runDirectory, {
        maxOperations: 8,
        maxPendingOperations: 4,
        maxFiles: 1,
        maxFileBytes: 5,
        maxTotalBytes: 5,
      })
      // The existing file is inventoried, so a second name exceeds the file
      // quota; replacing it still exercises the per-file byte boundary.
      await expect(quota.write('another.txt', 'x')).rejects.toMatchObject({ code: 'WORKFLOW_STORAGE_LIMIT' })
      await expect(quota.write('alpha.txt', '123456')).rejects.toMatchObject({ code: 'WORKFLOW_STORAGE_LIMIT' })
      await quota.dispose()
      await unlink(outside)
    } finally {
      await storage.dispose()
    }
  })

  it('counts the shared recovery inventory exactly and rejects unsafe links before recovery', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-storage-inventory-'))
    temporaryRoots.push(root)
    const layoutRoot = join(root, 'runs')
    for (const category of ['sessions', 'runs', 'staging', 'quarantine']) await mkdir(join(layoutRoot, category), { recursive: true, mode: 0o700 })

    for (let index = 0; index < 4_096; index += 1) {
      await writeFile(join(layoutRoot, 'staging', `entry-${index.toString(16).padStart(4, '0')}`), '', { mode: 0o600 })
    }
    expect(await inventoryWorkflowStorage({ root: layoutRoot }, { maxRecoveryEntries: 4_096 })).toBe(4_096)
    await writeFile(join(layoutRoot, 'staging', 'entry-over-limit'), '', { mode: 0o600 })
    await expect(inventoryWorkflowStorage({ root: layoutRoot }, { maxRecoveryEntries: 4_096 })).rejects.toMatchObject({
      code: 'WORKFLOW_STORAGE_UNSAFE',
      message: `workflow storage path "${layoutRoot}" is unsafe: recovery scan exceeds 4096 entries`,
    })

    const target = join(root, 'outside.txt')
    await writeFile(target, 'outside', { mode: 0o600 })
    await symlink(target, join(layoutRoot, 'quarantine', 'link'))
    await expect(inventoryWorkflowStorage({ root: layoutRoot }, { maxRecoveryEntries: 4_096 })).rejects.toMatchObject({
      code: 'WORKFLOW_STORAGE_UNSAFE',
    })
  })

  it('rejects a second Host process, reacquires after SIGKILL, and quarantines leftover staging', async () => {
    if (process.platform === 'win32') {
      const root = await mkdtemp(join(tmpdir(), 'dsh-storage-win-process-'))
      temporaryRoots.push(root)
      await expect(openWorkflowStorage(config(root))).rejects.toMatchObject({
        code: 'WORKFLOW_STORAGE_UNSUPPORTED',
        message: `safe workflow storage is unavailable on ${process.platform}`,
      })
      return
    }

    const root = await mkdtemp(join(tmpdir(), 'dsh-storage-process-'))
    temporaryRoots.push(root)
    const resolved = config(root)
    const children: Array<ReturnType<typeof spawn>> = []
    const stopChild = (child: ReturnType<typeof spawn> | undefined, signal: NodeJS.Signals = 'SIGKILL'): void => {
      if (child === undefined || child.exitCode !== null || child.signalCode !== null) return
      child.kill(signal)
    }
    const owner = await openWorkflowStorage(resolved)
    const processConfig = { dshHome: resolved.dshHome, runsRoot: owner.anchor.root }
    let first: Awaited<ReturnType<typeof insert>>
    try {
      first = await insert(owner, 'run-owned')
      expect(first.displayName).toBe('storage-check')

      const contender = spawnStorageProcess(processConfig, 'contend')
      children.push(contender.child)
      const contended = await contender.done
      expect(contended.code).toBe(2)
      expect(contended.stdout.trim()).toBe('WORKFLOW_STORAGE_OWNED')
      expect(contended.stderr).toContain('workflow storage root is already owned by another live process')
    } finally {
      await owner.dispose().catch(() => undefined)
    }
    try {

      const holder = spawnStorageProcess(processConfig, 'hold')
      children.push(holder.child)
      await holder.ready
      expect(holder.child.exitCode, 'holder must keep the kernel lease').toBeNull()
      const lockProbe = spawn(process.execPath, ['--input-type=module', '-e', `
        import { constants } from 'node:fs'
        import { open } from 'node:fs/promises'
        const module = await import('fs-native-extensions')
        const tryLock = module.tryLock ?? module.default?.tryLock
        const file = await open(${JSON.stringify(join(processConfig.runsRoot, '.workflow-storage.lock'))}, constants.O_RDWR)
        try {
          process.stdout.write(tryLock(file.fd) ? 'locked' : 'owned')
        } finally {
          await file.close()
        }
      `], { cwd: resolve(import.meta.dirname, '..'), stdio: ['ignore', 'pipe', 'pipe'] })
      children.push(lockProbe)
      const probeStdout = await new Promise<string>((resolveProbe, reject) => {
        const chunks: Buffer[] = []
        lockProbe.stdout?.on('data', chunk => chunks.push(Buffer.from(chunk)))
        lockProbe.stdout?.on('end', () => resolveProbe(Buffer.concat(chunks).toString('utf8')))
        lockProbe.stdout?.on('error', reject)
        lockProbe.once('exit', code => {
          if (code !== 0) reject(new Error(`lock probe exited ${code}`))
        })
      })
      expect(probeStdout).toBe('owned')
      const duringHold = spawnStorageProcess(processConfig, 'contend')
      children.push(duringHold.child)
      const blocked = await duringHold.done
      expect(blocked.stdout.trim(), blocked.stderr).toBe('WORKFLOW_STORAGE_OWNED')
      expect(blocked.code).toBe(2)
      expect(holder.child.exitCode).toBeNull()

      stopChild(holder.child, 'SIGKILL')
      const killed = await holder.done
      expect(killed.signal === 'SIGKILL' || killed.code !== 0).toBe(true)

      const recovered = await openWorkflowStorage(resolved)
      try {
        await recovered.lease.assertCurrent()
        const [row] = await recovered.store.readSession(sessionId)
        expect(row).toMatchObject({
          runId: first.runId,
          status: 'interrupted',
          error: 'Process exited before workflow settlement.',
          executionAvailable: false,
        })
        const stagingResidue = 'a'.repeat(32)
        await mkdir(join(recovered.anchor.root, 'staging', stagingResidue), { recursive: true, mode: 0o700 })
        await writeFile(join(recovered.anchor.root, 'staging', stagingResidue, 'script.js'), 'stale', { mode: 0o600 })
      } finally {
        await recovered.dispose()
      }

      const cleaned = await openWorkflowStorage(resolved)
      try {
        expect(await readdir(join(cleaned.anchor.root, 'staging'))).toEqual([])
        expect(await readdir(join(cleaned.anchor.root, 'quarantine'))).toEqual([])
      } finally {
        await cleaned.dispose()
      }
    } finally {
      for (const child of children) stopChild(child)
    }
  }, 30_000)

  it('fails closed when a run tree is replaced by a symlink after publication', async () => {
    if (process.platform === 'win32') {
      const root = await mkdtemp(join(tmpdir(), 'dsh-storage-win-link-'))
      temporaryRoots.push(root)
      await expect(openWorkflowStorage(config(root))).rejects.toMatchObject({ code: 'WORKFLOW_STORAGE_UNSUPPORTED' })
      return
    }

    const { storage } = await fixture()
    try {
      const live = await insert(storage, 'run-replaced')
      const runPath = join(storage.anchor.root, 'runs', live.runDirectory)
      const outside = join(storage.anchor.root, 'outside-run')
      await rm(runPath, { recursive: true, force: true })
      await mkdir(outside, { recursive: true, mode: 0o700 })
      await symlink(outside, runPath)
      await expect(storage.store.commitRun({
        sessionId,
        runId: live.runId,
        expectedRevision: live.revision,
        head: withoutDurableIdentity(live, { phase: 'must-not-commit' }),
      })).rejects.toMatchObject({ code: 'WORKFLOW_STORAGE_UNSAFE' })
      const [retained] = await storage.store.readSession(sessionId)
      expect(retained.revision).toBe(live.revision)
      expect(retained.phase).toBe(live.phase)
    } finally {
      await storage.dispose()
    }
  })
})

function spawnStorageProcess(
  resolved: { readonly dshHome: string; readonly runsRoot: string },
  mode: 'contend' | 'hold',
): {
  readonly child: ReturnType<typeof spawn>
  readonly ready: Promise<void>
  readonly done: Promise<{ code: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string }>
} {
  const packageRoot = resolve(import.meta.dirname, '..')
  const configUrl = pathToFileURL(join(packageRoot, 'lib/types/config.js')).href
  const storageUrl = pathToFileURL(join(packageRoot, 'lib/types/supervisor/storage/index.js')).href
  const child = spawn(process.execPath, ['--input-type=module', '-e', `
    import { resolveWorkflowPackageConfig } from ${JSON.stringify(configUrl)}
    import { openWorkflowStorage } from ${JSON.stringify(storageUrl)}
    const config = resolveWorkflowPackageConfig({
      dshHome: ${JSON.stringify(resolved.dshHome)},
      runsRoot: ${JSON.stringify(resolved.runsRoot)},
      definitionWatch: false,
    }, ${JSON.stringify(resolved.dshHome)})
    const mode = ${JSON.stringify(mode)}
    try {
      const storage = await openWorkflowStorage(config)
      globalThis.__dshWorkflowStorageHold = storage
      process.stdout.write('ready\\n')
      if (mode === 'contend') {
        await storage.dispose()
        process.exit(0)
      }
      setInterval(() => {
        void storage.lease.assertCurrent().catch(() => {})
        void storage.anchor.file.stat().catch(() => {})
      }, 200)
      await new Promise(() => {})
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'ERROR'
      process.stdout.write(code + '\\n')
      process.stderr.write((error instanceof Error ? error.message : String(error)) + '\\n')
      process.exit(code === 'WORKFLOW_STORAGE_OWNED' ? 2 : 1)
    }
  `], { cwd: packageRoot, stdio: ['ignore', 'pipe', 'pipe'] })

  let stdout = ''
  let stderr = ''
  child.stdout?.setEncoding('utf8')
  child.stderr?.setEncoding('utf8')
  child.stdout?.on('data', chunk => { stdout += chunk })
  child.stderr?.on('data', chunk => { stderr += chunk })

  const ready = new Promise<void>((resolveReady, reject) => {
    const timer = setTimeout(() => reject(new Error(`storage child did not become ready: ${stdout}\n${stderr}`)), 8_000)
    timer.unref?.()
    const succeed = (): void => {
      clearTimeout(timer)
      child.stdout?.off('data', onData)
      resolveReady()
    }
    const onData = (chunk: string): void => {
      if (mode === 'hold' && chunk.includes('ready')) succeed()
      if (mode === 'contend' && (chunk.includes('WORKFLOW_STORAGE_OWNED') || chunk.includes('ready'))) succeed()
    }
    child.stdout?.on('data', onData)
    child.once('exit', (code, signal) => {
      if (mode === 'hold') {
        clearTimeout(timer)
        reject(new Error(`holder exited ${signal ?? code}: ${stdout}\n${stderr}`))
        return
      }
      succeed()
    })
  })

  const done = new Promise<{ code: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string }>(resolveDone => {
    child.once('exit', (code, signal) => {
      resolveDone({ code, signal, stdout, stderr })
    })
  })

  return { child, ready, done }
}
