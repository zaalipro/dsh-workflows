import type {
  ClientAgentCatalog,
  WorkflowRemoteClient,
  WorkflowRunsSource,
  WorkflowRunsSourceSnapshot,
  WorkflowRunAction,
  WorkflowRunArtifactChunk,
  WorkflowRunArtifactPage,
  WorkflowRunDetail,
  WorkflowRunLogPage,
  WorkflowRunMemberDetail,
  WorkflowRunMemberPage,
  WorkflowRunResultView,
  WorkflowRunControlResult,
  WorkflowRunsOperations,
} from './contract.js'
import {
  WorkflowRunsRemoteError,
  unwrapWorkflowRemoteResult,
} from './contract.js'

const DEFAULT_LIMIT = 50
const ABORT_NAME = 'AbortError'

type Listener = () => void
type Change =
  | { readonly kind: 'invalidate-all' }
  | { readonly kind: 'invalidate'; readonly sessionId: string; readonly revision: number }

interface SessionState {
  readonly sessionId: string
  snapshot: WorkflowRunsSourceSnapshot
  readonly listeners: Set<Listener>
  readonly requests: Set<AbortController>
  source?: WorkflowRunsSource
  generation: number
  removed: boolean
  subscribed: boolean
  refreshFlight?: Promise<WorkflowRunsSourceSnapshot>
  pageFlight?: Promise<WorkflowRunsSourceSnapshot>
  hintedRevision?: number
  followup: boolean
}

function abortError(reason: unknown = 'The operation was aborted'): Error {
  if (reason instanceof Error) {
    if (reason.name !== ABORT_NAME) reason.name = ABORT_NAME
    return reason
  }
  const error = new Error(String(reason))
  error.name = ABORT_NAME
  return error
}

function isAbort(error: unknown): boolean {
  return (error instanceof Error && error.name === ABORT_NAME)
    || (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === ABORT_NAME)
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw signal.reason ?? abortError()
}

/** Race a caller's wait without cancelling a shared baseline request. */
function waitWithAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (signal === undefined) return promise
  throwIfAborted(signal)
  return new Promise<T>((resolve, reject) => {
    let settled = false
    const cleanup = (): void => signal.removeEventListener('abort', onAbort)
    const onAbort = (): void => {
      if (settled) return
      settled = true
      cleanup()
      reject(signal.reason ?? abortError())
    }
    signal.addEventListener('abort', onAbort, { once: true })
    void promise.then(
      value => {
        if (settled) return
        settled = true
        cleanup()
        resolve(value)
      },
      error => {
        if (settled) return
        settled = true
        cleanup()
        reject(error)
      },
    )
  })
}

function combineSignals(left: AbortSignal | undefined, right: AbortSignal): AbortSignal {
  if (left === undefined) return right
  if (typeof AbortSignal.any === 'function') return AbortSignal.any([left, right])
  const controller = new AbortController()
  const abort = (): void => controller.abort(left.reason ?? right.reason)
  if (left.aborted || right.aborted) abort()
  else {
    left.addEventListener('abort', abort, { once: true })
    right.addEventListener('abort', abort, { once: true })
  }
  return controller.signal
}

function emptySnapshot(sessionId: string, phase: WorkflowRunsSourceSnapshot['phase'] = 'idle'): WorkflowRunsSourceSnapshot {
  return {
    sessionId,
    phase,
    status: phase,
    runs: [],
    total: 0,
    sessionRevision: 0,
    revision: 0,
  }
}

