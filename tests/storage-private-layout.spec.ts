import { chmod, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  closeWorkflowStorageLayout,
  initializePrivateLayout,
  openPrivateDirectory,
} from '../src/supervisor/storage/private-root.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

function owner(root: string) {
  return {
    root,
    assertCurrent: async () => undefined,
    close: async () => undefined,
  } as any
}

function lease(anchor: any) {
  return {
    anchor,
    assertCurrent: async () => undefined,
    release: async () => undefined,
  } as any
}

function delegate(path: string, children: Map<string, any>, overrides: Record<string, unknown> = {}) {
  let closed = false
  return {
    target: { path },
    async openDirectory(name: string) {
      const child = children.get(join(path, name))
      if (child !== undefined) return child
      throw Object.assign(new Error(`missing child ${name}`), { code: 'FS_NOT_FOUND' })
    },
    async readBytes() { return new Uint8Array() },
    async writeText(_name: string, content: string) {
      return { operation: 'createIfAbsent', version: { path }, before: null, after: content }
    },
    async assertIdentity() {
      if (closed) throw new Error('closed')
    },
    async close() { closed = true },
    async listEntries() { return [] },
    async fileInfo() { return undefined },
    async removeFile() { return undefined },
    async removeDirectory() { return undefined },
    async publishDirectory() { return undefined },
    ...overrides,
  }
}

describe('private workflow storage layout', () => {
  it('does not reinterpret an arbitrary error containing "not found" as absence', async () => {
    const root = '/virtual/workflow-root'
    const children = new Map<string, any>()
    const failure = Object.assign(new Error('directory identity not found after verification'), {
      code: 'WORKFLOW_STORAGE_UNSAFE',
    })
    let closes = 0
    const rootDelegate = delegate(root, children, {
      openDirectory: async () => { throw failure },
      close: async () => { closes += 1 },
    })
    const calls: Array<{ path: string; create: boolean | undefined }> = []
    const provider = {
      allowLegacyPathFallback: true,
      async openPrivateDirectory(path: string, options: { create?: boolean }) {
        calls.push({ path, create: options.create })
        return rootDelegate
      },
    } as any
    const anchor = owner(root)

    await expect(initializePrivateLayout(anchor, lease(anchor), provider)).rejects.toBe(failure)
    expect(calls).toEqual([{ path: root, create: false }])
    expect(closes).toBe(1)
  })

  it('uses only explicit FS_NOT_FOUND to create the four direct categories', async () => {
    const root = '/virtual/workflow-root'
    const children = new Map<string, any>()
    const rootDelegate = delegate(root, children)
    children.set(root, rootDelegate)
    const calls: Array<{ path: string; create: boolean | undefined }> = []
    const provider = {
      allowLegacyPathFallback: true,
      async openPrivateDirectory(path: string, options: { create?: boolean }) {
        calls.push({ path, create: options.create })
        const existing = children.get(path)
        if (existing !== undefined) return existing
        if (options.create !== true) throw Object.assign(new Error('missing'), { code: 'FS_NOT_FOUND' })
        const created = delegate(path, children)
        children.set(path, created)
        return created
      },
    } as any
    const anchor = owner(root)
    const layout = await initializePrivateLayout(anchor, lease(anchor), provider)
    try {
      expect(calls).toEqual([
        { path: root, create: false },
        ...['sessions', 'runs', 'staging', 'quarantine'].map(name => ({ path: join(root, name), create: true })),
      ])
    } finally {
      await closeWorkflowStorageLayout(layout)
    }
  })

  it('rejects an incomplete Host capability before creating a category', async () => {
    const root = '/virtual/workflow-root'
    let closes = 0
    const incomplete = {
      openDirectory: async () => { throw Object.assign(new Error('missing'), { code: 'FS_NOT_FOUND' }) },
      readBytes: async () => new Uint8Array(),
      writeText: async () => ({}),
      assertIdentity: async () => undefined,
      close: async () => { closes += 1 },
      // No listing/metadata/publication/removal capabilities.
    }
    let calls = 0
    const provider = {
      async openPrivateDirectory() { calls += 1; return incomplete },
    } as any
    const anchor = owner(root)

    await expect(initializePrivateLayout(anchor, lease(anchor), provider)).rejects.toMatchObject({
      code: 'WORKFLOW_STORAGE_UNSUPPORTED',
      message: 'descriptor-rooted workflow storage directory listing is unavailable',
    })
    expect(calls).toBe(1)
    expect(closes).toBe(1)
  })

  it('does not create a missing local child unless create is explicit', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-private-layout-'))
    roots.push(root)
    await chmod(root, 0o700)
    const directory = await openPrivateDirectory(root, false)
    try {
      await expect(directory.openDirectory('missing')).rejects.toMatchObject({ code: 'ENOENT' })
      expect(await readdir(root)).toEqual([])
      await mkdir(join(root, 'existing'), { mode: 0o700 })
      const existing = await directory.openDirectory('existing')
      await existing.close()
    } finally {
      await directory.close()
    }
  })
})
