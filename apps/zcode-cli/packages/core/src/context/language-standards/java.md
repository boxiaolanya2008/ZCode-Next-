# Java 编码规范

> 本文档面向使用 Java 开发 Android 应用与后端服务的团队，适用于 Java 8.0 及以上、主推 Java 17/21 LTS 的工程。其目标不是枚举所有语法特性，而是统一代码风格、工程组织、并发模型、异常策略与 Android 权限/生命周期等落地约定，让代码可读、可测试、可维护。所有规范在允许情况下给出可直接执行的“怎么做”，并提供可编译的运行示例。若个别条目与你所在模块的既有约定冲突，以本文档为准并更新模块内废弃约定。

## 1. 概述与使用时机

- 本文档在你编写 Java 源码、构建脚本、资源文件与测试代码时生效；不作为阅读指南，而是作为审查标准。
- 适合你的仓库/模块若已有遵循本规范的代码，应保持一致性；新代码一律按本文档执行。
- 当 Java 版本升级（例如 11→21）、引入新库框架或迁移到新 Android 构建系统时，先按第 2、10 节更新工具链，再批量重构存量代码。
- 本文档与 Kotlin 编码规范配套：同一模块内可使用混编（Java + Kotlin），但各语言内部遵守各自的 section 约定，调用边界保持显式接口。
- 本规范章节顺序：环境与工具 → 命名风格 → 语法惯用 → 类型与内存 → 错误处理 → 异步并发 → 结构与架构 → Android 工程 → 构建发布 → 安全性能 → 反模式 → 自查清单。

## 2. 环境与工具链

### 2.1 JDK 与 Gradle

- 后端与 Android 工程统一使用 LTS JDK，推荐 JDK 17 或 JDK 21；Android 场景强制使用 AGP 所要求的最低版本，同时打开 `compileOptions` 锁定 release/target version。
- 使用统一版本目录（Gradle Version Catalog `libs.versions.toml`）管理依赖版本，不散落写死在 `build.gradle` 里。
- Gradle 主推 8.x，wrapper 提交进仓库（`gradle/wrapper/`），保证团队/CI 构建一致。

```java
// build.gradle（模块级节选）
android {
  compileSdk = 35                    // 按 AGP 支持的最高 stable 调整
  defaultConfig {
    minSdk = 26
    targetSdk = 35
  }
  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }
}
```

### 2.2 包管理

- Java/JVM 依赖用 Gradle + Maven Central/Google maven；若要锁版本，使用 `gradle.lockfile`。
- Android 依赖只从 `google()` 与 `mavenCentral()` 拉取，不混用临时仓库（安全性存疑）。
- 依赖均通过 Version Catalog 声明，示例见下。

```toml
# gradle/libs.versions.toml
[versions]
agp = "8.6.0"
androidx-core = "1.15.0"
junit = "5.10.2"

[libraries]
androidx-core-ktx = { group = "androidx.core", name = "core", version.ref = "androidx-core" }
junit5 = { group = "org.junit.jupiter", name = "junit-jupiter", version.ref = "junit" }
```

### 2.3 格式化与静态分析

- 使用 Spotless + Google Java Format 保证格式统一；`spotlessCheck` 进 CI。
- 使用 Error Prone 或 PMD 做静态分析，生命周期上 run 于 `check`。
- Android 场景额外使用 Lint（`lintDebug`/`lintRelease`），阻断 severity 为 error 的问题。

```bash
# 格式化并校验（根目录执行）
./gradlew spotlessApply
./gradlew spotlessCheck
./gradlew lintRelease
```

### 2.4 测试框架

- JUnit 5（Jupiter）为默认单测框架；Mockito 负责隔离；Android 侧用 Robolectric 跑本地类加载测试，UI 用 Espresso。
- 使用 AssertJ 语义化断言提升可读性，不写裸 `assertEquals` 大量拼装。

