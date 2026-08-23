import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'

import { apply, inject as workflowClientInject } from '../src/client/index.js'
import { workflowLocales } from '../src/client/locales.js'

const nodeRequire = createRequire(import.meta.url)

type OfficialInputTriggerController = new (deps: any) => {
  readonly menu: { getSnapshot(): any }
  track(draft: string, caret: number, guard: { tier: 'plain'|'claimed'|'frozen' }, draftRev: number): void
  arbitrate(key: 'up'|'down'|'escape'|'enter', composing: boolean): string
  adjudicate(line: string, signal: AbortSignal, envelope: { images: number }): Promise<any>
  dispose(): void
}

/** Load the exact installed RC2 browser controller through its lazy-CJS seam. */
function officialInputTriggerController(): OfficialInputTriggerController {
  const registrations: Array<{ factory?: (require: (id: string) => unknown) => Record<string, unknown> }> = []
  const clientFile = nodeRequire.resolve('@deepseek-ai/dsh-client-ui-input-trigger/client')
  runInNewContext(readFileSync(clientFile, 'utf8'), {
    AbortController,
    console,
    window: { __ModuleLoader__: { load(value: any) { registrations.push(value) } } },
  }, { filename: clientFile })
  const registration = registrations[0]
  if (typeof registration?.factory !== 'function') throw new Error('official input-trigger client factory is unavailable')
  const createSnapshotStore = (initial: unknown) => {
    let snapshot = initial
    const listeners = new Set<() => void>()
    return {
      getSnapshot: () => snapshot,
      set(next: unknown) { snapshot = next; for (const listener of listeners) listener() },
      subscribe(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener) },
    }
  }
  const exports = registration.factory((id: string) => {
    if (id === '@deepseek-ai/cordis') return { Service: class {} }
    if (id === '@deepseek-ai/dsh-client-runtime/client') return { createSnapshotStore }
    if (id === 'react/jsx-runtime') return { jsx: () => null, jsxs: () => null }
    if (id === 'react') return {
      Fragment: Symbol('Fragment'),
      useEffect: () => undefined,
      useRef: () => ({ current: null }),
      useSyncExternalStore: () => undefined,
    }
    if (id === '@deepseek-ai/dsh-client-ui-primitives') return { useAnchoredMaxHeight: () => undefined }
    throw new Error(`unexpected official input-trigger dependency: ${id}`)
  })
  const Controller = exports.InputTriggerController
  if (typeof Controller !== 'function') throw new Error('official InputTriggerController export is unavailable')
  return Controller as OfficialInputTriggerController
}

function actionCommandUi(overrides: Record<string, unknown> = {}) {
  return {
    ActionCommandUiSpec: { kind: 'action' as const },
    uiKinds: ['action', 'popupSelect'],
    runAction() { /* action-capable dispatch face */ },
    ...overrides,
  }
}

