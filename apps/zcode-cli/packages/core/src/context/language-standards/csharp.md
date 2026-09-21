# C# 编码规范

> 本规范适用于使用 .NET 8+ 与 C# 12+ 开发的 C# 代码库(Web API、后台服务、桌面/移动客户端与共享类库)。目标是写出安全(尤其 nullable 与 async)、可预测、可测、性能可控的代码,同时充分运用 record、属性模式、DI 与 LINQ 等现代语言能力。规范默认以 `net8.0` 为目标框架,标注 `C# 12` 的特性仅在你明确以 `LangVersion` 启用时使用。

## 1. 概述与使用时机

### 1.1 使用时机
- 当新增、修改或评审面向业务逻辑、数据访问、HTTP 接口、消息处理以及共享类库的 C# 代码时,依据本规范执行。
- 本规范覆盖目标框架与工程配置、命名风格、语法惯用法、类型系统、异常处理、异步并发、架构分层、构建测试、安全性能与反模式。
- 不适用于必须保持低层互操作的 P/Invoke 封装(该类代码仍需遵循 IDisposable 清理规则)。

### 1.2 设计目标
- 优先级:可读与正确性 > 可维护性 > 吞吐。性能优化以 Profiler 数据为准。
- 默认不可变、值语义与不可空:用 `record`、`required`、nullable 上下文让编译器帮你捕获空引用。
- 异步 I/O 贯穿始终,避免 `.Result` 与 `.Wait()` 阻塞调用栈,防止死锁与线程池饥饿。

### 1.3 适用范围边界
- 进程/服务边界使用稳定的契约(DTO + 版本化接口),内部调用才直接方法调用。
- 对公共 API 的破坏性变更必须与版本化发布协调,遵守 SemVer。

## 2. 环境与工具链

### 2.1 SDK 与目标框架
- 统一 .NET SDK 8.0(或 9+,以仓库 `global.json` 为准);除非跨项目必须,不混用多版本运行库。

### 2.2 工程属性示例(csproj)
```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <LangVersion>12</LangVersion>
    <TreatWarningsAsErrors>true</TreatWarningsAsErrors>
    <AnalysisLevel>latest</AnalysisLevel>
    <Deterministic>true</Deterministic>
  </PropertyGroup>
</Project>
```

### 2.3 NuGet 依赖
- 使用 `PackageReference`,版本固定到具体小版本并启用 `Central Package Management(CPM)` 集中管理依赖版本:
```xml
<PackageReference Include="Microsoft.Extensions.DependencyInjection.Abstractions" Version="8.0.1" />
```
- 锁定版本身通过 `dotnet restore --locked-mode` 在 CI 中强制一致。

### 2.4 静态分析与格式化
- 启用 `AnalysisLevel=latest` 与内置分析器;系统化启用 `Microsoft.CodeAnalysis.BannedApiAnalyzers` 阻断非法 API(如禁止阻塞的异步绕行)。
- 使用 `.editorconfig` 统一风格并在 IDE 与 CI 中共同生效:
```ini
root = true

[*.cs]
indent_style = space
indent_size = 4
csharp_style_namespace_declarations = file_scoped:suggestion
dotnet_style_prefer_readonly_fields = true:suggestion
```

### 2.5 测试入口
- 单测用 xUnit;每测试方法完全独立且命名描述行为:主语 + 行为 + 期望。

```csharp
[Fact]
public void Withdraw_WhenInsufficientFunds_Throws()
{
    var account = new Account(balance: 10m);
    Assert.Throws<InsufficientFundsException>(() => account.Withdraw(50m));
}
```

## 3. 命名与风格

### 3.1 命名约定
| 类别            | 规则               | 示例                        |
| --------------- | ------------------ | --------------------------- |
| 命名空间        | PascalCase         | `namespace Billing.Core`    |
| 类型/类/接口/枚举 | PascalCase         | `class InvoiceService`      |
| 接口            | 前缀 `I` + Pascal   | `interface IRepository<T>`  |
| 方法            | PascalCase         | `GetOrderById()`            |
| 公有字段(尽量无) | PascalCase          | `public int Count;`         |
| 私有字段        | 小驼峰             | `private int _count;`       |
| 局部变量        | 小驼峰             | `var orderId;`              |
| 常量            | PascalCase         | `const int MaxRetries = 3;` |
| 私有只读字段    | 小驼峰前缀 `_`      | `private readonly Logger _log;` |
| 记录参数        | 小驼峰             | `record Point(int X, int Y);` |

