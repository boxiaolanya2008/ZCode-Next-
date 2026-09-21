# Scala 编码规范

> 本规范适用于仓库中以 Scala 3（含少量 Scala 2.13 兼容段）编写的一切代码，涵盖库、服务端应用与脚本。目标读者为使用本仓库的工程师与 code-review 评审者。规范以"可读性 > 魔法、不可变优先、编译期安全优先"为第一原则，并为每条规则给出可直接落地的示例。

## 1. 概述与使用时机

Scala 是一门静态类型、函数式优先、运行于 JVM（及 Native/JS via Scala.js）的多范式语言。它同时支持面向对象与函数式编程，类型系统丰富。

- 当代码核心围绕数据域建模、纯函数、不可变结构与代数数据类型（ADT）时优先选用 Scala。
- 当团队已有 TypeScript/Go 且交互集中在薄脚本时，不要因"好玩"引入 Scala；引入前确认构建链与部署方式。
- 默认使用 Scala 3（Dotty）。仅当强依赖的第三方库尚未支持 Scala 3 时才用 2.13，并以 `-source:3.0` 保持前向兼容。
- 本规范面向后端服务、数据处理与共享库；涉及 UI 的 Scala.js/Scalatags 部分遵循同样的命名与结构规则。

## 2. 环境与工具链

### 2.1 构建工具

优先 sbt 或 Mill，二选一并统一，禁止混用两套构建脚本。

- Java 版本：与 `build.sbt` 中 `scalaVersion` 匹配的 LTS（建议 17 及以上）。
- Scala 版本：`3.3.x`（LTS）或最新稳定版，2.13 项目使用最近 patch。

```scala
// build.sbt —— 统一版本与编译选项
ThisBuild / scalaVersion := "3.3.4"
ThisBuild / organization  := "com.example"

lazy val core = (project in file("core"))
  .settings(
    scalacOptions ++= Seq(
      "-deprecation",
      "-feature",
      "-unchecked",
      "-Wunused:all",
      "-Wvalue-discard",
      "-Xfatal-warnings", // CI 上把警告当错误，保证一致性
    ),
    libraryDependencies ++= Seq(
      "org.typelevel" %% "cats-effect" % "3.5.7",
      "org.scalameta" %% "munit"       % "1.0.2" % Test,
    )
  )
```

### 2.2 代码格式化与静态检查

- 一律使用 scalafmt 统一格式；提交前运行 `sbt scalafmtAll` 或 `scalafmtCheckAll`。
- 使用 scalafix 做语义化的重写与 lint（如弃用 API 迁移、显式结果类型检查）。
- 上述检查应进入 pre-push hook 或 CI，而不是依赖人肉记忆。

```scala
// .scalafmt.conf —— 团队统一风格
version = "3.8.1"
runner.dialect = scala3
maxColumn = 120
align.preset = more
danglingParentheses.preset = true

rewrite.rules = [RedundantBraces, SortImports]

// 运行
//  sbt scalafmtAll scalafmtCheckAll
//  sbt "scalafixAll --check"
```

### 2.3 常用命令速查

```bash
# 编译、测试、打包
sbt compile
sbt test
sbt assembly

# 代码质量
sbt scalafmtCheckAll
sbt "scalafixAll --rules=OrganizeImports"

# 交互式开发
sbt console
sbt ~compile          # 监听改动自动编译
```

## 3. 命名与风格

### 3.1 命名约定表格

| 目标                 | 约定            | 示例                                |
| -------------------- | --------------- | ----------------------------------- |
| 类型、类、trait 对象 | PascalCase     | `User`、`PaymentProcessor`          |
| 方法、val、def       | camelCase       | `findById`、`computeTotal`          |
| 常量（不可变顶层）   | 大写开头 camel  | `MaxRetries`、`DefaultPort`        |
| 单例对象             | PascalCase     | `object Config`                    |
| 类型参数             | 单个大写字母    | `A`、`T`、`F[_]`                   |
| 隐式 given/instance  | camelCase，语义明确 | `given jsonCodec: Context`     |
| 布尔谓词方法         | 以 `is`/`has`/`ends` 开头 | `isEmpty`、`hasPermission`    |
| 扩展方法所在对象     | `Ops` 后缀      | `object StringOps`                 |

### 3.2 正反例

