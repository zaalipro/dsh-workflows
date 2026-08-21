import { describe, expect, it, vi } from 'vitest'

import { VALIDATION_NOTE } from '../src/supervisor/index.js'
import {
  createWorkflowTool,
  renderLaunch,
  WORKFLOW_TOOL_DEFINITION,
} from '../src/tool/index.js'

const SCRIPT = 'complete({ ok: true })'
const META = { name: 'audit', description: 'd' }
const SIGNAL = new AbortController().signal

function agent(cwd?: string) {
  return {
    session: {
      id: 'session-1',
      header: cwd === undefined ? {} : { cwd },
      events: [] as Array<{ type: string; data: unknown }>,
      append(type: string, data: unknown) { this.events.push({ type, data }) },
    },
  }
}

function exec(extra: { agent?: any; parent?: unknown; signal?: AbortSignal } = {}) {
  return {
    signal: extra.signal ?? SIGNAL,
    ...(extra.agent === undefined ? {} : { agent: extra.agent }),
    ...(extra.parent === undefined ? {} : { parent: extra.parent }),
  }
}

function services(overrides: Record<string, unknown> = {}) {
  const launched: any[] = []
  const validated: any[] = []
  const resumed: any[] = []
  const recorder = {
    sessions: [] as unknown[],
    async launch<T>(session: unknown, start: () => Promise<T>): Promise<T> {
      this.sessions.push(session)
      return start()
    },
  }
  const supervisor = {
    async start(spec: any) {
      launched.push(spec)
      return { status: 'started', displayName: spec.meta.name, runId: 'logical-1', scriptPath: `/tmp/${spec.meta.name}.js` }
    },
    async validate(spec: any) {
      validated.push(spec)
      return { ok: true, status: 'completed', value: { smoke: true }, note: VALIDATION_NOTE }
    },
    async resumeById(runId: string, parent: unknown, agentBudget?: number, signal?: AbortSignal) {
      resumed.push({ runId, parent, agentBudget, signal })
      return { displayName: 'audit', runId }
    },
  }
  const registry = {
    async get(name: string, options?: { cwd?: string }) {
      if (name !== 'audit') return undefined
      return { name: 'audit', description: 'd', script: SCRIPT, path: '/tmp/audit.workflow.json', scope: 'project', cwd: options?.cwd }
    },
  }
  return {
    registry,
    supervisor,
    recorder,
    launched,
    validated,
    resumed,
    ...overrides,
  }
}

