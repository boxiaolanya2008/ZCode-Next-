# Kotlin 编码规范

> 本文档面向使用 Kotlin 开发 Android 应用与 JVM 后端服务的团队，覆盖 Kotlin ~1.9/2.x（含 Kotlin Multiplatform 常规用法）。其核心是充分发挥 Kotlin 的 null 安全、协程、data class、sealed class 与 Compose 声明式能力，同时规避误用带来的复杂性。目标让代码具备类型安全、可测试性与一致性。所有规范在允许情况下给出可直接执行的“怎么做”以及带注释的代码示例；如与存量模块约定冲突，以本文档为准并同步更新模块内废弃用法。

## 1. 概述与使用时机

- 本规范在你新增或修改 Kotlin 源码、构建脚本（`.kts`）、资源与测试时生效，作为统一风格与工程约定标准。
- Kotlin 优先用于 Android UI、业务逻辑、协程场景；Java 仅在与遗留代码互操作或性能敏感热点（可选）时使用。
- 升级 Kotlin 版本或引入新库时，先按第 2、10 节更新编译器与依赖，再迁移存量写法。
- 本文档常与 Java 编码规范配套使用，混编处通过显式接口界定边界，禁止在 Java/Kotlin 间大量粘贴无谓转换代码。
- 章节顺序：环境与工具 → 命名风格 → 语法惯用 → 类型与内存 → 错误处理 → 异步并发 → 结构架构 → Android 工程 → 构建发布 → 安全性能 → 反模式 → 自查清单。

## 2. 环境与工具链

### 2.1 Kotlin 编译器与 Gradle

- 使用 Kotlin ~2.x 与 JDK 17/21；Android 侧用 Kotlin Android 插件（`org.jetbrains.kotlin.android`）。
- Kotlin 版本由 `libs.versions.toml` 统一管理，`kotlin` 编译器版本与 Gradle `KotlinJvm` 一致。
- 全部构建脚本建议使用 Kotlin DSL（`.gradle.kts`），获取类型提示与编译期校验。

```kotlin
// build.gradle.kts（模块级）
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}
kotlin {
    jvmToolchain(17)
    compilerOptions {
        freeCompilerArgs.add("-Xjsr305=strict")   // 强制 null 安全互操作
    }
}
```

### 2.2 包管理与依赖

- 依赖统一写在 Version Catalog；第三方库从 google/mavenCentral 拉取。
- 每个第三方依赖记录其用途，避免重复引用的同能力库。

```toml
# gradle/libs.versions.toml
[versions]
kotlin = "2.0.20"
coroutines = "1.9.0"

[libraries]
kotlinx-coroutines-core = { module = "org.jetbrains.kotlinx:kotlinx-coroutines-core", version.ref = "coroutines" }
kotlinx-coroutines-android = { module = "org.jetbrains.kotlinx:kotlinx-coroutines-android", version.ref = "coroutines" }
```

### 2.3 格式化与静态分析

- 使用 Ktlint 或 Spotless + Ktfmt 统一格式；`detekt` 做规则检查。
- 命名、复杂度、null-safety 检查和违规能进 CI 一律开 `allWarningsAsErrors`（可开关）。

```bash
# 覆盖格式化与分析
./gradlew ktlintFormat ktlintCheck
./gradlew detekt
```

### 2.4 测试框架

- JUnit 5、kotlinx-coroutines-test 用于协程单测、MockK 做 mock、AssertJ 或 Kotest 断言。
- ViewModel 等协程测试用 `runTest`（coroutines-test）控制调度器。

```kotlin
@Test
fun `请求成功后状态更新`() = runTest {
    val vm = MainViewModel(repo = FakeRepo())
    vm.refresh()
    assertThat(vm.uiState.value.isLoading).isFalse()
}
```

## 3. 命名与风格

### 3.1 命名约定表

| 元素         | 约定                         | 示例                        |
|--------------|------------------------------|------------------------------|
| 包名         | 全小写点分，常与 Java 一致  | `com.example.feature.user`  |
| 类/接口     | UpperCamelCase              | `UserViewModel`              |
| 函数/变量   | lowerCamelCase              | `loadUsers` / `userCount`    |
| 常量 / 伴生 | CAPITAL_SNAKE_CASE          | `MAX_PAGE` / `companion object` |
| 可空类型后缀 | 显式 `?`                    | `name: String?`              |
| 类型参数     | 单大写或描述性              | `T`, `R`, `Item`            |
| 扩展函数     | lowerCamelCase，名词前放点  | `List<User>.active()`        |
| 测试函数     | 反引号表达式句             | `` `load_fail_返回错误` ``   |

