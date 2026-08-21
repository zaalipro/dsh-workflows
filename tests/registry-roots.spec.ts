import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  findProjectRoot,
  findWorkflowProjectRoot,
  resolveWorkflowRoots,
  workflowPathApi,
} from '../src/registry/roots.js'
import { WORKFLOW_SCOPE_PRECEDENCE } from '../src/registry/types.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

async function temp(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'dsh-registry-roots-'))
  roots.push(path)
  return path
}

describe('definition roots (RS6)', () => {
  it('selects POSIX vs Windows path operations from execution-world spelling', () => {
    expect(WORKFLOW_SCOPE_PRECEDENCE).toEqual(['bundled', 'project', 'user'])
    expect(workflowPathApi('/tmp/project').join('/tmp/project', '.dsh', 'workflows')).toBe('/tmp/project/.dsh/workflows')
    expect(workflowPathApi('C:\\work\\proj').join('C:\\work\\proj', '.dsh', 'workflows')).toBe('C:\\work\\proj\\.dsh\\workflows')
  })

  it('walks to a .git directory, a .git worktree file, and the nearest nested project', async () => {
    const base = await temp()
    const repo = join(base, 'repo')
    const nested = join(repo, 'pkg', 'src')
    await mkdir(join(repo, '.git'), { recursive: true })
    await mkdir(nested, { recursive: true })
    expect(await findProjectRoot(nested)).toBe(repo)

    const worktree = join(base, 'worktree')
    await mkdir(worktree, { recursive: true })
    await writeFile(join(worktree, '.git'), 'gitdir: /tmp/git/worktrees/a')
    expect(await findProjectRoot(worktree)).toBe(worktree)
  })

  it('returns the supplied cwd when no ancestor has a .git marker and stops at the filesystem root', async () => {
    const cwd = await temp()
    expect(await findProjectRoot(cwd)).toBe(cwd)

    const fs = {
      async lstat() { return undefined },
    }
    await expect(findWorkflowProjectRoot(fs, '/')).resolves.toBe('/')
    await expect(findWorkflowProjectRoot(fs, 'C:\\')).resolves.toBe('C:\\')

    const aborting = new AbortController()
    await expect(findWorkflowProjectRoot({
      async lstat(_path, _opts, signal) {
        aborting.abort()
        signal?.throwIfAborted()
        return undefined
      },
    }, '/', aborting.signal)).rejects.toThrow()
    await expect(findWorkflowProjectRoot({
      async lstat() { return { type: 'symlink' } },
    }, '/work/proj')).resolves.toBe('/work/proj')
  })

  it('resolves bundled, project, and user roots in first-wins order without substituting dshHome for cwd', async () => {
    const base = await temp()
    const project = join(base, 'project')
    const home = join(base, 'home')
    const bundled = join(base, 'pkg', 'workflows')
    await mkdir(join(project, '.git'), { recursive: true })
    await mkdir(bundled, { recursive: true })
    const resolved = await resolveWorkflowRoots({
      cwd: project,
      dshHome: home,
      bundledDefinitionsDir: bundled,
    })
    expect(resolved.map(root => root.scope)).toEqual(['bundled', 'project', 'user'])
    expect(resolved[0]).toEqual({
      scope: 'bundled',
      path: bundled,
      basePath: join(base, 'pkg'),
    })
    expect(resolved[1]).toEqual({
      scope: 'project',
      path: join(project, '.dsh', 'workflows'),
      basePath: project,
      projectRoot: project,
    })
    expect(resolved[2]).toEqual({
      scope: 'user',
      path: join(home, 'workflows'),
      basePath: home,
    })
  })

  it('uses Windows spelling for a Windows cwd and a Host filesystem that never finds .git', async () => {
    const fs = {
      async lstat() { return undefined },
    }
    const resolved = await resolveWorkflowRoots({
      fileSystem: fs,
      cwd: 'C:\\work\\proj',
      dshHome: 'C:\\Users\\u\\.dsh',
    })
    expect(resolved.map(root => root.path)).toEqual([
      'C:\\work\\proj\\.dsh\\workflows',
      'C:\\Users\\u\\.dsh\\workflows',
    ])
    expect(resolved[0]?.projectRoot).toBe('C:\\work\\proj')
  })

  it('rejects an omitted cwd instead of walking $DSH_HOME as a fake project root', async () => {
    await expect(resolveWorkflowRoots({
      dshHome: '/var/dsh',
    })).rejects.toThrow('workflow definition listing requires a session cwd')
    await expect(resolveWorkflowRoots({
      cwd: '',
      dshHome: '/var/dsh',
    })).rejects.toThrow('workflow definition listing requires a session cwd')
  })

  it('rejects a relative cwd and a bundled root whose canonical target escapes its configured base', async () => {
    await expect(resolveWorkflowRoots({
      cwd: 'relative',
      dshHome: '/var/dsh',
    })).rejects.toThrow(/workflow cwd must be an absolute path/u)

    const fs = {
      async lstat() { return undefined },
      async resolve(path: string) {
        return { path: path.endsWith('workflows') ? '/tmp/evil' : path }
      },
      contains(parent: unknown, child: unknown) {
        const left = String((parent as { path?: string }).path ?? parent)
        const right = String((child as { path?: string }).path ?? child)
        return right === left || right.startsWith(`${left}/`)
      },
    }
    await expect(resolveWorkflowRoots({
      fileSystem: fs,
      cwd: '/work/proj',
      dshHome: '/var/dsh',
      bundledDefinitionsDir: '/opt/pkg/workflows',
    })).rejects.toThrow(/\/opt\/pkg\/workflows: workflow root escapes its bundled scope through a symbolic-link ancestor/u)
  })

  it('aborts before ancestor observations and before returning roots', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(findWorkflowProjectRoot({
      async lstat() { throw new Error('must not stat') },
    }, '/work', controller.signal)).rejects.toThrow()

    const live = new AbortController()
    const fs = {
      async lstat(_path: string, _opts: unknown, signal?: AbortSignal) {
        signal?.throwIfAborted()
        return { type: 'directory' as const }
      },
    }
    live.abort()
    await expect(resolveWorkflowRoots({
      fileSystem: fs,
      cwd: '/work/proj',
      dshHome: '/var/dsh',
      signal: live.signal,
    })).rejects.toThrow()

    const late = new AbortController()
    await expect(resolveWorkflowRoots({
      fileSystem: {
        async lstat() { return { type: 'directory' } },
        async resolve(path: string, options?: { signal?: AbortSignal }) {
          options?.signal?.throwIfAborted()
          late.abort()
          return { path }
        },
        contains() { return true },
      },
      cwd: '/work/proj',
      dshHome: '/var/dsh',
      bundledDefinitionsDir: '/opt/pkg/workflows',
      signal: late.signal,
    })).rejects.toThrow()
  })

  it('accepts a Host filesystem .git file marker and a missing lstat as ENOENT', async () => {
    const cwd = await temp()
    const fs = {
      async lstat(path: string) {
        if (path.endsWith('.git')) return { type: 'file' as const }
        return undefined
      },
    }
    expect(await findWorkflowProjectRoot(fs, cwd)).toBe(cwd)
    await expect(resolveWorkflowRoots({ cwd: '/work', dshHome: '' }))
      .rejects.toThrow(/dshHome must be a non-empty absolute path/u)
    await expect(findProjectRoot(cwd, AbortSignal.abort())).rejects.toThrow()
  })
})
