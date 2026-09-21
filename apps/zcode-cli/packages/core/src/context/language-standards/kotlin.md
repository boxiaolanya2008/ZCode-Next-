# Kotlin 编码规范

> 适用于 Kotlin 工程(Android、JVM 服务端、跨平台)。用户需求模糊时,先按本规范明确边界,再实现。

## 1. 风格与命名

- 类型/对象/类用 PascalCase,函数/变量用 camelCase,常量/伴生对象内常量用 UPPER_SNAKE_CASE。
- 缩进 4 空格;遵循官方 Code Style;中文注释,代码保留英文标识符。
- 顶层函数/属性只在有明确归属时使用,**避免全局散落状态**。

## 2. 类型与空值安全

- 强制 null-safe:`String?` 明确可空;用 `?.`、`?:`、`let`/`requireNotNull` 表达,不盲目 `!!`(确实不变量保证才用并加注释)。
- 优先不可变:`val` 优先于 `var`;集合用只读视图表达。
- 数据模型用 `data class`/`sealed class`;跨边界契约用 schema 校验,而非仅依赖类型。

## 3. 惯用表达

- 用 Kotlin 标准库:作用域函数(`let/apply/run/also`)克制使用、避免嵌套;用 `when` 表达多分支。
- 避免 `!!` 与 `try-catch` 吞错;用 `Result`/`runCatching` 谨慎,区分可恢复与不可恢复。
- 集合操作(映射/过滤/展平)用链式表达,注意惰性序列 `Sequence` 的多次枚举。

## 4. 并发与协程

- 用协程(`suspend`、`scope`、`Flow`)组织异步;避免 `.result` 阻塞。
- 生命周期感知:UI/业务 scope 与宿主生命周期绑定,取消要显式传播。
- 共享可变状态用原子/并发集合/actor;不用 sleep 掩盖竞态。

## 5. 错误处理

- 用 `Result`/异常区分失败;业务失败用带结构化字段的错误类型。
- 仅在有能力处理处捕获;保留 cause;不在边界外吞错。

## 6. 结构与架构

- 单文件 ≤ 400 行;按模块拆分责任,避免大文件堆职责。
- 依赖注入优于全局单例;业务逻辑与 I/O(网络/DB/文件)分离收敛到 repository/adapter。

## 7. 构建 / 测试 / 工具

- 以仓库 `build.gradle(.kts)` 为准;行为变更补测试(JUnit/Kotest);开启并满足告警。

## 8. 常见陷阱

- `!!` NPE、数据类 equals/hashCode 与对象引用;`lateinit` 未初始化即访问。
- 序列与集合求值、惰性集合的副作用重复执行;协程作用域泄漏。