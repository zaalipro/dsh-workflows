---
name: create-workflow
description: Create, validate, and save a reusable JavaScript workflow when the user invokes /create-workflow.
user-invocable: true
model-invocable: true
---

# Create workflow

Build a saved workflow as plain JavaScript plus JSON metadata. Do not write Rhai.

## Required seven-stage procedure

1. **Gather intent.** Ask for the objective, expected inputs, deliverable, and success evidence.
2. **Design fan-out.** Identify independent agents, concurrency, labels, phase grouping, and maximum fan-out.
3. **Design verification.** Add an adversarial or independent verification stage; make failure closed rather than optimistic.
4. **Choose the artifact and tolerance.** Decide whether results live inline or in scratch files and how `null` child failures affect the result.
5. **Choose identity and scope.** Pick a lowercase kebab name and project or user save scope.
6. **Author and validate.** Write the strict envelope, then run `validate_only` with representative args. Validation executes one args-selected canned path; it does not exercise all branches, live tools, or every possible agent output.
7. **Publish and report.** Save only after validation succeeds. Report the file path, smoke result and limits, launch syntax, and maximum fan-out. Offer, but do not force, a real background launch.

## File format

A flat `<name>.workflow.json` file contains exactly `meta` and `script`. Metadata contains only `name`, `description`, optional `whenToUse`, and optional `phases`; a phase contains only `title`, optional `detail`, `provider`, and `model`. Metadata is JSON data beside the script and is never evaluated.

## JavaScript hooks

- `agent(prompt, { label?, phase?, schema?, provider?, model? })` returns final text or a schema-validated JSON object; an ordinary child failure returns `null`.
- `parallel(thunksOrJobs)` is a barrier and preserves slot order. Declarative job panels preflight the unreplayed panel atomically; arbitrary thunks use per-call admission.
- `pipeline(items, ...stages)` advances items independently and preserves input order.
- `phase(title)` and `log(message)` publish bounded progress.
- `complete(jsonValue)` settles the first valid JSON result.
- `await_user(kind, message)` commits an acknowledged gate; `pause(kind, message)` repeats after resume while its condition is unchanged.
- `budget()` returns `{ total, spent, reserved: 0, remaining }`.
- `write_scratch_file(name, content)` and `read_scratch_file(name)` use one safe filename.

Supported schemas use `type`, `properties`, `required`, `additionalProperties`, `items`, `minItems`, `maxItems`, `enum`, `const`, and `oneOf`. Array bounds are inclusive non-negative integers and cannot sit beside `oneOf`.

Replay uses immutable script, args, and a committed checkpoint. Replayed and schema-correction calls spend zero, but an external effect whose result was not committed can repeat. Keep prompts and external operations idempotent. Replay-capable scripts cannot use `Date`, `Math.random`, `Atomics`, `SharedArrayBuffer`, `WeakRef`, or `FinalizationRegistry`. There is no nested workflow hook.

Default scratch quotas are 4,096 operations, 64 pending operations, 64 files, 1 MiB per file, and 8 MiB total. Default agent budget is 128 and the hard maximum is 1,024.

## Complete example

```json
{
  "meta": {
    "name": "review-changes",
    "description": "Review the change and independently verify every finding",
    "whenToUse": "Before merge",
    "phases": [
      { "title": "Review", "detail": "Collect concrete evidence" },
      { "title": "Verify", "detail": "Challenge each finding" }
    ]
  },
  "script": "phase(\"Review\");\nconst reviews = await parallel([\n  { prompt: \"Inspect the requested change. Cite exact files and lines. Return only supported findings.\", label: \"reviewer\", phase: \"Review\" },\n  { prompt: \"Search for regressions and missing tests. Cite reproducible evidence and reject speculation.\", label: \"adversary\", phase: \"Review\" }\n]);\nconst evidence = reviews.filter(Boolean);\nif (evidence.length === 0) complete({ ok: false, findings: [], reason: \"no review agent completed\" });\nphase(\"Verify\");\nconst verified = await agent(`Independently verify these candidate findings against the workspace. Reject anything unsupported and return the remaining evidence:\\n${JSON.stringify(evidence)}`, { label: \"verifier\", phase: \"Verify\" });\nif (verified === null) complete({ ok: false, findings: [], reason: \"verification failed closed\" });\ncomplete({ ok: true, findings: verified });"
}
```

Pitfalls: do not put `meta` in JavaScript, use TypeScript/export syntax, add unsupported agent options such as `fork_context`, mix thunk and declarative parallel forms, assume `null` is success, omit verification, hide truncation, use nondeterministic globals, use nested workflows, or claim validate-only exhaustively proves the workflow.
