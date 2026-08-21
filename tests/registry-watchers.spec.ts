import { describe, expect, it } from 'vitest'

import type { WorkflowRoot } from '../src/registry/roots.js'
import {
  createDefinitionWatcher,
  WorkflowDefinitionWatchers,
  type ChokidarFactory,
  type ChokidarHandle,
} from '../src/registry/watchers.js'

interface FakeHandle extends ChokidarHandle {
  readonly paths: string | readonly string[]
  readonly options: {
    readonly ignoreInitial: boolean
    readonly usePolling: boolean
    readonly interval: number
    readonly depth: 0
    readonly followSymlinks: false
  }
  listener?: (event: string, path: string) => void
  closed: boolean
  closeError?: Error
}

function rootsFor(project: string, extras: Partial<Record<'bundled' | 'user' | 'project', string>> = {}): WorkflowRoot[] {
  const projectPath = extras.project ?? `${project}/.dsh/workflows`
  return [
    ...(extras.bundled === undefined ? [] : [{ scope: 'bundled' as const, path: extras.bundled, basePath: extras.bundled }]),
    { scope: 'project', path: projectPath, basePath: project, projectRoot: project },
    { scope: 'user', path: extras.user ?? '/home/user/workflows', basePath: '/home/user' },
  ]
}

function fakeWatchers(onChange: () => void, options: {
  readonly maxProjects?: number
  readonly failCreate?: boolean
  readonly schedulerImmediate?: boolean
} = {}) {
  const handles: FakeHandle[] = []
  const scheduled: Array<{ readonly id: number; readonly callback: () => void }> = []
  let nextId = 1
  const factory: ChokidarFactory = (paths, watchOptions) => {
    expect(watchOptions).toMatchObject({
      ignoreInitial: true,
      depth: 0,
      followSymlinks: false,
    })
    if (options.failCreate) throw new Error('watch failed')
    const handle: FakeHandle = {
      paths,
      options: watchOptions,
      closed: false,
      on(event, listener) {
        if (event === 'all') handle.listener = listener
        return handle
      },
      close() {
        if (handle.closeError) return Promise.reject(handle.closeError)
        handle.closed = true
      },
    }
    handles.push(handle)
    return handle
  }
  const watchers = new WorkflowDefinitionWatchers(onChange, {
    maxProjects: options.maxProjects ?? 128,
    stabilityThresholdMs: 25,
    pollIntervalMs: 10,
    watchFactory: factory,
    scheduler: options.schedulerImmediate
      ? { schedule(callback) { callback(); return 0 }, cancel() { /* no-op */ } }
      : {
        schedule(callback) {
          const id = nextId++
          scheduled.push({ id, callback })
          return id
        },
        cancel(handle) {
          const index = scheduled.findIndex(item => item.id === handle)
          if (index >= 0) scheduled.splice(index, 1)
        },
      },
  })
  return { watchers, handles, scheduled, flush() { for (const item of scheduled.splice(0)) item.callback() } }
}

