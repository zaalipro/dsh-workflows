import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '..')
const path = resolve(root, '.github/workflows/ci.yml')
const source = readFileSync(path, 'utf8')
const workflow = parse(source) as any

describe('CI workflow policy', () => {
  it('uses least privilege and tag-safe pull-request cancellation', () => {
    expect(workflow.name).toBe('CI')
    expect(workflow.permissions).toEqual({ contents: 'read' })
    expect(workflow.on).toHaveProperty('push')
    expect(workflow.on).toHaveProperty('pull_request')
    expect(workflow.concurrency.group).toContain('github.ref')
    expect(workflow.concurrency['cancel-in-progress']).toBe("${{ github.ref_type != 'tag' }}")
    expect(source).not.toMatch(/continue-on-error/u)
  })

  it('covers the exact Ubuntu Node matrix with all source gates', () => {
    const linux = workflow.jobs.linux
    expect(linux['runs-on']).toBe('ubuntu-24.04')
    expect(linux['timeout-minutes']).toBeGreaterThan(0)
    expect(linux.strategy['fail-fast']).toBe(false)
    expect(linux.strategy.matrix.node.map(String)).toEqual(['22.19.0', '24', '26'])
    expect(commands(linux)).toEqual(expect.arrayContaining([
      'pnpm install --frozen-lockfile --ignore-scripts',
      'pnpm run build',
      'pnpm run typecheck',
      'pnpm run lint',
      'pnpm run doc-sync',
      'pnpm run verify:package',
      'pnpm run test:coverage',
      'pnpm run test:snapshot',
    ]))
    expect(commands(linux)).not.toContain('pnpm run test:unit')
  })

  it('covers macOS and Windows on Node 24 and asserts Windows limitations', () => {
    const platform = workflow.jobs.platform
    expect(platform.strategy.matrix.os).toEqual(['macos-14', 'windows-2022'])
    expect(setupNodeVersions(platform)).toEqual(['24'])
    expect(commands(platform)).toContain('pnpm run test:unit')
    const windows = platform.steps.find((step: any) => step.name === 'Assert Windows storage and filesystem limitations')
    expect(windows.if).toBe("runner.os == 'Windows'")
    expect(windows.run).toContain('tests/storage-stress.spec.ts')
  })

  it('defines blocking Chromium, stress, and pinned release-pack lanes', () => {
    const chromium = workflow.jobs.chromium
    const stress = workflow.jobs.stress
    const packed = workflow.jobs['release-pack']
    for (const job of [chromium, stress, packed]) {
      expect(job['runs-on']).toBe('ubuntu-24.04')
      expect(job['timeout-minutes']).toBeGreaterThan(0)
      expect(setupNodeVersions(job)).toEqual(['24'])
      expect(commands(job)).toContain('pnpm install --frozen-lockfile --ignore-scripts')
    }
    expect(commands(chromium)).toContain('pnpm run test:browser')
    expect(commands(stress)).toContain('pnpm run test:stress')
    expect(commands(packed).join('\n')).toContain('scripts/check-release.mjs')
    expect(commands(packed).join('\n')).toContain('--artifact-dir')
    expect(officialCheckout(chromium).with.ref).toBe('141eb6fef83422698aef7a981029e843e8161534')
    expect(officialCheckout(packed).with.ref).toBe('141eb6fef83422698aef7a981029e843e8161534')
    expect(source).not.toMatch(/git\s+apply/u)
    expect(source).not.toMatch(/H prerequisite patch/u)
  })

  it('always invokes the real-provider file and lets the test self-skip', () => {
    const provider = workflow.jobs['real-provider']
    const step = provider.steps.find((candidate: any) => candidate.name === 'Always run the real-provider test file')
    expect(step.if).toBeUndefined()
    expect(step.run).toBe('pnpm run test:e2e')
    expect(step.env.DEEPSEEK_API_KEY).toBe('${{ secrets.DEEPSEEK_API_KEY }}')
    expect(provider.steps.some((candidate: any) => candidate.uses?.startsWith('actions/upload-artifact@'))).toBe(false)
  })

  it('pins every third-party action and bounds every job', () => {
    for (const [name, job] of Object.entries<any>(workflow.jobs)) {
      expect(job['timeout-minutes'], `${name} timeout`).toBeGreaterThan(0)
      for (const step of job.steps) {
        if (typeof step.uses !== 'string') continue
        expect(step.uses, `${name}: ${step.uses}`).toMatch(/^[^@\s]+@[0-9a-f]{40}$/u)
        if (step.uses.startsWith('actions/checkout@')) expect(step.with?.['persist-credentials']).toBe(false)
      }
      expect(commands(job)).toContain('pnpm install --frozen-lockfile --ignore-scripts')
    }
  })

  it('uploads only bounded failure diagnostics outside the secret lane', () => {
    for (const [name, job] of Object.entries<any>(workflow.jobs)) {
      for (const step of job.steps) {
        if (!step.uses?.startsWith('actions/upload-artifact@')) continue
        expect(step.if, name).toBe('failure()')
        expect(step.with['retention-days'], name).toBe(3)
        const paths = String(step.with.path)
        expect(paths).not.toMatch(/DSH_HOME|\.env|transcript|credential/iu)
      }
    }
  })
})

function commands(job: any): string[] {
  return job.steps.flatMap((step: any) => typeof step.run === 'string' ? [step.run.trim()] : [])
}

function setupNodeVersions(job: any): string[] {
  return job.steps
    .filter((step: any) => step.uses?.startsWith('actions/setup-node@'))
    .map((step: any) => String(step.with?.['node-version']))
}

function officialCheckout(job: any): any {
  const step = job.steps.find((candidate: any) => candidate.uses?.startsWith('actions/checkout@')
    && candidate.with?.repository === 'deepseek-ai/deepseek-harness')
  expect(step).toBeDefined()
  return step
}
