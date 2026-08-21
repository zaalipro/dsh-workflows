import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'
import clsx from 'clsx'
import type {
  ClientRunHead,
  ClientRunStatus,
  WorkflowRunAction,
  WorkflowRunArtifactChunk,
  WorkflowRunArtifactPage,
  WorkflowRunDetail,
  WorkflowRunLogPage,
  WorkflowRunMemberDetail,
  WorkflowRunMemberHead,
  WorkflowRunMemberPage,
  WorkflowRunResultView,
  WorkflowRunsOperations,
  WorkflowRunsSourceSnapshot,
} from './contract.js'
import { WorkflowRunsRemoteError } from './contract.js'
import type { DashboardWorkflowRunsAdapter } from './adapter.js'
import type { WorkflowRunsController } from './controller.js'
import { WorkflowMemberInspector } from './WorkflowMemberInspector.js'
import {
  dashboardLabelsFromLocale,
  INTERRUPTED_SETTLEMENT,
  workflowLocales,
  type DashboardLabels,
} from './locales.js'
import type { WorkflowsState, WorkflowsStoreInstance } from './store.js'
import css from './WorkflowsDashboard.module.css'

const TERMINAL = new Set<ClientRunStatus>(['completed', 'failed', 'cancelled', 'interrupted'])
const ACTION_ORDER: readonly WorkflowRunAction[] = ['pause', 'resume', 'stop', 'save']
const SHORTCUTS: Readonly<Record<string, WorkflowRunAction>> = {
  p: 'pause', r: 'resume', x: 'stop', s: 'save',
}

export const GENERIC_LOAD_ERROR = 'Unable to load workflow data. Retry.'
export const GENERIC_CONTROL_ERROR = 'Unable to update workflow. Retry.'
export const STALE_CONTROL_ERROR = 'workflow run changed; refresh it before applying a control'

type DashboardOperations = WorkflowRunsOperations & Partial<{
  get(sessionId: string): WorkflowRunsSourceSnapshot
  subscribe(sessionId: string, listener: (snapshot: WorkflowRunsSourceSnapshot) => void): () => void
}>

/** Business dependencies supplied by the browser plugin slot. */
export interface WorkflowsDashboardInjected {
  readonly operations: WorkflowRunsOperations
  readonly labels?: DashboardLabels
}

export interface WorkflowsDashboardProps {
  /** Bounded reads and controls. */
  readonly operations?: DashboardOperations
  /** Compatibility name retained for the package's first preview. */
  readonly controller?: WorkflowRunsController | DashboardWorkflowRunsAdapter
  /** Slot-owned observable value. Omit when `operations.subscribe` is present. */
  readonly source?: WorkflowRunsSourceSnapshot
  readonly sessionId?: string
  readonly open?: boolean
  readonly invoker?: HTMLElement | null
  readonly onClose?: () => void
  /** Interaction store snapshot. When present, selection and mobile view are store-owned. */
  readonly store?: WorkflowsState
  readonly storeActions?: WorkflowsStoreInstance['actions']
  readonly labels?: DashboardLabels
}

type Tab = 'members' | 'logs' | 'result' | 'artifacts'
type MobileView = 'runs' | 'execution' | 'inspector'
type Phase = 'idle' | 'loading' | 'ready' | 'error'

interface LoadState<T> {
  readonly phase: Phase
  readonly value?: T
  readonly error?: string
  readonly paging?: boolean
  readonly pageError?: string
}

interface ControlFeedback {
  readonly kind: 'notice' | 'error'
  readonly message: string
  readonly retryAction?: WorkflowRunAction
}

function emptySource(sessionId = ''): WorkflowRunsSourceSnapshot {
  return {
    sessionId,
    phase: 'idle',
    status: 'idle',
    runs: [],
    total: 0,
    sessionRevision: 0,
    revision: 0,
  }
}

function isActive(status: ClientRunStatus): boolean { return !TERMINAL.has(status) }

function statusLabel(status: ClientRunStatus, labels: DashboardLabels): string {
  return labels.status[status]
}

function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1_000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

/** Stable active-oldest/history-newest ordering required by the dashboard. */
export function orderWorkflowRuns(rows: readonly ClientRunHead[]): ClientRunHead[] {
  return [...rows].sort((left, right) => {
    const leftActive = isActive(left.status)
    const rightActive = isActive(right.status)
    if (leftActive !== rightActive) return leftActive ? -1 : 1
    if (leftActive) return left.startedAt - right.startedAt || left.displayName.localeCompare(right.displayName)
    const leftEnd = left.settledAt ?? left.startedAt
    const rightEnd = right.settledAt ?? right.startedAt
    return rightEnd - leftEnd || right.startedAt - left.startedAt
  })
}

function isAbort(error: unknown): boolean {
  return (error instanceof Error && error.name === 'AbortError')
    || (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError')
}

function pageError(error: unknown): string {
  if (error instanceof WorkflowRunsRemoteError && [
    'invalid-page-limit', 'invalid-artifact-limit', 'invalid-cursor', 'stale-cursor',
  ].includes(error.code)) return error.message
  return GENERIC_LOAD_ERROR
}

function utf8Bytes(value: string): number { return new TextEncoder().encode(value).byteLength }

function settledMembers(run: ClientRunHead): number {
  return run.memberCounts.completed + run.memberCounts.failed + run.memberCounts.cancelled
}

function memberSummary(run: ClientRunHead, labels: DashboardLabels): string {
  return labels.agentsCompact(settledMembers(run), run.memberCounts.total)
}

function budgetSummary(run: ClientRunHead): string {
  return `${run.budget.spent}/${run.budget.total} agents`
}

function terminalResult(run: ClientRunHead): string {
  if (run.terminal === undefined) return 'Result pending'
  if (run.terminal.preview !== undefined) return `Result: ${run.terminal.preview}`
  switch (run.terminal.resultState) {
    case 'available': return 'Result retained'
    case 'not-produced': return 'No result produced'
    case 'evicted': return 'Result evicted'
  }
}

function groupMembers(members: readonly WorkflowRunMemberHead[]): Array<{
  readonly key: string
  readonly phase: string | undefined
  readonly members: readonly WorkflowRunMemberHead[]
}> {
  const groups = new Map<string, { phase: string | undefined; members: WorkflowRunMemberHead[] }>()
  for (const member of members) {
    const key = member.phase === undefined ? 'missing' : `value:${member.phase.length}:${member.phase}`
    const group = groups.get(key)
    if (group === undefined) groups.set(key, { phase: member.phase, members: [member] })
    else group.members.push(member)
  }
  return [...groups].map(([key, group]) => ({ key, ...group }))
}

function appendItems<TPage extends { readonly items: readonly unknown[]; readonly revision: number }>(
  previous: TPage,
  next: TPage,
): TPage | undefined {
  if (previous.revision !== next.revision) return undefined
  return { ...next, items: [...previous.items, ...next.items] } as TPage
}

/**
 * Join only a same-revision chunk beginning at the exact prior UTF-8 byte end.
 * Returning undefined forces the UI to preserve the good prefix and retry.
 */
export function appendArtifactChunk(
  previous: WorkflowRunArtifactChunk,
  next: WorkflowRunArtifactChunk,
): WorkflowRunArtifactChunk | undefined {
  const expectedOffset = previous.offsetBytes + previous.returnedBytes
  if (next.revision !== previous.revision
    || next.artifact.name !== previous.artifact.name
    || next.totalBytes !== previous.totalBytes
    || next.offsetBytes !== expectedOffset) return undefined
  return {
    ...next,
    text: previous.text + next.text,
    offsetBytes: previous.offsetBytes,
    returnedBytes: previous.returnedBytes + next.returnedBytes,
  }
}

function editableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement
    && target.closest('input, textarea, select, [contenteditable="true"]') !== null
}

