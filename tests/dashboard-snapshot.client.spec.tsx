// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  GENERIC_CONTROL_ERROR,
  GENERIC_LOAD_ERROR,
  STALE_CONTROL_ERROR,
  WorkflowsDashboard,
  appendArtifactChunk,
  orderWorkflowRuns,
} from '../src/client/WorkflowsDashboard.js'
import type {
  ClientRunHead,
  WorkflowRunMemberDetail,
  WorkflowRunMemberHead,
  WorkflowRunValueView,
  WorkflowRunsOperations,
  WorkflowRunsSourceSnapshot,
} from '../src/client/contract.js'
import { WorkflowRunsRemoteError } from '../src/client/contract.js'
import { WorkflowMemberInspector } from '../src/client/WorkflowMemberInspector.js'
import { WorkflowRunPanel } from '../src/client/WorkflowRunPanel.js'
import type { WorkflowRunChatData } from '../src/client/workflow-definition.js'
import { workflowPhaseKey } from '../src/client/workflow-definition.js'
import { INTERRUPTED_SETTLEMENT, dashboardLabelsFromLocale, workflowLocales } from '../src/client/locales.js'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const UUID = '1234567890abcdef1234567890abcdef'
const SESSION = 'session-dashboard'
const NOW = 1_700_000_010_000
const STARTED = NOW - 5_000

const STATUS_COPY = {
  running: 'Running',
  pausing: 'Pausing',
  stopping: 'Stopping',
  'needs-input': 'Needs input',
  paused: 'Paused',
  'budget-limited': 'Budget limited',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Stopped',
  interrupted: 'Interrupted',
} as const

