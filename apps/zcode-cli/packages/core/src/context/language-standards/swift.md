# Swift 编码规范
> 本规范适用于以 Swift 6 为主要语言开发的 macOS / iOS / iPadOS / watchOS / tvOS 以及 Linux 服务端(SwiftNIO、Vapor)的工程。
> 全文以 Apple「Swift Programming Language」官方文档与 Swift API Design Guidelines 的推荐约定为基础，结合主流团队工程实践整理而成。
> 规范强调值语义、Optional 安全、结构化并发与 actor 隔离，重点解决团队协作中最常见的编译器警告、数据竞争和可维护性问题。
> 若项目仅使用 Xcode 且无服务器端代码，本规范第 2、9 章中与 SwiftPM 及 Linux 相关条目可放宽，但仍须保持命名与结构约定一致。

## 1. 概述与使用时机

本章明确本规范在何种场景、对何种代码生效,避免无差别套用导致工具链与团队实际不一致。

- 当仓库新增或修改 `.swift` 源码文件时,文件内容须符合本规范;既有文件在不破坏行为的前提下优先按本规范重构命名与并发模型。
- 本规范的核心价值:让代码以值语义与结构化并发组织,从而把崩溃、数据竞争与 retain cycle 尽可能地转化为编译期错误。
- 适用对象包括但不限于:App 客户端(UIKit/SwiftUI)、框架库(target 被多个宿主引用)、SwiftPM 包以及 Linux 服务端模块。
- 下列情况可部分放宽:`#if DEBUG` 中的调试辅助代码、一次性脚本(target 未进入上游产物)、对第三方 SDK 最小桥接层。
- 若无法满足某一强制项(如受系统框架约束必须用隐式解包),应在代码注释中写明原因,而不是静默绕过。

## 2. 环境与工具链

### 2.1 编译语言模式与工具版本
- 以 Swift 6 语言模式为主,工具链引用使用最新稳定版 Xcode 16+ 与 Swift 6.0 编译器;Linux 服务端使用 Swift 官方 Swift.org 工具链。
- Swift 6 对并发检查默认开启 Strict Concurrency,迁移既有工程时应按模块逐步开启严格检查开关,避免一次性大量报错堆积。
- 建议在 `.swift-version` 文件中固定语言版本,并在 `Package.swift` 中通过 `swift-tools-version` 声明工具链版本。

```swift
// swift-tools-version:6.0
import PackageDescription

let package = Package(
    name: "AppServices",
    platforms: [.macOS(.v14), .iOS(.v17)],
    products: [
        .library(name: "AppServices", targets: ["AppServices"]),
    ],
    dependencies: [
        // 显式锁定依赖版本范围,禁止使用未固定版本的远程依赖
        .package(url: "https://github.com/apple/swift-nio.git", from: "2.70.0"),
    ],
    targets: [
        .target(
            name: "AppServices",
            swiftSettings: [
                // 把并发严格检查当作错误处理,而不是忽略
                .enableUpcomingFeature("StrictConcurrency"),
                .unsafeFlags(["-warn-concurrency"], .when(configuration: .debug)),
            ]
        ),
        .testTarget(name: "AppServicesTests", dependencies: ["AppServices"]),
    ]
)
```

### 2.2 格式化与静态检查
- 统一使用 `swift-format` 进行格式检查,并接入 pre-commit 钩子或 CI 门禁,确保 `swift-format` 输出与代码库一致。
- `swift-format` 的 `.swift-format` 配置文件提交到仓库根目录,保证所有开发者与 CI 使用同一套规则。

```json
// .swift-format 配置文件示例
{
  "indentation": { "spaces": 2 },
  "lineLength": 120,
  "rules": {
    "AllPublicDeclarationsHaveDocumentation": false,
    "AlwaysUseLowerCamelCase": true,
    "DeprecatedSelf": true,
    "DontRepeatTypeInStaticProperties": true,
    "EmptyCollectionLiteral": true,
    "EquivalentTypesInConditionalOperator": true,
    "NoAccessLevelOnExtensionDeclaration": true
  },
  "spacesAroundRangeFormationOperators": true
}
```
- 对既有代码,可先通过 `SWIFT_EMIT_ENFORCING_EXPLICIT_IMPORTS` 与 `-warn-concurrency` 收集问题,再分批修整;新代码必须一次通过。

