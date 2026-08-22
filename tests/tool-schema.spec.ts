import { describe, expect, it } from 'vitest'

import {
  parseWorkflowToolRequest,
  WORKFLOW_TOOL_SCHEMA,
} from '../src/tool/schema.js'

describe('workflow tool request schema', () => {
  it('is an object schema that rejects unknown properties', () => {
    expect(WORKFLOW_TOOL_SCHEMA).toMatchObject({
      type: 'object',
      additionalProperties: false,
      properties: {
        agent_budget: { type: 'integer', minimum: 1, maximum: 1024 },
        args: { type: 'object' },
        validate_only: { type: 'boolean' },
      },
    })
  })

  it('parses each fresh source form', () => {
    expect(parseWorkflowToolRequest({ name: 'review-changes', args: { target: 'main' } })).toEqual({
      kind: 'fresh',
      source: { kind: 'name', name: 'review-changes' },
      args: { target: 'main' },
      validateOnly: false,
    })
    expect(parseWorkflowToolRequest({
      script: 'return 1',
      meta: { name: 'inline', description: 'inline workflow' },
    })).toMatchObject({ validateOnly: true })
    expect(parseWorkflowToolRequest({
      script: 'return 1',
      meta: { name: 'inline', description: 'inline workflow' },
      validate_only: false,
    })).toMatchObject({ validateOnly: false })
    expect(parseWorkflowToolRequest({
      script: 'return 1',
      meta: { name: 'inline', description: 'inline workflow' },
      validate_only: true,
      agent_budget: 1024,
    })).toEqual({
      kind: 'fresh',
      source: {
        kind: 'script',
        script: 'return 1',
        meta: { name: 'inline', description: 'inline workflow' },
      },
      args: {},
      validateOnly: true,
      agentBudget: 1024,
    })
    expect(parseWorkflowToolRequest({ script_path: 'saved.workflow.json' })).toEqual({
      kind: 'fresh',
      source: { kind: 'script_path', path: 'saved.workflow.json' },
      args: {},
      validateOnly: false,
    })
    expect(parseWorkflowToolRequest({
      script_path: 'workflow.js',
      meta: { name: 'from-file', description: 'file workflow' },
    })).toEqual({
      kind: 'fresh',
      source: {
        kind: 'script_path',
        path: 'workflow.js',
        meta: { name: 'from-file', description: 'file workflow' },
      },
      args: {},
      validateOnly: false,
    })
  })

  it('parses resume with only an optional absolute budget', () => {
    expect(parseWorkflowToolRequest({ resume_from_run_id: 'run-1' })).toEqual({
      kind: 'resume', runId: 'run-1',
    })
    expect(parseWorkflowToolRequest({ resume_from_run_id: 'run-1', agent_budget: 129 })).toEqual({
      kind: 'resume', runId: 'run-1', agentBudget: 129,
    })
  })

  it.each([
    {},
    { name: 'one', script: 'two', meta: {} },
    { name: 'one', script_path: 'two.workflow.json' },
    { script: 'one', script_path: 'two.js', meta: {} },
  ])('requires exactly one fresh source: %j', (value) => {
    expect(() => parseWorkflowToolRequest(value)).toThrow(/exactly one source/u)
  })

  it('enforces source/meta combinations', () => {
    expect(() => parseWorkflowToolRequest({ name: 'audit', meta: {} })).toThrow(/name source must not include meta/u)
    expect(() => parseWorkflowToolRequest({ script: 'return 1' })).toThrow(/requires the meta object/u)
    expect(() => parseWorkflowToolRequest({ script: 'return 1', meta: [] })).toThrow(/requires the meta object/u)
    expect(() => parseWorkflowToolRequest({ script_path: 'audit.workflow.json', meta: {} })).toThrow(/must not include meta/u)
    expect(() => parseWorkflowToolRequest({ script_path: 'audit.js' })).toThrow(/requires the meta object/u)
  })

  it.each([null, [], 1, 'args'])('rejects non-object args %j with wrapping guidance', (args) => {
    expect(() => parseWorkflowToolRequest({ name: 'audit', args })).toThrow(/wrap arrays\/scalars in a field/u)
  })

  it.each([0, -1, 1.5, 1025, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid agent budget %s',
    (agent_budget) => {
      expect(() => parseWorkflowToolRequest({ name: 'audit', agent_budget })).toThrow(/1 through 1024/u)
    },
  )

  it.each([
    { name: 'audit' },
    { script: 'return 1', meta: {} },
    { script_path: 'audit.workflow.json' },
    { meta: {} },
    { args: {} },
    { validate_only: false },
  ])('rejects forbidden resume combination %j', (extra) => {
    expect(() => parseWorkflowToolRequest({ resume_from_run_id: 'run-1', ...extra })).toThrow(/cannot be combined/u)
  })

  it('accepts budget 1 and 1024 and treats missing args as an empty object', () => {
    expect(parseWorkflowToolRequest({ name: 'audit', agent_budget: 1 })).toMatchObject({
      kind: 'fresh', agentBudget: 1, args: {},
    })
    expect(parseWorkflowToolRequest({ name: 'audit', agent_budget: 1024, args: {} })).toMatchObject({
      kind: 'fresh', agentBudget: 1024, args: {},
    })
  })

  it('rejects invalid root values, unknown fields, invalid names, and invalid booleans', () => {
    expect(() => parseWorkflowToolRequest(null)).toThrow(/must be an object/u)
    expect(() => parseWorkflowToolRequest({ name: 'audit', surprise: true })).toThrow(/unknown field "surprise"/u)
    expect(() => parseWorkflowToolRequest({ name: 'Bad_Name' })).toThrow(/is invalid/u)
    expect(() => parseWorkflowToolRequest({ name: 'audit', validate_only: 'yes' })).toThrow(/validate_only must be a boolean/u)
    expect(() => parseWorkflowToolRequest({ resume_from_run_id: '' })).toThrow(/non-empty string/u)
    expect(() => parseWorkflowToolRequest({ script: 1, meta: { name: 'audit', description: 'd' } })).toThrow(/script must be a string/u)
    expect(() => parseWorkflowToolRequest({ script_path: '' })).toThrow(/non-empty string/u)
  })

  it('rejects args that are not lossless JSON objects', () => {
    expect(() => parseWorkflowToolRequest({ name: 'audit', args: { n: Number.NaN } })).toThrow(/lossless JSON/u)
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(() => parseWorkflowToolRequest({ name: 'audit', args: cyclic })).toThrow(/lossless JSON/u)
  })

  it('detaches accepted metadata and arguments from caller mutation', () => {
    const meta = { name: 'inline', description: 'description', nested: { ok: true } }
    const args = { nested: { answer: 42 } }
    const parsed = parseWorkflowToolRequest({ script: 'return 1', meta, args })
    meta.nested.ok = false
    args.nested.answer = 0
    expect(parsed).toMatchObject({
      source: { meta: { nested: { ok: true } } },
      args: { nested: { answer: 42 } },
    })
  })
})
