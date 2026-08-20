# 测试与发布验收

[English](testing.md) | 中文

本参考把自动化证明与最终人工发布决策分开。绿色 unit suite 绝不能替代下列 official-prerequisite、assembled、packed-consumer、browser、race、provider 或 manual boundary。

## 自动化 gate

使用冻结的 `pnpm@11.7.0` install，并从 package checkout 运行命令。每个命令在首次失败时非零退出；其后的文字是 CI 或 release log 必须保留的 success marker。

### Build、type、lint、coverage 与 docs

```sh
pnpm run build && printf 'package build PASS\n'
pnpm run typecheck && printf 'package typecheck PASS\n'
pnpm run lint && printf 'package lint PASS\n'
pnpm run test:coverage && printf 'package coverage PASS\n'
node scripts/verify-docs.mjs
```

Documentation command 准确输出 `documentation verification passed`。它检查完整 English/Chinese pair 及记录的 blob hash、local file 与 heading fragment、单个 trailing LF、当前 compatibility prose，以及必需的 installation、architecture、testing、user 和 Agent Note coverage。

### Keyless assembled snapshot

```sh
pnpm exec vitest run tests/keyless-snapshot.spec.ts --reporter=dot && printf 'RD5 keyless snapshot PASS\n'
pnpm exec vitest run tests/dashboard-snapshot.client.spec.tsx --reporter=dot && printf 'RD6 dashboard snapshots PASS\n'
```

第一个命令启动 source-resolved official engine、Session、command plane、package 和 deterministic provider，然后比较 reviewed Session/stdout JSONL 与 restart recovery。第二个命令固定 accessible empty、live、terminal、interrupted、disclosure 和 member-outcome semantic，而不是 CSS hash。

### Package policy 与 exact packed consumer

```sh
pnpm exec vitest run tests/verify-package.spec.ts --reporter=dot && printf 'RD3 package policy PASS\n'
pnpm exec vitest run tests/packed-consumer.spec.ts --reporter=dot && printf 'RD8 packed consumer PASS\n'
```

Packed-consumer test 只执行一次 `pnpm pack --json`，记录 SHA-256，并把完全相同的绝对 tarball 交给 policy verification 和位于两个 repository 之外的临时 consumer。该 consumer 禁用 script 后安装，import 所有 JavaScript 与 strict NodeNext export，启动官方 Web 与 headless profile，serve `lib/client.js`，移除 package，并证明 stock profile 再次启动。Source-tree fallback 或第二次 pack 都是失败。

### 自动化 Chromium

```sh
pnpm exec vitest run tests/browser-smoke.spec.ts --reporter=dot && printf 'RD10 browser automation PASS\n'
```

Browser test 把同一 tarball 安装进使用 deterministic model seam 的真实官方 Web server。它覆盖 slash discovery、immediate background acknowledgement、numbered run、live update、completion notice、两个 disclosure、完整 text 与 JSON-null outcome、Retry retention、gate 与 control、reconnect、focus/shortcut、reduced motion，以及 1,199 px、767 px 和 320 px layout。该自动化使用 repository browser runner；它不使用 Ego Lite，也不替代最终人工验收。

### Lifecycle、storage 与 Client stress

```sh
pnpm exec vitest run tests/race-stress.spec.ts --reporter=dot && printf 'RD11 host race stress PASS\n'
pnpm exec vitest run tests/storage-stress.spec.ts --reporter=dot && printf 'RD12 storage stress PASS\n'
pnpm exec vitest run tests/client-race-stress.client.spec.ts --reporter=dot && printf 'RD13 client race stress PASS\n'
```

这些 deterministic repeated suite 覆盖 aggregate cancellation、pending durable admission、pause/stop/teardown、worker death、completion cohort、advisory-lease contention、link/inode substitution、interrupted publication、stale gate/control/page response、reconnect generation、invalidation overflow 与 cross-Agent authorization。它们断言不存在 orphan worker、child、scratch operation、timer、watcher、controller、request、cursor、selection 或 unhandled rejection。Donor aggregate-cancellation scenario 必须单独以及在 aggregate suite 中重复通过；一次成功 rerun 绝不能免除失败。

### Opt-in real provider