### 2.3 常用命令行
```bash
# 格式化单个文件(带 --in-place 才会写回磁盘)
swift-format format --in-place Sources/AppServices/UserRepository.swift

# 输出 lint 诊断而不修改文件
swift-format lint Sources/AppServices/UserRepository.swift

# 构建与测试 SwiftPM 工程
swift build
swift test --sanitize=address --sanitize=thread

# 打开 Xcode 工程(或使用 swift package generate-xcodeproj 生成旧格式工程)
open Package.swift
```

### 2.4 测试框架
- 单元测试统一使用 `XCTest`;服务端模块可视情况引入 `swift-testing`,但同一目标内只选一种框架,避免重复写法。
- 每个 `.swift` 源码对应一个或多个 `XxxTests.swift` 测试文件,测试方法以 `test...` 开头,命名侧重被测行为而非实现内部。

## 3. 命名与风格

### 3.1 命名约定总表

| 类别 | 约定 | 示例 |
| --- | --- | --- |
| 类型(类、结构体、枚举、协议、actor、类型别名) | UpperCamelCase | `User`, `HTTPClient`, `ShippingAddress` |
| 变量、常量、函数、方法、属性、case | lowerCamelCase | `userName`, `didReceiveMemoryWarning()` |
| 初始化器 | 以 `init` 开头或泛型参数描述性命名 | `User(name:)` |
| 布尔属性/方法 | 以 `is` / `has` 等前缀表达判断语义 | `isEmpty`, `hasAttachments` |
| 协议 | UpperCamelCase,按能力或角色命名,可加 `ing` 后缀以区别类型 | `Sendable`, `MyProtocol` |
| 类型用于协议复数时不加 `Protocol` 后缀 | 直接使用类型名 | `Collection`, `Sequence` |
| 静态工厂/构造 | 使用名词来描述返回值 | `Color.systemBlue` |
| 全局常量 | 中文团队内可接受 `static let` 放在类型内 | `HTTPStatus.ok` |
| Foundation/UIKit 互操作类型 | 避免在桥接时改变大小写 | `URL`, `DispatchQueue` |
| 缩写 | 大写拼写,除非首字母单词 | `ID`, `URLString`, `apiClient` |

### 3.2 反例对照
```swift
// 反例:命名不明、缩写随意、布尔命名非判断性
let usrNm = "tom"                          // 应写作 let userName = "tom"
var ishown = false                         // 应写作 var isHidden = false
func GetDataFromServer() {}                // 函数应小写开头:func fetchData()
class NetworkHelperClass {}                // 不要重复类型单词:class NetworkHelper

// 正例
let userName: String = "tom"
var isHidden: Bool = false
func fetchProfile() async throws -> Profile { ... }
protocol ProfileFetching: Sendable { ... }
enum HTTPStatus: Int { case ok = 200, notFound = 404 }
```

## 4. 语法与惯用法

### 4.1 类型与类型别名
- 优先使用 Swift 原生类型,避免为可读性引入无意义的别名;仅在跨层边界为协议契约时使用 `typealias` 收敛复杂度。
- 使用字节语义时使用 `UInt8`/`Int`,避免无符号整数的边界溢出思维混淆。

```swift
typealias AccountID = String // 仅在协议契约处收敛,不滥用
struct Session {
    let id: AccountID
}
```

### 4.2 集合
- 使用泛型集合类型、`lazy` 惰性序列、`map`/`filter`/`reduce` 组合式处理,避免手写索引循环。
- 集合判空使用 `isEmpty`,不要比较 `count == 0`。

```swift
let numbers = [1, 2, 3, 4, 5]

// 正例:函数式组合
let evenSquares = numbers
    .filter { $0.isMultiple(of: 2) }
    .map { $0 * $0 }

// 反例:手写索引循环,易越界且可读性差
var result: [Int] = []
for i in 0..<numbers.count where numbers[i].isMultiple(of: 2) {
    result.append(numbers[i] * numbers[i])
}
```