function focusable(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(
    'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
  )].filter(node => {
    if (node.hidden || node.closest('[inert], [aria-hidden="true"]') !== null) return false
    if (typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') return true
    for (let current: HTMLElement | null = node; current !== null && current !== root; current = current.parentElement) {
      const style = window.getComputedStyle(current)
      if (style.display === 'none' || style.visibility === 'hidden') return false
    }
    return true
  })
}

function runFromDetails(error: WorkflowRunsRemoteError): ClientRunHead | undefined {
  const candidate = error.details?.run
  if (typeof candidate !== 'object' || candidate === null) return undefined
  return candidate as unknown as ClientRunHead
}

function ErrorRetry({ message, onRetry, disabled = false }: {
  readonly message: string
  readonly onRetry: () => void
  readonly disabled?: boolean
}): ReactElement {
  return (
    <div className={css.error} role="alert">
      <p>{message}</p>
      <button type="button" disabled={disabled} onClick={onRetry}>Retry</button>
    </div>
  )
}

function ResultView({ result }: { readonly result: WorkflowRunResultView }): ReactElement {
  const outcome = result.value
  if (outcome.state === 'pending') return <section><h3>Pending result</h3><p>The workflow is still running.</p></section>
  if (outcome.state === 'not-produced') return <section><h3>No final result produced</h3><p>The workflow settled without a result.</p></section>
  if (outcome.state === 'evicted') return <section><h3>Final result evicted</h3><p>The result was removed by retention.</p></section>
  if (outcome.state !== 'available') return <section><h3>Pending result</h3><p>The workflow is still running.</p></section>
  const available = outcome as Extract<typeof outcome, { readonly state: 'available' }>
  if (available.content.kind === 'preview') {
    return (
      <section>
        <h3>Truncated final result</h3>
        <p>{utf8Bytes(available.content.text)} bytes retained of {available.totalBytes} bytes total.</p>
        <pre aria-label="Truncated final result preview">{available.content.text}</pre>
      </section>
    )
  }
  const value = available.content.value
  if (typeof value === 'string') {
    return <section><h3>Final result</h3><div>{value}</div>{result.error !== undefined && <p>{result.error}</p>}</section>
  }
  let text = '[unavailable]'
  try { text = JSON.stringify(value, null, 2) }
  catch { /* keep bounded fallback */ }
  return <section><h3>Final result</h3><pre>{text}</pre>{result.error !== undefined && <p>{result.error}</p>}</section>
}

function PaneHeading({ title, onBack, backLabel }: {
  readonly title: string
  readonly onBack: () => void
  readonly backLabel: string
}): ReactElement {
  return (
    <header className={css.inspectorHeading}>
      <button type="button" className={css.drilldownBack} onClick={onBack}>{backLabel}</button>
      <h2 tabIndex={-1}>{title}</h2>
    </header>
  )
}

