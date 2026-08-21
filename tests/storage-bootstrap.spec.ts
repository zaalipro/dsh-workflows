import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { resolveWorkflowPackageConfig } from '../src/config.js'
import { openWorkflowStorage } from '../src/supervisor/storage/index.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

function config(root: string) {
  return resolveWorkflowPackageConfig({
    dshHome: join(root, 'home'),
    runsRoot: join(root, 'runs'),
    definitionWatch: false,
    maxRecoveryEntries: 64,
  }, join(root, 'home'))
}

describe('workflow storage bootstrap', () => {
  it('leases, creates the v2 layout, recovers, and releases the lease last', async () => {
    if (process.platform === 'win32') {
      const root = await mkdtemp(join(tmpdir(), 'dsh-storage-bootstrap-win-'))
      roots.push(root)
      await expect(openWorkflowStorage(config(root))).rejects.toMatchObject({
        code: 'WORKFLOW_STORAGE_UNSUPPORTED',
      })
      return
    }

    const root = await mkdtemp(join(tmpdir(), 'dsh-storage-bootstrap-'))
    roots.push(root)
    const resolved = config(root)
    const storage = await openWorkflowStorage(resolved)
    try {
      expect(storage.recovered).toEqual([])
      expect((await readdir(storage.anchor.root)).sort()).toEqual([
        '.workflow-storage.lock', 'quarantine', 'runs', 'sessions', 'staging',
      ])
      const names = ['sessions', 'runs', 'staging', 'quarantine'] as const
      for (const name of names) await storage.layout[name].assertIdentity()
      await storage.lease.assertCurrent()
    } finally {
      const first = storage.dispose()
      const second = storage.dispose()
      await Promise.all([first, second])
    }

    const reopened = await openWorkflowStorage(resolved)
    try {
      expect(reopened.recovered).toEqual([])
      await reopened.lease.assertCurrent()
    } finally {
      await reopened.dispose()
    }
  })

  it('does not silently downgrade a Host filesystem missing nested primitives', async () => {
    if (process.platform === 'win32') return
    const root = await mkdtemp(join(tmpdir(), 'dsh-storage-bootstrap-host-'))
    roots.push(root)
    const incomplete = {
      async openPrivateDirectory() {
        return {
          async openDirectory() { throw Object.assign(new Error('missing'), { code: 'FS_NOT_FOUND' }) },
          async readBytes() { return new Uint8Array() },
          async writeText() { return {} },
          async assertIdentity() { return undefined },
          async close() { return undefined },
        }
      },
    }
    await expect(openWorkflowStorage(config(root), incomplete)).rejects.toMatchObject({
      code: 'WORKFLOW_STORAGE_UNSUPPORTED',
    })
  })
})
