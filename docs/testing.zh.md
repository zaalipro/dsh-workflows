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

`tests/keyless-snapshot.spec.ts` 是 source-resolved fixture：它把官方 `tool-workflow/*` event 送进 `ConversationNodeAssembler`，证明 append/prepend/full-replay 一致，把 Interrupted Chat node 映射为 cancelled，并检查 completion-notice footer。它不启动官方 assembled snapshot harness，也不比较 reviewed Session/stdout JSONL；`examples/workflows-keyless/` 输入仍是后续 assembled gate。Dashboard snapshot 固定 accessible empty、live、terminal、interrupted、disclosure 和 member-outcome semantic，而不是 CSS hash。

### Package policy 与 exact packed consumer

```sh
pnpm exec vitest run tests/verify-package.spec.ts --reporter=dot && printf 'RD3 package policy PASS\n'
pnpm exec vitest run tests/packed-consumer.spec.ts --reporter=dot && printf 'RD8 packed consumer PASS\n'
```

Standalone packed-consumer test 只执行一次 `pnpm pack --json`，记录 SHA-256，并把完全相同的绝对 tarball 交给 `scripts/verify-package.mjs --tarball`。发布时由 `scripts/check-release.mjs` 独占 pack ownership，并把同一 artifact 交给 `scripts/packed-consumer.mjs`；generic unit command 排除会自行 pack 的 spec。缺少 skill、client bundle、evaluator 或 required peer asset 会在任何 consumer Session 开始前失败。Runner 以 scripts disabled 安装该 artifact，再安装 pinned consumer-only TypeScript/Node type 以及精确的预构建官方 CLI，import 所有 JavaScript 与 strict NodeNext export，并通过 lazy-CJS seam 加载 `lib/client.js`。所有声明的 Host、Client、Cordis 与 React peer 仍保留精确 compatibility declaration，但都标记为 optional：隔离的 `autoInstallPeers: true` probe 不得 materialize 其中任何一个，而 standalone import/type probe 会显式提供 peer。真实 Web 与 headless profile cycle 必须保留官方 `autoInstallPeers: false`，不得包含 profile-local peer package，所有 peer 都必须通过 healed official fallback 解析，并且 agent-loop 与 agent-presets 解析到的 `dsh-scope` realpath 必须完全相同。随后每个 profile 执行两次 bounded activation/teardown sentinel boot（第二次证明 lease 已释放），再 remove 并验证 manifest restoration。Source-tree runtime fallback、用 `--help` 充当 activation evidence、split Host graph，或发布期间第二次 pack 都是失败。

### 自动化 Chromium

```sh
pnpm exec vitest run tests/browser-smoke.spec.ts --reporter=dot && printf 'RD10 browser automation PASS\n'
```

`tests/browser-smoke.spec.ts` 当前只覆盖 `scripts/browser-smoke.mjs` helper boundary：absolute argument、loopback readiness JSON、stdin teardown，以及与 caller workspace 隔离。它并不用 Chromium 驱动 slash discovery、disclosure 或 1,199/767/320 px layout。该 product journey 属于下面的最终 Ego Lite checklist，而不是 helper 已经覆盖的替代。

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

### 精确 official Host checkout

Packed consumer 与 CI checkout 官方 DeepSeek Harness `0.1.2-rc.1` commit `a66e4702047846cdaa10c66c9d3df3951f5ea70d`。Package build 与 test 针对 `0.1.2-rc.1` development dependency 编译；不使用 Harness source patch 或 fork checkout。Package-owned evaluator build、strict NodeNext consumer、add/boot/remove profile cycle 与 removal 后的 stock boot 都是 blocking release evidence。

### 最终自动化 aggregate

```sh
pnpm run check:release
```

成功时准确以 `release checks passed` 结束。Orchestrator 按顺序运行 clean/frozen-install verification、build、typecheck、lint、owned-source aggregate coverage、snapshot、documentation、package policy、一次 immutable pack 与 packed consumer（`official-host-probe` 加真实 Web/headless add/boot/remove）、browser helper boundary、三个 stress suite 和 opt-in provider file。它不会 publish、启动 Ego Lite 或录制 GIF。Packed profile cycle 针对官方 `0.1.2-rc.1` 是 blocking gate；Chromium product journey 仍是最终 Ego Lite acceptance。

## Coverage policy

`pnpm run test:coverage` 对 owned package integration source 强制执行真实的 aggregate floor：**80% statement、80% branch、80% function 与 80% line**。它显式只 instrument `src/**/*.{ts,tsx}` 并排除 type-only declaration，因此未被 import 的 owned source 仍计入，而 generated `lib/` 与 `scripts/` 下的 release helper 不会意外进入 denominator。不再声明逐文件 100%；8 月 23 日 baseline 为 85.35% statement/line、80.69% branch 与 84.98% function。该命令排除 packed-consumer、browser-smoke、snapshot、stress 和 real-provider lane。已保存的 `coverage-all` report 并不是 generated `lib/` 加 dependency 的 100%（最近一次约为 57%）；它不能替代 owned-source aggregate gate。Test 覆盖 deterministic clock 与 barrier、每个 error/cancellation branch、effect disposal、HMR registration、authorization 和 external world state，而不依赖 self-reported success。

唯一不 instrument 的 artifact 是 generated 或 browser-delivery product，而不是 handwritten Host behavior 的例外：

