import { execFileSync } from 'node:child_process'
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '..')
const verifier = resolve(root, 'scripts/verify-package.mjs')

describe('package policy verifier', () => {
  it('accepts a complete source fixture', () => withFixture(fixture => runVerifier('--source', fixture)))

  it('accepts a complete tarball', () => withFixture(fixture => {
    const tarball = makeTarball(fixture)
    runVerifier('--tarball', tarball)
  }))

  it.each([
    ['identity', (manifest: any) => { manifest.name = 'wrong-name' }],
    ['dependency class', (manifest: any) => { manifest.dependencies.clsx = 'file:../clsx' }],
    ['export set', (manifest: any) => { delete manifest.exports['./remote'] }],
    ['outside export', (manifest: any) => { manifest.exports['./registry'].default = '../outside.js' }],
  ])('rejects a %s policy violation', (_name, mutate) => withFixture(fixture => {
    const manifestPath = join(fixture, 'package.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    mutate(manifest)
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
    expectFailure('--source', fixture)
  }))

  it('rejects an archive with a parent-traversing member', () => withFixture(fixture => {
    const tarball = join(fixture, 'malicious.tgz')
    writeFileSync(tarball, gzipSync(Buffer.concat([
      tarHeader('../../outside.txt', Buffer.from('outside\n')),
      Buffer.alloc(1024),
    ])))
    expectFailure('--tarball', tarball)
    expect(() => readFileSync(join(fixture, '..', 'outside.txt'))).toThrow()
  }))

  it('rejects a tarball missing the notice', () => withFixture(fixture => {
    const tarball = makeTarball(fixture, new Set(['package/NOTICE.md']))
    expectFailure('--tarball', tarball)
  }))

  it('rejects a tarball missing the packaged skill', () => withFixture(fixture => {
    const tarball = makeTarball(fixture, new Set(['package/skills/create-workflow/SKILL.md']))
    expectFailure('--tarball', tarball)
  }))

  it('rejects a tarball missing the client bundle', () => withFixture(fixture => {
    const tarball = makeTarball(fixture, new Set(['package/lib/client.js']))
    expectFailure('--tarball', tarball)
  }))

  it('rejects a source fixture missing a required peer', () => withFixture(fixture => {
    const manifestPath = join(fixture, 'package.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    delete manifest.peerDependencies.react
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
    expectFailure('--source', fixture)
  }))

  it('rejects a tarball missing the packed user guide', () => withFixture(fixture => {
    const tarball = makeTarball(fixture, new Set(['package/docs/user-guide.md']))
    expectFailure('--tarball', tarball)
  }))

  it('rejects an empty client factory', () => withFixture(fixture => {
    writeFileSync(join(fixture, 'lib/client.js'), 'window.__ModuleLoader__?.load({ id: "@zaalipro/dsh-workflows", factory: () => ({}) })\n')
    expectFailure('--source', fixture)
  }))
})

function withFixture(callback: (fixture: string) => void) {
  const fixture = mkdtempSync(join(tmpdir(), 'dsh-package-fixture-'))
  try {
    makeFixture(fixture)
    callback(fixture)
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
}

function makeFixture(fixture: string) {
  mkdirSync(join(fixture, 'lib/types'), { recursive: true })
  mkdirSync(join(fixture, 'lib/client-types'), { recursive: true })
  mkdirSync(join(fixture, 'skills/create-workflow'), { recursive: true })
  const jsExports = [
    'types/index', 'types/registry/index', 'types/supervisor/index',
    'types/run-recorder', 'types/user-questions', 'types/commands/index',
    'types/tool/index', 'types/types', 'types/invariant',
  ]
  for (const name of jsExports) {
    const path = join(fixture, `lib/${name}.js`)
    mkdirSync(resolve(path, '..'), { recursive: true })
    const basename = name.split('/').at(-1)!
    writeFileSync(path, `export const fixture = true\n//# sourceMappingURL=${basename}.js.map\n`)
    writeFileSync(join(resolve(path, '..'), `${basename}.js.map`), '{"version":3,"sources":[]}\n')
    writeFileSync(join(fixture, `lib/${name}.d.ts`), 'export declare const fixture: boolean\n')
  }
  writeFileSync(join(fixture, 'lib/client-types/index.d.ts'), 'export declare const fixture: boolean\n')
  writeFileSync(join(fixture, 'lib/client.js'), 'window.__ModuleLoader__.load({\n  id: "@zaalipro/dsh-workflows",\n  factory: (require) => ({ apply() {} })\n})\n//# sourceMappingURL=client.js.map\n')
  const typert = [
    'export const workflowDefinitions_list = true',
    'export const workflowRuns_list = true',
    'export const workflowRuns_detail = true',
    'export const workflowRuns_members = true',
    'export const workflowRuns_memberDetail = true',
    'export const workflowRuns_logs = true',
    'export const workflowRuns_result = true',
    'export const workflowRuns_artifacts = true',
    'export const workflowRuns_artifact = true',
    'export const workflowRuns_control = true',
    'export const workflowDefinitions = true',
    'export const workflowRuns = true',
  ].join('\n')
  for (const name of ['typert.host', 'typert.remote-client']) {
    writeFileSync(join(fixture, `lib/${name}.js`), `${typert}\n`)
    writeFileSync(join(fixture, `lib/${name}.d.ts`), 'export declare const fixture: boolean\n')
  }
  writeFileSync(join(fixture, 'lib/client.js.map'), '{"version":3,"sources":[]}\n')
  writeFileSync(join(fixture, 'cordis.patch.yml'), '[]\n')
  writeFileSync(join(fixture, 'skills/create-workflow/SKILL.md'), '# create-workflow\n')
  mkdirSync(join(fixture, 'docs'), { recursive: true })
  writeFileSync(join(fixture, 'README.md'), '# README\n')
  writeFileSync(join(fixture, 'docs/user-guide.md'), '# User guide\n')
  writeFileSync(join(fixture, 'docs/architecture.md'), '# Architecture\n')
  writeFileSync(join(fixture, 'docs/testing.md'), '# Testing\n')
  writeFileSync(join(fixture, 'LICENSE'), readFileSync(join(root, 'LICENSE')))
  writeFileSync(join(fixture, 'NOTICE.md'), readFileSync(join(root, 'NOTICE.md')))
  writeFileSync(join(fixture, 'package.json'), `${JSON.stringify(makeManifest(), null, 2)}\n`)
}

function makeManifest() {
  const target = (name: string) => ({ types: `./lib/${name}.d.ts`, default: `./lib/${name}.js` })
  const exports: Record<string, unknown> = {
    '.': target('types/index'), './registry': target('types/registry/index'), './supervisor': target('types/supervisor/index'),
    './run-recorder': target('types/run-recorder'), './user-questions': target('types/user-questions'),
    './commands': target('types/commands/index'), './tool': target('types/tool/index'),
    './client': { types: './lib/client-types/index.d.ts', default: './lib/client.js' },
    './types': target('types/types'), './invariant': target('types/invariant'),
    './typert': target('typert.host'), './remote': target('typert.remote-client'),
    './cordis.patch.yml': './cordis.patch.yml', './skills/create-workflow/SKILL.md': './skills/create-workflow/SKILL.md',
    './package.json': './package.json',
  }
  const peers = {
    '@deepseek-ai/cordis': '>=4.0.1', '@deepseek-ai/dsh-client-connection': '>=0.1.0-rc.8',
    '@deepseek-ai/dsh-client-ui-conversation': '>=0.1.0-rc.8',
    '@deepseek-ai/dsh-workflow': '>=0.1.0-rc.8', '@deepseek-ai/dsh-workflow-worker-thread': '>=0.1.0-rc.8', react: '>=18',
  }
  return {
    name: '@zaalipro/dsh-workflows', version: '0.1.0-rc.2', type: 'module', license: 'MIT',
    engines: { node: '^22.19.0 || >=24.0.0' }, packageManager: 'pnpm@11.7.0', publishConfig: { access: 'public' },
    main: './lib/types/index.js', types: './lib/types/index.d.ts',
    files: [
      'lib/types', 'lib/client-types', 'lib/client.js', 'lib/client.js.map',
      'lib/typert.host.js', 'lib/typert.host.d.ts',
      'lib/typert.remote-client.js', 'lib/typert.remote-client.d.ts',
      'skills', 'cordis.patch.yml', 'README.md', 'docs', 'LICENSE', 'NOTICE.md', 'package.json',
    ], exports,
    dependencies: { chokidar: '^4.0.0', clsx: '^2.1.1', 'fs-native-extensions': '1.5.0' },
    peerDependencies: peers, devDependencies: { ...peers },
    dsh: { bundle: { patch: './cordis.patch.yml' }, client: { platform: 'web', inject: ['@deepseek-ai/dsh-client-connection', '@deepseek-ai/dsh-client-ui-conversation'] } },
  }
}

function makeTarball(fixture: string, omitted = new Set<string>()) {
  const tarball = join(fixture, 'package.tgz')
  const members: Buffer[] = []
  const walk = (relative: string) => {
    const absolute = join(fixture, relative)
    if (lstatSync(absolute).isDirectory()) {
      for (const child of readdirSync(absolute)) walk(join(relative, child))
      return
    }
    const archivePath = `package/${relative.replaceAll('\\', '/')}`
    if (!omitted.has(archivePath)) members.push(tarHeader(archivePath, readFileSync(absolute)))
  }
  walk('')
  writeFileSync(tarball, gzipSync(Buffer.concat([...members, Buffer.alloc(1024)])))
  return tarball
}

function tarHeader(name: string, data: Buffer) {
  const header = Buffer.alloc(512)
  header.write(name, 0, 100, 'utf8'); header.write('0000644\0', 100, 8, 'ascii')
  header.write('0000000\0', 108, 8, 'ascii'); header.write('0000000\0', 116, 8, 'ascii')
  header.write(`${data.length.toString(8).padStart(11, '0')}\0`, 124, 12, 'ascii')
  header.write('00000000000\0', 136, 12, 'ascii'); header.fill(0x20, 148, 156); header[156] = 0x30
  header.write('ustar\0', 257, 6, 'ascii'); header.write('00', 263, 2, 'ascii')
  const sum = [...header].reduce((total, byte) => total + byte, 0)
  header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii')
  return Buffer.concat([header, data, Buffer.alloc((512 - (data.length % 512)) % 512)])
}

function runVerifier(mode: string, path: string) {
  const output = execFileSync(process.execPath, [verifier, mode, path], { encoding: 'utf8', cwd: root })
  expect(output.trim()).toBe('package verification passed')
}

function expectFailure(mode: string, path: string) {
  try {
    execFileSync(process.execPath, [verifier, mode, path], { encoding: 'utf8', cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
    throw new Error('verifier unexpectedly passed')
  } catch (error: any) {
    if (!error.status) throw error
    const stderr = String(error.stderr ?? '')
    expect(stderr).toMatch(/^package verification failed: .+\n$/u)
    expect(stderr.trim().split('\n')).toHaveLength(1)
  }
}
