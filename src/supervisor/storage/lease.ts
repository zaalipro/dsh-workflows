import { constants } from 'node:fs'
import type { Stats } from 'node:fs'
import { lstat, mkdir, open, realpath } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import { dirname, isAbsolute, join, parse, sep } from 'node:path'
import { BoundedFileError } from './bounded-file.js'

export interface WorkflowStorageAnchor {
  readonly root: string
  readonly anchorPath: string
  readonly file: FileHandle
  readonly rootFile: FileHandle
  readonly rootIdentity: { readonly dev: number; readonly ino: number }
  readonly identity: { readonly dev: number; readonly ino: number }
  assertCurrent(signal?: AbortSignal): Promise<void>
  close(): Promise<void>
}

export interface WorkflowStorageLease {
  readonly anchor: WorkflowStorageAnchor
  assertCurrent(signal?: AbortSignal): Promise<void>
  release(): Promise<void>
}

const O_DIRECTORY = (constants as Record<string, number>).O_DIRECTORY ?? 0
const O_NOFOLLOW = (constants as Record<string, number>).O_NOFOLLOW

function unsupported(): BoundedFileError {
  return new BoundedFileError(`safe workflow storage is unavailable on ${process.platform}`, 'WORKFLOW_STORAGE_UNSUPPORTED')
}

const UNSUPPORTED_LOCK_ERRNOS = new Set(['ENOSYS', 'ENOTSUP', 'EOPNOTSUPP', 'ENOLCK'])

function errorErrno(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined
  const code = (error as { readonly code?: unknown }).code
  return typeof code === 'string' ? code : undefined
}

/** Missing addon/platform lock primitives stay UNSUPPORTED. Unexpected I/O
 * during tryLock is a compromised root, not another live owner. */
function isUnsupportedLockError(error: unknown): boolean {
  const code = errorErrno(error)
  return code !== undefined && UNSUPPORTED_LOCK_ERRNOS.has(code)
}

export interface WorkflowStorageLockAdapter {
  readonly tryLock: (fd: number) => boolean
  readonly unlock: (fd: number) => void
}

function unsafe(root: string, detail: string, cause?: unknown): BoundedFileError {
  return new BoundedFileError(
    `workflow storage path "${root}" is unsafe: ${detail}`,
    'WORKFLOW_STORAGE_UNSAFE',
    cause === undefined ? undefined : { cause },
  )
}

function sameIdentity(a: Stats, b: Stats): boolean {
  return Number(a.dev) === Number(b.dev) && Number(a.ino) === Number(b.ino)
}

function ownerOk(info: Stats): boolean {
  return typeof process.getuid !== 'function' || info.uid === process.getuid()
}

function assertRootInfo(info: Stats, root: string): void {
  if (!info.isDirectory() || !ownerOk(info) || (info.mode & 0o777) !== 0o700) throw unsafe(root, 'runs root must be an owner-only 0700 directory')
}

function assertAnchorInfo(info: Stats, root: string): void {
  if (!info.isFile() || info.nlink !== 1 || !ownerOk(info) || (info.mode & 0o777) !== 0o600) throw unsafe(root, 'lock anchor must be an owner-only 0600 regular file')
}

/** Resolve ordinary system alias links (for example macOS /var ->
 * /private/var) while rejecting a link at the runs-root component itself.
 * The returned path is the spelling whose ancestors can be opened one
 * component at a time and identity-pinned. */
