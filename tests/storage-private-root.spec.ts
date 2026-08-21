import { chmod, link, lstat, mkdir, mkdtemp, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  acquireWorkflowStorageLease,
  openWorkflowStorageAnchor,
} from '../src/supervisor/storage/lease.js'
import {
  closeWorkflowStorageLayout,
  initializeLeasedWorkflowStorage,
  openPrivateDirectory,
} from '../src/supervisor/storage/private-root.js'

const posixOnly = process.platform !== 'win32'
const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function temp(prefix = 'dsh-private-root-'): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), prefix))
  roots.push(path)
  await chmod(path, 0o700)
  return path
}

describe('private storage root (RS11)', () => {
  it.skipIf(posixOnly)('fails closed on Windows before creating a lock or category', async () => {
    const root = await temp()
    await expect(openWorkflowStorageAnchor({ runsRoot: join(root, 'runs') })).rejects.toMatchObject({
      code: 'WORKFLOW_STORAGE_UNSUPPORTED',
    })
    await expect(openPrivateDirectory(join(root, 'runs'))).rejects.toMatchObject({
      code: 'WORKFLOW_STORAGE_UNSUPPORTED',
    })
    expect(await readdir(root)).toEqual([])
  })

  it.skipIf(!posixOnly)('creates only the runs root and permanent lock, then reuses them', async () => {
    const root = join(await temp(), 'runs')
    const first = await openWorkflowStorageAnchor({ runsRoot: root })
    try {
      expect(await readdir(first.root)).toEqual(['.workflow-storage.lock'])
      const info = await lstat(first.anchorPath)
      expect(info.isFile()).toBe(true)
      expect(info.nlink).toBe(1)
      expect(info.mode & 0o777).toBe(0o600)
      const rootInfo = await lstat(first.root)
      expect(rootInfo.isDirectory()).toBe(true)
      expect(rootInfo.mode & 0o777).toBe(0o700)
    } finally {
      await first.close()
    }

    const second = await openWorkflowStorageAnchor({ runsRoot: root })
    try {
      expect(await readdir(second.root)).toEqual(['.workflow-storage.lock'])
      await second.assertCurrent()
    } finally {
      await second.close()
    }
  })

  it.skipIf(!posixOnly)('rejects unsafe roots, abort, and restrictive lock modes without creating categories', async () => {
    const base = await temp()
    const asFile = join(base, 'file-root')
    await writeFile(asFile, 'not a directory', { mode: 0o600 })
    await expect(openWorkflowStorageAnchor({ runsRoot: asFile })).rejects.toMatchObject({ code: 'WORKFLOW_STORAGE_UNSAFE' })

    const linked = join(base, 'linked-root')
    const real = join(base, 'real-root')
    await mkdir(real, { mode: 0o700 })
    await symlink(real, linked)
    await expect(openWorkflowStorageAnchor({ runsRoot: linked })).rejects.toMatchObject({ code: 'WORKFLOW_STORAGE_UNSAFE' })

    const aborted = AbortSignal.abort()
    await expect(openWorkflowStorageAnchor({ runsRoot: join(base, 'aborted'), signal: aborted })).rejects.toMatchObject({
      name: 'AbortError',
    })
    await expect(readdir(join(base, 'aborted')).catch((error: NodeJS.ErrnoException) => error.code)).resolves.toBe('ENOENT')

    const root = join(base, 'runs')
    const anchor = await openWorkflowStorageAnchor({ runsRoot: root })
    await chmod(anchor.anchorPath, 0o644)
    await anchor.close()
    await expect(openWorkflowStorageAnchor({ runsRoot: root })).rejects.toMatchObject({
      code: 'WORKFLOW_STORAGE_UNSAFE',
      message: expect.stringContaining('lock anchor must be an owner-only 0600 regular file'),
    })
    expect(await readdir(root)).toEqual(['.workflow-storage.lock'])
  })

  it.skipIf(!posixOnly)('rejects a hard-linked lock and a replaced root identity after open', async () => {
    const root = join(await temp(), 'runs')
    const first = await openWorkflowStorageAnchor({ runsRoot: root })
    await first.close()
    await link(join(root, '.workflow-storage.lock'), join(root, 'alias.lock'))
    await expect(openWorkflowStorageAnchor({ runsRoot: root })).rejects.toMatchObject({
      code: 'WORKFLOW_STORAGE_UNSAFE',
    })

    const liveRoot = join(await temp(), 'live')
    const live = await openPrivateDirectory(liveRoot)
    await live.assertIdentity()
    await rm(liveRoot, { recursive: true, force: true })
    await mkdir(liveRoot, { mode: 0o700 })
    await expect(live.assertIdentity()).rejects.toMatchObject({
      code: 'WORKFLOW_STORAGE_UNSAFE',
      message: expect.stringContaining('directory identity changed'),
    })
    await live.close().catch(() => undefined)
  })

  it.skipIf(!posixOnly)('initializes leased categories only after the lifetime lock is held', async () => {
    const root = join(await temp(), 'runs')
    const anchor = await openWorkflowStorageAnchor({ runsRoot: root })
    expect(await readdir(anchor.root)).toEqual(['.workflow-storage.lock'])
    const lease = await acquireWorkflowStorageLease(anchor)
    const layout = await initializeLeasedWorkflowStorage(anchor, lease)
    try {
      expect((await readdir(layout.root.path)).sort()).toEqual([
        '.workflow-storage.lock', 'quarantine', 'runs', 'sessions', 'staging',
      ])
      for (const name of ['sessions', 'runs', 'staging', 'quarantine'] as const) {
        await layout[name].assertIdentity()
        expect((await lstat(layout[name].path)).mode & 0o777).toBe(0o700)
      }
    } finally {
      await closeWorkflowStorageLayout(layout)
      await lease.release()
    }
  })
})
