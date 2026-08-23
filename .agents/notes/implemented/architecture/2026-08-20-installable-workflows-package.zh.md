# Agent Note: 基于官方 Harness seam 的可安装 workflow package

Status: implemented

本笔记记录 `@zaalipro/dsh-workflows` 当前已实现的 package 架构。Plugin `0.1.0-rc.3` 只支持官方 Harness `0.1.1-rc.2`；CLI 与 workflow package manifest 必须在 activation 前同时精确匹配。由于 stock evaluator 与 private-directory face 未暴露完整 workflow product contract，本包提供自己的 compatibility evaluator 与 retained-storage descriptor。

[English](2026-08-20-installable-workflows-package.md) | 中文

## Problem

Saved workflow 与 supervised retained run 跨越 engine、Agent、Session、filesystem、Remote、command、browser、build 和 release boundary。只在永久 Harness fork 中发布该产品会迫使 operator 维护 divergent distribution，而单独提取各部分会创建第二个 engine，或把一个 lifecycle transaction 拆到多个 package。困难的决策都与 authority 有关：run 何时成为现实、哪些 byte 与 object identity 授权 replay/control、并发 Host 如何协调 durable state，以及哪些 data 可以跨越 browser transport。

## Summary

一个 MIT package `@zaalipro/dsh-workflows` 在官方 Harness `0.1.1-rc.2` 上安装完整 Host 产品和可选 Web Client。本包拥有 compatibility evaluator、saved definition、logical-run supervision、version-2 retained inspection、command 与 exact-Agent tool integration、durable Chat recording、completion notice、generated Remote method 和 dashboard。它不发布 forked Harness distribution、Grok CLI code 或 Rhai runtime。

## Context

官方 commit `141eb6f` 与 tag `dsh-v0.1.0-rc.8` 是最初的不兼容 API-reality baseline。当前 release evidence 改为固定官方 `0.1.1-rc.2`；未验证的更早或更晚版本都会在 exact manifest gate 失败。

Development-fork commit `391c829` 只作为 behavioral donor。它的 durable-run experience 有助于确定 required outcome 与 regression，但不会 wholesale copy 其 RC5-derived substrate。本包消费狭窄的官方 capability：deferred workflow start、deterministic journal checkpoint 与 gate、descriptor-rooted private storage、exact-Agent tool/prompt replacement、trusted packaged-skill precedence、client-owned command action、generated external Remote mounting，以及 bounded event forwarding。

## Decision

### 一个 distribution unit 使用 package compatibility evaluator

npm package 是唯一 installable unit。其 bundle patch 在 Web 与 headless 中挂载一个 Host aggregate，并且只在 Web 中公布一个 Client aggregate。Stock workflow service 为 stock consumer 保持挂载，而 plugin run 使用 package-private compatibility evaluator。Registry、supervisor、recorder、question bridge、command、tool adapter、Remote service、dashboard 与 durable renderer 共享一个 package version，并在一个 ownership tree 中 unwind。

本包会在 configuration、filesystem initialization 或 Session admission 前解析精确 CLI 与 workflow package version，然后 preflight 所需 stock service face。Version mismatch 或 capability 缺失会使 activation 失败，而不会选择 degraded implementation。移除 package 会移除一个 dependency 与一个 bundle layer，并保持官方 profile composition 完整。

### Exact-Agent integration，而不是并行 model tool

本包绝不注册第二个 global `workflow` tool。对于每个 Agent，它检查 effective inherited entry。在 stock `0.1.1-rc.2` 上，只有完整 official public workflow fingerprint 才允许 Agent-scoped `tools.register` 与 `systemPrompt.section`；未来 atomic seam 仍使用 exact identity/marker compare-and-swap。Missing tool、custom same-name tool、identity change 或 preset omission 都不会获得 replacement。Package-owned mutation 会 suppress unscoped `tools/change` fan-out，使多个 Agent shadow 安静收敛而不会重复注册循环。

Packaged `create-workflow` skill 从 installed asset 读取，并在该 seam 可用时使用官方 trusted contribution。其他所有名称的普通 project/user/global skill precedence 保持不变。

### `/workflows` 的 browser ownership

