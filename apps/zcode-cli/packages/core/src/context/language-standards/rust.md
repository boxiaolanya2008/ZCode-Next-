# Rust 编码规范

> 适用于 Rust 工程(系统/CLI/库)。用户需求模糊时,先按本规范澄清边界与目标,再实现。

## 1. 风格与命名

- 遵循 Rust 命名:类型/对象用 PascalCase,函数/方法/变量用 snake_case,常量用 SCREAMING_SNAKE_CASE。
- CLI 结构体字段 snake_case;`cargo fmt` 为唯一风格来源。
- 中文注释;代码保留英文标识符。

## 2. 所有权、借用与生命周期

- 默认先求零拷贝:`&str`:`String`、`&[T]`:`Vec<T>`,优先借用而非克隆。
- 生命周期只在必要时显式标注;优先通过所有权转移/结构设计避免 `'a` 泛滥。
- 用 `Arc`/`Rc` 前先考虑借用;原子共享用 `Arc<std::sync::Mutex<T>>`/读写锁,CLI 单线程场景避免过度并发复杂度。
- 绝不绕过借用检查(`unsafe` 只用于确实需要、并有注释说明不变量)。

## 3. 错误处理

- 用 `Result`/`Option`,不用 panic 处理常规错误;库代码不 panic,CLI 在入口统一把错误转成用户提示与退出码。
- 自定义错误实现 `std::error::Error`/`Display` 并用 `thiserror` 之类描述;用 `?` 向上冒泡并保留原因。
- 用错误类型/枚举区分失败原因,不要靠错误文案做流程判断。
- `unwrap`/`expect` 仅用于条件确实不变量保证的场景,否则用 `ok_or`/辅助函数带上下文。

## 4. 结构与会话

- 单文件 ≤ 400 行;按模块拆分,把类型/实现/trait 组织清楚。
- 接口用 `impl`/`trait` 表达契约;状态唯一所有者,避免多写路径。
- 外部 I/O 收敛到 adapter 或基础设施层;业务逻辑不散落直连底层 API。

## 5. 并发与异步

- 明确选型:`std::thread` 与 `async`(tokio 之类)按任务形态;CLI 顺序任务不必引入 async runtime。
- async 函数持有 `Send`/`Sync` 边界;不要用 `Rc` 跨 await,不用 sleep 掩盖同步。
- 信号/超时/取消语义显式;资源(锁守卫、文件)自动 Drop,注意跨 `?` 与借用作用域。

## 6. 构建 / 测试 / 工具

- 以仓库工具为准(`cargo test`、clippy),行为变更先补 `#[test]`。
- 引入依赖需确认许可证与用途;不引入未使用依赖。

## 7. 常见陷阱

- iterator 惰性求值不回填(需要 `collect`);`Vec` 扩容时 `&mut` 借用冲突。
- `Option`/`Result` 解构与 `?` 的误用;整数溢出默认 debug panic / release 环绕。
- 结构体方法接收者 `self/&self/&mut self` 选型错误导致处理复杂化。