### 3.2 正反例
```csharp
// 反例:命名混乱、缺失 nullable、可变集合暴露
public class order_Service {
    public List<string> items = new();          // 公有可变字段,封装破坏
}
// 修正
public sealed class OrderService {
    private readonly IReadOnlyList<string> _items;      // 不可变只读暴露
    public OrderService(string name) { }                 // 显式构造注入
}
```

### 3.3 私有成员风格
- 字段命名 `_camelCase`,方法局部 `camelCase`,避免两者混淆。

## 4. 语法与惯用法

### 4.1 记录类型(record)
- 用于数据传输、相等性按值比较、不可变快照;避免可变领域实体滥用。
```csharp
public sealed record UserDto(int Id, string Name, string Email);

var a = new UserDto(1, "alice", "a@x.io");
var b = new UserDto(1, "alice", "a@x.io");
Console.WriteLine(a == b);        // True:值相等
var updated = b with { Email = "new@x.io" };   // 非变异更新
```

### 4.2 模式匹配
- 用属性模式与 discard 取代冗长的类型判断与嵌套 if。
```csharp
return order.Status switch {
    OrderStatus.Paid when order.Total > 1000m => Discount.High,
    OrderStatus.Paid => Discount.Standard,
    _ => Discount.None                    // discard 兜底,保证穷尽
};
```

### 4.3 集合与 LINQ
- 优先 `IReadOnlyList<T>` / `IReadOnlyDictionary<K,V>` 暴露只读集合;循环用 `foreach`。
- 简单映射/过滤用 LINQ,但避免长链式组合伤害可读性(超 4 个操作符时拆拆分成具名方法)。
```csharp
var names = users
    .Where(u => u.IsActive)
    .OrderBy(u => u.Name)
    .Select(u => u.FullName)
    .Take(10)
    .ToArray();                       // 单一查询一次物化
```
- 集合成员判定用 `HashSet<T>` 而不是 `List<T>.Contains`,避免 O(n) 线性查找。

