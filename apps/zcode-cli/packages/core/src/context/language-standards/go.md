# Go 编码规范

> 本文档面向基于 Go 1.21+（约 1.2x 主流版本）的工程代码（后端服务、CLI、Agent、基础设施工具），用于统一团队在命名、错误处理、并发、接口隔离与包组织上的写法。适用范围覆盖新建模块、重构既有代码以及代码评审三个环节。规范强调"可执行"：每一条都给出具体做法、命令或可直接落地的代码骨架，而不是空泛的原则。文中所有示例均保证可被 `gofmt` 通过并可通过 `go vet` 检查。

## 1. 概述与使用时机

### 1.1 目标

Go 强调简洁、可读与显式。本规范围绕四个核心诉求展开：

- **让错误可追踪**：约定 `error` 的生成、包裹与判等方式，`%w` 链式上下文取代裸字符串字符串错误。
- **让并发可推理**：用 `goroutine` + `channel` + `context` 的组合表达并发，配合 `errgroup.Group` 管理生命周期，避免 `WaitGroup` 裸漏与 goroutine 泄漏。
- **让接口隔离**：接受接口、返回具体类型，接口按"需要什么"定义而非"实现者有什么"。
- **让代码即文档**：重视注释、命名与 `go doc`，代码评审以 diff 可读性为先。

### 1.2 使用时机

| 场景 | 是否套用本规范 |
| --- | --- |
| 新建 Go 包或服务 | 必须，从头对齐 |
| 重构既有模块 | 必须，重构范围需满足规范门禁 |
| 一次性运维小工具（`/tmp/*.go`） | 可放宽，涉及复用则必须对齐 |
| 评审第三方/他人代码 | 按规范逐条点评 |

### 1.3 规范与现实的平衡

- 规范优先于个人偏好；`gofmt`/`go vet`/`staticcheck` 能自动判定的用机器门禁，不靠口头争论。
- 热路径允许局部微优化（如避免字符串拼接），但必须注释说明取舍。
- 当某个惯用法在团队代码库中尚无先例时，讨论后写入规范再执行，不临场随意发明规则。

## 2. 环境与工具链

### 2.1 版本基线

- **Go**：`1.21+`，推荐使用最新稳定版（如有 `go.mod` 指向旧版本，需评估升级），用 `mise.toml` 或 `.tool-versions` 锁定。
- **模块管理**：`go.mod` + `go.sum` 提交仓库，全项目统一 `GOPATH` 之外以模块名为根组织。
- **格式化**：`gofmt`（无争议的单一事实），或 `gofumpt`（更严格，需全员一致）。
- **静态检查**：`go vet`（官方）+ `staticcheck`（社区）。
- **测试**：`go test` + 标准 `testing`，覆盖率可选 `go test -cover`。

```bash
# 查看并锁定版本
go version
mise install go@1.22        # 以 mise 管理本机 Go 版本

# 初始化模块
go mod init github.com/team/plutus-orders
go mod tidy
```

### 2.2 go.mod 与依赖纪律

```go
module github.com/team/plutus-orders

go 1.22

require (
    github.com/google/uuid v1.6.0
    golang.org/x/sync v0.7.0
)
```

```bash
# 添加/升级依赖并保持 go.sum 一致
go get github.com/google/uuid@v1.6.0
go mod tidy

# 校验模块依赖完整、无多余项
go mod verify
```

### 2.3 格式化与静态检查

```bash
gofmt -l .              # 列出未格式化的文件（跑通应为空）
go vet ./...            # 官方静态检查，装载到默认规则
staticcheck ./...       # 社区规则，建议 CI 中启用
golangci-lint run ./... # 聚合 lint（可选，需统一配置）
```

> 注意：`gofmt -l .` 输出为空才表示格式正确。凡是改动过的文件，务必先 `gofmt` 再提交。

### 2.4 运行与构建入口

服务入口集中在 `cmd/<name>/main.go`，业务逻辑放在 `internal/` 或包内，`main.go` 尽量薄。

