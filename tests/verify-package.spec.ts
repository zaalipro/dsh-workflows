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
  mkdirSync(join(fixture, 'lib'), { recursive: true })
  mkdirSync(join(fixture, 'skills/create-workflow'), { recursive: true })
  const jsExports = [
    'index', 'registry/index', 'supervisor/index', 'run-recorder', 'user-questions',
    'commands/index', 'tool/index', 'client/index', 'client', 'types', 'invariant',
    'typert', 'remote',
  ]
  for (const name of jsExports) {
    const path = join(fixture, `lib/${name}.js`)
    mkdirSync(resolve(path, '..'), { recursive: true })
    const basename = name.split('/').at(-1)!
    writeFileSync(path, `export const fixture = true\n//# sourceMappingURL=${basename}.js.map\n`)
    writeFileSync(join(resolve(path, '..'), `${basename}.js.map`), '{"version":3,"sources":[]}\n')
    writeFileSync(join(fixture, `lib/${name}.d.ts`), 'export declare const fixture: boolean\n')
  }
  for (const name of ['typert.host', 'typert.remote-client']) {
    writeFileSync(join(fixture, `lib/${name}.js`), 'export const fixture = true\n')
    writeFileSync(join(fixture, `lib/${name}.d.ts`), 'export declare const fixture: boolean\n')
  }
  writeFileSync(join(fixture, 'lib/client.js.map'), '{"version":3,"sources":[]}\n')
  writeFileSync(join(fixture, 'cordis.patch.yml'), '[]\n')
  writeFileSync(join(fixture, 'skills/create-workflow/SKILL.md'), '# create-workflow\n')
  writeFileSync(join(fixture, 'LICENSE'), readFileSync(join(root, 'LICENSE')))
  writeFileSync(join(fixture, 'NOTICE.md'), readFileSync(join(root, 'NOTICE.md')))
  writeFileSync(join(fixture, 'package.json'), `${JSON.stringify(makeManifest(), null, 2)}\n`)
}

function makeManifest() {
  const target = (name: string) => ({ types: `./lib/${name}.d.ts`, default: `./lib/${name}.js` })
  const exports: Record<string, unknown> = {
    '.': target('index'), './registry': target('registry/index'), './supervisor': target('supervisor/index'),
    './run-recorder': target('run-recorder'), './user-questions': target('user-questions'),
    './commands': target('commands/index'), './tool': target('tool/index'), './client': target('client/index'),
    './types': target('types'), './invariant': target('invariant'), './typert': target('typert'), './remote': target('remote'),
    './cordis.patch.yml': './cordis.patch.yml', './skills/create-workflow/SKILL.md': './skills/create-workflow/SKILL.md',
    './package.json': './package.json',
  }
  const peers = {
    '@deepseek-ai/cordis': '>=4.0.1', '@deepseek-ai/dsh-client-connection': '>=0.1.0-rc.8',
    '@deepseek-ai/dsh-workflow': '>=0.1.0-rc.8', '@deepseek-ai/dsh-workflow-worker-thread': '>=0.1.0-rc.8', react: '>=18',
  }
  return {
    name: '@zaalipro/dsh-workflows', version: '0.1.0-rc.1', type: 'module', license: 'MIT',
    engines: { node: '^22.19.0 || >=24.0.0' }, packageManager: 'pnpm@11.7.0', publishConfig: { access: 'public' },
    files: ['lib', 'skills', 'cordis.patch.yml', 'LICENSE', 'NOTICE.md', 'package.json'], exports,
    dependencies: { chokidar: '^4.0.0', clsx: '^2.1.1', 'fs-native-extensions': '1.5.0' },
    peerDependencies: peers, devDependencies: { ...peers },
    dsh: { bundle: { patch: './cordis.patch.yml' }, client: { platform: 'web', inject: ['@deepseek-ai/dsh-client-connection'] } },
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
