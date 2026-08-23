import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, normalize } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { Config, resolveWorkflowPackageConfig } from '../src/config.js'

const homes: string[] = []

afterEach(() => {
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true })
})

function home(): string {
  const value = mkdtempSync(join(tmpdir(), 'dsh-config-'))
  homes.push(value)
  return value
}

describe('workflow package configuration', () => {
  it('resolves every Design default including remote and recovery ceilings', () => {
    const dshHome = home()
    const resolved = resolveWorkflowPackageConfig({}, dshHome)
    expect(resolved).toMatchObject({
      enabled: true,
      dshHome: normalize(dshHome),
      runsRoot: normalize(join(dshHome, 'workflow-runs')),
      definitionWatch: true,
      definitionMaxBytes: 1_048_576,
      maxDefinitionsPerRoot: 256,
      watchMaxProjects: 128,
      watchUsePolling: false,
      watchStabilityThresholdMs: 200,
      watchPollIntervalMs: 100,
      defaultAgentBudget: 128,
      maxAgentBudget: 1_024,
      maxConcurrentAgents: 32,
      maxActiveRunsPerSession: 64,
      maxActiveRunsGlobal: 1_024,
      maxRetainedRunsPerSession: 256,
      maxWorkflowNamesPerSession: 4_096,
      maxMembersPerRun: 2_048,
      maxManifestBytes: 8_388_608,
      maxRecoveryEntries: 4_096,
      maxRunDetailsBytes: 33_554_432,
      maxRunStoreBytes: 536_870_912,
      maxTerminalResultBytes: 1_048_576,
      maxScriptBytes: 1_048_576,
      maxScriptProjectionBytes: 1_048_576,
      maxJournalBytes: 67_108_864,
      maxPromptBytes: 1_048_576,
      maxEventTextBytes: 65_536,
      maxGateKindBytes: 64,
      maxGateMessageBytes: 65_536,
      memberOutcomeMaxBytes: 131_072,
      maxLogLines: 4_096,
      maxLogLineBytes: 65_536,
      maxLogTotalBytes: 33_554_432,
      scratchMaxOperations: 4_096,
      scratchMaxPendingOperations: 64,
      scratchMaxFiles: 64,
      scratchMaxFileBytes: 1_048_576,
      scratchMaxTotalBytes: 8_388_608,
      maxRetainedArtifactsPerRun: 256,
      maxArtifactNameBytes: 255,
      artifactChunkDefaultBytes: 32_768,
      artifactChunkMaxBytes: 131_072,
      remotePageDefault: 50,
      remotePageMax: 200,
      remoteQueueMaxSessions: 256,
      remoteHeadTextMaxBytes: 131_072,
      remoteDetailMaxPhases: 256,
      completionNoticeMaxBytes: 16_384,
      completionCohortMaxItems: 20,
      completionCohortMaxBytes: 262_144,
      saveScope: 'project',
    })
    expect(resolved.bundledDefinitionsDir).toBeUndefined()
    expect(Object.isFrozen(resolved)).toBe(true)
  })

  it('does not read process.cwd while resolving', () => {
    const cwd = process.cwd
    process.cwd = () => {
      throw new Error('config resolution must not read process.cwd()')
    }
    try {
      expect(resolveWorkflowPackageConfig({}, home()).enabled).toBe(true)
    } finally {
      process.cwd = cwd
    }
  })

  it('normalizes explicit absolute roots and accepts a lowered quota', () => {
    const dshHome = home()
    const bundled = join(dshHome, 'bundled', '.')
    const resolved = resolveWorkflowPackageConfig({
      dshHome: join(dshHome, 'nested', '..', 'home'),
      runsRoot: join(dshHome, 'runs'),
      bundledDefinitionsDir: bundled,
      saveScope: 'user',
      definitionWatch: false,
      watchUsePolling: true,
      maxRecoveryEntries: 16,
      remoteQueueMaxSessions: 8,
      maxWorkflowNamesPerSession: 32,
    }, join(dshHome, 'fallback'))
    expect(resolved.dshHome).toBe(normalize(join(dshHome, 'home')))
    expect(resolved.runsRoot).toBe(normalize(join(dshHome, 'runs')))
    expect(resolved.bundledDefinitionsDir).toBe(normalize(bundled))
    expect(resolved.saveScope).toBe('user')
    expect(resolved.definitionWatch).toBe(false)
    expect(resolved.watchUsePolling).toBe(true)
    expect(resolved.maxRecoveryEntries).toBe(16)
    expect(resolved.remoteQueueMaxSessions).toBe(8)
    expect(resolved.maxWorkflowNamesPerSession).toBe(32)
  })

  it('exports a Schemastery Config contribution', () => {
    expect(typeof (Config as { '~standard'?: { validate?: unknown } })['~standard']?.validate).toBe('function')
  })

  it.each([
    ['null', null],
    ['array', []],
    ['number', 1],
  ])('rejects a %s config object', (_name, input) => {
    expect(() => resolveWorkflowPackageConfig(input as any, home())).toThrow(/must be an object/u)
  })

  it('rejects relative homes, roots, and bundled directories', () => {
    const dshHome = home()
    expect(() => resolveWorkflowPackageConfig({}, 'relative-home')).toThrow(/dshHome must be an absolute path/u)
    expect(() => resolveWorkflowPackageConfig({ dshHome: 'relative' }, dshHome)).toThrow(/dshHome must be an absolute path/u)
    expect(() => resolveWorkflowPackageConfig({ runsRoot: 'runs' }, dshHome)).toThrow(/runsRoot must be an absolute path/u)
    expect(() => resolveWorkflowPackageConfig({ bundledDefinitionsDir: 'bundled' }, dshHome)).toThrow(
      /bundledDefinitionsDir must be an absolute path/u,
    )
  })

  it.each(['enabled', 'definitionWatch', 'watchUsePolling'] as const)('rejects a non-boolean %s', (key) => {
    expect(() => resolveWorkflowPackageConfig({ [key]: 'yes' } as any, home())).toThrow(new RegExp(`${key} must be a boolean`, 'u'))
  })

  it('rejects an invalid saveScope', () => {
    expect(() => resolveWorkflowPackageConfig({ saveScope: 'bundled' } as any, home())).toThrow(/saveScope must be project or user/u)
  })

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects a non-positive-safe-integer limit %s', (value) => {
    expect(() => resolveWorkflowPackageConfig({ maxLogLines: value }, home())).toThrow(/maxLogLines must be a positive safe integer/u)
  })

  it.each([
    ['maxAgentBudget', 1_025],
    ['maxActiveRunsPerSession', 65],
    ['maxActiveRunsGlobal', 1_025],
    ['maxRetainedRunsPerSession', 257],
    ['maxWorkflowNamesPerSession', 4_097],
    ['maxMembersPerRun', 2_049],
    ['maxManifestBytes', 8_388_609],
    ['maxRecoveryEntries', 4_097],
    ['maxRunDetailsBytes', 33_554_433],
    ['maxRunStoreBytes', 536_870_913],
    ['scratchMaxOperations', 4_097],
    ['scratchMaxPendingOperations', 65],
    ['scratchMaxFiles', 65],
    ['scratchMaxFileBytes', 1_048_577],
    ['scratchMaxTotalBytes', 8_388_609],
    ['remoteQueueMaxSessions', 257],
  ] as const)('rejects %s above its fixed ceiling', (key, value) => {
    const overrides: Record<string, number> = { [key]: value }
    if (key === 'maxActiveRunsPerSession') overrides.maxActiveRunsGlobal = 1_024
    if (key === 'scratchMaxPendingOperations') overrides.scratchMaxOperations = 4_096
    if (key === 'scratchMaxFileBytes') overrides.scratchMaxTotalBytes = 8_388_608
    expect(() => resolveWorkflowPackageConfig(overrides, home())).toThrow(new RegExp(`${key} must not exceed`, 'u'))
  })

  it.each([
    ['defaultAgentBudget', { defaultAgentBudget: 512, maxAgentBudget: 256 }, 'defaultAgentBudget must not exceed maxAgentBudget'],
    ['maxConcurrentAgents', { defaultAgentBudget: 16, maxConcurrentAgents: 64, maxAgentBudget: 32 }, 'maxConcurrentAgents must not exceed maxAgentBudget'],
    ['maxActiveRunsPerSession', { maxActiveRunsPerSession: 8, maxActiveRunsGlobal: 4 }, 'maxActiveRunsPerSession must not exceed maxActiveRunsGlobal'],
    ['memberOutcomeMaxBytes', { memberOutcomeMaxBytes: 2, maxRunDetailsBytes: 1 }, 'memberOutcomeMaxBytes must not exceed maxRunDetailsBytes'],
    ['maxTerminalResultBytes', {
      memberOutcomeMaxBytes: 1, maxTerminalResultBytes: 2, maxRunDetailsBytes: 1,
    }, 'maxTerminalResultBytes must not exceed maxRunDetailsBytes'],
    ['maxLogLineBytes', { maxLogLineBytes: 8, maxLogTotalBytes: 4 }, 'maxLogLineBytes must not exceed maxLogTotalBytes'],
    ['maxLogTotalBytes', {
      memberOutcomeMaxBytes: 1, maxTerminalResultBytes: 1, maxLogLineBytes: 4, maxLogTotalBytes: 8, maxRunDetailsBytes: 4,
    }, 'maxLogTotalBytes must not exceed maxRunDetailsBytes'],
    ['maxRunDetailsBytes', {
      memberOutcomeMaxBytes: 1, maxTerminalResultBytes: 1, maxLogLineBytes: 1, maxLogTotalBytes: 1,
      maxRunDetailsBytes: 16, maxRunStoreBytes: 8,
    }, 'maxRunDetailsBytes must not exceed maxRunStoreBytes'],
    ['maxScriptProjectionBytes', { maxScriptProjectionBytes: 8, maxScriptBytes: 4 }, 'maxScriptProjectionBytes must not exceed maxScriptBytes'],
    ['scratchMaxPendingOperations', { scratchMaxPendingOperations: 8, scratchMaxOperations: 4 }, 'scratchMaxPendingOperations must not exceed scratchMaxOperations'],
    ['scratchMaxFileBytes', { scratchMaxFileBytes: 8, scratchMaxTotalBytes: 4 }, 'scratchMaxFileBytes must not exceed scratchMaxTotalBytes'],
    ['artifactChunkDefaultBytes', { artifactChunkDefaultBytes: 8, artifactChunkMaxBytes: 4 }, 'artifactChunkDefaultBytes must not exceed artifactChunkMaxBytes'],
    ['remotePageDefault', { remotePageDefault: 8, remotePageMax: 4 }, 'remotePageDefault must not exceed remotePageMax'],
  ] as const)('rejects cross-field %s', (_name, overrides, message) => {
    expect(() => resolveWorkflowPackageConfig(overrides as any, home())).toThrow(message)
  })
})