```go
package main

import "fmt"

// main 是进程入口：只做装配与启动，不做业务逻辑。
func main() {
    if err := run(); err != nil {
        fmt.Fprintf(stderrWriter, "fatal: %v\n", err)
        os.Exit(1) // 退出码非 0 标志失败
    }
}
```

## 3. 命名与风格

### 3.1 命名约定表

| 对象 | 约定 | 示例 | 反面示例 |
| --- | --- | --- | --- |
| 包名 | 简短小写单名，无下划线/混合大小写 | `payments` | `payment_service` |
| 导出标识符 | `MixedCaps`，首字母大写 | `CreateInvoice` | `createInvoice`（大写才跨包可见） |
| 未经导出标识符 | `mixedCaps`，首字母小写 | `totalPrice` | `TotalPrice`（会暴露出去） |
| 常量 | `MixedCaps`，包级导出用大写首字母 | `MaxRetry` | `MAX_RETRY`（不按 Go 惯例） |
| 接口 | 单方法以 `er`/`er` 结尾 | `Reader`, `PaymentRPC` | 习惯性加 `I` 前缀（如 `IPayment`) |
| 私有成员 | 首字母小写 | `account.balance` | `account.Balance` |
| 文件包注释 | 以 `Package xxx` 开头 | `Package payments` | 空/无注释 |

### 3.2 正例与反例

```go
package invoices // Package invoices 实现发票领域逻辑。

// MaxBatch 是单次批量提交的最大条数。
const MaxBatch = 100

// Store 抽象发票存取能力，依赖方按需声明。
type Store interface {
    Save(ctx context.Context, inv Invoice) error
    ByID(ctx context.Context, id string) (Invoice, error)
}

type service struct {
    store Store
}

// Pay 将发票标记为已支付；重复支付返回 ErrAlreadyPaid。
func (s *service) Pay(ctx context.Context, id string) (Invoice, error) {
    inv, err := s.store.ByID(ctx, id)
    if err != nil {
        return Invoice{}, err
    }
    if inv.Paid {
        return Invoice{}, ErrAlreadyPaid
    }
    return s.store.Save(ctx, inv.MarkPaid())
}
```

```go
// 反例：错误命名与暴露
package invoice_service   // Bad：包名带下划线
func pay(invoiceId string) int { // Bad：驼峰参数，未导出又含缩写
    return 0 // Bad：返回 int 表达布尔语义，隐晦
}
```

### 3.3 其他风格细节

- 缩写尽量统一：`ID`、`HTTP`、`URL` 在导出标识符里保留大写（`UserID`），避免 `UserId` 混写。
- 变量名保持简短但自解释：循环用 `i`，首字母在短作用域内合理使用（`c` 表示 `client` 需确认上下文）。
- 布尔变量用肯定式命名（`enabled` 而非 `isNotDisabled`）。

## 4. 语法与惯用法

### 4.1 类型、零值与复合字面量

零值即是合理的初始状态。用复合字面量构造，少用 `new` 再逐个赋值。

```go
// 零值可用于 safe default：nil slice、空 struct 即可用
var ids []string           // nil slice，可用 append
m := map[string]int{"a": 1}

// 复合字面量
p := Point{X: 3, Y: 4}     // 注意命名字段，避免位置依赖

// 空 struct 做"标记类型"
type done struct{}
```

### 4.2 集合：切片与 map

遍历、过滤、聚合尽量用声明式思维，但不强求函数式包；直接 `append` 与索引遍历都符合惯用法。

```go
// 就地筛选，复用底层数组
func keepPositive(nums []int) []int {
    out := nums[:0]
    for _, n := range nums {
        if n > 0 {
            out = append(out, n)
        }
    }
    return out
}
```

```go
// map 取值先判断存在，避免把零值当"没有"
if v, ok := m["key"]; ok {
    _ = v // ok 为 true 时才存在
}
```

### 4.3 字符串与 bytes

- 拼接用 `strings.Builder`；非热点可 `+`，但规范禁止在循环里用 `+=` 拼大字符串。
- 二进制处理走 `[]byte`，避免反复 `string([]byte)` 转换。

