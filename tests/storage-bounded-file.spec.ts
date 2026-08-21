import { constants } from 'node:fs'
import { chmod, link, mkdir, mkdtemp, open, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  BoundedFileError,
  assertSafeComponent,
  readBoundedUtf8,
  readOwnedRegularFile,
  writeBoundedAtomic,
  writeOwnedFileAtomic,
} from '../src/supervisor/storage/bounded-file.js'

const posixOnly = process.platform !== 'win32'
const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function temp(prefix = 'dsh-bounded-file-'): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), prefix))
  roots.push(path)
  await chmod(path, 0o700)
  return path
}

function directory(files: Map<string, Uint8Array>, overrides: Record<string, unknown> = {}) {
  let identities = 0
  return {
    path: '/virtual/private',
    identityCalls: () => identities,
    async assertIdentity(signal?: AbortSignal) {
      signal?.throwIfAborted()
      identities += 1
    },
    async readBytes(name: string, signal: AbortSignal | undefined, maxBytes: number) {
      signal?.throwIfAborted()
      const bytes = files.get(name)
      if (bytes === undefined) throw Object.assign(new Error('missing'), { code: 'FS_NOT_FOUND' })
      if (bytes.byteLength > maxBytes) {
        throw new BoundedFileError(`private file "${name}" exceeds ${maxBytes} bytes`, 'WORKFLOW_STORAGE_LIMIT')
      }
      return bytes
    },
    async writeText(
      name: string,
      content: string,
      expected: { readonly kind: string; readonly version?: unknown },
      signal?: AbortSignal,
    ) {
      signal?.throwIfAborted()
      if (expected.kind === 'createIfAbsent' && files.has(name)) {
        throw new BoundedFileError(`private file "${name}" already exists`)
      }
      if (expected.kind === 'replaceIfVersion' && expected.version !== files.get(name)) {
        throw new BoundedFileError(`private file "${name}" has changed`, 'WORKFLOW_STALE_REVISION')
      }
      const bytes = new TextEncoder().encode(content)
      files.set(name, bytes)
      return { operation: expected.kind, version: bytes, before: null, after: content }
    },
    async close() { /* closed */ },
    ...overrides,
  }
}