function run(
  status: ClientRunHead['status'],
  suffix: string = status,
  overrides: Partial<ClientRunHead> = {},
): ClientRunHead {
  const terminalStatus = status === 'completed' || status === 'failed' || status === 'cancelled' || status === 'interrupted'
    ? status
    : undefined
  const terminal = terminalStatus === undefined ? undefined : {
    stopReason: terminalStatus === 'failed' ? 'error' as const : terminalStatus,
    resultState: terminalStatus === 'completed' ? 'available' as const : 'not-produced' as const,
    ...(terminalStatus === 'failed' ? { error: 'provider failed' } : {}),
    ...(terminalStatus === 'interrupted' ? { error: INTERRUPTED_SETTLEMENT } : {}),
  }
  return {
    runId: `${UUID}-${suffix}`,
    displayName: `review-${suffix}`,
    name: 'review',
    description: 'Review a small deterministic fixture',
    status,
    ...(status === 'needs-input' ? { phase: 'approval' } : {}),
    ...(status === 'budget-limited' ? { phase: 'Review' } : {}),
    budget: { total: 8, spent: status === 'budget-limited' ? 8 : 2, remaining: status === 'budget-limited' ? 0 : 6 },
    memberCounts: {
      total: 2,
      running: status === 'running' || status === 'needs-input' || status === 'paused' || status === 'budget-limited' ? 1 : 0,
      completed: status === 'completed' ? 2 : 0,
      failed: status === 'failed' ? 1 : 0,
      cancelled: status === 'cancelled' || status === 'interrupted' ? 2 : 0,
    },
    startedAt: STARTED,
    ...(terminal === undefined ? {} : { settledAt: NOW, terminal }),
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

function source(
  runs: readonly ClientRunHead[],
  phase: WorkflowRunsSourceSnapshot['phase'] = 'ready',
): WorkflowRunsSourceSnapshot {
  return {
    sessionId: SESSION,
    phase,
    status: phase,
    runs,
    total: runs.length,
    sessionRevision: 3,
    revision: 3,
    epoch: 'epoch-dashboard',
  }
}

function memberStatus(status: ClientRunHead['status']): WorkflowRunMemberHead['status'] {
  if (status === 'failed') return 'failed'
  if (status === 'cancelled' || status === 'interrupted') return 'cancelled'
  if (status === 'completed') return 'completed'
  return 'running'
}

function liveOperations(
  heads: readonly ClientRunHead[],
  overrides: Partial<WorkflowRunsOperations> = {},
): WorkflowRunsOperations {
  const fail = async (): Promise<never> => { throw new Error('not called during snapshot') }
  const lookup = (runId: string): ClientRunHead => heads.find(row => row.runId === runId) ?? heads[0] ?? run('running')
  return {
    observe: () => undefined,
    source: () => ({ getSnapshot: () => source(heads), subscribe: () => () => undefined }),
    refresh: async () => source(heads),
    loadMore: fail,
    detail: async (_session, runId) => {
      const row = lookup(runId)
      return {
        run: row,
        phases: [{ title: 'Review', detail: 'first' }, { title: 'Verify' }],
        ...(row.status === 'needs-input'
          ? { gate: { kind: 'await_user', message: 'Approve the diff.', resumable: true } }
          : {}),
        ...(row.status === 'failed' ? { error: 'provider failed' } : {}),
      }
    },
    members: async (_session, runId) => {
      const row = lookup(runId)
      const status = memberStatus(row.status)
      return {
        items: [
          {
            memberId: 'member-alpha',
            seq: 1,
            label: 'alpha',
            phase: 'Review',
            status,
            startedAt: 10,
            ...(status === 'running' ? {} : { settledAt: 20 }),
            outcome: status === 'running' ? 'pending' : 'available',
            childSessionId: 'child-1',
          },
          {
            memberId: 'member-beta',
            seq: 2,
            label: 'beta',
            phase: '',
            status: status === 'running' ? 'running' : 'completed',
            startedAt: 11,
            ...(status === 'running' ? {} : { settledAt: 21 }),
            outcome: status === 'running' ? 'pending' : 'available',
            childSessionId: 'child-2',
          },
        ],
        total: 2,
        revision: 1,
      }
    },
    memberDetail: async () => ({
      member: {
        memberId: 'member-alpha',
        seq: 1,
        label: 'alpha',
        phase: 'Review',
        status: 'completed',
        outcome: 'available',
        childSessionId: 'child-1',
      },
      childSessionId: 'child-1',
      outcome: { state: 'available', content: { kind: 'value', value: null }, totalBytes: 4, truncated: false },
    }),
    logs: async () => ({ items: [], evicted: 0, total: 0, revision: 1 }),
    result: async (_session, runId) => {
      const row = lookup(runId)
      if (row.status === 'completed') {
        return {
          value: { state: 'available', content: { kind: 'value', value: { alpha: 'alpha', beta: null } }, totalBytes: 32, truncated: false },
          revision: 1,
        }
      }
      if (row.status === 'failed') {
        return { value: { state: 'not-produced' }, error: 'provider failed', revision: 1 }
      }
      return { value: { state: 'pending' }, revision: 1 }
    },
    artifacts: async () => ({ items: [{ name: 'report.md', bytes: 12 }], omitted: 0, total: 1, revision: 1 }),
    artifact: async () => ({
      artifact: { name: 'report.md', bytes: 12 },
      text: '# Report',
      offsetBytes: 0,
      returnedBytes: 8,
      totalBytes: 12,
      revision: 1,
    }),
    control: async () => ({ run: lookup(heads[0]?.runId ?? '') }),
    resolveAndOpenChild: async () => false,
    handleChange: () => undefined,
    handleDisconnected: () => undefined,
    handleConnected: () => undefined,
    handleReset: () => undefined,
    removeSession: () => undefined,
    dispose: () => undefined,
    ...overrides,
  }
}

function textOnly(markup: string): string {
  return markup
    .replace(/<style[\s\S]*?<\/style>/gu, '')
    .replace(/<script[\s\S]*?<\/script>/gu, '')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/&nbsp;/gu, ' ')
    .replace(/&amp;/gu, '&')
    .replace(/\s+/gu, ' ')
    .trim()
}

function redact(value: string): string {
  return value.replaceAll(UUID, '[id]')
}

function semanticText(markupOrNode: string | HTMLElement): string {
  const markup = typeof markupOrNode === 'string' ? markupOrNode : markupOrNode.innerHTML
  return redact(textOnly(markup))
}

function namedRoles(node: HTMLElement): readonly string[] {
  return [...node.querySelectorAll('[role],button,h1,h2,h3,[aria-label]')]
    .map(element => {
      const role = element.getAttribute('role') ?? element.tagName.toLowerCase()
      const name = redact(
        (element.getAttribute('aria-label')
          ?? element.textContent
          ?? '')
          .replace(/\s+/gu, ' ')
          .trim()
          .slice(0, 160),
      )
      return `${role}: ${name}`
    })
}

function semanticDocument(node: HTMLElement): { readonly text: string; readonly roles: readonly string[] } {
  return { text: semanticText(node), roles: namedRoles(node) }
}

function member(seq: number, status: WorkflowRunMemberHead['status'], outcome: WorkflowRunMemberHead['outcome']): WorkflowRunMemberHead {
  return {
    memberId: `${UUID.slice(0, 30)}${String(seq).padStart(2, '0')}`,
    seq,
    label: seq === 1 ? 'alpha' : 'beta',
    ...(seq === 1 ? { phase: 'review' } : { phase: '' }),
    status,
    startedAt: 10,
    ...(status === 'running' ? {} : { settledAt: 20 }),
    outcome,
    childSessionId: `child-${seq}`,
  }
}

function panelNode(status: 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted'): {
  readonly kind: 'workflow-run'
  readonly data: WorkflowRunChatData
  readonly id: string
  readonly key: string
  readonly target: 'chat'
  readonly anchorSeq: number
  readonly location: { readonly kind: 'session' }
  readonly visibility: 'visible'
} {
  return {
    key: 'workflow-run:keyless',
    kind: 'workflow-run',
    id: UUID,
    target: 'chat',
    anchorSeq: 1,
    location: { kind: 'session' },
    visibility: 'visible',
    data: {
      name: 'keyless-review',
      status,
      phases: [
        { key: workflowPhaseKey(null), phase: null, members: [{ seq: 1, label: 'alpha', childId: 'child-1', status }] },
        { key: workflowPhaseKey(''), phase: '', members: [{ seq: 2, label: 'beta', childId: 'child-2', status: 'completed' }] },
      ],
    },
  }
}

interface Bench {
  readonly node: HTMLElement
  readonly root: Root
}

const benches: Bench[] = []

function mountDashboard(
  snapshot: WorkflowRunsSourceSnapshot,
  ops: WorkflowRunsOperations = liveOperations(snapshot.runs),
): Bench {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  act(() => {
    root.render(
      <WorkflowsDashboard
        operations={ops}
        source={snapshot}
        sessionId={SESSION}
        labels={dashboardLabelsFromLocale(workflowLocales.en)}
      />,
    )
  })
  const value = { node: host, root }
  benches.push(value)
  return value
}

function mountElement(element: React.ReactElement): Bench {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  act(() => { root.render(element) })
  const value = { node: host, root }
  benches.push(value)
  return value
}

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })
}