```go
var b strings.Builder
for _, s := range parts {
    b.WriteString(s)
}
joined := b.String()
```

### 4.4 结构体与对象

- 结构化数据用 struct + 明确字段；可选行为用 method，杜绝"类型开关"。
- 大对象传递给方法时考虑指针，COPY 语义遵守：需要越快拷贝用值，需跨协程共享用指针并保证并发安全（见 §5）。

```go
type Account struct {
    ID      string
    Balance int64 // 用 int64 存分，避免浮点
}

func (a *Account) Deposit(amount int64) {
    a.Balance += amount
}
```

### 4.5 函数、闭包与方法

- 小型函数优先返回值而非副作用；多返回值前一个 error 的最后。
- `defer` 用于回收资源与解锁，遵守"先申请再 defer"的顺序。

```go
func copyFile(src, dst string) (err error) {
    in, err := os.Open(src)
    if err != nil {
        return err
    }
    defer in.Close() // 用完立刻登记释放

    out, err := os.Create(dst)
    if err != nil {
        return err
    }
    defer out.Close()
    _, err = io.Copy(out, in)
    return err
}
```

```go
// 闭包常用于传回调；注意闭包共享变量时的并发问题（见 §7）
ops := []int{1, 2, 3}
total := 0
for _, op := range ops {
    total += op
}
```

### 4.6 模块与导出边界

- 每个包一个清晰职责；依赖方向内聚，避免 `import cycle`（结构性问题，见 §8）。
- 导出符号必须有一行 `// Name ...` 注释，供 `go doc` 使用。

```go
// Package health 提供健康检查与探针处理。
package health
```

## 5. 类型系统与内存

### 5.1 显式类型与零值

- 类型尽量显式且贴切；数值避免 `float` 存金额（用 `int64` 分）。
- 充分利用零值与 `struct{}`，避免无意义的布尔哨兵。

```go
type Amount int64 // 最小货币单位（分）

func (a Amount) EUR() string {
    return fmt.Sprintf("%.2f", float64(a)/100)
}
```

### 5.2 接口隔离与"接受接口/返回实现"

- 对外函数参数写接口（按所需能力），返回具体类型（利于调用方使用和编译器优化）。
- 接口应尽量小：一个方法最理想，多处使用再抽象。

```go
// 接受接口：只声明需要的能力
func SaveAll(ctx context.Context, w io.Writer, items []Item) error {
    for _, it := range items {
        if _, err := w.Write([]byte(it.String())); err != nil {
            return err // 无需知道 w 的具体类型
        }
    }
    return nil
}

// 返回实现：不用接口
func NewRepo(dsn string) *SQLRepo { return &SQLRepo{dsn: dsn} }
```

### 5.3 值语义与指针语义

- 值拷贝安全：struct 不大（如几个标量）用值传递；可变共享数据用指针且在方法上注明并发约束。
- 避免 `sync.Mutex` 副本被复制（`sync` 类型不可复制），始终传指针。

```go
// sync 类型必须通过指针使用，禁止值复制
type cache struct {
    mu   sync.RWMutex
    data map[string]string
}

func (c *cache) Get(k string) string {
    c.mu.RLock()
    defer c.mu.RUnlock()
    return c.data[k]
}
```

### 5.4 内存分配与泄漏

- 大内存一次分配、按需拷贝；警惕 goroutine 泄漏（channel 无接收方时发送阻塞）。
- 用 `for range` 复用，避免每轮新建大结构；热点用 `sync.Pool` 复用对象（仅当 GC 压力明显时）。

```go
// 避免 goroutine 泄漏：确保 channel 关闭或接收方存在
func produce(ctx context.Context, out chan<- int) {
    defer close(out) // 保证消费者能安全退出
    for i := 0; i < 100 && ctx.Err() == nil; i++ {
        select {
        case out <- i:
        case <-ctx.Done():
            return
        }
    }
}
```

## 6. 错误处理

### 6.1 哨兵错误与自定义错误