```scala
// 反例：缩写混乱、命名模糊、误导性类型信息
val n = 5                 // 不知道是什么
def get_user(id: Long) = ???   // Snake_case
class dataStore { ... }        // 小写类名
val isVerifiedBoolean = true   // 冗余后缀

// 正例：语义明确、可读、类型清晰
val maxAttempts = 5
def getUser(id: Long): Either[AppError, User] = ???
final class DataStore { ... }
val isVerified = true
```

### 3.3 风格细节

- 一行尽量 ≤ 120 字符，交给 scalafmt 自动修正。
- 少用 `var`；`var` 只在真正的可变状态（如性能热点、内部缓冲）出现，并注释理由。
- 避免返回 `Null`；用 `Option`、`Either` 表达可选或失败语义。
- 隐式/扩展方法使用上下文避免过度滥用，参见第 10.1 节。

## 4. 语法与惯用法

### 4.1 不可变的 `val` 与集合

默认声明 `val`，默认使用不可变集合；需要高性能可变时在局部作用域内使用 `scala.collection.mutable` 并在返回前冻结。

```scala
val ids: Vector[Long] = Vector(1, 2, 3)

// 局部累加可变，之后转不可变（标注原因：O(1) 追加）
val buffer = scala.collection.mutable.ArrayBuffer.empty[Long]
input.foreach(x => buffer += x.id)
val result = buffer.toVector // 语义上不可变，供外界使用
```

### 4.2 字符串插值与多行字符串

```scala
val name = "taro"
val msg  = s"hello $name, ${name.length} chars" // 插值
val block = """
  |Line1
  |Line2
  |""".stripMargin                           // 多行，去除左边距
```

### 4.3 `case class` 与不可变值对象

`case class` 提供 `equals`、`hashCode`、`copy`、`toString` 与模式匹配支持，是 ADT 的基础构件。

```scala
case class Address(city: String, street: String, zip: String)

// copy 做局部更新，天然不可变
val a2 = Address("Tokyo", "Chuo", "103")
val a3 = a2.copy(zip = "104-0000")

// case class 的字段默认是 val，禁止在其中放 var
```

### 4.4 sealed trait 与模式匹配

用 `sealed trait` + `case class`/`case object` 建模受限类型，让编译器穷尽性检查保护边界。

```scala
sealed trait PaymentStatus
object PaymentStatus {
  case object Pending    extends PaymentStatus
  case object Processing extends PaymentStatus
  case object Succeeded  extends PaymentStatus
  case class  Failed(reason: String) extends PaymentStatus
}

// sealed + 穷尽匹配：新增分支时这里会编译报错提醒
def describe(s: PaymentStatus): String = s match {
  case PaymentStatus.Pending    => "排队中"
  case PaymentStatus.Processing => "处理中"
  case PaymentStatus.Succeeded  => "成功"
  case PaymentStatus.Failed(r)  => s"失败: $r"
}
```

### 4.5 上下文抽象：using/given

用 `given` 提供隐式价值，用 `using` 参数接收，尽量显式，便于查找来源。

```scala
trait Repository[F[_]] { def save[A](a: A): F[Unit] }

given repo: Repository[IO] = InMemoryRepo[IO]

def run[F[_]](using r: Repository[F]): F[Unit] =
  r.save(42)
```

### 4.6 `for` 推导式

对 `Option`、`Either`、`List`、效果类型用 `for` 组合，避免嵌套展开。

```scala
def divide(a: Int, b: Int): Option[Int] = if (b == 0) None else Some(a / b)

val result: Option[Int] =
  for {
    x <- divide(10, 2)
    y <- divide(x, 2)
  } yield x + y   // Recomposes comprehension
```

## 5. 类型系统与内存

### 5.1 优先不可变与纯函数

- 数据与函数默认不可变；可变状态收敛到明确的 IO 边界或 agent 边界。
- 纯函数便于测试与推导；副作用标记到效果类型中（见第 7 节）。

### 5.2 用 Option / Either 而非异常做可预期分支

```scala
def find(key: String): Option[String] = cache.get(key)

// Either 携带错误路径，Left 为自定义错误类型
def parse(s: String): Either[ParseError, Int] =
  s.toIntOption.toRight(ParseError(s))
```

### 5.3 显式类型推断与不透明结果

