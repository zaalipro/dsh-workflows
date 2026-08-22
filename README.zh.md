# @zaalipro/dsh-workflows

[English](README.md) | 中文

`@zaalipro/dsh-workflows@0.1.0-rc.1` 是一个可安装的 DeepSeek Harness bundle，提供已保存的 JavaScript workflow、受监督的后台运行、保留记录检查、斜杠命令和 Web 仪表盘。它复用 Harness 官方 workflow engine；它不包含任何 Grok CLI 代码、账户、配额、二进制文件、源码、协议或运行时依赖，也不包含 Rhai 解析器或求值器。

## 兼容性

兼容性下限是符号化的 DeepSeek Harness 官方版本 **H**：即第一个包含本包所用全部外部 workflow 前置能力的未来官方版本。官方提交 `141eb6f` 对应的原版 `0.1.0-rc.8` 只是补丁开发基线，**与本包不兼容**。不要根据某个更晚的标签推断兼容性；本包会在创建存储或接纳 Session 前验证 H 声明的能力。

本包要求 Node `^22.19.0 || >=24.0.0`，使用 `pnpm@11.7.0`，并按 [MIT license](LICENSE) 发布。原生锁依赖的归属信息见 [NOTICE.md](NOTICE.md)。

## 安装

与其他 profile 插件相同的一条命令。它增加一个依赖和一个名为 `@zaalipro/dsh-workflows` 的 bundle 层。没有额外 patch 文件，没有 `allowBuilds` 条目，也没有安装时构建。

```sh
dsh plugin --profile web add github:zaalipro/dsh-workflows
dsh plugin --profile headless add github:zaalipro/dsh-workflows
```

包发布到 npm 后，改用 registry 名：

```sh
dsh plugin --profile web add @zaalipro/dsh-workflows
dsh plugin --profile headless add @zaalipro/dsh-workflows
```

Web 会加载 Host 产品和浏览器 Client；headless 只加载 Host 产品，绝不求值浏览器代码。JavaScript evaluator 是官方 `@deepseek-ai/dsh-workflow-worker-thread` peer，不是打进本包的 worker。

## 移除

同时移除依赖和 bundle 条目，然后重启 profile：

```sh
dsh plugin --profile web remove @zaalipro/dsh-workflows
dsh plugin --profile headless remove @zaalipro/dsh-workflows
```

移除后，未修改的官方 profile 可以启动；该命令不会就地改写官方 profile 文件。

## 已保存定义与创作

定义和运行是不同资源。定义是扁平的 UTF-8 `<name>.workflow.json` 文件，按以下顺序选择第一个胜出的根：已配置的 bundled 根、最近 Git 项目根的 `.dsh/workflows` 目录（没有 Git 根时使用 Session cwd），最后是 `$DSH_HOME/workflows`。根不存在是合法情况；已观察到的匹配文件若不安全、格式错误、过大、为链接或存在其他无效情况，整个观察会失败，而不是从目录中静默消失。

每个文件只包含作为数据的 metadata 和一个纯 JavaScript body：

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

名称采用小写 kebab-case，以字母开头，不超过 64 个 UTF-16 code unit，与文件名 stem 一致，并避开命令保留名和 Windows 设备名。运行 `/create-workflow [detail]` 可调用已安装的创作 skill；它会收集意图与 fan-out，用 JSON data 保存 metadata 并编写 JavaScript，使用 canned agent result 验证一个有代表性的 args-selected path，而且只在 smoke check 成功后保存。完整 hook 与 quota 参考见已安装的[创作 skill](skills/create-workflow/SKILL.md)。

## 启动与操作

使用 `/workflow <name> [<json-args>]` 或生成的 `/<name> [<json-args>]` alias 启动已保存定义。普通命令会保留冲突的裸名称；workflow 会取得第一个可用的重复前缀 alias，例如 `/workflow-review-changes`，而 `/workflow review-changes` 始终可用。启动会立即返回 `Started workflow "<display-name>" in the background. Open /workflows to watch it.`；同一 metadata name 的后续运行使用 `review-changes-2` 等 display handle，不暴露内部 id。

