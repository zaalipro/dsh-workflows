import { constants } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { link, lstat, mkdir, open, rename, stat, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { FsPrivateDirectory } from './private-root.js'

export type BoundedFileErrorCode =
  | 'WORKFLOW_STORAGE_UNSAFE'
  | 'WORKFLOW_STORAGE_LIMIT'
  | 'WORKFLOW_STORAGE_CORRUPT'
  | 'WORKFLOW_STORAGE_UNSUPPORTED'
  | 'WORKFLOW_STORAGE_OWNED'
  | 'WORKFLOW_RUN_NOT_FOUND'
  | 'WORKFLOW_STALE_REVISION'

export class BoundedFileError extends Error {
  readonly code: BoundedFileErrorCode

  constructor(message: string, code: BoundedFileErrorCode = 'WORKFLOW_STORAGE_UNSAFE', options?: ErrorOptions) {
    super(message, options)
    this.name = 'BoundedFileError'
    this.code = code
  }
}

/** Structural equivalents of the compatible Host filesystem write vocabulary. */
export type OwnedFileWriteIntent =
  | { readonly kind: 'createIfAbsent' }
  | { readonly kind: 'replaceIfVersion'; readonly version: unknown }
export interface OwnedFileWriteOutcome {
  readonly operation: string
  readonly version: unknown
  readonly before: unknown
  readonly after: unknown
}

const COMPONENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u
const encoder = new TextEncoder()

function noFollowFlag(): number {
  const flag = (constants as Record<string, number>).O_NOFOLLOW
  if (process.platform === 'win32' || typeof flag !== 'number' || flag === 0) {
    throw new BoundedFileError(
      `safe workflow storage is unavailable on ${process.platform}`,
      'WORKFLOW_STORAGE_UNSUPPORTED',
    )
  }
  return flag
}

function unsafe(path: string, detail: string, cause?: unknown): BoundedFileError {
  return new BoundedFileError(
    `workflow storage path "${path}" is unsafe: ${detail}`,
    'WORKFLOW_STORAGE_UNSAFE',
    cause === undefined ? undefined : { cause },
  )
}

/** Validate a value before it is used as a descriptor-relative component. */
export function assertSafeComponent(value: string, label = 'path component'): string {
  if (
    !COMPONENT.test(value)
    || value === '.'
    || value === '..'
    || value.includes('/')
    || value.includes('\\')
    || Buffer.byteLength(value, 'utf8') > 255
  ) {
    throw new BoundedFileError(`${label} is unsafe: ${value}`)
  }
  return value
}

/** Read through a retained private-directory authority with a fixed byte cap. */
export async function readOwnedRegularFile(
  directory: FsPrivateDirectory,
  name: string,
  options: { readonly maxBytes: number; readonly signal?: AbortSignal },
): Promise<Uint8Array> {
  assertSafeComponent(name, 'file name')
  if (!Number.isSafeInteger(options.maxBytes) || options.maxBytes < 0) {
    throw new RangeError('maxBytes must be a non-negative safe integer')
  }
  options.signal?.throwIfAborted()
  await directory.assertIdentity(options.signal)
  const bytes = await directory.readBytes(name, options.signal, options.maxBytes)
  if (bytes.byteLength > options.maxBytes) {
    throw new BoundedFileError(`private file "${name}" exceeds ${options.maxBytes} bytes`, 'WORKFLOW_STORAGE_LIMIT')
  }
  await directory.assertIdentity(options.signal)
  return new Uint8Array(bytes)
}

/** Publish through the compatible Host's guarded private-directory operation. */
export async function writeOwnedFileAtomic(
  directory: FsPrivateDirectory,
  name: string,
  bytes: Uint8Array,
  options: { readonly maxBytes: number; readonly expected: OwnedFileWriteIntent; readonly signal?: AbortSignal },
): Promise<OwnedFileWriteOutcome> {
  assertSafeComponent(name, 'file name')
  if (!Number.isSafeInteger(options.maxBytes) || options.maxBytes < 0) {
    throw new RangeError('maxBytes must be a non-negative safe integer')
  }
  if (bytes.byteLength > options.maxBytes) {
    throw new BoundedFileError(`private file "${name}" exceeds ${options.maxBytes} bytes`, 'WORKFLOW_STORAGE_LIMIT')
  }
  options.signal?.throwIfAborted()
  await directory.assertIdentity(options.signal)
  let content: string
  try {
    content = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch (error) {
    throw new BoundedFileError(`private file "${name}" is not valid UTF-8`, 'WORKFLOW_STORAGE_CORRUPT', { cause: error })
  }
  const outcome = await directory.writeText(name, content, options.expected, options.signal)
  await directory.assertIdentity(options.signal)
  return outcome
}

/** Legacy path-shaped bounded read, retained for compatibility with early consumers. */
export async function readBoundedUtf8(path: string, maxBytes: number): Promise<string> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw new RangeError('maxBytes must be a non-negative safe integer')
  const handle = await open(path, constants.O_RDONLY | noFollowFlag())
  try {
    const info = await handle.stat()
    if (!info.isFile() || info.nlink !== 1 || (info.mode & 0o777) !== 0o600) {
      throw unsafe(path, 'file is not a private regular single-link file')
    }
    if (typeof process.getuid === 'function' && info.uid !== process.getuid()) throw unsafe(path, 'file has the wrong owner')
    if (info.size > maxBytes) throw new BoundedFileError(`${path} exceeds ${maxBytes} bytes`, 'WORKFLOW_STORAGE_LIMIT')
    const chunks: Buffer[] = []
    let total = 0
    while (total <= maxBytes) {
      const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, maxBytes - total + 1))
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, null)
      if (bytesRead === 0) break
      total += bytesRead
      if (total > maxBytes) throw new BoundedFileError(`${path} exceeds ${maxBytes} bytes`, 'WORKFLOW_STORAGE_LIMIT')
      chunks.push(chunk.subarray(0, bytesRead))
    }
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, total))
    } catch (error) {
      throw new BoundedFileError(`${path} is not valid UTF-8`, 'WORKFLOW_STORAGE_CORRUPT', { cause: error })
    }
  } finally {
    await handle.close()
  }
}

