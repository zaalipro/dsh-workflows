/** Package error taxonomy and lifecycle invariant diagnostics. */
import type { Context } from '@deepseek-ai/cordis'
import { HarnessError } from '@deepseek-ai/dsh-llm'

/** Stable package failure codes exposed across tool, command, and Remote boundaries. */
export type WorkflowPackageErrorCode =
  | 'WORKFLOW_INCOMPATIBLE_HOST'
  | 'WORKFLOW_REGISTRY_DISABLED'
  | 'WORKFLOW_DEFINITION_INVALID'
  | 'WORKFLOW_STORAGE_OWNED'
  | 'WORKFLOW_STORAGE_UNSUPPORTED'
  | 'WORKFLOW_STORAGE_UNSAFE'
  | 'WORKFLOW_STORAGE_CORRUPT'
  | 'WORKFLOW_STORAGE_LIMIT'
  | 'WORKFLOW_RUN_NOT_FOUND'
  | 'WORKFLOW_RUN_NOT_OWNED'
  | 'WORKFLOW_INVALID_STATE'
  | 'WORKFLOW_STALE_REVISION'
  | 'WORKFLOW_LIMIT'
  | 'WORKFLOW_CURSOR_INVALID'

/** Package-owned error retaining Harness's machine-routable error identity. */
export class WorkflowPackageError extends HarnessError {
  declare readonly code: WorkflowPackageErrorCode

  constructor(message: string, code: WorkflowPackageErrorCode, options?: ErrorOptions) {
    super(message, code, options)
    this.name = 'WorkflowPackageError'
  }
}

const TERMINAL_HEAD_STATUSES = new Set(['completed', 'failed', 'cancelled', 'interrupted'])

/** Return diagnostics for the package's registry/storage lifecycle invariants. */
export function checkWorkflowRegistryStorageInvariant(state: unknown): readonly string[] {
  const value = state as {
    registry?: { enabled?: boolean; watchers?: number }
    storage?: { recovered?: boolean; exposed?: boolean; leaseOwned?: boolean }
    issues?: readonly unknown[]
    disposed?: boolean
    heads?: readonly {
      readonly status?: string
      readonly completionNotice?: { readonly state?: string }
      readonly runDirectoryExists?: boolean
      readonly detailFileExists?: boolean
      readonly detailSha256?: string
      readonly fileSha256?: string
      readonly detailRevision?: number
      readonly fileRevision?: number
    }[]
  } | undefined
  const errors: string[] = []
  if (value?.registry?.enabled === false && (value.registry.watchers ?? 0) > 0) {
    errors.push('disabled registry has active watchers')
  }
  if (value?.storage?.recovered === false && value.storage.exposed === true) {
    errors.push('storage is exposed before recovery')
  }
  for (const issue of value?.issues ?? []) errors.push(String(issue))
  if (value?.disposed === true && value.storage?.leaseOwned === true) {
    errors.push('disposed storage still owns a lease/descriptor/operation')
  }
  let missingIdentity = false
  let digestMismatch = false
  let terminalNone = false
  for (const head of value?.heads ?? []) {
    if (head.runDirectoryExists === false || head.detailFileExists === false) missingIdentity = true
    if (
      typeof head.detailSha256 === 'string'
      && typeof head.fileSha256 === 'string'
      && head.detailSha256 !== head.fileSha256
    ) digestMismatch = true
    if (
      typeof head.detailRevision === 'number'
      && typeof head.fileRevision === 'number'
      && head.detailRevision !== head.fileRevision
    ) digestMismatch = true
    if (TERMINAL_HEAD_STATUSES.has(String(head.status)) && head.completionNotice?.state === 'none') {
      terminalNone = true
    }
  }
  if (missingIdentity) {
    errors.push('a manifest references a missing/identity-mismatched run directory or immutable detail file')
  }
  if (digestMismatch) errors.push('a detail snapshot/revision/digest disagrees with its head')
  if (terminalNone) errors.push("a terminal row has completionNotice.state === 'none'")
  return errors
}

/**
 * Runtime-invariant companion hook.
 *
 * The package keeps this entrypoint side-effect free when the optional official
 * invariant registry is not part of a profile. Lifecycle ownership checks are
 * enforced by the concrete components and their tests.
 */
export function applyInvariant(ctx: Context): void {
  let invariants: { register?: (packageName: string, installer: () => void) => unknown } | undefined
  try {
    const get = (ctx as { get?: (name: string) => unknown }).get
    invariants = typeof get === 'function'
      ? get.call(ctx, 'invariants') as typeof invariants
      : undefined
  } catch {
    return
  }
  if (typeof invariants?.register !== 'function') return
  invariants.register('@zaalipro/dsh-workflows', () => undefined)
}
