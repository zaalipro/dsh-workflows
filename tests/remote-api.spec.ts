import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'

import { WorkflowRegistry } from '../src/registry/index.js'
import { WorkflowDefinitionsRemote } from '../src/registry/remote.js'
import { WorkflowPackageError } from '../src/invariant.js'
import {
  decodeWorkflowCursor,
  encodeWorkflowCursor,
  WorkflowCursorError,
} from '../src/supervisor/cursors.js'
import { WorkflowRunsRemote } from '../src/supervisor/remote.js'
import type {
  WorkflowRunArtifactChunk,
  WorkflowRunDetail,
  WorkflowRunHead,
  WorkflowRunLogLine,
  WorkflowRunMemberDetail,
  WorkflowRunMemberHead,
} from '../src/supervisor/types.js'

const temps: string[] = []
const registries: WorkflowRegistry[] = []
const contexts: Context[] = []
const secret = Buffer.alloc(32, 7)

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  await Promise.all(registries.splice(0).map(registry => registry.dispose()))
  await Promise.all(temps.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

async function temp(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'dsh-remote-api-'))
  temps.push(path)
  return path
}

function payload(name: string, extra: Record<string, unknown> = {}): string {
  return `${JSON.stringify({
    meta: { name, description: `${name} workflow`, ...extra },
    script: `complete(${JSON.stringify(name)})`,
  }, null, 2)}\n`
}

function hostDirectory(root: string) {
  return {
    async listEntries() {
      const { readdir } = await import('node:fs/promises')
      const entries = await readdir(root, { withFileTypes: true })
      return entries.map(entry => ({
        name: entry.name,
        type: entry.isFile() ? 'file' : entry.isDirectory() ? 'directory' : 'other',
      }))
    },
    async readBytes(name: string) {
      const { readFile } = await import('node:fs/promises')
      return new Uint8Array(await readFile(join(root, name)))
    },
    async writeText(name: string, content: string) {
      const { writeFile } = await import('node:fs/promises')
      await writeFile(join(root, name), content, { mode: 0o600 })
      return { version: { path: join(root, name) } }
    },
    async assertIdentity() { /* pinned */ },
    async close() { /* closed */ },
  }
}

