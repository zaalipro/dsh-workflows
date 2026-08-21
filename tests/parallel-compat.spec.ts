import { describe, expect, it } from 'vitest'

import { PARALLEL_JOB_MAP_PRELUDE, scriptWithJobMapParallel } from '../src/supervisor/parallel-compat.js'

describe('scriptWithJobMapParallel', () => {
  it('prefixes once and is idempotent', () => {
    const once = scriptWithJobMapParallel('return 1')
    expect(once.startsWith(PARALLEL_JOB_MAP_PRELUDE)).toBe(true)
    expect(once.endsWith('return 1')).toBe(true)
    expect(scriptWithJobMapParallel(once)).toBe(once)
  })

  it('turns job maps into thunks that call agent() and leaves functions alone', async () => {
    const run = new Function('parallel', 'agent', `${PARALLEL_JOB_MAP_PRELUDE}
      return parallel([
        async function () { return 'thunk' },
        { prompt: 'hunt', label: 'a', phase: 'Hunt', schema: { type: 'object' }, provider: 'p', model: 'm' },
      ]);
    `) as (parallel: (items: unknown) => unknown, agent: (...args: unknown[]) => unknown) => Promise<unknown>
    const result = await run(
      async (items) => {
        const thunks = items as Array<() => unknown>
        return Promise.all(thunks.map(item => item()))
      },
      (prompt, opts) => ({ prompt, opts }),
    )
    expect(result).toEqual([
      'thunk',
      {
        prompt: 'hunt',
        opts: {
          label: 'a',
          phase: 'Hunt',
          schema: { type: 'object' },
          provider: 'p',
          model: 'm',
        },
      },
    ])
  })

  it('forwards a non-array to the host parallel', async () => {
    const run = new Function('parallel', `${PARALLEL_JOB_MAP_PRELUDE} return parallel("nope");`) as (
      parallel: (items: unknown) => unknown,
    ) => unknown
    await expect(run(async items => items)).resolves.toBe('nope')
  })

  it('rejects a non-function non-job item', async () => {
    const run = new Function('parallel', 'agent', `${PARALLEL_JOB_MAP_PRELUDE} return parallel([{ nope: true }]);`) as (
      parallel: (items: unknown) => unknown,
      agent: (...args: unknown[]) => unknown,
    ) => unknown
    expect(() => run(() => undefined, () => undefined)).toThrow(/item 0 is not a function or job map/u)
  })
})
