import { chmod, link, lstat, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { WorkflowRegistry, WorkflowRegistryError } from '../src/registry/index.js'
import type { ChokidarFactory, ChokidarHandle } from '../src/registry/watchers.js'

const registries: WorkflowRegistry[] = []
const temps: string[] = []
const posixOnly = process.platform !== 'win32'

afterEach(async () => {
  await Promise.all(registries.splice(0).map(registry => registry.dispose()))
  await Promise.all(temps.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

async function temp(prefix = 'dsh-registry-discovery-'): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), prefix))
  temps.push(path)
  return path
}

function envelope(name: string, script = `complete({ name: ${JSON.stringify(name)} })`, extra: Record<string, unknown> = {}) {
  return {
    meta: { name, description: `${name} workflow`, ...extra },
    script,
  }
}

function payload(name: string, extra: Record<string, unknown> = {}): string {
  const value = envelope(name, extra.script as string | undefined, extra)
  return `${JSON.stringify({ meta: value.meta, script: value.script }, null, 2)}\n`
}

async function layout(): Promise<{ home: string; project: string; bundled: string }> {
  const base = await temp()
  const home = join(base, 'home')
  const project = join(base, 'project')
  const bundled = join(base, 'pkg', 'workflows')
  await mkdir(join(home, 'workflows'), { recursive: true })
  await mkdir(join(project, '.git'), { recursive: true })
  await mkdir(join(project, '.dsh', 'workflows'), { recursive: true })
  await mkdir(bundled, { recursive: true })
  return { home, project, bundled }
}

function hostDirectory(root: string, extras: Record<string, unknown> = {}) {
  return {
    async listEntries() {
      const entries = await readdir(root, { withFileTypes: true })
      return entries.map(entry => ({
        name: entry.name,
        type: entry.isSymbolicLink() ? 'symlink' : entry.isFile() ? 'file' : entry.isDirectory() ? 'directory' : 'other',
      }))
    },
    async readBytes(name: string, _signal: AbortSignal | undefined, maxBytes: number) {
      const bytes = new Uint8Array(await readFile(join(root, name)))
      if (bytes.byteLength > maxBytes) {
        throw Object.assign(new Error(`exceeds the ${maxBytes}-byte limit`), { code: 'FS_TOO_LARGE' })
      }
      return bytes
    },
    async writeText(name: string, content: string, expected: { kind: string }) {
      const path = join(root, name)
      await writeFile(path, content, { flag: expected.kind === 'createIfAbsent' ? 'wx' : 'w', mode: 0o600 })
      const info = await lstat(path)
      return { version: { ino: info.ino } }
    },
    async assertIdentity() { /* pinned */ },
    async close() { /* closed */ },
    ...extras,
  }
}

function hostFs(overrides: Record<string, unknown> = {}) {
  return {
    processPath(target: unknown) {
      return typeof target === 'string' ? target : String((target as { path?: string }).path ?? target)
    },
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
    async stat(target: unknown) {
      const path = typeof target === 'string' ? target : String((target as { path?: string }).path)
      return this.lstat(path)
    },
    async listDir() {
      throw new Error('must not fall back to path-shaped listDir')
    },
    async readBytesNoFollow(path: string, _opts: unknown, _signal: AbortSignal | undefined, maxBytes: number) {
      const bytes = new Uint8Array(await readFile(path))
      if (bytes.byteLength > maxBytes) throw Object.assign(new Error('too large'), { code: 'FS_TOO_LARGE' })
      return bytes
    },
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
    fs, emit: (name: string) => { events.push(name) }, logger: { warn() { /* silent */ } },
  }, { definitionWatch: false, ...config })
  registries.push(created)
  return { registry: created, events }
}