用 `errors.New`/`fmt.Errorf` 定义包级错误变量，配合 `errors.Is`/`errors.As` 判等与转换。

```go
var ErrNotFound = errors.New("not found")
var ErrAlreadyPaid = errors.New("already paid")

// Is/As 示例
if errors.Is(err, ErrNotFound) {
    // 精确匹配哨兵
}
var target *ValidationError
if errors.As(err, &target) {
    // 取出自定义错误字段
    log.Printf("field=%s msg=%s", target.Field, target.Message)
}
```

### 6.2 用 `%w` 包裹上下文

永远用 `%w` 包裹以便上层 `errors.Is`/`errors.As` 可穿透；不要用 `fmt.Errorf("...: %v", err)` 丢掉包装信息。

```go
func LoadOrder(ctx context.Context, id string) (*Order, error) {
    order, err := store.ByID(ctx, id)
    if err != nil {
        return nil, fmt.Errorf("load order %s: %w", id, err) // 保留链接
    }
    return order, nil
}
```

```go
// 反例：%v 或裸拼会丢掉错误链
// return nil, fmt.Errorf("fail: %v", err)  // 翻阅误读，Is/As 失效
```

### 6.3 错误设计原则

- 只在有能力恢复/改写时才吞错误；可以只做日志但写明原因。
- 多层之间传已包裹的错误，不让调用方收到含糊字符串错误。
- 错误消息用英文小写开头（Go 惯例），参数化而非字符串拼接，便于格式化。

```go
// 允许在边界处转换，但转换必须用 %w 保留语义
if err := s.store.Save(ctx, inv); err != nil {
    return fmt.Errorf("save invoice: %w", err)
}
```

### 6.4 panic 边界

`panic` 仅限程序无法继续的不可恢复错误；库代码禁止 `panic` 处理业务输入，用 error 返回。

```go
func mustConv(s string) int {
    n, err := strconv.Atoi(s)
    if err != nil {
        panic(err) // 仅当输入在调用前已验证时使用
    }
    return n
}
```

## 7. 异步与并发

### 7.1 goroutine 与 channel

- 用 `go func()` 启动协程时，必须给出退出条件与 error 传播路径，避免泄漏。
- 生产者用 `select` + `ctx.Done()` 处理取消；发送前确认消费者仍在。

```go
workers := 4
jobs := make(chan Task, 10)
results := make(chan Result, 10)

for w := 0; w < workers; w++ {
    go func() {
        for j := range jobs {          // channel 关闭即优雅退出
            results <- doWork(j)
        }
    }()
}
close(jobs) // 通知所有 worker 结束
```

### 7.2 context 统一取消与超时

所有会阻塞/跨调用链的函数第一参数是 `context.Context`，用超时或取消控制生命周期。

```go
ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
defer cancel()

resp, err := client.Do(req.WithContext(ctx))
if err != nil {
    return fmt.Errorf("request: %w", err)
}
```

```go
// 在 goroutine 中监听取消，及时清理
go func() {
    select {
    case <-ctx.Done():
        cleanupResources()
    case <-done:
        // 正常完成
    }
}()
```

### 7.3 errgroup 管理并发错误

并发执行一批任务时用 `golang.org/x/sync/errgroup`，首个错误即取消并汇聚。

```go
g, ctx := errgroup.WithContext(ctx)
for _, key := range keys {
    key := key // 捕获循环变量副本（1.22 前必须）
    g.Go(func() error {
        data, err := fetch(ctx, key)
        if err != nil {
            return fmt.Errorf("fetch %s: %w", key, err)
        }
        process(ctx, data) // 需并发安全
        return nil
    })
}
if err := g.Wait(); err != nil {
    return err // 触发跑错分支取消
}
```

```go
// 只同步等待不关心结果时用 WaitGroup；任何情况下 defer wg.Done()
var wg sync.WaitGroup
for _, fn := range fns {
    wg.Add(1)
    go func(f func()) {
        defer wg.Done()
        f()
    }(fn)
}
wg.Wait()
```

