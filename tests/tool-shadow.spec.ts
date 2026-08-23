import { describe, expect, it, vi } from 'vitest'

import {
  applyToolShadow,
  installWorkflowShadow,
  isOfficialWorkflowTool,
  isStockOfficialWorkflowTool,
  WORKFLOW_PROMPT_SECTION,
  WORKFLOW_TOOL_DEFINITION,
} from '../src/tool/index.js'

function officialPair(overrides: Record<string, unknown> = {}) {
  const restored: string[] = []
  const tools = {
    current: WORKFLOW_TOOL_DEFINITION as any,
    get(name: string) { return name === 'workflow' ? this.current : undefined },
    replace(name: string, expected: unknown, replacement: unknown) {
      if (name !== 'workflow' || expected !== this.current) throw new Error('identity mismatch')
      const previous = this.current
      this.current = replacement
      return () => { restored.push('tool'); this.current = previous }
    },
  }
  const prompt = {
    current: WORKFLOW_PROMPT_SECTION as any,
    get(name: string) { return name === 'tool:workflow' ? this.current : undefined },
    replaceSection(name: string, expected: unknown, replacement: unknown) {
      if (name !== 'tool:workflow' || expected !== this.current) throw new Error('prompt identity mismatch')
      const previous = this.current
      this.current = replacement
      return () => { restored.push('prompt'); this.current = previous }
    },
  }
  const agent = { ctx: { tools, systemPrompt: prompt, ...overrides } }
  return { agent, tools, prompt, restored }
}

const services = {
  registry: { get: async () => undefined },
  supervisor: { start: async () => ({ displayName: 'x', runId: 'y' }), validate: async () => ({ ok: true }) },
}

function stockOfficialTool() {
  const string = { type: 'string' }
  return {
    name: 'workflow',
    description: 'Run a JavaScript workflow script that orchestrates subagents at scale. stock contract\nThe run executes in the foreground: this call returns when the whole script finishes.',
    parameters: {
      type: 'object',
      properties: {
        script: string,
        meta: {
          type: 'object',
          additionalProperties: true,
          properties: {
            name: string,
            description: string,
            whenToUse: string,
            phases: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: true,
                properties: { title: string, detail: string, provider: string, model: string },
                required: ['title'],
              },
            },
          },
          required: ['name', 'description'],
        },
        args: { type: 'object', additionalProperties: true },
      },
      required: ['script', 'meta'],
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          runId: { type: 'string' },
          agentsStarted: { type: 'integer' },
          result: {},
        },
        required: ['runId', 'agentsStarted', 'result'],
      },
      render: () => [],
    },
    execute: async () => ({ runId: 'stock', agentsStarted: 0, result: null }),
  }
}