在 Web 中，裸 `/workflow` 打开已保存定义选择器，严格的裸 `/workflows` 打开 dashboard（Host command 加上 Client overlay）。在 headless 中，裸 `/workflow` 输出 usage，`/workflows` 确认 dashboard command。仪表盘列出已保存 definition（可 Start），以及 live 与 retained run、phase、agent spend、member outcome、log、terminal result 和分块 scratch artifact。Pause、Resume、Stop 与符合条件的 Save action 都检查 revision；键盘操作和窄屏 drill-down 同样可用。

符合条件的 terminal run 最多尝试一次 owner-visible completion notice。它优先使用有界的 `scratch/report.md`，否则使用有界 result preview，并以 `Open /workflows to inspect the run.` 结尾。Notice delivery 是 at most once：进程故障可能导致 notice 缺失，但不会重试已 claimed、delivered 或 abandoned 的 notice。

## Replay、恢复与安全

Pause 和 Resume **仅限同一进程（same-process only）**。attempt result settle 且 disposal 排空已接纳的 child 与 scratch work 后，官方 engine 的 quiescent checkpoint 是唯一 replay authority。匹配且已提交的 journal call 会 replay，不再次消耗 agent，也不重复其已提交 effect；observer event 不是 authority。若外部 effect 的结果尚未提交，它可能再次执行，因此 effectful prompt 与 verification step 必须保持幂等。

`await_user()` 会继续同一个已确认 attempt 并提交该 gate；`pause()` 不提交，在 replay 后条件仍成立时会重新触发。`budget-limited` run 不能通过人工 control 恢复：model tool 必须使用内部 resume token，并提供比旧 total 更大且不超过 1,024 的绝对 `agent_budget`。

进程退出会把每个 retained active row 转换为不可恢复的 **Interrupted**，取消界面上仍在运行的 member，并且只恢复 inspection data。系统不会跨进程重建 Agent、args、script authority、journal、checkpoint、gate、child reference 或 effect claim；Interrupted run 不能 Resume 或 Save。

version-2 store 位于 `$DSH_HOME/workflow-runs`。一个永久 `.workflow-storage.lock` anchor 在 Host 生命周期内持有 native advisory lease；第二个协作进程会收到 `workflow storage root is already owned by another live process`。descriptor-rooted identity、owner、mode、type 和 link 检查都会 fail closed。该 lease 只协调同一用户下相互协作的 Host；它不能防御以同一 OS 用户运行、忽略 lease 或替换 anchor 的恶意进程。

Workflow script 与现有 model shell access 具有相同的 trust premise。worker 和 `node:vm` 用于塑造可用 API 并隔离 host event loop，但不是 hostile-code security sandbox。

## 限制

- Workflow body 是支持 top-level `await` 的纯 JavaScript；不存在 Rhai language path。
- Workflow script 不提供嵌套 `workflow()` hook。
- 不提供 cross-process execution resume 或 exactly-once external effect。
- 本包不会以任何形式联系或复用 Grok CLI。
- Validate-only 会编译完整 script，但只执行一个使用 canned output 的 args-selected path；它不覆盖所有 branch、live tool 或所有可能的 agent response。

## 文档

- [用户指南](docs/user-guide.zh.md) — 创建、验证、启动、检查、控制 workflow 并排查故障。
- [架构](docs/architecture.zh.md) — Host/Client composition、lifecycle authority、storage、Remote paging 和 package build。
- [测试与发布验收](docs/testing.zh.md) — 自动化证据与最终人工 Web checklist。
- [已安装的创作 skill](skills/create-workflow/SKILL.md) — JavaScript global、schema、budget、scratch 和安全创作模式。
- [License](LICENSE) 与[原生依赖 notice](NOTICE.md)。
- 官方 Harness 默认 `master` 分支上的 workflow subsystem 文档描述的是 stock RC8（立即 start、父 turn `await result`）。那是不兼容基线的 API 现实，不是本包消费的 H `deferStart` / `validate` / `checkpoint` vocabulary。不要把 `blob/main/...` URL 当成 H 文档。
