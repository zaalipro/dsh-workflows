import { describe, expect, it, vi } from 'vitest'
import { UserQuestionError } from '@deepseek-ai/dsh-user-questions'

import { apply, workflowGateQuestion } from '../src/user-questions.js'

const parent = { id: 'session-1', session: { id: 'session-1' } }

const resumableGate = {
  kind: 'verification' as const,
  message: 'Confirm the independently verified evidence.',
  resumable: true,
}

function gateRequest(signal = new AbortController().signal, gate = resumableGate) {
  return {
    info: { id: 'logical-1', displayName: 'review-changes', name: 'review-changes' },
    executionId: 'execution-1',
    gateId: 'gate-1',
    gate,
    parent,
    signal,
  }
}

function host(ask: (request: any) => Promise<any>) {
  const listeners = new Map<string, Set<(...args: any[]) => void>>()
  const resumeGate = vi.fn(async () => true)
  const warnings: string[] = []
  const ctx: any = {
    userQuestions: { ask },
    workflowSupervisor: { resumeGate },
    logger: { warn: (message: string) => { warnings.push(message) } },
    on(event: string, listener: (...args: any[]) => void) {
      const bucket = listeners.get(event) ?? new Set()
      bucket.add(listener)
      listeners.set(event, bucket)
      return () => bucket.delete(listener)
    },
    emit(event: string, payload: unknown) {
      for (const listener of listeners.get(event) ?? []) listener(payload)
    },
    effect() { /* owned */ },
  }
  const dispose = apply(ctx)
  return { ctx, resumeGate, warnings, dispose }
}