describe('registry discovery (RS7)', () => {
  it('merges bundled > project > user, sorts by UTF-16 name, and fails loud on a shadowed malformed file', async () => {
    const { home, project, bundled } = await layout()
    await writeFile(join(bundled, 'shared.workflow.json'), payload('shared', { description: 'bundled copy' }))
    await writeFile(join(project, '.dsh', 'workflows', 'shared.workflow.json'), payload('shared', { description: 'project copy' }))
    await writeFile(join(home, 'workflows', 'shared.workflow.json'), payload('shared', { description: 'user copy' }))
    await writeFile(join(home, 'workflows', 'user-only.workflow.json'), payload('user-only'))
    await writeFile(join(project, '.dsh', 'workflows', 'alpha.workflow.json'), payload('alpha'))
    const { registry: workflows } = registry({
      dshHome: home, bundledDefinitionsDir: bundled, maxDefinitionsPerRoot: 16,
    }, hostFs())
    const listed = await workflows.list({ cwd: project })
    expect(listed.map(item => item.name)).toEqual(['alpha', 'shared', 'user-only'])
    expect(listed.find(item => item.name === 'shared')?.scope).toBe('bundled')
    expect(listed.find(item => item.name === 'shared')?.description).toBe('bundled copy')
    const winner = await workflows.get('shared', { cwd: project })
    expect(winner).toMatchObject({ scope: 'bundled', script: expect.stringContaining('shared') })
    await writeFile(join(home, 'workflows', 'shared.workflow.json'), '{')
    await expect(workflows.list({ cwd: project })).rejects.toThrow(/not valid JSON — /u)
  })

  it('treats an absent root as empty and rejects omitted cwd like Remote', async () => {
    const { home, project } = await layout()
    await rm(join(project, '.dsh'), { recursive: true })
    const { registry: workflows } = registry({ dshHome: home }, hostFs())
    await expect(workflows.list({ cwd: project })).resolves.toEqual([])
    await expect(workflows.get('missing', { cwd: project })).resolves.toBeUndefined()
    await expect(workflows.list()).rejects.toThrow('workflow definition listing requires a session cwd')
    await expect(workflows.get('alpha')).rejects.toThrow('workflow definition listing requires a session cwd')
  })

  it('implements disabled list/snapshot/get exactly', async () => {
    const { registry: workflows } = registry({ dshHome: '/tmp/disabled-home', enabled: false })
    await expect(workflows.list()).resolves.toEqual([])
    await expect(workflows.snapshot()).resolves.toEqual({ definitions: [], complete: true })
    await expect(workflows.get('Bad_Name')).resolves.toBeUndefined()
  })

  it('fails closed when the private directory cannot list relatively', async () => {
    const { home, project } = await layout()
    await writeFile(join(project, '.dsh', 'workflows', 'alpha.workflow.json'), payload('alpha'))
    let listedByPath = 0
    const { registry: workflows } = registry({ dshHome: home }, hostFs({
      async listDir() {
        listedByPath += 1
        throw new Error('must not fall back to path-shaped listDir')
      },
      async openPrivateDirectory() {
        return {
          async readBytes() { return new Uint8Array() },
          async writeText() { return {} },
          async assertIdentity() { /* pinned */ },
          async close() { /* closed */ },
        }
      },
    }))
    await expect(workflows.list({ cwd: project })).rejects.toMatchObject({
      code: 'WORKFLOW_REGISTRY_UNSUPPORTED',
      message: expect.stringContaining('descriptor-rooted workflow definition listing is unavailable'),
    })
    expect(listedByPath).toBe(0)
  })

  it('lists through directory.listDir when listEntries is absent and still never uses fs.listDir', async () => {
    const { home, project } = await layout()
    await writeFile(join(project, '.dsh', 'workflows', 'zeta.workflow.json'), payload('zeta'))
    const { registry: workflows } = registry({ dshHome: home }, hostFs({
      async openPrivateDirectory(path: string) {
        const directory = hostDirectory(path)
        return {
          listDir: directory.listEntries,
          readBytes: directory.readBytes,
          writeText: directory.writeText,
          assertIdentity: directory.assertIdentity,
          close: directory.close,
        }
      },
    }))
    await expect(workflows.list({ cwd: project })).resolves.toEqual([
      expect.objectContaining({ name: 'zeta', scope: 'project' }),
    ])
  })

  it('fails loud for symlink roots, non-directories, invalid names, limits, UTF-8, and links', async () => {
    const first = await layout()
    await rm(join(first.project, '.dsh', 'workflows'), { recursive: true })
    await writeFile(join(first.project, '.dsh', 'workflows'), 'not a directory')
    const a = registry({ dshHome: first.home }, hostFs())
    await expect(a.registry.list({ cwd: first.project })).rejects.toThrow(/workflow root must be a directory/u)

    const second = await layout()
    await rm(join(second.project, '.dsh', 'workflows'), { recursive: true })
    await mkdir(join(second.project, 'real-workflows'))
    await symlink(join(second.project, 'real-workflows'), join(second.project, '.dsh', 'workflows'))
    const b = registry({ dshHome: second.home }, hostFs())
    await expect(b.registry.list({ cwd: second.project })).rejects.toThrow(/symbolic-link workflow roots are not allowed/u)

    const third = await layout()
    await mkdir(join(third.project, '.dsh', 'workflows', 'nested.workflow.json'))
    const c = registry({ dshHome: third.home }, hostFs())
    await expect(c.registry.list({ cwd: third.project })).rejects.toThrow(/symbolic-link definitions are not allowed/u)

    const fourth = await layout()
    await writeFile(join(fourth.project, '.dsh', 'workflows', 'pause.workflow.json'), payload('pause'))
    const d = registry({ dshHome: fourth.home }, hostFs())
    await expect(d.registry.list({ cwd: fourth.project })).rejects.toThrow(/filename stem "pause" is not a valid workflow name/u)

    const fifth = await layout()
    await writeFile(join(fifth.project, '.dsh', 'workflows', 'a.workflow.json'), payload('a'))
    await writeFile(join(fifth.project, '.dsh', 'workflows', 'b.workflow.json'), payload('b'))
    const e = registry({ dshHome: fifth.home, maxDefinitionsPerRoot: 1 }, hostFs())
    await expect(e.registry.list({ cwd: fifth.project })).rejects.toThrow(/found 2 workflow definitions; maximum is 1/u)

    const sixth = await layout()
    await writeFile(join(sixth.project, '.dsh', 'workflows', 'bad.workflow.json'), Buffer.from([0xff]))
    const f = registry({ dshHome: sixth.home }, hostFs())
    await expect(f.registry.list({ cwd: sixth.project })).rejects.toThrow(/definition is not valid UTF-8/u)
  })

  it('maps Host not-regular and too-large reads onto spec suffixes', async () => {
    const { home, project } = await layout()
    await writeFile(join(project, '.dsh', 'workflows', 'alpha.workflow.json'), payload('alpha'))
    const tooLarge = registry({ dshHome: home }, hostFs({
      async openPrivateDirectory(path: string) {
        return hostDirectory(path, {
          async readBytes() {
            throw Object.assign(new Error('too big'), { code: 'FS_TOO_LARGE' })
          },
        })
      },
    }))
    await expect(tooLarge.registry.list({ cwd: project })).rejects.toThrow(/definition exceeds the configured-byte limit/u)
    const linked = registry({ dshHome: home }, hostFs({
      async openPrivateDirectory(path: string) {
        return hostDirectory(path, {
          async readBytes() {
            throw Object.assign(new Error('link'), { code: 'FS_NOT_REGULAR_FILE' })
          },
        })
      },
    }))
    await expect(linked.registry.list({ cwd: project })).rejects.toThrow(/symbolic-link definitions are not allowed/u)
  })

  it('rejects escaped Host roots, falls back without private-directory, and rejects unsafe filenames', async () => {
    const { home, project } = await layout()
    await writeFile(join(project, '.dsh', 'workflows', 'alpha.workflow.json'), payload('alpha'))
    const escaped = registry({ dshHome: home }, hostFs({
      contains() { return false },
    }))
    await expect(escaped.registry.list({ cwd: project })).rejects.toThrow(/escapes its project scope through a symbolic-link ancestor/u)

    const missing = registry({ dshHome: home }, hostFs({
      openPrivateDirectory: undefined,
    }))
    await expect(missing.registry.list({ cwd: project })).resolves.toEqual([
      expect.objectContaining({ name: 'alpha', scope: 'project' }),
    ])

    const unsafe = registry({ dshHome: home }, hostFs({
      async openPrivateDirectory(path: string) {
        return hostDirectory(path, {
          async listEntries() {
            return [{ name: '../escape.workflow.json', type: 'file' }]
          },
        })
      },
    }))
    await expect(unsafe.registry.list({ cwd: project })).rejects.toThrow(/unsafe workflow filename/u)
  })

  it('marks snapshot complete on the first observe and incomplete when a watcher event races discovery', async () => {
    const { home, project } = await layout()
    await writeFile(join(project, '.dsh', 'workflows', 'alpha.workflow.json'), payload('alpha'))
    const quiet: ChokidarFactory = () => ({
      on() { return this },
      close() { /* no-op */ },
    } as ChokidarHandle)
    const quietRegistry = new WorkflowRegistry({
      fs: hostFs(), emit() { /* hint */ },
    }, { dshHome: home, watchFactory: quiet, watchScheduler: { schedule() { return 0 }, cancel() { /* no-op */ } } })
    registries.push(quietRegistry)
    const first = await quietRegistry.snapshot({ cwd: project })
    expect(first.complete).toBe(true)
    expect(first.definitions.map(item => item.name)).toEqual(['alpha'])

    let listener: ((event: string, path: string) => void) | undefined
    const racing: ChokidarFactory = () => ({
      on(_event: 'all', next: (event: string, path: string) => void) {
        listener = next
        return this
      },
      close() { /* no-op */ },
    } as ChokidarHandle)
    const racingFs = hostFs({
      async openPrivateDirectory(path: string, options: { create?: boolean } = {}) {
        listener?.('add', 'alpha.workflow.json')
        if (options.create) await mkdir(path, { recursive: true, mode: 0o700 })
        return hostDirectory(path)
      },
    })
    const racingRegistry = new WorkflowRegistry({
      fs: racingFs, emit() { /* hint */ },
    }, {
      dshHome: home,
      watchFactory: racing,
      watchScheduler: { schedule(callback) { callback(); return 0 }, cancel() { /* no-op */ } },
    })
    registries.push(racingRegistry)
    await expect(racingRegistry.snapshot({ cwd: project })).resolves.toMatchObject({ complete: false })
  })

  it('cancels discovery when the lookup signal aborts', async () => {
    const { home, project } = await layout()
    const controller = new AbortController()
    controller.abort()
    const { registry: workflows } = registry({ dshHome: home }, hostFs())
    await expect(workflows.list({ cwd: project, signal: controller.signal })).rejects.toThrow()
  })

  it('throws constructor bounds and wraps Host lstat failures', async () => {
    expect(() => new WorkflowRegistry({ definitionMaxBytes: 0, dshHome: '/tmp/x' }))
      .toThrow(/definitionMaxBytes must be a positive safe integer/u)
    expect(() => new WorkflowRegistry({ maxDefinitionsPerRoot: 0, dshHome: '/tmp/x' }))
      .toThrow(/maxDefinitionsPerRoot must be a positive safe integer/u)
    const { home, project } = await layout()
    const { registry: workflows } = registry({ dshHome: home }, hostFs({
      async lstat(path: string) {
        if (path.endsWith('.git')) return { type: 'directory' }
        if (path.endsWith('workflows')) throw Object.assign(new Error('stat failed'), { code: 'EIO' })
        try {
          const info = await lstat(path)
          return { type: info.isDirectory() ? 'directory' : 'file', version: { ino: info.ino } }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
          throw error
        }
      },
    }))
    await expect(workflows.list({ cwd: project })).rejects.toBeInstanceOf(WorkflowRegistryError)
    const stringThrow = registry({ dshHome: home }, hostFs({
      async lstat(path: string) {
        if (path.endsWith('.git')) return { type: 'directory' }
        throw 'stat-string'
      },
    }))
    await expect(stringThrow.registry.list({ cwd: project })).rejects.toThrow(/stat-string/u)
    const dom = registry({ dshHome: home }, hostFs({
      async lstat(path: string) {
        if (path.endsWith('.git')) return { type: 'directory' }
        throw new DOMException('The operation was aborted.', 'AbortError')
      },
    }))
    await expect(dom.registry.list({ cwd: project })).rejects.toThrow(/aborted/u)
  })

  it.skipIf(!posixOnly)('discovers through the local no-follow fallback when Host fs is absent', async () => {
    const { home, project } = await layout()
    await writeFile(join(project, '.dsh', 'workflows', 'local.workflow.json'), payload('local'))
    const local = new WorkflowRegistry({ dshHome: home, definitionWatch: false })
    registries.push(local)
    await expect(local.list({ cwd: project })).resolves.toEqual([
      expect.objectContaining({ name: 'local', scope: 'project' }),
    ])
    await expect(local.get('local', { cwd: project })).resolves.toMatchObject({
      script: expect.stringContaining('local'),
    })
  })

  it.skipIf(!posixOnly)('rejects a file ancestor, a file root, and a local malformed matching file', async () => {
    const fileAncestor = await layout()
    await rm(join(fileAncestor.project, '.dsh'), { recursive: true })
    await writeFile(join(fileAncestor.project, '.dsh'), 'not a directory')
    const localAncestor = new WorkflowRegistry({ dshHome: fileAncestor.home, definitionWatch: false })
    registries.push(localAncestor)
    await expect(localAncestor.list({ cwd: fileAncestor.project })).rejects.toThrow(/workflow root ancestor must be a directory/u)

    const malformed = await layout()
    await writeFile(join(malformed.project, '.dsh', 'workflows', 'bad.workflow.json'), '{')
    const localBad = new WorkflowRegistry({ dshHome: malformed.home, definitionWatch: false })
    registries.push(localBad)
    await expect(localBad.list({ cwd: malformed.project })).rejects.toThrow(/not valid JSON — /u)

    const linked = await layout()
    const original = join(linked.project, '.dsh', 'workflows', 'hard.workflow.json')
    await writeFile(original, payload('hard'))
    await link(original, join(linked.project, '.dsh', 'workflows', 'hard-2.workflow.json'))
    const localLink = new WorkflowRegistry({ dshHome: linked.home, definitionWatch: false })
    registries.push(localLink)
    await expect(localLink.list({ cwd: linked.project })).rejects.toThrow(/symbolic-link definitions are not allowed/u)
  })

  it('constructs from a Host context, a config object, and env home fallbacks', async () => {
    const previousHome = process.env.HOME
    const previousDsh = process.env.DSH_HOME
    delete process.env.DSH_HOME
    process.env.HOME = '/tmp/dsh-registry-home'
    const fromEnv = new WorkflowRegistry({ enabled: false })
    registries.push(fromEnv)
    delete process.env.HOME
    const fromDefault = new WorkflowRegistry({ enabled: false })
    registries.push(fromDefault)
    if (previousHome === undefined) delete process.env.HOME
    else process.env.HOME = previousHome
    if (previousDsh === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousDsh
    const ctxOnly = new WorkflowRegistry({ emit() { /* hint */ }, logger: { warn() { /* silent */ } } }, {
      dshHome: '/tmp/dsh-ctx', enabled: false,
    })
    registries.push(ctxOnly)
    expect(ctxOnly.config.enabled).toBe(false)
    const oneArgHost = new WorkflowRegistry({ fs: hostFs() })
    registries.push(oneArgHost)
    const empty = new WorkflowRegistry(undefined)
    registries.push(empty)
    const fromFalse = new WorkflowRegistry(false as never)
    registries.push(fromFalse)
    const { home, project } = await layout()
    await writeFile(join(project, '.dsh', 'workflows', 'alpha.workflow.json'), payload('alpha'))
    const host = new WorkflowRegistry({ fs: hostFs(), emit() { /* hint */ } }, {
      dshHome: home, definitionWatch: false,
    })
    registries.push(host)
    await host.dispose()
    const saved = await host.save(envelope('after-dispose'), { cwd: project, scope: 'project' })
    expect(saved.name).toBe('after-dispose')
    const aborting = registry({ dshHome: home }, hostFs({
      async lstat(path: string) {
        if (path.endsWith(`${join('.dsh', 'workflows')}`) || path.endsWith('.dsh/workflows')) {
          throw Object.assign(new Error('aborted'), { code: 'ABORT_ERR' })
        }
        try {
          const info = await lstat(path)
          return { type: info.isDirectory() ? 'directory' : 'file', version: { ino: info.ino } }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
          throw error
        }
      },
    }))
    await expect(aborting.registry.list({ cwd: project })).rejects.toThrow(/aborted/u)
  })

  it.skipIf(!posixOnly)('fails loud on local symlink definitions and escaped roots', async () => {
    const { home, project } = await layout()
    const outside = join(project, 'outside.workflow.json')
    await writeFile(outside, payload('linked'))
    await symlink(outside, join(project, '.dsh', 'workflows', 'linked.workflow.json'))
    const local = new WorkflowRegistry({ dshHome: home, definitionWatch: false })
    registries.push(local)
    await expect(local.list({ cwd: project })).rejects.toThrow(/symbolic-link definitions are not allowed/u)

    const escaped = await layout()
    await rm(join(escaped.project, '.dsh'), { recursive: true })
    const outsideRoot = await temp('dsh-registry-outside-')
    await mkdir(join(outsideRoot, 'workflows'), { recursive: true })
    await writeFile(join(outsideRoot, 'workflows', 'escaped.workflow.json'), payload('escaped'))
    await symlink(outsideRoot, join(escaped.project, '.dsh'))
    const localEscaped = new WorkflowRegistry({ dshHome: escaped.home, definitionWatch: false })
    registries.push(localEscaped)
    await expect(localEscaped.list({ cwd: escaped.project })).rejects.toThrow(/symbolic-link/u)
  })
})
