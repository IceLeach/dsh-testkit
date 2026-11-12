# 示例：一个独立、带依赖的插件怎么测

这个例子演示一个简单插件怎么用 testkit 测试。插件是一个普通 npm 包，带一个自己的 `dependencies`。

## 目录

```
example/
├── hello-plugin/          # 普通插件，带一个 npm 依赖
│   ├── package.json       # name: dsh-example-hello，依赖 ms
│   ├── src/index.js       # 注册 hello 工具
│   ├── cordis.patch.yml
│   ├── locale/
│   └── icon.svg
├── monorepo/              # monorepo 结构：插件 + 共享包
│   ├── package.json
│   └── packages/
│       ├── core/          # 共享包 dsh-example-core
│       └── mono-plugin/   # 插件 dsh-example-mono，依赖 core
├── scenarios/
│   ├── hello.json         # 普通插件的场景
│   └── mono.json          # monorepo 插件的场景
└── README.md
```

## 跑一遍

### 1. 安装插件自己的依赖

```bash
cd testkit/example/hello-plugin
npm install
```

这一步会生成 `node_modules/`（`ms` 包）。示例插件用的是普通 npm 依赖，不是 workspace 依赖。

### 2. 装进隔离 profile

回到仓库根，用 `-Source` 指向 example 目录：

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File testkit/install-plugin.ps1 -Name hello-plugin -Source example
```

`install-plugin.ps1` 会：

1. 从 `example/hello-plugin` 读 `package.json` 的 `name`（`dsh-example-hello`）
2. 把整个目录（含 `node_modules`）复制到 `testkit/home/profiles/headless/node_modules/dsh-example-hello`
3. 在 `cordis.patch.yml` 里插入这个包

### 3. 跑场景

```bash
node testkit/runner/run.mjs --scenario example/scenarios/hello.json
```

预期输出里能看到：

```
[..] → hello {"delay":2000}
[..] ← completed hello from example plugin (2s)
[..] ■ turn_end completed
...
N/N 通过
```

### 4. 看过程

运行目录在 `testkit/runs/example-hello-<时间>/`：

- `events.ndjson`：完整事件流
- `live.log`：实时过程
- `stderr.log`：诊断

## monorepo 结构的例子

`monorepo/` 是一个 workspace 结构：`packages/core` 是共享包，`packages/mono-plugin` 是依赖它的插件。

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File testkit/install-plugin.ps1 -Name mono-plugin -Source example/monorepo
node testkit/runner/run.mjs --scenario example/scenarios/mono.json
```

安装脚本会把 `core` 和 `mono-plugin` 都复制进隔离 profile，但只把 `mono-plugin` 插进 patch——共享包没有 `dsh.bundle.patch`，不是插件，只提供函数。

预期输出里能看到 `mono_hello` 被调用，返回 `hello from example monorepo, world`。

## 这个例子想说明什么

1. **一个插件目录就能测**：只要有一个带 `package.json`、`cordis.patch.yml`、入口文件的目录，就能装进隔离 profile。
2. **插件可以有自己的依赖**：先 `npm install`，再让 `install-plugin.ps1` 把整个目录（含 `node_modules`）复制过去。
3. **测试只看行为**：断言只关心「工具被调用了吗」「返回对不对」「最终文本含不含预期」。

## 换成你自己的插件

1. 把 `hello-plugin` 换成你的插件目录，保证它有 `package.json`（含 `name`）和 `cordis.patch.yml`。
2. 有依赖就先 `npm install`。
3. `install-plugin.ps1 -Name <你的目录名> -Source <相对 testkit 的路径>`。
4. 写一个 `scenarios/<name>.json`，断言用 `finalTextContains` 和 `tools`。
5. `node testkit/runner/run.mjs --scenario <path>`。
