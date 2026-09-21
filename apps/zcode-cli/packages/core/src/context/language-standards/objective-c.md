# Objective-C 编码规范

> 适用于 Objective-C 工程(Apple 生态遗留/混合)。用户需求模糊时,先按本规范明确边界,再实现。

## 1. 风格与命名

- 遵循 Cocoa 命名:类/协议用 PascalCase(前缀如 `XX`),方法/消息用 camelCase,变量用小写开头。
- 缩进以仓库/`clang-format` 为准;中文注释,代码保留英文标识符。
- 方法与属性名自解释;`@property` 明确 `strong/weak/copy/assign` 与只读/读写。

## 2. 内存管理

- 在 ARC 下管理引用计数,避免循环引用:`delegate`/block 捕获用 `weak`(必要时 `unsafe_unretained`)。
- 区分自动释放池与长时间持有;大对象/后台任务注意生命周期。
- 不用手写 `retain/release`(除非关 ARC);注意对象在 `autoreleasepool` 中的边界。

## 3. 类型安全

- 使用对象类型与分类语义,正确使用 `instancetype`、`NSError**`,`nullability`(`nonnull/nullable`)标注。
- `NSNumber`/集合装箱语义;`NSString`、`NSDictionary` 判空与键缺失语义清楚。
- 数据契约用模型类并做校验,而非宽松的 `id`。

## 4. 错误处理

- 用 `NSError` 传递可恢复错误:`NSError **error` 弱连接失败;用域/错误码区分失败原因。
- 只在有能力恢复的边界捕获/处理;不吞错误;保留底层错误作为 cause。

## 5. 并发

- 主队列负责 UI;后台任务用 GCD(`dispatch_async`)网格明确优先级与 target queue。
- 用 `@property (atomic)` 或串行队列做线程安全;避免数据竞争;不要用 sleep 掩盖同步。

## 6. 构建 / 测试 / 工具

- 以仓库 Xcode 工程/脚本为准;行为变更补测试(XCTest);开启启用告警并满足。

## 7. 常见陷阱

- 循环引用与悬空对象;`nil` 消息返回值和大小写混用。
- 异常仅在边界线程间传递;多数框架错误是 `NSError` 而非 `NSException`。