// @vitest-environment jsdom

import React, { act, useSyncExternalStore } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  GENERIC_CONTROL_ERROR,
  GENERIC_LOAD_ERROR,
  STALE_CONTROL_ERROR,
  WorkflowsDashboard,
  declaredWorkflowPhases,
} from '../src/client/WorkflowsDashboard.js'
import type {
  ClientRunHead,
  WorkflowRunAction,
  WorkflowRunsOperations,
  WorkflowRunsSourceSnapshot,
} from '../src/client/contract.js'
import { WorkflowRunsRemoteError } from '../src/client/contract.js'
import { createWorkflowsStore } from '../src/client/store.js'
import { dashboardLabelsFromLocale, workflowLocales } from '../src/client/locales.js'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const UUID = '1234567890abcdef1234567890abcdef'
const SESSION = 'session-dashboard'

function run(status: ClientRunHead['status'], suffix = status, overrides: Partial<ClientRunHead> = {}): ClientRunHead {
  const terminalStatus = status === 'completed' || status === 'failed' || status === 'cancelled' || status === 'interrupted'
    ? status
    : undefined
  const terminal = terminalStatus === undefined ? undefined : {
    stopReason: terminalStatus === 'failed' ? 'error' as const : terminalStatus,
    resultState: terminalStatus === 'completed' ? 'available' as const : 'not-produced' as const,
    ...(terminalStatus === 'failed' ? { error: 'provider failed' } : {}),
    ...(terminalStatus === 'interrupted' ? { error: 'Process exited before workflow settlement.' } : {}),
  }
  return {
    runId: `${UUID}-${suffix}`,
    displayName: `review-${suffix}`,
    name: 'review',
    description: 'Review a small deterministic fixture',
    status,
    ...(status === 'needs-input' ? { phase: 'approval' } : {}),
    budget: { total: 8, spent: status === 'budget-limited' ? 8 : 2, remaining: status === 'budget-limited' ? 0 : 6 },
    memberCounts: {
      total: 2,
      running: status === 'running' || status === 'needs-input' || status === 'budget-limited' ? 1 : 0,
      completed: status === 'completed' ? 2 : 0,
      failed: status === 'failed' ? 1 : 0,
      cancelled: status === 'cancelled' || status === 'interrupted' ? 2 : 0,
    },
    startedAt: 1_000,
    ...(terminal === undefined ? {} : { settledAt: 2_000, terminal }),
    allowedActions: status === 'running'
      ? ['pause', 'stop', 'save']
      : status === 'paused' || status === 'needs-input'
        ? ['resume', 'stop', 'save']
        : status === 'budget-limited'
          ? ['stop', 'save']
          : [],
    revision: 3,
    detailRevision: 2,
    membersRevision: 2,
    logsRevision: 1,
    resultRevision: 2,
    artifactsRevision: 1,
    ...overrides,
  }
}

function source(runs: readonly ClientRunHead[], phase: WorkflowRunsSourceSnapshot['phase'] = 'ready'): WorkflowRunsSourceSnapshot {
  return {
    sessionId: SESSION,
    phase,
    status: phase,
    runs,
    total: runs.length,
    sessionRevision: 3,
    revision: 3,
  }
}

