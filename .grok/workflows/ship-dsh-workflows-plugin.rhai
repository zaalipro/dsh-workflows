let meta = #{
    name: "ship-dsh-workflows-plugin",
    description: "100+ grok-4.6 agents: understand official H and the current plugin, perfectly review the working fork, then close remaining installable-plugin gaps in dsh-workflows",
    when_to_use: "When shipping @zaalipro/dsh-workflows as an installable DeepSeek Harness plugin instead of maintaining the workflows fork",
    phases: [
        #{ title: "Understand-Situation", detail: "44 grok-4.6 agents map official H seams and the current plugin" },
        #{ title: "Review-Working-Fork", detail: "52 grok-4.6 agents perfect-review the bundled-in-fork workflows product" },
        #{ title: "Synthesize-Gaps", detail: "12 agents merge the maps into a fail-closed implementation packet" },
        #{ title: "Implement", detail: "12 writers close remaining package gaps; never touch the example trees" },
        #{ title: "Verify", detail: "8 skeptics plus tests confirm the plugin, not a second engine" },
    ],
};

let findings_schema = #{
    "type": "object",
    "required": ["findings", "summary"],
    "properties": #{
        "summary": #{ "type": "string" },
        "findings": #{
            "type": "array",
            "maxItems": 8,
            "items": #{
                "type": "object",
                "required": ["area", "severity", "issue", "evidence", "keep", "next"],
                "properties": #{
                    "area": #{ "type": "string" },
                    "severity": #{ "type": "string" },
                    "issue": #{ "type": "string" },
                    "evidence": #{ "type": "string" },
                    "keep": #{ "type": "string" },
                    "next": #{ "type": "string" },
                    "file": #{ "type": "string" },
                },
            },
        },
    },
};

let gap_schema = #{
    "type": "object",
    "required": ["area", "must_preserve", "must_fix", "files", "priority", "summary"],
    "properties": #{
        "area": #{ "type": "string" },
        "summary": #{ "type": "string" },
        "must_preserve": #{ "type": "array", "items": #{ "type": "string" } },
        "must_fix": #{ "type": "array", "items": #{ "type": "string" } },
        "files": #{ "type": "array", "items": #{ "type": "string" } },
        "priority": #{ "type": "string" },
        "blocked_on_h": #{ "type": "boolean" },
    },
};

let impl_schema = #{
    "type": "object",
    "required": ["area", "status", "summary", "files_touched"],
    "properties": #{
        "area": #{ "type": "string" },
        "status": #{ "type": "string" },
        "summary": #{ "type": "string" },
        "files_touched": #{ "type": "array", "items": #{ "type": "string" } },
        "tests_run": #{ "type": "string" },
        "blocked_reason": #{ "type": "string" },
    },
};

let verdict_schema = #{
    "type": "object",
    "required": ["area", "ok", "issues"],
    "properties": #{
        "area": #{ "type": "string" },
        "ok": #{ "type": "boolean" },
        "issues": #{
            "type": "array",
            "maxItems": 8,
            "items": #{
                "type": "object",
                "required": ["severity", "issue", "file", "fix"],
                "properties": #{
                    "severity": #{ "type": "string" },
                    "issue": #{ "type": "string" },
                    "file": #{ "type": "string" },
                    "fix": #{ "type": "string" },
                },
            },
        },
    },
};

fn as_str(x) {
    if x == () { return ""; }
    if type_of(x) == "string" { return x; }
    ""
}

fn sev_rank(s) {
    if s == "critical" { return 0; }
    if s == "high" { return 1; }
    if s == "medium" { return 2; }
    if s == "low" { return 3; }
    4
}

fn inspect_law() {
    let s = "MAXIMUM REASONING EFFORT. Model grok-4.6. Think through the real APIs before answering. ";
    s += "You are mapping a DeepSeek Harness installable workflows PLUGIN. ";
    s += "Product UX matches Grok Build: host-run JS workflows, /create-workflow, /workflow, /workflows, named launches, live run dashboard, background launch, display-name handles, pause/resume/stop/save. ";
    s += "NOT a second engine, NOT Rhai, NOT a permanent fork. Official worker-thread engine stays the only evaluator. ";
    s += "READ-ONLY. Use read_file, grep, list_dir. Read-only git/rg via run_terminal_command is allowed. NEVER write, NEVER git commit, NEVER git checkout. ";
    s += "FORBIDDEN to modify: /Users/zaali/dev/deepseek-harness and /Users/zaali/dev/research/deepseek-harness. Treat both as example trees only. ";
    s += "Official example (READ ONLY): /Users/zaali/dev/research/deepseek-harness on feat/external-workflow-prerequisites. Spec still names stock 141eb6f / dsh-v0.1.0-rc.8 as the incompatible RC8 baseline; this checkout already has H-like checkpoint, deferStart, scratch, validate, gates. ";
    s += "Working fork (READ ONLY): /Users/zaali/dev/deepseek-harness at 391c829 — workflows are bundled in and work. Behavioral donor only; do not copy RC5-derived files wholesale. ";
    s += "Plugin workspace: /Users/zaali/dev/dsh-workflows — @zaalipro/dsh-workflows@0.1.0-rc.1. There is already substantial progress; do not pretend the repo is empty. ";
    s += "Required product docs when relevant: /Users/zaali/dev/dsh-workflows/grok_workflows.md, /Users/zaali/dev/dsh-workflows/ds_workflows.md, /Users/zaali/dev/dsh-workflows/.specs/01_installable_workflows_package_spec.md, /Users/zaali/dev/dsh-workflows/README.md. ";
    s += "Never invent file contents. Cite file:line or a short quote. Severity must be critical, high, medium, low, or info. ";
    s += "Empty findings is valid ONLY after you inspected the named paths with tools. ";
    s += "Each finding: area, severity, issue, evidence, keep (what already works and must be preserved), next (what the plugin or H must do), optional file. ";
    s
}

fn write_law() {
    let s = inspect_law();
    s += "WRITE MODE. You MAY edit files, but ONLY under /Users/zaali/dev/dsh-workflows. ";
    s += "NEVER modify /Users/zaali/dev/deepseek-harness or /Users/zaali/dev/research/deepseek-harness. If a gap is an official H prerequisite, document it; do not patch those trees. ";
    s += "Do not copy fork files wholesale. Re-express behavior against official H APIs (deferStart, checkpoint, scratch capability, validate, gates). ";
    s += "Do not add a second workflow engine or a Rhai runtime. Do not vendor Grok CLI. ";
    s += "Match existing package style: CSS Modules, --dsw-alias-* tokens, no Tailwind, bilingual docs, Cordis effects, Schemastery config, 100% unit coverage for new runtime code. ";
    s += "Prefer closing missing spec tests and real bugs over drive-by refactors. Run the focused tests you touch. ";
    s += "Human surfaces use display names only; never print internal run UUIDs in command text. ";
    s
}

fn read_prompt(focus, paths) {
    let p = inspect_law();
    p += "LENS: ";
    p += focus;
    p += " Inspect these paths first, then follow real imports, tests, and docs: ";
    p += paths;
    p += " Return at most 8 findings plus a short summary of what you actually read.";
    p
}

fn grok_read_job(label, focus, paths, schema) {
    #{
        prompt: read_prompt(focus, paths),
        label: label,
        capability_mode: "read-only",
        model: "grok-4.6",
        output_schema: schema,
    }
}

fn collect_findings(results) {
    let out = [];
    if results == () { return out; }
    for r in results {
        if r != () && r.success && r.output != () && r.output.findings != () {
            for f in r.output.findings { out.push(f); }
        }
    }
    out
}

fn collect_summaries(results) {
    let out = [];
    if results == () { return out; }
    for r in results {
        if r != () && r.success && r.output != () {
            let s = as_str(r.output.summary);
            if s != "" { out.push(s); }
        }
    }
    out
}