公共 API 显式写返回类型，既是文档也是防线，防止重构时接口漂移。

```scala
// 反例：依赖推断，签名随实现漂移
def fetch = db.query(...)

// 正例：显式声明返回值
def fetch(userId: Long): Either[AppError, User] =
  db.query(...)
```

### 5.4 动态类型守卫

Scala 提供 `Any`/`AnyVal`/类型测试，但如果需要用 `asInstanceOf`，先把需求收敛到 ADT 或密封边界；散落的 `asInstanceOf` 是类型逃逸信号。

```scala
// 反例：Getter 返回 Any，调用方强转
val raw: Any   = registry.get("thing")
val x: Long    = raw.asInstanceOf[Long] // 运行时风险

// 正例：类型测试匹配，安全取出
registry.get("thing") match {
  case l: Long => l
  case _       => 0L
}
```

### 5.5 内存与生命周期

- 避免长期持有大对象到闭包；用 `WeakReference`/缓存框架（如 Caffeine）管理可回收缓存。
- `-Xmx`/GC 参数在部署配置中显式给出，不要依赖默认超小堆。
- STM/线程受限（见第 7 节）降低锁竞争与误共享。

## 6. 错误处理

### 6.1 策略分层

- 流程内预期失败 → `Either`/`Option`（或无异常效果类型如 `IO[Either]`）。
- 无法恢复的缺陷 → 尽早抛异常并中止。
- 边界（外部 IO、反序列化）→ 包一层领域错误，不向上抛出原始类型。

```scala
sealed trait AppError
case class NotFound(id: Long)       extends AppError
case class Upstream(msg: String)     extends AppError

// 用 map/flatMap 组合，不用 try/catch 横贯业务
def load(id: Long): Either[AppError, User] =
  for {
    raw <- repo.find(id).toRight(NotFound(id))
    _   <- raw.active.toRight(Upstream(s"user $id inactive"))
  } yield raw
```

### 6.2 只在边界 try/catch

```scala
import scala.util.Try

// 仅在真正可能抛出非受检异常的边界使用
val parsed: Either[Throwable, Int] = Try(json.parse(text).asInt).toEither
```

### 6.3 不吞异常

```scala
// 反例：吞掉所有异常并返回 None，丢失定位信息
def risky(): Option[Int] =
  try Some(work())
  catch { case _: Throwable => None }

// 正例：记录日志并带上下文后向上传播或转为领域错误
def risky(): Either[AppError, Int] =
  Either
    .catchNonFatal(work())
    .leftMap { t => logger.error("work failed", t); AppError.Internal }
```

## 7. 异步与并发

### 7.1 效果类型协程：Cats Effect / ZIO

- 业务逻辑尽量用效果类型（`IO`/`Task`），获得取消、资源安全、并行组合。
- 重要的 `IO` 表达为描述值，留到 run 处解释。

```scala
import cats.effect.IO
import cats.effect.unsafe.implicits.global

def fetch(url: String): IO[String] = IO.blocking(httpGet(url))

val program: IO[Unit] =
  for {
    a <- fetch("https://a.example")
    b <- fetch("https://b.example")
    _ <- IO.println(s"$a | $b")
  } yield ()

// 单一 exit point
program.unsafeRunSync()
```

### 7.2 线程与线程池

- 使用 `Dispatcher` 或 `IO.blocking` 隔离阻塞调用（DB、HTTP），避免占满 compute 池。
- 明确容器线程池大小；不写 `def thread = new Thread(...)` 裸线程。

```scala
// 用 cats-effect Dispatcher 向另一个池提交阻塞任务
def runBlocking[A](fa: IO[A])(using D: Dispatcher[IO]): A =
  D.unsafeRunSync(fa)
```

### 7.3 线程安全与共享状态

- 共享可变状态：用不可变数据结构 + `Ref`/`AtomicReference` 或 `ConcurrentHashMap`，避免裸 `synchronized` 大块。
- 不变性原则：`case class` 只含不可变字段；跨线程传递时复制而非共享可变缓冲。

```scala
import cats.effect.std.Env

def inc(counter: Ref[IO, Long]): IO[Long] = counter.updateAndGet(_ + 1)

// 若必须用可变，限定在单线程 agent 内串行访问并注释
```

### 7.4 Future 兼容

