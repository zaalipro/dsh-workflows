import { randomBytes } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { WorkflowSupervisor } from './index.js'
import { decodeWorkflowCursor, encodeWorkflowCursor, type WorkflowCursorKind } from './cursors.js'
import type {
  SupervisedWorkflowRunId,
  WorkflowRemoteFailure,
  WorkflowRemoteResult,
  WorkflowRunArtifactChunk,
  WorkflowRunArtifactPage,
  WorkflowRunArtifactRequest,
  WorkflowRunArtifactsRequest,
  WorkflowRunControlRequest,
  WorkflowRunControlResult,
  WorkflowRunCursor,
  WorkflowRunDetail,
  WorkflowRunHead,
  WorkflowRunListPage,
  WorkflowRunListRequest,
  WorkflowRunLogPage,
  WorkflowRunLogsRequest,
  WorkflowRunMemberDetail,
  WorkflowRunMemberPage,
  WorkflowRunMemberRequest,
  WorkflowRunMembersRequest,
  WorkflowRunRequest,
  WorkflowRunResultView,
} from './types.js'

const PAGE_MIN = 1
const PAGE_MAX = 200
const PAGE_DEFAULT = 50
const ARTIFACT_MIN = 4
const ARTIFACT_MAX = 131_072
const ARTIFACT_DEFAULT = 32_768

type PageLike = { readonly revision: number; readonly total: number; readonly items: readonly unknown[]; readonly nextCursor?: WorkflowRunCursor }
type InternalPageRequest = { readonly runId: SupervisedWorkflowRunId; readonly cursor?: WorkflowRunCursor; readonly limit?: number }
type SupervisorBackend = WorkflowSupervisor & {
  members?(agent: Agent, request: WorkflowRunMembersRequest, signal?: AbortSignal): Promise<WorkflowRunMemberPage>
  memberDetail?(agent: Agent, request: WorkflowRunMemberRequest, signal?: AbortSignal): Promise<WorkflowRunMemberDetail>
  logs?(agent: Agent, request: WorkflowRunLogsRequest, signal?: AbortSignal): Promise<WorkflowRunLogPage>
  result?(agent: Agent, runId: SupervisedWorkflowRunId, signal?: AbortSignal): Promise<WorkflowRunResultView>
  artifacts?(agent: Agent, request: WorkflowRunArtifactsRequest, signal?: AbortSignal): Promise<WorkflowRunArtifactPage>
  artifact?(agent: Agent, request: WorkflowRunArtifactRequest, signal?: AbortSignal): Promise<WorkflowRunArtifactChunk>
}

function sessionIdOf(agent: Agent): string {
  const value = (agent as unknown as { session?: { id?: unknown } }).session?.id
  return typeof value === 'string' ? value : ''
}

function failure(code: WorkflowRemoteFailure['code'], message: string, details?: { readonly min?: number; readonly max?: number; readonly revision?: number; readonly reason?: 'budget-limited' | 'invalid-state' | 'save-ineligible'; readonly run?: WorkflowRunHead }): { readonly ok: false; readonly error: WorkflowRemoteFailure } {
  if (code === 'revision-conflict') {
    return { ok: false, error: { code, message: 'workflow run changed; refresh it before applying a control', details: details as { readonly run: any } } }
  }
  if (code === 'action-unavailable') {
    return { ok: false, error: { code, message, details: details as { readonly reason: 'budget-limited'|'invalid-state'|'save-ineligible'; readonly run?: any } } }
  }
  return { ok: false, error: { code, message, ...(details === undefined ? {} : { details }) } }
}

function validPageLimit(value: number | undefined): number | undefined {
  const limit = value ?? PAGE_DEFAULT
  return Number.isSafeInteger(limit) && limit >= PAGE_MIN && limit <= PAGE_MAX ? limit : undefined
}

function validArtifactLimit(value: number | undefined): number | undefined {
  const limit = value ?? ARTIFACT_DEFAULT
  return Number.isSafeInteger(limit) && limit >= ARTIFACT_MIN && limit <= ARTIFACT_MAX ? limit : undefined
}

function isAbort(error: unknown): boolean {
  return (error instanceof DOMException && error.name === 'AbortError')
    || (error instanceof Error && error.name === 'AbortError')
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code : undefined
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : ''
}

