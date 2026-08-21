import { useEffect, useState, type ReactElement, type ReactNode } from 'react'
import type { WorkflowRunMemberDetail, WorkflowRunMemberHead, WorkflowRunValueView } from './contract.js'
import { dashboardLabelsFromLocale, workflowLocales, type DashboardLabels } from './locales.js'
import css from './WorkflowMemberInspector.module.css'

export interface WorkflowMemberInspectorProps {
  /** A member head is accepted for loading/empty states. */
  readonly member?: WorkflowRunMemberHead
  /** Either the complete Remote value or a wrapper containing `outcome`. */
  readonly detail?: WorkflowRunMemberDetail | { readonly outcome?: WorkflowRunValueView; readonly childSessionId?: string }
  readonly outcome?: WorkflowRunValueView
  readonly loading?: boolean
  readonly error?: unknown
  readonly onRetry?: () => void
  readonly onClose?: () => void
  /** Optional child navigation callback. It must already perform catalog proof. */
  readonly onOpenChild?: () => Promise<boolean> | boolean
  readonly labels?: DashboardLabels
}

function json(value: unknown): string {
  try { return JSON.stringify(value, null, 2) } catch { return '[unavailable]' }
}

function availableHeading(value: unknown): 'Text outcome' | 'JSON outcome' | 'Value outcome' {
  if (typeof value === 'string') return 'Text outcome'
  // JSON null is a value, not the absence of an outcome.
  if (value === null || typeof value === 'object') return 'JSON outcome'
  return 'Value outcome'
}

function retainedBytes(text: string): number {
  return new TextEncoder().encode(text).byteLength
}

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const pattern = /(\*\*[^*]+?\*\*|`[^`]+?`|\*[^*]+?\*)/gu
  let last = 0
  let match: RegExpExecArray | null
  let index = 0
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index))
    const token = match[0]!
    if (token.startsWith('**')) nodes.push(<strong key={`b${index}`}>{token.slice(2, -2)}</strong>)
    else if (token.startsWith('`')) nodes.push(<code key={`c${index}`}>{token.slice(1, -1)}</code>)
    else nodes.push(<em key={`i${index}`}>{token.slice(1, -1)}</em>)
    last = match.index + token.length
    index += 1
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

/** Bounded Markdown/plain-text renderer. Strings must not be JSON.stringified. */
export function MarkdownText({ text }: { readonly text: string }): ReactElement {
  const lines = text.replace(/\r\n/gu, '\n').split('\n')
  const blocks: ReactElement[] = []
  let paragraph: string[] = []
  let listItems: ReactElement[] = []
  const flushParagraph = (): void => {
    if (paragraph.length === 0) return
    blocks.push(<p key={`p${blocks.length}`}>{renderInline(paragraph.join('\n'))}</p>)
    paragraph = []
  }
  const flushList = (): void => {
    if (listItems.length === 0) return
    blocks.push(<ul key={`ul${blocks.length}`}>{listItems}</ul>)
    listItems = []
  }
  for (const line of lines) {
    if (line.startsWith('### ')) {
      flushParagraph(); flushList()
      blocks.push(<h6 key={`h${blocks.length}`}>{renderInline(line.slice(4))}</h6>)
    } else if (line.startsWith('## ')) {
      flushParagraph(); flushList()
      blocks.push(<h5 key={`h${blocks.length}`}>{renderInline(line.slice(3))}</h5>)
    } else if (line.startsWith('# ')) {
      flushParagraph(); flushList()
      blocks.push(<h4 key={`h${blocks.length}`}>{renderInline(line.slice(2))}</h4>)
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      flushParagraph()
      listItems.push(<li key={`li${listItems.length}`}>{renderInline(line.slice(2))}</li>)
    } else if (line === '') {
      flushParagraph(); flushList()
    } else {
      flushList()
      paragraph.push(line)
    }
  }
  flushParagraph()
  flushList()
  if (blocks.length === 0) return <p className={css.markdown}>{text}</p>
  return <div className={css.markdown}>{blocks}</div>
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || navigator.clipboard?.writeText === undefined) return false
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

function CopyControl({
  text,
  label,
  copiedLabel,
  failedLabel,
}: {
  readonly text: string
  readonly label: string
  readonly copiedLabel: string
  readonly failedLabel: string
}): ReactElement {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const onClick = (): void => {
    void writeClipboard(text).then(ok => { setState(ok ? 'copied' : 'failed') })
  }
  return (
    <div className={css.copyRow}>
      <button type="button" onClick={onClick} aria-label={label}>{label}</button>
      {state === 'copied' && <span role="status">{copiedLabel}</span>}
      {state === 'failed' && <span role="status">{failedLabel}</span>}
    </div>
  )
}

