import { randomBytes } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { decodeWorkflowCursor, encodeWorkflowCursor } from '../supervisor/cursors.js'
import type { WorkflowRemoteFailure, WorkflowRemoteResult } from '../supervisor/types.js'
import type { WorkflowRegistry } from './index.js'
import type {
  WorkflowDefinitionCursor,
  WorkflowDefinitionListPage,
  WorkflowDefinitionListRequest,
  WorkflowDefinitionSummaryView,
} from './types.js'

const PAGE_MIN = 1
const PAGE_MAX = 200
const PAGE_DEFAULT = 50

function sessionIdOf(agent: Agent): string {
  const value = (agent as unknown as { session?: { id?: unknown } }).session?.id
  return typeof value === 'string' && value.length > 0 ? value : ''
}

function failure(
  code: Exclude<WorkflowRemoteFailure['code'], 'revision-conflict' | 'action-unavailable'>,
  message: string,
  details?: Readonly<Record<string, unknown>>,
): { readonly ok: false; readonly error: WorkflowRemoteFailure } {
  return { ok: false, error: { code, message, ...(details === undefined ? {} : { details }) } as WorkflowRemoteFailure }
}

function pageLimit(value: number | undefined): number | undefined {
  const limit = value ?? PAGE_DEFAULT
  return Number.isSafeInteger(limit) && limit >= PAGE_MIN && limit <= PAGE_MAX ? limit : undefined
}

/** Agent-authorized, path-redacting saved-definition Remote service. */
export class WorkflowDefinitionsRemote extends TypertRemoteService {
  static readonly inject = ['workflows'] as const

  private readonly registry: WorkflowRegistry
  private readonly cursorSecret = randomBytes(32)
  private readonly processEpoch = randomBytes(16).toString('hex')

  constructor(ctx: Context) {
    super(ctx, 'workflowDefinitionsRemote', { namespace: 'workflowDefinitions' })
    this.registry = (ctx as unknown as { workflows: WorkflowRegistry }).workflows
  }

  @Remote('list')
  async list(
    agent: Agent,
    request: WorkflowDefinitionListRequest,
    signal: AbortSignal,
  ): Promise<WorkflowRemoteResult<WorkflowDefinitionListPage>> {
    signal.throwIfAborted()
    const limit = pageLimit(request?.limit)
    if (limit === undefined) {
      return failure(
        'invalid-page-limit',
        'workflow page limit must be a safe integer from 1 through 200',
        { min: PAGE_MIN, max: PAGE_MAX },
      )
    }
    const cwd = (agent as unknown as { session?: { header?: { cwd?: unknown } } }).session?.header?.cwd
    if (typeof cwd !== 'string' || cwd.length === 0) {
      return failure('workspace-unavailable', 'workflow definition listing requires a session cwd')
    }
    const sessionId = sessionIdOf(agent)
    if (sessionId.length === 0) {
      return failure('workspace-unavailable', 'workflow definition listing requires a session cwd')
    }

    let snapshot
    do {
      signal.throwIfAborted()
      snapshot = await this.registry.snapshot({ cwd, signal })
      signal.throwIfAborted()
    } while (!snapshot.complete)

    const revision = snapshot.revision ?? 0
    const total = snapshot.definitions.length
    let offset = 0
    if (request.cursor !== undefined) {
      const decoded = decodeWorkflowCursor(this.cursorSecret, String(request.cursor), {
        kind: 'definitions', sessionId, entityId: '', processEpoch: this.processEpoch,
        revision, total,
      })
      if (!decoded.ok) {
        return decoded.reason === 'stale'
          ? failure('stale-cursor', 'workflow page cursor is stale; refresh the collection')
          : failure('invalid-cursor', 'workflow page cursor is invalid or belongs to another collection')
      }
      offset = decoded.value.offset
    }
    const items: WorkflowDefinitionSummaryView[] = snapshot.definitions
      .slice(offset, offset + limit)
      .map(({ name, description, whenToUse, scope }) => ({
        name, description, ...(whenToUse === undefined ? {} : { whenToUse }), scope,
      }))
    const nextOffset = offset + items.length
    const nextCursor = nextOffset < total
      ? encodeWorkflowCursor(this.cursorSecret, {
        version: 1, kind: 'definitions', sessionId, entityId: '',
        processEpoch: this.processEpoch, revision, offset: nextOffset,
      }) as unknown as WorkflowDefinitionCursor
      : undefined
    signal.throwIfAborted()
    return {
      ok: true,
      value: { items, total, revision, ...(nextCursor === undefined ? {} : { nextCursor }) },
    }
  }
}
