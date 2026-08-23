/** Public and resolved configuration for the installable workflow package. */
import { isAbsolute, join, normalize } from 'node:path'
import z from '@deepseek-ai/schemastery'
import type Schema from '@deepseek-ai/schemastery'

/** Operator-facing workflow-package configuration. Every field is optional before resolution. */
export interface Config {
  readonly enabled?: boolean
  readonly dshHome?: string
  readonly runsRoot?: string
  readonly bundledDefinitionsDir?: string
  readonly definitionWatch?: boolean
  readonly definitionMaxBytes?: number
  readonly maxDefinitionsPerRoot?: number
  readonly watchMaxProjects?: number
  readonly watchUsePolling?: boolean
  readonly watchStabilityThresholdMs?: number
  readonly watchPollIntervalMs?: number
  readonly defaultAgentBudget?: number
  readonly maxAgentBudget?: number
  readonly maxConcurrentAgents?: number
  readonly maxActiveRunsPerSession?: number
  readonly maxActiveRunsGlobal?: number
  readonly maxRetainedRunsPerSession?: number
  readonly maxWorkflowNamesPerSession?: number
  readonly maxMembersPerRun?: number
  readonly maxManifestBytes?: number
  readonly maxRecoveryEntries?: number
  readonly maxRunDetailsBytes?: number
  readonly maxRunStoreBytes?: number
  readonly maxTerminalResultBytes?: number
  readonly maxScriptBytes?: number
  readonly maxScriptProjectionBytes?: number
  readonly maxJournalBytes?: number
  readonly maxPromptBytes?: number
  readonly maxEventTextBytes?: number
  readonly maxGateKindBytes?: number
  readonly maxGateMessageBytes?: number
  readonly memberOutcomeMaxBytes?: number
  readonly maxLogLines?: number
  readonly maxLogLineBytes?: number
  readonly maxLogTotalBytes?: number
  readonly scratchMaxOperations?: number
  readonly scratchMaxPendingOperations?: number
  readonly scratchMaxFiles?: number
  readonly scratchMaxFileBytes?: number
  readonly scratchMaxTotalBytes?: number
  readonly maxRetainedArtifactsPerRun?: number
  readonly maxArtifactNameBytes?: number
  readonly artifactChunkDefaultBytes?: number
  readonly artifactChunkMaxBytes?: number
  readonly remotePageDefault?: number
  readonly remotePageMax?: number
  readonly remoteQueueMaxSessions?: number
  readonly remoteHeadTextMaxBytes?: number
  readonly remoteDetailMaxPhases?: number
  readonly completionNoticeMaxBytes?: number
  readonly completionCohortMaxItems?: number
  readonly completionCohortMaxBytes?: number
  readonly saveScope?: 'project' | 'user'
}

/** Fully defaulted, path-normalized configuration consumed by runtime components. */
export interface ResolvedWorkflowPackageConfig extends Required<Omit<Config, 'bundledDefinitionsDir'>> {
  readonly bundledDefinitionsDir?: string
}

const positive = () => z.natural().min(1)

