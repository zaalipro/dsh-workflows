/** Local extensions deliberately absent from the official 0.1.1-rc.2 seam. */
import { WorkflowError as StockWorkflowError } from '@deepseek-ai/dsh-workflow'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { WorkflowMeta } from '@deepseek-ai/dsh-workflow'
import type { WorkflowJournalEntry, WorkflowScratchPort } from './types.ts'

export type CompatWorkflowErrorCode =
  | ConstructorParameters<typeof StockWorkflowError>[1]
  | 'JOURNAL_DIVERGENCE'

export const WorkflowError = StockWorkflowError as unknown as {
  new(message: string, code: CompatWorkflowErrorCode, options?: ErrorOptions & { fatal?: boolean }): StockWorkflowError
}
export type WorkflowError = StockWorkflowError

export type WorkflowGateKind = 'user' | 'back_off' | 'no_progress' | 'verification' | 'infra'
export interface WorkflowGateInfo { readonly kind: WorkflowGateKind; readonly message: string; readonly resumable: boolean }
export interface WorkflowResult {
  readonly value: unknown
  readonly stopReason: 'completed' | 'cancelled' | 'error'
  readonly error?: string
  readonly errorCode?: string
  readonly agentsStarted: number
}
export interface WorkflowStartRequest {
  readonly script: string
  readonly meta: WorkflowMeta
  readonly args?: unknown
  readonly subagentProvider?: string
  readonly maxTotalAgents?: number
  readonly initialAgentSpend?: number
  readonly initialAgentSeq?: number
  readonly journal?: readonly WorkflowJournalEntry[]
  readonly scratchDir?: string
  readonly scratch?: WorkflowScratchPort
  readonly validateOnly?: boolean
  readonly deferStart?: boolean
  readonly replay?: { readonly checkpoint?: { readonly journal: readonly WorkflowJournalEntry[]; readonly agentSpend: number; readonly agentSeq: number } }
  readonly parent: Agent
  readonly signal?: AbortSignal
}
