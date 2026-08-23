import { lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'

const localIoProbe = vi.hoisted(() => ({
  racePath: undefined as string | undefined,
  raceObservations: 0,
  releaseRace: undefined as (() => void) | undefined,
  raceGate: undefined as Promise<void> | undefined,
  afterObservation: undefined as ((path: string) => Promise<void>) | undefined,
  afterDirectorySync: undefined as ((path: string) => Promise<boolean>) | undefined,
  afterSwap: undefined as ((from: string, to: string) => Promise<void>) | undefined,
  syncPaths: [] as string[],
}))

vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    async lstat(path: Parameters<typeof actual.lstat>[0], ...args: unknown[]) {
      const result = await (actual.lstat as (...values: unknown[]) => Promise<unknown>)(path, ...args)
      if (String(path) === localIoProbe.racePath && localIoProbe.raceObservations < 2) {
        localIoProbe.raceObservations += 1
        if (localIoProbe.raceObservations === 1 && localIoProbe.afterObservation !== undefined) {
          const action = localIoProbe.afterObservation
          localIoProbe.afterObservation = undefined
          await action(String(path))
        }
        if (localIoProbe.raceObservations === 2) localIoProbe.releaseRace?.()
        await localIoProbe.raceGate
      }
      return result
    },
    async open(path: Parameters<typeof actual.open>[0], ...args: unknown[]) {
      const handle = await (actual.open as (...values: unknown[]) => Promise<Awaited<ReturnType<typeof actual.open>>>)(path, ...args)
      return new Proxy(handle, {
        get(target, property) {
          if (property === 'sync') {
            return async () => {
              localIoProbe.syncPaths.push(String(path))
              await target.sync()
              if (localIoProbe.afterDirectorySync !== undefined) {
                const action = localIoProbe.afterDirectorySync
                if (await action(String(path))) localIoProbe.afterDirectorySync = undefined
              }
            }
          }
          const value = Reflect.get(target, property, target) as unknown
          return typeof value === 'function' ? value.bind(target) : value
        },
      })
    },
  }
})

vi.mock('fs-native-extensions', async importOriginal => {
  const actual = await importOriginal<typeof import('fs-native-extensions')>()
  return {
    ...actual,
    async swap(from: string, to: string) {
      await actual.swap(from, to)
      if (localIoProbe.afterSwap !== undefined) {
        const action = localIoProbe.afterSwap
        localIoProbe.afterSwap = undefined
        await action(from, to)
      }
    },
  }
})

import { WorkflowRegistry } from '../src/registry/index.js'

const registries: WorkflowRegistry[] = []
const temps: string[] = []
const posixOnly = process.platform !== 'win32'

afterEach(async () => {
  await Promise.all(registries.splice(0).map(registry => registry.dispose()))
  await Promise.all(temps.splice(0).map(path => rm(path, { recursive: true, force: true })))
  localIoProbe.racePath = undefined
  localIoProbe.raceObservations = 0
  localIoProbe.releaseRace = undefined
  localIoProbe.raceGate = undefined
  localIoProbe.afterObservation = undefined
  localIoProbe.afterDirectorySync = undefined
  localIoProbe.afterSwap = undefined
  localIoProbe.syncPaths.length = 0
})

async function temp(prefix = 'dsh-registry-save-'): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), prefix))
  temps.push(path)
  return path
}

function envelope(name: string, script = `complete({ name: ${JSON.stringify(name)} })`) {
  return { meta: { name, description: `${name} workflow` }, script }
}

async function layout(): Promise<{ home: string; project: string }> {
  const base = await temp()
  const home = join(base, 'home')
  const project = join(base, 'project')
  await mkdir(join(home, 'workflows'), { recursive: true })
  await mkdir(join(project, '.git'), { recursive: true })
  await mkdir(join(project, '.dsh', 'workflows'), { recursive: true })
  return { home, project }
}

function hostDirectory(root: string, extras: Record<string, unknown> = {}) {
  return {
    async listEntries() {
      const { readdir } = await import('node:fs/promises')
      const entries = await readdir(root, { withFileTypes: true })
      return entries.map(entry => ({
        name: entry.name,
        type: entry.isSymbolicLink() ? 'symlink' : entry.isFile() ? 'file' : entry.isDirectory() ? 'directory' : 'other',
      }))
    },
    async readBytes(name: string) {
      return new Uint8Array(await readFile(join(root, name)))
    },
    async writeText(name: string, content: string, expected: { kind: string; version?: unknown }) {
      const path = join(root, name)
      if (expected.kind === 'createIfAbsent') {
        await writeFile(path, content, { flag: 'wx', mode: 0o600 })
      } else {
        await writeFile(path, content, { mode: 0o600 })
      }
      return { version: { path } }
    },
    async assertIdentity() { /* pinned */ },
    async close() { /* closed */ },
    ...extras,
  }
}

