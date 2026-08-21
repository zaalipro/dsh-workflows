import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import {
  workflowPhaseKey,
  workflowRunDefinition,
  type WorkflowRunChatData,
  type WorkflowState,
} from '../src/client/workflow-definition.js'
import {
  advanceWorkflowDisclosure,
  initialWorkflowDisclosure,
  WorkflowRunPanel,
} from '../src/client/WorkflowRunPanel.js'
import { WorkflowRunChatSlot } from '../src/client/slot-components.js'
import { workflowChatLabelsFromLocale, workflowLocales } from '../src/client/locales.js'

function event(seq: number, type: string, data: Record<string, unknown>) {
  return { seq, time: seq, type, data } as any
}

function fold(events: readonly ReturnType<typeof event>[], location: { kind: string; closed?: boolean } = { kind: 'turn', closed: true }) {
  let state: WorkflowState | undefined
  let start: { event: any; location: typeof location } | undefined
  for (const value of events) {
    const matched = workflowRunDefinition.match(value)
    if (matched === null) continue
    const match = { event: value, ...matched }
    if (matched.role === 'start') {
      state = workflowRunDefinition.start({} as any, match)
      start = { event: value, location }
    } else if (state !== undefined) {
      state = workflowRunDefinition.update({ state } as any, match)
    }
  }
  return workflowRunDefinition.buildViewNode({
    key: 'workflow-run:run-1',
    id: 'run-1',
    state,
    start,
  } as any)
}

function panelNode(data: WorkflowRunChatData) {
  return {
    key: 'workflow-run:run-1',
    kind: 'workflow-run' as const,
    id: 'run-1',
    target: 'chat' as const,
    anchorSeq: 1,
    location: { kind: 'session' as const },
    visibility: 'visible' as const,
    data,
  }
}

describe('durable Chat fold (RC12)', () => {
  it('groups exact phase identities and maps leaked interruption to cancelled', () => {
    const node = fold([
      event(1, 'turn/start', { turn: 1 }),
      event(2, 'tool-workflow/run-start', { runId: 'run-1', name: 'audit' }),
      event(3, 'tool-workflow/agent-start', { runId: 'run-1', seq: 1, label: 'first', phase: '', childId: 'child-1' }),
      event(4, 'tool-workflow/agent-start', { runId: 'run-1', seq: 2, label: 'second', childId: 'child-2' }),
      event(5, 'tool-workflow/agent-end', { runId: 'run-1', seq: 1, outcome: 'completed' }),
      event(6, 'tool-workflow/agent-end', { runId: 'run-1', seq: 2, outcome: 'failed' }),
      event(7, 'tool-workflow/run-end', { runId: 'run-1', stopReason: 'error' }),
    ])
    expect(node?.data).toEqual({
      name: 'audit',
      status: 'failed',
      phases: [
        {
          key: workflowPhaseKey(''),
          phase: '',
          members: [{ seq: 1, label: 'first', childId: 'child-1', status: 'completed' }],
        },
        {
          key: workflowPhaseKey(null),
          phase: null,
          members: [{ seq: 2, label: 'second', childId: 'child-2', status: 'failed' }],
        },
      ],
    })
    expect(fold([
      event(1, 'tool-workflow/run-start', { runId: 'run-1', name: 'interrupted' }),
      event(2, 'tool-workflow/run-end', { runId: 'run-1', stopReason: 'interrupted' }),
    ])?.data).toEqual({ name: 'interrupted', status: 'cancelled', phases: [] })
    expect(fold([
      event(1, 'tool-workflow/run-start', { runId: 'run-1', name: 'leaked' }),
      event(2, 'tool-workflow/agent-start', { runId: 'run-1', seq: 1, label: 'one', childId: 'child-1' }),
      event(3, 'tool-workflow/agent-end', { runId: 'run-1', seq: 1, outcome: 'interrupted' }),
    ])?.data).toMatchObject({
      phases: [{ members: [{ status: 'cancelled' }] }],
    })
  })

  it('keeps a detached run live after its launching location closes', () => {
    const node = fold([
      event(1, 'tool-workflow/run-start', { runId: 'run-1', name: 'audit' }),
      event(2, 'tool-workflow/agent-start', { runId: 'run-1', seq: 1, label: 'worker', childId: 'child-1' }),
      event(3, 'step/end', { turn: 1, step: 1 }),
      event(4, 'turn/end', { turn: 1 }),
    ], { kind: 'turn', closed: true })
    expect(node?.data).toMatchObject({
      status: 'running',
      phases: [{ members: [{ status: 'running' }] }],
    })
    expect(workflowRunDefinition.buildViewNode({ start: undefined, state: { name: 'x', members: [] } } as any)).toBeNull()
    expect(workflowRunDefinition.match(event(1, 'other', {}))).toBeNull()
    expect(() => workflowRunDefinition.start({} as any, { event: event(1, 'tool-workflow/agent-end', { runId: 'x' }) } as any))
      .toThrow(/run-start/u)
    expect(workflowRunDefinition.update({ state: { name: 'x', members: [] } } as any, {
      event: event(2, 'tool-workflow/unknown', { runId: 'x' }),
    } as any)).toEqual({ name: 'x', members: [] })
  })

  it('produces the same data through append order and ignores an update-only tail', () => {
    const events = [
      event(1, 'tool-workflow/run-start', { runId: 'run-1', name: 'audit' }),
      event(2, 'tool-workflow/agent-start', { runId: 'run-1', seq: 1, label: 'one', childId: 'child-1' }),
      event(3, 'tool-workflow/agent-end', { runId: 'run-1', seq: 1, outcome: 'completed' }),
      event(4, 'tool-workflow/run-end', { runId: 'run-1', stopReason: 'completed' }),
    ]
    expect(fold(events)?.data.status).toBe('completed')
    expect(fold(events.slice(1))).toBeNull()
    expect(fold([
      event(1, 'tool-workflow/run-start', { runId: 'empty', name: 'empty' }),
      event(2, 'tool-workflow/run-end', { runId: 'empty', stopReason: 'completed' }),
    ])?.data).toEqual({ name: 'empty', status: 'completed', phases: [] })
  })

  it('auto-folds a clean completion once and keeps bilingual Chat labels', () => {
    expect(initialWorkflowDisclosure({ mode: 'clean', count: 1 })).toEqual({ mode: 'clean', count: 1, open: false })
    expect(advanceWorkflowDisclosure({ mode: 'running', count: 1, open: true }, { mode: 'clean', count: 1 }))
      .toEqual({ mode: 'clean', count: 1, open: false })
    expect(advanceWorkflowDisclosure({ mode: 'clean', count: 1, open: true }, { mode: 'clean', count: 2 }))
      .toEqual({ mode: 'clean', count: 2, open: false })
    expect(advanceWorkflowDisclosure({ mode: 'clean', count: 1, open: true }, { mode: 'clean', count: 1 }))
      .toEqual({ mode: 'clean', count: 1, open: true })
    expect(advanceWorkflowDisclosure({ mode: 'clean', count: 1, open: false }, { mode: 'abnormal', count: 1 }))
      .toEqual({ mode: 'abnormal', count: 1, open: true })
    const zh = workflowChatLabelsFromLocale(workflowLocales.zh)
    expect(zh.unphased).toBe('未分阶段')
    expect(zh.inspect(1)).toBe('检查 · 1 个成员')
    expect(zh.inspect(2)).toBe('检查 · 2 个成员')
    expect(zh.status.cancelled).toBe('已取消')
  })
})

