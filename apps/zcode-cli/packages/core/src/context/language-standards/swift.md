# Swift 编码规范

> 适用于 Swift 工程(iOS/macOS、服务器 Vapor 等)。用户需求模糊时,先按本规范明确边界与目标平台/版本,再实现。

## 1. 风格与命名

- 遵循 Swift API 设计指南:类型/枚举用 PascalCase,方法/属性/变量用 camelCase,枚举 case 用小写驼峰。
- 协议命名以能表达能力(`Protocol` 后缀或行为名);派生类型与父类层次清晰。
- 缩进以仓库/`swift-format` 为准;中文注释,代码保留英文标识符。

## 2. 类型与安全性

- 充分利用值语义:结构体(`struct`)优先于类(`class`),用 `enum`(含关联值)表达一组状态。
- `Optional` 是唯一显式空值;不用强制解包 `!` 除非不变量保证;`guard let`/`if let` 解包。
- 值不可变用 `let`;集合/字典类型明确;避免隐式类型不匹配。
- 数据契约/跨进程边界用 `Codable` 并做运行时校验。

## 3. 内存与并发

- Swift 的 ARC 自动管理常规资源,但注意循环引用:使用 `weak`/`unowned` 打破闭包 capture 环路。
- 采用结构化并发(`async/await`、`Task`、`actor`)组织并发;UI 更新回到主队列/`@MainActor`。
- actor 用括号串行而非裸锁;显式取消(`Task`/`withTaskCancellationHandler`)而非掩蔽竞态。
- 避免在主线程执行阻塞 I/O。

## 4. 错误处理

- 用 `throw`/`Error` 枚举表达失败;`Result` 用于需要值化错误的 API。
- 用 `do-catch` 仅在有能力处理的边界捕获,保留错误上下文;不吞错误。
- 错误类型携带结构化字段;对外契约在边界做校验。

## 5. 结构与架构

- 单文件 ≤ 400 行;按目标/模块拆分,避免大文件堆职责。
- 协议(protocol)定义契约,依赖注入优于全局单例;业务逻辑与 I/O(网络/DB/文件)分离收敛到服务层。
- 保持数据与视图分离,遵循平台推荐的 MVVM/MVC 分层。

## 6. 构建 / 测试 / 工具

- 以仓库 `Package.swift`/Xcode 工程为准;行为变更补测试(XCTest/Swift Testing)。
- 引入依赖确认许可证与来源。

## 7. 常见陷阱

- 强制解包崩溃;`String`/`Int` 转换边界;可选链与若不具备值触发的流程误判。
- `@escaping` 闭包捕获导致循环引用;`Foundation` 时区/线程相关。