在 Scala 2.13/部分边界处使用 `scala.concurrent.Future` 时，确保 `ExecutionContext` 显式传入，不隐式依赖全局池做破坏性操作。

```scala
import scala.concurrent.{ExecutionContext, Future}

def f(x: Int)(using ec: ExecutionContext): Future[Int] = Future(x + 1)
```

## 8. 结构与架构

### 8.1 分层

- 外层访问入口（controller/route）→ 应用服务 → 领域模型 → 基础设施适配器。
- 依赖方向单向向内：领域不依赖基础设施；接口（trait）定义在领域层，实现在 infra 层。

```
core/src/main/scala/com/example/
  domain/
    model/       # case class / sealed trait（纯领域）
    service/     # 应用服务，编排用例
  app/
    api/         # 对外接口 / 门面
  infra/
    db/          # 持久化适配器
    http/        # HTTP 客户端
  Main.scala
```

### 8.2 依赖注入

- 优先构造器注入；Li Haoyi 风格的手写 DI 或 Cats-ZIO 服务层均可，避免反射式容器魔法。
- 组合根部（`Main`/`wiring`）集中做装配，业务代码只用 `using` 参数。

```scala
class UserService(repo: UserRepository, metrics: Metrics) {
  def find(id: Long): Either[AppError, User] = {
    metrics.inc(id)
    repo.find(id)
  }
}
```

### 8.3 状态唯一 owner

- 每个可变状态只属于一个 owner，避免多写路径。
- 迁移/缓存等状态收敛到明确服务，禁止散落全局可变对象。

```scala
// 反例：全局可被多处以任意方式修改
object Cache { var m = Map.empty[String, String] }

// 正例：状态归 Repo 所有，提供受控读接口
class Cache {
  private var m = Map.empty[String, String]
  def get(k: String): Option[String] = m.get(k)
  def put(k: String, v: String): Unit = m = m.updated(k, v)
}
```

## 9. 构建 / 测试 / 发布

### 9.1 构建命令

```bash
sbt clean compile          # 干净构建
sbt test                   # 运行全部测试
sbt assembly               # 打包 fat jar
sbt publishLocal           # 发布到本地 ivy
```

### 9.2 测试写法（munit / ScalaTest）

- 每条测试一个行为断言；`Property` 用 law 风格。
- 测试数据用 `scalacheck` 生成，不在测试内依赖真实网络的时间。

```scala
import munit.FunSuite

class UserParsingSuite extends FunSuite {
  test("parseUser returns User for valid payload") {
    val json = """{"id":1,"name":"taro"}"""
    assertEquals(parseUser(json).map(_.id), Right(1L))
  }
}
```

### 9.3 CI

```yaml
# .github/workflows/scala.yml（节选）
steps:
  - uses: actions/setup-java@v4
    with: { distribution: temurin, java-version: '17' }
  - run: sbt scalafmtCheckAll
  - run: sbt test
  - run: sbt assembly
```

## 10. 安全与性能要点

### 10.1 隐式与扩展方法慎用

滥用的隐式会造成阅读困难与隐蔽绑定。扩展方法尽量放在 `Ops` 对象并有明确 import 面。

```scala
object StringOps:
  extension (s: String)
    def quoted: String = "\"" + s + "\""

import StringOps.quoted
val out = "x".quoted // 显式 import，来源清晰
```

### 10.2 宏与底层魔法

- 内联 `inline`/`transparent inline` 可用，但优先用普通函数；宏只用于确需编译期生成的场景并附注释。
- 避免散落的 `asInstanceOf`/`null`；除非在安全边界内使用，否则视为缺陷候选。

### 10.3 注入与外部输入

- 不拼接 SQL/脚本字符串；用类型安全查询或显式转义。
- 日志与错误输出对敏感字段脱敏，不打印完整凭据。

```scala
def query(q: Query): List[Row] =
  pool.syncQuery {
    // 使用参数化绑定，而非字符串拼接
    sql"select * from t where name = $q".as[Row]
  }
```

### 10.4 GC 与性能

- 优先不可变、局部化，减少长期存活对象晋升。
- 大数据集流式处理（fs2/zio-streams），避免一次 `toList` 拉全量。
- 用 `./mill`/JFR 采集热点，再决定优化，不盲猜。