### 3.2 风格正反例

```kotlin
// 正例
class OrderService(private val repo: OrderRepository) {
    fun createOrder(items: List<LineItem>): Order {
        return repo.save(Order(items = items))
    }
}
```

```kotlin
// 反例：类型缩写、魔法数、泛型省略
class S(private val r: OrderRepository) {          // 反：单字母类名
    fun doIt(item: List<LineItem>) {
        val n = r.getCount() > 5                   // 反：5 魔法数
        // ...
    }
}
```

### 3.3 格式与风格

- 4 空格缩进，UTF-8，行宽 ≤120；Kotlin 语言级推荐 `fun` 无大括号单行表达式函数。
- `if`/`when` 作为表达式使用可不加大括号，赋值场景给明确 branch。
- 优先编译器自动处理的 `when` 穷举检查 `sealed` 分支。

## 4. 语法与惯用法

### 4.1 类型与空安全

- 明确区分可空 `T?` 与空安全 `T`；用 `String?` 表达可选，但尽量用带语义的类型。
- 判空用 `?.`、`?:`、`let`/`run`，避免多层 `if (x != null)` 嵌套。

```kotlin
val name: String? = user?.profile?.name
val display = name?.takeIf { it.isNotBlank() } ?: "未命名"
```

### 4.2 集合

- 优先不可变集合 `listOf`/`setOf`/`mapOf`；需要改动才用 `mutable*`。
- 用扩展函数（`filter`、`map`、`groupBy`、`associate`）做数据变换，避免手写循环构建集合。

```kotlin
val activeCount = users
    .filter { it.status == User.Status.ACTIVE }
    .count()
```

### 4.3 字符串

- 用字符串模板 `$var` 与 `表达式` 替代 `+` 拼接。
- 多行用原始字符串 `trimIndent()`；不要滥用模板制造复杂表达式。

```kotlin
val msg = "用户 ${profile.name} 登录成功（${attempts} 次重试）"
```

### 4.4 data class 与解构

- 数据载体用 `data class`，自带 equals/hashCode/toString/copy。
- 解构只用于语义明确的 pair/triple，业务对象直接访问命名属性。

```kotlin
data class User(val id: Long, val name: String, val email: String)

val (id, name, _) = user        // 只关注部分字段，用 _ 占位
```

### 4.5 sealed class / 枚举与 when

- 表示可穷举的状态用 `sealed class`（子类可携带数据）或 `enum class`（无数据）。
- 处理状态用 `when` 表达式并保证穷举回退，新增分支编译期告警。

```kotlin
sealed class UiState {
    data object Loading : UiState()
    data class Success(val data: List<String>) : UiState()
    data class Error(val cause: Throwable) : UiState()
}

fun render(state: UiState) = when (state) {
    UiState.Loading -> showLoading()
    is UiState.Success -> showData(state.data)
    is UiState.Error -> showError(state.cause)
}
```

### 4.6 扩展函数与作用域函数

- 扩展函数只用于语义化的行为补充，不滥用上帝扩展。
- `apply`/`with`/`run`/`let`/`also` 选用：变换结果用 `let`，对象初始化用 `apply`，链式日志用 `also`，计算作用域用 `run`。

```kotlin
val dialog = AlertDialog.Builder(this)
    .setTitle("提示")
    .setMessage("确定？")
    .setPositiveButton("确定", null)
    .create()
    .apply { show() }
```

### 4.7 属性与伴生对象

- 属性定义用 `val`（不可变）居多，`var` 仅当需要明确可变状态。
- 常量放 `companion object` 或顶层 `private const`；不把业务变量塞进伴生。

```kotlin
class Config {
    companion object {
        const val DEFAULT_TIMEOUT = 5000L   // 编译期常量
    }
}
```

### 4.8 高级语法特性

