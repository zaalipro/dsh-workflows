import { describe, expect, it } from 'vitest'

import { apply } from '../src/client/index.js'
import { WorkflowRunsController } from '../src/client/controller.js'
import {
  unwrapWorkflowRemoteResult,
  WorkflowRunsRemoteError,
  type WorkflowRunHead,
  type WorkflowRunsSourceSnapshot,
} from '../src/client/contract.js'

interface Deferred<T> {
  readonly promise: Promise<T>
  readonly resolve: (value: T) => void
  readonly reject: (error: unknown) => void
  readonly settled: () => boolean
}

function deferred<T>(): Deferred<T> {
  let done = false
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((fulfil, fail) => {
    resolve = value => { done = true; fulfil(value) }
    reject = error => { done = true; fail(error) }
  })
  return { promise, resolve, reject, settled: () => done }
}

function abortError(message = 'aborted'): Error {
  const error = new Error(message)
  error.name = 'AbortError'
  return error
}

class DeferredRemote {
  readonly calls: Array<{ method: string; sessionId: string; request: any; signal: AbortSignal; deferred: Deferred<any> }> = []
  abortTransport = true
  readonly face = {
    list: (sessionId: string, request: unknown, signal: AbortSignal) => this.call('list', sessionId, request, signal),
    detail: (sessionId: string, request: unknown, signal: AbortSignal) => this.call('detail', sessionId, request, signal),
    members: (sessionId: string, request: unknown, signal: AbortSignal) => this.call('members', sessionId, request, signal),
    memberDetail: (sessionId: string, request: unknown, signal: AbortSignal) => this.call('memberDetail', sessionId, request, signal),
    logs: (sessionId: string, request: unknown, signal: AbortSignal) => this.call('logs', sessionId, request, signal),
    result: (sessionId: string, request: unknown, signal: AbortSignal) => this.call('result', sessionId, request, signal),
    artifacts: (sessionId: string, request: unknown, signal: AbortSignal) => this.call('artifacts', sessionId, request, signal),
    artifact: (sessionId: string, request: unknown, signal: AbortSignal) => this.call('artifact', sessionId, request, signal),
    control: (sessionId: string, request: unknown, signal: AbortSignal) => this.call('control', sessionId, request, signal),
  }

  call(method: string, sessionId: string, request: unknown, signal: AbortSignal): Promise<any> {
    const item = { method, sessionId, request, signal, deferred: deferred<any>() }
    this.calls.push(item)
    const onAbort = (): void => {
      if (this.abortTransport) item.deferred.reject(abortError())
    }
    if (signal.aborted) onAbort()
    else signal.addEventListener('abort', onAbort, { once: true })
    return item.deferred.promise
  }

  pending(method: string, occurrence = 0) {
    const matches = this.calls.filter(call => call.method === method)
    const call = matches[occurrence]
    if (call === undefined) throw new Error(`missing ${method} ${occurrence}`)
    return call
  }

  settleAll(): void {
    for (const call of this.calls) if (!call.deferred.settled()) call.deferred.reject(abortError('teardown'))
  }
}

const SESSION = 'controller-session'

function row(runId: string, revision: number, status: WorkflowRunHead['status'] = 'running'): WorkflowRunHead {
  return {
    runId,
    displayName: `review-${runId}`,
    name: 'review',
    description: 'controller fixture',
    status,
    budget: { total: 8, spent: 1, remaining: 7 },
    memberCounts: { total: 1, running: status === 'running' ? 1 : 0, completed: status === 'completed' ? 1 : 0, failed: 0, cancelled: 0 },
    startedAt: 1,
    allowedActions: status === 'running' ? ['pause', 'stop', 'save'] : [],
    revision,
    detailRevision: revision,
    membersRevision: revision,
    logsRevision: revision,
    resultRevision: revision,
    artifactsRevision: revision,
  }
}

function page(items: readonly WorkflowRunHead[], sessionRevision: number, nextCursor?: string, epoch = 'epoch-1') {
  return { items, total: items.length, sessionRevision, epoch, ...(nextCursor === undefined ? {} : { nextCursor }) }
}

