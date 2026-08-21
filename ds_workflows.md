# Task: Add Grok-Build-parity workflows to DeepSeek Harness Web UI

> **Historical donor-task note — not the current runbook.** The installable product is `@zaalipro/dsh-workflows`. Host registers only `/workflow` and `/create-workflow`. **`/workflows` is Client-only** (a browser `kind: action`); do not register it as a Host command. Donor commit `391c829` is behavioral reference only. Follow `docs/user-guide.md` and `docs/architecture.md`.

You are working in the existing DeepSeek Harness checkout (github.com/zaalipro/deepseek-harness). Do **not** clone Grok, do **not** add a second workflow engine, do **not** switch the dialect to Rhai.

Goal: make the **Web UI** feel and behave like Grok Build CLI workflows: `/create-workflow`, `/workflow`, `/workflows`, named `/<workflow-name>` launches, a live **run dashboard**, background launch, display-name handles, pause / resume / stop / save.

The user-facing product is Grok Build. The implementation substrate is this repo's existing JS workflow seam.

Follow `AGENTS.md`, `docs/architecture.md`, capability-seam rules, Agent Notes, bilingual docs, unit/e2e/snapshot policy, and `docs/web-styling.md` (`--dsw-alias-*`, CSS Modules, no Tailwind). Write a non-trivial Agent Note in the same PR.

---

## 0. What already exists in THIS repo — extend it

Read these first and treat them as law:

- `packages/workflow/README.md`
- `packages/workflow/workflow/README.md`
- `packages/workflow/workflow-worker-thread/README.md`
- `packages/workflow/tool-workflow/README.md`
- `docs/subsystems/workflow.md`
- `.agents/notes/implemented/feature/2026-07-05-dynamic-workflows.md`
- `.agents/notes/implemented/feature/2026-08-10-durable-workflow-runs-in-chat.md`
- `packages/client/ui-workflow-run/README.md`
- `docs/subsystems/commands.md`
- `packages/interaction/commands/README.md`
- `packages/client/ui-commands/README.md`
- `docs/subsystems/skills.md`
- `docs/subsystems/jobs.md`
- `packages/plan/plan-mode/README.md` (pattern for a host slash command that may `agent.steer()`)
- `packages/client/ui-jobs/README.md` (pattern for a live roster UI — too small; `/workflows` is a full dashboard)

### Already shipped

- `ctx.workflowEngine` + worker-thread engine.
- Model tool `workflow` with `{ meta, script, args }`.
- Script dialect is **plain JavaScript** (top-level await, `return <json>`).
- Host hooks today: `agent()`, `parallel(thunks)`, `pipeline()`, `phase()`, `log()`, `args`.
- Observe-only events: `workflow/start|phase|log|agent-start|agent-end|end`.
- Top-level runs project `tool-workflow/*` Session events; Web Chat has a **status-only** `workflow-run` node (no pause/resume/stop, no dashboard).
- Human slash plane: `ctx.commands` + Web `ui-commands` (`/` menu, execute / popupSelect / leadingInput).
- Skills: `ctx.skills` from `.dsh/skills`, `.agents/skills`, user/bundled roots.

### Explicitly deferred in this repo — YOU are implementing them

From the dynamic-workflows Agent Note:

- Saved / bundled workflows (a filesystem registry + slash-command API).
- Background start / poll / completion notice (today the parent turn **blocks** until the script settles).
- Journaling + same-process resume.
- Script persistence to a run directory.
- Nested `workflow()`.
- Token `budget()` vocabulary.

Do **not** keep those deferred if they are required for Grok UX. Background launch, saved definitions, slash commands, the run dashboard, display-name handles, stop, save, and authoring (`/create-workflow`) are **required**. Same-process pause/resume with a host-call journal is **required** for Grok parity. Cross-process resume after process death is **not** required (Grok itself marks those Interrupted).

### Dialect rule (do not “port Rhai”)

Grok scripts are Rhai. This harness scripts are JavaScript. Keep JavaScript.

Port **semantics**, not syntax:

