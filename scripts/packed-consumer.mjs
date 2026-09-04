#!/usr/bin/env node
import { access, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import vm from 'node:vm'

const HERE = dirname(fileURLToPath(import.meta.url))
const OFFICIAL_COMMIT = 'a66e4702047846cdaa10c66c9d3df3951f5ea70d'
const OUTPUT_TAIL_BYTES = 1024 * 1024
const activeChildren = new Set()
let interruptedSignal

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (interruptedSignal !== undefined) return
    interruptedSignal = signal
    for (const child of activeChildren) terminate(child, signal)
    setTimeout(() => {
      for (const child of activeChildren) terminate(child, 'SIGKILL')
    }, 2_000).unref()
  })
}

let workspace
let keep = false
let stage = 'arguments'
try {
  const options = parseArgs(process.argv.slice(2))
  keep = options.keep
  await requireFile(options.tarball, '--tarball')
  await requireFile(join(options.official, 'package.json'), '--official')
  workspace = await mkdtemp(join(tmpdir(), 'dsh-workflows-consumer-'))
  const home = join(workspace, 'home')
  const cache = join(workspace, 'cache')
  const store = join(workspace, 'store')
  await mkdir(home, { recursive: true })
  await mkdir(cache, { recursive: true })
  await mkdir(store, { recursive: true })
  const env = {
    ...process.env, HOME: home, DSH_HOME: home, npm_config_cache: cache,
    PNPM_HOME: join(workspace, 'pnpm-home'), PNPM_STORE_DIR: store,
    COREPACK_HOME: process.env.COREPACK_HOME ?? join(homedir(), '.cache/node/corepack'),
  }
  await writeFile(join(workspace, 'package.json'), JSON.stringify({
    name: 'dsh-workflows-packed-consumer', private: true, type: 'module', packageManager: 'pnpm@11.7.0',
  }, null, 2) + '\n')
  report('workspace', { path: keep ? workspace : '<temporary>' })

  stage = 'install'
  const officialSpecs = await officialRuntimeSpecs(options.official)
  // The official release publishes its Typert registry under a prerelease
  // dist-tag; pin it explicitly so pnpm does not try to resolve the invalid
  // stable-only peer range emitted by the upstream package graph.
  await command('pnpm', [
    'add', '--config.dedupe-peer-dependents=true', '--save-dev', '--ignore-scripts',
    'typescript@5.9.3', '@types/node@22.20.1', '@deepseek-ai/dsh@0.1.2-rc.1',
    '@deepseek-ai/schemastery@3.18.2', ...officialSpecs,
  ], { cwd: workspace, env })
  await command('pnpm', ['add', '--ignore-scripts', options.tarball], { cwd: workspace, env })
  const installedManifestPath = join(workspace, 'node_modules/@zaalipro/dsh-workflows/package.json')
  const installedManifest = JSON.parse(await readFile(installedManifestPath, 'utf8'))
  if (installedManifest.version !== '0.1.0-rc.5'
    || installedManifest.dsh?.compatibility?.host !== '@deepseek-ai/dsh'
    || installedManifest.dsh?.compatibility?.evaluator !== 'plugin-compat-engine-v1'
    || JSON.stringify(installedManifest.dsh?.compatibility?.versions) !== JSON.stringify(['0.1.2-rc.1'])) {
    throw new Error('installed plugin version or compatibility metadata does not match the release contract')
  }
  await requireFile(join(dirname(installedManifestPath), 'lib/compat-engine/index.js'), 'installed compatibility evaluator')
  await requireFile(join(dirname(installedManifestPath), 'lib/compat-engine/worker.cjs'), 'installed compatibility worker')
  // The standalone export/type consumer is not a DSH profile and has no
  // healed Host fallback. Supply its declared peers explicitly; the separate
  // probes below prove the artifact itself never auto-installs them.
  const peers = Object.entries(installedManifest.peerDependencies ?? {}).map(([name, range]) => `${name}@${range}`)
  await command('pnpm', ['add', '--config.auto-install-peers=false', '--ignore-scripts', ...peers], { cwd: workspace, env })
  report(stage)

  stage = 'optional-peer-isolation'
  await runOptionalPeerProbe(options.tarball, env)
  report(stage, { autoInstallPeers: true, hostPeers: 'not-materialized' })

  stage = 'plain-node-imports'
  const codeExports = ['.', './registry', './supervisor', './run-recorder', './user-questions', './commands', './tool', './types', './invariant', './typert', './remote']
  for (const subpath of codeExports) {
    const specifier = subpath === '.' ? '@zaalipro/dsh-workflows' : `@zaalipro/dsh-workflows${subpath.slice(1)}`
    await command(process.execPath, ['--input-type=module', '--eval', `await import(${JSON.stringify(specifier)})`], { cwd: workspace, env })
  }
  report(stage, { exports: codeExports.length })

  stage = 'strict-nodenext-types'
  const imports = codeExports.filter(item => item !== './client').map((item, index) => {
    const specifier = item === '.' ? '@zaalipro/dsh-workflows' : `@zaalipro/dsh-workflows${item.slice(1)}`
    return `import type * as T${index} from ${JSON.stringify(specifier)}; type V${index} = keyof typeof T${index};`
  }).join('\n')
  await writeFile(join(workspace, 'consumer.ts'), `${imports}\nexport {};\n`)
  await writeFile(join(workspace, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2024', lib: ['ES2024', 'ESNext.Disposable'], module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, noEmit: true, skipLibCheck: false, types: ['node'] }, files: ['consumer.ts'] }, null, 2) + '\n')
  const tsc = resolve(workspace, 'node_modules/typescript/bin/tsc')
  await command(process.execPath, [tsc, '-p', 'tsconfig.json', '--pretty', 'false'], { cwd: workspace, env })
  report(stage)

  stage = 'client-artifact'
  const manifestPath = installedManifestPath
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  const clientTarget = typeof manifest.exports?.['./client'] === 'string' ? manifest.exports['./client'] : manifest.exports?.['./client']?.default
  if (typeof clientTarget !== 'string') throw new Error('installed package has no client runtime export')
  const clientFile = resolve(dirname(manifestPath), clientTarget)
  const client = await readFile(clientFile, 'utf8')
  const registrations = []
  vm.runInNewContext(client, { window: { __ModuleLoader__: { load(value) { registrations.push(value) } } } }, { filename: clientFile })
  if (registrations.length !== 1 || registrations[0]?.id !== '@zaalipro/dsh-workflows' || typeof registrations[0]?.factory !== 'function') throw new Error('client artifact did not register one lazy module')
  const map = JSON.parse(await readFile(`${clientFile}.map`, 'utf8'))
  if (map.version !== 3) throw new Error('client source map is invalid')
  report(stage)

  stage = 'package-policy'
  const verifier = resolve(HERE, 'verify-package.mjs')
  await command(process.execPath, [verifier, '--tarball', options.tarball], { cwd: workspace, env })
  report(stage)

  // The release artifact is accepted only against the exact official Host
  // version represented by this consumer checkout.
  stage = 'official-host-probe'
  const officialManifest = JSON.parse(await readFile(join(options.official, 'package.json'), 'utf8'))
  if (officialManifest.version !== '0.1.2-rc.1') throw new Error(`official Harness 0.1.2-rc.1 is required, got ${String(officialManifest.version)}`)
  const revision = (await command('git', ['-C', options.official, 'rev-parse', 'HEAD'], { cwd: workspace, env, timeoutMs: 30_000 })).stdout.trim()
  if (revision !== OFFICIAL_COMMIT) throw new Error(`official Harness checkout must be ${OFFICIAL_COMMIT}, got ${revision}`)
  report(stage, { version: officialManifest.version, commit: revision, activation: 'verified' })
  stage = 'official-profile-cycle'
  await runOfficialProfileCycle(options.tarball, env)
  report(stage, { profiles: ['headless', 'web'], activation: 'add-boot-remove-restored' })
  console.log('packed consumer passed')
} catch (error) {
  console.error(JSON.stringify({ kind: 'packed-consumer-error', stage, error: error instanceof Error ? error.message : String(error) }))
  process.exitCode = interruptedSignal === 'SIGINT' ? 130
    : interruptedSignal === 'SIGTERM' ? 143
      : stage === 'arguments' ? 2 : 1
} finally {
  for (const child of activeChildren) terminate(child, 'SIGTERM')
  if (workspace && !keep) await rm(workspace, { recursive: true, force: true }).catch(() => {})
  else if (workspace && keep) console.error(`packed consumer workspace kept at ${workspace}`)
}

function parseArgs(args) {
  let tarball; let official; let foundKeep = false
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--keep') { if (foundKeep) usage(); foundKeep = true; continue }
    if (arg !== '--tarball' && arg !== '--official') usage()
    const value = args[++index]
    if (!value || !isAbsolute(value)) usage()
    if (arg === '--tarball') { if (tarball) usage(); tarball = value }
    else { if (official) usage(); official = value }
  }
  if (!tarball || !official) usage()
  return { tarball: resolve(tarball), official: resolve(official), keep: foundKeep }
}
function usage() { throw new Error('usage: packed-consumer.mjs --tarball <absolute-file> --official <absolute-checkout> [--keep]') }
async function requireFile(path, flag) { try { await access(path, constants.R_OK) } catch { throw new Error(`${flag} is not readable: ${path}`) } }
function report(name, detail = {}) { console.log(JSON.stringify({ kind: 'stage', stage: name, ...detail })) }
async function runOfficialProfileCycle(tarball, env) {
  // Exercise the published, prebuilt official CLI rather than a source checkout
  // whose workspace packages may intentionally lack generated lib/ artifacts.
  // The checkout version/commit is verified separately above; this exact npm
  // package version is what users install and what resolves the plugin peers.
  const cliBin = join(workspace, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
  await requireFile(cliBin, 'official Harness npm CLI')
  const cli = args => command(process.execPath, [cliBin, ...args], { cwd: workspace, env })
  for (const profile of ['headless', 'web']) {
    await cli(['plugin', '--profile', profile, 'add', '--ignore-scripts', tarball])
    const profileManifestPath = join(env.DSH_HOME, 'profiles', profile, 'package.json')
    const installed = JSON.parse(await readFile(profileManifestPath, 'utf8'))
    if (typeof installed.dependencies?.['@zaalipro/dsh-workflows'] !== 'string') {
      throw new Error(`${profile}: plugin add did not install @zaalipro/dsh-workflows`)
    }
    const layers = installed.dsh?.profile?.bundles
    if (!Array.isArray(layers) || layers.filter(value => value === '@zaalipro/dsh-workflows').length !== 1) {
      throw new Error(`${profile}: plugin add did not create exactly one workflow bundle layer`)
    }
    // A help path can exit before the Loader activates plugins. Mount an
    // injected one-shot probe above the real profile instead: it waits for the
    // plugin-owned services, awaits Loader settlement, records activation,
    // requests graceful app exit, and records effect teardown. Run it twice in
    // the same isolated DSH_HOME to prove the storage lease is released.
    await runActivationProbe(cliBin, profile, env)
    // Profile boot above heals the official installation fallback. Assert the
    // resulting module graph before the second activation can use it.
    await assertOfficialProfileIsolation(profile, env)
    await runActivationProbe(cliBin, profile, env)
    await cli(['plugin', '--profile', profile, 'remove', '@zaalipro/dsh-workflows'])
    const restored = JSON.parse(await readFile(profileManifestPath, 'utf8'))
    if (restored.dependencies?.['@zaalipro/dsh-workflows'] !== undefined
      || restored.dsh?.profile?.bundles?.includes('@zaalipro/dsh-workflows')) {
      throw new Error(`${profile}: plugin remove did not restore the stock profile manifest`)
    }
    // Removal is checked by the manifest restoration above. A stock --help
    // does not provide activation evidence and is intentionally not claimed.
  }
}
async function runOptionalPeerProbe(tarball, env) {
  const probe = await mkdtemp(join(tmpdir(), 'dsh-workflows-optional-peers-'))
  try {
    await writeFile(join(probe, 'package.json'), JSON.stringify({ name: 'optional-peer-probe', private: true }, null, 2) + '\n')
    await writeFile(join(probe, 'pnpm-workspace.yaml'), 'packages:\n  - .\n\nnodeLinker: hoisted\nautoInstallPeers: true\n')
    await command('pnpm', ['add', '--ignore-scripts', tarball], { cwd: probe, env })
    const manifest = JSON.parse(await readFile(join(probe, 'node_modules/@zaalipro/dsh-workflows/package.json'), 'utf8'))
    const peers = Object.keys(manifest.peerDependencies ?? {})
    if (peers.length === 0 || Object.keys(manifest.peerDependenciesMeta ?? {}).length !== peers.length
      || peers.some(name => manifest.peerDependenciesMeta?.[name]?.optional !== true)) {
      throw new Error('packed manifest must mark every peer optional')
    }
    for (const name of peers) {
      if (await exists(join(probe, 'node_modules', ...name.split('/'), 'package.json'))) {
        throw new Error(`autoInstallPeers:true materialized optional peer ${name}`)
      }
    }
  } finally {
    await rm(probe, { recursive: true, force: true })
  }
}
async function assertOfficialProfileIsolation(profile, env) {
  const profileDir = join(env.DSH_HOME, 'profiles', profile)
  const workspaceConfig = await readFile(join(profileDir, 'pnpm-workspace.yaml'), 'utf8')
  if (!/^autoInstallPeers:\s*false\s*$/mu.test(workspaceConfig)) {
    throw new Error(`${profile}: official profile must retain autoInstallPeers:false`)
  }
  const lock = await readFile(join(profileDir, 'pnpm-lock.yaml'), 'utf8')
  if (!/^\s*autoInstallPeers:\s*false\s*$/mu.test(lock)) {
    throw new Error(`${profile}: profile lockfile did not retain autoInstallPeers:false`)
  }
  const pluginManifestPath = join(profileDir, 'node_modules/@zaalipro/dsh-workflows/package.json')
  const manifest = JSON.parse(await readFile(pluginManifestPath, 'utf8'))
  const requireFromPlugin = createRequire(pluginManifestPath)
  const requireFromFallback = createRequire(join(env.DSH_HOME, 'profiles', 'package.json'))
  for (const name of Object.keys(manifest.peerDependencies ?? {})) {
    const localManifest = join(profileDir, 'node_modules', ...name.split('/'), 'package.json')
    // React is a UI framework peer, not a Host identity package. The official
    // Web bundle may legitimately place it in the profile while headless
    // profiles omit it entirely.
    if (name === 'react') {
      if (await exists(localManifest)) continue
    }
    if (await exists(localManifest)) throw new Error(`${profile}: materialized profile-local Host peer ${name}`)
    let resolved
    try { resolved = requireFromPlugin.resolve(name) }
    catch (error) { throw new Error(`${profile}: optional peer ${name} did not resolve through the official fallback: ${String(error)}`) }
    let officialTarget
    try { officialTarget = await realpath(requireFromFallback.resolve(name)) }
    catch (error) { throw new Error(`${profile}: official healed fallback is missing ${name}: ${String(error)}`) }
    if (await realpath(resolved) !== officialTarget) {
      throw new Error(`${profile}: optional peer ${name} did not resolve to the official healed fallback target`)
    }
  }
  // These two Host plugins both exchange dsh-scope identity-bearing values.
  // Resolve their imports from their actual entry anchors (not a package.json
  // subpath, which a package may not export) and require one physical module.
  const requireFromProfile = createRequire(join(profileDir, 'package.json'))
  const loopEntry = requireFromProfile.resolve('@deepseek-ai/dsh-agent-loop')
  const presetsEntry = requireFromProfile.resolve('@deepseek-ai/dsh-agent-presets')
  const loopScope = await realpath(createRequire(loopEntry).resolve('@deepseek-ai/dsh-scope'))
  const presetsScope = await realpath(createRequire(presetsEntry).resolve('@deepseek-ai/dsh-scope'))
  if (loopScope !== presetsScope) {
    throw new Error(`${profile}: dsh-scope split identity between official agent-loop and agent-presets graphs`)
  }
}
async function exists(path) {
  try { await access(path, constants.F_OK); return true } catch { return false }
}
async function runActivationProbe(cliBin, profile, env) {
  const probeDir = await mkdtemp(join(dirname(env.DSH_HOME), `${profile}-activation-`))
  const active = join(probeDir, 'active')
  const disposed = join(probeDir, 'disposed')
  const modulePath = join(probeDir, 'probe.mjs')
  const patchPath = join(probeDir, 'probe.patch.yml')
  await writeFile(modulePath, [
    "import { writeFileSync } from 'node:fs'",
    "export const name = 'dsh-workflows-activation-probe'",
    "export const inject = ['workflowStorage', 'workflowStore', 'workflows', 'workflowSupervisor', 'workflowRunRecorder']",
    'export function apply(ctx) {',
    '  let live = true',
    '  ctx.effect(() => () => { live = false; writeFileSync(process.env.DSH_WORKFLOWS_PROBE_DISPOSED, "disposed") })',
    '  void ctx.loader.await().then(() => {',
    '    if (!live) throw new Error("activation probe disposed before loader settlement")',
    '    for (const service of ["workflowStorage", "workflowStore", "workflows", "workflowSupervisor", "workflowRunRecorder"]) {',
    '      if (ctx.get(service) === undefined) throw new Error(`missing plugin service ${service}`)',
    '    }',
    '    writeFileSync(process.env.DSH_WORKFLOWS_PROBE_ACTIVE, "active")',
    '    const exit = ctx.get("appExit")',
    '    if (typeof exit !== "function") throw new Error("activation probe requires appExit")',
    '    void exit(0)',
    '  }).catch(error => { console.error(error); const exit = ctx.get("appExit"); if (typeof exit === "function") void exit(1) })',
    '}',
    '',
  ].join('\n'))
  const rows = []
  if (profile === 'headless') {
    rows.push('- id: headless-startup\n  disabled: true')
    rows.push('- id: headless-runner\n  disabled: true')
  }
  rows.push(`- insert:\n    - id: dsh-workflows-activation-probe\n      name: ${JSON.stringify(pathToFileURL(modulePath).href)}\n      inject: [workflowStorage, workflowStore, workflows, workflowSupervisor, workflowRunRecorder]`)
  await writeFile(patchPath, `${rows.join('\n\n')}\n`)
  const probeEnv = { ...env, DSH_WORKFLOWS_PROBE_ACTIVE: active, DSH_WORKFLOWS_PROBE_DISPOSED: disposed }
  try {
    await command(process.execPath, [cliBin, '--profile', profile, '--patch', patchPath], {
      cwd: workspace,
      env: probeEnv,
      timeoutMs: 90_000,
    })
    await requireFile(active, `${profile} activation sentinel`)
    await requireFile(disposed, `${profile} teardown sentinel`)
    if (await readFile(active, 'utf8') !== 'active' || await readFile(disposed, 'utf8') !== 'disposed') {
      throw new Error(`${profile}: activation probe wrote invalid sentinels`)
    }
  } finally {
    await rm(probeDir, { recursive: true, force: true })
  }
}
function command(file, args, options) {
  return new Promise((accept, reject) => {
    const { timeoutMs = 180_000, ...spawnOptions } = options
    const child = spawn(file, args, {
      ...spawnOptions,
      detached: process.platform !== 'win32',
      windowsHide: true,
      shell: process.platform === 'win32' && file === 'pnpm',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    activeChildren.add(child)
    let stdout = ''; let stderr = ''
    const append = (previous, chunk) => `${previous}${String(chunk)}`.slice(-OUTPUT_TAIL_BYTES)
    child.stdout.on('data', chunk => { stdout = append(stdout, chunk) })
    child.stderr.on('data', chunk => { stderr = append(stderr, chunk) })
    let settled = false
    let timedOut = false
    const timer = setTimeout(() => {
      if (settled) return
      timedOut = true
      terminate(child, 'SIGTERM')
      setTimeout(() => terminate(child, 'SIGKILL'), 2_000).unref()
    }, timeoutMs)
    child.once('error', error => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      activeChildren.delete(child)
      reject(error)
    })
    child.once('close', (code, signal) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      activeChildren.delete(child)
      if (timedOut) reject(new Error(`${file} exceeded ${String(timeoutMs)}ms: ${(stderr || stdout).trim().slice(-2000)}`))
      else if (code === 0) accept({ stdout, stderr })
      else reject(new Error(`${file} exited ${String(code)}${signal ? ` (${signal})` : ''}: ${(stderr || stdout).trim().slice(-10000)}`))
    })
  })
}

async function officialRuntimeSpecs(root) {
  const manifests = new Map()
  await collectOfficialManifests(root, manifests)
  const cli = manifests.get('@deepseek-ai/dsh')
  if (!cli) throw new Error('official checkout is missing the CLI manifest')
  const pending = [...Object.keys(cli.dependencies ?? {}), ...Object.keys(cli.devDependencies ?? {})]
  const selected = new Set()
  while (pending.length > 0) {
    const name = pending.pop()
    if (typeof name !== 'string' || selected.has(name)) continue
    const manifest = manifests.get(name)
    if (!manifest || (!name.startsWith('@deepseek-ai/dsh-') && !name.startsWith('@deepseek-ai/cordis-plugin-'))) continue
    selected.add(name)
    for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
      for (const dependency of Object.keys(manifest[field] ?? {})) pending.push(dependency)
    }
  }
  return [...selected]
    .filter(name => name !== '@deepseek-ai/dsh' && !name.includes('experimental-'))
    .sort()
    .map(name => `${name}@${manifests.get(name).version}`)
}

async function collectOfficialManifests(directory, result) {
  let entries
  try { entries = await readdir(directory, { withFileTypes: true }) } catch { return }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) await collectOfficialManifests(path, result)
    else if (entry.isFile() && entry.name === 'package.json') {
      try {
        const manifest = JSON.parse(await readFile(path, 'utf8'))
        if (typeof manifest.name === 'string' && typeof manifest.version === 'string') result.set(manifest.name, manifest)
      } catch { /* ignore non-package JSON */ }
    }
  }
}

function terminate(child, signal) {
  try {
    if (process.platform === 'win32') child.kill(signal)
    else process.kill(-child.pid, signal)
  } catch { /* already gone */ }
}
