// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'

import { apply } from '../src/client/index.js'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const cleanups: Array<() => unknown> = []

afterEach(async () => {
  await act(async () => {
    for (const cleanup of cleanups.splice(0)) await cleanup()
  })
  document.getElementById('dsh-workflows-overlay')?.remove()
})

describe('stock overlay fallback portal', () => {
  it('mounts a document portal when shell.overlay never injects a store', async () => {
    const pending: Promise<unknown>[] = []
    const registered: any[] = []
    const ctx: any = {
      effect(fn: () => unknown) {
        pending.push(Promise.resolve().then(async () => {
          const dispose = await fn()
          if (typeof dispose === 'function') cleanups.push(dispose)
        }))
      },
      remote: {
        $mount: async () => () => undefined,
        $on: () => () => undefined,
        workflowRuns: {
          list: async () => ({ items: [], total: 0, sessionRevision: 0, epoch: 'e' }),
        },
      },
      sessions: {
        list: { getSnapshot: () => ({ ids: ['s1'], current: 's1', phase: 'ready' }), subscribe: () => () => undefined },
      },
      slots: { inject: () => undefined, register: () => undefined },
      conversationEvents: { register: () => () => undefined },
      commandUi: {
        ActionCommandUiSpec: { kind: 'action' },
        runAction() { /* action-capable dispatch face */ },
        register(contribution: any) { registered.push(contribution); return () => undefined },
        decorate: () => () => undefined,
      },
      inputTriggers: { registerSource: () => () => undefined },
      locale: { register: () => () => undefined },
      connection: { hostDescription: { subscribe: () => () => undefined, getSnapshot: () => ({}) } },
      on: () => () => undefined,
    }
    apply(ctx)
    await Promise.all(pending)
    await act(async () => { registered[0].ui.run() })
    const host = document.getElementById('dsh-workflows-overlay')
    expect(host).toBeTruthy()
    expect(host?.querySelector('[data-workflows-dashboard], [role="dialog"]')).toBeTruthy()
    await act(async () => {
      registered[0].ui.run()
      host?.querySelector('button[aria-label="Close workflows"], button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })
    expect(document.querySelectorAll('[data-workflows-dashboard]')).toHaveLength(0)
  })

  it('falls back to a portal when store open() does not mount a slot', async () => {
    const pending: Promise<unknown>[] = []
    const registered: any[] = []
    let storeOpen = false
    const storeActions = {
      open() { storeOpen = true },
      close() { storeOpen = false },
    }
    const ctx: any = {
      effect(fn: () => unknown) {
        pending.push(Promise.resolve().then(async () => {
          const dispose = await fn()
          if (typeof dispose === 'function') cleanups.push(dispose)
        }))
      },
      remote: {
        $mount: async () => () => undefined,
        $on: () => () => undefined,
        workflowRuns: { list: async () => ({ items: [], total: 0, sessionRevision: 0, epoch: 'e' }) },
      },
      sessions: {
        list: { getSnapshot: () => ({ ids: ['s1'], current: 's1', phase: 'ready' }), subscribe: () => () => undefined },
      },
      slots: {
        inject(_name: string, factory: () => unknown) { factory(); return () => undefined },
        register(entry: any) {
          entry.inject?.(storeActions)
          return () => undefined
        },
      },
      conversationEvents: { register: () => () => undefined },
      commandUi: {
        ActionCommandUiSpec: { kind: 'action' },
        runAction() { /* action-capable dispatch face */ },
        register(contribution: any) { registered.push(contribution); return () => undefined },
        decorate: () => () => undefined,
      },
      inputTriggers: { registerSource: () => () => undefined },
      locale: { register: () => () => undefined },
      connection: { hostDescription: { subscribe: () => () => undefined, getSnapshot: () => ({}) } },
      on: () => () => undefined,
    }
    apply(ctx)
    await Promise.all(pending)
    await act(async () => {
      registered[0].ui.run()
      await Promise.resolve()
    })
    expect(document.getElementById('dsh-workflows-overlay')).toBeTruthy()
    expect(storeOpen).toBe(true)

    // A second open queues another fallback check. Closing the already-open
    // portal must cancel that check and close the shell store as one action.
    const close = document.querySelector<HTMLButtonElement>('#dsh-workflows-overlay button[aria-label="Close workflows"]')
    await act(async () => {
      registered[0].ui.run()
      close?.click()
      await Promise.resolve()
    })
    expect(storeOpen).toBe(false)
    expect(document.querySelectorAll('[data-workflows-dashboard]')).toHaveLength(0)
  })

  it('removes an existing fallback when the shell slot later commits a dashboard', async () => {
    const pending: Promise<unknown>[] = []
    const registered: any[] = []
    let SlotComponent: any
    let injected: any
    let storeOpen = false
    const actions = {
      open() { storeOpen = true },
      close() { storeOpen = false },
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
      effect(fn: () => unknown) {
        pending.push(Promise.resolve().then(async () => {
          const dispose = await fn()
          if (typeof dispose === 'function') cleanups.push(dispose)
        }))
      },
      remote: {
        $mount: async () => () => undefined,
        $on: () => () => undefined,
        workflowRuns: { list: async () => ({ items: [], total: 0, sessionRevision: 0, epoch: 'e' }) },
      },
      sessions: {
        list: { getSnapshot: () => ({ ids: ['s1'], current: 's1', phase: 'ready' }), subscribe: () => () => undefined },
      },
      slots: {
        inject(_name: string, factory: () => unknown) { factory(); return () => undefined },
        register(entry: any, component: any) {
          if (entry.name === 'shell.overlay') {
            SlotComponent = component
            injected = entry.inject?.(actions)
          }
          return () => undefined
        },
      },
      conversationEvents: { register: () => () => undefined },
      commandUi: {
        runAction() { /* action-capable dispatch face */ },
        register(contribution: any) { registered.push(contribution); return () => undefined },
        decorate: () => () => undefined,
      },
      inputTriggers: { registerSource: () => () => undefined },
      locale: { register: () => () => undefined },
      connection: { hostDescription: { subscribe: () => () => undefined, getSnapshot: () => ({}) } },
      on: () => () => undefined,
    }
    apply(ctx)
    await Promise.all(pending)
    await act(async () => {
      registered[0].ui.run()
      await Promise.resolve()
    })
    expect(document.querySelectorAll('[data-workflows-dashboard]')).toHaveLength(1)
    expect(document.getElementById('dsh-workflows-overlay')).toBeTruthy()

    const shellHost = document.createElement('div')
    shellHost.dataset.shellOverlay = ''
    document.body.appendChild(shellHost)
    const shellRoot = createRoot(shellHost)
    cleanups.push(() => { shellRoot.unmount(); shellHost.remove() })
    const openState = {
      open: true,
      selectedRunId: undefined,
      selectedMemberId: undefined,
      selectedArtifactName: undefined,
      inspectorTab: 'members',
      mobileView: 'runs',
    }
    await act(async () => {
      shellRoot.render(createElement(SlotComponent, {
        actions,
        useStore: (selector: (value: typeof openState) => unknown) => selector(openState),
      }))
      await Promise.resolve()
    })

    expect(document.querySelectorAll('[data-workflows-dashboard]')).toHaveLength(1)
    expect(shellHost.querySelector('[data-workflows-dashboard]')).toBeTruthy()
    expect(document.getElementById('dsh-workflows-overlay')).toBeNull()
    // Deferred disposal of the stale fallback root must release only its own
    // observation owner, never the newly committed shell slot's polling.
    expect(injected.operations.source.getSnapshot().sessionId).toBe('s1')

    // Policy: if the shell contribution disappears while its dashboard is
    // still logically open, the portal takes over rather than losing UI.
    await act(async () => {
      shellRoot.unmount()
      await Promise.resolve()
    })
    shellHost.remove()
    expect(storeOpen).toBe(true)
    expect(document.querySelectorAll('[data-workflows-dashboard]')).toHaveLength(1)
    expect(document.getElementById('dsh-workflows-overlay')).toBeTruthy()
    expect(injected.operations.source.getSnapshot().sessionId).toBe('s1')

    await act(async () => {
      document.querySelector<HTMLButtonElement>('#dsh-workflows-overlay button[aria-label="Close workflows"]')?.click()
      await Promise.resolve()
    })
    expect(storeOpen).toBe(false)
    expect(document.querySelectorAll('[data-workflows-dashboard]')).toHaveLength(0)
    expect(injected.operations.source.getSnapshot().sessionId).toBe('')
  })
})