```java
import static org.assertj.core.api.Assertions.assertThat;

List<Integer> list = List.of(1, 2, 3);
assertThat(list).hasSize(3).containsExactly(1, 2, 3);
```

## 3. 命名与风格

### 3.1 命名约定表

| 元素         | 约定                         | 示例                        |
|--------------|------------------------------|------------------------------|
| 包名         | 全小写点分                 | `com.example.feature.user`  |
| 类/接口     | UpperCamelCase              | `UserService`                |
| 局部变量/字段 | lowerCamelCase              | `userName`                   |
| 常量/枚举值 | 全大写下划线                | `MAX_RETRY`                  |
| 方法         | lowerCamelCase，动词开头    | `getUserById`                |
| 注解         | UpperCamelCase（常用 @Xxx） | `@Service`                   |
| 类型参数     | 单大写字母或描述性          | `T`, `E`, `K`, `V`          |
| 静态工厂     | `of`/`from`/`valueOf`       | `LocalDate.of(2026, 1, 1)`   |

### 3.2 风格正例与反例

```java
// 正例：清晰、语义化的命名
public final class OrderService {
  private static final int DEFAULT_PAGE_SIZE = 20;   // 常量全大写
  private final OrderRepository repo;

  public Order createOrder(CustomerId customerId, List<LineItem> items) {
    Order order = new Order();
    order.assignItems(items);
    return repo.save(order);
  }
}
```

```java
// 反例：缩写、无意义命名、魔法数字
public final class OS {
  private int d;                      // 反：d 含义不明
  public void doStuff(int x, int y) { // 反：x/y 无业务语义
    if (y > 20) reorder(x);           // 反：20 是魔法数字
  }
}
```

### 3.3 风格与格式

- 缩进 4 空格，UTF-8 编码，行宽 ≤120。
- 花括号换行风格采用 K&R（左花括号同行）；if/for/while 即使单行也加花括号。
- 包导入按 `java.*` → `javax.*` → 第三方 → 本地包分组，组间空一行，静态导入置于最前。

## 4. 语法与惯用法

### 4.1 类型

- 优先使用不可变类型 `record`、`List.of`、`String`；可变状态尽量局部化。
- 使用 `var` 时机：局部变量类型可从右侧明显推断时，允许 `var`；严禁用于 API 返回或模糊可读性场景。

```java
var users = userRepo.findTop(10);            // 类型可从右推断，OK
Map<String, List<User>> index = userRepo.indexByName(); // 泛型明显，保留显式类型更清晰
```

### 4.2 集合

- 用接口类型声明（`List`、`Set`、`Map`），具体实现放右侧。
- 不返回裸 `null` 集合；空集合用 `Collections.emptyList()` 或 `List.of()`。
- 遍历时尽量用增强 for 或 stream，避免手写索引。

```java
List<String> names = users.stream()
    .filter(u -> u.isActive())
    .map(User::name)
    .toList();               // Java 16+ 的 toList() 返回不可变 list
```

### 4.3 字符串

- 字符串拼接优先用 `StringBuilder`（循环内）或 `String.format`（模板）；Java 21 可用文本块 `"""`。
- 判空统一 `Objects.toString` / `isBlank()`，避免 NPE 级联。

```java
// Java 15+ 文本块
String sql = """
    SELECT id, name
    FROM t_user
    WHERE status = 'ACTIVE'
    """;
// 循环拼接用 StringBuilder
StringBuilder sb = new StringBuilder();
for (String part : parts) {
  sb.append(part).append(',');
}
```

### 4.4 类与对象

- 类默认不可变优先（字段 final、无 setter）；POJO 转换统一用构造器或工厂。
- 方法应短小（尽量 <20 行），单一职责。
- 优先组合而非继承；为继承开放时显式用 `sealed` 或设计好模板方法。

```java
public final class Address {            // 不可变对象
  private final String city;
  private final String zip;
  public Address(String city, String zip) {
    this.city = Objects.requireNonNull(city);
    this.zip = Objects.requireNonNull(zip);
  }
  public String city() { return city; }
}
```