describe('workflow user questions (SH14)', () => {
  it('presents resumable and repeating gates as explicit acknowledgements', () => {
    expect(workflowGateQuestion('review-changes', resumableGate)).toEqual({
      id: 'workflow-gate',
      header: 'Workflow · review-changes',
      question: 'Confirm the independently verified evidence.',
      options: [{
        label: 'Resume workflow',
        description: 'Continue past this input request.',
      }],
    })
    expect(workflowGateQuestion('review-changes', {
      kind: 'verification', message: 'Pass args.target.', resumable: false,
    }).options).toEqual([{
      label: 'Resume workflow',
      description: 'Retry the paused condition; it may ask again when nothing changed.',
    }])
    expect(JSON.stringify(workflowGateQuestion('review-changes', resumableGate))).not.toContain('logical-1')
  })

  it('asks in the exact parent Session and resumes only the correlated gate occurrence', async () => {
    const answer = Promise.withResolvers<any>()
    const ask = vi.fn(() => answer.promise)
    const { ctx, resumeGate } = host(ask)
    const request = gateRequest()
    ctx.emit('workflows/gate-request', request)
    expect(ask).toHaveBeenCalledOnce()
    expect(ask.mock.calls[0]?.[0]).toMatchObject({
      agent: parent,
      questions: [{
        id: 'workflow-gate',
        header: 'Workflow · review-changes',
        question: resumableGate.message,
      }],
    })
    expect(JSON.stringify(ask.mock.calls[0]?.[0].questions)).not.toContain('logical-1')
    expect(JSON.stringify(ask.mock.calls[0]?.[0].questions)).not.toContain('execution-1')
    answer.resolve({ answers: [{ id: 'workflow-gate', selected: ['Resume workflow'] }] })
    await vi.waitFor(() => {
      expect(resumeGate).toHaveBeenCalledWith(
        request.info.id, request.executionId, request.gateId, parent, expect.any(AbortSignal),
      )
    })
  })

  it('resumes only when the workflow acknowledgement was selected', async () => {
    const ask = vi.fn()
      .mockResolvedValueOnce({ answers: [{ id: 'workflow-gate', selected: [] }] })
      .mockResolvedValueOnce({ answers: [{ id: 'another-question', selected: ['Resume workflow'] }] })
      .mockResolvedValueOnce({ answers: [{ id: 'workflow-gate', selected: [], custom: 'Resume workflow' }] })
      .mockResolvedValueOnce({ answers: [{ id: 'workflow-gate', selected: ['Resume workflow'], custom: 'nope' }] })
      .mockResolvedValueOnce({ answers: [{ id: 'workflow-gate', selected: ['Resume workflow'] }] })
    const { ctx, resumeGate } = host(ask)
    for (let index = 0; index < 5; index += 1) ctx.emit('workflows/gate-request', gateRequest())
    await vi.waitFor(() => { expect(ask).toHaveBeenCalledTimes(5) })
    await vi.waitFor(() => { expect(resumeGate).toHaveBeenCalledOnce() })
  })

  it('leaves the run parked when the user dismisses or the supervisor withdraws a question', async () => {
    const controller = new AbortController()
    const ask = vi.fn()
      .mockRejectedValueOnce(new UserQuestionError('dismissed', 'ASK_CANCELLED'))
      .mockRejectedValueOnce(new UserQuestionError('provider stopped', 'ASK_ABORTED'))
      .mockImplementationOnce(request => new Promise((_resolve, reject) => {
        request.signal?.addEventListener('abort', () => {
          reject(new UserQuestionError('run moved on', 'ASK_ABORTED'))
        }, { once: true })
      }))
    const { ctx, resumeGate, warnings } = host(ask)
    ctx.emit('workflows/gate-request', gateRequest())
    ctx.emit('workflows/gate-request', gateRequest())
    ctx.emit('workflows/gate-request', gateRequest(controller.signal))
    controller.abort()
    await vi.waitFor(() => { expect(ask).toHaveBeenCalledTimes(3) })
    await Promise.resolve()
    expect(resumeGate).not.toHaveBeenCalled()
    expect(warnings).toEqual([])
  })

  it('contains provider and resume failures while preserving a useful diagnostic', async () => {
    const unrenderable = { [Symbol.toPrimitive]: () => { throw new Error('coercion denied') } }
    const ask = vi.fn()
      .mockRejectedValueOnce(new Error('provider unavailable'))
      .mockRejectedValueOnce(new UserQuestionError('bad caller', 'CALLER_NOT_LIVE'))
      .mockRejectedValueOnce(unrenderable)
      .mockResolvedValueOnce({ answers: [{ id: 'workflow-gate', selected: ['Resume workflow'] }] })
    const { ctx, resumeGate, warnings } = host(ask)
    resumeGate.mockRejectedValueOnce(new Error('stale gate'))
    for (let index = 0; index < 4; index += 1) ctx.emit('workflows/gate-request', gateRequest())
    await vi.waitFor(() => { expect(warnings).toHaveLength(4) })
    expect(warnings[0]).toContain('provider unavailable')
    expect(warnings[1]).toContain('bad caller')
    expect(warnings[2]).toContain('[unrenderable thrown value]')
    expect(warnings[3]).toContain('stale gate')
    expect(warnings.every(item => item.includes('review-changes'))).toBe(true)
  })

  it('aborts and drains an outstanding question when the plugin unloads', async () => {
    let seenSignal: AbortSignal | undefined
    const ask = vi.fn(request => new Promise((_resolve, reject) => {
      seenSignal = request.signal
      request.signal?.addEventListener('abort', () => {
        reject(new UserQuestionError('plugin disposed', 'ASK_ABORTED'))
      }, { once: true })
    }))
    const { ctx, resumeGate, dispose } = host(ask)
    ctx.emit('workflows/gate-request', gateRequest())
    expect(seenSignal?.aborted).toBe(false)
    await dispose()
    await dispose()
    expect(seenSignal?.aborted).toBe(true)
    expect(resumeGate).not.toHaveBeenCalled()
    ctx.emit('workflows/gate-request', gateRequest())
    expect(ask).toHaveBeenCalledOnce()
  })

  it('ignores duck-typed ASK_CANCELLED codes and missing on/effect faces', async () => {
    const ask = vi.fn().mockRejectedValue({ code: 'ASK_CANCELLED' })
    const { ctx, resumeGate, warnings } = host(ask)
    ctx.emit('workflows/gate-request', gateRequest())
    await vi.waitFor(() => { expect(ask).toHaveBeenCalledOnce() })
    expect(resumeGate).not.toHaveBeenCalled()
    expect(warnings).toEqual([])
    expect(apply({ userQuestions: { ask: async () => ({ answers: [] }) }, workflowSupervisor: {} })).toBeTypeOf('function')
  })

  it('ignores late gate events after a failed unsubscribe and contains logger-less failures', async () => {
    const ask = vi.fn().mockResolvedValue({ answers: [] })
    const held: Array<(payload: unknown) => void> = []
    const ctx: any = {
      userQuestions: { ask },
      workflowSupervisor: { resumeGate: vi.fn() },
      on(_event: string, listener: (payload: unknown) => void) {
        held.push(listener)
        return () => { throw new Error('unsubscribe failed') }
      },
    }
    const dispose = apply(ctx)
    await dispose()
    held[0]?.(gateRequest())
    expect(ask).not.toHaveBeenCalled()

    const silentAsk = vi.fn().mockRejectedValue(new Error('no logger'))
    const silent = apply({
      userQuestions: { ask: silentAsk },
      workflowSupervisor: { resumeGate: vi.fn() },
      logger: {},
      on(_event: string, listener: (payload: unknown) => void) {
        listener(gateRequest())
        return () => undefined
      },
    })
    await Promise.resolve()
    await silent()
    expect(silentAsk).toHaveBeenCalledOnce()
  })
})