/** Legacy path-shaped atomic publication with fsync and final-component checks. */
export async function writeBoundedAtomic(
  path: string,
  content: string,
  options: { readonly maxBytes: number; readonly mode?: number; readonly createOnly?: boolean },
): Promise<void> {
  const bytes = encoder.encode(content)
  if (bytes.byteLength > options.maxBytes) {
    throw new BoundedFileError(`${path} exceeds ${options.maxBytes} bytes`, 'WORKFLOW_STORAGE_LIMIT')
  }
  const mode = options.mode ?? 0o600
  if (mode !== 0o600) throw unsafe(path, 'workflow storage files must use mode 0600')
  const parent = dirname(path)
  await mkdir(parent, { recursive: true, mode: 0o700 })
  const temp = join(parent, `.${randomBytes(16).toString('hex')}.tmp`)
  const handle = await open(temp, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | noFollowFlag(), mode)
  try {
    let offset = 0
    while (offset < bytes.byteLength) {
      const { bytesWritten } = await handle.write(bytes, offset, bytes.byteLength - offset, offset)
      if (bytesWritten <= 0) throw unsafe(temp, 'short write')
      offset += bytesWritten
    }
    await handle.sync()
    if (options.createOnly) {
      try {
        await lstat(path)
        throw unsafe(path, 'destination already exists')
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
    } else {
      try {
        const current = await lstat(path)
        if (!current.isFile() || current.isSymbolicLink() || current.nlink !== 1) {
          throw unsafe(path, 'destination is not a regular single-link file')
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
    }
    if (options.createOnly) {
      try {
        await link(temp, path)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw unsafe(path, 'destination already exists', error)
        throw error
      }
      await unlink(temp)
    } else {
      await rename(temp, path)
    }
    const published = await stat(path)
    if (!published.isFile() || published.nlink !== 1 || (published.mode & 0o777) !== 0o600) {
      throw unsafe(path, 'published file identity is invalid')
    }
    const parentHandle = await open(parent, constants.O_RDONLY | ((constants as Record<string, number>).O_DIRECTORY ?? 0))
    try { await parentHandle.sync() } finally { await parentHandle.close() }
  } finally {
    await handle.close().catch(() => undefined)
    await unlink(temp).catch(() => undefined)
  }
}