/** HMAC page bound is retained/pageable length; evicted/omitted stay metadata. */
function pageableTotal(kind: WorkflowCursorKind, page: PageLike & { readonly evicted?: number; readonly omitted?: number }): number {
  if (kind === 'logs') return Math.max(0, Number(page.total) - Number(page.evicted ?? 0))
  if (kind === 'artifacts') return Math.max(0, Number(page.total) - Number(page.omitted ?? 0))
  return Number(page.total)
}

function unavailable(
  error: unknown,
  kind: 'run' | 'member' | 'artifact',
  extras?: { readonly revision?: number },
): { readonly ok: false; readonly error: WorkflowRemoteFailure } {
  if (isAbort(error)) throw error
  const code = errorCode(error)
  const message = errorMessage(error)
  if (code === 'WORKFLOW_CURSOR_INVALID') {
    return failure('invalid-cursor', 'workflow page cursor is invalid or belongs to another collection')
  }
  if (code === 'WORKFLOW_STALE_REVISION') {
    if (kind === 'artifact') {
      return failure(
        'artifact-changed',
        'workflow artifact collection changed; refresh it before reading',
        extras?.revision === undefined ? undefined : { revision: extras.revision },
      )
    }
    return failure('stale-cursor', 'workflow page cursor is stale; refresh the collection')
  }
  if (code === 'WORKFLOW_LIMIT') {
    if (kind === 'artifact' || /maxBytes/u.test(message)) {
      return failure('invalid-artifact-limit', 'workflow artifact maxBytes must be a safe integer from 4 through 131072', { min: 4, max: 131_072 })
    }
    return failure('invalid-page-limit', 'workflow page limit must be a safe integer from 1 through 200', { min: 1, max: 200 })
  }
  if (code === 'WORKFLOW_STORAGE_CORRUPT') {
    return failure('stale-cursor', 'workflow page cursor is stale; refresh the collection')
  }
  if (code === 'WORKFLOW_STORAGE_UNSUPPORTED' || code === 'WORKFLOW_STORAGE_LIMIT') {
    return failure('storage-unavailable', kind === 'artifact'
      ? 'workflow scratch artifacts are unavailable'
      : 'workflow retained details are unavailable')
  }
  // Only authorization/identity misses become indistinguishable not-found.
  // UNSAFE and unexpected faults stay outer so they are not laundered as a
  // missing id.
  if (code === 'WORKFLOW_RUN_NOT_FOUND' || code === 'WORKFLOW_RUN_NOT_OWNED' || code === 'WORKFLOW_INVALID_STATE') {
    if (kind === 'member') return failure('member-not-found', 'workflow member was not found in this run')
    if (kind === 'artifact') return failure('artifact-not-found', 'workflow scratch artifact was not found')
    return failure('run-not-found', 'workflow run was not found')
  }
  throw error
}

/** Direct Agent-authorized run API. Protected values are never event payloads. */
export class WorkflowRunsRemote extends TypertRemoteService {
  static readonly inject = ['workflowSupervisor'] as const

  private readonly supervisor: SupervisorBackend
  private readonly cursorSecret = randomBytes(32)
  private readonly processEpoch = randomBytes(16).toString('hex')

  constructor(ctx: Context) {
    super(ctx, 'workflowRunsRemote', { namespace: 'workflowRuns' })
    this.supervisor = (ctx as unknown as { workflowSupervisor: WorkflowSupervisor }).workflowSupervisor as SupervisorBackend
  }

  private cursorOffset(
    cursor: WorkflowRunCursor | undefined,
    kind: WorkflowCursorKind,
    sessionId: string,
    entityId: string,
    revision: number,
    total: number,
  ): WorkflowRemoteResult<number> {
    if (cursor === undefined) return { ok: true, value: 0 }
    const decoded = decodeWorkflowCursor(this.cursorSecret, String(cursor), {
      kind, sessionId, entityId, processEpoch: this.processEpoch, revision, total,
    })
    if (decoded.ok) return { ok: true, value: decoded.value.offset }
    return decoded.reason === 'stale'
      ? failure('stale-cursor', 'workflow page cursor is stale; refresh the collection')
      : failure('invalid-cursor', 'workflow page cursor is invalid or belongs to another collection')
  }

