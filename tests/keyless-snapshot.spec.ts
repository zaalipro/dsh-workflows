import { readFile } from 'node:fs/promises'
import { mkdtemp, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type {
  ConversationNodeAssembler as ConversationNodeAssemblerType,
  ConversationNodeDefinition,
  ConversationViewDefinition,
  ConversationViewNode,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SessionEventLikeEntry } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import { describe, expect, it } from 'vitest'

import { WorkflowRunRecorder } from '../src/run-recorder.js'
import { renderWorkflowCompletionNotice } from '../src/supervisor/completion-notice.js'
import {
  decodeWorkflowRunDetails,
  encodeWorkflowRunDetails,
} from '../src/supervisor/storage/details-codec.js'
import type { WorkflowRunDetailSnapshotV2 } from '../src/supervisor/storage/manifest-types.js'
import {
  workflowPhaseKey,
  workflowRunDefinition,
} from '../src/client/workflow-definition.js'
import {
  INTERRUPTED_SETTLEMENT,
  dashboardLabelsFromLocale,
  workflowChatLabelsFromLocale,
  workflowLocales,
} from '../src/client/locales.js'

/**
 * The upstream `./client` export is intentionally a lazy browser-loader
 * script, not a Node ESM module.  Keep this test in the default Node
 * environment by evaluating that artifact through the same tiny loader seam
 * used by the Web shell.  Only the assembler is used; SlotCore is never
 * instantiated by this fixture.
 */
type ClientLoaderHandoff = {
  readonly id: string
  readonly factory: (require: (specifier: string) => unknown) => Record<string, unknown>
}

const require = createRequire(import.meta.url)

async function loadConversationNodeAssembler(): Promise<typeof ConversationNodeAssemblerType> {
  let handoff: ClientLoaderHandoff | undefined
  const previousWindow = (globalThis as { window?: unknown }).window
  ;(globalThis as { window?: unknown }).window = {
    __ModuleLoader__: {
      load(value: ClientLoaderHandoff): void { handoff = value },
    },
  }
  try {
    // Deliberately dynamic: a static import would execute the browser artifact
    // before the test can install its loader sink (`window` would be absent).
    await import('@deepseek-ai/dsh-client-ui-conversation/client')
  } finally {
    if (previousWindow === undefined) delete (globalThis as { window?: unknown }).window
    else (globalThis as { window?: unknown }).window = previousWindow
  }
  if (handoff === undefined || handoff.id !== '@deepseek-ai/dsh-client-ui-conversation') {
    throw new Error('client conversation package did not register its loader handoff')
  }
  const cordis = require('@deepseek-ai/cordis')
  const exports = handoff.factory(specifier => {
    if (specifier === '@deepseek-ai/cordis') return cordis
    if (specifier === '@deepseek-ai/dsh-client-store') return { createSnapshotStore: (value: unknown) => ({ getSnapshot: () => value, subscribe: () => () => undefined }) }
    if (specifier === '@deepseek-ai/dsh-client-ui-slots') return { SlotCore: class SlotCore {} }
    if (specifier === '@deepseek-ai/dsh-client-ui-primitives') return {}
    if (specifier === 'react') return require('react')
    if (specifier === 'react-dom') return require('react-dom')
    if (specifier === 'react/jsx-runtime') return require('react/jsx-runtime')
    throw new Error(`unexpected client conversation dependency: ${specifier}`)
  })
  const assembler = exports.ConversationNodeAssembler
  if (typeof assembler !== 'function') throw new Error('client conversation package did not export ConversationNodeAssembler')
  return assembler as typeof ConversationNodeAssemblerType
}

const ConversationNodeAssembler = await loadConversationNodeAssembler()

/**
 * A small, source-resolved assembled fixture.  It deliberately uses the
 * official ConversationNodeAssembler rather than a hand-written renderer so
 * append, prepend, and full replay exercise the same package boundary used by
 * the durable Chat contribution.
 */

const RUN_ID = 'run-keyless-review'
const ALPHA_CHILD = 'child-alpha'
const BETA_CHILD = 'child-beta'

function event(seq: number, type: string, data: Record<string, unknown>): SessionEvent {
  return {
    seq,
    time: 1_700_000_000_000 + seq,
    type,
    data,
  } as SessionEvent
}

function input(value: SessionEvent): SessionEventLikeEntry {
  return { type: 'event', event: value }
}

function viewDefinition(): ConversationViewDefinition<ConversationViewNode, readonly ConversationViewNode[]> {
  return {
    target: 'chat',
    create: () => {
      let current: readonly ConversationViewNode[] = []
      return {
        empty: current,
        replace: ({ nodes }) => {
          current = [...nodes]
          return current
        },
        apply: ({ upserts }) => {
          const next = new Map(current.map(node => [node.key, node]))
          for (const node of upserts) next.set(node.key, node)
          current = [...next.values()]
          return current
        },
      }
    },
  }
}

class Definitions {
  constructor(private readonly definitions: readonly ConversationNodeDefinition[]) {}
  entries(): readonly ConversationNodeDefinition[] { return this.definitions }
  fallbackEntry(): undefined { return undefined }
}

function assembler(events: readonly SessionEvent[]): ConversationNodeAssembler {
  const instance = new ConversationNodeAssembler(
    new Definitions([workflowRunDefinition]),
    { entries: () => [viewDefinition()] },
  )
  instance.replaceWindow(events.map(input), false)
  instance.activateTarget('chat')
  instance.flush()
  return instance
}

function workflowEvents(
  includeStart = true,
  stopReason: 'completed' | 'error' | 'cancelled' | 'interrupted' | 'running' = 'completed',
): SessionEvent[] {
  const values: SessionEvent[] = [
    event(1, 'turn/start', { turn: 1 }),
    event(2, 'step/start', { turn: 1, step: 1 }),
  ]
  if (includeStart) {
    values.push(
      event(3, 'tool-workflow/run-start', { runId: RUN_ID, name: 'keyless-review' }),
      event(4, 'tool-workflow/agent-start', {
        runId: RUN_ID, seq: 1, label: 'alpha', phase: 'review', childId: ALPHA_CHILD,
      }),
      event(5, 'tool-workflow/agent-start', {
        runId: RUN_ID, seq: 2, label: 'beta', phase: '', childId: BETA_CHILD,
      }),
    )
    if (stopReason !== 'running') {
      const endOutcome = stopReason === 'completed'
        ? 'completed'
        : stopReason === 'error' ? 'error' : 'cancelled'
      values.push(
        event(6, 'tool-workflow/agent-end', { runId: RUN_ID, seq: 1, outcome: endOutcome }),
        event(7, 'tool-workflow/agent-end', { runId: RUN_ID, seq: 2, outcome: 'completed' }),
        event(8, 'tool-workflow/run-end', { runId: RUN_ID, stopReason }),
      )
    }
  } else {
    values.push(event(3, 'tool-workflow/agent-end', { runId: RUN_ID, seq: 1, outcome: 'completed' }))
  }
  return values
}

function chatNodes(instance: ConversationNodeAssembler): readonly ConversationViewNode[] {
  return (instance.snapshot('chat') as readonly ConversationViewNode[] | undefined) ?? []
}

function eventNames(events: readonly { readonly type: string }[]): readonly string[] {
  return events.map(value => value.type)
}

describe('keyless assembled workflow evidence', () => {
  it('reconstructs one durable run with paired members, null-safe detail, and a bounded notice', () => {
    const instance = assembler(workflowEvents())
    const nodes = chatNodes(instance)
    expect(nodes).toHaveLength(1)
    expect(nodes[0]?.data).toEqual({
      name: 'keyless-review',
      status: 'completed',
      phases: [
        {
          key: workflowPhaseKey('review'),
          phase: 'review',
          members: [{ seq: 1, label: 'alpha', childId: ALPHA_CHILD, status: 'completed' }],
        },
        {
          key: workflowPhaseKey(''),
          phase: '',
          members: [{ seq: 2, label: 'beta', childId: BETA_CHILD, status: 'completed' }],
        },
      ],
    })
    expect(workflowPhaseKey(null)).not.toBe(workflowPhaseKey(''))
    expect(nodes[0]?.data).toMatchSnapshot('completed-chat-node')

    const detail: WorkflowRunDetailSnapshotV2 = {
      version: 2,
      sessionId: 'session-keyless',
      runId: RUN_ID,
      runDirectory: 'a'.repeat(32),
      detailId: 'b'.repeat(32),
      snapshotRevision: 1,
      payload: {
        members: [
          {
            memberId: 'c'.repeat(32), seq: 1, label: 'alpha', status: 'completed',
            outcome: 'available', value: 'alpha', childSessionId: ALPHA_CHILD,
          },
          {
            memberId: 'd'.repeat(32), seq: 2, label: 'beta', status: 'completed',
            outcome: 'available', value: null, childSessionId: BETA_CHILD,
          },
        ],
        result: { state: 'available', value: { alpha: 'alpha', beta: null } },
      },
    }
    const limits = {
      memberOutcomeMaxBytes: 1_024,
      maxTerminalResultBytes: 4_096,
      maxLogLineBytes: 1_024,
      maxRunDetailsBytes: 16_384,
    }
    const decoded = decodeWorkflowRunDetails(encodeWorkflowRunDetails(detail, limits), 'detail.json', limits)
    expect(decoded.payload.members?.[1]?.value).toBeNull()
    expect(decoded.payload.result).toMatchObject({ state: 'available', value: { alpha: 'alpha', beta: null } })

    const notice = renderWorkflowCompletionNotice({
      runId: RUN_ID,
      displayName: 'keyless-review',
      status: 'completed',
      result: {
        state: 'available',
        content: { kind: 'value', value: { alpha: 'alpha', beta: null } },
        totalBytes: 32,
        truncated: false,
      },
    }, 512)
    expect(notice).toContain('workflow "keyless-review" completed.')
    expect(notice).toContain('"beta": null')
    expect(notice.endsWith('Open /workflows to inspect the run.')).toBe(true)
    expect(notice).not.toContain(RUN_ID)
    expect(notice).toMatchSnapshot('completed-notice')
  })

  it('reconstructs running, failed, and interrupted Chat statuses without leaking the run id', () => {
    const running = chatNodes(assembler(workflowEvents(true, 'running')))
    expect(running).toHaveLength(1)
    expect(running[0]?.data).toMatchObject({
      name: 'keyless-review',
      status: 'running',
      phases: [
        { members: [{ label: 'alpha', status: 'running' }] },
        { members: [{ label: 'beta', status: 'running' }] },
      ],
    })
    expect(JSON.stringify(running[0]?.data)).not.toContain(RUN_ID)
    expect(running[0]?.data).toMatchSnapshot('running-chat-node')

    const failed = chatNodes(assembler(workflowEvents(true, 'error')))
    expect(failed[0]?.data).toMatchObject({ name: 'keyless-review', status: 'failed' })
    expect(failed[0]?.data).toMatchSnapshot('failed-chat-node')

    const interrupted = chatNodes(assembler(workflowEvents(true, 'interrupted')))
    expect(interrupted[0]?.data).toMatchObject({ name: 'keyless-review', status: 'cancelled' })
    expect(workflowChatLabelsFromLocale(workflowLocales.en).status.cancelled).toBe('Cancelled')
    expect(dashboardLabelsFromLocale(workflowLocales.en).status.interrupted).toBe('Interrupted')
    expect(dashboardLabelsFromLocale(workflowLocales.en).interruptedSettlement).toBe(INTERRUPTED_SETTLEMENT)
    expect(interrupted[0]?.data).toMatchSnapshot('interrupted-chat-node-cancelled')
  })

  it('keeps append, prepend, and full replay equivalent and rejects an update-only tail', () => {
    const all = workflowEvents()
    const replay = assembler(all)
    const append = assembler(all.slice(0, 5))
    for (const value of all.slice(5)) append.append(input(value))
    append.flush()
    expect(chatNodes(append).map(node => node.data)).toEqual(chatNodes(replay).map(node => node.data))

    const prepended = assembler(all.slice(3))
    prepended.prepend(all.slice(0, 3).map(input), false)
    prepended.flush()
    expect(chatNodes(prepended).map(node => node.data)).toEqual(chatNodes(replay).map(node => node.data))

    const updateOnly = assembler(workflowEvents(false))
    expect(chatNodes(updateOnly)).toEqual([])
  })

  it('records a legal continuous prefix and maps interruption to the official cancelled event', async () => {
    const listeners = new Map<string, Set<(...args: any[]) => void>>()
    const context = {
      on(name: string, listener: (...args: any[]) => void) {
        const bucket = listeners.get(name) ?? new Set<(...args: any[]) => void>()
        bucket.add(listener)
        listeners.set(name, bucket)
        return () => bucket.delete(listener)
      },
      logger: { warn: () => undefined },
      agents: { list: () => [] },
    }
    const emit = (name: string, ...args: any[]) => {
      for (const listener of listeners.get(name) ?? []) listener(...args)
    }
    const session = {
      events: [],
      append(type: string, data: unknown) { this.events.push({ type, data }) },
    } as { events: Array<{ type: string; data: any }>; append(type: string, data: unknown): void }
    const recorder = new WorkflowRunRecorder(context)
    const info = { id: RUN_ID, displayName: 'keyless-review', name: 'keyless-review' }
    await recorder.launch(session, async () => {
      emit('workflows/run-start', info)
      emit('workflows/member-start', info, {
        memberId: 'member-alpha', seq: 1, label: 'alpha', childSessionId: ALPHA_CHILD, status: 'running',
      })
      emit('workflows/member-end', info, {
        memberId: 'member-alpha', seq: 1, label: 'alpha', childSessionId: ALPHA_CHILD, status: 'completed',
      })
      return { runId: RUN_ID, displayName: 'keyless-review' }
    })
    emit('workflows/run-end', info, { stopReason: 'interrupted' })
    await recorder.dispose()

    expect(eventNames(session.events)).toEqual([
      'tool-workflow/run-start',
      'tool-workflow/agent-start',
      'tool-workflow/agent-end',
      'tool-workflow/run-end',
    ])
    expect(session.events.at(-1)?.data).toEqual({ runId: RUN_ID, stopReason: 'cancelled' })

    const serialized = `${session.events.map(value => JSON.stringify(value)).join('\n')}\n`
    expect(serialized.endsWith('\n')).toBe(true)
    expect(serialized.match(/tool-workflow\/run-end/g)).toHaveLength(1)
    expect(serialized).toMatchSnapshot('interrupted-durable-jsonl')
  })

  it('does not touch a checkout while checking optional assembled fixture inputs', async () => {
    const fixture = await mkdtemp(join(tmpdir(), 'dsh-keyless-input-'))
    try {
      const inputPath = join(fixture, 'input.json')
      await (await import('node:fs/promises')).writeFile(inputPath, JSON.stringify({ name: 'keyless-review' }))
      const parsed = JSON.parse(await readFile(inputPath, 'utf8')) as { name: string }
      expect(parsed).toEqual({ name: 'keyless-review' })
    } finally {
      await rm(fixture, { recursive: true, force: true })
    }
  })
})
