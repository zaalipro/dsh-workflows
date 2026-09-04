import {
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'
import type { ChatConversationViewNode } from '@deepseek-ai/dsh-client-ui-chat/client'
import type {
  WorkflowRunChatData,
  WorkflowRunMemberData,
  WorkflowRunPhaseData,
  WorkflowRunStatus,
} from './workflow-definition.js'
import { workflowChatLabelsFromLocale, workflowLocales } from './locales.js'
import css from './WorkflowRunPanel.module.css'

export interface WorkflowRunPanelProps {
  readonly node: ChatConversationViewNode & {
    readonly kind: 'workflow-run'
    readonly data: WorkflowRunChatData
  }
  readonly sessionId: string
  readonly resolveAndOpenChild: (childId: string) => Promise<boolean>
  /** Optional synchronous catalog proof supplied by the owning Client plugin. */
  readonly isChildAvailable?: (childId: string) => boolean
  readonly labels?: Partial<WorkflowRunPanelLabels>
}

export interface WorkflowRunPanelLabels {
  readonly noMembers: string
  readonly unphased: string
  readonly emptyPhase: string
  readonly emptyMember: string
  readonly childUnavailable: string
  readonly childFailed: string
  readonly inspect: (count: number) => string
  readonly status: Readonly<Record<WorkflowRunStatus, string>>
  readonly statusCount: (status: WorkflowRunStatus, count: number) => string
  readonly openMember: (label: string) => string
}

const DEFAULT_LABELS: WorkflowRunPanelLabels = workflowChatLabelsFromLocale(workflowLocales.en)

export type DisclosureMode = 'clean' | 'running' | 'abnormal'

export interface DisclosureFacts {
  readonly mode: DisclosureMode
  readonly count: number
}

export interface DisclosureChoice {
  readonly open: boolean
  readonly mode: DisclosureMode
  readonly count: number
}

function abnormal(status: WorkflowRunStatus): boolean {
  return status === 'failed' || status === 'cancelled' || status === 'interrupted'
}

function factsForPhase(phase: WorkflowRunPhaseData): DisclosureFacts {
  const mode = phase.members.some(member => abnormal(member.status))
    ? 'abnormal'
    : phase.members.some(member => member.status === 'running') ? 'running' : 'clean'
  return { mode, count: phase.members.length }
}

function factsForRun(data: WorkflowRunChatData): DisclosureFacts {
  const phases = data.phases.map(factsForPhase)
  const mode = abnormal(data.status) || phases.some(phase => phase.mode === 'abnormal')
    ? 'abnormal'
    : data.status === 'running' || phases.some(phase => phase.mode === 'running')
      ? 'running'
      : 'clean'
  return { mode, count: phases.reduce((total, phase) => total + phase.count, 0) }
}

export function initialWorkflowDisclosure(facts: DisclosureFacts): DisclosureChoice {
  return { ...facts, open: facts.mode !== 'clean' }
}

/** Force abnormal/running open; auto-fold a clean completion once. */
export function advanceWorkflowDisclosure(current: DisclosureChoice, facts: DisclosureFacts): DisclosureChoice {
  if (facts.mode !== 'clean') return { ...facts, open: true }
  if (current.mode !== 'clean') return { ...facts, open: false }
  if (current.count !== facts.count) return { ...facts, open: false }
  return { ...facts, open: current.open }
}

function phaseName(phase: string | null, labels: WorkflowRunPanelLabels): string {
  if (phase === null) return labels.unphased
  return phase === '' ? labels.emptyPhase : phase
}

function memberName(label: string, labels: WorkflowRunPanelLabels): string {
  return label === '' ? labels.emptyMember : label
}

function statusSummary(members: readonly WorkflowRunMemberData[], labels: WorkflowRunPanelLabels): string {
  const counts = new Map<WorkflowRunStatus, number>()
  for (const member of members) counts.set(member.status, (counts.get(member.status) ?? 0) + 1)
  const order: readonly WorkflowRunStatus[] = ['completed', 'running', 'failed', 'cancelled', 'interrupted']
  return order
    .filter(status => (counts.get(status) ?? 0) > 0)
    .map(status => labels.statusCount(status, counts.get(status) ?? 0))
    .join(' · ')
}

function StatusDot({ status }: { readonly status: WorkflowRunStatus }) {
  return <span className={css.stateDot} data-status={status} aria-hidden="true" />
}

function DisclosureHeader({
  clean,
  open,
  onToggle,
  className,
  children,
}: {
  readonly clean: boolean
  readonly open: boolean
  readonly onToggle: () => void
  readonly className: string
  readonly children: ReactNode
}) {
  if (!clean) {
    return (
      <div className={className} data-forced-open="true">
        <span className={css.chevron} aria-hidden="true">›</span>
        {children}
      </div>
    )
  }
  return (
    <button
      type="button"
      className={className}
      aria-expanded={open}
      onClick={onToggle}
    >
      <span className={css.chevron} data-open={open ? 'true' : 'false'} aria-hidden="true">›</span>
      {children}
    </button>
  )
}

function MemberRow({
  member,
  labels,
  isChildAvailable,
  onOpen,
}: {
  readonly member: WorkflowRunMemberData
  readonly labels: WorkflowRunPanelLabels
  readonly isChildAvailable: (childId: string) => boolean
  readonly onOpen: (member: WorkflowRunMemberData) => void
}) {
  const label = memberName(member.label, labels)
  const available = isChildAvailable(member.childId)
  const content = (
    <>
      <StatusDot status={member.status} />
      <span className={css.memberLabel}>{label}</span>
      <span className={css.memberStatus}>{labels.status[member.status]}</span>
    </>
  )
  if (!available) return <div className={css.memberRow} data-member-status={member.status}>{content}</div>
  return (
    <button
      type="button"
      className={css.memberButton}
      data-member-status={member.status}
      aria-label={labels.openMember(label)}
      onClick={() => { onOpen(member) }}
    >
      {content}
    </button>
  )
}

function PhaseSection({
  phase,
  choice,
  labels,
  isChildAvailable,
  onToggle,
  onOpen,
}: {
  readonly phase: WorkflowRunPhaseData
  readonly choice: DisclosureChoice
  readonly labels: WorkflowRunPanelLabels
  readonly isChildAvailable: (childId: string) => boolean
  readonly onToggle: () => void
  readonly onOpen: (member: WorkflowRunMemberData) => void
}) {
  const clean = choice.mode === 'clean'
  const open = clean ? choice.open : true
  return (
    <section className={css.phase} aria-label={phaseName(phase.phase, labels)}>
      <DisclosureHeader
        clean={clean}
        open={open}
        onToggle={onToggle}
        className={css.phaseHeader}
      >
        <span className={css.phaseTitle}>{phaseName(phase.phase, labels)}</span>
        <span className={css.phaseCount}>{labels.inspect(phase.members.length)}</span>
        <span className={css.phaseStatus}>{statusSummary(phase.members, labels)}</span>
      </DisclosureHeader>
      {open && (
        <div className={css.members}>
          {phase.members.map(member => (
            <MemberRow
              key={member.seq}
              member={member}
              labels={labels}
              isChildAvailable={isChildAvailable}
              onOpen={onOpen}
            />
          ))}
        </div>
      )}
    </section>
  )
}

/** Render one durable workflow run without exposing logical run or child ids. */
export function WorkflowRunPanel({
  node,
  resolveAndOpenChild,
  isChildAvailable = () => false,
  labels: labelOverrides,
}: WorkflowRunPanelProps): ReactElement {
  const labels: WorkflowRunPanelLabels = {
    ...DEFAULT_LABELS,
    ...labelOverrides,
    status: { ...DEFAULT_LABELS.status, ...labelOverrides?.status },
  }
  const runFacts = factsForRun(node.data)
  const [runChoice, setRunChoice] = useState(() => initialWorkflowDisclosure(runFacts))
  const [phaseChoices, setPhaseChoices] = useState<ReadonlyMap<string, DisclosureChoice>>(
    () => new Map(node.data.phases.map(phase => [phase.key, initialWorkflowDisclosure(factsForPhase(phase))])),
  )
  const [navigationFeedback, setNavigationFeedback] = useState<string>()
  const navigationGeneration = useRef(0)

  useEffect(() => {
    setRunChoice(current => advanceWorkflowDisclosure(current, runFacts))
    setPhaseChoices((current) => {
      const next = new Map<string, DisclosureChoice>()
      for (const phase of node.data.phases) {
        const facts = factsForPhase(phase)
        next.set(phase.key, current.has(phase.key)
          ? advanceWorkflowDisclosure(current.get(phase.key) as DisclosureChoice, facts)
          : initialWorkflowDisclosure(facts))
      }
      return next
    })
  }, [node.data, runFacts.count, runFacts.mode])

  useEffect(() => () => { navigationGeneration.current += 1 }, [])

  const runOpen = runChoice.mode === 'clean' ? runChoice.open : true
  const openMember = (member: WorkflowRunMemberData): void => {
    const generation = ++navigationGeneration.current
    setNavigationFeedback(undefined)
    void resolveAndOpenChild(member.childId).then(
      opened => {
        if (generation === navigationGeneration.current && !opened) {
          setNavigationFeedback(labels.childUnavailable)
        }
      },
      () => {
        if (generation === navigationGeneration.current) setNavigationFeedback(labels.childFailed)
      },
    )
  }

  return (
    <section className={css.root} data-workflow-run data-run-status={node.data.status}>
      <DisclosureHeader
        clean={runChoice.mode === 'clean'}
        open={runOpen}
        onToggle={() => { setRunChoice(current => ({ ...current, open: !current.open })) }}
        className={css.runHeader}
      >
        <span className={css.runName}>{node.data.name}</span>
        <span className={css.runCount}>{labels.inspect(runFacts.count)}</span>
        <span className={css.runStatus}>
          <StatusDot status={node.data.status} />
          {labels.status[node.data.status]}
        </span>
      </DisclosureHeader>
      {runOpen && (
        <div className={css.phaseList}>
          {node.data.phases.length === 0
            ? <p className={css.empty}>{labels.noMembers}</p>
            : node.data.phases.map((phase) => {
                const choice = phaseChoices.get(phase.key) ?? initialWorkflowDisclosure(factsForPhase(phase))
                return (
                  <PhaseSection
                    key={`${phase.key}:${choice.mode === 'clean' ? choice.count : 'active'}`}
                    phase={phase}
                    choice={choice}
                    labels={labels}
                    isChildAvailable={isChildAvailable}
                    onToggle={() => {
                      setPhaseChoices((current) => {
                        const next = new Map(current)
                        next.set(phase.key, { ...choice, open: !choice.open })
                        return next
                      })
                    }}
                    onOpen={openMember}
                  />
                )
              })}
        </div>
      )}
      {navigationFeedback !== undefined && (
        <p className={css.navigationFeedback} role="status">{navigationFeedback}</p>
      )}
    </section>
  )
}

export default WorkflowRunPanel
