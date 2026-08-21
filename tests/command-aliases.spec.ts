import { describe, expect, it, vi } from 'vitest'
import { parseCommand } from '@deepseek-ai/dsh-commands'

import {
  allocateWorkflowCommandNames,
  applyCommands,
} from '../src/commands/index.js'

interface CommandDefinition {
  readonly name: string
  readonly description: string
  readonly input?: { readonly hint?: string }
  readonly handler: (invocation: any) => any
}

function abortError(signal: AbortSignal): Error {
  if (signal.reason instanceof Error) return signal.reason
  const error = new Error('command aborted')
  error.name = 'AbortError'
  return error
}

class StubWorkflows {
  definitions: Array<{ name: string; description: string }> = []
  listImpl?: (options?: { cwd?: string; signal?: AbortSignal }) => Promise<Array<{ name: string; description: string }>>
  listCalls = 0
  async list(options?: { cwd?: string; signal?: AbortSignal }) {
    this.listCalls += 1
    if (this.listImpl !== undefined) return this.listImpl(options)
    return this.definitions
  }
  async get(name: string, options?: { cwd?: string; signal?: AbortSignal }) {
    options?.signal?.throwIfAborted()
    const found = this.definitions.find(definition => definition.name === name)
    return found === undefined ? undefined : { ...found, script: 'complete({ ok: true })', scope: 'project' }
  }
}

function createSupervisor() {
  return {
    start: vi.fn(async (request: any) => ({ displayName: `${request.definition.name}-2` })),
    pause: vi.fn(async () => undefined),
    resume: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined),
    save: vi.fn(async () => '/tmp/saved.workflow.json'),
  }
}

function createHost() {
  const listeners = new Map<string, Set<(...args: any[]) => void>>()
  const ordinary = new Map<string, CommandDefinition>()
  const fallbacks = new WeakMap<object, Map<string, CommandDefinition>>()
  const agents: any[] = []
  const workflows = new StubWorkflows()
  const supervisor = createSupervisor()
  const recorder = {
    sessions: [] as unknown[],
    async launch<T>(session: unknown, start: () => Promise<T>) {
      this.sessions.push(session)
      return start()
    },
  }
  let seq = 0
  const emit = (event: string, payload?: unknown): void => {
    for (const listener of [...(listeners.get(event) ?? [])]) listener(payload)
  }
  const view = (agent: object): Map<string, CommandDefinition> => {
    const merged = new Map(fallbacks.get(agent) ?? [])
    for (const [name, definition] of ordinary) merged.set(name, definition)
    return merged
  }
  const notifyCommands = (): void => { emit('commands/change') }
  const commands = {
    register(definition: CommandDefinition) {
      ordinary.set(definition.name, definition)
      notifyCommands()
      return () => {
        if (ordinary.get(definition.name) === definition) ordinary.delete(definition.name)
        notifyCommands()
      }
    },
    registerFallback(_definition: CommandDefinition) {
      throw new Error('registerFallback must be called through exact-Agent inject')
    },
    list(agent: object) {
      return [...view(agent).values()]
        .map(definition => ({ name: definition.name, description: definition.description, input: definition.input }))
        .sort((left, right) => left.name < right.name ? -1 : 1)
    },
    find(agent: object, name: string) {
      return view(agent).get(name)
    },
    async execute(agent: any, line: string, images: readonly unknown[], signal: AbortSignal) {
      if (!Array.isArray(images)) throw new Error('execute requires the 4-argument image-aware signature')
      const parsed = parseCommand(line)
      if (parsed === undefined) return undefined
      const definition = view(agent).get(parsed.name)
      if (definition === undefined) return undefined
      if (signal.aborted) throw abortError(signal)
      const commandId = `cmd-test-${(seq += 1)}`
      const result = await definition.handler({
        commandId, agent, rawInput: parsed.rawInput, attachments: [], signal,
      })
      return { commandId, result }
    },
  }
  const ctx: any = {
    workflows,
    workflowSupervisor: supervisor,
    workflowRunRecorder: recorder,
    commands,
    agents: {
      list: () => agents,
      register(agent: any) {
        agents.push(agent)
        emit('agent/created', { agent })
        return () => {
          const index = agents.indexOf(agent)
          if (index >= 0) agents.splice(index, 1)
          emit('agent/disposed', { agent })
        }
      },
    },
    on(event: string, listener: (...args: any[]) => void) {
      const bucket = listeners.get(event) ?? new Set()
      bucket.add(listener)
      listeners.set(event, bucket)
      return () => { bucket.delete(listener) }
    },
    emit,
  }
  const disposeCommands = applyCommands(ctx, { registerSkill: false })
  return { ctx, workflows, supervisor, recorder, commands, disposeCommands, fallbacks, notifyCommands, ordinary }
}