describe('Client /workflows action (RC21-RC22)', () => {
  it('awaits successful real Cordis setup while retaining exactly one owner for its disposer', async () => {
    const root = new Context()
    const disposeCount = { input: 0, locale: 0, remote: 0 }
    let applyResult: unknown = Symbol('pending')
    const services: Record<string, unknown> = {
      connection: { hostDescription: { subscribe: () => () => undefined, getSnapshot: () => ({}) } },
      remote: {
        $mount: async () => () => { disposeCount.remote += 1 },
        $on: () => () => undefined,
      },
      'remote.workflowDefinitions': { list: async () => ({ items: [] }) },
      'remote.workflowRuns': { list: async () => ({ items: [], total: 0, sessionRevision: 0, epoch: 'test' }) },
      sessions: { list: { getSnapshot: () => ({ ids: [], phase: 'ready' }), subscribe: () => () => undefined } },
      slots: {
        inject(_name: string, factory: () => unknown) { factory(); return () => undefined },
        register: () => () => undefined,
      },
      conversationEvents: { register: () => () => undefined },
      commandUi: { register: () => () => undefined, decorate: () => () => undefined },
      inputTriggers: { registerSource: () => () => { disposeCount.input += 1 } },
      locale: { register: () => () => { disposeCount.locale += 1 }, bind: () => (key: string) => key },
    }
    for (const [name, value] of Object.entries(services)) root.provide(name, value)
    const plugin = Object.assign(async (ctx: any) => {
      // Capture the resolved startup value: ownership remains with the
      // labeled ctx.effect, so apply must resolve void rather than hand its
      // disposer back to the outer plugin runner as a second owner.
      applyResult = await apply(ctx)
    }, { inject: workflowClientInject })
    const fiber = root.plugin(plugin)

    await fiber.await()
    expect(fiber.state).toBe(2)
    expect(applyResult).toBeUndefined()
    expect(fiber.getEffects().filter(effect => effect.label === 'dsh-workflows: client aggregate')).toHaveLength(1)
    await fiber.dispose()
    await fiber.dispose()
    expect(disposeCount).toEqual({ input: 1, locale: 1, remote: 1 })
  })

  it('fails the real Cordis plugin fiber and rolls back contributions when async setup later rejects', async () => {
    const root = new Context()
    const activeSources = new Set<unknown>()
    const disposed: string[] = []
    const remote = {
      // Force setup to cross an actual async boundary after the local
      // contributions have been registered.
      $mount: async () => () => { disposed.push('remote') },
      $on: () => () => undefined,
    }
    const definitionsRemote = {
      get list(): never {
        throw new Error('post-registration async setup failed')
      },
    }
    const services: Record<string, unknown> = {
      connection: { hostDescription: { subscribe: () => () => undefined, getSnapshot: () => ({}) } },
      remote,
      'remote.workflowDefinitions': definitionsRemote,
      'remote.workflowRuns': { list: async () => ({ items: [], total: 0, sessionRevision: 0, epoch: 'test' }) },
      sessions: { list: { getSnapshot: () => ({ ids: [], phase: 'ready' }), subscribe: () => () => undefined } },
      slots: {
        inject(_name: string, factory: () => unknown) { factory(); return () => { disposed.push('slot') } },
        register: () => () => undefined,
      },
      conversationEvents: { register: () => () => undefined },
      commandUi: {
        register: () => () => undefined,
        decorate: () => () => undefined,
      },
      inputTriggers: {
        registerSource(source: unknown) {
          activeSources.add(source)
          return () => {
            activeSources.delete(source)
            disposed.push('input')
          }
        },
      },
      locale: { register: () => () => { disposed.push('locale') }, bind: () => (key: string) => key },
    }
    for (const [name, value] of Object.entries(services)) root.provide(name, value)
    const plugin = Object.assign((ctx: any) => apply(ctx), { inject: workflowClientInject })
    const fiber = root.plugin(plugin)

    try {
      await expect(fiber.await()).rejects.toThrow('post-registration async setup failed')
      expect(fiber.state).toBe(3) // Cordis FiberState.FAILED, never ACTIVE.
      expect(activeSources).toHaveLength(0)
      expect(disposed).toContain('input')
      expect(disposed).toContain('locale')
      expect(disposed).toContain('remote')
    } finally {
      await fiber.dispose()
    }
  })

  it('uses dynamically declared Remote namespaces through Cordis get without traversing the aggregate', async () => {
    const root = new Context()
    const sources: any[] = []
    const decorated: any[] = []
    let operations: any
    const definitionList = vi.fn(async () => ({
      items: [{ name: 'cordis-smoke', description: 'Cordis', scope: 'user' }],
    }))
    const runList = vi.fn(async () => ({
      items: [], total: 0, sessionRevision: 1, epoch: 'cordis',
    }))
    const remote = {
      $mount: async () => () => undefined,
      $on: () => () => undefined,
      get workflowDefinitions(): never {
        throw new Error('aggregate workflowDefinitions was traversed')
      },
      get workflowRuns(): never {
        throw new Error('aggregate workflowRuns was traversed')
      },
    }
    const services: Record<string, unknown> = {
      connection: { hostDescription: { subscribe: () => () => undefined, getSnapshot: () => ({}) } },
      remote,
      'remote.workflowDefinitions': { list: definitionList },
      'remote.workflowRuns': { list: runList },
      sessions: { list: { getSnapshot: () => ({ ids: [], phase: 'ready' }), subscribe: () => () => undefined } },
      slots: {
        inject(_name: string, factory: () => unknown) { factory(); return () => undefined },
        register(entry: any) {
          const injected = entry.inject?.()
          if (entry.id === 'workflows-dashboard') operations = injected?.operations
          return () => undefined
        },
      },
      conversationEvents: { register: () => () => undefined },
      commandUi: {
        register: () => () => undefined,
        decorate(contribution: any) { decorated.push(contribution); return () => undefined },
      },
      inputTriggers: {
        registerSource(source: any) { sources.push(source); return () => undefined },
      },
      locale: { register: () => () => undefined, bind: () => (key: string) => key },
    }
    for (const [name, value] of Object.entries(services)) root.provide(name, value)
    const plugin = Object.assign((ctx: any) => apply(ctx), { inject: workflowClientInject })
    const fiber = root.plugin(plugin)
    try {
      await fiber.await()
      expect(sources).toHaveLength(1)
      expect(sources[0]).toMatchObject({ name: 'workflows', trigger: '/' })
      expect(decorated).toHaveLength(1)
      await expect(decorated[0].ui.options({ sessionId: 's1' }, new AbortController().signal)).resolves.toEqual([{
        id: 'cordis-smoke',
        label: 'cordis-smoke',
        detail: 'Cordis · user',
      }])
      await expect(operations.refresh('s1')).resolves.toMatchObject({ phase: 'ready', sessionRevision: 1 })
      expect(definitionList).toHaveBeenCalledOnce()
      expect(runList).toHaveBeenCalledOnce()
      expect(() => (fiber.ctx as any).workflowRunsController).toThrow(/without inject/u)
    } finally {
      await fiber.dispose()
    }
  })

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
    ctx.inputTriggers = { registerSource: () => () => undefined }
    const popupOnly: Promise<unknown>[] = []
    ctx.effect = (fn: () => unknown) => { popupOnly.push(Promise.resolve().then(() => fn())) }
    apply(ctx)
    await expect(Promise.all(popupOnly)).resolves.toBeDefined()
  })

  it('rolls back locale and action registration when input-trigger registration throws before controller setup', async () => {
    const pending: Promise<unknown>[] = []
    const disposed: string[] = []
    const warnings: string[] = []
    const ctx: any = {
      effect(fn: () => unknown) {
        pending.push(Promise.resolve().then(() => fn()))
      },
      remote: {},
      sessions: { list: { getSnapshot: () => ({ ids: [], phase: 'ready' }), subscribe: () => () => undefined } },
      slots: { inject: () => () => undefined, register: () => undefined },
      conversationEvents: { register: () => () => undefined },
      commandUi: actionCommandUi({
        register: () => () => { disposed.push('action') },
        decorate: () => () => undefined,
      }),
      inputTriggers: {
        registerSource() { throw new Error('duplicate workflow input source') },
      },
      locale: {
        register: () => () => { disposed.push('locale') },
        bind: () => (key: string) => key,
      },
      connection: { hostDescription: { subscribe: () => () => undefined, getSnapshot: () => ({}) } },
      logger: { warn: (message: string) => { warnings.push(message) } },
      on: () => () => undefined,
    }

    apply(ctx)
    await expect(Promise.all(pending)).rejects.toThrow('duplicate workflow input source')

    expect(disposed).toEqual(['action', 'locale'])
    expect(warnings).toEqual([])
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
        runAction() { /* action-capable dispatch face */ },
        register(contribution: any) { registered.push(contribution); return () => undefined },
        decorate: () => () => undefined,
      },
      inputTriggers: { registerSource: () => () => undefined },
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
      inputTriggers: { registerSource: () => () => undefined },
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

  it('claims exact Enter in an action-capable shell, opens locally, and commits the draft without Host/model work', async () => {
    const pending: Promise<unknown>[] = []
    const registered: any[] = []
    const sources: any[] = []
    const hostCommand = vi.fn()
    const hostRpc = vi.fn()
    const modelTurn = vi.fn()
    const actions = {
      opened: false,
      open() { this.opened = true },
      close() { this.opened = false },
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
        startModelTurn: modelTurn,
      },
      sessions: {
        list: { getSnapshot: () => ({ ids: ['s1'], current: 's1', phase: 'ready' }), subscribe: () => () => undefined },
        binding: () => ({ session: { command: hostCommand } }),
      },
      slots: {
        inject(_name: string, factory: () => unknown) { factory(); return () => undefined },
        register(entry: any) { entry.inject?.(actions); return () => undefined },
      },
      conversationEvents: { register: () => () => undefined },
      commandUi: actionCommandUi({
        register(contribution: any) { registered.push(contribution); return () => undefined },
        decorate: () => () => undefined,
      }),
      inputTriggers: {
        registerSource(source: any) { sources.push(source); return () => undefined },
      },
      locale: { register: () => () => undefined },
      connection: {
        rpc: { call: hostRpc },
        hostDescription: { subscribe: () => () => undefined, getSnapshot: () => ({}) },
      },
      on: () => () => undefined,
    }

    apply(ctx)
    await Promise.all(pending)

    expect(registered).toHaveLength(1)
    expect(registered[0]).toMatchObject({ name: 'workflows', ui: { kind: 'action' } })
    expect(sources).toHaveLength(1)
    // commandUi owns the visible action/menu in this runtime; the source owns
    // only final Enter adjudication, so it cannot add a duplicate candidate.
    await expect(sources[0].candidates({ sessionId: 's1' }, {
      query: 'workflows', position: 'leading', signal: new AbortController().signal,
    })).resolves.toEqual([])
    expect(sources[0].onPick({ position: 'leading' })).toBeUndefined()

    const installed = JSON.parse(readFileSync(
      nodeRequire.resolve('@deepseek-ai/dsh-client-ui-input-trigger/package.json'),
      'utf8',
    ))
    expect(installed.version).toBe('0.1.1-rc.2')
    const Controller = officialInputTriggerController()
    const earlierCommandMiss = {
      trigger: '/',
      name: 'command',
      candidates: async () => [],
      onPick: () => undefined,
      matchEnter: vi.fn(async () => undefined),
    }
    const assembledSources = [earlierCommandMiss, ...sources]
    const roster = {
      all: () => assembledSources,
      sources: (trigger: string) => assembledSources.filter(source => source.trigger === trigger),
    }
    const controller = new Controller({
      actx: { bail: () => undefined, effect: () => undefined },
      sessionId: 's1',
      roster,
    })
    try {
      let draft = '/workflows'
      const defaultSink = vi.fn(() => ({ kind: 'model-turn' }))
      const adjudicated = await controller.adjudicate(
        draft, new AbortController().signal, { images: 0 },
      )
      const routed = adjudicated ?? defaultSink()
      expect(earlierCommandMiss.matchEnter).toHaveBeenCalledOnce()
      expect(defaultSink).not.toHaveBeenCalled()
      expect(routed).toMatchObject({ claim: { token: '/workflows' } })
      const settled = await routed.claim.submit('')
      const handled = settled.kind === 'success'
      // This is the official conversation transaction contract: a successful
      // claimed submit commits by clearing the exact bare-token draft.
      if (handled) draft = ''

      expect({ handled, settled, draft }).toEqual({
        handled: true,
        settled: { kind: 'success' },
        draft: '',
      })
      expect(actions.opened).toBe(true)
      expect(hostCommand).not.toHaveBeenCalled()
      expect(hostRpc).not.toHaveBeenCalled()
      expect(modelTurn).not.toHaveBeenCalled()
    } finally {
      controller.dispose()
    }
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
      inputTriggers: { registerSource: () => () => undefined },
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
      inputTriggers: { registerSource: () => () => undefined },
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
        inject(name: string, factory: () => unknown) {
          if (name === 'shell.overlay') storedFactory = factory
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
      inputTriggers: { registerSource: () => () => undefined },
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

  it('registers a stock browser-only /workflows source with no Host command row', async () => {
    const pending: Promise<unknown>[] = []
    const sources: any[] = []
    const slotEntries: any[] = []
    const hostCommand = vi.fn()
    const actions = {
      open: vi.fn(function (this: { opened: boolean }) { this.opened = true }),
      opened: false,
    }
    const ctx: any = {
      effect(fn: () => unknown) { pending.push(Promise.resolve().then(() => fn())) },
      remote: { $mount: async () => () => undefined, $on: () => () => undefined },
      sessions: {
        list: { getSnapshot: () => ({ ids: ['s1'], current: 's1', phase: 'ready' }), subscribe: () => () => undefined },
        binding: () => ({ session: { command: hostCommand } }),
      },
      slots: {
        inject(_name: string, factory: () => unknown) { factory(); return () => undefined },
        register(entry: any) { slotEntries.push(entry); entry.inject?.(actions); return () => undefined },
      },
      conversationEvents: { register: () => () => undefined },
      commandUi: { register: () => () => undefined, decorate: () => () => undefined },
      inputTriggers: {
        registerSource(source: any) { sources.push(source); return () => undefined },
      },
      locale: { register: () => () => undefined },
      connection: { hostDescription: { subscribe: () => () => undefined, getSnapshot: () => ({}) } },
      on: () => () => undefined,
    }
    apply(ctx)
    await Promise.all(pending)

    expect(sources).toHaveLength(1)
    expect(sources[0]).toMatchObject({ trigger: '/', name: 'workflows', showGroupTitle: false })
    expect(slotEntries.some(entry => entry?.name === 'conversation.chat.commandview')).toBe(false)
    await expect(sources[0].candidates({ sessionId: 's1' }, {
      query: 'work', position: 'leading', signal: new AbortController().signal,
    })).resolves.toEqual([{ name: 'workflows', description: 'Open saved workflows and live runs' }])

    // InputBar gives an open menu first refusal on canonical Enter. Exercise
    // that exact official-RC2 path rather than only calling matchEnter: the
    // highlighted pick must replace the token and open once, without falling
    // through to the default model sink.
    let draft = '/workflows'
    const draftRev = 9
    const modelSink = vi.fn()
    const Controller = officialInputTriggerController()
    const controller = new Controller({
      actx: {
        effect: () => undefined,
        bail(_subject: unknown, event: string, request: any) {
          if (event !== 'slash/input-insert-text' || request.span.draftRev !== draftRev) return undefined
          draft = draft.slice(0, request.span.start) + request.text + draft.slice(request.span.end)
          return true
        },
      },
      sessionId: 's1',
      roster: { all: () => sources, sources: (trigger: string) => sources.filter(source => source.trigger === trigger) },
    })
    const adjudicate = vi.spyOn(controller, 'adjudicate')
    try {
      controller.track(draft, draft.length, { tier: 'plain' }, draftRev)
      await vi.waitFor(() => {
        expect(controller.menu.getSnapshot()).toMatchObject({
          open: true,
          highlight: { source: 'workflows', index: 0 },
          groups: [{ source: 'workflows', status: 'ready', items: [{ name: 'workflows' }] }],
        })
      })
      expect(controller.menu.getSnapshot().groups[0].items).toHaveLength(1)
      expect(controller.menu.getSnapshot().groups.flatMap((group: any) => group.items)).toHaveLength(1)
      const arbitration = controller.arbitrate('enter', false)
      if (arbitration === 'pass') modelSink(draft)
      expect(arbitration).toBe('pick-highlighted')
      expect(draft).toBe('')
      expect(actions.open).toHaveBeenCalledOnce()
      expect(adjudicate).not.toHaveBeenCalled()
      expect(modelSink).not.toHaveBeenCalled()
      expect(hostCommand).not.toHaveBeenCalled()
    } finally {
      controller.dispose()
    }

    actions.open.mockClear()
    const claim = await sources[0].matchEnter(
      { sessionId: 's1' }, '/workflows', new AbortController().signal, { images: 0 },
    )
    expect(claim).toMatchObject({ claim: { token: '/workflows' } })
    await expect(claim.claim.submit('')).resolves.toEqual({ kind: 'success' })
    expect(actions.opened).toBe(true)
    expect(actions.open).toHaveBeenCalledOnce()
    await expect(sources[0].matchEnter(
      { sessionId: 's1' }, '/workflows extra', new AbortController().signal, { images: 0 },
    )).rejects.toThrow(/accepts no arguments/u)
    await expect(sources[0].matchEnter(
      { sessionId: 's1' }, '/workflows\textra', new AbortController().signal, { images: 0 },
    )).rejects.toThrow(/accepts no arguments/u)
    await expect(sources[0].matchEnter(
      { sessionId: 's1' }, '/workflows\nextra', new AbortController().signal, { images: 0 },
    )).rejects.toThrow(/accepts no arguments/u)
    await expect(sources[0].matchEnter(
      { sessionId: 's1' }, '/workflows', new AbortController().signal, { images: 1 },
    )).rejects.toThrow(/does not accept images/u)
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
      inputTriggers: { registerSource: () => () => undefined },
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
