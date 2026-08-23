import { createRequire } from 'node:module'
import { readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const [home, project, barrier, id, script, holdAfterSwap] = process.argv.slice(2)
if ([home, project, barrier, id, script].some(value => value === undefined)) {
  throw new Error('registry-save-child requires home, project, barrier, id, and script')
}

const require = createRequire(import.meta.url)
const native = require('fs-native-extensions') as {
  swap(from: string, to: string): Promise<void>
  waitForLock(fd: number): Promise<void>
}
const realWaitForLock = native.waitForLock
const realSwap = native.swap
native.waitForLock = async fd => {
  await writeFile(join(barrier, `ready-${id}`), '')
  const deadline = Date.now() + 10_000
  while ((await readdir(barrier)).filter(name => name.startsWith('ready-')).length < 2) {
    if (Date.now() >= deadline) throw new Error('registry child barrier timed out')
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  await realWaitForLock(fd)
}
native.swap = async (from, to) => {
  await realSwap(from, to)
  if (holdAfterSwap !== 'hold') return
  await writeFile(join(barrier, `swapped-${id}`), '')
  const deadline = Date.now() + 10_000
  while (!(await readdir(barrier)).includes(`continue-${id}`)) {
    if (Date.now() >= deadline) throw new Error('registry child swap hold timed out')
    await new Promise(resolve => setTimeout(resolve, 5))
  }
}

const { WorkflowRegistry } = await import('../../src/registry/index.ts')
const registry = new WorkflowRegistry({ dshHome: home, definitionWatch: false })
try {
  const saved = await registry.save({
    meta: { name: 'cross-process', description: 'cross-process workflow' },
    script,
  }, { cwd: project, scope: 'project' })
  process.stdout.write(`${JSON.stringify({ status: 'fulfilled', script: saved.script })}\n`)
} catch (error) {
  process.stdout.write(`${JSON.stringify({
    status: 'rejected',
    code: typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : undefined,
    message: error instanceof Error ? error.message : String(error),
  })}\n`)
} finally {
  await registry.dispose()
}
