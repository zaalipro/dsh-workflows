import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '..')
const packedRunner = resolve(root, 'scripts/packed-consumer.mjs')
const packageVerifier = resolve(root, 'scripts/verify-package.mjs')

function digest(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function command(file: string, args: readonly string[], env?: NodeJS.ProcessEnv): {
  status: number | null
  stdout: string
  stderr: string
} {
  const result = spawnSync(process.execPath, [file, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    maxBuffer: 8 * 1024 * 1024,
  })
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

function packageManifest(): Record<string, any> {
  return JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as Record<string, any>
}

function packedFilename(output: string): string {
  const values: unknown[] = []
  for (const line of output.split(/\r?\n/u)) {
    const text = line.trim()
    if (!text) continue
    try { values.push(JSON.parse(text)) } catch { /* pnpm warnings can precede JSON */ }
  }
  if (values.length === 0) {
    const first = output.indexOf('{')
    const last = output.lastIndexOf('}')
    if (first >= 0 && last > first) {
      try { values.push(JSON.parse(output.slice(first, last + 1))) } catch { /* report below */ }
    }
  }
  const files: string[] = []
  const visit = (value: unknown): void => {
    if (typeof value === 'string' && value.endsWith('.tgz')) files.push(value)
    else if (Array.isArray(value)) value.forEach(visit)
    else if (value && typeof value === 'object') Object.values(value).forEach(visit)
  }
  values.forEach(visit)
  if (files.length === 0) throw new Error(`pnpm pack --json did not report a .tgz filename:\n${output}`)
  return files.at(-1)!
}

let packed: { dir: string; path: string; sha256: string } | undefined

function ensurePacked(): { dir: string; path: string; sha256: string } {
  if (packed) return packed
  const dir = mkdtempSync(join(tmpdir(), 'dsh-workflows-pack-'))
  const output = execFileSync('pnpm', [
    'pack', '--json', '--pack-destination', dir, '--config.ignore-scripts=true',
  ], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, npm_config_ignore_scripts: 'true', NPM_CONFIG_IGNORE_SCRIPTS: 'true' },
  })
  const reported = packedFilename(output)
  const path = reported.startsWith('/') ? reported : resolve(dir, reported)
  packed = { dir, path, sha256: digest(path) }
  return packed
}

afterAll(() => {
  if (packed) rmSync(packed.dir, { recursive: true, force: true })
})

describe('packed consumer release boundary', () => {
  it('keeps the consumer runner argument-safe, isolated, and tarball-first', () => {
    const source = readFileSync(packedRunner, 'utf8')
    expect(source).toContain("'--ignore-scripts'")
    expect(source).toContain('HOME: home')
    expect(source).toContain('PNPM_STORE_DIR: store')
    expect(source).toContain('official-h-probe')
    expect(source).not.toMatch(/\bpnpm\s+pack\b/u)
    expect(readFileSync(resolve(root, 'scripts/check-release.mjs'), 'utf8')).toContain('--config.ignore-scripts=true')
    expect(source).not.toMatch(/src[\\/]index\.ts/u)
    expect(source).not.toMatch(/deepseek-harness.*package\.json/u)

    const malformed = command(packedRunner, ['--tarball', 'relative.tgz', '--official', '/tmp/official'])
    expect(malformed.status).toBe(2)
    expect(malformed.stderr).toMatch(/usage: packed-consumer\.mjs/u)

    const repeated = command(packedRunner, [
      '--tarball', '/tmp/a.tgz', '--tarball', '/tmp/b.tgz', '--official', '/tmp/official',
    ])
    expect(repeated.status).toBe(2)
    expect(repeated.stderr).toMatch(/usage: packed-consumer\.mjs/u)
  })

  it('exposes the complete public export contract without source fallback', () => {
    const manifest = packageManifest()
    expect(Object.keys(manifest.exports)).toEqual([
      '.', './registry', './supervisor', './run-recorder', './user-questions', './commands', './tool',
      './client', './types', './invariant', './typert', './remote', './cordis.patch.yml',
      './skills/create-workflow/SKILL.md', './package.json',
    ])
    expect(manifest.files).toEqual(expect.arrayContaining(['docs', 'README.md']))
    expect(manifest.files).not.toEqual(expect.arrayContaining(['src', 'tests', 'node_modules']))
    expect(JSON.stringify(manifest.exports)).not.toMatch(/(?:\.\.[\\/]|[\\/]src[\\/])/u)

    const clientExport = manifest.exports['./client']
    const clientRuntime = typeof clientExport === 'string' ? clientExport : clientExport.default
    expect(clientRuntime).toBe('./lib/client.js')
    expect(readFileSync(resolve(root, clientRuntime), 'utf8')).toContain('@zaalipro/dsh-workflows')
    expect(statSync(resolve(root, `${clientRuntime}.map`)).isFile()).toBe(true)
  })

  it('packs once, verifies policy, and preserves the tarball digest', { timeout: 120_000 }, () => {
    const artifact = ensurePacked()
    const verified = command(packageVerifier, ['--tarball', artifact.path], { DEEPSEEK_API_KEY: undefined })
    expect(verified.status, verified.stderr).toBe(0)
    expect(verified.stdout.trim()).toBe('package verification passed')
    expect(digest(artifact.path)).toBe(artifact.sha256)
  })

  it.skipIf(process.env.DSH_RUN_PACKED_CONSUMER !== '1')(
    'runs one unchanged artifact through the isolated external consumer',
    { timeout: 300_000 },
    () => {
      const artifact = ensurePacked()
      const official = process.env.DSH_OFFICIAL_CHECKOUT ?? process.env.DSH_HARNESS_CHECKOUT
      expect(official, 'DSH_OFFICIAL_CHECKOUT or DSH_HARNESS_CHECKOUT is required for the isolated consumer').toBeTruthy()
      const before = digest(artifact.path)
      const result = command(packedRunner, ['--tarball', artifact.path, '--official', resolve(official!)], {
        DEEPSEEK_API_KEY: undefined,
        DSH_RUN_PACKED_CONSUMER: undefined,
      })
      expect(result.status, result.stderr).toBe(0)
      expect(result.stdout).toContain('official-h-probe')
      expect(result.stdout.trim()).toContain('packed consumer passed')
      expect(digest(artifact.path)).toBe(before)
    },
  )
})