```scala
def process(lines: Stream[IO, Byte]): Stream[IO, Long] =
  lines.through(fs2.text.utf8.decode).map(_.split(",")(1).toLong) // 流式，避免全量入内存
```

## 11. 常见陷阱与反模式

【陷阱 1】过度使用 `var` 与可变集合，破坏不可变性。

【修正】默认 `val` + 不可变集合；确需可变时局部作用域内使用并尽快冻结，注释原因。

```scala
// 反例
var list = List(1)
list = list :+ 2

// 正例
val list = List(1, 2)
```

【陷阱 2】裸异常代替类型化错误，丢失上下文。

【修正】用 `Either[AppError, T]` 或 `Try` 表达预期失败；详见第 6 节。

【陷阱 3】在 `catch` 中吞掉异常，掩盖问题。

【修正】至少 `logger.error` 并关联上下文；能转为领域错误则转换。

【陷阱 4】对象里散落可变可执行状态（script 风格）。

【修正】把纯逻辑放对象，可变状态收敛到拥有它的类/服务并限制访问面。

【陷阱 5】专业化/泛型误用导致类型擦除相关问题。

【修正】泛型参数明确；对 `List[_]` 做模式匹配时注意擦除并加 `@unchecked` 注释说明。

【陷阱 6】整段 `try/catch` 横跨业务逻辑。

【修正】把边界异常在入口包一层，业务层用 Either/flatMap 组合。

【陷阱 7】`null` 返回值与可空字段渗透。

【修正】全部改为 `Option`；`None` 语义清晰。

【陷阱 8】隐式 given 太多导致解析歧义。

【修正】给 given 明确命名，复用按需 import，超出 2~3 个时拆分作用域。

【陷阱 9】`Future` 依赖全局 `ExecutionContext` 造成资源竞争。

【修正】显式传入 `ExecutionContext`，用受控线程池。

【陷阱 10】字符串拼接 SQL / 命令注入。

【修正】参数化查询、转义、白名单校验（见 10.3）。

【陷阱 11】大内存一次性 `toList` 拉全量数据。

【修正】流式处理，见 10.4 示例。

【陷阱 12】在 `for` 中混用不同类型的解包导致隐含失败。

【修正】统一类型为 `Option` 或 `Either`，必要时在最外层才转换数据类型。

【陷阱 13】sealed trait 分支漏掉 `case object` 的单例身份比较。

【修正】用引用相等比较单例（`s == Pending`），不要通过字段判断状态对象。

【陷阱 14】过度使用宏/inline 让代码难以调试。

【修正】默认普通函数；宏用于确需处并注释，减小本地化风险。

## 12. 自查检查清单

- [ ] 项目使用统一 sbt/Mill 构建脚本，未混用两套
- [ ] scalaVersion 指定为 Scala 3.3+ LTS 或明确兼容版本
- [ ] scalacOptions 已启用 `-deprecation -feature`，警告不静默
- [ ] 提交前运行过 `sbt scalafmtCheckAll`
- [ ] scalafix 规则已接入并执行过
- [ ] 公共方法显式声明返回类型
- [ ] 默认使用 `val`，未出现无注释的 `var`
- [ ] 使用不可变集合，可变集合限局部作用域并注明
- [ ] `case class` 字段均为不可变，未含 `var`
- [ ] 数据域用 `sealed trait` + 穷尽模式匹配
- [ ] 预期失败用 `Either`/`Option`，未见散落类型异常
- [ ] 未见 `null` 作为业务返回值
- [ ] 未在 `catch` 中静默吞异常
- [ ] 异步用效果类型规范组合，Future 显式传 ExecutionContext
- [ ] 共享可变状态有唯一 owner，访问面受控
- [ ] 依赖注入使用构造器注入，未见反射魔法
- [ ] SQL/命令使用参数化或转义，无字符串拼接
- [ ] 日志中已脱敏，未出现凭据
- [ ] CI 已配置格式检查、类型检查与测试
- [ ] 大集合已流式处理，未全量载入内存

## 13. 参考资料

- Scala 3 官方文档：https://docs.scala-lang.org/scala3/
- scalafmt：https://scalameta.org/scalafmt/
- scalafix：https://scalacenter.github.io/scalafix/
- Cats Effect：https://typelevel.org/cats-effect/
- munit：https://scalameta.org/munit/