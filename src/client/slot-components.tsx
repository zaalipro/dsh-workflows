import { useLayoutEffect, type ReactElement } from 'react'
import type { WorkflowRunsOperations, WorkflowRunsSourceSnapshot } from './contract.js'
import type { DashboardLabels } from './locales.js'
import type { WorkflowsState, WorkflowsStoreInstance } from './store.js'
import { WorkflowsDashboard } from './WorkflowsDashboard.js'
import { WorkflowRunPanel, type WorkflowRunPanelProps } from './WorkflowRunPanel.js'

type SelectorHook<T> = <Selected>(selector: (value: T) => Selected) => Selected

interface SessionListView {
  readonly current?: string
}

/** Structural slot props isolate the package from nonessential Host UI types. */
export interface WorkflowsDashboardSlotProps {
  readonly useSessions: SelectorHook<SessionListView>
  readonly useStore: SelectorHook<WorkflowsState>
  readonly useWorkflowRuns: SelectorHook<WorkflowRunsSourceSnapshot>
  readonly actions: WorkflowsStoreInstance['actions']
  readonly operations: WorkflowRunsOperations
  readonly invoker?: HTMLElement | null
  readonly onClose?: () => void
  /** Notifies the owner after the slot-backed dashboard has committed. */
  readonly onPresenceChange?: (visible: boolean) => void
  /** Distinguishes slot removal from an ordinary store-backed close. */
  readonly onUnmount?: () => void
  readonly labels?: DashboardLabels
}

/** Translate the official slot standard kit into the package-owned dialog. */
export function WorkflowsDashboardSlot(props: WorkflowsDashboardSlotProps): ReactElement | null {
  const sessionId = props.useSessions(value => value.current)
  const state = props.useStore(value => value)
  const source = props.useWorkflowRuns(value => value)
  useLayoutEffect(() => {
    props.onPresenceChange?.(state.open)
  }, [state.open, props.onPresenceChange])
  useLayoutEffect(() => () => { props.onUnmount?.() }, [props.onUnmount])
  return (
    <WorkflowsDashboard
      operations={props.operations}
      source={source}
      sessionId={sessionId}
      open={state.open}
      store={state}
      storeActions={props.actions}
      invoker={props.invoker}
      onClose={props.onClose ?? props.actions.close}
      labels={props.labels}
    />
  )
}

export interface WorkflowRunChatSlotProps extends Omit<WorkflowRunPanelProps, 'resolveAndOpenChild' | 'isChildAvailable'> {
  readonly operations: Pick<WorkflowRunsOperations, 'resolveAndOpenChild'>
  readonly childAvailable?: (parentSessionId: string, childSessionId: string) => boolean
  readonly useSessions?: SelectorHook<{ readonly current?: string; readonly subagentsByParent?: unknown }>
}

/** Keyed durable-Chat renderer with exact-parent child navigation. */
export function WorkflowRunChatSlot(props: WorkflowRunChatSlotProps): ReactElement {
  if (props.useSessions !== undefined) props.useSessions(value => value)
  return (
    <WorkflowRunPanel
      node={props.node}
      sessionId={props.sessionId}
      labels={props.labels}
      isChildAvailable={childId => props.childAvailable?.(props.sessionId, childId) === true}
      resolveAndOpenChild={childId => props.operations.resolveAndOpenChild(props.sessionId, childId)}
    />
  )
}
