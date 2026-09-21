# Rust 编码规范

> 适用范围说明:本规范适用于项目内所有使用 Rust 编写的服务端组件、Agent 运行时代码、协议实现与命令行工具。目标工具链为 Rust 2024 edition,要求代码经过 `cargo fmt`、`cargo clippy` 与 `cargo test` 三道门禁。所有涉及不安全代码、并发共享或外部边界的改动都必须遵循本文档的约束。本文档同时作为代码评审与对接新成员的依据。

## 1. 概述与使用时机

Rust 是一门强调内存安全、无数据竞争与可靠性的系统编程语言,其所有权、借用与生命周期模型在编译期即可消除大量常见缺陷。本仓库在性能敏感、并发密集或需要精确控制资源释放的场景优先选用 Rust 实现。

- 当组件需要长期运行且对稳定性要求高时,优先使用 Rust,借助类型系统表达不变量。
- 当组件不直接操作裸内存、没有严格的性能诉求时,也可使用其他语言,但本项目核心协议层统一使用 Rust。
- 编写新模块前,先阅读仓库的架构策略与模块阅读包,确保依赖方向正确:`packages/shared` 为共享协议,业务代码不得反向导入桌面实现细节。

使用时机判断要点:

- 需要多线程并发且希望杜绝数据竞争时,Rust 的所有权模型让这类错误在编译期暴露。
- 需要对每个 `Result` 的失败路径做显式处理时,`?` 运算符与 match 能强制穷尽。
- 需要对外提供 FFI 而未使用 `unsafe` 时,必须给出不变式说明与审计记录。

以下用一个最小的程序概览本规范的核心主张:

```rust
// 顶层文档注释:先描述模块职责与不变量
//! 模块:用户会话管理器
//! 本模块保证每个 session_id 在同一时刻只被一个线程访问。

use std::collections::HashMap;

/// 返回新建会话的数量。
/// 调用方负责在返回值大于 0 时持久化会话状态。
pub fn create_sessions(ids: &[String]) -> usize {
    ids.len()
}
```

## 2. 环境与工具链

统一的工具链能消除"在我机器上能过"的差异。所有成员必须使用项目中 `mise.toml` 声明的 Rust 版本,并使用稳定的工具链组件。

### 2.1 工具链组件

- `rustc`:编译器,版本由 `rust-toolchain.toml` 固定。
- `cargo`:包管理与构建工具。
- `rustfmt`:代码格式化,遵循 `.rustfmt.toml`。
- `clippy`:静态检查 linter。

安装与版本确认示例:

```bash
# 安装工具链(使用 nightly 仅用于基准测试等特殊场景,业务代码使用 stable)
rustup component add clippy rustfmt
rustc --version && cargo --version

# 将工具链固定到 rust-toolchain.toml
cat rust-toolchain.toml
# [toolchain]
# channel = "stable"
# components = ["rustfmt", "clippy"]
```

### 2.2 常用命令

```bash
# 格式化并检查
cargo fmt --all -- --check
cargo clippy --all-targets --all-features -- -D warnings

# 构建与测试
cargo build --release
cargo test --all-features
```

### 2.3 配置示例

`.rustfmt.toml` 推荐配置:

```toml
edition = "2024"
max_width = 100
use_small_heuristics = "Default"
reorder_imports = true
```

`Cargo.toml` 中必须显式声明 edition 与依赖锁定:

```toml
[package]
name = "zcode-core"
edition = "2024"
rust-version = "1.85"

[dependencies]
serde = { version = "1", features = ["derive"] }
tokio = { version = "1", features = ["rt-multi-thread", "sync"] }
```

## 3. 命名与风格

一致的命名让代码意图自明。下面给出本项目要求的主要命名约定。

| 类别 | 约定 | 示例 |
| --- | --- | --- |
| 类型(crate/struct/enum/trait) | UpperCamelCase | `CommandInbox`, `SessionId` |
| 函数与方法 | snake_case | `create_session`, `try_wait` |
| 常量与静态 | SCREAMING_SNAKE_CASE | `MAX_BUFFER_SIZE`, `DEFAULT_TTL` |
| 变量与字段 | snake_case | `session_map`, `is_running` |
| 模块与文件 | snake_case | `logger.rs`, `rpc/` |
| 生命周期参数 | 单个大写字母 | `'a`, `'ctx` |
| 类型参数 | 大写字母或 UpperCamelCase | `T`, `E`, `Item` |
| 泛型约束命名 | 驼峰且能读出名 | `AsBytes`, `IntoValue` |
| 布尔谓词 | `is_`/`has_`/`can_` 前缀 | `is_ready`, `has_pending` |