function snapshotWith(
  sessionId: string,
  previous: WorkflowRunsSourceSnapshot,
  patch: Partial<WorkflowRunsSourceSnapshot>,
): WorkflowRunsSourceSnapshot {
  const phase = patch.phase ?? previous.phase
  const sessionRevision = patch.sessionRevision ?? patch.revision ?? previous.sessionRevision ?? previous.revision
  const nextCursor = Object.hasOwn(patch, 'nextCursor') ? patch.nextCursor : previous.nextCursor
  const epoch = Object.hasOwn(patch, 'epoch') ? patch.epoch : previous.epoch
  const error = Object.hasOwn(patch, 'error') ? patch.error : previous.error
  return {
    sessionId,
    phase,
    status: phase,
    runs: patch.runs ?? previous.runs,
    total: patch.total ?? previous.total,
    ...(nextCursor === undefined ? {} : { nextCursor }),
    ...(epoch === undefined ? {} : { epoch }),
    sessionRevision,
    revision: sessionRevision,
    ...(error === undefined ? {} : { error }),
  }
}

function renderThrown(error: unknown): string {
  try { return error instanceof Error ? error.message : String(error) }
  catch { return 'Unable to load workflow data. Retry.' }
}

/** Lazy, revision-fenced browser source for retained workflow runs. */
export class WorkflowRunsController implements WorkflowRunsOperations {
  private readonly states = new Map<string, SessionState>()
  private readonly parentRemote: any
  private readonly agents?: ClientAgentCatalog
  private connectionGeneration = 0
  private connected = true
  private observed?: string
  private disposed = false

  constructor(remote: WorkflowRemoteClient, agents?: ClientAgentCatalog) {
    this.parentRemote = remote
    this.agents = agents
  }

  /** Resolve after typert $mount; construction may run before the namespace exists. */
  private get remote(): any {
    return this.parentRemote?.workflowRuns ?? this.parentRemote
  }

  private state(sessionId: string): SessionState {
    let state = this.states.get(sessionId)
    if (state !== undefined) return state
    state = {
      sessionId,
      snapshot: emptySnapshot(sessionId, this.connected ? 'idle' : 'reconnecting'),
      listeners: new Set(),
      requests: new Set(),
      generation: this.connectionGeneration,
      removed: false,
      subscribed: false,
      followup: false,
    }
    this.states.set(sessionId, state)
    return state
  }

  get(sessionId: string): WorkflowRunsSourceSnapshot {
    return this.state(sessionId).snapshot
  }

  source(sessionId: string): WorkflowRunsSource {
    const state = this.state(sessionId)
    if (state.source !== undefined) return state.source
    state.source = {
      getSnapshot: () => state.snapshot,
      subscribe: (listener) => {
        if (this.disposed || state.removed) return () => undefined
        state.listeners.add(listener)
        if (!state.subscribed) {
          state.subscribed = true
          void this.refresh(sessionId).catch(() => undefined)
        }
        return () => {
          state.listeners.delete(listener)
          if (state.listeners.size === 0 && this.observed !== sessionId) this.removeSession(sessionId)
        }
      },
    }
    return state.source
  }

  subscribe(sessionId: string, listener: (snapshot: WorkflowRunsSourceSnapshot) => void): () => void {
    const source = this.source(sessionId)
    const notify = (): void => listener(source.getSnapshot())
    const unsubscribe = source.subscribe(notify)
    try { notify() }
    catch { /* a bad renderer must not starve other observers */ }
    return unsubscribe
  }

  observe(sessionId: string | undefined): void {
    if (this.observed === sessionId) {
      if (sessionId !== undefined && !this.disposed) void this.refresh(sessionId).catch(() => undefined)
      return
    }
    if (this.observed !== undefined) {
      const previous = this.states.get(this.observed)
      if (previous !== undefined && previous.listeners.size === 0) this.removeSession(this.observed)
    }
    this.observed = sessionId
    if (sessionId === undefined || this.disposed) return
    const state = this.state(sessionId)
    state.subscribed = true
    void this.refresh(sessionId).catch(() => undefined)
  }

  private publish(state: SessionState, patch: Partial<WorkflowRunsSourceSnapshot>): void {
    if (this.disposed || state.removed) return
    state.snapshot = snapshotWith(state.sessionId, state.snapshot, patch)
    for (const listener of [...state.listeners]) {
      try { listener() }
      catch { /* a bad renderer must not starve other observers */ }
    }
  }

