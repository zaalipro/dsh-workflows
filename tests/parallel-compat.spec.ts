import { describe, expect, it } from 'vitest'

import {
  COMPLETE_PRELUDE,
  PARALLEL_JOB_MAP_PRELUDE,
  SCHEMA_STRIP_PRELUDE,
  STOCK_RESULT_ENVELOPE,
  STOCK_SCRIPT_MARKER,
  scriptWithJobMapParallel,
  stockBudgetScratchPrelude,
  unwrapStockCompatibilityResult,
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
  delete (globalThis as Record<string, unknown>).budget
  delete (globalThis as Record<string, unknown>).write_scratch_file
  delete (globalThis as Record<string, unknown>).read_scratch_file
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
    expect(once).toContain(stockBudgetScratchPrelude())
    expect(once).toContain('return 1')
    expect(scriptWithJobMapParallel(once)).toBe(once)
  })

  it('provides an exact stock budget hook at the agent-call boundary', async () => {
    const states = await runWrapped(`
      const before = budget();
      const pending = agent('one');
      const during = budget();
      await pending;
      return { before, during, after: budget() };
    `, { agent: async () => 'ok' })
    expect(states).toEqual({
      before: { total: 128, spent: 0, reserved: 0, remaining: 128 },
      during: { total: 128, spent: 1, reserved: 0, remaining: 127 },
      after: { total: 128, spent: 1, reserved: 0, remaining: 127 },
    })
  })

  it('uses the selected agent budget in stock scripts', async () => {
    delete (globalThis as Record<string, unknown>).budget
    delete (globalThis as Record<string, unknown>).write_scratch_file
    delete (globalThis as Record<string, unknown>).read_scratch_file
    const body = scriptWithJobMapParallel('return budget()', { agentBudget: 7 })
    const fn = new Function('agent', 'parallel', 'pipeline', 'phase', 'log', 'args', `return (async () => { ${body} })()`)
    await expect(fn(async () => null, async () => [], async () => [], () => {}, () => {}, {}))
      .resolves.toEqual({ total: 7, spent: 0, reserved: 0, remaining: 7 })
  })

  it('delegates to native budget and scratch hooks when the evaluator supplies them', async () => {
    const nativeFiles = new Map<string, string>()
    ;(globalThis as Record<string, unknown>).budget = () => ({ total: 9, spent: 4, reserved: 0, remaining: 5 })
    ;(globalThis as Record<string, unknown>).write_scratch_file = async (name: string, content: string) => { nativeFiles.set(name, content) }
    ;(globalThis as Record<string, unknown>).read_scratch_file = async (name: string) => nativeFiles.get(name)
    try {
      const body = scriptWithJobMapParallel("await write_scratch_file('native.txt', 'native'); return { budget: budget(), text: await read_scratch_file('native.txt') }")
      const fn = new Function('agent', 'parallel', 'pipeline', 'phase', 'log', 'args', `return (async () => { ${body} })()`)
      const result = await fn(async () => null, async () => [], async () => [], () => {}, () => {}, {})
      expect(result).toEqual({ budget: { total: 9, spent: 4, reserved: 0, remaining: 5 }, text: 'native' })
      expect(unwrapStockCompatibilityResult(result)).toBeUndefined()
    } finally {
      delete (globalThis as Record<string, unknown>).budget
      delete (globalThis as Record<string, unknown>).write_scratch_file
      delete (globalThis as Record<string, unknown>).read_scratch_file
    }
  })

  it('round-trips stock scratch through the private terminal envelope', async () => {
    const raw = await runWrapped(`
      const expectMissing = await read_scratch_file('missing.txt');
      await write_scratch_file('report.md', 'hello 🌍');
      return { report: await read_scratch_file('report.md'), missing: expectMissing ?? null };
    `)
    expect((raw as Record<string, unknown>)[STOCK_RESULT_ENVELOPE]).toBe(true)
    expect(unwrapStockCompatibilityResult(raw)).toEqual({
      value: { report: 'hello 🌍', missing: null },
      scratch: { 'report.md': 'hello 🌍' },
    })
  })

  it('enforces stock scratch names and limits and rejects malformed envelopes', async () => {
    await expect(runWrapped("await write_scratch_file('../escape', 'x')")).rejects.toThrow('single component')
    const body = scriptWithJobMapParallel("await write_scratch_file('a', 'éé'); return true", {
      scratchMaxFileBytes: 3,
    })
    delete (globalThis as Record<string, unknown>).budget
    delete (globalThis as Record<string, unknown>).write_scratch_file
    delete (globalThis as Record<string, unknown>).read_scratch_file
    const fn = new Function('agent', 'parallel', 'pipeline', 'phase', 'log', 'args', `return (async () => { ${body} })()`)
    await expect(fn(async () => null, async () => [], async () => [], () => {}, () => {}, {}))
      .rejects.toThrow('file limit exceeded')
    expect(unwrapStockCompatibilityResult(null)).toBeUndefined()
    expect(unwrapStockCompatibilityResult({ [STOCK_RESULT_ENVELOPE]: true, scratch: { bad: 1 } })).toBeUndefined()
    expect(unwrapStockCompatibilityResult({ [STOCK_RESULT_ENVELOPE]: true, scratch: { '../bad': 'x' } })).toBeUndefined()
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
