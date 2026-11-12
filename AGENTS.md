# testkit 的 AI 使用说明

> 给 AI agent 的操作手册。人类读者看 [README.md](README.md)。

## 你面对的是什么

testkit 在隔离环境里跑 DeepSeek Harness 的 headless 会话，测插件的运行时行为。它不会影响任何正在运行的 Harness：独立进程、独立 `DSH_HOME`、不开端口。

## 关键路径

| 路径 | 作用 |
|---|---|
| `testkit/home/` | 隔离 DSH_HOME（含登录态副本，**不要改、不要提交**） |
| `testkit/runner/run.mjs` | 运行器：跑场景 + 断言 |
| `testkit/scenarios/<name>.json` | 场景定义 |
| `testkit/runs/<name>-<时间>/` | 每次运行的产物 |
| `testkit/example/` | 示例插件（带自己的依赖） |

## 示例

`testkit/example/` 有两个例子：

- `hello-plugin/`：普通插件，带一个 npm 依赖。
- `monorepo/`：workspace 结构，插件依赖共享包。

普通插件：

1. `cd testkit/example/hello-plugin && npm install`
2. `install-plugin.ps1 -Name hello-plugin -Source example`
3. `node testkit/runner/run.mjs --scenario example/scenarios/hello.json`

monorepo 结构：

1. `install-plugin.ps1 -Name mono-plugin -Source example/monorepo`
2. `node testkit/runner/run.mjs --scenario example/scenarios/mono.json`

场景参数可以带路径（`example/scenarios/hello.json`），也可以只写场景名（去 `scenarios/` 找）。

## 操作顺序

1. **检查环境**：`testkit/home/profiles/headless` 是否存在；不存在就跑
   `powershell -NoProfile -ExecutionPolicy Bypass -File testkit/init.ps1`。
2. **检查插件**：看 `testkit/home/profiles/headless/installed-plugins.txt` 是否包含目标插件；没有就跑
   `powershell -NoProfile -ExecutionPolicy Bypass -File testkit/install-plugin.ps1 -Name <plugin>`。
3. **跑场景**：`node testkit/runner/run.mjs --scenario <scenario>`。
4. **判结果**：输出最后一行 `N/N 通过`，退出码 0；或读 `runs/.../events.ndjson`，找 `type=final` 且 `reason.kind=completed`。
5. **失败排查**：先看 `runs/.../stderr.log`，再看 `events.ndjson` 里的 `error` 和 `turn_end.reason.error.message`。

## 判据

| 情况 | 判断 |
|---|---|
| 成功 | 退出码 0，且 `final.reason.kind === "completed"` |
| 失败 | 退出码 1，或 `final.reason.kind === "error"` |
| 部分失败 | 输出里有 `FAIL` 行，逐条看 |

## 事件类型

`events.ndjson` 每行一个 JSON：

| `type` | 关键字段 | 含义 |
|---|---|---|
| `session` | `sessionId`、`cwd` | 会话开始 |
| `status` | `phase`、`turn`、`step`、`reason` | 阶段变化；`turn_end.reason.kind` 是结果 |
| `tool_call` | `tool`、`input` | 模型调用了工具 |
| `tool_result` | `status`、`result` | 工具返回 |
| `text` | `text` | 模型回复 |
| `thinking` | `text` | 思考片段 |
| `error` | `message` | 运行器错误 |
| `final` | `reason`、`text` | 最终结果，断言主要看它 |

## 不要做

- 不要改 `testkit/home/.credentials.yaml`。
- 不要提交 `testkit/home/` 或 `testkit/runs/`。
- 不要用管道把 dsh 的输出接给别的程序——沙箱会拒绝（`EPERM`）；运行器已经用文件描述符规避。
- 不要用 `npm publish` 发 testkit——它不是 npm 包。

## 常见错误

| 错误 | 处理 |
|---|---|
| `隔离 home 不存在，先跑 init.ps1` | 执行 `init.ps1` |
| `找不到场景` | 检查 `testkit/scenarios/<name>.json` |
| `MISSING_CREDENTIAL` | 检查 `patches/account.yml` 是否启用 credentials，以及 `home/.credentials.yaml` |
| `events.ndjson 没有生成` | 检查 `DSH_EXE` / `DSH_CLI`，看 `stderr.log` |
| 插件没被调用 | 检查 `install-plugin.ps1`、`home/profiles/headless/cordis.patch.yml` 和 `node_modules` |
