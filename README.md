# ZCode-Next++

<div align="center">
  <img src="public/logo/icons/1024x1024.png" alt="ZCode" width="128" height="128" />
</div>

<p align="center">
  <a href="https://applink.feishu.cn/client/chat/chatter/add_by_link?link_token=47ag983c-8fcb-4d6d-814b-5395193a712c&amp;qr_code=true">飞书社群</a> ·
  <a href="https://discord.gg/z9aBcQXZQ3">Discord</a>
</p>

<p align="center">
  简体中文 | <a href="README.en.md">English</a>
</p>

ZCode-Next++ 是一套 AI 编码工作台，提供**桌面应用、浏览器界面与终端 Agent** 三种入口，并在三端共享同一套 Agent 运行时、通信协议与 UI 能力。本仓库包含客户端、后端服务、共享 React UI、模型 Provider 体系，以及 Agent CLI 与运行时的完整源码。

## 核心特性

- **三端一体**：Electron 桌面应用、Web/浏览器、终端 `zcode`，共用同一 Agent 运行时，一套改动覆盖所有端。
- **统一通信抽象**：基于 `@zcode/rpc` 的 `IMessagePassingProtocol`，让同一套 RPC 同时跑在 Electron MessagePort、WebSocket 与 Node stdio 之上。
- **双链路协议**：桌面实时链路（desktop-continuous）与移动/Web 恢复链路（web-remote-replayable）语义分离，断线可重放、不丢失。
- **语言级编码规范**：主 Agent 在编写特定语言代码前会先读取对应语言的编码规范（`language-standards/*.md`，含静态/动态 SVG 图标制作、Git 提交信息格式等工程约定）。
- **分层架构约束**：contracts 只放类型与端口契约、core 承担 Agent 循环、adapters 收拢所有外部 I/O，支持跨 Windows / macOS / Linux。

## 快速开始

### 环境要求

安装 Git、Node.js **24.14.0** 与 pnpm **10.33.2**，版本以 [mise.toml](mise.toml) 为准。以下命令均在仓库根目录执行。

```bash
pnpm bootstrap
```

`pnpm bootstrap` 会安装 workspace 依赖、准备桌面本地运行资源，再执行 `build:bootstrap`。Agent CLI 与运行时源码位于 [apps/zcode-cli/](apps/zcode-cli/)，作为普通目录随仓库克隆，无需单独拉取或初始化 Git submodule。

其他初始化 / 构建入口：

| 命令                           | 用途                                                              |
| ------------------------------ | ----------------------------------------------------------------- |
| `pnpm install`                 | 安装依赖                                                          |
| `pnpm prepare:desktop-runtime` | 准备桌面运行资源，默认包含远程资源准备                            |
| `pnpm prepare:remote-assets`   | 单独准备远程运行资源                                              |
| `pnpm bootstrap:with-remote`   | 初始化依赖、本地与远程资源，并串行构建相关包；跳过桌面应用 bundle |
| `pnpm build`                   | 递归执行各 workspace 包的构建脚本，包括包内的资源准备步骤         |

默认 `bootstrap` 跳过远程资源准备，适合本地桌面开发；使用远程工作区或验证远程发行资源时，再运行对应准备命令。

## 开发与运行

### 桌面版

```bash
pnpm dev:desktop

# 使用测试环境
pnpm dev:desktop:test
```

`pnpm dev:desktop` 默认等同于 `pnpm dev:desktop:prod`，使用生产服务配置。启动脚本会准备本地运行资源、构建桌面 Agent，再启动 Electron 和源码监听。

需要独立开发数据目录时，可设置 `ZCODE_DATA_BASE_DIR`。例如在 macOS / Linux 中：

```bash
ZCODE_DATA_BASE_DIR="$HOME/.zcode-dev-home" pnpm dev:desktop:test
```

### 远程功能（SSH/WSL）

先执行 `pnpm bootstrap:with-remote` 准备远程资源（mock-cdn），再 `pnpm dev:desktop`；连接远程项目时资源选择"本地下载后上传"。开发态资源取自本地 `packages/desktop/mock-cdn` 和本地构建产物，经 SFTP 上传到远程。

### Web 开发

```bash
pnpm dev:web

# 指定后端工作区（macOS / Linux）
ZCODE_SERVER_WORKSPACE=/path/to/project pnpm dev:web
```