function hostFs() {
  return {
    async resolve(path: string) { return { path } },
    contains(parent: unknown, child: unknown) {
      const left = String((parent as { path?: string }).path ?? parent)
      const right = String((child as { path?: string }).path ?? child)
      return right === left || right.startsWith(`${left}/`)
    },
    async lstat(path: string) {
      try {
        const { lstat } = await import('node:fs/promises')
        const info = await lstat(path)
        return {
          type: info.isSymbolicLink() ? 'symlink' : info.isFile() ? 'file' : info.isDirectory() ? 'directory' : 'other',
          version: { ino: info.ino },
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
        throw error
      }
    },
    async listDir() { throw new Error('must not fall back to path-shaped listDir') },
    async readBytesNoFollow() { return new Uint8Array() },
    async openPrivateDirectory(path: string) { return hostDirectory(path) },
  }
}

function agent(id: string, cwd?: string): Agent {
  return { session: { id, header: cwd === undefined ? {} : { cwd } } } as unknown as Agent
}

async function definitionsRemote(cwd: string, home: string): Promise<{
  readonly remote: WorkflowDefinitionsRemote
  readonly registry: WorkflowRegistry
}> {
  const registry = new WorkflowRegistry({ fs: hostFs(), emit() { /* no-op */ } }, {
    dshHome: home,
    definitionWatch: false,
  })
  registries.push(registry)
  const ctx = new Context()
  contexts.push(ctx)
  ;(ctx as unknown as { workflows: WorkflowRegistry }).workflows = registry
  const remote = new WorkflowDefinitionsRemote(ctx)
  return { remote, registry }
}

describe('authenticated workflow cursors (RC1)', () => {
  it('round-trips every cursor kind and rejects stale, foreign, and noncanonical tokens', () => {
    const kinds = ['definitions', 'runs', 'members', 'logs', 'artifacts', 'artifact'] as const
    for (const kind of kinds) {
      const cursor = encodeWorkflowCursor(secret, {
        version: 1, kind, sessionId: 'sess', entityId: kind === 'definitions' || kind === 'runs' ? '' : 'run',
        processEpoch: 'epoch', revision: 3, offset: 1,
      })
      expect(decodeWorkflowCursor(secret, cursor, {
        kind, sessionId: 'sess', entityId: kind === 'definitions' || kind === 'runs' ? '' : 'run',
        processEpoch: 'epoch', revision: 3, total: 4,
      })).toEqual({
        ok: true,
        value: expect.objectContaining({ kind, offset: 1, revision: 3 }),
      })
    }
    const cursor = encodeWorkflowCursor(secret, {
      version: 1, kind: 'definitions', sessionId: 'sess', entityId: '',
      processEpoch: 'epoch', revision: 1, offset: 0,
    })
    expect(decodeWorkflowCursor(secret, cursor, {
      kind: 'definitions', sessionId: 'sess', entityId: '', processEpoch: 'epoch', revision: 2, total: 1,
    })).toEqual({ ok: false, reason: 'stale' })
    expect(decodeWorkflowCursor(secret, cursor, {
      kind: 'runs', sessionId: 'sess', entityId: '', processEpoch: 'epoch', revision: 1, total: 1,
    })).toEqual({ ok: false, reason: 'invalid' })
    expect(decodeWorkflowCursor(secret, 'not-a-cursor', {
      kind: 'definitions', sessionId: 'sess', entityId: '', processEpoch: 'epoch', revision: 1, total: 1,
    })).toEqual({ ok: false, reason: 'invalid' })
    expect(() => encodeWorkflowCursor(Buffer.alloc(16), {
      version: 1, kind: 'definitions', sessionId: 's', entityId: '', processEpoch: 'e', revision: 0, offset: 0,
    })).toThrow(/32 bytes/u)
  })

  it('throws the compatibility decoder errors for stale and invalid one-argument tokens', () => {
    const cursor = encodeWorkflowCursor({
      kind: 'runs', sessionId: 'sess', entityId: '', processEpoch: 'epoch', revision: 1, offset: 0,
    })
    expect(() => decodeWorkflowCursor(cursor, {
      kind: 'runs', sessionId: 'sess', entityId: '', processEpoch: 'epoch', revision: 2, total: 1,
    })).toThrow(WorkflowCursorError)
  })
})

describe('saved-definition Remote (RC2)', () => {
  it('pages Agent-first, redacts path/script/phases, and keeps UTF-16 order', async () => {
    const base = await temp()
    const home = join(base, 'home')
    const project = join(base, 'project')
    await mkdir(join(home, 'workflows'), { recursive: true })
    await mkdir(join(project, '.git'), { recursive: true })
    await mkdir(join(project, '.dsh', 'workflows'), { recursive: true })
    await writeFile(join(project, '.dsh', 'workflows', 'zeta.workflow.json'), payload('zeta'))
    await writeFile(join(project, '.dsh', 'workflows', 'alpha.workflow.json'), payload('alpha', {
      whenToUse: 'now',
      phases: [{ title: 'Inspect', detail: 'secret' }],
    }))
    const { remote } = await definitionsRemote(project, home)
    const page = await remote.list(agent('session-a', project), { limit: 1 }, new AbortController().signal)
    expect(page).toEqual({
      ok: true,
      value: {
        items: [{ name: 'alpha', description: 'alpha workflow', whenToUse: 'now', scope: 'project' }],
        total: 2,
        revision: 0,
        nextCursor: expect.any(String),
      },
    })
    if (!page.ok) throw new Error('expected page')
    expect(page.value.items[0]).not.toHaveProperty('path')
    expect(page.value.items[0]).not.toHaveProperty('script')
    expect(page.value.items[0]).not.toHaveProperty('phases')
    const rest = await remote.list(
      agent('session-a', project),
      { limit: 1, cursor: page.value.nextCursor },
      new AbortController().signal,
    )
    expect(rest).toMatchObject({
      ok: true,
      value: { items: [{ name: 'zeta', scope: 'project' }], total: 2 },
    })
    if (rest.ok) expect(rest.value.nextCursor).toBeUndefined()
  })

  it('rejects missing cwd, invalid limits, and stale or foreign cursors', async () => {
    const base = await temp()
    const home = join(base, 'home')
    const project = join(base, 'project')
    const other = join(base, 'other')
    await mkdir(join(home, 'workflows'), { recursive: true })
    for (const cwd of [project, other]) {
      await mkdir(join(cwd, '.git'), { recursive: true })
      await mkdir(join(cwd, '.dsh', 'workflows'), { recursive: true })
    }
    await writeFile(join(project, '.dsh', 'workflows', 'alpha.workflow.json'), payload('alpha'))
    await writeFile(join(project, '.dsh', 'workflows', 'zeta.workflow.json'), payload('zeta'))
    await writeFile(join(other, '.dsh', 'workflows', 'beta.workflow.json'), payload('beta'))
    const { remote, registry } = await definitionsRemote(project, home)
    const signal = new AbortController().signal
    await expect(remote.list({ session: { header: { cwd: project } } } as Agent, { limit: 50 }, signal)).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'workspace-unavailable',
        message: 'workflow definition listing requires a session cwd',
      }),
    })
    await expect(remote.list(agent('session-a'), { limit: 50 }, signal)).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'workspace-unavailable',
        message: 'workflow definition listing requires a session cwd',
      }),
    })
    await expect(remote.list(agent('session-a', project), { limit: 0 }, signal)).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'invalid-page-limit',
        message: 'workflow page limit must be a safe integer from 1 through 200',
        details: { min: 1, max: 200 },
      }),
    })
    await expect(remote.list(agent('session-b', project), {
      cursor: 'totally-invalid',
    }, signal)).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'invalid-cursor',
        message: 'workflow page cursor is invalid or belongs to another collection',
      }),
    })
    const paged = await remote.list(agent('session-a', project), { limit: 1 }, signal)
    if (!paged.ok || paged.value.nextCursor === undefined) throw new Error('expected a continuation cursor')
    await expect(remote.list(agent('session-b', project), {
      cursor: paged.value.nextCursor,
    }, signal)).resolves.toMatchObject({ ok: false, error: { code: 'invalid-cursor' } })
    await registry.save({
      meta: { name: 'gamma', description: 'gamma workflow' },
      script: 'return 1',
    }, { cwd: project, scope: 'project' })
    await expect(remote.list(agent('session-a', project), {
      cursor: paged.value.nextCursor,
    }, signal)).resolves.toMatchObject({
      ok: false,
      error: { code: 'stale-cursor', message: 'workflow page cursor is stale; refresh the collection' },
    })
    const otherPage = await remote.list(agent('session-a', other), {}, signal)
    expect(otherPage).toMatchObject({
      ok: true,
      value: { items: [{ name: 'beta', scope: 'project' }] },
    })
  })

  it('treats a missing snapshot revision as zero', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    const registry = {
      async snapshot() { return { definitions: [], complete: true } },
    }
    ;(ctx as unknown as { workflows: typeof registry }).workflows = registry
    const remote = new WorkflowDefinitionsRemote(ctx as never)
    const base = await temp()
    const project = join(base, 'project')
    await mkdir(join(project, '.git'), { recursive: true })
    await mkdir(join(project, '.dsh', 'workflows'), { recursive: true })
    await expect(remote.list(agent('session-a', project), {}, new AbortController().signal)).resolves.toEqual({
      ok: true,
      value: { items: [], total: 0, revision: 0 },
    })
  })

  it('propagates abort before registry I/O', async () => {
    const base = await temp()
    const home = join(base, 'home')
    const project = join(base, 'project')
    await mkdir(join(home, 'workflows'), { recursive: true })
    await mkdir(join(project, '.git'), { recursive: true })
    await mkdir(join(project, '.dsh', 'workflows'), { recursive: true })
    const { remote } = await definitionsRemote(project, home)
    const controller = new AbortController()
    controller.abort()
    await expect(remote.list(agent('session-a', project), {}, controller.signal)).rejects.toThrow()
  })
})