```sh
pnpm exec vitest run tests/real-provider.spec.ts --reporter=dot && printf 'RD14 real provider gate PASS\n'
```

存在 `DEEPSEEK_API_KEY` 时，该文件准确启动两个名为 `alpha` 与 `beta` 的 logical child，分别验证 `alpha.txt` 中独立的 `alpha` byte 和 `beta.txt` 中独立的 `beta` byte，验证最终 result `{"alpha":"alpha","beta":"beta"}`，并在 `finally` 中 dispose 每个 child、worker、Agent、Host、lease 和 temporary directory。它只通过官方 provider configuration 读取 `DEEPSEEK_BASE_URL`。任何 value、credential 或 model transcript 都不会进入 log 或 artifact。

没有 key 时，只有该文件注册一个 skipped test，reason 准确为 `DEEPSEEK_API_KEY is not set`。其他 package、platform、workflow 或 storage lane 都不能 self-skip。

### 官方 H 前置能力

在包含拟议 H 前置能力的官方 Harness checkout 中运行该验收，而不是本 package checkout：

```sh
pnpm exec vitest run --config vitest.config.ts --no-passWithNoTests packages/core/tools/tests/json-schema.spec.ts packages/fs/fs/tests/service.spec.ts packages/fs/fs-local/tests/filesystem.spec.ts packages/fs/fs-sandbox/tests/fs-sandbox.spec.ts packages/workflow/workflow/tests/workflow.spec.ts packages/workflow/workflow-worker-thread/tests packages/workflow/tool-ralph/tests/integration.spec.ts packages/interaction/commands/tests/commands.spec.ts packages/client/ui-commands/tests/service.client.spec.ts packages/host/apiproxy/tests/api-proxy-remote-events.spec.ts packages/host/apiproxy/tests/frame-queue.spec.ts packages/api/remotes/tests/remote-events.spec.ts && pnpm run typecheck && pnpm run lint && pnpm run doc-sync && printf 'U45_UPSTREAM_ACCEPTANCE_OK\n'
```

最后一行必须是 `U45_UPSTREAM_ACCEPTANCE_OK`。这证明 source 与 built worker path、Ralph、schema、descriptor-rooted filesystem method、exact-Agent replacement、command action/fallback behavior、Remote forwarding、type checking、lint 和双语官方文档都基于 official base `141eb6f` 加上仅经审查的 prerequisite change。Donor commit `391c829` 仍然只作为 reference。

### 最终自动化 aggregate

```sh
pnpm run check:release
```

成功时准确以 `release checks passed` 结束。Orchestrator 按顺序运行 clean/frozen-install verification、build、typecheck、lint、per-file coverage、snapshot、documentation、package policy、一次 immutable pack 与 packed consumer、自动化 Chromium、三个 stress suite 和 opt-in provider file。它不会 publish、启动 Ego Lite 或录制 GIF。

## Coverage policy

每个 owned handwritten runtime source file 都必须**逐文件**达到 100% statement、branch、function 与 line。Aggregate 100% 不充分。Test 覆盖 deterministic clock 与 barrier、每个 error/cancellation branch、effect disposal、HMR registration、authorization 和 external world state，而不依赖 self-reported success。

唯一不 instrument 的 artifact 是 generated 或 browser-delivery product，而不是 handwritten Host behavior 的例外：

| Exclusion | 为何不作为 owned runtime source instrument | 必需证据 |
|---|---|---|
| `lib/typert.host.*` 与 `lib/typert.remote-client.*` | 从 decorated Host source 生成 | `tests/build-artifacts.spec.ts`、Remote API test、packed import 与 browser mount smoke |
| `lib/client.js`、emitted Client declaration/map 与 Lightning CSS output | Generated bundle product | Client component/controller spec、dashboard semantic snapshot、packed serving 与 `tests/browser-smoke.spec.ts` |
| `src/client/css-modules.d.ts` | 无 executable statement 的 type-only generated-facing declaration | Client TSC 加 build suite source assertion |
| CSS module visual branch | Style 不进入 JavaScript statement coverage | source token assertion、semantic component spec、三个 browser breakpoint、light/dark/reduced-motion automation，以及 GUI behavior 改变时最终 real-flow GIF |