### 4.5 记录与枚举

- 数据载体优先用 `record`；状态机类用 `enum`。
- 枚举携带业务字段与行为，避免用 `if(type==X)` 散落判断。

```java
public record OrderSnapshot(String id, long totalCents) {}

public enum OrderState {
  NEW("待处理"),
  PAID("已支付");
  private final String label;
  OrderState(String label) { this.label = label; }
  public String label() { return label; }
}
```

### 4.6 泛型

- 读侧用 `extends` 通配，写侧用 `super` 通配（PECS）。
- 泛型方法绝不返回裸类型；必要时使用 bounded wildcard。

```java
public static <T> void copy(List<? extends T> src, List<? super T> dst) {
  dst.addAll(src);                 // PECS：读 extends，写 super
}
```

## 5. 类型系统与内存

### 5.1 不可变

- 优先 `record` 与 `final` 字段，减少副作用。
- 需要可变程序状态时，封装在最小作用域，并集中在一个 owner（见第 8 章）。

### 5.2 null 安全

- 方法返回可空时优先用 `Optional` 表达；参数禁止传入 null，用 `Objects.requireNonNull` 快速失败。
- 集合元素勿用 null；`List.of()` 本身不支持 null，可直接用。

```java
public Optional<User> findByName(String name) {
  User u = repo.find(name);
  return Optional.ofNullable(u);
}
// 调用方
User u = findByName("alice").orElseThrow(() -> new NotFoundException("user"));
```

### 5.3 泛型与类型擦除

- 不依赖 `instanceof` 判断泛型具体类型；需要类型判断时改为调用方传入 `Class<T>` 或保留类型标记。

### 5.4 内存引用与 GC 要点

- Android 上避免静态持有 `Activity`/`View`/`Context`（Activity 泄漏），改用 `ApplicationContext` 或弱引用场景受限使用。
- 大 I/O 完成后及时关闭流（try-with-resources）。
- 敏感长生命周期对象考虑 SoftReference/WeakReference 缓存（如图片 LRU）。

```java
// try-with-resources 自动关闭
try (InputStream in = Files.newInputStream(Paths.get("a.txt"));
     BufferedReader br = new BufferedReader(new InputStreamReader(in))) {
  String line;
  while ((line = br.readLine()) != null) {
    System.out.println(line);
  }
} // IOException 自动关闭资源
```

## 6. 错误处理

### 6.1 异常分级

| 层级     | 类型                        | 处理方式                                   |
|----------|-----------------------------|--------------------------------------------|
| 可恢复   | 业务异常/校验异常           | 捕获并降级或提示用户                       |
| 系统错误 | `IOException`/`SQLException` | 上层重试或上报，不吞掉                     |
| 编程错误 | NPE/IllegalArg               | 尽早崩溃（fail-fast），便于定位            |

- 自定义异常继承 `RuntimeException`，携带明确的 message 与结构化字段。

### 6.2 业务异常与 Result

- 业务操作失败优先抛领域异常，由外层框架统一转成 HTTP/UI 状态码。
- 不希望抛异常时可用 `Result`/`Optional` 表达失败；但不要两者混用导致歧义。

```java
public final class ResourceNotFoundException extends RuntimeException {
  public ResourceNotFoundException(long id) {
    super("resource not found, id=" + id);
  }
}

// 服务层
public byte[] download(long id) throws IOException {
  Path p = locate(id);
  if (!Files.exists(p) || !Files.isRegularFile(p)) {
    throw new ResourceNotFoundException(id);
  }
  return Files.readAllBytes(p);
}
```

## 7. 异步与并发

### 7.1 CompletableFuture

- 后端组合异步任务用 `CompletableFuture`，链式用函数式组合，避免回调地狱。
- 展开/合并统一用 `thenCompose`/`thenCombine`；不阻塞主线程调用 `get()`。

