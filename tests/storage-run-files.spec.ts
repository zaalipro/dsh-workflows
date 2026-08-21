import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { resolveWorkflowPackageConfig } from '../src/config.js'
import { openWorkflowStorage } from '../src/supervisor/storage/index.js'
import {
  RunScratchStore,
  createRunFiles,
  openRunScratch,
  scratchDirectoryFromScriptPath,
} from '../src/supervisor/storage/run-files.js'

const posixOnly = process.platform !== 'win32'
const roots: string[] = []
const runDirectory = 'a'.repeat(32)
const script = 'complete({ ok: true })\n'
const limits = {
  maxOperations: 16,
  maxPendingOperations: 8,
  maxFiles: 3,
  maxFileBytes: 32,
  maxTotalBytes: 48,
}

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

describe('run files and scratch (RS16)', () => {
  it.skipIf(!posixOnly)('creates an unused run directory with an immutable script snapshot and scratch/details', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-run-files-'))
    roots.push(root)
    const storage = await openWorkflowStorage(config(root))
    try {
      const original = new TextEncoder().encode(script)
      const files = await createRunFiles(storage.layout, runDirectory, original, limits)
      original[0] = 0
      expect(new TextDecoder().decode(files.script)).toBe(script)
      expect(files.runDirectory).toBe(runDirectory)
      expect(files.scriptPath.endsWith(`${runDirectory}/script.js`)).toBe(true)
      expect(scratchDirectoryFromScriptPath(files.scriptPath)).toBe(dirname(files.scriptPath))
      expect((await readdir(join(storage.anchor.root, 'runs', runDirectory))).sort()).toEqual([
        'details', 'scratch', 'script.js',
      ])

      await files.scratch.write('report.md', '# ok\n')
      expect(await files.scratch.read('report.md')).toBe('# ok\n')
      expect(await files.scratch.list()).toEqual(['report.md'])
      await files.scratch.write('report.md', '# next\n')
      expect(await files.scratch.read('report.md')).toBe('# next\n')
      expect(await files.scratch.read('missing.md')).toBeUndefined()

      await files.dispose()
      await files.dispose()
      const reopened = await openRunScratch(storage.layout, runDirectory, limits)
      try {
        expect(await reopened.read('report.md')).toBe('# next\n')
      } finally {
        await reopened.dispose()
      }
    } finally {
      await storage.dispose()
    }
  })

  it.skipIf(!posixOnly)('enforces scratch names, quotas, cancellation, and unused-directory publication', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-run-files-quota-'))
    roots.push(root)
    const storage = await openWorkflowStorage(config(root))
    try {
      await expect(createRunFiles(storage.layout, '../escape', new TextEncoder().encode(script), limits))
        .rejects.toMatchObject({ code: 'WORKFLOW_STORAGE_UNSAFE' })
      await expect(createRunFiles(storage.layout, runDirectory, new TextEncoder().encode('too-big-script-bytes'), {
        ...limits, maxScriptBytes: 4,
      })).rejects.toMatchObject({ code: 'WORKFLOW_STORAGE_LIMIT' })

      const files = await createRunFiles(storage.layout, runDirectory, new TextEncoder().encode(script), limits)
      await expect(createRunFiles(storage.layout, runDirectory, new TextEncoder().encode(script), limits))
        .rejects.toMatchObject({ message: expect.stringContaining('already exists') })

      for (const name of ['../x', 'a/b', '..', '.', 'has space']) {
        await expect(files.scratch.write(name, 'x')).rejects.toMatchObject({
          message: expect.stringMatching(/scratch name .* is invalid/u),
        })
      }
      await files.scratch.write('a.md', '1')
      await files.scratch.write('b.md', '2')
      await files.scratch.write('c.md', '3')
      await expect(files.scratch.write('d.md', '4')).rejects.toMatchObject({
        code: 'WORKFLOW_STORAGE_LIMIT',
        message: 'scratch file quota exceeded',
      })
      await expect(files.scratch.write('a.md', 'x'.repeat(64))).rejects.toMatchObject({
        code: 'WORKFLOW_STORAGE_LIMIT',
        message: 'scratch file exceeds per-file quota',
      })
      await files.scratch.write('a.md', 'x'.repeat(32))
      await expect(files.scratch.write('b.md', 'y'.repeat(32))).rejects.toMatchObject({
        code: 'WORKFLOW_STORAGE_LIMIT',
        message: 'scratch total quota exceeded',
      })

      const cancelled = AbortSignal.abort()
      await expect(files.scratch.write('a.md', 'ok', cancelled)).rejects.toMatchObject({ name: 'AbortError' })
      files.scratch.cancel(new Error('stop scratch'))
      await expect(files.scratch.write('a.md', 'ok')).rejects.toThrow()
      await files.dispose()
    } finally {
      await storage.dispose()
    }
  })

  it('rejects invalid scratch limits and path-shaped writes without a descriptor', async () => {
    expect(() => new RunScratchStore('/tmp/scratch', { ...limits, maxOperations: 0 })).toThrow(/positive safe integer/u)
    expect(() => new RunScratchStore('/tmp/scratch', { ...limits, maxPendingOperations: 32 })).toThrow(/must not exceed/u)
    expect(() => new RunScratchStore('/tmp/scratch', { ...limits, maxFileBytes: 64 })).toThrow(/must not exceed/u)
    if (!posixOnly) return
    const root = await mkdtemp(join(tmpdir(), 'dsh-run-files-path-'))
    roots.push(root)
    await mkdir(join(root, 'scratch'), { recursive: true, mode: 0o700 })
    const store = new RunScratchStore(join(root, 'scratch'), limits)
    try {
      expect(await store.read('missing.md')).toBeUndefined()
      await expect(store.write('report.md', '# no\n')).rejects.toMatchObject({
        code: 'WORKFLOW_STORAGE_UNSUPPORTED',
        message: 'descriptor-rooted scratch publication is unavailable',
      })
    } finally {
      await store.dispose()
    }
  })
})
