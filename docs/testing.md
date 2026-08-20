# Testing and release acceptance

English | [中文](testing.zh.md)

This reference separates automated proof from the final human release decision. A green unit suite never substitutes for the official-prerequisite, assembled, packed-consumer, browser, race, provider, or manual boundaries below.

## Automated gates

Run package commands from the package checkout with a frozen `pnpm@11.7.0` install. Each command exits nonzero at its first failure; the text after it is the success marker a CI or release log must retain.

### Build, type, lint, coverage, and docs

```sh
pnpm run build && printf 'package build PASS\n'
pnpm run typecheck && printf 'package typecheck PASS\n'
pnpm run lint && printf 'package lint PASS\n'
pnpm run test:coverage && printf 'package coverage PASS\n'
node scripts/verify-docs.mjs
```

The documentation command prints exactly `documentation verification passed`. It checks complete English/Chinese pairs and their recorded blob hashes, local files and heading fragments, one trailing LF, current compatibility prose, and the required installation, architecture, testing, user, and Agent Note coverage.

### Keyless assembled snapshots

```sh
pnpm exec vitest run tests/keyless-snapshot.spec.ts --reporter=dot && printf 'RD5 keyless snapshot PASS\n'
pnpm exec vitest run tests/dashboard-snapshot.client.spec.tsx --reporter=dot && printf 'RD6 dashboard snapshots PASS\n'
```

The first command boots the source-resolved official engine, Session, command plane, package, and deterministic provider, then compares reviewed Session/stdout JSONL and restart recovery. The second locks accessible empty, live, terminal, interrupted, disclosure, and member-outcome semantics rather than CSS hashes.

### Package policy and exact packed consumer

```sh
pnpm exec vitest run tests/verify-package.spec.ts --reporter=dot && printf 'RD3 package policy PASS\n'
pnpm exec vitest run tests/packed-consumer.spec.ts --reporter=dot && printf 'RD8 packed consumer PASS\n'
```

The packed-consumer test performs one `pnpm pack --json`, records SHA-256, and sends that unchanged absolute tarball to policy verification and a temporary consumer outside both repositories. That consumer installs with scripts disabled, imports every JavaScript and strict NodeNext export, boots official Web and headless profiles, serves `lib/client.js`, removes the package, and proves the stock profiles boot again. Source-tree fallback or a second pack is a failure.

### Automated Chromium

```sh
pnpm exec vitest run tests/browser-smoke.spec.ts --reporter=dot && printf 'RD10 browser automation PASS\n'
```

The browser test installs the same tarball into a real official Web server with a deterministic model seam. It covers slash discovery, immediate background acknowledgements, numbered runs, live updates, completion notices, both disclosures, complete text and JSON-null outcomes, Retry retention, gates and controls, reconnect, focus/shortcuts, reduced motion, and the 1,199 px, 767 px, and 320 px layouts. This automation uses the repository browser runner; it does not use Ego Lite and does not replace final manual acceptance.

### Lifecycle, storage, and Client stress

```sh
pnpm exec vitest run tests/race-stress.spec.ts --reporter=dot && printf 'RD11 host race stress PASS\n'
pnpm exec vitest run tests/storage-stress.spec.ts --reporter=dot && printf 'RD12 storage stress PASS\n'
pnpm exec vitest run tests/client-race-stress.client.spec.ts --reporter=dot && printf 'RD13 client race stress PASS\n'
```

These deterministic repeated suites cover aggregate cancellation, pending durable admission, pause/stop/teardown, worker death, completion cohorts, advisory-lease contention, link/inode substitution, interrupted publication, stale gate/control/page responses, reconnect generations, invalidation overflow, and cross-Agent authorization. They assert zero orphan worker, child, scratch operation, timer, watcher, controller, request, cursor, selection, or unhandled rejection. The donor aggregate-cancellation scenario must pass alone and inside the aggregate suite repeatedly; one passing rerun never excuses a failure.

### Opt-in real provider

```sh
pnpm exec vitest run tests/real-provider.spec.ts --reporter=dot && printf 'RD14 real provider gate PASS\n'
```

With `DEEPSEEK_API_KEY`, the file starts exactly two logical children labelled `alpha` and `beta`, verifies the independent bytes `alpha` in `alpha.txt` and `beta` in `beta.txt`, verifies final result `{"alpha":"alpha","beta":"beta"}`, and disposes every child, worker, Agent, Host, lease, and temporary directory in `finally`. It reads `DEEPSEEK_BASE_URL` only through official provider configuration. Neither value, any credential, nor a model transcript enters logs or artifacts.

Without the key, this file alone registers exactly one skipped test with reason `DEEPSEEK_API_KEY is not set`. No other package, platform, workflow, or storage lane may self-skip.

### Official H prerequisites

Run this acceptance in the official Harness checkout containing the proposed H prerequisites, not in this package checkout:

```sh
pnpm exec vitest run --config vitest.config.ts --no-passWithNoTests packages/core/tools/tests/json-schema.spec.ts packages/fs/fs/tests/service.spec.ts packages/fs/fs-local/tests/filesystem.spec.ts packages/fs/fs-sandbox/tests/fs-sandbox.spec.ts packages/workflow/workflow/tests/workflow.spec.ts packages/workflow/workflow-worker-thread/tests packages/workflow/tool-ralph/tests/integration.spec.ts packages/interaction/commands/tests/commands.spec.ts packages/client/ui-commands/tests/service.client.spec.ts packages/host/apiproxy/tests/api-proxy-remote-events.spec.ts packages/host/apiproxy/tests/frame-queue.spec.ts packages/api/remotes/tests/remote-events.spec.ts && pnpm run typecheck && pnpm run lint && pnpm run doc-sync && printf 'U45_UPSTREAM_ACCEPTANCE_OK\n'
```

