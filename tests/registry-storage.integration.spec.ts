import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readdir, readFile, rename, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { resolveWorkflowPackageConfig } from '../src/config.js'
import { checkWorkflowRegistryStorageInvariant } from '../src/invariant.js'
import { WorkflowRegistry } from '../src/registry/index.js'
import type { ChokidarFactory, ChokidarHandle } from '../src/registry/watchers.js'
import { openWorkflowStorage } from '../src/supervisor/storage/index.js'
import type {
  WorkflowRunDetailPayloadV2,
  WorkflowRunHeadDraftV2,
  WorkflowRunHeadRecord,
} from '../src/supervisor/storage/manifest-types.js'

const posixOnly = process.platform !== 'win32'
const sessionId = 'registry-storage-session'
const script = 'complete({ ok: true })\n'
const temps: string[] = []
const registries: WorkflowRegistry[] = []
const storages: Array<{ dispose(): Promise<void> }> = []

afterEach(async () => {
  await Promise.all(storages.splice(0).map(storage => storage.dispose().catch(() => undefined)))
  await Promise.all(registries.splice(0).map(registry => registry.dispose()))
  await Promise.all(temps.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

async function temp(prefix = 'dsh-registry-storage-'): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), prefix))
  temps.push(path)
  return path
}

function envelope(name: string) {
  return { meta: { name, description: `${name} workflow` }, script: `complete({ name: ${JSON.stringify(name)} })` }
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
      saveAvailable: true,
      allowedActions: ['pause', 'stop', 'save'],
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

function config(root: string) {
  return resolveWorkflowPackageConfig({
    dshHome: join(root, 'home'),
    runsRoot: join(root, 'runs'),
    definitionWatch: false,
    maxRecoveryEntries: 64,
    maxRetainedRunsPerSession: 8,
    maxWorkflowNamesPerSession: 8,
    maxMembersPerRun: 4,
  }, join(root, 'home'))
}

function fakeWatchers(): { factory: ChokidarFactory; fire: (event: string, path: string) => void } {
  const handles: Array<ChokidarHandle & { listener?: (event: string, path: string) => void }> = []
  const factory: ChokidarFactory = () => {
    const handle: ChokidarHandle & { listener?: (event: string, path: string) => void } = {
      on(event, listener) {
        if (event === 'all') handle.listener = listener
        return handle
      },
      close() { /* closed */ },
    }
    handles.push(handle)
    return handle
  }
  return {
    factory,
    fire(event, path) {
      for (const handle of handles) handle.listener?.(event, path)
    },
  }
}

async function tryLockInChild(anchorPath: string): Promise<string> {
  const child = spawn(process.execPath, ['--input-type=module', '-e', `
    import { constants } from 'node:fs'
    import { open } from 'node:fs/promises'
    const module = await import('fs-native-extensions')
    const tryLock = module.tryLock ?? module.default?.tryLock
    const file = await open(${JSON.stringify(anchorPath)}, constants.O_RDWR)
    try {
      process.stdout.write(tryLock(file.fd) ? 'locked' : 'owned')
    } finally {
      await file.close()
    }
  `], { stdio: ['ignore', 'pipe', 'pipe'] })
  const [stdout, stderr, code] = await Promise.all([
    new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = []
      child.stdout?.on('data', chunk => chunks.push(Buffer.from(chunk)))
      child.stdout?.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      child.stdout?.on('error', reject)
    }),
    new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = []
      child.stderr?.on('data', chunk => chunks.push(Buffer.from(chunk)))
      child.stderr?.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      child.stderr?.on('error', reject)
    }),
    new Promise<number>(resolve => child.on('exit', exitCode => resolve(exitCode ?? 1))),
  ])
  expect(code).toBe(0)
  expect(stderr).toBe('')
  return stdout
}