describe('definition watchers (RS9)', () => {
  it('does not increment generation on first observe so a first snapshot can be complete', async () => {
    const { watchers, handles } = fakeWatchers(() => undefined)
    await watchers.observeProject('/proj', rootsFor('/proj', { bundled: '/pkg/workflows' }))
    expect(watchers.generation).toBe(0)
    expect(watchers.projectCount).toBe(1)
    expect(handles).toHaveLength(3)
    expect(handles.every(handle => handle.options.depth === 0 && handle.options.followSymlinks === false)).toBe(true)
    await watchers.observeProject('/proj', rootsFor('/proj', { bundled: '/pkg/workflows' }))
    expect(watchers.generation).toBe(0)
    expect(handles).toHaveLength(3)
  })

  it('coalesces add, change, unlink, root create, and root removal into one generation bump', async () => {
    let changes = 0
    const { watchers, handles, flush } = fakeWatchers(() => { changes += 1 })
    await watchers.observeProject('/proj', rootsFor('/proj'))
    const handle = handles.find(item => item.paths === '/proj/.dsh/workflows' || (Array.isArray(item.paths) && item.paths.includes('/proj/.dsh/workflows')))
    expect(handle?.listener).toEqual(expect.any(Function))
    handle!.listener!('add', 'a.workflow.json')
    handle!.listener!('add', 'b.workflow.json')
    handle!.listener!('change', 'a.workflow.json')
    handle!.listener!('unlink', 'a.workflow.json')
    handle!.listener!('addDir', '/proj/.dsh/workflows')
    handle!.listener!('unlinkDir', '/proj/.dsh/workflows')
    handle!.listener!('ready', 'ignored')
    expect(changes).toBe(0)
    flush()
    expect(changes).toBe(1)
    expect(watchers.generation).toBe(1)
  })

  it('evicts the least-recently-observed project once the 128-root cap is exceeded', async () => {
    const { watchers, handles } = fakeWatchers(() => undefined, { maxProjects: 2 })
    await watchers.observeProject('/a', rootsFor('/a'))
    await watchers.observeProject('/b', rootsFor('/b'))
    expect(watchers.projectCount).toBe(2)
    await watchers.observeProject('/c', rootsFor('/c'))
    expect(watchers.projectCount).toBe(2)
    expect(watchers.generation).toBeGreaterThan(0)
    expect(handles.filter(handle => handle.closed).length).toBeGreaterThan(0)
  })

  it('ignores stale callbacks after replacement and after disposal', async () => {
    let changes = 0
    const { watchers, handles, flush } = fakeWatchers(() => { changes += 1 })
    await watchers.observeProject('/proj', rootsFor('/proj'))
    const first = handles[handles.length - 1]!
    await watchers.observeProject('/proj', rootsFor('/proj', { project: '/proj/.dsh/other' }))
    expect(first.closed).toBe(true)
    first.listener?.('add', 'stale.workflow.json')
    flush()
    expect(changes).toBe(0)
    await watchers.dispose()
    handles.at(-1)?.listener?.('add', 'after-dispose.workflow.json')
    flush()
    expect(changes).toBe(0)
    await watchers.dispose()
  })

  it('contains factory, close, and callback failures and uses the setTimeout scheduler form', async () => {
    const warnings: unknown[][] = []
    const logger = { warn: (...args: unknown[]) => { warnings.push(args) } }
    const throwing = new WorkflowDefinitionWatchers(() => { throw new Error('callback') }, {
      watchFactory: () => { throw new Error('create') },
      logger,
    })
    await throwing.observeProject('/proj', rootsFor('/proj'))
    expect(warnings.some(args => String(args[0]).includes('could not watch'))).toBe(true)

    const handles: FakeHandle[] = []
    const closing = new WorkflowDefinitionWatchers(() => { throw new Error('callback') }, {
      logger,
      stabilityThresholdMs: 1,
      scheduler: {
        setTimeout: (cb: () => void) => {
          cb()
          return 0
        },
        clearTimeout() { /* no-op */ },
      } as never,
      watchFactory: (paths, options) => {
        const handle: FakeHandle = {
          paths, options, closed: false,
          closeError: new Error('close failed'),
          on(_event, listener) { handle.listener = listener; return handle },
          close() { return Promise.reject(handle.closeError) },
        }
        handles.push(handle)
        return handle
      },
    })
    await closing.observeProject('/proj', rootsFor('/proj'))
    handles[0]?.listener?.('change', 'a.workflow.json')
    expect(warnings.some(args => String(args[0]).includes('callback failed'))).toBe(true)
    await closing.dispose()
    expect(warnings.some(args => String(args[0]).includes('could not close'))).toBe(true)
  })

  it('accepts the options-object constructor and createDefinitionWatcher without a project root', async () => {
    let changes = 0
    const owner = new WorkflowDefinitionWatchers({
      onChange: () => { changes += 1 },
      maxProjects: 1,
      watchFactory: (paths, options) => ({
        paths, options, on() { return this }, close() { /* no-op */ },
      } as unknown as ChokidarHandle),
    })
    await owner.observeProject('/proj', rootsFor('/proj'))
    expect(owner.projectCount).toBe(1)
    const detached = createDefinitionWatcher([
      { scope: 'user', path: '/home/user/workflows', basePath: '/home/user' },
    ], () => { changes += 1 }, { polling: true, maxProjects: 1 })
    expect(detached.generation).toBe(0)
    await detached.dispose()
    await owner.dispose()
  })

  it('does nothing after dispose even when observeProject is already queued', async () => {
    const { watchers } = fakeWatchers(() => undefined)
    await watchers.dispose()
    await watchers.observeProject('/proj', rootsFor('/proj'))
    expect(watchers.projectCount).toBe(0)
  })

  it('sorts multiple project paths, uses the default scheduler, and ignores leaked timers after dispose', async () => {
    const leaked: Array<() => void> = []
    let changes = 0
    const handles: FakeHandle[] = []
    const watchers = new WorkflowDefinitionWatchers(() => { changes += 1 }, {
      watchFactory: (paths, options) => {
        const handle: FakeHandle = {
          paths, options, closed: false,
          on(_event, listener) { handle.listener = listener; return handle },
          close() { handle.closed = true },
        }
        handles.push(handle)
        return handle
      },
      scheduler: {
        schedule(callback) {
          leaked.push(callback)
          return leaked.length
        },
        cancel() { /* leak on purpose so dispose can still fence the callback */ },
      },
    })
    await watchers.observeProject('/proj', [
      { scope: 'project', path: '/proj/.dsh/workflows', basePath: '/proj', projectRoot: '/proj' },
      { scope: 'project', path: '/proj/.dsh/other', basePath: '/proj', projectRoot: '/proj' },
      { scope: 'project', path: '/proj/.dsh/other', basePath: '/proj', projectRoot: '/proj' },
      { scope: 'user', path: '/u/workflows', basePath: '/u' },
    ])
    await watchers.observeProject('C:\\proj', [
      { scope: 'project', path: 'C:\\proj\\.dsh\\workflows', basePath: 'C:\\proj', projectRoot: 'C:\\proj' },
    ])
    expect(handles.some(handle => Array.isArray(handle.paths))).toBe(true)
    handles[0]?.listener?.('add', 'a.workflow.json')
    await watchers.dispose()
    for (const callback of leaked.splice(0)) callback()
    expect(changes).toBe(0)

    let defListener: ((event: string, path: string) => void) | undefined
    const def = new WorkflowDefinitionWatchers(() => undefined, {
      watchFactory: (paths, options) => ({
        on(_event: 'all', listener: (event: string, path: string) => void) {
          defListener = listener
          return this
        },
        close() { /* no-op */ },
        paths, options,
      } as unknown as ChokidarHandle),
    })
    await def.observeProject('/p', rootsFor('/p'))
    defListener?.('add', 'a.workflow.json')
    await def.dispose()
    const live = createDefinitionWatcher(rootsFor('/live'), () => undefined, { polling: true })
    await live.dispose()
    const viaBase = createDefinitionWatcher([
      { scope: 'project', path: '/base/.dsh/workflows', basePath: '/base' },
    ], () => undefined)
    await viaBase.dispose()
  })

  it('rejects non-positive watcher bounds', () => {
    expect(() => new WorkflowDefinitionWatchers(() => undefined, { maxProjects: 0 })).toThrow(/maxProjects/u)
    expect(() => new WorkflowDefinitionWatchers(() => undefined, { stabilityThresholdMs: 0.5 })).toThrow(/stabilityThresholdMs/u)
  })
})