function hostFs(overrides: Record<string, unknown> = {}) {
  return {
    async resolve(path: string) { return { path } },
    contains(parent: unknown, child: unknown) {
      const left = String((parent as { path?: string }).path ?? parent)
      const right = String((child as { path?: string }).path ?? child)
      return right === left || right.startsWith(`${left}/`) || right.startsWith(`${left}\\`)
    },
    async lstat(path: string) {
      try {
        const info = await lstat(path)
        return {
          type: info.isSymbolicLink() ? 'symlink' : info.isFile() ? 'file' : info.isDirectory() ? 'directory' : 'other',
          size: info.size,
          version: { ino: info.ino },
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
        throw error
      }
    },
    async listDir() { throw new Error('must not fall back to path-shaped listDir') },
    async readBytesNoFollow() { return new Uint8Array() },
    async openPrivateDirectory(path: string, options: { create?: boolean } = {}) {
      if (options.create) await mkdir(path, { recursive: true, mode: 0o700 })
      return hostDirectory(path)
    },
    ...overrides,
  }
}

function registry(config: Record<string, unknown> & { dshHome: string }, fs?: ReturnType<typeof hostFs>) {
  const events: string[] = []
  const created = new WorkflowRegistry({
    fs, emit: (name: string) => { events.push(name) },
  }, { definitionWatch: false, ...config })
  registries.push(created)
  return { registry: created, events }
}

async function childSave(args: readonly string[]): Promise<{ status: string; code?: string; script?: string }> {
  const fixture = fileURLToPath(new URL('./fixtures/registry-save-child.ts', import.meta.url))
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', fixture, ...args], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk })
    child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk })
    const timeout = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error('registry child timed out'))
    }, 15_000)
    child.once('error', error => { clearTimeout(timeout); reject(error) })
    child.once('exit', code => {
      clearTimeout(timeout)
      if (code !== 0) return reject(new Error(`registry child exited ${code}: ${stderr}`))
      try { resolve(JSON.parse(stdout.trim())) } catch { reject(new Error(`invalid registry child output: ${stdout}\n${stderr}`)) }
    })
  })
}

async function waitForEntry(path: string, prefix: string): Promise<string> {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const match = (await readdir(path)).find(name => name.startsWith(prefix))
    if (match !== undefined) return match
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  throw new Error(`timed out waiting for ${prefix}`)
}