### 4.4 字符串
- 使用插值字符串 `$""`,读文本用原始字符串字面量(C# 11)。
- 大量重复小段拼接在热循环中仍使用 `StringBuilder`。
```csharp
var msg = $"Invoice {id} total {total:c}";             // 插值优先
var doc = """                                     // 原始字符串:无转义
  {
    "name": "x"
  }
  """;

var sb = new StringBuilder();
foreach (var line in lines) sb.Append(line).Append('\n');
```

### 4.5 属性初始化与 required
- 字段/属性默认在声明处初始化;要求构造方必须提供的用 `required` + 构造函数。
```csharp
public sealed class ServerConfig {
    public required string Host { get; init; }   // 必填,编译期强制
    public int Port { get; init; } = 8080;       // 可选,带默认值
}
```

### 4.6 属性参数 null 守卫
- 正态数据使用布尔的 LINQ 链式遍历很常见,但频繁非空可读性考虑——亦可使用 SAM 行为利器(略)。
- 参数反射据实提供非空校验,简单情形用 `ArgumentNullException.ThrowIfNull`:
```csharp
void Send(Message m) {
    ArgumentNullException.ThrowIfNull(m);     // 简洁的非空守卫
    // ...
}
```

## 5. 类型系统与内存

### 5.1 nullable 与空安全
- 全程开启 `<Nullable>enable</Nullable>`;引用类型分三种表达:可空 `?` / 非空 / 不可达。
- 禁止用空字符串或 `"NA"` 表示缺失,使用 `string?`。
```csharp
string? FindNickname(User u) => u.Nickname;   // 存在为用户提供昵称的可能
string title = FindNickname(u) ?? "Guest";    // null 合并给出回退
```

### 5.2 值与引用类型、record struct
- DTO/坐标/数量用小而不可变的值类型;需要按值相等的小对象用 `readonly record struct`。
```csharp
public readonly record struct Money(decimal Amount, string Currency);   // 值语义
Money price = new(19.99m, "USD");
```

### 5.3 不可变与防御性复制
- 集合字段返回 `IReadOnlyList<T>`;需要可变内部,对外提供快照。
```csharp
public IReadOnlyList<string> Tags => _tags.ToArray();   // 防御性复制,防外部篡改
```

### 5.4 显式释放与 using
- 持有非托管资源(文件、连接、Socket、CancellationTokenSource)实现 `IDisposable` 并直接用 `using` / `await using`。
```csharp
// C# 8+ using 声明:作用域结束自动释放
using var stream = File.OpenRead(path);
// 或 using 语句块
using (var client = new HttpClient()) {
    // ...
}
```

### 5.5 避免过度装箱与分配
- 频繁的点在值类型上用 `List<T>`、`ArrayPool<T>` 减少分配;布局注意装箱。

## 6. 错误处理

### 6.1 异常策略
- 业务可预期分支用异常也应克制;更倾向返回 `Try` 模式与 `Result` 值对象表达失败。
- 异常用于真正的异常情况:参数非法、资源不可得、前置条件破坏。
- 尽量抛有意义的标准异常并携带可诊断信息。

### 6.2 Try 模式与 Result
```csharp
public static bool TryParsePort(string s, out int port) {
    if (int.TryParse(s, out var p) && p is > 0 and <= 65535) {
        port = p;
        return true;
    }
    port = default;
    return false;
}

// 使用
if (TryParsePort(raw, out var port)) {
    Start(port);
} else {
    Ignore();
}
```

### 6.3 异常粒度:不要吞掉且不要滥用 catch
```csharp
try {
    await SaveAsync(data);
} catch (DbUnavailableException ex) {
    _log.Error(ex, "save failed");        // 记日志至少要入上下文
    throw new HandledRetryable(ex.Message);  // 或包装为上层可处理类型
}
```
- 空 catch 吞异常必须禁止;无法处理时允许抛回。

### 6.4 返回对象的失败即 Result 设计
```csharp
public sealed record Result
{
    public bool IsSuccess { get; init; }
    public string? Error { get; init; }
    public static Result Ok() => new() { IsSuccess = true };
    public static Result Fail(string error) => new() { IsSuccess = false, Error = error };
}
```

## 7. 异步与并发

### 7.1 async/await 基本约定
- I/O 边界一律 async,不要 `.Result` / `.Wait()`。
- 方法命名以 `Async` 结尾;测试用 `async Task` 而非 `async void`(事件处理除外)。
```csharp
public async Task<int> LoadAsync() {
    var data = await _repo.FetchAsync();
    return data.Count;
}
```

### 7.2 并发安全集合与阻塞避免
- 需要进程内共享可变状态时使用 `ConcurrentDictionary<TKey,TValue>` 或 `lock` 保护。
- 避免在 async 代码中 `lock(this)`;需要异步互斥用 SemaphoreSlim + await。

```csharp
private readonly ConcurrentDictionary<string, int> _counts = new();

public void Inc(string key) => _counts.AddOrUpdate(key, 1, (_, old) => old + 1);
```

### 7.3 任务取消
- 所有可长时间运行或循环的方法应接受并检查 `CancellationToken` 并转发到内部调用。
```csharp
public async Task PollAsync(CancellationToken ct) {
    while (!ct.IsCancellationRequested) {
        ct.ThrowIfCancellationRequested();     // 协作式取消输入
        var item = await ReadAsync(ct);        // 向前传播
        await Task.Delay(500, ct);             // 可取消延迟
    }
}
```

### 7.4 避免线程池饥饿
- 不要用阻塞式 `Task.Run(...).Result`;顶层入口统一用 `await` 驱动完成一路 async 含 service 入口。

### 7.5 并行计算(数据并行)
- 无依赖的 CPU 密集循环用 `Parallel.ForEach`/`PLINQ`,I/O 密集用 `Task.WhenAll` 分组控并发。

```csharp
var r = await Task.WhenAll(items.Select(ProcessItemAsync));  // 并发 I/O
// 有界并发推荐 Chunk 或用 Parallel.ForEachAsync
```

### 7.6 ConfigureAwait
- 类库代码统一用 `ConfigureAwait(false)` 避免回到同步上下文;UI 层保留默认上下文。

## 8. 结构与架构

### 8.1 分层与依赖方向
- 依赖只允许指向内部:Presentation → Application → Domain → Infrastructure,禁止反向或循环依赖。
- 领域逻辑不直接依赖具体 DB/HTTP 实现,而是依赖抽象接口。

### 8.2 目录树示例
```
src/
├── Domain/          # 实体、值对象、领域规则(零依赖)
├── Application/     # 用例、DTO、服务边界
├── Infrastructure/  # EF/Redis/Http 客户端实现
└── Host/            # ASP.NET 或 Worker 装配与 DI
```

### 8.3 命名空间与程序集
- 命名空间与文件夹一一对应,文件作用域命名空间(`namespace X;`)。
- 程序集按边界拆分(Domain/Application/Infrastructure 各自独立 csproj),控制反向依赖。

### 8.4 依赖注入(DI)
- 通过构造函数注入依赖;生命周期显式声明(Singleton/Scoped/Transient),可测性依赖抽象。
```csharp
public class CreateOrderHandler {
    private readonly IOrderRepo _repo;            // 抽象注入
    public CreateOrderHandler(IOrderRepo repo) => _repo = repo;
}
```

### 8.5 状态唯一 owner
- 一个状态只允许唯一 owner 变更;DTO 传递时不共享可变实例写通路。
- 长期状态持久化与缓存路径区分,避免双写不一致。

## 9. 构建 / 测试 / 发布

### 9.1 构建与还原
```bash
dotnet restore --locked-mode
dotnet build -c Release --no-restore
dotnet test -c Release --no-build
dotnet publish ./src/Host -c Release -o ./artifacts
```

### 9.2 测试写法(xUnit)
- 每个事实方法独立可运行,数据驱动用 `[Theory]/[InlineData]`。
```csharp
[Theory]
[InlineData("8080", true)]
[InlineData("nope", false)]
public void TryParsePort_GivenInput_ReturnsExpected(string s, bool expected)
{
    Assert.Equal(expected, TryParsePort(s, out _));
}
```

### 9.3 CI 流水线(GitHub Actions + .NET)
```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/setup-dotnet@v4
        with: { dotnet-version: '8.0.x' }
      - run: dotnet restore --locked-mode
      - run: dotnet build -c Release --no-restore
      - run: dotnet test -c Release --no-build
```

### 9.4 发布与版本
- 版本号来自 Git tag(`GitVersion`);产物经矩阵发布,面向 net8.0 的 NuGet 包用 `PackageVersion` 锁定。
- 运行期可迭代表使用配置文件中心化,不硬编码在代码中。

## 10. 安全与性能要点

### 10.1 空引用与解引用
- nullable 开启后,确保调用前已判空或使用便捷算符;警惕反序列化、外部输入产生 null。
```csharp
string? name = ExternalValue();
if (name is not null) {
    Use(name);                 // 编译器确认可达即安全
}
```

### 10.2 资源释放与泄漏
- 所有一次性对象用 `using`/`await using`;长生命周期持有 `CancellationTokenSource` 记得 `Dispose`。
- 大对象(如图像、缓冲)及时释放以防内存不回收(GC 压力 / LOH 碎片)。

### 10.3 异常安全与事务
- 写入 DB 用事务;异常时回滚,不留半态。
- 幂等键防止重复提交流入重复副作用。

### 10.4 边界与输入校验
- 对比例、长度、索引、枚举值做显式校验(用范围模式与 `ArgumentOutOfRangeException`)。
```csharp
if (pageSize is < 1 or > 100) {
    throw new ArgumentOutOfRangeException(nameof(pageSize), "range 1..100");
}
```

### 10.5 性能要点
- 热路径避免 LINQ 的宏分配,用显式循环或 `ArrayPool<T>`。
- 使用 `ReadOnlySpan<char>`/`Span<T>` 处理字节与字符串切片减少复制。
- 缓存不可变计算结果;容器读取只读暴露。

## 11. 常见陷阱与反模式

### 11.1 async 阻塞死锁
在 UI/ASP.NET 同步上下文上用 `.Result`/`.Wait()` 阻塞一个 async 方法可致死锁。
```csharp
// 反例
var v = GetAsync().Result;                  // 可能死锁
// 修正:调用链保持 async/await
var v = await GetAsync();
```

### 11.2 async void 异常不传播
`async void` 异常进入同步上下文而非调用方,难以捕获。
```csharp
// 反例
async void OnClick() { await LoadAsync(); }  // 仅事件可使用
// 修正:返回 Task,常规调用点 await
```

### 11.3 集合返回集合迭代器重复物化
```csharp
// 反例:linq 惰性被多次枚举
IEnumerable<int> q = Enumerable.Range(0,3);
int sum1 = q.Sum(); int sum2 = q.Sum();     // 每次重新执行源
// 修正:惰性源一次性物化为数组/列表
int[] arr = q.ToArray();
```

### 11.4 可变共享集合导致并发异常
```csharp
// 反例
private readonly List<string> _list = new();
// 在被并发修改时 foreach 抛 InvalidOperationException
// 修正:改用 ConcurrentDictionary、加锁 或 返回副本
```

### 11.5 捕获循环变量 / 延迟执行闭包
```csharp
// 反例
var fs = Enumerable.Range(0,3).Select(i => () => i);   // 全部收到 3
var xx = Enumerable.Range(0,3).Select(i => { var k = i; return () => k; }).Select(f=>f());
// 修正:在循环内复制一份局部变量
foreach (var i in Enumerable.Range(0,3)) { var copy = i; /* 使用 copy */ }
```

### 11.6 DLINQ 谓词执行意外的副作用
不要在 where 中做副作用或昂贵计算;应先在变量中算好再引用。

### 11.7 忽略 CancellationToken
长循环不理会取消导致取消无效、资源不释放。
```csharp
// 修正:循环头部检查 ct.IsCancellationRequested / ThrowIfCancellationRequested
```

### 11.8 阻塞线程池(CPU 密集包在 async)
```csharp
// 反例:在 async 里做巨大同步 CPU 计算并阻塞线程
// 修正:Task.Run 或转移到专用工作线程,保留 UI/请求线程
```

### 11.9 过度 LINQ 长链
一行超过 4 个操作符降低可读性。
```csharp
// 修正:拆成具名中间变量或局部函数,每段表达单一意图
```

### 11.10 使用 `List<T>` 广覆盖但用 `Contains` 磨 O(n)
```csharp
// 反例
if (names.Contains(target)) {}     // O(n) 每次
// 修正:预处理为 HashSet<string> 后 Contains 为 O(1)
```

### 11.11 字符串 + 循环性能議案
```csharp
// 反例(热路径)
string s = "";
foreach (var p in parts) s += p;     // O(n²) 拷贝
// 修正:StringBuilder
```

### 11.12 忘记 Dispose CancellationTokenSource / Timer
事件与定时器泄漏导致宿主无法回收。
```csharp
// 修正:using 或显式 Dispose;定时器结束解绑事件
```

### 11.13 异常吞干净空 catch
```csharp
// 反例
try { Do(); } catch (Exception) { }   // 什么都吞,排查困难
// 修正:记录日志与上下文,除非确实需要对调用者静默
```

### 11.14 反序列化契约不校验
接受外部 JSON/Schema 未做基本校验即使用,导致 null 传播或注入。
```csharp
// 修正:反序列化为 nullable 后统一校验/净化再进入业务逻辑
```

### 11.15 构造中做 I/O 或长耗时
```csharp
// 反例(string):构造函数去访问 DB   → 不可测、慢、延迟依赖
// 修正:构造只赋值,领域加载放独立异步方法
```

### 11.16 可变 DTO 到处传写
共享 `class` 被多方修改造成隐蔽状态竞争。
```csharp
// 修正:用 immutable record + with 产生新实例传递
```

## 12. 自查检查清单

- [ ] 已开启 `<Nullable>enable</Nullable>` 且无未处理可空告警。
- [ ] 已开启 `<TreatWarningsAsErrors>true</TreatWarningsAsErrors>` 并通过分析器。
- [ ] 构造函数注入依赖,无在类内部 `new` 具体服务(Service Locator 反模式)。
- [ ] I/O 一律 async/await,无 `.Result`/`.Wait()` 阻塞。
- [ ] 所有可取消操作接受 `CancellationToken` 并向前传播。
- [ ] 持有非托管资源的类型实现 `IDisposable` 并用 `using`。
- [ ] 对外暴露集合为 `IReadOnly*` 或返回副本,无可变共享泄漏。
- [ ] DTO 用 `record`,较少依赖可变字段四处传写。
- [ ] 命名遵循表:类 PascalCase、私有字段 `_camelCase`、接口前缀 `I`。
- [ ] 异常有上下文,无空 catch 吞异常。
- [ ] 错误失败用 Try/Result,不滥抛可预期的普通返回点。
- [ ] LINQ 链不超过约 4 操作符且无副作用。
- [ ] 热循环用 `StringBuilder` 与 `ArrayPool<T>` 控分配。
- [ ] 集合成员判定用 `HashSet<T>`。
- [ ] 外部输入先校验再进入业务(长度/范围/枚举)。
- [ ] 数据库写入用事务与幂等键。
- [ ] 依赖方向:Presentation→Application→Domain→Infrastructure,无循环。
- [ ] 每个测试独立、行为化命名,`[Theory]` 覆盖边界。
- [ ] 配置集中化,无硬编码魔数与地址。
- [ ] 已执行 `dotnet build -c Release` 与 `dotnet test` 且通过。

## 13. 参考资料
- Microsoft Learn:C# 语言文档与 .NET API。
- 《Clean Code》/《Clean Architecture》(Robert C. Martin)分层与命名。
- 《C# in Depth》(Jon Skeet,现代语言特性)。
- 《Effective C#》(Bill Wagner,null、async、LINQ、性能)。
- MS Learn: async/await 深度、可空引用类型、依赖注入规范。