async function flush(): Promise<void> {
  await Promise.resolve()
  await Promise.all([Promise.resolve(), Promise.resolve()])
}

describe('lazy revisioned Client run controller (RC9)', () => {
  it('does not read until the first subscriber and single-flights refresh', async () => {
    const probe = new DeferredRemote()
    const controller = new WorkflowRunsController(probe.face)
    try {
      expect(controller.get(SESSION).phase).toBe('idle')
      expect(probe.calls).toHaveLength(0)
      const source = controller.source(SESSION)
      expect(probe.calls).toHaveLength(0)
      const seen: WorkflowRunsSourceSnapshot[] = []
      const stop = source.subscribe(() => { seen.push(source.getSnapshot()) })
      expect(probe.calls).toHaveLength(1)
      const first = controller.refresh(SESSION)
      const second = controller.refresh(SESSION)
      expect(probe.calls.filter(call => call.method === 'list')).toHaveLength(1)
      probe.pending('list').deferred.resolve(page([row('run-1', 1)], 1, 'cursor-1'))
      await expect(first).resolves.toMatchObject({ phase: 'ready', runs: [expect.objectContaining({ runId: 'run-1' })] })
      await expect(second).resolves.toMatchObject({ phase: 'ready' })
      stop()
    } finally {
      controller.dispose()
      probe.settleAll()
    }
  })

  it('pages, ignores older hints, and refetches on invalidate-all and revision gaps', async () => {
    const probe = new DeferredRemote()
    const controller = new WorkflowRunsController(probe.face)
    try {
      controller.observe(SESSION)
      probe.pending('list').deferred.resolve(page([row('run-1', 1)], 1, 'cursor-1'))
      await probe.pending('list').deferred.promise
      await flush()
      controller.handleChange({ kind: 'invalidate', sessionId: SESSION, revision: 1 })
      expect(probe.calls.filter(call => call.method === 'list')).toHaveLength(1)
      const more = controller.loadMore(SESSION)
      probe.pending('list', 1).deferred.resolve(page([row('run-2', 1)], 1))
      await expect(more).resolves.toMatchObject({
        runs: [expect.objectContaining({ runId: 'run-1' }), expect.objectContaining({ runId: 'run-2' })],
      })
      controller.handleChange({ kind: 'invalidate', sessionId: SESSION, revision: 4 })
      probe.pending('list', 2).deferred.resolve(page([row('run-1', 4)], 4))
      await probe.pending('list', 2).deferred.promise
      await flush()
      expect(controller.get(SESSION).sessionRevision).toBe(4)
      controller.handleChange({ kind: 'invalidate-all' })
      probe.pending('list', 3).deferred.resolve(page([row('fresh', 5)], 5))
      await probe.pending('list', 3).deferred.promise
      await flush()
      expect(controller.get(SESSION).runs[0]?.runId).toBe('fresh')
    } finally {
      controller.dispose()
      probe.settleAll()
    }
  })

  it('restores connected on handleReset after disconnect and suppresses old-generation events', async () => {
    const probe = new DeferredRemote()
    probe.abortTransport = false
    const controller = new WorkflowRunsController(probe.face)
    try {
      controller.observe(SESSION)
      const stale = probe.pending('list')
      controller.handleDisconnected()
      expect(controller.get(SESSION).phase).toBe('reconnecting')
      controller.handleChange({ kind: 'invalidate', sessionId: SESSION, revision: 9 })
      expect(probe.calls.filter(call => call.method === 'list')).toHaveLength(1)
      controller.handleReset()
      const fresh = probe.pending('list', 1)
      fresh.deferred.resolve(page([row('after-reset', 2)], 2, undefined, 'epoch-2'))
      await fresh.deferred.promise
      await flush()
      stale.deferred.resolve(page([row('stale', 1)], 1))
      await stale.deferred.promise
      await flush()
      expect(controller.get(SESSION)).toMatchObject({
        phase: 'ready',
        epoch: 'epoch-2',
        runs: [expect.objectContaining({ runId: 'after-reset' })],
      })
    } finally {
      controller.dispose()
      probe.settleAll()
    }
  })

  it('contains a throwing listener, removes a Session, and does not resurrect it', async () => {
    const probe = new DeferredRemote()
    const controller = new WorkflowRunsController(probe.face)
    try {
      const good: string[] = []
      controller.subscribe(SESSION, () => { throw new Error('bad observer') })
      controller.subscribe(SESSION, snapshot => { good.push(snapshot.phase) })
      probe.pending('list').deferred.resolve(page([row('run-1', 1)], 1))
      await probe.pending('list').deferred.promise
      await flush()
      expect(good).toContain('ready')
      const pending = controller.detail(SESSION, 'run-1')
      controller.removeSession(SESSION)
      await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
      expect(controller.get(SESSION).phase).toBe('idle')
      expect(controller.get(SESSION).runs).toEqual([])
    } finally {
      controller.dispose()
      probe.settleAll()
    }
  })
})