```java
CompletableFuture<Price> priceFuture = fetchPriceAsync(id);
CompletableFuture<Stock> stockFuture = fetchStockAsync(id);
CompletableFuture<View> view = priceFuture.thenCombine(stockFuture,
    (price, stock) -> new View(price, stock))
    .exceptionally(ex -> View.failed(ex));
```

### 7.2 线程安全

- 共享可变状态加锁或改并发容器（`ConcurrentHashMap`）；只读数据公开不可变。
- 避免多重锁导致的死锁；锁顺序全局固定。
- 高并发计数/累加用 `LongAdder` 而非 `AtomicLong`。

```java
private final ConcurrentHashMap<String, LongAdder> counters = new ConcurrentHashMap<>();

public void inc(String key) {
  counters.computeIfAbsent(key, k -> new LongAdder()).increment();
}
```

### 7.3 线程池与取消

- 显式创建带命名、有界队列、拒绝策略的线程池，禁止 `Executors.newCachedThreadPool` 无边界使用。
- 支持取消的任务实现 `Future#cancel` 且内部检查 interrupted 标志。

```java
ExecutorService pool = new ThreadPoolExecutor(
    2, 4, 60, TimeUnit.SECONDS,
    new ArrayBlockingQueue<>(100),
    new ThreadFactoryBuilder().setNameFormat("task-%d").build(),
    new ThreadPoolExecutor.CallerRunsPolicy());
```

## 8. 结构与架构

### 8.1 分层

- 分层：`controller/api` → `service` → `repository/dao` → 基础设施（DB/网络）。
- 业务规则在 service 层，不泄漏到 controller；repository 只做持久化访问。
- 依赖方向单向向内，禁止 service 反向访问 controller。

```
src/main/java/com/example/
├── api/          # 接口/控制器，参数校验与 DTO 转换
├── domain/       # 领域模型：record/enum/业务异常
├── service/      # 用例编排与事务
├── repository/   # 持久化或外部数据访问
├── infrastructure/# 配置、工具、第三方适配
└── config/       # 装配、依赖注入
```

### 8.2 包组织与依赖注入

- 按领域（feature）划分包更利于演进；按技术分层只用于小模块。
- 依赖注入统一构造函数注入，禁用字段注入与静态单例全局可变态。
- 每一状态有唯一 owner（见 8.3），避免同一数据多条写入路径。

```java
@Component
public class OrderService {
  private final OrderRepository repo;       // 构造器注入
  private final PricePolicy pricePolicy;
  public OrderService(OrderRepository repo, PricePolicy pricePolicy) {
    this.repo = repo; this.pricePolicy = pricePolicy;
  }
}
```

### 8.3 状态唯一 owner

- 一个可变状态只有一个 owner 对象负责写入；其余模块只读或通过 owner 提供的接口变更。
- 状态变更走明确方法，禁止跨 owner 直接操作内部字段。

## 9. Android Studio / Android 工程

### 9.1 Gradle + AGP 依赖版本管理

- 使用 `libs.versions.toml` 统一管理 AGP、Kotlin、AndroidX 版本；单一事实来源。
- `settings.gradle.kts` 声明插件仓库；`build.gradle.kts`（根）通过 version catalog 引用。
- 模块命名 `:app`、`:core-ui`、`:feature:login` 等，体现模块边界，非功能命名。

```toml
# gradle/libs.versions.toml
[versions]
agp = "8.6.0"
kotlin = "2.0.20"
core = "1.15.0"
activity = "1.9.2"
lifecycle = "2.8.6"

[libraries]
androidx-core-ktx = { module = "androidx.core:core-ktx", version.ref = "core" }
androidx-activity = { module = "androidx.activity:activity", version.ref = "activity" }
androidx-lifecycle = { module = "androidx.lifecycle:lifecycle-viewmodel", version.ref = "lifecycle" }
```

### 9.2 AndroidX 选型