| Exclusion | 为何不作为 owned runtime source instrument | 必需证据 |
|---|---|---|
| `vendor/workflow-engine/*.ts` 与 emitted `lib/compat-engine/*` | 带 attribution 的 MIT compatibility evaluator，使用独立 process/worker protocol gate | `tests/compat-engine.spec.ts`、supervisor replay/gate/budget/scratch suite、packed artifact verification 与 live profile smoke |
| `lib/typert.host.*` 与 `lib/typert.remote-client.*` | 从 decorated Host source 生成 | `tests/build-artifacts.spec.ts`、Remote API test、packed import 与 browser mount smoke |
| `lib/client.js`、emitted Client declaration/map 与 Lightning CSS output | Generated bundle product | Client component/controller spec、dashboard semantic snapshot、packed serving 与 `tests/browser-smoke.spec.ts` |
| `src/client/css-modules.d.ts` | 无 executable statement 的 type-only generated-facing declaration | Client TSC 加 build suite source assertion |
| CSS module visual branch | Style 不进入 JavaScript statement coverage | source token assertion、jsdom semantic snapshot，以及 GUI behavior 改变时最终 Ego Lite real-flow GIF。CI 中的 Automated Chromium 只门禁 `scripts/browser-smoke.mjs`；layout、light/dark 与 reduced-motion 仍是人工 Ego Lite。 |

Handwritten Client TypeScript 仍由其 Client test project 覆盖；generated output 不建立并行 coverage denominator。增加其他 exclusion 必须提供相应 real-browser evidence 和显式 testing-policy change。

## CI platform matrix

Blocking Ubuntu 24.04 job 运行 Node `22.19.0`、`24` 和 `26`；每个 job 使用 frozen lockfile，并覆盖 build、typecheck、lint、docs、package policy 以及分配的 unit/coverage/snapshot gate。Node 24 还拥有 macOS 14、Windows Server 2022、Chromium helper、race-stress 和 release-pack/packed-consumer job。Packed lane checkout 官方 `0.1.2-rc.1` commit `a66e4702047846cdaa10c66c9d3df3951f5ea70d`；不应用 Harness patch，只 pack 一次并保留一个 digest 和 artifact path，而且要求 Web 与 headless 的 live add/boot/remove。

Windows 运行每个支持的 definition、manifest、scratch、retention、recovery 与 subprocess case。它明确断言 junction/hard-link behavior，以及可工作的 native advisory locking 或已记录的 `WORKFLOW_STORAGE_UNSUPPORTED` result；它绝不静默 skip workflow、把 job 标记为 `continue-on-error`，或在没有断言准确 branch 时把 platform limitation 当作成功。

CI 只能在失败后上传 reviewed snapshot、browser、stress 和 pack diagnostic。它绝不上传 DSH home、credential、secret-lane model transcript 或 unrestricted scratch store。Action 固定到完整 commit SHA，permission 默认 read-only，job 有 timeout，而且只有 real-provider file 可因 key 缺失而 skip。

## Real-provider secret 与 cleanup policy

CI 只在可用时把 `DEEPSEEK_API_KEY` 传给隔离的 provider job。Test 不打印 key 或 base URL，也不把它们复制到 child prompt、session log、screenshot、archive 或 failure diagnostic。Provider error 可以命名 display handle 和 provider failure，绝不能包含 internal run UUID 或 credential material。

所有 live resource 都创建在 isolated workspace 与 DSH home 内。`finally` 会 stop 或 settle run、dispose child catalog entry、worker handle、Agent 和 Host、释放 permanent-anchor lease，并且即使 provider failure 或 timeout 也会移除 temporary directory。

## Final manual Web acceptance

这是 release checklist，不是 coding task、CI step 或 automated Chromium 的替代。只有全部自动化 gate 通过后，才使用安装了完全相同 tested tarball 的真实官方 `0.1.2-rc.1` Web profile 和 real server/model flow 执行。

- [ ] 启动 tarball-installed real server，确认 package activation 没有 source checkout fallback。
- [ ] 使用 **Ego Lite** 完成 smoke journey。全程复用它的 task space；绝不 wipe 或 reset 任何 user session、cookie、browser storage 或 daily-browser state。
- [ ] 确认 `/create-workflow`、`/workflow`、`/workflows` 和 saved alias 出现；启动两个 run，观察 immediate acknowledgement、display-name numbering、live phase/member/progress update，以及仍可用的 composer。
- [ ] 打开并关闭 run disclosure 和 `Inspect · N members`；检查真实 text/Markdown 与 JSON outcome、log、result 和 scratch artifact。验证 user-visible 或 accessible text 中没有 internal UUID。
- [ ] 运行 resumable gate、Pause、Resume、Stop 和符合条件的 Save；确认 stale-revision 与 budget-limited error 保持可见且 actionable。
- [ ] 检查 focus restoration、keyboard control、screen-reader label、light/dark/reduced-motion behavior 和没有水平 overflow 的 narrow mobile drill-down。
- [ ] 确认每个符合条件的 run 只有一个 completion notice，而且仅打开 dashboard 不产生重复 `workflows · Completed` row。
- [ ] 任何 product-visible GUI change 都要从这个 **real PR server/model flow** 录制并保留 GIF，展示 launch、live update、member outcome inspection、control 和 narrow layout。Mocked 或 source-only GIF 不是 release evidence。
- [ ] 验证完成后，**只关闭 Ego Lite task space**。不要 wipe session、cookie、storage 或不相关 tab/space。

在 release evidence 中记录 tested tarball SHA-256、official Host build identity、platform、automated aggregate log、manual result 和 GIF location。即使 automated suite 为绿色，任何失败的 manual item 也会阻止 release。
