# @zaalipro/dsh-workflows

English | [中文](README.zh.md)

`@zaalipro/dsh-workflows@0.1.0-rc.4` is one installable DeepSeek Harness bundle for saved JavaScript workflows, supervised background runs, retained inspection, slash commands, and the Web dashboard. It targets official DeepSeek Harness `0.1.2-rc.1` and ships one package-owned MIT compatibility evaluator for replay-safe background execution; it contains no Grok CLI code, account, quota, binary, protocol, or runtime dependency, and no Rhai parser or evaluator.

## Compatibility

The verified Host is official DeepSeek Harness **`0.1.2-rc.1`**. Plugin `0.1.0-rc.4` is compiled and smoke-tested against that exact release, and its direct Harness peer dependencies are pinned to that exact version. Stock `0.1.0-rc.8` remains unsupported, and later Harness versions require a new verified plugin release.

The package requires Node `^22.19.0 || >=24.0.0`, uses `pnpm@11.7.0`, and is distributed under the [MIT license](LICENSE). Native-lock attribution is in [NOTICE.md](NOTICE.md).

## Installation

Ensure `pnpm` is on the service user's `PATH`. Install the pinned release tag like any other profile plugin; it adds one dependency and one bundle layer named `@zaalipro/dsh-workflows`, with no manual profile patch or install-time build.

```sh
dsh plugin --profile web add github:zaalipro/dsh-workflows#v0.1.0-rc.4
dsh plugin --profile headless add github:zaalipro/dsh-workflows#v0.1.0-rc.4
```

For an exact tested tarball copied to a durable path (not `/tmp`):

```sh
dsh plugin --profile web add /absolute/path/zaalipro-dsh-workflows-0.1.0-rc.4.tgz
dsh plugin --profile headless add /absolute/path/zaalipro-dsh-workflows-0.1.0-rc.4.tgz
```

After `0.1.0-rc.4` is publicly published on npm, the equivalent registry install is:

```sh
dsh plugin --profile web add @zaalipro/dsh-workflows@0.1.0-rc.4
dsh plugin --profile headless add @zaalipro/dsh-workflows@0.1.0-rc.4
```

Web loads the Host product and browser Client; headless loads only the Host product and never evaluates browser code. The plugin leaves the stock `ctx.workflowEngine` untouched. Its supervisor privately uses the package-owned compatibility evaluator emitted as `lib/compat-engine/index.js` and `worker.cjs`.

## Removal

Remove both the dependency and bundle entry, then restart the profile:

```sh
dsh plugin --profile web remove @zaalipro/dsh-workflows
dsh plugin --profile headless remove @zaalipro/dsh-workflows
```

The unmodified official profile boots after removal; the command does not rewrite an official profile file.

## Saved definitions and authoring

Definitions and runs are different resources. A definition is a flat UTF-8 `<name>.workflow.json` file discovered from the first winning root in this order: a configured bundled root, the nearest Git project root's `.dsh/workflows` directory (or the Session cwd when no Git root exists), then `$DSH_HOME/workflows`. Missing roots are allowed; an unsafe, malformed, oversized, linked, or otherwise invalid matching file makes the complete observation fail instead of disappearing from the catalog.

Each file contains exactly metadata-as-data and one plain JavaScript body:

```json
{
  "meta": {
    "name": "review-changes",
    "description": "Review a change and verify the findings",
    "whenToUse": "Before merge",
    "phases": [
      { "title": "Review" },
      { "title": "Verify" }
    ]
  },
  "script": "phase(\"Review\");\nconst review = await agent(\"Review the requested change. Return evidence.\", { label: \"reviewer\", phase: \"Review\" });\nif (review === null) complete({ ok: false, reason: \"review failed\" });\nphase(\"Verify\");\nconst verified = await agent(`Verify this review against the workspace:\\n${review}`, { label: \"verifier\", phase: \"Verify\" });\ncomplete({ ok: verified !== null, review, verified });"
}
```

Names are lowercase kebab-case, start with a letter, use at most 64 UTF-16 code units, match the filename stem, and avoid command-reserved and Windows device names. Run `/create-workflow [detail]` for the installed authoring skill, which gathers intent and fan-out, writes JavaScript with metadata kept as JSON data, validates one representative args-selected path with canned agent results, and saves only after that smoke check succeeds. Its inline tool call defaults to `save_scope: "project"`, or uses `save_scope: "user"` for `$DSH_HOME/workflows`; user scope works without a Session cwd. See the installed [authoring skill](skills/create-workflow/SKILL.md) for the complete hook and quota reference.

