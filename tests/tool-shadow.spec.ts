import { describe, expect, it, vi } from 'vitest'

import {
  applyToolShadow,
  installWorkflowShadow,
  isOfficialWorkflowTool,
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

  it('fails closed when the H replacement seam is missing', () => {
    expect(() => installWorkflowShadow({
      ctx: {
        tools: { get: () => WORKFLOW_TOOL_DEFINITION },
        systemPrompt: { get: () => WORKFLOW_PROMPT_SECTION },
      },
    }, services as any)).toThrow(/tools.replace and systemPrompt.replaceSection/u)
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