- `sealed interface`：表达“可穷举的协议/状态”，比 `sealed class` 更灵活（同一模块多实现）；无字段分支用 `data object`，有字段用 `data class`。
- `value class` + `@JvmInline`：对单值做强类型包装（如 `UserId`），替代裸 `String`/`Long` 魔法字面量，且多数场景无装箱。
- 内联高阶函数 + `reified`：在泛型内保留具体类型，避免 `as?` 链。
- 委托属性 `by lazy` / `by remember`：延迟初始化与缓存；Compose 用 `remember {}` 绑定重组生命周期。
- `buildList {}` / `buildMap {}` / `buildSet {}`：在受限作用域内构建不可变集合，外部仍只读，避免临时 mutable 泄漏。
- `runCatching {}`：把调用折叠为 `Result<T>`，配合 `mapCatching`/`getOrElse` 组合，比散落 try/catch 更可读。
- `infix`、`operator` 重载、`tailrec`、解构（`for ((k, v) in map)`）适量使用，提升表达力但要克制，避免可读性下降。

```kotlin
@JvmInline
value class UserId(val raw: String)                  // 类型安全 id，替代裸 String 魔法值

fun selectedNames(users: List<User>) = buildList {   // 作用域内构建，外部只读
    users.filter { it.status == User.Status.ACTIVE }.forEach { add(it.name) }
}

fun parseCount(text: String): Result<Int> =
    runCatching { text.trim().toInt() }              // 错误折叠为 Result

val a = parseCount("12").getOrDefault(0)
```

```kotlin
sealed interface FeedItem {                           // 穷举协议：可跨多个 data object/data class
    data object Skeleton : FeedItem
    data class Post(val id: UserId, val title: String) : FeedItem
    data class Ad(val token: String) : FeedItem
}

val title = when (item) {                             // when 表达式保证穷举，新增分支编译期强制
    FeedItem.Skeleton -> null
    is FeedItem.Post  -> item.title
    is FeedItem.Ad    -> null
}
```

- 高级语法用于“让表达更精确”，不是为了炫技；若一个特性让读者需要查文档才能看懂，优先用更直白的写法。

## 5. 类型系统与内存

### 5.1 不可变

- 优先 `val`、`data class` 与不可变集合，减少状态面。
- 需要状态时，用 `StateFlow` 或最小 `mutableStateOf`，收敛到唯一 owner。

### 5.2 null 安全

- 编译期 null 安全为主；与 Java 互操作处开启 `-Xjsr305=strict`。
- 平台类型（`String!`）在边界立即转成明确的 `String?`/`String`，不泄漏。
- 标准库 `require`/`check` 做前置/不变式校验。

```kotlin
fun connect(url: String): Connection {
    require(url.startsWith("https://")) { "仅支持 https 地址" }
    return Connection.open(url)
}
```

### 5.3 泛型与类型擦除

- 泛型上界用 `where T : Foo, T : Bar`；`inline`+`reified` 在需要具体类型时使用。
- 区分 `out`（协变读）与 `in`（逆变写），公开 API 用声明处型变即可。

```kotlin
inline fun <reified T> List<*>.filterIsInstance(): List<T> =
    this.filterIsInstance<T>()
```

### 5.4 内存与 GC

- Android 内存要点同 Java：避免 static 持有 Activity、注意大对象分页。
- 用 `Memory` 敏感的 LRU（如 `LruCache`）管理图片/缓存；及时释放调度器引用。
- 协程作用域与生命周期绑定，防止后台协程持有 View/Activity。

```kotlin
// 生命周期绑定：ViewModel 内部使用 viewModelScope
viewModelScope.launch {
    val data = repo.fetch(id)   // activity 销毁后自动取消
    _uiState.value = UiState.Success(data)
}
```

## 6. 错误处理

### 6.1 异常分级

| 层级       | 类型                    | 处理方式                         |
|------------|-------------------------|----------------------------------|
| 业务错误   | 自定义业务异常/校验异常 | 转成用户提示或状态码             |
| 系统错误   | IO/网络/序列化          | 重试或上报，不吞掉               |
| 编程错误   | IllegalArgumentException | fail-fast 尽早暴露                |

- 业务异常用自定义类携带结构化信息；不把异常当流程控制品。

### 6.2 对业务异常处理

- 服务层抛业务异常，UI 层在 catch 后转 `UiState.Error`。
- 协程内用 `try/catch` 或 `Result`，注意 `launch` 的异常需捕获以防崩溃。