该命令同时启动 Web 开发服务器（默认 `http://localhost:5173`）和后端（默认 `http://localhost:3030`）。`/ws` 和一般 `/api` 请求代理到本地后端，`/api/v1/oauth/token` 单独代理到当前配置的产品服务。

Agent 源码修改后，执行 `pnpm --filter @zcode/cli... build` 并重启服务；验证完整发行包可参考下方"命令行版"章节。

### ZCode 命令行版

命令行发行包包含 TUI、Web 和 Agent，统一使用 `zcode` 启动：无参数进入 TUI；第一个参数为 `--web` 时启动 Web；其他参数交给现有 Agent CLI 处理。两种模式都在本机运行，无需 Electron。

```bash
# 默认进入终端交互界面
zcode

# 启动 Web 界面
zcode --web

# 指定项目和端口，不自动打开浏览器
zcode --web --workspace /path/to/project --port 3030 --no-open

# 查看 CLI 或 Web 参数
zcode --help
zcode --web --help
```

Web 模式默认以当前目录为工作区，监听 `127.0.0.1`，默认不启用访问令牌，自动选择空闲端口并打开浏览器；访问终端输出的地址，按 `Ctrl+C` 停止。局域网访问用 `--host 0.0.0.0`，监听非本机地址时默认生成访问令牌；可用 `--token` 指定令牌、`--no-token` 关闭认证。

直接启动通用 Web 服务的 HTTP 入口时，通过 `ZCODE_SERVER_AUTH_TOKEN` 配置 API/WebSocket 认证；通过程序接口创建服务时，使用 `authToken` 选项。

`pnpm build:zcode` 只生成发行包，不会替换 `PATH` 中已有的 `zcode`。若命令仍指向旧安装，macOS/ Linux 用 `command -v zcode`、Windows 用 `where.exe zcode` 检查。

### CLI 源码开发

```bash
pnpm --filter @zcode/cli dev --help
pnpm --filter @zcode/cli dev

# 构建 CLI 及其 workspace 依赖
pnpm --filter @zcode/cli... build
node apps/zcode-cli/packages/cli/dist/zcode.cjs --help
```

该入口直接运行 Agent CLI，不经发行包的 `--web` 分流；开发 Web 用 `pnpm dev:web`。

## 配置

根目录 [.env.example](.env.example) 提供服务地址与构建配置示例，可按需复制到 `.env`，本地覆盖放入 `.env.local`。Desktop 开发环境通过 `dev:desktop:test` / `dev:desktop:prod` 选择。

| 配置                                 | 用途                                             |
| ------------------------------------ | ------------------------------------------------ |
| `ZCODE_DATA_BASE_DIR`                | 应用数据基目录，数据写入其下的 `.zcode/`         |
| `ZCODE_SERVER_WORKSPACE`             | Web 后端的工作区路径                             |
| `ZCODE_BUILTIN_PROVIDER_CONFIG_FILE` | 本地 Provider 配置文件路径；未设置时使用内置配置 |
| `ZCODE_DIST_BASE_URL`                | 命令行安装脚本使用的下载根地址                   |

运行时变量可在启动命令的环境中显式设置；随客户端发布的默认配置见 [config/README.md](config/README.md)。

## 架构概览

数据大致沿 `三端 UI → @zcode/ui hooks → IServiceAccessor → 40+ RPC 服务 → @zcode/rpc 传输 → Agent 运行时` 流动：

- **桌面端**：每窗口一个独立 Host `utilityProcess`，Host 经 stdio 与 Agent 通信；Renderer 仅通过 MessagePort 的 RPC 通道访问服务。
- **服务端**：分 HTTP 入口与 stdio 入口（远程主机），stdio 用两阶段 hello/hello-ack 握手且 stdout 仅承载 RPC 帧。
- **Agent**：`apps/zcode-cli` 中 contracts（纯契约）→ core（Turn 状态机 + Agent 循环 + 权限）→ adapters（exec/fs/http/model/storage）→ bootstrap（App 门面 + 协议 Server），并使用 ZCode Protocol V4 提供严格类型与运行时双重校验。

## 打包

第三方声明生成、发行校验流程及声明在发行物中的位置见 [third-party/README.md](third-party/README.md)。

### 桌面版

```bash
pnpm bundle:desktop

# 指定目标平台与 CPU 架构
pnpm bundle:desktop -- --os win --arch x64

pnpm bundle:desktop -- --help
```

