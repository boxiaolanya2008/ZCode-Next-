# ZCode-Next++

<div align="center">
  <img src="public/logo/icons/1024x1024.jpg" alt="ZCode" width="128" height="128" />
</div>

<div align="center"><a href="README.en.md">English</a></div>

ZCode-Next++ 是 AI 编码工作台，提供桌面、浏览器与终端 `zcode` 三种入口，共享同一套 Agent 运行时、通信协议与 UI。

## 快速开始

环境：Git、Node.js **24.14.0**、pnpm **10.33.2**（以 [mise.toml](mise.toml) 为准）。

```bash
pnpm bootstrap
```

`pnpm bootstrap` 负责安装依赖、准备桌面运行资源并完成基础构建。

## 常用命令

| 命令                                     | 说明                                     |
| ---------------------------------------- | ---------------------------------------- |
| `pnpm dev:desktop`                       | 启动桌面（Electron）                     |
| `pnpm dev:desktop:test`                  | 使用测试环境启动桌面                     |
| `pnpm dev:web`                           | 启动 Web 客户端与服务端                  |
| `pnpm --filter @zcode/cli dev`           | 启动终端 Agent CLI                       |
| `zcode` `zcode --web`                    | 命令行版（TUI / Web 模式）               |
| `pnpm bundle:desktop`                    | 打包桌面                                 |
| `pnpm build:zcode`                       | 组装命令行发行包                         |
| `pnpm typecheck` / `pnpm lint`           | 类型检查 / 代码检查                      |

## License

基于 **Apache-2.0** 协议发布，详见 [LICENSE](LICENSE)。