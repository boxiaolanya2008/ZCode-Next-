# Objective-C 编码规范
> 本规范适用于以现代 Objective-C 编写的 iOS / macOS / watchOS / tvOS 客户端、库与桥接层,默认使用 ARC 且兼容 iOS 12 及以上部署目标。
> 文档面向仍以 Objective-C 为主的存量工程与桥接代码,同时也为 Swift 工程中「模块无法改写、必须直接调用」的 Objective-C 边界提供统一写法。
> 规范以 Apple「Programming with Objective-C」与 Clang ARCLanguage 文档为基础,兼顾 MRC 迁移、`NSError` 约定与 GCD 并发语义。
> 当工程逐步混编时,Objective-C 代码仍应保持不变式风格与属性语义,为 Swift 互操作留下清晰、可预测的接口。

## 1. 概述与使用时机

本章界定规范适用范围与优先级,避免在新代码中无意义地扩大 Objective-C 使用面。

- 新特性优先用 Swift 编写;确需写成 Objective-C 的场景包括:旧框架必须暴露的 API、对 ABI 稳定性敏感的二进制库、以及无法迁回 Swift 的存量模块。
- 规范适用于所有以 `.h`/`.m` 为扩展名的源文件,以及 `pch/precompiled header` 中的公共宏与导入声明。
- 核心原则:优先值语义与不可变性,减少对外可变属性;用属性声明而非裸 ivar;用块仿函数约定管理回调生命周期。
- 若工程仍运行在 MRC,应按第六点先迁移到 ARC 再开展新特性;新代码一律假设 ARC 开启。
- 回调块与代理模式下,生命周期与线程归属必须显式声明,这也是最容易引发崩溃的两处。

## 2. 环境与工具链

### 2.1 工具链与构建配置
- 编译使用 Xcode 最新稳定版的 Apple Clang;源码以 `-fobjc-arc` 编译,并在 build phase 中启用 `-fobjc-weak`。
- 统一在工程 Build Settings 中打开 `CLANG_ENABLE_MODULES`、`CLANG_WARN_OBJC_IMPLICIT_RETAIN_SELF`、`CLANG_WARN_UNREACHABLE_CODE` 等门禁告警。
- 使用 xcconfig 拆分编译参数,`CLANG_WARN_STRICT_PROTOTYPES`、`CLANG_WARN_BOOL_CONVERSION` 建议置为 YES。

```bash
# 编译命令行示例(实际使用 Xcode 或 xcodebuild)
xcrun clang -fobjc-arc -fmodules -I"./include" \
    -Wno-objc-missing-property-synthesis \
    -Werror -Wimplicit-retain-self \
    -framework Foundation -c Sources/Account.m -o build/Account.o

# 类型检查脚本可固化到 pre-commit
# xcrun clang -fsyntax-only -fobjc-arc Sources/*.m
```

### 2.2 风格工具
- 格式统一使用 clang-format,并提交 `.clang-format` 到仓库根目录,以保证跨机器、跨 CI 的一致性。
- 对既有历史代码允许先执行一次全量格式化提交,之后再进入常规门禁。

```yaml
# .clang-format 配置片段
BasedOnStyle: Google
ColumnLimit: 120
IndentWidth: 4
ObjCBlockIndentWidth: 4
AllowShortMethodsOnASingleLine: Never
ObjCSpaceAfterProperty: true
PointerAlignment: Left
```

### 2.3 测试框架
- 单元测试使用 XCTest(`XCTest/XCTest.h` 体系),依赖注入用构造器或属性注入,禁用全局单例细节依赖。
- 需要验证块回调与被调用顺序的场景使用 `expectationForNotification`/`fulfillment` 或 XCTestExpectation 超时控制。

## 3. 命名与风格

### 3.1 命名约定总表

| 类别 | 约定 | 示例 |
| --- | --- | --- |
| 类、协议、类别(Category) | 大驼峰 | `Account`, `ZLogoView` |
| 方法 | 小驼峰,动词引导 | `-fetchProfile`, `-layoutSubviews` |
| 属性 | 小驼峰,同类萧 NS 前缀可省 | `userID`, `isActive` |
| 局部变量 | 小驼峰 | `accountName`, `statusCode` |
| 常量 | 大驼峰前缀 + 描述符 | `kMaxRetryCount`, `KZXNotificationUserLoggedIn` |
| 枚举 | 类型前缀 + 小驼峰 case | `AccountRoleAdmin` |
| 布尔属性/方法 | 以 `is`/`has`/`should` 起 | `isEnabled`, `hasUnreadMessage` |
| 头文件宏 | 大写加下划线 | `KZX_NETWORK_TIMEOUT` |
| 分类名 | 大驼峰,避免泛词 | `ZLogoView+Layout` |
| 类型前缀 | 项目前缀统一(如 `KZX`/`Z`) | `KZXAccount`, `ZAPIError` |