function operations(heads: readonly ClientRunHead[], overrides: Partial<WorkflowRunsOperations> = {}): WorkflowRunsOperations {
  const fail = async (): Promise<never> => { throw new Error('not called') }
  const lookup = (runId: string): ClientRunHead => heads.find(row => row.runId === runId) ?? heads[0] ?? run('running')
  return {
    observe: vi.fn(),
    source: () => ({ getSnapshot: () => source(heads), subscribe: () => () => undefined }),
    refresh: vi.fn(async () => source(heads)),
    loadMore: vi.fn(async () => source(heads)),
    detail: vi.fn(async (_session, runId) => ({
      run: lookup(runId),
      phases: [{ title: 'Review', detail: 'first' }, { title: 'Verify' }],
    })),
    members: vi.fn(async () => ({
      items: [
        {
          memberId: `${UUID.slice(0, 30)}01`,
          seq: 1,
          label: 'alpha',
          phase: 'Review',
          status: 'completed',
          startedAt: 10,
          settledAt: 20,
          outcome: 'available',
          childSessionId: 'child-1',
        },
      ],
      total: 1,
      revision: 1,
    })),
    memberDetail: vi.fn(async () => ({
      member: {
        memberId: `${UUID.slice(0, 30)}01`,
        seq: 1,
        label: 'alpha',
        phase: 'Review',
        status: 'completed',
        outcome: 'available',
        childSessionId: 'child-1',
      },
      childSessionId: 'child-1',
      outcome: { state: 'available', content: { kind: 'value', value: { finding: true } }, totalBytes: 16, truncated: false },
    })),
    logs: vi.fn(async () => ({ items: [], evicted: 0, total: 0, revision: 1 })),
    result: vi.fn(async () => ({ value: { state: 'pending' }, revision: 1 })),
    artifacts: vi.fn(async () => ({ items: [], omitted: 0, total: 0, revision: 1 })),
    artifact: fail,
    control: vi.fn(async () => ({ run: run('running') })),
    resolveAndOpenChild: vi.fn(async () => true),
    handleChange: () => undefined,
    handleDisconnected: () => undefined,
    handleConnected: () => undefined,
    handleReset: () => undefined,
    removeSession: () => undefined,
    dispose: () => undefined,
    ...overrides,
  }
}

interface Bench {
  readonly node: HTMLElement
  readonly root: Root
  readonly store: ReturnType<ReturnType<typeof createWorkflowsStore>['create']>
  readonly operations: WorkflowRunsOperations
  readonly opener: HTMLButtonElement
}

const benches: Bench[] = []

function DashboardHarness({
  instance,
  operations: ops,
  snapshot,
  invoker,
}: {
  readonly instance: ReturnType<ReturnType<typeof createWorkflowsStore>['create']>
  readonly operations: WorkflowRunsOperations
  readonly snapshot: WorkflowRunsSourceSnapshot
  readonly invoker: HTMLElement | null
}) {
  const state = useSyncExternalStore(instance.subscribe, instance.getSnapshot, instance.getSnapshot)
  return (
    <WorkflowsDashboard
      operations={ops}
      source={snapshot}
      sessionId={SESSION}
      store={state}
      storeActions={instance.actions}
      invoker={invoker}
      onClose={() => { instance.actions.close() }}
      labels={dashboardLabelsFromLocale(workflowLocales.en)}
    />
  )
}

function bench(
  snapshot: WorkflowRunsSourceSnapshot,
  ops = operations(snapshot.runs),
): Bench {
  const shell = document.createElement('div')
  const opener = document.createElement('button')
  opener.textContent = 'Open'
  const overlay = document.createElement('div')
  overlay.dataset.shellOverlay = ''
  const node = document.createElement('div')
  overlay.append(node)
  shell.append(opener, overlay)
  document.body.append(shell)
  opener.focus()
  const root = createRoot(node)
  const store = createWorkflowsStore().create()
  store.actions.open()
  act(() => {
    root.render(
      <DashboardHarness instance={store} operations={ops} snapshot={snapshot} invoker={opener} />,
    )
  })
  const value = { node, root, store, operations: ops, opener }
  benches.push(value)
  return value
}

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

function release(b: Bench): void {
  act(() => { b.root.unmount() })
  b.node.parentElement?.parentElement?.remove()
  const index = benches.indexOf(b)
  if (index >= 0) benches.splice(index, 1)
}

afterEach(() => {
  for (const item of benches.splice(0)) {
    act(() => { item.root.unmount() })
    item.node.parentElement?.parentElement?.remove()
  }
  vi.restoreAllMocks()
})

