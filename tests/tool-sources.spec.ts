import { describe, expect, it } from 'vitest'
import type { Stats } from 'node:fs'
import { lstat, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve as resolvePath } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'

import { parseWorkflowToolRequest } from '../src/tool/schema.js'
import { resolveWorkflowSource } from '../src/tool/index.js'
import { FsError } from '@deepseek-ai/dsh-fs'

const META = { name: 'audit', description: 'd' }
const SCRIPT = 'complete({ ok: true })'
const encoder = new TextEncoder()

function agent(cwd?: string) {
  return { session: { header: cwd === undefined ? {} : { cwd } } }
}

function fsReturning(bytes: Uint8Array | unknown, error?: unknown) {
  return {
    async readBytesNoFollow(path: string, options: { cwd?: string }, signal?: AbortSignal, maxBytes?: number) {
      signal?.throwIfAborted()
      if (error !== undefined) throw error
      if (bytes instanceof Uint8Array && maxBytes !== undefined && bytes.byteLength > maxBytes) {
        throw new FsError('too large', 'FS_TOO_LARGE')
      }
      return bytes
    },
  }
}

/** The public filesystem method/target shapes shipped by dsh 0.1.2-rc.1. */
function publishedRc2LocalFs(hook?: (displayPath: string) => Promise<void>) {
  const version = (info: Stats) =>
    `${info.dev}:${info.ino}:${info.size}:${info.mtimeMs}:${info.ctimeMs}`
  return {
    async resolve(path: string, options?: { cwd?: string; signal?: AbortSignal }) {
      options?.signal?.throwIfAborted()
      const displayPath = resolvePath(options?.cwd ?? process.cwd(), path)
      const targetKey = await realpath(displayPath)
      await hook?.(displayPath)
      options?.signal?.throwIfAborted()
      return { displayPath, targetKey }
    },
    processPath(target: { targetKey: string }) { return target.targetKey },
    fileUrl(target: { targetKey: string }) { return pathToFileURL(target.targetKey).href },
    async lstat(path: string, options?: { cwd?: string }, signal?: AbortSignal) {
      signal?.throwIfAborted()
      try {
        const info = await lstat(resolvePath(options?.cwd ?? process.cwd(), path))
        return {
          version: version(info),
          type: info.isSymbolicLink() ? 'symlink' : info.isFile() ? 'file' : info.isDirectory() ? 'directory' : 'other',
          size: info.size,
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
        throw error
      }
    },
    // Present in published RC2. The fallback must not call it because its
    // target-shaped read cannot atomically enforce no-follow on script_path.
    async readBytes() { throw new Error('published RC2 readBytes must not be used for script_path') },
  }
}

type HostRc2Fs = ReturnType<typeof publishedRc2LocalFs>

describe('workflow tool sources (SH20)', () => {
  it('resolves a saved definition in Session cwd', async () => {
    const registry = {
      async get(name: string, options?: { cwd?: string }) {
        if (name !== 'audit') return undefined
        return {
          name: 'audit', description: 'd', whenToUse: 'before merge',
          phases: [{ title: 'Inspect' }], script: SCRIPT, path: '/tmp/audit.workflow.json',
          cwd: options?.cwd,
        }
      },
    }
    const resolved = await resolveWorkflowSource(
      { workflows: registry },
      parseWorkflowToolRequest({ name: 'audit', args: { target: 'main' } }),
      { agent: agent('/workspace') },
    )
    expect(resolved).toMatchObject({
      script: SCRIPT,
      meta: { name: 'audit', description: 'd', whenToUse: 'before merge', phases: [{ title: 'Inspect' }] },
      args: { target: 'main' },
      filename: '/tmp/audit.workflow.json',
    })
    await expect(resolveWorkflowSource(
      { workflows: { get: async () => undefined } },
      parseWorkflowToolRequest({ name: 'audit' }),
    )).rejects.toThrow('no saved workflow named "audit"')
  })

  it('snapshots inline script+meta and bounds UTF-8 size', async () => {
    const meta = { name: 'inline', description: 'd', whenToUse: 'now' }
    const resolved = await resolveWorkflowSource({}, parseWorkflowToolRequest({ script: SCRIPT, meta }))
    meta.whenToUse = 'later'
    expect(resolved.filename).toBe('<inline workflow>')
    expect(resolved.meta).toEqual({ name: 'inline', description: 'd', whenToUse: 'now' })
    await expect(resolveWorkflowSource({}, parseWorkflowToolRequest({ script: '€', meta: META }), { definitionMaxBytes: 2 }))
      .rejects.toThrow(/exceeds the 2-byte limit/u)
  })

  it('reads envelopes and bare files through Host readBytesNoFollow', async () => {
    const envelope = encoder.encode(`${JSON.stringify({
      meta: { ...META, whenToUse: 'before merge', phases: [{ title: 'Inspect' }] },
      script: SCRIPT,
    })}\n`)
    const ctx = {
      fs: fsReturning(envelope),
    }
    const fromEnvelope = await resolveWorkflowSource(
      ctx,
      parseWorkflowToolRequest({ script_path: '/tmp/audit.workflow.json' }),
      { agent: agent('/tmp') },
    )
    expect(fromEnvelope.meta).toMatchObject({
      name: 'audit', whenToUse: 'before merge', phases: [{ title: 'Inspect' }],
    })
    expect(fromEnvelope.script).toBe(SCRIPT)

    const plainEnvelope = await resolveWorkflowSource(
      { fs: fsReturning(encoder.encode(`${JSON.stringify({ meta: META, script: SCRIPT })}\n`)) },
      parseWorkflowToolRequest({ script_path: '/tmp/audit.workflow.json' }),
    )
    expect(plainEnvelope.meta).toEqual({ name: 'audit', description: 'd' })

    const bare = await resolveWorkflowSource(
      { fs: fsReturning(encoder.encode(SCRIPT)) },
      parseWorkflowToolRequest({ script_path: '/tmp/audit.js', meta: META }),
    )
    expect(bare.script).toBe(SCRIPT)
    expect(bare.filename).toBe('/tmp/audit.js')
  })

  it('rejects relative script_path without an absolute Session cwd and missing Host fs', async () => {
    await expect(resolveWorkflowSource(
      { fs: fsReturning(encoder.encode(SCRIPT)) },
      parseWorkflowToolRequest({ script_path: 'audit.js', meta: META }),
    )).rejects.toThrow(/must be absolute/u)
    await expect(resolveWorkflowSource(
      {},
      parseWorkflowToolRequest({ script_path: '/tmp/audit.js', meta: META }),
    )).rejects.toThrow(/readBytesNoFollow/u)
    await expect(resolveWorkflowSource(
      {},
      parseWorkflowToolRequest({ resume_from_run_id: 'run-1' }),
    )).rejects.toThrow(/resume request has no source/u)
  })

  it('translates Host filesystem errors and invalid UTF-8', async () => {
    const path = '/tmp/missing.js'
    await expect(resolveWorkflowSource(
      { fs: fsReturning(undefined, new FsError('gone', 'FS_NOT_FOUND')) },
      parseWorkflowToolRequest({ script_path: path, meta: META }),
    )).rejects.toThrow(`workflow script_path "${path}" was not found`)
    await expect(resolveWorkflowSource(
      { fs: fsReturning(undefined, { code: 'ENOENT' }) },
      parseWorkflowToolRequest({ script_path: path, meta: META }),
    )).rejects.toThrow(/was not found/u)
    await expect(resolveWorkflowSource(
      { fs: fsReturning(undefined, new FsError('link', 'FS_NOT_REGULAR_FILE')) },
      parseWorkflowToolRequest({ script_path: path, meta: META }),
    )).rejects.toThrow(/must be a regular file/u)
    await expect(resolveWorkflowSource(
      { fs: fsReturning(undefined, new FsError('big', 'FS_TOO_LARGE')) },
      parseWorkflowToolRequest({ script_path: path, meta: META }),
    )).rejects.toThrow(/exceeds the 1048576-byte limit/u)
    await expect(resolveWorkflowSource(
      { fs: fsReturning(new Uint8Array([0xff])) },
      parseWorkflowToolRequest({ script_path: path, meta: META }),
    )).rejects.toThrow(/is not valid UTF-8/u)
    await expect(resolveWorkflowSource(
      { fs: fsReturning(undefined, new Error('io')) },
      parseWorkflowToolRequest({ script_path: path, meta: META }),
    )).rejects.toThrow('io')
    await expect(resolveWorkflowSource(
      { fs: fsReturning(undefined, { code: 1 }) },
      parseWorkflowToolRequest({ script_path: path, meta: META }),
    )).rejects.toMatchObject({ code: 1 })
  })

  it('rejects oversized returned bytes, invalid limits, and caller abort', async () => {
    await expect(resolveWorkflowSource(
      { fs: { async readBytesNoFollow() { return new Uint8Array(8) } } },
      parseWorkflowToolRequest({ script_path: '/tmp/audit.js', meta: META }),
      { definitionMaxBytes: 4 },
    )).rejects.toThrow(/exceeds the 4-byte limit/u)
    await expect(resolveWorkflowSource(
      { fs: { async readBytesNoFollow() { return 'nope' } } },
      parseWorkflowToolRequest({ script_path: '/tmp/audit.js', meta: META }),
    )).rejects.toThrow(/exceeds the 1048576-byte limit/u)
    await expect(resolveWorkflowSource({}, parseWorkflowToolRequest({ script: SCRIPT, meta: META }), { definitionMaxBytes: 0 }))
      .rejects.toThrow(/definitionMaxBytes/u)
    const controller = new AbortController()
    controller.abort()
    await expect(resolveWorkflowSource(
      { fs: fsReturning(encoder.encode(SCRIPT)) },
      parseWorkflowToolRequest({ script_path: '/tmp/audit.js', meta: META }),
      { signal: controller.signal },
    )).rejects.toThrow()
  })

  it('does not observe later file mutation after the Host read', async () => {
    let current = encoder.encode(SCRIPT)
    const resolved = await resolveWorkflowSource(
      { fs: { async readBytesNoFollow() { return current } } },
      parseWorkflowToolRequest({ script_path: '/tmp/audit.js', meta: META }),
    )
    current = encoder.encode('complete({ mutated: true })')
    expect(resolved.script).toBe(SCRIPT)
  })

  it('rejects a handmade bare path without meta after the Host read', async () => {
    await expect(resolveWorkflowSource(
      { fs: fsReturning(encoder.encode(SCRIPT)) },
      { kind: 'fresh', source: { kind: 'script_path', path: '/tmp/audit.js' }, args: {}, validateOnly: false } as any,
    )).rejects.toThrow(/requires the meta object/u)
  })

  it('accepts a Windows absolute script_path', async () => {
    const resolved = await resolveWorkflowSource(
      { fs: fsReturning(encoder.encode(SCRIPT)) },
      parseWorkflowToolRequest({ script_path: 'C:\\tmp\\audit.js', meta: META }),
    )
    expect(resolved.script).toBe(SCRIPT)
  })

  it('reads through the published RC2 local fs shape without readBytesNoFollow', async () => {
    const root = await mkdtemp(resolvePath(tmpdir(), 'dsh-workflow-source-'))
    try {
      await writeFile(resolvePath(root, 'audit.js'), SCRIPT)
      const resolved = await resolveWorkflowSource(
        { fs: publishedRc2LocalFs() },
        parseWorkflowToolRequest({ script_path: 'audit.js', meta: META }),
        { agent: agent(root) },
      )
      expect(resolved).toMatchObject({ script: SCRIPT, filename: 'audit.js', meta: META })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('works with the actual published @deepseek-ai/dsh RC2 local fs service', async () => {
    const root = await mkdtemp(resolvePath(tmpdir(), 'dsh-workflow-source-'))
    const requireFromDsh = createRequire(createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json'))
    const localEntry = requireFromDsh.resolve('@deepseek-ai/dsh-fs-local')
    const { LocalFileSystem } = await import(pathToFileURL(localEntry).href) as {
      LocalFileSystem: new (ctx: Context, config: { cwd: string; diffBasisMaxBytes: number }) => HostRc2Fs
    }
    const ctx = new Context()
    try {
      await writeFile(resolvePath(root, 'audit.js'), SCRIPT)
      const fs = new LocalFileSystem(ctx, { cwd: root, diffBasisMaxBytes: 1_048_576 })
      expect('readBytesNoFollow' in fs).toBe(false)
      const resolved = await resolveWorkflowSource(
        { fs },
        parseWorkflowToolRequest({ script_path: 'audit.js', meta: META }),
        { agent: agent(root) },
      )
      expect(resolved.script).toBe(SCRIPT)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('keeps the RC2 fallback bounded, abortable, and final-component no-follow', async () => {
    const root = await mkdtemp(resolvePath(tmpdir(), 'dsh-workflow-source-'))
    const outside = resolvePath(root, 'outside.js')
    try {
      const path = resolvePath(root, 'audit.js')
      await writeFile(path, SCRIPT)
      await writeFile(outside, 'complete({ outside: true })')
      await expect(resolveWorkflowSource(
        { fs: publishedRc2LocalFs() },
        parseWorkflowToolRequest({ script_path: path, meta: META }),
        { definitionMaxBytes: 4 },
      )).rejects.toThrow(/exceeds the 4-byte limit/u)

      await rm(path)
      await symlink(outside, path)
      await expect(resolveWorkflowSource(
        { fs: publishedRc2LocalFs() },
        parseWorkflowToolRequest({ script_path: path, meta: META }),
      )).rejects.toThrow(/must be a regular file/u)

      await rm(path)
      await writeFile(path, SCRIPT)
      let swapped = false
      await expect(resolveWorkflowSource(
        { fs: publishedRc2LocalFs(async displayPath => {
          if (swapped) return
          swapped = true
          await rm(displayPath)
          await symlink(outside, displayPath)
        }) },
        parseWorkflowToolRequest({ script_path: path, meta: META }),
      )).rejects.toThrow(/must be a regular file/u)

      await rm(path)
      await writeFile(path, SCRIPT)
      const controller = new AbortController()
      controller.abort()
      await expect(resolveWorkflowSource(
        { fs: publishedRc2LocalFs() },
        parseWorkflowToolRequest({ script_path: path, meta: META }),
        { signal: controller.signal },
      )).rejects.toThrow()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('fails closed instead of applying the RC2 local fallback to a remote-shaped provider', async () => {
    const remote = {
      ...publishedRc2LocalFs(),
      async resolve() { return { displayPath: '/workspace/audit.js', targetKey: 'remote://workspace/audit.js' } },
      async lstat() { return { version: 'remote-v1', type: 'file', size: 1 } },
      processPath() { return '/workspace/audit.js' },
      fileUrl() { return 'file:///workspace/audit.js' },
    }
    await expect(resolveWorkflowSource(
      { fs: remote },
      parseWorkflowToolRequest({ script_path: '/workspace/audit.js', meta: META }),
    )).rejects.toThrow(/published RC2 local filesystem capability/u)
  })
})
