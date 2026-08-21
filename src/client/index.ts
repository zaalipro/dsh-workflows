import { createElement, useSyncExternalStore, type ReactElement } from 'react'
import type { TypertClientRemote } from '@deepseek-ai/dsh-typert-protocol'
import TYPERT_REMOTE from '@zaalipro/dsh-workflows/remote'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { DashboardWorkflowRunsAdapter } from './adapter.js'
import { WorkflowRunsController } from './controller.js'
import { workflowRunDefinition } from './workflow-definition.js'
import { workflowMessageDefinition } from './chat-renderer.js'
import { createWorkflowsStore, type WorkflowsStoreInstance } from './store.js'
import { WorkflowsDashboardSlot, WorkflowRunChatSlot } from './slot-components.js'
import {
  NS,
  dashboardLabelsFromLocale,
  workflowChatLabelsFromLocale,
  workflowLocaleFromBind,
  workflowLocales,
} from './locales.js'
import { unwrapWorkflowRemoteResult } from './contract.js'

export * from './contract.js'
export * from './controller.js'
export * from './adapter.js'
export * from './store.js'
export * from './locales.js'
export * from './WorkflowsDashboard.js'
export * from './WorkflowRunPanel.js'
export * from './WorkflowMemberInspector.js'
export * from './workflow-definition.js'

/** Services consumed by the browser half of the package. */
export const inject = [
  'connection', 'remote', 'sessions', 'slots', 'conversationEvents', 'commandUi', 'locale',
] as const

type AnyContext = ClientContext & Record<string, any>
type Disposer = (() => unknown) | undefined

function disposeValue(value: unknown): void | Promise<void> {
  if (typeof value === 'function') return value()
  if (typeof (value as { dispose?: unknown } | null)?.dispose === 'function') {
    return (value as { dispose(): void | Promise<void> }).dispose()
  }
}

function asDisposer(value: unknown): Disposer {
  if (typeof value === 'function') return value as () => unknown
  if (typeof (value as { dispose?: unknown } | null)?.dispose === 'function') {
    return () => (value as { dispose(): unknown }).dispose()
  }
}

/** Top-level Session ids only. Never union `byId` (addressed children). */
function sessionListIds(sessions: any): readonly string[] | undefined {
  const list = sessions?.list?.getSnapshot?.()
  if (list == null || typeof list !== 'object') return undefined
  if (list.phase === 'pending' || list.status === 'pending') return undefined
  if (!Array.isArray(list.ids)) return undefined
  const ids = list.ids.filter((value: unknown): value is string => typeof value === 'string')
  // A missing/non-ready phase with an empty id list is the pending-empty
  // snapshot that must not mass-remove observed Sessions.
  if (list.phase !== 'ready' && ids.length === 0) return undefined
  return ids
}

function directChildAvailable(sessions: any, parentSessionId: string, childSessionId: string): boolean {
  const catalog = sessions?.list?.getSnapshot?.()?.subagentsByParent?.[parentSessionId]
  if (catalog?.state !== 'ready' || !Array.isArray(catalog.entries)) return false
  return catalog.entries.some((entry: any) => (
    entry?.kind === 'child'
    && entry?.mode === 'one-shot'
    && (entry.id ?? entry.childSessionId) === childSessionId
    && (entry.parentSessionId ?? entry.parentId ?? parentSessionId) === parentSessionId
  ))
}

const MAX_PICKER_DEFINITIONS = 4_096

interface WorkflowActionCommandUi {
  readonly kind: 'action'
  run(session?: unknown): void | Promise<void>
}

interface WorkflowPopupSelectCommandUi {
  readonly kind: 'popupSelect'
  options(session: any, signal: AbortSignal): Promise<readonly { readonly id: string; readonly label: string; readonly detail?: string }[]>
  onSelect(option: any, session: any): void | Promise<void>
}