- 一律使用 AndroidX（`androidx.*`），禁止旧的 `android.support.*`。
- 组件选型：`ViewBinding`（替代 findViewById），`LiveData` 或 `StateFlow`（状态），`Lifecycle` 感知组件。
- 导航用官方 `Navigation`；网络用 Retrofit；DI 参考 Hilt。

```java
// 启用 ViewBinding
// android { buildFeatures { viewBinding = true } }
private ActivityMainBinding binding;
@Override
protected void onCreate(Bundle savedInstanceState) {
  super.onCreate(savedInstanceState);
  binding = ActivityMainBinding.inflate(getLayoutInflater());
  setContentView(binding.getRoot());
  binding.buttonSave.setOnClickListener(v -> save());
}
```

### 9.3 Activity/Fragment 生命周期

- 不在 `onCreate` 做耗时操作；将从属状态和重复初始化迁移到 `ViewModel`。
- Fragment 与 Activity 生命周期解耦：数据持有/业务放 ViewModel，UI 事件绑定用 `lifecycleScope`。
- 用 `repeatOnLifecycle` 收集 Flow，避免在非活跃期间持续更新 UI。

```java
@Override
public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
  super.onViewCreated(view, savedInstanceState);
  getLifecycle().addObserver(new LifecycleEventObserver() {
    @Override
    public void onStateChanged(@NonNull LifecycleOwner owner, @NonNull Lifecycle.Event event) {
      if (event == Lifecycle.Event.ON_START) { /* 恢复可观察操作 */ }
    }
  });
}
```

### 9.4 ViewModel + LiveData / StateFlow

- 状态集中于 `ViewModel`，UI 只读。
- 一次性事件用 Channel/Event 包装，避免重复消费。
- 状态变更时通过暴露只读 StateFlow 或 LiveData；绝不把 LiveData 暴露 setter。

```java
// 使用 ViewModel + LiveData
public class MainViewModel extends ViewModel {
  private final MutableLiveData<UiState> ui = new MutableLiveData<>();
  public LiveData<UiState> observeUi() { return ui; }

  public void refresh() {
    // 后台线程取数据后回调主线程
    Executors.newSingleThreadExecutor().execute(() -> {
      UiState s = heavyLoad();
      ui.postValue(s);   // 主线程安全提交
    });
  }
}
```

### 9.5 Jetpack Compose 要点

- 使用 Compose 声明式 UI：状态提升，`remember`/`mutableStateOf` 管理局部状态。
- 重组最小化：把昂贵计算放入 `remember` 或 `derivedStateOf`；使用稳定类型。
- 遵守单向数据流：UI 只发事件，状态由上层 Hoisting。

```kotlin
@Composable
fun Counter(onCountChange: (Int) -> Unit) {
  var count by remember { mutableStateOf(0) }
  Button(onClick = { count++; onCountChange(count) }) {
    Text("点击次数: $count")
  }
}
```

### 9.6 AOSP/Android 命名与 XML 布局资源

- 资源文件前缀命名：布局 `activity_`、`fragment_`、`item_`；drawable `ic_`、`bg_`。
- ID 命名小写下划线，如 `@+id/btn_submit`、`@+id/tv_title`。
- XML 布局外部样式走主题与 selector，硬编码颜色写进 `res/values/colors.xml`。

```xml
<!-- res/layout/activity_main.xml -->
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:orientation="vertical">
  <TextView
      android:id="@+id/tv_title"
      android:layout_width="wrap_content"
      android:layout_height="wrap_content"
      android:text="@string/app_name" />
  <Button
      android:id="@+id/btn_submit"
      android:layout_width="wrap_content"
      android:layout_height="wrap_content"
      android:text="@string/submit" />
</LinearLayout>
```

### 9.7 Manifest 配置

