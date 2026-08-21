import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '..')
const source = readFileSync(resolve(root, '.github/workflows/release.yml'), 'utf8')
const workflow = parse(source) as any
const officialCommit = '141eb6fef83422698aef7a981029e843e8161534'

describe('release workflow policy', () => {
  it('runs only for version tags and never cancels a release', () => {
    expect(workflow.name).toBe('Release')
    expect(workflow.on.push.tags).toEqual(['v*'])
    expect(workflow.concurrency['cancel-in-progress']).toBe(false)
    expect(workflow.permissions).toEqual({ contents: 'read' })
  })

  it('checks an annotated tag against the manifest and pinned official base', () => {
    const pack = workflow.jobs.pack
    expect(pack['runs-on']).toBe('ubuntu-24.04')
    expect(pack['timeout-minutes']).toBeGreaterThan(0)
    const official = checkout(pack)
    expect(official.with.ref).toBe(officialCommit)
    expect(official.with.repository).toBe('deepseek-ai/deepseek-harness')
    expect(runText(pack)).toContain('git for-each-ref')
    expect(runText(pack)).toContain('GITHUB_REF_NAME')
    expect(runText(pack)).toContain('package.json')
    expect(runText(pack)).toContain('DSH_OFFICIAL_BASE_COMMIT')
  })

  it('installs without scripts and gives the checker the only pack invocation', () => {
    const pack = workflow.jobs.pack
    expect(runText(pack)).toContain('pnpm install --frozen-lockfile --ignore-scripts')
    const checker = pack.steps.find((step: any) => step.name?.includes('sole release checker'))
    expect(checker.run).toContain('scripts/check-release.mjs')
    expect(checker.run).toContain('--artifact-dir')
    expect(checker.run).toContain('--tag')
    expect(source.match(/pnpm\s+(?:--[^\n]+\s+)*pack\b/gu) ?? []).toHaveLength(0)
    expect(source.match(/node scripts\/check-release\.mjs/gu) ?? []).toHaveLength(1)
    expect(source).not.toMatch(/git\s+apply/u)
    expect(source).not.toMatch(/H prerequisite patch/u)
  })

  it('propagates the discovered filename, digest, dist tag, and prerelease state', () => {
    const pack = workflow.jobs.pack
    expect(pack.outputs).toEqual({
      filename: '${{ steps.artifact.outputs.filename }}',
      sha256: '${{ steps.artifact.outputs.sha256 }}',
      dist_tag: '${{ steps.artifact.outputs.dist_tag }}',
      prerelease: '${{ steps.artifact.outputs.prerelease }}',
    })
    const record = pack.steps.find((step: any) => step.id === 'artifact')
    expect(record.run).toContain('sha256sum')
    expect(record.run).toContain('dist_tag=next')
    expect(record.run).toContain('dist_tag=latest')
    expect(record.run).toContain('prerelease=true')
    expect(record.run).toContain('prerelease=false')
    const upload = pack.steps.find((step: any) => step.uses?.startsWith('actions/upload-artifact@'))
    expect(upload.with['if-no-files-found']).toBe('error')
    expect(upload.with['retention-days']).toBe(7)
  })

  it('publishes and releases only after the pack job with OIDC and write permissions', () => {
    const publish = workflow.jobs.publish
    expect(publish.needs).toBe('pack')
    expect(publish.permissions).toEqual({ contents: 'write', 'id-token': 'write' })
    const download = publish.steps.find((step: any) => step.uses?.startsWith('actions/download-artifact@'))
    expect(download.with.name).toBe('dsh-workflows-release-artifact')
    const verify = publish.steps.find((step: any) => step.name?.includes('Verify downloaded bytes'))
    expect(verify.run).toContain('sha256sum')
    const npm = publish.steps.find((step: any) => step.name?.includes('npm provenance'))
    expect(npm.run).toContain('npm publish')
    expect(npm.run).toContain('--provenance')
    expect(npm.run).toContain('--tag')
    const release = publish.steps.find((step: any) => step.name?.includes('GitHub Release'))
    expect(release.run).toContain('gh release create')
    expect(release.run).toContain('--verify-tag')
    expect(release.run).toContain('--prerelease')
    expect(release.env.GH_TOKEN).toBe('${{ github.token }}')
  })

  it('pins every action to a full commit SHA', () => {
    for (const [jobName, job] of Object.entries<any>(workflow.jobs)) {
      for (const step of job.steps) {
        if (typeof step.uses !== 'string') continue
        expect(step.uses, `${jobName}: ${step.uses}`).toMatch(/^[^@\s]+@[0-9a-f]{40}$/u)
      }
    }
  })
})

function runText(job: any): string { return job.steps.flatMap((step: any) => typeof step.run === 'string' ? [step.run] : []).join('\n') }
function checkout(job: any): any {
  const result = job.steps.find((step: any) => step.uses?.startsWith('actions/checkout@')
    && step.with?.repository === 'deepseek-ai/deepseek-harness')
  expect(result).toBeDefined()
  return result
}
