import { createElement, useSyncExternalStore } from 'react';
import TYPERT_REMOTE from '@zaalipro/dsh-workflows/remote';
import { DashboardWorkflowRunsAdapter } from './adapter.js';
import { WorkflowRunsController } from './controller.js';
import { workflowRunDefinition } from './workflow-definition.js';
import { workflowMessageDefinition } from './chat-renderer.js';
import { createWorkflowsStore } from './store.js';
import { WorkflowsDashboardSlot, WorkflowRunChatSlot } from './slot-components.js';
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
/** Load the complete picker catalog through the generated direct Agent face. */
async function loadPickerDefinitions(remote, session, signal) {
    const definitions = remote?.workflowDefinitions;
    if (typeof definitions?.list !== 'function') {
        throw new Error('workflow definition picker is unavailable');
    }
    const items = [];
    const seen = new Set();
    let cursor;
    for (;;) {
        const request = cursor === undefined ? { limit: 200 } : { limit: 200, cursor };
        // H's generated direct face is always (sessionId, request, signal).  Do
        // not infer the arity: minifiers/proxies are free to expose any length.
        const raw = await definitions.list(session.sessionId, request, signal);
        const page = unwrapWorkflowRemoteResult(raw);
        const pageItems = Array.isArray(page) ? page : Array.isArray(page?.items) ? page.items : [];
        items.push(...pageItems);
        if (items.length > MAX_PICKER_DEFINITIONS) {
            throw new Error('workflow definition picker exceeds 4096 definitions');
        }
        const next = page?.nextCursor === undefined ? undefined : String(page.nextCursor);
        if (next === undefined)
            return items;
        if (seen.has(next) || next === cursor)
            throw new Error('workflow definition picker received a repeated cursor');
        seen.add(next);
        cursor = next;
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
        addCleanup(root.locale?.register?.(NS, workflowLocales));
        const commandUi = requireCommandUi(root.commandUi);
        const translate = typeof root.locale?.bind === 'function' ? root.locale.bind(NS) : undefined;
        const workflowsDescription = typeof translate === 'function'
            ? String(translate('commandDescription'))
            : workflowLocales.en.commandDescription;
        addCleanup(asDisposer(commandUi.register({
            name: 'workflows',
            description: workflowsDescription,
            available: () => true,
            ui: {
                kind: 'action',
                run: () => {
                    if (!overlayMounted || dashboardActions === undefined || typeof dashboardActions.open !== 'function') {
                        throw new Error('workflow dashboard overlay is not mounted');
                    }
                    const active = typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
                        ? document.activeElement
                        : null;
                    captureInvoker(active);
                    dashboardActions.open();
                },
            },
        })));
        let controller;
        let adapter;
        try {
            const remote = root.remote;
            if (typeof remote?.$mount === 'function') {
                try {
                    remoteDisposer = await remote.$mount(TYPERT_REMOTE);
                }
                catch {
                    remoteDisposer = undefined;
                }
            }
            const sessions = root.sessions;
            const liveController = new WorkflowRunsController(remote, sessions);
            const liveAdapter = new DashboardWorkflowRunsAdapter(liveController);
            controller = liveController;
            adapter = liveAdapter;
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
                    operations: liveAdapter,
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
                    operations: liveAdapter,
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
                const source = useSyncExternalStore(liveAdapter.source.subscribe, liveAdapter.source.getSnapshot, liveAdapter.source.getSnapshot);
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
                    operations: liveAdapter,
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
                    if (actions !== undefined && typeof actions.open === 'function')
                        dashboardActions = actions;
                    return { operations: liveAdapter, hooks: { workflowRuns: liveAdapter.source } };
                },
            }, DashboardContribution));
            addCleanup(overlayInjection);
            overlayMounted = overlayInjection !== undefined;
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