| Grok (user-facing name) | This repo |
|---|---|
| “workflow” file | `.js` (or the repo’s chosen extension). Never say “Rhai” to the user. Call them workflows. |
| `let meta = #{...}` inside the file | Persist `meta` as data **beside** the body (this repo already forbids evaluating meta out of script text). On disk a saved file may be a JSON envelope `{ meta, script }` **or** a `.js` body + sibling/frontmatter meta — pick one repo-consistent format and fail loud. Do **not** `export const meta` and eval it on the host. |
| `agent(prompt, opts)` | Existing `agent()`. Extend options toward Grok’s set only where the subagent seam already supports them. Unsupported options stay fatal (this repo’s rule). |
| `parallel([...job maps])` | Keep this repo’s `parallel(thunks)` **or** add a Grok-compatible overload that takes an array of `{ prompt, label, phase, schema, ... }` maps and is still a barrier. Prefer adding the map-array overload so authored workflows look like Grok. Failed slots stay `null` (this repo) / treat as unverified at evidence gates. |
| `phase` / `log` / `args` | Already exist. |
| `complete(value)` | Add: ends the run successfully; value is the run result. Map onto today’s `return value` if you must, but the authoring surface should be `complete(value)`. |
| `await_user(kind, message)` / `pause(kind, message)` | Add. See §4. |
| `budget()` | Add. See §4. |
| `write_scratch_file` / `read_scratch_file` | Add per-run scratch. |
| `validate_only` | Add. See §5. |
| `pipeline()` | Keep (this repo extra; Grok does not have it). |

---

## 1. Product definition — how Grok workflows work (match this UX)

Workflows are **deterministic host-owned orchestration scripts**. The script, not the parent model turn, holds the loop, the fan-out, the branching, and intermediate results. Child agents do the judgment; the script shards work and verifies.

Users never see internal run IDs. Users see a **session-unique display name**.

### 1.1 Saved definitions vs live runs (this distinction is load-bearing)

Two different catalogs:

1. **Definitions** (reusable scripts)
   - Project: `<repo-root>/.dsh/workflows/<name>.<ext>` (shareable; default inside a git repo).
   - User: `<dshHome>/workflows/<name>.<ext>` (all projects).
   - Optional bundled/built-ins.
   - Discovery key is `meta.name` (kebab-case). Filename must align with `meta.name`.
   - Precedence: **built-in > project > user**. Keep names unique across scopes.
   - Watch the directories (same spirit as `dsh-skill-filesystem` / chokidar). Refresh slash catalog on change.

2. **Runs** (what `/workflows` shows)
   - `/workflows` is a **live + retained RUN dashboard**, **not** a catalog of saved definitions.
   - A definition’s name appears there only after a run starts.
   - Launching the same definition twice numbers the handle: `review-changes`, `review-changes-2`.
   - That handle is what humans pass to pause / resume / stop / save.

### 1.2 Slash commands (Web `/` menu must list all of these)

#### `/create-workflow`

User-invocable **authoring skill** (same idea as Grok’s bundled `create-workflow` skill).

It is **not** the dashboard. It walks the model through writing a workflow.

Procedure the skill must force:

1. Gather intent conversationally: what it does, what fans out, what is verified, the final artifact, roughly how many agents the user will tolerate.
2. Pick name + scope (project vs user). Name = lowercase letters, digits, hyphens.
3. Author a JS workflow using the contract in §3–4. Shape: meta (data) → schemas as constants → one section per phase. Agent prompts must be imperative and self-contained.
4. Smoke-check **one path** with `validate_only: true` and representative `args`. Iterate until metadata, parse/compile, and that canned-host path pass. This does **not** cover every branch or live tools.
5. Save the smoke-checked script to the chosen path (create the directory). It is now runnable as `/<name>` or `/workflow <name> ...`.
6. Offer a **real** background run with representative args. User can watch it in `/workflows`. If they decline, stop and say only the path-specific smoke check ran.
7. Report: file path, smoke-check output and its limits, how to run it, max agent fan-out per run.

Ship this as a real skill under the harness skill roots the Web session already loads (bundled or `.dsh/skills/create-workflow/SKILL.md`). `user-invocable: true`. Description must mention `/create-workflow` so the slash menu and the model both find it.