正例:

```rust
// 布尔谓词以 is_ 开头
pub fn is_empty(&self) -> bool { self.len == 0 }

/// 解析请求头,失败返回 Err
pub fn parse_header(raw: &[u8]) -> Result<Header, ParseError> {
    // ...
    Ok(Header::default())
}

const MAX_BATCH_SIZE: usize = 1024;
```

反例:

```rust
// 反例:类型用蛇形、常量用小写、命名含糊
struct user_session {}      // 错误:类型应 UpperCamelCase -> Session
let MAX_SIZE = 10;          // 错误:常量应 SCREAMING_SNAKE_CASE
fn dothing(x: i32) -> i32 { x } // 错误:名称应自解释
```

风格要点:

- 使用 `rustfmt` 统一缩进(4 空格)与换行,不要手工对齐。
- 每个公共项都应有文档注释 `///`,文档注释中可包含可运行的代码示例。
- 不要在标识符中使用拼音或缩写随机拼写,杜绝 `tmp2` 这类名字。

## 4. 语法与惯用法

本节覆盖 Rust 高频语法的推荐用法,每小节给出示例。

### 4.1 类型与集合

优先使用标准库集合表达意图:`Vec` 用于有序可重复数据,`HashMap` 用于键值查找,`HashSet` 用于去重,`BTreeMap` 用于需要有序遍历的场景。

```rust
use std::collections::{BTreeMap, HashSet};

// 使用 BTreeMap 保证按键序输出,便于日志与断言
let mut index: BTreeMap<String, u64> = BTreeMap::new();
index.insert("alpha".to_string(), 1);

// 使用 HashSet 做去重
let mut seen: HashSet<u32> = HashSet::new();
assert!(seen.insert(7));
```

选择合适的集合能避免无谓的额外工作:例如只做成员判断时用 `HashSet` 而非 `Vec::contains`,后者的复杂度为 O(n)。

### 4.2 字符串

Rust 区分 `String`(可变的 UTF-8 缓冲)与 `&str`(借用视图)。应向函数传入 `&str`,仅在需要所有权时才接受 `String`。

```rust
// 尽量接受 &str;仅在确实需要持有并修改时才用 String
pub fn greet(name: &str) -> String {
    format!("hello, {name}")
}

// 字符串拼接要避免二次分配
let base = String::from("a");
let mut out = String::new();
out.push_str(&base);
out.push('!');
```

字符串是非 UTF-8 无关时(例如协议字节流),优先使用 `Vec<u8>` 或 `&[u8]`,避免把二进制数据误塞进 `String`。

### 4.3 结构体、枚举与模式匹配

用枚举表达状态机,用结构体组合数据。模式匹配要穷尽所有分支。

```rust
enum SessionState {
    Pending,
    Active { worker_id: u64 },
    Closed,
}

struct Session {
    id: String,
    state: SessionState,
}

impl Session {
    fn describe(&self) -> &str {
        match &self.state {
            SessionState::Pending => "pending",
            SessionState::Active { .. } => "active",
            SessionState::Closed => "closed",
        }
    }
}
```

枚举比散落的布尔标志更安全:状态转换可以由类型系统约束,避免出现"running 与 closed 同时为真"的非法组合。

### 4.4 unsafe

`unsafe` 是逃逸门,必须缩小范围到单个表达式,并逐条注释不变量。不要为大段逻辑统一标注 `unsafe`。

```rust
pub fn first<'a>(slice: &'a [u8]) -> &'a u8 {
    // SAFETY:调用方保证 slice 非空,此处索引必然在边界内。
    unsafe { slice.get_unchecked(0) }
}
```

### 4.5 迭代器与函数式组合

优先用迭代器链表达变换,避免手写索引循环。

```rust
let numbers: Vec<u32> = (0..10)
    .filter(|n| n % 2 == 0)
    .map(|n| n * n)
    .collect();

// collect 到 Result 可向上传播首个错误
let parsed: Result<Vec<u32>, _> = items.iter().map(|s| s.parse::<u32>()).collect();
```