describe('bounded storage files (RS10)', () => {
  it('rejects unsafe single-component names', () => {
    for (const value of ['', '.', '..', '/abs', 'a/b', 'a\\b', `${'a'.repeat(256)}`]) {
      expect(() => assertSafeComponent(value)).toThrow(BoundedFileError)
    }
    expect(assertSafeComponent('script.js')).toBe('script.js')
    expect(assertSafeComponent('a'.repeat(255))).toHaveLength(255)
  })

  it('reads and publishes through a retained private-directory capability', async () => {
    const files = new Map<string, Uint8Array>([['manifest.json', new TextEncoder().encode('{"ok":true}')]])
    const cap = directory(files)
    const bytes = await readOwnedRegularFile(cap as any, 'manifest.json', { maxBytes: 32 })
    expect(new TextDecoder().decode(bytes)).toBe('{"ok":true}')
    expect(bytes).not.toBe(files.get('manifest.json'))
    expect(cap.identityCalls()).toBe(2)

    const created = await writeOwnedFileAtomic(cap as any, 'created.json', new TextEncoder().encode('{"n":1}'), {
      maxBytes: 32,
      expected: { kind: 'createIfAbsent' },
    })
    expect(created.operation).toBe('createIfAbsent')
    expect(new TextDecoder().decode(files.get('created.json'))).toBe('{"n":1}')

    await expect(writeOwnedFileAtomic(cap as any, 'created.json', new TextEncoder().encode('{"n":2}'), {
      maxBytes: 32,
      expected: { kind: 'createIfAbsent' },
    })).rejects.toMatchObject({ message: 'private file "created.json" already exists' })

    const replaced = await writeOwnedFileAtomic(cap as any, 'created.json', new TextEncoder().encode('{"n":3}'), {
      maxBytes: 32,
      expected: { kind: 'replaceIfVersion', version: files.get('created.json') },
    })
    expect(replaced.operation).toBe('replaceIfVersion')
  })

  it('enforces byte caps, abort, invalid UTF-8, and identity revalidation', async () => {
    const files = new Map<string, Uint8Array>([['big.json', new Uint8Array(8)]])
    const cap = directory(files)
    await expect(readOwnedRegularFile(cap as any, 'big.json', { maxBytes: 4 })).rejects.toMatchObject({
      code: 'WORKFLOW_STORAGE_LIMIT',
    })
    await expect(readOwnedRegularFile(cap as any, 'big.json', { maxBytes: -1 })).rejects.toBeInstanceOf(RangeError)
    await expect(writeOwnedFileAtomic(cap as any, 'too-big.json', new Uint8Array(5), {
      maxBytes: 4,
      expected: { kind: 'createIfAbsent' },
    })).rejects.toMatchObject({ code: 'WORKFLOW_STORAGE_LIMIT' })

    const aborted = AbortSignal.abort()
    await expect(readOwnedRegularFile(cap as any, 'big.json', { maxBytes: 32, signal: aborted })).rejects.toMatchObject({
      name: 'AbortError',
    })
    await expect(writeOwnedFileAtomic(cap as any, 'next.json', new TextEncoder().encode('{}'), {
      maxBytes: 32,
      expected: { kind: 'createIfAbsent' },
      signal: aborted,
    })).rejects.toMatchObject({ name: 'AbortError' })

    await expect(writeOwnedFileAtomic(cap as any, 'bad.json', new Uint8Array([0xff]), {
      maxBytes: 8,
      expected: { kind: 'createIfAbsent' },
    })).rejects.toMatchObject({ code: 'WORKFLOW_STORAGE_CORRUPT', message: 'private file "bad.json" is not valid UTF-8' })

    const swapped = directory(files, {
      async assertIdentity() {
        throw new BoundedFileError('workflow storage path "/virtual/private" is unsafe: directory identity changed')
      },
    })
    await expect(readOwnedRegularFile(swapped as any, 'big.json', { maxBytes: 32 })).rejects.toMatchObject({
      code: 'WORKFLOW_STORAGE_UNSAFE',
    })
  })

  it.skipIf(!posixOnly)('reads a private 0600 regular file and rejects links, modes, and oversize', async () => {
    const root = await temp()
    const file = join(root, 'manifest.json')
    await writeFile(file, '{"ok":true}\n', { mode: 0o600 })
    await chmod(file, 0o600)
    expect(await readBoundedUtf8(file, 64)).toBe('{"ok":true}\n')

    await writeFile(file, 'x'.repeat(8), { mode: 0o600 })
    await chmod(file, 0o600)
    await expect(readBoundedUtf8(file, 4)).rejects.toMatchObject({ code: 'WORKFLOW_STORAGE_LIMIT' })

    const linked = join(root, 'hard.json')
    await writeFile(linked, 'one\n', { mode: 0o600 })
    await chmod(linked, 0o600)
    await link(linked, join(root, 'alias.json'))
    await expect(readBoundedUtf8(linked, 32)).rejects.toMatchObject({
      code: 'WORKFLOW_STORAGE_UNSAFE',
      message: expect.stringContaining('file is not a private regular single-link file'),
    })

    const symlinkPath = join(root, 'link.json')
    await symlink(file, symlinkPath)
    await expect(readBoundedUtf8(symlinkPath, 32)).rejects.toThrow()

    const wide = join(root, 'wide.json')
    await writeFile(wide, 'ok\n', { mode: 0o644 })
    await chmod(wide, 0o644)
    await expect(readBoundedUtf8(wide, 32)).rejects.toMatchObject({ code: 'WORKFLOW_STORAGE_UNSAFE' })

    const invalid = join(root, 'invalid.json')
    const handle = await open(invalid, constants.O_CREAT | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600)
    try { await handle.write(Buffer.from([0xff, 0xfe])) } finally { await handle.close() }
    await chmod(invalid, 0o600)
    await expect(readBoundedUtf8(invalid, 32)).rejects.toMatchObject({ code: 'WORKFLOW_STORAGE_CORRUPT' })
  })

  it.skipIf(!posixOnly)('publishes atomically, refuses replace of a link, and cleans a failed staging file', async () => {
    const root = await temp()
    const dest = join(root, 'head.json')
    await writeBoundedAtomic(dest, '{"ok":true}\n', { maxBytes: 32 })
    expect(await readFile(dest, 'utf8')).toBe('{"ok":true}\n')
    const staging = (await (await import('node:fs/promises')).readdir(root)).filter(name => name.endsWith('.tmp'))
    expect(staging).toEqual([])

    await writeBoundedAtomic(dest, '{"ok":false}\n', { maxBytes: 32 })
    expect(await readFile(dest, 'utf8')).toBe('{"ok":false}\n')

    await expect(writeBoundedAtomic(dest, '{"again":true}\n', { maxBytes: 32, createOnly: true })).rejects.toMatchObject({
      code: 'WORKFLOW_STORAGE_UNSAFE',
      message: expect.stringContaining('destination already exists'),
    })
    expect(await readFile(dest, 'utf8')).toBe('{"ok":false}\n')

    await expect(writeBoundedAtomic(dest, 'x'.repeat(8), { maxBytes: 4 })).rejects.toMatchObject({
      code: 'WORKFLOW_STORAGE_LIMIT',
    })
    await expect(writeBoundedAtomic(dest, '{}', { maxBytes: 8, mode: 0o644 })).rejects.toMatchObject({
      message: expect.stringContaining('workflow storage files must use mode 0600'),
    })

    const linked = join(root, 'linked.json')
    await writeFile(linked, 'one\n', { mode: 0o600 })
    await chmod(linked, 0o600)
    await link(linked, join(root, 'other.json'))
    await expect(writeBoundedAtomic(linked, 'two\n', { maxBytes: 8 })).rejects.toMatchObject({
      code: 'WORKFLOW_STORAGE_UNSAFE',
    })
  })

  it.skipIf(posixOnly)('fails closed without no-follow primitives on Windows', async () => {
    await expect(readBoundedUtf8('C:\\workflows\\manifest.json', 32)).rejects.toMatchObject({
      code: 'WORKFLOW_STORAGE_UNSUPPORTED',
    })
    await expect(writeBoundedAtomic('C:\\workflows\\manifest.json', '{}', { maxBytes: 32 })).rejects.toMatchObject({
      code: 'WORKFLOW_STORAGE_UNSUPPORTED',
    })
  })
})
