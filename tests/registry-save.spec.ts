import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { WorkflowRegistry } from '../src/registry/index.js'

const registries: WorkflowRegistry[] = []
const temps: string[] = []
const posixOnly = process.platform !== 'win32'

afterEach(async () => {
  await Promise.all(registries.splice(0).map(registry => registry.dispose()))
  await Promise.all(temps.splice(0).map(path => rm(path, { recursive: true, force: true })))
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

  it('fails closed without openPrivateDirectory and when the root escapes', async () => {
    const { home, project } = await layout()
    const missing = registry({ dshHome: home }, hostFs({ openPrivateDirectory: undefined }))
    await expect(missing.registry.save(envelope('a'), { cwd: project, scope: 'project' }))
      .rejects.toMatchObject({ code: 'WORKFLOW_REGISTRY_UNSUPPORTED' })
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
})

function payload(): string {
  return `${JSON.stringify({ meta: { name: 'raced', description: 'raced workflow' }, script: 'return 1' }, null, 2)}\n`
}