## 5. 类型系统与内存

Rust 的强类型与所有权模型是本规范最核心的保障。

### 5.1 所有权与借用

每个值在任意时刻最多只被一个所有者持有;借用要么共享(`&`)不可变,要么独占(`&mut`)可变,两者不可并存。

```rust
pub struct Ticket { pub id: u32 }

// 取共享借用,不可修改原值
pub fn print_id(t: &Ticket) {
    println!("{}", t.id);
}

// 取可变借用,可修改但需独占
pub fn bump_id(t: &mut Ticket) {
    t.id += 1;
}
```

传递所有权时明确意图:只读用 `&`,需要修改用 `&mut`,需要转移所有权才按值传递。

### 5.2 生命周期

生命周期描述借用关系的存活范围。多数场景可省略,编译器会自动推断;仅在返回引用或字段持有引用时需要显式标注。

```rust
/// 返回输入切片中的第一个元素视图,其生命周期与输入一致。
pub fn head<'a>(slice: &'a [u8]) -> Option<&'a u8> {
    slice.first()
}
```

### 5.3 无符号与固定宽度整数

与外部协议、文件格式交互时,必须使用固定宽度整数并处理溢出:

- 普通计数用小写类型推断,跨边界定义字段用显式宽度: `u8`, `u16`, `u32`, `u64`, `i32`。
- 溢出敏感的运算优先使用 `checked_*` 或 `wrapping_*`,不要在 release 模式下依赖自然溢出行为。

```rust
pub fn add_saturating(a: u32, b: u32) -> u32 {
    a.saturating_add(b)
}

// 解析协议中的大小字段,直接 as 转换会在溢出时静默截断
pub fn parse_size(bytes: &[u8]) -> Option<usize> {
    let hi = bytes.get(0)?;
    let lo = bytes.get(1)?;
    let raw = u16::from_be_bytes([*hi, *lo]);
    Some(usize::from(raw)) // 用 from 而非 as,保留语义
}
```

### 5.4 内存安全

在 Rust 中,没有 `unsafe` 的普通代码由编译器保证内存安全:没有越界、悬垂引用与释放后使用。因此应尽量隔离不安全的边界,保持安全代码尽量多。

```rust
pub fn safe_copy(src: &[u8], dst: &mut [u8]) -> usize {
    // dst 长度不足时安全返回可写入的数量,不越界
    let n = src.len().min(dst.len());
    dst[..n].copy_from_slice(&src[..n]);
    n
}
```

由于借用检查,上面代码不可能写出越界写入,这正是选择 Rust 在本项目承担协议解析等高风险职责的核心理由。

## 6. 错误处理

### 6.1 用 Result 表达可恢复错误

可恢复失败用 `Result<T, E>`;不可恢复的编程错误用 `panic!` / `expect`,并只在"恒真的前条件"下使用。

```rust
use std::fmt;

#[derive(Debug)]
pub enum ParseError {
    Empty,
    InvalidByte(u8),
}

impl fmt::Display for ParseError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{self:?}")
    }
}
impl std::error::Error for ParseError {}
```

### 6.2 使用 `?` 传播

`?` 会快速返回错误并自动转换错误类型,减少冗余 match。需要额外上下文时用 `map_err`。

```rust
pub fn parse_pair(s: &str) -> Result<(u32, u32), ParseError> {
    if s.is_empty() {
        return Err(ParseError::Empty);
    }
    let mut it = s.split(',');
    let a: u32 = it.next().unwrap().parse().map_err(|_| ParseError::InvalidByte(0))?;
    let b: u32 = it.next().unwrap().parse().map_err(|_| ParseError::InvalidByte(1))?;
    Ok((a, b))
}
```

### 6.3 错误分层

错误按模块分层:底层返回底层错误,上层用 `map_err` 包裹成领域错误,避免把所有底层细节泄漏到外部接口。

```rust
// 上层服务把底层 I/O 错误统一转化为领域错误
pub fn load_config(path: &str) -> Result<Config, ConfigError> {
    let data = std::fs::read_to_string(path)
        .map_err(|e| ConfigError::Io(path.to_string(), e))?;
    serde_json::from_str(&data).map_err(ConfigError::Decode)
}
```