The final line must be `U45_UPSTREAM_ACCEPTANCE_OK`. This proves the source and built worker paths, Ralph, schemas, descriptor-rooted filesystem methods, exact-Agent replacements, command action/fallback behavior, Remote forwarding, type checking, lint, and bilingual official documentation against official base `141eb6f` plus only the reviewed prerequisite changes. Donor commit `391c829` remains reference-only.

### Final automated aggregate

```sh
pnpm run check:release
```

Success ends exactly `release checks passed`. The orchestrator runs clean/frozen-install verification, build, typecheck, lint, per-file coverage, snapshots, documentation, package policy, one immutable pack and packed consumer, automated Chromium, all three stress suites, and the opt-in provider file in order. It does not publish, launch Ego Lite, or record a GIF.

## Coverage policy

Every owned handwritten runtime source file must report 100% statements, branches, functions, and lines **per file**. Aggregate 100% is insufficient. Tests exercise deterministic clocks and barriers, every error and cancellation branch, effect disposal, HMR registration, authorization, and external world state rather than self-reported success.

The only non-instrumented artifacts are generated or browser-delivery products rather than an exception for handwritten Host behavior:

| Exclusion | Why it is not instrumented as owned runtime source | Required evidence |
|---|---|---|
| `lib/typert.host.*` and `lib/typert.remote-client.*` | Generated from decorated Host source | `tests/build-artifacts.spec.ts`, Remote API tests, packed imports, and browser mount smoke |
| `lib/client.js`, emitted Client declarations/maps, and Lightning CSS output | Generated bundle products | Client component/controller specs, dashboard semantic snapshots, packed serving, and `tests/browser-smoke.spec.ts` |
| `src/client/css-modules.d.ts` | Type-only generated-facing declaration with no executable statements | Client TSC plus source assertion in the build suite |
| CSS module visual branches | Styles do not enter JavaScript statement coverage | source token assertions, semantic component specs, three browser breakpoints, light/dark/reduced-motion automation, and the final real-flow GIF when GUI behavior changes |

Handwritten Client TypeScript remains covered by its Client test project; generated outputs do not create a parallel coverage denominator. Adding another exclusion requires corresponding real-browser evidence and an explicit testing-policy change.

## CI platform matrix

Blocking Ubuntu 24.04 jobs run Node `22.19.0`, `24`, and `26`; each uses a frozen lockfile and covers build, typecheck, lint, docs, package policy, and its assigned unit/coverage/snapshot gates. Node 24 additionally owns macOS 14, Windows Server 2022, Chromium, race-stress, and release-pack/packed-consumer jobs. The packed lane checks out official commit `141eb6fef83422698aef7a981029e843e8161534`, applies only the H prerequisite patch, packs once, and preserves one digest and artifact path.

Windows runs every supported definition, manifest, scratch, retention, recovery, and subprocess case. It explicitly asserts junction/hard-link behavior and either working native advisory locking or the documented `WORKFLOW_STORAGE_UNSUPPORTED` result; it never silently skips the workflow, marks the job `continue-on-error`, or treats a platform limitation as success without asserting its exact branch.

CI may upload reviewed snapshot, browser, stress, and pack diagnostics only after failure. It never uploads a DSH home, credential, secret-lane model transcript, or unrestricted scratch store. Actions are pinned to full commit SHAs, permissions default read-only, jobs have timeouts, and only the real-provider file may skip for an absent key.

## Real-provider secret and cleanup policy

CI passes `DEEPSEEK_API_KEY` only to the isolated provider job when available. The test never prints the key or base URL and never copies them into child prompts, session logs, screenshots, archives, or failure diagnostics. A provider error may name the display handle and provider failure, never the internal run UUID or credential material.

All live resources are created inside an isolated workspace and DSH home. `finally` stops or settles the run, disposes child catalog entries, worker handles, the Agent and Host, releases the permanent-anchor lease, and removes the temporary directories even after provider failure or timeout.

## Final manual Web acceptance

This is a release checklist, not a coding task, CI step, or substitute for automated Chromium. Perform it only after every automated gate passes, using the exact tested tarball installed into a real H Web profile and a real server/model flow.

- [ ] Start the tarball-installed real server and confirm the package activates without a source checkout fallback.
- [ ] Use **Ego Lite** for the smoke journey. Reuse its task space across the journey; never wipe or reset any user session, cookies, browser storage, or daily-browser state.
- [ ] Confirm `/create-workflow`, `/workflow`, `/workflows`, and a saved alias appear; launch two runs and observe immediate acknowledgements, display-name numbering, live phase/member/progress updates, and a usable composer.
- [ ] Open and close the run disclosure and `Inspect · N members`; inspect real text/Markdown and JSON outcomes, logs, result, and a scratch artifact. Verify no internal UUID appears in user-visible or accessible text.
- [ ] Exercise a resumable gate, Pause, Resume, Stop, and an eligible Save; confirm stale-revision and budget-limited errors remain visible and actionable.
- [ ] Check focus restoration, keyboard controls, screen-reader labels, light/dark/reduced-motion behavior, and the narrow mobile drill-down without horizontal overflow.
- [ ] Confirm exactly one completion notice per eligible run and no duplicate `workflows · Completed` row merely from opening the dashboard.
- [ ] For any product-visible GUI change, record and retain a GIF from this **real PR server/model flow** showing launch, live updates, member outcome inspection, controls, and narrow layout. A mocked or source-only GIF is not release evidence.
- [ ] When verification is complete, close **only the Ego Lite task space**. Do not wipe sessions, cookies, storage, or unrelated tabs/spaces.

Record the tested tarball SHA-256, H build identity, platform, automated aggregate log, manual result, and GIF location in the release evidence. A failed manual item blocks release even when the automated suite is green.