```kotlin
suspend fun load(id: Long): UiState {
    return try {
        UiState.Success(repo.fetch(id))
    } catch (e: NotFoundException) {
        UiState.Error(e)          // 转成页面可展示状态
    } catch (e: IOException) {
        UiState.Error(e)
    }
}
```

### 6.3 Result 与可空

- 单结果可空用 `T?` 或 `Result<T>`；`Result` 用来表达业务成败而非异常栈。
- 避免 `!!`（非空断言），这是关闭编译期保护的信号。

```kotlin
fun parse(): Result<Int> = runCatching { text.toInt() }

val n = parse().getOrElse { 0 }   // 失败给默认值
```

## 7. 异步与并发

### 7.1 协程基础

- 用 `suspend` 写可挂起函数，`CoroutineScope` 提供生命周期；禁止裸 `GlobalScope`（生命周期不确定）。
- 调度器选择：IO/网络用 `Dispatchers.IO`，计算密集用 `Default`，UI 更新在主线程由框架保证。

```kotlin
callingScope.launch(Dispatchers.IO) {
    val rows = db.query()
    withContext(Dispatchers.Main) { render(rows) }
}
```

### 7.2 Flow 数据流

- 用 `Flow` 表达冷数据/事件流，`StateFlow` 表达可观测状态，`SharedFlow` 表达一次性事件。
- 收集状态用 `stateIn`/`collectAsState`；一次性事件用 `Channel` 接收。
- 禁止在 `collect` 内做耗时或无限循环。

```kotlin
val ticker: Flow<Long> = flow {
    var i = 0L
    while (true) {
        emit(i++)
        delay(1000)
    }
}

scope.launch {
    ticker.collect { println("tick=$it") }
}
```

### 7.3 并发与取消

- 多任务并发用 `async/await` 或 `flatMapConcat`；结构化并发保证子协程随父取消。
- 长循环确保可取消：检查 `coroutineContext.isActive` 或使用挂起 API。
- 共享可变状态用 `Mutex` 或不可变快照，避免多个协程乱写。

```kotlin
val deferred = CoroutineScope(Dispatchers.IO).async { fetchA() }
val b = fetchB()
val a = deferred.await()           // 并发的两个请求合并

val result = withContext(Dispatchers.Default + ctrl) {
    (1..1_000_000).sum().takeIf { isActive } // 可取消检查
}
```

## 8. 结构与架构

### 8.1 分层与模块

- 模块边界：`:app`（UI）、`:feature:*`（功能）、`:core:*`（复用能力）。
- 层内：`ui`（Compose/Activity）+ `domain`（用例/模型）+ `data`（Repository/数据源）。
- 依赖单向向内：UI 依赖 domain，domain 不依赖具体数据实现。

```
app/src/main/java/com/example/
├── ui/
│   ├── home/          # 页面与组件
│   └── navigation/    # 路由
├── domain/
│   ├── model/         # 领域模型（sealed/data class）
│   └── usecase/       # 用例
└── data/
    ├── repository/    # Repository 接口与实现
    └── local/ / remote/ # 本地/远程数据源
```

### 8.2 依赖注入

- 使用 Hilt 在 Android 侧做 DI，模块与 `@Provides` 集中；后端可用 Koin/Kodein。
- 一律构造器注入；函数从外部传入依赖以便测试 mock。

```kotlin
@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {
    @Provides
    @Singleton
    fun provideHttpClient(): OkHttpClient = OkHttpClient.Builder().build()
}
```

### 8.3 状态唯一 owner

- 一个状态只由单一 owner（ViewModel/Store）写入；其余只读。
- 单向数据流：事件→reduce 状态→UI 渲染，禁止多个写入路径。

## 9. Android Studio / Android 工程

### 9.1 Gradle + AGP 依赖版本管理

- 使用 Version Catalog 统一 AGP、Kotlin、AndroidX、Compose 的插件与依赖。
- `settings.gradle.kts` 注册插件仓库；根 `build.gradle.kts` 应用插件。
- 模块按功能划分为 `:app`、`:core-ui`、`:feature:login` 等。

