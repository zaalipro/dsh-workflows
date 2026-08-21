/** Public saved-definition vocabulary. */
import type { WorkflowMeta, WorkflowPhase } from '@deepseek-ai/dsh-workflow';

export type { WorkflowMeta, WorkflowPhase } from '@deepseek-ai/dsh-workflow';
export type WorkflowScope = 'bundled' | 'project' | 'user';
export type WorkflowSaveScope = Exclude<WorkflowScope, 'bundled'>;
export const WORKFLOW_SCOPE_PRECEDENCE = Object.freeze(['bundled', 'project', 'user'] as const satisfies readonly WorkflowScope[]);
export interface WorkflowDefinitionEnvelope { readonly meta: WorkflowMeta; readonly script: string }
export interface WorkflowDefinitionSummaryView { readonly name: string; readonly description: string; readonly whenToUse?: string; readonly scope: WorkflowScope }
export interface WorkflowDefinitionSummary extends WorkflowDefinitionSummaryView { readonly phases?: readonly WorkflowPhase[]; readonly path: string }
export interface WorkflowDefinition extends WorkflowDefinitionSummary { readonly script: string }
export interface WorkflowLookupOptions { readonly cwd?: string; readonly signal?: AbortSignal }
export interface WorkflowSaveOptions extends WorkflowLookupOptions { readonly scope: WorkflowSaveScope }
export interface WorkflowCatalogSnapshot { readonly definitions: readonly WorkflowDefinitionSummary[]; readonly complete: boolean; readonly revision?: number }
export type WorkflowDefinitionCursor = string & { readonly __brand: 'WorkflowDefinitionCursor' };
export interface WorkflowDefinitionListRequest { readonly cursor?: WorkflowDefinitionCursor; readonly limit?: number }
export interface WorkflowDefinitionListPage { readonly items: readonly WorkflowDefinitionSummaryView[]; readonly nextCursor?: WorkflowDefinitionCursor; readonly total: number; readonly revision: number }
export interface RegistryConfig {
  readonly enabled?: boolean
  readonly dshHome?: string
  readonly bundledDefinitionsDir?: string
  readonly definitionWatch?: boolean
  readonly definitionMaxBytes?: number
  readonly maxDefinitionsPerRoot?: number
  readonly watchMaxProjects?: number
  readonly watchUsePolling?: boolean
  readonly watchStabilityThresholdMs?: number
  readonly watchPollIntervalMs?: number
  readonly watchFactory?: import('./watchers.js').ChokidarFactory
  readonly watchScheduler?: import('./watchers.js').WorkflowWatcherScheduler
}