Host command 拥有 `/workflow`、`/create-workflow` 和 dynamic saved alias。严格的裸 `/workflows` 是一个 Client action，会在 Host execution 前打开 `shell.overlay`。它不产生 command lifecycle record 或重复 completed Chat row；带 argument 或 attachment 的 input 保持 unresolved command plane 状态，绝不落到 model。

### Durable admission 与 quiescent checkpoint authority

Fresh launch stage run directory 与 projection，提交 version-2 initial manifest row 和 display ordinal，安装 private starting authority，附加 inert official attempt 与 observer，发布 public lifecycle，然后只 release execution 一次。Manifest commit 是 durable admission。Caller cancellation 只在该点前拥有 work；之后由 supervisor 拥有。Post-admission failure 会 terminalize retained history，而不是删除它。

Pause、cancellation boundary 与 attempt settlement 会等待 `handle.result`、idempotent `handle.dispose()` 以及 admitted child/scratch drainage，再调用同步 `handle.checkpoint()`。该 detached engine ledger——journal、cumulative agent spend 与 member sequence——是唯一 same-process replay authority。Observe-only journal 或 lifecycle event 无法重建它。Committed matching call 会 replay；result 未 commit 的 effect 可能再次执行，因此 package 不声称 exactly-once external effect。

Process recovery 只恢复 inspection 与 ordinal。Retained active row 变成 terminal Interrupted，不带 Agent、script/args authority、journal、checkpoint、gate、child handle 或 Resume/Save action。Cross-process execution resume 按设计不存在。

### Manifest-v2 index、immutable sidecar 与 kernel lease

Version-2 Session manifest 是 bounded head/index，而不是 output warehouse。它包含 safe one-component run-directory id、display ordinal high-water mark、bounded head、revision、每个 run 的一个 immutable detail reference，以及 completion-notice state。Member、log、result 与 artifact index 存放在 bounded、content-checked immutable detail snapshot 中。Admitted logical run 的 script 与 args 不会随着 editable projection 改变。

一个永久 `.workflow-storage.lock` anchor 以 no-follow 方式打开，并在 Host lifetime 内由 `fs-native-extensions@1.5.0` 持有。只有成功取得 nonblocking lease 后，store 才创建 child directory 并执行 eager global recovery。Descriptor-rooted private-directory operation 强制 owner、mode、type、link-count、containment 与稳定 device/inode identity。Anchor 没有 PID、heartbeat、age、stale takeover、retry 或 deletion protocol。Lease 协调同一用户下的 cooperating process；它不能防御忽略 lease 或 substitute anchor 的 malicious same-UID process。

Retention 限制 manifest、per-run detail、per-Session terminal row、startup inventory 和完整 store。最旧且符合条件的 terminal history 会确定性 evict，active 与 claimed-notice row 保持 pinned，display ordinal history 保留。

### Completion outbox 与 invalidation-only browser event

每个 nonterminal head 都有 `completionNotice: none`。提交 eligible terminal head 的同一 transaction 会把 state 变成 `claimed`；terminal `none` row 无效。一个 bounded delivery attempt 只把该 claim finalize 为 `delivered` 或 `abandoned`，两个 terminal outbox state 都不 retry。Recovery abandon orphaned claim。Bounded cohort 与 three-wake limit 在保留 at-most-once authorization 的同时防止 completion storm。

Forwarded `workflows/run-change` event 只包含 per-Session revision invalidation 或 `invalidate-all`。它们绝不包含 run head、result、member、log、artifact、epoch 或 cursor。ApiProxy 为 bounded Session set 保留 keyed-latest hint 并 collapse overflow。Client 通过 exact Agent 与 Session 授权的 generated Remote method 获取每个 protected page，在 reconnect 后 refresh epoch baseline，并丢弃 late generation。

### Generated build staging 与 tarball-first evidence

Host 与 Client 是 disjoint TypeScript program。Build 顺序是 Host TSC、在 copied temporary mini-workspace 中 focused Typert generation、Client TSC 消费 generated declaration，最后生成 classic lazy-CJS browser bundle。Staging root 拥有一个 aggregate Host config；copied package 拥有一个 staging `tsconfig.json`；不存在 hand-authored Remote descriptor 或 obsolete nested Host/Client face。Generated Typert artifact 从 `WorkspaceTypertGenerator.generate()` return value 消费。

