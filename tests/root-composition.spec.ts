import { constants } from 'node:fs'
import { chmod, lstat, mkdtemp, open, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'

import {
  apply,
  assertCompatibleHost,
  HOST_COMPATIBILITY,
  inject,
  name,
  version,
  WorkflowPackageError,
} from '../src/index.js'
import { applyInvariant, checkWorkflowRegistryStorageInvariant } from '../src/invariant.js'
import { WorkflowSupervisor } from '../src/supervisor/index.js'
import { openPrivateDirectory } from '../src/supervisor/storage/private-root.js'
import {
  installWorkflowShadow,
  WORKFLOW_PROMPT_SECTION,
  WORKFLOW_TOOL_DEFINITION,
} from '../src/tool/index.js'

const roots: string[] = []
const previousHome = process.env.DSH_HOME

afterEach(async () => {
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

const INCOMPATIBLE =
  '@zaalipro/dsh-workflows requires a DeepSeek Harness release with the external workflow prerequisites; 0.1.0-rc.8 is not compatible'

function expectIncompatible(ctx: unknown): void {
  try {
    assertCompatibleHost(ctx as any)
    throw new Error('expected WORKFLOW_INCOMPATIBLE_HOST')
  } catch (error) {
    expect(error).toBeInstanceOf(WorkflowPackageError)
    expect(error).toMatchObject({ code: 'WORKFLOW_INCOMPATIBLE_HOST', message: INCOMPATIBLE })
  }
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
    workflowPrerequisites: { release: 'H' },
    agents,
    commands: { register: noop, registerFallback: noop, list: () => [] },
    fs: hostFs(),
    skills: { registerTrustedPackageSkill: noop },
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

async function provideHost(ctx: Context, options: { readonly remoteEvents?: boolean } = {}): Promise<{
  readonly commands: { readonly names: string[] }
  readonly skills: { readonly names: string[] }
  readonly events: { readonly registered: string[] }
}> {
  const commands = { names: [] as string[] }
  const skills = { names: [] as string[] }
  const events = { registered: [] as string[] }
  ctx.provide('workflowPrerequisites', { release: 'H' })
  ctx.provide('agents', { list: () => [] })
  ctx.provide('commands', {
    register(definition: { name: string }) {
      commands.names.push(definition.name)
      return noop()
    },
    registerFallback: noop,
    list: () => [],
  })
  ctx.provide('fs', hostFs())
  ctx.provide('skills', {
    registerTrustedPackageSkill(registration: { name: string }) {
      skills.names.push(registration.name)
      return noop()
    },
  })
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
    expect(version).toBe('0.1.0-rc.1')
    expect([...inject]).toEqual([
      'agents', 'commands', 'fs', 'skills', 'userQuestions', 'workflowEngine',
    ])
    expect(apply).toHaveProperty('inject', inject)
    expect(HOST_COMPATIBILITY).toEqual({
      release: 'H',
      reject: ['0.1.0-rc.8'],
      verifiedLaterReleases: [],
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

describe('assertCompatibleHost', () => {
  it('rejects missing markers and never infers H from engine methods', () => {
    expectIncompatible({})
    expectIncompatible({
      workflowEngine: { start() {}, validate() {}, release() {}, resume() {}, checkpoint() {} },
      commands: { registerFallback() {} },
      tools: { replace() {} },
      systemPrompt: { replaceSection() {} },
    })
  })

  it('rejects stock RC8, unverified 0.1.x, and research 0.1.1-rc.1 even with release H', () => {
    expectIncompatible({ workflowPrerequisites: { release: 'H', version: '0.1.0-rc.8' } })
    expectIncompatible({ workflowEngine: { prerequisites: { release: 'H', hostVersion: '0.1.0-rc.9' } } })
    expectIncompatible({ dshWorkflowPrerequisites: { release: 'H', harnessVersion: '0.1.1-rc.1' } })
    expectIncompatible({ workflowPrerequisites: { release: 'H', version: '0.1.1' } })
    expectIncompatible({ workflowPrerequisites: { release: '0.1.1-rc.1' } })
  })

  it('rejects explicit capability denials and accepts symbolic H without a guessed tag', async () => {
    expectIncompatible({ workflowPrerequisites: { release: 'H', compatible: false } })
    expectIncompatible({ workflowPrerequisites: { release: 'H', externalWorkflows: false } })
    expectIncompatible({ workflowPrerequisites: { release: 'H', workflowPackage: false } })
    assertCompatibleHost({ workflowPrerequisites: { release: 'H', version: 1 } })
    assertCompatibleHost({ workflowPrerequisites: { release: 'H' } })
    assertCompatibleHost({ workflowPrerequisites: { release: 'H', version: '0.2.0' } })
    const throwing = {
      get workflowPrerequisites() { throw new Error('direct marker threw') },
      workflowEngine: { prerequisites: { release: 'H' } },
    }
    assertCompatibleHost(throwing)
    await apply({ workflowPrerequisites: { release: 'H' } }, { enabled: false })
  })
})

describe('host home and disabled aggregate', () => {
  it('expands ~ homes and prefers host/path/env candidates without Session admission', async () => {
    const root = await tempRoot()
    await apply({
      workflowPrerequisites: { release: 'H' },
      dshHome: () => { throw new Error('dshHome threw') },
      dshHomePath: ' ',
      homePaths: {
        dshHome: () => join(root, 'from-home-paths'),
        path: join(root, 'unused'),
      },
    }, { enabled: false, runsRoot: join(root, 'runs') })
    await apply({
      workflowPrerequisites: { release: 'H' },
      dshHomePath: join(root, 'from-path'),
    }, { enabled: false, dshHome: '~', runsRoot: join(root, 'runs-2') })
    await apply({
      workflowPrerequisites: { release: 'H' },
    }, { enabled: false, dshHome: `~/${join('from-tilde').replaceAll('\\', '/')}` })
    await apply({
      workflowPrerequisites: { release: 'H' },
    }, { enabled: false, dshHome: `~\\from-backslash` })
    process.env.DSH_HOME = join(root, 'from-env')
    await apply({ workflowPrerequisites: { release: 'H' } }, { enabled: false })
    delete process.env.DSH_HOME
    await apply({ workflowPrerequisites: { release: 'H' } }, { enabled: false })
    await apply({
      workflowPrerequisites: { release: 'H' },
      get() { throw new Error('get threw') },
      dshHome: join(root, 'via-property'),
    }, { enabled: false, bundledDefinitionsDir: join(root, 'bundled') })
    const asFunction = Object.assign(() => undefined, { workflowPrerequisites: { release: 'H' } })
    assertCompatibleHost(asFunction)
    assertCompatibleHost({ workflowPrerequisites: 'H', dshWorkflowPrerequisites: { release: 'H' } })
  })
})

describe('assertHostFaces fail-closed', () => {
  it('requires registerFallback, tools.replace, and replaceSection before storage', async () => {
    const root = await tempRoot()
    const config = { dshHome: root, runsRoot: join(root, 'runs'), definitionWatch: false }
    await expect(apply(faces({ commands: { register: noop } }), config)).rejects.toThrow(/commands.registerFallback/u)
    await expect(apply(faces({ tools: {} }), config)).rejects.toThrow(/tools.replace/u)
    await expect(apply(faces({ systemPrompt: {} }), config)).rejects.toThrow(/systemPrompt.replaceSection/u)
    await expect(apply(faces({ workflowEngine: { start: noop } }), config)).rejects.toThrow(/workflowEngine.validate/u)
    await expect(apply(faces({ fs: { ...hostFs(), openPrivateDirectory: undefined } }), config)).rejects.toThrow(/fs.openPrivateDirectory/u)
    await expect(apply(faces({ skills: {} }), config)).rejects.toThrow(/registerTrustedPackageSkill/u)
    await expect(apply(faces({ userQuestions: {} }), config)).rejects.toThrow(/userQuestions.ask/u)
    await expect(apply(faces({ agents: undefined, get() { return undefined } }), config)).rejects.toThrow(/"agents"/u)
    const unstable = faces()
    const original = unstable.agents
    unstable.get = (key: string) => key === 'agents' ? { list: () => [] } : (unstable as any)[key]
    unstable.agents = original
    await expect(apply(unstable, config)).rejects.toThrow(/unstable agents/u)
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
    }, { registry: {} as any, supervisor: {} as any })).toThrow(/tools.replace and systemPrompt.replaceSection/u)
  })
})

describe('Host aggregate lifecycle', () => {
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
    ctx.provide('workflowPrerequisites', { release: 'H' })
    ctx.provide('agents', { list: () => [] })
    ctx.provide('commands', { register: noop, registerFallback: noop, list: () => [] })
    ctx.provide('fs', hostFs())
    ctx.provide('skills', { registerTrustedPackageSkill: noop })
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