fn take_top(findings, n) {
    let selected = [];
    if findings == () { return selected; }
    if n <= 0 { return selected; }
    let used = [];
    for f in findings { used.push(false); }
    let rank = 0;
    while selected.len() < n && rank < 5 {
        let i = 0;
        for f in findings {
            if selected.len() < n {
                if used[i] == false && sev_rank(as_str(f.severity)) == rank {
                    selected.push(f);
                    used[i] = true;
                }
            }
            i += 1;
        }
        rank += 1;
    }
    selected
}

fn encode_list(items) {
    if items == () { return "[]"; }
    json_encode(items)
}

// ---------------------------------------------------------------------------
phase("Understand-Situation");
log("Phase 1: 44 grok-4.6 agents map official H and the current plugin. No writes.");

let situation_topics = [
    #{ id: "official-engine-types", focus: "Official workflow types, meta, gates, error codes, result, agent info. What H already exposes vs stock RC8.", paths: "/Users/zaali/dev/research/deepseek-harness/packages/workflow/workflow/src/types.ts /Users/zaali/dev/research/deepseek-harness/packages/workflow/workflow/src/index.ts /Users/zaali/dev/research/deepseek-harness/packages/workflow/workflow/README.md" },
    #{ id: "official-start-api", focus: "WorkflowStartRequest, deferStart, release, replay, scratch, maxTotalAgents, parent Agent, cancel/resume/dispose.", paths: "/Users/zaali/dev/research/deepseek-harness/packages/workflow/workflow/src/runtime-types.ts /Users/zaali/dev/research/deepseek-harness/packages/workflow/workflow/src/index.ts /Users/zaali/dev/research/deepseek-harness/packages/workflow/workflow/tests/workflow.spec.ts" },
    #{ id: "official-checkpoint-journal", focus: "Journal entry kinds, callId fingerprint, checkpoint() readiness, JOURNAL_DIVERGENCE, CHECKPOINT_NOT_READY, replay determinism.", paths: "/Users/zaali/dev/research/deepseek-harness/packages/workflow/workflow/src/runtime-types.ts /Users/zaali/dev/research/deepseek-harness/packages/workflow/workflow/src/types.ts /Users/zaali/dev/research/deepseek-harness/packages/workflow/workflow-worker-thread/src/index.ts" },
    #{ id: "official-worker-host", focus: "Worker-thread host: start, deferred execution, observer events, cancellation, child RPC, disposal.", paths: "/Users/zaali/dev/research/deepseek-harness/packages/workflow/workflow-worker-thread/src/host.ts /Users/zaali/dev/research/deepseek-harness/packages/workflow/workflow-worker-thread/src/index.ts /Users/zaali/dev/research/deepseek-harness/packages/workflow/workflow-worker-thread/README.md" },
    #{ id: "official-worker-runtime-hooks", focus: "Script hooks: agent, parallel thunks vs maps, pipeline, phase, log, complete, pause, await_user, budget, scratch. Unsupported options fatal.", paths: "/Users/zaali/dev/research/deepseek-harness/packages/workflow/workflow-worker-thread/src/runtime.ts /Users/zaali/dev/research/deepseek-harness/packages/workflow/workflow-worker-thread/tests/hooks.spec.ts /Users/zaali/dev/research/deepseek-harness/packages/workflow/workflow-worker-thread/tests/runtime-edge-coverage.spec.ts" },
    #{ id: "official-worker-session", focus: "Worker session drive loop, gate parking, validate-only canned path, deterministic globals.", paths: "/Users/zaali/dev/research/deepseek-harness/packages/workflow/workflow-worker-thread/src/session.ts /Users/zaali/dev/research/deepseek-harness/packages/workflow/workflow-worker-thread/src/realm.ts /Users/zaali/dev/research/deepseek-harness/packages/workflow/workflow-worker-thread/tests/session.spec.ts" },
    #{ id: "official-worker-protocol", focus: "Host/worker protocol messages, scratch, checkpoint, validation, fatal WorkflowError transport.", paths: "/Users/zaali/dev/research/deepseek-harness/packages/workflow/workflow-worker-thread/src/protocol.ts /Users/zaali/dev/research/deepseek-harness/packages/workflow/workflow-worker-thread/src/types.ts /Users/zaali/dev/research/deepseek-harness/packages/workflow/workflow-worker-thread/tests/protocol-edge-coverage.spec.ts" },
    #{ id: "official-validate-only", focus: "WorkflowValidateRequest/Result: canned agents, would-pause, no run directory, line diagnostics.", paths: "/Users/zaali/dev/research/deepseek-harness/packages/workflow/workflow/src/runtime-types.ts /Users/zaali/dev/research/deepseek-harness/packages/workflow/workflow-worker-thread/src/index.ts /Users/zaali/dev/research/deepseek-harness/packages/workflow/workflow-worker-thread/tests/index-journal-validation.spec.ts" },
    #{ id: "official-tool-workflow", focus: "Stock model workflow tool: blocking vs background, schema, Session tool-workflow/* projection, usage policy.", paths: "/Users/zaali/dev/research/deepseek-harness/packages/workflow/tool-workflow/src/index.ts /Users/zaali/dev/research/deepseek-harness/packages/workflow/tool-workflow/src/types.ts /Users/zaali/dev/research/deepseek-harness/packages/workflow/tool-workflow/tests/tool-workflow.spec.ts" },
    #{ id: "official-commands-plane", focus: "ctx.commands register/parse/execute, unknown-slash fallback, image admission, command/run and command/done.", paths: "/Users/zaali/dev/research/deepseek-harness/packages/interaction/commands/src/index.ts /Users/zaali/dev/research/deepseek-harness/packages/interaction/commands/src/types.ts /Users/zaali/dev/research/deepseek-harness/docs/subsystems/commands.md" },
    #{ id: "official-ui-commands-actions", focus: "Web slash menu, client-owned actions for exact bare /workflows, popupSelect, leadingInput, unknown commands stay in composer.", paths: "/Users/zaali/dev/research/deepseek-harness/packages/client/ui-commands/src/client/index.ts /Users/zaali/dev/research/deepseek-harness/packages/client/ui-commands/src/client/contract.ts /Users/zaali/dev/research/deepseek-harness/packages/client/ui-commands/src/client/service.ts" },
    #{ id: "official-plan-mode-steer", focus: "How /plan steers the model. /create-workflow must copy this composition, not invent a blank editor.", paths: "/Users/zaali/dev/research/deepseek-harness/packages/plan/plan-mode/src/index.ts /Users/zaali/dev/research/deepseek-harness/packages/plan/plan-mode/src/types.ts" },
    #{ id: "official-skills-trust", focus: "Skill registry, filesystem roots, trusted/packaged skill precedence needed so create-workflow cannot be shadowed.", paths: "/Users/zaali/dev/research/deepseek-harness/packages/skill/skill/src/index.ts /Users/zaali/dev/research/deepseek-harness/packages/skill/skill-filesystem/src/index.ts /Users/zaali/dev/research/deepseek-harness/docs/subsystems/skills.md" },
    #{ id: "official-ui-workflow-run", focus: "In-chat workflow-run node, omitted phase vs empty string, member grouping, fold/replay. Dashboard must not replace this.", paths: "/Users/zaali/dev/research/deepseek-harness/packages/client/ui-workflow-run/src/client /Users/zaali/dev/research/deepseek-harness/packages/client/ui-workflow-run/README.md" },
    #{ id: "official-session-projection", focus: "Durable tool-workflow/* events: run-start, agent-start, agent-end, run-end. Exact payloads. No durable phase/log.", paths: "/Users/zaali/dev/research/deepseek-harness/packages/session/session-projection/src/index.ts /Users/zaali/dev/research/deepseek-harness/packages/session/session-projection/src/types.ts" },
    #{ id: "official-remotes-registry", focus: "Typert remotes, Agent-first methods, ApiRemoteEventRegistry, generated contributions from installed packages.", paths: "/Users/zaali/dev/research/deepseek-harness/packages/api/remotes/src/index.ts /Users/zaali/dev/research/deepseek-harness/packages/api/remotes/src/registry.ts /Users/zaali/dev/research/deepseek-harness/packages/api/remotes/src/remote-events.ts /Users/zaali/dev/research/deepseek-harness/packages/api/remotes/src/types.ts" },
    #{ id: "official-apiproxy-events", focus: "Bounded forwarded-event transport, keyed-latest vs FIFO, invalidate-all overflow, no protected run heads on the wire.", paths: "/Users/zaali/dev/research/deepseek-harness/packages/host/apiproxy/src/api-proxy.ts /Users/zaali/dev/research/deepseek-harness/packages/host/apiproxy/src/frame-queue.ts /Users/zaali/dev/research/deepseek-harness/packages/host/apiproxy/src/index.ts" },
    #{ id: "official-client-runtime", focus: "Client connection, remote.$mount, connection/reset, hostDescription, session catalog for child navigation.", paths: "/Users/zaali/dev/research/deepseek-harness/packages/client/runtime/src/client/index.ts /Users/zaali/dev/research/deepseek-harness/packages/client/connection/src/client/index.ts /Users/zaali/dev/research/deepseek-harness/packages/client/connection/src/client/connection.ts" },
    #{ id: "official-fs-nofollow", focus: "FileSystem capability, atomic write, final-component no-follow, descriptor-rooted private directories the plugin must use.", paths: "/Users/zaali/dev/research/deepseek-harness/packages/fs/fs/src/index.ts /Users/zaali/dev/research/deepseek-harness/packages/fs/fs-local/src/index.ts /Users/zaali/dev/research/deepseek-harness/packages/fs/fs-local/src/fsio.ts /Users/zaali/dev/research/deepseek-harness/packages/fs/fs-sandbox/src/index.ts" },
    #{ id: "official-user-questions", focus: "ctx.userQuestions.ask, Agent identity fencing, dismiss/cancel, the pattern for workflow gates.", paths: "/Users/zaali/dev/research/deepseek-harness/packages/interaction/user-questions/src/index.ts /Users/zaali/dev/research/deepseek-harness/packages/interaction/user-questions/src/types.ts" },
    #{ id: "official-tools-replace", focus: "ToolRuntime.replace, official workflow tool identity, exact-Agent shadow requirements, no duplicate tools.", paths: "/Users/zaali/dev/research/deepseek-harness/packages/core/tools/src/index.ts /Users/zaali/dev/research/deepseek-harness/packages/core/tools/src/types.ts /Users/zaali/dev/research/deepseek-harness/packages/core/tools/src/schema.ts" },
    #{ id: "official-system-prompt-replace", focus: "SystemPrompt.replaceSection for tool:workflow, official contribution identity, rollback on partial failure.", paths: "/Users/zaali/dev/research/deepseek-harness/packages/core/system-prompt/src/index.ts" },
    #{ id: "official-typert-generate", focus: "WorkspaceTypertGenerator.generate returns artifacts, focused package/face, no hand-authored Remote descriptors.", paths: "/Users/zaali/dev/research/deepseek-harness/packages/typert/generator/src/workspace.ts /Users/zaali/dev/research/deepseek-harness/packages/typert/generator/src/index.ts /Users/zaali/dev/dsh-workflows/scripts/build.mjs" },
    #{ id: "official-bundle-web-headless", focus: "How web and headless profiles compose plugins, dsh plugin add, cordis patches, Loader rows.", paths: "/Users/zaali/dev/research/deepseek-harness/packages/bundle /Users/zaali/dev/research/deepseek-harness/docs/architecture.md /Users/zaali/dev/dsh-workflows/cordis.patch.yml /Users/zaali/dev/dsh-workflows/package.json" },
    #{ id: "official-architecture-docs", focus: "Harness plugin rules: everything is a plugin, capability seams, no agent-loop hacks, AGENTS.md and docs/AGENTS.md.", paths: "/Users/zaali/dev/research/deepseek-harness/AGENTS.md /Users/zaali/dev/research/deepseek-harness/docs/AGENTS.md /Users/zaali/dev/research/deepseek-harness/docs/architecture.md /Users/zaali/dev/research/deepseek-harness/docs/capability-seams.md" },
    #{ id: "official-workflow-subsystem-docs", focus: "Official workflow subsystem docs vs deferred items. What stock engine already did before the plugin.", paths: "/Users/zaali/dev/research/deepseek-harness/docs/subsystems/workflow.md /Users/zaali/dev/research/deepseek-harness/packages/workflow/README.md /Users/zaali/dev/research/deepseek-harness/packages/workflow/tool-workflow/README.md" },
    #{ id: "official-prereq-branch", focus: "What feat/external-workflow-prerequisites already landed vs spec H list: checkpoint, gates, scratch, validate, deferStart, remotes registry, ui-commands actions, skill trust, fs private dirs, tool replace.", paths: "/Users/zaali/dev/research/deepseek-harness/packages/workflow /Users/zaali/dev/research/deepseek-harness/packages/api/remotes/src /Users/zaali/dev/research/deepseek-harness/packages/client/ui-commands/src /Users/zaali/dev/research/deepseek-harness/packages/core/tools/src /Users/zaali/dev/research/deepseek-harness/packages/skill/skill/src" },
    #{ id: "official-git-vs-rc8", focus: "Git reality of the official example: branch, HEAD, whether 141eb6f still exists, 0.1.1-rc.1 merge, what changed in workflow packages since RC8. Use git log/diff read-only.", paths: "/Users/zaali/dev/research/deepseek-harness/.git /Users/zaali/dev/research/deepseek-harness/package.json /Users/zaali/dev/research/deepseek-harness/packages/workflow" },
    #{ id: "plugin-index-compat", focus: "Host aggregate: inject list, H marker check, effect-owned children, teardown, no RC8 activation.", paths: "/Users/zaali/dev/dsh-workflows/src/index.ts /Users/zaali/dev/dsh-workflows/src/invariant.ts /Users/zaali/dev/dsh-workflows/cordis.patch.yml" },
    #{ id: "plugin-config", focus: "Schemastery config fields, defaults, cross-field validation, no hardcoded tunables.", paths: "/Users/zaali/dev/dsh-workflows/src/config.ts /Users/zaali/dev/dsh-workflows/package.json" },
    #{ id: "plugin-registry", focus: "Definition envelope, kebab names, bundled/project/user precedence, watchers, save, fail-loud malformed files.", paths: "/Users/zaali/dev/dsh-workflows/src/registry /Users/zaali/dev/dsh-workflows/tests/workflow-names.spec.ts" },
    #{ id: "plugin-storage-lease", focus: "v2 manifest, private root, native lease, recovery Interrupted, scratch quotas, eviction.", paths: "/Users/zaali/dev/dsh-workflows/src/supervisor/storage /Users/zaali/dev/dsh-workflows/tests/storage-manifest-codec.spec.ts /Users/zaali/dev/dsh-workflows/tests/storage-details-codec.spec.ts /Users/zaali/dev/dsh-workflows/tests/storage-private-layout.spec.ts /Users/zaali/dev/dsh-workflows/tests/storage-stress.spec.ts" },
    #{ id: "plugin-supervisor", focus: "Background start durable-before-visible, pause/resume/stop/save, budget-limited resume, display names, checkpoint authority.", paths: "/Users/zaali/dev/dsh-workflows/src/supervisor/index.ts /Users/zaali/dev/dsh-workflows/src/supervisor/types.ts /Users/zaali/dev/dsh-workflows/src/supervisor/completion-notice.ts" },
    #{ id: "plugin-commands", focus: "Parser, aliases, /workflow /create-workflow, no Host /workflows, skill registration, exact success strings.", paths: "/Users/zaali/dev/dsh-workflows/src/commands /Users/zaali/dev/dsh-workflows/tests/command-parser.spec.ts /Users/zaali/dev/dsh-workflows/skills/create-workflow/SKILL.md" },
    #{ id: "plugin-tool", focus: "Exact-Agent tool shadow, launch/validate/resume schema, background collection, no second global workflow tool.", paths: "/Users/zaali/dev/dsh-workflows/src/tool /Users/zaali/dev/dsh-workflows/tests/tool-schema.spec.ts" },
    #{ id: "plugin-client-dashboard", focus: "Dashboard overlay, empty state, panes, keyboard P/R/X/S, mobile drill-down, CSS tokens, member inspector.", paths: "/Users/zaali/dev/dsh-workflows/src/client/WorkflowsDashboard.tsx /Users/zaali/dev/dsh-workflows/src/client/WorkflowsDashboard.module.css /Users/zaali/dev/dsh-workflows/src/client/WorkflowMemberInspector.tsx /Users/zaali/dev/dsh-workflows/src/client/WorkflowRunPanel.tsx" },
    #{ id: "plugin-client-remote", focus: "Client controller, store, adapter, generated Remote mount, invalidation-only events, /workflows client action, picker.", paths: "/Users/zaali/dev/dsh-workflows/src/client/index.ts /Users/zaali/dev/dsh-workflows/src/client/controller.ts /Users/zaali/dev/dsh-workflows/src/client/adapter.ts /Users/zaali/dev/dsh-workflows/src/client/store.ts /Users/zaali/dev/dsh-workflows/src/client/contract.ts" },
    #{ id: "plugin-recorder", focus: "Durable Chat recorder: one tool-workflow record per top-level run, no nested duplicate, restart Interrupted as cancelled.", paths: "/Users/zaali/dev/dsh-workflows/src/run-recorder.ts /Users/zaali/dev/dsh-workflows/src/client/chat-renderer.tsx /Users/zaali/dev/dsh-workflows/src/client/workflow-definition.ts" },
    #{ id: "plugin-questions", focus: "Gate question id workflow-gate, Resume option copy, stale-answer fencing, unload abort.", paths: "/Users/zaali/dev/dsh-workflows/src/user-questions.ts" },
    #{ id: "plugin-tests-coverage", focus: "Which spec tests exist vs missing (supervisor-start, registry-discovery, remote-api, commands, client-actions, packed-consumer, keyless snapshots). Quality of existing tests.", paths: "/Users/zaali/dev/dsh-workflows/tests /Users/zaali/dev/dsh-workflows/.specs/01_installable_workflows_package_spec.md /Users/zaali/dev/dsh-workflows/docs/testing.md" },
    #{ id: "plugin-docs-spec", focus: "Spec, architecture, user-guide, Agent Note vs shipped code. Contradictions, stale RC8 assumptions, missing acceptance.", paths: "/Users/zaali/dev/dsh-workflows/.specs/01_installable_workflows_package_spec.md /Users/zaali/dev/dsh-workflows/docs /Users/zaali/dev/dsh-workflows/.agents/notes/implemented/architecture /Users/zaali/dev/dsh-workflows/README.md /Users/zaali/dev/dsh-workflows/grok_workflows.md /Users/zaali/dev/dsh-workflows/ds_workflows.md" },
    #{ id: "plugin-build-patch", focus: "build.mjs Typert staging, client bundle, verify-package, check-release, packed-consumer, GitHub workflows, exports, peers.", paths: "/Users/zaali/dev/dsh-workflows/scripts /Users/zaali/dev/dsh-workflows/package.json /Users/zaali/dev/dsh-workflows/tests/verify-package.spec.ts /Users/zaali/dev/dsh-workflows/.github" },
    #{ id: "plugin-skill", focus: "Packaged create-workflow skill completeness vs Grok authoring procedure and JS dialect. user-invocable, trusted name.", paths: "/Users/zaali/dev/dsh-workflows/skills/create-workflow/SKILL.md /Users/zaali/dev/dsh-workflows/src/commands/index.ts" },
    #{ id: "plugin-git-status", focus: "What is already implemented in the dirty tree. git status and git diff --stat of /Users/zaali/dev/dsh-workflows. List remaining holes, not a file dump.", paths: "/Users/zaali/dev/dsh-workflows/src /Users/zaali/dev/dsh-workflows/tests /Users/zaali/dev/dsh-workflows/package.json" },
];

