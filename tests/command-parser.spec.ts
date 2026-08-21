import { describe, expect, it } from 'vitest'

import {
  parseWorkflowCommand,
  WORKFLOW_COMMAND_HELP,
} from '../src/commands/parser.js'

describe('parseWorkflowCommand', () => {
  it.each(['', ' ', '\n\t'])('parses empty input %j without side effects', (input) => {
    expect(parseWorkflowCommand(input)).toEqual({ kind: 'empty' })
  })

  it('does not validate definition names or display handles while parsing', () => {
    expect(parseWorkflowCommand('Review')).toEqual({ kind: 'launch', name: 'Review', args: {} })
    expect(parseWorkflowCommand('pause CON')).toEqual({ kind: 'pause', displayName: 'CON' })
    expect(parseWorkflowCommand('stop review-changes-2')).toEqual({
      kind: 'stop', displayName: 'review-changes-2',
    })
  })

  it('parses bare and object-argument launches', () => {
    expect(parseWorkflowCommand('review-changes')).toEqual({
      kind: 'launch', name: 'review-changes', args: {},
    })
    expect(parseWorkflowCommand('  review-changes\t{ "nested": { "text": "a b" }, "ok": true }  ')).toEqual({
      kind: 'launch',
      name: 'review-changes',
      args: { nested: { text: 'a b' }, ok: true },
    })
  })

  it('retains prototype-shaped keys as ordinary JSON data', () => {
    const parsed = parseWorkflowCommand('review-changes {"__proto__":{"polluted":true},"constructor":"data"}')
    expect(parsed.kind).toBe('launch')
    if (parsed.kind !== 'launch') throw new Error('expected a launch')
    expect(Object.getOwnPropertyDescriptor(parsed.args, '__proto__')?.value).toEqual({ polluted: true })
    expect(parsed.args.constructor).toBe('data')
    expect(Object.prototype).not.toHaveProperty('polluted')
  })

  it.each(['pause', 'resume', 'stop', 'save'] as const)('parses the %s control', (kind) => {
    expect(parseWorkflowCommand(`${kind} review-changes-2`)).toEqual({
      kind, displayName: 'review-changes-2',
    })
  })

  it.each(['pause', 'resume', 'stop', 'save'] as const)('rejects missing and extra %s operands', (verb) => {
    expect(parseWorkflowCommand(verb)).toEqual({
      kind: 'malformed', error: `Usage: /workflow ${verb} <display-name>`,
    })
    expect(parseWorkflowCommand(`${verb} one two`)).toEqual({
      kind: 'malformed', error: `Usage: /workflow ${verb} <display-name>`,
    })
  })

  it('returns exact errors for malformed and non-object launch JSON', () => {
    expect(parseWorkflowCommand('audit {bad')).toEqual({
      kind: 'malformed',
      error: 'trailing args for "audit" must be one JSON object — {bad',
    })
    for (const suffix of ['null', 'false', '42', '"text"', '[1,2]']) {
      expect(parseWorkflowCommand(`audit ${suffix}`)).toEqual({
        kind: 'malformed',
        error: 'trailing args for "audit" must be a JSON object (wrap arrays/scalars in a field)',
      })
    }
  })
})

describe('WORKFLOW_COMMAND_HELP', () => {
  it('contains the exact multiline usage and all five examples', () => {
    expect(WORKFLOW_COMMAND_HELP).toBe([
      'Launch or control a workflow.',
      '',
      'Usage:',
      '/workflow <name> [<json-args>]',
      '/workflow pause <display-name>',
      '/workflow resume <display-name>',
      '/workflow stop <display-name>',
      '/workflow save <display-name>',
      '',
      'Examples:',
      '/workflow review-changes {"target":"origin/main...HEAD"}',
      '/workflow pause review-changes',
      '/workflow resume review-changes',
      '/workflow stop review-changes-2',
      '/workflow save review-changes',
    ].join('\n'))
  })
})