```kotlin
// settings.gradle.kts
pluginManagement {
    repositories { google(); mavenCentral(); gradlePluginPortal() }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
}

// gradle/libs.versions.toml
[versions]
composeBom = "2025.06.00"
material3 = "1.5.0-alpha"      // Material 3 Expressive 实验性分支（见 9.11）
lifecycle = "2.8.6"
kotlin = "2.2.20"              // 与 Compose 编译器 Gradle 插件同版本

[libraries]
androidx-compose-bom = { module = "androidx.compose:compose-bom", version.ref = "composeBom" }
androidx-compose-material3 = { module = "androidx.compose.material3:material3", version.ref = "material3" }
```

### 9.2 AndroidX 选型

- AndroidX（`androidx.*`）替代 `android.support.*`；强制用新生命周期组件。
- UI 选型：Compose 优先，旧 Viexml 用 ViewBinding；状态用 `StateFlow`+`collectAsState`。
- 导航用 `Navigation Compose`，网络用 Retrofit，DI 用 Hilt。

```kotlin
// ViewBinding 便捷写法
private var _binding: ActivityMainBinding? = null
private val binding get() = _binding!!

override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    _binding = ActivityMainBinding.inflate(layoutInflater)
    setContentView(binding.root)
}
override fun onDestroy() { super.onDestroy(); _binding = null }
```

### 9.3 Activity/Fragment 生命周期

- 不在 `onCreate` 做耗时；数据与业务放 ViewModel，UI 用 repeatOnLifecycle 收集。
- Fragment 解耦 `viewLifecycleOwner`，避免在非活跃期更新 UI。

```kotlin
viewLifecycleOwner.lifecycleScope.launch {
    repeatOnLifecycle(Lifecycle.State.STARTED) {
        viewModel.uiState.collect { state -> render(state) }
    }
}
```

### 9.4 ViewModel + StateFlow

- UI 状态暴露只读 `StateFlow`，内部用 `MutableStateFlow`。
- 一次性事件用 `Channel`（不会重复消费）。

```kotlin
class MainViewModel(private val repo: Repo) : ViewModel() {
    private val _uiState = MutableStateFlow<UiState>(UiState.Loading)
    val uiState: StateFlow<UiState> = _uiState.asStateFlow()

    private val events = Channel<UiEvent>(Channel.BUFFERED)
    val eventFlow = events.receiveAsFlow()

    fun refresh() {
        viewModelScope.launch {
            _uiState.value = UiState.Loading
            _uiState.value = load()
        }
    }
}
```

### 9.5 Jetpack Compose 要点

- 声明式：`@Composable` 函数，状态提升到上层，事件回调下传。
- Material 3 采用 **Expressive 组件体系**（依赖 `1.5.0-alpha`，见 9.11）；传统 stable 组件仅在确实无等价物时使用，逐步淘汰（见 9.12）。
- 状态管理用 `remember { mutableStateOf(...) }`、`rememberSaveable`（跨配置）与 `derivedStateOf`。
- 重组最小化：避免昂贵计算在重组内重复，用稳定类型与 `remember`.

```kotlin
@Composable
fun LoginScreen(vm: LoginViewModel) {
    val email = rememberSaveable { mutableStateOf("") }
    val status by vm.status.collectAsState()

    OutlinedTextField(
        value = email.value,
        onValueChange = { email.value = it },
        label = { Text("邮箱") },
    )
    Button(onClick = { vm.login(email.value) }, enabled = status !is UiState.Loading) {
        Text("登录")
    }
}
```

### 9.6 AOSP/Android 命名与 XML 布局资源

- 布局前缀：`activity_`、`fragment_`、`item_`、`view_`；drawable `ic_`、`bg_`。
- ID 系统小写下划线蛇形；资源放 `res/values`，颜色字符串不硬编码。
- Drawable 可选 vector；主题样式抽到资源，不用内联 style 散落。

```xml
<!-- res/layout/activity_main.xml -->
<LinearLayout ...>
  <TextView
      android:id="@+id/tv_title"
      android:layout_width="wrap_content"
      android:layout_height="wrap_content"
      android:text="@string/app_name" />
  <Button
      android:id="@+id/btn_login"
      android:layout_width="wrap_content"
      android:layout_height="wrap_content"
      android:text="@string/login" />
</LinearLayout>
```

### 9.7 Manifest 配置

- 权限最小化；危险权限运行时请求。`exported` 必须显式，结合 intent-filter。
- `application` 设置 icon/label/theme；网络明文按环境受限。