### 3.2 属性声明的顺序与正反例
```objc
// 反例:裸 ivar 泄漏、无显式属性、命名含糊
@implementation KZXUserController {
    NSString *_userNameString;
}
@end

// 正例:对外属性清晰、内部可变性收敛
@interface KZXUserController ()
@property (nonatomic, readwrite, copy) NSString *displayName;
@property (nonatomic, strong, nullable) NSURL *avatarURL;
@end
```

## 4. 语法与惯用法

### 4.1 类型与空值可空性
- 新头文件一律启用轻量泛型与 Nullability 注解(`NS_ASSUME_NONNULL_BEGIN`),用 `NS_SWIFT_NAME` 对齐 Swift 命名。
- 避免用 `nil` 值不断传递并判空;在边界一次性校验并尽早返回。

```objc
NS_ASSUME_NONNULL_BEGIN
@interface KZXAccount : NSObject
@property (nonatomic, readonly, copy) NSString *name;
- (nullable instancetype)initWithName:(nullable NSString *)name;
@end
NS_ASSUME_NONNULL_END
```
- 方法参数小时可声明为 `_Nullable`/`_Nonnull`,但大范围声明建议用 `NS_ASSUME_NONNULL_BEGIN/END` 包裹。

### 4.2 属性与容器
- 对外集合属性一律 `.copy` 不可变返回副本,可变性交给内部私有属性;数组/字典用轻量泛型标注元素类型。
- 集合枚举尽量用块遍历,注意用 `instance` 而非 `object` 减少与 C 类型混淆。

```objc
// 反例:直接暴露可变数组指针
@property (nonatomic, strong) NSMutableArray<NSString *> *items;

// 正例:外部只读拷贝,内部才持有可变副本
@interface KZXListModel : NSObject
@property (nonatomic, readonly, copy) NSArray<NSString *> *items;
@end

@implementation KZXListModel {
    NSMutableArray<NSString *> *_privateItems;
}
- (NSArray<NSString *> *)items { return [_privateItems copy]; }
@end
```

### 4.3 字符串与格式化
- 字符串拼接用 `stringWithFormat:`/`stringByAppendingString:`,避免在 format 字符串中拼接 user input 导致格式字符串注入。
- 本地化文案贯穿 `NSLocalizedString`,并给值域注释说明参数占位。

```objc
NSString *text = [NSString stringWithFormat:
                  NSLocalizedString(@"profile.error.retry", @"错误重试按钮文案"),
                  attemptCount];
// 反例:直接把用户输入塞进 format 极易注入与崩溃
// NSString *bad = [NSString stringWithFormat:userInput];
```

### 4.4 类别的使用
- 类别(Category)用于为既有 Objective-C 类补充分组方法;不要用类别覆盖(override)父类/主类已有实现,覆盖行为会导致不确定调用顺序。
- 命名遵循「类别名=用途」,一个类别尽量聚焦一类能力,且方法带项目前缀,避免冲突。

```objc
// 反例:覆盖系统方法,行为不确定
@implementation NSString (MyHack)
- (NSString *)uppercaseString { return [self lowercaseString]; } // 严禁
@end

// 正例:只补充新增能力并加前缀
@implementation NSString (ZXValidators)
- (BOOL)zx_isValidEmail { return [self containsString:@"@"]; }
@end
```

### 4.5 枚举与位掩码
- 使用 `NS_ENUM`/`NS_OPTIONS` 宏声明,获得类型安全与自动计数;位掩码使用 `NS_OPTIONS`,值上限位宽可控。

```objc
typedef NS_ENUM(NSUInteger, KZXDownloadState) {
    KZXDownloadStateIdle,
    KZXDownloadStateDownloading,
    KZXDownloadStateDone,
};

typedef NS_OPTIONS(NSUInteger, KZXDownloadOptions) {
    KZXDownloadOptionNone = 0,
    KZXDownloadOptionResume = 1 << 0,
    KZXDownloadOptionVerify = 1 << 1,
};
```

