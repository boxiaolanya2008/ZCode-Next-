# Spec: 超级工具（Super Tools）

## 背景与目的

现有 agent 工具（`write` / `edit` / `read` / `glob` / `grep` 等）能力较弱，用户希望**自研一套超级工具**，
并在系统提示词开头加入"如何使用/调用这些超级工具"的说明（教 AI 用）。

## 关键决策（已确认）

**是否删除 `write` / `edit` 等基础工具？**

- 现状：`write` / `edit` 是 agent 修改文件的基础能力，被 subagent、workflow、plan、hook 等多处依赖。
  直接删除会让 agent 失去改文件能力，且与仓库架构策略冲突（工具契约在
  `apps/zcode-cli/packages/contracts/src/tools/`，单一职责 + 文件行数限制）。
- **决策：新增而非删除。** 超级工具作为**上层能力**，底层复用基础工具的实现；
  系统提示词引导模型**优先**使用超级工具。若确实要下线基础工具，必须同步迁移所有调用点，
  并按仓库规范清理引用，属于独立的大改动。
- 本次交付按"**新增超级工具 + 提示词引导**"实现；`write`/`edit` 等基础工具全部保留。

## 交付的超级工具集合（命名，已与现有工具不冲突）

| 工具名        | 语义                                                                   | 底层复用 |
| ------------- | ---------------------------------------------------------------------- | -------- |
| `BatchEdit`   | 一次调用对多个文件做多处精确文本修改；单条失败不中断其余，逐条回传结果 | `Edit`   |
| `AtomicEdit`  | 编辑前预检全部匹配，编辑后回读校验；任一步失败即回滚，不留半成品写入   | `Edit`   |
| `SmartSearch` | 聚合 Glob + Grep，返回带行号与上下文的检索片段                         | 文件系统 adapter 的 `searchText`（与 `Grep` 同源） |

结构化补丁（structured patch）尚未单独成工具；`BatchEdit`/`AtomicEdit` 的结果已按文件回传
`structuredPatch`（与 `Edit` 同款 diff hunk），后续可再抽独立工具。

## 保留范围

- 与**联网搜索 / 网页读取**相关的工具（`websearch` / `webfetch` 等）保持现状，不纳入本次重构。

## 产品规则

1. 新增一组超级工具，覆盖高频且易错的编辑场景，例如：
   - **批量/多文件编辑**：一次调用对多个文件做多处修改；
   - **原子编辑**：编辑前校验匹配、编辑后回读校验，失败可回滚；
   - **结构化补丁**：以结构化 patch 表达变更，避免整文件重写；
   - **智能读取/检索**：聚合 read + glob + grep 的检索能力，返回带行号与上下文的片段。
2. 每个超级工具必须声明：`inputSchema`、`outputSchema`、是否只读、是否破坏性、是否并发安全、
   最大输出、超时、取消语义、权限需求、副作用范围（`none`/`workspace`/`git`/`network`/`system`）、
   幂等性与可恢复策略。
3. 大体积结果不回灌上下文，落盘/artifact 后只返回摘要与可追踪引用。
4. **系统提示词开头新增"工具使用导引"段**，教模型：超级工具能做什么、何时优先用、
   与基础工具的关系、常见错误与重试方式。该段必须随工具集一起演进，不得只写一次。
5. 超级工具需通过能力声明、schema 校验、命名空间隔离与权限收口接入，不直接获得内部实现能力。

## 状态所有者与接口

- **契约唯一来源**：`apps/zcode-cli/packages/contracts/src/tools/`（每个工具一个契约文件）。
  本次新增 `batch-edit.ts` / `atomic-edit.ts` / `smart-search.ts`，共享 `edit-item.ts`（单条编辑描述）
  与 `boolean-input.ts`（宽松布尔），并从该目录 `index.ts` 导出。
- **运行时**：工具注册与执行在 `apps/zcode-cli/packages/core/src/tool/`。
  新增 handler 为 `handlers/batch-edit.ts` / `handlers/atomic-edit.ts` / `handlers/smart-search.ts`，
  共用 `handlers/super-edit-shared.ts`（预检、回滚、read-state 校验）；在 `handlers/index.ts` 的
  `builtInTools` 注册，allowlist/disallowlist 由既有 `registerBuiltInTools` 统一收口。
- **提示词**：工具使用导引段由 `apps/zcode-cli/packages/core/src/context/sections/tool-usage-guide.ts`
  构建为稳定段（`cacheHint: "stable"`），在 `context/builder.ts` 中紧随 `cli_prefix` 注入，
  位于 system prompt 开头；导引内容随当前 runtime 实际注册的超级工具集演进。
- **协议**：若工具结果需投影到 UI，同步更新 `packages/shared` 的投影与 schema。

## 验收场景

- **GIVEN** 任务要求修改 3 个文件；**WHEN** 模型使用批量编辑超级工具；**THEN** 三处修改一次完成且可回读校验。
- **GIVEN** 编辑目标内容不匹配；**WHEN** 调用原子编辑；**THEN** 校验失败并给出可操作错误，不产生半成品写入。
- **GIVEN** 新会话；**WHEN** 模型首次决策调用工具；**THEN** 能依据系统提示词开头的导引优先选用超级工具。
- **GIVEN** 工具返回大结果；**WHEN** 回灌上下文；**THEN** 只回灌摘要/引用，不超限。

## 已确认 / 待办

- **已确认**：不下线 `write` / `edit`，基础工具保留（见"关键决策"）。
- **已确认**：超级工具最终集合与命名为 `BatchEdit` / `AtomicEdit` / `SmartSearch`（与现有工具不冲突）。
- **待办**：结构化补丁独立成工具；把超级工具纳入 Explore 子代理白名单（当前未改
  `EXPLORE_AGENT_ALLOWED_TOOLS`）。
- **待办（设计取舍）**：`SmartSearch` 目前在所有分支注册。embedded search 分支会隐藏
  `Glob`/`Grep` 并由 Bash find/grep 接管搜索；是否需要把 `SmartSearch` 一并隐藏，取决于
  产品是"继续走 Bash 检索"还是"以超级工具作为新的检索入口"。导引段按实际工具表裁剪，
  无论哪种选择都能自动适配。
- **待办**：为超级工具补充可运行测试。当前 `apps/zcode-cli` 各包没有 test 脚本或测试文件，
  本次以 `typecheck` / `lint` / 架构检查作为验证手段。