  private nextCursor(
    kind: WorkflowCursorKind,
    sessionId: string,
    entityId: string,
    revision: number,
    offset: number,
    returned: number,
    total: number,
  ): WorkflowRunCursor | undefined {
    const next = offset + returned
    // A zero-length page must not mint a continuation token; that is the
    // retained-vs-evicted-total loop that HMAC paging is here to prevent.
    if (returned === 0 || next >= total) return undefined
    return encodeWorkflowCursor(this.cursorSecret, {
      version: 1, kind, sessionId, entityId, processEpoch: this.processEpoch,
      revision, offset: next,
    })
  }

  @Remote('list')
  async list(agent: Agent, request: WorkflowRunListRequest, signal: AbortSignal): Promise<WorkflowRemoteResult<WorkflowRunListPage>> {
    signal.throwIfAborted()
    const limit = validPageLimit(request?.limit)
    if (limit === undefined) {
      return failure('invalid-page-limit', 'workflow page limit must be a safe integer from 1 through 200', { min: 1, max: 200 })
    }
    try {
      const sessionId = sessionIdOf(agent)
      // Obtain the current authorized baseline before accepting its cursor.
      const baseline = await this.supervisor.list(agent, { limit: 1 }, signal)
      signal.throwIfAborted()
      const revision = baseline.sessionRevision
      const offsetResult = this.cursorOffset(request?.cursor, 'runs', sessionId, '', revision, baseline.total)
      if (!offsetResult.ok) return offsetResult
      const offset = offsetResult.value
      const page = offset === 0 && limit === 1
        ? baseline
        : await this.supervisor.list(agent, { limit, cursor: String(offset) as WorkflowRunCursor }, signal)
      signal.throwIfAborted()
      // A mutation during the second read makes the requested baseline stale.
      if (page.sessionRevision !== revision || String(page.epoch) !== String(baseline.epoch)) {
        return failure('stale-cursor', 'workflow page cursor is stale; refresh the collection')
      }
      const items = page.items.slice(0, limit)
      const nextCursor = this.nextCursor('runs', sessionId, '', revision, offset, items.length, baseline.total)
      return { ok: true, value: {
        epoch: this.processEpoch as WorkflowRunListPage['epoch'],
        sessionRevision: revision, items, total: baseline.total,
        ...(nextCursor === undefined ? {} : { nextCursor }),
      } }
    } catch (error) {
      return unavailable(error, 'run')
    }
  }

  @Remote('detail')
  async detail(agent: Agent, request: WorkflowRunRequest, signal: AbortSignal): Promise<WorkflowRemoteResult<WorkflowRunDetail>> {
    signal.throwIfAborted()
    try {
      const detail = await this.supervisor.detail(agent, request.runId, signal)
      signal.throwIfAborted()
      // Absolute script projections are Host-only execution authority.
      const { scriptPath: _scriptPath, ...redacted } = detail
      return { ok: true, value: redacted }
    } catch (error) { return unavailable(error, 'run') }
  }

  private async page<T extends PageLike>(
    agent: Agent,
    request: InternalPageRequest,
    signal: AbortSignal,
    kind: 'members' | 'logs' | 'artifacts',
    read: (request: InternalPageRequest) => Promise<T>,
  ): Promise<WorkflowRemoteResult<T>> {
    const limit = validPageLimit(request.limit)
    if (limit === undefined) {
      return failure('invalid-page-limit', 'workflow page limit must be a safe integer from 1 through 200', { min: 1, max: 200 })
    }
    signal.throwIfAborted()
    try {
      // Authorize the selected run before any cursor distinction is exposed.
      await this.supervisor.detail(agent, request.runId, signal)
      const baseline = await read({ ...request, cursor: undefined, limit: 1 })
      signal.throwIfAborted()
      const bound = pageableTotal(kind, baseline)
      const offsetResult = this.cursorOffset(request.cursor, kind, sessionIdOf(agent), String(request.runId), baseline.revision, bound)
      if (!offsetResult.ok) return offsetResult
      const offset = offsetResult.value
      const value = await read({ ...request, cursor: String(offset) as WorkflowRunCursor, limit })
      signal.throwIfAborted()
      if (value.revision !== baseline.revision) return failure('stale-cursor', 'workflow page cursor is stale; refresh the collection')
      const items = value.items.slice(0, limit)
      const hmac = this.nextCursor(kind, sessionIdOf(agent), String(request.runId), value.revision, offset, items.length, pageableTotal(kind, value))
      const rest = { ...value, nextCursor: undefined }
      delete (rest as { nextCursor?: WorkflowRunCursor }).nextCursor
      return { ok: true, value: { ...rest, items, ...(hmac === undefined ? {} : { nextCursor: hmac }) } as T }
    } catch (error) { return unavailable(error, 'run') }
  }

