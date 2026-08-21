import { readFileSync, statSync } from 'node:fs'
import vm from 'node:vm'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '..')
const REQUIRED_TYPERT = [
  'lib/typert.host.js',
  'lib/typert.host.d.ts',
  'lib/typert.remote-client.js',
  'lib/typert.remote-client.d.ts',
] as const
const REMOTE_METHODS = [
  'workflowDefinitions_list',
  'workflowRuns_list',
  'workflowRuns_detail',
  'workflowRuns_members',
  'workflowRuns_memberDetail',
  'workflowRuns_logs',
  'workflowRuns_result',
  'workflowRuns_artifacts',
  'workflowRuns_artifact',
  'workflowRuns_control',
] as const

describe('build artifacts', () => {
  it('emits the four Typert files without @RemoteScope', () => {
    for (const relative of REQUIRED_TYPERT) {
      expect(statSync(resolve(root, relative)).isFile(), relative).toBe(true)
    }
    const host = readFileSync(resolve(root, 'lib/typert.host.js'), 'utf8')
    const remote = readFileSync(resolve(root, 'lib/typert.remote-client.js'), 'utf8')
    expect(host).not.toContain('@RemoteScope')
    expect(remote).not.toContain('@RemoteScope')
    const combined = `${host}\n${remote}`
    expect(combined).toContain('workflowDefinitions')
    expect(combined).toContain('workflowRuns')
    for (const method of REMOTE_METHODS) expect(combined, method).toContain(method)
  })

  it('registers the lazy-CJS client bundle without evaluating Host React', () => {
    const client = readFileSync(resolve(root, 'lib/client.js'), 'utf8')
    const registrations: Array<{ id?: string; factory?: unknown }> = []
    vm.runInNewContext(client, {
      window: { __ModuleLoader__: { load(value: { id?: string; factory?: unknown }) { registrations.push(value) } } },
    }, { filename: resolve(root, 'lib/client.js') })
    expect(registrations).toHaveLength(1)
    expect(registrations[0]?.id).toBe('@zaalipro/dsh-workflows')
    expect(typeof registrations[0]?.factory).toBe('function')
    expect(registrations[0]?.factory.length).toBeGreaterThan(0)
    expect(client).not.toContain('?.load')
    expect(client).not.toMatch(/factory:\s*\(\s*\)\s*=>\s*\(\s*\{\s*\}\s*\)/u)
    expect(client).toContain('window.__ModuleLoader__.load({')
    expect(client).toContain('"@zaalipro/dsh-workflows"')
    expect(client).toMatch(/factory:\s*\(\s*require\s*\)/u)
    expect(statSync(resolve(root, 'lib/client.js.map')).isFile()).toBe(true)

    const hostEntry = readFileSync(resolve(root, 'lib/types/index.js'), 'utf8')
    expect(hostEntry).not.toMatch(/from\s+['"]\.\/client(?:\.js)?['"]/u)
    expect(hostEntry).not.toMatch(/from\s+['"]react(?:-dom)?['"]/u)
  })

  it('keeps executable artifacts free of workspace and checkout-absolute imports', () => {
    for (const relative of [...REQUIRED_TYPERT, 'lib/types/index.js', 'lib/client.js']) {
      const text = readFileSync(resolve(root, relative), 'utf8')
      expect(text, relative).not.toMatch(/workspace:/u)
      expect(text, relative).not.toMatch(/\/Users\/[A-Za-z0-9._-]+\//u)
      expect(text, relative).not.toMatch(/from\s+['"](?:\.\.\/)+src\//u)
    }
  })
})