  private request(state: SessionState, supplied?: AbortSignal): {
    readonly signal: AbortSignal
    readonly controller: AbortController
    readonly generation: number
  } {
    const controller = new AbortController()
    state.requests.add(controller)
    return {
      signal: combineSignals(supplied, controller.signal),
      controller,
      generation: this.connectionGeneration,
    }
  }

  private retire(state: SessionState, controller: AbortController): void {
    state.requests.delete(controller)
  }

  private async call<T>(method: string, sessionId: string, request: unknown, signal: AbortSignal): Promise<T> {
    const fn = this.remote?.[method]
    if (typeof fn !== 'function') {
      throw new WorkflowRunsRemoteError('storage-unavailable', `workflow Remote method ${method} is unavailable`)
    }
    // H's direct-Agent generated face always carries the Session wire identity
    // explicitly; never fall back to an ambient/scoped invocation.
    const raw = await fn.call(this.remote, sessionId, request, signal)
    signal.throwIfAborted()
    return unwrapWorkflowRemoteResult<T>(raw)
  }

  async refresh(sessionId: string, supplied?: AbortSignal): Promise<WorkflowRunsSourceSnapshot> {
    if (this.disposed) return this.get(sessionId)
    const state = this.state(sessionId)
    if (state.removed || !this.connected) return state.snapshot
    if (state.refreshFlight !== undefined) return waitWithAbort(state.refreshFlight, supplied)

    const request = this.request(state)
    const generation = request.generation
    let operation!: Promise<WorkflowRunsSourceSnapshot>
    operation = (async (): Promise<WorkflowRunsSourceSnapshot> => {
      this.publish(state, { phase: 'loading', error: undefined })
      try {
        const page = await this.call<any>('list', sessionId, { limit: DEFAULT_LIMIT }, request.signal)
        if (state.removed || this.disposed || generation !== this.connectionGeneration || request.signal.aborted) return state.snapshot
        const items = Array.isArray(page?.items) ? page.items : []
        const sessionRevision = Number.isSafeInteger(page?.sessionRevision) ? page.sessionRevision : 0
        this.publish(state, {
          phase: 'ready',
          runs: items,
          total: Number.isSafeInteger(page?.total) ? page.total : items.length,
          nextCursor: page?.nextCursor,
          epoch: typeof page?.epoch === 'string' ? page.epoch : undefined,
          sessionRevision,
          revision: sessionRevision,
          error: undefined,
        })
        const hinted = state.hintedRevision
        state.hintedRevision = undefined
        if (hinted !== undefined && hinted > sessionRevision) state.followup = true
        return state.snapshot
      } catch (error) {
        if (isAbort(error) || request.signal.aborted || generation !== this.connectionGeneration) return state.snapshot
        this.publish(state, {
          phase: 'error',
          runs: state.snapshot.runs,
          total: state.snapshot.total,
          error: renderThrown(error),
        })
        throw error
      } finally {
        this.retire(state, request.controller)
        // A disconnect/reset can retire this flight and start a new baseline
        // before this `finally` runs. Never clear the replacement flight.
        if (state.refreshFlight === operation) state.refreshFlight = undefined
        if (state.followup && this.connected && !state.removed && !this.disposed) {
          state.followup = false
          queueMicrotask(() => {
            if (state.refreshFlight === undefined && (state.listeners.size > 0 || this.observed === sessionId)) {
              void this.refresh(sessionId).catch(() => undefined)
            }
          })
        }
      }
    })()
    state.refreshFlight = operation
    return waitWithAbort(operation, supplied)
  }