function OutcomeBody({
  outcome,
  labels,
}: {
  readonly outcome: WorkflowRunValueView
  readonly labels: DashboardLabels
}): ReactElement {
  if (outcome.state === 'pending') {
    return <><h3>Pending</h3><p className={css.muted}>The member has not produced an outcome yet.</p></>
  }
  if (outcome.state === 'not-produced') {
    return <><h3>No outcome produced</h3><p className={css.muted}>This member finished without a retained result.</p></>
  }
  if (outcome.state === 'evicted') {
    return <><h3>Outcome evicted</h3><p className={css.muted}>The retained outcome was evicted to stay within storage limits.</p></>
  }
  if (outcome.state !== 'available') {
    return <><h3>Pending</h3><p className={css.muted}>The member has not produced an outcome yet.</p></>
  }
  if (outcome.content.kind === 'preview') {
    return (
      <>
        <h3>Truncated outcome</h3>
        <p className={css.muted}>
          {retainedBytes(outcome.content.text)} bytes retained of {outcome.totalBytes} bytes total.
        </p>
        <pre className={css.value} aria-label="Truncated outcome preview">{outcome.content.text}</pre>
      </>
    )
  }
  const value = outcome.content.value
  const heading = availableHeading(value)
  if (heading === 'Text outcome') {
    const text = String(value)
    return (
      <>
        <h3>Text outcome</h3>
        <MarkdownText text={text} />
        <CopyControl text={text} label={labels.copy} copiedLabel={labels.copied} failedLabel={labels.copyFailed} />
      </>
    )
  }
  if (heading === 'JSON outcome') {
    const serialized = json(value)
    return (
      <>
        <h3>JSON outcome</h3>
        <pre className={css.value} aria-label="JSON outcome">{serialized}</pre>
        <CopyControl text={serialized} label={labels.copyJson} copiedLabel={labels.copied} failedLabel={labels.copyFailed} />
      </>
    )
  }
  const serialized = json(value)
  return (
    <>
      <h3>Value outcome</h3>
      <pre className={css.value} aria-label="Value outcome">{serialized}</pre>
      <CopyControl text={serialized} label={labels.copy} copiedLabel={labels.copied} failedLabel={labels.copyFailed} />
    </>
  )
}

/** Render one bounded member outcome without conflating null, absence, or eviction. */
export function WorkflowMemberInspector({
  member,
  detail,
  outcome: explicitOutcome,
  loading = false,
  error,
  onRetry,
  onClose,
  onOpenChild,
  labels: labelOverrides,
}: WorkflowMemberInspectorProps): ReactElement {
  const labels = labelOverrides ?? dashboardLabelsFromLocale(workflowLocales.en)
  const [childUnavailable, setChildUnavailable] = useState(false)
  const outcome = explicitOutcome ?? detail?.outcome
  const childId = detail && 'childSessionId' in detail ? detail.childSessionId : undefined

  useEffect(() => { setChildUnavailable(false) }, [childId])

  const openChild = (): void => {
    if (onOpenChild === undefined) return
    void Promise.resolve(onOpenChild()).then(opened => {
      if (!opened) setChildUnavailable(true)
    }, () => { setChildUnavailable(true) })
  }

  let body: ReactElement
  if (loading) {
    body = <p role="status">Loading member outcome…</p>
  } else if (error !== undefined) {
    body = (
      <div className={css.error} role="alert">
        <p>Unable to load member outcome</p>
        {onRetry !== undefined && <button type="button" onClick={onRetry}>Retry</button>}
      </div>
    )
  } else if (outcome === undefined) {
    body = <><h3>Pending</h3><p className={css.muted}>The member has not produced an outcome yet.</p></>
  } else {
    body = <OutcomeBody outcome={outcome} labels={labels} />
  }

  return (
    <section className={css.root} aria-label="Workflow member inspector">
      <header className={css.header}>
        <div>
          <p className={css.eyebrow}>Member outcome</p>
          <h2>{member?.label || 'Member'}</h2>
          {member?.phase !== undefined && <p className={css.muted}>{member.phase || labels.emptyPhase}</p>}
        </div>
        {onClose !== undefined && <button type="button" onClick={onClose} aria-label="Close member inspector">Close</button>}
      </header>
      <div className={css.body}>{body}</div>
      {childId !== undefined && onOpenChild !== undefined && (
        <div className={css.child}>
          <button type="button" onClick={openChild}>Open child session</button>
          {childUnavailable && <p role="status">Child transcript unavailable</p>}
        </div>
      )}
    </section>
  )
}

export default WorkflowMemberInspector
