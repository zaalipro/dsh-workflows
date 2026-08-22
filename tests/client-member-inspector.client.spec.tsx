// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  MarkdownText,
  WorkflowMemberInspector,
} from '../src/client/WorkflowMemberInspector.js'
import type { WorkflowRunMemberHead, WorkflowRunValueView } from '../src/client/contract.js'
import {
  dashboardLabelsFromLocale,
  workflowLocaleFromBind,
  workflowLocales,
} from '../src/client/locales.js'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const UUID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

function member(overrides: Partial<WorkflowRunMemberHead> = {}): WorkflowRunMemberHead {
  return {
    memberId: `${UUID.slice(0, 30)}01`,
    seq: 1,
    label: 'alpha',
    phase: 'review',
    status: 'completed',
    startedAt: 1,
    settledAt: 2,
    outcome: 'available',
    childSessionId: 'child-1',
    ...overrides,
  }
}

const mounts: Array<{ root: Root; node: HTMLElement }> = []

function mount(element: React.ReactElement): HTMLElement {
  const node = document.createElement('div')
  document.body.append(node)
  const root = createRoot(node)
  act(() => { root.render(element) })
  mounts.push({ root, node })
  return node
}

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

afterEach(() => {
  for (const item of mounts.splice(0)) {
    act(() => { item.root.unmount() })
    item.node.remove()
  }
  vi.restoreAllMocks()
})

