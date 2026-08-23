/** Stable observable adapter for the dashboard slot. */

import type {
  WorkflowCatalogOperations,
  WorkflowRunArtifactChunk,
  WorkflowRunArtifactPage,
  WorkflowRunControlResult,
  WorkflowRunDetail,
  WorkflowRunLogPage,
  WorkflowRunMemberDetail,
  WorkflowRunMemberPage,
  WorkflowRunResultView,
  WorkflowRunsOperations,
  WorkflowRunsSource,
  WorkflowRunsSourceSnapshot,
} from './contract.js'
import type { WorkflowRunsController } from './controller.js'

export interface WorkflowRunsControllerFace extends WorkflowRunsOperations {
  get(sessionId: string): WorkflowRunsSourceSnapshot
  subscribe(sessionId: string, listener: (snapshot: WorkflowRunsSourceSnapshot) => void): () => void
  source(sessionId: string): WorkflowRunsSource
}

const EMPTY: WorkflowRunsSourceSnapshot = Object.freeze({
  sessionId: '', phase: 'idle', status: 'idle', runs: Object.freeze([]), total: 0,
  sessionRevision: 0, revision: 0,
})

/**
 * One stable source is exposed to slot consumers. Switching the observed
 * Session swaps the internal subscription without replacing this source.
 */
export type DashboardSource = WorkflowRunsSource & ((sessionId: string) => WorkflowRunsSource)

export class DashboardWorkflowRunsAdapter implements Omit<WorkflowRunsOperations, 'source'> {
  private snapshot: WorkflowRunsSourceSnapshot = EMPTY
  private readonly listeners = new Set<() => void>()
  private observedSessionId: string | undefined
  private observedSource: WorkflowRunsSource | undefined
  private unsubscribe: (() => void) | undefined
  private readonly observationOwners = new Map<object, string>()
  private readonly defaultObservationOwner = {}
  private disposed = false
  listDefinitions?: WorkflowCatalogOperations['listDefinitions']
  launchDefinition?: WorkflowCatalogOperations['launchDefinition']

  readonly source: DashboardSource

  constructor(private readonly controller: WorkflowRunsControllerFace | WorkflowRunsController) {
    const callable = ((sessionId: string) => this.controller.source(sessionId)) as DashboardSource
    callable.getSnapshot = () => this.snapshot
    callable.subscribe = listener => {
      if (this.disposed) return () => undefined
      this.listeners.add(listener)
      return () => { this.listeners.delete(listener) }
    }
    this.source = callable
  }

  get(sessionId: string): WorkflowRunsSourceSnapshot {
    return this.controller.get(sessionId)
  }

  subscribe(sessionId: string, listener: (snapshot: WorkflowRunsSourceSnapshot) => void): () => void {
    return this.controller.subscribe(sessionId, listener)
  }

  observe(sessionId: string | undefined): void {
    this.observeFor(this.defaultObservationOwner, sessionId)
  }

  /**
   * Keep independent dashboard renderers from releasing each other's live
   * Session subscription during a shell/fallback ownership handoff.
   */
  observeFor(owner: object, sessionId: string | undefined): void {
    if (this.disposed) return
    if (sessionId === undefined) this.observationOwners.delete(owner)
    else {
      // Reinsert so the most recently active renderer is authoritative when
      // different Session ids overlap briefly during navigation.
      this.observationOwners.delete(owner)
      this.observationOwners.set(owner, sessionId)
    }
    const active = [...this.observationOwners.values()].at(-1)
    this.setObservedSession(active)
  }

  private setObservedSession(sessionId: string | undefined): void {
    if (this.disposed || sessionId === this.observedSessionId) return
    this.unsubscribe?.()
    this.unsubscribe = undefined
    this.observedSessionId = sessionId
    const source = sessionId === undefined ? undefined : this.controller.source(sessionId)
    this.observedSource = source
    this.publish(source?.getSnapshot() ?? { ...EMPTY, sessionId: sessionId ?? '' }, true)
    if (source !== undefined) {
      this.unsubscribe = source.subscribe(() => {
        if (this.observedSource === source) this.publish(source.getSnapshot(), false)
      })
    }
  }

  /** Compatibility aliases used by the initial package prototype. */
  show(sessionId: string): void { this.observe(sessionId) }
  close(): void { this.observe(undefined) }

  refresh(...args: Parameters<WorkflowRunsOperations['refresh']>): ReturnType<WorkflowRunsOperations['refresh']> { return this.controller.refresh(...args) }
  loadMore(...args: Parameters<WorkflowRunsOperations['loadMore']>): ReturnType<WorkflowRunsOperations['loadMore']> { return this.controller.loadMore(...args) }
  detail(...args: Parameters<WorkflowRunsOperations['detail']>): Promise<WorkflowRunDetail> { return this.controller.detail(...args) }
  members(...args: Parameters<WorkflowRunsOperations['members']>): Promise<WorkflowRunMemberPage> { return this.controller.members(...args) }
  memberDetail(...args: Parameters<WorkflowRunsOperations['memberDetail']>): Promise<WorkflowRunMemberDetail> { return this.controller.memberDetail(...args) }
  logs(...args: Parameters<WorkflowRunsOperations['logs']>): Promise<WorkflowRunLogPage> { return this.controller.logs(...args) }
  result(...args: Parameters<WorkflowRunsOperations['result']>): Promise<WorkflowRunResultView> { return this.controller.result(...args) }
  artifacts(...args: Parameters<WorkflowRunsOperations['artifacts']>): Promise<WorkflowRunArtifactPage> { return this.controller.artifacts(...args) }
  artifact(...args: Parameters<WorkflowRunsOperations['artifact']>): Promise<WorkflowRunArtifactChunk> { return this.controller.artifact(...args) }
  control(...args: Parameters<WorkflowRunsOperations['control']>): Promise<WorkflowRunControlResult> { return this.controller.control(...args) }
  resolveAndOpenChild(...args: Parameters<WorkflowRunsOperations['resolveAndOpenChild']>): Promise<boolean> { return this.controller.resolveAndOpenChild(...args) }
  handleChange(...args: Parameters<WorkflowRunsOperations['handleChange']>): void { this.controller.handleChange(...args) }
  handleDisconnected(...args: Parameters<WorkflowRunsOperations['handleDisconnected']>): void { this.controller.handleDisconnected(...args) }
  handleConnected(...args: Parameters<WorkflowRunsOperations['handleConnected']>): void { this.controller.handleConnected(...args) }
  handleReset(...args: Parameters<WorkflowRunsOperations['handleReset']>): void { this.controller.handleReset(...args) }
  removeSession(...args: Parameters<WorkflowRunsOperations['removeSession']>): void { this.controller.removeSession(...args) }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.unsubscribe?.()
    this.unsubscribe = undefined
    this.observedSource = undefined
    this.observedSessionId = undefined
    this.observationOwners.clear()
    this.listeners.clear()
  }

  private publish(snapshot: WorkflowRunsSourceSnapshot, force: boolean): void {
    if (!force && snapshot === this.snapshot) return
    this.snapshot = snapshot
    for (const listener of [...this.listeners]) {
      try { listener() } catch { /* contain a bad UI listener */ }
    }
  }
}

export default DashboardWorkflowRunsAdapter