let situation_jobs = [];
for t in situation_topics {
    situation_jobs.push(grok_read_job(t.id, t.focus, t.paths, findings_schema));
}
log("Launching " + situation_jobs.len().to_string() + " situation agents");
let situation_results = parallel(situation_jobs);
let situation_findings = collect_findings(situation_results);
let situation_summaries = collect_summaries(situation_results);
log("Situation findings: " + situation_findings.len().to_string() + " summaries: " + situation_summaries.len().to_string());

// ---------------------------------------------------------------------------
phase("Review-Working-Fork");
log("Phase 2: 52 grok-4.6 agents perfect-review the working fork. This product already works; capture behavior to preserve.");

let fork_topics = [
    #{ id: "fork-workflow-types-vs-official", focus: "Diff fork workflow types vs official H types. What the plugin may assume vs what must stay in H.", paths: "/Users/zaali/dev/deepseek-harness/packages/workflow/workflow/src /Users/zaali/dev/research/deepseek-harness/packages/workflow/workflow/src" },
    #{ id: "fork-worker-complete-pause-await", focus: "How complete, pause, await_user actually behave in the working worker. Catchability, kinds, re-fire vs continue.", paths: "/Users/zaali/dev/deepseek-harness/packages/workflow/workflow-worker-thread/src/runtime.ts /Users/zaali/dev/deepseek-harness/packages/workflow/workflow-worker-thread/tests/hooks.spec.ts" },
    #{ id: "fork-worker-budget-scratch", focus: "budget() spend rules, atomic panel admission, scratchDir vs capability, quotas, idempotent writes.", paths: "/Users/zaali/dev/deepseek-harness/packages/workflow/workflow-worker-thread/src /Users/zaali/dev/deepseek-harness/packages/workflow/workflow-worker-thread/tests/host-scratch-coverage.spec.ts" },
    #{ id: "fork-worker-journal-replay", focus: "Working same-process journal replay: call identity, fingerprint, ordinal vs call-id, divergence rejection.", paths: "/Users/zaali/dev/deepseek-harness/packages/workflow/workflow-worker-thread/src /Users/zaali/dev/deepseek-harness/packages/workflow/workflow-worker-thread/tests/index-journal-validation.spec.ts /Users/zaali/dev/deepseek-harness/packages/workflow/workflow-worker-thread/tests/contract-regressions.spec.ts" },
    #{ id: "fork-worker-validate-only", focus: "Working validate_only: canned successes, would-pause, no Session record, diagnostics authors need.", paths: "/Users/zaali/dev/deepseek-harness/packages/workflow/workflow-worker-thread /Users/zaali/dev/deepseek-harness/packages/workflow/tool-workflow/src/index.ts" },
    #{ id: "fork-worker-parallel-declarative", focus: "parallel(thunks) vs map-array overload, failed slots null, mixed-form rejection, live concurrency queue still a barrier.", paths: "/Users/zaali/dev/deepseek-harness/packages/workflow/workflow-worker-thread/src/runtime.ts /Users/zaali/dev/deepseek-harness/packages/workflow/workflow/src" },
    #{ id: "fork-registry-discovery", focus: "Working definition registry: envelope, precedence, fail-loud, name rules, Windows device names, git root vs cwd.", paths: "/Users/zaali/dev/deepseek-harness/packages/workflow/workflow-registry/src /Users/zaali/dev/deepseek-harness/packages/workflow/workflow-registry/tests /Users/zaali/dev/deepseek-harness/packages/workflow/workflow-registry/README.md" },
    #{ id: "fork-registry-save-watch", focus: "Save publication, watchers, workflows/change hint, bounded project roots, disabled registry behavior.", paths: "/Users/zaali/dev/deepseek-harness/packages/workflow/workflow-registry/src /Users/zaali/dev/deepseek-harness/packages/workflow/workflow-registry/tests" },
    #{ id: "fork-supervisor-start-durable", focus: "Working supervisor start: staging, manifest commit as admission, inert attach, release, return before settlement.", paths: "/Users/zaali/dev/deepseek-harness/packages/workflow/workflow-supervisor/src/index.ts /Users/zaali/dev/deepseek-harness/packages/workflow/workflow-supervisor/tests/supervisor.spec.ts /Users/zaali/dev/deepseek-harness/packages/workflow/workflow-supervisor/tests/supervisor-contracts.spec.ts" },
    #{ id: "fork-supervisor-pause-resume-stop", focus: "Pause cancels attempt then parks; resume replays checkpoint; stop drains children; exact user-facing strings.", paths: "/Users/zaali/dev/deepseek-harness/packages/workflow/workflow-supervisor/src/index.ts /Users/zaali/dev/deepseek-harness/packages/workflow/command-workflows/src/index.ts" },
    #{ id: "fork-supervisor-budget-limited", focus: "Budget-limited human resume rejection exact text; model resume requires higher absolute cap; stop still works.", paths: "/Users/zaali/dev/deepseek-harness/packages/workflow/workflow-supervisor/src /Users/zaali/dev/deepseek-harness/packages/workflow/tool-workflow/src/index.ts" },
    #{ id: "fork-supervisor-display-names", focus: "Display name allocator: first run is meta.name, then name-2. Ordinals never reused. No UUID in UX.", paths: "/Users/zaali/dev/deepseek-harness/packages/workflow/workflow-supervisor/src /Users/zaali/dev/deepseek-harness/packages/workflow/workflow-supervisor/src/types.ts" },
    #{ id: "fork-manifest-store", focus: "Working retained store: layout, v2 heads vs details, eviction, Interrupted recovery, lock if any.", paths: "/Users/zaali/dev/deepseek-harness/packages/workflow/workflow-supervisor/src/manifest-store.ts /Users/zaali/dev/deepseek-harness/packages/workflow/workflow-supervisor/tests/manifest-store.spec.ts" },
    #{ id: "fork-completion-notice", focus: "At-most-once completion notice, cohort caps, followup vs inject, scratch/report.md preference, exact closing line.", paths: "/Users/zaali/dev/deepseek-harness/packages/workflow/workflow-supervisor/src/completion-notice.ts /Users/zaali/dev/deepseek-harness/packages/workflow/workflow-supervisor/tests/completion-notice.spec.ts" },
    #{ id: "fork-value-view", focus: "Bounded result/member value views: pending, available, truncated, evicted, JSON including null.", paths: "/Users/zaali/dev/deepseek-harness/packages/workflow/workflow-supervisor/src/value-view.ts /Users/zaali/dev/deepseek-harness/packages/workflow/workflow-supervisor/tests/value-view.spec.ts" },
    #{ id: "fork-run-recorder", focus: "How the working recorder attributes top-level launches, pairs members across attempts, reconciles unfinished prefixes.", paths: "/Users/zaali/dev/deepseek-harness/packages/workflow/workflow-run-recorder/src /Users/zaali/dev/deepseek-harness/packages/workflow/workflow-run-recorder/tests /Users/zaali/dev/deepseek-harness/.agents/notes/implemented/feature/2026-08-10-durable-workflow-runs-in-chat.md" },
    #{ id: "fork-user-questions-gates", focus: "Working gate questions: id, header, Resume copy for resumable vs re-fire, stale answers, unload.", paths: "/Users/zaali/dev/deepseek-harness/packages/workflow/workflow-user-questions/src /Users/zaali/dev/deepseek-harness/packages/workflow/workflow-user-questions/tests" },
    #{ id: "fork-command-workflow-grammar", focus: "Working /workflow grammar, help text, examples, malformed JSON errors. Capture exact strings the plugin must match.", paths: "/Users/zaali/dev/deepseek-harness/packages/workflow/command-workflows/src/index.ts /Users/zaali/dev/deepseek-harness/packages/workflow/command-workflows/tests" },
    #{ id: "fork-command-aliases", focus: "Per-definition slash aliases, collision with plan/workflow/workflows, workflow- prefix, live reconcile.", paths: "/Users/zaali/dev/deepseek-harness/packages/workflow/command-workflows/src /Users/zaali/dev/deepseek-harness/packages/workflow/command-workflows/tests" },
    #{ id: "fork-create-workflow-steer", focus: "Working /create-workflow: steer text, skill body, seven-step authoring, JS not Rhai.", paths: "/Users/zaali/dev/deepseek-harness/packages/workflow/command-workflows/src/skill.ts /Users/zaali/dev/deepseek-harness/packages/workflow/command-workflows/src/index.ts" },
    #{ id: "fork-tool-workflow-background", focus: "Working model tool: background start, result shape, no parent-turn block, completion notice, nested no second Chat record.", paths: "/Users/zaali/dev/deepseek-harness/packages/workflow/tool-workflow/src/index.ts /Users/zaali/dev/deepseek-harness/packages/workflow/tool-workflow/tests" },
    #{ id: "fork-tool-validate-resume", focus: "Working tool validate_only and resume_from_run_id rules: exclusive source, raised budget, reject combined sources.", paths: "/Users/zaali/dev/deepseek-harness/packages/workflow/tool-workflow/src /Users/zaali/dev/deepseek-harness/packages/workflow/tool-workflow/tests/tool-workflow.spec.ts" },
    #{ id: "fork-ui-workflows-dashboard", focus: "Working dashboard UX: overlay, empty state copy, roster columns, phase rail, controls, keyboard, narrow layout. This is the product users already like.", paths: "/Users/zaali/dev/deepseek-harness/packages/client/ui-workflows/src/client/WorkflowsDashboard.tsx /Users/zaali/dev/deepseek-harness/packages/client/ui-workflows/src/client/WorkflowsDashboard.module.css /Users/zaali/dev/deepseek-harness/packages/client/ui-workflows/tests" },
    #{ id: "fork-ui-workflows-store-adapter", focus: "Working client store, adapter, contract, remote paging, reconnect, allowedActions.", paths: "/Users/zaali/dev/deepseek-harness/packages/client/ui-workflows/src/client /Users/zaali/dev/deepseek-harness/packages/client/ui-workflows/tests" },
    #{ id: "fork-ui-workflow-run-chat", focus: "Working in-chat node after supervisor: running while parent turn ends, disclosure, member click navigation.", paths: "/Users/zaali/dev/deepseek-harness/packages/client/ui-workflow-run /Users/zaali/dev/deepseek-harness/.agents/notes/implemented/feature/2026-08-11-workflow-run-status-driven-disclosure.md" },
    #{ id: "fork-web-composition-patch", focus: "How the fork mounts registry, supervisor, commands, tool, ui-workflows in web vs headless. What the plugin patch must emulate without forking the app.", paths: "/Users/zaali/dev/deepseek-harness/packages/bundle/web-app /Users/zaali/dev/deepseek-harness/apps/web /Users/zaali/dev/deepseek-harness/packages/client/ui-workflows/src/index.ts" },
    #{ id: "fork-note-dynamic-workflows", focus: "Original dynamic-workflows note: what shipped, what was deferred, which deferred items the fork later implemented.", paths: "/Users/zaali/dev/deepseek-harness/.agents/notes/implemented/feature/2026-07-05-dynamic-workflows.md /Users/zaali/dev/deepseek-harness/docs/subsystems/workflow.md" },
    #{ id: "fork-note-durable-chat", focus: "Durable runs in chat decisions the plugin recorder must preserve.", paths: "/Users/zaali/dev/deepseek-harness/.agents/notes/implemented/feature/2026-08-10-durable-workflow-runs-in-chat.md" },
    #{ id: "fork-note-supervisor", focus: "Saved-workflow supervisor Agent Note: logical vs attempt ids, Remote shape, completion, /workflows client ownership. Gold-standard behavior.", paths: "/Users/zaali/dev/deepseek-harness/.agents/notes/implemented/feature/2026-08-17-saved-workflow-supervisor.md" },
    #{ id: "fork-docs-user-guide", focus: "User-visible workflow docs and exact command UX copy in the working fork.", paths: "/Users/zaali/dev/deepseek-harness/docs/user /Users/zaali/dev/deepseek-harness/packages/workflow/README.md /Users/zaali/dev/deepseek-harness/packages/client/ui-workflows/README.md" },
    #{ id: "fork-docs-subsystem", focus: "Fork subsystem docs for workflow/commands vs official docs. Semantic deltas the plugin must keep.", paths: "/Users/zaali/dev/deepseek-harness/docs/subsystems/workflow.md /Users/zaali/dev/research/deepseek-harness/docs/subsystems/workflow.md /Users/zaali/dev/deepseek-harness/docs/subsystems/commands.md" },
    #{ id: "fork-tests-supervisor", focus: "Supervisor tests that encode invariants the plugin must re-prove: unique display names, journal prefix, resume rejection, atomic budget, Interrupted-on-death.", paths: "/Users/zaali/dev/deepseek-harness/packages/workflow/workflow-supervisor/tests" },
    #{ id: "fork-tests-registry", focus: "Registry tests: envelope, watchers, remote list, fail-loud, save races.", paths: "/Users/zaali/dev/deepseek-harness/packages/workflow/workflow-registry/tests" },
    #{ id: "fork-tests-commands", focus: "Command parse/execute tests and skill registration tests.", paths: "/Users/zaali/dev/deepseek-harness/packages/workflow/command-workflows/tests" },
    #{ id: "fork-tests-tool", focus: "Tool-workflow tests for background, validate_only, resume, attribution.", paths: "/Users/zaali/dev/deepseek-harness/packages/workflow/tool-workflow/tests" },
    #{ id: "fork-tests-ui-dashboard", focus: "Dashboard client tests and snapshots: empty, running, needs-input, completed, failed, interrupted.", paths: "/Users/zaali/dev/deepseek-harness/packages/client/ui-workflows/tests /Users/zaali/dev/dsh-workflows/tests/dashboard-snapshot.client.spec.tsx" },
    #{ id: "fork-styling-a11y-mobile", focus: "Tokens, focus rings, reduced motion, 44px targets, 1200/768/320 layouts. web-styling.md compliance.", paths: "/Users/zaali/dev/deepseek-harness/packages/client/ui-workflows/src/client/WorkflowsDashboard.module.css /Users/zaali/dev/deepseek-harness/docs/web-styling.md /Users/zaali/dev/dsh-workflows/src/client" },
    #{ id: "fork-headless-vs-web", focus: "What headless gets (commands/tool/registry/supervisor) vs Web-only dashboard. Plugin must not evaluate browser code in headless.", paths: "/Users/zaali/dev/deepseek-harness/packages/bundle /Users/zaali/dev/deepseek-harness/apps/cli /Users/zaali/dev/dsh-workflows/cordis.patch.yml /Users/zaali/dev/dsh-workflows/package.json" },
    #{ id: "fork-process-death-interrupted", focus: "Process restart: active runs become Interrupted, no resume/save, Chat stopReason cancelled, dashboard still says Interrupted.", paths: "/Users/zaali/dev/deepseek-harness/packages/workflow/workflow-supervisor /Users/zaali/dev/deepseek-harness/packages/workflow/workflow-run-recorder" },
    #{ id: "fork-save-definition-rules", focus: "Save hidden for built-ins and numbered handles; unnumbered non-built-in writes projection; higher-precedence hide still writes.", paths: "/Users/zaali/dev/deepseek-harness/packages/workflow/workflow-supervisor/src /Users/zaali/dev/deepseek-harness/packages/workflow/workflow-registry/src /Users/zaali/dev/deepseek-harness/packages/client/ui-workflows/src" },
    #{ id: "fork-slash-menu-discovery", focus: "Slash menu lists create-workflow, workflow, workflows, every saved name; fuzzy match; unknown stays in command plane.", paths: "/Users/zaali/dev/deepseek-harness/packages/client/ui-commands /Users/zaali/dev/deepseek-harness/packages/workflow/command-workflows /Users/zaali/dev/deepseek-harness/packages/client/ui-workflows" },
    #{ id: "fork-product-feel-grok-parity", focus: "Walk grok_workflows.md and ds_workflows.md against the working fork UX. What already feels right. What the plugin still misses.", paths: "/Users/zaali/dev/dsh-workflows/grok_workflows.md /Users/zaali/dev/dsh-workflows/ds_workflows.md /Users/zaali/dev/deepseek-harness/packages/client/ui-workflows /Users/zaali/dev/deepseek-harness/packages/workflow/command-workflows" },
    #{ id: "fork-bugs-races", focus: "Hunt races in fork supervisor/recorder/ui: double start, teardown vs launch, stale controls, completion storms.", paths: "/Users/zaali/dev/deepseek-harness/packages/workflow/workflow-supervisor/src /Users/zaali/dev/deepseek-harness/packages/workflow/workflow-run-recorder/src /Users/zaali/dev/deepseek-harness/packages/client/ui-workflows/src" },
    #{ id: "fork-bugs-security-fs", focus: "Link following, path escape, lock protocol, scratch path leak, UUID leak in UI, Remote cross-session.", paths: "/Users/zaali/dev/deepseek-harness/packages/workflow/workflow-registry/src /Users/zaali/dev/deepseek-harness/packages/workflow/workflow-supervisor/src /Users/zaali/dev/deepseek-harness/packages/workflow/workflow-worker-thread/tests/host-security.spec.ts" },
    #{ id: "fork-remote-paging-cursors", focus: "Working Remote method signatures, page limits, stale-cursor, revision-conflict, artifact chunks. Compare to plugin supervisor/remote.ts.", paths: "/Users/zaali/dev/deepseek-harness/packages/workflow/workflow-supervisor/src /Users/zaali/dev/dsh-workflows/src/supervisor/remote.ts /Users/zaali/dev/dsh-workflows/src/supervisor/cursors.ts" },
    #{ id: "fork-member-outcomes", focus: "Member inspector headings and truncated vs complete JSON. Plugin inspector must match the working product.", paths: "/Users/zaali/dev/deepseek-harness/packages/client/ui-workflows /Users/zaali/dev/dsh-workflows/src/client/WorkflowMemberInspector.tsx /Users/zaali/dev/dsh-workflows/.specs/01_installable_workflows_package_spec.md" },
    #{ id: "fork-jobs-vs-dashboard", focus: "Jobs popover is too small. Confirm /workflows is a full dashboard and jobs remains a separate roster.", paths: "/Users/zaali/dev/deepseek-harness/packages/client/ui-jobs /Users/zaali/dev/deepseek-harness/packages/client/ui-workflows /Users/zaali/dev/deepseek-harness/docs/subsystems/jobs.md" },
    #{ id: "fork-ralph-vs-workflows", focus: "Ralph remains a different tool. Plugin must not fold workflows into Ralph or /swarm.", paths: "/Users/zaali/dev/deepseek-harness/packages/workflow/tool-ralph /Users/zaali/dev/research/deepseek-harness/packages/workflow/tool-ralph /Users/zaali/dev/dsh-workflows/grok_workflows.md" },
    #{ id: "fork-skill-create-workflow", focus: "Extract the working authoring skill content and compare to the plugin SKILL.md. Missing dialect rules, pitfalls, example.", paths: "/Users/zaali/dev/deepseek-harness/packages/workflow/command-workflows/src/skill.ts /Users/zaali/dev/dsh-workflows/skills/create-workflow/SKILL.md /Users/zaali/.grok/bundled/skills/create-workflow/SKILL.md" },
    #{ id: "fork-do-not-copy-list", focus: "List concrete fork files that must NOT be copied because they assume RC5/in-tree workspace packages. What to re-express instead.", paths: "/Users/zaali/dev/deepseek-harness/packages/workflow /Users/zaali/dev/deepseek-harness/packages/client/ui-workflows /Users/zaali/dev/dsh-workflows/.agents/notes/implemented/architecture/2026-08-20-installable-workflows-package.md" },
    #{ id: "fork-ux-copy-exact-strings", focus: "Harvest exact user-facing strings: Started workflow..., Open /workflows..., Paused..., budget-limited resume, empty dashboard heading/body, Close workflows, Unable to load workflow data.", paths: "/Users/zaali/dev/deepseek-harness/packages/workflow/command-workflows/src /Users/zaali/dev/deepseek-harness/packages/client/ui-workflows/src/client/locales.ts /Users/zaali/dev/dsh-workflows/src/client/locales.ts /Users/zaali/dev/dsh-workflows/src/commands/index.ts" },
    #{ id: "fork-lifecycle-ownership", focus: "Who owns the live WorkflowRun: supervisor vs parent tool fiber. Teardown fixed-point. This is the load-bearing fork lesson.", paths: "/Users/zaali/dev/deepseek-harness/packages/workflow/workflow-supervisor/src/index.ts /Users/zaali/dev/deepseek-harness/packages/workflow/tool-workflow/src/index.ts /Users/zaali/dev/dsh-workflows/src/supervisor/index.ts /Users/zaali/dev/dsh-workflows/src/tool/index.ts" },
];