function createAgent(host: ReturnType<typeof createHost>, cwd?: string) {
  const map = new Map<string, CommandDefinition>()
  const agent: any = {
    session: {
      header: cwd === undefined ? {} : { cwd },
      append() { /* lifecycle unused in alias tests */ },
    },
    steer: vi.fn(),
    ctx: {
      inject(_deps: unknown, callback: (registrationCtx: any) => void) {
        const registered: Array<() => void> = []
        callback({
          commands: {
            registerFallback(definition: CommandDefinition) {
              map.set(definition.name, definition)
              host.notifyCommands()
              const dispose = (): void => {
                if (map.get(definition.name) === definition) map.delete(definition.name)
                host.notifyCommands()
              }
              registered.push(dispose)
              return dispose
            },
          },
        })
        return {
          dispose() {
            for (const dispose of registered.splice(0)) dispose()
            return Promise.resolve()
          },
        }
      },
    },
  }
  host.fallbacks.set(agent, map)
  return agent
}

describe('allocateWorkflowCommandNames (SH17)', () => {
  it('gives every free definition its bare name', () => {
    const allocated = allocateWorkflowCommandNames(
      [{ name: 'review-changes' }, { name: 'audit' }],
      new Set(),
    )
    expect(allocated.get('audit')).toBe('audit')
    expect(allocated.get('review-changes')).toBe('review-changes')
  })

  it('yields a colliding ordinary name and prefixes without a length ceiling', () => {
    expect(allocateWorkflowCommandNames([{ name: 'plan' }], new Set(['plan'])).get('plan')).toBe('workflow-plan')
    expect(
      allocateWorkflowCommandNames([{ name: 'plan' }], new Set(['plan', 'workflow-plan'])).get('plan'),
    ).toBe('workflow-workflow-plan')
    const occupied = new Set(['plan'])
    let name = 'plan'
    for (let index = 0; index < 8; index += 1) {
      occupied.add(`workflow-${name === 'plan' ? 'plan' : name}`)
      name = `workflow-${name}`
    }
    const allocated = allocateWorkflowCommandNames([{ name: 'plan' }], occupied)
    expect(allocated.get('plan')?.startsWith('workflow-')).toBe(true)
    expect(occupied.has(allocated.get('plan') as string)).toBe(false)
  })

  it('reserves sibling bare names so /workflow-plan is not stolen from plan', () => {
    const allocated = allocateWorkflowCommandNames(
      [{ name: 'plan' }, { name: 'workflow-plan' }],
      new Set(['plan']),
    )
    expect(allocated.get('workflow-plan')).toBe('workflow-plan')
    expect(allocated.get('plan')).toBe('workflow-workflow-plan')
  })

  it('sorts in UTF-16 order before allocating', () => {
    const allocated = allocateWorkflowCommandNames(
      [{ name: 'b-two' }, { name: 'a-one' }],
      new Set(),
    )
    expect([...allocated.keys()]).toEqual(['a-one', 'b-two'])
  })
})