async function canonicalStoragePath(path: string, root: string): Promise<string> {
  if (!isAbsolute(path)) throw unsafe(root, 'runs root must be absolute')
  const parsed = parse(path)
  // macOS exposes a small set of documented system aliases.  They are not a
  // caller-controlled workspace boundary; arbitrary symlink ancestors remain
  // unsafe and are rejected before realpath is allowed to follow them.
  const allowedAliases = process.platform === 'darwin' ? new Set(['/var', '/tmp', '/etc']) : new Set<string>()
  let lexical = parsed.root
  for (const part of path.slice(parsed.root.length).split(sep).filter(Boolean)) {
    lexical = join(lexical, part)
    try {
      const entry = await lstat(lexical)
      if (entry.isSymbolicLink() && !allowedAliases.has(lexical)) throw unsafe(root, `ancestor "${lexical}" is a symbolic link`)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') break
      throw error
    }
  }
  let current = path
  const missing: string[] = []
  while (true) {
    try {
      const info = await lstat(current)
      if (info.isSymbolicLink() && missing.length === 0) throw unsafe(root, 'runs root is a symbolic link')
      if (!info.isDirectory() && !info.isSymbolicLink() && missing.length > 0) throw unsafe(root, `ancestor "${current}" is not a directory`)
      const resolved = await realpath(current)
      return missing.length === 0 ? resolved : [resolved, ...missing].join(sep)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      const parent = dirname(current)
      if (parent === current || current === parsed.root) throw unsafe(root, 'runs root has no accessible ancestor', error)
      missing.unshift(current.slice(parent.length + (parent.endsWith(sep) ? 0 : 1)))
      current = parent
    }
  }
}

/** Open and identity-pin the owner-only runs root and permanent lock anchor. */
export async function openWorkflowStorageAnchor(options: { readonly runsRoot: string; readonly signal?: AbortSignal }): Promise<WorkflowStorageAnchor> {
  const requestedRoot = options.runsRoot
  options.signal?.throwIfAborted()
  if (process.platform === 'win32' || O_NOFOLLOW === undefined || O_NOFOLLOW === 0 || O_DIRECTORY === 0) throw unsupported()
  let rootFile: FileHandle | undefined
  let anchorFile: FileHandle | undefined
  try {
    const root = await canonicalStoragePath(requestedRoot, requestedRoot)
    let rootInfo: Stats
    try {
      rootInfo = await lstat(root)
      if (rootInfo.isSymbolicLink()) throw unsafe(root, 'runs root is a symbolic link')
      assertRootInfo(rootInfo, root)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      // The caller resolves/creates dshHome before storage bootstrap.  Creating
      // only this final component avoids an implicit path walk through missing
      // ancestors after they were checked above.
      try { await mkdir(root, { mode: 0o700 }) }
      catch (mkdirError) {
        if ((mkdirError as NodeJS.ErrnoException).code !== 'EEXIST') throw mkdirError
      }
      rootInfo = await lstat(root)
      assertRootInfo(rootInfo, root)
    }
    rootFile = await open(root, constants.O_RDONLY | O_DIRECTORY | O_NOFOLLOW)
    const retainedRoot = await rootFile.stat()
    assertRootInfo(retainedRoot, root)
    if (!sameIdentity(retainedRoot, rootInfo)) throw unsafe(root, 'runs root identity changed while opening')
    options.signal?.throwIfAborted()
    const anchorPath = `${root}${root.endsWith(sep) ? '' : sep}.workflow-storage.lock`
    anchorFile = await open(anchorPath, constants.O_CREAT | constants.O_RDWR | O_NOFOLLOW, 0o600)
    const anchorInfo = await anchorFile.stat()
    assertAnchorInfo(anchorInfo, root)
    const currentAnchor = await lstat(anchorPath)
    if (!sameIdentity(anchorInfo, currentAnchor)) throw unsafe(root, 'lock anchor identity changed while opening')
    const rootIdentity = { dev: Number(retainedRoot.dev), ino: Number(retainedRoot.ino) }
    const anchorIdentity = { dev: Number(anchorInfo.dev), ino: Number(anchorInfo.ino) }
    const assertCurrent = async (signal?: AbortSignal): Promise<void> => {
      signal?.throwIfAborted()
      try {
        const [retained, currentRoot, retainedAnchor, currentAnchorNow] = await Promise.all([
          rootFile!.stat(),
          lstat(root),
          anchorFile!.stat(),
          lstat(anchorPath),
        ])
        signal?.throwIfAborted()
        assertRootInfo(retained, root)
        assertRootInfo(currentRoot, root)
        assertAnchorInfo(retainedAnchor, root)
        assertAnchorInfo(currentAnchorNow, root)
        if (!sameIdentity(retained, currentRoot)
          || Number(retained.dev) !== rootIdentity.dev
          || Number(retained.ino) !== rootIdentity.ino
          || !sameIdentity(retainedAnchor, currentAnchorNow)
          || Number(retainedAnchor.dev) !== anchorIdentity.dev
          || Number(retainedAnchor.ino) !== anchorIdentity.ino) {
          throw unsafe(root, 'root or lock anchor identity changed')
        }
      } catch (error) {
        if (error instanceof BoundedFileError || signal?.aborted) throw error
        throw unsafe(root, 'root or lock anchor could not be revalidated', error)
      }
    }
    let closePromise: Promise<void> | undefined
    return {
      root,
      anchorPath,
      file: anchorFile,
      rootFile,
      rootIdentity,
      identity: anchorIdentity,
      assertCurrent,
      close(): Promise<void> {
        closePromise ??= (async () => {
          let first: unknown
          try { await rootFile!.close() } catch (error) { first = error }
          try { await anchorFile!.close() } catch (error) { first ??= error }
          if (first !== undefined) throw first
        })()
        return closePromise
      },
    }
  } catch (error) {
    await anchorFile?.close().catch(() => undefined)
    await rootFile?.close().catch(() => undefined)
    if (error instanceof BoundedFileError) throw error
    throw unsafe(requestedRoot, error instanceof Error ? error.message : String(error), error)
  }
}

