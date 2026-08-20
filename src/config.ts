/** Public and resolved configuration for the workflow product. */
import { isAbsolute, join, normalize } from 'node:path';
import z from '@deepseek-ai/schemastery';
import type Schema from '@deepseek-ai/schemastery';

/** Operator-facing package configuration. */
export interface Config {
  readonly enabled?: boolean;
  readonly dshHome?: string;
  readonly runsRoot?: string;
  readonly bundledDefinitionsDir?: string;
  readonly definitionWatch?: boolean;
  readonly definitionMaxBytes?: number;
  readonly maxDefinitionsPerRoot?: number;
  readonly watchMaxProjects?: number;
  readonly watchUsePolling?: boolean;
  readonly watchStabilityThresholdMs?: number;
  readonly watchPollIntervalMs?: number;
  readonly defaultAgentBudget?: number;
  readonly maxAgentBudget?: number;
  readonly maxConcurrentAgents?: number;
  readonly maxActiveRunsPerSession?: number;
  readonly maxActiveRunsGlobal?: number;
  readonly maxRetainedRunsPerSession?: number;
  readonly maxWorkflowNamesPerSession?: number;
  readonly maxMembersPerRun?: number;
  readonly maxManifestBytes?: number;
  readonly maxRecoveryEntries?: number;
  readonly maxRunDetailsBytes?: number;
  readonly maxRunStoreBytes?: number;
  readonly maxTerminalResultBytes?: number;
  readonly maxScriptBytes?: number;
  readonly maxScriptProjectionBytes?: number;
  readonly maxJournalBytes?: number;
  readonly maxPromptBytes?: number;
  readonly maxEventTextBytes?: number;
  readonly maxGateKindBytes?: number;
  readonly maxGateMessageBytes?: number;
  readonly memberOutcomeMaxBytes?: number;
  readonly maxLogLines?: number;
  readonly maxLogLineBytes?: number;
  readonly maxLogTotalBytes?: number;
  readonly scratchMaxOperations?: number;
  readonly scratchMaxPendingOperations?: number;
  readonly scratchMaxFiles?: number;
  readonly scratchMaxFileBytes?: number;
  readonly scratchMaxTotalBytes?: number;
  readonly maxRetainedArtifactsPerRun?: number;
  readonly maxArtifactNameBytes?: number;
  readonly artifactChunkDefaultBytes?: number;
  readonly artifactChunkMaxBytes?: number;
  readonly remotePageDefault?: number;
  readonly remotePageMax?: number;
  readonly remoteQueueMaxSessions?: number;
  readonly remoteHeadTextMaxBytes?: number;
  readonly remoteDetailMaxPhases?: number;
  readonly completionNoticeMaxBytes?: number;
  readonly completionCohortMaxItems?: number;
  readonly completionCohortMaxBytes?: number;
  readonly maxConsecutiveCompletionWakes?: number;
  readonly saveScope?: 'project' | 'user';
}

/** Fully validated configuration used by runtime components. */
export interface ResolvedWorkflowPackageConfig extends Required<Omit<Config, 'bundledDefinitionsDir'>> {
  readonly bundledDefinitionsDir?: string;
}

