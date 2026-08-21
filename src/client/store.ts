/** Framework-neutral interaction store for the workflow dashboard. */

/** Sections available in the selected-run inspector. */
export type WorkflowInspectorTab = 'members' | 'logs' | 'result' | 'artifacts'

/** Narrow-screen route. */
export type WorkflowMobileView = 'runs' | 'execution' | 'inspector'

/** Overlay navigation state. Workflow business data remains in the controller. */
export interface WorkflowsState {
  open: boolean
  selectedRunId: string | undefined
  selectedMemberId: string | undefined
  selectedArtifactName: string | undefined
  inspectorTab: WorkflowInspectorTab
  mobileView: WorkflowMobileView
}

/** Draft-based actions can be adapted directly to DSH's Immer store runtime. */
export interface WorkflowsActions {
  open(draft: WorkflowsState): void
  close(draft: WorkflowsState): void
  selectRun(draft: WorkflowsState, runId: string): void
  reconcileRun(draft: WorkflowsState, runId: string | undefined, visibleRunIds?: readonly string[]): void
  selectMember(draft: WorkflowsState, memberId: string): void
  selectArtifact(draft: WorkflowsState, name: string | undefined): void
  selectTab(draft: WorkflowsState, tab: WorkflowInspectorTab): void
  showRuns(draft: WorkflowsState): void
  showExecution(draft: WorkflowsState): void
  /** Compatibility spelling used by early package consumers. */
  showRun(draft: WorkflowsState): void
}

export interface WorkflowsStoreHandle {
  readonly init: () => WorkflowsState
  readonly actions: WorkflowsActions
  readonly spec: { readonly init: () => WorkflowsState; readonly actions: WorkflowsActions }
  readonly state: WorkflowsState
  getState(): WorkflowsState
  dispatch<K extends keyof WorkflowsActions>(action: K, ...args: ActionArguments<WorkflowsActions[K]>): void
  subscribe(listener: () => void): () => void
  /** Slot-runtime compatible instance factory. */
  create(): WorkflowsStoreInstance
  dispose(): void
}

type ActionArguments<T> = T extends (draft: WorkflowsState, ...args: infer A) => void ? A : never

export interface WorkflowsStoreInstance {
  readonly actions: { [K in keyof WorkflowsActions]: (...args: ActionArguments<WorkflowsActions[K]>) => void }
  getSnapshot(): WorkflowsState
  subscribe(listener: () => void): () => void
  clearPersisted(): void
  readonly store: {
    getSnapshot(): WorkflowsState
    subscribe(listener: () => void): () => void
    update(mutator: (draft: WorkflowsState) => void): void
    set(next: WorkflowsState): void
  }
}

const initial = (): WorkflowsState => ({
  open: false,
  selectedRunId: undefined,
  selectedMemberId: undefined,
  selectedArtifactName: undefined,
  inspectorTab: 'members',
  mobileView: 'runs',
})

/** Pure dashboard state transitions. */
export const workflowsActions: WorkflowsActions = {
  open: draft => { draft.open = true },
  close: draft => { draft.open = false },
  selectRun: (draft, runId) => {
    if (draft.selectedRunId !== runId) {
      draft.selectedMemberId = undefined
      draft.selectedArtifactName = undefined
      draft.inspectorTab = 'members'
    }
    draft.selectedRunId = runId
    draft.mobileView = 'execution'
  },
  reconcileRun: (draft, runId, visibleRunIds) => {
    const candidate = runId === undefined
      ? visibleRunIds?.[0]
      : visibleRunIds === undefined || visibleRunIds.includes(runId)
        ? runId
        : visibleRunIds[0]
    if (candidate !== draft.selectedRunId) {
      draft.selectedMemberId = undefined
      draft.selectedArtifactName = undefined
      draft.inspectorTab = 'members'
    }
    draft.selectedRunId = candidate
    // Reconciliation intentionally preserves the current mobile route.
  },
  selectMember: (draft, memberId) => {
    draft.selectedMemberId = memberId
    draft.inspectorTab = 'members'
    draft.mobileView = 'inspector'
  },
  selectArtifact: (draft, name) => {
    draft.selectedArtifactName = name
    draft.inspectorTab = 'artifacts'
    draft.mobileView = 'inspector'
  },
  selectTab: (draft, tab) => {
    draft.inspectorTab = tab
    if (tab === 'members') {
      draft.mobileView = 'execution'
      draft.selectedArtifactName = undefined
    } else {
      draft.mobileView = 'inspector'
      if (tab !== 'artifacts') draft.selectedArtifactName = undefined
      draft.selectedMemberId = undefined
    }
  },
  showRuns: draft => { draft.mobileView = 'runs' },
  showExecution: draft => { draft.mobileView = 'execution' },
  showRun: draft => { draft.mobileView = 'execution' },
}

/**
 * Create a store definition plus a small standalone runtime.  Its `init` and
 * `actions` fields mirror the official store contract, while `dispatch` makes
 * it directly testable without importing a second browser state library.
 */
export function createWorkflowsStore(): WorkflowsStoreHandle {
  const standalone = createRuntime()
  return {
    init: initial,
    actions: workflowsActions,
    spec: { init: initial, actions: workflowsActions },
    get state() { return standalone.getSnapshot() },
    getState: standalone.getSnapshot,
    dispatch: (action, ...args) => { standalone.run(action, args as unknown[]) },
    subscribe: standalone.subscribe,
    create: createBoundInstance,
    dispose: standalone.dispose,
  }
}

function createRuntime() {
  let current = initial()
  const listeners = new Set<() => void>()
  const publish = (): void => {
    for (const listener of [...listeners]) {
      try { listener() } catch { /* one observer cannot starve later observers */ }
    }
  }
  const set = (next: WorkflowsState): void => { current = next; publish() }
  const update = (mutator: (draft: WorkflowsState) => void): void => {
    const draft = { ...current }
    mutator(draft)
    set(draft)
  }
  return {
    getSnapshot: (): WorkflowsState => current,
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    run: (action: keyof WorkflowsActions, args: unknown[]): void => {
      update(draft => { (workflowsActions[action] as (...values: unknown[]) => void)(draft, ...args) })
    },
    update,
    set,
    dispose: (): void => { listeners.clear() },
  }
}

function createBoundInstance(): WorkflowsStoreInstance {
  const runtime = createRuntime()
  const actions = {} as WorkflowsStoreInstance['actions']
  for (const action of Object.keys(workflowsActions) as Array<keyof WorkflowsActions>) {
    ;(actions[action] as (...args: unknown[]) => void) = (...args: unknown[]) => { runtime.run(action, args) }
  }
  return {
    actions,
    getSnapshot: runtime.getSnapshot,
    subscribe: runtime.subscribe,
    clearPersisted: () => undefined,
    store: {
      getSnapshot: runtime.getSnapshot,
      subscribe: runtime.subscribe,
      update: runtime.update,
      set: runtime.set,
    },
  }
}

export const createWorkflowStore = createWorkflowsStore
