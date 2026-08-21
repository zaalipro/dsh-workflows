import { describe, expect, it, vi } from 'vitest'

import { WorkflowRunRecorder } from '../src/run-recorder.js'

function member(seq: number, status: 'running' | 'completed' | 'failed' | 'cancelled' = 'running') {
  return {
    memberId: `member-${seq}`,
    seq,
    label: `member-${seq}`,
    childSessionId: `child-${seq}`,
    status,
  }
}

function snapshot(runId: string, stopReason?: string, members: ReturnType<typeof member>[] = []) {
  return {
    info: { id: runId, displayName: 'audit', name: 'audit' },
    members,
    ...(stopReason === undefined ? {} : { result: { stopReason, agentsStarted: members.length } }),
  }
}

async function setup(options: {
  events?: Array<{ type: string; data: any }>
  snapshot?: (runId: string) => any
  recover?: (agent: any, signal?: AbortSignal) => Promise<void>
  existing?: boolean
} = {}) {
  const listeners = new Map<string, Set<(...args: any[]) => void>>()
  const warnings: string[] = []
  const events = [...(options.events ?? [])]
  const session = {
    events,
    append(type: string, data: unknown) { events.push({ type, data }) },
  }
  const agent = { session }
  const supervisor = {
    recoverSession: options.recover ?? (async () => undefined),
    recordingSnapshot: async (_agent: unknown, runId: string) => options.snapshot?.(runId),
  }
  const agents = { list: () => options.existing === false ? [] : [agent] }
  const ctx = {
    on(name: string, listener: (...args: any[]) => void) {
      const bucket = listeners.get(name) ?? new Set<(...args: any[]) => void>()
      bucket.add(listener)
      listeners.set(name, bucket)
      return () => bucket.delete(listener)
    },
    logger: { warn: (message: string) => { warnings.push(message) } },
    agents,
    workflowSupervisor: supervisor,
  }
  const recorder = new WorkflowRunRecorder(ctx)
  const emit = (name: string, ...args: any[]) => {
    for (const listener of listeners.get(name) ?? []) listener(...args)
  }
  await vi.waitFor(() => true)
  await Promise.resolve()
  await Promise.resolve()
  return { recorder, session, agent, emit, warnings, supervisor }
}

