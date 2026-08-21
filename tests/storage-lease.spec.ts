import { spawn } from 'node:child_process'
import { constants } from 'node:fs'
import { mkdir, mkdtemp, open, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  acquireWorkflowStorageLease,
  openWorkflowStorageAnchor,
} from '../src/supervisor/storage/lease.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function runsRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-storage-lease-'))
  roots.push(root)
  return join(root, 'runs')
}

describe('workflow storage lease', () => {
  it('rejects Windows and missing no-follow primitives as unsupported', async () => {
    if (process.platform !== 'win32') return
    await expect(openWorkflowStorageAnchor({ runsRoot: await runsRoot() })).rejects.toMatchObject({
      code: 'WORKFLOW_STORAGE_UNSUPPORTED',
      message: `safe workflow storage is unavailable on ${process.platform}`,
    })
  })

  it('holds one lifetime lease, classifies lock errors, and keeps the permanent anchor', async () => {
    if (process.platform === 'win32') return
    const root = await runsRoot()
    const anchor = await openWorkflowStorageAnchor({ runsRoot: root })
    expect(await readdir(anchor.root)).toEqual(['.workflow-storage.lock'])
    const lease = await acquireWorkflowStorageLease(anchor)
    try {
      await lease.assertCurrent()
      const contender = await openWorkflowStorageAnchor({ runsRoot: root })
      await expect(acquireWorkflowStorageLease(contender)).rejects.toMatchObject({
        code: 'WORKFLOW_STORAGE_OWNED',
        message: 'workflow storage root is already owned by another live process',
      })

      const missing = await openWorkflowStorageAnchor({ runsRoot: root })
      await expect(acquireWorkflowStorageLease(missing, undefined, {} as any)).rejects.toMatchObject({
        code: 'WORKFLOW_STORAGE_UNSUPPORTED',
        message: `safe workflow storage is unavailable on ${process.platform}`,
      })

      const enosys = await openWorkflowStorageAnchor({ runsRoot: root })
      await expect(acquireWorkflowStorageLease(enosys, undefined, {
        tryLock: () => { throw Object.assign(new Error('no lock'), { code: 'ENOSYS' }) },
        unlock: () => undefined,
      })).rejects.toMatchObject({
        code: 'WORKFLOW_STORAGE_UNSUPPORTED',
        message: `safe workflow storage is unavailable on ${process.platform}`,
      })

      const eio = await openWorkflowStorageAnchor({ runsRoot: root })
      await expect(acquireWorkflowStorageLease(eio, undefined, {
        tryLock: () => { throw Object.assign(new Error('EIO from fcntl'), { code: 'EIO' }) },
        unlock: () => undefined,
      })).rejects.toMatchObject({
        code: 'WORKFLOW_STORAGE_UNSAFE',
        message: `workflow storage path "${anchor.root}" is unsafe: EIO from fcntl`,
      })
    } finally {
      const first = lease.release()
      const second = lease.release()
      await Promise.all([first, second])
      expect(await readdir(anchor.root)).toEqual(['.workflow-storage.lock'])
    }
  })

  it('rejects a second cooperating Node process before it can take the lease', async () => {
    if (process.platform === 'win32') return
    const root = await runsRoot()
    await mkdir(root, { recursive: true, mode: 0o700 })
    const owner = await openWorkflowStorageAnchor({ runsRoot: root })
    const lease = await acquireWorkflowStorageLease(owner)
    try {
      const child = spawn(process.execPath, ['--input-type=module', '-e', `
        import { constants } from 'node:fs'
        import { open } from 'node:fs/promises'
        const module = await import('fs-native-extensions')
        const tryLock = module.tryLock ?? module.default?.tryLock
        const file = await open(${JSON.stringify(owner.anchorPath)}, constants.O_RDWR)
        try {
          const locked = tryLock(file.fd)
          process.stdout.write(locked ? 'locked' : 'owned')
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
      expect(stdout).toBe('owned')
    } finally {
      await lease.release()
    }
  })

  it('reopens after process-owned release using the same permanent lock file', async () => {
    if (process.platform === 'win32') return
    const root = await runsRoot()
    const first = await acquireWorkflowStorageLease(await openWorkflowStorageAnchor({ runsRoot: root }))
    await first.release()
    const secondAnchor = await openWorkflowStorageAnchor({ runsRoot: root })
    const second = await acquireWorkflowStorageLease(secondAnchor)
    await second.assertCurrent()
    const handle = await open(secondAnchor.anchorPath, constants.O_RDONLY)
    try {
      const info = await handle.stat()
      expect(info.isFile()).toBe(true)
      expect(info.nlink).toBe(1)
    } finally {
      await handle.close()
      await second.release()
    }
  })
})
