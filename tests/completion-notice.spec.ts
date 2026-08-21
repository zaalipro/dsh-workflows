import { describe, expect, it } from 'vitest'

import {
  renderWorkflowCompletionNotice,
  WorkflowCompletionNotifier,
} from '../src/supervisor/completion-notice.js'

function noticeText(message: any): string {
  return message?.content?.[0]?.text ?? ''
}

describe('renderWorkflowCompletionNotice', () => {
  it('renders every terminal clause, JSON null, and the dashboard footer', () => {
    expect(renderWorkflowCompletionNotice({
      runId: 'ignored',
      displayName: 'audit',
      status: 'completed',
      result: { state: 'available', content: { kind: 'value', value: null }, totalBytes: 4, truncated: false },
    })).toContain('workflow "audit" completed.\nResult:\nnull')

    expect(renderWorkflowCompletionNotice({
      runId: 'ignored',
      displayName: 'audit',
      status: 'completed',
    })).toContain('No workflow result was retained.')

    expect(renderWorkflowCompletionNotice({
      runId: 'ignored',
      displayName: 'audit',
      status: 'failed',
      error: 'boom',
    })).toContain('workflow "audit" failed.\nReason: boom')

    expect(renderWorkflowCompletionNotice({
      runId: 'ignored',
      displayName: 'audit',
      status: 'cancelled',
    })).toContain('workflow "audit" was stopped.')

    expect(renderWorkflowCompletionNotice({
      runId: 'ignored',
      displayName: 'audit',
      status: 'interrupted',
      report: 'full report',
    })).toBe([
      'workflow "audit" was interrupted.',
      'Scratch report:',
      'full report',
      'The complete report is retained as scratch/report.md.',
      'Open /workflows to inspect the run.',
    ].join('\n'))
  })

  it('truncates oversized copy at a UTF-8 boundary while keeping the footer', () => {
    const text = renderWorkflowCompletionNotice({
      runId: 'ignored',
      displayName: '😀-audit',
      status: 'completed',
      result: { state: 'available', content: { kind: 'value', value: '界'.repeat(400) }, totalBytes: 1_200, truncated: false },
    }, 180)
    expect(new TextEncoder().encode(text).byteLength).toBeLessThanOrEqual(180)
    expect(text).not.toContain('\uFFFD')
    expect(text).toContain('[notice truncated]')
    expect(text).toContain('Open /workflows to inspect the run.')
  })

  it('rejects a non-positive byte budget', () => {
    expect(() => renderWorkflowCompletionNotice({
      runId: 'ignored', displayName: 'audit', status: 'completed',
    }, 0)).toThrow(/positive safe integer/u)
  })
})

describe('WorkflowCompletionNotifier', () => {
  it('delivers one owner wake and ignores a duplicate run id', async () => {
    const followup: any[] = []
    const parent = {
      followup: async (message: unknown) => { followup.push(message) },
      inject: async () => { throw new Error('must not inject') },
    }
    const notifier = new WorkflowCompletionNotifier({ on: () => () => undefined, logger: { warn: () => undefined } }, { maxBytes: 1_000, maxConsecutiveWakes: 3 })
    await expect(notifier.notify({
      runId: 'run-1', displayName: 'audit', status: 'completed', parent,
      result: { state: 'available', content: { kind: 'value', value: { answer: 42 } }, totalBytes: 16, truncated: false },
    })).resolves.toBe(true)
    await expect(notifier.notify({
      runId: 'run-1', displayName: 'audit', status: 'completed', parent,
    })).resolves.toBe(false)
    expect(followup).toHaveLength(1)
    expect(noticeText(followup[0])).toContain('workflow "audit" completed.')
    expect(noticeText(followup[0])).not.toContain('run-1')
    await notifier.dispose()
  })
})
