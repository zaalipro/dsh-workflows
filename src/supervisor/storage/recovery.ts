import { lstat, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { RecoveredRun, WorkflowStoreOptions } from './manifest-types.js'
import type { WorkflowRunStore } from './manifest-types.js'
import { BoundedFileError } from './bounded-file.js'
import { assertSafeComponent } from './bounded-file.js'
import type { PrivateDirectory, WorkflowStorageLayout } from './private-root.js'

function unsafe(root: string, detail: string): BoundedFileError {
  return new BoundedFileError(`workflow storage path "${root}" is unsafe: ${detail}`, 'WORKFLOW_STORAGE_UNSAFE')
}

/**
 * Enumerate every descendant before handing control to manifest recovery.
 * The counter is shared across all four categories and includes files,
 * directories, and nested detail/scratch entries.  No recovery mutation is
 * allowed until this complete bounded inventory succeeds.
 */
async function inventory(path: string, root: string, limit: number, count: { value: number }, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted()
  let info
  try { info = await lstat(path) } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw error
  }
  if (info.isSymbolicLink()) throw unsafe(root, `symbolic link encountered at "${path}"`)
  count.value += 1
  if (count.value > limit) throw unsafe(root, `recovery scan exceeds ${limit} entries`)
  if (!info.isDirectory()) return
  const names = (await readdir(path)).sort()
  for (const name of names) {
    assertSafeComponent(name, 'storage entry')
    await inventory(join(path, name), root, limit, count, signal)
  }
}

/**
 * Inventory a retained descriptor-rooted layout.  This is deliberately kept
 * separate from the legacy path fixture below: once Host capabilities have
 * been opened, recovery must not downgrade them to string-based traversal.
 */
async function inventoryDirectoryCapability(
  directory: PrivateDirectory,
  root: string,
  limit: number,
  count: { value: number },
  signal?: AbortSignal,
): Promise<void> {
  signal?.throwIfAborted()
  await directory.assertIdentity(signal)
  if (directory.listEntries === undefined) {
    throw new BoundedFileError('descriptor-rooted recovery listing is unavailable', 'WORKFLOW_STORAGE_UNSUPPORTED')
  }
  const entries = await directory.listEntries(signal)
  for (const entry of entries) {
    signal?.throwIfAborted()
    assertSafeComponent(entry.name, 'storage entry')
    count.value += 1
    if (count.value > limit) throw unsafe(root, `recovery scan exceeds ${limit} entries`)
    if (entry.type === 'symlink') throw unsafe(root, `symbolic link encountered at "${entry.name}"`)
    if (entry.type === 'other') throw unsafe(root, `unexpected entry type at "${entry.name}"`)
    if (entry.type === 'directory') {
      const child = await directory.openDirectory(entry.name, signal, { create: false })
      try {
        await inventoryDirectoryCapability(child, root, limit, count, signal)
      } finally {
        await child.close().catch(() => undefined)
      }
      continue
    }
    // Some Host versions return names/types first and expose the guarded
    // metadata only through fileInfo.  Require one or the other so an
    // unaccountable file cannot slip past the eager bound.
    const identity = entry.identity ?? (directory.fileInfo === undefined ? undefined : await directory.fileInfo(entry.name, signal))
    if (identity === undefined) throw new BoundedFileError(`descriptor-rooted recovery metadata for "${entry.name}" is unavailable`, 'WORKFLOW_STORAGE_UNSUPPORTED')
    if (identity.nlink !== 1 || !Number.isSafeInteger(Number(identity.size)) || Number(identity.size) < 0) {
      throw unsafe(root, `unsafe regular file "${entry.name}"`)
    }
  }
  await directory.assertIdentity(signal)
}

async function inventoryCapabilityLayout(
  layout: WorkflowStorageLayout,
  limits: Pick<WorkflowStoreOptions, 'maxRecoveryEntries'>,
  signal?: AbortSignal,
): Promise<number> {
  const limit = limits.maxRecoveryEntries
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 4_096) throw new RangeError('maxRecoveryEntries must be a safe integer from 1 through 4096')
  const count = { value: 0 }
  for (const directory of [layout.sessions, layout.runs, layout.staging, layout.quarantine]) {
    signal?.throwIfAborted()
    await inventoryDirectoryCapability(directory, layout.anchor.root, limit, count, signal)
  }
  return count.value
}

type RecoveryLayout = WorkflowStorageLayout | { readonly root: string }

export async function inventoryWorkflowStorage(
  layout: RecoveryLayout,
  limits: Pick<WorkflowStoreOptions, 'maxRecoveryEntries'>,
  signal?: AbortSignal,
): Promise<number> {
  if ('sessions' in layout) return inventoryCapabilityLayout(layout, limits, signal)
  const limit = limits.maxRecoveryEntries
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 4_096) throw new RangeError('maxRecoveryEntries must be a safe integer from 1 through 4096')
  const count = { value: 0 }
  for (const category of ['sessions', 'runs', 'staging', 'quarantine'] as const) {
    signal?.throwIfAborted()
    const categoryPath = join(layout.root, category)
    let names: string[]
    try { names = (await readdir(categoryPath)).sort() }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
      throw error
    }
    for (const name of names) {
      assertSafeComponent(name, 'storage entry')
      await inventory(join(categoryPath, name), layout.root, limit, count, signal)
    }
  }
  return count.value
}

/** Recover all persisted Sessions only after the bounded inventory passes. */
export async function recoverWorkflowStorage(
  layout: RecoveryLayout,
  store: WorkflowRunStore,
  limits: Pick<WorkflowStoreOptions, 'maxRecoveryEntries'>,
  signal?: AbortSignal,
): Promise<{ readonly runs: readonly RecoveredRun[]; readonly entries: number }> {
  const entries = await inventoryWorkflowStorage(layout, limits, signal)
  signal?.throwIfAborted()
  const runs = await store.initialize(signal)
  return { runs, entries }
}
