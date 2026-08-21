import { describe, expect, it } from 'vitest'

import { WorkflowCompletionNotifier } from '../src/supervisor/completion-notice.js'

function noticeText(message: any): string {
  return message?.content?.[0]?.text ?? ''
}

describe('workflow completion cohorts', () => {
  it('caps consecutive followup wakes and preserves the counter after a drain', async () => {
    const followup: any[] = []
    const inject: any[] = []
    const parent = {
      followup: async (message: unknown) => { followup.push(message) },
      inject: async (message: unknown) => { inject.push(message) },
    }
    const claimed: Array<(payload: any) => void> = []
    const notifier = new WorkflowCompletionNotifier({
      on: (name: string, listener: (payload: any) => void) => {
        if (name === 'agent/inbox/claimed') claimed.push(listener)
        return () => undefined
      },
      logger: { warn: () => undefined },
    }, { maxBytes: 200, maxItems: 1, maxCohortBytes: 400, maxConsecutiveWakes: 3 })

    for (let index = 0; index < 3; index += 1) {
      await notifier.notify({
        runId: `wake-${index}`, displayName: `audit-${index}`, status: 'completed', parent,
        result: { state: 'available', content: { kind: 'value', value: index }, totalBytes: 1, truncated: false },
      })
    }
    expect(followup).toHaveLength(3)
    expect(inject).toHaveLength(0)

    await notifier.notify({
      runId: 'wake-3', displayName: 'audit-3', status: 'completed', parent,
      result: { state: 'available', content: { kind: 'value', value: 3 }, totalBytes: 1, truncated: false },
    })
    expect(followup).toHaveLength(3)
    expect(inject).toHaveLength(1)
    expect(noticeText(inject[0])).toContain('workflow "audit-3" completed.')

    for (const listener of claimed) listener({ agent: parent, message: { source: { kind: 'user' } } })
    await notifier.notify({
      runId: 'wake-4', displayName: 'audit-4', status: 'completed', parent,
      result: { state: 'available', content: { kind: 'value', value: 4 }, totalBytes: 1, truncated: false },
    })
    expect(followup).toHaveLength(4)
    await notifier.dispose()
  })

  it('joins a sealed cohort without dropping later notices', async () => {
    const followup: string[] = []
    const parent = {
      followup: async (message: any) => { followup.push(message.content[0].text) },
      inject: async () => undefined,
    }
    const notifier = new WorkflowCompletionNotifier({
      on: () => () => undefined,
      logger: { warn: () => undefined },
    }, { maxBytes: 1_000, maxItems: 2, maxCohortBytes: 262_144, maxConsecutiveWakes: 3 })

    await Promise.all([
      notifier.notify({ runId: 'a', displayName: 'alpha', status: 'completed', parent }),
      notifier.notify({ runId: 'b', displayName: 'beta', status: 'completed', parent }),
      notifier.notify({ runId: 'c', displayName: 'gamma', status: 'completed', parent }),
    ])
    expect(followup.join('\n\n')).toContain('workflow "alpha" completed.')
    expect(followup.join('\n\n')).toContain('workflow "beta" completed.')
    expect(followup.join('\n\n')).toContain('workflow "gamma" completed.')
    await notifier.dispose()
  })
})