describe('WorkflowMemberInspector (RC15)', () => {
  it('renders every outcome heading and keeps JSON null as a value', () => {
    const variants: Array<[WorkflowRunValueView, string]> = [
      [{ state: 'pending' }, 'Pending'],
      [{ state: 'not-produced' }, 'No outcome produced'],
      [{ state: 'evicted' }, 'Outcome evicted'],
      [{ state: 'available', content: { kind: 'value', value: null }, totalBytes: 4, truncated: false }, 'JSON outcome'],
      [{ state: 'available', content: { kind: 'value', value: 'hello **world**' }, totalBytes: 8, truncated: false }, 'Text outcome'],
      [{ state: 'available', content: { kind: 'value', value: 7 }, totalBytes: 1, truncated: false }, 'Value outcome'],
      [{ state: 'available', content: { kind: 'preview', text: '{"x":' }, totalBytes: 20, truncated: true }, 'Truncated outcome'],
    ]
    for (const [outcome, heading] of variants) {
      const node = mount(
        <WorkflowMemberInspector member={member({ outcome: outcome.state })} outcome={outcome} />,
      )
      expect(node.textContent).toContain(heading)
      expect(node.textContent).not.toContain(UUID)
      if (heading === 'JSON outcome') expect(node.textContent).toContain('null')
      if (heading === 'Text outcome') {
        expect(node.textContent).toContain('hello')
        expect(node.innerHTML).not.toContain('"hello **world**"')
      }
      if (heading === 'Truncated outcome') {
        expect(node.textContent).toContain('bytes retained of 20 bytes total')
        expect(node.querySelector('[aria-label="Truncated outcome preview"]')?.textContent).toBe('{"x":')
      }
      act(() => { mounts.at(-1)!.root.unmount() })
      mounts.pop()?.node.remove()
    }
  })

  it('renders Markdown blocks and copies complete JSON including null', async () => {
    const writeText = vi.fn(async () => undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    const markdown = '# Title\n## Sub\n### Deep\n\nparagraph with `code` and *em*\n- one\n- two'
    const textNode = mount(
      <WorkflowMemberInspector
        member={member()}
        outcome={{ state: 'available', content: { kind: 'value', value: markdown }, totalBytes: markdown.length, truncated: false }}
      />,
    )
    expect(textNode.querySelector('h4')?.textContent).toBe('Title')
    expect(textNode.querySelector('h5')?.textContent).toBe('Sub')
    expect(textNode.querySelector('h6')?.textContent).toBe('Deep')
    expect(textNode.querySelectorAll('li')).toHaveLength(2)
    expect(textNode.querySelector('code')?.textContent).toBe('code')
    expect(textNode.querySelector('em')?.textContent).toBe('em')

    const jsonNode = mount(
      <WorkflowMemberInspector
        member={member()}
        outcome={{ state: 'available', content: { kind: 'value', value: null }, totalBytes: 4, truncated: false }}
      />,
    )
    const copy = [...jsonNode.querySelectorAll('button')].find(button => button.textContent === 'Copy JSON')
    expect(copy).toBeDefined()
    await act(async () => { copy!.click(); await Promise.resolve() })
    expect(writeText).toHaveBeenCalledWith('null')
    expect(jsonNode.textContent).toContain('Copied')
  })

  it('reports copy failure and missing clipboard without hiding the outcome', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn(async () => { throw new Error('denied') }) } })
    const node = mount(
      <WorkflowMemberInspector
        member={member()}
        outcome={{ state: 'available', content: { kind: 'value', value: { ok: true } }, totalBytes: 11, truncated: false }}
      />,
    )
    const copy = [...node.querySelectorAll('button')].find(button => button.textContent === 'Copy JSON')
    await act(async () => { copy!.click(); await Promise.resolve() })
    expect(node.textContent).toContain('Copy failed')
    expect(node.textContent).toContain('JSON outcome')

    const boxed = navigator as Navigator & { clipboard?: unknown }
    const previous = boxed.clipboard
    delete boxed.clipboard
    const primitive = mount(
      <WorkflowMemberInspector
        member={member()}
        outcome={{ state: 'available', content: { kind: 'value', value: false }, totalBytes: 5, truncated: false }}
      />,
    )
    const copyValue = [...primitive.querySelectorAll('button')].find(button => button.textContent === 'Copy')
    await act(async () => { copyValue!.click(); await Promise.resolve() })
    expect(primitive.textContent).toContain('Copy failed')
    expect(primitive.textContent).toContain('Value outcome')
    boxed.clipboard = previous
  })

  it('keeps a retained outcome visible when child navigation is unavailable or fails', async () => {
    const unavailable = mount(
      <WorkflowMemberInspector
        member={member()}
        detail={{
          member: member(),
          childSessionId: 'child-1',
          outcome: { state: 'available', content: { kind: 'value', value: { kept: true } }, totalBytes: 12, truncated: false },
        }}
        onOpenChild={async () => false}
      />,
    )
    expect(unavailable.textContent).toContain('JSON outcome')
    await act(async () => {
      [...unavailable.querySelectorAll('button')].find(button => button.textContent === 'Open child session')!.click()
      await Promise.resolve()
    })
    expect(unavailable.textContent).toContain('Child transcript unavailable')
    expect(unavailable.textContent).toContain('JSON outcome')
    expect(unavailable.textContent).toContain('"kept": true')

    const failed = mount(
      <WorkflowMemberInspector
        member={member()}
        detail={{
          member: member(),
          childSessionId: 'child-1',
          outcome: { state: 'available', content: { kind: 'value', value: 'kept text' }, totalBytes: 9, truncated: false },
        }}
        onOpenChild={async () => { throw new Error('nope') }}
      />,
    )
    await act(async () => {
      [...failed.querySelectorAll('button')].find(button => button.textContent === 'Open child session')!.click()
      await Promise.resolve()
    })
    expect(failed.textContent).toContain('Child transcript unavailable')
    expect(failed.textContent).toContain('Text outcome')
    expect(failed.textContent).toContain('kept text')
  })

  it('points not-produced members with a child session at the child transcript', () => {
    const node = mount(
      <WorkflowMemberInspector
        member={member({ outcome: 'not-produced' })}
        detail={{
          member: member({ outcome: 'not-produced' }),
          childSessionId: 'child-1',
          outcome: { state: 'not-produced' },
        }}
        onOpenChild={() => true}
      />,
    )
    expect(node.textContent).toContain('Child transcript')
    expect(node.textContent).toContain('Open the child session to inspect its trace')
    expect(node.textContent).not.toContain('No outcome produced')
  })

  it('shows exact Retry copy, loading, close, and empty phase labels', async () => {
    const retry = vi.fn()
    const close = vi.fn()
    const error = mount(
      <WorkflowMemberInspector
        member={member({ phase: '' })}
        error="wire"
        onRetry={retry}
        onClose={close}
        labels={dashboardLabelsFromLocale(workflowLocales.zh)}
      />,
    )
    expect(error.textContent).toContain('Unable to load member outcome')
    expect(error.textContent).toContain('空阶段名称')
    const retryButton = [...error.querySelectorAll('button')].find(button => button.textContent === 'Retry')
    const closeButton = [...error.querySelectorAll('button')].find(button => button.getAttribute('aria-label') === 'Close member inspector')
    act(() => {
      retryButton!.click()
      closeButton!.click()
    })
    expect(retry).toHaveBeenCalledOnce()
    expect(close).toHaveBeenCalledOnce()

    const loading = mount(<WorkflowMemberInspector member={member()} loading />)
    expect(loading.textContent).toContain('Loading member outcome…')
    const pending = mount(<WorkflowMemberInspector member={member({ label: '' })} />)
    expect(pending.textContent).toContain('Pending')
    expect(pending.querySelector('h2')?.textContent).toBe('Member')
    await settle()
  })

  it('renders MarkdownText fallbacks and locale bind failures', () => {
    const node = mount(<MarkdownText text="" />)
    expect(node.textContent).toBe('')
    const bold = mount(<MarkdownText text={'plain **bold** rest'} />)
    expect(bold.querySelector('strong')?.textContent).toBe('bold')
    expect(workflowLocaleFromBind(undefined)).toBe(workflowLocales.en)
    expect(workflowLocaleFromBind(() => workflowLocales.zh.title)).toBe(workflowLocales.zh)
    expect(workflowLocaleFromBind(() => { throw new Error('missing bind') })).toBe(workflowLocales.en)
    const unknown = mount(
      <WorkflowMemberInspector
        member={member()}
        outcome={{ state: 'mystery' } as never}
      />,
    )
    expect(unknown.textContent).toContain('Pending')
  })
})
