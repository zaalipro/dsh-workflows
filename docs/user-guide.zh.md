# 用户指南

[English](user-guide.md) | 中文

本教程带领 Web 或 headless 用户完成安装、一个保存的 JavaScript definition、一次 validation smoke、一次 background run、详细检查、control 与 recovery。**Saved definition** 是磁盘上的 authoring input；**live 或 retained run** 是 immutable admitted execution record。`/workflows` 列出已保存 definition（可 Start）以及 live 或 retained run。

## 1. 安装到兼容 Harness

使用官方 DeepSeek Harness `0.1.1-rc.2` 与 plugin `0.1.0-rc.3`。确保 service user 的 `PATH` 中有 `pnpm`；`0.1.0-rc.8` 与尚未验证的更高 Harness release 均不受支持。

安装 pinned release tag，或 durable absolute path 下的 exact tested tarball：

```sh
dsh plugin --profile web add github:zaalipro/dsh-workflows#v0.1.0-rc.3
dsh plugin --profile headless add /absolute/path/zaalipro-dsh-workflows-0.1.0-rc.3.tgz
```

发布到 npm 后，`dsh plugin --profile <profile> add @zaalipro/dsh-workflows@0.1.0-rc.3` 与之等价。

重启 profile。Web 除 Host behavior 外还获得 dashboard 与 durable Chat renderer；headless 获得 registry、supervisor、command、question、recorder 与 model tool，但不加载 browser code。移除见 [package README](../README.zh.md#安装)。

## 2. 创建 project definition

在 cwd 属于目标 project 的 Session 中输入：

```text
/create-workflow review workspace changes, verify every finding, and write a report
```

命令准确回复：

```text
Opened the workflow authoring skill.
```

该命令会 steer 同一条以 `/create-workflow` 开头的 user message。Packaged skill 是 user-invocable，因此兼容 Host 会确定性地把受信 instructions 注入下一次 model step，而不是依赖 model 从 catalog 中自行选择这个 skill。

Packaged skill 会询问 intent、input、fan-out、evidence、failure tolerance、final artifact、maximum agent、lowercase kebab name 以及 project 或 user scope。选择 **project** 会把 `review-changes.workflow.json` 保存到最近 Git root 的 `.dsh/workflows` directory。没有 Git root 时，Session cwd 就是 project root。选择 **user** 会保存到 `$DSH_HOME/workflows`。

Definition 使用 first-wins precedence：configured bundled root、project root、user root。更高 precedence 的同名 definition 可以让新保存的低 precedence file 继续 shadowed。File 必须扁平、regular、UTF-8、不超过默认配置的 1 MiB，并使用有效 lowercase kebab stem。

保存的 envelope 准确包含 `meta` 和 `script`；metadata 保持 JSON data，body 保持 plain JavaScript：

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

`phase(title)` 与 `agent(..., { phase })` 中的 phase title 必须准确匹配 metadata title。Metadata 只声明 presentation；它绝不作为 host code 求值。

## 3. 理解 validation smoke

Authoring skill 会用 representative args 请求 model-facing workflow tool 验证并保存拟议 inline source。`save_scope` 默认为 `project`；要保存到 `$DSH_HOME/workflows` 则选择 `user`。User-scope save 不要求 Session cwd。

```json
{
  "script": "<plain JavaScript workflow body>",
  "meta": {
    "name": "review-changes",
    "description": "Review workspace changes and verify every finding"
  },
  "args": { "targets": ["src", "tests"] },
  "validate_only": true,
  "save_scope": "project"
}
```

成功 result 的 status 是 `validated`，不会创建 child、run id、directory、display ordinal、dashboard row、completion notice 或 durable workflow event，并且会声明：

```text
Validated one args-selected path with canned agent results; other branches, live tools, and live schema responses were not covered.
```

Engine 先解析**完整** script，然后使用 canned schema-shaped agent output 与 in-memory scratch capability，只执行这些 args 选择的 path。Gate 会以 `would pause: <message>` 成功结束 smoke。应把它视为 syntax、hook-contract 和 one-path evidence，而不是所有 branch 或 real provider behavior 的证明。保存前修复任何 filename/line diagnostic 并重新 validation。

## 4. 启动 background run

Canonical command 接受一个保存名称和可选 JSON object：

```text
/workflow review-changes {"targets":["src","tests"]}
```

它不等待 agent 就返回：

```text
Started workflow "review-changes" in the background. Open /workflows to watch it.
```

没有普通 slash command 冲突时，保存的 definition 也拥有 named alias：

```text
/review-changes {"targets":["src","tests"]}
```

如果普通命令拥有 `/review-changes`，该命令保留它，workflow 获得第一个可用的 repeated-prefix alias，例如 `/workflow-review-changes`；canonical `/workflow review-changes` 始终有效。第一个 run 是 `review-changes`，之后是 `review-changes-2`、`review-changes-3` 等。这些 display name 是 human command 与 title 使用的唯一 handle。

裸 `/workflow` 在 Web 中打开 definition picker，在 headless 中返回以下 usage：

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

Argument 必须是一个 JSON object。Array 与 scalar 会在 launch 前失败；malformed trailing text 不会被修复或转发给 model。

## 5. 打开 run dashboard

在 Web 中提交严格的裸命令：

```text
/workflows
```

这个仅由浏览器处理的 slash action 会打开 label 为 `Workflows` 的 dialog；它既不执行 Host command，也不调用模型，并且不会创建 command Chat row。带 argument 或 attachment 的 `/workflows` 不会打开 overlay；它会在本地被拒绝，draft 与 attachment 均保持不变。Dashboard chrome 与 Chat label 跟随 host locale：本包注册 English 与 Chinese dictionary，English 为 fallback，关闭控件的可见文字与 accessible name 都是 `Close workflows`（中文 locale 下为 `关闭工作流`）。Inspector heading（`Pending`、`JSON outcome` 以及 criterion 11.4 的其余 heading）和 criterion 11.4/11.11 的精确 error string 保持英文。

Dashboard 先列出已保存 definition 并提供 Start，然后是 run navigator（display name、status、current phase、agent spent/total、running 与 settled member count、bounded terminal summary，以及 retained-run loaded/total disclosure）。Active run 按最早优先排序，history 按最新 settlement 排序。`Load more` 获取下一个 authorized bounded page；只有 terminal row 可按确定性 oldest-first retention evict，active row 与 display ordinal history 永不 evict。

宽度至少 1,200 px 时，navigator、execution detail 和 inspector 是三个独立 scroll pane。低于 1,200 px 时保留 navigation 与一个 detail pane。低于 768 px 时使用明确的 **Runs -> Execution -> Inspector** drill-down；同一流程在 320 px 下也不会产生 page horizontal overflow。

## 6. 检查 execution 与 member

选择一个 run，然后打开其 run disclosure 查看 declared/current phase、status、progress、control、log、terminal result 或 error、artifact 与 retention disclosure。打开 `Inspect · N members` 显示 member roster。Running 与 abnormal group 保持打开；completed clean phase 可以 collapse 且不丢失 detail。

Member lifecycle state 是 **queued/pending**、**running**、**completed**、**failed** 与 **cancelled**。普通 child failure 是 settled failed member，其 script-visible result 为 JSON `null`；infrastructure failure 则使 logical run 失败。选择 member 后加载一种明确 outcome presentation：

- `Pending`——member 尚无 settled outcome。
- `JSON outcome`——完整 retained JSON value，包括真正的 JSON `null`。
- `Text outcome`——完整 Markdown 或 plain text。
- `Value outcome`——除 `null` 外的 retained JSON primitive。
- `Truncated outcome`——deterministic preview 加 retained/total UTF-8 byte count。
- `No outcome produced`——member settle 时没有 output value。
- `Outcome evicted`——retention 明确移除了完整 detail，但保留该事实。

`Child transcript unavailable` 与 retained outcome 分离：direct one-shot child address 可能已消失，outcome 仍可检查。带 `Retry` 的 `Unable to load member outcome` 是 request failure；先前成功 page 与 detail 保持可见。Child navigation 在打开 transcript 前刷新 current direct-child catalog，并拒绝 stale 或 foreign address。

Log 按稳定 index order 加载。Result absence、JSON `null`、truncation、eviction 与 request failure 都呈现为不同事实。Scratch artifact 列出安全单 component name 与 size；打开后获取 bounded UTF-8 chunk，`Load more` 从已调整到完整 code-point boundary 的 byte cursor 继续。Changed、invalid UTF-8 或 unsafe artifact 会 inline failure，但不清除已加载 run detail。

## 7. 回应 gate

`await_user(kind, message)` 与 `pause(kind, message)` 都会 park run，并显示一个带 `Resume workflow` 的 `Workflow · <display-name>` question，但 replay semantic 不同：

- `await_user` acknowledgement 会继续同一 live engine attempt。Satisfied gate commit 后，之后的 journal replay 会跳过它。
- `pause` 是 uncommitted condition。Acknowledgement 会启动 replay，同一 condition 若仍成立就再次询问。

Dismiss、withdraw、abort 或回答 obsolete question 都会让 run 保持 parked。本包只 resume exact live Session/Agent/logical-run/execution/gate/generation tuple；late answer 不能 resume 新 attempt 或其他 run。

## 8. Pause、resume、stop 与 save

使用 dashboard button、受保护的 P/R/X/S shortcut，或 display-name command：

```text
/workflow pause review-changes
/workflow resume review-changes
/workflow stop review-changes-2
/workflow save review-changes
```

成功 command reply 是准确文本：

```text
Paused workflow "review-changes". Open /workflows to resume or stop it.
Resumed workflow "review-changes". Open /workflows to watch it.
Stopped workflow "review-changes-2".
Saved workflow "review-changes" to <path>.
```

Pause 停止新 work，取消并排空 current attempt，只在保留 quiescent checkpoint 后发布 `paused`。Resume 使用 immutable admitted script 与 args，而不是后来对 `script.js` 的编辑；匹配的 committed hook replay 不增加 spend。Stop 取消 admitted child 与 scratch operation，配对其 ending，丢弃 replay authority，并在 cleanup 后发布 terminal `cancelled`。

Save 只适用于非 built-in、unnumbered、非 Interrupted 且拥有 safe live editable projection 的 run。Built-in 或 numbered handle 要求用新的唯一 `meta.name` 保存 edited copy；低 precedence saved file 可能继续 shadowed。Save 默认指向 project scope，也可使用明确支持的 user scope。

每个 dashboard control 都携带当前 visible revision，禁用 duplicate submission，并 merge authoritative returned row。如果另一个 update 先胜出，不产生 control side effect，dashboard 显示：

```text
workflow run changed; refresh it before applying a control
```

其他 non-domain control failure 显示 `Unable to update workflow. Retry.` 和有 label 的 `Retry`；abort 与 stale-selection failure 保持安静。

## 9. 处理 budget、completion 与 process exit

`budget()` 返回 `{ total, spent, reserved: 0, remaining }`。Default total 是 128，admitted run 可使用 1 到 1,024 的 absolute cap。Spend 在 same-process attempt 间累计；journal replay 与 schema-correction retry spend 为零。Declarative `parallel()` panel 会对所有 unreplayed job 做 atomic preflight，而 arbitrary thunk 会接纳每个 concrete `agent()` call，因为其 future count 不可预知。

Cap 停止 run 时，dashboard 显示 **Budget limited**，提供 Stop 但没有 human Resume。只能通过 model tool resume，并使用以下明确标注为 internal 的 reference shape：

```json
{
  "resume_from_run_id": "<internal-run-id>",
  "agent_budget": 256
}
```

Absolute `agent_budget` 必须高于旧 total 且不超过 1,024。Human command、dashboard Resume 或 absent/equal/lower/excessive cap 会返回 `workflow "<display-name>" requires a higher agent_budget to resume`，不启动新 attempt。Internal run id 只属于该 model-tool exchange，绝不放入 screenshot、command text、title、notice 或 accessibility label。

符合条件的 terminal run 会尝试一次 bounded owner completion notice，优先使用 `scratch/report.md`，其次使用 inline result，并以 `Open /workflows to inspect the run.` 结尾。它是 at-most-once delivery：crash 可以遗漏 claimed notice，绝不能重复它。

Host process exit 后，startup recovery 把所有 retained active run 改为 **Interrupted**，把 running member 改为 cancelled，显示 `Process exited before workflow settlement.`，并且只提供 inspection。Journal、checkpoint、Agent、script/args authority、gate 或 child handle 都不跨进程；Interrupted run 不能 Resume 或 Save。检查是否已有 uncommitted external effect 发生后，再从 saved definition 启动新 run。

## 10. 编写 replay-safe JavaScript

Worker 提供 `args`、`agent`、thunk/declarative `parallel`、`pipeline`、`phase`、`log`、`complete`、`budget`、`pause`、`await_user`、`read_scratch_file` 和 `write_scratch_file`。`agent(prompt, opts)` 准确接受 `label`、`phase`、`schema`、`provider` 和 `model`。Stock worker 没有原生 `complete`，因此本包会注入该 hook。

Structured schema 支持 `type`、`properties`、`required`、`additionalProperties`、`items`、`minItems`、`maxItems`、`enum`、`const` 与 `oneOf`。`minItems` 和 `maxItems` 是包含端点的 array-length bound。每个 bound 都必须是非负 safe integer（负零、小数和非 number 均无效），只能出现在 `type: 'array'` 节点上，必须满足 `minItems <= maxItems`，并且不能与 `oneOf` 并列。Package 会在任何 child 启动前验证 authored schema，只从发送给 stock RC2 的副本中移除这两个 forward-compatible keyword，然后依据 authored bound 重新验证返回的 structured value。`fork_context` 等 unsupported option、unsupported schema、invalid call 与 infrastructure failure 都是 fatal；普通 child failure 或 schema-invalid child value 返回 `null`。

以下完整 body guard nullable output，使 verification fail-closed，确定性 sort/filter，显式限制 log preview，同步 phase title，并发布 report：

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
        maxItems: 20,
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

`complete(value)` 接受第一个 lossless JSON value，并使之后每个 hook ineffective，即使 script code catch 其 internal sentinel。`return value` 同样可以 settle run。Scratch name 是匹配 `^[A-Za-z0-9][A-Za-z0-9._-]*$` 的单 component；default 最多允许 4,096 次 operation、64 个 pending、64 个 file、每个 1 MiB、总计 8 MiB。每个 `phase`/`log` event 上限为 64 KiB UTF-8。

Replay-capable run 移除 `Date`、`Math.random`、`Atomics`、`SharedArrayBuffer`、`WeakRef` 与 `FinalizationRegistry`。Deterministic Math function 保留。每个 effectful agent prompt 都必须可安全重复，因为 result 未提交的 effect 可能再次运行。Script 不提供 `workflow()` hook：nested workflow 不受支持；应在一个 run 内通过 agent、`parallel` 与 `pipeline` 表达 orchestration。

## 11. Keyboard、mobile 与 accessibility

打开 `/workflows` 会把 focus 移入 conversation 上的 labelled modal card（不是 full-page takeover）。Card 周围的 chrome 会 dim 并 inert；点击该 chrome、Close 或 Escape 即可关闭。Tab 与 Shift+Tab 留在 card 内，逃逸 focus 会被收回，关闭时若 invoking composer 仍存在则恢复它。Status 除 color 外始终使用 text，progress 与 update 使用 semantic status/live region，member row 是带 visible `:focus-visible` treatment 的真实 control。

P/R/X/S 只有在 dialog 拥有 focus、没有 modifier 或 key repeat、target 不可编辑，并且 selected run 当前允许 action 时，才触发 Pause/Resume/Stop/Save。Hidden 或 unavailable action 永不触发。窄屏 control 两个维度都至少 44 px，长 label 与 result 会换行，reduced-motion preference 移除非必要 transition。

## 12. 故障排查

### Harness 不兼容

症状：activation 报告不受支持的 Host face 或 version。安装官方 `0.1.1-rc.2` 与 plugin `0.1.0-rc.3`；不要扩大 peer range，也不要假定更高 Harness version 已兼容。

### Storage 已被拥有

症状：`workflow storage root is already owned by another live process`。停止另一个协作 Harness process 后重试。绝不删除 `.workflow-storage.lock` 或按 age 接管；owner exit 时 kernel 会释放 advisory lease。`safe workflow storage is unavailable on <platform>` 表示必需 native lease 不受支持，不表示 unlocked fallback 安全。

### Registry disabled 或 definition 缺失

`workflow registry is disabled` 表示 listing inert，Save 被有意禁用。`no saved workflow named "<name>"` 表示当前 Session cwd 的 bundled/project/user view 中没有 winning definition。检查 flat filename、root、scope、watcher diagnostic 和 precedence；`/workflows` 无法回答 definition 问题，因为它列出 run。

### Definition 或 argument 格式错误

Definition 必须是有效 UTF-8 JSON，准确包含 `{ meta, script }`、已知 metadata/phase field、string script，而且 filename stem 等于 `meta.name`。Discovery 命名 offending path 并让整个 observation 失败。Command parse error 是准确文本：

```text
trailing args for "review-changes" must be one JSON object — {bad
trailing args for "review-changes" must be a JSON object (wrap arrays/scalars in a field)
```

修复 source；本包绝不猜测、求值 metadata 或静默省略 file。

### Run、control 或 transcript 不可用

`workflow "<display-name>" was not found in this Session` 有意不泄露 cross-Session data。`workflow "<display-name>" was interrupted by process exit and cannot resume` 要求新 launch。Stale control 使用上文 revision message。`Child transcript unavailable` 表示 current direct one-shot child catalog 不再授权 navigation；应检查 retained member outcome。Request-level error 保留 loaded detail，并提供 `Retry`。