### 4.3 字符串与本地化
- 使用 `String` 值类型,拼接采用字符串插值 `\(...)`;格式化本地化文案交给人机可读资源而非硬编码拼接。
- 避免对 UTF-8 数据反复转换;使用 `String(contentsOf:)` 或 `Data` 加解码一次性完成。

```swift
let greeting = "你好, \(userName),你有 \(count) 条未读消息"

// 多行字符串保留缩进与换行
let query = """
    SELECT id, title FROM articles
    WHERE deleted_at IS NULL
    ORDER BY published_at DESC
    """

// 本地化:优先使用 Localizable.xcstrings 而非硬编码文案
let title = String(localized: "common.error")
```

### 4.4 结构体、类、枚举
- 轻量、值传递、无继承需求的数据使用 `struct`;需要引用语义、对象生命周期或继承层次时使用 `class`。
- 只有一组成员身份的离散状态使用枚举,枚举携带关联值时配合 `switch` 穷尽处理。

```swift
struct Coordinate: Equatable {
    var x: Double
    var y: Double
}

enum UserRole {
    case admin, member, guest
}

// 关联值 + 模式匹配
enum LoadState<Value> {
    case idle
    case loading
    case loaded(Value)
    case failed(Error)
}
```

### 4.5 协议
- 协议是类型间的抽象契约,优先声明最小能力集,并用 `associatedtype` 抽象通用性。
- 通过网络边界传递的模型与值,协议追加 `Sendable` 以参与严格并发检查。

```swift
protocol Persisting {
    associatedtype Entity
    func save(_ entity: Entity) async throws
    func load(id: Int) async throws -> Entity?
}

struct UserStore: Persisting, Sendable {
    func save(_ entity: User) async throws {
        // 具体持久化实现
    }
    func load(id: Int) async throws -> User? {
        // 具体查询实现
    }
}
```

### 4.6 Optional 与解包
- 变量声明时明确可空性,解包使用 `if let`/`guard let`,避免隐式解包 `!`(IBOutlet 与 `UIViewController` 的 `view` 之外禁用)。
- 链式访问使用 `?.`,提供默认值使用 `??`;**绝不**在无验证的情况下强制解包。

```swift
func printUserName(from user: User?) {
    // 正例:guard let 提前返回
    guard let user else { return }
    print(user.name)

    // 正例:提供默认值(此处仅演示 `??`,实际 print 应使用上面分支)
    let name = user?.name ?? "匿名用户"
}

// 反例:强制解包,数组越界或 nil 时直接崩溃
// let n = items.first!.name
```

## 5. 类型系统与内存

### 5.1 值语义优先
- 推荐使用 `struct` + 值语义设计无共享可变状态;需要共享且线程安全的可观察状态时,才考虑 `class` + `actor`.
- 结合值拷贝成本与性能场景选择存储在引用中的大对象(如 `Data` 由框架管理),平时保持 struct 化。

```swift
var settings = AppSettings(theme: .dark)
var copied = settings          // 值拷贝,二者互不影响
copied.theme = .light
print(settings.theme)          // .dark,证明与原值无关
```

### 5.2 空安全与无空值设计
- 函数返回可空对象时用 `Optional<T>`;需要携带错误时用 `throws` 或 `Result`.
- 泛型协议不要用哨兵空值表示"没有"——用可选链与 `isEmpty` 表达意图。

### 5.3 ARC 与循环引用
- 使用 `class` 时,对象的成员闭包若捕获 `self`,会被 ARC 强持有形成 retain cycle,应将闭包属性标注 `lazy var` 并在捕获列表里写 `[weak self]` 或 `[unowned self]`.
- `[unowned self]` 仅在"self 必然比闭包活得久"时使用,否则崩溃风险更高,优先 `weak`.

```swift
final class ProfileViewController {
    private var reloadHandler: (() -> Void)?

    func configure() {
        reloadHandler = { [weak self] in
            // 弱引用捕获,避免 VC 与闭包形成引用环
            guard let self else { return }
            self.refresh()
        }
    }

    private func refresh() { /* ... */ }
}
```

