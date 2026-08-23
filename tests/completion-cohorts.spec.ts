import { describe, expect, it } from 'vitest'

import { WorkflowCompletionNotifier } from '../src/supervisor/completion-notice.js'

describe('workflow completion cohorts', () => {
  it('appends cohorts without using either owner inbox lane', async () => {
    const appended: any[][] = []
    const parent = {
      session: { append: (...args: any[]) => { appended.push(args) } },
      followup: async () => { throw new Error('must not wake') },
      inject: async () => { throw new Error('must not enqueue') },
    }
    const notifier = new WorkflowCompletionNotifier({
      on: () => () => undefined,
      logger: { warn: () => undefined },
    }, { maxBytes: 200, maxItems: 1, maxCohortBytes: 400 })

    for (let index = 0; index < 3; index += 1) {
      await notifier.notify({
        runId: `wake-${index}`, displayName: `audit-${index}`, status: 'completed', parent,
        result: { state: 'available', content: { kind: 'value', value: index }, totalBytes: 1, truncated: false },
      })
    }
    expect(appended).toHaveLength(3)

    await notifier.notify({
      runId: 'wake-3', displayName: 'audit-3', status: 'completed', parent,
      result: { state: 'available', content: { kind: 'value', value: 3 }, totalBytes: 1, truncated: false },
    })
    expect(appended).toHaveLength(4)
    expect(appended[3]?.[0]).toBe('user/message')
    expect(appended[3]?.[2]).toEqual({ surfaceOp: 'append' })
    expect(appended[3]?.[1]?.content?.[0]?.text).toContain('workflow "audit-3" completed.')
    await notifier.dispose()
  })

  it('joins a sealed cohort without dropping later notices', async () => {
    const appended: string[] = []
    const parent = {
      session: { append: (_type: string, message: any) => { appended.push(message.content[0].text) } },
    }
    const notifier = new WorkflowCompletionNotifier({
      on: () => () => undefined,
      logger: { warn: () => undefined },
    }, { maxBytes: 1_000, maxItems: 2, maxCohortBytes: 262_144 })

    await Promise.all([
      notifier.notify({ runId: 'a', displayName: 'alpha', status: 'completed', parent }),
      notifier.notify({ runId: 'b', displayName: 'beta', status: 'completed', parent }),
      notifier.notify({ runId: 'c', displayName: 'gamma', status: 'completed', parent }),
    ])
    expect(appended.join('\n\n')).toContain('workflow "alpha" completed.')
    expect(appended.join('\n\n')).toContain('workflow "beta" completed.')
    expect(appended.join('\n\n')).toContain('workflow "gamma" completed.')
    await notifier.dispose()
  })
})