### 4.6 Optional 空态约定
- 方法返回 `void***`/`NSError**` 的回参用于错误;返回性空值统一 `nullable`,`nil` 语义表示「无结果」而非错误发生。
- 判空别用 `== 0` / `!= nil` 混在布林逻辑,分别用 `isKindOfClass:` 与 `isEqual:` 做类型/值比较。

## 5. 类型系统与内存

### 5.1 ARC 与内存修饰词

| 修饰符 | 含义 | 使用时机 |
| --- | --- | --- |
| `strong` | 默认对象强持有 | 大部分属性 |
| `weak` | 弱引用,对象释放自动变 nil | delegate、collectionView 的 dataSource 等避免循环 |
| `unsafe_unretained` | 弱引用但不自动置 nil | 非对象或旧代码,慎用 |
| `assign` | 标量赋值 | `NSInteger`/`CGFloat` 等数值属性 |
| `copy` | 拷贝传递 | `NSString`/`NSArray` 或外部可变对象 |
| `atomic/nonatomic` | 原子性 | UI 与容器属性一律 `nonatomic` 由职责方加锁 |

```objc
@interface KZXViewController : NSObject
@property (nonatomic, weak, nullable) id<KZXDelegate> delegate;   // 避免 delegate 循环
@property (nonatomic, copy) NSString *title;                       // 拷贝防御外部可变
@property (nonatomic, assign) CGFloat cornerRadius;                // 纯标量
@property (nonatomic, strong, nullable) UIImage *placeholderImage;
@end
```

### 5.2 值语义与不可变性
- 对外暴露的模型尽量不可变(只读属性 + 唯一 init),需要更新时返回新实例或用 Builder;避免把可变返回出去被外部改写。
- 需要值拷贝语义的模型实现 `copyWithZone:` 并声明 `NSCopying`。

```objc
@interface KZXPoint : NSObject <NSCopying>
@property (nonatomic, readonly) CGFloat x;
@property (nonatomic, readonly) CGFloat y;
- (instancetype)initWithX:(CGFloat)x y:(CGFloat)y;
@end

@implementation KZXPoint
- (id)copyWithZone:(NSZone *)zone {
    return [[KZXPoint alloc] initWithX:self.x y:self.y];
}
@end
```

### 5.3 弱引用与另一方强持有
- `weak` 属性在 ARC 下自动置 nil,访问时用临时强引用再操作,避免在访问过程中对象被释放。
- 块回调里捕获 `self` 会增强持有,形成循环引用;用 `__weak typeof(self) weakSelf = self` 在块外包好,进入块后再 `strongSelf` 恢复。

```objc
NSBlockOperation *op = ...;
__weak typeof(self) weakSelf = self;
[op setCompletionBlock:^{
    __strong typeof(self) strongSelf = weakSelf;
    if (strongSelf == nil) return; // 避免悬垂访问
    [strongSelf didFinishDownload];
}];
```

### 5.4 泛型与协议关联
- 容器泛型在 `@interface` 声明元素类型(`NSArray<NSString *>`),工具箱类用 `instancetype` 返回,保证链式方法类型正确。

```objc
@interface KZXMatrixTranscoder : NSObject
- (instancetype)initWithEntries:(NSArray<NSDictionary<NSString *, NSString *> *> *)entries;
@end
```

## 6. 错误处理

### 6.1 NSError 的传递约定
- 凡是 `void` 成功 / `BOOL` 失败且可能带错误信息的接口,用 `NSError * __autoreleasing *` 双参返回;成功时传入指针不必要。
- 业务错误统一在自定义 error domain 中枚举,避免「魔法字符串」与全局常量泛滥。

```objc
NSString * const KZXNetworkingErrorDomain = @"com.example.networking.ErrorDomain";
typedef NS_ENUM(NSInteger, KZXNetworkingErrorCode) {
    KZXNetworkingErrorCodeTimedOut,
    KZXNetworkingErrorCodeStatus4xx,
};

- (BOOL)downloadToURL:(NSURL *)destination
                error:(NSError * _Nullable * _Nullable)error {
    NSError *inner = nil;
    BOOL ok = [self _performTransfer:&inner];
    if (!ok && error) { *error = inner ?: [self _makeError:...]; }
    return ok;
}
```