describe('WorkflowRunRecorder recovery (SH13)', () => {
  it('does not reset an open prefix on a duplicate run-start while seeding', async () => {
    const { session } = await setup({
      events: [
        { type: 'tool-workflow/run-start', data: { runId: 'live', name: 'audit' } },
        { type: 'tool-workflow/agent-start', data: { runId: 'live', seq: 1, label: 'one', childId: 'child-1' } },
        { type: 'tool-workflow/run-start', data: { runId: 'live', name: 'audit' } },
      ],
      snapshot: () => snapshot('live'),
    })
    await vi.waitFor(() => {
      expect(session.events.filter(event => event.type === 'tool-workflow/run-start')).toHaveLength(2)
    })
    expect(session.events.some(event => event.type === 'tool-workflow/agent-end')).toBe(false)
  })

  it('closes a missing or interrupted row as official cancelled', async () => {
    const missing = await setup({
      events: [
        { type: 'tool-workflow/run-start', data: { runId: 'absent', name: 'audit' } },
        { type: 'tool-workflow/agent-start', data: { runId: 'absent', seq: 1, label: 'one', childId: 'child-1' } },
        { type: 'tool-workflow/agent-start', data: { runId: 'absent', seq: 2, label: 'two', childId: 'child-2' } },
      ],
      snapshot: () => undefined,
    })
    await vi.waitFor(() => {
      expect(missing.session.events.at(-1)?.type).toBe('tool-workflow/run-end')
    })
    expect(missing.session.events.slice(3).map(event => event.data)).toEqual([
      { runId: 'absent', seq: 1, outcome: 'cancelled' },
      { runId: 'absent', seq: 2, outcome: 'cancelled' },
      { runId: 'absent', stopReason: 'cancelled' },
    ])

    const interrupted = await setup({
      events: [
        { type: 'tool-workflow/run-start', data: { runId: 'dead', name: 'audit' } },
        { type: 'tool-workflow/agent-start', data: { runId: 'dead', seq: 1, label: 'one', childId: 'child-1' } },
      ],
      snapshot: () => snapshot('dead', 'interrupted', [member(1, 'cancelled')]),
    })
    await vi.waitFor(() => {
      expect(interrupted.session.events.at(-1)?.data).toEqual({ runId: 'dead', stopReason: 'cancelled' })
    })
  })

  it('repairs mixed member outcomes from one atomic snapshot then stays live when running', async () => {
    const { session, emit } = await setup({
      events: [
        { type: 'tool-workflow/run-start', data: { runId: 'mix', name: 'audit' } },
        { type: 'tool-workflow/agent-start', data: { runId: 'mix', seq: 2, label: 'two', childId: 'child-2' } },
        { type: 'tool-workflow/agent-start', data: { runId: 'mix', seq: 1, label: 'one', childId: 'child-1' } },
        { type: 'tool-workflow/agent-end', data: { runId: 'mix', seq: 2, outcome: 'failed' } },
      ],
      snapshot: () => snapshot('mix', undefined, [member(1, 'completed'), member(2, 'failed'), member(3, 'running')]),
    })
    await vi.waitFor(() => {
      expect(session.events.some(event => event.type === 'tool-workflow/agent-start' && event.data.seq === 3)).toBe(true)
    })
    expect(session.events.some(event => event.type === 'tool-workflow/run-end')).toBe(false)
    emit('workflows/member-end', { id: 'mix', displayName: 'audit', name: 'audit' }, member(3, 'completed'))
    emit('workflows/run-end', { id: 'mix', displayName: 'audit', name: 'audit' }, { stopReason: 'completed' })
    expect(session.events.at(-1)?.data).toEqual({ runId: 'mix', stopReason: 'completed' })
  })

  it('buffers concurrent lifecycle during the snapshot and replays after activation', async () => {
    let resolveSnapshot!: (value: unknown) => void
    const pending = new Promise(resolve => { resolveSnapshot = resolve })
    const { session, emit } = await setup({
      events: [{ type: 'tool-workflow/run-start', data: { runId: 'gap', name: 'audit' } }],
      snapshot: () => pending,
    })
    emit('workflows/member-start', { id: 'gap', displayName: 'audit', name: 'audit' }, member(1))
    emit('workflows/member-end', { id: 'gap', displayName: 'audit', name: 'audit' }, member(1, 'completed'))
    emit('workflows/run-end', { id: 'gap', displayName: 'audit', name: 'audit' }, { stopReason: 'completed' })
    expect(session.events).toHaveLength(1)
    resolveSnapshot(snapshot('gap', undefined, [member(1, 'running')]))
    await vi.waitFor(() => {
      expect(session.events.at(-1)?.type).toBe('tool-workflow/run-end')
    })
    expect(session.events.map(event => event.type)).toEqual([
      'tool-workflow/run-start',
      'tool-workflow/agent-start',
      'tool-workflow/agent-end',
      'tool-workflow/run-end',
    ])
  })

  it('ignores terminal, malformed, and unrelated history while seeding', async () => {
    const { supervisor } = await setup({
      events: [
        { type: 'diagnostic/noise', data: {} },
        { type: 'tool-workflow/malformed-null', data: null },
        { type: 'tool-workflow/malformed-id', data: {} },
        { type: 'tool-workflow/agent-start', data: { runId: 'ghost', seq: 'bad' } },
        { type: 'tool-workflow/run-start', data: { runId: 'closed', name: 'closed' } },
        { type: 'tool-workflow/run-end', data: { runId: 'closed', stopReason: 'completed' } },
        { type: 'tool-workflow/run-start', data: { runId: 'open', name: 'audit' } },
        { type: 'tool-workflow/unknown', data: { runId: 'open' } },
      ],
      snapshot: (runId: string) => runId === 'open' ? snapshot('open') : undefined,
    })
    await vi.waitFor(() => {
      expect(supervisor.recordingSnapshot).toBeDefined()
    })
  })

  it('activates a prefix when snapshot fails and aborts in-flight recovery on dispose', async () => {
    const { session, emit, warnings } = await setup({
      events: [{ type: 'tool-workflow/run-start', data: { runId: 'live', name: 'audit' } }],
      snapshot: async () => { throw new Error('temporary snapshot failure') },
    })
    await vi.waitFor(() => {
      expect(warnings.some(item => item.includes('could not reconcile'))).toBe(true)
    })
    emit('workflows/run-end', { id: 'live', displayName: 'audit', name: 'audit' }, { stopReason: 'completed' })
    expect(session.events.at(-1)?.data).toEqual({ runId: 'live', stopReason: 'completed' })

    let signal: AbortSignal | undefined
    const disposing = await setup({
      events: [{ type: 'tool-workflow/run-start', data: { runId: 'wait', name: 'audit' } }],
      recover: async (_agent, recoverySignal) => {
        signal = recoverySignal
        await new Promise<void>(resolve => { recoverySignal?.addEventListener('abort', () => { resolve() }) })
        recoverySignal?.throwIfAborted()
      },
    })
    await vi.waitFor(() => { expect(signal).toBeDefined() })
    await disposing.recorder.dispose()
    expect(signal?.aborted).toBe(true)
  })

  it('does not duplicate an already complete durable trace', async () => {
    const { supervisor } = await setup({
      events: [
        { type: 'tool-workflow/run-start', data: { runId: 'done', name: 'audit' } },
        { type: 'tool-workflow/run-end', data: { runId: 'done', stopReason: 'completed' } },
      ],
      snapshot: () => { throw new Error('should not snapshot a closed prefix') },
    })
    await Promise.resolve()
    expect(supervisor).toBeDefined()
  })

  it('disables a recovered prefix when pairing appends fail', async () => {
    let calls = 0
    const events: Array<{ type: string; data: any }> = [
      { type: 'tool-workflow/run-start', data: { runId: 'repair', name: 'audit' } },
      { type: 'tool-workflow/agent-start', data: { runId: 'repair', seq: 1, label: 'one', childId: 'child-1' } },
    ]
    const session = {
      events,
      append(type: string, data: unknown) {
        calls += 1
        if (calls === 1) throw new Error('member end failed')
        events.push({ type, data })
      },
    }
    const agent = { session }
    const listeners = new Map<string, Set<(...args: any[]) => void>>()
    const ctx = {
      on(name: string, listener: (...args: any[]) => void) {
        const bucket = listeners.get(name) ?? new Set<(...args: any[]) => void>()
        bucket.add(listener)
        listeners.set(name, bucket)
        return () => bucket.delete(listener)
      },
      logger: { warn: () => undefined },
      agents: { list: () => [agent] },
      workflowSupervisor: {
        recordingSnapshot: async () => undefined,
      },
    }
    const recorder = new WorkflowRunRecorder(ctx)
    await vi.waitFor(() => {
      expect(events.some(event => event.type === 'tool-workflow/run-end')).toBe(false)
    })
    expect(events.map(event => event.type)).toEqual([
      'tool-workflow/run-start',
      'tool-workflow/agent-start',
    ])
    await recorder.dispose()
  })

  it('continues snapshot reconciliation after recoverSession fails', async () => {
    const { session, warnings } = await setup({
      events: [{ type: 'tool-workflow/run-start', data: { runId: 'ok', name: 'audit' } }],
      recover: async () => { throw new Error('recover failed') },
      snapshot: () => snapshot('ok', 'completed'),
    })
    await vi.waitFor(() => {
      expect(session.events.at(-1)?.type).toBe('tool-workflow/run-end')
    })
    expect(warnings.some(item => item.includes('recover failed') || item.includes('could not reconcile'))).toBe(true)
  })

  it('recovers agents created after the recorder mounts', async () => {
    const { emit, recorder } = await setup({ existing: false, events: [] })
    const events: Array<{ type: string; data: any }> = [
      { type: 'tool-workflow/run-start', data: { runId: 'later', name: 'audit' } },
    ]
    const agent = {
      session: {
        events,
        append(type: string, data: unknown) { events.push({ type, data }) },
      },
    }
    ;(recorder as any).ctx.workflowSupervisor.recordingSnapshot = async () => snapshot('later', 'completed')
    emit('agent/created', { agent })
    await vi.waitFor(() => {
      expect(events.at(-1)?.type).toBe('tool-workflow/run-end')
    })
  })
})