错误原则:能明确表达"是什么失败"就优先使用错误类型与 `?`,不要用 `panic!` 隐藏可预期失败;通用底层错误允许在顶层统一兜底记录日志。

## 7. 异步与并发

### 7.1 async/await

I/O 密集逻辑使用 `tokio`;CPU 密集任务放到 `spawn_blocking` 而非阻塞 async 运行时。

```rust
use tokio::task;

pub async fn handle(sock: TcpStream) {
    // 阻塞式计算不应直接占用 async 线程池
    let digest = task::spawn_blocking(move || expensive_hash(sock)).await;
}
```

### 7.2 线程与通道

跨线程传递消息优先使用通道而不是共享状态。选择 `mpsc`、`broadcast` 或 `watch` 时要匹配消费语义。

```rust
use tokio::sync::mpsc;

async fn producer(tx: mpsc::Sender<u64>) {
    for i in 0..100 {
        if tx.send(i).await.is_err() {
            break; // 消费者已关闭,停止生产
        }
    }
}
```

### 7.3 锁与原子

共享可变状态用 `Mutex`/`RwLock`;单计数器用 `AtomicU64` 与 `load/store` 操作。加锁区域应保持最短。

```rust
use std::sync::atomic::{AtomicU64, Ordering};

static INFLIGHT: AtomicU64 = AtomicU64::new(0);

pub fn begin() {
    let _ = INFLIGHT.fetch_add(1, Ordering::Relaxed);
}
```

并发约定:一个状态只允许一个 `Mutex` 保护,并明确 owner;不要给同一份数据套多个锁,避免死锁与顺序倒置。

## 8. 结构与架构

### 8.1 模块与包

按架构分层组织 crate 与模块,公开入口要收敛,禁止跨域导入内部实现。

```text
zcode-core/
├── src/
│   ├── lib.rs          # 公共导出入口,re-export 公开 API
│   ├── context/        # 会话上下文与运行时
│   ├── logger.rs       # 日志工具
│   └── rpc/            # 协议与消息定义
└── tests/
    └── integration.rs  # 端到端测试
```

lib.rs 只 re-export 公共接口,内部模块保持私有,避免外部直接触及实现细节。

```rust
// lib.rs 汇总公开 API
pub use context::{Context, ContextError};
pub mod context;
mod internal; // 私有不对外导出
```

### 8.2 接口隔离与状态 owner

每个状态必须有唯一 owner,写入路径唯一。接口最小化:只暴露需要的字段,方法优先表达操作而非裸字段访问。

```rust
pub struct Counter { value: u64 }

impl Counter {
    pub fn new() -> Self { Self { value: 0 } }
    pub fn increment(&mut self) {
        self.value += 1;
    }
    pub fn get(&self) -> u64 { self.value }
}
```

禁止通过 `pub` 字段泄漏状态一致性,状态变化必须经过方法,保证不变量不被绕过。

## 9. 构建 / 测试 / 发布

### 9.1 cargo test

单元测试随源代码放置,集成测试放在 `tests/`,用 `#[cfg(test)]` 隔离。

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn add_works() {
        assert_eq!(add_saturating(u32::MAX, 1), u32::MAX);
    }

    #[test]
    #[should_panic]
    fn invalid_index_panics() {
        let v = vec![1];
        let _ = v[5];
    }
}
```

### 9.2 CI 门禁

合并前必须通过:

```bash
cargo fmt --all -- --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test --all-features
```

### 9.3 发布与版本

语义化版本;破坏性 API 变更调整主版本;CHANGELOG 记录行为变更。发布前跑 `pnpm verify:pre-push` 之外的 Rust 门禁一致步骤。

## 10. 安全与性能要点

### 10.1 unsafe 不变量

每处 `unsafe` 必须包含 `// SAFETY:` 注释,描述保持该调用安全的前提与证明。所有变更不得削弱这些前提。

```rust
pub fn as_bytes(s: &str) -> &[u8] {
    // SAFETY:借用生命周期与入参一致,str 内存必然是合法字节序列。
    unsafe { std::slice::from_raw_parts(s.as_ptr(), s.len()) }
}
```

### 10.2 缓冲区与边界

与外部数据交互时一律先做长度与边界校验,不用裸索引直接访问外部输入。

