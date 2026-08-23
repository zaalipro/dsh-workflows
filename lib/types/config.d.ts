import type Schema from '@deepseek-ai/schemastery';
/** Operator-facing workflow-package configuration. Every field is optional before resolution. */
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
    readonly saveScope?: 'project' | 'user';
}
/** Fully defaulted, path-normalized configuration consumed by runtime components. */
export interface ResolvedWorkflowPackageConfig extends Required<Omit<Config, 'bundledDefinitionsDir'>> {
    readonly bundledDefinitionsDir?: string;
}
/** Schemastery contribution used by Cordis Loader. Cross-field rules are enforced by the resolver. */
export declare const Config: Schema<Config>;
/**
 * Resolve all defaults and cross-field relationships without touching the filesystem.
 * @param input - Optional operator overrides; the object is never mutated.
 * @param dshHome - Absolute fallback DSH home supplied by package composition.
 * @returns A frozen, fully defaulted configuration with normalized paths.
 */
export declare function resolveWorkflowPackageConfig(input: Config, dshHome: string): ResolvedWorkflowPackageConfig;
//# sourceMappingURL=config.d.ts.map