### 6.2 调用方判错与恢复
- 调用失败必须先检查返回值,再决定是否读取 error;不能认为 `error` 传 NULL 表示成功。
- 可恢复的错误降级处理,不可恢复的向上抛出;避免「吞掉一切错误」或「裸崩遍历所有 case」。

```objc
NSError *err = nil;
BOOL ok = [downloader downloadToURL:dest error:&err];
if (ok == NO) {
    if (err.code == KZXNetworkingErrorCodeTimedOut) {
        [self scheduleRetryFor:dest];
    } else {
        return [self presentFailure:err];   // 交给上层决策
    }
}
```

### 6.3 NSError userInfo 与本地化
- 使用 `NSLocalizedFailureReasonErrorKey`/`NSLocalizedDescriptionKey` 填充 userInfo,让上层不必理解 enum 即可展示。

```objc
NSError *e = [NSError errorWithDomain:KZXNetworkingErrorDomain
                                code:KZXNetworkingErrorCodeStatus4xx
                            userInfo:@{
        NSLocalizedDescriptionKey: NSLocalizedString(@"net.4xx", nil),
    }];
```

## 7. 异步与并发

### 7.1 GCD 基础
- 队列一律显式 `dispatch_queue_create`,不依赖默认并发队列类型假设;隔离数据用串行私有队列(manually-serialized),避免主队列误用。
- 线程安全的状态访问收敛到同一串行队列,禁止跨队列直接修改共享 ivar。

```objc
@property (nonatomic, strong) dispatch_queue_t syncQueue;
- (instancetype)init {
    self = [super init];
    if (self) {
        _syncQueue = dispatch_queue_create("com.example.cache.sync", DISPATCH_QUEUE_SERIAL);
    }
    return self;
}
- (void)setCachedObject:(id)obj {
    dispatch_async(self.syncQueue, ^{
        // 只有 syncQueue 内才可安全读写 _cache
        self->_cache = [obj copy];
    });
}
```

### 7.2 主线程与 UI
- 除明确标注「允许后台」的接口外,UI 更新一律 `dispatch_async` 到主队列;判断需回主线程时用 `dispatch_assert_queue` 支监视。
- 长时间计算(解码、重排序)用 `dispatch_async` 丢到全局并发队列,完成后回主线程刷新;避免在主线程 http 同步。

```objc
dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    UIImage *image = [self _expensiveDecode:data];
    dispatch_async(dispatch_get_main_queue(), ^{
        self.imageView.image = image; // 只在主线程改 UI
    });
});
```

### 7.3 块回调与生命周期
- 块可能被任意线程执行,回调里访问 UI/单例状态前先判断 `[NSThread isMainThread]` 或主动回主线程。
- 若回调可能晚于对象释放,配合 `__weak` 与块内的强引用检查再执行副作用。

### 7.4 并发容器
- 需要并发读写的字典/数组用 `dispatch_queue_t` 私有串行或读多写少时用 `dispatch_barrier` 配合并发队列;不要依赖 `NSMutableDictionary` 的并发安全假设。

## 8. 结构与架构

### 8.1 目录与模块划分
- 面向「职责单一」拆分:Models / Services / Views / ViewControllers / Utils,私密实现尽量放 `_internal` 子目录并通过 `import` 局部共享。
- 头文件只暴露协议与最小属性,其他声明放 `.m` 内 `class extension`,降低编译耦合。

```objectivec
App/
├── Models/
│   ├── KZXAccount.h
│   └── KZXAccount.m
├── Services/
│   ├── KZXProfileService.h
│   └── KZXProfileService.m
├── ViewControllers/
│   ├── KZXSettingsViewController.h
│   └── KZXSettingsViewController.m
├── Views/
│   └── KZXButton.h
└── Support/
    └── KZXLogger.h
```

### 8.2 协议契约与依赖注入
- 跨模块协作依赖协议(`@protocol`),构造器注入实现;避免对象内部 `alloc init` 具体类型导致不可测试。

```objc
@protocol KZXProfileProviding <NSObject>
- (KZXAccount *)currentAccount;
@end

@interface KZXProfileViewController : NSObject
- (instancetype)initWithProvider:(id<KZXProfileProviding>)provider;
@end
```

### 8.3 状态唯一 owner
- 同一条数据只允许一个明确对象写入;其余读取方通过只读属性或异步接口获取,杜绝「一个全局字典被多个对象同时 set」。

