import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'

const repository = resolve(import.meta.dirname, '..')

describe('documentation verifier', () => {
  it('accepts the complete bilingual documentation tree', () => withFixture(fixture => {
    expect(runVerifier(fixture).trim()).toBe('documentation verification passed')
  }))

  it('rejects a missing Chinese companion', () => withFixture(fixture => {
    unlinkSync(join(fixture, 'README.zh.md'))
    expectFailure(fixture, /README\.md: missing Chinese companion README\.zh\.md/u)
  }))

  it('rejects a stale translation mapping', () => withFixture(fixture => {
    mutate(join(fixture, 'README.md'), text => text.replace(
      'one installable DeepSeek Harness bundle',
      'one independently installable DeepSeek Harness bundle',
    ))
    expectFailure(fixture, /README\.i18n\.yaml: hash for README\.md does not match current file/u)
  }))

  it('rejects a broken Markdown fragment', () => withFixture(fixture => {
    const guide = join(fixture, 'docs/user-guide.md')
    mutate(guide, text => text.replace('../README.md#installation', '../README.md#missing-installation'))
    refreshMapping(fixture, 'docs/user-guide.md')
    expectFailure(fixture, /docs\/user-guide\.md: broken Markdown fragment \.\.\/README\.md#missing-installation/u)
  }))

  it('rejects an absolute developer-machine path', () => withFixture(fixture => {
    const readme = join(fixture, 'README.md')
    mutate(readme, text => `${text.trimEnd()}\n\nLocal checkout: /Users/example/dev/dsh-workflows\n`)
    refreshMapping(fixture, 'README.md')
    expectFailure(fixture, /README\.md: contains an absolute developer-machine path/u)
  }))

  it('rejects a guessed rc9 compatibility claim in either language', () => withFixture(fixture => {
    const readme = join(fixture, 'README.zh.md')
    mutate(readme, text => `${text.trimEnd()}\n\n0.1.0-rc.9 与本包兼容。\n`)
    refreshMapping(fixture, 'README.md')
    expectFailure(fixture, /README\.zh\.md: names unverified rc9/u)
  }))

  it('checks required content in the Chinese companion', () => withFixture(fixture => {
    const readme = join(fixture, 'README.zh.md')
    mutate(readme, text => text.replace('## 移除', '## 删除'))
    refreshMapping(fixture, 'README.md')
    expectFailure(fixture, /README\.zh\.md: missing required section\/content "## 移除"/u)
  }))

  it('requires an exact two-entry blob mapping', () => withFixture(fixture => {
    const mapping = join(fixture, 'README.i18n.yaml')
    mutate(mapping, text => `${text.trimEnd()}\nextra.md: ${'0'.repeat(40)}\n`)
    expectFailure(fixture, /README\.i18n\.yaml: mapping must contain exactly README\.md and README\.zh\.md/u)
  }))

  it('keeps grok and ds notes from claiming to be the current package runbook', () => {
    const grok = readFileSync(join(repository, 'grok_workflows.md'), 'utf8')
    const ds = readFileSync(join(repository, 'ds_workflows.md'), 'utf8')
    expect(grok).toContain('@zaalipro/dsh-workflows')
    expect(grok).toMatch(/\/workflows` are Host commands/u)
    expect(grok).toContain('not the current runbook')
    expect(ds).toContain('@zaalipro/dsh-workflows')
    expect(ds).toMatch(/\/workflows`/u)
    expect(ds).toContain('not the current runbook')
  })

  it('documents the packed-consumer probe and exact official checkout without a Harness patch', () => {
    const testing = readFileSync(join(repository, 'docs/testing.md'), 'utf8')
    expect(testing).toContain('official-host-probe')
    expect(testing).toContain('no Harness source patch')
    expect(testing).toContain('a66e4702047846cdaa10c66c9d3df3951f5ea70d')
    expect(testing).toContain('ConversationNodeAssembler')
    expect(testing).not.toContain('applies a Harness patch')
  })

  it('documents enforced inclusive array bounds in both user-guide languages', () => {
    const english = readFileSync(join(repository, 'docs/user-guide.md'), 'utf8')
    const chinese = readFileSync(join(repository, 'docs/user-guide.zh.md'), 'utf8')
    expect(english).toContain('`minItems` and `maxItems` are inclusive array-length bounds')
    expect(english).toContain('must satisfy `minItems <= maxItems`')
    expect(english).toContain('is forbidden beside `oneOf`')
    expect(english).toContain('post-validates the returned structured value')
    expect(english).not.toContain('Bound array length in the prompt and in JavaScript')
    expect(chinese).toContain('`minItems` 和 `maxItems` 是包含端点的 array-length bound')
    expect(chinese).toContain('必须满足 `minItems <= maxItems`')
    expect(chinese).toContain('不能与 `oneOf` 并列')
    expect(chinese).not.toContain('Array 长度在 prompt 与 JavaScript 中限制')
  })
})

function withFixture(callback: (fixture: string) => void) {
  const fixture = mkdtempSync(join(tmpdir(), 'dsh-docs-fixture-'))
  try {
    mkdirSync(join(fixture, 'scripts'), { recursive: true })
    cpSync(join(repository, 'scripts/verify-docs.mjs'), join(fixture, 'scripts/verify-docs.mjs'))
    for (const file of ['README.md', 'README.zh.md', 'README.i18n.yaml', 'LICENSE', 'NOTICE.md']) {
      cpSync(join(repository, file), join(fixture, file))
    }
    for (const directory of ['docs', 'skills', '.agents']) {
      cpSync(join(repository, directory), join(fixture, directory), { recursive: true })
    }
    callback(fixture)
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
}

function runVerifier(fixture: string) {
  return execFileSync(process.execPath, [join(fixture, 'scripts/verify-docs.mjs')], {
    cwd: fixture,
    encoding: 'utf8',
  })
}

function expectFailure(fixture: string, diagnostic: RegExp) {
  const result = spawnSync(process.execPath, [join(fixture, 'scripts/verify-docs.mjs')], {
    cwd: fixture,
    encoding: 'utf8',
  })
  expect(result.status).toBe(1)
  expect(result.stdout).toBe('')
  expect(result.stderr).toMatch(/^documentation verification failed: .+\n$/u)
  expect(result.stderr.trim().split('\n')).toHaveLength(1)
  expect(result.stderr).toMatch(diagnostic)
}

function mutate(path: string, update: (text: string) => string) {
  const next = update(readFileSync(path, 'utf8'))
  writeFileSync(path, next.endsWith('\n') ? next : `${next}\n`)
}

function refreshMapping(fixture: string, englishRelative: string) {
  const english = join(fixture, englishRelative)
  const chinese = english.replace(/\.md$/u, '.zh.md')
  const mapping = english.replace(/\.md$/u, '.i18n.yaml')
  mkdirSync(dirname(mapping), { recursive: true })
  writeFileSync(mapping, [
    '# Bilingual-pair consistency record: git blob hash of each side at the last',
    '# confirmed-consistent state. Both languages carry equal authority.',
    `${basename(english)}: ${blobHash(english)}`,
    `${basename(chinese)}: ${blobHash(chinese)}`,
    '',
  ].join('\n'))
}

function blobHash(path: string) {
  const bytes = readFileSync(path)
  return createHash('sha1').update(`blob ${bytes.byteLength}\0`).update(bytes).digest('hex')
}