默认目标为 macOS arm64，默认输出目录为 `packages/desktop/dist/`。`--os` 支持 `mac`、`win`、`linux`，`--arch` 支持 `x64`、`arm64`；实际打包与签名需要目标平台对应的工具和配置。

安装：双击打开产物 DMG，将 ZCode 拖入"应用程序"。本地构建未签名，若被 macOS 拦截，执行：

```bash
sudo xattr -rd com.apple.quarantine /Applications/ZCode.app
```

### ZCode 命令行版

构建入口为 `pnpm build:zcode`，依次构建 CLI/TUI、后端和 Web，收集 TUI 的原生库、worker 与运行时依赖后组装发行包；运行发行包仍需 Node.js，版本以 `mise.toml` 为准。

打包前必须设置下载根地址 `ZCODE_DIST_BASE_URL`（可放在 `.env`、`.env.local` 或环境变量中），或通过 `--base-url` 传入。以下为占位示例，发布时替换为实际托管地址：

```bash
pnpm build:zcode --base-url https://downloads.example.com/zcode/

# 已配置 ZCODE_DIST_BASE_URL 时
pnpm build:zcode

# 仅重新组包，复用已有构建产物
pnpm build:zcode --skip-build

# 查看版本、输出目录等可选参数
pnpm build:zcode --help
```

默认版本取根目录 `package.json`，输出目录为 `dist/zcode/`：

- `releases/<version>/zcode-<version>.tar.gz`：运行包。
- `releases/<version>/sha256.txt`：校验摘要。
- `latest.json`、`install.sh`：版本索引和安装脚本。

完整目录可上传到配置的下载根地址。安装脚本从该地址下载运行包，默认安装到 `~/.zcode/runtime`，并在 `~/.local/bin` 创建 `zcode` 命令；安装目录可用 `ZCODE_DIST_HOME` 修改，命令目录可用 `ZCODE_DIST_BIN_DIR` 修改。

本地调试可解压直接运行，无需上传或安装：

```bash
zcode_version=$(node -p "require('./dist/zcode/latest.json').version")
mkdir -p dist/zcode/debug
tar -xzf "dist/zcode/releases/$zcode_version/zcode-$zcode_version.tar.gz" -C dist/zcode/debug
# 默认启动 TUI
node dist/zcode/debug/zcode/bin/zcode.mjs
# 启动 Web
node dist/zcode/debug/zcode/bin/zcode.mjs --web --workspace "$PWD" --port 3030 --no-open
```

浏览器打开 `http://127.0.0.1:3030` 即可验证同一后端服务托管 Web 页面与 Agent 的完整链路；该端口需空闲，如与 `pnpm dev:web` 冲突可改用其他 `--port`。

## 仓库结构

| 目录                                                 | 职责                                       |
| ---------------------------------------------------- | ------------------------------------------ |
| `packages/desktop`                                   | Electron Main、Host、Renderer 与桌面打包   |
| `packages/web`                                       | Web 客户端                                 |
| `packages/server`                                    | HTTP / WebSocket 服务与远程连接            |
| `packages/zcode-server-cli`                          | 独立 Server 启动与进程管理                 |
| `packages/ui`                                        | 共享 React 组件、hooks 与 Zustand 状态     |
| `packages/services`                                  | 业务服务与持久化                           |
| `packages/shared`、`packages/rpc`、`packages/client` | 共享协议和类型、RPC 框架、Agent 客户端 SDK |
| `packages/provider`、`packages/provider-node`        | Provider 公共能力与 Node 实现              |
| `apps/zcode-cli`                                     | Agent CLI、TUI、运行时与工具               |
| `scripts`、`config`、`third-party`                   | 构建维护脚本、内置配置与第三方声明材料     |

## 工程规范

- 新增或修改行为前先更新对应 spec；遵循 `.agents/` 技能与根目录架构约束。
- 开发约束以根 [AGENTS.md](AGENTS.md)、[CONTEXT.md](CONTEXT.md)（插件商店领域词汇）与 [DESIGN.md](DESIGN.md)（UI 设计规范）为准；跨平台默认同时覆盖 Windows / macOS / Linux。
- 提交信息遵循约定式提交风格，保持提交小而聚焦。

## 项目声明

功能与优惠范围、维护规则、执行与数据风险，以及许可和第三方版权说明，详见 [NOTICE.md](NOTICE.md)。

## License

本项目基于 **Apache-2.0** 协议发布，详见 [LICENSE](LICENSE)；第三方版权见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。