### 7.4 并发数据安全

- 共享可变数据必须被 `sync.Mutex`/`sync.RWMutex` 或 channel 保护；绝不裸 map 跨协程写。
- 优先 `sync.Map` 是在"读多写少且 key 稳定"的场景才考虑，否则用 `RWMutex + map`。

```go
// 全部经由结构体内锁访问，杜绝外部直接读 map
func (c *cache) Put(k, v string) {
    c.mu.Lock()
    defer c.mu.Unlock()
    c.data[k] = v
}
```

## 8. 结构与架构

### 8.1 分层与包组织

推荐 layout：`cmd/`（入口）、`internal/`（私有）、包按领域划分。目录树示例：

```text
plutus-orders/
├── cmd/
│   └── server/main.go        # HTTP 服务入口，只做装配
├── internal/
│   ├── order/                # 领域：订单实体与用例
│   │   ├── order.go
│   │   ├── service.go
│   │   └── test/
│   ├── store/                # 端口实现：库存/订单存储
│   │   ├── repo.go
│   │   └── repo_test.go
│   └── transport/            # 传输层：HTTP handler、DTO
│       └── http.go
├── pkg/                      # 可复用性高、需对外导出的功能
│   └── idgen/
├── go.mod
└── go.sum
```

### 8.2 依赖方向与依赖注入

- 依赖方向从上往下：`transport` 依赖 `service`，`service` 依赖 `store` 接口，`store` 实现接口。
- 构造函数注入依赖，`main.go` 负责组装（`wire` 或手写 wiring 均可）。

```go
// 依赖抽象，不是在 struct 里 import 具体仓库
type OrderService struct {
    repo OrderRepo // 抽象接口
}

func NewOrderService(repo OrderRepo) *OrderService {
    return &OrderService{repo: repo}
}
```

### 8.3 状态唯一 owner

状态收敛到单一 owner：一组数据的读写只经一个 repository/service 方法，杜绝多路径直接改全局 map。跨进程状态（DB/缓存）由存储层声明时序与幂等。

```go
// 唯一写路径：所有更新走 Update，不开放对内部字段的直接赋值
func (s *AccountService) Transfer(from, to string, amt int64) error {
    // ... 在事务内完成，保证一致性
    return s.repo.WithTX(func(tx Store) error {
        if err := tx.Debit(from, amt); err != nil {
            return err
        }
        return tx.Credit(to, amt)
    })
}
```

### 8.4 避免循环引用

出现 `import cycle` 说明分层出错：把共享类型抽到独立小包（如 `internal/model`），或把接口放到"使用方所在的包"。

```go
// model 包只放纯类型，避免业务包互相 import
package model // Package model 定义跨层共享的领域类型。
type Order struct{ ID, UserID string }
```

## 9. 构建 / 测试 / 发布

### 9.1 构建命令

```bash
go build ./...            # 校验编译
go vet ./...              # 静态检查
go test ./... -race       # 含竞态检测
go build -o bin/server ./cmd/server
CGO_ENABLED=0 go build -trimpath -ldflags "-s -w" ./cmd/server  # 精简产物
```

### 9.2 测试写法

用表驱动测试与 `t.Run` 子测试；断言尽量直白，覆盖错误分支。

```go
// order_test.go
package order

import "testing"

func TestAmountEUR(t *testing.T) {
    // 表驱动用例
    cases := []struct {
        in   Amount
        want string
    }{
        {12345, "123.45"},
        {0, "0.00"},
    }
    for _, tc := range cases {
        if got := tc.in.EUR(); got != tc.want {
            t.Errorf("Amount(%d).EUR() = %q, want %q", tc.in, got, tc.want)
        }
    }
}
```

```go
// 错误分支用 errors.Is 断言
func TestLoadNotFound(t *testing.T) {
    err := LoadOrder(context.Background(), "missing")
    if !errors.Is(err, ErrNotFound) {
        t.Fatalf("want ErrNotFound, got %v", err)
    }
}
```

### 9.3 Benchmark 与其他