  async loadMore(sessionId: string, supplied?: AbortSignal): Promise<WorkflowRunsSourceSnapshot> {
    const state = this.state(sessionId)
    const cursor = state.snapshot.nextCursor
    if (state.removed || this.disposed || cursor === undefined || !this.connected) return state.snapshot
    if (state.pageFlight !== undefined) return waitWithAbort(state.pageFlight, supplied)
    // A later-page failure deliberately leaves the successful prefix and its
    // cursor in the snapshot.  `phase` is `error` in that state so the pane can
    // announce the failure; accepting the retained cursor here is what makes
    // the inline Retry control useful.  Initial failures have no cursor and
    // have already returned above.

    const request = this.request(state, supplied)
    const generation = request.generation
    const expectedEpoch = state.snapshot.epoch
    const expectedRevision = state.snapshot.sessionRevision
    let operation!: Promise<WorkflowRunsSourceSnapshot>
    operation = (async (): Promise<WorkflowRunsSourceSnapshot> => {
      try {
        const page = await this.call<any>('list', sessionId, { cursor, limit: DEFAULT_LIMIT }, request.signal)
        if (state.removed || this.disposed || generation !== this.connectionGeneration || request.signal.aborted) return state.snapshot
        if ((expectedEpoch !== undefined && page?.epoch !== undefined && page.epoch !== expectedEpoch)
          || (page?.sessionRevision !== undefined && page.sessionRevision !== expectedRevision)) {
          await this.refresh(sessionId)
          return state.snapshot
        }
        const incoming = Array.isArray(page?.items) ? page.items : []
        const known = new Set(state.snapshot.runs.map(run => run.runId))
        const rows = [...state.snapshot.runs]
        for (const row of incoming) {
          if (known.has(row.runId)) {
            const index = rows.findIndex(existing => existing.runId === row.runId)
            if (index >= 0 && row.revision > rows[index]!.revision) rows[index] = row
          } else {
            known.add(row.runId)
            rows.push(row)
          }
        }
        this.publish(state, {
          phase: 'ready',
          runs: rows,
          total: Number.isSafeInteger(page?.total) ? page.total : Math.max(state.snapshot.total, rows.length),
          nextCursor: page?.nextCursor,
          sessionRevision: Number.isSafeInteger(page?.sessionRevision) ? page.sessionRevision : expectedRevision,
          revision: Number.isSafeInteger(page?.sessionRevision) ? page.sessionRevision : expectedRevision,
          error: undefined,
        })
        return state.snapshot
      } catch (error) {
        if (isAbort(error) || request.signal.aborted || generation !== this.connectionGeneration) return state.snapshot
        this.publish(state, { phase: 'error', runs: state.snapshot.runs, total: state.snapshot.total, error: renderThrown(error) })
        throw error
      } finally {
        this.retire(state, request.controller)
        if (state.pageFlight === operation) state.pageFlight = undefined
      }
    })()
    state.pageFlight = operation
    return waitWithAbort(operation, supplied)
  }

  private async read<T>(sessionId: string, method: string, requestBody: unknown, supplied?: AbortSignal): Promise<T> {
    const state = this.state(sessionId)
    if (state.removed || this.disposed) throw abortError('workflow Session was removed')
    const request = this.request(state, supplied)
    try {
      const value = await this.call<T>(method, sessionId, requestBody, request.signal)
      if (state.removed || this.disposed || request.generation !== this.connectionGeneration) {
        throw abortError('workflow request was superseded')
      }
      return value
    } finally {
      this.retire(state, request.controller)
    }
  }

  detail(sessionId: string, runId: string, signal?: AbortSignal): Promise<WorkflowRunDetail> {
    return this.read(sessionId, 'detail', { runId }, signal)
  }

  members(sessionId: string, runId: string, cursor?: string, signal?: AbortSignal): Promise<WorkflowRunMemberPage> {
    return this.read(sessionId, 'members', { runId, ...(cursor === undefined ? {} : { cursor }), limit: DEFAULT_LIMIT }, signal)
  }

