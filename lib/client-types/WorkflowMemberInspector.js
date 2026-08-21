import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { dashboardLabelsFromLocale, workflowLocales } from './locales.js';
import css from './WorkflowMemberInspector.module.css';
function json(value) {
    try {
        return JSON.stringify(value, null, 2);
    }
    catch {
        return '[unavailable]';
    }
}
function availableHeading(value) {
    if (typeof value === 'string')
        return 'Text outcome';
    // JSON null is a value, not the absence of an outcome.
    if (value === null || typeof value === 'object')
        return 'JSON outcome';
    return 'Value outcome';
}
function retainedBytes(text) {
    return new TextEncoder().encode(text).byteLength;
}
function renderInline(text) {
    const nodes = [];
    const pattern = /(\*\*[^*]+?\*\*|`[^`]+?`|\*[^*]+?\*)/gu;
    let last = 0;
    let match;
    let index = 0;
    while ((match = pattern.exec(text)) !== null) {
        if (match.index > last)
            nodes.push(text.slice(last, match.index));
        const token = match[0];
        if (token.startsWith('**'))
            nodes.push(_jsx("strong", { children: token.slice(2, -2) }, `b${index}`));
        else if (token.startsWith('`'))
            nodes.push(_jsx("code", { children: token.slice(1, -1) }, `c${index}`));
        else
            nodes.push(_jsx("em", { children: token.slice(1, -1) }, `i${index}`));
        last = match.index + token.length;
        index += 1;
    }
    if (last < text.length)
        nodes.push(text.slice(last));
    return nodes;
}
/** Bounded Markdown/plain-text renderer. Strings must not be JSON.stringified. */
export function MarkdownText({ text }) {
    const lines = text.replace(/\r\n/gu, '\n').split('\n');
    const blocks = [];
    let paragraph = [];
    let listItems = [];
    const flushParagraph = () => {
        if (paragraph.length === 0)
            return;
        blocks.push(_jsx("p", { children: renderInline(paragraph.join('\n')) }, `p${blocks.length}`));
        paragraph = [];
    };
    const flushList = () => {
        if (listItems.length === 0)
            return;
        blocks.push(_jsx("ul", { children: listItems }, `ul${blocks.length}`));
        listItems = [];
    };
    for (const line of lines) {
        if (line.startsWith('### ')) {
            flushParagraph();
            flushList();
            blocks.push(_jsx("h6", { children: renderInline(line.slice(4)) }, `h${blocks.length}`));
        }
        else if (line.startsWith('## ')) {
            flushParagraph();
            flushList();
            blocks.push(_jsx("h5", { children: renderInline(line.slice(3)) }, `h${blocks.length}`));
        }
        else if (line.startsWith('# ')) {
            flushParagraph();
            flushList();
            blocks.push(_jsx("h4", { children: renderInline(line.slice(2)) }, `h${blocks.length}`));
        }
        else if (line.startsWith('- ') || line.startsWith('* ')) {
            flushParagraph();
            listItems.push(_jsx("li", { children: renderInline(line.slice(2)) }, `li${listItems.length}`));
        }
        else if (line === '') {
            flushParagraph();
            flushList();
        }
        else {
            flushList();
            paragraph.push(line);
        }
    }
    flushParagraph();
    flushList();
    if (blocks.length === 0)
        return _jsx("p", { className: css.markdown, children: text });
    return _jsx("div", { className: css.markdown, children: blocks });
}
async function writeClipboard(text) {
    try {
        if (typeof navigator === 'undefined' || navigator.clipboard?.writeText === undefined)
            return false;
        await navigator.clipboard.writeText(text);
        return true;
    }
    catch {
        return false;
    }
}
function CopyControl({ text, label, copiedLabel, failedLabel, }) {
    const [state, setState] = useState('idle');
    const onClick = () => {
        void writeClipboard(text).then(ok => { setState(ok ? 'copied' : 'failed'); });
    };
    return (_jsxs("div", { className: css.copyRow, children: [_jsx("button", { type: "button", onClick: onClick, "aria-label": label, children: label }), state === 'copied' && _jsx("span", { role: "status", children: copiedLabel }), state === 'failed' && _jsx("span", { role: "status", children: failedLabel })] }));
}
function OutcomeBody({ outcome, labels, }) {
    if (outcome.state === 'pending') {
        return _jsxs(_Fragment, { children: [_jsx("h3", { children: "Pending" }), _jsx("p", { className: css.muted, children: "The member has not produced an outcome yet." })] });
    }
    if (outcome.state === 'not-produced') {
        return _jsxs(_Fragment, { children: [_jsx("h3", { children: "No outcome produced" }), _jsx("p", { className: css.muted, children: "This member finished without a retained result." })] });
    }
    if (outcome.state === 'evicted') {
        return _jsxs(_Fragment, { children: [_jsx("h3", { children: "Outcome evicted" }), _jsx("p", { className: css.muted, children: "The retained outcome was evicted to stay within storage limits." })] });
    }
    if (outcome.state !== 'available') {
        return _jsxs(_Fragment, { children: [_jsx("h3", { children: "Pending" }), _jsx("p", { className: css.muted, children: "The member has not produced an outcome yet." })] });
    }
    if (outcome.content.kind === 'preview') {
        return (_jsxs(_Fragment, { children: [_jsx("h3", { children: "Truncated outcome" }), _jsxs("p", { className: css.muted, children: [retainedBytes(outcome.content.text), " bytes retained of ", outcome.totalBytes, " bytes total."] }), _jsx("pre", { className: css.value, "aria-label": "Truncated outcome preview", children: outcome.content.text })] }));
    }
    const value = outcome.content.value;
    const heading = availableHeading(value);
    if (heading === 'Text outcome') {
        const text = String(value);
        return (_jsxs(_Fragment, { children: [_jsx("h3", { children: "Text outcome" }), _jsx(MarkdownText, { text: text }), _jsx(CopyControl, { text: text, label: labels.copy, copiedLabel: labels.copied, failedLabel: labels.copyFailed })] }));
    }
    if (heading === 'JSON outcome') {
        const serialized = json(value);
        return (_jsxs(_Fragment, { children: [_jsx("h3", { children: "JSON outcome" }), _jsx("pre", { className: css.value, "aria-label": "JSON outcome", children: serialized }), _jsx(CopyControl, { text: serialized, label: labels.copyJson, copiedLabel: labels.copied, failedLabel: labels.copyFailed })] }));
    }
    const serialized = json(value);
    return (_jsxs(_Fragment, { children: [_jsx("h3", { children: "Value outcome" }), _jsx("pre", { className: css.value, "aria-label": "Value outcome", children: serialized }), _jsx(CopyControl, { text: serialized, label: labels.copy, copiedLabel: labels.copied, failedLabel: labels.copyFailed })] }));
}
/** Render one bounded member outcome without conflating null, absence, or eviction. */
export function WorkflowMemberInspector({ member, detail, outcome: explicitOutcome, loading = false, error, onRetry, onClose, onOpenChild, labels: labelOverrides, }) {
    const labels = labelOverrides ?? dashboardLabelsFromLocale(workflowLocales.en);
    const [childUnavailable, setChildUnavailable] = useState(false);
    const outcome = explicitOutcome ?? detail?.outcome;
    const childId = detail && 'childSessionId' in detail ? detail.childSessionId : undefined;
    useEffect(() => { setChildUnavailable(false); }, [childId]);
    const openChild = () => {
        if (onOpenChild === undefined)
            return;
        void Promise.resolve(onOpenChild()).then(opened => {
            if (!opened)
                setChildUnavailable(true);
        }, () => { setChildUnavailable(true); });
    };
    let body;
    if (loading) {
        body = _jsx("p", { role: "status", children: "Loading member outcome\u2026" });
    }
    else if (error !== undefined) {
        body = (_jsxs("div", { className: css.error, role: "alert", children: [_jsx("p", { children: "Unable to load member outcome" }), onRetry !== undefined && _jsx("button", { type: "button", onClick: onRetry, children: "Retry" })] }));
    }
    else if (outcome === undefined) {
        body = _jsxs(_Fragment, { children: [_jsx("h3", { children: "Pending" }), _jsx("p", { className: css.muted, children: "The member has not produced an outcome yet." })] });
    }
    else {
        body = _jsx(OutcomeBody, { outcome: outcome, labels: labels });
    }
    return (_jsxs("section", { className: css.root, "aria-label": "Workflow member inspector", children: [_jsxs("header", { className: css.header, children: [_jsxs("div", { children: [_jsx("p", { className: css.eyebrow, children: "Member outcome" }), _jsx("h2", { children: member?.label || 'Member' }), member?.phase !== undefined && _jsx("p", { className: css.muted, children: member.phase || labels.emptyPhase })] }), onClose !== undefined && _jsx("button", { type: "button", onClick: onClose, "aria-label": "Close member inspector", children: "Close" })] }), _jsx("div", { className: css.body, children: body }), childId !== undefined && onOpenChild !== undefined && (_jsxs("div", { className: css.child, children: [_jsx("button", { type: "button", onClick: openChild, children: "Open child session" }), childUnavailable && _jsx("p", { role: "status", children: "Child transcript unavailable" })] }))] }));
}
export default WorkflowMemberInspector;
//# sourceMappingURL=WorkflowMemberInspector.js.map