```go
func BenchmarkDeposit(b *testing.B) {
    a := &Account{ID: "1"}
    for i := 0; i < b.N; i++ {
        a.Deposit(100)
    }
}
```

### 9.4 CI 门禁与版本发布

```yaml
# .github/workflows/go.yml —— 最小可落地版本（示意）
name: go-ci
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version-file: go.mod
      - run: gofmt -l .
      - run: go vet ./...
      - run: go test ./... -race -count=1
```

```bash
# 打版本标签并推送（基于 git tag 的语义化版本）
git tag v1.2.0
git push origin v1.2.0
```

- 语义化版本 `MAJOR.MINOR.PATCH`；破坏性 API 变更升 MAJOR。
- 发布前跑完整 `go test ./...` 与 `go vet ./...`。

## 10. 安全与性能要点

### 10.1 注入与不安全输入

- SQL 一律参数化（`$1` 占位），拼接 SQL 属于禁止项。
- 命令执行用 `exec.Command(name, args...)` 的切片形式，禁 `sh -c` 拼接 shell 字符串。

```go
cmd := exec.Command("echo", "-n", userInput) // 不经 shell
out, _ := cmd.Output()
```

```go
// SQL 参数化
rows, err := db.QueryContext(ctx, "SELECT * FROM users WHERE id = $1", id)
if err != nil {
    return nil, fmt.Errorf("query user: %w", err)
}
defer rows.Close()
```

### 10.2 敏感数据与日志

- 密钥从环境变量/密钥管理读取；日志禁止打印 token/password/连接串。
- 默认用 `log/slog` 结构化日志，敏感字段脱敏后输出。

```go
slog.Info("conn",
    "host", cfg.Host,
    "user", cfg.User,
    "password", "***", // 脱敏
)
```

### 10.3 并发性能

- 精确使用 `sync.RWMutex`：读多写少上 RLock，避免无关读被写锁拖慢。
- 避免共享造成伪共享/锁竞争：尽量将写操作限定到单协程或单 owner。
- 批量 I/O 合并；连接池、缓冲池按需运用。

```go
// RWMutex 读写分离
func (c *cache) ReadKeys() []string {
    c.mu.RLock()
    defer c.mu.RUnlock()
    return append([]string(nil), maps.Keys(c.data)...)
}
```

## 11. 常见陷阱与反模式

【陷阱1】在循环里用 `go func(){ ... v ...}()` 捕获循环变量，读到的都是最后一次的值。
修正：立即绑定参数 `go func(v T) { ... }(v)`（Go 1.22 前的正确做法）。

【陷阱2】`defer` 放在耗时函数中间或不用 defer，导致锁未释放/资源泄漏。
修正：申请资源后立刻 `defer`，并把 `defer` 放在函数顶层管理。

【陷阱3】用 `fmt.Errorf("...: %v", err)` 而非 `%w`，丢失 `errors.Is/As` 能力。
修正：一律 `%w` 包裹（见 §6.2）。

【陷阱4】`map` 在多协程中并发写，产生 fatal 竞态/崩溃。
修正：用 `sync.RWMutex`/`sync.Map`/channel 保护（见 §7.4）。

【陷阱5】goroutine 启动后无退出条件，造成泄漏并拖垮内存。
修正：给每个 goroutine 明确的结束路径，结合 `ctx.Done()`（见 §7.1）。

【陷阱6】对 `nil` 接口接受后立即使用，或忽略错误再 panic。
修正：返回 error，调用方 `if err != nil` 早退；不掩盖 nil。

【陷阱7】`type MyString string` 与 `string` 互相赋值报编译错误。
修正：显式转换 `string(s)`；善用类型别名但要知区别。

【陷阱8】复制 `sync.Mutex`/`sync.Once`（值拷贝），锁失效且不可预测。
修正：恒以 `*sync.Mutex` 指针持有（见 §5.3）。

【陷阱9】在内部层对错误 `fmt.Errorf` 二次包裹却忘了 `%w`，传递链路断。
修正：所有包边界保留 `%w`，只在真正需要时新增语义。

