import type { WorkflowGateInfo } from './supervisor/types.js'
import { UserQuestionError, type AskUserQuestionItem } from '@deepseek-ai/dsh-user-questions'

export const name = 'workflow-user-questions'
export const inject = ['workflowSupervisor', 'userQuestions'] as const
const QUESTION_ID = 'workflow-gate'
const RESUME = 'Resume workflow'

/** Convert a parked workflow gate into the exact existing question UI data. */
export function workflowGateQuestion(displayName: string, gate: WorkflowGateInfo): AskUserQuestionItem {
  return {
    id: QUESTION_ID,
    header: `Workflow · ${displayName}`,
    question: gate.message,
    options: [{
      label: RESUME,
      description: gate.resumable
        ? 'Continue past this input request.'
        : 'Retry the paused condition; it may ask again when nothing changed.',
    }],
  }
}

function renderThrown(error: unknown): string {
  try { return String(error) }
  catch { return '[unrenderable thrown value]' }
}

function withdrawal(error: unknown, signal: AbortSignal): boolean {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code)
    : undefined
  return signal.aborted
    || (error instanceof UserQuestionError && (error.code === 'ASK_ABORTED' || error.code === 'ASK_CANCELLED'))
    || code === 'ASK_ABORTED'
    || code === 'ASK_CANCELLED'
}

function acknowledges(answer: any): boolean {
  return Array.isArray(answer?.answers) && answer.answers.some((item: any) =>
    item?.id === QUESTION_ID
    && Array.isArray(item.selected)
    && item.selected.includes(RESUME)
    && (item.custom === undefined || item.custom === ''))
}

/** Register the exact-Agent question bridge and an awaited lifetime disposer. */
export function apply(ctx: any): (() => Promise<void>) {
  const lifetime = new AbortController()
  const active = new Set<Promise<void>>()
  let closed = false
  const remove = ctx.on?.('workflows/gate-request', (request: any) => {
    if (closed || lifetime.signal.aborted) return
    const signal = AbortSignal.any([request.signal, lifetime.signal])
    const operation = (async () => {
      try {
        const answer = await ctx.userQuestions.ask({
          questions: [workflowGateQuestion(request.info.displayName, request.gate)],
          agent: request.parent,
          signal,
        })
        if (!acknowledges(answer) || signal.aborted || closed) return
        await ctx.workflowSupervisor.resumeGate(
          request.info.id,
          request.executionId,
          request.gateId,
          request.parent,
          signal,
        )
      } catch (error) {
        if (!withdrawal(error, signal)) {
          ctx.logger?.warn?.(`workflow-user-questions: could not answer gate for "${String(request?.info?.displayName ?? '')}": ${renderThrown(error)}`)
        }
      }
    })()
    active.add(operation)
    void operation.then(() => { active.delete(operation) }, () => { active.delete(operation) })
  })
  let disposal: Promise<void> | undefined
  const dispose = (): Promise<void> => {
    if (disposal !== undefined) return disposal
    closed = true
    disposal = (async () => {
      try { remove?.() } catch { /* contained */ }
      lifetime.abort(new Error('workflow-user-questions plugin disposed'))
      await Promise.allSettled([...active])
      active.clear()
    })()
    return disposal
  }
  ctx.effect?.(() => dispose, 'workflow-user-questions: abort and drain pending questions')
  return dispose
}
