import { describe, expect, it } from 'vitest'

import { WorkflowRunRecorder } from '../src/run-recorder.js'

function bus() {
  const listeners = new Map<string, Set<(...args: any[]) => void>>()
  const warnings: string[] = []
  const ctx = {
    on(name: string, listener: (...args: any[]) => void) {
      const bucket = listeners.get(name) ?? new Set<(...args: any[]) => void>()
      bucket.add(listener)
      listeners.set(name, bucket)
      return () => bucket.delete(listener)
    },
    logger: { warn: (message: string) => { warnings.push(message) } },
    agents: { list: () => [] },
  }
  const emit = (name: string, ...args: any[]) => {
    for (const listener of listeners.get(name) ?? []) listener(...args)
  }
  return { ctx, emit, warnings }
}

function session() {
  return {
    events: [] as Array<{ type: string; data: any }>,
    append(type: string, data: unknown) { this.events.push({ type, data }) },
  }
}

function info(id = 'run-1', displayName = 'audit') {
  return { id, displayName, name: 'audit' }
}

function member(seq: number, status: 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted' = 'running', extra: Record<string, unknown> = {}) {
  return {
    memberId: `member-${seq}`,
    seq,
    label: `member-${seq}`,
    childSessionId: `child-${seq}`,
    status,
    ...extra,
  }
}