/** Schemastery contribution used by Cordis Loader. Cross-field rules are enforced by the resolver. */
export const Config: Schema<Config> = z.object({
  enabled: z.boolean().default(true), dshHome: z.string(), runsRoot: z.string(), bundledDefinitionsDir: z.string(),
  definitionWatch: z.boolean().default(true), definitionMaxBytes: positive().default(1_048_576),
  maxDefinitionsPerRoot: positive().default(256), watchMaxProjects: positive().default(128), watchUsePolling: z.boolean().default(false),
  watchStabilityThresholdMs: positive().default(200), watchPollIntervalMs: positive().default(100), defaultAgentBudget: positive().default(128),
  maxAgentBudget: positive().default(1_024), maxConcurrentAgents: positive().default(32), maxActiveRunsPerSession: positive().default(64),
  maxActiveRunsGlobal: positive().default(1_024), maxRetainedRunsPerSession: positive().default(256), maxWorkflowNamesPerSession: positive().default(4_096),
  maxMembersPerRun: positive().default(2_048), maxManifestBytes: positive().default(8_388_608), maxRecoveryEntries: positive().default(4_096),
  maxRunDetailsBytes: positive().default(33_554_432), maxRunStoreBytes: positive().default(536_870_912), maxTerminalResultBytes: positive().default(1_048_576),
  maxScriptBytes: positive().default(1_048_576), maxScriptProjectionBytes: positive().default(1_048_576), maxJournalBytes: positive().default(67_108_864),
  maxPromptBytes: positive().default(1_048_576), maxEventTextBytes: positive().default(65_536), maxGateKindBytes: positive().default(64),
  maxGateMessageBytes: positive().default(65_536), memberOutcomeMaxBytes: positive().default(131_072), maxLogLines: positive().default(4_096),
  maxLogLineBytes: positive().default(65_536), maxLogTotalBytes: positive().default(33_554_432), scratchMaxOperations: positive().default(4_096),
  scratchMaxPendingOperations: positive().default(64), scratchMaxFiles: positive().default(64), scratchMaxFileBytes: positive().default(1_048_576),
  scratchMaxTotalBytes: positive().default(8_388_608), maxRetainedArtifactsPerRun: positive().default(256), maxArtifactNameBytes: positive().default(255),
  artifactChunkDefaultBytes: positive().default(32_768), artifactChunkMaxBytes: positive().default(131_072), remotePageDefault: positive().default(50),
  remotePageMax: positive().default(200), remoteQueueMaxSessions: positive().default(256), remoteHeadTextMaxBytes: positive().default(131_072),
  remoteDetailMaxPhases: positive().default(256), completionNoticeMaxBytes: positive().default(16_384), completionCohortMaxItems: positive().default(20),
  completionCohortMaxBytes: positive().default(262_144), saveScope: z.union(['project', 'user']).default('project'),
})

const DEFAULTS = {
  enabled: true, definitionWatch: true, definitionMaxBytes: 1_048_576, maxDefinitionsPerRoot: 256, watchMaxProjects: 128, watchUsePolling: false,
  watchStabilityThresholdMs: 200, watchPollIntervalMs: 100, defaultAgentBudget: 128, maxAgentBudget: 1_024, maxConcurrentAgents: 32,
  maxActiveRunsPerSession: 64, maxActiveRunsGlobal: 1_024, maxRetainedRunsPerSession: 256, maxWorkflowNamesPerSession: 4_096, maxMembersPerRun: 2_048,
  maxManifestBytes: 8_388_608, maxRecoveryEntries: 4_096, maxRunDetailsBytes: 33_554_432, maxRunStoreBytes: 536_870_912, maxTerminalResultBytes: 1_048_576,
  maxScriptBytes: 1_048_576, maxScriptProjectionBytes: 1_048_576, maxJournalBytes: 67_108_864, maxPromptBytes: 1_048_576, maxEventTextBytes: 65_536,
  maxGateKindBytes: 64, maxGateMessageBytes: 65_536, memberOutcomeMaxBytes: 131_072, maxLogLines: 4_096, maxLogLineBytes: 65_536, maxLogTotalBytes: 33_554_432,
  scratchMaxOperations: 4_096, scratchMaxPendingOperations: 64, scratchMaxFiles: 64, scratchMaxFileBytes: 1_048_576, scratchMaxTotalBytes: 8_388_608,
  maxRetainedArtifactsPerRun: 256, maxArtifactNameBytes: 255, artifactChunkDefaultBytes: 32_768, artifactChunkMaxBytes: 131_072, remotePageDefault: 50,
  remotePageMax: 200, remoteQueueMaxSessions: 256, remoteHeadTextMaxBytes: 131_072, remoteDetailMaxPhases: 256, completionNoticeMaxBytes: 16_384,
  completionCohortMaxItems: 20, completionCohortMaxBytes: 262_144, saveScope: 'project' as const,
}

const BOOLEAN_FIELDS = ['enabled', 'definitionWatch', 'watchUsePolling'] as const
const FIXED_CEILINGS = {
  maxAgentBudget: 1_024, maxActiveRunsPerSession: 64, maxActiveRunsGlobal: 1_024, maxRetainedRunsPerSession: 256, maxWorkflowNamesPerSession: 4_096,
  maxMembersPerRun: 2_048, maxManifestBytes: 8_388_608, maxRecoveryEntries: 4_096, maxRunDetailsBytes: 33_554_432, maxRunStoreBytes: 536_870_912,
  scratchMaxOperations: 4_096, scratchMaxPendingOperations: 64, scratchMaxFiles: 64, scratchMaxFileBytes: 1_048_576, scratchMaxTotalBytes: 8_388_608,
  remoteQueueMaxSessions: 256,
} as const