interface WorkflowCommandUi {
  register(contribution: {
    readonly name: string
    readonly description: string
    available(): boolean
    readonly ui: WorkflowActionCommandUi
  }): unknown
  decorate(decoration: {
    readonly name: string
    available(): boolean
    readonly ui: WorkflowPopupSelectCommandUi
  }): unknown
}

function requireCommandUi(commandUi: unknown): WorkflowCommandUi {
  if (typeof commandUi !== 'object' || commandUi === null) {
    throw new Error('workflow dashboard action registration is unavailable')
  }
  const register = (commandUi as { register?: unknown }).register
  const decorate = (commandUi as { decorate?: unknown }).decorate
  if (typeof register !== 'function' || typeof decorate !== 'function') {
    throw new Error('workflow dashboard action registration is unavailable')
  }
  return commandUi as WorkflowCommandUi
}

/** Load the complete picker catalog through the generated direct Agent face. */
async function loadPickerDefinitions(
  remote: any,
  session: any,
  signal: AbortSignal,
): Promise<readonly any[]> {
  const definitions = remote?.workflowDefinitions
  if (typeof definitions?.list !== 'function') {
    throw new Error('workflow definition picker is unavailable')
  }
  const items: any[] = []
  const seen = new Set<string>()
  let cursor: string | undefined
  for (;;) {
    const request = cursor === undefined ? { limit: 200 } : { limit: 200, cursor }
    // H's generated direct face is always (sessionId, request, signal).  Do
    // not infer the arity: minifiers/proxies are free to expose any length.
    const raw = await definitions.list(session.sessionId, request, signal)
    const page = unwrapWorkflowRemoteResult<any>(raw)
    const pageItems = Array.isArray(page) ? page : Array.isArray(page?.items) ? page.items : []
    items.push(...pageItems)
    if (items.length > MAX_PICKER_DEFINITIONS) {
      throw new Error('workflow definition picker exceeds 4096 definitions')
    }
    const next = page?.nextCursor === undefined ? undefined : String(page.nextCursor)
    if (next === undefined) return items
    if (seen.has(next) || next === cursor) throw new Error('workflow definition picker received a repeated cursor')
    seen.add(next)
    cursor = next
  }
}

/**
 * Register one complete browser aggregate.  The generated Remote is mounted
 * first; every consumer and listener is created in that mount's effect and
 * is disposed before the contribution is unmounted.
 */