## 9. 构建 / 测试 / 发布

### 9.1 构建配置
- 统一用 xcodeproject + xcconfig 管理,Release 打开 `ENABLE_STRICT_OBJC_MSGSEND`、`CLANG_ENABLE_MODULES`,并固定 deployment target。

```bash
# CI 示例(编译 + 测试)
xcodebuild -workspace App.xcworkspace -scheme App -configuration Debug \
  -destination 'platform=iOS Simulator,name=iPhone 15' \
  -derivedDataPath build test | xcbeautify
```

### 9.2 测试写法
- 测试类继承 `XCTestCase`,命名与被测域对应;测试特例命名体现意图,断言命中而非仅作摆设。

```objc
#import <XCTest/XCTest.h>
#import "KZXAccount.h"

@interface KZXAccountTests : XCTestCase
@end

@implementation KZXAccountTests
- (void)testNameIsTrimmed { /* 创建对象并断言 name */ }
- (void)testNilNameReturnsNilValue { /* 边界场景 */ }
@end
```

### 9.3 发布门禁
- 提测前固定 clang-format、静态分析(`analyze`)与全量测试为绿色;审计 category 覆盖项与头文件泄漏情况后打 tag 发布。

## 10. 安全与性能要点

### 10.1 内存与生命周期安全
- 防止 retain cycle:delegate/IPC 回调用 `weak`;块里 `__weak self`;全局同步所用长生命周期对象不做循环强持有。
- 遍历可变集合时禁止修改集合,如需在遍历中增删,先拷贝一份或收集待删索引。

```objc
NSMutableArray *deletable = [NSMutableArray array];
for (KZXItem *item in _items) {
    if (item.isExpired) { [deletable addObject:item]; }
}
[_items removeObjectsInArray:deletable];
```

### 10.2 隐私与敏感数据
- 不在 `NSLog`/`print` 输出令牌与密码;使用 `NSLog` 时结构化格式避免机密信息进入崩溃日志。
- 避免把密码/Token 存进 `NSUserDefaults` 明文;优先使用 Keychain 或系统安全存储,并遵循数据最小化。

```objc
// 反例:把 accessToken 直接打到日志
// NSLog(@"token=%@", self.accessToken);
// 正例:打脱敏或仅打存在性
NSLog(@"token=%@", self.accessToken ? @"<present>" : @"<nil>");
```

### 10.3 性能注意
- 热路径避免频繁创建 autorelease 对象、过深的 `NSArray`/`NSMutableArray` 深拷贝;高频枚举用 C 数组或 `for (NSString *s in array)` 块遍历。
- 主线程不做大文件同步 IO 与整形解析,用异步队列与分批处理;UI 重绘用 `setNeedsDisplay` 合并。

## 11. 常见陷阱与反模式

### 11.1 陷阱
【陷阱】delegate 用 `strong` 造成循环引用,视图控制器无法释放。
```objectivec
// 修正:delegate/dataSource 一律 weak 持有权自上层
@property (nonatomic, weak) id<KZXDelegate> delegate;
```

【陷阱】块内直接捕获 `self` 并持有,形成 retain cycle。
```objectivec
// 修正:__weak + 块内 strongSelf 恢复
__weak typeof(self) ws = self;
[self doWork:^{ __strong typeof(self) s = ws; if (!s) return; [s reload]; }];
```

【陷阱】用 `==` 比较对象地址,混淆字符串值比较。
```objectivec
// 修正:用 isEqual: 比较值
if ([self.title isEqualToString:@"立即重试"]) { ... }
```

【陷阱】在遍历可变数组时增删元素导致崩溃或未定义行为。
```objectivec
// 修正:先收集待操作元素,循环结束后统一更新
NSMutableArray *removed = [NSMutableArray array];
for (KZXItem *it in items) if (it.deleted) [removed addObject:it];
[items removeObjectsInArray:removed];
```

【陷阱】不定参数(`va_list`)与 `NSString stringWithFormat:` 的格式化参数被传递 mismatch。
```objectivec
// 修正:确认占位符与实参一一对应,用 %@ 而非 %d 传对象
NSString *s = [NSString stringWithFormat:@"%ld %@", (long)count, name];
```

【陷阱】不检查返回值直接读取 `NSError**`,误把 error 判成成功依据。
```objectivec
// 修正:先判断返回值,错误仅作为补充信息
BOOL ok = [svc sync:&err];
if (!ok && err) { /* 处理错误 */ }
```