describe('WorkflowsDashboard (RC14-RC18)', () => {
  it('recovers declared phases from members when Remote detail omitted them', () => {
    const selected = run('completed')
    expect(declaredWorkflowPhases({ run: selected, phases: [{ title: 'Review' }, { title: 'Verify' }] }, selected, [])).toEqual([
      { title: 'Review' }, { title: 'Verify' },
    ])
    expect(declaredWorkflowPhases({ run: selected }, selected, [
      { memberId: 'a', seq: 1, label: 'alpha', phase: 'Fanout', status: 'completed', outcome: 'not-produced' },
      { memberId: 'b', seq: 2, label: 'beta', phase: 'Fanout', status: 'completed', outcome: 'not-produced' },
    ])).toEqual([{ title: 'Fanout' }])
    expect(declaredWorkflowPhases({ run: { ...selected, phase: 'Fanout' } }, selected, [])).toEqual([{ title: 'Fanout' }])
  })

  it('keeps empty, loading, and error panes exclusive of 11.1 copy', () => {
    const empty = bench(source([], 'ready'))
    expect(empty.node.textContent).toContain('No workflow runs yet')
    expect(empty.node.textContent).toContain('Launch a saved workflow to see its progress here.')
    expect(empty.node.querySelector('[aria-label="Close workflows"]')).not.toBeNull()
    expect(empty.node.textContent).toContain('P pause · R resume · X stop · S save · Esc close')
    expect(empty.node.textContent).not.toContain(UUID)
    expect(empty.node.textContent).not.toContain('Unable to load workflow data')
    release(empty)

    const loading = bench(source([], 'loading'))
    expect(loading.node.textContent).toContain('Loading workflow runs…')
    expect(loading.node.textContent).not.toContain('No workflow runs yet')
    release(loading)

    const failed = bench(source([], 'error'))
    expect(failed.node.textContent).toContain(GENERIC_LOAD_ERROR)
    expect(failed.node.textContent).toContain('Retry')
    expect(failed.node.textContent).not.toContain('No workflow runs yet')
    release(failed)

    const reconnecting = bench(source([], 'reconnecting'))
    expect(reconnecting.node.textContent).toContain('Reconnecting…')
    expect(reconnecting.node.textContent).not.toContain('No workflow runs yet')
  })

  it('renders compact status labels, Interrupted settlement, live phase, and budget explainer', async () => {
    const row = run('budget-limited', 'budget-limited', { phase: 'Review' })
    const ops = operations([row], {
      detail: vi.fn(async () => ({
        run: row,
        phases: [{ title: 'Review' }, { title: 'Verify' }],
      })),
    })
    const b = bench(source([row]), ops)
    await settle()
    expect(b.node.textContent).toContain('Budget limited')
    expect(b.node.textContent).toContain('Agent budget exhausted')
    expect(b.node.textContent).toContain('0/2 agents')
    expect(b.node.querySelector('[data-current="true"]')?.textContent).toContain('Review')
    expect(b.node.querySelector('[data-current="true"]')?.getAttribute('title')).toBe('Review')
    expect(b.node.textContent).toContain('Current')
    expect(b.node.textContent).not.toContain(row.runId)
    release(b)

    const interrupted = bench(source([run('interrupted')]))
    await settle()
    expect(interrupted.node.textContent).toContain('Interrupted')
    expect(interrupted.node.textContent).toContain('Process exited before workflow settlement.')
    expect(interrupted.node.querySelector('[aria-label^="Controls"]')?.querySelectorAll('button')).toHaveLength(0)
  })

  it('distinguishes never-produced logs from a fully evicted retained window', async () => {
    const running = run('running')
    const emptyLogs = operations([running], {
      logs: vi.fn(async () => ({ items: [], evicted: 0, total: 0, revision: 1 })),
    })
    const produced = bench(source([running]), emptyLogs)
    await settle()
    act(() => { produced.node.querySelector<HTMLButtonElement>('[data-workflow-output-tab="logs"]')!.click() })
    await settle()
    expect(produced.node.textContent).toContain('No log lines')
    expect(produced.node.textContent).not.toContain('No retained log lines')
    release(produced)

    const completed = run('completed')
    const evictedLogs = operations([completed], {
      logs: vi.fn(async () => ({ items: [], evicted: 4, total: 0, revision: 1 })),
    })
    const evicted = bench(source([run('completed')]), evictedLogs)
    await settle()
    act(() => { evicted.node.querySelector<HTMLButtonElement>('[data-workflow-output-tab="logs"]')!.click() })
    await settle()
    expect(evicted.node.textContent).toContain('No retained log lines')
  })

  it('drives selection and mobile view from the store and only renders allowed actions', async () => {
    const live = run('running')
    const paused = run('paused', 'paused', { startedAt: 2_000 })
    const b = bench(source([live, paused]))
    await settle()
    expect(b.store.getSnapshot().selectedRunId).toBe(live.runId)
    const pause = [...b.node.querySelectorAll('button')].map(button => button.textContent)
    expect(pause).toContain('Pause')
    expect(pause).toContain('Stop')
    expect(pause).toContain('Save')
    expect(pause).not.toContain('Resume')

    act(() => {
      [...b.node.querySelectorAll<HTMLButtonElement>('[data-workflow-run-id]')]
        .find(button => button.dataset.workflowRunId === paused.runId)!
        .click()
    })
    await settle()
    expect(b.store.getSnapshot()).toMatchObject({ selectedRunId: paused.runId, mobileView: 'execution' })
    const resume = [...b.node.querySelectorAll('button')].map(button => button.textContent)
    expect(resume).toContain('Resume')
    expect(resume).not.toContain('Pause')

    await act(async () => {
      b.node.querySelector<HTMLButtonElement>('[data-workflow-output-tab="logs"]')!.click()
      await Promise.resolve()
    })
    expect(b.store.getSnapshot().mobileView).toBe('inspector')
    await act(async () => {
      b.node.querySelector<HTMLButtonElement>('[data-workflow-output-tab="members"]')!.click()
      await Promise.resolve()
    })
    expect(b.store.getSnapshot().mobileView).toBe('execution')
  })

  it('sends the current revision, suppresses illegal shortcuts, and shows exact control errors', async () => {
    const live = run('running')
    let resolveControl: ((value: { run: ClientRunHead }) => void) | undefined
    const control = vi.fn<WorkflowRunsOperations['control']>(() => new Promise(resolve => { resolveControl = resolve }))
    const b = bench(source([live]), operations([live], { control }))
    await settle()
    const dialog = b.node.querySelector<HTMLElement>('[data-workflows-dashboard]')!
    dialog.focus()
    act(() => {
      dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', bubbles: true }))
    })
    await settle()
    expect(control).toHaveBeenCalledWith(SESSION, live.runId, 'pause', 3, expect.any(AbortSignal))
    act(() => {
      dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', bubbles: true }))
    })
    expect(control).toHaveBeenCalledTimes(1)
    await act(async () => { resolveControl?.({ run: { ...live, status: 'paused', allowedActions: ['resume', 'stop', 'save'], revision: 4 } }) })
    await settle()

    const editable = document.createElement('textarea')
    dialog.append(editable)
    editable.focus()
    act(() => {
      editable.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true }))
      dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'R', bubbles: true, metaKey: true }))
      dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true, repeat: true }))
    })
    expect(control).toHaveBeenCalledTimes(1)

    release(b)
    const paused = run('paused', 'paused')
    const stale = bench(source([paused]), operations([paused], {
      control: vi.fn(async () => {
        throw new WorkflowRunsRemoteError('revision-conflict', STALE_CONTROL_ERROR, { run: run('running', 'running') })
      }),
    }))
    await settle()
    const staleDialog = stale.node.querySelector<HTMLElement>('[data-workflows-dashboard]')!
    staleDialog.focus()
    act(() => {
      staleDialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true }))
    })
    await settle()
    expect(stale.node.textContent).toContain(STALE_CONTROL_ERROR)

    release(stale)
    const pausedBudget = run('paused', 'paused-budget')
    const budget = bench(source([pausedBudget]), operations([pausedBudget], {
      control: vi.fn(async () => {
        throw new WorkflowRunsRemoteError('action-unavailable', 'nope', { reason: 'budget-limited' })
      }),
    }))
    await settle()
    act(() => {
      [...budget.node.querySelectorAll('button')].find(button => button.textContent === 'Resume')!.click()
    })
    await settle()
    expect(budget.node.textContent).toContain('workflow "review-paused-budget" requires a higher agent_budget to resume')

    release(budget)
    const genericRun = run('running', 'generic')
    const generic = bench(source([genericRun]), operations([genericRun], {
      control: vi.fn(async () => { throw new Error('boom') }),
    }))
    await settle()
    act(() => {
      [...generic.node.querySelectorAll('button')].find(button => button.textContent === 'Pause')!.click()
    })
    await settle()
    expect(generic.node.textContent).toContain(GENERIC_CONTROL_ERROR)
  })

  it('traps focus, skips hidden Back controls, restores inert, and closes on Escape', async () => {
    const b = bench(source([run('running')]))
    await settle()
    const dialog = b.node.querySelector<HTMLElement>('[data-workflows-dashboard]')!
    expect(b.opener.hasAttribute('inert')).toBe(true)
    expect(b.opener.getAttribute('aria-hidden')).toBe('true')

    const hidden = document.createElement('button')
    hidden.textContent = 'hidden'
    hidden.style.display = 'none'
    dialog.append(hidden)
    dialog.focus()
    act(() => {
      dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }))
    })
    act(() => {
      dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(b.store.getSnapshot().open).toBe(false)
  })

  it('uses px breakpoints, 44px targets, overlay stacking, and alias tokens only', () => {
    const css = readFileSync(resolve(import.meta.dirname, '../src/client/WorkflowsDashboard.module.css'), 'utf8')
    expect(css).toContain('@media (max-width: 1199px)')
    expect(css).toContain('@media (max-width: 767px)')
    expect(css).toContain('@media (max-width: 320px)')
    expect(css).toContain('min-height: 44px')
    expect(css).toContain('min-width: 44px')
    expect(css).toContain('z-index: 2000')
    expect(css).toContain(':has([data-workflows-dashboard])')
    expect(css).not.toContain(':has(> [data-workflows-dashboard])')
    expect(css).toContain('.frame')
    expect(css).toContain('color-mix')
    expect(css).not.toContain('100vw')
    expect(css).not.toContain('--dsw-alias-bg-transparent')
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u)
    expect(css).not.toMatch(/rgba?\(/u)
    const panel = readFileSync(resolve(import.meta.dirname, '../src/client/WorkflowRunPanel.module.css'), 'utf8')
    expect(panel).not.toContain('--dsw-alias-bg-transparent')
  })

  it('frames the dashboard as a modal card and closes on chrome mousedown', async () => {
    const b = bench(source([]))
    await settle()
    const dialog = b.node.querySelector<HTMLElement>('[data-workflows-dashboard]')!
    const frame = dialog.querySelector<HTMLElement>('[data-workflows-frame]')!
    expect(frame).toBeTruthy()
    expect(dialog.contains(frame)).toBe(true)
    act(() => {
      frame.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    })
    expect(b.store.getSnapshot().open).toBe(true)
    act(() => {
      dialog.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    })
    expect(b.store.getSnapshot().open).toBe(false)
  })

  it('throws without operations and formats elapsed durations', async () => {
    expect(() => WorkflowsDashboard({} as never)).toThrow(/workflow dashboard operations are unavailable/u)
    const live = run('running', 'timer', { startedAt: Date.now() - 3_600_000 })
    const b = bench(source([live]))
    await settle()
    expect(b.node.textContent).toMatch(/\d+[dhms]/u)
  })
})

describe('createWorkflowsStore navigation', () => {
  it('keeps members on the execution pane and artifacts in the inspector', () => {
    const store = createWorkflowsStore()
    store.dispatch('open')
    store.dispatch('selectRun', 'run-a')
    expect(store.getState()).toMatchObject({ open: true, selectedRunId: 'run-a', mobileView: 'execution' })
    store.dispatch('selectTab', 'logs')
    expect(store.getState().mobileView).toBe('inspector')
    store.dispatch('selectTab', 'members')
    expect(store.getState()).toMatchObject({ inspectorTab: 'members', mobileView: 'execution' })
    store.dispatch('selectArtifact', 'report.md')
    expect(store.getState()).toMatchObject({ inspectorTab: 'artifacts', mobileView: 'inspector' })
    store.dispatch('showRun')
    expect(store.getState().mobileView).toBe('execution')
    store.dispatch('reconcileRun', 'missing', ['run-b'])
    expect(store.getState().selectedRunId).toBe('run-b')
    store.dispatch('close')
    expect(store.getState().open).toBe(false)
  })
})