Structured `agent()` schemas may put inclusive `minItems` and `maxItems` bounds on array nodes. Each bound must be a non-negative safe integer (not `-0`), `minItems` cannot exceed `maxItems`, and neither keyword may sit beside `oneOf`. The evaluator checks the declaration before launching a child and checks the returned value again; its stock-RC2 adaptation removes the two keywords only from the provider-facing schema copy.

## Launch and operate

Launch a saved definition with `/workflow <name> [<json-args>]` or its generated `/<name> [<json-args>]` alias. An ordinary command keeps a colliding bare name; the workflow receives the first free repeatedly prefixed alias such as `/workflow-review-changes`, while `/workflow review-changes` always works. Launch returns immediately with `Started workflow "<display-name>" in the background. Open /workflows to watch it.`; later runs of the same metadata name use display handles such as `review-changes-2` without exposing internal ids.

In Web, bare `/workflow` opens the saved-definition picker and exact bare `/workflows` is a browser-only slash action that opens the dashboard without Host command lifecycle events or a model turn. Arguments and attachments are refused locally and remain in the composer. In headless, bare `/workflow` prints usage; `/workflows` is intentionally not a Host command because there is no dashboard surface. The dashboard lists saved definitions with Start, plus live and retained runs, phases, agent spend, member outcomes, logs, terminal results, and chunked scratch artifacts. Pause, Resume, Stop, and eligible Save actions are revision-checked; keyboard and narrow-screen drill-down remain available.

An eligible terminal run attempts one owner-visible completion notice. It prefers bounded `scratch/report.md`, otherwise uses a bounded result preview, and ends with `Open /workflows to inspect the run.` The notice is appended directly to the durable Session surface, so it becomes visible without waking the model or entering an Agent inbox. Delivery is at most once: a process failure may omit a notice but cannot retry a claimed, delivered, or abandoned notice.

## Replay, recovery, and security

Pause and Resume are **same-process only**. After an attempt result settles and disposal drains admitted child and scratch work, the package evaluator's quiescent checkpoint is the only replay authority. Matching committed journal calls replay without spending another agent or repeating their committed effects; observer events are not authority. An external effect whose result did not commit can run again, so effectful prompts and verification steps must be idempotent.

`await_user()` resumes the same acknowledged attempt and commits that gate; `pause()` is uncommitted and re-fires on replay while its condition remains true. A `budget-limited` run cannot be resumed by a human control: the model tool must use the internal resume token with an absolute `agent_budget` greater than the old total and no greater than 1,024.

Process death converts every retained active row to non-resumable **Interrupted**, cancels its displayed running members, and restores inspection data only. No Agent, args, script authority, journal, checkpoint, gate, child reference, or effect claim is reconstructed across processes; Interrupted runs cannot Resume or Save.

The version-2 store lives under `$DSH_HOME/workflow-runs`. One permanent `.workflow-storage.lock` anchor holds a native advisory lease for the Host lifetime, and a second cooperating process fails with `workflow storage root is already owned by another live process`. Descriptor-rooted identity, owner, mode, type, and link checks fail closed. The lease coordinates cooperating same-user Hosts; it is not a defense against a malicious process running as the same OS user and ignoring the lease or replacing its anchor.

Workflow scripts have the same trust premise as existing model shell access. A worker and `node:vm` shape available APIs and contain the host event loop, but they are not a hostile-code security sandbox.

## Limitations

- Workflow bodies are plain JavaScript with top-level `await`; there is no Rhai language path.
- Workflow scripts have no nested `workflow()` hook.
- Cross-process execution resume and exactly-once external effects are not provided.
- This package neither contacts nor reuses Grok CLI in any form.
- Validate-only compiles the full script but executes one args-selected path with canned outputs; it does not cover every branch, live tool, or possible agent response.

## Documentation

- [User guide](docs/user-guide.md) — create, validate, launch, inspect, control, and troubleshoot workflows.
- [Architecture](docs/architecture.md) — Host/Client composition, lifecycle authority, storage, Remote paging, and package build.
- [Testing and release acceptance](docs/testing.md) — automated evidence and the final manual Web checklist.
- [Installed authoring skill](skills/create-workflow/SKILL.md) — JavaScript globals, schemas, budgets, scratch, and safe authoring patterns.
- [License](LICENSE) and [native dependency notice](NOTICE.md).
- Official Harness `0.1.2-rc.1` supplies the Host, Agent, Session, provider, and Client services. The plugin compatibility evaluator owns its private deferred-start, journal, gate, scratch, and checkpoint protocol.