  @Remote('members')
  async members(agent: Agent, request: WorkflowRunMembersRequest, signal: AbortSignal): Promise<WorkflowRemoteResult<WorkflowRunMemberPage>> {
    if (this.supervisor.members === undefined) return failure('storage-unavailable', 'workflow retained member details are unavailable')
    return this.page(agent, request, signal, 'members', value => this.supervisor.members!(agent, value, signal))
  }

  @Remote('memberDetail')
  async memberDetail(agent: Agent, request: WorkflowRunMemberRequest, signal: AbortSignal): Promise<WorkflowRemoteResult<WorkflowRunMemberDetail>> {
    signal.throwIfAborted()
    try { await this.supervisor.detail(agent, request.runId, signal) }
    catch (error) { return unavailable(error, 'run') }
    try {
      if (this.supervisor.memberDetail === undefined) return failure('member-not-found', 'workflow member was not found in this run')
      const value = await this.supervisor.memberDetail(agent, request, signal)
      signal.throwIfAborted()
      return { ok: true, value }
    } catch (error) { return unavailable(error, 'member') }
  }

  @Remote('logs')
  async logs(agent: Agent, request: WorkflowRunLogsRequest, signal: AbortSignal): Promise<WorkflowRemoteResult<WorkflowRunLogPage>> {
    if (this.supervisor.logs === undefined) return failure('storage-unavailable', 'workflow retained logs are unavailable')
    return this.page(agent, request, signal, 'logs', value => this.supervisor.logs!(agent, value, signal))
  }

  @Remote('result')
  async result(agent: Agent, request: WorkflowRunRequest, signal: AbortSignal): Promise<WorkflowRemoteResult<WorkflowRunResultView>> {
    signal.throwIfAborted()
    try { await this.supervisor.detail(agent, request.runId, signal) }
    catch (error) { return unavailable(error, 'run') }
    try {
      if (this.supervisor.result === undefined) return failure('storage-unavailable', 'workflow retained result is unavailable')
      const value = await this.supervisor.result(agent, request.runId, signal)
      signal.throwIfAborted()
      return { ok: true, value }
    } catch (error) { return unavailable(error, 'run') }
  }

  @Remote('artifacts')
  async artifacts(agent: Agent, request: WorkflowRunArtifactsRequest, signal: AbortSignal): Promise<WorkflowRemoteResult<WorkflowRunArtifactPage>> {
    if (this.supervisor.artifacts === undefined) return failure('storage-unavailable', 'workflow scratch artifacts are unavailable')
    return this.page(agent, request, signal, 'artifacts', value => this.supervisor.artifacts!(agent, value, signal))
  }