- 权限申请最小化运行；危险权限用 `requestPermissions` 运行时请求，不只在 Manifest 声明。
- `application` 标注 `label`、`icon`、`theme`，`exported` 明确为 true/false 防止隐式导出漏洞。
- 每个使用双网/明文需要显式配置 cleartext。

```xml
<!-- AndroidManifest.xml -->
<manifest>
  <uses-permission android:name="android.permission.INTERNET" />
  <application
      android:label="@string/app_name"
      android:icon="@mipmap/ic_launcher"
      android:theme="@style/Theme.MyApp">
    <activity android:name=".MainActivity" android:exported="true" />
  </application>
</manifest>
```

### 9.8 R8 / ProGuard

- Release 构建开启 minifyEnabled，用 R8 混淆+裁剪。
- 保留规则集中在 `proguard-rules.pro`；反射/Gson 数据类需 `-keep`。
- 混淆 map 文件保留在构建产物中便于回溯。

```proguard
# proguard-rules.pro
-keep class com.example.domain.** { *; }
-keepclassmembers class ** {
    @com.google.gson.annotations.SerializedName <fields>;
}
```

### 9.9 单元测试 / Robolectric / Espresso

- 纯逻辑放 JVM 单测，UI 交互用 Espresso。
- 需 Android 类但无设备时用 Robolectric 跑本地。
- 测试命名 `methodName_expected` 或 given-when-then。

```java
@RunWith(RobolectricTestRunner.class)
@Config(sdk = Build.VERSION_CODES.TIRAMISU)
public class MainActivityTest {
  @Test
  public void onStart_updatesTitle() {
    ActivityController<MainActivity> c =
      Robolectric.buildActivity(MainActivity.class).setup();
    MainActivity activity = c.get();
    activity.findViewById(R.id.tv_title);  // 验证视图绑定
  }
}
```

## 10. 构建 / 测试 / 发布

- 用 Gradle wrapper 命令，进入模块后执行任务。
- 常用任务：`./gradlew clean assembleDebug`、`./gradlew test`、`./gradlew lintRelease`。
- CI 步骤：`clean` → `lint` → `test` → `assemble` → 上传产物。

```bash
# 构建与测试
./gradlew :app:assembleDebug
./gradlew :app:testDebugUnitTest
./gradlew :app:lintRelease
./gradlew -Pci=true :app:connectedDebugAndroidTest   # 需要设备/模拟器
```

- 发布：Release 签名使用 `signingConfig`，密钥不提交仓库；CI 通过环境注入。
- 版本管理：versionName 语义化，versionCode 每次递增。

## 11. 安全与性能要点

### 11.1 密钥与鉴权

- 密钥、Token 不硬编码在源码或 git 仓库；使用 `BuildConfig`（不暴露敏感值）或动态获取。
- 网络鉴权统一放到拦截器；HTTPS 必开，校验证书链，不信任任意证书。

```java
OkHttpClient client = new OkHttpClient.Builder()
    .sslSocketFactory(sslConfig.socketFactory, trustManager)
    .addInterceptor(authInterceptor)   // 统一注入 token
    .build();
```

### 11.2 网络安全配置

- 使用 network security config 限制明文流量与可信 CA Domain。
- 生产环境 cleartext 关闭（`usesCleartextTraffic=false`）。

```xml
<!-- res/xml/network_security_config.xml -->
<network-security-config>
  <domain-config cleartextTrafficPermitted="false">
    <domain includeSubdomains="true">api.example.com</domain>
  </domain-config>
</network-security-config>
```

### 11.3 内存 / ANR / 卡顿

- 避免主线程做 IO、网络、Bitmap 解码；用 WorkManager/协程后台执行。
- 警惕内存泄漏：静态引用 Activity、非静态内部类持有外层、未注销监听器。
- 大数据集用分页 + RecyclerView 复用，避免一次性加载全部。

```java
// 易泄漏模式 —— 反例
static void bad() {
  MainActivity leaked = new MainActivity(); // static 持有实例，不触发收集
}
// 正例：监听器在 onDestroy 注销
@Override protected void onDestroy() {
  super.onDestroy();
  bus.unsubscribe(listener);
}
```

