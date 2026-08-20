import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { RecoveredRun, WorkflowStoreOptions } from './manifest-types.js'
import type { WorkflowRunStore } from './manifest-types.js'
import { BoundedFileError } from './bounded-file.js'
/** Recover all persisted Sessions before exposing a supervisor. */
export async function recoverWorkflowStorage(layout: { readonly root: string }, store: WorkflowRunStore, limits: Pick<WorkflowStoreOptions,'maxRecoveryEntries'>): Promise<{ readonly runs: readonly RecoveredRun[]; readonly entries: number }> {
  let entries = 0
  try { for (const category of ['sessions','runs','staging','quarantine']) { const names = await readdir(join(layout.root,category)); entries += names.length; if (entries > limits.maxRecoveryEntries) throw new BoundedFileError(`workflow storage path "${layout.root}" is unsafe: recovery scan exceeds ${limits.maxRecoveryEntries} entries`) } } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  const runs = await store.initialize()
  return { runs, entries }
}