  memberDetail(sessionId: string, runId: string, memberId: string, signal?: AbortSignal): Promise<WorkflowRunMemberDetail> {
    return this.read(sessionId, 'memberDetail', { runId, memberId }, signal)
  }

  logs(sessionId: string, runId: string, cursor?: string, signal?: AbortSignal): Promise<WorkflowRunLogPage> {
    return this.read(sessionId, 'logs', { runId, ...(cursor === undefined ? {} : { cursor }), limit: DEFAULT_LIMIT }, signal)
  }

  result(sessionId: string, runId: string, signal?: AbortSignal): Promise<WorkflowRunResultView> {
    return this.read(sessionId, 'result', { runId }, signal)
  }

  artifacts(sessionId: string, runId: string, cursor?: string, signal?: AbortSignal): Promise<WorkflowRunArtifactPage> {
    return this.read(sessionId, 'artifacts', { runId, ...(cursor === undefined ? {} : { cursor }), limit: DEFAULT_LIMIT }, signal)
  }

  artifact(
    sessionId: string,
    runId: string,
    name: string,
    cursor?: string,
    expectedRevision?: number,
    signal?: AbortSignal,
  ): Promise<WorkflowRunArtifactChunk> {
    return this.read(sessionId, 'artifact', {
      runId,
      name,
      ...(cursor === undefined ? {} : { cursor }),
      ...(expectedRevision === undefined ? {} : { expectedRevision }),
    }, signal)
  }

  async control(
    sessionId: string,
    runId: string,
    action: WorkflowRunAction,
    expectedRevision: number,
    signal?: AbortSignal,
  ): Promise<WorkflowRunControlResult> {
    const state = this.state(sessionId)
    const beforeGeneration = this.connectionGeneration
    try {
      const result = await this.read<WorkflowRunControlResult>(sessionId, 'control', { runId, action, expectedRevision }, signal)
      if (beforeGeneration !== this.connectionGeneration || state.removed || this.disposed) return result
      const row = result?.run
      if (row === undefined) return result
      const index = state.snapshot.runs.findIndex(candidate => candidate.runId === row.runId)
      if (index >= 0 && row.revision >= state.snapshot.runs[index]!.revision) {
        const runs = state.snapshot.runs.map((candidate, i) => i === index ? row : candidate)
        this.publish(state, { phase: 'ready', runs, error: undefined })
      }
      if (state.snapshot.nextCursor !== undefined && state.listeners.size > 0 && this.connected) {
        void this.refresh(sessionId).catch(() => undefined)
      }
      return result
    } catch (error) {
      if (error instanceof WorkflowRunsRemoteError && error.code === 'revision-conflict') {
        const authoritative = error.details?.run as WorkflowRunControlResult['run'] | undefined
        if (authoritative !== undefined) {
          const runs = state.snapshot.runs.map(row => row.runId === authoritative.runId ? authoritative : row)
          this.publish(state, { runs })
        }
        void this.refresh(sessionId).catch(() => undefined)
      }
      throw error
    }
  }

  handleChange(change: Change): void {
    if (this.disposed) return
    if (change.kind === 'invalidate-all') {
      for (const state of this.states.values()) {
        if (state.removed || !state.subscribed) continue
        if (state.refreshFlight !== undefined) state.followup = true
        else if (this.connected) void this.refresh(state.sessionId).catch(() => undefined)
        else state.followup = true
      }
      return
    }
    const state = this.states.get(change.sessionId)
    if (state === undefined || state.removed || !state.subscribed) return
    const current = state.snapshot.sessionRevision ?? state.snapshot.revision
    if (change.revision <= current) return
    state.hintedRevision = Math.max(state.hintedRevision ?? 0, change.revision)
    if (state.refreshFlight !== undefined) {
      state.followup = true
      return
    }
    if (this.connected) void this.refresh(change.sessionId).catch(() => undefined)
    else state.followup = true
  }

