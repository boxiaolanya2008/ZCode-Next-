# Scala 编写规范

> 适用于 Scala 工程(JVM、共 Scala 2/3)。用户需求模糊时,先按本规范明确 Scala 版本与编译目标,再实现。

## 1. 风格与命名

- 类型/对象/类用 PascalCase,方法/变量用 camelCase,常量/对象常量用 UPPER_SNAKE_CASE;包名小写。
- 缩进以仓库 `scalafmt` 配置为准;明确 Scala 2 与 Scala 3 语法差异;中文注释,代码保留英文标识符。

## 2. 类型与纯函数

- 多用不可变值与纯函数:`val` 优先于 `var`;集合用不可变默认(`List/Vector/Map`),减少副作用。
- 用 `Option`/`Either`/`Try` 表达可空与失败,避免例外滥用做流程控制。
- 类型层次通过 `sealed trait`/`enum` 表达;数据模型用 case class 的价值语义。

## 3. 函数式与效果

- 组合使用高阶函数(映射/展平/过滤)和模式匹配,保持可读;避免深层回调或"效应隐藏在返回值之外"。
- 效果管理与并发按工具链(Scala Future/Effect 库 ZIO/Cats Effect)选择,但都遵循统一语义:明确超时、取消、重试与资源 acquire/release。

## 4. 并发与异步

- 用 Future/效果类型表达异步;共享可变状态用 `synchronized`/`AtomicRef` 强化或收敛到单一 owner。
- 竞态、取消、资源释放不可用 sleep 掩盖;清晰传播。

## 5. 错误处理

- 用类型化错误表达失败(Either/自定义错误类型);只在有能力恢复处捕获/处理。
- 不吞错误;在边界把失败转成用户可操作的提示。

## 6. 结构 / 构建 / 测试

- 单文件 ≤ 400 行;按包拆分职责;业务逻辑与 I/O(DB/HTTP/文件)分离收敛到 service/adapter。
- 以仓库 `build.sbt` 或 Gradle 为准;行为变更补测试(ScalaTest/MUnit)。

## 7. 常见陷阱

- 隐式作用域空时造成困惑;占位符 `_` 语义与 eta 展开；`Either` 左/右类型自动提升谬误。
- 惰性集合重复求值;并发共享可变状态竞态；case class 复制开销。