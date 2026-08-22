import { describe, expect, it, vi } from 'vitest'

import { apply } from '../src/client/index.js'
import { workflowLocales } from '../src/client/locales.js'

function actionCommandUi(overrides: Record<string, unknown> = {}) {
  return {
    ActionCommandUiSpec: { kind: 'action' as const },
    uiKinds: ['action', 'popupSelect'],
    runAction() { /* H dispatch face */ },
    ...overrides,
  }
}

describe('Client /workflows action (RC21-RC22)', () => {
  it('fails closed when commandUi cannot register a kind:action contribution', async () => {
    const pending: Promise<unknown>[] = []
    const ctx: any = {
      effect(fn: () => unknown) { pending.push(Promise.resolve().then(() => fn())) },
      remote: { $mount: async () => () => undefined, $on: () => () => undefined },
      sessions: { list: { getSnapshot: () => ({ ids: [], phase: 'ready' }), subscribe: () => () => undefined } },
      slots: { inject: () => () => undefined, register: () => undefined },
      conversationEvents: { register: () => () => undefined },
      locale: { register: () => () => undefined, bind: () => (key: string) => key },
      connection: { hostDescription: { subscribe: () => () => undefined, getSnapshot: () => ({}) } },
      on: () => () => undefined,
    }
    apply(ctx)
    await expect(Promise.all(pending)).rejects.toThrow(/workflow dashboard action registration is unavailable/u)

    ctx.commandUi = { decorate: () => () => undefined }
    const again: Promise<unknown>[] = []
    ctx.effect = (fn: () => unknown) => { again.push(Promise.resolve().then(() => fn())) }
    apply(ctx)
    await expect(Promise.all(again)).rejects.toThrow(/workflow dashboard action registration is unavailable/u)

    ctx.commandUi = {
      register: () => () => undefined,
      decorate: () => () => undefined,
    }
    const popupOnly: Promise<unknown>[] = []
    ctx.effect = (fn: () => unknown) => { popupOnly.push(Promise.resolve().then(() => fn())) }
    apply(ctx)
    await expect(Promise.all(popupOnly)).resolves.toBeDefined()
  })

  it('registers /workflows when commandUi has register+decorate and Remote mount fails', async () => {
    const pending: Promise<unknown>[] = []
    const registered: any[] = []
    const ctx: any = {
      effect(fn: () => unknown) { pending.push(Promise.resolve().then(() => fn())) },
      remote: { $mount: async () => { throw new Error('typert projection unavailable') } },
      sessions: { list: { getSnapshot: () => ({ ids: [], phase: 'ready' }), subscribe: () => () => undefined } },
      slots: { inject: () => () => undefined, register: () => undefined },
      conversationEvents: { register: () => () => undefined },
      commandUi: {
        runAction() { /* H dispatch face */ },
        register(contribution: any) { registered.push(contribution); return () => undefined },
        decorate: () => () => undefined,
      },
      locale: { register: () => () => undefined, bind: () => (key: string) => key },
      connection: { hostDescription: { subscribe: () => () => undefined, getSnapshot: () => ({}) } },
      on: () => () => undefined,
    }
    apply(ctx)
    await Promise.all(pending)
    expect(registered[0]).toMatchObject({ name: 'workflows', ui: { kind: 'action' } })
  })

  it('registers a Host-free action that opens the store-owned overlay and binds locale copy', async () => {
    const pending: Promise<unknown>[] = []
    const registered: any[] = []
    const decorated: any[] = []
    const actions = {
      open() { this.opened = true },
      close() { this.opened = false },
      opened: false,
      selectRun() {},
      reconcileRun() {},
      selectMember() {},
      selectArtifact() {},
      selectTab() {},
      showRuns() {},
      showExecution() {},
      showRun() {},
    }
    const ctx: any = {
      effect(fn: () => unknown) { pending.push(Promise.resolve().then(() => fn())) },
      remote: {
        $mount: async () => () => undefined,
        $on: () => () => undefined,
        workflowDefinitions: {
          list: async () => ({ items: [{ name: 'review-changes', description: 'Review', whenToUse: 'after edits', scope: 'project' }] }),
        },
      },
      sessions: {
        list: { getSnapshot: () => ({ ids: ['s1'], current: 's1', phase: 'ready' }), subscribe: () => () => undefined },
        binding: () => ({ session: { command: async () => ({ ok: true, value: { matched: true } }) } }),
      },
      slots: {
        inject(_name: string, factory: () => unknown) {
          factory()
          return () => undefined
        },
        register(entry: any) {
          entry.inject?.(actions)
          return () => undefined
        },
      },
      conversationEvents: { register: () => () => undefined },
      commandUi: actionCommandUi({
        register(contribution: any) {
          registered.push(contribution)
          return () => undefined
        },
        decorate(contribution: any) {
          decorated.push(contribution)
          return () => undefined
        },
      }),
      locale: {
        register: () => () => undefined,
        bind: () => (key: string) => key === 'commandDescription'
          ? workflowLocales.zh.commandDescription
          : key,
      },
      connection: { hostDescription: { subscribe: () => () => undefined, getSnapshot: () => ({}) } },
      on: () => () => undefined,
    }
    apply(ctx)
    await Promise.all(pending)
    expect(registered[0]).toMatchObject({
      name: 'workflows',
      description: workflowLocales.zh.commandDescription,
      ui: { kind: 'action' },
    })
    expect(registered[0].description).not.toMatch(/[0-9a-f]{32}/u)
    registered[0].ui.run()
    expect(actions.opened).toBe(true)

    expect(decorated[0]).toMatchObject({ name: 'workflow', ui: { kind: 'popupSelect' } })
    const options = await decorated[0].ui.options({ sessionId: 's1' }, new AbortController().signal)
    expect(options).toEqual([{
      id: 'review-changes',
      label: 'review-changes',
      detail: 'Review — after edits · project',
    }])
    await decorated[0].ui.onSelect({ id: 'review-changes' }, { sessionId: 's1' })
  })

  it('settles an empty picker when the definitions RPC hangs or uses the two-arg face', async () => {
    const pending: Promise<unknown>[] = []
    const decorated: any[] = []
    const ctx: any = {
      effect(fn: () => unknown) { pending.push(Promise.resolve().then(() => fn())) },
      remote: {
        $mount: async () => () => undefined,
        $on: () => () => undefined,
        workflowDefinitions: {
          list: async (sessionId: string, second: unknown) => {
            if (second && typeof second === 'object' && second !== null && 'limit' in second) {
              throw new Error('use two-arg list')
            }
            return { items: [{ name: 'audit', description: 'Audit', scope: 'user' }] }
          },
        },
      },
      sessions: {
        list: { getSnapshot: () => ({ ids: ['s1'], current: 's1', phase: 'ready' }), subscribe: () => () => undefined },
        binding: () => ({ session: { command: async () => ({ ok: true, value: { matched: true } }) } }),
      },
      slots: { inject: () => () => undefined, register: () => undefined },
      conversationEvents: { register: () => () => undefined },
      commandUi: actionCommandUi({
        register: () => () => undefined,
        decorate(contribution: any) { decorated.push(contribution); return () => undefined },
      }),
      locale: { register: () => () => undefined },
      connection: { hostDescription: { subscribe: () => () => undefined, getSnapshot: () => ({}) } },
      on: () => () => undefined,
    }
    apply(ctx)
    await Promise.all(pending)
    await expect(decorated[0].ui.options({ sessionId: 's1' }, new AbortController().signal)).resolves.toEqual([
      { id: 'audit', label: 'audit', detail: 'Audit · user' },
    ])

    const hungPending: Promise<unknown>[] = []
    const hung: any[] = []
    const hungCtx: any = {
      ...ctx,
      effect(fn: () => unknown) { hungPending.push(Promise.resolve().then(() => fn())) },
      remote: {
        $mount: async () => () => undefined,
        $on: () => () => undefined,
        workflowDefinitions: { list: () => new Promise(() => undefined) },
      },
      commandUi: actionCommandUi({
        register: () => () => undefined,
        decorate(contribution: any) { hung.push(contribution); return () => undefined },
      }),
    }
    vi.useFakeTimers()
    try {
      apply(hungCtx)
      await Promise.all(hungPending)
      const options = hung[0].ui.options({ sessionId: 's1' }, new AbortController().signal)
      await vi.advanceTimersByTimeAsync(2_500)
      await expect(options).resolves.toEqual([])
    } finally {
      vi.useRealTimers()
    }
  })

  it('fails loud when the overlay is not mounted', async () => {
    const pending: Promise<unknown>[] = []
    const registered: any[] = []
    const ctx: any = {
      effect(fn: () => unknown) { pending.push(Promise.resolve().then(() => fn())) },
      remote: { $mount: async () => () => undefined, $on: () => () => undefined },
      sessions: { list: { getSnapshot: () => ({ ids: [], phase: 'ready' }), subscribe: () => () => undefined } },
      slots: { inject: () => undefined, register: () => undefined },
      conversationEvents: { register: () => () => undefined },
      commandUi: actionCommandUi({
        register(contribution: any) { registered.push(contribution); return () => undefined },
        decorate: () => () => undefined,
      }),
      locale: { register: () => () => undefined },
      connection: { hostDescription: { subscribe: () => () => undefined, getSnapshot: () => ({}) } },
      on: () => () => undefined,
    }
    apply(ctx)
    await Promise.all(pending)
    expect(() => registered[0].ui.run()).toThrow(/workflow dashboard overlay is not mounted/u)
  })

  it('opens a pending dashboard after a late overlay inject', async () => {
    const pending: Promise<unknown>[] = []
    const registered: any[] = []
    let storedFactory: (() => unknown) | undefined
    const actions = {
      open() { this.opened = true },
      opened: false,
    }
    const ctx: any = {
      effect(fn: () => unknown) { pending.push(Promise.resolve().then(() => fn())) },
      remote: { $mount: async () => () => undefined, $on: () => () => undefined },
      sessions: { list: { getSnapshot: () => ({ ids: [], phase: 'ready' }), subscribe: () => () => undefined } },
      slots: {
        inject(_name: string, factory: () => unknown) {
          storedFactory = factory
          return () => undefined
        },
        register(entry: any) {
          entry.inject?.(actions)
          return () => undefined
        },
      },
      conversationEvents: { register: () => () => undefined },
      commandUi: actionCommandUi({
        register(contribution: any) { registered.push(contribution); return () => undefined },
        decorate: () => () => undefined,
      }),
      locale: { register: () => () => undefined },
      connection: { hostDescription: { subscribe: () => () => undefined, getSnapshot: () => ({}) } },
      on: () => () => undefined,
    }
    apply(ctx)
    await Promise.all(pending)
    expect(() => registered[0].ui.run()).toThrow(/workflow dashboard overlay is not mounted/u)
    expect(actions.opened).toBe(false)
    storedFactory?.()
    expect(actions.opened).toBe(true)
  })

  it('opens the dashboard from Host command/executed on stock commandUi', async () => {
    const pending: Promise<unknown>[] = []
    const registered: any[] = []
    const executed: Array<(sessionId: string, name: string) => void> = []
    const actions = { open() { this.opened = true }, opened: false }
    const ctx: any = {
      effect(fn: () => unknown) { pending.push(Promise.resolve().then(() => fn())) },
      remote: { $mount: async () => () => undefined, $on: () => () => undefined },
      sessions: { list: { getSnapshot: () => ({ ids: ['s1'], current: 's1', phase: 'ready' }), subscribe: () => () => undefined } },
      slots: {
        inject(_name: string, factory: () => unknown) { factory(); return () => undefined },
        register(entry: any) { entry.inject?.(actions); return () => undefined },
      },
      conversationEvents: { register: () => () => undefined },
      commandUi: {
        register(contribution: any) { registered.push(contribution); return () => undefined },
        decorate: () => () => undefined,
      },
      locale: { register: () => () => undefined },
      connection: { hostDescription: { subscribe: () => () => undefined, getSnapshot: () => ({}) } },
      on(event: string, listener: (sessionId: string, name: string) => void) {
        if (event === 'command/executed') executed.push(listener)
        return () => undefined
      },
    }
    apply(ctx)
    await Promise.all(pending)
    expect(registered).toEqual([])
    expect(executed).toHaveLength(1)
    executed[0]!('s1', 'workflows')
    expect(actions.opened).toBe(true)
    executed[0]!('s1', 'workflow')
    expect(actions.opened).toBe(true)
  })

  it('fails loud when the definition picker Remote is missing and keeps argued /workflows in the command plane', async () => {
    const pending: Promise<unknown>[] = []
    const decorated: any[] = []
    const ctx: any = {
      effect(fn: () => unknown) { pending.push(Promise.resolve().then(() => fn())) },
      remote: { $mount: async () => () => undefined, $on: () => () => undefined },
      sessions: {
        list: { getSnapshot: () => ({ ids: ['s1'], current: 's1', phase: 'ready' }), subscribe: () => () => undefined },
        binding: () => ({ session: { command: async () => ({ ok: true, value: { matched: true } }) } }),
      },
      slots: {
        inject() { return () => undefined },
        register() { return () => undefined },
      },
      conversationEvents: { register: () => () => undefined },
      commandUi: actionCommandUi({
        register: () => () => undefined,
        decorate(contribution: any) { decorated.push(contribution); return () => undefined },
      }),
      locale: { register: () => () => undefined },
      connection: { hostDescription: { subscribe: () => () => undefined, getSnapshot: () => ({}) } },
      on: () => () => undefined,
    }
    apply(ctx)
    await Promise.all(pending)
    expect(decorated).toEqual([])
    expect(ctx.commandUi).toBeDefined()
  })
})
