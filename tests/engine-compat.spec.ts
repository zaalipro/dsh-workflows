import { describe, expect, it } from 'vitest'

import {
  adaptEngineHandle,
  isCompleteEngineHandle,
  rejectPartialEngineHandle,
} from '../src/supervisor/engine-compat.js'

const COMPLETED = { value: { ok: true }, stopReason: 'completed' as const, agentsStarted: 2 }

function completeHandle(overrides: Record<string, unknown> = {}) {
  return {
    id: 'execution-h',
    result: Promise.resolve(COMPLETED),
    cancel() { /* h */ },
    resume() { /* h */ },
    release() { /* h */ },
    checkpoint: () => ({ journal: [], agentSpend: 0, agentSeq: 0 }),
    dispose: async () => undefined,
    ...overrides,
  }
}

describe('stock engine handle compatibility', () => {
  it('passes a complete H handle through unchanged', () => {
    const raw = completeHandle()
    expect(isCompleteEngineHandle(raw)).toBe(true)
    expect(adaptEngineHandle(raw)).toBe(raw)
  })

  it('rejects values that cannot run', () => {
    expect(adaptEngineHandle(undefined)).toBeUndefined()
    expect(adaptEngineHandle(null)).toBeUndefined()
    expect(adaptEngineHandle('run')).toBeUndefined()
    expect(adaptEngineHandle({})).toBeUndefined()
    expect(adaptEngineHandle({ result: Promise.resolve(COMPLETED), cancel() { /* x */ } })).toBeUndefined()
    expect(adaptEngineHandle({ result: Promise.resolve(COMPLETED), dispose: async () => undefined })).toBeUndefined()
    expect(adaptEngineHandle({ result: 1, cancel() { /* x */ }, dispose: async () => undefined })).toBeUndefined()
  })

  it('wraps a stock RC8 handle and synthesizes replay after dispose', async () => {
    let cancelled: string | undefined
    const resumed: string[] = []
    const raw = {
      result: Promise.resolve({ value: 'done', stopReason: 'completed', agentsStarted: 3 }),
      cancel(reason?: string) { cancelled = reason },
      resume() { resumed.push('resume') },
      dispose: async () => undefined,
    }
    const handle = adaptEngineHandle(raw)
    expect(handle).toBeDefined()
    expect(isCompleteEngineHandle(handle)).toBe(true)
    expect(handle!.id).toMatch(/^[0-9a-f]{32}$/u)
    expect(() => handle!.checkpoint()).toThrow(/checkpoint is not ready/u)
    handle!.release()
    handle!.resume()
    expect(resumed).toEqual(['resume'])
    handle!.cancel('stop')
    expect(cancelled).toBe('stop')
    const result = await handle!.result
    expect(result).toEqual({ value: 'done', stopReason: 'completed', agentsStarted: 3 })
    expect(() => handle!.checkpoint()).toThrow(/checkpoint is not ready/u)
    await handle!.dispose()
    expect(handle!.checkpoint()).toEqual({ journal: [], agentSpend: 3, agentSeq: 3 })
  })

  it('keeps a provided id and optional release/resume/checkpoint on a partial handle', async () => {
    const calls: string[] = []
    const handle = adaptEngineHandle({
      id: 'execution-stock',
      result: Promise.resolve({
        value: null, stopReason: 'cancelled', error: 'stopped', errorCode: 'CANCELLED', agentsStarted: 0,
      }),
      cancel() { calls.push('cancel') },
      release() { calls.push('release') },
      checkpoint: () => ({ journal: [{ callId: [1], fingerprint: 'a'.repeat(64), kind: 'phase' }], agentSpend: 1, agentSeq: 1 }),
      dispose: async () => { calls.push('dispose') },
    })
    expect(handle?.id).toBe('execution-stock')
    handle!.release()
    handle!.resume()
    await handle!.dispose()
    expect(calls).toEqual(['release', 'dispose'])
    expect(handle!.checkpoint()).toEqual({
      journal: [{ callId: [1], fingerprint: 'a'.repeat(64), kind: 'phase' }],
      agentSpend: 1,
      agentSeq: 1,
    })
    expect(await handle!.result).toMatchObject({ stopReason: 'cancelled', error: 'stopped', errorCode: 'CANCELLED', agentsStarted: 0 })
  })

  it('normalizes malformed settlement payloads', async () => {
    const wrapped = adaptEngineHandle({
      id: 'x',
      result: Promise.resolve('bare'),
      cancel() { /* x */ },
      dispose: async () => undefined,
    })
    expect(await wrapped!.result).toEqual({ value: 'bare', stopReason: 'error', agentsStarted: 0 })
    const numeric = adaptEngineHandle({
      id: 'y',
      result: Promise.resolve({ value: 1, stopReason: 'completed', agentsStarted: 1.9 }),
      cancel() { /* x */ },
      dispose: async () => undefined,
    })
    expect((await numeric!.result).agentsStarted).toBe(1)
    const invalidSpend = adaptEngineHandle({
      id: '',
      result: Promise.resolve({ stopReason: 'nope', agentsStarted: Number.POSITIVE_INFINITY }),
      cancel() { /* x */ },
      dispose: async () => undefined,
    })
    expect(invalidSpend!.id).toMatch(/^[0-9a-f]{32}$/u)
    expect(await invalidSpend!.result).toEqual({ value: undefined, stopReason: 'error', agentsStarted: 0 })
  })

  it('cancels and disposes a rejected partial without throwing', async () => {
    let cancelled: string | undefined
    let disposed = false
    rejectPartialEngineHandle({
      cancel(reason?: string) { cancelled = reason },
      dispose: async () => { disposed = true },
    })
    await Promise.resolve()
    expect(cancelled).toBe('invalid workflow run handle')
    expect(disposed).toBe(true)
    const afterFailedDispose = adaptEngineHandle({
      id: 'dispose-throws',
      result: Promise.resolve(COMPLETED),
      cancel() { /* x */ },
      dispose: async () => { throw new Error('already gone') },
    })
    await afterFailedDispose!.result
    await expect(afterFailedDispose!.dispose()).rejects.toThrow(/already gone/u)
    expect(afterFailedDispose!.checkpoint()).toEqual({ journal: [], agentSpend: 2, agentSeq: 2 })
    expect(() => rejectPartialEngineHandle(undefined)).not.toThrow()
    expect(() => rejectPartialEngineHandle({})).not.toThrow()
    expect(() => rejectPartialEngineHandle({
      cancel() { throw new Error('cancel failed') },
      dispose: async () => { throw new Error('dispose failed') },
    })).not.toThrow()
    await Promise.resolve()
  })
})
