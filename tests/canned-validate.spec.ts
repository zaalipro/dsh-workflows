import { describe, expect, it } from 'vitest'

import { cannedStockValidate, repairObjectLiteralSemicolons } from '../src/supervisor/canned-validate.js'

describe('cannedStockValidate', () => {
  it('returns a completed JSON value without launching children', async () => {
    await expect(cannedStockValidate('complete({ ok: true, n: 1 })')).resolves.toEqual({
      ok: true, status: 'completed', value: { ok: true, n: 1 },
    })
  })

  it('maps pause and await_user to would-pause', async () => {
    await expect(cannedStockValidate('await pause("verification", "need target")')).resolves.toEqual({
      ok: true, status: 'would-pause', value: 'need target',
    })
    await expect(cannedStockValidate('await await_user("user", "continue")')).resolves.toEqual({
      ok: true, status: 'would-pause', value: 'continue',
    })
  })

  it('parses with a semicolon-in-object diagnostic', async () => {
    const result = await cannedStockValidate('const x = { a: 1; b: 2 }; complete(x)')
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected parse failure')
    expect(result.error).toMatch(/Unexpected token ';'/u)
  })

  it('rewrites object-field semicolons and leaves statement separators', () => {
    expect(repairObjectLiteralSemicolons('complete({ a: 1; b: 2 })')).toBe('complete({ a: 1, b: 2 })')
    expect(repairObjectLiteralSemicolons('{ "type": "object"; "required": ["x"] }')).toBe(
      '{ "type": "object", "required": ["x"] }',
    )
    expect(repairObjectLiteralSemicolons('for (let i = 0; i < 3; i++) complete(i)')).toBe(
      'for (let i = 0; i < 3; i++) complete(i)',
    )
  })

  it('stubs parallel job maps, pipeline stages, and logs', async () => {
    const result = await cannedStockValidate(`
      phase("Review");
      log("go");
      const rows = await parallel([{ prompt: "hunt", label: "a" }]);
      const piped = await pipeline([1], async (prev) => prev);
      await write_scratch_file("note.md", "ok");
      const note = await read_scratch_file("note.md");
      complete({ rows, piped, remaining: budget().remaining, note });
    `)
    expect(result).toEqual({
      ok: true,
      status: 'completed',
      value: { rows: [null], piped: [1], remaining: 128, note: '' },
    })
  })

  it('turns a failed pipeline stage into null and forwards a non-array parallel', async () => {
    const result = await cannedStockValidate(`
      const piped = await pipeline([1], async () => { throw new Error("stage") });
      const forwarded = await parallel("nope");
      complete({ piped, forwarded });
    `)
    expect(result).toEqual({
      ok: true, status: 'completed', value: { piped: [null], forwarded: 'nope' },
    })
  })

  it('times out a non-settling script', async () => {
    const result = await cannedStockValidate('await new Promise(() => {})', {}, { timeoutMs: 20 })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected timeout')
    expect(result.error).toMatch(/timed out/u)
  })

  it('returns null when the script has no result', async () => {
    await expect(cannedStockValidate('phase("none")')).resolves.toEqual({
      ok: true, status: 'completed', value: null,
    })
  })

  it('stringifies a cyclic complete() value instead of throwing', async () => {
    await expect(cannedStockValidate('const o = {}; o.self = o; complete(o)')).resolves.toEqual({
      ok: true, status: 'completed', value: '[object Object]',
    })
  })

  it('covers default options, null args, non-array pipeline, and thrown slots', async () => {
    await expect(cannedStockValidate('complete(args)', null)).resolves.toEqual({
      ok: true, status: 'completed', value: {},
    })
    await expect(cannedStockValidate(`
      const piped = await pipeline("nope");
      const rows = await parallel([async () => { throw new Error("slot") }]);
      await pause();
    `)).resolves.toEqual({
      ok: true, status: 'would-pause', value: '',
    })
    await expect(cannedStockValidate('throw 42')).resolves.toMatchObject({
      ok: false, status: 'error',
    })
  })
})
