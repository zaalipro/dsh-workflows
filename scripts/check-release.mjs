#!/usr/bin/env node
/**
 * Tarball-first release gate for @zaalipro/dsh-workflows.
 *
 * This command owns the only pack operation.  It records one SHA-256 digest
 * and passes the same absolute archive to every downstream gate.  It never
 * publishes, asks for credentials, opens Ego Lite, or records a browser
 * session; those are release-acceptance responsibilities documented in
 * docs/testing.md.
 */
import { access, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PACKAGE_NAME = '@zaalipro/dsh-workflows'
const DEFAULT_OFFICIALS = [
  process.env.DSH_HARNESS_CHECKOUT,
  resolve(ROOT, '../research/deepseek-harness'),
  '/Users/zaali/dev/research/deepseek-harness',
].filter(Boolean)

const children = new Set()
let interrupted = false
let signalExitCode = 1
let stage = 'arguments'
let options
let temporaryArtifactDir

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (interrupted) return
    interrupted = true
    signalExitCode = signal === 'SIGINT' ? 130 : 143
    for (const child of children) {
      try { child.kill(signal) } catch { /* the child may have exited */ }
    }
  })
}

try {
  await main()
} catch (error) {
  if (interrupted) {
    process.exitCode = signalExitCode
  } else {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`release checks failed at ${stage}: ${message}`)
    process.exitCode = stage === 'arguments' ? 2 : 1
  }
} finally {
  for (const signal of ['SIGINT', 'SIGTERM']) process.removeAllListeners(signal)
  if (temporaryArtifactDir && !options?.keep) {
    await rm(temporaryArtifactDir, { recursive: true, force: true }).catch(() => {})
  }
}

async function main() {
  options = parseArgs(process.argv.slice(2))
  stage = 'manifest'
  const manifest = await readManifest(options.source)
  validateManifest(manifest)

  if (options.tag) {
    stage = 'tag'
    await verifyTag(options.source, options.tag, manifest.version)
  }

  await runPrePackGates(options)
  stage = 'pack'
  const artifact = await packOnce(options.source, options.artifactDir)
  options.tarball = artifact.path
  options.digest = artifact.sha256
  report('release-artifact', artifact)

  stage = 'tarball-gates'
  await verifyTarballGates(options.tarball, options)
  await assertUnchanged(options.tarball, options.digest)
  if (options.artifactDir) await writeArtifactMetadata(options, manifest)

  console.log('release checks passed')
}

function parseArgs(args) {
  const result = {
    source: ROOT,
    official: undefined,
    artifactDir: undefined,
    workspace: undefined,
    tag: process.env.GITHUB_REF_TYPE === 'tag' ? process.env.GITHUB_REF_NAME : undefined,
    keep: false,
  }
  const pathFlags = new Set(['--source', '--official', '--artifact-dir', '--workspace', '--tag'])
  const booleanFlags = new Map([
    ['--keep', 'keep'],
  ])
  const seen = new Set()

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    const boolKey = booleanFlags.get(arg)
    if (boolKey) {
      if (seen.has(arg)) usage(`repeated ${arg}`)
      seen.add(arg)
      result[boolKey] = true
      continue
    }
    if (!pathFlags.has(arg)) usage(`unknown option ${arg}`)
    if (seen.has(arg)) usage(`repeated ${arg}`)
    seen.add(arg)
    const value = args[++index]
    if (!value || value.startsWith('--')) usage(`${arg} requires a value`)
    if (arg !== '--tag' && !isAbsolute(value)) usage(`${arg} must be an absolute path`)
    if (arg === '--source') result.source = resolve(value)
    else if (arg === '--official') result.official = resolve(value)
    else if (arg === '--artifact-dir') result.artifactDir = resolve(value)
    else if (arg === '--workspace') result.workspace = resolve(value)
    else result.tag = value
  }

  return result
}

function usage(reason) {
  const prefix = reason ? `${reason}\n` : ''
  throw new Error(`${prefix}usage: node scripts/check-release.mjs [--source <absolute-dir>] [--artifact-dir <absolute-dir>] [--official <absolute-dir>] [--workspace <absolute-dir>] [--tag <tag>] [--keep]`)
}

