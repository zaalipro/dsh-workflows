import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { resolveInstalledHostVersions } from '../src/index.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function fakeDsh(hostVersion: string, workflowVersion?: string): Promise<{ bin: string; link: string }> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-host-identity-'))
  roots.push(root)
  const host = join(root, 'node_modules/@deepseek-ai/dsh')
  const bin = join(host, 'lib/bin.js')
  await mkdir(join(host, 'lib'), { recursive: true })
  await writeFile(join(host, 'package.json'), JSON.stringify({
    name: '@deepseek-ai/dsh', version: hostVersion, bin: { dsh: 'lib/bin.js' },
  }))
  await writeFile(bin, '#!/usr/bin/env node\n')
  if (workflowVersion !== undefined) {
    const workflow = join(host, 'node_modules/@deepseek-ai/dsh-workflow')
    await mkdir(workflow, { recursive: true })
    await writeFile(join(workflow, 'package.json'), JSON.stringify({
      name: '@deepseek-ai/dsh-workflow', version: workflowVersion,
    }))
  }
  const link = join(root, 'dsh')
  await symlink(bin, link)
  return { bin, link }
}

describe('executing Host package identity', () => {
  it('reads both versions from the real DSH selected by argv rather than the plugin graph', async () => {
    const supported = await fakeDsh('0.1.2-rc.1', '0.1.2-rc.1')
    const other = await fakeDsh('9.9.9', '8.8.8')

    expect(resolveInstalledHostVersions(supported.link)).toEqual(['0.1.2-rc.1', '0.1.2-rc.1'])
    expect(resolveInstalledHostVersions(other.link)).toEqual(['9.9.9', '8.8.8'])
  })

  it('does not fall back to the plugin copy for an incomplete or forged DSH executable', async () => {
    const incomplete = await fakeDsh('0.1.2-rc.1')
    expect(resolveInstalledHostVersions(incomplete.bin)).toBeUndefined()

    const root = await mkdtemp(join(tmpdir(), 'dsh-forged-entry-'))
    roots.push(root)
    const forged = join(root, 'dsh')
    await writeFile(forged, '#!/usr/bin/env node\n')
    expect(resolveInstalledHostVersions(forged)).toBeUndefined()
  })

  it('uses the package-local fallback only for a non-DSH programmatic entrypoint', () => {
    expect(resolveInstalledHostVersions(import.meta.filename)).toEqual(['0.1.2-rc.1', '0.1.2-rc.1'])
  })
})
