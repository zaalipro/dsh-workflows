import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const root = resolve(import.meta.dirname, '..')
const patchPath = resolve(root, 'cordis.patch.yml')
const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
  readonly name: string
  readonly version: string
  readonly dsh: { readonly bundle: { readonly patch: string }; readonly client: { readonly platform: string } }
}

type Entry = {
  id?: string
  name?: string
  disabled?: boolean
  group?: boolean
  config?: unknown
  inject?: unknown
}

type Patch = Entry & { insert?: Entry[] }

/** Official include patch algorithm (id-targeted overrides + inserts). */
function applyEntryPatches(data: Entry[], patches: Patch[] | undefined, warn: (message: string, ...args: unknown[]) => void): Entry[] {
  data = structuredClone(data)
  if (!patches?.length) return data
  const entryMap = new Map<string, Entry>()
  const buildMap = (entries: Entry[]) => {
    for (const entry of entries) {
      if (entry.id) entryMap.set(entry.id, entry)
      if (entry.group && Array.isArray(entry.config)) buildMap(entry.config as Entry[])
    }
  }
  buildMap(data)
  for (const patch of patches) {
    const { id, insert, name, ...overrides } = patch
    if (insert) {
      if (id) {
        const target = entryMap.get(id)
        if (!target) {
          warn('patch insert: entry %C not found', id)
          continue
        }
        if (!target.group) {
          warn('patch insert: entry %C is not a group', id)
          continue
        }
        if (!Array.isArray(target.config)) target.config = []
        ;(target.config as Entry[]).push(...insert)
      } else {
        data.push(...insert)
      }
      buildMap(insert)
      continue
    }
    if (!id) {
      warn('patch: id is required for non-insert patches')
      continue
    }
    const target = entryMap.get(id)
    if (!target) {
      warn('patch: entry %C not found', id)
      continue
    }
    if (name && name !== target.name) {
      warn('patch: name mismatch for %C (expected %C, got %C), skipping', id, target.name, name)
      continue
    }
    for (const [key, value] of Object.entries(overrides)) {
      if (key === 'id') continue
      ;(target as Record<string, unknown>)[key] = value
    }
  }
  return data
}

function loadPatch(): Patch[] {
  const parsed = parse(readFileSync(patchPath, 'utf8')) as Patch[]
  expect(Array.isArray(parsed)).toBe(true)
  return parsed
}

const webBase: Entry[] = [
  { id: 'workflow-worker-thread', name: '@deepseek-ai/dsh-workflow-worker-thread', disabled: true },
  { id: 'ui-workflow-run', name: '@deepseek-ai/dsh-client-ui-workflow-run' },
  { id: 'tool-workflow', name: '@deepseek-ai/dsh-tool-workflow' },
]

const headlessBase: Entry[] = [
  { id: 'workflow-worker-thread', name: '@deepseek-ai/dsh-workflow-worker-thread', config: { provider: 'spawn' } },
  { id: 'headless-runner', name: '@deepseek-ai/dsh-headless' },
]

describe('installable bundle patch', () => {
  it('is the manifest-declared Host patch and does not add a browser Loader row', () => {
    expect(manifest.dsh.bundle.patch).toBe('./cordis.patch.yml')
    expect(manifest.dsh.client.platform).toBe('web')
    const source = readFileSync(patchPath, 'utf8')
    expect(source).toContain("name: '@deepseek-ai/dsh-workflow-worker-thread'")
    expect(source).toContain('provider: spawn')
    expect(source).toContain('id: ui-workflow-run')
    expect(source).toContain('id: zaalipro-workflows')
    expect(source).toContain("name: '@zaalipro/dsh-workflows'")
    expect(source).not.toMatch(/\.\/client/u)
    expect(source).not.toMatch(/dsh-workflows\/registry/u)
  })

  it('enables the official worker once, disables ui-workflow-run, and inserts the package row on Web', () => {
    const warnings: string[] = []
    const composed = applyEntryPatches(webBase, loadPatch(), (message, ...args) => {
      warnings.push([message, ...args].join(' '))
    })
    const byId = new Map(composed.map(entry => [entry.id, entry]))
    expect(byId.get('workflow-worker-thread')).toMatchObject({
      name: '@deepseek-ai/dsh-workflow-worker-thread',
      disabled: false,
      config: { provider: 'spawn' },
    })
    expect(byId.get('ui-workflow-run')).toMatchObject({ disabled: true })
    expect(composed.filter(entry => entry.name === '@deepseek-ai/dsh-workflow-worker-thread')).toHaveLength(1)
    expect(composed.filter(entry => entry.id === 'zaalipro-workflows')).toEqual([
      { id: 'zaalipro-workflows', name: '@zaalipro/dsh-workflows' },
    ])
    expect(composed.some(entry => String(entry.name).includes('./client'))).toBe(false)
    expect(warnings).toEqual([])
  })

  it('inserts the package row on headless and skips a missing ui-workflow-run target', () => {
    const warnings: string[] = []
    const composed = applyEntryPatches(headlessBase, loadPatch(), (message, ...args) => {
      warnings.push(`${message} ${args.map(String).join(' ')}`)
    })
    expect(composed.filter(entry => entry.name === '@deepseek-ai/dsh-workflow-worker-thread')).toHaveLength(1)
    expect(composed.filter(entry => entry.id === 'zaalipro-workflows')).toHaveLength(1)
    expect(composed.some(entry => entry.id === 'ui-workflow-run')).toBe(false)
    expect(composed.some(entry => entry.name === '@zaalipro/dsh-workflows/client')).toBe(false)
    expect(warnings.some(line => line.includes('ui-workflow-run'))).toBe(true)
  })

  it('add/remove round-trips a profile manifest to one dependency and one bundle', () => {
    const stock = {
      name: 'dsh-profile-web',
      dependencies: { '@deepseek-ai/dsh-bundle-web-app': '0.1.0-rc.8' },
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-bundle-web-app'] } },
    }
    const added = structuredClone(stock)
    added.dependencies[manifest.name] = manifest.version
    added.dsh.profile.bundles.push(manifest.name)
    expect(Object.keys(added.dependencies)).toEqual(['@deepseek-ai/dsh-bundle-web-app', '@zaalipro/dsh-workflows'])
    expect(added.dsh.profile.bundles).toEqual(['@deepseek-ai/dsh-bundle-web-app', '@zaalipro/dsh-workflows'])
    delete added.dependencies[manifest.name]
    added.dsh.profile.bundles = added.dsh.profile.bundles.filter(name => name !== manifest.name)
    expect(JSON.stringify(added)).toBe(JSON.stringify(stock))
  })
})
