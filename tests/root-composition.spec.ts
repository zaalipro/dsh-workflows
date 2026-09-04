import { constants } from 'node:fs'
import { chmod, lstat, mkdtemp, open, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'

vi.mock('node:module', async importOriginal => {
  const actual = await importOriginal<typeof import('node:module')>()
  return {
    ...actual,
    createRequire(url: string | URL) {
      const original = actual.createRequire(url)
      return new Proxy(original, {
        apply(target, thisArg, args: [string]) {
          if (args[0] === '@deepseek-ai/dsh/package.json') {
            if (process.env.DSH_TEST_HOST_MISSING === '1') throw new Error('mock missing CLI host manifest')
            return { name: '@deepseek-ai/dsh', version: process.env.DSH_TEST_HOST_VERSION ?? '0.1.2-rc.1' }
          }
          if (args[0] === '@deepseek-ai/dsh-workflow-worker-thread/package.json') return { version: '0.1.2-rc.1' }
          if (args[0] === '@deepseek-ai/dsh-workflow/package.json') return {
            name: '@deepseek-ai/dsh-workflow',
            version: process.env.DSH_TEST_WORKFLOW_VERSION ?? '0.1.2-rc.1',
          }
          return Reflect.apply(target, thisArg, args)
        },
      })
    },
  }
})

import {
  apply,
  assertSupportedHostVersions,
  HOST_COMPATIBILITY,
  isSupportedHostVersion,
  isSupportedHostVersions,
  isSupportedStockHost,
  inject,
  name,
  resolveWorkflowPackageConfig,
  version,
} from '../src/index.js'
import { applyInvariant, checkWorkflowRegistryStorageInvariant } from '../src/invariant.js'
import { WorkflowSupervisor } from '../src/supervisor/index.js'
import { openPrivateDirectory } from '../src/supervisor/storage/private-root.js'
import { openWorkflowStorage } from '../src/supervisor/storage/index.js'
import {
  installWorkflowShadow,
  WORKFLOW_PROMPT_SECTION,
  WORKFLOW_TOOL_DEFINITION,
} from '../src/tool/index.js'

const roots: string[] = []
const previousHome = process.env.DSH_HOME

afterEach(async () => {
  delete process.env.DSH_TEST_HOST_MISSING
  delete process.env.DSH_TEST_HOST_VERSION
  delete process.env.DSH_TEST_WORKFLOW_VERSION
  if (previousHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = previousHome
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-root-composition-'))
  roots.push(root)
  await chmod(root, 0o700)
  return root
}

function noop(): () => void {
  return () => undefined
}

function hostFs() {
  return {
    async openPrivateDirectory(path: string, options: { create?: boolean } = {}) {
      return openPrivateDirectory(path, options.create === true)
    },
    async resolve(path: string, options?: { cwd?: string }) {
      return { path: isAbsolute(path) ? path : join(options?.cwd ?? '', path) }
    },
    contains(parent: unknown, child: unknown) {
      const left = String((parent as { path?: string })?.path ?? parent)
      const right = String((child as { path?: string })?.path ?? child)
      return right === left || right.startsWith(`${left}/`) || right.startsWith(`${left}\\`)
    },
    async lstat(path: string) {
      try {
        const info = await lstat(path)
        return { type: info.isDirectory() ? 'directory' : info.isFile() ? 'file' : 'other', size: info.size }
      } catch {
        return undefined
      }
    },
    async listDir(target: unknown) {
      const path = typeof target === 'string' ? target : String((target as { path?: string }).path)
      const entries = await readdir(path, { withFileTypes: true })
      return entries.map(entry => ({
        name: entry.name,
        type: entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : 'other',
      }))
    },
    async readBytesNoFollow(path: string, _cwd: unknown, maxBytes = 1_048_576) {
      const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
      try {
        const bytes = await handle.readFile()
        if (bytes.byteLength > maxBytes) throw new Error('too large')
        return new Uint8Array(bytes)
      } finally {
        await handle.close()
      }
    },
  }
}

function faces(overrides: Record<string, unknown> = {}) {
  const agents = { list: () => [] }
  return {
    agents,
    commands: { register: noop, registerFallback: noop, list: () => [] },
    fs: hostFs(),
    skills: { registerTrustedPackageSkill: noop },
    subagents: { getProvider: () => ({}), start: noop },
    userQuestions: { ask: async () => ({ answers: [] }) },
    workflowEngine: { start: () => ({ cancel() {}, dispose: async () => undefined }), validate: async () => ({ ok: true, status: 'completed' }) },
    tools: { replace: noop },
    systemPrompt: { replaceSection: noop },
    provide(this: any, key: string, value: unknown) {
      this[key] = value
      return () => {
        try { delete this[key] } catch { this[key] = undefined }
      }
    },
    get(this: any, key: string) { return this[key] },
    ...overrides,
  }
}

async function provideHost(ctx: Context, options: { readonly remoteEvents?: boolean; readonly fs?: ReturnType<typeof hostFs> } = {}): Promise<{
  readonly commands: { readonly names: string[] }
  readonly skills: { readonly names: string[] }
  readonly events: { readonly registered: string[] }
}> {
  const commands = { names: [] as string[] }
  const skills = { names: [] as string[] }
  const events = { registered: [] as string[] }
  ctx.provide('agents', { list: () => [] })
  ctx.provide('commands', {
    register(definition: { name: string }) {
      commands.names.push(definition.name)
      return noop()
    },
    registerFallback: noop,
    list: () => [],
  })
  ctx.provide('fs', options.fs ?? hostFs())
  ctx.provide('skills', {
    registerTrustedPackageSkill(registration: { name: string }) {
      skills.names.push(registration.name)
      return noop()
    },
  })
  ctx.provide('subagents', { getProvider: () => ({}), start: noop })
  ctx.provide('userQuestions', { ask: async () => ({ answers: [] }) })
  ctx.provide('workflowEngine', {
    start: () => ({ cancel() {}, dispose: async () => undefined }),
    validate: async () => ({ ok: true, status: 'completed' }),
  })
  ctx.provide('tools', { replace: noop, get: () => undefined })
  ctx.provide('systemPrompt', { replaceSection: noop })
  ctx.provide('invariants', { register: () => undefined })
  if (options.remoteEvents !== false) {
    ctx.provide('apiRemoteEvents', {
      register(event: string) {
        events.registered.push(event)
        return noop()
      },
    })
  }
  return { commands, skills, events }
}

describe('package identity and Host inject', () => {
  it('exports the package row identity without blocking boot on optional Remote events', () => {
    expect(name).toBe('dsh-workflows')
    expect(version).toBe('0.1.0-rc.5')
    expect([...inject]).toEqual([
      'agents', 'commands', 'fs', 'skills', 'subagents', 'userQuestions', 'workflowEngine',
    ])
    expect(apply).toHaveProperty('inject', inject)
    expect(HOST_COMPATIBILITY).toEqual({
      host: '@deepseek-ai/dsh',
      versions: ['0.1.2-rc.1'],
      evaluator: 'plugin-compat-engine-v1',
    })
  })

  it('never evaluates the Client aggregate or React from the Host entry', async () => {
    const source = await readFile(join(import.meta.dirname, '../src/index.ts'), 'utf8')
    expect(source).not.toMatch(/from ['"]\.\/client/u)
    expect(source).not.toMatch(/from ['"]react['"]/u)
    expect(source).not.toMatch(/src\/client/u)
    expect(source).toContain('The Host never imports ./client here')
  })
})

describe('exact official Host compatibility', () => {
  it('mirrors the manifest contract and rejects every unverified version', () => {
    expect(isSupportedHostVersion('0.1.2-rc.1')).toBe(true)
    for (const value of [undefined, null, 1, 'future', '0.1.0', '0.1.1', '0.1.1-rc.3']) {
      expect(isSupportedHostVersion(value)).toBe(false)
    }
    expect(isSupportedHostVersions('0.1.2-rc.1', '0.1.2-rc.1')).toBe(true)
    expect(isSupportedStockHost()).toBe(true)
    expect(() => assertSupportedHostVersions('0.1.2-rc.1', '0.1.2-rc.1')).not.toThrow()
  })

  it('requires both the CLI host and evaluator seam to have the exact version', () => {
    for (const versions of [
      ['future', '0.1.2-rc.1'],
      ['0.1.2-rc.1', 'future'],
      ['0.1.1-rc.0', '0.1.2-rc.1'],
      ['0.1.2-rc.1', '0.1.1-rc.3'],
    ] as const) {
      expect(isSupportedHostVersions(...versions)).toBe(false)
      expect(() => assertSupportedHostVersions(...versions)).toThrowError(expect.objectContaining({
        code: 'WORKFLOW_INCOMPATIBLE_HOST',
        message: '@zaalipro/dsh-workflows 0.1.0-rc.5 supports exactly official DeepSeek Harness 0.1.2-rc.1',
      }))
    }
  })

  it('requires the CLI host manifest rather than accepting a worker-thread package as its substitute', () => {
    process.env.DSH_TEST_HOST_MISSING = '1'
    expect(isSupportedStockHost()).toBe(false)
  })
})

describe('host home and disabled aggregate', () => {
  it('keeps an intentionally disabled plugin side-effect free after the exact Host gate', async () => {
    const root = await tempRoot()
    const cases = [
      {
        dshHome: () => { throw new Error('dshHome threw') },
        dshHomePath: ' ',
        homePaths: { dshHome: () => join(root, 'from-home-paths'), path: join(root, 'unused') },
      },
      { dshHomePath: join(root, 'from-path') },
      { get() { throw new Error('get threw') }, dshHome: join(root, 'via-property') },
      {},
    ]
    for (const ctx of cases) {
      await apply(ctx, { enabled: false, dshHome: '~', runsRoot: join(root, 'runs') })
    }
    process.env.DSH_HOME = join(root, 'from-env')
    await apply({}, { enabled: false })
    delete process.env.DSH_HOME
    await apply({}, { enabled: false, dshHome: `~\\from-backslash` })
  })

  it('performs the exact Host gate before config and home inspection', async () => {
    const source = await readFile(join(import.meta.dirname, '../src/index.ts'), 'utf8')
    const body = source.slice(source.indexOf('export async function apply'))
    expect(body.indexOf('assertCompatibleHost()')).toBeGreaterThanOrEqual(0)
    expect(body.indexOf('assertCompatibleHost()')).toBeLessThan(body.indexOf('resolveWorkflowPackageConfig'))
    expect(body.indexOf('assertCompatibleHost()')).toBeLessThan(body.indexOf('hostHome(ctx)'))
  })
})

describe('official stock Host preflight', () => {
  it('requires all evaluator and composition services before storage', async () => {
    const root = await tempRoot()
    const config = { dshHome: root, runsRoot: join(root, 'runs'), definitionWatch: false }
    await expect(apply(faces({ commands: {} }), config)).rejects.toThrow(/commands.register/u)
    await expect(apply(faces({ workflowEngine: {} }), config)).rejects.toThrow(/workflowEngine.start/u)
    await expect(apply(faces({ subagents: {} }), config)).rejects.toThrow(/subagents.getProvider/u)
    await expect(apply(faces({ subagents: { getProvider: noop } }), config)).rejects.toThrow(/subagents.start/u)
    await expect(apply(faces({ fs: undefined }), config)).rejects.toThrow(/"fs"/u)
    await expect(apply(faces({ skills: undefined }), config)).rejects.toThrow(/"skills"/u)
    await expect(apply(faces({ skills: {} }), config)).rejects.toThrow(/skills\.registerProvider/u)
    await expect(apply(faces({ userQuestions: undefined }), config)).rejects.toThrow(/"userQuestions"/u)
    await expect(apply(faces({ agents: undefined, get() { return undefined } }), config)).rejects.toThrow(/"agents"/u)
    await expect(apply(faces({ provide: undefined, reflect: {} }), config)).rejects.toThrow(/Cordis service-registration context/u)
    await expect(apply(faces({ apiRemoteEvents: {} }), config)).rejects.toThrow(/apiRemoteEvents.register/u)
    const fromProperties = faces({
      get() { throw new Error('get threw during faces') },
    })
    await expect(apply(fromProperties, config)).rejects.toThrow()
  })

  it('fails closed when an official tool is visible without the replacement seam', () => {
    expect(() => installWorkflowShadow({
      ctx: {
        tools: { get: () => WORKFLOW_TOOL_DEFINITION },
        systemPrompt: { get: () => WORKFLOW_PROMPT_SECTION },
      },
    }, { registry: {} as any, supervisor: {} as any })).toThrow(/atomic replacement seams or Agent-scoped/u)
  })
})

describe('Host aggregate lifecycle', () => {
  it('uses package-owned run storage instead of the incomplete stock RC2 fs private-directory face', async () => {
    const root = await tempRoot()
    const stockPrivateOpen = vi.fn(async () => {
      throw new Error('stock RC2 private-directory capability must not own workflow run storage')
    })
    const stockFs = { ...hostFs(), openPrivateDirectory: stockPrivateOpen }
    const ctx = new Context()
    await provideHost(ctx, { remoteEvents: false, fs: stockFs })
    const fiber = ctx.plugin(async child => apply(child, {
      dshHome: root,
      runsRoot: join(root, 'runs'),
      definitionWatch: false,
    }))
    if (process.platform === 'win32') {
      await expect(Promise.resolve(fiber)).rejects.toThrow(/workflow storage/u)
      return
    }
    await fiber
    expect(stockPrivateOpen).not.toHaveBeenCalled()
    expect(ctx.get('workflowStorage')).toBeDefined()
    await fiber.dispose()

    // A second exact-host lifecycle over the same root proves teardown released
    // the plugin-owned lifetime lease rather than stranding it in the first boot.
    const restarted = new Context()
    await provideHost(restarted, { remoteEvents: false, fs: stockFs })
    const restartedFiber = restarted.plugin(async child => apply(child, {
      dshHome: root,
      runsRoot: join(root, 'runs'),
      definitionWatch: false,
    }))
    await restartedFiber
    expect(stockPrivateOpen).not.toHaveBeenCalled()
    await restartedFiber.dispose()
  })

  it('activates headless without apiRemoteEvents and web with the invalidation lane', async () => {
    const root = await tempRoot()
    const config = { dshHome: root, runsRoot: join(root, 'runs'), definitionWatch: false as const }
    const headless = new Context()
    const headlessFaces = await provideHost(headless, { remoteEvents: false })
    const headlessFiber = headless.plugin(async ctx => apply(ctx, config))
    if (process.platform === 'win32') {
      await expect(Promise.resolve(headlessFiber)).rejects.toThrow(/workflow storage/u)
      return
    }
    await headlessFiber
    expect(headless.get('workflows')).toBeDefined()
    expect(headless.get('workflowSupervisor')).toBeDefined()
    expect(headless.get('workflowRunRecorder')).toBeDefined()
    expect(headlessFaces.commands.names).toEqual(['workflow', 'create-workflow'])
    expect(headlessFaces.skills.names).toEqual(['create-workflow'])
    expect(headlessFaces.events.registered).toEqual([])
    await headlessFiber.dispose()
    expect(headless.get('workflowSupervisor')).toBeUndefined()

    const web = new Context()
    const webFaces = await provideHost(web, { remoteEvents: true })
    const webFiber = web.plugin(async ctx => apply(ctx, { ...config, runsRoot: join(root, 'web-runs') }))
    await webFiber
    expect(webFaces.events.registered).toEqual(['workflows/run-change'])
    await webFiber.dispose()
    await webFiber.dispose()
  })

  it('loads without waiting for apiRemoteEvents so stock dsh web can boot', async () => {
    const ctx = new Context()
    ctx.provide('agents', { list: () => [] })
    ctx.provide('commands', { register: noop, registerFallback: noop, list: () => [] })
    ctx.provide('fs', hostFs())
    ctx.provide('skills', { registerTrustedPackageSkill: noop })
    ctx.provide('subagents', { getProvider: () => ({}), start: noop })
    ctx.provide('userQuestions', { ask: async () => ({ answers: [] }) })
    ctx.provide('workflowEngine', { start: noop, validate: async () => ({ ok: true }) })
    const fiber = ctx.plugin({
      name: 'dsh-workflows-optional-events',
      inject: [...inject],
      apply: (child: Context) => apply(child, { enabled: false }),
    })
    await fiber
    expect(fiber.state).toBe(2)
    await fiber.dispose()
  })

  it('rolls back a partial activation and restores assigned services', async () => {
    const root = await tempRoot()
    const ctx = faces({
      provide: undefined,
      reflect: {
        provide() { throw new Error('remote provide failed') },
      },
      workflowStorage: 'previous-storage',
    })
    Object.defineProperty(ctx, 'sealed', { value: 1, configurable: false })
    const failing = new Proxy(ctx, {
      deleteProperty() { throw new Error('delete refused') },
    })
    await expect(apply(failing, {
      dshHome: root,
      runsRoot: join(root, 'runs'),
      definitionWatch: false,
    })).rejects.toThrow()
    expect((failing as { workflowStorage?: unknown }).workflowStorage).toBe('previous-storage')
  })

  it('tears down an empty resource set when storage bootstrap fails', async () => {
    const root = await tempRoot()
    const ctx = faces({
      fs: {
        ...hostFs(),
        openPrivateDirectory: async () => ({
          openDirectory: async () => { throw Object.assign(new Error('missing extras'), { code: 'FS_IO_ERROR' }) },
          readBytes: async () => new Uint8Array(),
          writeText: async () => ({}),
          assertIdentity: async () => undefined,
          close: async () => undefined,
        }),
      },
    })
    await expect(apply(ctx, { dshHome: root, runsRoot: join(root, 'runs'), definitionWatch: false })).rejects.toThrow()
  })

  it('preserves the first teardown error from supervisor close/dispose', async () => {
    const root = await tempRoot()
    const close = vi.spyOn(WorkflowSupervisor.prototype, 'closeAdmissionSync').mockImplementation(() => {
      throw new Error('close failed')
    })
    const dispose = vi.spyOn(WorkflowSupervisor.prototype, 'dispose').mockRejectedValue(new Error('dispose failed'))
    try {
      const ctx = faces({
        provide: undefined,
        reflect: { provide() { throw new Error('remote provide failed') } },
      })
      await expect(apply(ctx, { dshHome: root, runsRoot: join(root, 'runs'), definitionWatch: false })).rejects.toThrow()
    } finally {
      close.mockRestore()
      dispose.mockRestore()
    }
  })

  it('releases the aggregate storage lease after supervisor disposal rejects', async () => {
    if (process.platform === 'win32') return
    const root = await tempRoot()
    const runsRoot = join(root, 'runs-after-supervisor-failure')
    const ctx = new Context()
    await provideHost(ctx, { remoteEvents: false })
    const fiber = ctx.plugin(async child => apply(child, {
      dshHome: root, runsRoot, definitionWatch: false,
    }))
    await fiber
    const terminalFailure = new Error('terminal manifest commit failed')
    const dispose = vi.spyOn(WorkflowSupervisor.prototype, 'dispose').mockRejectedValue(terminalFailure)
    try {
      // Cordis may report effect failures through its lifecycle diagnostics;
      // regardless, the aggregate must continue through storage.dispose().
      await Promise.resolve(fiber.dispose()).catch(() => undefined)
      const reopened = await openWorkflowStorage(resolveWorkflowPackageConfig({
        dshHome: root, runsRoot, definitionWatch: false,
      }, root))
      await reopened.dispose()
    } finally {
      dispose.mockRestore()
      await Promise.resolve(fiber.dispose()).catch(() => undefined)
    }
  })

  it('uses a dispose-object provider return while rolling back a later child', async () => {
    const root = await tempRoot()
    const ctx = faces({
      provide(_key: string, _value: unknown) {
        return { dispose() { /* provider-owned */ } }
      },
    })
    await expect(apply(ctx, { dshHome: root, runsRoot: join(root, 'runs'), definitionWatch: false })).rejects.toThrow()
  })
})

describe('package invariants', () => {
  it('reports registry/storage lifecycle violations and is a no-op without a registry', () => {
    expect(checkWorkflowRegistryStorageInvariant(undefined)).toEqual([])
    expect(checkWorkflowRegistryStorageInvariant({
      registry: { enabled: false },
      storage: { recovered: true, exposed: true, leaseOwned: false },
      disposed: true,
    })).toEqual([])
    expect(checkWorkflowRegistryStorageInvariant({ disposed: true })).toEqual([])
    expect(checkWorkflowRegistryStorageInvariant({
      registry: { enabled: false, watchers: 2 },
      storage: { recovered: false, exposed: true, leaseOwned: true },
      issues: ['corrupt head'],
      disposed: true,
    })).toEqual([
      'disabled registry has active watchers',
      'storage is exposed before recovery',
      'corrupt head',
      'disposed storage still owns a lease/descriptor/operation',
    ])
    applyInvariant({} as any)
    const registered: string[] = []
    applyInvariant({ invariants: { register: (packageName: string) => registered.push(packageName) } } as any)
    expect(registered).toEqual(['@zaalipro/dsh-workflows'])
  })
})
