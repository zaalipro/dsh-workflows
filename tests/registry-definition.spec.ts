import { describe, expect, it } from 'vitest'

import {
  filenameStem,
  parseDefinitionFile,
  parseWorkflowDefinition,
  serializeDefinition,
  serializeWorkflowDefinition,
  validateDefinitionEnvelope,
} from '../src/registry/definition.js'

const PATH = '/tmp/review-changes.workflow.json'
const encoder = new TextEncoder()

function envelope(overrides: Record<string, unknown> = {}) {
  return {
    meta: {
      name: 'review-changes',
      description: 'Review a diff',
      ...((overrides.meta as object | undefined) ?? {}),
    },
    script: 'complete({ ok: true })',
    ...overrides,
  }
}

function bytes(value: unknown): Uint8Array {
  return encoder.encode(typeof value === 'string' ? value : JSON.stringify(value))
}

describe('workflow envelopes (RS5)', () => {
  it('parses a phase-bearing envelope and keeps metadata as data', () => {
    const raw = {
      meta: {
        name: 'review-changes',
        description: 'Review a diff',
        whenToUse: 'Before merge',
        phases: [{ title: 'Inspect', detail: 'Read the diff', provider: 'openai', model: 'gpt' }],
      },
      script: 'complete({ done: true })',
    }
    const parsed = parseWorkflowDefinition(bytes(raw), PATH, 'project', 'review-changes', 1024)
    expect(parsed).toEqual({
      name: 'review-changes',
      description: 'Review a diff',
      whenToUse: 'Before merge',
      phases: [{ title: 'Inspect', detail: 'Read the diff', provider: 'openai', model: 'gpt' }],
      path: PATH,
      script: 'complete({ done: true })',
      scope: 'project',
    })
  })

  it('serializes canonical pretty JSON with key order meta then script and a final LF', () => {
    const serialized = serializeWorkflowDefinition({
      meta: { name: 'review-changes', description: 'Review a diff' },
      script: 'complete({ ok: true })',
    })
    expect(Buffer.from(serialized).toString('utf8')).toBe(`${JSON.stringify({
      meta: { name: 'review-changes', description: 'Review a diff' },
      script: 'complete({ ok: true })',
    }, null, 2)}\n`)
    expect(serializeDefinition({
      meta: { name: 'review-changes', description: 'Review a diff' },
      script: 'complete({ ok: true })',
    }).endsWith('\n')).toBe(true)
  })

  it('rejects invalid UTF-8, oversize bytes, and a non-Uint8Array body', () => {
    expect(() => parseWorkflowDefinition(new Uint8Array([0xff]), PATH, 'user', 'review-changes', 16))
      .toThrow(/definition is not valid UTF-8/u)
    expect(() => parseWorkflowDefinition(bytes(envelope()), PATH, 'user', 'review-changes', 4))
      .toThrow(/definition exceeds the 4-byte limit/u)
    expect(() => parseWorkflowDefinition('{}' as unknown as Uint8Array, PATH, 'user', 'review-changes', 16))
      .toThrow(/workflow definition bytes must be a Uint8Array/u)
    expect(() => parseWorkflowDefinition(bytes(envelope()), PATH, 'user', 'review-changes', 1.5))
      .toThrow(/definition byte limit must be a positive safe integer/u)
  })

  it('rejects scalar and array JSON roots with the envelope object suffix', () => {
    for (const raw of ['null', '[]', '1', '"text"']) {
      expect(() => parseDefinitionFile(raw, PATH, 'review-changes'))
        .toThrow(/a workflow envelope must be a JSON object with \{ meta, script \}/u)
    }
  })

  it('rejects invalid JSON with the spec detail suffix', () => {
    expect(() => parseDefinitionFile('{', PATH, 'review-changes')).toThrow(/not valid JSON — /u)
    expect(() => parseDefinitionFile(1 as unknown as string, PATH, 'review-changes'))
      .toThrow(/workflow definition text must be a string/u)
  })

  it('rejects missing, extra, and mistyped envelope fields', () => {
    expect(() => parseDefinitionFile(JSON.stringify({ meta: envelope().meta }), PATH, 'review-changes'))
      .toThrow(/a workflow envelope must be a JSON object with \{ meta, script \}/u)
    expect(() => parseDefinitionFile(JSON.stringify({
      meta: envelope().meta, script: 'return 1', extra: true, also: 1,
    }), PATH, 'a')).toThrow(/unknown envelope field\(s\) extra, also \(expected \{ meta, script \}\)/u)
    expect(() => parseDefinitionFile(JSON.stringify({
      meta: envelope().meta, script: 1,
    }), PATH, 'review-changes')).toThrow(/envelope "script" must be a string/u)
  })

  it('rejects unknown metadata and phase fields and a filename mismatch', () => {
    expect(() => parseDefinitionFile(JSON.stringify({
      meta: { name: 'review-changes', description: 'x', fork: true },
      script: 'return 1',
    }), PATH, 'review-changes')).toThrow(/unknown metadata field\(s\) fork/u)
    expect(() => parseDefinitionFile(JSON.stringify({
      meta: { name: 'review-changes', description: 'x', phases: [{ title: 'A', extra: 1 }] },
      script: 'return 1',
    }), PATH, 'review-changes')).toThrow(/unknown phase field\(s\) extra/u)
    expect(() => parseDefinitionFile(JSON.stringify({
      meta: { name: 'other', description: 'x' },
      script: 'return 1',
    }), PATH, 'review-changes')).toThrow(/filename "review-changes\.workflow.json" must match meta.name "other"/u)
  })

  it('rejects malformed names from the filename stem and from meta.name', () => {
    expect(() => parseDefinitionFile(JSON.stringify({
      meta: { name: 'review-changes', description: 'x' }, script: 'return 1',
    }), '/tmp/Bad_Name.workflow.json', 'Bad_Name'))
      .toThrow(/filename stem "Bad_Name" is not a valid workflow name/u)
    expect(() => parseDefinitionFile(JSON.stringify({
      meta: { name: 'Bad_Name', description: 'x' }, script: 'return 1',
    }), PATH, 'review-changes')).toThrow(/invalid workflow name/u)
  })

  it('extracts filename stems from POSIX and Windows paths', () => {
    expect(filenameStem('review-changes.workflow.json')).toBe('review-changes')
    expect(filenameStem('/tmp/review-changes.workflow.json')).toBe('review-changes')
    expect(filenameStem('C:\\tmp\\review-changes.workflow.json')).toBe('review-changes')
    expect(filenameStem('readme.txt')).toBe('readme.txt')
  })

  it('validates in-memory envelopes before save serialization', () => {
    expect(() => validateDefinitionEnvelope(null as never)).toThrow(/JSON object with \{ meta, script \}/u)
    expect(() => validateDefinitionEnvelope({
      meta: { name: 'review-changes', description: 'x' }, script: 'return 1', extra: true,
    } as never)).toThrow(/unknown envelope field\(s\) extra/u)
    expect(() => validateDefinitionEnvelope({
      meta: { name: 'review-changes', description: 'x' },
    } as never)).toThrow(/JSON object with \{ meta, script \}/u)
    expect(() => validateDefinitionEnvelope({
      meta: { name: 'review-changes', description: 'x' }, script: 1,
    } as never)).toThrow(/envelope "script" must be a string/u)
    const clean = validateDefinitionEnvelope({
      meta: { name: 'review-changes', description: 'Review', whenToUse: 'now', phases: [{ title: 'Go' }] },
      script: 'return 1',
    })
    expect(clean.meta.whenToUse).toBe('now')
    expect(clean.meta.phases).toEqual([{ title: 'Go' }])
  })

  it('rejects non-object meta, empty required strings, and malformed phases', () => {
    expect(() => parseDefinitionFile(JSON.stringify({
      meta: ['x'], script: 'return 1',
    }), PATH, 'review-changes')).toThrow(/meta must be a plain object/u)
    expect(() => parseDefinitionFile(JSON.stringify({
      meta: { name: '', description: 'x' }, script: 'return 1',
    }), PATH, 'review-changes')).toThrow(/meta.name must be a non-empty string/u)
    expect(() => parseDefinitionFile(JSON.stringify({
      meta: { name: 'review-changes', description: 'x', phases: 'nope' }, script: 'return 1',
    }), PATH, 'review-changes')).toThrow(/meta.phases must be an array/u)
    expect(() => parseDefinitionFile(JSON.stringify({
      meta: { name: 'review-changes', description: 'x', phases: [null] }, script: 'return 1',
    }), PATH, 'review-changes')).toThrow(/meta.phases\[0\] must be a plain object/u)
    expect(() => parseDefinitionFile(JSON.stringify({
      meta: { name: 'review-changes', description: 'x', whenToUse: 1 }, script: 'return 1',
    }), PATH, 'review-changes')).toThrow(/meta.whenToUse must be a string/u)
    expect(() => parseDefinitionFile(JSON.stringify({
      meta: { name: 'review-changes', description: 'x', phases: [{ title: '' }] }, script: 'return 1',
    }), PATH, 'review-changes')).toThrow(/meta.phases\[0\].title must be a non-empty string/u)
  })

  it('treats Object.create(null) envelopes as plain objects and keeps optional phase fields', () => {
    const raw = Object.assign(Object.create(null), {
      meta: Object.assign(Object.create(null), {
        name: 'review-changes',
        description: 'Review',
        phases: [Object.assign(Object.create(null), { title: 'Inspect', detail: 'x' })],
      }),
      script: 'return 1',
    })
    expect(validateDefinitionEnvelope(raw as never).script).toBe('return 1')
    expect(parseDefinitionFile(JSON.stringify(raw), PATH, 'review-changes').phases).toEqual([
      { title: 'Inspect', detail: 'x' },
    ])
  })
})
