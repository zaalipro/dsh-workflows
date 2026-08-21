import { execFile, spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const root = resolve(import.meta.dirname, '..')
const helper = resolve(root, 'scripts/browser-smoke.mjs')

async function waitForExit(
  child: ReturnType<typeof spawn>,
  timeoutMs = 4_000,
  initialStdout = '',
  initialStderr = '',
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  let stdout = initialStdout
  let stderr = initialStderr
  child.stdout?.setEncoding('utf8')
  child.stderr?.setEncoding('utf8')
  child.stdout?.on('data', chunk => { stdout += chunk })
  child.stderr?.on('data', chunk => { stderr += chunk })
  return await new Promise((resolvePromise, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      reject(new Error('browser helper did not exit'))
    }, timeoutMs)
    const finish = (code: number | null): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolvePromise({ code, stdout, stderr })
    }
    if (child.exitCode !== null) finish(child.exitCode)
    else child.once('exit', finish)
  })
}

function stopChild(child: ReturnType<typeof spawn> | undefined): void {
  if (child === undefined || child.exitCode !== null || child.signalCode !== null) return
  child.kill('SIGKILL')
}

async function fixtureServer(directory: string, body: string): Promise<string> {
  const path = join(directory, 'server.mjs')
  await writeFile(path, [
    `process.stdout.write(${JSON.stringify(body)} + '\\n')`,
    "process.stdin.resume()",
    "process.stdin.on('close', () => process.exit(0))",
  ].join('\n'))
  return path
}

