import { describe, expect, it } from 'vitest'

import {
  assertWorkflowDefinitionName,
  isWorkflowDefinitionName,
} from '../src/registry/names.js'

describe('workflow definition names', () => {
  it.each([
    'a',
    'review-changes',
    'a1',
    'a-1-b2',
    'a'.repeat(64),
  ])('accepts %j', (name) => {
    expect(isWorkflowDefinitionName(name)).toBe(true)
    expect(assertWorkflowDefinitionName(name, '/definitions/example.workflow.json')).toBe(name)
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
    'com9',
    'lpt1',
    'lpt9',
  ])('rejects %j', (name) => {
    expect(isWorkflowDefinitionName(name)).toBe(false)
  })

  it('rejects non-string values and reports source context without throwing while rendering', () => {
    expect(isWorkflowDefinitionName(null)).toBe(false)
    expect(isWorkflowDefinitionName(42)).toBe(false)
    const cyclic: { self?: unknown } = {}
    cyclic.self = cyclic
    expect(() => assertWorkflowDefinitionName(cyclic, 'built-in catalog'))
      .toThrow(/^built-in catalog: invalid workflow name <object>/u)
  })
})