### 5.4 泛型与协议关联
- 约束泛型到所需协议即可,不引入冗余的下游协议;需要重用的行为抽象放协议 extension.

```swift
func sumNumbers<T: Numeric>(_ numbers: [T]) -> T {
    numbers.reduce(0, +)
}
```

## 6. 错误处理

### 6.1 定义错误类型
- 自定义错误遵循 `Error` 协议并实现 `LocalizedError` 以便 `errorDescription` 展示给用户;多错误域用嵌入的枚举组织。

```swift
enum NetworkError: LocalizedError, Sendable {
    case invalidURL
    case serverError(statusCode: Int)
    case timeout

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "URL 无效"
        case .serverError(let code): return "服务器错误(\(code))"
        case .timeout: return "请求超时"
        }
    }
}
```

### 6.2 抛出与捕获
- 使用 `try`/`try?`/`try!`;`try!` 仅在确定不会失败的场景(如解析硬编码常量)使用,否则用 `try?` 降级为 Optional.
- 捕获错误时区分可恢复项,可恢复的走 `catch`,否则向上抛给调用方。

```swift
func loadConfig() throws -> Config {
    let url = Bundle.main.url(forResource: "config", withExtension: "json")
    guard let url else { throw ConfigError.missingFile }
    let data = try Data(contentsOf: url)          // 可失败,向上抛
    return try JSONDecoder().decode(Config.self, from: data)
}
```

### 6.3 Result 与错误回调兼容
- 在异步回调风格代码逐渐迁移为 async 时,可用 `Result` 统一成功/失败包装;最终目标还是 async/await 直接 throw.

```swift
func perform() async -> Result<User, NetworkError> {
    do {
        let user = try await api.fetchProfile()
        return .success(user)
    } catch {
        return .failure(.serverError(statusCode: 500))
    }
}

// 调用方:switch 或 try await
let result = await perform()
if case .failure(let e) = result { logger.error("\(e)") }
```

## 7. 异步与并发

### 7.1 async/await 基础
- 所有异步函数标注 `async`,调用处用 `await`;不要在异步环境中使用 `DispatchQueue` 阻塞线程等待结果。

```swift
func fetchUser(id: Int) async throws -> User {
    // 假设 apiClient 内部也使用 async 接口
    let data = try await apiClient.get("/users/\(id)")
    return try decoder.decode(User.self, from: data)
}
```

### 7.2 Task 与结构化并发
- 使用 `Task`/`TaskGroup` 启动结构化并发;避免无条件 `Task {}` 脱离生命周期,需取消时挂载 `cancel()` 传播.
- 分离任务用 `Task.detached`,仅在需独立生命周期且明确取消策略时使用。

```swift
func loadAll() async throws -> [Article] {
    try await withThrowingTaskGroup(of: Article.self) { group in
        for id in ids {
            group.addTask { try await fetchArticle(id: id) }
        }
        var result: [Article] = []
        for try await article in group {
            result.append(article)
        }
        return result
    }
}
```

### 7.3 actor 隔离
- 需要互斥访问的可变状态用 `actor` 封装,避免手动加锁误用 `DispatchQueue` 与 `NSLock`.
- actor 方法默认串行执行,外部访问加 `await`;通过 `@MainActor` 隔离 UI 相关状态。

```swift
actor ScoreKeeper {
    private(set) var score = 0

    func add(_ points: Int) {
        score += points
    }
}

// 使用
let keeper = ScoreKeeper()
await keeper.add(10)
print(await keeper.score)
```

### 7.4 取消与继续执行
- 长时间任务监听 `Task.isCancelled`,抛出 `CancellationError`;配合 `withTaskCancellationHandler` 在取消时清理资源。

```swift
func download() async throws -> Data {
    try Task.checkCancellation() // 取消时立即抛出 CancellationError
    // ... 网络下载逻辑
}
```

## 8. 结构与架构