```xml
<manifest package="com.example">
  <uses-permission android:name="android.permission.INTERNET" />
  <application
      android:theme="@style/Theme.Custom"
      android:label="@string/app_name"
      android:icon="@mipmap/ic_launcher">
    <activity android:name=".MainActivity" android:exported="true" />
  </application>
</manifest>
```

### 9.8 R8 / ProGuard

- Release 开 minify + shrinkResources；Reflection、协程、Serializable 需要 keep。
- Compose 场景确保 `compose-compiler` 与 Kotlin 版本匹配。
- proguard 规则集中维护，覆盖 Retrofit/OkHttp 等新增库。

```proguard
# proguard-rules.pro
-keep class com.example.domain.** { *; }
-keepclassmembers class ** {
    @kotlinx.serialization.Serializable <fields>;
}
```

### 9.9 单元测试 / Robolectric / Espresso

- 协程逻辑用 `runTest` 与 Fake 依赖；现场 Android 类用 Robolectric。
- UI 测试 Compose 用 `createComposeRule`，还可配 Espresso 交换。

```kotlin
@RunWith(AndroidJUnit4::class)
class LoginViewModelTest {
    @get:Rule val composeRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun `登录按钮存在`() {
        composeRule.onNodeWithText("登录").assertIsEnabled()
    }
}
```

### 9.10 Jetpack Compose 开发环境配置

- Kotlin ≥ 2.0 起 Compose 编译器随独立 Gradle 插件发布：模块应用 `org.jetbrains.kotlin.plugin.compose`，**不再设置** `composeOptions.kotlinCompilerExtensionVersion`，编译器版本由该插件版本决定，从根上避免 KGP 与实际编译器的版本错配。
- 仅在使用 UI 的模块开启 `buildFeatures { compose = true }`；纯业务模块不要开。
- Compose 结构化依赖统一走 Compose BOM；Material 3 单独指定版本（`1.5.0-alpha`，见 9.11），不与 BOM 混设导致覆盖失效。
- 用 `-opt-in=androidx.compose.material3.ExperimentalMaterial3ExpressiveApi` 统一放行 experimental 组件，并让 CI 的 `allWarningsAsErrors` 仍能暴露未收敛的 opt-in 使用点。

```kotlin
// 根 build.gradle.kts
plugins {
    id("org.jetbrains.kotlin.android") version "2.2.20" apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.2.20" apply false
}

// 模块 :app/build.gradle.kts
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")   // Compose 编译器 Gradle 插件（Kotlin 2.x 标配）
}
android {
    compileSdk = 35
    buildFeatures { compose = true }
    // composeOptions {} —— 无需再写 kotlinCompilerExtensionVersion
}
kotlin {
    compilerOptions {
        freeCompilerArgs.addAll(listOf(
            "-opt-in=androidx.compose.material3.ExperimentalMaterial3ExpressiveApi",
        ))
    }
}
dependencies {
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.material3)     // 1.5.0-alpha（Material 3 Expressive）
    debugImplementation(libs.androidx.compose.ui.tooling)
    debugImplementation(libs.androidx.compose.ui.testManifest)
}
```

### 9.11 Material 3 Expressive 全量组件体系（1.5.0-alpha）

- 定位：Material 3 Expressive 是 Material 3 的下一代表达性组件体系，覆盖**列表、卡片、按钮、输入、导航栏/抽屉/底部栏、对话框、日期/时间选择器**等全部大类，在排版、间距/填充、焦点与手势语义上系统化加强，同风格全局一致。
- 版本：将 `material3` 固定到实验性分支 **`1.5.0-alpha`**（`androidx.compose.material3:material3:1.5.0-alpha`）。alpha 属预发布，API 可能随 alpha 版本调整——**只按本规范 pin 的该分支接入，不随意追新**；变更前先看 release notes / API diff。
- 接入方式：凡 expressive 已提供等价的组件，一律使用 expressive 组件；组件按“交互语义”分组选用，不按名称机械对应。
- experimental 组件必须 `@OptIn(ExperimentalMaterial3ExpressiveApi::class)`；已在模块级用 `-opt-in=` 统一开启时，可省略逐个注解但仍遵循 semantics。

