# Agent Note: Installable workflows package over official Harness seams

Status: implemented

English | [中文](2026-08-20-installable-workflows-package.zh.md)

## Problem

Saved workflows and supervised retained runs cross engine, Agent, Session, filesystem, Remote, command, browser, build, and release boundaries. Shipping that product only in a permanent Harness fork forces operators to maintain a divergent distribution, while extracting isolated pieces creates a second engine or splits one lifecycle transaction across packages. The difficult decisions are authority decisions: when a run becomes real, which bytes and object identities authorize replay or control, how concurrent Hosts coordinate durable state, and what data may cross the browser transport.

## Summary

One MIT package, `@zaalipro/dsh-workflows`, installs the complete Host product and the optional Web Client over the official Harness workflow engine in compatible release H. The package owns saved definitions, logical-run supervision, version-2 retained inspection, commands and exact-Agent tool integration, durable Chat recording, completion notices, generated Remote methods, and the dashboard. It does not ship a second evaluator, a forked Harness distribution, Grok CLI code, or a Rhai runtime.

## Context

Official commit `141eb6f` and tag `dsh-v0.1.0-rc.8` are the API-reality and patch-development base. That stock release lacks the required external workflow seams and is deliberately incompatible. **H** denotes the first future official release containing the complete prerequisite set; no unverified later tag is assigned that name.

Development-fork commit `391c829` is a behavioral donor only. Its durable-run experience helps identify required outcomes and regressions, but its RC5-derived substrate is not copied wholesale. The package consumes narrow official capabilities instead: deferred workflow starts, deterministic journal checkpoints and gates, descriptor-rooted private storage, exact-Agent tool/prompt replacement, trusted packaged-skill precedence, client-owned command actions, generated external Remote mounting, and bounded event forwarding.

## Decision

### One distribution unit over one official engine

The npm package is the sole installable unit. Its bundle patch mounts one Host aggregate in Web and headless and advertises one Client aggregate only in Web. The official worker-thread provider remains the only JavaScript workflow engine. Registry, supervisor, recorder, question bridge, commands, tool adapter, Remote services, dashboard, and durable renderer share one package version and unwind under one ownership tree.

The package checks H's explicit prerequisite markers before filesystem initialization or Session admission. A missing capability fails activation rather than selecting a degraded implementation. Removing the package removes one dependency and one bundle layer and leaves the official profile composition intact.

### Exact-Agent integration instead of a parallel model tool

The package never registers a second global `workflow` tool. For each Agent, it examines the effective inherited entry and prompt section. Only reference equality with H's exported official identities permits synchronous `ToolRuntime.replace` and `SystemPrompt.replaceSection` operations through that exact `agent.ctx`. A missing tool, custom same-name tool, identity change, or preset omission receives no replacement. Partial installation rolls back immediately, and the restoring disposers leave no duplicate schema or guidance through HMR.

The packaged `create-workflow` skill uses H's protected trusted contribution for that exact reserved name. Ordinary project/user/global skill precedence remains unchanged for every other name.

### Browser ownership for `/workflows`

Host commands own `/workflow`, `/create-workflow`, and dynamic saved aliases. Exact bare `/workflows` is a Client action that opens `shell.overlay` before Host execution. It produces no command lifecycle record and no duplicate completed Chat row; argued or attachment-bearing input remains unresolved in the command plane and never falls through to the model.

### Durable admission and quiescent checkpoint authority

A fresh launch stages the run directory and projection, commits the version-2 initial manifest row and display ordinal, installs private starting authority, attaches an inert official attempt and observers, publishes public lifecycle, then releases execution once. The manifest commit is durable admission. Caller cancellation owns work only before that point; the supervisor owns it afterward. A post-admission failure terminalizes retained history rather than deleting it.

Pause, cancellation boundaries, and attempt settlement await `handle.result`, idempotent `handle.dispose()`, and admitted child/scratch drainage before calling synchronous `handle.checkpoint()`. That detached engine ledger—journal, cumulative agent spend, and member sequence—is the sole same-process replay authority. Observe-only journal or lifecycle events cannot reconstruct it. A committed matching call replays; an effect whose result did not commit may execute again, so the package does not claim exactly-once external effects.

Process recovery restores inspection and ordinals only. A retained active row becomes terminal Interrupted with no Agent, script/args authority, journal, checkpoint, gate, child handle, or Resume/Save action. Cross-process execution resume is absent by design.

### Manifest-v2 index, immutable sidecars, and kernel lease

The version-2 Session manifest is a bounded head/index rather than an output warehouse. It contains safe one-component run-directory ids, display ordinal high-water marks, bounded heads, revisions, one immutable detail reference per run, and completion-notice state. Members, logs, results, and artifact indexes live in bounded, content-checked immutable detail snapshots. Script and args admitted to a logical run never change when the editable projection changes.

One permanent `.workflow-storage.lock` anchor is opened without following links and held under `fs-native-extensions@1.5.0` for the Host lifetime. Only after nonblocking lease acquisition does the store create child directories and run eager global recovery. Descriptor-rooted private-directory operations enforce owner, mode, type, link-count, containment, and stable device/inode identity. The anchor has no PID, heartbeat, age, stale takeover, retry, or deletion protocol. The lease coordinates cooperating same-user processes; it is not a defense against a malicious same-UID process that ignores the lease or substitutes the anchor.