### 8.1 分层与模块边界
- 建议模块划分:`Model`(纯类型)、`Services`(业务服务)、`UI`(表现层),依赖方向单一,禁止反向依赖。
- 网络与持久化接口定义成协议,业务代码依赖协议而非具体实现,便于测试注入。

```
AppServices/
├── Sources/
│   ├── AppServices/
│   │   ├── Model/
│   │   │   ├── User.swift
│   │   │   └── Article.swift
│   │   ├── Services/
│   │   │   ├── API/
│   │   │   │   ├── APIClient.swift
│   │   │   │   └── APIClientProtocol.swift
│   │   │   └── Repository/
│   │   │       └── UserRepository.swift
│   │   └── Support/
│   │       └── Logger.swift
│   └── ...
└── Tests/
    └── AppServicesTests/...
```

### 8.2 协议契约与依赖注入
- 构造器注入为主,避免全局单例;测试通过 Mock 替换协议依赖。
- 状态唯一 owner:同一可变状态仅由一个 actor/对象拥有,其余只读访问。

```swift
protocol SessionManaging: Sendable {
    var currentUser: User? { get async }
    func logIn(_ user: User) async throws
}

struct AccountViewModel {
    private let session: SessionManaging
    init(session: SessionManaging) { self.session = session } // 构造器注入
}
```

### 8.3 状态所有权
- 明确 mutable 状态所属模块,禁止多处写入同一状态;使用 `actor` 或单一 `ObservableObject` 收敛写入路径。

## 9. 构建 / 测试 / 发布

### 9.1 构建
- 日常开发用 `swift build`/`swift test`,线上一侧用 Xcode 的 `xcodebuild` 出包;CI 至少覆盖 Debug 与 Release 一次全量构建。
- 在持续部署前执行 `swift build -c release` 以发现编译期大对象开销与并发警告。

```bash
# CI 示例
swift build -c release
swift test --parallel
xcodebuild -workspace App.xcworkspace -scheme App -configuration Release build \
  -destination 'generic/platform=iOS' -derivedDataPath build
```

### 9.2 测试写法
- 测试目标与被测目标同名加 `Tests`;异步测试用 `async throws` 与 `XCTest`.

```swift
import XCTest
@testable import AppServices

final class UserRepositoryTests: XCTestCase {
    func testFetchUserWhenNotFoundReturnsNil() async throws {
        let repository = UserRepository(client: MockAPIClient.notFound)
        let result = try await repository.fetchProfile()
        XCTAssertNil(result)
    }
}
```

### 9.3 发布与版本
- 使用语义化版本号,按模块维护 CHANGELOG;提交前执行 `swift-format lint` 与全量测试作为发布门禁。

## 10. 安全与性能要点

### 10.1 主线程职责
- UI 操作一律回到主线程,SwiftUI 视图内通过 `@MainActor` 隔离状态更新;后台线程绝不经 `Promise`/回调更新界面。
- 大数据解串与图片解码放入 `Task.detached` 或后台队列,完成后主线程刷新。

```swift
@MainActor
final class SomeViewModel {
    func updateAfterFetch() async {
        await MainActor.run { /* 更新界面 */ }
    }
}
```

### 10.2 隐私与日志
- 不在日志输出 token、密码、`UserDefaults` 明文敏感值;日志统一走 `Logger`(OSLog),格式使用结构化占位符,避免字符串拼接泄漏。

```swift
import os
let logger = Logger(subsystem: "com.example.app", category: "network")
logger.info("请求完成 status=\(statusCode, privacy: .public)")
```

### 10.3 性能注意
- 大数组上避免重复 `append` 触发的拷贝,可用 `reserveCapacity` 或惰性序列;热路径避免过度的错误包装与字符串拼接。

## 11. 常见陷阱与反模式

### 11.1 陷阱
【陷阱】回调闭包捕获 `self` 造成 retain cycle。
```swift
// 修正:捕获列表使用 [weak self]
network.fetch { [weak self] in
    self?.reload()
}
```

【陷阱】数组/字典越界强制下标与强制解包直接崩溃。
```swift
// 修正:使用 first、safe 访问与 guard let
guard let item = items.first(where: { $0.active }) else { return }
```