function release(bench: Bench): void {
  act(() => { bench.root.unmount() })
  bench.node.remove()
  const index = benches.indexOf(bench)
  if (index >= 0) benches.splice(index, 1)
}

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW)
})

afterEach(() => {
  for (const item of benches.splice(0)) {
    act(() => { item.root.unmount() })
    item.node.remove()
  }
  vi.restoreAllMocks()
})

describe('dashboard semantic snapshots', () => {
  it('keeps the empty dashboard accessible and free of internal identifiers', async () => {
    const empty = mountDashboard(source([]))
    await settle()
    const text = semanticText(empty.node)
    expect(text).toContain('Workflows')
    expect(text).toContain('No workflow runs yet')
    expect(text).toContain('Launch a saved workflow to see its progress here.')
    expect(text).toContain('P pause · R resume · X stop · S save · Esc close')
    expect(text).not.toContain(UUID)
    expect(text).not.toContain(GENERIC_LOAD_ERROR)
    expect(empty.node.querySelector('[aria-label="Close workflows"]')).not.toBeNull()
    expect(semanticDocument(empty.node)).toMatchSnapshot('empty')
  })

  it('keeps empty, loading, and error panes exclusive of 11.1 copy', async () => {
    const loading = mountDashboard(source([], 'loading'))
    await settle()
    expect(semanticText(loading.node)).toContain('Loading workflow runs…')
    expect(semanticText(loading.node)).not.toContain('No workflow runs yet')
    expect(semanticDocument(loading.node)).toMatchSnapshot('loading')
    release(loading)

    const failed = mountDashboard(source([], 'error'))
    await settle()
    expect(semanticText(failed.node)).toContain(GENERIC_LOAD_ERROR)
    expect(semanticText(failed.node)).toContain('Retry')
    expect(semanticText(failed.node)).not.toContain('No workflow runs yet')
    expect(semanticDocument(failed.node)).toMatchSnapshot('generic-load-error')
    release(failed)

    const reconnecting = mountDashboard(source([], 'reconnecting'))
    await settle()
    expect(semanticText(reconnecting.node)).toContain('Reconnecting…')
    expect(semanticText(reconnecting.node)).not.toContain('No workflow runs yet')
    expect(semanticDocument(reconnecting.node)).toMatchSnapshot('reconnecting')
  })

  it.each([
    'running', 'needs-input', 'paused', 'budget-limited', 'completed', 'failed', 'cancelled', 'interrupted',
  ] as const)('renders semantic status and control vocabulary for %s', async status => {
    const row = run(status)
    const bench = mountDashboard(source([row]))
    await settle()
    const text = semanticText(bench.node)
    expect(text).toContain(`review-${status}`)
    expect(text).toContain(STATUS_COPY[status])
    expect(text).toContain('Members')
    expect(text).toContain('Agent budget')
    expect(text).toContain('5s')
    expect(text).not.toContain(row.runId)
    expect(text).not.toContain(UUID)
    if (status === 'running') {
      expect(text).toContain('Pause')
      expect(text).toContain('Stop')
      expect(text).toContain('Save')
      expect(text).not.toContain('Resume')
    }
    if (status === 'needs-input') {
      expect(text).toContain('approval')
      expect(text).toContain('Waiting for input: Approve the diff.')
      expect(text).toContain('Resume')
    }
    if (status === 'interrupted') expect(text).toContain(INTERRUPTED_SETTLEMENT)
    if (status === 'budget-limited') {
      expect(text).toContain('Agent budget exhausted')
      expect(text).toContain('This run cannot resume here')
      expect([...bench.node.querySelectorAll('button')].map(button => button.textContent)).not.toContain('Resume')
    }
    if (status === 'failed') expect(text).toContain('provider failed')
    if (status === 'cancelled') expect(text).not.toContain('Cancelled')
    expect(semanticDocument(bench.node)).toMatchSnapshot(`status-${status}`)
  })

  it('locks exact stale, budget-limited, and generic control error strings', async () => {
    const paused = run('paused')
    const stale = mountDashboard(source([paused]), liveOperations([paused], {
      control: vi.fn(async () => {
        throw new WorkflowRunsRemoteError('revision-conflict', STALE_CONTROL_ERROR, { run: run('running') })
      }),
    }))
    await settle()
    const staleDialog = stale.node.querySelector<HTMLElement>('[data-workflows-dashboard]')!
    staleDialog.focus()
    act(() => {
      staleDialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true }))
    })
    await settle()
    expect(semanticText(stale.node)).toContain(STALE_CONTROL_ERROR)
    expect(semanticDocument(stale.node)).toMatchSnapshot('stale-control-error')
    release(stale)

    const budgetRow = run('paused', 'paused-budget')
    const budget = mountDashboard(source([budgetRow]), liveOperations([budgetRow], {
      control: vi.fn(async () => {
        throw new WorkflowRunsRemoteError('action-unavailable', 'nope', { reason: 'budget-limited' })
      }),
    }))
    await settle()
    act(() => {
      [...budget.node.querySelectorAll('button')].find(button => button.textContent === 'Resume')!.click()
    })
    await settle()
    expect(semanticText(budget.node)).toContain('workflow "review-paused-budget" requires a higher agent_budget to resume')
    expect(semanticDocument(budget.node)).toMatchSnapshot('budget-limited-resume-error')
    release(budget)

    const live = run('running', 'generic')
    const generic = mountDashboard(source([live]), liveOperations([live], {
      control: vi.fn(async () => { throw new Error('boom') }),
    }))
    await settle()
    act(() => {
      [...generic.node.querySelectorAll('button')].find(button => button.textContent === 'Pause')!.click()
    })
    await settle()
    expect(semanticText(generic.node)).toContain(GENERIC_CONTROL_ERROR)
    expect(semanticDocument(generic.node)).toMatchSnapshot('generic-control-error')
  })

  it('distinguishes never-produced logs from a fully evicted retained window', async () => {
    const running = run('running')
    const emptyLogs = mountDashboard(source([running]), liveOperations([running], {
      logs: vi.fn(async () => ({ items: [], evicted: 0, total: 0, revision: 1 })),
    }))
    await settle()
    act(() => { emptyLogs.node.querySelector<HTMLButtonElement>('[data-workflow-output-tab="logs"]')!.click() })
    await settle()
    expect(semanticText(emptyLogs.node)).toContain('No log lines')
    expect(semanticText(emptyLogs.node)).not.toContain('No retained log lines')
    expect(semanticDocument(emptyLogs.node)).toMatchSnapshot('logs-never-produced')
    release(emptyLogs)

    const completed = run('completed')
    const evicted = mountDashboard(source([completed]), liveOperations([completed], {
      logs: vi.fn(async () => ({ items: [], evicted: 4, total: 0, revision: 1 })),
    }))
    await settle()
    act(() => { evicted.node.querySelector<HTMLButtonElement>('[data-workflow-output-tab="logs"]')!.click() })
    await settle()
    expect(semanticText(evicted.node)).toContain('No retained log lines')
    expect(semanticDocument(evicted.node)).toMatchSnapshot('logs-evicted')
  })

  it('snapshots completed result JSON-null and scratch retention disclosure', async () => {
    const completed = run('completed')
    const bench = mountDashboard(source([completed]))
    await settle()
    act(() => { bench.node.querySelector<HTMLButtonElement>('[data-workflow-output-tab="result"]')!.click() })
    await settle()
    expect(semanticText(bench.node)).toContain('"beta": null')
    expect(semanticDocument(bench.node)).toMatchSnapshot('result-json-null')
    act(() => { bench.node.querySelector<HTMLButtonElement>('[data-workflow-output-tab="artifacts"]')!.click() })
    await settle()
    expect(semanticText(bench.node)).toContain('report.md')
    expect(semanticDocument(bench.node)).toMatchSnapshot('artifacts-retained')
  })

  it('distinguishes phase omission from an empty phase and forces abnormal groups open', () => {
    const clean = renderToStaticMarkup(
      <WorkflowRunPanel
        node={panelNode('completed')}
        sessionId={SESSION}
        resolveAndOpenChild={async () => true}
        isChildAvailable={() => false}
      />,
    )
    expect(clean).toContain('aria-expanded="false"')
    expect(clean).toContain('Inspect · 2 members')
    expect(clean).not.toContain(UUID)
    expect((clean.match(/data-forced-open="true"/gu) ?? []).length).toBe(0)
    expect(semanticText(clean)).toMatchSnapshot('chat-completed-collapsed')

    const abnormal = renderToStaticMarkup(
      <WorkflowRunPanel
        node={panelNode('interrupted')}
        sessionId={SESSION}
        resolveAndOpenChild={async () => true}
      />,
    )
    expect((abnormal.match(/data-forced-open="true"/gu) ?? []).length).toBeGreaterThanOrEqual(2)
    expect(textOnly(abnormal)).toContain('Interrupted')
    expect(textOnly(abnormal)).toContain('Unphased')
    expect(textOnly(abnormal)).toContain('Empty phase name')
    expect(textOnly(abnormal)).toContain('Inspect · 1 member')
    expect(semanticText(abnormal)).toMatchSnapshot('chat-interrupted-forced-open')
  })

  it('opens a clean completed disclosure without exposing internal identifiers', async () => {
    const bench = mountElement(
      <WorkflowRunPanel
        node={panelNode('completed')}
        sessionId={SESSION}
        resolveAndOpenChild={async () => true}
        isChildAvailable={() => false}
      />,
    )
    const toggle = bench.node.querySelector<HTMLButtonElement>('[aria-expanded="false"]')
    expect(toggle).not.toBeNull()
    act(() => { toggle!.click() })
    await settle()
    expect(bench.node.querySelector('[aria-expanded="true"]')).not.toBeNull()
    expect(semanticText(bench.node)).toContain('Unphased')
    expect(semanticText(bench.node)).toContain('Empty phase name')
    expect(semanticText(bench.node)).not.toContain(UUID)
    expect(semanticDocument(bench.node)).toMatchSnapshot('chat-completed-open')
  })

  it.each([
    ['text', { state: 'available', content: { kind: 'value', value: 'hello' }, totalBytes: 7, truncated: false }],
    ['json-null', { state: 'available', content: { kind: 'value', value: null }, totalBytes: 4, truncated: false }],
    ['evicted', { state: 'evicted' }],
    ['truncated', { state: 'available', content: { kind: 'preview', text: '{"x":' }, totalBytes: 20, truncated: true }],
    ['pending', { state: 'pending' }],
    ['unavailable', { state: 'not-produced' }],
  ] as const)('renders the %s member outcome state', (_label, value) => {
    const detail: WorkflowRunMemberDetail = {
      member: member(1, 'completed', value.state),
      childSessionId: 'child-1',
      outcome: value as WorkflowRunValueView,
    }
    const markup = renderToStaticMarkup(
      <WorkflowMemberInspector
        member={detail.member}
        detail={detail}
        outcome={detail.outcome}
        onClose={() => undefined}
      />,
    )
    const text = textOnly(markup)
    expect(text).not.toContain(UUID)
    if (_label === 'text') expect(text).toContain('Text outcome')
    if (_label === 'json-null') {
      expect(text).toContain('JSON outcome')
      expect(text).toContain('null')
    }
    if (_label === 'evicted') expect(text).toContain('Outcome evicted')
    if (_label === 'truncated') expect(text).toContain('Truncated outcome')
    if (_label === 'pending') expect(text).toContain('Pending')
    if (_label === 'unavailable') expect(text).toContain('No outcome produced')
    expect(semanticText(markup)).toMatchSnapshot(`inspector-${_label}`)
  })

  it('snapshots request-error and unavailable-transcript inspector states', async () => {
    const errorMarkup = renderToStaticMarkup(
      <WorkflowMemberInspector
        member={member(1, 'completed', 'available')}
        error="wire"
        onRetry={() => undefined}
      />,
    )
    expect(textOnly(errorMarkup)).toContain('Unable to load member outcome')
    expect(textOnly(errorMarkup)).toContain('Retry')
    expect(semanticText(errorMarkup)).toMatchSnapshot('inspector-request-error')

    const unavailable = mountElement(
      <WorkflowMemberInspector
        member={member(1, 'completed', 'available')}
        detail={{
          member: member(1, 'completed', 'available'),
          childSessionId: 'child-1',
          outcome: { state: 'available', content: { kind: 'value', value: null }, totalBytes: 4, truncated: false },
        }}
        onOpenChild={async () => false}
      />,
    )
    expect(semanticText(unavailable.node)).toContain('JSON outcome')
    await act(async () => {
      [...unavailable.node.querySelectorAll('button')].find(button => button.textContent === 'Open child session')!.click()
      await Promise.resolve()
    })
    expect(semanticText(unavailable.node)).toContain('Child transcript unavailable')
    expect(semanticText(unavailable.node)).toContain('JSON outcome')
    expect(semanticText(unavailable.node)).toContain('null')
    expect(semanticDocument(unavailable.node)).toMatchSnapshot('inspector-unavailable-transcript')
  })

  it('keeps the authoritative ordering and rejects stale artifact chunks', () => {
    const rows = orderWorkflowRuns([
      run('completed', 'old', { startedAt: STARTED - 20_000, settledAt: NOW - 10_000 }),
      run('running', 'new', { startedAt: STARTED }),
      run('failed', 'middle', { startedAt: STARTED - 10_000, settledAt: NOW - 1_000 }),
    ])
    expect(rows.map(row => row.status)).toEqual(['running', 'failed', 'completed'])
    const first = {
      artifact: { name: 'report.md', bytes: 8 }, text: 'hello', offsetBytes: 0,
      returnedBytes: 5, totalBytes: 8, revision: 2,
    }
    expect(appendArtifactChunk(first, { ...first, text: '!!!', offsetBytes: 5, returnedBytes: 3 })).toMatchObject({ text: 'hello!!!', returnedBytes: 8 })
    expect(appendArtifactChunk(first, { ...first, revision: 3, offsetBytes: 5, returnedBytes: 3 })).toBeUndefined()
    expect(appendArtifactChunk(first, { ...first, offsetBytes: 4, returnedBytes: 4 })).toBeUndefined()
  })
})