`/create-workflow` itself should enter the command plane and then `agent.steer()` a message that loads/follows the skill (same composition as `/plan [message]` in `dsh-plan-mode`: command is host-owned; the authoring conversation is model-owned).

#### `/workflow`

Host command (`ctx.commands`). Does **not** go to the model.

/workflow <name>
 [<json-args>
] /workflow pause <display-name>
 /workflow resume <display-name>
 /workflow stop <display-name>
 /workflow save <display-name>

Examples the help text must show:

/workflow review-changes {"target":"origin/main...HEAD"} /workflow pause review-changes /workflow resume review-changes /workflow stop review-changes-2 /workflow save review-changes

Rules:

- Launch looks up a **definition** by `meta.name`.
- Launch is **background**. The command returns immediately with the display name and tells the user to open `/workflows`.
- Optional trailing JSON object is `args` (must be an object; wrap arrays/scalars in a field — existing wire rule).
- Pause / resume / stop / save address a **run** by display name, never by internal id.
- Same-process pause/resume continues the original **immutable** script, args, and agent-budget cap from **committed host-call results**. To iterate, edit the returned script copy and launch a **new** run.
- A budget-limited run (hit `agent_budget` / `maxTotalAgents`) cannot bare-resume. `/workflow resume <name>` must reject and say to resume via the model/tool path with a higher `agent_budget`. `stop` still works.
- Process restart: active runs become terminal **Interrupted**, not resumable. Say so in the dashboard and in command errors.
- Resume is not exactly-once for external effects: an effect whose result was not committed before pause can run again. Effectful steps must be idempotent.
- `save` writes the run’s current script projection as a **new or updated definition** under project/user workflows, keyed by `meta.name`. Hide/disable save for known built-ins and for numbered duplicate handles (`review-changes-2`). For those, the user must pick a new unique `meta.name` and save the edited copy explicitly.

Decorate `/workflow` in `ui-commands` so a bare `/workflow` (no args) opens a popup of saved definitions (name, description, `whenToUse`, scope). Space after `/workflow` is leadingInput for the grammar above.

#### `/workflows`

Host command. Opens the **run dashboard** (fullscreen overlay / route — Web equivalent of Grok’s fullscreen `/workflows`).

Not a definition catalog.

List rows show at least:

- display name
- current phase (phase rail from `meta.phases` titles + live `phase()` calls; a typo just desyncs the rail — nothing enforces the match)
- agent roster (label, phase, status)
- progress (agents started / budget, running vs settled)
- result / stop reason / error

Detail view of one run:

- phase rail
- members grouped by actual started phase (existing `ui-workflow-run` grouping rules: exact string identity; omitted phase ≠ `''`)
- log lines from `log()`
- final result JSON / scratch report
- controls: **Pause**, **Resume** (ordinary pause only), **Stop**, **Save** (hidden for built-ins and numbered handles)

Web buttons replace Grok’s `p` / `r` / `x` / `s`. Keyboard still works when the overlay is focused.

Budget-limited resume rejection must surface in the UI, not fail silently.

#### `/<name>` for every saved definition

Each discovered `meta.name` is a slash command that launches that definition in the background (same as `/workflow <name> ...`).

Implementation: register one `ctx.commands` definition per saved workflow (refresh on `workflows/change`). If the name collides with a built-in (`plan`, `workflow`, `workflows`, …), the built-in keeps the bare name; the workflow is advertised as a qualified name (follow this repo’s command collision rules; do not silently steal `/plan`).

Bare `/review-changes` launches with `args = {}` or omitted. `/review-changes {"target":"..."}` passes args.

### 1.3 Model-facing `workflow` tool (keep the name; widen the schema)

Today the tool is `{ meta, script, args }` and **blocks** the parent turn.

Widen it to Grok’s launch contract, adapted to this repo:

Exactly one source:

- `name` — saved definition
- `script` — inline JS body (plus required `meta` when inline)
- `script_path` — editable projection / file on disk

Plus:

- `args` — object, optional
- `validate_only` — boolean, default false
- `resume_from_run_id` — same-process paused run only
- `agent_budget` — absolute logical-agent cap for this run (default 128, allowed 1–1024). A panel that would exceed remaining budget is rejected **before any new child launches**. Schema-correction retries do **not** spend budget.

Rules copied from Grok:

- Launch returns immediately to the parent (background). Tool result is `{ displayName, runId, script_path, status: "started" }` (keep `runId` internal in user-facing command text; the model may see it for resume).
- `validate_only: true` does **not** start a live run. It validates meta, parses/compiles the full script, and executes the **single path** selected by the supplied args and **canned** host results (`agent()` succeeds with a small fixed object). Catch errors on that path only.
- Resume uses the original immutable script and args. Reject resume combined with `name` / `script` / `script_path`.
- A budget-limited run resumes only with `resume_from_run_id` **and** a higher `agent_budget`. Bare `/workflow resume` cannot raise the cap.
- Usage policy stays: use the tool only when the user explicitly asks for a workflow or large multi-agent orchestration; one or two delegations stay plain subagent calls.
- On real completion, inject a parent-visible notice (and the result / scratch report) into the conversation the way Grok posts the final report “on its own”. Do not leave the only copy buried in the dashboard.
- Nested workflow-tool calls still must not write a second Chat workflow record (existing rule).

Keep the existing generic tool card **and** the durable `workflow-run` Chat node. The dashboard is an additional surface, not a replacement.

### 1.4 Display names

- Derived from `meta.name`.
- First live/retained run in the session: `meta.name`.
- Further launches: `meta.name-2`, `meta.name-3`, …
- A numbered handle is **not** a reusable definition name.
- Never print internal UUIDs in command success text, dashboard titles, or skill copy.

### 1.5 What a good workflow looks like (teach this in the skill + tool description)

Patterns that work:

- Build the fan-out work-list the simplest deterministic way (fixed list, `args`, a file walk). Spend agents on judgment, not on deciding scope.
- If an agent discovers the work-list, treat that output as untrusted and re-filter it in **plain script** against the invariant (e.g. keep only paths under `args.root`) before sharding.
- Plan → parallel fan-out → synthesize.
- Adversarial verification: independent skeptics prompted to refute. Missing / failed / unusable verification is **not** a confirming vote. Require concrete evidence.
- Loop until dry: spawn finders until two consecutive rounds surface nothing new; fingerprint each round to detect stalls.
- Vote panels: N skeptics per item in one flat `parallel()`, regroup by index arithmetic.
- Failure policy by purpose: optional advice may fail open; a proof gate fails closed.

Pitfalls that have actually happened in Grok (encode them in the skill):

- Terse agent prompts return empty structured objects without using tools. Prompts must command tool use and say what a valid empty answer requires.
- Guard every agent output (`r != null && r.success && r.output.x != null` in JS). Failed `parallel()` slots are `null`.
- Meta is pure data — no computed meta.
- Keep `meta.phases` titles in sync with `phase()` calls.
- `pause()` in a result-derived branch re-fires forever; use `await_user` for resumable human gates.
- Silent truncation is not coverage; `log()` whatever a `MAX_*` cap dropped.
- Agents do not enforce invariants — the script does. Filter/assert in JS.

### 1.6 Example the skill should start from (JS, this-repo dialect)

This is the Grok “review-changes” example rewritten for this engine. The saved definition and `/create-workflow` should be able to produce this shape.