const positive = () => z.natural().min(1);
/** Schemastery configuration contribution used by Cordis Loader. */
export const Config: Schema<Config> = z.object({
  enabled: z.boolean().default(true), dshHome: z.string(), runsRoot: z.string(), bundledDefinitionsDir: z.string(),
  definitionWatch: z.boolean().default(true), definitionMaxBytes: positive().default(1_048_576),
  maxDefinitionsPerRoot: positive().default(256), watchMaxProjects: positive().default(128),
  watchUsePolling: z.boolean().default(false), watchStabilityThresholdMs: positive().default(200), watchPollIntervalMs: positive().default(100),
  defaultAgentBudget: positive().default(128), maxAgentBudget: positive().default(1_024), maxConcurrentAgents: positive().default(32),
  maxActiveRunsPerSession: positive().default(64), maxActiveRunsGlobal: positive().default(1_024), maxRetainedRunsPerSession: positive().default(256),
  maxWorkflowNamesPerSession: positive().default(4_096), maxMembersPerRun: positive().default(2_048), maxManifestBytes: positive().default(8_388_608),
  maxRecoveryEntries: positive().default(4_096), maxRunDetailsBytes: positive().default(33_554_432), maxRunStoreBytes: positive().default(536_870_912),
  maxTerminalResultBytes: positive().default(1_048_576), maxScriptBytes: positive().default(1_048_576), maxScriptProjectionBytes: positive().default(1_048_576),
  maxJournalBytes: positive().default(67_108_864), maxPromptBytes: positive().default(1_048_576), maxEventTextBytes: positive().default(65_536),
  maxGateKindBytes: positive().default(64), maxGateMessageBytes: positive().default(65_536), memberOutcomeMaxBytes: positive().default(131_072),
  maxLogLines: positive().default(4_096), maxLogLineBytes: positive().default(65_536), maxLogTotalBytes: positive().default(33_554_432),
  scratchMaxOperations: positive().default(4_096), scratchMaxPendingOperations: positive().default(64), scratchMaxFiles: positive().default(64),
  scratchMaxFileBytes: positive().default(1_048_576), scratchMaxTotalBytes: positive().default(8_388_608), maxRetainedArtifactsPerRun: positive().default(256),
  maxArtifactNameBytes: positive().default(255), artifactChunkDefaultBytes: positive().default(32_768), artifactChunkMaxBytes: positive().default(131_072),
  remotePageDefault: positive().default(50), remotePageMax: positive().default(200), remoteQueueMaxSessions: positive().default(256),
  remoteHeadTextMaxBytes: positive().default(131_072), remoteDetailMaxPhases: positive().default(256), completionNoticeMaxBytes: positive().default(16_384),
  completionCohortMaxItems: positive().default(20), completionCohortMaxBytes: positive().default(262_144), maxConsecutiveCompletionWakes: positive().default(3),
  saveScope: z.union(['project', 'user']).default('project'),
});

const DEFAULTS = {
  enabled: true, definitionWatch: true, definitionMaxBytes: 1_048_576, maxDefinitionsPerRoot: 256, watchMaxProjects: 128,
  watchUsePolling: false, watchStabilityThresholdMs: 200, watchPollIntervalMs: 100, defaultAgentBudget: 128, maxAgentBudget: 1_024,
  maxConcurrentAgents: 32, maxActiveRunsPerSession: 64, maxActiveRunsGlobal: 1_024, maxRetainedRunsPerSession: 256,
  maxWorkflowNamesPerSession: 4_096, maxMembersPerRun: 2_048, maxManifestBytes: 8_388_608, maxRecoveryEntries: 4_096,
  maxRunDetailsBytes: 33_554_432, maxRunStoreBytes: 536_870_912, maxTerminalResultBytes: 1_048_576, maxScriptBytes: 1_048_576,
  maxScriptProjectionBytes: 1_048_576, maxJournalBytes: 67_108_864, maxPromptBytes: 1_048_576, maxEventTextBytes: 65_536,
  maxGateKindBytes: 64, maxGateMessageBytes: 65_536, memberOutcomeMaxBytes: 131_072, maxLogLines: 4_096, maxLogLineBytes: 65_536,
  maxLogTotalBytes: 33_554_432, scratchMaxOperations: 4_096, scratchMaxPendingOperations: 64, scratchMaxFiles: 64,
  scratchMaxFileBytes: 1_048_576, scratchMaxTotalBytes: 8_388_608, maxRetainedArtifactsPerRun: 256, maxArtifactNameBytes: 255,
  artifactChunkDefaultBytes: 32_768, artifactChunkMaxBytes: 131_072, remotePageDefault: 50, remotePageMax: 200,
  remoteQueueMaxSessions: 256, remoteHeadTextMaxBytes: 131_072, remoteDetailMaxPhases: 256, completionNoticeMaxBytes: 16_384,
  completionCohortMaxItems: 20, completionCohortMaxBytes: 262_144, maxConsecutiveCompletionWakes: 3, saveScope: 'project' as const,
};

