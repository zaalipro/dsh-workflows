---
name: create-workflow
description: Author, smoke-check, and save a new saved workflow (invoke via /create-workflow).
user-invocable: false
model-invocable: true
---

# create-workflow

Author a saved workflow: a deterministic JavaScript orchestration script that fans out subagents. The script — not the model turn — holds the loop, the fan-out, the branching, and the intermediate results; child agents do the judgment, the script shards work and verifies. Do not write Rhai.

**This turn fails unless `.dsh/workflows/<name>.workflow.json` exists.** Chat, repo walks, interviews, and live child launches are not a saved workflow.

## Fast path (default)

If `/create-workflow` already states a usable objective (what to do, and optionally how many agents / what fans out), skip the interview. Do not call `ask_user_question`. Do not explore the workspace first — child agents inspect the code at run time.

In this same turn after the skill is loaded:

1. Infer a kebab `meta.name`, project save scope (`.dsh/workflows/`), and a simple fan-out. If they named an agent count, stay at or under it (default 8). Add adversarial verification only when it still fits that budget; otherwise skip it and say so.
2. Author the `{ meta, script }` envelope as **plain JavaScript** (commas in object/array literals, never semicolons — `{ a: 1, b: 2 }` not `{ a: 1; b: 2 }`). `Unexpected token ';'` means you put `;` inside `{ ... }`. Prefer `complete(value)`. Do not use `minItems`/`maxItems`.
3. Call the workflow tool with inline `script` + `meta` only. Inline script **defaults to `validate_only`** (canned stubs, no live children) and **SAVES** `.dsh/workflows/<name>.workflow.json`. Do not pass `validate_only: false`. Do not launch `/workflow <name>` yet.
4. If smoke fails with a parse error, fix commas and retry once. If the tool result has no `saved_path`, write `.dsh/workflows/<name>.workflow.json` yourself with exactly `{ meta, script }`.
5. Report the path, smoke limits, and `/workflow <name>`. Offer a live launch; do not start children until the user agrees.

Copy this call shape (plain JS, commas, no `validate_only: false`):

```js
workflow({
  meta: { name: "review-changes", description: "Review a diff and verify findings" },
  script: "phase(\"Review\");\ncomplete({ ok: true });",
})
```

Ask in ordinary chat (not a picker) only when the objective is empty or contradictory. One short question max.

## Required seven-stage procedure

Use this only when the fast path cannot run because the objective is missing. Do not interview a user who already gave a brief.

1. **Gather intent.** If the user already stated the objective, fan-out, and agent budget, skip this stage. Otherwise ask in chat for the missing piece only.
2. **Design fan-out.** Identify independent agents, concurrency, labels, phase grouping, and maximum fan-out.
3. **Design verification.** Add an adversarial or independent verification stage when the budget allows; missing, failed, or unusable verification is not a confirming vote. Require concrete evidence.
4. **Choose the artifact and tolerance.** Decide whether results live inline or in scratch files and how `null` child failures affect the result. Optional advice may fail open; a proof gate fails closed.
5. **Choose identity and scope.** Pick a lowercase kebab name (at most 64 UTF-16 code units, `^[a-z](?:[a-z0-9]*)(?:-[a-z0-9]+)*$`) and project (`.dsh/workflows/`, default, shareable) or user (`<dshHome>/workflows/`) save scope. Do not use `pause`, `resume`, `save`, `stop`, `workflow`, `workflows`, `create-workflow`, or a Windows device basename. When a name collides with another slash command, the existing command keeps `/<name>` and the saved workflow is advertised as `/workflow-<name>`; the host repeats the `workflow-` prefix if that name is also occupied. Canonical `/workflow <name>` always works.
6. **Author and validate.** Write the strict envelope, then run `validate_only` with representative args. Validation parses the entire script, then executes one args-selected canned path; it does not exercise all branches, live tools, or every possible agent output. A gate ends the smoke as `would pause: <message>`.
7. **Publish and report.** Save only after validation succeeds. Report the file path, smoke result and its limits, launch syntax (`/<name>` or `/workflow <name> ...`), and maximum fan-out. Offer, but do not force, a real background launch watched in `/workflows`. If they decline, say only the path-specific smoke check ran.

## File format

A flat `<name>.workflow.json` file contains exactly `meta` and `script`. Metadata contains only `name`, `description`, optional `whenToUse`, and optional `phases`; a phase contains only `title`, optional `detail`, `provider`, and `model`. Metadata is JSON data beside the script and is never evaluated. Filename must equal `<meta.name>.workflow.json`. Unknown envelope, meta, or phase fields fail the whole observation.

```json
{
  "meta": {
    "name": "review-changes",
    "description": "Review a diff across dimensions, adversarially verify each finding",
    "whenToUse": "After a large diff, before merge",
    "phases": [
      { "title": "Review", "detail": "one reviewer per dimension" },
      { "title": "Verify", "detail": "one skeptic per finding" }
    ]
  },
  "script": "// plain JS body, top-level await, complete(value) or return value"
}
```

## JavaScript hooks

- `agent(prompt, { label?, phase?, schema?, provider?, model? })` returns final text or a schema-validated JSON object; an ordinary child failure returns `null`.
- `parallel(thunksOrJobs)` is a barrier and preserves slot order. Items are zero-arg functions or job maps `{ prompt, label?, phase?, schema?, provider?, model? }`. Declarative job panels preflight the unreplayed panel atomically; arbitrary thunks use per-call admission. Failed slots resolve `null`.
- `pipeline(items, ...stages)` advances items independently and preserves input order.
- `phase(title)` and `log(message)` publish bounded progress.
- `complete(jsonValue)` settles the first valid JSON result and stops later hooks. Prefer `complete()` over falling through. Stock workers have no native `complete`; this package injects one. `return jsonValue` also settles the run.
- `await await_user(kind, message)` commits an acknowledged gate; `await pause(kind, message)` repeats after resume while its condition is unchanged. Both hooks are asynchronous and must be awaited.
- `budget()` returns `{ total, spent, reserved: 0, remaining }`.
- `write_scratch_file(name, content)` and `read_scratch_file(name)` use one safe filename.

