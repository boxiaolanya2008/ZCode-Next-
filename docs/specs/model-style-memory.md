# Spec: 按模型学习的编码习惯记忆

## 背景

现有 Project Memory 在成功的主 Agent turn 后由后台 extraction agent 归纳长期事实，但没有按模型区分的编码习惯画像。不同模型在同一 workspace 中可能偏好不同的命名、错误处理、测试组织、格式和变更表达方式；这些偏好需要可追踪、可隔离、可持续更新。

## 已确认的产品规则

- 学习范围是所有成功完成的 Main Agent turn，不要求用户显式说“记住”。
- 允许后台模型请求；提取继续使用当前成功 turn 的模型，并沿用现有受限 Memory 工具集。
- 画像按 `workspaceIdentity`（缺失时按规范化 workspace path）和 `providerId/modelId` 隔离。
- 画像只记录从成功轮次中归纳出的稳定编码习惯，不复制原始对话、完整代码、工具输入输出、reasoning、凭据、token 或一次性任务状态。
- 普通 Project Memory 仍按既有四类文件维护；模型画像是独立的 `model-styles` 文件，不加入 `MEMORY.md` 的通用索引。
- 画像内容在后续 turn 的 context 初始化时注入当前执行模型对应的画像；切换模型的下一轮重新选择对应画像。
- 画像不可用、为空或读取失败时静默降级，不阻断 Agent turn。
- 画像写入失败只影响本次后台学习，不影响主 turn、session transcript 或 compact。
- 画像是本地数据；不发送到 telemetry，不把原始会话内容写入日志。

## 状态所有者

```text
successful Main turn
  -> ProjectMemoryExtractionScheduler (existing single owner)
  -> model-style extraction prompt
  -> constrained Write/Edit inside workspace memory root
  -> next turn context load by workspace + provider/model
```

- `ProjectMemoryExtractionScheduler` 继续是后台记忆写入的唯一调度 owner。
- core memory path resolver 是画像路径的唯一 owner。
- `ContextBuilder` 只消费已加载的画像文本，不负责提取或写入。
- services 的 `IMemoryService` 继续是只读 catalog/preview 投影，不新增第二个写入 owner。

## 文件布局

在既有 Project Memory root 下使用：

```text
model-styles/<provider-slug>--<model-slug>-<identity-hash>.md
```

- provider/model slug 做跨平台安全化；hash 防止不同名称清洗后碰撞。
- workspace 隔离仍由 Project Memory root 承担，文件内容可记录 provider/model 元数据。
- 文件为 Markdown，使用现有 Memory 写工具的原子写入和 origin session 机制。
- 单文件读取和注入设置大小上限；画像只作为动态 context section，不进入稳定缓存前缀。

## 提取内容边界

后台模型只允许归纳以下类别：

- 命名、目录和模块组织习惯；
- 类型、接口和错误处理表达偏好；
- 测试层级、断言和验证习惯；
- 格式化、日志、注释和提交前检查习惯；
- 用户明确确认过的编码约束。

以下内容禁止写入画像：

- reasoning 或完整思考过程；
- 失败工具调用、完整工具输入输出和日志；
- API key、token、密码、私钥、用户真实敏感数据；
- 具体机器绝对路径、临时任务 ID、只在当前会话有效的状态；
- 从一次偶然写法推断出的硬性规则。

提取 agent 必须先读取已有画像并更新同一文件，不得每次创建重复画像。若本轮没有足够稳定的新信号，输出 `Nothing to save.` 并保持文件不变。

## Context 注入

新增 `model_style_memory` 动态 context section：

- 读取当前 `workspaceIdentity`/path 对应的 Project Memory root。
- 根据当前 provider/model 解析画像路径。
- 读取成功后以 meta-user 形式注入，标明这是当前模型的编码习惯，仅在与当前任务相关时遵循。
- 不把画像路径、原始文件列表或模型调用诊断注入 prompt。
- 模型切换后不复用上一模型的画像缓存；下一 turn 重新读取对应文件。

## 并发、失败与生命周期

- 继续使用现有 extraction scheduler 的 coalescing 和 cursor；同一 session 不并发写同一画像。
- turn 完成后调度，不阻塞前台响应。
- runtime shutdown 使用既有 scheduler abort；close 前先完成 session-end compact，再按既有 bounded drain 处理 extraction。
- 新 session 不继承旧 session 的内存缓存，但可从同一 workspace/model 画像文件恢复。
- 画像文件损坏或格式不符合读取上限时视为无画像，不覆盖原文件。

## 验收场景

- **GIVEN** workspace A 使用 model X 成功完成多个 turn；**WHEN** 后台 extraction 结束；**THEN** 生成 model X 的画像文件，下一 turn 注入该画像。
- **GIVEN** 同一 workspace 切换到 model Y；**WHEN** 下一 turn 初始化 context；**THEN** 不注入 model X 的画像，而读取 model Y 的画像。
- **GIVEN** workspace A 和 workspace B 使用相同模型；**WHEN** 画像写入；**THEN** 两个 Project Memory root 互不读取对方画像。
- **GIVEN** 成功 turn 包含 reasoning、失败工具结果和代码修改；**WHEN** extraction 读取上下文；**THEN** request projection 不提供 reasoning/失败工具结果，画像只保存归纳后的稳定习惯。
- **GIVEN** 成功 turn 没有新增稳定编码信号；**WHEN** extraction 完成；**THEN** 不创建重复画像，输出 no-op。
- **GIVEN** 画像文件不存在、超限或读取失败；**WHEN** 新 turn 初始化；**THEN** 主 turn 正常继续且 context 中不注入无效内容。
- **GIVEN** 后台提取模型请求失败；**WHEN** turn 已成功完成；**THEN** 主结果和 transcript 不受影响，下一轮可重试。
