# Spec: Skills 市场（SkillHub 接入）

## 背景与目的

插件市场（Plugin Store，术语见 `CONTEXT.md`）之下需要新增一个 **Skills 市场**：从
`https://skillhub.cn/` 获取可安装的 skills，用户可搜索、查看、选择是否下载；下载后保存到
本地 skills 目录，并可像现有 skills 一样通过 `/` 命令使用。整体作为现有 skills 系统的**增量**，
不替换既有 skills 机制。

## 数据来源与合规

- 数据源为 **SkillHub 官方 CLI**，而非直接抓取网页。官方安装文档（`https://skillhub.cn/install/skillhub.md`）
  约定：
  - `skillhub search <kw>` —— 搜索；
  - `skillhub install <name> --dir <skills 目录>` —— 安装到指定 skills 目录；
  - 需以允许联网的权限执行。
- 直接爬取站点页面不作为方案（条款与稳定性风险）；若后续有官方 HTTP API，再以 adapter 形式接入。
- 所有外部 I/O（网络、子进程、文件写入）必须收敛到 services 的 adapter 边界，业务/UI 层只表达意图。

## 产品规则

1. 入口位于插件市场下方，新增 **Skills 市场** 分段；复用现有商店页布局语言（见 `CONTEXT.md` / `DESIGN.md`）。
2. 支持**关键词搜索**（走 `skillhub search`），列表展示名称、简介、来源、版本。
3. 用户**逐个选择是否下载**；下载/安装走 `skillhub install --dir <zcode skills 目录>`。
4. 安装落点为 zcode 自身的 skills 目录（与现有 skills 系统同一目录，保证 `/` 命令可直接发现）。
5. 支持在现有 skills 系统上**增量更新**：已安装的 skill 可检查更新并升级；不覆盖用户本地改动
   （冲突策略需在实现时明确并写入 spec）。
6. 未安装 `skillhub` CLI 时，给出明确引导（安装命令），不静默失败。
7. 失败（网络/权限/磁盘/CLI 缺失）向用户暴露可操作错误，不吞错。

## 状态所有者与接口

- **状态所有者**：skills 目录（磁盘事实）为唯一真相；UI 只持有查询与安装进度等临时态。
- **接口（services 层新增）**：`ISkillMarketService`（搜索/详情/安装/更新/已安装查询），
  实现收敛 `skillhub` CLI 调用与 skills 目录读写；descriptor 与类型放 browser-safe 入口，
  Node 实现在 `@zcode/services/node`。
- **UI**：`packages/ui` 新增 Skills 市场视图，经 hooks 访问上述服务；不直接调用子进程/网络。
- **CLI 依赖**：`skillhub` 为外部可执行文件，调用需跨平台（Windows `.cmd`、参数数组、超时、输出截断）。

## 验收场景

- **GIVEN** 已安装 `skillhub`；**WHEN** 在 Skills 市场搜索关键词；**THEN** 返回结果列表。
- **GIVEN** 选中某 skill；**WHEN** 点击下载；**THEN** 安装到 zcode skills 目录，且该 skill
  可通过 `/` 命令被识别使用。
- **GIVEN** 某 skill 已安装且有新版本；**WHEN** 执行更新；**THEN** 增量更新到新版本，本地改动不被覆盖。
- **GIVEN** 未安装 `skillhub`；**WHEN** 打开 Skills 市场；**THEN** 提示安装引导，不报未处理异常。

## 待确认

- zcode 的 skills 目录在桌面 / CLI / 远程三种形态下的确切路径解析。
- 增量更新的冲突策略（本地改动 vs 远端版本）。
