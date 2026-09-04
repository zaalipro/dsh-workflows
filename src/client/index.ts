import { createElement, useSyncExternalStore, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { TypertClientRemote } from '@deepseek-ai/dsh-typert-protocol'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import TYPERT_REMOTE from '@zaalipro/dsh-workflows/remote'
import { DashboardWorkflowRunsAdapter } from './adapter.js'
import { WorkflowRunsController } from './controller.js'
import { workflowRunDefinition } from './workflow-definition.js'
import { workflowMessageDefinition } from './chat-renderer.js'
import { createWorkflowsStore, type WorkflowsStoreInstance } from './store.js'
import { WorkflowsDashboardSlot, WorkflowRunChatSlot } from './slot-components.js'
import { WorkflowsDashboard } from './WorkflowsDashboard.js'
import {
  NS,
  dashboardLabelsFromLocale,
  workflowChatLabelsFromLocale,
  workflowLocaleFromBind,
  workflowLocales,
} from './locales.js'
import { unwrapWorkflowRemoteResult, type WorkflowDefinitionCard } from './contract.js'

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
  'connection', 'remote', 'sessions', 'slots', 'conversationEvents', 'commandUi', 'inputTriggers', 'locale',
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
  /**
   * Stock dsh 0.1.2-rc.1 always opens a popupSelect shell for every client
   * contribution, including `kind: 'action'`. These extras open the dashboard
   * instead of hanging on "Loading options…".
   */
  options?(session: any, signal: AbortSignal): Promise<readonly { readonly id: string; readonly label: string; readonly detail?: string }[]>
  onSelect?(option: any, session: any): void | Promise<void>
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

interface WorkflowInputTriggerSource {
  readonly trigger: '/'
  readonly name: string
  readonly order?: number
  readonly showGroupTitle?: boolean
  candidates(
    session: { readonly sessionId: string },
    request: { readonly query: string; readonly position: 'leading'|'inline' },
  ): Promise<readonly { readonly name: string; readonly description: string }[]>
  onPick(pick: { readonly position: 'leading'|'inline' }): 'handled' | { readonly text: string } | undefined
  matchEnter(
    session: { readonly sessionId: string },
    line: string,
    signal: AbortSignal,
    envelope: { readonly images: number },
  ): Promise<'handled' | { readonly claim: {
    readonly token: string
    submit(args: string): Promise<{ readonly kind: 'success'|'error'; readonly text?: string }>
  }} | undefined>
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

/** Action-capable command UIs dispatch kind:action via runAction; stock RC2 always opens a popup. */
function commandUiDispatchesActions(commandUi: object): boolean {
  let current: object | null = commandUi
  while (current !== null) {
    if (typeof (current as { runAction?: unknown }).runAction === 'function') return true
    current = Object.getPrototypeOf(current)
    if (current === Object.prototype) break
  }
  return false
}

const PICKER_PAGE_LIMIT = 32
const PICKER_TIMEOUT_MS = 2_500

async function callDefinitionList(list: (...args: never[]) => Promise<unknown>, sessionId: string, request: object, signal: AbortSignal): Promise<unknown> {
  try {
    return await (list as (sessionId: string, request: object, signal: AbortSignal) => Promise<unknown>)(sessionId, request, signal)
  } catch {
    return await (list as (sessionId: string, signal: AbortSignal) => Promise<unknown>)(sessionId, signal)
  }
}

async function callDefinitionListRpc(connection: any, sessionId: string, request: object, signal: AbortSignal): Promise<unknown> {
  const rpc = connection?.rpc?.call
  if (typeof rpc !== 'function') return { items: [] }
  return rpc.call(connection.rpc, '/api', 'workflowDefinitions/list', {
    args: { agentId: sessionId, request },
  }, signal)
}

/** Load the picker catalog; an absent or hung Remote must settle, never spin. */
async function loadPickerDefinitions(
  definitionsRemote: any,
  session: any,
  signal: AbortSignal,
  connection?: any,
): Promise<readonly any[]> {
  const list = definitionsRemote?.list ?? definitionsRemote?.['workflowDefinitions/list']
  const sessionId = String(session?.sessionId ?? '')
  if (typeof list !== 'function' && typeof connection?.rpc?.call !== 'function') return []
  const work = (async () => {
    const items: any[] = []
    const seen = new Set<string>()
    let cursor: string | undefined
    for (let pageNo = 0; pageNo < PICKER_PAGE_LIMIT; pageNo += 1) {
      signal.throwIfAborted()
      const request = cursor === undefined ? { limit: 200 } : { limit: 200, cursor }
      const raw = typeof list === 'function'
        ? await callDefinitionList(list, sessionId, request, signal)
        : await callDefinitionListRpc(connection, sessionId, request, signal)
      const page = unwrapWorkflowRemoteResult<any>(raw)
      const pageItems = Array.isArray(page) ? page : Array.isArray(page?.items) ? page.items : []
      items.push(...pageItems)
      if (items.length > MAX_PICKER_DEFINITIONS) return items.slice(0, MAX_PICKER_DEFINITIONS)
      const next = page?.nextCursor === undefined || page?.nextCursor === '' ? undefined : String(page.nextCursor)
      if (next === undefined) return items
      if (seen.has(next) || next === cursor) return items
      seen.add(next)
      cursor = next
    }
    return items
  })()
  const timeout = new Promise<never>((_, reject) => {
    const timer = setTimeout(() => reject(new Error('workflow definition picker timed out')), PICKER_TIMEOUT_MS)
    const abort = (): void => {
      clearTimeout(timer)
      reject(signal.reason ?? new Error('workflow definition picker aborted'))
    }
    if (signal.aborted) abort()
    else signal.addEventListener('abort', abort, { once: true })
    void work.finally(() => clearTimeout(timer))
  })
  try {
    return await Promise.race([work, timeout])
  } catch {
    return []
  }
}

function bindDashboardCatalog(remote: any, sessions: any, connection?: any): {
  listDefinitions: (sessionId: string, signal?: AbortSignal) => Promise<readonly WorkflowDefinitionCard[]>
  launchDefinition: (sessionId: string, name: string, signal?: AbortSignal) => Promise<void>
} {
  return {
    async listDefinitions(sessionId, signal) {
      const items = await loadPickerDefinitions(remote, { sessionId }, signal ?? new AbortController().signal, connection)
      const cards: WorkflowDefinitionCard[] = []
      for (const item of items) {
        const name = typeof item?.name === 'string' ? item.name : ''
        if (name === '') continue
        cards.push({
          name,
          description: typeof item.description === 'string' ? item.description : '',
          ...(typeof item.whenToUse === 'string' ? { whenToUse: item.whenToUse } : {}),
          ...(typeof item.scope === 'string' ? { scope: item.scope } : {}),
        })
      }
      return cards
    },
    async launchDefinition(sessionId, name, signal) {
      signal?.throwIfAborted()
      if (!/^[a-z](?:[a-z0-9]*)(?:-[a-z0-9]+)*$/u.test(name)) {
        throw new Error('workflow name is invalid')
      }
      const live = sessions.binding?.(sessionId)?.session
      if (live === undefined || typeof live.command !== 'function') {
        throw new Error('this session is not available')
      }
      const result = await live.command(`/workflow ${name}`)
      if (result?.ok === false) {
        const raw = result.error
        const message = typeof raw === 'string' && raw.length > 0
          ? raw
          : typeof raw === 'object' && raw !== null && typeof (raw as any).message === 'string' && (raw as any).message.length > 0
            ? (raw as any).message
            : 'the host rejected /workflow'
        throw new Error(message)
      }
      if (result?.value?.matched === false) throw new Error('the host offers no /workflow command')
    },
  }
}

/** Read a namespace installed dynamically by Typert without traversing the
 * injected `remote` aggregate. Cordis deliberately rejects that traversal
 * unless the nested service was part of the plugin inject list; adding it to
 * the list would deadlock because this plugin is also what mounts it. */
function mountedRemoteNamespace(root: AnyContext, remote: any, namespace: string): any {
  if (typeof (root as any).get === 'function') {
    return (root as any).get(`remote.${namespace}`)
  }
  // Unit/minimal host contexts are ordinary objects rather than Cordis
  // proxies, so retain their convenient nested fake shape.
  return remote?.[namespace]
}

/**
 * Register one complete browser aggregate.  The generated Remote is mounted
 * first; every consumer and listener is created in that mount's effect and
 * is disposed before the contribution is unmounted.
 */
export function apply(ctx: ClientContext): Promise<void> {
  const root = ctx as AnyContext
  const startup = root.effect(async () => {
    const cleanup: Array<() => unknown> = []
    const addCleanup = (value: Disposer): void => {
      if (value !== undefined) cleanup.push(value)
    }
    let dashboardActions: WorkflowsStoreInstance['actions'] | undefined
    let pendingOpen = false
    let liveAdapter: DashboardWorkflowRunsAdapter | undefined
    let fallbackRoot: Root | undefined
    let fallbackHost: HTMLElement | undefined
    let fallbackOpen = false
    let fallbackSchedule = 0
    let slotDashboardVisible = false
    let dashboardLogicallyOpen = false
    let remoteDisposer: unknown
    let controller: WorkflowRunsController | undefined
    let adapter: DashboardWorkflowRunsAdapter | undefined
    let rolledBack = false
    let overlayState: { readonly invoker: HTMLElement | null } = { invoker: null }
    const overlayListeners = new Set<() => void>()
    const rollback = async (): Promise<void> => {
      if (rolledBack) return
      rolledBack = true
      dashboardActions = undefined
      liveAdapter = undefined
      overlayListeners.clear()
      fallbackOpen = false
      slotDashboardVisible = false
      dashboardLogicallyOpen = false
      fallbackSchedule += 1
      try { fallbackRoot?.unmount() } catch { /* contained */ }
      fallbackRoot = undefined
      fallbackHost?.remove()
      fallbackHost = undefined
      // Reverse registration order: listeners/slots/consumers stop before
      // the generated Remote namespace is unmounted.
      for (const dispose of cleanup.splice(0).reverse()) {
        try { await dispose() } catch { /* one rollback cannot block the rest */ }
      }
      try { adapter?.dispose() } catch { /* contained */ }
      try { controller?.dispose() } catch { /* contained */ }
      adapter = undefined
      controller = undefined
      await Promise.resolve(disposeValue(remoteDisposer)).catch(() => undefined)
      remoteDisposer = undefined
    }
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
    const currentSessionId = (): string | undefined => {
      const id = (root.sessions as any)?.list?.getSnapshot?.()?.current
      return typeof id === 'string' && id.length > 0 ? id : undefined
    }
    const fallbackObservationOwner = {}
    const slotObservationOwner = {}
    const scopedOperations = (owner: object): DashboardWorkflowRunsAdapter | undefined => {
      if (liveAdapter === undefined) return undefined
      return new Proxy(liveAdapter, {
        get(target, property) {
          if (property === 'observe') {
            return (sessionId: string | undefined) => { target.observeFor(owner, sessionId) }
          }
          const value = Reflect.get(target, property, target)
          // `source` is a callable external-store object whose own methods
          // would be lost if Function#bind produced a replacement function.
          if (property === 'source') return value
          return typeof value === 'function' ? value.bind(target) : value
        },
      })
    }
    let fallbackOperations: DashboardWorkflowRunsAdapter | undefined
    let slotOperations: DashboardWorkflowRunsAdapter | undefined
    const renderFallbackDashboard = (): void => {
      if (typeof document === 'undefined' || liveAdapter === undefined || slotDashboardVisible) return
      fallbackOperations ??= scopedOperations(fallbackObservationOwner)
      if (fallbackHost === undefined) {
        fallbackHost = document.createElement('div')
        fallbackHost.id = 'dsh-workflows-overlay'
        document.body.appendChild(fallbackHost)
      }
      fallbackRoot ??= createRoot(fallbackHost)
      const sessionId = currentSessionId()
      fallbackRoot.render(fallbackOpen
        ? createElement(WorkflowsDashboard, {
          operations: fallbackOperations!,
          sessionId,
          open: true,
          onClose: () => {
            dashboardLogicallyOpen = false
            fallbackOpen = false
            fallbackSchedule += 1
            dashboardActions?.close?.()
            renderFallbackDashboard()
          },
          labels: dashboardLabelsFromLocale(workflowLocaleFromBind(
            typeof root.locale?.bind === 'function' ? root.locale.bind(NS) : undefined,
          )),
        })
        : createElement('div'))
    }
    const removeFallbackDashboard = (): void => {
      fallbackOpen = false
      fallbackSchedule += 1
      const staleRoot = fallbackRoot
      fallbackRoot = undefined
      fallbackHost?.remove()
      fallbackHost = undefined
      // Presence is reported from the shell root's layout effect. Detach the
      // fallback DOM immediately (so two dialogs are never observable), then
      // let React dispose its separate root after the current commit.
      queueMicrotask(() => {
        try { staleRoot?.unmount() } catch { /* contained */ }
      })
    }
    const reportSlotDashboardPresence = (visible: boolean): void => {
      slotDashboardVisible = visible
      if (visible) {
        dashboardLogicallyOpen = true
        removeFallbackDashboard()
      } else {
        // A committed closed state is authoritative and cancels any portal
        // scheduled by the action which produced that state transition.
        dashboardLogicallyOpen = false
        fallbackSchedule += 1
      }
    }
    const reportSlotDashboardUnmount = (): void => {
      slotDashboardVisible = false
      // A shell remount/navigation must not make an open dashboard vanish.
      // Restore the portal only while the store is still logically open;
      // normal close first clears that flag through `close`/presence.
      if (dashboardLogicallyOpen) scheduleFallbackDashboard()
    }
    const scheduleFallbackDashboard = (): void => {
      if (rolledBack || !dashboardLogicallyOpen || typeof document === 'undefined'
        || liveAdapter === undefined || slotDashboardVisible) return
      const scheduled = ++fallbackSchedule
      // Give the shell's external store update a microtask to commit its slot.
      // A later slot mount still reports presence and atomically removes an
      // already-created fallback; a shell which never renders gets the portal.
      queueMicrotask(() => {
        if (scheduled !== fallbackSchedule) return
        if (rolledBack || !dashboardLogicallyOpen || slotDashboardVisible) return
        fallbackOpen = true
        renderFallbackDashboard()
      })
    }
    let dispatchesActions = false
    const openDashboard = (): boolean => {
      if (dashboardActions !== undefined && typeof dashboardActions.open === 'function') {
        const active = typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null
        captureInvoker(active)
        dashboardActions.open()
        dashboardLogicallyOpen = true
        pendingOpen = false
        scheduleFallbackDashboard()
        return true
      }
      pendingOpen = true
      if (liveAdapter === undefined || typeof document === 'undefined') {
        return dashboardActions !== undefined && typeof dashboardActions.open === 'function'
      }
      dashboardLogicallyOpen = true
      fallbackOpen = true
      renderFallbackDashboard()
      pendingOpen = false
      return fallbackHost !== undefined
        || (dashboardActions !== undefined && typeof dashboardActions.open === 'function')
    }
    try {
    addCleanup(root.locale?.register?.(NS, workflowLocales))
    const commandUi = requireCommandUi(root.commandUi)
    const translate = typeof root.locale?.bind === 'function' ? root.locale.bind(NS) : undefined
    const workflowsDescription = typeof translate === 'function'
      ? String(translate('commandDescription'))
      : workflowLocales.en.commandDescription
    // Stock dsh always opens popupSelect for client contributions, including
    // kind:'action'. A Host /workflows command plus command/executed (and the
    // durable command node) opens the overlay without colliding with that picker.
    // Keep a contribution only when the runtime actually dispatches actions.
    dispatchesActions = commandUiDispatchesActions(commandUi)
    if (dispatchesActions) {
      addCleanup(asDisposer(commandUi.register({
        name: 'workflows',
        description: workflowsDescription,
        available: () => true,
        ui: {
          kind: 'action' as const,
          run: () => {
            if (!openDashboard()) {
              throw new Error('workflow dashboard overlay is not mounted')
            }
          },
        },
      })))
    }

    // Enter adjudication is independent of commandUi's picker/action plane.
    // Even action-capable shells can submit an exact typed token through the
    // composer before commandUi gets a chance to dispatch it. Keep one source
    // in every runtime so bare Enter is claimed locally and can never fall
    // through to a Host/model turn. In action-capable shells commandUi remains
    // the sole menu candidate/pick owner, avoiding duplicate visible actions.
    const registerSource = root.inputTriggers?.registerSource
    if (typeof registerSource !== 'function') {
      throw new Error('workflow dashboard slash action registration is unavailable')
    }
    const actionSource: WorkflowInputTriggerSource = {
      trigger: '/',
      name: 'workflows',
      order: -100,
      showGroupTitle: false,
      async candidates(_session, request) {
        if (dispatchesActions || request.position !== 'leading') return []
        const query = request.query.toLowerCase()
        if (query !== '' && !'workflows'.includes(query)) return []
        return [{ name: 'workflows', description: workflowsDescription }]
      },
      onPick(pick) {
        if (dispatchesActions || pick.position !== 'leading') return undefined
        if (!openDashboard()) return undefined
        // The input-trigger pipeline applies this replacement through its
        // span CAS, so a successful menu action consumes only the exact
        // slash token and cannot append a Host command lifecycle row.
        return { text: '' }
      },
      async matchEnter(_session, line, signal, envelope) {
        if (line !== '/workflows') {
          if (/^\/workflows\s/u.test(line)) {
            throw new Error('the /workflows dashboard action accepts no arguments')
          }
          return undefined
        }
        signal.throwIfAborted()
        if (envelope.images > 0) {
          throw new Error('the /workflows dashboard action does not accept images')
        }
        // A claim gives the conversation input machine an ordinary submit
        // transaction: dashboard open is the commit and kind:success clears
        // the exact bare-token draft. No Host Remote or model sink is called.
        return {
          claim: {
            token: '/workflows',
            async submit() {
              if (!openDashboard()) {
                return { kind: 'error', text: 'workflow dashboard overlay is not mounted' }
              }
              return { kind: 'success' }
            },
          },
        }
      },
    }
    addCleanup(asDisposer(registerSource.call(root.inputTriggers, actionSource)))

    const remote = root.remote as unknown as TypertClientRemote & Record<string, any>
    const sessions = root.sessions as any
    // Dynamic namespaces do not exist until the contribution is mounted. Use
    // the RPC fallback until then rather than reading them via the traced
    // aggregate (which is an undeclared-service error in real Cordis).
    const liveController = new WorkflowRunsController({}, sessions, root.connection)
    const adapterInstance = new DashboardWorkflowRunsAdapter(liveController)
    let definitionsRemote: any
    const catalog = bindDashboardCatalog({
      get list() { return definitionsRemote?.list },
      get ['workflowDefinitions/list']() { return definitionsRemote?.['workflowDefinitions/list'] },
    }, sessions, root.connection)
    adapterInstance.listDefinitions = catalog.listDefinitions
    adapterInstance.launchDefinition = catalog.launchDefinition
    liveAdapter = adapterInstance
    controller = liveController
    adapter = adapterInstance
    slotOperations = scopedOperations(slotObservationOwner)
    if (pendingOpen) openDashboard()

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
        operations: adapterInstance,
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
        operations: adapterInstance,
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
        adapterInstance.source.subscribe,
        adapterInstance.source.getSnapshot,
        adapterInstance.source.getSnapshot,
      )
      const dict = workflowLocaleFromBind(typeof root.locale?.bind === 'function' ? root.locale.bind(NS) : undefined)
      const close = (): void => {
        dashboardLogicallyOpen = false
        fallbackSchedule += 1
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
        operations: slotOperations ?? adapterInstance,
        invoker: overlay.invoker,
        onClose: close,
        onPresenceChange: reportSlotDashboardPresence,
        onUnmount: reportSlotDashboardUnmount,
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
        if (actions !== undefined && typeof actions.open === 'function') {
          dashboardActions = actions
          if (pendingOpen) {
            pendingOpen = false
            actions.open()
          }
        }
        return { operations: slotOperations ?? adapterInstance, hooks: { workflowRuns: adapterInstance.source } }
      },
    }, DashboardContribution))
    addCleanup(overlayInjection)

    // Overlay and command-row registration must complete before this await.
    // $mount has to run on this fiber (not a detached then) so the generated
    // workflowRuns namespace actually installs.
    if (typeof remote?.$mount === 'function') {
      try { remoteDisposer = await remote.$mount(TYPERT_REMOTE) }
      catch { remoteDisposer = undefined }
    }
    definitionsRemote = mountedRemoteNamespace(root, remote, 'workflowDefinitions')
    const runsRemote = mountedRemoteNamespace(root, remote, 'workflowRuns')
    if (runsRemote !== undefined) liveController.setRemote(runsRemote)
    if (pendingOpen) openDashboard()

    if (typeof definitionsRemote?.list === 'function') addCleanup(asDisposer(commandUi.decorate({
      name: 'workflow',
      available: () => true,
      ui: {
        kind: 'popupSelect',
        options: async (session: any, signal: AbortSignal) => {
          const definitions = await loadPickerDefinitions(definitionsRemote, session, signal, root.connection)
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
    } catch (error) {
      // Every setup phase, including the pre-controller registrations, owns
      // the same rollback transaction. Never swallow an unexpected setup
      // failure: a resolved effect would otherwise make the plugin look active
      // while its /workflows source had already been removed, allowing a typed
      // token to fall through to a model turn. Expected optional failures
      // (notably Remote projection mount) are handled at their call site.
      await rollback()
      throw error
    }

    return rollback
  }, 'dsh-workflows: client aggregate')

  // `ctx.effect()` starts immediately, but its callable return value is also
  // a thenable that settles only after an async effect has finished setting
  // up.  The plugin callback must expose that setup barrier to Cordis.  If it
  // is discarded, Cordis can mark the plugin ACTIVE before (for example) the
  // Typert mount resumes, and a later setup rejection merely tears down this
  // nested effect without failing the plugin fiber.
  //
  // Do not return the disposer yielded by awaiting the thenable.  The effect
  // wrapper is already owned by this fiber and will be unloaded with it;
  // returning that disposer as a second outer effect would duplicate
  // ownership.  `Promise.resolve` also preserves the minimal plain-object
  // fixtures whose `effect()` shim returns `undefined` while separately
  // recording the callback promise.
  return Promise.resolve(startup).then(() => undefined)
}