function runHead(overrides: Partial<WorkflowRunHead> & Pick<WorkflowRunHead, 'runId' | 'displayName' | 'status'>): WorkflowRunHead {
  return {
    name: 'review-changes',
    description: 'review fixture',
    budget: { total: 8, spent: 1, remaining: 7 },
    memberCounts: { total: 1, running: 1, completed: 0, failed: 0, cancelled: 0 },
    startedAt: 1,
    allowedActions: ['pause', 'stop', 'save'],
    revision: 1,
    detailRevision: 1,
    membersRevision: 1,
    logsRevision: 1,
    resultRevision: 1,
    artifactsRevision: 1,
    ...overrides,
  }
}

class FakeRuns {
  sessionRevision = 1
  epoch = 'store-epoch'
  runs: WorkflowRunHead[] = []
  details = new Map<string, WorkflowRunDetail>()
  memberRows = new Map<string, WorkflowRunMemberHead[]>()
  memberDetails = new Map<string, WorkflowRunMemberDetail>()
  logLines: WorkflowRunLogLine[] = []
  logEvicted = 0
  logRevision = 1
  artifactsList: Array<{ name: string; bytes: number }> = []
  artifactOmitted = 0
  artifactRevision = 1
  artifactBody = 'hello-world'
  artifactIdentityRevision = 1
  resultValue: unknown = { ok: true }
  listCalls: Array<{ limit?: number; cursor?: unknown }> = []
  throwOn?: { method: string; error: unknown }
  pauseImpl?: () => Promise<WorkflowRunHead>
  detailImpl?: () => Promise<WorkflowRunDetail>

  private fail(method: string): void {
    if (this.throwOn?.method === method) throw this.throwOn.error
  }

  async list(_agent: Agent, request: { limit?: number; cursor?: unknown }) {
    this.fail('list')
    this.listCalls.push(request)
    const offset = Number(request.cursor ?? 0)
    const limit = request.limit ?? 50
    const items = this.runs.slice(offset, offset + limit)
    return {
      epoch: this.epoch,
      sessionRevision: this.sessionRevision,
      items,
      total: this.runs.length,
      ...(offset + items.length < this.runs.length ? { nextCursor: String(offset + items.length) } : {}),
    }
  }

  async detail(_agent: Agent, runId: string) {
    this.fail('detail')
    if (this.detailImpl !== undefined) return this.detailImpl()
    const found = this.details.get(String(runId)) ?? this.runs.find(run => run.runId === runId)
    if (found === undefined) throw new WorkflowPackageError('workflow run was not found', 'WORKFLOW_RUN_NOT_FOUND')
    if ('run' in (found as object) && (found as WorkflowRunDetail).run !== undefined) return found as WorkflowRunDetail
    return { run: found as WorkflowRunHead, scriptPath: '/secret/script.js' }
  }

  async members(_agent: Agent, request: { runId: string; cursor?: unknown; limit?: number }) {
    this.fail('members')
    const rows = this.memberRows.get(String(request.runId)) ?? []
    const offset = Number(request.cursor ?? 0)
    const limit = request.limit ?? 50
    const items = rows.slice(offset, offset + limit)
    return { items, total: rows.length, revision: 1, nextCursor: offset + items.length < rows.length ? String(offset + items.length) : 'unsigned' }
  }

  async memberDetail(_agent: Agent, request: { runId: string; memberId: string }) {
    this.fail('memberDetail')
    const value = this.memberDetails.get(`${request.runId}:${request.memberId}`)
    if (value === undefined) throw new WorkflowPackageError('workflow member was not found in this run', 'WORKFLOW_RUN_NOT_FOUND')
    return value
  }

  async logs(_agent: Agent, request: { runId: string; cursor?: unknown; limit?: number }) {
    this.fail('logs')
    const offset = Number(request.cursor ?? 0)
    const limit = request.limit ?? 50
    const items = this.logLines.slice(offset, offset + limit)
    return {
      items,
      evicted: this.logEvicted,
      total: this.logEvicted + this.logLines.length,
      revision: this.logRevision,
      nextCursor: offset + items.length < this.logLines.length ? String(offset + items.length) : 'unsigned-log',
    }
  }

  async result(_agent: Agent, runId: string) {
    this.fail('result')
    if (!this.runs.some(run => run.runId === runId) && !this.details.has(String(runId))) {
      throw new WorkflowPackageError('workflow run was not found', 'WORKFLOW_RUN_NOT_FOUND')
    }
    return { value: this.resultValue, revision: 1 }
  }

  async artifacts(_agent: Agent, request: { runId: string; cursor?: unknown; limit?: number }) {
    this.fail('artifacts')
    const offset = Number(request.cursor ?? 0)
    const limit = request.limit ?? 50
    const items = this.artifactsList.slice(offset, offset + limit)
    return {
      items,
      omitted: this.artifactOmitted,
      total: this.artifactOmitted + this.artifactsList.length,
      revision: this.artifactRevision,
      nextCursor: 'unsigned-artifacts',
    }
  }

  artifactReads = 0
  async artifact(_agent: Agent, request: { runId: string; name: string; cursor?: unknown; maxBytes?: number }): Promise<WorkflowRunArtifactChunk> {
    this.fail('artifact')
    this.artifactReads += 1
    const offset = Number(request.cursor ?? 0)
    const maxBytes = request.maxBytes ?? 32_768
    const bytes = new TextEncoder().encode(this.artifactBody)
    const slice = bytes.subarray(offset, offset + maxBytes)
    return {
      artifact: { name: request.name, bytes: bytes.byteLength },
      text: new TextDecoder().decode(slice),
      offsetBytes: offset,
      returnedBytes: slice.byteLength,
      totalBytes: bytes.byteLength,
      revision: this.artifactReads === 1 ? this.artifactIdentityRevision : this.artifactRevision,
      nextCursor: 'unsigned-chunk',
    }
  }