```kotlin
@OptIn(ExperimentalMaterial3ExpressiveApi::class)   // 必须显式 opt-in（或模块级统一开启）
@Composable
fun ContactList(contacts: List<Contact>) {
    MaterialTheme {
        // 代表性写法：expressive 列表（精确签名/命名以所 pin 的 1.5.0-alpha 发布为准）
        ListRecord {
            contacts.forEach { c ->
                Record(
                    leading = Icon(Icons.Default.Person, contentDescription = c.name),
                    onClick = { openProfile(c.id) },
                ) {
                    Text(c.name)
                }
            }
        }
    }
}
```

- 全量覆盖虽广，仍建议**按需引入**：先用得上的 expressive 组件（列表/对话框/选择器），逐步铺开到其余大类，避免一次性大面积替换产生回归。

### 9.12 剔除已弃用的传统 Material 3 稳定组件

- 原则：Material 3 Expressive 中**已提供等价物**的传统（stable）Material 3 组件视为“弃用使用”。新代码一律使用 expressive 对应物；存量代码按下表逐步替换，且**不再新增对传统组件的引用**。
- 迁移以“交互语义”对齐，而非机械改名；替换后必须保持可访问性（焦点序、`contentDescription`、`onClick`/`toggleable`）与深色模式 token 不回退。

| 交互 / 场景 | 传统 Material 3（避免新增） | Expressive 做法 |
|---|---|---|
| 列表展示 / 单选多选 | 手写 `Row` + 传统列表项 | expressive 列表（如 `ListRecord`）＋预置排版/焦点语义 |
| 对话框 / 确认 | 传统 `AlertDialog` 手写布局 | expressive 对话框（排版与手势语义化） |
| 日期 / 时间选择 | 传统 `DatePicker` / `TimePicker` | expressive 选择器组件 |
| 顶层导航 | 传统 `TopAppBar`、`NavigationRail`/`NavigationBar` | expressive 导航组件（新焦点与手势） |
| 按钮家族 | 传统 `Button`/`FilledButton`/`IconButton` | expressive 按钮变体 |

> 表中 “expressive 组件”精确名称与入参以所 pin 的 `material3:1.5.0-alpha` 发布为准；本表用于迁移方向与验收标准，不确定项回查官方 release notes / API diff，不得凭感觉改写 API。

- 替换后统一回归三类检查：UI 测试（截图/关键交互）、无障碍（对讲焦点序与描述）、主题 token（`MaterialTheme` 边距/圆角/深色）覆盖 9.9 的 Compose/Espresso 用例。

## 10. 构建 / 测试 / 发布

- 常用 Gradle 任务：`assembleDebug`、`compileDebugKotlin`、`testDebugUnitTest`、`lintRelease`。
- CI 顺序：`clean` → `detekt`/`lint` → `test` → `assembleRelease`。
- 发布：签名文件不入库，CI 注入 `keystoreProperties`；版本语义化 + versionCode 递增。

```bash
./gradlew :app:compileDebugKotlin
./gradlew :app:testDebugUnitTest
./gradlew :app:assembleRelease
```

## 11. 安全与性能要点

### 11.1 密钥与鉴权

- Token/密钥不硬编码；Android 用 `BuildConfig` 不保留敏感值，或动态获取。
- 网络鉴权放拦截器；HTTPS 强校验证书，不信任任意 CA。

```kotlin
val client = OkHttpClient.Builder()
    .addInterceptor { chain ->                    // 统一注入 Authorization
        val request = chain.request().newBuilder()
            .header("Authorization", "Bearer ${Session.token()}")
            .build()
        chain.proceed(request)
    }
    .build()
```

### 11.2 网络安全配置

- 生产禁明文流量；用 network security config 限制二进制分发。
- Domain 白名单与 cleartext 明确为假。

```xml
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <domain-config cleartextTrafficPermitted="false">
        <domain includeSubdomains="true">api.example.com</domain>
    </domain-config>
</network-security-config>
```

### 11.3 Android 性能 / ANR / 卡顿

- 主线程不做 IO/网络/位图解码；用协程 + `Dispatchers.IO`。
- 警惕内存：静态引用 Activity、监听器未注销、超大位图。
- 列表用 RecyclerView + DiffUtil 或 LazyColumn 懒加载分页。