describe('registry save (RS8)', () => {
  it('creates a canonical project definition and emits workflows/change only after success', async () => {
    const { home, project } = await layout()
    const { registry: workflows, events } = registry({ dshHome: home }, hostFs())
    const saved = await workflows.save(envelope('safe-save'), { cwd: project, scope: 'project' })
    expect(saved).toMatchObject({
      name: 'safe-save',
      scope: 'project',
      path: join(project, '.dsh', 'workflows', 'safe-save.workflow.json'),
    })
    expect(await readFile(saved.path, 'utf8')).toBe(`${JSON.stringify({
      meta: { name: 'safe-save', description: 'safe-save workflow' },
      script: 'complete({ name: "safe-save" })',
    }, null, 2)}\n`)
    expect(events).toEqual(['workflows/change'])
  })

  it('replaces an observed version and can write a shadowed user copy without promoting it', async () => {
    const { home, project } = await layout()
    await writeFile(join(project, '.dsh', 'workflows', 'shared.workflow.json'), `${JSON.stringify({
      meta: { name: 'shared', description: 'project copy' }, script: 'return "project"',
    }, null, 2)}\n`)
    const { registry: workflows } = registry({ dshHome: home }, hostFs())
    const user = await workflows.save(envelope('shared', 'return "user"'), { cwd: project, scope: 'user' })
    expect(user.scope).toBe('user')
    expect(user.path).toBe(join(home, 'workflows', 'shared.workflow.json'))
    const winner = await workflows.get('shared', { cwd: project })
    expect(winner?.scope).toBe('project')
    expect(winner?.script).toBe('return "project"')
    const replaced = await workflows.save(envelope('shared', 'return "project-2"'), { cwd: project, scope: 'project' })
    expect(replaced.script).toBe('return "project-2"')
  })

  it('rejects disabled save, bundled scope, omitted cwd, and oversize envelopes without emitting', async () => {
    const { home, project } = await layout()
    const disabled = registry({ dshHome: home, enabled: false }, hostFs())
    await expect(disabled.registry.save(envelope('nope'), { cwd: project, scope: 'project' }))
      .rejects.toThrow('workflow registry is disabled')
    const { registry: workflows, events } = registry({ dshHome: home, definitionMaxBytes: 80 }, hostFs())
    await expect(workflows.save(envelope('nope'), { cwd: project, scope: 'bundled' as 'project' }))
      .rejects.toThrow(/can only be saved to project or user scope/u)
    await expect(workflows.save(envelope('nope'), { scope: 'project' }))
      .rejects.toThrow('workflow definition save requires a session cwd')
    const userWorkflows = registry({ dshHome: home }, hostFs()).registry
    await expect(userWorkflows.save(envelope('global'), { scope: 'user' })).resolves.toMatchObject({
      name: 'global', scope: 'user', path: join(home, 'workflows', 'global.workflow.json'),
    })
    await expect(workflows.save(envelope('huge', 'x'.repeat(200)), { cwd: project, scope: 'project' }))
      .rejects.toThrow(/definition exceeds the 80-byte limit/u)
    expect(events).toEqual([])
  })

  it('refuses non-file destinations and missing Host versions, and does not emit on failure', async () => {
    const { home, project } = await layout()
    await mkdir(join(project, '.dsh', 'workflows', 'destination.workflow.json'))
    const { registry: workflows, events } = registry({ dshHome: home }, hostFs())
    await expect(workflows.save(envelope('destination'), { cwd: project, scope: 'project' }))
      .rejects.toThrow(/symbolic-link definitions are not allowed/u)
    expect(events).toEqual([])

    const noVersion = registry({ dshHome: home }, hostFs({
      async lstat(path: string) {
        try {
          const info = await lstat(path)
          return { type: info.isFile() ? 'file' : 'directory', size: info.size }
        } catch {
          return undefined
        }
      },
    }))
    await writeFile(join(project, '.dsh', 'workflows', 'raced.workflow.json'), payload())
    await expect(noVersion.registry.save(envelope('raced'), { cwd: project, scope: 'project' }))
      .rejects.toThrow(/Host filesystem did not return a final-entry version/u)
  })

  it('saves through the local fallback without openPrivateDirectory and still rejects an escaped root', async () => {
    const { home, project } = await layout()
    const missing = registry({ dshHome: home }, hostFs({ openPrivateDirectory: undefined }))
    const saved = await missing.registry.save(envelope('a'), { cwd: project, scope: 'project' })
    expect(saved.name).toBe('a')
    expect(await readFile(saved.path, 'utf8')).toContain('"a"')
    const escaped = registry({ dshHome: home }, hostFs({ contains() { return false } }))
    await expect(escaped.registry.save(envelope('a'), { cwd: project, scope: 'project' }))
      .rejects.toThrow(/escapes its project scope through a symbolic-link ancestor/u)
  })

  it.skipIf(!posixOnly)('creates and replaces through the local fallback and refuses a symlink target', async () => {
    const { home, project } = await layout()
    const local = new WorkflowRegistry({ dshHome: home, definitionWatch: false })
    registries.push(local)
    const created = await local.save(envelope('local-save'), { cwd: project, scope: 'project' })
    expect(await readFile(created.path, 'utf8')).toContain('"local-save"')
    const replaced = await local.save(envelope('local-save', 'return 2'), { cwd: project, scope: 'project' })
    expect(replaced.script).toBe('return 2')

    const outside = join(project, 'outside.json')
    await writeFile(outside, 'sentinel')
    await symlink(outside, join(project, '.dsh', 'workflows', 'linked.workflow.json'))
    await expect(local.save(envelope('linked'), { cwd: project, scope: 'project' }))
      .rejects.toThrow(/symbolic-link definitions are not allowed/u)
    expect(await readFile(outside, 'utf8')).toBe('sentinel')
  })

  it.skipIf(!posixOnly)('rejects a cooperating versioned-replace race against the exact observed inode', async () => {
    const { home, project } = await layout()
    const destination = join(project, '.dsh', 'workflows', 'cooperate.workflow.json')
    await writeFile(destination, `${JSON.stringify(envelope('cooperate', 'return 0'), null, 2)}\n`)
    const first = registry({ dshHome: home }, hostFs({ openPrivateDirectory: undefined }))
    const second = registry({ dshHome: home }, hostFs({ openPrivateDirectory: undefined }))
    localIoProbe.racePath = destination
    localIoProbe.raceGate = new Promise<void>(resolve => { localIoProbe.releaseRace = resolve })

    const outcomes = await Promise.allSettled([
      first.registry.save(envelope('cooperate', 'return 1'), { cwd: project, scope: 'project' }),
      second.registry.save(envelope('cooperate', 'return 2'), { cwd: project, scope: 'project' }),
    ])
    expect(outcomes.filter(outcome => outcome.status === 'fulfilled')).toHaveLength(1)
    const rejected = outcomes.find(outcome => outcome.status === 'rejected') as PromiseRejectedResult
    expect(rejected.reason).toMatchObject({ code: 'WORKFLOW_STALE_VERSION' })
    expect(['return 1', 'return 2']).toContain(JSON.parse(await readFile(destination, 'utf8')).script)
    expect([...first.events, ...second.events]).toEqual(['workflows/change'])
  })

  it.skipIf(!posixOnly)('uses cross-process atomic exchange so one update wins and the stale writer restores it', async () => {
    const { home, project } = await layout()
    const barrier = await temp('dsh-registry-exchange-barrier-')
    const destination = join(project, '.dsh', 'workflows', 'cross-process.workflow.json')
    await writeFile(destination, `${JSON.stringify(envelope('cross-process', 'return 0'), null, 2)}\n`)

    const outcomes = await Promise.all([
      childSave([home, project, barrier, 'one', 'return 1']),
      childSave([home, project, barrier, 'two', 'return 2']),
    ])
    expect(outcomes.filter(outcome => outcome.status === 'fulfilled')).toHaveLength(1)
    expect(outcomes.filter(outcome => outcome.code === 'WORKFLOW_STALE_VERSION')).toHaveLength(1)
    const winner = outcomes.find(outcome => outcome.status === 'fulfilled')?.script
    expect(JSON.parse(await readFile(destination, 'utf8')).script).toBe(winner)
    const lockInfo = await lstat(join(project, '.dsh', 'workflows', '.cross-process.workflow.json.lock'))
    expect(lockInfo.isFile()).toBe(true)
    expect(lockInfo.nlink).toBe(1)
  })

  it.skipIf(!posixOnly)('keeps a late third publisher outside an in-flight stale rollback', async () => {
    const { home, project } = await layout()
    const barrier = await temp('dsh-registry-three-process-barrier-')
    const destination = join(project, '.dsh', 'workflows', 'cross-process.workflow.json')
    await writeFile(destination, `${JSON.stringify(envelope('cross-process', 'return 0'), null, 2)}\n`)

    const first = childSave([home, project, barrier, 'one', 'return 1', 'hold'])
    const second = childSave([home, project, barrier, 'two', 'return 2', 'hold'])
    const swapped = await waitForEntry(barrier, 'swapped-')
    const winnerId = swapped.slice('swapped-'.length)
    const third = childSave([home, project, barrier, 'three', 'return 3'])
    await waitForEntry(barrier, 'ready-three')
    await writeFile(join(barrier, `continue-${winnerId}`), '')

    const outcomes = await Promise.all([first, second, third])
    expect(outcomes.filter(outcome => outcome.status === 'fulfilled')).toHaveLength(2)
    expect(outcomes.filter(outcome => outcome.code === 'WORKFLOW_STALE_VERSION')).toHaveLength(1)
    expect(JSON.parse(await readFile(destination, 'utf8')).script).toBe('return 3')
  })

  it.skipIf(!posixOnly)('rejects an in-place version change after observation without overwriting the racer', async () => {
    const { home, project } = await layout()
    const destination = join(project, '.dsh', 'workflows', 'mutated.workflow.json')
    await writeFile(destination, `${JSON.stringify(envelope('mutated', 'return 0'), null, 2)}\n`)
    const { registry: workflows, events } = registry({ dshHome: home }, hostFs({ openPrivateDirectory: undefined }))
    const raced = `${JSON.stringify(envelope('mutated', 'return "racer-version-with-different-size"'), null, 2)}\n`
    localIoProbe.racePath = destination
    localIoProbe.afterObservation = async path => { await writeFile(path, raced) }

    await expect(workflows.save(envelope('mutated', 'return "ours"'), { cwd: project, scope: 'project' }))
      .rejects.toMatchObject({ code: 'WORKFLOW_STALE_VERSION' })
    expect(await readFile(destination, 'utf8')).toBe(raced)
    expect(events).toEqual([])
  })

  it.skipIf(!posixOnly)('fsyncs staged bytes and the parent directory before reporting a local change', async () => {
    const { home, project } = await layout()
    const root = join(project, '.dsh', 'workflows')
    const { registry: workflows, events } = registry({ dshHome: home }, hostFs({ openPrivateDirectory: undefined }))
    const saved = await workflows.save(envelope('durable'), { cwd: project, scope: 'project' })

    const tempSync = localIoProbe.syncPaths.findIndex(path => path.startsWith(join(root, '.durable.workflow.json.')) && path.endsWith('.tmp'))
    const directorySync = localIoProbe.syncPaths.indexOf(root)
    expect(tempSync).toBeGreaterThanOrEqual(0)
    expect(directorySync).toBeGreaterThan(tempSync)
    expect(await readFile(saved.path, 'utf8')).toContain('"durable"')
    expect(events).toEqual(['workflows/change'])
  })

  it.skipIf(!posixOnly)('does not report success when a post-publication writer changes the requested bytes', async () => {
    const { home, project } = await layout()
    const root = join(project, '.dsh', 'workflows')
    const destination = join(root, 'post-publish.workflow.json')
    const { registry: workflows, events } = registry({ dshHome: home }, hostFs({ openPrivateDirectory: undefined }))
    const raced = `${JSON.stringify(envelope('post-publish', 'return "external"'), null, 2)}\n`
    localIoProbe.afterDirectorySync = async path => {
      if (path !== root) return false
      await writeFile(destination, raced)
      return true
    }

    await expect(workflows.save(envelope('post-publish', 'return "ours"'), { cwd: project, scope: 'project' }))
      .rejects.toMatchObject({ code: 'WORKFLOW_STALE_VERSION' })
    expect(await readFile(destination, 'utf8')).toBe(raced)
    expect(events).toEqual([])
  })

  it.skipIf(!posixOnly)('finishes rollback after an abort at exchange instead of leaving proposed bytes published', async () => {
    const { home, project } = await layout()
    const destination = join(project, '.dsh', 'workflows', 'abort-exchange.workflow.json')
    await writeFile(destination, `${JSON.stringify(envelope('abort-exchange', 'return 0'), null, 2)}\n`)
    const { registry: workflows, events } = registry({ dshHome: home }, hostFs({ openPrivateDirectory: undefined }))
    const controller = new AbortController()
    const displacedRace = `${JSON.stringify(envelope('abort-exchange', 'return "external"'), null, 2)}\n`
    localIoProbe.afterSwap = async from => {
      controller.abort()
      // The exchanged `from` is the displaced prior destination. Its mutation
      // forces the stale rollback path after the commit point.
      await writeFile(from, displacedRace)
    }

    await expect(workflows.save(envelope('abort-exchange', 'return "ours"'), {
      cwd: project,
      scope: 'project',
      signal: controller.signal,
    })).rejects.toMatchObject({ code: 'WORKFLOW_STALE_VERSION' })
    expect(await readFile(destination, 'utf8')).toBe(displacedRace)
    expect(await readFile(destination, 'utf8')).not.toContain('return \\"ours\\"')
    expect(events).toEqual([])
  })

  it.skipIf(posixOnly)('fails local save before publication where durable no-follow publication is unsupported', async () => {
    const { home, project } = await layout()
    const destination = join(project, '.dsh', 'workflows', 'unsupported.workflow.json')
    const { registry: workflows, events } = registry({ dshHome: home }, hostFs({ openPrivateDirectory: undefined }))
    await expect(workflows.save(envelope('unsupported'), { cwd: project, scope: 'project' }))
      .rejects.toMatchObject({ code: 'WORKFLOW_REGISTRY_UNSUPPORTED' })
    await expect(lstat(destination)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(events).toEqual([])
  })
})

function payload(): string {
  return `${JSON.stringify({ meta: { name: 'raced', description: 'raced workflow' }, script: 'return 1' }, null, 2)}\n`
}