let fork_jobs = [];
for t in fork_topics {
    fork_jobs.push(grok_read_job(t.id, t.focus, t.paths, findings_schema));
}
log("Launching " + fork_jobs.len().to_string() + " fork-review agents");
let fork_results = parallel(fork_jobs);
let fork_findings = collect_findings(fork_results);
let fork_summaries = collect_summaries(fork_results);
log("Fork findings: " + fork_findings.len().to_string() + " summaries: " + fork_summaries.len().to_string());

let situation_top = take_top(situation_findings, 40);
let fork_top = take_top(fork_findings, 40);
let situation_json = encode_list(situation_top);
let fork_json = encode_list(fork_top);
let situation_sum_json = encode_list(situation_summaries);
let fork_sum_json = encode_list(fork_summaries);

write_scratch_file("situation-findings.json", situation_json);
write_scratch_file("fork-findings.json", fork_json);

// ---------------------------------------------------------------------------
phase("Synthesize-Gaps");
log("Phase 3: 12 synthesizers merge official+plugin+fork into an implementation packet.");

fn synth_prompt(area, extra, situation_sum_json, situation_json, fork_sum_json, fork_json) {
    let p = inspect_law();
    p += "You are a synthesizer, not a file tourist. Read the spec and current plugin files for this area, then use the research below. ";
    p += "AREA: ";
    p += area;
    p += " ";
    p += extra;
    p += " SITUATION SUMMARIES: ";
    p += situation_sum_json;
    p += " SITUATION TOP FINDINGS JSON: ";
    p += situation_json;
    p += " FORK SUMMARIES: ";
    p += fork_sum_json;
    p += " FORK TOP FINDINGS JSON: ";
    p += fork_json;
    p += " Return must_preserve (working-fork/H behaviors to keep), must_fix (concrete plugin gaps with files), files under /Users/zaali/dev/dsh-workflows only, priority critical|high|medium|low, blocked_on_h true only if the gap cannot be closed without editing the official/fork example trees. ";
    p += " Fail closed: if evidence is thin, say so in summary rather than inventing tasks.";
    p
}