describe('registry and storage integration (RS21)', () => {
  it('returns [] for healthy states and the exact relationship diagnostics', () => {
    expect(checkWorkflowRegistryStorageInvariant(undefined)).toEqual([])
    expect(checkWorkflowRegistryStorageInvariant({
      registry: { enabled: true, watchers: 1 },
      storage: { recovered: true, exposed: true, leaseOwned: true },
      disposed: false,
      heads: [{
        status: 'completed',
        completionNotice: { state: 'delivered' },
        runDirectoryExists: true,
        detailFileExists: true,
        detailSha256: 'aa',
        fileSha256: 'aa',
        detailRevision: 2,
        fileRevision: 2,
      }],
    })).toEqual([])
    expect(checkWorkflowRegistryStorageInvariant({
      registry: { enabled: false, watchers: 1 },
      storage: { recovered: false, exposed: true, leaseOwned: true },
      disposed: true,
      heads: [
        { runDirectoryExists: false, status: 'running', completionNotice: { state: 'none' } },
        { detailFileExists: false, status: 'completed', completionNotice: { state: 'none' }, detailSha256: 'a', fileSha256: 'b', detailRevision: 1, fileRevision: 2 },
      ],
    })).toEqual([
      'disabled registry has active watchers',
      'storage is exposed before recovery',
      'disposed storage still owns a lease/descriptor/operation',
      'a manifest references a missing/identity-mismatched run directory or immutable detail file',
      'a detail snapshot/revision/digest disagrees with its head',
      "a terminal row has completionNotice.state === 'none'",
    ])
  })

  it('rejects recovery and store ceilings above the documented defaults at config resolution', () => {
    const home = '/tmp/dsh-home-ceiling'
    expect(() => resolveWorkflowPackageConfig({ maxRecoveryEntries: 4_097 }, home)).toThrow(/maxRecoveryEntries must not exceed 4096/u)
    expect(() => resolveWorkflowPackageConfig({ maxManifestBytes: 8_388_609 }, home)).toThrow(/maxManifestBytes must not exceed 8388608/u)
    expect(() => resolveWorkflowPackageConfig({ maxRunDetailsBytes: 33_554_433 }, home)).toThrow(/maxRunDetailsBytes must not exceed 33554432/u)
    expect(() => resolveWorkflowPackageConfig({ maxRunStoreBytes: 536_870_913 }, home)).toThrow(/maxRunStoreBytes must not exceed 536870912/u)
    const resolved = resolveWorkflowPackageConfig({}, home)
    expect(resolved).toMatchObject({
      maxManifestBytes: 8_388_608,
      maxRunDetailsBytes: 33_554_432,
      maxRunStoreBytes: 536_870_912,
      maxRecoveryEntries: 4_096,
    })
  })

  it.skipIf(!posixOnly)('discovers, saves, watches, persists two same-name runs, and reopens ordinals', async () => {
    const base = await temp()
    const home = join(base, 'home')
    const project = join(base, 'project')
    await mkdir(join(home, 'workflows'), { recursive: true })
    await mkdir(join(project, '.git'), { recursive: true })
    await mkdir(join(project, '.dsh', 'workflows'), { recursive: true })
    const changes: string[] = []
    const watchers = fakeWatchers()
    const registry = new WorkflowRegistry({
      emit: name => { changes.push(name) },
    }, {
      dshHome: home,
      definitionWatch: true,
      watchFactory: watchers.factory,
      watchScheduler: { schedule(callback) { callback(); return 0 }, cancel() { /* no-op */ } },
    })
    registries.push(registry)

    const savedProject = await registry.save(envelope('review-changes'), { cwd: project, scope: 'project' })
    expect(savedProject.path.endsWith('review-changes.workflow.json')).toBe(true)
    const savedUser = await registry.save(envelope('user-copy'), { cwd: project, scope: 'user' })
    expect(savedUser.scope).toBe('user')
    const listed = await registry.list({ cwd: project })
    expect(listed.map(item => item.name).sort()).toEqual(['review-changes', 'user-copy'])
    expect(changes.filter(name => name === 'workflows/change').length).toBeGreaterThanOrEqual(2)

    watchers.fire('add', savedProject.path)
    watchers.fire('change', savedProject.path)
    expect(changes.at(-1)).toBe('workflows/change')

    const resolved = config(base)
    const storage = await openWorkflowStorage(resolved)
    storages.push(storage)
    const first = await storage.store.insertWithNextDisplayName(
      { sessionId, name: 'review-changes', runId: 'run-review', script },
      () => draft(),
    )
    const second = await storage.store.insertWithNextDisplayName(
      { sessionId, name: 'review-changes', runId: 'run-review-2', script },
      () => draft(),
    )
    expect(first.displayName).toBe('review-changes')
    expect(second.displayName).toBe('review-changes-2')
    expect(first.numberedHandle).toBe(false)
    expect(second.numberedHandle).toBe(true)

    const updated = await storage.store.commitRun({
      sessionId,
      runId: first.runId,
      expectedRevision: first.revision,
      head: withoutDurable(first, { phase: 'Inspect', membersRevision: 2 }),
      detail: { members: [{ memberId: 'member-1', seq: 1, label: 'Inspect', status: 'completed', outcome: 'available', value: null }], logs: [], result: { state: 'pending' }, artifacts: [] },
    })
    const terminal = await storage.store.commitTerminalAndClaimNotice({
      sessionId,
      runId: first.runId,
      expectedRevision: updated.revision,
      head: withoutDurable(updated, {
        status: 'completed',
        stopReason: 'completed',
        settledAt: 20,
        executionAvailable: false,
        saveAvailable: false,
        allowedActions: [],
      }),
    })
    expect(terminal.completionNotice.state).toBe('claimed')
    if (terminal.completionNotice.state !== 'claimed') throw new Error('expected claimed notice')
    const delivered = await storage.store.finalizeCompletionNotice(sessionId, first.runId, terminal.revision, {
      state: 'delivered',
      claimId: terminal.completionNotice.claimId,
      processEpoch: terminal.completionNotice.processEpoch,
      claimedAt: terminal.completionNotice.claimedAt,
      finalizedAt: terminal.completionNotice.claimedAt + 1,
      lane: 'followup',
    })
    expect(delivered.completionNotice.state).toBe('delivered')
    expect(delivered.detail.id).toMatch(/^[a-f0-9]{32}$/u)
    const detailFiles = await readdir(join(storage.anchor.root, 'runs', first.runDirectory, 'details'))
    expect(detailFiles).toEqual([`${delivered.detail.id}.json`])
    expect(detailFiles.some(name => name.includes('index') || name.endsWith('.jsonl'))).toBe(false)
    const detailBytes = await readFile(join(storage.anchor.root, 'runs', first.runDirectory, 'details', `${delivered.detail.id}.json`))
    expect(createHash('sha256').update(detailBytes).digest('hex')).toBe(delivered.detail.sha256)

    await storage.dispose()
    const reopened = await openWorkflowStorage(resolved)
    storages.push(reopened)
    const rows = await reopened.store.readSession(sessionId)
    expect(rows.map(row => row.displayName).sort()).toEqual(['review-changes', 'review-changes-2'])
    expect(rows.find(row => row.displayName === 'review-changes')?.completionNotice.state).toBe('delivered')
    expect(checkWorkflowRegistryStorageInvariant({
      registry: { enabled: true, watchers: 1 },
      storage: { recovered: true, exposed: true, leaseOwned: true },
      heads: rows.map(row => ({
        status: row.status,
        completionNotice: row.completionNotice,
        runDirectoryExists: true,
        detailFileExists: true,
        detailSha256: row.detail.sha256,
        fileSha256: row.detail.sha256,
        detailRevision: row.detail.snapshotRevision,
        fileRevision: row.detail.snapshotRevision,
      })),
    })).toEqual([])
  })

  it.skipIf(!posixOnly)('rejects a second process until the owner releases the permanent lock', async () => {
    const base = await temp()
    const resolved = config(base)
    const owner = await openWorkflowStorage(resolved)
    storages.push(owner)
    const lockPath = owner.anchor.anchorPath
    expect(await tryLockInChild(lockPath)).toBe('owned')
    await owner.dispose()
    expect(await tryLockInChild(lockPath)).toBe('locked')
  })

  it.skipIf(!posixOnly)('fails closed when the pinned runs root is replaced with an outside directory', async () => {
    const base = await temp()
    const resolved = config(base)
    const storage = await openWorkflowStorage(resolved)
    storages.push(storage)
    const outside = join(base, 'outside')
    await mkdir(outside, { recursive: true, mode: 0o700 })
    const moved = `${storage.anchor.root}.moved`
    await rename(storage.anchor.root, moved)
    await rename(outside, storage.anchor.root)
    await expect(storage.store.insertWithNextDisplayName(
      { sessionId, name: 'escape', runId: 'run-escape', script },
      () => draft(),
    )).rejects.toMatchObject({ code: 'WORKFLOW_STORAGE_UNSAFE' })
    expect(await readdir(moved)).toEqual(expect.arrayContaining(['.workflow-storage.lock']))
    await storage.dispose().catch(() => undefined)
  })

  it.skipIf(!posixOnly)('recovers an active row as Interrupted and abandons a claimed notice without retry', async () => {
    const base = await temp()
    const resolved = config(base)
    const owner = await openWorkflowStorage(resolved)
    const active = await owner.store.insertWithNextDisplayName(
      { sessionId, name: 'live-row', runId: 'run-live', script },
      () => draft(),
    )
    const claimed = await owner.store.insertWithNextDisplayName(
      { sessionId, name: 'done-row', runId: 'run-done', script },
      () => draft(),
    )
    const terminal = await owner.store.commitTerminalAndClaimNotice({
      sessionId,
      runId: claimed.runId,
      expectedRevision: claimed.revision,
      head: withoutDurable(claimed, {
        status: 'completed',
        stopReason: 'completed',
        settledAt: 20,
        executionAvailable: false,
        saveAvailable: false,
        allowedActions: [],
      }),
    })
    expect(terminal.completionNotice.state).toBe('claimed')
    await owner.dispose()

    const reopened = await openWorkflowStorage(resolved)
    storages.push(reopened)
    const recoveredLive = reopened.recovered.find(row => row.runId === active.runId)
    const recoveredDone = reopened.recovered.find(row => row.runId === claimed.runId)
      ?? (await reopened.store.readSession(sessionId)).find(row => row.runId === claimed.runId)
    expect(recoveredLive).toMatchObject({
      displayName: 'live-row',
      status: 'interrupted',
      error: 'Process exited before workflow settlement.',
      executionAvailable: false,
      saveAvailable: false,
      completionNotice: { state: 'abandoned', reason: 'process-lost' },
    })
    expect(recoveredDone).toMatchObject({
      displayName: 'done-row',
      completionNotice: { state: 'abandoned', reason: 'process-lost' },
    })
    const details = await readdir(join(reopened.anchor.root, 'runs', active.runDirectory, 'details'))
    expect(details).toEqual([expect.stringMatching(/^[a-f0-9]{32}\.json$/u)])
  })
})