describe('saved-definition aliases (SH17)', () => {
  it('registers a free name as a fallback alias and launches through official execute', async () => {
    const host = createHost()
    const agent = createAgent(host, '/workspace/project')
    host.ctx.agents.register(agent)
    host.workflows.definitions = [{ name: 'audit', description: 'review a diff' }]
    host.ctx.emit('workflows/change')
    await vi.waitFor(() => {
      expect(host.commands.list(agent).map((item: { name: string }) => item.name)).toContain('audit')
    })
    expect(host.commands.find(agent, 'audit')).toMatchObject({
      description: 'review a diff',
      input: { hint: '[json-args]' },
    })
    const signal = new AbortController().signal
    await expect(host.commands.execute(agent, '/audit', [], signal)).resolves.toMatchObject({
      result: { kind: 'success', text: 'Started workflow "audit-2" in the background. Open /workflows to watch it.' },
    })
    await expect(host.commands.execute(agent, '/audit {"root":"src"}', [], signal)).resolves.toMatchObject({
      result: { kind: 'success' },
    })
    expect(host.supervisor.start.mock.calls.at(-1)?.[0].args).toEqual({ root: 'src' })
    expect(host.recorder.sessions).toEqual([agent.session, agent.session])
  })

  it('keeps a built-in bare name and advertises the colliding workflow under a qualified alias', async () => {
    const host = createHost()
    const agent = createAgent(host)
    host.ctx.agents.register(agent)
    host.workflows.definitions = [{ name: 'plan', description: 'saved plan' }, { name: 'workflow-plan', description: 'saved workflow plan' }]
    const disposePlan = host.commands.register({
      name: 'plan',
      description: 'built-in planner',
      handler: () => ({ kind: 'success', text: 'built-in' }),
    })
    host.ctx.emit('workflows/change')
    await vi.waitFor(() => {
      const names = host.commands.list(agent).map((item: { name: string }) => item.name)
      expect(names).toEqual(expect.arrayContaining(['plan', 'workflow-plan', 'workflow-workflow-plan']))
    })
    expect(host.commands.find(agent, 'plan')?.description).toBe('built-in planner')
    expect(host.commands.find(agent, 'workflow-plan')?.description).toBe('saved workflow plan')
    expect(host.commands.find(agent, 'workflow-workflow-plan')).toMatchObject({
      description: 'Saved workflow "plan": saved plan',
      input: { hint: '[json-args]' },
    })
    await expect(host.commands.execute(agent, '/workflow-workflow-plan {"x":1}', [], new AbortController().signal))
      .resolves.toMatchObject({ result: { kind: 'success' } })
    expect(host.supervisor.start.mock.calls[0]?.[0].definition.name).toBe('plan')
    disposePlan()
  })

  it('moves an alias when a built-in mounts or unmounts after discovery', async () => {
    const host = createHost()
    const agent = createAgent(host)
    host.ctx.agents.register(agent)
    host.workflows.definitions = [{ name: 'audit', description: 'saved audit' }]
    host.ctx.emit('workflows/change')
    await vi.waitFor(() => {
      expect(host.commands.list(agent).map((item: { name: string }) => item.name)).toContain('audit')
    })
    const listCalls = host.workflows.listCalls
    const disposeBuiltIn = host.commands.register({
      name: 'audit',
      description: 'built-in audit',
      handler: () => ({ kind: 'success', text: 'built-in' }),
    })
    await vi.waitFor(() => {
      expect(host.commands.find(agent, 'audit')?.description).toBe('built-in audit')
      expect(host.commands.list(agent).map((item: { name: string }) => item.name)).toContain('workflow-audit')
    })
    expect(host.workflows.listCalls).toBe(listCalls)
    disposeBuiltIn()
    await vi.waitFor(() => {
      expect(host.commands.find(agent, 'audit')?.description).toBe('saved audit')
      expect(host.commands.list(agent).map((item: { name: string }) => item.name)).not.toContain('workflow-audit')
    })
    expect(host.workflows.listCalls).toBe(listCalls)
  })

  it('refreshes alias metadata when a definition description changes', async () => {
    const host = createHost()
    const agent = createAgent(host)
    host.ctx.agents.register(agent)
    host.workflows.definitions = [{ name: 'edited', description: 'old description' }]
    host.ctx.emit('workflows/change')
    await vi.waitFor(() => {
      expect(host.commands.find(agent, 'edited')?.description).toBe('old description')
    })
    host.workflows.definitions = [{ name: 'edited', description: 'new description' }]
    host.ctx.emit('workflows/change')
    await vi.waitFor(() => {
      expect(host.commands.find(agent, 'edited')?.description).toBe('new description')
    })
  })

  it('drops a definition command after the definition disappears', async () => {
    const host = createHost()
    const agent = createAgent(host)
    host.ctx.agents.register(agent)
    host.workflows.definitions = [{ name: 'gone', description: 'transient' }]
    host.ctx.emit('workflows/change')
    await vi.waitFor(() => {
      expect(host.commands.list(agent).map((item: { name: string }) => item.name)).toContain('gone')
    })
    host.workflows.definitions = []
    host.ctx.emit('workflows/change')
    await vi.waitFor(() => {
      expect(host.commands.list(agent).map((item: { name: string }) => item.name)).not.toContain('gone')
    })
  })

  it('does not let an older alias refresh replace a newer catalog', async () => {
    const host = createHost()
    const agent = createAgent(host)
    host.ctx.agents.register(agent)
    const pending: Array<(definitions: Array<{ name: string; description: string }>) => void> = []
    host.workflows.listImpl = () => new Promise(resolve => { pending.push(resolve) })
    host.ctx.emit('workflows/change')
    await vi.waitFor(() => { expect(pending).toHaveLength(1) })
    host.ctx.emit('workflows/change')
    await vi.waitFor(() => { expect(pending).toHaveLength(2) })
    pending[1]?.([{ name: 'latest', description: 'new catalog' }])
    await vi.waitFor(() => {
      expect(host.commands.list(agent).map((item: { name: string }) => item.name)).toContain('latest')
    })
    pending[0]?.([{ name: 'stale', description: 'old catalog' }])
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(host.commands.list(agent).map((item: { name: string }) => item.name)).toContain('latest')
    expect(host.commands.list(agent).map((item: { name: string }) => item.name)).not.toContain('stale')
  })

  it('discovers aliases independently for two agent working directories', async () => {
    const host = createHost()
    const one = createAgent(host, '/workspace/one')
    const two = createAgent(host, '/workspace/two')
    host.workflows.listImpl = async (options?: { cwd?: string }) => (
      options?.cwd === '/workspace/one'
        ? [{ name: 'one-only', description: 'one' }]
        : [{ name: 'two-only', description: 'two' }]
    )
    host.ctx.agents.register(one)
    host.ctx.agents.register(two)
    host.ctx.emit('workflows/change')
    await vi.waitFor(() => {
      expect(host.commands.list(one).map((item: { name: string }) => item.name)).toContain('one-only')
      expect(host.commands.list(two).map((item: { name: string }) => item.name)).toContain('two-only')
    })
    expect(host.commands.list(one).map((item: { name: string }) => item.name)).not.toContain('two-only')
    expect(host.commands.list(two).map((item: { name: string }) => item.name)).not.toContain('one-only')
  })

  it('rejects malformed alias JSON and a vanished definition', async () => {
    const host = createHost()
    const agent = createAgent(host)
    host.ctx.agents.register(agent)
    host.workflows.definitions = [{ name: 'audit', description: 'review a diff' }]
    host.ctx.emit('workflows/change')
    await vi.waitFor(() => {
      expect(host.commands.list(agent).map((item: { name: string }) => item.name)).toContain('audit')
    })
    await expect(host.commands.execute(agent, '/audit [1]', [], new AbortController().signal))
      .resolves.toMatchObject({
        result: { kind: 'error', text: '/audit args must be one JSON object (wrap arrays/scalars in a field)' },
      })
    host.workflows.definitions = []
    await expect(host.commands.execute(agent, '/audit', [], new AbortController().signal))
      .resolves.toMatchObject({ result: { kind: 'error', text: 'no saved workflow named "audit"' } })
  })

  it('unwinds aliases when the owner agent is disposed', async () => {
    const host = createHost()
    const agent = createAgent(host)
    const unregister = host.ctx.agents.register(agent)
    host.workflows.definitions = [{ name: 'audit', description: 'review a diff' }]
    host.ctx.emit('workflows/change')
    await vi.waitFor(() => {
      expect(host.commands.list(agent).map((item: { name: string }) => item.name)).toContain('audit')
    })
    unregister()
    await vi.waitFor(() => {
      expect(host.commands.list(agent).map((item: { name: string }) => item.name)).not.toContain('audit')
    })
  })

  it('fails makeAlias closed when a later inject is missing, incomplete, or returns no disposer', async () => {
    const host = createHost()
    const makeBroken = (mode: 'missing' | 'no-fallback' | 'no-fiber') => {
      let probes = 0
      const map = new Map<string, CommandDefinition>()
      const agent: any = {
        session: { header: {}, append() { /* unused */ } },
        ctx: {
          inject(_deps: unknown, callback: (value: any) => void) {
            probes += 1
            if (mode === 'missing' && probes > 1) {
              agent.ctx.inject = undefined
            }
            if (mode === 'no-fallback' && probes > 1) {
              callback({ commands: {} })
              return { dispose() { /* unused */ } }
            }
            const registered: Array<() => void> = []
            callback({
              commands: {
                registerFallback(definition: CommandDefinition) {
                  map.set(definition.name, definition)
                  const dispose = (): void => {
                    if (map.get(definition.name) === definition) map.delete(definition.name)
                  }
                  registered.push(dispose)
                  return dispose
                },
              },
            })
            if (mode === 'no-fiber' && probes > 1) return undefined
            return { dispose() { for (const dispose of registered.splice(0)) dispose() } }
          },
        },
      }
      host.fallbacks.set(agent, map)
      return agent
    }
    host.workflows.definitions = [{ name: 'audit', description: 'review' }]
    for (const mode of ['missing', 'no-fallback', 'no-fiber'] as const) {
      host.ctx.agents.register(makeBroken(mode))
    }
    const later = createAgent(host)
    host.ctx.agents.register(later)
    await vi.waitFor(() => {
      expect(host.commands.list(later).map((item: { name: string }) => item.name)).toContain('audit')
    })
    later.ctx.inject = undefined
    host.workflows.definitions = [{ name: 'audit', description: 'review' }, { name: 'fresh', description: 'new' }]
    host.ctx.emit('workflows/change')
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(host.workflows.listCalls).toBeGreaterThan(0)
  })

  it('fails closed when exact-Agent inject or registerFallback is missing', () => {
    const host = createHost()
    expect(() => host.ctx.agents.register({ session: { header: {} }, ctx: {} })).toThrow(
      /exact-Agent command injection/u,
    )
    expect(() => host.ctx.agents.register({
      session: { header: {} },
      ctx: { inject(_deps: unknown, callback: (value: any) => void) { callback({ commands: {} }) } },
    })).toThrow(/registerFallback/u)
  })

  it('treats a list AbortError as a cancelled refresh and ignores a missing find() hit', async () => {
    const host = createHost()
    const agent = createAgent(host)
    host.ctx.agents.register(agent)
    const abortError = Object.assign(new Error('aborted'), { name: 'AbortError' })
    host.workflows.listImpl = async () => { throw abortError }
    host.ctx.emit('workflows/change')
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(host.commands.list(agent).map((item: { name: string }) => item.name)).not.toContain('ghost')
    host.workflows.listImpl = undefined
    host.workflows.definitions = [{ name: 'audit', description: 'review' }]
    const originalFind = host.commands.find.bind(host.commands)
    host.commands.find = ((target: object, name: string) => (
      name === 'audit' ? undefined : originalFind(target, name)
    )) as typeof host.commands.find
    host.ctx.emit('workflows/change')
    await vi.waitFor(() => {
      expect(host.commands.list(agent).map((item: { name: string }) => item.name)).toContain('audit')
    })
  })

  it('launches an alias without a recorder and uses a function-shaped inject disposer', async () => {
    const host = createHost()
    host.ctx.workflowRunRecorder = undefined
    const map = new Map<string, CommandDefinition>()
    const agent: any = {
      session: { header: { cwd: '/workspace' }, append() { /* unused */ } },
      steer: vi.fn(),
      ctx: {
        inject(_deps: unknown, callback: (registrationCtx: any) => void) {
          const registered: Array<() => void> = []
          callback({
            commands: {
              registerFallback(definition: CommandDefinition) {
                map.set(definition.name, definition)
                host.notifyCommands()
                const dispose = (): void => {
                  if (map.get(definition.name) === definition) map.delete(definition.name)
                  host.notifyCommands()
                }
                registered.push(dispose)
                return dispose
              },
            },
          })
          return () => { for (const dispose of registered.splice(0)) dispose() }
        },
      },
    }
    host.fallbacks.set(agent, map)
    host.ctx.agents.register(agent)
    host.workflows.definitions = [{ name: 'audit', description: 'review a diff' }]
    host.ctx.emit('workflows/change')
    await vi.waitFor(() => {
      expect(host.commands.list(agent).map((item: { name: string }) => item.name)).toContain('audit')
    })
    await expect(host.commands.execute(agent, '/audit', [], new AbortController().signal))
      .resolves.toMatchObject({ result: { kind: 'success' } })
    host.supervisor.start.mockRejectedValueOnce(new Error('start failed'))
    await expect(host.commands.execute(agent, '/audit', [], new AbortController().signal))
      .resolves.toMatchObject({ result: { kind: 'error', text: 'start failed' } })
  })
})
