#!/usr/bin/env node
/** Tarball Web smoke helper. It owns only an isolated temporary profile and
 * never opens or mutates the user's browser/DSH state. */
import { access, mkdtemp, rm } from 'node:fs/promises'
import { constants } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { once } from 'node:events'

let workspace
let child
let childExitPromise
let teardownPromise
let readinessFailed = false
const stopSignals = ['SIGINT', 'SIGTERM']
function onStopSignal() { void teardown() }
try {
  const options = parseArgs(process.argv.slice(2))
  await readable(options.tarball, '--tarball')
  await readable(join(options.official, 'package.json'), '--official')
  await readable(options.workspace, '--workspace')
  workspace = await mkdtemp(join(tmpdir(), 'dsh-workflows-browser-'))
  const env = { ...process.env, HOME: join(workspace, 'home'), DSH_HOME: join(workspace, 'home'), DSH_WORKSPACE: options.workspace }
  // The official server helper is selected by the caller/CI.  Keeping the
  // launcher argument-array based avoids shell interpolation and makes signal
  // teardown deterministic on every platform.
  const server = options.server ?? join(options.official, 'scripts/dev-web.ts')
  child = spawn(process.execPath, [server, '--poll'], { cwd: options.official, env, stdio: ['pipe', 'pipe', 'pipe'] })
  // Attach the exit observer before any output callback can request teardown;
  // a very small fixture may terminate during the same turn as `spawn()`.
  childExitPromise = once(child, 'exit')
  let output = ''
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', chunk => {
    output += chunk
    const ready = output.split(/\r?\n/u).map(line => line.trim()).find(line => line.startsWith('{') && line.endsWith('}'))
    if (!ready) return
    try {
      const value = JSON.parse(ready)
      const url = typeof value.url === 'string' ? new URL(value.url) : undefined
      if (!url || !['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) throw new Error('server readiness URL is not loopback')
      process.stdout.write(`${JSON.stringify({ kind: 'ready', url: value.url, pid: child.pid })}\n`)
    } catch (error) {
      readinessFailed = true
      process.exitCode = 1
      process.stderr.write(`browser helper: malformed readiness: ${error.message}\n`)
      void teardown()
    }
  })
  child.stderr.pipe(process.stderr)
  child.once('exit', code => {
    if (code !== 0 && !teardownPromise) {
      process.stderr.write(`browser helper: server exited ${code}\n`)
      process.exitCode = 1
    }
    if (readinessFailed) process.exitCode = 1
  })
  for (const signal of stopSignals) process.on(signal, onStopSignal)
  const closeFromInput = () => { void teardown() }
  // A piped EOF emits `end` before `close` on Node; listen to both so the
  // helper cannot keep the server alive merely because the descriptor close
  // notification is delayed by a platform stream wrapper.
  process.stdin.once('end', closeFromInput)
  process.stdin.once('close', closeFromInput)
  process.stdin.resume()
  await childExitPromise
} catch (error) {
  process.stderr.write(`browser helper failed: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
} finally {
  await teardown()
  if (workspace) await rm(workspace, { recursive: true, force: true }).catch(() => {})
}

function parseArgs(args) {
  const values = Object.create(null)
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index]
    if (!['--tarball', '--official', '--workspace', '--server'].includes(key)) throw new Error('usage: browser-smoke.mjs --tarball <absolute-file> --official <absolute-checkout> --workspace <absolute-dir> [--server <absolute-file>]')
    const value = args[++index]
    if (!value || !isAbsolute(value) || values[key]) throw new Error(`invalid or repeated ${key}`)
    values[key] = resolve(value)
  }
  if (!values['--tarball'] || !values['--official'] || !values['--workspace']) throw new Error('usage: browser-smoke.mjs --tarball <absolute-file> --official <absolute-checkout> --workspace <absolute-dir> [--server <absolute-file>]')
  return { tarball: values['--tarball'], official: values['--official'], workspace: values['--workspace'], server: values['--server'] }
}
async function readable(path, flag) { try { await access(path, constants.R_OK) } catch { throw new Error(`${flag} is not readable: ${path}`) } }
async function teardown() {
  if (teardownPromise) return teardownPromise
  teardownPromise = (async () => {
    try {
      if (!child || child.exitCode !== null || child.signalCode !== null) return
      child.kill('SIGTERM')
      let timer
      await Promise.race([
        childExitPromise ?? once(child, 'exit'),
        new Promise(resolve => { timer = setTimeout(resolve, 5_000) }),
      ])
      if (timer !== undefined) clearTimeout(timer)
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
    } finally {
      for (const signal of stopSignals) process.removeListener(signal, onStopSignal)
      try { process.stdin.pause(); process.stdin.unref?.() } catch { /* the helper is exiting */ }
    }
  })()
  return teardownPromise
}
