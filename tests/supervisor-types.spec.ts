import { describe, expect, it } from 'vitest'

import {
  VALIDATION_NOTE,
  type SupervisedWorkflowMemberLifecycleInfo,
  type SupervisedWorkflowResultInfo,
  type SupervisedWorkflowRunInfo,
  type SupervisedWorkflowStopReason,
  type WorkflowGateRequest,
  type WorkflowLaunched,
  type WorkflowRunAction,
  type WorkflowRunChange,
  type WorkflowRunControlRequest,
  type WorkflowRunHead,
  type WorkflowRunMemberHead,
  type WorkflowRunOutcomeState,
  type WorkflowRunRecordingSnapshot,
  type WorkflowRunStatus,
  type WorkflowRunValueView,
  type WorkflowSaveScope,
  type WorkflowValidation,
} from '../src/supervisor/index.js'

const STATUSES = [
  'running', 'pausing', 'stopping', 'needs-input', 'paused',
  'budget-limited', 'completed', 'failed', 'cancelled', 'interrupted',
] as const satisfies readonly WorkflowRunStatus[]

const ACTIONS = ['pause', 'resume', 'stop', 'save'] as const satisfies readonly WorkflowRunAction[]
const STOP_REASONS = ['completed', 'cancelled', 'error', 'interrupted'] as const satisfies readonly SupervisedWorkflowStopReason[]
const OUTCOMES = ['pending', 'available', 'not-produced', 'evicted'] as const satisfies readonly WorkflowRunOutcomeState[]
const SAVE_SCOPES = ['project', 'user'] as const satisfies readonly WorkflowSaveScope[]

const runId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' as SupervisedWorkflowRunInfo['id']

function head(overrides: Partial<WorkflowRunHead> = {}): WorkflowRunHead {
  return {
    runId,
    displayName: 'review-changes',
    name: 'review-changes',
    description: 'Review the selected range',
    status: 'running',
    budget: { total: 8, spent: 1, remaining: 7 },
    memberCounts: { total: 1, running: 1, completed: 0, failed: 0, cancelled: 0 },
    startedAt: 10,
    allowedActions: ['pause', 'stop', 'save'],
    revision: 1,
    detailRevision: 1,
    membersRevision: 1,
    logsRevision: 0,
    resultRevision: 0,
    artifactsRevision: 0,
    ...overrides,
  }
}

function humanFields(value: object): string[] {
  return Object.entries(value).flatMap(([key, field]) => {
    if (key === 'runId' || key === 'id' || key === 'memberId' || key === 'gateId' || key === 'childSessionId') return []
    if (typeof field === 'string') return [field]
    if (field && typeof field === 'object' && !Array.isArray(field)) return humanFields(field)
    return []
  })
}