  async pause() {
    this.fail('pause')
    if (this.pauseImpl !== undefined) return this.pauseImpl()
    return { ...this.runs[0]!, status: 'paused' as const, revision: (this.runs[0]?.revision ?? 1) + 1, allowedActions: ['resume', 'stop', 'save'] }
  }
  async resume() {
    this.fail('resume')
    return { ...this.runs[0]!, status: 'running' as const, revision: (this.runs[0]?.revision ?? 1) + 1, allowedActions: ['pause', 'stop', 'save'] }
  }
  async stop() {
    this.fail('stop')
    return { ...this.runs[0]!, status: 'cancelled' as const, revision: (this.runs[0]?.revision ?? 1) + 1, allowedActions: [] }
  }
  async save() {
    this.fail('save')
    return '/tmp/saved.workflow.json'
  }
}

function runsRemote(backend: FakeRuns): WorkflowRunsRemote {
  const ctx = new Context()
  contexts.push(ctx)
  ;(ctx as unknown as { workflowSupervisor: FakeRuns }).workflowSupervisor = backend
  return new WorkflowRunsRemote(ctx)
}

describe('authorized run list and detail (RC3)', () => {
  it('pages Agent-first, redacts scriptPath, and defaults the 50/200 limits', async () => {
    const backend = new FakeRuns()
    backend.runs = [
      runHead({ runId: 'run-old' as never, displayName: 'review-changes', status: 'running', startedAt: 1 }),
      runHead({ runId: 'run-new' as never, displayName: 'review-changes-2', status: 'completed', startedAt: 2, settledAt: 3, allowedActions: [] }),
    ]
    const remote = runsRemote(backend)
    const signal = new AbortController().signal
    const page = await remote.list(agent('session-a'), { limit: 1 }, signal)
    expect(page).toMatchObject({
      ok: true,
      value: {
        items: [{ runId: 'run-old', displayName: 'review-changes' }],
        total: 2,
        sessionRevision: 1,
      },
    })
    if (!page.ok) throw new Error('expected page')
    expect(page.value.nextCursor).toEqual(expect.any(String))
    const rest = await remote.list(agent('session-a'), { limit: 1, cursor: page.value.nextCursor }, signal)
    expect(rest).toMatchObject({ ok: true, value: { items: [{ runId: 'run-new' }], total: 2 } })
    if (rest.ok) expect(rest.value.nextCursor).toBeUndefined()

    await remote.list(agent('session-a'), {}, signal)
    expect(backend.listCalls.some(call => call.limit === 50)).toBe(true)
    await expect(remote.list(agent('session-a'), { limit: 201 }, signal)).resolves.toEqual({
      ok: false,
      error: {
        code: 'invalid-page-limit',
        message: 'workflow page limit must be a safe integer from 1 through 200',
        details: { min: 1, max: 200 },
      },
    })

    const detail = await remote.detail(agent('session-a'), { runId: 'run-old' as never }, signal)
    expect(detail).toMatchObject({ ok: true, value: { run: { runId: 'run-old' } } })
    if (detail.ok) expect(detail.value).not.toHaveProperty('scriptPath')
    await expect(remote.detail(agent('session-a'), { runId: 'forged' as never }, signal)).resolves.toEqual({
      ok: false,
      error: { code: 'run-not-found', message: 'workflow run was not found' },
    })
  })

  it('rejects stale, foreign, and unsigned cursors before returning page bytes', async () => {
    const backend = new FakeRuns()
    backend.runs = [
      runHead({ runId: 'a' as never, displayName: 'a', status: 'running' }),
      runHead({ runId: 'b' as never, displayName: 'b', status: 'running' }),
    ]
    const remote = runsRemote(backend)
    const signal = new AbortController().signal
    const first = await remote.list(agent('session-a'), { limit: 1 }, signal)
    if (!first.ok || first.value.nextCursor === undefined) throw new Error('expected cursor')
    await expect(remote.list(agent('session-b'), { cursor: first.value.nextCursor }, signal)).resolves.toMatchObject({
      ok: false, error: { code: 'invalid-cursor' },
    })
    await expect(remote.list(agent('session-a'), { cursor: 'not-hmac' }, signal)).resolves.toMatchObject({
      ok: false, error: { code: 'invalid-cursor' },
    })
    backend.sessionRevision = 9
    await expect(remote.list(agent('session-a'), { cursor: first.value.nextCursor }, signal)).resolves.toMatchObject({
      ok: false, error: { code: 'stale-cursor', message: 'workflow page cursor is stale; refresh the collection' },
    })
  })

  it('maps corrupt to stale-cursor and does not launder UNSAFE as not-found', async () => {
    const backend = new FakeRuns()
    const remote = runsRemote(backend)
    const signal = new AbortController().signal
    backend.throwOn = { method: 'list', error: new WorkflowPackageError('corrupt', 'WORKFLOW_STORAGE_CORRUPT') }
    await expect(remote.list(agent('session-a'), {}, signal)).resolves.toMatchObject({
      ok: false, error: { code: 'stale-cursor' },
    })
    backend.throwOn = { method: 'list', error: Object.assign(new Error('unsafe storage'), { code: 'WORKFLOW_STORAGE_UNSAFE' }) }
    await expect(remote.list(agent('session-a'), {}, signal)).rejects.toThrow(/unsafe storage/u)
    const aborted = new AbortController()
    aborted.abort()
    await expect(remote.list(agent('session-a'), {}, aborted.signal)).rejects.toThrow()
  })
})

