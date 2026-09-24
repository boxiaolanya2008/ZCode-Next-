# Spec: 会话上下文压缩与模型请求清理

## 背景

当前 Agent Runtime 已有手动、阈值自动和 provider overflow 触发的事务型 compact。它们只在模型请求前或用户显式调用时执行，且 transcript、模型诊断轨迹和产品投影是三个不同的数据面。

本次新增两条明确边界：

1. 会话关闭/去激活前，在 runtime 进入 shutdown 之前执行一次会话结束压缩。
2. 发送后续模型请求时，移除失败工具调用的结果与对应 tool call，以及所有 reasoning block；完整 transcript、产品历史和模型调用诊断记录不改写。

## 已确认的产品规则

- 压缩触发时机是会话结束，不是每个用户轮次结束。
- 会话结束时若已有足够可压缩轮次，生成一次模型摘要；若历史不足，压缩是无副作用的 skipped/no-op。
- 压缩失败、取消或超时不能阻断会话关闭；关闭链记录结构化告警并继续释放资源。
- 同一个 runtime 的会话结束压缩只能执行一次，重入调用直接复用进行中的 Promise 或返回已完成结果。
- 失败工具调用定义为 provider-visible tool result 的 `isError === true`；成功、运行中和待审批工具结果继续保留。
- reasoning 只从 provider request 的临时副本移除，不从 SQLite transcript、UI row 或 model-io 诊断轨迹删除。
- 移除失败 tool result 时同步移除对应 assistant tool call，避免产生孤立 tool result 或非法 provider 请求。
- 模型调用记录继续保留：request/response 诊断、`model_usage`、`tool_usage` 和 usage 事件不属于本次清理范围。
- 不物理删除旧 message/part；compact 仍使用现有 `CompactBoundary` 和冷恢复 active-chain 语义。

## 状态所有者

```text
Session close admission
  -> AgentRuntime compactSessionEnd (single-flight owner)
  -> CompactBoundary + summary persistence
  -> MessageHistory.replaceMessages
  -> runtime shutdown
```

- `AgentRuntime` 是触发、并发去重和失败降级的唯一 owner。
- `MessageHistory` 是当前 provider-visible active history 的唯一 owner。
- `SessionStore` 是 transcript 与 compact boundary 的持久化 owner。
- protocol/UI 只消费既有 compact timeline 与 transcript 投影，不维护第二份压缩状态。

## 接口与事件顺序

新增 runtime 内部能力 `compactSessionEnd(traceContext)`，由 session facade 在 `beginShutdown()` 前调用：

1. 检查 runtime 未进入 shutdown、无 active/queued turn、无 active foreground execution。
2. 读取 session model；没有可用模型时安全跳过。
3. 以 `session_end` trigger、`session_end` reason 调用既有 `compactActiveConversation`。
4. 复用既有 `CompactStarted`、`CompactBoundary`、`ModelRequest`、`ModelComplete`、`CompactCompleted` 事件和持久化流程。
5. 压缩成功后替换 active history；压缩失败只记录失败并让 close 继续。
6. 调用方对整个操作施加有界 deadline；超时后不再启动第二次压缩。

Desktop `desktop-continuous` 与 Web `web-remote-replayable` 都只收到同一 CompactBoundary；差异仍由既有 delivery profile 决定，不新增旁路状态。

## 持久化与兼容边界

- 新增 compact trigger/reason 枚举值，旧 session 的 compact 数据继续按现有 schema 读取。
- 不新增 SQLite 表或列；summary、boundary、timeline 继续写入现有 message/part/session 数据面。
- 旧 transcript 中已有 reasoning 和失败 tool part 仍可恢复；只有下一次 provider request 使用清理后的副本。
- 冷恢复先按既有 active chain 还原完整 history，再在 request projection 阶段清理。

## 验收场景

- **GIVEN** 一个已完成至少两轮 assistant round 的 session；**WHEN** runtime 关闭；**THEN** 在 shutdown 前生成一次 session-end summary 和 CompactBoundary，关闭后恢复得到摘要链。
- **GIVEN** 只有一轮或没有 assistant round；**WHEN** runtime 关闭；**THEN** 不发起额外模型调用，压缩结果为 skipped/noop，关闭成功。
- **GIVEN** compact 模型请求失败或超时；**WHEN** runtime 关闭；**THEN** 记录失败并继续关闭，既有 transcript 不被删除。
- **GIVEN** 历史中有 reasoning、失败 tool result 和成功 tool result；**WHEN** 构造下一次 provider request；**THEN** reasoning 与失败 tool call/result 消失，成功 tool call/result 和普通 user/assistant text 保留。
- **GIVEN** request projection 删除失败 tool result；**WHEN** 检查对应 assistant message；**THEN** 对应 tool call 同步删除，不产生孤立 tool result。
- **GIVEN** 会话诊断记录已写入 model-io 或 usage 表；**WHEN** 执行请求清理；**THEN** 这些记录不被修改。