describe('on-demand reads, controls, and child navigation (RC10)', () => {
  it('unwraps JSON null, exact stale/budget errors, and opens only a healthy one-shot child', async () => {
    const probe = new DeferredRemote()
    const opened: unknown[] = []
    const sessions = {
      refreshSubagents: async () => undefined,
      openSubagent: (address: unknown) => { opened.push(address) },
      list: {
        getSnapshot: () => ({
          subagentsByParent: {
            parent: {
              state: 'ready',
              entries: [
                { kind: 'child', id: 'child', parentSessionId: 'parent', mode: 'one-shot' },
              ],
            },
          },
        }),
      },
    }
    const controller = new WorkflowRunsController(probe.face, sessions)
    try {
      const resultPromise = controller.result(SESSION, 'run-1')
      probe.pending('result').deferred.resolve({
        ok: true,
        value: { value: { state: 'available', content: { kind: 'value', value: null }, totalBytes: 4, truncated: false }, revision: 1 },
      })
      await expect(resultPromise).resolves.toMatchObject({
        value: { content: { kind: 'value', value: null } },
      })

      controller.observe(SESSION)
      probe.pending('list').deferred.resolve(page([row('run-1', 1)], 1))
      await probe.pending('list').deferred.promise
      await flush()
      const control = controller.control(SESSION, 'run-1', 'stop', 1)
      probe.pending('control').deferred.reject(new WorkflowRunsRemoteError(
        'revision-conflict',
        'workflow run changed; refresh it before applying a control',
        { run: row('run-1', 2, 'completed') },
      ))
      await expect(control).rejects.toMatchObject({
        code: 'revision-conflict',
        message: 'workflow run changed; refresh it before applying a control',
      })
      await flush()
      expect(controller.get(SESSION).runs[0]?.revision).toBe(2)

      await expect(controller.resolveAndOpenChild('parent', 'child')).resolves.toBe(true)
      expect(opened).toEqual([{ parentSessionId: 'parent', childSessionId: 'child', mode: 'one-shot' }])
      await expect(controller.resolveAndOpenChild('parent', 'missing')).resolves.toBe(false)
    } finally {
      controller.dispose()
      probe.settleAll()
    }
  })

  it('preserves loaded rows when a later page fails and maps budget-limited Resume', async () => {
    const probe = new DeferredRemote()
    const controller = new WorkflowRunsController(probe.face)
    try {
      controller.observe(SESSION)
      probe.pending('list').deferred.resolve(page([row('run-1', 1)], 1, 'cursor-1'))
      await probe.pending('list').deferred.promise
      await flush()
      const later = controller.loadMore(SESSION)
      probe.pending('list', 1).deferred.reject(new WorkflowRunsRemoteError('storage-unavailable', 'boom'))
      await expect(later).rejects.toMatchObject({ code: 'storage-unavailable' })
      expect(controller.get(SESSION)).toMatchObject({
        phase: 'error',
        runs: [expect.objectContaining({ runId: 'run-1' })],
        nextCursor: 'cursor-1',
      })
      const resume = controller.control(SESSION, 'run-1', 'resume', 1)
      probe.pending('control').deferred.reject(new WorkflowRunsRemoteError(
        'action-unavailable',
        'workflow "review-run-1" requires a higher agent_budget to resume',
        { reason: 'budget-limited' },
      ))
      await expect(resume).rejects.toMatchObject({
        message: 'workflow "review-run-1" requires a higher agent_budget to resume',
      })
    } finally {
      controller.dispose()
      probe.settleAll()
    }
  })
})