Release evidence 从一个 prebuilt `npm pack` tarball 及其 SHA-256 开始。`scripts/packed-consumer.mjs` 以 scripts disabled 安装这些 byte，import 每个 public JavaScript/NodeNext export，通过 lazy-CJS seam 加载 `lib/client.js`，验证精确官方 `0.1.1-rc.2` Host，并在 isolated home 下执行 Web/headless plugin add、bounded boot、remove 与 restored stock boot。Browser、stress、provider 与 final aggregate gate 都在同一 product boundary 上运行。执行 npm publication 与 GitHub Release 时，它们复用 tested byte，而不是 repack。

## Rejected alternatives

**维护永久 Harness fork。** 这保留 implementation freedom，但使 workflow product 无法与 divergent Harness distribution 分离，并迫使每个 upstream change 经过 private merge。选定的 official seam 加一个 external bundle 使 authority 狭窄且 removal 可逆。

**发布多个 npm package。** 拆分 registry、supervisor、storage 与 UI 会暴露不兼容版本组合，并把 durable admission、teardown 与 asset compatibility 分裂到 independent install unit。一个 package 仍可拥有 disjoint Host/Client build face，而不拆分 runtime ownership。

**Wholesale copy donor file。** Wholesale donor code 会引入 RC5 assumption。狭窄且带 attribution 的 package evaluator 只维护所需 workflow behavior；其他 donor behavior 只贡献 test 与 requirement。

**在 process death 后 resume execution。** 持久化足够 authority 要求重建 Agent identity、args/script authority、gate、child handle 和 external-effect claim。Journal 无法证明 uncommitted external effect 没有发生。Interrupted inspection 是诚实表达；new run 比 false continuation 更安全。

**使用 stale lock timer、PID record、heartbeat 或 lock-file deletion。** Time 无法区分 paused live owner 与 crashed owner，删除 pathname 也不会 revoke held descriptor。带 kernel-owned lifetime lease 的 permanent anchor 提供所需 cooperating-process exclusion，并在 process death 时释放。

**在 event 中 forward 完整 run head。** Broadcast data 会绕过 Agent authorization、创建 unbounded queue 并产生 revision race。Invalidation-only event 加 authorized page 保留 privacy 与 bounded reconnect behavior。

**手工维护 Remote descriptor。** Manual Host/Client protocol duplication 会偏离 decorated method 并创建 unsupported build path。Focused Typert generation 是唯一 descriptor authority，required artifact 缺失时 package activation 会失败。

## Consequences

本包可以作为一个 reversible profile layer 安装与移除；compatibility evaluator 拥有 plugin script semantic 与 child execution，官方 Session vocabulary 继续作为 durable Chat authority。Durable-before-visible launch 与 fixed-point teardown 让 supervisor 对每个 accepted attempt 负责直到 cleanup。Same-process replay 会 suppress committed matching effect，而 documentation 与 authoring pattern 必须让 uncommitted effect 保持幂等。

该设计为严格 compatibility 付出代价：只有官方 `0.1.1-rc.2` 可以加载 plugin `0.1.0-rc.3`，更高版本需要新的 verified package release。Native locking 与 plugin-owned descriptor operation 是必需条件；unsupported platform 会失败，而不是静默弱化 storage。Retained data 与 browser read 有界，因此较旧 terminal detail 可变成明确 truncated 或 evicted 状态。

Browser 获得更丰富 inspection，但不成为 execution authority。Generated Remote staging 与 tarball-first verification 增加 build complexity，却能在 publication 前发现 missing asset、source fallback、protocol drift 和 install-only failure。

## References

- [Package architecture](../../../../docs/architecture.zh.md)
- [Testing and release acceptance](../../../../docs/testing.zh.md)
- [User guide](../../../../docs/user-guide.zh.md)
- [Official workflow subsystem](https://github.com/deepseek-ai/deepseek-harness/blob/main/docs/subsystems/workflow.zh.md)
- [Package README](../../../../README.zh.md)