describe('durable Chat panel (RC13)', () => {
  it('keeps members non-interactive until catalog proof and uses English inspect copy', () => {
    const markup = renderToStaticMarkup(
      <WorkflowRunPanel
        node={panelNode({
          name: 'audit',
          status: 'completed',
          phases: [{
            key: workflowPhaseKey(null),
            phase: null,
            members: [{ seq: 1, label: 'worker', childId: 'child-1', status: 'completed' }],
          }],
        })}
        sessionId="parent"
        resolveAndOpenChild={async () => true}
      />,
    )
    expect(markup).toContain('Inspect · 1 member')
    expect(markup).toContain('aria-expanded="false"')
    expect(markup).not.toContain('Unphased')
    expect(markup).not.toContain('Open worker')
    expect(markup).not.toContain('run-1')
  })

  it('forces abnormal layers open and underlines catalog-proven members', () => {
    const markup = renderToStaticMarkup(
      <WorkflowRunPanel
        node={panelNode({
          name: 'audit',
          status: 'failed',
          phases: [{
            key: workflowPhaseKey('Review'),
            phase: 'Review',
            members: [
              { seq: 1, label: '', childId: 'child-1', status: 'failed' },
              { seq: 2, label: 'two', childId: 'child-2', status: 'cancelled' },
            ],
          }],
        })}
        sessionId="parent"
        resolveAndOpenChild={async () => true}
        isChildAvailable={childId => childId === 'child-2'}
        labels={workflowChatLabelsFromLocale(workflowLocales.zh)}
      />,
    )
    expect(markup).toContain('data-forced-open="true"')
    expect(markup).toContain('空成员名')
    expect(markup).toContain('打开 two')
  })

  it('subscribes useSessions and defaults child availability to false', () => {
    let seen = false
    const markup = renderToStaticMarkup(
      <WorkflowRunChatSlot
        node={panelNode({ name: 'audit', status: 'running', phases: [] })}
        sessionId="parent"
        operations={{ resolveAndOpenChild: async () => true }}
        useSessions={(selector: (value: { current?: string }) => unknown) => {
          seen = true
          return selector({ current: 'parent' })
        }}
      />,
    )
    expect(seen).toBe(true)
    expect(markup).toContain('No members started')
    expect(markup).toContain('data-forced-open="true"')
  })
})
