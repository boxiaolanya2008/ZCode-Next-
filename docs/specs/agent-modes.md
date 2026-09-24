# Spec: 工作模式选择（Agent Modes）

## 背景与目的

输入栏目前只有 model list（模型选择）。产品需要在其旁新增 **mode list（工作模式选择）**，
让用户为当前会话选择一个"工作模式"：**编码模式**、**界面设计模式**、**渗透模式（已授权）**。
每个模式自带一套**超强提示词**；选中模式后，**整段替换**默认 system prompt，
改为默认使用该模式的提示词。

## 产品规则

1. mode list 位于 composer 工具条，紧邻 model list（`V4ComposerToolbar`）；默认选中**编码模式**。
2. 模式集合（稳定 id）：`coding`（编码）、`ui-design`（界面设计）、`pentest-authorized`（渗透·已授权）。
3. 每个模式提供一份 Markdown 提示词，作为 **stable system body** 注入。注入语义复用
   `customSystemPrompt`（`config.systemPrompt`）通道：**替换默认 stable body，并跳过默认动态段**。
4. 因整段替换会跳过 Env Info / Session Guidance / Context Management 等段，**模式提示词必须自带
   必需的说明**：工具调用约定、环境与工作目录约定、上下文/token 管理要点、以及该模式专属工作流。
   缺少这些说明会导致 agent 不会调用工具。
5. **渗透模式（已授权）必须内置范围护栏**（写入提示词本身）：
   - 开工前必须确认并记录授权范围（目标资产、时间窗、允许的动作）；
   - 仅对授权范围内的目标动作；范围外的目标一律拒绝并说明；
   - 全程留痕（命令、时间、目标、结果）；不做破坏性动作（不删数据、不做 DoS、不做持久化驻留）；
   - 不协助规避检测、不进行未授权横向移动。
6. 模式选择是**会话级状态**，随会话持久化与恢复；切换模式后自**下一轮**生效（context 重建）。
7. 不与既有 `config.mode`（normal/plan 计划模式）冲突：本特性字段命名为 `workMode`，独立于计划模式。

## 状态所有者与接口

- **唯一来源**：模式目录（`id` / 显示名 / 提示词）放在 `packages/shared`（browser-safe），
  UI 只取显示名，agent 取提示词正文；禁止在 UI 与 agent 各写一份。
- **运行时**：`AgentRuntimeConfig.systemPrompt` 承载所选模式提示词（复用 `customSystemPrompt` 通道）。
- **UI 状态**：`packages/ui/src/store/` 内的 composer 工作模式 store，经 hooks 暴露给工具条。
- **协议**：会话创建/配置补丁需携带 `workMode`，并同步更新
  `packages/shared/src/zcode-protocol/index.ts` 的严格 schema 与运行时校验。
- **依赖方向**：UI → hooks → services → agent runtime；UI 不直接读 agent 实现。

## 验收场景

- **GIVEN** 新会话；**WHEN** 未选择模式；**THEN** 使用编码模式，且行为与现状一致（回归安全）。
- **GIVEN** 选择"界面设计模式"；**WHEN** 发送需求；**THEN** system prompt 为该模式提示词，
  且模型能正常调用工具完成任务（证明提示词自带的工具说明有效）。
- **GIVEN** 选择"渗透模式（已授权）"；**WHEN** 请求涉及授权范围外的目标；
  **THEN** 模型按护栏拒绝并提示需先取得授权，不执行动作。
- **GIVEN** 已选某模式；**WHEN** 重开会话/恢复会话；**THEN** 模式被恢复。
- **GIVEN** 会话中切换模式；**WHEN** 下一轮请求；**THEN** 新提示词生效。

## 待确认

- 模式提示词正文的存放位置：随包 sidecar `.md`（参照 language-coding-standards 的携带方式）
  还是内联字符串。影响桌面/CLI/SEA 各产物的资源携带。
