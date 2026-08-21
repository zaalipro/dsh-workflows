import type {
  ChatConversationViewNode,
  ConversationLocation,
  ConversationNodeContext,
  ConversationNodeDefinition,
} from '@deepseek-ai/dsh-client-runtime/client'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'

/** Status shown for a workflow, phase, or member in the durable Chat row. */
export type WorkflowRunStatus = 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted'

/** One member that actually emitted an official agent-start event. */
export interface WorkflowRunMemberData {
  readonly seq: number
  readonly label: string
  readonly childId: string
  readonly status: WorkflowRunStatus
}

/** One exact phase identity. `null` is omitted; `''` is an empty phase name. */
export interface WorkflowRunPhaseData {
  readonly key: string
  readonly phase: string | null
  readonly members: readonly WorkflowRunMemberData[]
}

/** Durable, human-renderable payload for one workflow-run Chat node. */
export interface WorkflowRunChatData {
  readonly name: string
  readonly status: WorkflowRunStatus
  readonly phases: readonly WorkflowRunPhaseData[]
}

declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  interface ChatNodeDataMap {
    'workflow-run': WorkflowRunChatData
  }
}

/** Internal fold state for one member; exported so declaration emit is stable. */
export interface WorkflowMemberState {
  readonly seq: number
  readonly label: string
  readonly phase?: string
  readonly childId: string
  readonly outcome?: string
}

/** Internal fold state retained by the official conversation projection. */
export interface WorkflowState {
  readonly name: string
  readonly stopReason?: string
  readonly members: readonly WorkflowMemberState[]
}

interface WorkflowEvent {
  readonly type: string
  readonly data: Record<string, unknown>
}

/**
 * Build a stable phase key without conflating an omitted field and `''`.
 * @param phase - exact phase text, or null when the field was omitted.
 * @returns a collision-free renderer key.
 */
export function workflowPhaseKey(phase: string | null): string {
  return phase === null ? 'missing' : `value:${phase.length}:${phase}`
}

function eventOf(event: SessionEvent): WorkflowEvent {
  return event as unknown as WorkflowEvent
}

function statusFromStopReason(stopReason: string): WorkflowRunStatus {
  switch (stopReason) {
    case 'completed': return 'completed'
    case 'cancelled':
    case 'interrupted': return 'cancelled'
    case 'error':
    case 'failed': return 'failed'
    default: return 'failed'
  }
}

function statusFromOutcome(outcome: string): WorkflowRunStatus {
  switch (outcome) {
    case 'completed': return 'completed'
    case 'cancelled':
    case 'interrupted': return 'cancelled'
    case 'error':
    case 'failed': return 'failed'
    default: return 'failed'
  }
}

function projectWorkflow(
  context: ConversationNodeContext<WorkflowState>,
  _location: ConversationLocation,
): WorkflowRunChatData {
  const state = context.state as WorkflowState
  const phases = new Map<string, { phase: string | null; members: WorkflowRunMemberData[] }>()

  for (const member of state.members) {
    const phase = member.phase === undefined ? null : member.phase
    const key = workflowPhaseKey(phase)
    let group = phases.get(key)
    if (group === undefined) {
      group = { phase, members: [] }
      phases.set(key, group)
    }
    group.members.push({
      seq: member.seq,
      label: member.label,
      childId: member.childId,
      status: member.outcome === undefined
        ? 'running'
        : statusFromOutcome(member.outcome),
    })
  }

  return {
    name: state.name,
    status: state.stopReason === undefined ? 'running' : statusFromStopReason(state.stopReason),
    phases: [...phases].map(([key, phase]) => ({
      key,
      phase: phase.phase,
      members: phase.members,
    })),
  }
}

function updateAgentStart(state: WorkflowState, data: Record<string, unknown>): WorkflowState {
  const seq = Number(data.seq)
  if (!Number.isSafeInteger(seq) || seq < 1 || state.members.some(member => member.seq === seq)) return state
  const member: WorkflowMemberState = {
    seq,
    label: String(data.label ?? ''),
    childId: String(data.childId ?? data.childSessionId ?? ''),
    ...(data.phase === undefined ? {} : { phase: String(data.phase) }),
  }
  return { ...state, members: [...state.members, member] }
}

function updateAgentEnd(state: WorkflowState, data: Record<string, unknown>): WorkflowState {
  const seq = Number(data.seq)
  return {
    ...state,
    members: state.members.map(member => member.seq === seq
      ? { ...member, outcome: String(data.outcome ?? 'error') }
      : member),
  }
}

/** Fold only the four official durable workflow events into one keyed Chat node. */
export const workflowRunDefinition: ConversationNodeDefinition<WorkflowState> = {
  kind: 'workflow-run',
  target: 'chat',
  match: (rawEvent) => {
    const event = eventOf(rawEvent)
    if (event.type === 'tool-workflow/run-start') {
      return { id: String(event.data.runId), role: 'start' }
    }
    if (event.type === 'tool-workflow/agent-start'
      || event.type === 'tool-workflow/agent-end'
      || event.type === 'tool-workflow/run-end') {
      return { id: String(event.data.runId), role: 'update' }
    }
    return null
  },
  start: (_context, match) => {
    const event = eventOf(match.event)
    if (event.type !== 'tool-workflow/run-start') {
      throw new Error('workflow-run start requires tool-workflow/run-start')
    }
    return { name: String(event.data.name ?? ''), members: [] }
  },
  update: (context, match) => {
    const event = eventOf(match.event)
    if (event.type === 'tool-workflow/agent-start') return updateAgentStart(context.state, event.data)
    if (event.type === 'tool-workflow/agent-end') return updateAgentEnd(context.state, event.data)
    if (event.type === 'tool-workflow/run-end') {
      return { ...context.state, stopReason: String(event.data.stopReason ?? 'error') }
    }
    return context.state
  },
  buildViewNode: (context): ChatConversationViewNode | null => {
    if (context.start === undefined || context.state === undefined) return null
    const data = projectWorkflow(context, context.start.location)
    return {
      key: context.key,
      kind: 'workflow-run',
      id: context.id,
      target: 'chat',
      anchorSeq: context.start.event.seq,
      location: context.start.location,
      visibility: 'visible',
      data,
    }
  },
}

/** Backward-compatible public name used by some Chat registration faces. */
export const workflowMessageDefinition = workflowRunDefinition