let synth_areas = [
    #{ id: "gap-engine-consumption", area: "Engine consumption", extra: "How the plugin should call official start/validate/checkpoint/scratch/deferStart. Compare src/supervisor and src/tool to official runtime-types." },
    #{ id: "gap-registry", area: "Definition registry", extra: "src/registry vs fork workflow-registry and spec Requirement 2." },
    #{ id: "gap-supervisor-storage", area: "Supervisor and v2 storage", extra: "src/supervisor vs fork supervisor/manifest-store and spec Requirements 4-5. Lease, recovery, admission order." },
    #{ id: "gap-commands-skill", area: "Commands and create-workflow skill", extra: "src/commands and skills/create-workflow vs fork command-workflows and spec Requirement 7." },
    #{ id: "gap-tool-recorder", area: "Tool shadow and Chat recorder", extra: "src/tool and src/run-recorder vs fork tool-workflow + recorder and spec Requirements 6 and 9." },
    #{ id: "gap-client-dashboard", area: "Web dashboard and inspector", extra: "src/client vs fork ui-workflows and spec Requirement 11. Empty state, keyboard, mobile, tokens." },
    #{ id: "gap-remote-events", area: "Remote API and invalidation events", extra: "src/supervisor/remote.ts src/remote-events.ts src/client/controller.ts vs spec Requirements 10." },
    #{ id: "gap-tests", area: "Missing tests", extra: "Compare spec File Structure Plan test list (around PKG tests) to tests/ that actually exist. Name the highest-value missing files." },
    #{ id: "gap-docs", area: "Docs and Agent Note", extra: "README, docs/*, Agent Note, bilingual files, skill. Stale claims vs code." },
    #{ id: "gap-h-prereq-readiness", area: "H prerequisite readiness", extra: "Which H capabilities already exist in the research clone, which are missing, and what the plugin must feature-detect. Do not propose edits in the example trees." },
    #{ id: "gap-ux-parity", area: "UX parity with working fork", extra: "Slash menu, background launch copy, dashboard rows, completion notice, display names. List exact string mismatches." },
    #{ id: "gap-priority-plan", area: "Priority implementation plan", extra: "Produce the ordered remaining work for sequential writers in dsh-workflows only. No H-tree edits. No second engine." },
];