async function readManifest(source) {
  const path = join(source, 'package.json')
  let manifest
  try { manifest = JSON.parse(await readFile(path, 'utf8')) } catch (error) {
    throw new Error(`could not read ${path}: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error(`${path} must contain a JSON object`)
  }
  return manifest
}

function validateManifest(manifest) {
  if (manifest.name !== PACKAGE_NAME) throw new Error(`package name must be ${PACKAGE_NAME}`)
  if (typeof manifest.version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u.test(manifest.version)) {
    throw new Error('package version is not valid release SemVer')
  }
  if (manifest.license !== 'MIT') throw new Error('package license must be MIT')
  if (manifest.engines?.node !== '^22.19.0 || >=24.0.0') throw new Error('engines.node does not match release policy')
  if (manifest.packageManager !== 'pnpm@11.7.0') throw new Error('packageManager must be pnpm@11.7.0')
  if (manifest.publishConfig?.access !== 'public') throw new Error('publishConfig.access must be public')
  if (manifest.scripts?.prepare && manifest.scripts.prepare.trim() !== 'node scripts/build.mjs') {
    throw new Error('prepare must only run node scripts/build.mjs')
  }
  for (const hook of ['prepublish', 'prepublishOnly', 'publish', 'postpublish']) {
    if (manifest.scripts && hook in manifest.scripts) throw new Error(`${hook} is forbidden`) 
  }
}

async function verifyTag(source, tag, version) {
  if (tag !== `v${version}`) throw new Error(`tag ${tag} does not match v${version}`)
  const kind = await capture('git', ['cat-file', '-t', tag], { cwd: source })
  if (kind.trim() !== 'tag') throw new Error(`tag ${tag} must be an annotated git tag`)
}

async function runPrePackGates(opts) {
  stage = 'release-inputs'
  await Promise.all([
    'scripts/build.mjs',
    'scripts/verify-package.mjs',
    'scripts/verify-docs.mjs',
    'scripts/packed-consumer.mjs',
    'scripts/browser-smoke.mjs',
    'tests/keyless-snapshot.spec.ts',
    'tests/dashboard-snapshot.client.spec.tsx',
    'tests/packed-consumer.spec.ts',
    'tests/browser-smoke.spec.ts',
    'tests/race-stress.spec.ts',
    'tests/storage-stress.spec.ts',
    'tests/client-race-stress.client.spec.ts',
    'tests/real-provider.spec.ts',
    'tests/docs.spec.ts',
    'tests/ci-workflow.spec.ts',
    'tests/release-workflow.spec.ts',
  ].map(path => requireFile(join(opts.source, path), `release input ${path}`)))

  stage = 'clean'
  await cleanOutputs(opts.source)

  stage = 'frozen-install'
  await runPnpm(['install', '--frozen-lockfile', '--ignore-scripts'], opts.source)

  stage = 'build'
  await runPnpm(['run', 'build'], opts.source)
  stage = 'typecheck'
  await runPnpm(['run', 'typecheck'], opts.source)
  stage = 'lint'
  await runPnpm(['run', 'lint'], opts.source)
  stage = 'coverage'
  await runPnpm(['run', 'test:coverage'], opts.source)
  stage = 'snapshot'
  await runPnpm(['run', 'test:snapshot'], opts.source)
  stage = 'docs'
  await runPnpm(['run', 'doc-sync'], opts.source)
  stage = 'package-source'
  await runNode(join(opts.source, 'scripts/verify-package.mjs'), ['--source', opts.source], opts.source)
}

async function cleanOutputs(source) {
  await Promise.all([
    rm(join(source, 'lib'), { recursive: true, force: true }),
    rm(join(source, 'coverage'), { recursive: true, force: true }),
    rm(join(source, 'tsconfig.host.tsbuildinfo'), { force: true }),
    rm(join(source, 'tsconfig.client.tsbuildinfo'), { force: true }),
  ])
  report('clean')
}

async function packOnce(source, artifactDir) {
  let destination = artifactDir
  if (destination) await mkdir(destination, { recursive: true })
  else {
    temporaryArtifactDir = await mkdtemp(join(tmpdir(), 'dsh-workflows-release-'))
    destination = temporaryArtifactDir
  }
  // `prepare` is only for Git installs. The release closure was already built,
  // so packing must not run lifecycle scripts and mutate the tested bytes.
  const output = await capturePnpm(
    ['pack', '--json', '--pack-destination', destination, '--config.ignore-scripts=true'],
    source,
    { ...process.env, npm_config_ignore_scripts: 'true', NPM_CONFIG_IGNORE_SCRIPTS: 'true' },
  )
  const reported = packedFilename(output)
  let path = isAbsolute(reported) ? reported : resolve(destination, reported)
  await requireFile(path, 'packed tarball')
  // A pnpm version may ignore --pack-destination and write beside package.json;
  // copy those exact bytes into the requested artifact directory, without
  // invoking pack again.
  if (!path.startsWith(`${resolve(destination)}${pathSep()}`)) {
    const copied = join(destination, path.split(/[\\/]/u).at(-1))
    await writeFile(copied, await readFile(path))
    path = copied
  }
  const digest = await sha256(path)
  const filename = path.split(/[\\/]/u).at(-1)
  await writeFile(`${path}.sha256`, `${digest}  ${filename}\n`, 'utf8')
  return { path, filename, sha256: digest, bytes: (await stat(path)).size }
}

function packedFilename(output) {
  const values = []
  for (const line of output.split(/\r?\n/u)) {
    const text = line.trim()
    if (!text) continue
    try { values.push(JSON.parse(text)) } catch { /* warnings can precede JSON */ }
  }
  if (values.length === 0) {
    const first = output.indexOf('{')
    const last = output.lastIndexOf('}')
    if (first >= 0 && last > first) {
      try { values.push(JSON.parse(output.slice(first, last + 1))) } catch { /* report below */ }
    }
  }
  const files = []
  const visit = value => {
    if (typeof value === 'string' && value.endsWith('.tgz')) files.push(value)
    else if (Array.isArray(value)) value.forEach(visit)
    else if (value && typeof value === 'object') Object.values(value).forEach(visit)
  }
  values.forEach(visit)
  if (!files.length) throw new Error('pnpm pack --json did not report a .tgz filename')
  return files.at(-1)
}

async function verifyTarballGates(tarball, opts) {
  await requireFile(tarball, '--tarball')
  stage = 'package-tarball'
  await runNode(join(opts.source, 'scripts/verify-package.mjs'), ['--tarball', tarball], opts.source)
  await assertUnchanged(tarball, opts.digest)

  const official = await findOfficial(opts.official)
  if (!official) throw new Error('official Harness checkout is required; pass --official <absolute-dir>')
  const env = {
    ...process.env,
    DSH_WORKFLOWS_TARBALL: tarball,
    DSH_HARNESS_CHECKOUT: official,
    ...(opts.workspace ? { DSH_WORKSPACE: opts.workspace } : {}),
  }

  stage = 'packed-consumer'
  await runNode(join(opts.source, 'scripts/packed-consumer.mjs'), ['--tarball', tarball, '--official', official], opts.source, env)
  await assertUnchanged(tarball, opts.digest)

  stage = 'browser'
  await runPnpm(['run', 'test:browser'], opts.source, env)
  await assertUnchanged(tarball, opts.digest)
  stage = 'stress'
  await runPnpm(['run', 'test:stress'], opts.source, env)
  await assertUnchanged(tarball, opts.digest)
  stage = 'real-provider'
  await runPnpm(['run', 'test:e2e'], opts.source, env)
  await assertUnchanged(tarball, opts.digest)
}

async function findOfficial(explicit) {
  for (const candidate of [explicit, ...DEFAULT_OFFICIALS]) {
    if (!candidate) continue
    try {
      const info = await stat(candidate)
      if (info.isDirectory()) {
        await access(join(candidate, 'package.json'), constants.R_OK)
        return resolve(candidate)
      }
    } catch { /* try the next candidate */ }
  }
  return undefined
}

async function writeArtifactMetadata(opts, manifest) {
  const tag = /-/u.test(manifest.version) ? 'next' : 'latest'
  const metadata = {
    package: PACKAGE_NAME,
    version: manifest.version,
    filename: opts.tarball,
    sha256: opts.digest,
    distTag: tag,
    publish: `npm publish ${JSON.stringify(opts.tarball)} --access public --provenance --tag ${tag}`,
  }
  await writeFile(join(opts.artifactDir, 'release-artifact.json'), `${JSON.stringify(metadata, null, 2)}\n`, 'utf8')
}

async function assertUnchanged(path, expected) {
  const actual = await sha256(path)
  if (expected && actual !== expected) throw new Error(`tarball changed during verification (expected ${expected}, got ${actual})`)
}

async function sha256(path) { return createHash('sha256').update(await readFile(path)).digest('hex') }

async function requireFile(path, label) {
  try {
    const info = await stat(path)
    if (!info.isFile()) throw new Error('not a regular file')
    await access(path, constants.R_OK)
  } catch { throw new Error(`${label} is not readable: ${path}`) }
}

function pathSep() { return process.platform === 'win32' ? '\\' : '/' }
function pnpmBin() { return process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm' }
function runPnpm(args, cwd, env) { return runChild(pnpmBin(), args, { cwd, env }) }
function capturePnpm(args, cwd, env = process.env) { return runChild(pnpmBin(), args, { cwd, env, capture: true }) }
function runNode(file, args, cwd, env) { return runChild(process.execPath, [file, ...args], { cwd, env }) }
function capture(file, args, options = {}) { return runChild(file, args, { ...options, capture: true }) }

function runChild(file, args, { cwd = ROOT, env = process.env, capture: shouldCapture = false } = {}) {
  return new Promise((resolveRun, rejectRun) => {
    if (interrupted) return rejectRun(new Error('release checks interrupted'))
    const child = spawn(file, args, {
      cwd,
      env: { ...env },
      shell: process.platform === 'win32' && /(?:^|[\\/])pnpm(?:\.cmd)?$/u.test(file),
      stdio: shouldCapture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    })
    children.add(child)
    let stdout = ''
    let stderr = ''
    let settled = false
    const finish = (fn, value) => {
      if (settled) return
      settled = true
      children.delete(child)
      fn(value)
    }
    if (shouldCapture) {
      child.stdout.setEncoding('utf8')
      child.stderr.setEncoding('utf8')
      child.stdout.on('data', chunk => { stdout += chunk })
      child.stderr.on('data', chunk => { stderr += chunk })
    }
    child.once('error', error => finish(rejectRun, error))
    child.once('exit', (code, signal) => {
      if (code === 0) finish(resolveRun, shouldCapture ? stdout : undefined)
      else {
        const tail = (stderr || stdout).trim().slice(-4_000)
        finish(rejectRun, new Error(`${file} ${args.join(' ')} exited ${code ?? `by ${signal}`}${tail ? `: ${tail}` : ''}`))
      }
    })
  })
}

function report(stageName, details = {}) {
  console.log(JSON.stringify({ kind: 'release-stage', stage: stageName, ...details }))
}