```rust
pub fn header_len(raw: &[u8]) -> Option<usize> {
    let n = usize::from(raw.first()?);
    if raw.len() < n { return None; } // 边界校验
    Some(n)
}
```

### 10.3 性能与确定性

避免不必要的克隆与分配;热路径注意算法复杂度。对于需要确定性输出的场景(例如低层日志),避免依赖未排序的 `HashMap` 迭代序。

## 11. 常见陷阱与反模式

每条 `【陷阱】` 描述问题与修正要点。

- `【陷阱】` 大段代码套 `unsafe`:会把安全代码也置于风险之下。修正:把 `unsafe` 收缩到单个安全封装函数,并对调用面做注释。
- `【陷阱】` 用 `unwrap` 吞掉可预期错误:外部输入失败时直接 panic。修正:改用 `Result` 与 `?`,在顶层统一处理。
- `【陷阱】` 过度克隆:无谓的 `clone()` 增加分配。修正:优先借用 `&str`/`&[T]`,仅在需要所有权时克隆。
- `【陷阱】` 在 `match` 中使用下划线当万能分支掩盖逻辑:违反穷尽性收益。修正:显式列出所有分支。
- `【陷阱】` 用裸索引访问外部数据:`raw[5]` 可越界 panic。修正:使用 `get()` 或先做长度检查。
- `【陷阱】` 用 `String` 存二进制:UTF-8 校验与替换会破坏字节。修正:二进制数据用 `Vec<u8>`。
- `【陷阱】` 默认假设 `None` 分支不可能:过早 `unwrap` 掩盖脏数据。修正:显式处理 `Option`。
- `【陷阱】` 在 async 中做阻塞调用:卡住运行时线程池。修正:用 `spawn_blocking` 或异步替代接口。
- `【陷阱】` 多锁嵌套导致死锁:加锁顺序不一致。修正:统一加锁顺序或减少锁数量。
- `【陷阱】` 依赖未排序集合的迭代序:日志与断言不稳定。修正:需要有序输出时用 `BTreeMap`。
- `【陷阱】` 把 `&mut self` 传给只读场景:过度放宽借用。修正:按需选择最小借用权限。
- `【陷阱】` ff. 未审计的 FFI 边界:跳过检查传入裸指针。修正:在边界做校验与 `SAFETY` 注释。

```rust
// 反例修正:避免裸索引,改用 get + 边界校验
pub fn mean(scores: &[u32]) -> Option<f64> {
    let n = scores.len();
    if n == 0 { return None; }
    let sum: u64 = scores.iter().map(|&s| u64::from(s)).sum();
    Some(sum as f64 / n as f64)
}
```

## 12. 自查检查清单

- [ ] 代码通过 `cargo fmt --check`。
- [ ] 代码通过 `cargo clippy -- -D warnings`。
- [ ] 新增公共项带有 `///` 文档注释。
- [ ] 所有可预期错误用 `Result`,没有对未知输入的 `unwrap`。
- [ ] 每处 `unsafe` 都有 `SAFETY:` 不变量注释。
- [ ] 没有 `pub` 裸字段破坏状态一致性。
- [ ] 二进制数据用 `Vec<u8>` 而非 `String`。
- [ ] 外部输入访问前做了边界/长度校验。
- [ ] 集合选择符合语义(`HashMap`/`BTreeMap`/`HashSet`)。
- [ ] 没有无谓的 `clone()` 与重复分配。
- [ ] 热路径没有 O(n) 误用。
- [ ] 每一份共享状态只有唯一 owner 与单一写入路径。
- [ ] async 中没有阻塞式调用。
- [ ] 锁顺序全局一致,避免死锁。
- [ ] 生命周期标注只在必要时显式;借用权限最小。
- [ ] 错误类型完成分层,底层细节未泄漏到外部接口。
- [ ] 测试覆盖新增行为,`cargo test --all-features` 通过。
- [ ] 模块依赖方向符合架构策略,未跨域导入实现细节。

## 13. 参考资料

- Rust 官方手册 (The Rust Book) 与标准库文档。
- Rust API Guidelines 指南。
- Clippy 与 rustfmt 官方说明。
- Tokio 异步运行时文档。
- 本项目架构策略 `architecture-governance` 模块约定。

遵循上述规范,让 Rust 代码在编译期承接内存安全与并发正确性,把 unsafe 压缩到最小的可信边界。