let synth_jobs = [];
for a in synth_areas {
    synth_jobs.push(#{
        prompt: synth_prompt(a.area, a.extra, situation_sum_json, situation_json, fork_sum_json, fork_json),
        label: a.id,
        capability_mode: "read-only",
        model: "grok-4.6",
        output_schema: gap_schema,
    });
}
let synth_results = parallel(synth_jobs);
let gaps = [];
for r in synth_results {
    if r != () && r.success && r.output != () { gaps.push(r.output); }
}
log("Synthesized gap packets: " + gaps.len().to_string());
let gaps_json = encode_list(gaps);
write_scratch_file("gaps.json", gaps_json);

if gaps.len() == 0 {
    log("No usable gap packets; continuing with situation/fork findings only");
}

// ---------------------------------------------------------------------------
phase("Implement");
log("Phase 4: sequential source writers then a test panel. Workspace is dsh-workflows only.");

fn impl_prompt(area, files, extra, gaps_json, situation_json, fork_json) {
    let p = write_law();
    p += "Implement remaining gaps for AREA: ";
    p += area;
    p += " Primary files: ";
    p += files;
    p += " ";
    p += extra;
    p += " GAP PACKETS JSON: ";
    p += gaps_json;
    p += " TOP SITUATION FINDINGS: ";
    p += situation_json;
    p += " TOP FORK FINDINGS: ";
    p += fork_json;
    p += " Read the current files first. Implement. Run the most relevant vitest files. status must be done, partial, or blocked. files_touched must be real paths you changed under /Users/zaali/dev/dsh-workflows.";
    p
}