export function apply(ctx: ClientContext): void {
  const root = ctx as AnyContext
  root.effect(async () => {
    const cleanup: Array<() => unknown> = []
    const addCleanup = (value: Disposer): void => {
      if (value !== undefined) cleanup.push(value)
    }
    let dashboardActions: WorkflowsStoreInstance['actions'] | undefined
    let overlayMounted = false
    let remoteDisposer: unknown
    let overlayState: { readonly invoker: HTMLElement | null } = { invoker: null }
    const overlayListeners = new Set<() => void>()
    const publishOverlay = (next: typeof overlayState): void => {
      overlayState = next
      for (const listener of [...overlayListeners]) listener()
    }
    const captureInvoker = (element?: HTMLElement | null): void => {
      const active = typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
      publishOverlay({ invoker: element ?? active })
    }
    const commandUi = requireCommandUi(root.commandUi)
    const translate = typeof root.locale?.bind === 'function' ? root.locale.bind(NS) : undefined
    const workflowsDescription = typeof translate === 'function'
      ? String(translate('commandDescription'))
      : workflowLocales.en.commandDescription
    addCleanup(asDisposer(commandUi.register({
      name: 'workflows',
      description: workflowsDescription,
      available: () => true,
      ui: {
        kind: 'action' as const,
        run: () => {
          if (!overlayMounted || dashboardActions === undefined || typeof dashboardActions.open !== 'function') {
            throw new Error('workflow dashboard overlay is not mounted')
          }
          const active = typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null
          captureInvoker(active)
          dashboardActions.open()
        },
      },
    })))

    let controller: WorkflowRunsController | undefined
    let adapter: DashboardWorkflowRunsAdapter | undefined
    try {
    const remote = root.remote as TypertClientRemote & Record<string, any>
    if (typeof remote?.$mount === 'function') {
      try { remoteDisposer = await remote.$mount(TYPERT_REMOTE) } catch { remoteDisposer = undefined }
    }

    const sessions = root.sessions as any
    const liveController = new WorkflowRunsController(remote, sessions)
    const liveAdapter = new DashboardWorkflowRunsAdapter(liveController)
    controller = liveController
    adapter = liveAdapter

    root.workflowRunsController = liveController
    root.workflowRunsAdapter = liveAdapter
    root.workflowRunDefinition = workflowRunDefinition

    // Locale registration is effect-owned along with the rest of the client
    // aggregate.  The locale face accepts both the RC8 and H dictionary shape.
    addCleanup(root.locale?.register?.(NS, workflowLocales))

    addCleanup(root.conversationEvents?.register?.(workflowMessageDefinition))
    if (root.conversationEvents !== undefined && root.conversationEvents.register !== undefined
      && workflowMessageDefinition !== workflowRunDefinition) {
      // Keep the named definition visible to older consumers that inspect the
      // package export rather than the keyed renderer registry.
      addCleanup(root.conversationEvents.register(workflowRunDefinition))
    }

    const runChatComponent = (props: any): ReactElement => {
      const dict = workflowLocaleFromBind(typeof root.locale?.bind === 'function' ? root.locale.bind(NS) : undefined)
      return createElement(WorkflowRunChatSlot, {
        ...props,
        operations: liveAdapter,
        useSessions: props.useSessions,
        labels: workflowChatLabelsFromLocale(dict),
        childAvailable: (parent: string, child: string) => directChildAvailable(sessions, parent, child),
      })
    }
    const chatInjection = root.slots?.inject?.('conversation.chat.node', () => root.slots.register({
      name: 'conversation.chat.node',
      key: 'workflow-run',
      locale: NS,
      inject: () => ({
        operations: liveAdapter,
        childAvailable: (parent: string, child: string) => directChildAvailable(sessions, parent, child),
      }),
    }, runChatComponent))
    addCleanup(chatInjection)

    /** Root-scoped overlay component; slot standard hooks remain framework-owned. */
    function DashboardContribution(props: any): ReactElement | null {
      if (props.actions !== undefined) dashboardActions = props.actions
      const list = sessions.list
      const sessionId = useSyncExternalStore(
        list.subscribe.bind(list),
        () => list.getSnapshot().current,
        () => list.getSnapshot().current,
      )
      const overlay = useSyncExternalStore(
        listener => { overlayListeners.add(listener); return () => { overlayListeners.delete(listener) } },
        () => overlayState,
        () => overlayState,
      )
      const source = useSyncExternalStore(
        liveAdapter.source.subscribe,
        liveAdapter.source.getSnapshot,
        liveAdapter.source.getSnapshot,
      )
      const dict = workflowLocaleFromBind(typeof root.locale?.bind === 'function' ? root.locale.bind(NS) : undefined)
      const close = (): void => {
        publishOverlay({ invoker: overlay.invoker })
        props.actions?.close?.()
      }
      return createElement(WorkflowsDashboardSlot, {
        ...props,
        useSessions: props.useSessions ?? ((selector: any) => selector({ current: sessionId })),
        useStore: props.useStore ?? ((selector: any) => selector({
          open: false,
          selectedRunId: undefined,
          selectedMemberId: undefined,
          selectedArtifactName: undefined,
          inspectorTab: 'members',
          mobileView: 'runs',
        })),
        useWorkflowRuns: props.useWorkflowRuns ?? ((selector: any) => selector(source)),
        actions: props.actions ?? {
          open: () => undefined,
          close: () => undefined,
          selectRun: () => undefined,
          reconcileRun: () => undefined,
          selectMember: () => undefined,
          selectArtifact: () => undefined,
          selectTab: () => undefined,
          showRuns: () => undefined,
          showExecution: () => undefined,
          showRun: () => undefined,
        },
        operations: liveAdapter,
        invoker: overlay.invoker,
        onClose: close,
        labels: dashboardLabelsFromLocale(dict),
      } as any)
    }

    const overlayInjection = root.slots?.inject?.('shell.overlay', () => root.slots.register({
      name: 'shell.overlay',
      id: 'workflows-dashboard',
      order: 100,
      locale: NS,
      store: createWorkflowsStore,
      inject: (actions?: WorkflowsStoreInstance['actions']) => {
        if (actions !== undefined && typeof actions.open === 'function') dashboardActions = actions
        return { operations: liveAdapter, hooks: { workflowRuns: liveAdapter.source } }
      },
    }, DashboardContribution))
    addCleanup(overlayInjection)
    overlayMounted = overlayInjection !== undefined

    addCleanup(asDisposer(commandUi.decorate({
      name: 'workflow',
      available: () => true,
      ui: {
        kind: 'popupSelect',
        options: async (session: any, signal: AbortSignal) => {
          const definitions = await loadPickerDefinitions(remote, session, signal)
          return definitions.map((definition: any) => ({
            id: String(definition.name),
            label: String(definition.name),
            detail: `${String(definition.description ?? '')}${definition.whenToUse === undefined ? '' : ` — ${String(definition.whenToUse)}`} · ${String(definition.scope ?? '')}`,
          }))
        },
        onSelect: async (option: any, session: any) => {
          const binding = sessions.binding?.(session.sessionId)
          const live = binding?.session
          if (live === undefined) throw new Error('this session is not available')
          const result = await live.command(`/workflow ${String(option.id)}`)
          if (result?.ok === false) {
            throw new Error(typeof result.error === 'string' && result.error.length > 0
              ? result.error
              : 'the host rejected /workflow')
          }
          if (result?.value?.matched === false) throw new Error('the host offers no /workflow command')
        },
      },
    })))

    // The generated event transport is deliberately invalidation-only.  Do
    // not copy run heads from the event into browser state.
    const remoteOn = remote.$on as ((event: string, listener: (change: any) => void) => (() => void)) | undefined
    if (typeof remoteOn === 'function') {
      addCleanup(remoteOn.call(remote, 'workflows/run-change', change => liveController.handleChange(change)))
    }

    const hostDescription = root.connection?.hostDescription
    if (hostDescription?.subscribe !== undefined) {
      addCleanup(hostDescription.subscribe(() => {
        if (hostDescription.getSnapshot?.() === undefined) liveController.handleDisconnected()
        else liveController.handleConnected()
      }))
      if (hostDescription.getSnapshot?.() === undefined) liveController.handleDisconnected()
    }
    if (typeof root.on === 'function') {
      const registered = root.on('connection/reset', () => liveController.handleReset())
      if (typeof registered === 'function') addCleanup(registered)
    }

    if (sessions.list?.subscribe !== undefined) {
      let previous = new Set(sessionListIds(sessions) ?? [])
      addCleanup(sessions.list.subscribe(() => {
        const current = sessionListIds(sessions)
        if (current === undefined) return
        const keys = new Set(current)
        for (const id of previous) if (!keys.has(id)) liveController.removeSession(id)
        previous = keys
      }))
    }
    } catch { /* /workflows slash action stays registered */ }

    return async () => {
      dashboardActions = undefined
      overlayListeners.clear()
      // Reverse registration order: listeners/slots/consumers stop before
      // the generated Remote namespace is unmounted.
      for (const dispose of cleanup.reverse()) {
        try { await dispose() } catch { /* one child cannot block aggregate unload */ }
      }
      adapter?.dispose()
      controller?.dispose()
      await disposeValue(remoteDisposer)
    }
  }, 'dsh-workflows: client aggregate')
}