Supported schemas use `type`, `properties`, `required`, `additionalProperties`, `items`, `enum`, `const`, and `oneOf`. Do not use `minItems` or `maxItems` — stock schema validation rejects those keywords (this package strips them if a saved script still has them). Bound array length in the prompt and in JavaScript after the child returns.

Replay uses immutable script, args, and a committed checkpoint. Replayed and schema-correction calls spend zero, but an external effect whose result was not committed can repeat. Keep prompts and external operations idempotent. Replay-capable scripts cannot use `Date`, `Math.random`, `Atomics`, `SharedArrayBuffer`, `WeakRef`, or `FinalizationRegistry`. There is no nested workflow hook.

Default scratch quotas are 4,096 operations, 64 pending operations, 64 files, 1 MiB per file, and 8 MiB total. Default agent budget is 128 and the hard maximum is 1,024.

## Good patterns

- Build the fan-out work-list the simplest deterministic way (a fixed list, `args`, a file walk). Spend agents on judgment, not on deciding scope.
- If an agent discovers the work-list, treat it as untrusted: re-filter it in plain JavaScript against the invariant (for example, keep only paths under `args.root`) before sharding.
- Plan → parallel fan-out → synthesize.
- Adversarial verification: independent skeptics prompted to refute each finding. Missing, failed, or unusable verification is not a confirming vote; require concrete evidence.
- Loop until dry: spawn finders until two consecutive rounds surface nothing new; fingerprint each round to detect stalls.
- Vote panels: N skeptics per item in one flat `parallel()`, regroup by index arithmetic.
- Failure policy by purpose: optional advice may fail open; a proof gate fails closed.

## Pitfalls that actually happen

- Terse prompts return empty structured objects without using tools. Command tool use; say what a valid empty answer requires.
- Guard every agent output against the schema value itself: for example, `r != null && Array.isArray(r.findings)`. A schema-backed `agent()` returns that structured object directly; failed `parallel()` slots are `null`.
- Meta is pure data — no computed meta.
- Keep `meta.phases` titles in sync with `phase()` calls.
- `pause()` in a result-derived branch re-fires forever; use `await_user` for resumable human gates.
- Silent truncation is not coverage; `log()` whatever a `MAX_*` cap dropped.
- Agents do not enforce invariants — the script does. Filter and assert in JavaScript.
- A complete `/create-workflow` brief is enough — do not stall on `ask_user_question` or a repo walk.
- Do not pass `validate_only: false` while authoring. That launches live children and the parent tool call can sit for tens of minutes. Inline script already defaults to smoke + save.
- Do not put `minItems`/`maxItems` on schemas; bound counts in the prompt and clip in JavaScript.
- Do not put `meta` in JavaScript, use TypeScript/export syntax, add unsupported agent options such as `fork_context`, mix thunk and declarative parallel forms in one call, assume `null` is success, omit verification, hide truncation, use nondeterministic globals, use nested workflows, or claim validate-only exhaustively proves the workflow.

## Example (review-changes)

Meta is JSON data beside this body in the `{ "meta", "script" }` envelope:

```json
{
  "name": "review-changes",
  "description": "Review a diff across dimensions, adversarially verify each finding",
  "whenToUse": "After a large diff, before merge",
  "phases": [
    { "title": "Review", "detail": "one reviewer per dimension" },
    { "title": "Verify", "detail": "one skeptic per finding" }
  ]
}
```

```js
const findingsSchema = { type: "object", required: ["findings"],
  properties: { findings: { type: "array",
    items: { type: "object", required: ["file", "issue"],
      properties: { file: { type: "string" }, issue: { type: "string" } } } } } };
const verdictSchema = { type: "object", required: ["real", "reason", "evidence"],
  properties: { real: { type: "boolean" }, reason: { type: "string" },
    evidence: { type: "string" } } };

const target = args && args.target;
if (target == null) await pause("verification", "Pass args.target — the diff, branch, or path to review.");

phase("Review");
const dimensions = ["correctness bugs", "error handling gaps", "performance problems"];
const results = await parallel(dimensions.map((d) => async () => await agent(
  "Review " + target + " for " + d + ". Use read-only tools to inspect the actual code — " +
  "do not answer from memory. Report at most 8 concrete findings as {file, issue}; " +
  "an empty list is valid only after you have read the code.",
  { label: "review:" + d, schema: findingsSchema })));

const findings = [];
for (const r of results) {
  if (r != null && Array.isArray(r.findings)) for (const f of r.findings) findings.push(f);
}
if (findings.length === 0) complete({ summary: "No findings.", confirmed: [] });

phase("Verify");
const verdicts = await parallel(findings.map((f) => async () => await agent(
  "Adversarially verify this review finding by reading the shipped code: \"" +
  f.issue + "\" in " + f.file + ". Set real=true only with concrete evidence you " +
  "independently inspected. Otherwise default real=false.",
  { label: "verify:" + f.file, schema: verdictSchema })));

const confirmed = [];
for (let i = 0; i < verdicts.length; i++) {
  const v = verdicts[i];
  if (v != null && v.real === true && v.evidence) confirmed.push(findings[i]);
}
log(String(confirmed.length) + "/" + String(findings.length) + " findings survived verification");
complete({ summary: String(confirmed.length) + " confirmed findings", confirmed });
```
