import { describe, expect, it } from 'vitest'

import {
  COMPLETE_PRELUDE,
  PARALLEL_JOB_MAP_PRELUDE,
  SCHEMA_STRIP_PRELUDE,
  STOCK_SCRIPT_MARKER,
  scriptWithJobMapParallel,
} from '../src/supervisor/parallel-compat.js'

async function runWrapped(
  script: string,
  extras: {
    agent?: (...args: unknown[]) => unknown
    parallel?: (items: unknown) => unknown
    pipeline?: (...args: unknown[]) => unknown
    phase?: (...args: unknown[]) => unknown
    log?: (...args: unknown[]) => unknown
    args?: unknown
  } = {},
): Promise<unknown> {
  const body = scriptWithJobMapParallel(script)
  const fn = new Function(
    'agent',
    'parallel',
    'pipeline',
    'phase',
    'log',
    'args',
    `return (async () => {\n${body}\n})()`,
  ) as (
    agent: unknown,
    parallel: unknown,
    pipeline: unknown,
    phase: unknown,
    log: unknown,
    args: unknown,
  ) => Promise<unknown>
  return fn(
    extras.agent ?? (async () => null),
    extras.parallel ?? (async (items: unknown) => {
      const thunks = items as Array<() => unknown>
      return Promise.all(thunks.map(item => item()))
    }),
    extras.pipeline ?? (async () => []),
    extras.phase ?? (() => undefined),
    extras.log ?? (() => undefined),
    extras.args,
  )
}

describe('scriptWithJobMapParallel', () => {
  it('prefixes once and is idempotent', () => {
    const once = scriptWithJobMapParallel('return 1')
    expect(once.startsWith(STOCK_SCRIPT_MARKER)).toBe(true)
    expect(once).toContain(SCHEMA_STRIP_PRELUDE)
    expect(once).toContain(PARALLEL_JOB_MAP_PRELUDE)
    expect(once).toContain(COMPLETE_PRELUDE)
    expect(once).toContain('return 1')
    expect(scriptWithJobMapParallel(once)).toBe(once)
  })

  it('returns a top-level return value', async () => {
    await expect(runWrapped('return { ok: true }')).resolves.toEqual({ ok: true })
  })

  it('settles complete() as a successful result and skips later statements', async () => {
    await expect(runWrapped('complete({ first: true }); throw new Error("unreachable")'))
      .resolves.toEqual({ first: true })
  })

  it('keeps the first complete() value', async () => {
    await expect(runWrapped('complete(1); complete(2)')).resolves.toBe(1)
    await expect(runWrapped('try { complete(1) } catch (e) { complete(2) }')).resolves.toBe(1)
  })

  it('makes later hooks throw the complete sentinel even if complete() is caught', async () => {
    const calls: string[] = []
    await expect(runWrapped(
      'try { complete("done") } catch (e) { await agent("late") }',
      { agent: async () => { calls.push('agent'); return 'nope' } },
    )).resolves.toBe('done')
    expect(calls).toEqual([])
  })

  it('omits undefined job-map option keys so stock JSON materialize succeeds', async () => {
    const result = await runWrapped(
      `return parallel([{ prompt: 'hunt', label: 'a' }]);`,
      { agent: (prompt, opts) => ({ prompt, opts }) },
    )
    expect(result).toEqual([{ prompt: 'hunt', opts: { label: 'a' } }])
    expect(Object.prototype.hasOwnProperty.call((result as any)[0].opts, 'provider')).toBe(false)
    expect(Object.prototype.hasOwnProperty.call((result as any)[0].opts, 'schema')).toBe(false)
  })

  it('turns job maps into thunks that call agent() and leaves functions alone', async () => {
    const result = await runWrapped(
      `return parallel([
        async function () { return 'thunk' },
        { prompt: 'hunt', label: 'a', phase: 'Hunt', schema: { type: 'object', maxItems: 3 }, provider: 'p', model: 'm' },
      ]);`,
      {
        agent: (prompt, opts) => ({ prompt, opts }),
        parallel: async (items) => {
          const thunks = items as Array<() => unknown>
          return Promise.all(thunks.map(item => item()))
        },
      },
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

  it('strips minItems/maxItems from nested agent schemas and leaves other opts', async () => {
    const seen: unknown[] = []
    await runWrapped(
      'return agent("review", { label: "r", schema: { type: "object", properties: { findings: { type: "array", minItems: 0, maxItems: 8, items: { type: "string" } } } } })',
      { agent: (prompt, opts) => { seen.push([prompt, opts]); return opts } },
    )
    expect(seen).toEqual([
      ['review', {
        label: 'r',
        schema: {
          type: 'object',
          properties: {
            findings: { type: 'array', items: { type: 'string' } },
          },
        },
      }],
    ])
  })

  it('forwards a non-array to the host parallel and leaves schema-less agent opts', async () => {
    await expect(runWrapped('return parallel("nope")', {
      parallel: async items => items,
    })).resolves.toBe('nope')
    await expect(runWrapped('return agent("x")', {
      agent: (prompt, opts) => ({ prompt, opts }),
    })).resolves.toEqual({ prompt: 'x', opts: undefined })
    await expect(runWrapped('return agent("x", { label: "only" })', {
      agent: (prompt, opts) => ({ prompt, opts }),
    })).resolves.toEqual({ prompt: 'x', opts: { label: 'only' } })
  })

  it('rejects a non-function non-job item', async () => {
    await expect(runWrapped('return parallel([{ nope: true }])')).rejects.toThrow(/item 0 is not a function or job map/u)
  })

  it('rethrows non-complete errors', async () => {
    await expect(runWrapped('throw new Error("boom")')).rejects.toThrow(/boom/u)
  })

  it('strips schema keywords inside oneOf arrays', async () => {
    const seen: unknown[] = []
    await runWrapped(
      'return agent("x", { schema: { oneOf: [{ type: "array", maxItems: 2, items: { type: "string" } }, { type: "null" }] } })',
      { agent: (_prompt, opts) => { seen.push(opts); return null } },
    )
    expect(seen).toEqual([
      { schema: { oneOf: [{ type: 'array', items: { type: 'string' } }, { type: 'null' }] } },
    ])
  })

  it('leaves a non-object schema node unchanged', async () => {
    const seen: unknown[] = []
    await runWrapped(
      'return agent("x", { schema: "not-an-object" })',
      { agent: (_prompt, opts) => { seen.push(opts); return null } },
    )
    expect(seen).toEqual([{ schema: 'not-an-object' }])
  })
})
