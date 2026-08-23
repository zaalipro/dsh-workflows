#!/usr/bin/env node
/**
 * Start one isolated, tarball-installed official Web profile for automated
 * HTTP/client-bundle checks. The helper never opens a browser or touches the
 * user's HOME/DSH_HOME. A caller owns the page/browser and closes stdin when
 * it is finished; this process then tears down the complete Host process tree.
 */
import { createHash } from 'node:crypto'
import { access, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { constants } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PACKAGE_NAME = '@zaalipro/dsh-workflows'
const PACKAGE_VERSION = '0.1.0-rc.3'
const HOST_VERSION = '0.1.1-rc.2'
const OFFICIAL_COMMIT = 'b150a551b8d465e31e418e1b2eaf5e79bbb7d28e'
const START_TIMEOUT_MS = 90_000
const COMMAND_TIMEOUT_MS = 180_000
const TERM_GRACE_MS = 10_000
const KILL_GRACE_MS = 5_000
const OUTPUT_TAIL_BYTES = 64 * 1024

let temporaryRoot
let server
let teardownPromise
let stopping = false
let requestedSignal
const activeChildren = new Set()
const stopSignals = ['SIGINT', 'SIGTERM']

function onStopSignal(signal) {
  requestedSignal ??= signal
  void teardown(signal)
}

const signalHandlers = new Map(
  stopSignals.map(signal => [signal, () => onStopSignal(signal)]),
)

function assertRunning() {
  if (stopping) throw new Error(`browser helper interrupted${requestedSignal ? ` by ${requestedSignal}` : ''}`)
}

try {
  for (const [signal, handler] of signalHandlers) process.on(signal, handler)
  const options = parseArgs(process.argv.slice(2))
  await readable(options.tarball, '--tarball')
  assertRunning()
  await readable(join(options.official, 'package.json'), '--official')
  assertRunning()
  await readable(options.workspace, '--workspace')
  assertRunning()

  temporaryRoot = await mkdtemp(join(tmpdir(), 'dsh-workflows-browser-'))
  assertRunning()
  const home = join(temporaryRoot, 'home')
  await Promise.all([
    mkdir(home, { recursive: true }),
    mkdir(join(home, 'runtime'), { recursive: true }),
    mkdir(join(temporaryRoot, 'cache'), { recursive: true }),
    mkdir(join(temporaryRoot, 'store'), { recursive: true }),
    mkdir(join(temporaryRoot, 'pnpm-home'), { recursive: true }),
    mkdir(join(temporaryRoot, 'corepack'), { recursive: true }),
  ])
  assertRunning()
  const env = {
    ...process.env,
    HOME: home,
    DSH_HOME: home,
    DSH_WORKSPACE: options.workspace,
    DSH_TELEMETRY_DISABLED: '1',
    npm_config_cache: join(temporaryRoot, 'cache'),
    PNPM_HOME: join(temporaryRoot, 'pnpm-home'),
    PNPM_STORE_DIR: join(temporaryRoot, 'store'),
    COREPACK_HOME: join(temporaryRoot, 'corepack'),
  }

  if (options.server !== undefined) {
    // A dependency-free fixture seam keeps argument/readiness/teardown unit
    // cases fast. Release acceptance never supplies --server.
    server = spawnOwned(process.execPath, [options.server], { cwd: options.official, env })
    const url = await fixtureReadiness(server)
    assertRunning()
    process.stdout.write(`${JSON.stringify({ kind: 'ready', url, pid: server.child.pid })}\n`)
  } else {
    await startInstalledOfficialWeb(options, env, home)
    assertRunning()
  }

  // stdin EOF/close is the caller's ordinary completion request. Signals use
  // the same coalesced teardown path and preserve conventional exit status.
  process.stdin.once('end', () => { void teardown('SIGTERM') })
  process.stdin.once('close', () => { void teardown('SIGTERM') })
  process.stdin.resume()
  const closed = await server.closed
  if (!stopping) {
    const tail = outputTail(server)
    throw new Error(`server exited before caller teardown (${exitLabel(closed)})${tail ? `: ${tail}` : ''}`)
  }
} catch (error) {
  process.stderr.write(`browser helper failed: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = requestedSignal === 'SIGINT' ? 130 : requestedSignal === 'SIGTERM' ? 143 : 1
} finally {
  await teardown(requestedSignal ?? 'SIGTERM')
  for (const [signal, handler] of signalHandlers) process.removeListener(signal, handler)
  try { process.stdin.pause(); process.stdin.unref?.() } catch { /* process is exiting */ }
  if (temporaryRoot !== undefined) await rm(temporaryRoot, { recursive: true, force: true }).catch(() => {})
}

async function startInstalledOfficialWeb(options, env, home) {
  assertRunning()
  // The checkout is an immutable provenance reference, not an execution
  // workspace. CI deliberately does not install its dependencies. Execute the
  // exact published Host already frozen into this plugin workspace instead.
  const publishedPackageRoot = join(PLUGIN_ROOT, 'node_modules', '@deepseek-ai', 'dsh')
  const publishedCli = join(publishedPackageRoot, 'lib', 'bin.js')
  const runtimeCwd = join(home, 'runtime')
  await readable(publishedCli, 'published official Harness CLI')
  assertRunning()

  const [rootManifest, checkoutCliManifest, publishedManifest] = await Promise.all([
    readJson(join(options.official, 'package.json'), 'official root manifest'),
    readJson(join(options.official, 'apps', 'cli', 'package.json'), 'official CLI manifest'),
    readJson(join(publishedPackageRoot, 'package.json'), 'published official CLI manifest'),
  ])
  assertRunning()
  if (rootManifest.version !== HOST_VERSION
    || checkoutCliManifest.version !== HOST_VERSION
    || publishedManifest.name !== '@deepseek-ai/dsh'
    || publishedManifest.version !== HOST_VERSION) {
    throw new Error(`official Harness ${HOST_VERSION} is required`)
  }
  const revisionProbe = await runCommand('git', ['-C', options.official, 'rev-parse', 'HEAD'], {
    cwd: PLUGIN_ROOT,
    env,
    timeoutMs: COMMAND_TIMEOUT_MS,
  })
  assertRunning()
  const revision = revisionProbe.stdout.trim()
  if (revision !== OFFICIAL_COMMIT) {
    throw new Error(`official Harness checkout must be ${OFFICIAL_COMMIT}, got ${revision || '<empty>'}`)
  }

  await runCommand(process.execPath, [publishedCli,
    'plugin', '--profile', 'web', 'add', '--ignore-scripts', options.tarball,
  ], { cwd: runtimeCwd, env, timeoutMs: COMMAND_TIMEOUT_MS })
  assertRunning()

  const profileRoot = join(home, 'profiles', 'web')
  const installedRoot = join(profileRoot, 'node_modules', '@zaalipro', 'dsh-workflows')
  const installedManifest = await readJson(join(installedRoot, 'package.json'), 'installed package manifest')
  assertRunning()
  assertInstalledManifest(installedManifest)
  await Promise.all([
    readable(join(installedRoot, 'lib', 'compat-engine', 'index.js'), 'installed compatibility evaluator'),
    readable(join(installedRoot, 'lib', 'compat-engine', 'worker.cjs'), 'installed compatibility worker'),
  ])
  assertRunning()
  const profileManifest = await readJson(join(profileRoot, 'package.json'), 'installed Web profile manifest')
  assertRunning()
  const dependencies = Object.keys(profileManifest.dependencies ?? {})
  if (dependencies.length !== 1 || dependencies[0] !== PACKAGE_NAME) {
    throw new Error('plugin add did not create exactly one Web profile dependency')
  }
  const bundles = profileManifest.dsh?.profile?.bundles
  if (!Array.isArray(bundles) || bundles.filter(value => value === PACKAGE_NAME).length !== 1) {
    throw new Error('plugin add did not create exactly one workflow bundle layer')
  }

  server = spawnOwned(process.execPath, [publishedCli,
    '--profile', 'web', '--host', '127.0.0.1', '--port', '0', '--no-open',
  ], { cwd: runtimeCwd, env })
  const url = await officialReadiness(server)
  assertRunning()
  await verifyServedProduct(url, installedRoot)
  assertRunning()
  process.stdout.write(`${JSON.stringify({ kind: 'ready', url, pid: server.child.pid })}\n`)
}

function assertInstalledManifest(manifest) {
  if (manifest.name !== PACKAGE_NAME || manifest.version !== PACKAGE_VERSION) {
    throw new Error(`installed package must be ${PACKAGE_NAME}@${PACKAGE_VERSION}`)
  }
  const compatibility = manifest.dsh?.compatibility
  if (compatibility?.host !== '@deepseek-ai/dsh'
    || compatibility?.evaluator !== 'plugin-compat-engine-v1'
    || !Array.isArray(compatibility.versions)
    || compatibility.versions.length !== 1
    || compatibility.versions[0] !== HOST_VERSION) {
    throw new Error('installed package has unexpected Harness compatibility metadata')
  }
}

async function verifyServedProduct(url, installedRoot) {
  assertRunning()
  const root = await boundedFetch(url, START_TIMEOUT_MS)
  assertRunning()
  if (root.status !== 200) throw new Error(`official Web root returned HTTP ${root.status}`)
  await root.arrayBuffer()
  assertRunning()

  for (const [endpoint, relative, contentType] of [
    [`/plugins/${PACKAGE_NAME}/client.js`, join('lib', 'client.js'), 'text/javascript'],
    [`/plugins/${PACKAGE_NAME}/client.js.map`, join('lib', 'client.js.map'), 'application/json'],
  ]) {
    assertRunning()
    const response = await boundedFetch(new URL(endpoint, url), START_TIMEOUT_MS)
    assertRunning()
    if (response.status !== 200) throw new Error(`${endpoint} returned HTTP ${response.status}`)
    if (!response.headers.get('content-type')?.startsWith(contentType)) {
      throw new Error(`${endpoint} returned an unexpected content type`)
    }
    const served = Buffer.from(await response.arrayBuffer())
    assertRunning()
    const installed = await readFile(join(installedRoot, relative))
    assertRunning()
    if (sha256(served) !== sha256(installed)) {
      throw new Error(`${endpoint} bytes differ from the tarball-installed artifact`)
    }
  }
}

async function boundedFetch(input, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error('HTTP verification timed out')), timeoutMs)
  timer.unref?.()
  try { return await fetch(input, { signal: controller.signal }) } finally { clearTimeout(timer) }
}

function officialReadiness(handle) {
  return awaitReadiness(handle, line => {
    const match = line.match(/^dsh web: (http:\/\/127\.0\.0\.1:\d+)(?: \(LAN: [^)]+\))?$/u)
    return match?.[1]
  })
}

function fixtureReadiness(handle) {
  return awaitReadiness(handle, line => {
    if (!line.startsWith('{') || !line.endsWith('}')) return undefined
    let value
    try {
      value = JSON.parse(line)
      const candidate = typeof value.url === 'string' ? new URL(value.url) : undefined
      if (candidate === undefined || !['127.0.0.1', 'localhost', '::1'].includes(candidate.hostname)) {
        throw new Error('server readiness URL is not loopback')
      }
      return candidate.href.replace(/\/$/u, '')
    } catch (error) {
      throw new Error(`malformed readiness: ${error instanceof Error ? error.message : String(error)}`)
    }
  })
}

function awaitReadiness(handle, parseLine) {
  return new Promise((accept, reject) => {
    let settled = false
    let buffered = ''
    const finish = (fn, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      handle.child.stdout.off('data', onData)
      fn(value)
    }
    const onData = chunk => {
      buffered += String(chunk)
      const lines = buffered.split(/\r?\n/u)
      buffered = lines.pop() ?? ''
      for (const raw of lines) {
        const line = raw.trim()
        if (!line) continue
        try {
          const value = parseLine(line)
          if (typeof value === 'string') return finish(accept, value)
        } catch (error) {
          return finish(reject, error)
        }
      }
    }
    const timer = setTimeout(() => finish(reject, new Error(`server readiness exceeded ${START_TIMEOUT_MS}ms`)), START_TIMEOUT_MS)
    timer.unref?.()
    handle.child.stdout.on('data', onData)
    handle.closed.then(result => {
      const tail = outputTail(handle)
      finish(reject, new Error(`server exited before readiness (${exitLabel(result)})${tail ? `: ${tail}` : ''}`))
    }, error => finish(reject, error))
  })
}

function parseArgs(args) {
  const values = Object.create(null)
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index]
    if (!['--tarball', '--official', '--workspace', '--server'].includes(key)) usage()
    const value = args[++index]
    if (!value || !isAbsolute(value) || values[key] !== undefined) throw new Error(`invalid or repeated ${key}`)
    values[key] = resolve(value)
  }
  if (!values['--tarball'] || !values['--official'] || !values['--workspace']) usage()
  return { tarball: values['--tarball'], official: values['--official'], workspace: values['--workspace'], server: values['--server'] }
}

function usage() {
  throw new Error('usage: browser-smoke.mjs --tarball <absolute-file> --official <absolute-checkout> --workspace <absolute-dir> [--server <absolute-file>]')
}

async function readable(path, flag) {
  try { await access(path, constants.R_OK) } catch { throw new Error(`${flag} is not readable: ${path}`) }
}

async function readJson(path, label) {
  try { return JSON.parse(await readFile(path, 'utf8')) } catch (error) {
    throw new Error(`${label} is invalid: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex') }

function appendTail(previous, chunk) {
  const next = previous + String(chunk)
  return next.length <= OUTPUT_TAIL_BYTES ? next : next.slice(-OUTPUT_TAIL_BYTES)
}

function spawnOwned(file, args, options) {
  assertRunning()
  const child = spawn(file, args, {
    ...options,
    detached: process.platform !== 'win32',
    windowsHide: true,
    shell: process.platform === 'win32' && file === 'pnpm',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const handle = { child, stdout: '', stderr: '', closed: undefined }
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', chunk => { handle.stdout = appendTail(handle.stdout, chunk) })
  child.stderr.on('data', chunk => { handle.stderr = appendTail(handle.stderr, chunk) })
  handle.closed = new Promise((accept, reject) => {
    child.once('error', reject)
    child.once('close', (code, signal) => accept({ code, signal }))
  }).finally(() => { activeChildren.delete(handle) })
  handle.closed.catch(() => {})
  activeChildren.add(handle)
  return handle
}

async function runCommand(file, args, options) {
  const handle = spawnOwned(file, args, options)
  let timer
  try {
    const result = await Promise.race([
      handle.closed,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${file} exceeded ${options.timeoutMs}ms`)), options.timeoutMs)
        timer.unref?.()
      }),
    ])
    if (result.code !== 0) {
      const tail = outputTail(handle)
      throw new Error(`${file} exited ${exitLabel(result)}${tail ? `: ${tail}` : ''}`)
    }
    return handle
  } catch (error) {
    await terminateTree(handle, 'SIGTERM')
    throw error
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

function outputTail(handle) { return (handle.stderr || handle.stdout).trim().slice(-4_000) }
function exitLabel(result) { return result.code === null ? `by ${String(result.signal)}` : `with code ${String(result.code)}` }

async function terminateTree(handle, signal = 'SIGTERM') {
  if (handle.child.exitCode !== null || handle.child.signalCode !== null) {
    await handle.closed.catch(() => {})
    return
  }
  signalTree(handle.child, signal)
  if (await closesWithin(handle, TERM_GRACE_MS)) return
  await forceKillTree(handle.child)
  await Promise.race([handle.closed.catch(() => {}), delay(KILL_GRACE_MS)])
}

function signalTree(child, signal) {
  try {
    if (process.platform === 'win32') child.kill(signal)
    else process.kill(-child.pid, signal)
  } catch (error) {
    if (error?.code !== 'ESRCH') throw error
  }
}

async function forceKillTree(child) {
  if (child.exitCode !== null || child.signalCode !== null) return
  if (process.platform !== 'win32') {
    signalTree(child, 'SIGKILL')
    return
  }
  const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
  await Promise.race([new Promise(resolveKill => killer.once('close', resolveKill)), delay(KILL_GRACE_MS)])
}

async function closesWithin(handle, timeoutMs) {
  const marker = Symbol('timeout')
  return await Promise.race([
    handle.closed.then(() => true, () => true),
    delay(timeoutMs).then(() => marker),
  ]) !== marker
}

function delay(timeoutMs) {
  return new Promise(resolveDelay => {
    const timer = setTimeout(resolveDelay, timeoutMs)
    timer.unref?.()
  })
}

async function teardown(signal = 'SIGTERM') {
  if (teardownPromise !== undefined) return teardownPromise
  stopping = true
  teardownPromise = (async () => {
    const children = [...activeChildren]
    await Promise.allSettled(children.map(handle => terminateTree(handle, signal)))
  })()
  return teardownPromise
}