describe('Client apply Session fence and $on (Requirement 10.4/10.7/10.9)', () => {
  it('still mounts when remote.$on is missing', async () => {
    const pending: Promise<unknown>[] = []
    const registered: any[] = []
    const ctx: any = {
      effect(fn: () => unknown) { pending.push(Promise.resolve().then(() => fn())) },
      remote: {},
      sessions: { list: { getSnapshot: () => ({ ids: [], phase: 'ready' }), subscribe: () => () => undefined } },
      slots: { inject: () => () => undefined, register: () => undefined },
      conversationEvents: { register: () => () => undefined },
      commandUi: {
        ActionCommandUiSpec: { kind: 'action' },
        register(contribution: any) { registered.push(contribution); return () => undefined },
        decorate: () => () => undefined,
      },
      locale: { register: () => () => undefined, bind: () => (key: string) => key },
      connection: { hostDescription: { subscribe: () => () => undefined, getSnapshot: () => ({}) } },
      on: () => () => undefined,
    }
    apply(ctx)
    await Promise.all(pending)
    expect(registered[0]).toMatchObject({ name: 'workflows', ui: { kind: 'action' } })
  })

  it('ignores pending-empty list snapshots and does not union byId children into removal', async () => {
    const pending: Promise<unknown>[] = []
    let snapshot: any = { ids: ['keep-me'], byId: { 'keep-me': {}, child: { parentId: 'keep-me' } }, phase: 'ready' }
    const listeners = new Set<() => void>()
    const removed: string[] = []
    const ctx: any = {
      effect(fn: () => unknown) { pending.push(Promise.resolve().then(() => fn())) },
      remote: {
        $mount: async () => () => undefined,
        $on: () => () => undefined,
        workflowRuns: {
          list: async () => ({ items: [], total: 0, sessionRevision: 0, epoch: 'e' }),
        },
      },
      sessions: {
        list: {
          getSnapshot: () => snapshot,
          subscribe(listener: () => void) {
            listeners.add(listener)
            return () => listeners.delete(listener)
          },
        },
      },
      slots: { inject: () => () => undefined, register: () => undefined },
      conversationEvents: { register: () => () => undefined },
      commandUi: {
        ActionCommandUiSpec: { kind: 'action' },
        register: () => () => undefined,
        decorate: () => () => undefined,
      },
      locale: { register: () => () => undefined, bind: () => (key: string) => key },
      connection: { hostDescription: { subscribe: () => () => undefined, getSnapshot: () => ({}) } },
      on: () => () => undefined,
    }
    apply(ctx)
    await Promise.all(pending)
    const original = ctx.workflowRunsController.removeSession.bind(ctx.workflowRunsController)
    ctx.workflowRunsController.removeSession = (id: string) => { removed.push(id); original(id) }
    snapshot = { ids: [], byId: { child: { parentId: 'keep-me' } }, phase: 'pending' }
    for (const listener of listeners) listener()
    expect(removed).toEqual([])
    snapshot = { ids: [], byId: { child: {} }, phase: 'ready' }
    for (const listener of listeners) listener()
    expect(removed).toEqual(['keep-me'])
  })
})

describe('unwrapWorkflowRemoteResult', () => {
  it('converts the business carrier once and passes AbortError through', () => {
    expect(unwrapWorkflowRemoteResult({ ok: true, value: { n: 1 } })).toEqual({ n: 1 })
    expect(() => unwrapWorkflowRemoteResult({
      ok: false, error: { code: 'stale-cursor', message: 'workflow page cursor is stale; refresh the collection' },
    })).toThrow(WorkflowRunsRemoteError)
    const abort = abortError()
    expect(() => { throw abort }).toThrow(abort)
  })
})
