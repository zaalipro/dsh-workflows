// @vitest-environment jsdom

import { act } from 'react'
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
        register(contribution: any) { registered.push(contribution); return () => undefined },
        decorate: () => () => undefined,
      },
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
    await act(async () => { await registered[0].ui.onSelect({ id: 'open' }, { sessionId: 's1' }) })
    host?.querySelector('button[aria-label="Close workflows"], button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
})