describe('member roster and outcome Remotes (RC4)', () => {
  it('pages members, preserves omitted vs empty phase, and returns JSON null', async () => {
    const backend = new FakeRuns()
    const head = runHead({ runId: 'run-1' as never, displayName: 'review-changes', status: 'running' })
    backend.runs = [head]
    backend.memberRows.set('run-1', [
      { memberId: 'm1' as never, seq: 1, label: 'alpha', phase: '', status: 'completed', outcome: 'available' },
      { memberId: 'm2' as never, seq: 2, label: 'beta', status: 'running', outcome: 'pending' },
    ])
    backend.memberDetails.set('run-1:m1', {
      member: { memberId: 'm1' as never, seq: 1, label: 'alpha', phase: '', status: 'completed', outcome: 'available' },
      outcome: { state: 'available', content: { kind: 'value', value: null }, totalBytes: 4, truncated: false },
    })
    const remote = runsRemote(backend)
    const signal = new AbortController().signal
    const page = await remote.members(agent('session-a'), { runId: 'run-1' as never, limit: 1 }, signal)
    expect(page).toMatchObject({
      ok: true,
      value: { items: [{ label: 'alpha', phase: '' }], total: 2 },
    })
    if (!page.ok) throw new Error('expected members')
    expect(page.value.nextCursor).toEqual(expect.any(String))
    expect(page.value.nextCursor).not.toBe('unsigned')
    const rest = await remote.members(agent('session-a'), { runId: 'run-1' as never, limit: 1, cursor: page.value.nextCursor }, signal)
    expect(rest).toMatchObject({ ok: true, value: { items: [{ label: 'beta' }], total: 2 } })
    if (rest.ok) {
      expect(rest.value.items[0]).not.toHaveProperty('phase')
      expect(rest.value.nextCursor).toBeUndefined()
    }
    const detail = await remote.memberDetail(agent('session-a'), { runId: 'run-1' as never, memberId: 'm1' as never }, signal)
    expect(detail).toEqual({
      ok: true,
      value: expect.objectContaining({
        outcome: { state: 'available', content: { kind: 'value', value: null }, totalBytes: 4, truncated: false },
      }),
    })
  })

  it('returns run-not-found for a foreign run and member-not-found for a missing member', async () => {
    const backend = new FakeRuns()
    backend.runs = [runHead({ runId: 'run-1' as never, displayName: 'review-changes', status: 'running' })]
    const remote = runsRemote(backend)
    const signal = new AbortController().signal
    await expect(remote.memberDetail(agent('session-a'), { runId: 'forged' as never, memberId: 'm1' as never }, signal)).resolves.toEqual({
      ok: false,
      error: { code: 'run-not-found', message: 'workflow run was not found' },
    })
    await expect(remote.memberDetail(agent('session-a'), { runId: 'run-1' as never, memberId: 'missing' as never }, signal)).resolves.toEqual({
      ok: false,
      error: { code: 'member-not-found', message: 'workflow member was not found in this run' },
    })
    await expect(remote.members(agent('session-a'), { runId: 'run-1' as never, limit: 0 }, signal)).resolves.toMatchObject({
      ok: false, error: { code: 'invalid-page-limit', details: { min: 1, max: 200 } },
    })
  })
})

describe('retained log and result Remotes (RC5)', () => {
  it('HMAC-pages retained logs while keeping evicted as metadata', async () => {
    const backend = new FakeRuns()
    backend.runs = [runHead({ runId: 'run-1' as never, displayName: 'review-changes', status: 'completed', allowedActions: [] })]
    backend.logEvicted = 100
    backend.logLines = [
      { index: 100, text: 'one' },
      { index: 101, text: 'two' },
      { index: 102, text: 'three' },
    ]
    backend.resultValue = { state: 'available', content: { kind: 'value', value: null }, totalBytes: 4, truncated: false }
    const remote = runsRemote(backend)
    const signal = new AbortController().signal
    const first = await remote.logs(agent('session-a'), { runId: 'run-1' as never, limit: 1 }, signal)
    expect(first).toMatchObject({
      ok: true,
      value: { items: [{ text: 'one' }], evicted: 100, total: 103 },
    })
    if (!first.ok) throw new Error('expected logs')
    expect(first.value.nextCursor).toEqual(expect.any(String))
    expect(first.value.nextCursor).not.toBe('unsigned-log')
    const second = await remote.logs(agent('session-a'), { runId: 'run-1' as never, limit: 1, cursor: first.value.nextCursor }, signal)
    if (!second.ok) throw new Error('expected second log page')
    const third = await remote.logs(agent('session-a'), { runId: 'run-1' as never, limit: 1, cursor: second.value.nextCursor }, signal)
    expect(third).toMatchObject({ ok: true, value: { items: [{ text: 'three' }], evicted: 100, total: 103 } })
    if (third.ok) expect(third.value.nextCursor).toBeUndefined()

    const result = await remote.result(agent('session-a'), { runId: 'run-1' as never }, signal)
    expect(result).toMatchObject({
      ok: true,
      value: { value: { state: 'available', content: { kind: 'value', value: null } } },
    })
    await expect(remote.result(agent('session-a'), { runId: 'forged' as never }, signal)).resolves.toEqual({
      ok: false,
      error: { code: 'run-not-found', message: 'workflow run was not found' },
    })
  })
})