let impl_areas = [
    #{ id: "impl-host-compat", area: "Host aggregate, compatibility marker, config, patch", files: "src/index.ts src/config.ts src/invariant.ts cordis.patch.yml package.json", extra: "Keep RC8 rejected. Mount children via Cordis effects. Do not evaluate client code on the host face." },
    #{ id: "impl-registry", area: "Definition registry", files: "src/registry", extra: "Envelope, names, roots, watchers, save, remote list. Fail loud. Precedence bundled > project > user." },
    #{ id: "impl-storage", area: "v2 storage lease recovery scratch", files: "src/supervisor/storage", extra: "Native lease, descriptor-rooted ops, Interrupted recovery, bounded details, scratch quotas." },
    #{ id: "impl-supervisor", area: "Background supervisor lifecycle", files: "src/supervisor/index.ts src/supervisor/types.ts src/supervisor/completion-notice.ts src/supervisor/value-view.ts", extra: "Durable-before-visible start, pause/resume/stop/save, budget-limited resume rejection, display names, checkpoint after dispose." },
    #{ id: "impl-commands-skill", area: "Commands and packaged skill", files: "src/commands skills/create-workflow/SKILL.md", extra: "Exact success strings, alias collisions, /create-workflow steer, no Host /workflows command." },
    #{ id: "impl-tool-recorder-questions", area: "Tool shadow, recorder, gates", files: "src/tool src/run-recorder.ts src/user-questions.ts", extra: "Replace official tool only on identity match. Background launch. One Chat record. Gate fencing." },
    #{ id: "impl-remote", area: "Authorized Remote and invalidation events", files: "src/supervisor/remote.ts src/supervisor/cursors.ts src/registry/remote.ts src/remote-events.ts", extra: "Page limits, stale-cursor, revision-conflict, invalidate-only events, Agent/Session auth." },
    #{ id: "impl-client", area: "Dashboard, inspector, chat node, client action", files: "src/client", extra: "Empty state, allowedActions, keyboard, mobile, tokens, /workflows client action, no UUID in titles. Keep in-chat node." },
];