```kotlin
// 反例示例：主线程流量
lifecycleScope.launch {
    val image = downloadBitmap(url)   // 应切 Dispatchers.IO
    binding.image.setImageBitmap(image)
}
```

### 11.4 混淆加固

- Release 混淆开启并核对 keep，日志对凭证脱敏。
- 禁止 `print("token=...")` / 上报敏感信息。

## 12. 常见陷阱与反模式

1. 【陷阱】滥用 `!!` 关闭 null 检查导致运行时 NPE。
   - 修正：用 `?.`/`?:`/`run { }` 并显式降级。
2. 【陷阱】`GlobalScope.launch` 生命周期不确定泄漏。
   - 修正：绑定 `viewModelScope`/自定义 scope。
3. 【陷阱】在 collect 里做阻塞/网络请求。
   - 修正：collect 前 `mapLatest`/`flatMapLatest` 或切调度器。
4. 【陷阱】`data class` 含 `var` 且被多处修改，equals 数值不稳定。
   - 修正：改为 `val` 或拆分状态。
5. 【陷阱】sealed when 忘记穷举导致静默 fallback。
   - 修正：用 `when` 穷举表达式，新增分支编译保证。
6. 【陷阱】ViewModel 暴露可变 `MutableStateFlow` 给 UI 写。
   - 修正：用 `asStateFlow()` 暴露只读。
7. 【陷阱】Compose 在重组内做昂贵计算导致卡顿。
   - 修正：`remember`/`derivedStateOf`/提升状态。
8. 【陷阱】主线程调 IO/网络导致 ANR。
   - 修正：协程 `Dispatchers.IO` + 主线程回调。
9. 【陷阱】`shareIn/stateIn` 未设参数反复重入或无限流。
   - 修正：指定 `whileSubscribed()` 与 scope。
10. 【陷阱】反射/序列化数据类被 R8 混淆丢失。
    - 修正：添加 keep 规则。
11. 【陷阱】把所有东西做成扩展函数导致可读性差。
    - 修正：仅在语义清晰处使用。
12. 【陷阱】`let`/`also` 嵌套过深掩盖分支逻辑。
    - 修正：拆函数、用早期 return、`run` 合并。

```kotlin
// 反例：!! 与 GlobalScope
fun danger(id: String?) {
    GlobalScope.launch { fetch(id!!) }         // 反：可能 NPE 且泄漏
}
// 修正
fun safe(id: String?) {
    id ?: return
    viewModelScope.launch { fetch(id) }
}
```

## 13. 自查检查清单

- [ ] 命名符合第 3 章（类 UpperCamel、函数/变量 lowerCamel）。
- [ ] `val` 默认、`var` 仅明确可变；集合优先不可变。
- [ ] 可空类型显式 `?`，未滥用 `!!`。
- [ ] data/sealed class when 穷举处理。
- [ ] 协程绑定 scope，未用 `GlobalScope`。
- [ ] 主线程未执行 IO/网络。
- [ ] collect 未阻塞，Flow 用 stateIn/whileSubscribed 恰当。
- [ ] 状态暴露只读 `StateFlow`，一次性事件用 Channel。
- [ ] Compose 状态用 remember/derivedStateOf，重组最小化。
- [ ] Compose 编译器用 Gradle 插件（`org.jetbrains.kotlin.plugin.compose`），未写 kotlinCompilerExtensionVersion。
- [ ] Material 3 固定 `1.5.0-alpha`，Expressive 组件按 9.11 接入，传统 stable 组件不再新增（9.12）。
- [ ] View 生命周期与协程取消绑定（viewLifecycleOwner）。
- [ ] 危险权限运行时请求，exported 显式。
- [ ] cleartext 按环境关闭，HTTPS 证书校验开启。
- [ ] 密钥/Token 未硬编码并被混淆保除。
- [ ] Release 混淆开启且反射/序列化有 keep。
- [ ] 测试覆盖协程/ViewModel 与核心逻辑。
- [ ] detekt/lint 无 error 告警。

## 14. 参考资料

- Kotlin 官方文档（kotlinlang.org）
- kotlinx.coroutines & kotlinx.serialization 指南
- Android 官方：Compose、ViewModel、Lifecycle
- Android Developers — Material 3 Expressive（release notes / API diff）
- JetBrains Kotlin Style Guide
- Detekt / Ktlint 官方规则