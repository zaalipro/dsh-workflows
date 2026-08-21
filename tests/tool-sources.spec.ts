import { describe, expect, it } from 'vitest'

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
})