let impl_reports = [];
for item in impl_areas {
    log("Implementing " + item.id);
    let r = agent(impl_prompt(item.area, item.files, item.extra, gaps_json, situation_json, fork_json), #{
        label: item.id,
        capability_mode: "all",
        model: "grok-4.6",
        output_schema: impl_schema,
    });
    if r != () && r.success && r.output != () { impl_reports.push(r.output); }
}

let impl_json = encode_list(impl_reports);

let test_areas = [
    #{ id: "impl-tests-host", area: "Host/registry/supervisor tests", files: "tests", extra: "Add or fix parser, names, storage codecs, supervisor, tool-schema tests that the spec lists and the tree still lacks. Do not skip with empty it() blocks." },
    #{ id: "impl-tests-client", area: "Client dashboard and snapshot tests", files: "tests/dashboard-snapshot.client.spec.tsx tests/keyless-snapshot.spec.ts src/client", extra: "Empty/running/needs-input/completed/failed/interrupted semantics. Exact error strings." },
    #{ id: "impl-tests-package", area: "Package, CI, docs, packed-consumer", files: "tests/verify-package.spec.ts tests/packed-consumer.spec.ts tests/docs.spec.ts tests/ci-workflow.spec.ts tests/release-workflow.spec.ts scripts", extra: "Tarball policy, docs gate, CI workflow sanity. No fake green." },
    #{ id: "impl-tests-stress", area: "Race/storage/browser smoke tests", files: "tests/race-stress.spec.ts tests/storage-stress.spec.ts tests/client-race-stress.client.spec.ts tests/browser-smoke.spec.ts tests/real-provider.spec.ts", extra: "Keep skip-without-key honest for the provider test. Stress tests must actually assert pairing/teardown." },
];

let test_jobs = [];
for item in test_areas {
    test_jobs.push(#{
        prompt: impl_prompt(item.area, item.files, item.extra, gaps_json, situation_json, fork_json) + " Previous implementer reports: " + impl_json,
        label: item.id,
        capability_mode: "all",
        model: "grok-4.6",
        output_schema: impl_schema,
    });
}
let test_results = parallel(test_jobs);
for r in test_results {
    if r != () && r.success && r.output != () { impl_reports.push(r.output); }
}
impl_json = encode_list(impl_reports);
write_scratch_file("implement-reports.json", impl_json);
log("Implement reports: " + impl_reports.len().to_string());

// ---------------------------------------------------------------------------
phase("Verify");
log("Phase 5: 8 grok-4.6 skeptics fail-closed on the plugin remaining work.");

fn verify_prompt(area, paths, impl_json, gaps_json) {
    let p = inspect_law();
    p += "Adversarially verify the plugin AFTER implementation. Set ok=true only with evidence you independently inspected. ";
    p += "AREA: ";
    p += area;
    p += " PATHS: ";
    p += paths;
    p += " IMPLEMENT REPORTS: ";
    p += impl_json;
    p += " GAP PACKETS: ";
    p += gaps_json;
    p += " Confirm: no writes landed in the two example trees; no second engine; JS dialect; display names; /workflows is a run dashboard; missing tests still missing; H-blocked items documented. ";
    p += " Run tests if useful (read-only regarding example trees). ok=false if critical/high issues remain.";
    p
}

let verify_areas = [
    #{ id: "verify-no-fork-edits", area: "Example trees untouched", paths: "Use git status --porcelain in /Users/zaali/dev/deepseek-harness and /Users/zaali/dev/research/deepseek-harness. Any modified tracked files are a critical defect." },
    #{ id: "verify-engine-boundary", area: "No second engine", paths: "/Users/zaali/dev/dsh-workflows/src /Users/zaali/dev/dsh-workflows/package.json /Users/zaali/dev/dsh-workflows/cordis.patch.yml" },
    #{ id: "verify-commands-ux", area: "Slash UX and exact strings", paths: "/Users/zaali/dev/dsh-workflows/src/commands /Users/zaali/dev/dsh-workflows/src/client /Users/zaali/dev/dsh-workflows/skills/create-workflow/SKILL.md" },
    #{ id: "verify-supervisor-lifecycle", area: "Admission, pause/resume, Interrupted, budget-limited", paths: "/Users/zaali/dev/dsh-workflows/src/supervisor /Users/zaali/dev/dsh-workflows/src/tool" },
    #{ id: "verify-dashboard", area: "Dashboard a11y, empty state, inspector, tokens", paths: "/Users/zaali/dev/dsh-workflows/src/client" },
    #{ id: "verify-tests", area: "Tests vs spec file plan", paths: "/Users/zaali/dev/dsh-workflows/tests /Users/zaali/dev/dsh-workflows/.specs/01_installable_workflows_package_spec.md" },
    #{ id: "verify-docs", area: "Docs match behavior", paths: "/Users/zaali/dev/dsh-workflows/README.md /Users/zaali/dev/dsh-workflows/docs /Users/zaali/dev/dsh-workflows/.agents/notes" },
    #{ id: "verify-package-build", area: "Package exports, patch, build, verify-package", paths: "/Users/zaali/dev/dsh-workflows/package.json /Users/zaali/dev/dsh-workflows/scripts /Users/zaali/dev/dsh-workflows/cordis.patch.yml" },
];

let verify_jobs = [];
for v in verify_areas {
    verify_jobs.push(#{
        prompt: verify_prompt(v.area, v.paths, impl_json, gaps_json),
        label: v.id,
        capability_mode: "read-only",
        model: "grok-4.6",
        output_schema: verdict_schema,
    });
}
let verify_results = parallel(verify_jobs);

let remaining_issues = [];
let verify_ok = 0;
let verify_n = 0;
for r in verify_results {
    verify_n += 1;
    if r != () && r.success && r.output != () {
        if r.output.ok == true { verify_ok += 1; }
        if r.output.issues != () {
            for issue in r.output.issues { remaining_issues.push(issue); }
        }
    }
}

let report = "# ship-dsh-workflows-plugin report\n\n";
report += "Situation agents: " + situation_jobs.len().to_string() + "\n";
report += "Fork-review agents: " + fork_jobs.len().to_string() + "\n";
report += "Synthesize agents: " + synth_jobs.len().to_string() + "\n";
report += "Implement reports: " + impl_reports.len().to_string() + "\n";
report += "Verify ok: " + verify_ok.to_string() + "/" + verify_n.to_string() + "\n\n";
report += "## Situation summaries\n";
report += situation_sum_json;
report += "\n\n## Fork summaries\n";
report += fork_sum_json;
report += "\n\n## Gaps\n";
report += gaps_json;
report += "\n\n## Implement\n";
report += impl_json;
report += "\n\n## Remaining issues\n";
report += encode_list(remaining_issues);
report += "\n";

let report_path = write_scratch_file("report.md", report);

complete(#{
    summary: "Situation " + situation_jobs.len().to_string() + ", fork " + fork_jobs.len().to_string() + ", synth " + synth_jobs.len().to_string() + ", implement " + impl_reports.len().to_string() + ", verify " + verify_ok.to_string() + "/" + verify_n.to_string(),
    situation_findings: situation_findings.len(),
    fork_findings: fork_findings.len(),
    gaps: gaps.len(),
    implement_reports: impl_reports.len(),
    verify_ok: verify_ok,
    verify_total: verify_n,
    remaining_issues: remaining_issues.len(),
    report_path: report_path,
    constraint: "Example trees /Users/zaali/dev/deepseek-harness and /Users/zaali/dev/research/deepseek-harness were read-only. Writes only in /Users/zaali/dev/dsh-workflows.",
});