async function lockFunctions(): Promise<{ readonly tryLock?: (fd: number) => boolean; readonly unlock?: (fd: number) => void }> {
  try {
    const module = await import('fs-native-extensions') as typeof import('fs-native-extensions')
    // The addon exposes named exports and a CommonJS-compatible default object.
    const candidate = module as typeof module & { readonly default?: typeof module }
    return {
      tryLock: module.tryLock ?? candidate.default?.tryLock,
      unlock: module.unlock ?? candidate.default?.unlock,
    }
  } catch {
    return {}
  }
}

/** Acquire the native cooperating-process lifetime lease. */
export async function acquireWorkflowStorageLease(
  anchor: WorkflowStorageAnchor,
  signal?: AbortSignal,
  adapter?: WorkflowStorageLockAdapter,
): Promise<WorkflowStorageLease> {
  signal?.throwIfAborted()
  await anchor.assertCurrent(signal)
  const locks = adapter ?? await lockFunctions()
  const tryLock = locks.tryLock
  const unlock = locks.unlock
  if (tryLock === undefined || unlock === undefined) {
    await anchor.close().catch(() => undefined)
    throw unsupported()
  }
  let locked = false
  try {
    locked = tryLock(anchor.file.fd)
  } catch (error) {
    await anchor.close().catch(() => undefined)
    if (isUnsupportedLockError(error)) {
      throw new BoundedFileError(`safe workflow storage is unavailable on ${process.platform}`, 'WORKFLOW_STORAGE_UNSUPPORTED', { cause: error })
    }
    throw unsafe(anchor.root, error instanceof Error ? error.message : String(error), error)
  }
  if (!locked) {
    await anchor.close().catch(() => undefined)
    throw new BoundedFileError('workflow storage root is already owned by another live process', 'WORKFLOW_STORAGE_OWNED')
  }
  try {
    signal?.throwIfAborted()
  } catch (error) {
    try { unlock(anchor.file.fd) } catch { /* closing the handle also drops the lock */ }
    await anchor.close().catch(() => undefined)
    throw error
  }
  let releaseStarted = false
  let releasePromise: Promise<void> | undefined
  return {
    anchor,
    assertCurrent(signal?: AbortSignal): Promise<void> {
      if (releaseStarted) {
        return Promise.reject(new BoundedFileError('workflow storage lease is released', 'WORKFLOW_STORAGE_UNSAFE'))
      }
      return anchor.assertCurrent(signal)
    },
    release(): Promise<void> {
      releasePromise ??= (async () => {
        releaseStarted = true
        let first: unknown
        try { unlock(anchor.file.fd) } catch (error) { first = error }
        try { await anchor.close() } catch (error) { first ??= error }
        if (first !== undefined) throw first
      })()
      return releasePromise
    },
  }
}