  @Remote('artifact')
  async artifact(agent: Agent, request: WorkflowRunArtifactRequest, signal: AbortSignal): Promise<WorkflowRemoteResult<WorkflowRunArtifactChunk>> {
    signal.throwIfAborted()
    const maxBytes = validArtifactLimit(request.maxBytes)
    if (maxBytes === undefined) {
      return failure('invalid-artifact-limit', 'workflow artifact maxBytes must be a safe integer from 4 through 131072', { min: 4, max: 131_072 })
    }
    let revision = 0
    try {
      const detail = await this.supervisor.detail(agent, request.runId, signal)
      revision = detail.run.artifactsRevision
    } catch (error) { return unavailable(error, 'run') }
    try {
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(request.name)) {
        return failure('artifact-not-found', 'workflow scratch artifact was not found')
      }
      if (request.expectedRevision !== undefined && request.expectedRevision !== revision) {
        return failure('artifact-changed', 'workflow artifact collection changed; refresh it before reading', { revision })
      }
      if (this.supervisor.artifact === undefined) return failure('artifact-not-found', 'workflow scratch artifact was not found')
      let offset = 0
      let first: WorkflowRunArtifactChunk | undefined
      if (request.cursor !== undefined) {
        // The backend will verify the exact current byte total. First read at
        // offset zero obtains that protected total after run authorization.
        first = await this.supervisor.artifact(agent, { ...request, cursor: undefined, maxBytes: ARTIFACT_MIN }, signal)
        if (request.expectedRevision !== undefined && first.revision !== request.expectedRevision) {
          return failure('artifact-changed', 'workflow artifact collection changed; refresh it before reading', { revision: first.revision })
        }
        const decoded = this.cursorOffset(
          request.cursor, 'artifact', sessionIdOf(agent), `${request.runId}\0${request.name}`,
          first.revision, first.totalBytes,
        )
        if (!decoded.ok) return decoded
        offset = decoded.value
      }
      const value = await this.supervisor.artifact(agent, { ...request, cursor: String(offset) as WorkflowRunCursor, maxBytes }, signal)
      signal.throwIfAborted()
      // Second-read CAS: a raced rewrite of identity/revision/length must not
      // return mixed page bytes from two generations.
      if (
        (request.expectedRevision !== undefined && value.revision !== request.expectedRevision)
        || (first !== undefined && (
          value.revision !== first.revision
          || value.totalBytes !== first.totalBytes
          || value.artifact.name !== first.artifact.name
          || value.artifact.bytes !== first.artifact.bytes
        ))
      ) {
        return failure('artifact-changed', 'workflow artifact collection changed; refresh it before reading', { revision: value.revision })
      }
      const hmac = this.nextCursor(
        'artifact', sessionIdOf(agent), `${request.runId}\0${request.name}`,
        value.revision, value.offsetBytes, value.returnedBytes, value.totalBytes,
      )
      const rest = { ...value, nextCursor: undefined }
      delete (rest as { nextCursor?: WorkflowRunCursor }).nextCursor
      return { ok: true, value: { ...rest, ...(hmac === undefined ? {} : { nextCursor: hmac }) } }
    } catch (error) {
      return unavailable(error, 'artifact', { revision })
    }
  }

  @Remote('control')
  async control(agent: Agent, request: WorkflowRunControlRequest, signal: AbortSignal): Promise<WorkflowRemoteResult<WorkflowRunControlResult>> {
    signal.throwIfAborted()
    let current: WorkflowRunDetail
    try { current = await this.supervisor.detail(agent, request.runId, signal) }
    catch (error) { return unavailable(error, 'run') }
    const run = current.run
    if (!Number.isSafeInteger(request.expectedRevision) || request.expectedRevision !== run.revision) {
      return failure('revision-conflict', 'workflow run changed; refresh it before applying a control', { run })
    }
    if (!run.allowedActions.includes(request.action)) {
      if (request.action === 'resume' && run.status === 'budget-limited') {
        return failure('action-unavailable', `workflow "${run.displayName}" requires a higher agent_budget to resume`, { reason: 'budget-limited', run })
      }
      const reason = request.action === 'save' ? 'save-ineligible' : 'invalid-state'
      return failure('action-unavailable', `workflow action "${request.action}" is not available while run status is "${run.status}"`, { reason, run })
    }
    try {
      let updated
      switch (request.action) {
        case 'pause': updated = await this.supervisor.pause(run.displayName, agent, signal); break
        case 'resume': updated = await this.supervisor.resume(run.displayName, agent, signal); break
        case 'stop': updated = await this.supervisor.stop(run.displayName, agent, signal); break
        case 'save':
          await this.supervisor.save(run.displayName, agent, undefined, signal)
          updated = (await this.supervisor.detail(agent, request.runId, signal)).run
          break
      }
      return { ok: true, value: { run: updated } }
    } catch (error) {
      if (isAbort(error)) throw error
      const code = errorCode(error)
      if (code === 'WORKFLOW_STALE_REVISION') {
        try {
          const latest = (await this.supervisor.detail(agent, request.runId, signal)).run
          return failure('revision-conflict', 'workflow run changed; refresh it before applying a control', { run: latest })
        } catch (reread) { return unavailable(reread, 'run') }
      }
      if (code === 'WORKFLOW_RUN_NOT_FOUND' || code === 'WORKFLOW_RUN_NOT_OWNED') return unavailable(error, 'run')
      if (code === 'WORKFLOW_INVALID_STATE' || code === 'WORKFLOW_LIMIT') {
        const reason = request.action === 'save' ? 'save-ineligible' : 'invalid-state'
        if (request.action === 'resume' && run.status === 'budget-limited') {
          return failure('action-unavailable', `workflow "${run.displayName}" requires a higher agent_budget to resume`, { reason: 'budget-limited', run })
        }
        return failure('action-unavailable', `workflow action "${request.action}" is not available while run status is "${run.status}"`, { reason, run })
      }
      throw error
    }
  }
}