【陷阱】隐式解包 Optional 在生成/赋值前被读取而崩溃。
```swift
// 修正:声明为普通 Optional,用 guard 提前校验
// @IBOutlet weak var label: UILabel?  // 不使用强制解包
```

【陷阱】在异步闭包中捕获可变全局变量造成数据竞争。
```swift
// 修正:将可变状态放入 actor 或使用 Shareable/值拷贝
// 原:var counter = 0; async 并发改写 → 崩
```

【陷阱】`try!` 用于可能失败的解析,线上偶发崩溃。
```swift
// 修正:改用 do/try 或 try? 并优雅降级
let data = try? Data(contentsOf: url) ?? fallbackData
```

【陷阱】String 拼接大量内容导致多次拷贝。
```swift
// 修正:使用字符串插值或 join
let text = parts.joined(separator: ",")
```

【陷阱】在数组中不断增长索引下标遍历,越界风险。
```swift
// 修正:改成 for item in collection 或 enumerated
for (idx, item) in items.enumerated() { ... }
```

【陷阱】把状态存在多个 owner,出现同步不一致。
```swift
// 修正:单一 owner + 只读请求;图形化所有权边界
// 只在一个 actor 内写入 count
```

【陷阱】`unowned` 捕获在 self 提前释放后访问悬垂引用崩溃。
```swift
// 修正:优先 weak + guard let self else { return }
```

【陷阱】用 DispatchQueue + 锁模拟互斥,未覆盖所有路径导致死锁。
```swift
// 修正:改用 actor 自动串行
actor Counter { private var value = 0 ... }
```

【陷阱】对 `Data` 反复转 String 频繁创建对象拖慢主线程。
```swift
// 修正:一次性解码并缓存
```

【陷阱】在 `Task { }` 内无条件执行且不传取消,产生的孤儿任务无法回收。
```swift
// 修正:存储 Task 引用并支持 cancel
let task = Task { ... }; task.cancel()
```

### 11.2 反模式速览
- 用全局常量管理状态而不是用合理对象、用 `!` 解包代替错误处理、用硬编码文案代替本地化——这些都要在评审中被否决。

## 12. 自查检查清单
- [ ] 所有类型使用 UpperCamelCase,变量与方法使用 lowerCamelCase?
- [ ] 布尔方法属性以 `is` / `has` 开头?
- [ ] 变量显式标注类型或可推断,且无隐式解包 `!`?
- [ ] `if let` / `guard let` 解包,未滥用强制解包?
- [ ] 无 `try!` 于可能失败的代码路径?
- [ ] 使用 `isEmpty` 判断集合空,而非 `count == 0`?
- [ ] 使用字符串插值而非 `+` 拼接高频文案?
- [ ] 数据模型以 `struct` 为主,必要时用枚举表达状态?
- [ ] 协议声明了最小能力集并标注 `Sendable`(如需要)?
- [ ] 引用类型闭包捕获 `self` 时使用 `[weak self]`?
- [ ] 无 `unowned self` 悬垂风险?
- [ ] 错误类型实现 `LocalizedError` 提供用户可读描述?
- [ ] 异步函数均标注 `async` 并在调用处 `await`?
- [ ] 可变互斥状态放置于 `actor` 而非裸 `DispatchQueue` 加锁?
- [ ] UI 更新均回到主线程(或 `@MainActor`)?
- [ ] 长任务支持取消并合理清理资源?
- [ ] 依赖注入通过构造器,而非全局单例散落各文件?
- [ ] 状态只有唯一 owner,无多处写入?
- [ ] `swift-format lint` 通过,无格式告警?
- [ ] 对应行为已补充 XCTest(async throws)测试且通过?

## 13. 参考资料
- Apple Swift Programming Language:https://docs.swift.org/swift-book/
- Swift API Design Guidelines:https://www.swift.org/documentation/api-design-guidelines/
- swift-format 文档:https://github.com/swiftlang/swift-format
- XCTest 与 swift-testing 使用说明:https://github.com/swiftlang/swift-testing
- SwiftNIO / Vapor 服务端最佳实践:https://docs.vapor.codes/