  handleDisconnected(): void {
    this.connected = false
    this.connectionGeneration += 1
    for (const state of this.states.values()) {
      if (state.removed) continue
      state.generation = this.connectionGeneration
      for (const controller of state.requests) controller.abort(abortError('workflow connection disconnected'))
      state.requests.clear()
      state.refreshFlight = undefined
      state.pageFlight = undefined
      this.publish(state, { phase: 'reconnecting' })
    }
  }

  /** Fence an explicit connection/reset even when description loss was not observed. */
  handleReset(): void {
    if (this.disposed) return
    // Restore connected so a reset after description-loss actually refetches
    // the epoch baseline instead of no-op'ing inside refresh().
    this.connected = true
    this.connectionGeneration += 1
    for (const state of this.states.values()) {
      if (state.removed) continue
      state.generation = this.connectionGeneration
      for (const controller of state.requests) controller.abort(abortError('workflow connection reset'))
      state.requests.clear()
      state.refreshFlight = undefined
      state.pageFlight = undefined
      state.hintedRevision = undefined
      state.followup = false
      if (state.subscribed && (state.listeners.size > 0 || this.observed === state.sessionId)) {
        void this.refresh(state.sessionId).catch(() => undefined)
      }
    }
  }

  handleConnected(): void {
    if (this.disposed) return
    this.connected = true
    for (const state of this.states.values()) {
      if (state.removed || !state.subscribed) continue
      state.hintedRevision = undefined
      state.followup = false
      if (state.listeners.size > 0 || this.observed === state.sessionId) void this.refresh(state.sessionId).catch(() => undefined)
    }
  }

  removeSession(sessionId: string): void {
    const state = this.states.get(sessionId)
    if (state === undefined) return
    state.removed = true
    state.generation += 1
    for (const controller of state.requests) controller.abort(abortError('workflow Session was removed'))
    state.requests.clear()
    state.refreshFlight = undefined
    state.pageFlight = undefined
    state.snapshot = emptySnapshot(sessionId)
    for (const listener of [...state.listeners]) {
      try { listener() } catch { /* contain observer failures */ }
    }
    state.listeners.clear()
    this.states.delete(sessionId)
    if (this.observed === sessionId) this.observed = undefined
  }

  async resolveAndOpenChild(parentSessionId: string, childSessionId: string): Promise<boolean> {
    try {
      const sessions: any = (this.agents as any)?.sessions ?? this.agents
      if (sessions === undefined) return false
      await sessions.refreshSubagents?.(parentSessionId)
      const snapshot = sessions.list?.getSnapshot?.() ?? (this.agents as any)?.list?.getSnapshot?.()
      const byParent = snapshot?.subagentsByParent?.[parentSessionId]
      if (byParent?.state !== 'ready') return false
      const entry = byParent.entries?.find((candidate: any) => {
        const id = candidate?.id ?? candidate?.childSessionId
        const parent = candidate?.parentSessionId ?? candidate?.parentId
        return candidate?.kind === 'child'
          && candidate?.mode === 'one-shot'
          && id === childSessionId
          && (parent === undefined || parent === parentSessionId)
      })
      if (entry === undefined) return false
      const address = { parentSessionId, childSessionId, mode: 'one-shot' as const }
      if (typeof sessions.openSubagent === 'function') {
        sessions.openSubagent(address)
        return true
      }
      if (typeof (this.agents as any)?.openSubagent === 'function') {
        (this.agents as any).openSubagent(address)
        return true
      }
      return false
    } catch {
      return false
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.connectionGeneration += 1
    for (const state of this.states.values()) {
      state.removed = true
      for (const controller of state.requests) controller.abort(abortError('workflow controller disposed'))
      state.requests.clear()
      state.listeners.clear()
    }
    this.states.clear()
    this.observed = undefined
  }

  /** Compatibility names used by early package consumers. */
  invalidate(change: Change): void { this.handleChange(change) }
  reconnecting(): void { this.handleDisconnected() }
}

export default WorkflowRunsController