describe('scratch artifact Remotes (RC6)', () => {
  it('pages retained names, bounds maxBytes, and re-CAS identity on the second read', async () => {
    const backend = new FakeRuns()
    backend.runs = [runHead({ runId: 'run-1' as never, displayName: 'review-changes', status: 'completed', allowedActions: [], artifactsRevision: 1 })]
    backend.artifactsList = [{ name: 'report.md', bytes: 11 }, { name: 'notes.md', bytes: 4 }]
    backend.artifactOmitted = 5
    backend.artifactBody = 'hello-world'
    const remote = runsRemote(backend)
    const signal = new AbortController().signal
    const page = await remote.artifacts(agent('session-a'), { runId: 'run-1' as never, limit: 1 }, signal)
    expect(page).toMatchObject({
      ok: true,
      value: { items: [{ name: 'report.md' }], omitted: 5, total: 7 },
    })
    if (!page.ok) throw new Error('expected artifacts')
    expect(page.value.nextCursor).toEqual(expect.any(String))
    expect(page.value.nextCursor).not.toBe('unsigned-artifacts')
    const rest = await remote.artifacts(agent('session-a'), { runId: 'run-1' as never, limit: 1, cursor: page.value.nextCursor }, signal)
    expect(rest).toMatchObject({ ok: true, value: { items: [{ name: 'notes.md' }] } })
    if (rest.ok) expect(rest.value.nextCursor).toBeUndefined()

    const chunk = await remote.artifact(agent('session-a'), { runId: 'run-1' as never, name: 'report.md' }, signal)
    expect(chunk).toMatchObject({ ok: true, value: { text: 'hello-world', offsetBytes: 0 } })

    await expect(remote.artifact(agent('session-a'), { runId: 'run-1' as never, name: '../x' }, signal)).resolves.toEqual({
      ok: false,
      error: { code: 'artifact-not-found', message: 'workflow scratch artifact was not found' },
    })
    await expect(remote.artifact(agent('session-a'), { runId: 'run-1' as never, name: 'report.md', maxBytes: 3 }, signal)).resolves.toEqual({
      ok: false,
      error: {
        code: 'invalid-artifact-limit',
        message: 'workflow artifact maxBytes must be a safe integer from 4 through 131072',
        details: { min: 4, max: 131_072 },
      },
    })
    await expect(remote.artifact(agent('session-a'), { runId: 'forged' as never, name: 'report.md' }, signal)).resolves.toEqual({
      ok: false,
      error: { code: 'run-not-found', message: 'workflow run was not found' },
    })
    await expect(remote.artifact(agent('session-a'), {
      runId: 'run-1' as never, name: 'report.md', expectedRevision: 9,
    }, signal)).resolves.toMatchObject({
      ok: false,
      error: { code: 'artifact-changed', message: 'workflow artifact collection changed; refresh it before reading', details: { revision: 1 } },
    })

    const first = await remote.artifact(agent('session-a'), { runId: 'run-1' as never, name: 'report.md', maxBytes: 4 }, signal)
    if (!first.ok || first.value.nextCursor === undefined) throw new Error('expected artifact cursor')
    backend.artifactReads = 0
    backend.artifactIdentityRevision = 1
    backend.artifactRevision = 2
    await expect(remote.artifact(agent('session-a'), {
      runId: 'run-1' as never, name: 'report.md', cursor: first.value.nextCursor, maxBytes: 4,
    }, signal)).resolves.toMatchObject({
      ok: false,
      error: { code: 'artifact-changed', details: { revision: 2 } },
    })
  })
})