### 11.4 混淆加固

- Release 开启混淆并核对 keep；敏感逻辑不进白名单。
- 日志与崩溃上报需脱敏，禁止打印 Token、密码、身份证号。

## 12. 常见陷阱与反模式

1. 【陷阱】在 `onCreate`/主线程做网络请求导致 ANR。
   - 修正：线程池/协程 + 结果通过 UI 线程更新。
2. 【陷阱】全局 static 可变状态被多处写入，状态失控。
   - 修正：收敛到唯一 owner，提供受控 API。
3. 【陷阱】返回裸 `null` 集合导致调用方 NPE。
   - 修正：返回空集合，或 `Optional` 表达可空。
4. 【陷阱】`get()` 阻塞等待 Future 导致死锁/超时。
   - 修正：异步回调或 `thenApply` 链式组合。
5. 【陷阱】`CachedThreadPool` 无界并发打爆线程。
   - 修正：有界队列 + 命名工厂 + 拒绝策略。
6. 【陷阱】Activity 泄漏（static 持有 / 匿名监听器未注销）。
   - 修正：`ApplicationContext`，onDestroy 注销。
7. 【陷阱】吞异常只打 `catch(Exception e) {}` 空块。
   - 修正：至少记录 `logger.error("...", e)` 并按策略传播。
8. 【陷阱】反射/Gson 对象被 R8 混淆丢失字段。
   - 修正：添加 `-keep` 规则并在 proguard-rules 维护。
9. 【陷阱】手写字符串拼接 SQL 造成注入。
   - 修正：PreparedStatement 占位符参数化。
10. 【陷阱】多层嵌套 if/for（回调地狱）难读。
    - 修正：提取方法、stream、强制早返回。
11. 【陷阱】魔法数字/硬编码字符串散落。
    - 修正：常量、枚举、`strings.xml` 资源。
12. 【陷阱】混合 `Optional` 与 null 导致语义不清。
    - 修正：规范内统一（可选值用 Optional，否则 never null）。

```java
// 反例：吞异常
try {
  network.send(x);
} catch (Exception e) { /* 空，危险 */ }

// 修正：至少记录并决策
try {
  network.send(x);
} catch (IOException e) {
  logger.error("send failed, retrying", e);
  retry();
}
```

## 13. 自查检查清单

- [ ] 命名符合第 3 章（类 UpperCamel、方法动词、常量全大写）。
- [ ] 方法短小、功能单一，无深嵌套。
- [ ] 不可变优先：record/final，无无谓 setter。
- [ ] 集合返回空集合或 Optional，不返回裸 null。
- [ ] 字符串拼接循环内用 StringBuilder，模板用 format/文本块。
- [ ] 泛型使用 PECS 读写通配正确。
- [ ] 竞态变量已收敛到唯一 owner。
- [ ] 异常分级明确，未吞异常，业务异常自定义字段完整。
- [ ] 资源（流/数据库/网络）用 try-with-resources 关闭。
- [ ] 线程池有界、命名、拒绝策略明确。
- [ ] Android 未在主线程做 IO/网络。
- [ ] Android 未静态持有 Activity/Context。
- [ ] 危险权限运行时请求，非仅 Manifest。
- [ ] cleartext 已按环境配置，HTTPS 证书校验开启。
- [ ] 密钥/Token 未硬编码，未打印敏感数据。
- [ ] Release 混淆开启且反射/JSON 有 -keep。
- [ ] 测试覆盖核心业务逻辑，命名清晰。

## 14. 参考资料

- Oracle Java SE 文档（JDK 17/21）
- Android 官方文档（developer.android.com）：Gradle、Activity、ViewModel、Compose
- Jetpack 指南：Room、Navigation、Hilt
- Google Java Style Guide
- SonarSource Java Rules