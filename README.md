# testkit

一个隔离的 DeepSeek Harness 插件实机测试工具：在独立 `DSH_HOME`、独立 profile 里跑真实的 headless 会话，读完整事件流并断言。

它不模拟、不 mock，跑的是真的 `dsh` agent；但和任何正在运行的 Harness 完全隔离。

## 为什么隔离

| 维度 | 测试环境 | 正常使用的 Harness |
|---|---|---|
| 进程 | 独立 `dsh` headless | 你正在用的 |
| `DSH_HOME` | `testkit/home` | `~/.dsh` |
| profile | `headless` | `desktop` / `web` |
| 端口 | 不开端口 | 各自端口 |
| 生命周期 | 跑完即退 | 持续运行 |

测试出问题，最多弄坏 `testkit/home`，不会影响日常使用的会话。

## 前置条件

- Windows（初始化与安装脚本是 PowerShell）。
- Node.js 22+（运行器只用 Node 内置模块）。
- 本机已安装 DeepSeek Harness，并已登录。
- 待测插件已构建出 `lib/`。

## 快速开始

```bash
# 1. 初始化隔离环境（一次）
powershell -NoProfile -ExecutionPolicy Bypass -File testkit/init.ps1

# 2. 把插件装进隔离 profile
powershell -NoProfile -ExecutionPolicy Bypass -File testkit/install-plugin.ps1 -Name hello

# 3. 跑场景
node testkit/runner/run.mjs --scenario hello
```

看到 `6/6 通过` 即成功。

## 它怎么工作

1. **隔离 home**：`DSH_HOME` 指到 `testkit/home`，`dsh` 的 profile、session、凭据都在这里，不写 `~/.dsh`。
2. **复用登录态**：`patches/account.yml` 打开 headless 默认关闭的凭据存储，并把模型路由从 API-key 的 `deepseek-official` 切到账号路由 `deepseek-account`。
3. **插件复制安装**：把插件包复制进 `profiles/headless/node_modules`，再用 patch 插入插件行。
4. **Node 运行器**：用文件描述符做 stdio（不是管道），绕开沙箱的管道限制；也避开 PowerShell 5.1 的执行策略与编码问题。

## 命令参考

### `init.ps1`

初始化 `testkit/home`：建目录、复制登录态、生成 `profiles/headless`。

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File testkit/init.ps1
```

### `install-plugin.ps1`

把插件装进隔离 profile：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File testkit/install-plugin.ps1 -Name <plugin>
```

默认从 `plugins/packages/<plugin>` 取；插件在别处时，用 `-Source` 指向它的父目录：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File testkit/install-plugin.ps1 -Name hello-plugin -Source example
```

脚本从插件 `package.json` 读真实包名，把整个目录（含 `node_modules`）复制进隔离 profile，再写插入行。

### `run.mjs`

```bash
node testkit/runner/run.mjs --scenario <scenario>
# 或
node testkit/runner/run.mjs --prompt "只回复两个字：收到"
```

| 参数 | 必填 | 作用 |
|---|---|---|
| `--scenario <name>` | 二选一 | 读 `scenarios/<name>.json` |
| `--prompt "..."` | 二选一 | 直接给 prompt |
| `--name <name>` | 否 | 运行目录名，默认取场景名 |
| `--quiet` | 否 | 不打印实时过程，只写 `live.log` |

## 场景格式

`scenarios/<name>.json`：

```json
{
  "name": "hello",
  "prompt": "请调用 whale_hello 工具，并原样告诉我它返回的内容。",
  "expect": {
    "finalTextContains": "hello from dsh-whale-hello",
    "tools": ["whale_hello"],
    "noError": true
  }
}
```

| 字段 | 必填 | 作用 |
|---|---|---|
| `name` | 是 | 场景名，也是运行目录前缀 |
| `prompt` | 是 | 发给 headless 的任务文本 |
| `expect.finalTextContains` | 否 | final 文本必须包含的字符串 |
| `expect.tools` | 否 | 本次必须被调用的工具名列表 |
| `expect.noError` | 否 | 是否要求没有 turn 错误 |

## 产物

每次运行输出到 `testkit/runs/<name>-<时间>/`：

| 文件 | 内容 |
|---|---|
| `events.ndjson` | headless 的完整事件流，每行一个 JSON |
| `live.log` | 和终端一致的实时过程 |
| `stderr.log` | dsh 的诊断输出 |
| `prompt.txt` | 本次的 prompt |

## 排错

| 现象 | 处理 |
|---|---|
| `隔离 home 不存在` | 先跑 `init.ps1` |
| `找不到场景` | 检查 `scenarios/<name>.json` |
| `MISSING_CREDENTIAL` | 检查 `patches/account.yml` 和 `home/.credentials.yaml` |
| `events.ndjson 没有生成` | 检查 `DSH_EXE` / `DSH_CLI`，看 `stderr.log` |
| 插件没被调用 | 检查 `install-plugin.ps1`、`cordis.patch.yml` 和 `node_modules` |

## 环境变量

运行器默认指向本机的 DeepSeek Harness 安装。换机器或自定义安装路径时：

| 变量 | 作用 |
|---|---|
| `DSH_EXE` | `DeepSeek Harness.exe` 的路径 |
| `DSH_CLI` | `dsh-desktop-host/lib/cli.js` 的路径 |

## 示例

`example/` 里有两个例子：

- `hello-plugin/`：普通插件，带自己的 npm 依赖。
- `monorepo/`：workspace 结构，插件依赖共享包 `core`。

```bash
# 普通插件
cd testkit/example/hello-plugin && npm install
cd -   # 回仓库根
powershell -NoProfile -ExecutionPolicy Bypass -File testkit/install-plugin.ps1 -Name hello-plugin -Source example
node testkit/runner/run.mjs --scenario example/scenarios/hello.json

# monorepo 结构
powershell -NoProfile -ExecutionPolicy Bypass -File testkit/install-plugin.ps1 -Name mono-plugin -Source example/monorepo
node testkit/runner/run.mjs --scenario example/scenarios/mono.json
```

细节见 [`example/README.md`](example/README.md)。

## 依赖

- 测试工具本身**零运行时依赖**，只用 Node 内置模块。
- 待测插件的依赖由 DSH 的 profile 安装机制负责，testkit 只负责把包放进隔离 profile。

## 安全

- `testkit/home/` 含登录态副本，已 gitignore，**不要提交、不要外传**。
- 跑测试会消耗当前账号的模型额度。
- 只测 agent 与工具行为，不做端口/浏览器测试。