【陷阱10】把 error 当作 bool 使用：`if err` 配合后续无视 nil 状态。
修正：`if err != nil { return ... }` 早退，nil 分支明确处理成功路径。

【陷阱11】用 `float64` 存金额做加减。
修正：用 `int64` 最小单位或 `math/big`（见 §5.1）。

【陷阱12】`select` 里不加 `default`/`ctx.Done()` 造成无限阻塞或忙等。
修正：非阻塞场景用 `default`，语义清晰加超时分支。

【陷阱13】接口定义在实现包造成依赖倒置混乱。
修正：接口定义在使用方；实现包导出具体类型（见 §5.2）。

【陷阱14】`for i := range 10` 在模块内隐藏压缩 deprecation，需 Go 版本升。
修正：明确 `for i := 0; i < 10; i++` 或用 range 语义处注明。

【陷阱15】`defer` 在循环内执行导致延迟释放大量句柄直到函数结束。
修正：把资源申请/释放封装成独立小函数，循环外调。

【陷阱16】日志直接打印整个 struct，泄漏内嵌敏感字段。
修正：实现 `String()` 脱敏，或用 `slog` 逐字段输出。

【陷阱17】event-driven 里大量 `go` 启动协程却无数量上限，耗尽资源。
修正：用有缓冲 channel + 固定 worker 池做并发上限（见 §7.1）。

【陷阱18】`defer` 求值时机误用：`defer f(i)` 在注册时取值。
修正：需要延迟取值用 `defer func(){ f(i) }()` 或确保意图。

## 12. 自查检查清单

- [ ] `go.mod` 中 `go` 版本符合团队基线，`go.sum` 完整并提交。
- [ ] `gofmt -l .` 输出为空（格式统一）。
- [ ] `go vet ./...` 无告警。
- [ ] `staticcheck ./...` 启用且关键规则无违规。
- [ ] 所有导出类型/函数/变量都有 `// Name ...` 注释。
- [ ] 包名简短小写，无下划线/混合大小写；包注释已写。
- [ ] 标识符命名符合 §3.1 命名表，无缩写混写（`UserID` 而非 `UserId`）。
- [ ] 金额、ID 等类型使用精确类型，未用 `float64` 存金额。
- [ ] 接口定义在使用方，接受接口/返回实现（§5.2）。
- [ ] 错误全部用 `fmt.Errorf(... %w)` 包裹，未用 `%v` 丢弃链接。
- [ ] 哨兵错误定义清晰，判等用 `errors.Is`/`errors.As`。
- [ ] 没有裸 `panic` 处理业务输入；panic 仅限不可恢复。
- [ ] 每个 goroutine 有明确退出路径，未启动无界并发，未泄漏。
- [ ] 使用 `context` 传递超时/取消，阻塞调用首参为 `context.Context`。
- [ ] 并发共享数据受到 `sync` 保护，无并发写 `map`。
- [ ] `errgroup`/`WaitGroup` 正确使用，`WaitGroup` 有 `defer Done()`。
- [ ] SQL 全参数化，`exec.Command` 走切片不经 shell。
- [ ] 日志未打印敏感字段，`slog` 单独输出脱敏字段。
- [ ] 包结构遵循 §8.1 分层，无 `import cycle`，状态有唯一 owner。
- [ ] `go build ./...` 与 `go test ./... -race` 通过，发布走 git tag 语义化版本。

## 13. 参考资料

- [Effective Go](https://go.dev/doc/effective_go)：惯用法权威指南。
- [Go Code Review Comments](https://github.com/golang/go/wiki/CodeReviewComments)：评审常见要点。
- [golang.org/x/sync/errgroup](https://pkg.go.dev/golang.org/x/sync/errgroup)：并发错误汇聚。
- [go vet](https://pkg.go.dev/cmd/vet)：官方静态检查。
- [staticcheck](https://staticcheck.io/)：社区增强检查。
- [The Go Blog - strings.Builder & errors.Is](https://go.dev/blog/)：`errors` 与现代用法说明。