describe('tarball browser-smoke helper boundary', () => {
  it('rejects missing and relative arguments without opening a browser', async () => {
    const missing = await execFileAsync(process.execPath, [helper], { cwd: root }).catch(error => error as { code: number; stderr: string })
    expect(missing.code).toBe(1)
    expect(missing.stderr).toMatch(/browser helper failed: usage:/u)

    const relative = await execFileAsync(process.execPath, [
      helper, '--tarball', 'package.tgz', '--official', '/tmp/official', '--workspace', '/tmp/workspace',
    ], { cwd: root }).catch(error => error as { code: number; stderr: string })
    expect(relative.code).toBe(1)
    expect(relative.stderr).toMatch(/browser helper failed: invalid or repeated --tarball/u)
  })

  it('starts only a loopback server and tears it down through stdin exactly once', async () => {
    const fixture = await mkdtemp(join(tmpdir(), 'dsh-browser-helper-'))
    const workspace = join(fixture, 'caller-workspace')
    const official = join(fixture, 'official')
    const homeBefore = process.env.HOME
    let child: ReturnType<typeof spawn> | undefined
    try {
      await mkdir(workspace, { recursive: true })
      await mkdir(official, { recursive: true })
      await writeFile(join(official, 'package.json'), '{"name":"official-fixture","private":true}\n')
      const tarball = join(fixture, 'package.tgz')
      await writeFile(tarball, 'not-installed-by-the-helper')
      const server = await fixtureServer(fixture, JSON.stringify({ kind: 'ready', url: 'http://127.0.0.1:0' }))
      child = spawn(process.execPath, [
        helper, '--tarball', tarball, '--official', official, '--workspace', workspace, '--server', server,
      ], { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] })
      const exited = waitForExit(child)
      // Give the helper enough time to forward the readiness line, then close
      // only the helper-owned input channel.  The caller workspace remains.
      await new Promise<void>((resolvePromise, reject) => {
        const timer = setTimeout(() => reject(new Error('readiness timeout')), 2_000)
        let output = ''
        child.stdout?.setEncoding('utf8')
        const onData = (chunk: string) => {
          output += chunk
          if (!output.includes('"kind":"ready"')) return
          clearTimeout(timer)
          child.stdout?.off('data', onData)
          resolvePromise()
        }
        child.stdout?.on('data', onData)
      })
      // Install the exit observer before closing stdin.  A tiny fixture can
      // otherwise exit between `end()` and the first `once('exit')`, leaving
      // the test waiting forever for an event that already happened.
      child.stdin?.end()
      const result = await exited
      expect(result.code).toBe(0)
      const readiness = result.stdout.trim().split('\n').find(line => line.includes('"kind":"ready"'))
      expect(readiness).toBeDefined()
      expect(JSON.parse(readiness!)).toMatchObject({ kind: 'ready', pid: expect.any(Number) })
      expect(result.stdout.trim().split('\n')).toHaveLength(1)
      expect(homeBefore).toBe(process.env.HOME)
      await readFile(join(official, 'package.json'), 'utf8')
    } finally {
      // The helper owns its temporary server, but a failed assertion must not
      // leave a fixture process behind in the Vitest worker.
      stopChild(child)
      await rm(fixture, { recursive: true, force: true })
    }
  })

  it('fails closed on a non-loopback readiness address', async () => {
    const fixture = await mkdtemp(join(tmpdir(), 'dsh-browser-loopback-'))
    let child: ReturnType<typeof spawn> | undefined
    try {
      const workspace = join(fixture, 'workspace')
      const official = join(fixture, 'official')
      await mkdir(workspace, { recursive: true })
      await mkdir(official, { recursive: true })
      await writeFile(join(official, 'package.json'), '{}\n')
      const tarball = join(fixture, 'package.tgz')
      await writeFile(tarball, 'fixture')
      const server = await fixtureServer(fixture, JSON.stringify({ kind: 'ready', url: 'http://example.com:1234' }))
      child = spawn(process.execPath, [
        helper, '--tarball', tarball, '--official', official, '--workspace', workspace, '--server', server,
      ], { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] })
      const exited = waitForExit(child)
      await new Promise<void>((resolvePromise, reject) => {
        const timer = setTimeout(() => reject(new Error('malformed-readiness timeout')), 2_000)
        const onData = (chunk: string): void => {
          if (!chunk.includes('malformed readiness')) return
          clearTimeout(timer)
          child.stderr?.off('data', onData)
          resolvePromise()
        }
        child.stderr?.setEncoding('utf8')
        child.stderr?.on('data', onData)
      })
      child.stdin?.end()
      const result = await exited
      expect(result.code).not.toBe(0)
      expect(result.stderr).toMatch(/non-loopback|malformed readiness/u)
    } finally {
      stopChild(child)
      await rm(fixture, { recursive: true, force: true })
    }
  })

  it('coalesces a second stop signal into one teardown and keeps the caller workspace', async () => {
    const fixture = await mkdtemp(join(tmpdir(), 'dsh-browser-teardown-'))
    const workspace = join(fixture, 'caller-workspace')
    const official = join(fixture, 'official')
    let child: ReturnType<typeof spawn> | undefined
    try {
      await mkdir(workspace, { recursive: true })
      await mkdir(official, { recursive: true })
      await writeFile(join(official, 'package.json'), '{"name":"official-fixture","private":true}\n')
      await writeFile(join(workspace, 'keep.txt'), 'caller-owned')
      const tarball = join(fixture, 'package.tgz')
      await writeFile(tarball, 'not-installed-by-the-helper')
      const server = await fixtureServer(fixture, JSON.stringify({ kind: 'ready', url: 'http://127.0.0.1:0' }))
      child = spawn(process.execPath, [
        helper, '--tarball', tarball, '--official', official, '--workspace', workspace, '--server', server,
      ], { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] })
      const exited = waitForExit(child)
      await new Promise<void>((resolvePromise, reject) => {
        const timer = setTimeout(() => reject(new Error('readiness timeout')), 2_000)
        let output = ''
        child.stdout?.setEncoding('utf8')
        const onData = (chunk: string) => {
          output += chunk
          if (!output.includes('"kind":"ready"')) return
          clearTimeout(timer)
          child.stdout?.off('data', onData)
          resolvePromise()
        }
        child.stdout?.on('data', onData)
      })
      child.kill('SIGTERM')
      child.kill('SIGTERM')
      const result = await exited
      expect(result.code === 0 || result.signal === 'SIGTERM').toBe(true)
      expect(await readFile(join(workspace, 'keep.txt'), 'utf8')).toBe('caller-owned')
      expect(await readFile(join(official, 'package.json'), 'utf8')).toContain('official-fixture')
    } finally {
      stopChild(child)
      await rm(fixture, { recursive: true, force: true })
    }
  })

  it('serves the packed client bundle on loopback and tears the page server down', async () => {
    const fixture = await mkdtemp(join(tmpdir(), 'dsh-browser-page-'))
    const client = await readFile(join(root, 'lib/client.js'), 'utf8')
    const css = await readFile(join(root, 'src/client/WorkflowsDashboard.module.css'), 'utf8')
    expect(client).toContain('@zaalipro/dsh-workflows')
    expect(css).toContain('@media (max-width: 1199px)')
    expect(css).toContain('@media (max-width: 767px)')
    expect(css).toContain('@media (max-width: 320px)')
    expect(css).toContain('min-width: 44px')
    expect(css).toContain('min-height: 44px')
    expect(css).not.toContain('100vw')
    const html = [
      '<!doctype html>',
      '<html><body>',
      '<main data-workflows-dashboard>',
      '<h1>Workflows</h1>',
      '<h2>No workflow runs yet</h2>',
      '<p>Launch a saved workflow to see its progress here.</p>',
      '<button type="button">Close workflows</button>',
      '</main>',
      '<script src="/client.js"></script>',
      '</body></html>',
    ].join('')
    const server = createServer((request, response) => {
      if (request.url === '/client.js') {
        response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' })
        response.end(client)
        return
      }
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      response.end(html)
    })
    await new Promise<void>(resolvePromise => { server.listen(0, '127.0.0.1', resolvePromise) })
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('loopback server did not bind')
    const url = `http://127.0.0.1:${address.port}/`
    try {
      const page = await fetch(url)
      expect(page.status).toBe(200)
      const body = await page.text()
      expect(body).toContain('No workflow runs yet')
      expect(body).toContain('Launch a saved workflow to see its progress here.')
      expect(body).toContain('Close workflows')
      expect(body).not.toMatch(/[0-9a-f]{32}/u)
      const bundle = await fetch(new URL('/client.js', url))
      expect(bundle.status).toBe(200)
      expect(await bundle.text()).toMatch(/window\.__ModuleLoader__\??\.load/u)

      const chrome = [process.env.CHROME_PATH, process.env.DSH_CHROME]
        .find(candidate => typeof candidate === 'string' && candidate.length > 0 && existsSync(candidate))
      if (chrome !== undefined) {
        const dumped = await execFileAsync(chrome, [
          '--headless=new', '--disable-gpu', '--no-sandbox', '--dump-dom', url,
        ], { timeout: 8_000 })
        expect(dumped.stdout).toContain('No workflow runs yet')
        expect(dumped.stdout).toContain('Close workflows')
      }
    } finally {
      await new Promise<void>((resolvePromise, reject) => {
        server.close(error => { if (error) reject(error); else resolvePromise() })
      })
      await rm(fixture, { recursive: true, force: true })
    }
  })
})