Handwritten Client TypeScript 仍由其 Client test project 覆盖；generated output 不建立并行 coverage denominator。增加其他 exclusion 必须提供相应 real-browser evidence 和显式 testing-policy change。

## CI platform matrix

Blocking Ubuntu 24.04 job 运行 Node `22.19.0`、`24` 和 `26`；每个 job 使用 frozen lockfile，并覆盖 build、typecheck、lint、docs、package policy 以及分配的 unit/coverage/snapshot gate。Node 24 还拥有 macOS 14、Windows Server 2022、Chromium、race-stress 和 release-pack/packed-consumer job。Packed lane checkout 官方 commit `141eb6fef83422698aef7a981029e843e8161534`，只应用 H prerequisite patch，只 pack 一次，并保留一个 digest 和 artifact path。

Windows 运行每个支持的 definition、manifest、scratch、retention、recovery 与 subprocess case。它明确断言 junction/hard-link behavior，以及可工作的 native advisory locking 或已记录的 `WORKFLOW_STORAGE_UNSUPPORTED` result；它绝不静默 skip workflow、把 job 标记为 `continue-on-error`，或在没有断言准确 branch 时把 platform limitation 当作成功。

CI 只能在失败后上传 reviewed snapshot、browser、stress 和 pack diagnostic。它绝不上传 DSH home、credential、secret-lane model transcript 或 unrestricted scratch store。Action 固定到完整 commit SHA，permission 默认 read-only，job 有 timeout，而且只有 real-provider file 可因 key 缺失而 skip。

## Real-provider secret 与 cleanup policy

CI 只在可用时把 `DEEPSEEK_API_KEY` 传给隔离的 provider job。Test 不打印 key 或 base URL，也不把它们复制到 child prompt、session log、screenshot、archive 或 failure diagnostic。Provider error 可以命名 display handle 和 provider failure，绝不能包含 internal run UUID 或 credential material。

所有 live resource 都创建在 isolated workspace 与 DSH home 内。`finally` 会 stop 或 settle run、dispose child catalog entry、worker handle、Agent 和 Host、释放 permanent-anchor lease，并且即使 provider failure 或 timeout 也会移除 temporary directory。

## Final manual Web acceptance

这是 release checklist，不是 coding task、CI step 或 automated Chromium 的替代。只有全部自动化 gate 通过后，才使用安装了完全相同 tested tarball 的真实 H Web profile 和 real server/model flow 执行。

- [ ] 启动 tarball-installed real server，确认 package activation 没有 source checkout fallback。
- [ ] 使用 **Ego Lite** 完成 smoke journey。全程复用它的 task space；绝不 wipe 或 reset 任何 user session、cookie、browser storage 或 daily-browser state。
- [ ] 确认 `/create-workflow`、`/workflow`、`/workflows` 和 saved alias 出现；启动两个 run，观察 immediate acknowledgement、display-name numbering、live phase/member/progress update，以及仍可用的 composer。
- [ ] 打开并关闭 run disclosure 和 `Inspect · N members`；检查真实 text/Markdown 与 JSON outcome、log、result 和 scratch artifact。验证 user-visible 或 accessible text 中没有 internal UUID。
- [ ] 运行 resumable gate、Pause、Resume、Stop 和符合条件的 Save；确认 stale-revision 与 budget-limited error 保持可见且 actionable。
- [ ] 检查 focus restoration、keyboard control、screen-reader label、light/dark/reduced-motion behavior 和没有水平 overflow 的 narrow mobile drill-down。
- [ ] 确认每个符合条件的 run 只有一个 completion notice，而且仅打开 dashboard 不产生重复 `workflows · Completed` row。
- [ ] 任何 product-visible GUI change 都要从这个 **real PR server/model flow** 录制并保留 GIF，展示 launch、live update、member outcome inspection、control 和 narrow layout。Mocked 或 source-only GIF 不是 release evidence。
- [ ] 验证完成后，**只关闭 Ego Lite task space**。不要 wipe session、cookie、storage 或不相关 tab/space。

在 release evidence 中记录 tested tarball SHA-256、H build identity、platform、automated aggregate log、manual result 和 GIF location。即使 automated suite 为绿色，任何失败的 manual item 也会阻止 release。