/** Full-screen, lazy, revision-aware workflow dashboard. */
export function WorkflowsDashboard({
  operations: suppliedOperations,
  controller,
  source: suppliedSource,
  sessionId,
  open: openProp = true,
  invoker,
  onClose,
  store,
  storeActions,
  labels: labelOverrides,
}: WorkflowsDashboardProps): ReactElement | null {
  const candidateOperations = (suppliedOperations ?? controller) as DashboardOperations | undefined
  if (candidateOperations === undefined) throw new Error('workflow dashboard operations are unavailable')
  const operations: DashboardOperations = candidateOperations
  const labels = labelOverrides ?? dashboardLabelsFromLocale(workflowLocales.en)
  const open = store === undefined ? openProp : store.open

  const rootRef = useRef<HTMLDivElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const [source, setSource] = useState<WorkflowRunsSourceSnapshot>(() => (
    suppliedSource ?? (sessionId === undefined ? emptySource() : operations.get?.(sessionId) ?? emptySource(sessionId))
  ))
  const [localRunId, setLocalRunId] = useState<string>()
  const [localMobileView, setLocalMobileView] = useState<MobileView>('runs')
  const [localTab, setLocalTab] = useState<Tab>('members')
  const [localMemberId, setLocalMemberId] = useState<string>()
  const [localArtifact, setLocalArtifact] = useState<string>()
  const [now, setNow] = useState(() => Date.now())
  const [narrow, setNarrow] = useState(false)
  const selectedRunId = store?.selectedRunId ?? localRunId
  const mobileView = store?.mobileView ?? localMobileView
  const tab = store?.inspectorTab ?? localTab
  const selectedMemberId = store?.selectedMemberId ?? localMemberId
  const selectedArtifact = store?.selectedArtifactName ?? localArtifact

  const [detail, setDetail] = useState<LoadState<WorkflowRunDetail>>({ phase: 'idle' })
  const [members, setMembers] = useState<LoadState<WorkflowRunMemberPage>>({ phase: 'idle' })
  const [memberDetail, setMemberDetail] = useState<LoadState<WorkflowRunMemberDetail>>({ phase: 'idle' })
  const [logs, setLogs] = useState<LoadState<WorkflowRunLogPage>>({ phase: 'idle' })
  const [result, setResult] = useState<LoadState<WorkflowRunResultView>>({ phase: 'idle' })
  const [artifacts, setArtifacts] = useState<LoadState<WorkflowRunArtifactPage>>({ phase: 'idle' })
  const [artifactChunk, setArtifactChunk] = useState<LoadState<WorkflowRunArtifactChunk>>({ phase: 'idle' })
  const [pendingControl, setPendingControl] = useState<WorkflowRunAction>()
  const [controlFeedback, setControlFeedback] = useState<ControlFeedback>()
  const [runPaging, setRunPaging] = useState(false)
  const [runPageError, setRunPageError] = useState<string>()

  const readGeneration = useRef(0)
  const reads = useRef(new Set<AbortController>())
  const selectedRunRef = useRef<ClientRunHead | undefined>(undefined)
  const pendingControlRef = useRef<WorkflowRunAction | undefined>(undefined)
  const controlAbortRef = useRef<AbortController | undefined>(undefined)
  const executeControlRef = useRef<(action: WorkflowRunAction) => void>(() => undefined)
  const membersRef = useRef(members); membersRef.current = members
  const logsRef = useRef(logs); logsRef.current = logs
  const artifactsRef = useRef(artifacts); artifactsRef.current = artifacts
  const chunkRef = useRef(artifactChunk); chunkRef.current = artifactChunk

  useEffect(() => {
    if (suppliedSource !== undefined) setSource(suppliedSource)
  }, [suppliedSource])

  useEffect(() => {
    if (suppliedSource !== undefined || sessionId === undefined || operations.subscribe === undefined) return
    return operations.subscribe(sessionId, setSource)
  }, [operations, sessionId, suppliedSource])

  useEffect(() => {
    operations.observe(open ? sessionId : undefined)
    return () => { operations.observe(undefined) }
  }, [open, operations, sessionId])

  const rows = useMemo(() => orderWorkflowRuns(source.runs), [source.runs])
  const activeRows = useMemo(() => rows.filter(run => isActive(run.status)), [rows])
  const historyRows = useMemo(() => rows.filter(run => !isActive(run.status)), [rows])
  const selectedRun = (selectedRunId === undefined
    ? rows[0]
    : rows.find(run => run.runId === selectedRunId)) ?? rows[0]
  selectedRunRef.current = selectedRun
  const selectedKey = selectedRun?.runId
  const visibleRunIds = useMemo(() => rows.map(run => run.runId), [rows])

  function selectRun(runId: string): void {
    if (typeof storeActions?.selectRun === 'function') storeActions.selectRun(runId)
    else {
      setLocalRunId(runId)
      setLocalMobileView('execution')
    }
  }

  function selectMember(memberId: string): void {
    if (typeof storeActions?.selectMember === 'function') storeActions.selectMember(memberId)
    else {
      setLocalMemberId(memberId)
      setLocalTab('members')
      setLocalMobileView('inspector')
    }
  }

  function selectArtifact(name: string | undefined): void {
    if (typeof storeActions?.selectArtifact === 'function') storeActions.selectArtifact(name)
    else {
      setLocalArtifact(name)
      setLocalTab('artifacts')
      setLocalMobileView('inspector')
    }
  }

  function selectTab(next: Tab): void {
    if (typeof storeActions?.selectTab === 'function') storeActions.selectTab(next)
    else {
      setLocalTab(next)
      setLocalMobileView(next === 'members' ? 'execution' : 'inspector')
      if (next !== 'members') setLocalMemberId(undefined)
      if (next !== 'artifacts') setLocalArtifact(undefined)
    }
  }

  function showRuns(): void {
    if (typeof storeActions?.showRuns === 'function') storeActions.showRuns()
    else setLocalMobileView('runs')
  }

  function showExecution(): void {
    if (typeof storeActions?.showExecution === 'function') storeActions.showExecution()
    else setLocalMobileView('execution')
  }

  useEffect(() => {
    if (rows.length === 0) {
      if (typeof storeActions?.reconcileRun === 'function' || typeof storeActions?.showRuns === 'function') {
        if (selectedRunId !== undefined) storeActions.reconcileRun?.(undefined, [])
        if (store?.mobileView !== 'runs') storeActions.showRuns?.()
      } else if (localRunId !== undefined || localMobileView !== 'runs') {
        setLocalRunId(undefined)
        setLocalMemberId(undefined)
        setLocalArtifact(undefined)
        setLocalMobileView('runs')
      }
      return
    }
    if (selectedRunId === undefined || !rows.some(run => run.runId === selectedRunId)) {
      if (typeof storeActions?.reconcileRun === 'function') storeActions.reconcileRun(selectedRunId, visibleRunIds)
      else {
        setLocalRunId(rows[0]!.runId)
        setLocalMemberId(undefined)
        setLocalArtifact(undefined)
      }
    }
  }, [localMobileView, localRunId, rows, selectedRunId, store?.mobileView, storeActions, visibleRunIds])

  useEffect(() => {
    if (!open || activeRows.length === 0) return
    setNow(Date.now())
    if (typeof window === 'undefined') return
    const timer = window.setInterval(() => { setNow(Date.now()) }, 1_000)
    return () => { window.clearInterval(timer) }
  }, [activeRows.length, open])

  useEffect(() => {
    if (!open || typeof window === 'undefined') return
    const onResize = (): void => { setNarrow(window.innerWidth < 1_200) }
    onResize()
    window.addEventListener('resize', onResize)
    return () => { window.removeEventListener('resize', onResize) }
  }, [open])

  function beginRead(): AbortController {
    const abort = new AbortController()
    reads.current.add(abort)
    return abort
  }

  function currentRead(token: number, abort: AbortController): boolean {
    return token === readGeneration.current && !abort.signal.aborted
  }

  function endRead(abort: AbortController): void { reads.current.delete(abort) }

  function mergeRun(run: ClientRunHead): void {
    setSource(previous => {
      const index = previous.runs.findIndex(candidate => candidate.runId === run.runId)
      if (index < 0) return previous
      const current = previous.runs[index]!
      if (run.revision < current.revision) return previous
      const next = [...previous.runs]
      next[index] = run
      return { ...previous, runs: next, phase: 'ready', status: 'ready', error: undefined }
    })
  }

  function loadDetail(runId: string, token = readGeneration.current): void {
    if (sessionId === undefined) return
    const abort = beginRead()
    setDetail(previous => ({ phase: 'loading', value: previous.value }))
    void operations.detail(sessionId, runId, abort.signal).then(value => {
      if (!currentRead(token, abort)) return
      setDetail({ phase: 'ready', value })
      mergeRun(value.run)
    }, error => {
      if (currentRead(token, abort) && !isAbort(error)) {
        setDetail(previous => ({ phase: 'error', value: previous.value, error: pageError(error) }))
      }
    }).finally(() => { endRead(abort) })
  }

  function loadMembers(runId: string, cursor?: string, token = readGeneration.current): void {
    if (sessionId === undefined) return
    const previous = cursor === undefined ? undefined : membersRef.current.value
    const abort = beginRead()
    if (previous === undefined) setMembers({ phase: 'loading' })
    else setMembers({ phase: 'ready', value: previous, paging: true })
    void operations.members(sessionId, runId, cursor, abort.signal).then(page => {
      if (!currentRead(token, abort)) return
      if (previous === undefined) setMembers({ phase: 'ready', value: page })
      else {
        const joined = appendItems(previous, page)
        setMembers(joined === undefined
          ? { phase: 'ready', value: previous, pageError: GENERIC_LOAD_ERROR }
          : { phase: 'ready', value: joined })
      }
    }, error => {
      if (!currentRead(token, abort) || isAbort(error)) return
      const message = pageError(error)
      setMembers(previous === undefined
        ? { phase: 'error', error: message }
        : { phase: 'ready', value: previous, pageError: message })
    }).finally(() => { endRead(abort) })
  }

  function loadMemberDetail(runId: string, memberId: string, token = readGeneration.current): void {
    if (sessionId === undefined) return
    const abort = beginRead()
    setMemberDetail({ phase: 'loading' })
    void operations.memberDetail(sessionId, runId, memberId, abort.signal).then(value => {
      if (currentRead(token, abort)) setMemberDetail({ phase: 'ready', value })
    }, error => {
      if (currentRead(token, abort) && !isAbort(error)) setMemberDetail({ phase: 'error', error: GENERIC_LOAD_ERROR })
    }).finally(() => { endRead(abort) })
  }

  function loadLogs(runId: string, cursor?: string, token = readGeneration.current): void {
    if (sessionId === undefined) return
    const previous = cursor === undefined ? undefined : logsRef.current.value
    const abort = beginRead()
    if (previous === undefined) setLogs({ phase: 'loading' })
    else setLogs({ phase: 'ready', value: previous, paging: true })
    void operations.logs(sessionId, runId, cursor, abort.signal).then(page => {
      if (!currentRead(token, abort)) return
      if (previous === undefined) setLogs({ phase: 'ready', value: page })
      else {
        const joined = appendItems(previous, page)
        setLogs(joined === undefined
          ? { phase: 'ready', value: previous, pageError: GENERIC_LOAD_ERROR }
          : { phase: 'ready', value: joined })
      }
    }, error => {
      if (!currentRead(token, abort) || isAbort(error)) return
      const message = pageError(error)
      setLogs(previous === undefined
        ? { phase: 'error', error: message }
        : { phase: 'ready', value: previous, pageError: message })
    }).finally(() => { endRead(abort) })
  }

  function loadResult(runId: string, token = readGeneration.current): void {
    if (sessionId === undefined) return
    const abort = beginRead()
    setResult(previous => ({ phase: 'loading', value: previous.value }))
    void operations.result(sessionId, runId, abort.signal).then(value => {
      if (currentRead(token, abort)) setResult({ phase: 'ready', value })
    }, error => {
      if (currentRead(token, abort) && !isAbort(error)) {
        setResult(previous => ({ phase: 'error', value: previous.value, error: pageError(error) }))
      }
    }).finally(() => { endRead(abort) })
  }

  function loadArtifacts(runId: string, cursor?: string, token = readGeneration.current): void {
    if (sessionId === undefined) return
    const previous = cursor === undefined ? undefined : artifactsRef.current.value
    const abort = beginRead()
    if (previous === undefined) setArtifacts({ phase: 'loading' })
    else setArtifacts({ phase: 'ready', value: previous, paging: true })
    void operations.artifacts(sessionId, runId, cursor, abort.signal).then(page => {
      if (!currentRead(token, abort)) return
      if (previous === undefined) setArtifacts({ phase: 'ready', value: page })
      else {
        const joined = appendItems(previous, page)
        setArtifacts(joined === undefined
          ? { phase: 'ready', value: previous, pageError: GENERIC_LOAD_ERROR }
          : { phase: 'ready', value: joined })
      }
    }, error => {
      if (!currentRead(token, abort) || isAbort(error)) return
      const message = pageError(error)
      setArtifacts(previous === undefined
        ? { phase: 'error', error: message }
        : { phase: 'ready', value: previous, pageError: message })
    }).finally(() => { endRead(abort) })
  }

  function loadArtifact(runId: string, name: string, cursor?: string, token = readGeneration.current): void {
    if (sessionId === undefined) return
    const previous = cursor === undefined ? undefined : chunkRef.current.value
    const expectedRevision = artifactsRef.current.value?.revision
    const abort = beginRead()
    if (previous === undefined) setArtifactChunk({ phase: 'loading' })
    else setArtifactChunk({ phase: 'ready', value: previous, paging: true })
    void operations.artifact(sessionId, runId, name, cursor, expectedRevision, abort.signal).then(chunk => {
      if (!currentRead(token, abort)) return
      if (previous === undefined) {
        if (chunk.offsetBytes !== 0) setArtifactChunk({ phase: 'error', error: GENERIC_LOAD_ERROR })
        else setArtifactChunk({ phase: 'ready', value: chunk })
      } else {
        const joined = appendArtifactChunk(previous, chunk)
        setArtifactChunk(joined === undefined
          ? { phase: 'ready', value: previous, pageError: GENERIC_LOAD_ERROR }
          : { phase: 'ready', value: joined })
      }
    }, error => {
      if (!currentRead(token, abort) || isAbort(error)) return
      const message = pageError(error)
      setArtifactChunk(previous === undefined
        ? { phase: 'error', error: message }
        : { phase: 'ready', value: previous, pageError: message })
    }).finally(() => { endRead(abort) })
  }

  useEffect(() => {
    const token = ++readGeneration.current
    for (const request of reads.current) request.abort('workflow selection changed')
    reads.current.clear()
    setDetail({ phase: 'idle' })
    setMembers({ phase: 'idle' })
    setMemberDetail({ phase: 'idle' })
    setLogs({ phase: 'idle' })
    setResult({ phase: 'idle' })
    setArtifacts({ phase: 'idle' })
    setArtifactChunk({ phase: 'idle' })
    if (storeActions === undefined) {
      setLocalMemberId(undefined)
      setLocalArtifact(undefined)
      setLocalTab('members')
    }
    controlAbortRef.current?.abort('workflow selection changed')
    controlAbortRef.current = undefined
    pendingControlRef.current = undefined
    setPendingControl(undefined)
    setControlFeedback(undefined)
    if (open && selectedKey !== undefined && sessionId !== undefined) {
      loadDetail(selectedKey, token)
      loadMembers(selectedKey, undefined, token)
    }
    return () => {
      if (readGeneration.current !== token) return
      for (const request of reads.current) request.abort('workflow selection changed')
      reads.current.clear()
    }
    // Each run identity owns every subordinate cursor and selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, operations, selectedKey, sessionId])

  useEffect(() => {
    if (!open || selectedKey === undefined) return
    if (tab === 'logs' && logs.phase === 'idle') loadLogs(selectedKey)
    else if (tab === 'result' && result.phase === 'idle') loadResult(selectedKey)
    else if (tab === 'artifacts' && artifacts.phase === 'idle') loadArtifacts(selectedKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artifacts.phase, logs.phase, open, result.phase, selectedKey, tab])

  useEffect(() => {
    if (!open || selectedKey === undefined || selectedMemberId === undefined) return
    loadMemberDetail(selectedKey, selectedMemberId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selectedKey, selectedMemberId])

  useEffect(() => {
    if (!open || selectedKey === undefined || selectedArtifact === undefined) return
    setArtifactChunk({ phase: 'idle' })
    loadArtifact(selectedKey, selectedArtifact)
    // The collection revision fences every chunk for this selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selectedArtifact, selectedKey, artifacts.value?.revision])

  useEffect(() => () => {
    ++readGeneration.current
    for (const request of reads.current) request.abort('workflow dashboard disposed')
    reads.current.clear()
    controlAbortRef.current?.abort('workflow dashboard disposed')
  }, [])

  function executeControl(action: WorkflowRunAction): void {
    const run = selectedRunRef.current
    if (sessionId === undefined || run === undefined || pendingControlRef.current !== undefined) return
    if (!run.allowedActions.includes(action)) return
    const abort = new AbortController()
    controlAbortRef.current?.abort('workflow control superseded')
    controlAbortRef.current = abort
    pendingControlRef.current = action
    setPendingControl(action)
    setControlFeedback(undefined)
    void operations.control(sessionId, run.runId, action, run.revision, abort.signal).then(value => {
      if (abort.signal.aborted || controlAbortRef.current !== abort) return
      mergeRun(value.run)
      setControlFeedback({ kind: 'notice', message: `${labels[action]} requested for ${value.run.displayName}.` })
    }, error => {
      if (abort.signal.aborted || controlAbortRef.current !== abort || isAbort(error)) return
      if (error instanceof WorkflowRunsRemoteError) {
        const authoritative = runFromDetails(error)
        if (authoritative !== undefined) mergeRun(authoritative)
        if (error.code === 'revision-conflict') {
          setControlFeedback({ kind: 'error', message: STALE_CONTROL_ERROR })
          return
        }
        if (error.code === 'action-unavailable'
          && error.details?.reason === 'budget-limited'
          && action === 'resume') {
          const displayName = authoritative?.displayName ?? run.displayName
          setControlFeedback({
            kind: 'error',
            message: `workflow "${displayName}" requires a higher agent_budget to resume`,
          })
          return
        }
      }
      setControlFeedback({ kind: 'error', message: GENERIC_CONTROL_ERROR, retryAction: action })
    }).finally(() => {
      if (controlAbortRef.current !== abort) return
      controlAbortRef.current = undefined
      pendingControlRef.current = undefined
      setPendingControl(undefined)
    })
  }
  executeControlRef.current = executeControl

  function loadMoreRuns(): void {
    if (sessionId === undefined || source.nextCursor === undefined || runPaging) return
    setRunPaging(true)
    setRunPageError(undefined)
    void operations.loadMore(sessionId).then(() => {
      setRunPageError(undefined)
    }, error => {
      if (!isAbort(error)) setRunPageError(pageError(error))
    }).finally(() => { setRunPaging(false) })
  }

  useEffect(() => {
    if (!open) return
    openerRef.current = invoker ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null)
    const root = rootRef.current
    if (root === null) return
    const overlayLayer = root.closest<HTMLElement>('[data-shell-overlay]') ?? root
    const parent = overlayLayer.parentElement
    const siblings = parent === null ? [] : [...parent.children]
      .filter((node): node is HTMLElement => node instanceof HTMLElement && node !== overlayLayer)
      .map(element => ({
        element,
        inert: element.getAttribute('inert'),
        ariaHidden: element.getAttribute('aria-hidden'),
      }))
    for (const { element } of siblings) {
      element.setAttribute('inert', '')
      element.setAttribute('aria-hidden', 'true')
    }
    root.focus()
    const recoverFocus = (event: FocusEvent): void => {
      if (event.target instanceof Node && (event.target === root || root.contains(event.target))) return
      ;(focusable(root)[0] ?? root).focus()
    }
    const onKey = (event: globalThis.KeyboardEvent): void => {
      if (!(event.target instanceof Node) || (event.target !== root && !root.contains(event.target))) return
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onCloseRef.current?.()
        return
      }
      if (event.key === 'Tab') {
        const targets = focusable(root)
        if (targets.length === 0) {
          event.preventDefault()
          root.focus()
          return
        }
        const first = targets[0]
        const last = targets.at(-1)
        if (event.shiftKey && (document.activeElement === first || document.activeElement === root)) {
          event.preventDefault(); last?.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first?.focus()
        }
        return
      }
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || event.repeat || editableTarget(event.target)) return
      const action = SHORTCUTS[event.key.toLowerCase()]
      const run = selectedRunRef.current
      if (action === undefined || run === undefined || !run.allowedActions.includes(action)) return
      event.preventDefault()
      executeControlRef.current(action)
    }
    document.addEventListener('focusin', recoverFocus, true)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('focusin', recoverFocus, true)
      document.removeEventListener('keydown', onKey, true)
      for (const { element, inert, ariaHidden } of siblings) {
        if (inert === null) element.removeAttribute('inert')
        else element.setAttribute('inert', inert)
        if (ariaHidden === null) element.removeAttribute('aria-hidden')
        else element.setAttribute('aria-hidden', ariaHidden)
      }
      if (openerRef.current?.isConnected === true) openerRef.current.focus()
      openerRef.current = null
    }
  }, [invoker, open])

  useEffect(() => {
    if (!open || !narrow) return
    const root = rootRef.current
    if (root === null) return
    let target: HTMLElement | null | undefined
    if (mobileView === 'runs') {
      target = [...root.querySelectorAll<HTMLElement>('[data-workflow-run-id]')]
        .find(element => element.dataset.workflowRunId === selectedKey)
    } else if (mobileView === 'execution') {
      target = [...root.querySelectorAll<HTMLElement>('[data-workflow-member-id]')]
        .find(element => element.dataset.workflowMemberId === selectedMemberId)
        ?? [...root.querySelectorAll<HTMLElement>('[data-workflow-output-tab]')]
          .find(element => element.dataset.workflowOutputTab === tab)
        ?? root.querySelector<HTMLElement>('#workflow-run-heading')
    } else {
      target = root.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
        ?? root.querySelector<HTMLElement>('[data-pane="inspector"] h2')
    }
    target?.focus()
  }, [mobileView, narrow, open, selectedKey, selectedMemberId, tab])

  if (!open) return null

  const memberRows = members.value?.items ?? []
  const currentMember = memberRows.find(member => member.memberId === selectedMemberId)
  const execution = detail.value

  const renderPageError = (state: LoadState<unknown>, retry: () => void): ReactNode => (
    state.pageError === undefined ? null : <ErrorRetry message={state.pageError} onRetry={retry} disabled={state.paging} />
  )

  const logsPane = (): ReactElement => {
    if (logs.phase === 'loading' && logs.value === undefined) return <p role="status">Loading logs…</p>
    if (logs.phase === 'error' && logs.value === undefined) return <ErrorRetry message={logs.error ?? GENERIC_LOAD_ERROR} onRetry={() => selectedKey !== undefined && loadLogs(selectedKey)} />
    const page = logs.value
    if (page === undefined) return <p>Logs load on demand.</p>
    return (
      <div className={css.paneContents}>
        {page.items.length === 0 && page.evicted === 0 && <p>{labels.noLogLines}</p>}
        {page.items.length === 0 && page.evicted > 0 && <p>{labels.noRetainedLogLines}</p>}
        {page.evicted > 0 && page.items.length > 0 && <p>{page.evicted} earlier log lines were evicted by retention.</p>}
        {page.items.map(line => <p className={css.logLine} key={line.index}><code>{line.index}</code><span>{line.text}</span></p>)}
        <p className={css.retention}>Loaded {page.items.length} of {page.total} retained log lines.</p>
        {page.nextCursor !== undefined && <button type="button" disabled={logs.paging} onClick={() => selectedKey !== undefined && loadLogs(selectedKey, page.nextCursor)}>{logs.paging ? 'Loading…' : 'Load more logs'}</button>}
        {renderPageError(logs, () => selectedKey !== undefined && page.nextCursor !== undefined && loadLogs(selectedKey, page.nextCursor))}
      </div>
    )
  }

  const resultPane = (): ReactElement => {
    if (result.phase === 'loading' && result.value === undefined) return <p role="status">Loading final result…</p>
    if (result.phase === 'error' && result.value === undefined) return <ErrorRetry message={result.error ?? GENERIC_LOAD_ERROR} onRetry={() => selectedKey !== undefined && loadResult(selectedKey)} />
    return result.value === undefined ? <p>Final result loads on demand.</p> : (
      <div className={css.paneContents}>
        <ResultView result={result.value} />
        {result.phase === 'error' && <ErrorRetry message={result.error ?? GENERIC_LOAD_ERROR} onRetry={() => selectedKey !== undefined && loadResult(selectedKey)} />}
      </div>
    )
  }

  const artifactPane = (): ReactElement => {
    if (artifacts.phase === 'loading' && artifacts.value === undefined) return <p role="status">Loading scratch artifacts…</p>
    if (artifacts.phase === 'error' && artifacts.value === undefined) return <ErrorRetry message={artifacts.error ?? GENERIC_LOAD_ERROR} onRetry={() => selectedKey !== undefined && loadArtifacts(selectedKey)} />
    const page = artifacts.value
    if (page === undefined) return <p>Scratch artifacts load on demand.</p>
    return (
      <div className={css.paneContents}>
        {page.items.length === 0 && page.omitted === 0 && <p>No scratch artifacts were produced.</p>}
        {page.items.length === 0 && page.omitted > 0 && <p>All artifact names were omitted by retention.</p>}
        {page.omitted > 0 && page.items.length > 0 && <p>{page.omitted} artifact names were omitted by retention.</p>}
        <div className={css.artifactList}>
          {page.items.map(item => (
            <button key={item.name} type="button" aria-pressed={selectedArtifact === item.name} onClick={() => selectArtifact(item.name)}>
              <span>{item.name}</span><span>{item.bytes} bytes</span>
            </button>
          ))}
        </div>
        <p className={css.retention}>Loaded {page.items.length} of {page.total} retained artifact names.</p>
        {page.nextCursor !== undefined && <button type="button" disabled={artifacts.paging} onClick={() => selectedKey !== undefined && loadArtifacts(selectedKey, page.nextCursor)}>{artifacts.paging ? 'Loading…' : 'Load more artifacts'}</button>}
        {renderPageError(artifacts, () => selectedKey !== undefined && page.nextCursor !== undefined && loadArtifacts(selectedKey, page.nextCursor))}
        {selectedArtifact !== undefined && (
          <section className={css.artifactViewer} aria-label={`Artifact ${selectedArtifact}`}>
            <h3>{selectedArtifact}</h3>
            {artifactChunk.phase === 'loading' && artifactChunk.value === undefined && <p role="status">Loading artifact…</p>}
            {artifactChunk.phase === 'error' && artifactChunk.value === undefined && <ErrorRetry message={artifactChunk.error ?? GENERIC_LOAD_ERROR} onRetry={() => selectedKey !== undefined && loadArtifact(selectedKey, selectedArtifact)} />}
            {artifactChunk.value !== undefined && (
              <>
                <pre>{artifactChunk.value.text}</pre>
                <p className={css.retention}>{artifactChunk.value.returnedBytes} of {artifactChunk.value.totalBytes} bytes loaded.</p>
                {artifactChunk.value.nextCursor !== undefined && <button type="button" disabled={artifactChunk.paging} onClick={() => selectedKey !== undefined && loadArtifact(selectedKey, selectedArtifact, artifactChunk.value?.nextCursor)}>{artifactChunk.paging ? 'Loading…' : 'Load more artifact content'}</button>}
                {renderPageError(artifactChunk, () => selectedKey !== undefined && artifactChunk.value?.nextCursor !== undefined && loadArtifact(selectedKey, selectedArtifact, artifactChunk.value.nextCursor))}
              </>
            )}
          </section>
        )}
      </div>
    )
  }

  const inspectorPane = (): ReactElement => {
    if (tab === 'logs') return <><PaneHeading title="Logs" onBack={showExecution} backLabel={labels.backExecution} />{logsPane()}</>
    if (tab === 'result') return <><PaneHeading title="Final result" onBack={showExecution} backLabel={labels.backExecution} />{resultPane()}</>
    if (tab === 'artifacts') return <><PaneHeading title="Scratch artifacts" onBack={showExecution} backLabel={labels.backExecution} />{artifactPane()}</>
    if (selectedMemberId === undefined) {
      return <><PaneHeading title="Member outcome" onBack={showExecution} backLabel={labels.backExecution} /><p>Select a member to inspect its outcome.</p></>
    }
    return (
      <>
        <button type="button" className={css.drilldownBack} onClick={showExecution}>{labels.backExecution}</button>
        <WorkflowMemberInspector
          member={currentMember}
          detail={memberDetail.value}
          loading={memberDetail.phase === 'loading'}
          error={memberDetail.phase === 'error' ? memberDetail.error : undefined}
          onRetry={() => selectedKey !== undefined && loadMemberDetail(selectedKey, selectedMemberId)}
          labels={labels}
          onOpenChild={memberDetail.value?.childSessionId === undefined || sessionId === undefined
            ? undefined
            : () => operations.resolveAndOpenChild(sessionId, memberDetail.value!.childSessionId!)}
        />
      </>
    )
  }

  return (
    <div
      ref={rootRef}
      className={clsx(css.dashboard)}
      role="dialog"
      aria-modal="true"
      aria-labelledby="workflow-dashboard-title"
      tabIndex={-1}
      data-workflows-dashboard
      data-mobile-view={mobileView}
    >
      <header className={clsx(css.header)}>
        <div className={css.headerCopy}>
          <p className={css.eyebrow}>Background orchestration</p>
          <h1 id="workflow-dashboard-title">{labels.title}</h1>
          <p className={css.topSummary}>{activeRows.length} active · {rows.length} loaded of {source.total} runs</p>
        </div>
        <p className={css.kbdHint}>{labels.kbdHint}</p>
        <button type="button" className={css.close} onClick={() => onCloseRef.current?.()} aria-label={labels.close}>Close</button>
      </header>

      {source.phase === 'reconnecting' && rows.length > 0 && <p className={css.notice} role="status">{labels.reconnecting}</p>}
      {source.phase === 'loading' && rows.length === 0 && (
        <p className={css.notice} role="status">{labels.loading}</p>
      )}
      {source.phase === 'error' && rows.length === 0 && (
        <ErrorRetry message={GENERIC_LOAD_ERROR} onRetry={() => { if (sessionId !== undefined) void operations.refresh(sessionId).catch(() => undefined) }} />
      )}
      {source.phase === 'reconnecting' && rows.length === 0 && (
        <p className={css.notice} role="status">{labels.reconnecting}</p>
      )}
      {source.phase === 'error' && rows.length > 0 && runPageError === undefined && (
        <ErrorRetry message={GENERIC_LOAD_ERROR} onRetry={() => { if (sessionId !== undefined) void operations.refresh(sessionId).catch(() => undefined) }} />
      )}

      {rows.length === 0 && source.phase !== 'loading' && source.phase !== 'error' && source.phase !== 'reconnecting' ? (
        <main className={css.empty}>
          <h2>{labels.emptyTitle}</h2>
          <p>{labels.emptyBody}</p>
        </main>
      ) : rows.length === 0 ? null : (
        <div className={css.layout}>
          <nav className={css.navigator} aria-label="Workflow runs" data-pane="navigator">
            <section className={css.runGroup} aria-labelledby="active-workflows-heading">
              <h2 id="active-workflows-heading">Active · {activeRows.length}</h2>
              {activeRows.length === 0 && <p className={css.groupEmpty}>No active runs</p>}
              {activeRows.map(run => <RunRow key={run.runId} run={run} selected={run.runId === selectedKey} labels={labels} now={now} onSelect={() => selectRun(run.runId)} />)}
            </section>
            <section className={css.runGroup} aria-labelledby="workflow-history-heading">
              <h2 id="workflow-history-heading">History · {historyRows.length}</h2>
              {historyRows.length === 0 && <p className={css.groupEmpty}>No settled runs</p>}
              {historyRows.map(run => <RunRow key={run.runId} run={run} selected={run.runId === selectedKey} labels={labels} now={now} onSelect={() => selectRun(run.runId)} />)}
            </section>
            <footer className={css.navigatorFooter}>
              <p>{rows.length} loaded of {source.total} runs</p>
              {source.nextCursor !== undefined && <button type="button" disabled={runPaging} onClick={loadMoreRuns}>{runPaging ? 'Loading…' : 'Load more runs'}</button>}
              {runPageError !== undefined && <ErrorRetry message={runPageError} onRetry={loadMoreRuns} disabled={runPaging} />}
            </footer>
          </nav>

          <main className={css.detail} aria-live="polite" data-pane="execution">
            <button type="button" className={css.drilldownBack} onClick={showRuns}>{labels.backRuns}</button>
            {selectedRun === undefined ? <p>Select a run to inspect its progress.</p> : (
              <>
                <header className={css.executionHeader}>
                  <div>
                    <p className={css.eyebrow}>{statusLabel(selectedRun.status, labels)}</p>
                    <h2 id="workflow-run-heading" tabIndex={-1}>{selectedRun.displayName}</h2>
                    <p>{selectedRun.description}</p>
                    <p className={css.muted}>{formatDuration((selectedRun.settledAt ?? now) - selectedRun.startedAt)}</p>
                  </div>
                  <div className={css.actions} aria-label={`Controls for ${selectedRun.displayName}`}>
                    {ACTION_ORDER.filter(action => selectedRun.allowedActions.includes(action)).map(action => (
                      <button key={action} type="button" disabled={pendingControl !== undefined} onClick={() => executeControl(action)}>{labels[action]}</button>
                    ))}
                  </div>
                </header>
                {controlFeedback !== undefined && (
                  <div className={controlFeedback.kind === 'error' ? css.error : css.feedback} role={controlFeedback.kind === 'error' ? 'alert' : 'status'}>
                    <p>{controlFeedback.message}</p>
                    {controlFeedback.retryAction !== undefined && <button type="button" disabled={pendingControl !== undefined} onClick={() => executeControl(controlFeedback.retryAction!)}>Retry</button>}
                  </div>
                )}
                {selectedRun.status === 'budget-limited' && (
                  <aside className={css.callout} role="note">
                    <strong>{labels.budgetLimitTitle}</strong>
                    <span>{labels.budgetLimitBody}</span>
                  </aside>
                )}
                {selectedRun.status === 'interrupted' && (
                  <p className={css.notice} role="status">{labels.interruptedSettlement}</p>
                )}
                <dl className={css.facts}>
                  <div><dt>Status</dt><dd>{statusLabel(execution?.run.status ?? selectedRun.status, labels)}</dd></div>
                  <div><dt>Live phase</dt><dd><code>{execution?.run.phase ?? selectedRun.phase ?? labels.noPhaseYet}</code>{(execution?.run.phase ?? selectedRun.phase) === '' && <span className={css.muted}> empty string</span>}</dd></div>
                  <div><dt>Agent budget</dt><dd>{selectedRun.budget.spent}/{selectedRun.budget.total} spent · {selectedRun.budget.remaining} remaining</dd></div>
                  <div><dt>Members</dt><dd>{memberSummary(selectedRun, labels)}</dd></div>
                  <div><dt>Stop reason</dt><dd>{selectedRun.terminal?.stopReason ?? '—'}</dd></div>
                  <div><dt>Result</dt><dd>{terminalResult(selectedRun)}</dd></div>
                  {selectedRun.terminal?.error !== undefined && selectedRun.terminal.error !== INTERRUPTED_SETTLEMENT && <div><dt>Error</dt><dd>{selectedRun.terminal.error}</dd></div>}
                </dl>
                {detail.phase === 'loading' && detail.value === undefined && <p role="status">Loading run detail…</p>}
                {detail.phase === 'error' && <ErrorRetry message={detail.error ?? GENERIC_LOAD_ERROR} onRetry={() => loadDetail(selectedRun.runId)} />}
                <section aria-labelledby="declared-phases-heading">
                  <h3 id="declared-phases-heading">Declared phases</h3>
                  <ol className={css.phaseRail}>
                    {(execution?.phases ?? []).map((phase, index) => {
                      const live = execution?.run.phase ?? selectedRun.phase
                      const current = live !== undefined && phase.title === live
                      const currentIndex = live === undefined ? -1 : (execution?.phases ?? []).findIndex(item => item.title === live)
                      const reached = currentIndex >= 0 && index < currentIndex
                      return (
                        <li key={`${index}:${phase.title}`} data-current={current ? 'true' : 'false'} title={phase.title}>
                          <strong>{phase.title}</strong>
                          {phase.detail !== undefined && <span>{phase.detail}</span>}
                          {(phase.provider !== undefined || phase.model !== undefined) && <small>{[phase.provider, phase.model].filter(Boolean).join(' · ')}</small>}
                          <small>{current ? labels.livePhaseCurrent : reached ? labels.livePhaseReached : labels.livePhaseUpcoming}</small>
                        </li>
                      )
                    })}
                  </ol>
                  {execution !== undefined && (execution.phases?.length ?? 0) === 0 && <p>No declared phases.</p>}
                </section>
                {execution?.gate !== undefined && <p className={css.notice}>Waiting for input: {execution.gate.message}</p>}
                {execution?.error !== undefined && <p className={css.errorText}>Retained error: {execution.error}</p>}

                <div className={css.tabs} role="tablist" aria-label="Workflow execution details">
                  {(['members', 'logs', 'result', 'artifacts'] as const).map(value => (
                    <button key={value} type="button" role="tab" aria-selected={tab === value} data-workflow-output-tab={value} onClick={() => selectTab(value)}>{value === 'members' ? 'Members' : value === 'logs' ? 'Logs' : value === 'result' ? 'Result' : 'Artifacts'}</button>
                  ))}
                </div>

                {tab === 'members' && (
                  <section className={css.members} aria-label="Workflow members">
                    {members.phase === 'loading' && members.value === undefined && <p role="status">Loading members…</p>}
                    {members.phase === 'error' && members.value === undefined && <ErrorRetry message={members.error ?? GENERIC_LOAD_ERROR} onRetry={() => loadMembers(selectedRun.runId)} />}
                    {groupMembers(memberRows).map(group => {
                      const groupLabel = group.phase === undefined ? labels.unphased : group.phase === '' ? labels.emptyPhase : group.phase
                      return (
                      <section key={group.key} className={css.memberGroup} aria-label={groupLabel}>
                        <h3>{groupLabel}</h3>
                        {group.members.map(member => (
                          <button key={member.memberId} type="button" data-workflow-member-id={member.memberId} aria-pressed={selectedMemberId === member.memberId} onClick={() => selectMember(member.memberId)}>
                            <span>{member.label === '' ? 'Unnamed member' : member.label}</span>
                            <span>{labels.memberStatus[member.status]}</span>
                            <span>{labels.outcome[member.outcome]}</span>
                          </button>
                        ))}
                      </section>
                      )
                    })}
                    {members.value !== undefined && memberRows.length === 0 && <p>No members started.</p>}
                    {members.value !== undefined && <p className={css.retention}>Loaded {memberRows.length} of {members.value.total} members.</p>}
                    {members.value?.nextCursor !== undefined && <button type="button" disabled={members.paging} onClick={() => loadMembers(selectedRun.runId, members.value?.nextCursor)}>{members.paging ? 'Loading…' : 'Load more members'}</button>}
                    {renderPageError(members, () => members.value?.nextCursor !== undefined && loadMembers(selectedRun.runId, members.value.nextCursor))}
                  </section>
                )}
              </>
            )}
          </main>

          <aside className={css.inspector} aria-live="polite" data-pane="inspector">
            {inspectorPane()}
          </aside>
        </div>
      )}
    </div>
  )
}

function RunRow({ run, selected, onSelect, labels, now }: {
  readonly run: ClientRunHead
  readonly selected: boolean
  readonly onSelect: () => void
  readonly labels: DashboardLabels
  readonly now: number
}): ReactElement {
  const settlement = run.status === 'interrupted'
    && (run.terminal?.error === undefined || run.terminal.error === INTERRUPTED_SETTLEMENT)
    ? labels.interruptedSettlement
    : undefined
  return (
    <button
      type="button"
      className={css.runRow}
      data-selected={selected ? 'true' : 'false'}
      data-workflow-run-id={run.runId}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className={css.runTitle}><strong>{run.displayName}</strong><span>{statusLabel(run.status, labels)}</span></span>
      <span>{run.description}</span>
      <span>Phase: <code>{run.phase ?? labels.noPhaseYet}</code>{run.phase === '' && ' (empty string)'}</span>
      <span>{budgetSummary(run)} · {memberSummary(run, labels)}</span>
      <span>{formatDuration((run.settledAt ?? now) - run.startedAt)}</span>
      <span>{terminalResult(run)}</span>
      {run.terminal?.error !== undefined && run.terminal.error !== INTERRUPTED_SETTLEMENT && <span>Error: {run.terminal.error}</span>}
      {settlement !== undefined && <span>{settlement}</span>}
      <span>Stop reason: {run.terminal?.stopReason ?? '—'}</span>
    </button>
  )
}

export default WorkflowsDashboard
