import { constants } from 'node:fs'
import { chmod, mkdir, open, stat } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import { join } from 'node:path'
import { BoundedFileError } from './bounded-file.js'

export interface WorkflowStorageAnchor {
  readonly root: string
  readonly anchorPath: string
  readonly file: FileHandle
  readonly identity: { readonly dev: number; readonly ino: number }
  assertCurrent(): Promise<void>
  close(): Promise<void>
}

export interface WorkflowStorageLease {
  readonly anchor: WorkflowStorageAnchor
  assertCurrent(): Promise<void>
  release(): Promise<void>
}

async function lockFunctions(): Promise<{ readonly tryLock?: (fd: number) => boolean; readonly unlock?: (fd: number) => void }> {
  try {
    const module = await import('fs-native-extensions') as typeof import('fs-native-extensions')
    return { tryLock: module.tryLock, unlock: module.unlock }
  } catch {
    return {}
  }
}

/** Open and identity-pin the owner-only runs root and permanent lock anchor. */
export async function openWorkflowStorageAnchor(options: { readonly runsRoot: string; readonly signal?: AbortSignal }): Promise<WorkflowStorageAnchor> {
  options.signal?.throwIfAborted()
  try {
    await mkdir(options.runsRoot, { recursive: true, mode: 0o700 })
    await chmod(options.runsRoot, 0o700)
    const anchorPath = join(options.runsRoot, '.workflow-storage.lock')
    const file = await open(anchorPath, constants.O_CREAT | constants.O_RDWR | ((constants as Record<string, number>).O_NOFOLLOW ?? 0), 0o600)
    const identity = await file.stat()
    if (!identity.isFile() || identity.nlink !== 1 || (identity.mode & 0o777) !== 0o600) {
      await file.close()
      throw new BoundedFileError(`workflow storage path "${options.runsRoot}" is unsafe: lock anchor is not a private regular file`)
    }
    const assertCurrent = async (): Promise<void> => {
      const root = await stat(options.runsRoot)
      const current = await stat(anchorPath)
      if (!root.isDirectory() || root.dev !== identity.dev || current.dev !== identity.dev || current.ino !== identity.ino || current.nlink !== 1) {
        throw new BoundedFileError(`workflow storage path "${options.runsRoot}" is unsafe: identity changed`)
      }
    }
    let closed = false
    return {
      root: options.runsRoot,
      anchorPath,
      file,
      identity: { dev: Number(identity.dev), ino: Number(identity.ino) },
      assertCurrent,
      async close() { if (closed) return; closed = true; await file.close() },
    }
  } catch (error) {
    if (error instanceof BoundedFileError) throw error
    throw new BoundedFileError(`workflow storage path "${options.runsRoot}" is unsafe: ${error instanceof Error ? error.message : String(error)}`, 'WORKFLOW_STORAGE_UNSAFE', { cause: error })
  }
}

/** Acquire the native cooperating-process lifetime lease. */
export async function acquireWorkflowStorageLease(anchor: WorkflowStorageAnchor, signal?: AbortSignal): Promise<WorkflowStorageLease> {
  signal?.throwIfAborted()
  const { tryLock, unlock } = await lockFunctions()
  if (tryLock === undefined || unlock === undefined) {
    throw new BoundedFileError(`safe workflow storage is unavailable on ${process.platform}`, 'WORKFLOW_STORAGE_UNSUPPORTED')
  }
  let locked = false
  try { locked = tryLock(anchor.file.fd) } catch (error) { throw new BoundedFileError(`safe workflow storage is unavailable on ${process.platform}`, 'WORKFLOW_STORAGE_UNSUPPORTED', { cause: error }) }
  if (!locked) throw new BoundedFileError('workflow storage root is already owned by another live process', 'WORKFLOW_STORAGE_OWNED')
  let released = false
  return {
    anchor,
    assertCurrent: () => anchor.assertCurrent(),
    async release() {
      if (released) return
      released = true
      let first: unknown
      try { unlock(anchor.file.fd) } catch (error) { first = error }
      try { await anchor.close() } catch (error) { first ??= error }
      if (first !== undefined) throw first
    },
  }
}