Retention caps manifests, per-run detail, per-Session terminal rows, startup inventory, and the complete store. Oldest eligible terminal history evicts deterministically while active and claimed-notice rows remain pinned and display ordinal history survives.

### Completion outbox and invalidation-only browser events

Every nonterminal head has `completionNotice: none`. The same transaction that commits an eligible terminal head changes the state to `claimed`; a terminal `none` row is invalid. One bounded delivery attempt finalizes only that claim as `delivered` or `abandoned`, and neither terminal outbox state retries. Recovery abandons orphaned claims. Bounded cohorts and a three-wake limit prevent completion storms while preserving at-most-once authorization.

Forwarded `workflows/run-change` events contain only a per-Session revision invalidation or `invalidate-all`. They never contain run heads, results, members, logs, artifacts, epochs, or cursors. ApiProxy retains keyed-latest hints for a bounded Session set and collapses overflow. The Client fetches every protected page through generated Remote methods authorized by the exact Agent and Session, refreshes an epoch baseline after reconnect, and discards late generations.

### Generated build staging and tarball-first evidence

Host and Client are disjoint TypeScript programs. Build order is Host TSC, focused Typert generation in a copied temporary mini-workspace, Client TSC over generated declarations, then the classic lazy-CJS browser bundle. The staging root owns one aggregate Host config; the copied package owns one staging `tsconfig.json`; no hand-authored Remote descriptor or obsolete nested Host/Client face exists. Generated Typert artifacts are consumed from `WorkspaceTypertGenerator.generate()` return values.

Release evidence starts with one prebuilt `npm pack` tarball and its SHA-256. A consumer outside both repositories installs and boots that unchanged artifact in official Web and headless profiles, imports every export, serves the Client bundle, removes the package, and verifies stock boot. Browser, stress, provider, and final aggregate gates operate on the same product boundary. npm publication and a GitHub Release, when performed, reuse the tested bytes rather than repacking.

## Alternatives considered

**Maintain a permanent Harness fork.** This keeps implementation freedom but makes the workflow product inseparable from a divergent Harness distribution and forces every upstream change through a private merge. The selected official seam plus one external bundle keeps authority narrow and removal reversible.

**Publish several npm packages.** Separate registry, supervisor, storage, and UI packages would expose incompatible version combinations and split durable admission, teardown, and asset compatibility across independent install units. One package still has disjoint Host/Client build faces without splitting runtime ownership.

**Ship a second workflow engine or copy donor files wholesale.** Another evaluator would fork hook, schema, cancellation, subagent, and durable vocabulary behavior. Wholesale donor code also imports RC5 assumptions. H's official engine remains authoritative; donor behavior contributes tests and requirements only.

**Resume execution across process death.** Persisting enough authority would require reconstructing Agent identity, args/script authority, gates, child handles, and external-effect claims. A journal cannot prove that an uncommitted external effect did not occur. Interrupted inspection is honest; a new run is safer than false continuation.

**Use stale lock timers, PID records, heartbeats, or lock-file deletion.** Time cannot distinguish a paused live owner from a crashed one, and deleting a pathname does not revoke a held descriptor. A permanent anchor with a kernel-owned lifetime lease provides the required cooperating-process exclusion and releases on process death.

**Forward complete run heads in events.** Broadcast data would bypass Agent authorization, create unbounded queues, and race revisions. Invalidation-only events plus authorized pages preserve privacy and bounded reconnect behavior.

**Hand-maintain Remote descriptors.** Manual Host/Client protocol duplication drifts from decorated methods and creates an unsupported build path. Focused Typert generation is the single descriptor authority and fails package activation when required artifacts are absent.

## Consequences

The package can install and uninstall as one reversible profile layer, and official H continues to own script semantics, child execution, and durable Chat vocabulary. Durable-before-visible launch and fixed-point teardown make the supervisor responsible for every accepted attempt through cleanup. Same-process replay suppresses committed matching effects, while documentation and authoring patterns must keep uncommitted effects idempotent.

The design pays for strict compatibility: stock RC8 cannot load the package, and a release is compatible only after every H prerequisite and package acceptance gate passes. Native locking and descriptor-rooted filesystem capabilities are mandatory; unsupported platforms fail rather than silently weakening storage. Retained data and browser reads are bounded, so older terminal detail can become explicitly truncated or evicted.

The browser receives richer inspection without becoming an execution authority. Generated Remote staging and tarball-first verification add build complexity, but they detect missing assets, source fallback, protocol drift, and install-only failures before publication.

## References

- [Package architecture](../../../../docs/architecture.md)
- [Testing and release acceptance](../../../../docs/testing.md)
- [User guide](../../../../docs/user-guide.md)
- [Official workflow subsystem](https://github.com/deepseek-ai/deepseek-harness/blob/main/docs/subsystems/workflow.md)
- [Package README](../../../../README.md)
