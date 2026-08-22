import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState, } from 'react';
import clsx from 'clsx';
import { WorkflowRunsRemoteError } from './contract.js';
import { WorkflowMemberInspector } from './WorkflowMemberInspector.js';
import { dashboardLabelsFromLocale, INTERRUPTED_SETTLEMENT, workflowLocales, } from './locales.js';
import css from './WorkflowsDashboard.module.css';
const TERMINAL = new Set(['completed', 'failed', 'cancelled', 'interrupted']);
const ACTION_ORDER = ['pause', 'resume', 'stop', 'save'];
const SHORTCUTS = {
    p: 'pause', r: 'resume', x: 'stop', s: 'save',
};
export const GENERIC_LOAD_ERROR = 'Unable to load workflow data. Retry.';
export const GENERIC_CONTROL_ERROR = 'Unable to update workflow. Retry.';
export const STALE_CONTROL_ERROR = 'workflow run changed; refresh it before applying a control';
function emptySource(sessionId = '') {
    return {
        sessionId,
        phase: 'idle',
        status: 'idle',
        runs: [],
        total: 0,
        sessionRevision: 0,
        revision: 0,
    };
}
function isActive(status) { return !TERMINAL.has(status); }
function statusLabel(status, labels) {
    return labels.status[status];
}
function formatDuration(ms) {
    const seconds = Math.max(0, Math.floor(ms / 1_000));
    if (seconds < 60)
        return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60)
        return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24)
        return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
}
/** Stable active-oldest/history-newest ordering required by the dashboard. */
export function orderWorkflowRuns(rows) {
    return [...rows].sort((left, right) => {
        const leftActive = isActive(left.status);
        const rightActive = isActive(right.status);
        if (leftActive !== rightActive)
            return leftActive ? -1 : 1;
        if (leftActive)
            return left.startedAt - right.startedAt || left.displayName.localeCompare(right.displayName);
        const leftEnd = left.settledAt ?? left.startedAt;
        const rightEnd = right.settledAt ?? right.startedAt;
        return rightEnd - leftEnd || right.startedAt - left.startedAt;
    });
}
function isAbort(error) {
    return (error instanceof Error && error.name === 'AbortError')
        || (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError');
}
function pageError(error) {
    if (error instanceof WorkflowRunsRemoteError && [
        'invalid-page-limit', 'invalid-artifact-limit', 'invalid-cursor', 'stale-cursor',
    ].includes(error.code))
        return error.message;
    return GENERIC_LOAD_ERROR;
}
function utf8Bytes(value) { return new TextEncoder().encode(value).byteLength; }
function settledMembers(run) {
    return run.memberCounts.completed + run.memberCounts.failed + run.memberCounts.cancelled;
}
/** Prefer Remote phases; otherwise recover titles from members or the live phase. */
export function declaredWorkflowPhases(execution, selectedRun, members) {
    if (execution?.phases !== undefined && execution.phases.length > 0)
        return execution.phases;
    const seen = new Set();
    const fromMembers = [];
    for (const member of members) {
        if (typeof member.phase !== 'string' || member.phase === '' || seen.has(member.phase))
            continue;
        seen.add(member.phase);
        fromMembers.push({ title: member.phase });
    }
    if (fromMembers.length > 0)
        return fromMembers;
    const live = execution?.run.phase ?? selectedRun.phase;
    if (typeof live === 'string' && live.length > 0)
        return [{ title: live }];
    return execution?.phases ?? [];
}
function memberOutcomeLabel(member, labels) {
    if (member.childSessionId !== undefined && member.outcome === 'not-produced')
        return labels.outcomeChild;
    return labels.outcome[member.outcome];
}
function memberSummary(run, labels) {
    return labels.agentsCompact(settledMembers(run), run.memberCounts.total);
}
function budgetSummary(run) {
    return `${run.budget.spent}/${run.budget.total} agents`;
}
function terminalResult(run) {
    if (run.terminal === undefined)
        return 'Result pending';
    if (run.terminal.preview !== undefined)
        return `Result: ${run.terminal.preview}`;
    switch (run.terminal.resultState) {
        case 'available': return 'Result retained';
        case 'not-produced': return 'No result produced';
        case 'evicted': return 'Result evicted';
    }
}
function groupMembers(members) {
    const groups = new Map();
    for (const member of members) {
        const key = member.phase === undefined ? 'missing' : `value:${member.phase.length}:${member.phase}`;
        const group = groups.get(key);
        if (group === undefined)
            groups.set(key, { phase: member.phase, members: [member] });
        else
            group.members.push(member);
    }
    return [...groups].map(([key, group]) => ({ key, ...group }));
}
function appendItems(previous, next) {
    if (previous.revision !== next.revision)
        return undefined;
    return { ...next, items: [...previous.items, ...next.items] };
}
/**
 * Join only a same-revision chunk beginning at the exact prior UTF-8 byte end.
 * Returning undefined forces the UI to preserve the good prefix and retry.
 */
export function appendArtifactChunk(previous, next) {
    const expectedOffset = previous.offsetBytes + previous.returnedBytes;
    if (next.revision !== previous.revision
        || next.artifact.name !== previous.artifact.name
        || next.totalBytes !== previous.totalBytes
        || next.offsetBytes !== expectedOffset)
        return undefined;
    return {
        ...next,
        text: previous.text + next.text,
        offsetBytes: previous.offsetBytes,
        returnedBytes: previous.returnedBytes + next.returnedBytes,
    };
}
function editableTarget(target) {
    return target instanceof HTMLElement
        && target.closest('input, textarea, select, [contenteditable="true"]') !== null;
}
function focusable(root) {
    return [...root.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(node => {
        if (node.hidden || node.closest('[inert], [aria-hidden="true"]') !== null)
            return false;
        if (typeof window === 'undefined' || typeof window.getComputedStyle !== 'function')
            return true;
        for (let current = node; current !== null && current !== root; current = current.parentElement) {
            const style = window.getComputedStyle(current);
            if (style.display === 'none' || style.visibility === 'hidden')
                return false;
        }
        return true;
    });
}
function runFromDetails(error) {
    const candidate = error.details?.run;
    if (typeof candidate !== 'object' || candidate === null)
        return undefined;
    return candidate;
}
function ErrorRetry({ message, onRetry, disabled = false }) {
    return (_jsxs("div", { className: css.error, role: "alert", children: [_jsx("p", { children: message }), _jsx("button", { type: "button", disabled: disabled, onClick: onRetry, children: "Retry" })] }));
}
function ResultView({ result }) {
    const outcome = result.value;
    if (outcome.state === 'pending')
        return _jsxs("section", { children: [_jsx("h3", { children: "Pending result" }), _jsx("p", { children: "The workflow is still running." })] });
    if (outcome.state === 'not-produced')
        return _jsxs("section", { children: [_jsx("h3", { children: "No final result produced" }), _jsx("p", { children: "The workflow settled without a result." })] });
    if (outcome.state === 'evicted')
        return _jsxs("section", { children: [_jsx("h3", { children: "Final result evicted" }), _jsx("p", { children: "The result was removed by retention." })] });
    if (outcome.state !== 'available')
        return _jsxs("section", { children: [_jsx("h3", { children: "Pending result" }), _jsx("p", { children: "The workflow is still running." })] });
    const available = outcome;
    if (available.content.kind === 'preview') {
        return (_jsxs("section", { children: [_jsx("h3", { children: "Truncated final result" }), _jsxs("p", { children: [utf8Bytes(available.content.text), " bytes retained of ", available.totalBytes, " bytes total."] }), _jsx("pre", { "aria-label": "Truncated final result preview", children: available.content.text })] }));
    }
    const value = available.content.value;
    if (typeof value === 'string') {
        return _jsxs("section", { children: [_jsx("h3", { children: "Final result" }), _jsx("div", { children: value }), result.error !== undefined && _jsx("p", { children: result.error })] });
    }
    let text = '[unavailable]';
    try {
        text = JSON.stringify(value, null, 2);
    }
    catch { /* keep bounded fallback */ }
    return _jsxs("section", { children: [_jsx("h3", { children: "Final result" }), _jsx("pre", { children: text }), result.error !== undefined && _jsx("p", { children: result.error })] });
}
function PaneHeading({ title, onBack, backLabel }) {
    return (_jsxs("header", { className: css.inspectorHeading, children: [_jsx("button", { type: "button", className: css.drilldownBack, onClick: onBack, children: backLabel }), _jsx("h2", { tabIndex: -1, children: title })] }));
}
/** Full-screen, lazy, revision-aware workflow dashboard. */
export function WorkflowsDashboard({ operations: suppliedOperations, controller, source: suppliedSource, sessionId, open: openProp = true, invoker, onClose, store, storeActions, labels: labelOverrides, }) {
    const candidateOperations = (suppliedOperations ?? controller);
    if (candidateOperations === undefined)
        throw new Error('workflow dashboard operations are unavailable');
    const operations = candidateOperations;
    const labels = labelOverrides ?? dashboardLabelsFromLocale(workflowLocales.en);
    const open = store === undefined ? openProp : store.open;
    const rootRef = useRef(null);
    const openerRef = useRef(null);
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;
    const [source, setSource] = useState(() => (suppliedSource ?? (sessionId === undefined ? emptySource() : operations.get?.(sessionId) ?? emptySource(sessionId))));
    const [localRunId, setLocalRunId] = useState();
    const [localMobileView, setLocalMobileView] = useState('runs');
    const [localTab, setLocalTab] = useState('members');
    const [localMemberId, setLocalMemberId] = useState();
    const [localArtifact, setLocalArtifact] = useState();
    const [now, setNow] = useState(() => Date.now());
    const [narrow, setNarrow] = useState(false);
    const selectedRunId = store?.selectedRunId ?? localRunId;
    const mobileView = store?.mobileView ?? localMobileView;
    const tab = store?.inspectorTab ?? localTab;
    const selectedMemberId = store?.selectedMemberId ?? localMemberId;
    const selectedArtifact = store?.selectedArtifactName ?? localArtifact;
    const [detail, setDetail] = useState({ phase: 'idle' });
    const [members, setMembers] = useState({ phase: 'idle' });
    const [memberDetail, setMemberDetail] = useState({ phase: 'idle' });
    const [logs, setLogs] = useState({ phase: 'idle' });
    const [result, setResult] = useState({ phase: 'idle' });
    const [artifacts, setArtifacts] = useState({ phase: 'idle' });
    const [artifactChunk, setArtifactChunk] = useState({ phase: 'idle' });
    const [pendingControl, setPendingControl] = useState();
    const [controlFeedback, setControlFeedback] = useState();
    const [runPaging, setRunPaging] = useState(false);
    const [runPageError, setRunPageError] = useState();
    const [definitions, setDefinitions] = useState([]);
    const [definitionsPhase, setDefinitionsPhase] = useState('idle');
    const [startingName, setStartingName] = useState();
    const [launchFeedback, setLaunchFeedback] = useState();
    const readGeneration = useRef(0);
    const reads = useRef(new Set());
    const selectedRunRef = useRef(undefined);
    const pendingControlRef = useRef(undefined);
    const controlAbortRef = useRef(undefined);
    const executeControlRef = useRef(() => undefined);
    const membersRef = useRef(members);
    membersRef.current = members;
    const logsRef = useRef(logs);
    logsRef.current = logs;
    const artifactsRef = useRef(artifacts);
    artifactsRef.current = artifacts;
    const chunkRef = useRef(artifactChunk);
    chunkRef.current = artifactChunk;
    useEffect(() => {
        if (suppliedSource !== undefined)
            setSource(suppliedSource);
    }, [suppliedSource]);
    useEffect(() => {
        if (suppliedSource !== undefined || sessionId === undefined || operations.subscribe === undefined)
            return;
        return operations.subscribe(sessionId, setSource);
    }, [operations, sessionId, suppliedSource]);
    useEffect(() => {
        operations.observe(open ? sessionId : undefined);
        return () => { operations.observe(undefined); };
    }, [open, operations, sessionId]);
    useEffect(() => {
        if (!open || sessionId === undefined || typeof operations.listDefinitions !== 'function') {
            if (typeof operations.listDefinitions !== 'function') {
                setDefinitions([]);
                setDefinitionsPhase('idle');
            }
            return;
        }
        const abort = new AbortController();
        setDefinitionsPhase('loading');
        void operations.listDefinitions(sessionId, abort.signal).then(items => {
            if (abort.signal.aborted)
                return;
            setDefinitions(Array.isArray(items) ? items : []);
            setDefinitionsPhase('ready');
        }, error => {
            if (abort.signal.aborted || isAbort(error))
                return;
            setDefinitions([]);
            setDefinitionsPhase('error');
        });
        return () => { abort.abort(); };
    }, [open, operations, sessionId]);
    const rows = useMemo(() => orderWorkflowRuns(source.runs), [source.runs]);
    const activeRows = useMemo(() => rows.filter(run => isActive(run.status)), [rows]);
    const historyRows = useMemo(() => rows.filter(run => !isActive(run.status)), [rows]);
    const selectedRun = (selectedRunId === undefined
        ? rows[0]
        : rows.find(run => run.runId === selectedRunId)) ?? rows[0];
    selectedRunRef.current = selectedRun;
    const selectedKey = selectedRun?.runId;
    const visibleRunIds = useMemo(() => rows.map(run => run.runId), [rows]);
    function selectRun(runId) {
        if (typeof storeActions?.selectRun === 'function')
            storeActions.selectRun(runId);
        else {
            setLocalRunId(runId);
            setLocalMobileView('execution');
        }
    }
    async function startDefinition(name) {
        if (sessionId === undefined || typeof operations.launchDefinition !== 'function' || startingName !== undefined)
            return;
        setStartingName(name);
        setLaunchFeedback(undefined);
        try {
            await operations.launchDefinition(sessionId, name);
            const snap = await operations.refresh(sessionId);
            setSource(snap);
            const newest = [...snap.runs]
                .filter(run => run.name === name)
                .sort((left, right) => right.startedAt - left.startedAt)[0];
            if (newest !== undefined)
                selectRun(newest.runId);
            setLaunchFeedback({ kind: 'notice', message: labels.started(name) });
        }
        catch (error) {
            const reason = error instanceof Error && error.message.length > 0 ? error.message : labels.launchFailed;
            setLaunchFeedback({ kind: 'error', message: reason });
        }
        finally {
            setStartingName(undefined);
        }
    }
    function selectMember(memberId) {
        if (typeof storeActions?.selectMember === 'function')
            storeActions.selectMember(memberId);
        else {
            setLocalMemberId(memberId);
            setLocalTab('members');
            setLocalMobileView('inspector');
        }
    }
    function selectArtifact(name) {
        if (typeof storeActions?.selectArtifact === 'function')
            storeActions.selectArtifact(name);
        else {
            setLocalArtifact(name);
            setLocalTab('artifacts');
            setLocalMobileView('inspector');
        }
    }
    function selectTab(next) {
        if (typeof storeActions?.selectTab === 'function')
            storeActions.selectTab(next);
        else {
            setLocalTab(next);
            setLocalMobileView(next === 'members' ? 'execution' : 'inspector');
            if (next !== 'members')
                setLocalMemberId(undefined);
            if (next !== 'artifacts')
                setLocalArtifact(undefined);
        }
    }
    function showRuns() {
        if (typeof storeActions?.showRuns === 'function')
            storeActions.showRuns();
        else
            setLocalMobileView('runs');
    }
    function showExecution() {
        if (typeof storeActions?.showExecution === 'function')
            storeActions.showExecution();
        else
            setLocalMobileView('execution');
    }
    useEffect(() => {
        if (rows.length === 0) {
            if (typeof storeActions?.reconcileRun === 'function' || typeof storeActions?.showRuns === 'function') {
                if (selectedRunId !== undefined)
                    storeActions.reconcileRun?.(undefined, []);
                if (store?.mobileView !== 'runs')
                    storeActions.showRuns?.();
            }
            else if (localRunId !== undefined || localMobileView !== 'runs') {
                setLocalRunId(undefined);
                setLocalMemberId(undefined);
                setLocalArtifact(undefined);
                setLocalMobileView('runs');
            }
            return;
        }
        if (selectedRunId === undefined || !rows.some(run => run.runId === selectedRunId)) {
            if (typeof storeActions?.reconcileRun === 'function')
                storeActions.reconcileRun(selectedRunId, visibleRunIds);
            else {
                setLocalRunId(rows[0].runId);
                setLocalMemberId(undefined);
                setLocalArtifact(undefined);
            }
        }
    }, [localMobileView, localRunId, rows, selectedRunId, store?.mobileView, storeActions, visibleRunIds]);
    useEffect(() => {
        if (!open || activeRows.length === 0)
            return;
        setNow(Date.now());
        if (typeof window === 'undefined')
            return;
        const timer = window.setInterval(() => { setNow(Date.now()); }, 1_000);
        return () => { window.clearInterval(timer); };
    }, [activeRows.length, open]);
    useEffect(() => {
        if (!open || typeof window === 'undefined')
            return;
        const onResize = () => { setNarrow(window.innerWidth < 1_200); };
        onResize();
        window.addEventListener('resize', onResize);
        return () => { window.removeEventListener('resize', onResize); };
    }, [open]);
    function beginRead() {
        const abort = new AbortController();
        reads.current.add(abort);
        return abort;
    }
    function currentRead(token, abort) {
        return token === readGeneration.current && !abort.signal.aborted;
    }
    function endRead(abort) { reads.current.delete(abort); }
    function mergeRun(run) {
        setSource(previous => {
            const index = previous.runs.findIndex(candidate => candidate.runId === run.runId);
            if (index < 0)
                return previous;
            const current = previous.runs[index];
            if (run.revision < current.revision)
                return previous;
            const next = [...previous.runs];
            next[index] = run;
            return { ...previous, runs: next, phase: 'ready', status: 'ready', error: undefined };
        });
    }
    function loadDetail(runId, token = readGeneration.current) {
        if (sessionId === undefined)
            return;
        const abort = beginRead();
        setDetail(previous => ({ phase: 'loading', value: previous.value }));
        void operations.detail(sessionId, runId, abort.signal).then(value => {
            if (!currentRead(token, abort))
                return;
            setDetail({ phase: 'ready', value });
            mergeRun(value.run);
        }, error => {
            if (currentRead(token, abort) && !isAbort(error)) {
                setDetail(previous => ({ phase: 'error', value: previous.value, error: pageError(error) }));
            }
        }).finally(() => { endRead(abort); });
    }
    function loadMembers(runId, cursor, token = readGeneration.current) {
        if (sessionId === undefined)
            return;
        const previous = cursor === undefined ? undefined : membersRef.current.value;
        const abort = beginRead();
        if (previous === undefined)
            setMembers({ phase: 'loading' });
        else
            setMembers({ phase: 'ready', value: previous, paging: true });
        void operations.members(sessionId, runId, cursor, abort.signal).then(page => {
            if (!currentRead(token, abort))
                return;
            if (previous === undefined)
                setMembers({ phase: 'ready', value: page });
            else {
                const joined = appendItems(previous, page);
                setMembers(joined === undefined
                    ? { phase: 'ready', value: previous, pageError: GENERIC_LOAD_ERROR }
                    : { phase: 'ready', value: joined });
            }
        }, error => {
            if (!currentRead(token, abort) || isAbort(error))
                return;
            const message = pageError(error);
            setMembers(previous === undefined
                ? { phase: 'error', error: message }
                : { phase: 'ready', value: previous, pageError: message });
        }).finally(() => { endRead(abort); });
    }
    function loadMemberDetail(runId, memberId, token = readGeneration.current) {
        if (sessionId === undefined)
            return;
        const abort = beginRead();
        setMemberDetail({ phase: 'loading' });
        void operations.memberDetail(sessionId, runId, memberId, abort.signal).then(value => {
            if (currentRead(token, abort))
                setMemberDetail({ phase: 'ready', value });
        }, error => {
            if (currentRead(token, abort) && !isAbort(error))
                setMemberDetail({ phase: 'error', error: GENERIC_LOAD_ERROR });
        }).finally(() => { endRead(abort); });
    }
    function loadLogs(runId, cursor, token = readGeneration.current) {
        if (sessionId === undefined)
            return;
        const previous = cursor === undefined ? undefined : logsRef.current.value;
        const abort = beginRead();
        if (previous === undefined)
            setLogs({ phase: 'loading' });
        else
            setLogs({ phase: 'ready', value: previous, paging: true });
        void operations.logs(sessionId, runId, cursor, abort.signal).then(page => {
            if (!currentRead(token, abort))
                return;
            if (previous === undefined)
                setLogs({ phase: 'ready', value: page });
            else {
                const joined = appendItems(previous, page);
                setLogs(joined === undefined
                    ? { phase: 'ready', value: previous, pageError: GENERIC_LOAD_ERROR }
                    : { phase: 'ready', value: joined });
            }
        }, error => {
            if (!currentRead(token, abort) || isAbort(error))
                return;
            const message = pageError(error);
            setLogs(previous === undefined
                ? { phase: 'error', error: message }
                : { phase: 'ready', value: previous, pageError: message });
        }).finally(() => { endRead(abort); });
    }
    function loadResult(runId, token = readGeneration.current) {
        if (sessionId === undefined)
            return;
        const abort = beginRead();
        setResult(previous => ({ phase: 'loading', value: previous.value }));
        void operations.result(sessionId, runId, abort.signal).then(value => {
            if (currentRead(token, abort))
                setResult({ phase: 'ready', value });
        }, error => {
            if (currentRead(token, abort) && !isAbort(error)) {
                setResult(previous => ({ phase: 'error', value: previous.value, error: pageError(error) }));
            }
        }).finally(() => { endRead(abort); });
    }
    function loadArtifacts(runId, cursor, token = readGeneration.current) {
        if (sessionId === undefined)
            return;
        const previous = cursor === undefined ? undefined : artifactsRef.current.value;
        const abort = beginRead();
        if (previous === undefined)
            setArtifacts({ phase: 'loading' });
        else
            setArtifacts({ phase: 'ready', value: previous, paging: true });
        void operations.artifacts(sessionId, runId, cursor, abort.signal).then(page => {
            if (!currentRead(token, abort))
                return;
            if (previous === undefined)
                setArtifacts({ phase: 'ready', value: page });
            else {
                const joined = appendItems(previous, page);
                setArtifacts(joined === undefined
                    ? { phase: 'ready', value: previous, pageError: GENERIC_LOAD_ERROR }
                    : { phase: 'ready', value: joined });
            }
        }, error => {
            if (!currentRead(token, abort) || isAbort(error))
                return;
            const message = pageError(error);
            setArtifacts(previous === undefined
                ? { phase: 'error', error: message }
                : { phase: 'ready', value: previous, pageError: message });
        }).finally(() => { endRead(abort); });
    }
    function loadArtifact(runId, name, cursor, token = readGeneration.current) {
        if (sessionId === undefined)
            return;
        const previous = cursor === undefined ? undefined : chunkRef.current.value;
        const expectedRevision = artifactsRef.current.value?.revision;
        const abort = beginRead();
        if (previous === undefined)
            setArtifactChunk({ phase: 'loading' });
        else
            setArtifactChunk({ phase: 'ready', value: previous, paging: true });
        void operations.artifact(sessionId, runId, name, cursor, expectedRevision, abort.signal).then(chunk => {
            if (!currentRead(token, abort))
                return;
            if (previous === undefined) {
                if (chunk.offsetBytes !== 0)
                    setArtifactChunk({ phase: 'error', error: GENERIC_LOAD_ERROR });
                else
                    setArtifactChunk({ phase: 'ready', value: chunk });
            }
            else {
                const joined = appendArtifactChunk(previous, chunk);
                setArtifactChunk(joined === undefined
                    ? { phase: 'ready', value: previous, pageError: GENERIC_LOAD_ERROR }
                    : { phase: 'ready', value: joined });
            }
        }, error => {
            if (!currentRead(token, abort) || isAbort(error))
                return;
            const message = pageError(error);
            setArtifactChunk(previous === undefined
                ? { phase: 'error', error: message }
                : { phase: 'ready', value: previous, pageError: message });
        }).finally(() => { endRead(abort); });
    }
    useEffect(() => {
        const token = ++readGeneration.current;
        for (const request of reads.current)
            request.abort('workflow selection changed');
        reads.current.clear();
        setDetail({ phase: 'idle' });
        setMembers({ phase: 'idle' });
        setMemberDetail({ phase: 'idle' });
        setLogs({ phase: 'idle' });
        setResult({ phase: 'idle' });
        setArtifacts({ phase: 'idle' });
        setArtifactChunk({ phase: 'idle' });
        if (storeActions === undefined) {
            setLocalMemberId(undefined);
            setLocalArtifact(undefined);
            setLocalTab('members');
        }
        controlAbortRef.current?.abort('workflow selection changed');
        controlAbortRef.current = undefined;
        pendingControlRef.current = undefined;
        setPendingControl(undefined);
        setControlFeedback(undefined);
        if (open && selectedKey !== undefined && sessionId !== undefined) {
            loadDetail(selectedKey, token);
            loadMembers(selectedKey, undefined, token);
        }
        return () => {
            if (readGeneration.current !== token)
                return;
            for (const request of reads.current)
                request.abort('workflow selection changed');
            reads.current.clear();
        };
        // Each run identity owns every subordinate cursor and selection.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, operations, selectedKey, sessionId]);
    useEffect(() => {
        if (!open || selectedKey === undefined)
            return;
        if (tab === 'logs' && logs.phase === 'idle')
            loadLogs(selectedKey);
        else if (tab === 'result' && result.phase === 'idle')
            loadResult(selectedKey);
        else if (tab === 'artifacts' && artifacts.phase === 'idle')
            loadArtifacts(selectedKey);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [artifacts.phase, logs.phase, open, result.phase, selectedKey, tab]);
    useEffect(() => {
        if (!open || selectedKey === undefined || selectedMemberId === undefined)
            return;
        loadMemberDetail(selectedKey, selectedMemberId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, selectedKey, selectedMemberId]);
    useEffect(() => {
        if (!open || selectedKey === undefined || selectedArtifact === undefined)
            return;
        setArtifactChunk({ phase: 'idle' });
        loadArtifact(selectedKey, selectedArtifact);
        // The collection revision fences every chunk for this selection.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, selectedArtifact, selectedKey, artifacts.value?.revision]);
    useEffect(() => () => {
        ++readGeneration.current;
        for (const request of reads.current)
            request.abort('workflow dashboard disposed');
        reads.current.clear();
        controlAbortRef.current?.abort('workflow dashboard disposed');
    }, []);
    function executeControl(action) {
        const run = selectedRunRef.current;
        if (sessionId === undefined || run === undefined || pendingControlRef.current !== undefined)
            return;
        if (!run.allowedActions.includes(action))
            return;
        const abort = new AbortController();
        controlAbortRef.current?.abort('workflow control superseded');
        controlAbortRef.current = abort;
        pendingControlRef.current = action;
        setPendingControl(action);
        setControlFeedback(undefined);
        void operations.control(sessionId, run.runId, action, run.revision, abort.signal).then(value => {
            if (abort.signal.aborted || controlAbortRef.current !== abort)
                return;
            mergeRun(value.run);
            setControlFeedback({ kind: 'notice', message: `${labels[action]} requested for ${value.run.displayName}.` });
        }, error => {
            if (abort.signal.aborted || controlAbortRef.current !== abort || isAbort(error))
                return;
            if (error instanceof WorkflowRunsRemoteError) {
                const authoritative = runFromDetails(error);
                if (authoritative !== undefined)
                    mergeRun(authoritative);
                if (error.code === 'revision-conflict') {
                    setControlFeedback({ kind: 'error', message: STALE_CONTROL_ERROR });
                    return;
                }
                if (error.code === 'action-unavailable'
                    && error.details?.reason === 'budget-limited'
                    && action === 'resume') {
                    const displayName = authoritative?.displayName ?? run.displayName;
                    setControlFeedback({
                        kind: 'error',
                        message: `workflow "${displayName}" requires a higher agent_budget to resume`,
                    });
                    return;
                }
            }
            setControlFeedback({ kind: 'error', message: GENERIC_CONTROL_ERROR, retryAction: action });
        }).finally(() => {
            if (controlAbortRef.current !== abort)
                return;
            controlAbortRef.current = undefined;
            pendingControlRef.current = undefined;
            setPendingControl(undefined);
        });
    }
    executeControlRef.current = executeControl;
    function loadMoreRuns() {
        if (sessionId === undefined || source.nextCursor === undefined || runPaging)
            return;
        setRunPaging(true);
        setRunPageError(undefined);
        void operations.loadMore(sessionId).then(() => {
            setRunPageError(undefined);
        }, error => {
            if (!isAbort(error))
                setRunPageError(pageError(error));
        }).finally(() => { setRunPaging(false); });
    }
    useEffect(() => {
        if (!open)
            return;
        openerRef.current = invoker ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
        const root = rootRef.current;
        if (root === null)
            return;
        const overlayLayer = root.closest('[data-shell-overlay]') ?? root;
        const parent = overlayLayer.parentElement;
        const siblings = parent === null ? [] : [...parent.children]
            .filter((node) => node instanceof HTMLElement && node !== overlayLayer)
            .map(element => ({
            element,
            inert: element.getAttribute('inert'),
            ariaHidden: element.getAttribute('aria-hidden'),
        }));
        for (const { element } of siblings) {
            element.setAttribute('inert', '');
            element.setAttribute('aria-hidden', 'true');
        }
        root.focus();
        const recoverFocus = (event) => {
            if (event.target instanceof Node && (event.target === root || root.contains(event.target)))
                return;
            (focusable(root)[0] ?? root).focus();
        };
        const onKey = (event) => {
            if (!(event.target instanceof Node) || (event.target !== root && !root.contains(event.target)))
                return;
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                onCloseRef.current?.();
                return;
            }
            if (event.key === 'Tab') {
                const targets = focusable(root);
                if (targets.length === 0) {
                    event.preventDefault();
                    root.focus();
                    return;
                }
                const first = targets[0];
                const last = targets.at(-1);
                if (event.shiftKey && (document.activeElement === first || document.activeElement === root)) {
                    event.preventDefault();
                    last?.focus();
                }
                else if (!event.shiftKey && document.activeElement === last) {
                    event.preventDefault();
                    first?.focus();
                }
                return;
            }
            if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || event.repeat || editableTarget(event.target))
                return;
            const action = SHORTCUTS[event.key.toLowerCase()];
            const run = selectedRunRef.current;
            if (action === undefined || run === undefined || !run.allowedActions.includes(action))
                return;
            event.preventDefault();
            executeControlRef.current(action);
        };
        document.addEventListener('focusin', recoverFocus, true);
        document.addEventListener('keydown', onKey, true);
        return () => {
            document.removeEventListener('focusin', recoverFocus, true);
            document.removeEventListener('keydown', onKey, true);
            for (const { element, inert, ariaHidden } of siblings) {
                if (inert === null)
                    element.removeAttribute('inert');
                else
                    element.setAttribute('inert', inert);
                if (ariaHidden === null)
                    element.removeAttribute('aria-hidden');
                else
                    element.setAttribute('aria-hidden', ariaHidden);
            }
            if (openerRef.current?.isConnected === true)
                openerRef.current.focus();
            openerRef.current = null;
        };
    }, [invoker, open]);
    useEffect(() => {
        if (!open || !narrow)
            return;
        const root = rootRef.current;
        if (root === null)
            return;
        let target;
        if (mobileView === 'runs') {
            target = [...root.querySelectorAll('[data-workflow-run-id]')]
                .find(element => element.dataset.workflowRunId === selectedKey);
        }
        else if (mobileView === 'execution') {
            target = [...root.querySelectorAll('[data-workflow-member-id]')]
                .find(element => element.dataset.workflowMemberId === selectedMemberId)
                ?? [...root.querySelectorAll('[data-workflow-output-tab]')]
                    .find(element => element.dataset.workflowOutputTab === tab)
                ?? root.querySelector('#workflow-run-heading');
        }
        else {
            target = root.querySelector('[role="tab"][aria-selected="true"]')
                ?? root.querySelector('[data-pane="inspector"] h2');
        }
        target?.focus();
    }, [mobileView, narrow, open, selectedKey, selectedMemberId, tab]);
    if (!open)
        return null;
    const memberRows = members.value?.items ?? [];
    const currentMember = memberRows.find(member => member.memberId === selectedMemberId);
    const execution = detail.value;
    const renderPageError = (state, retry) => (state.pageError === undefined ? null : _jsx(ErrorRetry, { message: state.pageError, onRetry: retry, disabled: state.paging }));
    const logsPane = () => {
        if (logs.phase === 'loading' && logs.value === undefined)
            return _jsx("p", { role: "status", children: "Loading logs\u2026" });
        if (logs.phase === 'error' && logs.value === undefined)
            return _jsx(ErrorRetry, { message: logs.error ?? GENERIC_LOAD_ERROR, onRetry: () => selectedKey !== undefined && loadLogs(selectedKey) });
        const page = logs.value;
        if (page === undefined)
            return _jsx("p", { children: "Logs load on demand." });
        return (_jsxs("div", { className: css.paneContents, children: [page.items.length === 0 && page.evicted === 0 && _jsx("p", { children: labels.noLogLines }), page.items.length === 0 && page.evicted > 0 && _jsx("p", { children: labels.noRetainedLogLines }), page.evicted > 0 && page.items.length > 0 && _jsxs("p", { children: [page.evicted, " earlier log lines were evicted by retention."] }), page.items.map(line => _jsxs("p", { className: css.logLine, children: [_jsx("code", { children: line.index }), _jsx("span", { children: line.text })] }, line.index)), _jsxs("p", { className: css.retention, children: ["Loaded ", page.items.length, " of ", page.total, " retained log lines."] }), page.nextCursor !== undefined && _jsx("button", { type: "button", disabled: logs.paging, onClick: () => selectedKey !== undefined && loadLogs(selectedKey, page.nextCursor), children: logs.paging ? 'Loading…' : 'Load more logs' }), renderPageError(logs, () => selectedKey !== undefined && page.nextCursor !== undefined && loadLogs(selectedKey, page.nextCursor))] }));
    };
    const resultPane = () => {
        if (result.phase === 'loading' && result.value === undefined)
            return _jsx("p", { role: "status", children: "Loading final result\u2026" });
        if (result.phase === 'error' && result.value === undefined)
            return _jsx(ErrorRetry, { message: result.error ?? GENERIC_LOAD_ERROR, onRetry: () => selectedKey !== undefined && loadResult(selectedKey) });
        return result.value === undefined ? _jsx("p", { children: "Final result loads on demand." }) : (_jsxs("div", { className: css.paneContents, children: [_jsx(ResultView, { result: result.value }), result.phase === 'error' && _jsx(ErrorRetry, { message: result.error ?? GENERIC_LOAD_ERROR, onRetry: () => selectedKey !== undefined && loadResult(selectedKey) })] }));
    };
    const artifactPane = () => {
        if (artifacts.phase === 'loading' && artifacts.value === undefined)
            return _jsx("p", { role: "status", children: "Loading scratch artifacts\u2026" });
        if (artifacts.phase === 'error' && artifacts.value === undefined)
            return _jsx(ErrorRetry, { message: artifacts.error ?? GENERIC_LOAD_ERROR, onRetry: () => selectedKey !== undefined && loadArtifacts(selectedKey) });
        const page = artifacts.value;
        if (page === undefined)
            return _jsx("p", { children: "Scratch artifacts load on demand." });
        return (_jsxs("div", { className: css.paneContents, children: [page.items.length === 0 && page.omitted === 0 && _jsx("p", { children: "No scratch artifacts were produced." }), page.items.length === 0 && page.omitted > 0 && _jsx("p", { children: "All artifact names were omitted by retention." }), page.omitted > 0 && page.items.length > 0 && _jsxs("p", { children: [page.omitted, " artifact names were omitted by retention."] }), _jsx("div", { className: css.artifactList, children: page.items.map(item => (_jsxs("button", { type: "button", "aria-pressed": selectedArtifact === item.name, onClick: () => selectArtifact(item.name), children: [_jsx("span", { children: item.name }), _jsxs("span", { children: [item.bytes, " bytes"] })] }, item.name))) }), _jsxs("p", { className: css.retention, children: ["Loaded ", page.items.length, " of ", page.total, " retained artifact names."] }), page.nextCursor !== undefined && _jsx("button", { type: "button", disabled: artifacts.paging, onClick: () => selectedKey !== undefined && loadArtifacts(selectedKey, page.nextCursor), children: artifacts.paging ? 'Loading…' : 'Load more artifacts' }), renderPageError(artifacts, () => selectedKey !== undefined && page.nextCursor !== undefined && loadArtifacts(selectedKey, page.nextCursor)), selectedArtifact !== undefined && (_jsxs("section", { className: css.artifactViewer, "aria-label": `Artifact ${selectedArtifact}`, children: [_jsx("h3", { children: selectedArtifact }), artifactChunk.phase === 'loading' && artifactChunk.value === undefined && _jsx("p", { role: "status", children: "Loading artifact\u2026" }), artifactChunk.phase === 'error' && artifactChunk.value === undefined && _jsx(ErrorRetry, { message: artifactChunk.error ?? GENERIC_LOAD_ERROR, onRetry: () => selectedKey !== undefined && loadArtifact(selectedKey, selectedArtifact) }), artifactChunk.value !== undefined && (_jsxs(_Fragment, { children: [_jsx("pre", { children: artifactChunk.value.text }), _jsxs("p", { className: css.retention, children: [artifactChunk.value.returnedBytes, " of ", artifactChunk.value.totalBytes, " bytes loaded."] }), artifactChunk.value.nextCursor !== undefined && _jsx("button", { type: "button", disabled: artifactChunk.paging, onClick: () => selectedKey !== undefined && loadArtifact(selectedKey, selectedArtifact, artifactChunk.value?.nextCursor), children: artifactChunk.paging ? 'Loading…' : 'Load more artifact content' }), renderPageError(artifactChunk, () => selectedKey !== undefined && artifactChunk.value?.nextCursor !== undefined && loadArtifact(selectedKey, selectedArtifact, artifactChunk.value.nextCursor))] }))] }))] }));
    };
    const inspectorPane = () => {
        if (tab === 'logs')
            return _jsxs(_Fragment, { children: [_jsx(PaneHeading, { title: "Logs", onBack: showExecution, backLabel: labels.backExecution }), logsPane()] });
        if (tab === 'result')
            return _jsxs(_Fragment, { children: [_jsx(PaneHeading, { title: "Final result", onBack: showExecution, backLabel: labels.backExecution }), resultPane()] });
        if (tab === 'artifacts')
            return _jsxs(_Fragment, { children: [_jsx(PaneHeading, { title: "Scratch artifacts", onBack: showExecution, backLabel: labels.backExecution }), artifactPane()] });
        if (selectedMemberId === undefined) {
            return _jsxs(_Fragment, { children: [_jsx(PaneHeading, { title: "Member outcome", onBack: showExecution, backLabel: labels.backExecution }), _jsx("p", { children: "Select a member to inspect its outcome." })] });
        }
        return (_jsxs(_Fragment, { children: [_jsx("button", { type: "button", className: css.drilldownBack, onClick: showExecution, children: labels.backExecution }), _jsx(WorkflowMemberInspector, { member: currentMember, detail: memberDetail.value, loading: memberDetail.phase === 'loading', error: memberDetail.phase === 'error' ? memberDetail.error : undefined, onRetry: () => selectedKey !== undefined && loadMemberDetail(selectedKey, selectedMemberId), labels: labels, onOpenChild: memberDetail.value?.childSessionId === undefined || sessionId === undefined
                        ? undefined
                        : () => operations.resolveAndOpenChild(sessionId, memberDetail.value.childSessionId) })] }));
    };
    return (_jsx("div", { ref: rootRef, className: clsx(css.dashboard), role: "dialog", "aria-modal": "true", "aria-labelledby": "workflow-dashboard-title", tabIndex: -1, "data-workflows-dashboard": true, "data-mobile-view": mobileView, onMouseDown: event => {
            if (event.target === event.currentTarget)
                onCloseRef.current?.();
        }, children: _jsxs("div", { className: css.frame, "data-workflows-frame": true, children: [_jsxs("header", { className: clsx(css.header), children: [_jsxs("div", { className: css.headerCopy, children: [_jsx("p", { className: css.eyebrow, children: "Background orchestration" }), _jsx("h1", { id: "workflow-dashboard-title", children: labels.title }), _jsxs("p", { className: css.topSummary, children: [definitionsPhase === 'ready' || definitions.length > 0 ? `${labels.savedCount(definitions.length)} · ` : '', activeRows.length, " active \u00B7 ", rows.length, " loaded of ", source.total, " runs"] })] }), _jsx("p", { className: css.kbdHint, children: labels.kbdHint }), _jsx("button", { type: "button", className: css.close, onClick: () => onCloseRef.current?.(), "aria-label": labels.close, children: "Close" })] }), source.phase === 'reconnecting' && rows.length > 0 && _jsx("p", { className: css.notice, role: "status", children: labels.reconnecting }), source.phase === 'loading' && rows.length === 0 && (_jsx("p", { className: css.notice, role: "status", children: labels.loading })), source.phase === 'error' && rows.length === 0 && (_jsx(ErrorRetry, { message: source.error ?? GENERIC_LOAD_ERROR, onRetry: () => { if (sessionId !== undefined)
                        void operations.refresh(sessionId).catch(() => undefined); } })), source.phase === 'reconnecting' && rows.length === 0 && (_jsx("p", { className: css.notice, role: "status", children: labels.reconnecting })), source.phase === 'error' && rows.length > 0 && runPageError === undefined && (_jsx(ErrorRetry, { message: GENERIC_LOAD_ERROR, onRetry: () => { if (sessionId !== undefined)
                        void operations.refresh(sessionId).catch(() => undefined); } })), launchFeedback !== undefined && (_jsx("div", { className: launchFeedback.kind === 'error' ? css.error : css.feedback, role: launchFeedback.kind === 'error' ? 'alert' : 'status', children: _jsx("p", { children: launchFeedback.message }) })), rows.length === 0 && source.phase !== 'loading' && source.phase !== 'error' && source.phase !== 'reconnecting' ? (typeof operations.listDefinitions === 'function' ? (_jsxs("main", { className: css.catalog, "aria-label": labels.savedTitle, children: [_jsxs("div", { className: css.catalogHead, children: [_jsx("h2", { children: labels.savedTitle }), _jsx("p", { children: labels.emptyRunsHint })] }), definitionsPhase === 'loading' && _jsx("p", { role: "status", children: labels.loadingSaved }), definitionsPhase === 'error' && (_jsx(ErrorRetry, { message: GENERIC_LOAD_ERROR, onRetry: () => {
                                if (sessionId === undefined || typeof operations.listDefinitions !== 'function')
                                    return;
                                setDefinitionsPhase('loading');
                                void operations.listDefinitions(sessionId).then(items => {
                                    setDefinitions(Array.isArray(items) ? items : []);
                                    setDefinitionsPhase('ready');
                                }, () => { setDefinitionsPhase('error'); });
                            } })), definitionsPhase === 'ready' && definitions.length === 0 && _jsx("p", { children: labels.savedEmpty }), definitions.length > 0 && (_jsx("div", { className: css.savedGrid, children: definitions.map(definition => (_jsx(SavedCard, { definition: definition, starting: startingName, labels: labels, onStart: () => { void startDefinition(definition.name); } }, definition.name))) }))] })) : (_jsxs("main", { className: css.empty, children: [_jsx("h2", { children: labels.emptyTitle }), _jsx("p", { children: labels.emptyBody })] }))) : rows.length === 0 ? null : (_jsxs("div", { className: css.layout, "data-inspector": selectedMemberId !== undefined ? 'open' : 'closed', children: [_jsxs("nav", { className: css.navigator, "aria-label": "Workflow runs", "data-pane": "navigator", children: [definitions.length > 0 && (_jsxs("section", { className: css.runGroup, "aria-labelledby": "saved-workflows-heading", children: [_jsxs("h2", { id: "saved-workflows-heading", children: [labels.savedTitle, " \u00B7 ", definitions.length] }), definitions.map(definition => (_jsxs("div", { className: css.savedRow, children: [_jsxs("div", { children: [_jsx("strong", { children: definition.name }), _jsx("span", { children: definition.description })] }), _jsx("button", { type: "button", className: css.start, disabled: startingName !== undefined, "aria-label": `${labels.start} ${definition.name}`, onClick: () => { void startDefinition(definition.name); }, children: startingName === definition.name ? labels.starting : labels.start })] }, definition.name)))] })), _jsxs("section", { className: css.runGroup, "aria-labelledby": "active-workflows-heading", children: [_jsxs("h2", { id: "active-workflows-heading", children: ["Active \u00B7 ", activeRows.length] }), activeRows.length === 0 && _jsx("p", { className: css.groupEmpty, children: "No active runs" }), activeRows.map(run => _jsx(RunRow, { run: run, selected: run.runId === selectedKey, labels: labels, now: now, onSelect: () => selectRun(run.runId) }, run.runId))] }), _jsxs("section", { className: css.runGroup, "aria-labelledby": "workflow-history-heading", children: [_jsxs("h2", { id: "workflow-history-heading", children: ["History \u00B7 ", historyRows.length] }), historyRows.length === 0 && _jsx("p", { className: css.groupEmpty, children: "No settled runs" }), historyRows.map(run => _jsx(RunRow, { run: run, selected: run.runId === selectedKey, labels: labels, now: now, onSelect: () => selectRun(run.runId) }, run.runId))] }), _jsxs("footer", { className: css.navigatorFooter, children: [_jsxs("p", { children: [rows.length, " loaded of ", source.total, " runs"] }), source.nextCursor !== undefined && _jsx("button", { type: "button", disabled: runPaging, onClick: loadMoreRuns, children: runPaging ? 'Loading…' : 'Load more runs' }), runPageError !== undefined && _jsx(ErrorRetry, { message: runPageError, onRetry: loadMoreRuns, disabled: runPaging })] })] }), _jsxs("main", { className: css.detail, "aria-live": "polite", "data-pane": "execution", children: [_jsx("button", { type: "button", className: css.drilldownBack, onClick: showRuns, children: labels.backRuns }), selectedRun === undefined ? _jsx("p", { children: "Select a run to inspect its progress." }) : (_jsxs(_Fragment, { children: [_jsxs("header", { className: css.executionHeader, children: [_jsxs("div", { children: [_jsx("p", { className: css.eyebrow, children: statusLabel(selectedRun.status, labels) }), _jsx("h2", { id: "workflow-run-heading", tabIndex: -1, children: selectedRun.displayName }), _jsx("p", { children: selectedRun.description }), _jsx("p", { className: css.muted, children: formatDuration((selectedRun.settledAt ?? now) - selectedRun.startedAt) })] }), _jsx("div", { className: css.actions, "aria-label": `Controls for ${selectedRun.displayName}`, children: ACTION_ORDER.filter(action => selectedRun.allowedActions.includes(action)).map(action => (_jsx("button", { type: "button", disabled: pendingControl !== undefined, onClick: () => executeControl(action), children: labels[action] }, action))) })] }), controlFeedback !== undefined && (_jsxs("div", { className: controlFeedback.kind === 'error' ? css.error : css.feedback, role: controlFeedback.kind === 'error' ? 'alert' : 'status', children: [_jsx("p", { children: controlFeedback.message }), controlFeedback.retryAction !== undefined && _jsx("button", { type: "button", disabled: pendingControl !== undefined, onClick: () => executeControl(controlFeedback.retryAction), children: "Retry" })] })), selectedRun.status === 'budget-limited' && (_jsxs("aside", { className: css.callout, role: "note", children: [_jsx("strong", { children: labels.budgetLimitTitle }), _jsx("span", { children: labels.budgetLimitBody })] })), selectedRun.status === 'interrupted' && (_jsx("p", { className: css.notice, role: "status", children: labels.interruptedSettlement })), _jsxs("dl", { className: css.facts, children: [_jsxs("div", { children: [_jsx("dt", { children: "Status" }), _jsx("dd", { children: statusLabel(execution?.run.status ?? selectedRun.status, labels) })] }), _jsxs("div", { children: [_jsx("dt", { children: "Live phase" }), _jsxs("dd", { children: [_jsx("code", { children: execution?.run.phase ?? selectedRun.phase ?? labels.noPhaseYet }), (execution?.run.phase ?? selectedRun.phase) === '' && _jsx("span", { className: css.muted, children: " empty string" })] })] }), _jsxs("div", { children: [_jsx("dt", { children: "Agent budget" }), _jsxs("dd", { children: [selectedRun.budget.spent, "/", selectedRun.budget.total, " spent \u00B7 ", selectedRun.budget.remaining, " remaining"] })] }), _jsxs("div", { children: [_jsx("dt", { children: "Members" }), _jsx("dd", { children: memberSummary(selectedRun, labels) })] }), _jsxs("div", { children: [_jsx("dt", { children: "Stop reason" }), _jsx("dd", { children: selectedRun.terminal?.stopReason ?? '—' })] }), _jsxs("div", { children: [_jsx("dt", { children: "Result" }), _jsx("dd", { children: terminalResult(selectedRun) })] }), selectedRun.terminal?.error !== undefined && selectedRun.terminal.error !== INTERRUPTED_SETTLEMENT && _jsxs("div", { children: [_jsx("dt", { children: "Error" }), _jsx("dd", { children: selectedRun.terminal.error })] })] }), detail.phase === 'loading' && detail.value === undefined && _jsx("p", { role: "status", children: "Loading run detail\u2026" }), detail.phase === 'error' && _jsx(ErrorRetry, { message: detail.error ?? GENERIC_LOAD_ERROR, onRetry: () => loadDetail(selectedRun.runId) }), _jsxs("section", { "aria-labelledby": "declared-phases-heading", children: [_jsx("h3", { id: "declared-phases-heading", children: "Declared phases" }), _jsx("ol", { className: css.phaseRail, children: (() => {
                                                        const declared = declaredWorkflowPhases(execution, selectedRun, memberRows);
                                                        const live = execution?.run.phase ?? selectedRun.phase;
                                                        const currentIndex = live === undefined ? -1 : declared.findIndex(item => item.title === live);
                                                        return declared.map((phase, index) => {
                                                            const current = live !== undefined && phase.title === live;
                                                            const reached = currentIndex >= 0 && index < currentIndex;
                                                            return (_jsxs("li", { "data-current": current ? 'true' : 'false', title: phase.title, children: [_jsx("strong", { children: phase.title }), phase.detail !== undefined && _jsx("span", { children: phase.detail }), (phase.provider !== undefined || phase.model !== undefined) && _jsx("small", { children: [phase.provider, phase.model].filter(Boolean).join(' · ') }), _jsx("small", { children: current ? labels.livePhaseCurrent : reached ? labels.livePhaseReached : labels.livePhaseUpcoming })] }, `${index}:${phase.title}`));
                                                        });
                                                    })() }), declaredWorkflowPhases(execution, selectedRun, memberRows).length === 0 && execution !== undefined && _jsx("p", { children: "No declared phases." })] }), execution?.gate !== undefined && _jsxs("p", { className: css.notice, children: ["Waiting for input: ", execution.gate.message] }), execution?.error !== undefined && _jsxs("p", { className: css.errorText, children: ["Retained error: ", execution.error] }), _jsx("div", { className: css.tabs, role: "tablist", "aria-label": "Workflow execution details", children: ['members', 'logs', 'result', 'artifacts'].map(value => (_jsx("button", { type: "button", role: "tab", "aria-selected": tab === value, "data-workflow-output-tab": value, onClick: () => selectTab(value), children: value === 'members' ? 'Members' : value === 'logs' ? 'Logs' : value === 'result' ? 'Result' : 'Artifacts' }, value))) }), tab === 'members' && (_jsxs("section", { className: css.members, "aria-label": "Workflow members", children: [members.phase === 'loading' && members.value === undefined && _jsx("p", { role: "status", children: "Loading members\u2026" }), members.phase === 'error' && members.value === undefined && _jsx(ErrorRetry, { message: members.error ?? GENERIC_LOAD_ERROR, onRetry: () => loadMembers(selectedRun.runId) }), groupMembers(memberRows).map(group => {
                                                    const groupLabel = group.phase === undefined ? labels.unphased : group.phase === '' ? labels.emptyPhase : group.phase;
                                                    return (_jsxs("section", { className: css.memberGroup, "aria-label": groupLabel, children: [_jsx("h3", { children: groupLabel }), group.members.map(member => (_jsxs("button", { type: "button", "data-workflow-member-id": member.memberId, "data-status": member.status, "aria-pressed": selectedMemberId === member.memberId, onClick: () => selectMember(member.memberId), children: [_jsx("span", { children: member.label === '' ? 'Unnamed member' : member.label }), _jsx("span", { children: labels.memberStatus[member.status] }), _jsx("span", { children: memberOutcomeLabel(member, labels) })] }, member.memberId)))] }, group.key));
                                                }), members.value !== undefined && memberRows.length === 0 && (_jsx("p", { className: css.activity, children: selectedRun.budget.spent > 0 ? labels.noMembersYet : 'No members started.' })), members.value !== undefined && _jsxs("p", { className: css.retention, children: ["Loaded ", memberRows.length, " of ", members.value.total, " members."] }), members.value?.nextCursor !== undefined && _jsx("button", { type: "button", disabled: members.paging, onClick: () => loadMembers(selectedRun.runId, members.value?.nextCursor), children: members.paging ? 'Loading…' : 'Load more members' }), renderPageError(members, () => members.value?.nextCursor !== undefined && loadMembers(selectedRun.runId, members.value.nextCursor))] }))] }))] }), _jsx("aside", { className: css.inspector, "aria-live": "polite", "data-pane": "inspector", children: inspectorPane() })] }))] }) }));
}
function SavedCard({ definition, starting, labels, onStart }) {
    return (_jsxs("article", { className: css.savedCard, children: [_jsxs("div", { children: [_jsx("strong", { children: definition.name }), definition.description !== '' && _jsx("p", { children: definition.description }), _jsx("span", { className: css.muted, children: [definition.scope, definition.whenToUse].filter(Boolean).join(' · ') })] }), _jsx("button", { type: "button", className: css.start, disabled: starting !== undefined, "aria-label": `${labels.start} ${definition.name}`, onClick: onStart, children: starting === definition.name ? labels.starting : labels.start })] }));
}
function RunRow({ run, selected, onSelect, labels, now }) {
    const settlement = run.status === 'interrupted'
        && (run.terminal?.error === undefined || run.terminal.error === INTERRUPTED_SETTLEMENT)
        ? labels.interruptedSettlement
        : undefined;
    return (_jsxs("button", { type: "button", className: css.runRow, "data-selected": selected ? 'true' : 'false', "data-status": run.status, "data-workflow-run-id": run.runId, "aria-pressed": selected, onClick: onSelect, children: [_jsxs("span", { className: css.runTitle, children: [_jsx("strong", { children: run.displayName }), _jsx("span", { children: statusLabel(run.status, labels) })] }), _jsx("span", { children: run.description }), _jsxs("span", { children: ["Phase: ", _jsx("code", { children: run.phase ?? labels.noPhaseYet }), run.phase === '' && ' (empty string)'] }), _jsxs("span", { children: [budgetSummary(run), " \u00B7 ", memberSummary(run, labels)] }), _jsx("span", { children: formatDuration((run.settledAt ?? now) - run.startedAt) }), _jsx("span", { children: terminalResult(run) }), run.terminal?.error !== undefined && run.terminal.error !== INTERRUPTED_SETTLEMENT && _jsxs("span", { children: ["Error: ", run.terminal.error] }), settlement !== undefined && _jsx("span", { children: settlement }), _jsxs("span", { children: ["Stop reason: ", run.terminal?.stopReason ?? '—'] })] }));
}
export default WorkflowsDashboard;
//# sourceMappingURL=WorkflowsDashboard.js.map