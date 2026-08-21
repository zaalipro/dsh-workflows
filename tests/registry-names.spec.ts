import { describe, expect, it } from 'vitest'

import {
  assertWorkflowDefinitionName,
  assertWorkflowName,
  isWorkflowDefinitionName,
  isWorkflowName,
} from '../src/registry/names.js'
import { WORKFLOW_SCOPE_PRECEDENCE } from '../src/registry/types.js'

describe('workflow definition names (RS4)', () => {
  it('exports the bundled-project-user precedence tuple', () => {
    expect(WORKFLOW_SCOPE_PRECEDENCE).toEqual(['bundled', 'project', 'user'])
    expect([...WORKFLOW_SCOPE_PRECEDENCE]).toHaveLength(3)
  })

  it.each([
    'a',
    'review-changes',
    'a1',
    'a-1-b2',
    'gpt-4',
    'review-2',
    'a'.repeat(64),
  ])('accepts %j', (name) => {
    expect(isWorkflowDefinitionName(name)).toBe(true)
    expect(isWorkflowName(name)).toBe(true)
    expect(assertWorkflowDefinitionName(name, '/definitions/example.workflow.json')).toBe(name)
    expect(assertWorkflowName(name, 'source')).toBe(name)
  })

  it.each([
    '',
    'a'.repeat(65),
    '1-review',
    'Review',
    'review_changes',
    'review--changes',
    'review-',
    '-review',
    'réview',
    'pause',
    'resume',
    'save',
    'stop',
    'workflow',
    'workflows',
    'create-workflow',
    'con',
    'prn',
    'aux',
    'nul',
    'com1',
    'com2',
    'com9',
    'lpt1',
    'lpt2',
    'lpt9',
  ])('rejects %j', (name) => {
    expect(isWorkflowDefinitionName(name)).toBe(false)
  })

  it('treats Windows device names as case-insensitive even though uppercase already fails kebab-case', () => {
    expect(isWorkflowDefinitionName('CON')).toBe(false)
    expect(isWorkflowDefinitionName('Com1')).toBe(false)
    expect(isWorkflowDefinitionName('con')).toBe(false)
  })

  it('rejects non-string values and reports source context without throwing while rendering', () => {
    expect(isWorkflowDefinitionName(null)).toBe(false)
    expect(isWorkflowDefinitionName(42)).toBe(false)
    expect(isWorkflowDefinitionName(true)).toBe(false)
    expect(isWorkflowDefinitionName(undefined)).toBe(false)
    expect(isWorkflowDefinitionName(1n)).toBe(false)
    expect(isWorkflowDefinitionName(Symbol('name'))).toBe(false)
    expect(isWorkflowDefinitionName(() => 'a')).toBe(false)
    expect(isWorkflowDefinitionName(Number.NaN)).toBe(false)
    const cyclic: { self?: unknown } = {}
    cyclic.self = cyclic
    expect(() => assertWorkflowDefinitionName(cyclic, 'built-in catalog'))
      .toThrow(/^built-in catalog: invalid workflow name <object>/u)
    expect(() => assertWorkflowDefinitionName(null, 'src')).toThrow(/invalid workflow name null/u)
    expect(() => assertWorkflowDefinitionName(undefined, 'src')).toThrow(/invalid workflow name undefined/u)
    expect(() => assertWorkflowDefinitionName(1n, 'src')).toThrow(/invalid workflow name 1n/u)
    expect(() => assertWorkflowDefinitionName(Symbol('x'), 'src')).toThrow(/invalid workflow name <symbol>/u)
    expect(() => assertWorkflowDefinitionName(() => undefined, 'src')).toThrow(/invalid workflow name <function>/u)
    expect(() => assertWorkflowDefinitionName(Number.NaN, 'src')).toThrow(/invalid workflow name NaN/u)
    expect(() => assertWorkflowDefinitionName(false, 'src')).toThrow(/invalid workflow name false/u)
    expect(() => assertWorkflowDefinitionName('pause', 'lookup'))
      .toThrow(/lookup: invalid workflow name "pause"; expected 1–64 UTF-16 code units/u)
  })
})