describe('workflow tool shadow (SH22)', () => {
  it('is official only for the exported identity or explicit marker', () => {
    expect(isOfficialWorkflowTool(WORKFLOW_TOOL_DEFINITION)).toBe(true)
    expect(isOfficialWorkflowTool({ name: 'workflow' })).toBe(false)
    expect(isOfficialWorkflowTool(null)).toBe(false)
    expect(isOfficialWorkflowTool({ __officialWorkflowContribution: true })).toBe(true)
    const marked = { name: 'workflow' } as any
    marked[Symbol.for('deepseek-harness.workflow.official-contribution')] = true
    expect(isOfficialWorkflowTool(marked)).toBe(true)
  })

  it('recognizes only the complete stock 0.1.1-rc.2 public workflow fingerprint', () => {
    const stock = stockOfficialTool()
    expect(isStockOfficialWorkflowTool(stock)).toBe(true)
    expect(isOfficialWorkflowTool(stock)).toBe(true)
    expect(isStockOfficialWorkflowTool({ ...stock, description: 'custom' })).toBe(false)
    expect(isStockOfficialWorkflowTool({
      ...stock,
      parameters: { ...stock.parameters, properties: { ...stock.parameters.properties, script_path: { type: 'string' } } },
    })).toBe(false)
    expect(isStockOfficialWorkflowTool({ ...stock, output: { ...stock.output, render: undefined } })).toBe(false)
    expect(isStockOfficialWorkflowTool(undefined)).toBe(false)
    expect(isStockOfficialWorkflowTool({ ...stock, parameters: [] })).toBe(false)
    expect(isStockOfficialWorkflowTool({ ...stock, parameters: { ...stock.parameters, required: [1] } })).toBe(false)
    expect(isStockOfficialWorkflowTool({
      ...stock,
      parameters: {
        ...stock.parameters,
        properties: {
          ...stock.parameters.properties,
          meta: {
            ...stock.parameters.properties.meta,
            properties: { ...stock.parameters.properties.meta.properties, whenToUse: { type: 'number' } },
          },
        },
      },
    })).toBe(false)
    expect(isStockOfficialWorkflowTool({
      ...stock,
      parameters: {
        ...stock.parameters,
        properties: {
          ...stock.parameters.properties,
          meta: {
            ...stock.parameters.properties.meta,
            properties: {
              ...stock.parameters.properties.meta.properties,
              phases: {
                ...stock.parameters.properties.meta.properties.phases,
                items: {
                  ...stock.parameters.properties.meta.properties.phases.items,
                  properties: {
                    ...stock.parameters.properties.meta.properties.phases.items.properties,
                    model: { type: 'number' },
                  },
                },
              },
            },
          },
        },
      },
    })).toBe(false)
  })

  it('uses stock Agent-scoped registrations so the plugin schema and prompt are model-visible', () => {
    const stock = stockOfficialTool()
    let localTool: any
    let localPrompt: any
    const disposed: string[] = []
    const agent = {
      ctx: {
        tools: {
          get: () => localTool ?? stock,
          register(definition: any) {
            if (localTool !== undefined) throw new Error('duplicate local tool')
            localTool = definition
            return () => { disposed.push('tool'); localTool = undefined }
          },
        },
        systemPrompt: {
          section(section: any) {
            if (localPrompt !== undefined) throw new Error('duplicate local prompt')
            localPrompt = section
            return () => { disposed.push('prompt'); localPrompt = undefined }
          },
        },
      },
    }
    const dispose = installWorkflowShadow(agent, services as any)
    expect(localTool.description).toContain('Launch is BACKGROUND')
    expect(localTool.parameters.properties).toHaveProperty('script_path')
    expect(localTool.parameters.properties).toHaveProperty('validate_only')
    expect(localTool.parameters.properties).toHaveProperty('resume_from_run_id')
    expect(localTool.parameters.properties).toHaveProperty('agent_budget')
    expect(localPrompt).toMatchObject({ name: 'tool:workflow', order: 115 })
    expect(localPrompt.text).toContain('Inline script + meta defaults to validate_only')
    dispose()
    dispose()
    expect(disposed).toEqual(['prompt', 'tool'])
    expect(localTool).toBeUndefined()
    expect(localPrompt).toBeUndefined()
  })

  it('fails stock Agent-scoped registration atomically when either public face misbehaves', () => {
    const stock = stockOfficialTool()
    const agent = (tools: any, systemPrompt: any) => ({ ctx: {
      tools: { get: () => stock, ...tools },
      systemPrompt,
    } })
    expect(() => installWorkflowShadow(agent({}, { section: () => () => undefined }), services as any))
      .toThrow(/Agent-scoped/u)
    expect(() => installWorkflowShadow(agent({ register: () => () => undefined }, {}), services as any))
      .toThrow(/Agent-scoped/u)
    expect(() => installWorkflowShadow(agent({ register: () => undefined }, { section: () => () => undefined }), services as any))
      .toThrow(/tool registration did not return a disposer/u)

    const restored = vi.fn()
    expect(() => installWorkflowShadow(agent({ register: () => restored }, { section: () => undefined }), services as any))
      .toThrow(/prompt registration did not return a disposer/u)
    expect(restored).toHaveBeenCalledOnce()

    expect(() => installWorkflowShadow(agent({ register: () => () => { throw new Error('restore failed') } }, {
      section: () => { throw new Error('prompt failed') },
    }), services as any)).toThrow(/prompt failed/u)
  })

  it('replaces official tool and prompt together and restores both', () => {
    const { agent, tools, prompt, restored } = officialPair()
    const dispose = installWorkflowShadow(agent, services as any)
    expect(tools.current.name).toBe('workflow')
    expect(tools.current.parameters).toBeDefined()
    expect(tools.current.output).toBeDefined()
    expect(tools.current.description).toContain('Launch is BACKGROUND')
    expect(prompt.current.text).toMatch(/ONLY when the user explicitly asks/u)
    expect(prompt.current.order).toBe(115)
    expect(prompt.current).not.toHaveProperty('content')
    dispose()
    dispose()
    expect(restored).toEqual(['prompt', 'tool'])
    expect(tools.current).toBe(WORKFLOW_TOOL_DEFINITION)
    expect(prompt.current).toBe(WORKFLOW_PROMPT_SECTION)
  })

  it('installs nothing for a custom same-name tool or missing official prompt', () => {
    const custom = officialPair()
    custom.tools.current = { name: 'workflow', description: 'custom' }
    expect(installWorkflowShadow(custom.agent, services as any)()).toBeUndefined()
    const missingPrompt = officialPair()
    missingPrompt.prompt.get = () => undefined
    expect(installWorkflowShadow(missingPrompt.agent, services as any)()).toBeUndefined()
    const unofficialPrompt = officialPair()
    unofficialPrompt.prompt.current = { name: 'tool:workflow', text: 'custom' }
    expect(installWorkflowShadow(unofficialPrompt.agent, services as any)()).toBeUndefined()
  })

  it('fails closed when both supported shadow seams are missing', () => {
    expect(() => installWorkflowShadow({
      ctx: {
        tools: { get: () => WORKFLOW_TOOL_DEFINITION },
        systemPrompt: { get: () => WORKFLOW_PROMPT_SECTION },
      },
    }, services as any)).toThrow(/verified atomic replacement seams or Agent-scoped/u)
  })

  it('rolls back the tool when prompt replacement fails', () => {
    const { agent, tools } = officialPair()
    agent.ctx.systemPrompt.replaceSection = () => undefined
    expect(() => installWorkflowShadow(agent, services as any)).toThrow(/prompt replacement did not return a disposer/u)
    expect(tools.current).toBe(WORKFLOW_TOOL_DEFINITION)
    const again = officialPair()
    again.tools.replace = () => undefined
    expect(() => installWorkflowShadow(again.agent, services as any)).toThrow(/tool replacement did not return a disposer/u)
  })

  it('reconciles existing and later Agents and ignores self-caused tools/change', async () => {
    const first = officialPair()
    const second = officialPair()
    const listeners = new Map<string, Set<(...args: any[]) => void>>()
    const ctx: any = {
      workflows: services.registry,
      workflowSupervisor: services.supervisor,
      fs: { readBytesNoFollow: async () => new Uint8Array() },
      agents: { list: () => [first.agent] },
      on(event: string, listener: (...args: any[]) => void) {
        const bucket = listeners.get(event) ?? new Set()
        bucket.add(listener)
        listeners.set(event, bucket)
        return () => bucket.delete(listener)
      },
      effect() { /* owned */ },
      logger: { warn: vi.fn() },
    }
    const dispose = applyToolShadow(ctx)
    expect(first.tools.current).not.toBe(WORKFLOW_TOOL_DEFINITION)
    for (const listener of listeners.get('agent/created') ?? []) listener({ agent: second.agent })
    expect(second.tools.current).not.toBe(WORKFLOW_TOOL_DEFINITION)
    await Promise.resolve()
    await Promise.resolve()
    for (const listener of listeners.get('tools/change') ?? []) listener()
    for (const listener of listeners.get('tools/change') ?? []) listener()
    await Promise.resolve()
    await Promise.resolve()
    expect(first.tools.current.description).toContain('Launch is BACKGROUND')
    for (const listener of listeners.get('agent/created') ?? []) listener(undefined)
    for (const listener of listeners.get('agent/created') ?? []) listener({ agent: first.agent })
    for (const listener of listeners.get('agent/disposed') ?? []) listener({ agent: second.agent })
    expect(second.tools.current).toBe(WORKFLOW_TOOL_DEFINITION)
    dispose?.()
    dispose?.()
    expect(first.tools.current).toBe(WORKFLOW_TOOL_DEFINITION)
  })

  it('quiesces stock unscoped tools/change emissions with multiple Agent shadows', async () => {
    const stock = stockOfficialTool()
    const listeners = new Set<() => void>()
    let mutations = 0
    const emitChange = () => { for (const listener of listeners) listener() }
    const makeAgent = () => {
      let local: any
      return {
        ctx: {
          tools: {
            get: () => local ?? stock,
            register(definition: any) {
              mutations += 1
              local = definition
              emitChange()
              return () => {
                mutations += 1
                local = undefined
                emitChange()
              }
            },
          },
          systemPrompt: { section: () => () => undefined },
        },
      }
    }
    const first = makeAgent()
    const second = makeAgent()
    const ctx: any = {
      workflows: services.registry,
      workflowSupervisor: services.supervisor,
      agents: { list: () => [first, second] },
      on(event: string, listener: () => void) {
        if (event !== 'tools/change') return () => undefined
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
      effect() { /* owned */ },
    }

    const dispose = applyToolShadow(ctx)
    expect(mutations).toBe(2)
    emitChange()
    await Promise.resolve()
    await Promise.resolve()
    const settledMutations = mutations
    expect(settledMutations).toBe(6)
    expect(first.ctx.tools.get().description).toContain('Launch is BACKGROUND')
    expect(second.ctx.tools.get().description).toContain('Launch is BACKGROUND')
    await Promise.resolve()
    await Promise.resolve()
    expect(mutations).toBe(settledMutations)
    dispose?.()
    expect(mutations).toBe(8)
  })

  it('can be disabled and fails loud without supervisor services', () => {
    expect(applyToolShadow({}, { enabled: false })).toBeUndefined()
    expect(() => applyToolShadow({ workflows: {}, agents: { list: () => [] } })).toThrow(/shadow services are unavailable/u)
    expect(applyToolShadow({
      workflows: services.registry,
      workflowSupervisor: services.supervisor,
      agents: { list: () => undefined },
      fs: { readBytesNoFollow: async () => new Uint8Array() },
    })).toBeTypeOf('function')
  })

  it('inspects list/section fallbacks and contains replace failures', async () => {
    const warnings: string[] = []
    const listed = {
      ctx: {
        tools: {
          list: () => [WORKFLOW_TOOL_DEFINITION],
          replace: () => { throw new Error('replace failed') },
        },
        systemPrompt: {
          section: () => WORKFLOW_PROMPT_SECTION,
          replaceSection: () => () => undefined,
        },
      },
    }
    const ctx: any = {
      workflows: services.registry,
      workflowSupervisor: services.supervisor,
      agents: { list: () => [listed] },
      on: () => () => undefined,
      logger: { warn: (message: string) => { warnings.push(message) } },
    }
    applyToolShadow(ctx)
    expect(warnings.some(item => item.includes('replace failed'))).toBe(true)

    const getterThrows = {
      ctx: {
        tools: {
          get() { throw new Error('get failed') },
          list() { throw new Error('list failed') },
          workflow: WORKFLOW_TOOL_DEFINITION,
          replace: (name: string, expected: unknown, replacement: unknown) => {
            getterThrows.ctx.tools.workflow = replacement
            return () => { getterThrows.ctx.tools.workflow = expected }
          },
        },
        systemPrompt: {
          get() { throw new Error('prompt get failed') },
          section() { throw new Error('section failed') },
          sections: { get: () => WORKFLOW_PROMPT_SECTION },
          replaceSection: () => () => undefined,
        },
      },
    }
    const restore = installWorkflowShadow(getterThrows, services as any)
    expect(getterThrows.ctx.tools.workflow).not.toBe(WORKFLOW_TOOL_DEFINITION)
    restore()
  })

  it('accepts a supplied replacement object for an official visible tool', () => {
    const { agent, tools } = officialPair()
    const replacement = { name: 'workflow', description: 'supplied' }
    const dispose = installWorkflowShadow(agent, replacement)
    expect(tools.current).toBe(replacement)
    dispose()
  })

  it('contains throwing restorers and non-Error shadow failures', async () => {
    const pair = officialPair()
    const restore = () => { throw new Error('restore failed') }
    pair.tools.replace = () => restore
    pair.prompt.replaceSection = () => restore
    const warnings: unknown[] = []
    const ctx: any = {
      workflows: services.registry,
      workflowSupervisor: services.supervisor,
      agents: { list: () => [pair.agent] },
      on: () => () => undefined,
      logger: { warn: (message: unknown) => { warnings.push(message) } },
    }
    const dispose = applyToolShadow(ctx)
    pair.tools.replace = () => { throw 'boom' }
    await Promise.resolve()
    await Promise.resolve()
    dispose?.()
    const listed = {
      ctx: {
        tools: { get: () => ({ name: 'other' }) },
        systemPrompt: { get: () => undefined },
      },
    }
    expect(installWorkflowShadow(listed, { name: 'workflow' })).toBeTypeOf('function')
    const official = officialPair()
    expect(installWorkflowShadow(official.agent, { name: 'other' })()).toBeUndefined()
  })
})