function positiveSafe(name: string, value: unknown): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) throw new TypeError(`${name} must be a positive safe integer`);
}

/** Resolve defaults and reject contradictory limits without touching the filesystem. */
export function resolveWorkflowPackageConfig(input: Config, dshHome: string): ResolvedWorkflowPackageConfig {
  if (!isAbsolute(dshHome)) throw new TypeError('dshHome must be an absolute path');
  const home = normalize(input.dshHome ?? dshHome);
  if (!isAbsolute(home)) throw new TypeError('dshHome must be an absolute path');
  const runsRoot = normalize(input.runsRoot ?? join(home, 'workflow-runs'));
  if (!isAbsolute(runsRoot)) throw new TypeError('runsRoot must be an absolute path');
  const result = { ...DEFAULTS, ...input, dshHome: home, runsRoot } as ResolvedWorkflowPackageConfig;
  const booleans = ['enabled', 'definitionWatch', 'watchUsePolling'] as const;
  for (const key of booleans) if (typeof result[key] !== 'boolean') throw new TypeError(`${key} must be a boolean`);
  for (const [key, value] of Object.entries(result)) {
    if (typeof value === 'number') positiveSafe(key, value);
  }
  const ceilings: Partial<Record<keyof ResolvedWorkflowPackageConfig, number>> = {
    maxRecoveryEntries: 4_096, maxWorkflowNamesPerSession: 4_096, remoteQueueMaxSessions: 256,
    maxManifestBytes: 8_388_608, maxRunDetailsBytes: 33_554_432, maxRunStoreBytes: 536_870_912,
    scratchMaxOperations: 4_096, scratchMaxPendingOperations: 64, scratchMaxFiles: 64,
    scratchMaxFileBytes: 1_048_576, scratchMaxTotalBytes: 8_388_608,
  };
  for (const [key, limit] of Object.entries(ceilings) as [keyof ResolvedWorkflowPackageConfig, number][]) {
    if ((result[key] as number) > limit) throw new RangeError(`${key} must not exceed ${limit}`);
  }
  if (result.defaultAgentBudget > result.maxAgentBudget || result.maxAgentBudget > 1_024) throw new RangeError('agent budget limits are inconsistent');
  if (result.memberOutcomeMaxBytes > result.maxRunDetailsBytes) throw new RangeError('memberOutcomeMaxBytes must not exceed maxRunDetailsBytes');
  if (result.maxTerminalResultBytes > result.maxRunDetailsBytes) throw new RangeError('maxTerminalResultBytes must not exceed maxRunDetailsBytes');
  if (result.maxRunDetailsBytes > result.maxRunStoreBytes) throw new RangeError('maxRunDetailsBytes must not exceed maxRunStoreBytes');
  if (result.scratchMaxFileBytes > result.scratchMaxTotalBytes) throw new RangeError('scratchMaxFileBytes must not exceed scratchMaxTotalBytes');
  if (result.artifactChunkDefaultBytes > result.artifactChunkMaxBytes) throw new RangeError('artifactChunkDefaultBytes must not exceed artifactChunkMaxBytes');
  if (result.remotePageDefault > result.remotePageMax) throw new RangeError('remotePageDefault must not exceed remotePageMax');
  if (result.bundledDefinitionsDir !== undefined && !isAbsolute(result.bundledDefinitionsDir)) throw new TypeError('bundledDefinitionsDir must be an absolute path');
  return Object.freeze({ ...result, ...(result.bundledDefinitionsDir === undefined ? {} : { bundledDefinitionsDir: normalize(result.bundledDefinitionsDir) }) });
}
