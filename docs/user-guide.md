# User guide

English | [中文](user-guide.zh.md)

This tutorial takes a Web or headless user from installation to one saved JavaScript definition, one validation smoke, a background run, detailed inspection, controls, and recovery. A **saved definition** is authoring input on disk; a **live or retained run** is an immutable admitted execution record. `/workflows` shows runs only—it is never a definition catalog.

## 1. Install on a compatible Harness

Use the symbolic official release **H**, the first release with all external-workflow prerequisites. Stock `0.1.0-rc.8` is incompatible and activation stops before storage or Session admission.

Install it like any other profile plugin:

```sh
dsh plugin --profile web add github:zaalipro/dsh-workflows
dsh plugin --profile headless add github:zaalipro/dsh-workflows
```

Restart the profile. Web gains the dashboard and durable Chat renderer in addition to Host behavior; headless gains registry, supervisor, commands, questions, recorder, and model tool without loading browser code. Removal is covered in the [package README](../README.md#installation).

## 2. Create a project definition

In a Session whose cwd belongs to the intended project, enter:

```text
/create-workflow review workspace changes, verify every finding, and write a report
```

The command replies exactly:

```text
Opened the workflow authoring skill.
```

The packaged skill asks for intent, inputs, fan-out, evidence, failure tolerance, final artifact, maximum agents, a lowercase kebab name, and project or user scope. Choose **project** to save `review-changes.workflow.json` under the nearest Git root's `.dsh/workflows` directory. If no Git root exists, the Session cwd is the project root. Choose **user** to save under `$DSH_HOME/workflows`.

Definitions resolve with first-wins precedence: configured bundled root, project root, then user root. A higher-precedence same-name definition can keep a newly saved lower-precedence file shadowed. Files must be flat, regular, UTF-8, at most the configured 1 MiB default, and named with a valid lowercase kebab stem.

The saved envelope has exactly `meta` and `script`; metadata remains JSON data and the body remains plain JavaScript:

```json
{
  "meta": {
    "name": "review-changes",
    "description": "Review workspace changes and verify every finding",
    "whenToUse": "Before requesting merge",
    "phases": [
      { "title": "Review", "detail": "Collect bounded evidence" },
      { "title": "Verify", "detail": "Challenge every retained finding" },
      { "title": "Report", "detail": "Publish the final artifact" }
    ]
  },
  "script": "phase(\"Review\");\n// JavaScript body omitted here; see the complete pattern below."
}
```

Phase titles in `phase(title)` and `agent(..., { phase })` must match metadata titles exactly. Metadata declares presentation; it is never evaluated as host code.

## 3. Understand the validation smoke

Before saving, the authoring skill asks the model-facing workflow tool to validate the proposed source with representative args:

```json
{
  "script_path": ".dsh/workflows/review-changes.workflow.json",
  "args": { "targets": ["src", "tests"] },
  "validate_only": true
}
```

A successful result has status `validated`, creates no child, run id, directory, display ordinal, dashboard row, completion notice, or durable workflow event, and states:

```text
Validated one args-selected path with canned agent results; other branches, live tools, and live schema responses were not covered.
```

The engine parses the **entire** script first, then executes only the path selected by those args with canned schema-shaped agent outputs and an in-memory scratch capability. A gate ends the smoke successfully as `would pause: <message>`. Treat this as syntax, hook-contract, and one-path evidence—not proof of all branches or real provider behavior. Fix any filename/line diagnostic and rerun validation before saving.

## 4. Launch a background run

The canonical command accepts one saved name and an optional JSON object:

```text
/workflow review-changes {"targets":["src","tests"]}
```

It returns without waiting for agents:

```text
Started workflow "review-changes" in the background. Open /workflows to watch it.
```

When no ordinary slash command collides, the saved definition also has a named alias:

```text
/review-changes {"targets":["src","tests"]}
```

If an ordinary command owns `/review-changes`, that command keeps it and the workflow receives the first free repeated-prefix alias, such as `/workflow-review-changes`; canonical `/workflow review-changes` always works. The first run is `review-changes`, then `review-changes-2`, `review-changes-3`, and so on. These display names are the only handles used by human commands and titles.

Bare `/workflow` opens a definition picker in Web and returns this usage in headless:

```text
Launch or control a workflow.

Usage:
/workflow <name> [<json-args>]
/workflow pause <display-name>
/workflow resume <display-name>
/workflow stop <display-name>
/workflow save <display-name>

Examples:
/workflow review-changes {"target":"origin/main...HEAD"}
/workflow pause review-changes
/workflow resume review-changes
/workflow stop review-changes-2
/workflow save review-changes
```

Arguments must be one JSON object. Arrays and scalars fail before launch; malformed trailing text is not repaired or forwarded to the model.

## 5. Open the run dashboard

In Web, submit exact bare:

```text
/workflows
```

This Host command opens the dialog labelled `Workflows`. The Client owns the overlay. `/workflows` with arguments or attachments does not open the overlay; it remains unresolved in the composer command plane with its draft intact. Dashboard chrome and Chat labels follow the host locale: the package registers English and Chinese dictionaries, English is the fallback, and the close control uses the same `Close workflows` accessible name as the visible label. Inspector headings (`Pending`, `JSON outcome`, and the rest of criterion 11.4) and the exact criterion 11.4/11.11 error strings stay English.

The run navigator shows display name, status, current phase, agents spent/total, running and settled member counts, a bounded terminal summary, and retained-run loaded/total disclosure. Active runs sort oldest-first and history sorts by newest settlement. `Load more` fetches the next authorized bounded page; only terminal rows are eligible for deterministic oldest-first retention eviction, never active rows or display ordinal history.

At widths of at least 1,200 px, navigator, execution detail, and inspector are independently scrollable panes. Below 1,200 px, navigation and one detail pane remain. Below 768 px, use explicit **Runs -> Execution -> Inspector** drill-down; the same flow works without horizontal page overflow at 320 px.

## 6. Inspect execution and members

Select a run, then open its run disclosure to see declared/current phases, status, progress, controls, logs, terminal result or error, artifacts, and retention disclosure. Open `Inspect · N members` to reveal the member roster. Running and abnormal groups remain open; a completed clean phase can be collapsed without losing detail.

Member lifecycle states are **queued/pending**, **running**, **completed**, **failed**, and **cancelled**. An ordinary child failure is a settled failed member whose script-visible result is JSON `null`; infrastructure failure instead fails the logical run. Select a member to load one distinct outcome presentation:

- `Pending`—the member has no settled outcome yet.
- `JSON outcome`—the complete retained JSON value, including an actual JSON `null`.
- `Text outcome`—complete Markdown or plain text.
- `Value outcome`—a retained JSON primitive other than `null`.
- `Truncated outcome`—a deterministic preview plus retained and total UTF-8 byte counts.
- `No outcome produced`—the member settled without an output value.
- `Outcome evicted`—retention deliberately removed the full detail while preserving that fact.

`Child transcript unavailable` is separate from the retained outcome: the direct one-shot child address may have disappeared while the outcome remains inspectable. `Unable to load member outcome` with `Retry` is a request failure; prior successful pages and detail remain visible. Child navigation refreshes the current direct-child catalog before opening a transcript and refuses stale or foreign addresses.

Logs load in stable index order. Result absence, JSON `null`, truncation, eviction, and request failure render as different facts. Scratch artifacts list safe single-component names and sizes; opening one fetches bounded UTF-8 chunks, and `Load more` continues from a byte cursor adjusted to a complete code-point boundary. A changed, invalid UTF-8, or unsafe artifact fails inline without clearing previously loaded run detail.

## 7. Respond to gates

`await_user(kind, message)` and `pause(kind, message)` both park a run and surface one `Workflow · <display-name>` question with `Resume workflow`, but their replay semantics differ:

- `await_user` acknowledges and resumes the same live engine attempt. The satisfied gate commits, so a later journal replay skips it.
- `pause` is an uncommitted condition. Acknowledgement starts replay, and the same condition asks again if it remains true.

Dismissing, withdrawing, aborting, or answering an obsolete question leaves the run parked. The package resumes only an exact live Session/Agent/logical-run/execution/gate/generation tuple; a late answer cannot resume a newer attempt or another run.

## 8. Pause, resume, stop, and save

Use dashboard buttons, guarded P/R/X/S shortcuts, or display-name commands:

```text
/workflow pause review-changes
/workflow resume review-changes
/workflow stop review-changes-2
/workflow save review-changes
```

Successful command replies are exact:

```text
Paused workflow "review-changes". Open /workflows to resume or stop it.
Resumed workflow "review-changes". Open /workflows to watch it.
Stopped workflow "review-changes-2".
Saved workflow "review-changes" to <path>.
```

Pause stops new work, cancels and drains the current attempt, then publishes `paused` only after a quiescent checkpoint is retained. Resume uses the immutable admitted script and args, not later edits to `script.js`; matching committed hooks replay for zero additional spend. Stop cancels admitted children and scratch operations, pairs their endings, discards replay authority, and publishes terminal `cancelled` after cleanup.

Save is available only for a non-built-in, unnumbered, non-Interrupted run with a safe live editable projection. A built-in or numbered handle requires an edited copy with a new unique `meta.name`; a lower-precedence saved file may remain shadowed. Save targets project scope by default or the explicit supported user scope.

Every dashboard control carries the currently visible revision, disables duplicate submission, and merges the authoritative returned row. If another update wins first, no control side effect occurs and the dashboard says:

```text
workflow run changed; refresh it before applying a control
```

Every other non-domain control failure shows `Unable to update workflow. Retry.` with a labelled `Retry`, while abort and stale-selection failures remain quiet.

## 9. Handle budgets, completion, and process exit

`budget()` returns `{ total, spent, reserved: 0, remaining }`. The default total is 128 and an admitted run may use an absolute cap from 1 through 1,024. Spend is cumulative across same-process attempts; journal replay and schema-correction retries spend zero. Declarative `parallel()` panels preflight all unreplayed jobs atomically, while arbitrary thunks admit each concrete `agent()` call because their future count is unknowable.

When the cap stops a run, the dashboard shows **Budget limited** and offers Stop but no human Resume. Resume through the model tool only, using this explicitly internal reference shape:

```json
{
  "resume_from_run_id": "<internal-run-id>",
  "agent_budget": 256
}
```

The absolute `agent_budget` must be greater than the old total and no greater than 1,024. Human commands, dashboard Resume, or an absent/equal/lower/excessive cap return `workflow "<display-name>" requires a higher agent_budget to resume` without starting another attempt. Internal run ids belong only in this model-tool exchange, never in screenshots, command text, titles, notices, or accessibility labels.

An eligible terminal run attempts one bounded owner completion notice, preferring `scratch/report.md` to the inline result and ending `Open /workflows to inspect the run.` It is at-most-once delivery: a crash can omit a claimed notice, never duplicate it.

After Host process death, startup recovery changes any retained active run to **Interrupted**, changes running members to cancelled, shows `Process exited before workflow settlement.`, and exposes inspection only. No journal, checkpoint, Agent, script/args authority, gate, or child handle crosses processes; an Interrupted run cannot Resume or Save. Launch a new run from the saved definition after checking whether any uncommitted external effect already happened.

## 10. Author replay-safe JavaScript

The worker exposes `args`; `agent`; thunk or declarative `parallel`; `pipeline`; `phase`; `log`; `complete`; `budget`; `pause`; `await_user`; `read_scratch_file`; and `write_scratch_file`. `agent(prompt, opts)` accepts exactly `label`, `phase`, `schema`, `provider`, and `model`. Stock workers have no native `complete` and reject `minItems`/`maxItems`; this package injects `complete()` and strips those keywords before schema validation. Unsupported options such as `fork_context`, unsupported schemas, invalid calls, and infrastructure failures are fatal; ordinary child failures return `null`. Bound array length in the prompt and in JavaScript.

This complete body guards nullable outputs, keeps verification fail-closed, sorts and filters deterministically, bounds a log preview explicitly, synchronizes phase titles, and publishes a report:

```js
const rawTargets = Array.isArray(args.targets) ? args.targets : []
const targets = [...new Set(rawTargets)]
  .filter(target => typeof target === 'string' && target.length > 0)
  .sort((left, right) => left.localeCompare(right))

if (targets.length === 0) {
  complete({ ok: false, reason: 'no valid targets', findings: [] })
}

phase('Review')
const reviews = await parallel(targets.map(target => ({
  label: `review-${target}`,
  phase: 'Review',
  prompt: `Review ${target}. Inspect the workspace; return at most 20 evidence-backed findings.`,
  schema: {
    type: 'object',
    properties: {
      findings: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            summary: { type: 'string' },
            evidence: { type: 'string' },
          },
          required: ['path', 'summary', 'evidence'],
          additionalProperties: false,
        },
      },
    },
    required: ['findings'],
    additionalProperties: false,
  },
})))

if (reviews.some(review => review === null)) {
  complete({ ok: false, reason: 'a reviewer failed', findings: [] })
}

const findings = reviews
  .flatMap(review => review.findings)
  .filter(finding => targets.some(target => finding.path === target || finding.path.startsWith(`${target}/`)))
  .sort((left, right) => left.path.localeCompare(right.path) || left.summary.localeCompare(right.summary))

const preview = JSON.stringify(findings)
log(preview.length <= 2_000 ? preview : `${preview.slice(0, 2_000)}… [truncated]`)

phase('Verify')
const verification = await agent(
  `Challenge every finding against the workspace. Reject unsupported claims.\n${JSON.stringify(findings)}`,
  {
    label: 'verifier',
    phase: 'Verify',
    schema: {
      type: 'object',
      properties: {
        verified: { type: 'boolean' },
        reason: { type: 'string' },
      },
      required: ['verified', 'reason'],
      additionalProperties: false,
    },
  },
)

if (verification === null || verification.verified !== true) {
  complete({ ok: false, reason: verification?.reason ?? 'verification failed', findings: [] })
}

phase('Report')
const report = [
  '# Verified review',
  '',
  ...findings.map(finding => `- **${finding.path}** — ${finding.summary}\n  - Evidence: ${finding.evidence}`),
  '',
].join('\n')
await write_scratch_file('report.md', report)
complete({ ok: true, findings, report: 'report.md' })
```

`complete(value)` accepts the first lossless JSON value and makes every later hook ineffective even if script code catches its internal sentinel. `return value` also settles the run. Scratch names are one component matching `^[A-Za-z0-9][A-Za-z0-9._-]*$`; defaults allow 4,096 operations, 64 pending, 64 files, 1 MiB per file, and 8 MiB total. `phase`/`log` events are each bounded to 64 KiB UTF-8.

Replay-capable runs remove `Date`, `Math.random`, `Atomics`, `SharedArrayBuffer`, `WeakRef`, and `FinalizationRegistry`. Deterministic Math functions remain. Every effectful agent prompt must be safely repeatable because an effect whose result was not committed can run again. A script has no `workflow()` hook: nested workflows are unsupported; express orchestration with agents, `parallel`, and `pipeline` inside one run.

## 11. Keyboard, mobile, and accessibility

Opening `/workflows` moves focus into a labelled modal, makes the background inert, contains Tab and Shift+Tab, recovers escaped focus, and restores the invoking composer on close when it still exists. Escape closes. Status always uses text in addition to color, progress and updates use semantic status/live regions, and member rows are real controls with visible `:focus-visible` treatment.

P/R/X/S activate Pause/Resume/Stop/Save only when the dialog owns focus, no modifier or key repeat is present, the target is not editable, and the selected run currently allows that action. Hidden or unavailable actions never fire. Narrow-screen controls are at least 44 px in both dimensions, long labels and results wrap, and reduced-motion preference removes nonessential transitions.

## 12. Troubleshooting

### Incompatible Harness

Symptom: activation reports `@zaalipro/dsh-workflows requires a DeepSeek Harness release with the external workflow prerequisites; 0.1.0-rc.8 is not compatible`. Install verified official release H; do not bypass the capability check or infer another tag is H.

### Storage is already owned

Symptom: `workflow storage root is already owned by another live process`. Stop the other cooperating Harness process and retry. Never delete or age `.workflow-storage.lock`; the kernel releases its advisory lease when the owner exits. `safe workflow storage is unavailable on <platform>` means the required native lease is unsupported, not that an unlocked fallback is safe.

### Registry is disabled or a definition is missing

`workflow registry is disabled` means listing is inert and Save is intentionally unavailable. `no saved workflow named "<name>"` means no winning definition exists in the current Session cwd's bundled/project/user view. Check the flat filename, root, scope, watcher diagnostic, and precedence; `/workflows` cannot answer definition questions because it lists runs.

### Malformed definition or arguments

A definition must be valid UTF-8 JSON with exactly `{ meta, script }`, known metadata/phase fields, a string script, and a filename stem equal to `meta.name`. Discovery names the offending path and fails the complete observation. Command parse errors are exact:

```text
trailing args for "review-changes" must be one JSON object — {bad
trailing args for "review-changes" must be a JSON object (wrap arrays/scalars in a field)
```

Fix the source; the package never guesses, evaluates metadata, or silently omits the file.

### Run, control, or transcript is unavailable

`workflow "<display-name>" was not found in this Session` deliberately reveals no cross-Session data. `workflow "<display-name>" was interrupted by process exit and cannot resume` requires a new launch. A stale control uses the revision message shown above. `Child transcript unavailable` means the current direct one-shot child catalog no longer authorizes navigation; inspect the retained member outcome instead. A request-level error keeps loaded detail and offers `Retry`.