describe('WorkflowRunRecorder (SH12)', () => {
  it('records only one explicitly attributed logical lifecycle and maps interruption to cancelled', async () => {
    const { ctx, emit } = bus()
    const recorder = new WorkflowRunRecorder(ctx)
    const parent = session()
    emit('workflows/run-start', info('unrelated', 'unrelated'))
    await recorder.launch(parent, async () => {
      emit('workflows/run-start', info())
      emit('workflows/run-start', info('unrelated', 'unrelated'))
      return { runId: 'run-1', displayName: 'audit' }
    })
    emit('workflows/member-start', info('unrelated'), member(9))
    emit('workflows/member-start', info(), member(1, 'running', { phase: 'Inspect' }))
    emit('workflows/member-end', info(), member(1, 'completed', { phase: 'Inspect' }))
    emit('workflows/run-end', info(), { stopReason: 'interrupted' })
    expect(parent.events.map(event => [event.type, event.data])).toEqual([
      ['tool-workflow/run-start', { runId: 'run-1', name: 'audit' }],
      ['tool-workflow/agent-start', { runId: 'run-1', seq: 1, label: 'member-1', phase: 'Inspect', childId: 'child-1' }],
      ['tool-workflow/agent-end', { runId: 'run-1', seq: 1, outcome: 'completed' }],
      ['tool-workflow/run-end', { runId: 'run-1', stopReason: 'cancelled' }],
    ])
    await recorder.dispose()
  })

  it('preserves omitted phase separately from empty string and buffers pre-return events', async () => {
    const { ctx, emit } = bus()
    const recorder = new WorkflowRunRecorder(ctx)
    const parent = session()
    await recorder.launch(parent, async () => {
      emit('workflows/member-start', info(), member(1, 'running', { phase: '' }))
      emit('workflows/member-end', info(), member(1, 'failed', { phase: '' }))
      emit('workflows/member-start', info(), { ...member(2), phase: undefined, childSessionId: 'child-2' })
      emit('workflows/member-end', info(), member(2, 'completed'))
      emit('workflows/run-end', info(), { stopReason: 'error' })
      return { runId: 'run-1', displayName: 'audit' }
    })
    expect(parent.events[1]?.data).toMatchObject({ phase: '', childId: 'child-1' })
    expect(parent.events[3]?.data).not.toHaveProperty('phase')
    expect(parent.events.at(-1)?.data).toEqual({ runId: 'run-1', stopReason: 'error' })
    await recorder.dispose()
  })

  it('falls back to the returned identity when start emits no publication', async () => {
    const { ctx, emit } = bus()
    const recorder = new WorkflowRunRecorder(ctx)
    const parent = session()
    await recorder.launch(parent, async () => {
      emit('workflows/member-start', info(), member(1))
      return { runId: 'run-1', displayName: 'review-changes' }
    })
    expect(parent.events[0]?.data).toEqual({ runId: 'run-1', name: 'review-changes' })
    expect(parent.events[1]?.data.childId).toBe('child-1')
    await recorder.dispose()
  })

  it('does not append agent-start with an empty childId', async () => {
    const { ctx, emit, warnings } = bus()
    const recorder = new WorkflowRunRecorder(ctx)
    const parent = session()
    await recorder.launch(parent, async () => {
      emit('workflows/run-start', info())
      return { runId: 'run-1', displayName: 'audit' }
    })
    emit('workflows/member-start', info(), { ...member(1), childSessionId: '' })
    emit('workflows/member-end', info(), member(1, 'completed'))
    expect(parent.events.map(event => event.type)).toEqual(['tool-workflow/run-start'])
    expect(warnings.some(item => item.includes('omitted childId'))).toBe(true)
    await recorder.dispose()
  })

  it('disables later writes after append or pairing failure', async () => {
    const { ctx, emit } = bus()
    const recorder = new WorkflowRunRecorder(ctx)
    const parent = session()
    let calls = 0
    parent.append = (type: string, data: unknown) => {
      calls += 1
      if (calls === 1) throw { toString() { throw new Error('unrenderable') } }
      session().append.call(parent, type, data)
    }
    await recorder.launch(parent, async () => {
      emit('workflows/run-start', info())
      return { runId: 'run-1', displayName: 'audit' }
    })
    emit('workflows/member-start', info(), member(1))
    expect(parent.events).toEqual([])

    const second = session()
    const recorder2 = new WorkflowRunRecorder(ctx)
    await recorder2.launch(second, async () => {
      emit('workflows/run-start', info('run-2', 'audit'))
      return { runId: 'other', displayName: 'audit' }
    })
    emit('workflows/member-start', info('run-2'), member(1))
    expect(second.events.map(event => event.type)).toEqual(['tool-workflow/run-start'])

    const third = session()
    const recorder3 = new WorkflowRunRecorder(ctx)
    await recorder3.launch(third, async () => {
      emit('workflows/run-start', info('run-3'))
      return { runId: 'run-3', displayName: 'audit' }
    })
    emit('workflows/member-start', info('run-3'), member(1))
    emit('workflows/member-start', info('run-3'), member(1))
    emit('workflows/member-end', info('run-3'), member(1, 'running'))
    emit('workflows/run-end', info('run-3'), { stopReason: 'completed' })
    expect(third.events.map(event => event.type)).toEqual([
      'tool-workflow/run-start', 'tool-workflow/agent-start',
    ])
    await recorder.dispose()
    await recorder2.dispose()
    await recorder3.dispose()
  })

  it('records a terminal launch failure even when start rejects', async () => {
    const { ctx, emit } = bus()
    const recorder = new WorkflowRunRecorder(ctx)
    const parent = session()
    await expect(recorder.launch(parent, async () => {
      emit('workflows/run-start', info())
      emit('workflows/run-end', info(), { stopReason: 'error' })
      throw new Error('engine construction failed')
    })).rejects.toThrow('engine construction failed')
    expect(parent.events.map(event => event.type)).toEqual([
      'tool-workflow/run-start', 'tool-workflow/run-end',
    ])
    await recorder.dispose()
  })

  it('rejects unpaired member ends and run-end with open members', async () => {
    const { ctx, emit } = bus()
    const recorder = new WorkflowRunRecorder(ctx)
    const parent = session()
    await recorder.launch(parent, async () => {
      emit('workflows/run-start', info())
      return { runId: 'run-1', displayName: 'audit' }
    })
    emit('workflows/member-end', info(), member(1, 'failed'))
    expect(parent.events.map(event => event.type)).toEqual(['tool-workflow/run-start'])

    const open = session()
    await recorder.launch(open, async () => {
      emit('workflows/run-start', info('open'))
      return { runId: 'open', displayName: 'audit' }
    })
    emit('workflows/member-start', info('open'), member(1))
    emit('workflows/run-end', info('open'), { stopReason: 'completed' })
    expect(open.events.map(event => event.type)).toEqual([
      'tool-workflow/run-start', 'tool-workflow/agent-start',
    ])
    await recorder.dispose()
  })

  it('warns without a logger and ignores a missing on() face', async () => {
    const recorder = new WorkflowRunRecorder({ agents: { list: () => [] } })
    const parent = { events: [] as any[] }
    await recorder.launch(parent, async () => ({ runId: 'run-1', displayName: 'audit' }))
    await recorder.dispose()
  })

  it('refuses launches after disposal', async () => {
    const recorder = new WorkflowRunRecorder(bus().ctx)
    await recorder.dispose()
    await recorder.dispose()
    await expect(recorder.launch(session(), async () => ({ runId: 'x', displayName: 'x' }))).rejects.toThrow(/disposed/u)
  })

  it('disables a trace when member start or end appends fail', async () => {
    const { ctx, emit } = bus()
    const recorder = new WorkflowRunRecorder(ctx)
    const startFail = session()
    startFail.append = function (this: ReturnType<typeof session>, type: string, data: unknown) {
      if (type === 'tool-workflow/agent-start') throw new Error('start failed')
      this.events.push({ type, data })
    }
    await recorder.launch(startFail, async () => {
      emit('workflows/run-start', info())
      return { runId: 'run-1', displayName: 'audit' }
    })
    emit('workflows/member-start', info(), member(1))
    expect(startFail.events.map(event => event.type)).toEqual(['tool-workflow/run-start'])

    const endFail = session()
    endFail.append = function (this: ReturnType<typeof session>, type: string, data: unknown) {
      if (type === 'tool-workflow/agent-end') throw new Error('end failed')
      this.events.push({ type, data })
    }
    await recorder.launch(endFail, async () => {
      emit('workflows/run-start', info('run-end-fail'))
      return { runId: 'run-end-fail', displayName: 'audit' }
    })
    emit('workflows/member-start', info('run-end-fail'), member(1))
    emit('workflows/member-end', info('run-end-fail'), member(1, 'completed'))
    expect(endFail.events.map(event => event.type)).toEqual([
      'tool-workflow/run-start', 'tool-workflow/agent-start',
    ])
    await recorder.dispose()
  })

  it('contains missing Session.append and maps interrupted member outcomes', async () => {
    const { ctx, emit, warnings } = bus()
    const recorder = new WorkflowRunRecorder(ctx)
    const parent = { events: [] as any[] }
    await recorder.launch(parent, async () => {
      emit('workflows/run-start', info())
      return { runId: 'run-1', displayName: 'audit' }
    })
    expect(warnings.some(item => item.includes('Session.append is unavailable'))).toBe(true)

    const ok = session()
    await recorder.launch(ok, async () => {
      emit('workflows/run-start', info('run-2'))
      return { runId: 'run-2', displayName: 'audit' }
    })
    emit('workflows/member-start', info('run-2'), member(1))
    emit('workflows/member-end', info('run-2'), member(1, 'interrupted'))
    expect(ok.events.at(-1)?.data).toEqual({ runId: 'run-2', seq: 1, outcome: 'cancelled' })
    await recorder.dispose()
  })
})