function positiveSafeInteger(name: string, value: unknown): asserts value is number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) throw new TypeError(`${name} must be a positive safe integer`)
}

function absolutePath(value: unknown, name: string): string {
  if (typeof value !== 'string' || !isAbsolute(value)) throw new TypeError(`${name} must be an absolute path`)
  return normalize(value)
}

/**
 * Resolve all defaults and cross-field relationships without touching the filesystem.
 * @param input - Optional operator overrides; the object is never mutated.
 * @param dshHome - Absolute fallback DSH home supplied by package composition.
 * @returns A frozen, fully defaulted configuration with normalized paths.
 */
export function resolveWorkflowPackageConfig(input: Config, dshHome: string): ResolvedWorkflowPackageConfig {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) throw new TypeError('workflow package config must be an object')
  const fallbackHome = absolutePath(dshHome, 'dshHome')
  const home = absolutePath(input.dshHome ?? fallbackHome, 'dshHome')
  const runsRoot = absolutePath(input.runsRoot ?? join(home, 'workflow-runs'), 'runsRoot')
  const bundledDefinitionsDir = input.bundledDefinitionsDir === undefined ? undefined : absolutePath(input.bundledDefinitionsDir, 'bundledDefinitionsDir')
  const result = { ...DEFAULTS, ...input, dshHome: home, runsRoot, ...(bundledDefinitionsDir === undefined ? {} : { bundledDefinitionsDir }) } as ResolvedWorkflowPackageConfig
  for (const key of BOOLEAN_FIELDS) if (typeof result[key] !== 'boolean') throw new TypeError(`${key} must be a boolean`)
  if (result.saveScope !== 'project' && result.saveScope !== 'user') throw new TypeError('saveScope must be project or user')
  for (const [key, value] of Object.entries(result)) {
    if (key === 'dshHome' || key === 'runsRoot' || key === 'bundledDefinitionsDir' || key === 'saveScope' || BOOLEAN_FIELDS.includes(key as typeof BOOLEAN_FIELDS[number])) continue
    positiveSafeInteger(key, value)
  }
  for (const [key, ceiling] of Object.entries(FIXED_CEILINGS)) if (result[key as keyof typeof result] as number > ceiling) throw new RangeError(`${key} must not exceed ${ceiling}`)
  if (result.defaultAgentBudget > result.maxAgentBudget) throw new RangeError('defaultAgentBudget must not exceed maxAgentBudget')
  if (result.maxConcurrentAgents > result.maxAgentBudget) throw new RangeError('maxConcurrentAgents must not exceed maxAgentBudget')
  if (result.maxActiveRunsPerSession > result.maxActiveRunsGlobal) throw new RangeError('maxActiveRunsPerSession must not exceed maxActiveRunsGlobal')
  if (result.memberOutcomeMaxBytes > result.maxRunDetailsBytes) throw new RangeError('memberOutcomeMaxBytes must not exceed maxRunDetailsBytes')
  if (result.maxTerminalResultBytes > result.maxRunDetailsBytes) throw new RangeError('maxTerminalResultBytes must not exceed maxRunDetailsBytes')
  if (result.maxLogLineBytes > result.maxLogTotalBytes) throw new RangeError('maxLogLineBytes must not exceed maxLogTotalBytes')
  if (result.maxLogTotalBytes > result.maxRunDetailsBytes) throw new RangeError('maxLogTotalBytes must not exceed maxRunDetailsBytes')
  if (result.maxRunDetailsBytes > result.maxRunStoreBytes) throw new RangeError('maxRunDetailsBytes must not exceed maxRunStoreBytes')
  if (result.maxScriptProjectionBytes > result.maxScriptBytes) throw new RangeError('maxScriptProjectionBytes must not exceed maxScriptBytes')
  if (result.scratchMaxPendingOperations > result.scratchMaxOperations) throw new RangeError('scratchMaxPendingOperations must not exceed scratchMaxOperations')
  if (result.scratchMaxFileBytes > result.scratchMaxTotalBytes) throw new RangeError('scratchMaxFileBytes must not exceed scratchMaxTotalBytes')
  if (result.artifactChunkDefaultBytes > result.artifactChunkMaxBytes) throw new RangeError('artifactChunkDefaultBytes must not exceed artifactChunkMaxBytes')
  if (result.remotePageDefault > result.remotePageMax) throw new RangeError('remotePageDefault must not exceed remotePageMax')
  return Object.freeze({ ...result })
}