【陷阱】MVVM 不封装的裸 ivar 跨线程读写导致数据竞争。
```objectivec
// 修正:属性 + atomic 或私有串行队列收敛写入
@property (atomic, strong, nullable) id cache;
```

【陷阱】块遍历里捕获局部循环变量,共享变量最后值。
```objectivec
// 修正:使用 __block 明确捕获语义或局部副本
__block NSUInteger successCount = 0;
```

【陷阱】寄默把 `typedef unsigned` 塞 `NSUInteger` 用作位掩码,溢出未定义。
```objectivec
// 修正:使用 NS_OPTIONS 并用 1 << n 组合,注意位宽不超 n
typedef NS_OPTIONS(NSUInteger, KZXFLAGS) { KZXFlagA = 1 << 0, KZXFlagB = 1 << 1 };
```

【陷阱】过度使用 `PerformSelector` NSInvocation 导致编译期无从检查。
```objectivec
// 修正:优先协议方法调用,保持引用计数与签名可检查
[self.delegate didFinishLoadingData];
```

【陷阱】全局单例持有大量可变状态且无串行队列,导致多线程竞态。
```objectivec
// 修正:私有串行 queue + barrier 读多 / 写少
dispatch_barrier_async(self.queue, ^{ self._shared = value; });
```

【陷阱】`NSTimer` 强引用 target 且未 invalidate,导致对象不释放。
```objectivec
// 修正:使用 block-based timer 并在 dealloc 中 invalidate
NSTimer *t = [NSTimer timerWithTimeInterval:1.0 repeats:YES block:^(NSTimer *timer){ ... }];
```

### 11.2 反模式速览
- 以为例:用 `printf` 格式化、把 nil 当普通值、属性默认 `atomic` 在每个 UI 属性、把业务错误用字符串拼接代替 NSError 域——这些都必须评审否决。

## 12. 自查检查清单
- [ ] 所有源文件启用 `-fobjc-arc`,未混入 MRC 手动 retain/release?
- [ ] Nullability 注解(NS_ASSUME_NONNULL_BEGIN/END)覆盖新头文件?
- [ ] 集合属性 `.copy` 返回不可变副本,可变性收敛内部?
- [ ] 字符串用 `stringWithFormat:` 且本地化用 NSLocalizedString?
- [ ] 枚举用 `NS_ENUM`/`NS_OPTIONS`,未用裸 typedef?
- [ ] delegate/dataSource 属性 `weak`,未 `strong` 死锁循环?
- [ ] 块内 `__weak self` + 块内 `strongSelf` 恢复?
- [ ] 异步主线程回跳只回主队列,未后台改 UI?
- [ ] 可变状态由单一 owner 持有,无跨队列竞态?
- [ ] 错误传递统一 `NSError **` + domain/枚举,无魔法字符串?
- [ ] NSInteger 等值比较用 `==`,对象比较用 `isEqual:`?
- [ ] 遍历可变集合期间未增删元素?
- [ ] 未用 Category 覆盖既有系统算法方法?
- [ ] 定时器/通知在 dealloc 合理 invalidate/removeObserver?
- [ ] 私有 ivar 已收敛为属性,裸 ivar 暴露有限?
- [ ] 敏感数据(令牌/密码)未写入日志与明文 UserDefaults?
- [ ] Initialize 构造器注入依赖,而非全局单例散落?
- [ ] 文件命名与类名、前缀(工程级)一致?
- [ ] 静态分析(`xcrun clang ... --analyze`)零高危告警?
- [ ] 核心模块已补充 XCTest 测试且全部通过?

## 13. 参考资料
- Apple Programming with Objective-C:https://developer.apple.com/library/archive/documentation/Cocoa/Conceptual/ProgrammingWithObjectiveC/
- Clang Objective-C ARC 文档:https://clang.llvm.org/docs/AutomaticReferenceCounting.html
- Apple Memory Management Programming Guide:https://developer.apple.com/library/archive/documentation/Cocoa/Conceptual/MemoryMgmt/
- Grand Central Dispatch(Concurrency Programming Guide):https://developer.apple.com/library/archive/documentation/General/Conceptual/ConcurrencyProgrammingGuide/
- clang-format 配置说明:https://clang.llvm.org/docs/ClangFormat.html