describe('compare-and-set workflow controls (RC7)', () => {
  it('rejects stale revision with no side effect and returns budget-limited Resume', async () => {
    const backend = new FakeRuns()
    const running = runHead({ runId: 'run-1' as never, displayName: 'review-changes', status: 'running', revision: 3 })
    backend.runs = [running]
    const remote = runsRemote(backend)
    const signal = new AbortController().signal
    let paused = 0
    backend.pauseImpl = async () => {
      paused += 1
      return running
    }
    await expect(remote.control(agent('session-a'), {
      runId: 'run-1' as never, action: 'pause', expectedRevision: 1,
    }, signal)).resolves.toEqual({
      ok: false,
      error: {
        code: 'revision-conflict',
        message: 'workflow run changed; refresh it before applying a control',
        details: { run: expect.objectContaining({ revision: 3 }) },
      },
    })
    expect(paused).toBe(0)

    backend.runs = [runHead({
      runId: 'run-1' as never, displayName: 'review-changes', status: 'budget-limited',
      revision: 4, allowedActions: [],
    })]
    await expect(remote.control(agent('session-a'), {
      runId: 'run-1' as never, action: 'resume', expectedRevision: 4,
    }, signal)).resolves.toEqual({
      ok: false,
      error: {
        code: 'action-unavailable',
        message: 'workflow "review-changes" requires a higher agent_budget to resume',
        details: { reason: 'budget-limited', run: expect.objectContaining({ status: 'budget-limited' }) },
      },
    })
    await expect(remote.control(agent('session-a'), {
      runId: 'run-1' as never, action: 'save', expectedRevision: 4,
    }, signal)).resolves.toMatchObject({
      ok: false,
      error: { code: 'action-unavailable', details: { reason: 'save-ineligible' } },
    })
  })

  it('returns the authoritative head for pause/resume/stop/save and maps in-flight STALE to revision-conflict', async () => {
    const backend = new FakeRuns()
    backend.runs = [runHead({ runId: 'run-1' as never, displayName: 'review-changes', status: 'running', revision: 1 })]
    const remote = runsRemote(backend)
    const signal = new AbortController().signal
    await expect(remote.control(agent('session-a'), {
      runId: 'run-1' as never, action: 'pause', expectedRevision: 1,
    }, signal)).resolves.toMatchObject({ ok: true, value: { run: { status: 'paused' } } })
    backend.runs = [runHead({ runId: 'run-1' as never, displayName: 'review-changes', status: 'paused', revision: 2, allowedActions: ['resume', 'stop', 'save'] })]
    await expect(remote.control(agent('session-a'), {
      runId: 'run-1' as never, action: 'resume', expectedRevision: 2,
    }, signal)).resolves.toMatchObject({ ok: true, value: { run: { status: 'running' } } })
    backend.runs = [runHead({ runId: 'run-1' as never, displayName: 'review-changes', status: 'running', revision: 3 })]
    await expect(remote.control(agent('session-a'), {
      runId: 'run-1' as never, action: 'stop', expectedRevision: 3,
    }, signal)).resolves.toMatchObject({ ok: true, value: { run: { status: 'cancelled' } } })
    backend.runs = [runHead({ runId: 'run-1' as never, displayName: 'review-changes', status: 'completed', revision: 4, allowedActions: ['save'] })]
    await expect(remote.control(agent('session-a'), {
      runId: 'run-1' as never, action: 'save', expectedRevision: 4,
    }, signal)).resolves.toMatchObject({ ok: true, value: { run: { runId: 'run-1' } } })

    backend.runs = [runHead({ runId: 'run-1' as never, displayName: 'review-changes', status: 'running', revision: 5 })]
    backend.pauseImpl = async () => {
      throw new WorkflowPackageError('stale', 'WORKFLOW_STALE_REVISION')
    }
    let detailCalls = 0
    backend.detailImpl = async () => {
      detailCalls += 1
      const revision = detailCalls === 1 ? 5 : 8
      return { run: runHead({ runId: 'run-1' as never, displayName: 'review-changes', status: 'running', revision }) }
    }
    await expect(remote.control(agent('session-a'), {
      runId: 'run-1' as never, action: 'pause', expectedRevision: 5,
    }, signal)).resolves.toMatchObject({
      ok: false,
      error: { code: 'revision-conflict', details: { run: { revision: 8 } } },
    })
    backend.detailImpl = undefined
    backend.pauseImpl = undefined
    await expect(remote.control(agent('session-a'), {
      runId: 'missing' as never, action: 'pause', expectedRevision: 1,
    }, signal)).resolves.toMatchObject({ ok: false, error: { code: 'run-not-found' } })
  })

  it('maps LIMIT, CURSOR, STALE, identity, and missing-store errors without laundering them as not-found', async () => {
    const backend = new FakeRuns()
    backend.runs = [runHead({ runId: 'run-1' as never, displayName: 'review-changes', status: 'running' })]
    const remote = runsRemote(backend)
    const signal = new AbortController().signal
    backend.throwOn = { method: 'list', error: new WorkflowPackageError('workflow page limit must be a safe integer from 1 through 200', 'WORKFLOW_LIMIT') }
    await expect(remote.list(agent('session-a'), {}, signal)).resolves.toMatchObject({
      ok: false, error: { code: 'invalid-page-limit', details: { min: 1, max: 200 } },
    })
    backend.throwOn = { method: 'members', error: new WorkflowPackageError('workflow page cursor is invalid', 'WORKFLOW_CURSOR_INVALID') }
    await expect(remote.members(agent('session-a'), { runId: 'run-1' as never }, signal)).resolves.toMatchObject({
      ok: false, error: { code: 'invalid-cursor' },
    })
    backend.throwOn = { method: 'logs', error: new WorkflowPackageError('stale', 'WORKFLOW_STALE_REVISION') }
    await expect(remote.logs(agent('session-a'), { runId: 'run-1' as never }, signal)).resolves.toMatchObject({
      ok: false, error: { code: 'stale-cursor' },
    })
    backend.throwOn = { method: 'logs', error: new WorkflowPackageError('unsupported', 'WORKFLOW_STORAGE_UNSUPPORTED') }
    await expect(remote.logs(agent('session-a'), { runId: 'run-1' as never }, signal)).resolves.toMatchObject({
      ok: false, error: { code: 'storage-unavailable' },
    })
    backend.throwOn = { method: 'logs', error: new WorkflowPackageError('limit', 'WORKFLOW_STORAGE_LIMIT') }
    await expect(remote.logs(agent('session-a'), { runId: 'run-1' as never }, signal)).resolves.toMatchObject({
      ok: false, error: { code: 'storage-unavailable' },
    })
    backend.throwOn = { method: 'artifact', error: new WorkflowPackageError('not owned', 'WORKFLOW_RUN_NOT_OWNED') }
    await expect(remote.artifact(agent('session-a'), { runId: 'run-1' as never, name: 'report.md' }, signal)).resolves.toMatchObject({
      ok: false, error: { code: 'artifact-not-found' },
    })
    backend.throwOn = { method: 'artifact', error: new WorkflowPackageError('unsupported', 'WORKFLOW_STORAGE_UNSUPPORTED') }
    await expect(remote.artifact(agent('session-a'), { runId: 'run-1' as never, name: 'report.md' }, signal)).resolves.toMatchObject({
      ok: false, error: { code: 'storage-unavailable', message: 'workflow scratch artifacts are unavailable' },
    })
    backend.throwOn = { method: 'artifact', error: new WorkflowPackageError('workflow artifact maxBytes must be a safe integer from 4 through 131072', 'WORKFLOW_LIMIT') }
    await expect(remote.artifact(agent('session-a'), { runId: 'run-1' as never, name: 'report.md' }, signal)).resolves.toMatchObject({
      ok: false, error: { code: 'invalid-artifact-limit', details: { min: 4, max: 131_072 } },
    })
    backend.throwOn = { method: 'artifact', error: new WorkflowPackageError('identity', 'WORKFLOW_STALE_REVISION') }
    await expect(remote.artifact(agent('session-a'), { runId: 'run-1' as never, name: 'report.md' }, signal)).resolves.toMatchObject({
      ok: false,
      error: { code: 'artifact-changed', details: { revision: 1 } },
    })
    backend.throwOn = { method: 'pause', error: new WorkflowPackageError('not now', 'WORKFLOW_INVALID_STATE') }
    await expect(remote.control(agent('session-a'), {
      runId: 'run-1' as never, action: 'pause', expectedRevision: 1,
    }, signal)).resolves.toMatchObject({
      ok: false, error: { code: 'action-unavailable', details: { reason: 'invalid-state' } },
    })
    const abort = Object.assign(new Error('cancelled'), { name: 'AbortError' })
    backend.throwOn = { method: 'pause', error: abort }
    await expect(remote.control(agent('session-a'), {
      runId: 'run-1' as never, action: 'pause', expectedRevision: 1,
    }, signal)).rejects.toMatchObject({ name: 'AbortError' })
    backend.throwOn = { method: 'list', error: abort }
    await expect(remote.list(agent('session-a'), {}, signal)).rejects.toMatchObject({ name: 'AbortError' })
    backend.throwOn = { method: 'pause', error: new Error('programmer fault') }
    await expect(remote.control(agent('session-a'), {
      runId: 'run-1' as never, action: 'pause', expectedRevision: 1,
    }, signal)).rejects.toThrow(/programmer fault/u)
    backend.runs = [runHead({
      runId: 'run-1' as never, displayName: 'review-changes', status: 'budget-limited',
      revision: 1, allowedActions: ['resume'],
    })]
    backend.throwOn = { method: 'resume', error: new WorkflowPackageError('cap', 'WORKFLOW_LIMIT') }
    await expect(remote.control(agent('session-a'), {
      runId: 'run-1' as never, action: 'resume', expectedRevision: 1,
    }, signal)).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'action-unavailable',
        message: 'workflow "review-changes" requires a higher agent_budget to resume',
        details: { reason: 'budget-limited' },
      },
    })
  })

  it('treats a raced list epoch and a raced log revision as stale-cursor', async () => {
    const backend = new FakeRuns()
    backend.runs = [
      runHead({ runId: 'a' as never, displayName: 'a', status: 'running' }),
      runHead({ runId: 'b' as never, displayName: 'b', status: 'running' }),
    ]
    let listCalls = 0
    const originalList = backend.list.bind(backend)
    backend.list = (async (agentArg: Agent, request: { limit?: number; cursor?: unknown }) => {
      listCalls += 1
      const page = await originalList(agentArg, request)
      return { ...page, epoch: listCalls === 1 ? 'e1' : 'e2' }
    }) as FakeRuns['list']
    const remote = runsRemote(backend)
    const signal = new AbortController().signal
    await expect(remote.list(agent('session-a'), {}, signal)).resolves.toMatchObject({
      ok: false, error: { code: 'stale-cursor' },
    })
    backend.logLines = [{ index: 0, text: 'keep' }, { index: 1, text: 'more' }]
    const originalLogs = backend.logs.bind(backend)
    backend.logs = (async (agentArg: Agent, request: { runId: string; cursor?: unknown; limit?: number }) => {
      const page = await originalLogs(agentArg, request)
      backend.logRevision += 1
      return page
    }) as FakeRuns['logs']
    await expect(remote.logs(agent('session-a'), { runId: 'a' as never }, signal)).resolves.toMatchObject({
      ok: false, error: { code: 'stale-cursor' },
    })
  })
})