describe('workflow tool execute (SH21)', () => {
  it('requires a calling agent before any source or supervisor work', async () => {
    const deps = services()
    const tool = createWorkflowTool(deps as any)
    await expect(tool.execute({ script: SCRIPT, meta: META }, exec())).rejects.toThrow(
      'workflow tool requires a calling agent (exec.agent was undefined)',
    )
    expect(deps.launched).toEqual([])
    expect(deps.validated).toEqual([])
  })

  it('launches in the background and returns the display handle immediately', async () => {
    const deps = services()
    const parent = agent()
    const tool = createWorkflowTool(deps as any)
    await expect(tool.execute({ script: SCRIPT, meta: META, args: { files: ['a.ts'] }, agent_budget: 32 }, exec({ agent: parent }))).resolves.toEqual({
      status: 'started', displayName: 'audit', runId: 'logical-1', script_path: '/tmp/audit.js',
    })
    expect(deps.launched[0]).toMatchObject({ script: SCRIPT, meta: META, args: { files: ['a.ts'] }, agentBudget: 32, parent })
    expect(deps.recorder.sessions).toEqual([parent.session])
  })

  it('does not record nested or Code-Mode transport executions', async () => {
    const deps = services()
    const parent = agent()
    const tool = createWorkflowTool(deps as any)
    await expect(tool.execute({ name: 'audit' }, exec({ agent: parent, parent: Symbol('outer') }))).resolves.toMatchObject({
      status: 'started', displayName: 'audit',
    })
    expect(deps.recorder.sessions).toEqual([])
    expect(deps.launched).toHaveLength(1)
  })

  it('calls supervisor.start directly when the recorder is absent', async () => {
    const deps = services()
    const tool = createWorkflowTool({ registry: deps.registry, supervisor: deps.supervisor } as any)
    await expect(tool.execute({ name: 'audit' }, exec({ agent: agent() }))).resolves.toMatchObject({ status: 'started' })
  })

  it('omits script_path when the supervisor has no editable projection', async () => {
    const deps = services()
    deps.supervisor.start = async (spec: any) => {
      deps.launched.push(spec)
      return { status: 'started', displayName: spec.meta.name, runId: 'logical-1' }
    }
    const tool = createWorkflowTool(deps as any)
    await expect(tool.execute({ script: SCRIPT, meta: META }, exec({ agent: agent() }))).resolves.toEqual({
      status: 'started', displayName: 'audit', runId: 'logical-1',
    })
  })

  it('validate_only returns canonical JSON and never records a Chat prefix', async () => {
    const deps = services()
    const parent = agent()
    const tool = createWorkflowTool(deps as any)
    await expect(tool.execute({ script: SCRIPT, meta: META, args: { n: 1 }, validate_only: true }, exec({ agent: parent }))).resolves.toEqual({
      status: 'validated', ok: true, result: { smoke: true },
    })
    expect(deps.validated[0]).toMatchObject({ parent, args: { n: 1 }, filename: '<inline workflow>' })
    expect(deps.launched).toEqual([])
    expect(deps.recorder.sessions).toEqual([])
    expect(parent.session.events).toEqual([])
  })

  it('omits an absent validate-only value and throws a tool error on failure', async () => {
    const deps = services()
    deps.supervisor.validate = async (spec: any) => {
      deps.validated.push(spec)
      return { ok: true, status: 'completed', note: VALIDATION_NOTE }
    }
    const tool = createWorkflowTool(deps as any)
    await expect(tool.execute({ script: SCRIPT, meta: META, validate_only: true }, exec({ agent: agent() }))).resolves.toEqual({
      status: 'validated', ok: true,
    })
    deps.supervisor.validate = async () => ({ ok: false, status: 'error', error: 'canned execution failed' })
    await expect(tool.execute({
      script: SCRIPT, meta: META, validate_only: true, agent_budget: 7,
    }, exec({ agent: agent() }))).rejects.toThrow('canned execution failed')
  })

  it('returns would pause as a successful smoke result', async () => {
    const deps = services()
    deps.supervisor.validate = async () => ({
      ok: true, status: 'would-pause', value: 'would pause: retry later', note: VALIDATION_NOTE,
    })
    const tool = createWorkflowTool(deps as any)
    await expect(tool.execute({ script: SCRIPT, meta: META, validate_only: true }, exec({ agent: agent() }))).resolves.toEqual({
      status: 'validated', ok: true, result: 'would pause: retry later',
    })
  })

  it('resumes by id without a second recorder run-start', async () => {
    const deps = services()
    const parent = agent()
    const tool = createWorkflowTool(deps as any)
    await expect(tool.execute({ resume_from_run_id: 'run-1', agent_budget: 256 }, exec({ agent: parent }))).resolves.toEqual({
      status: 'resumed', displayName: 'audit', runId: 'run-1',
    })
    expect(deps.resumed).toEqual([{ runId: 'run-1', parent, agentBudget: 256, signal: SIGNAL }])
    expect(deps.recorder.sessions).toEqual([])
  })

  it('owns generic presentation and the background oneOf output', () => {
    const tool = createWorkflowTool(services() as any)
    expect(tool.presentCall!({ script: SCRIPT, meta: META })).toMatchObject({ card: 'generic', title: 'workflow: audit', rawInput: SCRIPT })
    expect(tool.presentCall!({ name: 'audit' })).toMatchObject({ card: 'generic', title: 'workflow: audit' })
    expect(tool.presentCall!({} as any)).toMatchObject({ card: 'generic', title: 'workflow: workflow' })
    expect(tool.presentResult!({ name: 'audit' }, { content: [], isError: false })).toEqual({ card: 'generic' })
    expect(tool.output.schema).toMatchObject({ oneOf: [{}, {}, {}] })
    expect(tool.parameters).toMatchObject({ type: 'object' })
    expect(tool.description).toContain('Launch is BACKGROUND')
    expect(tool.description).not.toContain('The run executes in the foreground')
    expect(JSON.stringify(tool.output.schema)).not.toContain('agentsStarted')
  })

  it('renders validated coverage text without putting the logical id in prose besides JSON', () => {
    const validated = renderLaunch({ status: 'validated', ok: true, result: { answer: 'long' } }, 4)
    expect(validated).toContain('workflow smoke check passed.')
    expect(validated).toContain(VALIDATION_NOTE)
    expect(validated).toContain('… [truncated]')
    expect(renderLaunch({ status: 'validated', ok: true })).toContain('null')
    expect(renderLaunch({ status: 'started', displayName: 'audit', runId: 'logical-1' })).toBe(
      '{"status":"started","displayName":"audit","runId":"logical-1"}',
    )
    expect(renderLaunch({ status: 'resumed', displayName: 'audit', runId: 'logical-1' })).toContain('"status":"resumed"')
    expect(() => renderLaunch({ status: 'future' } as any)).toThrow(/workflow tool output/u)
  })

  it('does not treat a same-name custom tool as official', () => {
    expect(WORKFLOW_TOOL_DEFINITION.name).toBe('workflow')
  })
})
