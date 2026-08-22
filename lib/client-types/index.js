import { createElement, useEffect, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import TYPERT_REMOTE from '@zaalipro/dsh-workflows/remote';
import { DashboardWorkflowRunsAdapter } from './adapter.js';
import { WorkflowRunsController } from './controller.js';
import { workflowRunDefinition } from './workflow-definition.js';
import { workflowMessageDefinition } from './chat-renderer.js';
import { createWorkflowsStore } from './store.js';
import { WorkflowsDashboardSlot, WorkflowRunChatSlot } from './slot-components.js';
import { WorkflowsDashboard } from './WorkflowsDashboard.js';
import { NS, dashboardLabelsFromLocale, workflowChatLabelsFromLocale, workflowLocaleFromBind, workflowLocales, } from './locales.js';
import { unwrapWorkflowRemoteResult } from './contract.js';
export * from './contract.js';
export * from './controller.js';
export * from './adapter.js';
export * from './store.js';
export * from './locales.js';
export * from './WorkflowsDashboard.js';
export * from './WorkflowRunPanel.js';
export * from './WorkflowMemberInspector.js';
export * from './workflow-definition.js';
/** Services consumed by the browser half of the package. */
export const inject = [
    'connection', 'remote', 'sessions', 'slots', 'conversationEvents', 'commandUi', 'locale',
];
function disposeValue(value) {
    if (typeof value === 'function')
        return value();
    if (typeof value?.dispose === 'function') {
        return value.dispose();
    }
}
function asDisposer(value) {
    if (typeof value === 'function')
        return value;
    if (typeof value?.dispose === 'function') {
        return () => value.dispose();
    }
}
/** Top-level Session ids only. Never union `byId` (addressed children). */
function sessionListIds(sessions) {
    const list = sessions?.list?.getSnapshot?.();
    if (list == null || typeof list !== 'object')
        return undefined;
    if (list.phase === 'pending' || list.status === 'pending')
        return undefined;
    if (!Array.isArray(list.ids))
        return undefined;
    const ids = list.ids.filter((value) => typeof value === 'string');
    // A missing/non-ready phase with an empty id list is the pending-empty
    // snapshot that must not mass-remove observed Sessions.
    if (list.phase !== 'ready' && ids.length === 0)
        return undefined;
    return ids;
}
function directChildAvailable(sessions, parentSessionId, childSessionId) {
    const catalog = sessions?.list?.getSnapshot?.()?.subagentsByParent?.[parentSessionId];
    if (catalog?.state !== 'ready' || !Array.isArray(catalog.entries))
        return false;
    return catalog.entries.some((entry) => (entry?.kind === 'child'
        && entry?.mode === 'one-shot'
        && (entry.id ?? entry.childSessionId) === childSessionId
        && (entry.parentSessionId ?? entry.parentId ?? parentSessionId) === parentSessionId));
}
const MAX_PICKER_DEFINITIONS = 4_096;
function requireCommandUi(commandUi) {
    if (typeof commandUi !== 'object' || commandUi === null) {
        throw new Error('workflow dashboard action registration is unavailable');
    }
    const register = commandUi.register;
    const decorate = commandUi.decorate;
    if (typeof register !== 'function' || typeof decorate !== 'function') {
        throw new Error('workflow dashboard action registration is unavailable');
    }
    return commandUi;
}
/** H dispatches kind:action via runAction; stock always openPopup. */
function commandUiDispatchesActions(commandUi) {
    let current = commandUi;
    while (current !== null) {
        if (typeof current.runAction === 'function')
            return true;
        current = Object.getPrototypeOf(current);
        if (current === Object.prototype)
            break;
    }
    return false;
}
function commandNodeName(record) {
    if (typeof record.name === 'string')
        return record.name;
    const nested = record.data?.name;
    return typeof nested === 'string' ? nested : null;
}
function conversationCommandNodes(snapshot) {
    const record = snapshot;
    const nodes = Array.isArray(record?.nodes)
        ? record.nodes
        : Array.isArray(record?.chat?.legacy?.nodes)
            ? record.chat.legacy.nodes
            : [];
    const out = [];
    for (const node of nodes) {
        if (typeof node !== 'object' || node === null)
            continue;
        const item = node;
        if (item.kind !== 'command')
            continue;
        const seq = typeof item.seq === 'number'
            ? item.seq
            : typeof item.data?.seq === 'number'
                ? item.data.seq
                : undefined;
        if (seq === undefined)
            continue;
        out.push({ seq, name: commandNodeName(item) });
    }
    return out;
}
/** Stock ui-commands emit command/executed; isolate-safe listeners also watch conversation nodes. */
function listenCommandExecuted(root, onWorkflows) {
    const handler = (_sessionId, name) => {
        if (name === 'workflows')
            onWorkflows();
    };
    const targets = [root];
    const parent = root.root;
    if (typeof parent === 'object' && parent !== null && parent !== root)
        targets.push(parent);
    const disposers = [];
    for (const target of targets) {
        const on = target.on;
        if (typeof on !== 'function')
            continue;
        try {
            const registered = on.call(target, 'command/executed', handler, { global: true });
            const dispose = asDisposer(registered);
            if (dispose !== undefined)
                disposers.push(dispose);
        }
        catch { /* some Client contexts reject undeclared events */ }
    }
    if (disposers.length === 0)
        return undefined;
    return () => { for (const dispose of disposers)
        void dispose(); };
}
function watchWorkflowsCommands(sessions, onWorkflows) {
    let stopSession;
    let attachedId;
    let attachedSession;
    const attach = (sessionId) => {
        const id = typeof sessionId === 'string' && sessionId.length > 0 ? sessionId : undefined;
        const session = id === undefined ? undefined : sessions?.binding?.(id)?.session;
        if (id === attachedId && session === attachedSession && (session === undefined || stopSession !== undefined))
            return;
        stopSession?.();
        stopSession = undefined;
        attachedId = id;
        attachedSession = session;
        if (session === undefined
            || typeof session.subscribe !== 'function'
            || typeof session.getSnapshot !== 'function')
            return;
        let baseline = 0;
        for (const node of conversationCommandNodes(session.getSnapshot())) {
            if (node.seq > baseline)
                baseline = node.seq;
        }
        const unsubscribe = session.subscribe(() => {
            for (const node of conversationCommandNodes(session.getSnapshot())) {
                if (node.seq <= baseline)
                    continue;
                baseline = node.seq;
                if (node.name === 'workflows')
                    onWorkflows();
            }
        });
        stopSession = asDisposer(unsubscribe);
    };
    attach(sessions?.list?.getSnapshot?.()?.current);
    const stopList = typeof sessions?.list?.subscribe === 'function'
        ? asDisposer(sessions.list.subscribe(() => { attach(sessions.list.getSnapshot()?.current); }))
        : undefined;
    const stopProvide = typeof sessions?.currentProvideInfo?.subscribe === 'function'
        ? asDisposer(sessions.currentProvideInfo.subscribe(() => { attach(sessions.list?.getSnapshot?.()?.current); }))
        : undefined;
    return () => {
        stopSession?.();
        stopList?.();
        stopProvide?.();
    };
}
const PICKER_PAGE_LIMIT = 32;
const PICKER_TIMEOUT_MS = 2_500;
async function callDefinitionList(list, sessionId, request, signal) {
    try {
        return await list(sessionId, request, signal);
    }
    catch {
        return await list(sessionId, signal);
    }
}
/** Load the picker catalog; an absent or hung Remote must settle, never spin. */
async function loadPickerDefinitions(remote, session, signal) {
    const list = remote?.workflowDefinitions?.list;
    if (typeof list !== 'function')
        return [];
    const sessionId = String(session?.sessionId ?? '');
    const work = (async () => {
        const items = [];
        const seen = new Set();
        let cursor;
        for (let pageNo = 0; pageNo < PICKER_PAGE_LIMIT; pageNo += 1) {
            signal.throwIfAborted();
            const request = cursor === undefined ? { limit: 200 } : { limit: 200, cursor };
            const raw = await callDefinitionList(list, sessionId, request, signal);
            const page = unwrapWorkflowRemoteResult(raw);
            const pageItems = Array.isArray(page) ? page : Array.isArray(page?.items) ? page.items : [];
            items.push(...pageItems);
            if (items.length > MAX_PICKER_DEFINITIONS)
                return items.slice(0, MAX_PICKER_DEFINITIONS);
            const next = page?.nextCursor === undefined || page?.nextCursor === '' ? undefined : String(page.nextCursor);
            if (next === undefined)
                return items;
            if (seen.has(next) || next === cursor)
                return items;
            seen.add(next);
            cursor = next;
        }
        return items;
    })();
    const timeout = new Promise((_, reject) => {
        const timer = setTimeout(() => reject(new Error('workflow definition picker timed out')), PICKER_TIMEOUT_MS);
        const abort = () => {
            clearTimeout(timer);
            reject(signal.reason ?? new Error('workflow definition picker aborted'));
        };
        if (signal.aborted)
            abort();
        else
            signal.addEventListener('abort', abort, { once: true });
        void work.finally(() => clearTimeout(timer));
    });
    try {
        return await Promise.race([work, timeout]);
    }
    catch {
        return [];
    }
}
/**
 * Register one complete browser aggregate.  The generated Remote is mounted
 * first; every consumer and listener is created in that mount's effect and
 * is disposed before the contribution is unmounted.
 */
export function apply(ctx) {
    const root = ctx;
    root.effect(async () => {
        const cleanup = [];
        const addCleanup = (value) => {
            if (value !== undefined)
                cleanup.push(value);
        };
        let dashboardActions;
        let overlayMounted = false;
        let pendingOpen = false;
        let liveAdapter;
        let fallbackRoot;
        let fallbackHost;
        let fallbackOpen = false;
        let remoteDisposer;
        let overlayState = { invoker: null };
        const overlayListeners = new Set();
        const publishOverlay = (next) => {
            overlayState = next;
            for (const listener of [...overlayListeners])
                listener();
        };
        const captureInvoker = (element) => {
            const active = typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;
            publishOverlay({ invoker: element ?? active });
        };
        const currentSessionId = () => {
            const id = root.sessions?.list?.getSnapshot?.()?.current;
            return typeof id === 'string' && id.length > 0 ? id : undefined;
        };
        const renderFallbackDashboard = () => {
            if (typeof document === 'undefined' || liveAdapter === undefined)
                return;
            if (fallbackHost === undefined) {
                fallbackHost = document.createElement('div');
                fallbackHost.id = 'dsh-workflows-overlay';
                document.body.appendChild(fallbackHost);
            }
            fallbackRoot ??= createRoot(fallbackHost);
            const sessionId = currentSessionId();
            if (fallbackOpen)
                liveAdapter.observe(sessionId);
            else
                liveAdapter.observe(undefined);
            fallbackRoot.render(fallbackOpen
                ? createElement(WorkflowsDashboard, {
                    operations: liveAdapter,
                    sessionId,
                    open: true,
                    onClose: () => {
                        fallbackOpen = false;
                        renderFallbackDashboard();
                    },
                    labels: dashboardLabelsFromLocale(workflowLocaleFromBind(typeof root.locale?.bind === 'function' ? root.locale.bind(NS) : undefined)),
                })
                : createElement('div'));
        };
        let dispatchesActions = false;
        const openDashboard = () => {
            if (dashboardActions !== undefined && typeof dashboardActions.open === 'function') {
                const active = typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
                    ? document.activeElement
                    : null;
                captureInvoker(active);
                dashboardActions.open();
            }
            // H: the overlay slot store actually mounts the dashboard.
            // Stock: shell.overlay is an empty list occupant; portal immediately.
            if (dispatchesActions && dashboardActions !== undefined && typeof dashboardActions.open === 'function') {
                pendingOpen = false;
                if (typeof document !== 'undefined' && liveAdapter !== undefined) {
                    queueMicrotask(() => {
                        if (document.querySelector('[data-workflows-dashboard]') === null) {
                            fallbackOpen = true;
                            renderFallbackDashboard();
                        }
                    });
                }
                return true;
            }
            pendingOpen = true;
            if (liveAdapter === undefined || typeof document === 'undefined') {
                return dashboardActions !== undefined && typeof dashboardActions.open === 'function';
            }
            fallbackOpen = true;
            renderFallbackDashboard();
            pendingOpen = false;
            return fallbackHost !== undefined
                || (dashboardActions !== undefined && typeof dashboardActions.open === 'function');
        };
        const requestOpen = () => {
            try {
                openDashboard();
            }
            catch { /* presentation is best-effort */ }
        };
        addCleanup(root.locale?.register?.(NS, workflowLocales));
        const commandUi = requireCommandUi(root.commandUi);
        const translate = typeof root.locale?.bind === 'function' ? root.locale.bind(NS) : undefined;
        const workflowsDescription = typeof translate === 'function'
            ? String(translate('commandDescription'))
            : workflowLocales.en.commandDescription;
        // Stock dsh always opens popupSelect for client contributions, including
        // kind:'action'. A Host /workflows command plus command/executed (and the
        // durable command node) opens the overlay without colliding with that picker.
        // Keep a contribution only when the runtime actually dispatches actions.
        dispatchesActions = commandUiDispatchesActions(commandUi);
        if (dispatchesActions) {
            addCleanup(asDisposer(commandUi.register({
                name: 'workflows',
                description: workflowsDescription,
                available: () => true,
                ui: {
                    kind: 'action',
                    run: () => {
                        if (!openDashboard()) {
                            throw new Error('workflow dashboard overlay is not mounted');
                        }
                    },
                },
            })));
        }
        addCleanup(listenCommandExecuted(root, requestOpen));
        let controller;
        let adapter;
        try {
            const remote = root.remote;
            const sessions = root.sessions;
            const liveController = new WorkflowRunsController(remote, sessions);
            const adapterInstance = new DashboardWorkflowRunsAdapter(liveController);
            liveAdapter = adapterInstance;
            controller = liveController;
            adapter = adapterInstance;
            addCleanup(watchWorkflowsCommands(sessions, requestOpen));
            if (pendingOpen)
                openDashboard();
            root.workflowRunsController = liveController;
            root.workflowRunsAdapter = liveAdapter;
            root.workflowRunDefinition = workflowRunDefinition;
            addCleanup(root.conversationEvents?.register?.(workflowMessageDefinition));
            if (root.conversationEvents !== undefined && root.conversationEvents.register !== undefined
                && workflowMessageDefinition !== workflowRunDefinition) {
                // Keep the named definition visible to older consumers that inspect the
                // package export rather than the keyed renderer registry.
                addCleanup(root.conversationEvents.register(workflowRunDefinition));
            }
            const runChatComponent = (props) => {
                const dict = workflowLocaleFromBind(typeof root.locale?.bind === 'function' ? root.locale.bind(NS) : undefined);
                return createElement(WorkflowRunChatSlot, {
                    ...props,
                    operations: adapterInstance,
                    useSessions: props.useSessions,
                    labels: workflowChatLabelsFromLocale(dict),
                    childAvailable: (parent, child) => directChildAvailable(sessions, parent, child),
                });
            };
            const chatInjection = root.slots?.inject?.('conversation.chat.node', () => root.slots.register({
                name: 'conversation.chat.node',
                key: 'workflow-run',
                locale: NS,
                inject: () => ({
                    operations: adapterInstance,
                    childAvailable: (parent, child) => directChildAvailable(sessions, parent, child),
                }),
            }, runChatComponent));
            addCleanup(chatInjection);
            /** Root-scoped overlay component; slot standard hooks remain framework-owned. */
            function DashboardContribution(props) {
                if (props.actions !== undefined)
                    dashboardActions = props.actions;
                const list = sessions.list;
                const sessionId = useSyncExternalStore(list.subscribe.bind(list), () => list.getSnapshot().current, () => list.getSnapshot().current);
                const overlay = useSyncExternalStore(listener => { overlayListeners.add(listener); return () => { overlayListeners.delete(listener); }; }, () => overlayState, () => overlayState);
                const source = useSyncExternalStore(adapterInstance.source.subscribe, adapterInstance.source.getSnapshot, adapterInstance.source.getSnapshot);
                const dict = workflowLocaleFromBind(typeof root.locale?.bind === 'function' ? root.locale.bind(NS) : undefined);
                const close = () => {
                    publishOverlay({ invoker: overlay.invoker });
                    props.actions?.close?.();
                };
                return createElement(WorkflowsDashboardSlot, {
                    ...props,
                    useSessions: props.useSessions ?? ((selector) => selector({ current: sessionId })),
                    useStore: props.useStore ?? ((selector) => selector({
                        open: false,
                        selectedRunId: undefined,
                        selectedMemberId: undefined,
                        selectedArtifactName: undefined,
                        inspectorTab: 'members',
                        mobileView: 'runs',
                    })),
                    useWorkflowRuns: props.useWorkflowRuns ?? ((selector) => selector(source)),
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
                    operations: adapterInstance,
                    invoker: overlay.invoker,
                    onClose: close,
                    labels: dashboardLabelsFromLocale(dict),
                });
            }
            const overlayInjection = root.slots?.inject?.('shell.overlay', () => root.slots.register({
                name: 'shell.overlay',
                id: 'workflows-dashboard',
                order: 100,
                locale: NS,
                store: createWorkflowsStore,
                inject: (actions) => {
                    if (actions !== undefined && typeof actions.open === 'function') {
                        dashboardActions = actions;
                        if (pendingOpen) {
                            pendingOpen = false;
                            actions.open();
                        }
                    }
                    return { operations: adapterInstance, hooks: { workflowRuns: adapterInstance.source } };
                },
            }, DashboardContribution));
            addCleanup(overlayInjection);
            overlayMounted = overlayInjection !== undefined;
            function WorkflowsCommandRow(props) {
                const node = props?.node;
                const seq = node?.seq;
                const kind = node?.outcome?.kind;
                useEffect(() => {
                    if (kind === 'error')
                        return;
                    requestOpen();
                }, [seq, kind]);
                const text = typeof node?.outcome?.text === 'string' && node.outcome.text.length > 0
                    ? node.outcome.text
                    : workflowsDescription;
                return createElement('div', { 'data-workflows-command-row': '' }, createElement('span', null, 'workflows'), createElement('span', null, text), createElement('button', {
                    type: 'button',
                    onClick: () => { requestOpen(); },
                }, workflowLocales.en.title));
            }
            addCleanup(asDisposer(root.slots?.inject?.('conversation.chat.commandview', () => root.slots.register({
                name: 'conversation.chat.commandview',
                key: 'workflows',
                locale: NS,
            }, WorkflowsCommandRow))));
            // Overlay and command-row registration must complete before this await.
            // $mount has to run on this fiber (not a detached then) so the generated
            // workflowRuns namespace actually installs.
            if (typeof remote?.$mount === 'function') {
                try {
                    remoteDisposer = await remote.$mount(TYPERT_REMOTE);
                }
                catch {
                    remoteDisposer = undefined;
                }
            }
            liveAdapter.observe(currentSessionId());
            if (pendingOpen)
                openDashboard();
            if (typeof remote?.workflowDefinitions?.list === 'function')
                addCleanup(asDisposer(commandUi.decorate({
                    name: 'workflow',
                    available: () => true,
                    ui: {
                        kind: 'popupSelect',
                        options: async (session, signal) => {
                            const definitions = await loadPickerDefinitions(remote, session, signal);
                            return definitions.map((definition) => ({
                                id: String(definition.name),
                                label: String(definition.name),
                                detail: `${String(definition.description ?? '')}${definition.whenToUse === undefined ? '' : ` — ${String(definition.whenToUse)}`} · ${String(definition.scope ?? '')}`,
                            }));
                        },
                        onSelect: async (option, session) => {
                            const binding = sessions.binding?.(session.sessionId);
                            const live = binding?.session;
                            if (live === undefined)
                                throw new Error('this session is not available');
                            const result = await live.command(`/workflow ${String(option.id)}`);
                            if (result?.ok === false) {
                                throw new Error(typeof result.error === 'string' && result.error.length > 0
                                    ? result.error
                                    : 'the host rejected /workflow');
                            }
                            if (result?.value?.matched === false)
                                throw new Error('the host offers no /workflow command');
                        },
                    },
                })));
            // The generated event transport is deliberately invalidation-only.  Do
            // not copy run heads from the event into browser state.
            const remoteOn = remote.$on;
            if (typeof remoteOn === 'function') {
                addCleanup(remoteOn.call(remote, 'workflows/run-change', change => liveController.handleChange(change)));
            }
            const hostDescription = root.connection?.hostDescription;
            if (hostDescription?.subscribe !== undefined) {
                addCleanup(hostDescription.subscribe(() => {
                    if (hostDescription.getSnapshot?.() === undefined)
                        liveController.handleDisconnected();
                    else
                        liveController.handleConnected();
                }));
                if (hostDescription.getSnapshot?.() === undefined)
                    liveController.handleDisconnected();
            }
            if (typeof root.on === 'function') {
                const registered = root.on('connection/reset', () => liveController.handleReset());
                if (typeof registered === 'function')
                    addCleanup(registered);
            }
            if (sessions.list?.subscribe !== undefined) {
                let previous = new Set(sessionListIds(sessions) ?? []);
                addCleanup(sessions.list.subscribe(() => {
                    const current = sessionListIds(sessions);
                    if (current === undefined)
                        return;
                    const keys = new Set(current);
                    for (const id of previous)
                        if (!keys.has(id))
                            liveController.removeSession(id);
                    previous = keys;
                }));
            }
        }
        catch { /* /workflows slash action stays registered */ }
        return async () => {
            dashboardActions = undefined;
            overlayListeners.clear();
            fallbackOpen = false;
            try {
                fallbackRoot?.unmount();
            }
            catch { /* contained */ }
            fallbackRoot = undefined;
            fallbackHost?.remove();
            fallbackHost = undefined;
            // Reverse registration order: listeners/slots/consumers stop before
            // the generated Remote namespace is unmounted.
            for (const dispose of cleanup.reverse()) {
                try {
                    await dispose();
                }
                catch { /* one child cannot block aggregate unload */ }
            }
            adapter?.dispose();
            controller?.dispose();
            await disposeValue(remoteDisposer);
        };
    }, 'dsh-workflows: client aggregate');
}
//# sourceMappingURL=index.js.map