describe('missing supervisor faces and artifact first-probe CAS', () => {
  it('returns storage-unavailable when optional paged faces are absent', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    const head = runHead({ runId: 'run-1' as never, displayName: 'review-changes', status: 'running' })
    ;(ctx as unknown as { workflowSupervisor: object }).workflowSupervisor = {
      async list() { return { epoch: 'e', sessionRevision: 1, items: [head], total: 1 } },
      async detail() { return { run: head } },
      async pause() { return head },
      async resume() { return head },
      async stop() { return head },
      async save() { return '/tmp/x' },
    }
    const remote = new WorkflowRunsRemote(ctx)
    const signal = new AbortController().signal
    await expect(remote.members(agent('session-a'), { runId: 'run-1' as never }, signal)).resolves.toMatchObject({
      ok: false, error: { code: 'storage-unavailable' },
    })
    await expect(remote.logs(agent('session-a'), { runId: 'run-1' as never }, signal)).resolves.toMatchObject({
      ok: false, error: { code: 'storage-unavailable' },
    })
    await expect(remote.result(agent('session-a'), { runId: 'run-1' as never }, signal)).resolves.toMatchObject({
      ok: false, error: { code: 'storage-unavailable' },
    })
    await expect(remote.artifacts(agent('session-a'), { runId: 'run-1' as never }, signal)).resolves.toMatchObject({
      ok: false, error: { code: 'storage-unavailable' },
    })
    await expect(remote.artifact(agent('session-a'), { runId: 'run-1' as never, name: 'report.md' }, signal)).resolves.toMatchObject({
      ok: false, error: { code: 'artifact-not-found' },
    })
    await expect(remote.memberDetail(agent('session-a'), { runId: 'run-1' as never, memberId: 'm' as never }, signal)).resolves.toMatchObject({
      ok: false, error: { code: 'member-not-found' },
    })
  })

  it('rejects an expectedRevision mismatch on the first artifact probe', async () => {
    const backend = new FakeRuns()
    backend.runs = [runHead({ runId: 'run-1' as never, displayName: 'review-changes', status: 'completed', allowedActions: [], artifactsRevision: 1 })]
    backend.artifactBody = 'hello-world'
    const remote = runsRemote(backend)
    const signal = new AbortController().signal
    const first = await remote.artifact(agent('session-a'), { runId: 'run-1' as never, name: 'report.md', maxBytes: 4 }, signal)
    if (!first.ok || first.value.nextCursor === undefined) throw new Error('expected cursor')
    backend.artifactReads = 0
    backend.artifactIdentityRevision = 2
    backend.artifactRevision = 2
    await expect(remote.artifact(agent('session-a'), {
      runId: 'run-1' as never, name: 'report.md', cursor: first.value.nextCursor, maxBytes: 4, expectedRevision: 1,
    }, signal)).resolves.toMatchObject({
      ok: false, error: { code: 'artifact-changed', details: { revision: 2 } },
    })
  })

  it('rejects a second artifact read whose identity bytes changed', async () => {
    const backend = new FakeRuns()
    backend.runs = [runHead({ runId: 'run-1' as never, displayName: 'review-changes', status: 'completed', allowedActions: [], artifactsRevision: 1 })]
    backend.artifactBody = 'hello-world'
    const original = backend.artifact.bind(backend)
    backend.artifact = (async (agentArg: Agent, request: { runId: string; name: string; cursor?: unknown; maxBytes?: number }) => {
      const chunk = await original(agentArg, request)
      if (backend.artifactReads > 1) {
        return { ...chunk, artifact: { name: request.name, bytes: 99 }, totalBytes: chunk.totalBytes, revision: 1 }
      }
      return chunk
    }) as FakeRuns['artifact']
    const remote = runsRemote(backend)
    const signal = new AbortController().signal
    const first = await remote.artifact(agent('session-a'), { runId: 'run-1' as never, name: 'report.md', maxBytes: 4 }, signal)
    if (!first.ok || first.value.nextCursor === undefined) throw new Error('expected cursor')
    backend.artifactReads = 0
    backend.artifactIdentityRevision = 1
    backend.artifactRevision = 1
    await expect(remote.artifact(agent('session-a'), {
      runId: 'run-1' as never, name: 'report.md', cursor: first.value.nextCursor, maxBytes: 4,
    }, signal)).resolves.toMatchObject({
      ok: false, error: { code: 'artifact-changed' },
    })
  })
})
