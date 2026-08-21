import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useRef, useState, } from 'react';
import { workflowChatLabelsFromLocale, workflowLocales } from './locales.js';
import css from './WorkflowRunPanel.module.css';
const DEFAULT_LABELS = workflowChatLabelsFromLocale(workflowLocales.en);
function abnormal(status) {
    return status === 'failed' || status === 'cancelled' || status === 'interrupted';
}
function factsForPhase(phase) {
    const mode = phase.members.some(member => abnormal(member.status))
        ? 'abnormal'
        : phase.members.some(member => member.status === 'running') ? 'running' : 'clean';
    return { mode, count: phase.members.length };
}
function factsForRun(data) {
    const phases = data.phases.map(factsForPhase);
    const mode = abnormal(data.status) || phases.some(phase => phase.mode === 'abnormal')
        ? 'abnormal'
        : data.status === 'running' || phases.some(phase => phase.mode === 'running')
            ? 'running'
            : 'clean';
    return { mode, count: phases.reduce((total, phase) => total + phase.count, 0) };
}
export function initialWorkflowDisclosure(facts) {
    return { ...facts, open: facts.mode !== 'clean' };
}
/** Force abnormal/running open; auto-fold a clean completion once. */
export function advanceWorkflowDisclosure(current, facts) {
    if (facts.mode !== 'clean')
        return { ...facts, open: true };
    if (current.mode !== 'clean')
        return { ...facts, open: false };
    if (current.count !== facts.count)
        return { ...facts, open: false };
    return { ...facts, open: current.open };
}
function phaseName(phase, labels) {
    if (phase === null)
        return labels.unphased;
    return phase === '' ? labels.emptyPhase : phase;
}
function memberName(label, labels) {
    return label === '' ? labels.emptyMember : label;
}
function statusSummary(members, labels) {
    const counts = new Map();
    for (const member of members)
        counts.set(member.status, (counts.get(member.status) ?? 0) + 1);
    const order = ['completed', 'running', 'failed', 'cancelled', 'interrupted'];
    return order
        .filter(status => (counts.get(status) ?? 0) > 0)
        .map(status => labels.statusCount(status, counts.get(status) ?? 0))
        .join(' · ');
}
function StatusDot({ status }) {
    return _jsx("span", { className: css.stateDot, "data-status": status, "aria-hidden": "true" });
}
function DisclosureHeader({ clean, open, onToggle, className, children, }) {
    if (!clean) {
        return (_jsxs("div", { className: className, "data-forced-open": "true", children: [_jsx("span", { className: css.chevron, "aria-hidden": "true", children: "\u203A" }), children] }));
    }
    return (_jsxs("button", { type: "button", className: className, "aria-expanded": open, onClick: onToggle, children: [_jsx("span", { className: css.chevron, "data-open": open ? 'true' : 'false', "aria-hidden": "true", children: "\u203A" }), children] }));
}
function MemberRow({ member, labels, isChildAvailable, onOpen, }) {
    const label = memberName(member.label, labels);
    const available = isChildAvailable(member.childId);
    const content = (_jsxs(_Fragment, { children: [_jsx(StatusDot, { status: member.status }), _jsx("span", { className: css.memberLabel, children: label }), _jsx("span", { className: css.memberStatus, children: labels.status[member.status] })] }));
    if (!available)
        return _jsx("div", { className: css.memberRow, "data-member-status": member.status, children: content });
    return (_jsx("button", { type: "button", className: css.memberButton, "data-member-status": member.status, "aria-label": labels.openMember(label), onClick: () => { onOpen(member); }, children: content }));
}
function PhaseSection({ phase, choice, labels, isChildAvailable, onToggle, onOpen, }) {
    const clean = choice.mode === 'clean';
    const open = clean ? choice.open : true;
    return (_jsxs("section", { className: css.phase, "aria-label": phaseName(phase.phase, labels), children: [_jsxs(DisclosureHeader, { clean: clean, open: open, onToggle: onToggle, className: css.phaseHeader, children: [_jsx("span", { className: css.phaseTitle, children: phaseName(phase.phase, labels) }), _jsx("span", { className: css.phaseCount, children: labels.inspect(phase.members.length) }), _jsx("span", { className: css.phaseStatus, children: statusSummary(phase.members, labels) })] }), open && (_jsx("div", { className: css.members, children: phase.members.map(member => (_jsx(MemberRow, { member: member, labels: labels, isChildAvailable: isChildAvailable, onOpen: onOpen }, member.seq))) }))] }));
}
/** Render one durable workflow run without exposing logical run or child ids. */
export function WorkflowRunPanel({ node, resolveAndOpenChild, isChildAvailable = () => false, labels: labelOverrides, }) {
    const labels = {
        ...DEFAULT_LABELS,
        ...labelOverrides,
        status: { ...DEFAULT_LABELS.status, ...labelOverrides?.status },
    };
    const runFacts = factsForRun(node.data);
    const [runChoice, setRunChoice] = useState(() => initialWorkflowDisclosure(runFacts));
    const [phaseChoices, setPhaseChoices] = useState(() => new Map(node.data.phases.map(phase => [phase.key, initialWorkflowDisclosure(factsForPhase(phase))])));
    const [navigationFeedback, setNavigationFeedback] = useState();
    const navigationGeneration = useRef(0);
    useEffect(() => {
        setRunChoice(current => advanceWorkflowDisclosure(current, runFacts));
        setPhaseChoices((current) => {
            const next = new Map();
            for (const phase of node.data.phases) {
                const facts = factsForPhase(phase);
                next.set(phase.key, current.has(phase.key)
                    ? advanceWorkflowDisclosure(current.get(phase.key), facts)
                    : initialWorkflowDisclosure(facts));
            }
            return next;
        });
    }, [node.data, runFacts.count, runFacts.mode]);
    useEffect(() => () => { navigationGeneration.current += 1; }, []);
    const runOpen = runChoice.mode === 'clean' ? runChoice.open : true;
    const openMember = (member) => {
        const generation = ++navigationGeneration.current;
        setNavigationFeedback(undefined);
        void resolveAndOpenChild(member.childId).then(opened => {
            if (generation === navigationGeneration.current && !opened) {
                setNavigationFeedback(labels.childUnavailable);
            }
        }, () => {
            if (generation === navigationGeneration.current)
                setNavigationFeedback(labels.childFailed);
        });
    };
    return (_jsxs("section", { className: css.root, "data-workflow-run": true, "data-run-status": node.data.status, children: [_jsxs(DisclosureHeader, { clean: runChoice.mode === 'clean', open: runOpen, onToggle: () => { setRunChoice(current => ({ ...current, open: !current.open })); }, className: css.runHeader, children: [_jsx("span", { className: css.runName, children: node.data.name }), _jsx("span", { className: css.runCount, children: labels.inspect(runFacts.count) }), _jsxs("span", { className: css.runStatus, children: [_jsx(StatusDot, { status: node.data.status }), labels.status[node.data.status]] })] }), runOpen && (_jsx("div", { className: css.phaseList, children: node.data.phases.length === 0
                    ? _jsx("p", { className: css.empty, children: labels.noMembers })
                    : node.data.phases.map((phase) => {
                        const choice = phaseChoices.get(phase.key) ?? initialWorkflowDisclosure(factsForPhase(phase));
                        return (_jsx(PhaseSection, { phase: phase, choice: choice, labels: labels, isChildAvailable: isChildAvailable, onToggle: () => {
                                setPhaseChoices((current) => {
                                    const next = new Map(current);
                                    next.set(phase.key, { ...choice, open: !choice.open });
                                    return next;
                                });
                            }, onOpen: openMember }, `${phase.key}:${choice.mode === 'clean' ? choice.count : 'active'}`));
                    }) })), navigationFeedback !== undefined && (_jsx("p", { className: css.navigationFeedback, role: "status", children: navigationFeedback }))] }));
}
export default WorkflowRunPanel;
//# sourceMappingURL=WorkflowRunPanel.js.map