describe('supervisor vocabulary (SH1)', () => {
  it('closes the status, action, stop-reason, outcome, and save-scope unions', () => {
    expect(STATUSES).toEqual([
      'running', 'pausing', 'stopping', 'needs-input', 'paused',
      'budget-limited', 'completed', 'failed', 'cancelled', 'interrupted',
    ])
    expect(ACTIONS).toEqual(['pause', 'resume', 'stop', 'save'])
    expect(STOP_REASONS).toEqual(['completed', 'cancelled', 'error', 'interrupted'])
    expect(OUTCOMES).toEqual(['pending', 'available', 'not-produced', 'evicted'])
    expect(SAVE_SCOPES).toEqual(['project', 'user'])
  })

  it('round-trips runtime JSON for every closed discriminant including omitted vs empty phase', () => {
    const info: SupervisedWorkflowRunInfo = { id: runId, displayName: 'review-changes', name: 'review-changes' }
    const omitted: WorkflowRunMemberHead = {
      memberId: 'member-1' as WorkflowRunMemberHead['memberId'],
      seq: 1,
      label: 'Inspect',
      status: 'running',
      outcome: 'pending',
      childSessionId: 'child-1',
    }
    const emptyPhase: WorkflowRunMemberHead = { ...omitted, seq: 2, phase: '' }
    const pending: WorkflowRunValueView = { state: 'pending' }
    const absent: WorkflowRunValueView = { state: 'not-produced' }
    const evicted: WorkflowRunValueView = { state: 'evicted' }
    const jsonNull: WorkflowRunValueView = {
      state: 'available', content: { kind: 'value', value: null }, totalBytes: 4, truncated: false,
    }
    const preview: WorkflowRunValueView = {
      state: 'available', content: { kind: 'preview', text: '{' }, totalBytes: 40, truncated: true,
    }
    const launched: WorkflowLaunched = { status: 'started', displayName: 'review-changes', runId, scriptPath: '/runs/script.js' }
    const completed: WorkflowValidation = { ok: true, status: 'completed', value: { ok: true }, note: VALIDATION_NOTE }
    const paused: WorkflowValidation = { ok: true, status: 'would-pause', value: 'would pause: need a target', note: VALIDATION_NOTE }
    const failed: WorkflowValidation = { ok: false, status: 'error', error: 'audit.js:1 SyntaxError' }
    const invalidate: WorkflowRunChange = { kind: 'invalidate', sessionId: 'session-1', revision: 4 }
    const invalidateAll: WorkflowRunChange = { kind: 'invalidate-all' }
    const control: WorkflowRunControlRequest = { runId, action: 'pause', expectedRevision: 4 }
    const snapshot: WorkflowRunRecordingSnapshot = {
      info,
      run: head(),
      members: [{
        memberId: omitted.memberId,
        seq: 1,
        label: 'Inspect',
        childSessionId: 'child-1',
        status: 'running',
      } satisfies SupervisedWorkflowMemberLifecycleInfo],
    }
    const result: SupervisedWorkflowResultInfo = { stopReason: 'completed', agentsStarted: 1 }
    const gate: WorkflowGateRequest = {
      info,
      executionId: 'execution-1',
      gateId: 'gate-1' as WorkflowGateRequest['gateId'],
      gate: { kind: 'user', message: 'Need a target', resumable: true },
      parent: null,
      signal: AbortSignal.abort(),
    }

    expect('phase' in omitted).toBe(false)
    expect(emptyPhase.phase).toBe('')
    expect(JSON.parse(JSON.stringify(omitted))).not.toHaveProperty('phase')
    expect(JSON.parse(JSON.stringify(emptyPhase)).phase).toBe('')
    expect(JSON.parse(JSON.stringify({
      pending, absent, evicted, jsonNull, preview, launched, completed, paused, failed,
      invalidate, invalidateAll, control, snapshot, result, gate: { ...gate, signal: undefined },
    }))).toMatchObject({
      pending: { state: 'pending' },
      absent: { state: 'not-produced' },
      evicted: { state: 'evicted' },
      jsonNull: { state: 'available', content: { kind: 'value', value: null }, truncated: false },
      preview: { state: 'available', content: { kind: 'preview' }, truncated: true },
      launched: { status: 'started', displayName: 'review-changes' },
      completed: { ok: true, status: 'completed', note: VALIDATION_NOTE },
      paused: { ok: true, status: 'would-pause', value: 'would pause: need a target' },
      failed: { ok: false, status: 'error' },
      invalidate: { kind: 'invalidate', sessionId: 'session-1', revision: 4 },
      invalidateAll: { kind: 'invalidate-all' },
      control: { action: 'pause', expectedRevision: 4 },
    })
    expect(invalidate).not.toHaveProperty('head')
    expect(invalidateAll).not.toHaveProperty('head')
    expect(invalidate).not.toHaveProperty('epoch')
    expect(JSON.stringify(invalidate)).not.toContain('review-changes')
  })

  it('keeps human-facing labels independent of the logical run id', () => {
    const info: SupervisedWorkflowRunInfo = { id: runId, displayName: 'review-changes-2', name: 'review-changes' }
    const row = head({ displayName: 'review-changes-2', phase: 'Inspect' })
    for (const value of [info, row, { label: 'Inspect', message: 'Need a target', description: row.description }]) {
      expect(humanFields(value)).not.toContain(runId)
    }
    expect(row.displayName).not.toBe(row.runId)
    expect(row.name).not.toBe(row.runId)
    expect(row.description).not.toBe(row.runId)
    expect(VALIDATION_NOTE).toContain('canned agent results')
  })
})