```js
// meta is NOT in the body. The tool / file envelope supplies:
// {
//   name: "review-changes",
//   description: "Review a diff across dimensions, adversarially verify each finding",
//   whenToUse: "After a large diff, before merge",
//   phases: [
//     { title: "Review", detail: "one reviewer per dimension" },
//     { title: "Verify", detail: "one skeptic per finding" },
//   ],
// }

const findingsSchema = {
  type: "object", required: ["findings"],
  properties: {
    findings: {
      type: "array", maxItems: 8,
      items: {
        type: "object", required: ["file", "issue"],
        properties: { file: { type: "string" }, issue: { type: "string" } },
      },
    },
  },
};
const verdictSchema = {
  type: "object", required: ["real", "reason", "evidence"],
  properties: {
    real: { type: "boolean" },
    reason: { type: "string" },
    evidence: { type: "string" },
  },
};

const target = args && args.target;
if (target == null) {
  pause("verification", "Pass args.target — the diff, branch, or path to review.");
}

phase("Review");
const dimensions = ["correctness bugs", "error handling gaps", "performance problems"];
const results = await parallel(dimensions.map((d) => async () => {
  return await agent(
    "Review " + target + " for " + d + ". Use read-only tools to inspect the actual code — " +
      "do not answer from memory. Report at most 8 concrete findings as {file, issue}; " +
      "an empty list is valid only after you have read the code.",
    { label: "review:" + d, schema: findingsSchema },
  );
}));

const findings = [];
for (const r of results) {
  if (r != null && r.findings) for (const f of r.findings) findings.push(f);
}
if (findings.length === 0) complete({ summary: "No findings.", confirmed: [] });

phase("Verify");
const verdicts = await parallel(findings.map((f) => async () => {
  return await agent(
    "Adversarially verify this review finding by reading the shipped code: \"" +
      f.issue + "\" in " + f.file + ". Set real=true only with concrete evidence you " +
      "independently inspected. Otherwise default real=false.",
    { label: "verify:" + f.file, schema: verdictSchema },
  );
}));

const confirmed = [];
for (let i = 0; i < verdicts.length; i++) {
  const v = verdicts[i];
  if (v != null && v.real === true && v.evidence) confirmed.push(findings[i]);
}
log(String(confirmed.length) + "/" + String(findings.length) + " findings survived verification");
complete({ summary: String(confirmed.length) + " confirmed findings", confirmed });

───

2. Architecture you must build (plugins, not loop hacks)

Everything is a plugin. Do not change agent-loop unless docs/architecture.md is updated.

Suggested package split (adjust names to this repo’s @deepseek-ai/dsh-* + group layout):

1. Definition registry (new, workflow family)
   • Discover project / user / bundled workflow files.
   • Validate meta as data.
   • Watch + workflows/definitions-change event.
   • Precedence built-in > project > user.

2. Run registry / supervisor (new)
   • Session-scoped display-name allocator.
   • Live + retained runs.
   • Background start (must not block the parent tool/command).
   • Pause / resume / stop.
   • Journal of committed host-call results (same-process resume).
   • Editable script_path projection per launch.
   • Scratch files per run.
   • Process-death → Interrupted.

   You may register a ctx.jobs producer kind workflow in addition so the existing jobs header sees live work, but /workflows is not the jobs popover. Jobs UI is a flat read-only list and is too small.

3. Widen dsh-tool-workflow
   • New parameters in §1.3.
   • Background collection + completion notice.
   • validate_only path.
   • Resume path.
   • Keep Session tool-workflow/* projection for top-level runs.

4. Host commands plugin
   • Registers /workflow, /workflows, /create-workflow, and one command per saved meta.name.
   • Uses ctx.commands. Web already dispatches through ui-commands.
   • /workflows result should open the dashboard (sourceEventSeq or a client command/executed listener — follow existing command→UI patterns; do not dump a 200-line text blob as the only UI).

5. Web dashboard package (packages/client/ui-workflows or similar)
   • Full overlay/route owned by a client plugin.
   • Subscribe to run snapshots over the existing Host/Client wire (extend the client runtime mirror; do not invent an ad-hoc websocket).
   • Compose with ui-workflow-run for the in-chat node; dashboard is the roster + detail + controls.
   • Tokens only (docs/web-styling.md). Keyboard-focus rings. Reduced motion.
   • Desktop and a usable narrow/mobile layout.

6. Bundled create-workflow skill
   • Full authoring procedure + JS reference (this prompt’s §3–6, rewritten as the skill body).
   • Tool description of workflow should point at the same reference, not duplicate a second contract.

Mount everything in the Web composition (dsh web). Headless/ACP need not get the dashboard, but definition discovery + engine APIs should not be Web-only if the tool exists there.

───

3. Saved file format

Pick one and enforce it in tests:

Recommended envelope (keeps meta off the evaluator):

<name>.json is wrong for a script. Prefer:

.dsh/workflows/review-changes.workflow.json

{
  "meta": {
    "name": "review-changes",
    "description": "...",
    "whenToUse": "...",
    "phases": [{ "title": "Review", "detail": "..." }]
  },
  "script": "/* JS body, top-level await, complete(value) or return */"
}

or a directory bundle:

.dsh/workflows/review-changes/workflow.json   // meta + pointer
.dsh/workflows/review-changes/script.js       // body only

User copy lives under <dshHome>/workflows/ (same home root as <dshHome>/skills).

meta.name kebab-case. Unknown meta fields fail loud (existing engine rule). whenToUse is listing-only.

Each launch writes an editable projection (Grok’s script_path) under the session/run directory. Editing a definition file does not mutate an already-started run.

───

4. Engine / host-API extensions (Grok semantics on the JS engine)

Keep worker-thread isolation, JSON value boundary, fatal WorkflowError for hook misuse, and observe-only events.

4.1 agent(prompt, opts)

Existing: { label, phase, schema, model }.

Grok also has: capability_mode (read-only | read-write | execute | all), agent_type, isolation_worktree, resume_from.

• If the subagent seam can express it, implement it.
• If not, keep today’s fatal UNSUPPORTED_OPTION rather than silently ignoring.
• Return value: structured object when schema is set, else final text. Ordinary child failure → null. Infrastructure failure → fatal.
• fork_context (Grok embedded-only) stays rejected for authored scripts.

4.2 parallel

Barrier. No racing, streaming, or timeouts. Admission is atomic against agent_budget / maxTotalAgents. Host also has a live-concurrency cap (Grok default 32; this engine already has maxConcurrentAgents — keep it, queue extras, still barrier).

4.3 complete(value)

Success terminal. Value is plain JSON. Cannot be caught.

4.4 await_user(kind, message) vs pause(kind, message)

Both park the run, emit a user-visible gate, and show the run as Needs input in /workflows.

• await_user: on resume, continue past the gate (reset streak counters after it). Use for human gates a resume can satisfy.
• pause: re-fires on every resume. Reserve for conditions a resume cannot change (missing args). A pause whose branch derives from journaled results loops forever — that is why verification-of-results uses await_user.

Kinds: user, back_off (alias backoff), no_progress, verification (alias blocked), infra.

None of complete / await_user / pause are catchable.

Wire the gate through ctx.userQuestions (or an equivalent run-scoped question) so Web already has a way to answer. Answering is resume, not a new workflow.

4.5 budget()

Returns { total, spent, reserved, remaining } with reserved always 0, remaining = total - spent.

• total = this run’s agent_budget (default 128, max 1024, cannot exceed engine maxTotalAgents).
• Every live agent() and every item in a parallel() increments spent before launch.
• Schema-correction retries and journal-replayed calls do not spend.
• A parallel panel that would cross the cap launches none of its new jobs.

4.6 Scratch

write_scratch_file(name, content) → stable run-relative id such as scratch/report.md. read_scratch_file(name) reads that single-component name. Dashboard / completion notice can render the report. Do not dump huge reports only into the model tool result (existing maxResultChars truncation is not the report store).

4.7 Determinism + journal

Control flow must derive from args + host results.

Grok forbids timestamp() / sleep() / randomness in Rhai. This JS engine currently allows clock/random. For saved / resumed workflows, tighten:

• Journal a host-call result only after it returns.
• Same-process resume replays committed results and continues with live calls under the original immutable cap (unless a tool resume raises agent_budget).
• Do not journal incomplete effectful calls.
• Process exit while active → Interrupted, not resumable.

validate_only uses canned successes and must not persist a run.

4.8 Background vs today’s blocking tool

Today dsh-tool-workflow awaits run.result inside execute. That is the opposite of Grok.

Required behavior:

• Human /workflow <name> and model workflow (when not validate_only / not a resume that the model is collecting) return immediately.
• The supervisor owns the live WorkflowRun handle (holder-owned dispose still happens, but the holder is the supervisor, not the parent tool fiber).
• Parent turn is free. Chat still gets tool-workflow/run-start and live member events.
• When the run settles, append a completion notice + result/report to the parent session (and mark the Chat node terminal, as today).

Cancellation: /workflow stop, dashboard Stop, and parent abort of a still-attached collection all run.cancel() + dispose.

───

5. validate_only (authoring smoke check)

workflow({ script|name|script_path, meta?, args, validate_only: true }):

1. Validate meta.
2. Parse/compile the full script.
3. Execute only the path implied by args, with canned host:
   • agent() → { success: true, output: small fixed object matching schema if any }
   • parallel() runs thunks with those canned agents
   • await_user / pause → treat as a successful smoke stop with a message (“would pause: …”), not a hang
   • complete(v) → success result v
4. No children, no Session workflow record, no display name, no dashboard row.
5. Return compile/runtime errors with line context so /create-workflow can iterate.

Document in the skill: this does not enumerate branches, live tools, or schema handling for every agent output.

───

6. Web UI acceptance (this is the product)

Exercise in a real browser before calling it done (dsh web, pick a workspace).

Slash menu

• / lists create-workflow, workflow, workflows, and every saved definition name.
• Fuzzy match works (existing ui-commands matcher).
• Unknown /typo stays in the command plane (existing rule — do not send it to the model).

Authoring

1. /create-workflow
2. Describe a small two-phase workflow (e.g. “list files under src, then one reviewer”).
3. Agent writes JS, runs validate_only, saves to .dsh/workflows/.
4. Command menu shows /<name> within the existing skills/commands refresh window.

Launch + dashboard

1. /review-changes {"target":"src"} (or whatever was saved) returns immediately. Composer is usable.
2. /workflows opens the dashboard. Row exists with display name, phase, members, Running.
3. Launch the same name again → review-changes-2.
4. In-chat workflow-run node still updates (do not regress ui-workflow-run).
5. On success, conversation shows the result/report without the user asking.
6. Stop a running run from the dashboard and from /workflow stop <name>.
7. A pause / await_user run shows Needs input; answering resumes; a result-derived pause still re-asks (document with a test).
8. Save from a first-launch handle writes/updates the definition. Save is hidden on *-2 and on built-ins.
9. Restart the dsh process: running runs show Interrupted and cannot resume.
10. Empty dashboard (no runs) is a clear empty state, not a blank page.
11. Check desktop and a narrow/mobile viewport.
12. Hunt regressions: /plan, / skill commands, jobs header, in-chat workflow node, ordinary subagent delegation.

Permissions

Child agents still go through the existing approval / permission policy. Dashboard controls are human commands, not a permission bypass.

───

7. Tests and docs (repo policy)

• Package tests at the usual 100% packages/*/*/src gate for new code.
• Invariant tests for the run registry (unique display names, journal prefix, resume rejection cases, budget atomic admission, Interrupted-on-death).
• Command parse tests for /workflow grammar.
• Keyless snapshot of Web slash discovery + dashboard empty/running/needs-input/completed/failed/interrupted.
• Agent Note: saved workflows + slash API + background supervisor + journal resume.
• Update docs/subsystems/workflow.md, family README, tool README, user Web guide (docs/user/guide/), bilingual files per docs/AGENTS.md.
• Config knobs are real Config fields (enable flag, default budget, live concurrency, definition dirs). No hardcoded tunables.

───

8. Out of scope

• Do not implement Grok’s /goal driver swap or /deep-research unless you need one bundled demo workflow. A small bundled review-changes definition is enough.
• Do not add nested workflow() (Grok also forbids launching workflows from workflows; inline instead).
• Do not evaluate model-written meta on the host.
• Do not replace ui-workflow-run with the dashboard.
• Do not send /workflow lines to the model.
• Do not clone or vendor Grok source.

───

9. Done when

A Web user can:

1. Type /create-workflow and get a saved, smoke-checked workflow on disk.
2. Type /<name> or /workflow <name> {…} and get an immediate background run.
3. Type /workflows and see a live roster with phase, agents, result, and Pause / Resume / Stop / Save.
4. Refresh the page and still see durable in-chat run history (existing Session events).
5. Pause and resume a same-process run by display name.
6. Never see an internal run UUID in the command UX.

Implement it. Do not stop at a plan.
