# C++ 编码规范

> 本规范适用于使用 C++20/23 开发的 C++ 代码库(桌面客户端、核心算法、性能敏感模块、跨平台二进制)。目标是让代码可读、可维护、线程安全,并充分利用现代 C++ 的 RAII、移动语义、协程与 Concepts 能力,同时避免反复踩到未定义行为与内存泄漏的陷阱。规范默认与 C++20 对齐,标注 `C++23` 的特性仅在你明确以 C++23 编译时允许使用。

## 1. 概述与使用时机

### 1.1 使用时机
- 当新增、修改或评审共享库、核心数据结构、算法实现、以及与性能或生命周期强相关的代码时,依据本规范执行。
- 本规范覆盖编译目标、工具链、命名、惯用法、类型系统、错误处理、并发、架构、构建测试、安全性能与反模式。
- 不适用于 C API 桥接层的极少插入点(该类代码需单独标注 `extern "C"` 并提供 RAII 封装)。

### 1.2 设计目标
- 优先级:正确性 > 可读性 > 性能。性能优化以基准数据为准,不预先优化(avoid premature optimization)。
- 默认栈分配与值语义;引用类型的生命周期交给 RAII 智能指针统一管理,不手写裸 `new`/`delete`。
- 编译期尽量消灭错误:用 `constexpr`、`Concepts`、`static_assert` 把非法用法挡在编译器,而不是留到运行时。

### 1.3 适用范围边界
- 跨模块边界(进程间 IPC、插件接口)使用稳定的 C ABI 或协议缓冲,内部函数间才使用 STL 与 C++ 惯用法。
- ABI 稳定的库对外暴露符号尽量精简;`-fvisibility=hidden` 配合显式导出。

## 2. 环境与工具链

### 2.1 编译器与标准
- 主编译器:GCC 13+、Clang 17+、MSVC 19.38(/std:c++20),统一使用 `-std=c++20`。
- `C++23` 特性(`std::expected`、`std::print`、`deducing this`)仅在 CMake 开启 `CXX_STANDARD 23` 的模块内使用。

### 2.2 CMake 配置示例
```cmake
cmake_minimum_required(VERSION 3.28)
project(my_server LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if(NOT MSVC)
    add_compile_options(-Wall -Wextra -Wpedantic -Wconversion
                        -Wshadow -Wnon-virtual-dtor -Wold-style-cast
                        -Wdouble-promotion -Wformat=2)
endif()

# 开启 sanitizer(仅在 Debug/Sanitizer 构建时)
option(ENABLE_ASAN "Enable AddressSanitizer" OFF)
if(ENABLE_ASAN)
    add_compile_options(-fsanitize=address,undefined -fno-omit-frame-pointer)
    add_link_options(-fsanitize=address,undefined)
endif()
```

### 2.3 静态分析(clang-tidy)
```yaml
# .clang-tidy
Checks: >
  -*,
  bugprone-*,
  performance-*,
  cppcoreguidelines-*,
  modernize-*,
  readability-identifier-naming,
  clang-analyzer-*,
  -cppcoreguidelines-avoid-magic-numbers,
  -readability-magic-numbers
WarningsAsErrors: '*'
```

运行方式:
```bash
# 生成编译数据库后执行
cmake -B build -DCMAKE_EXPORT_COMPILE_COMMANDS=ON
clang-tidy src/**/*.cpp -p build --config-file=.clang-tidy
```

### 2.4 格式化与预提交
- 使用 `clang-format`(`.clang-format`,基于 `BasedOnStyle: Google`,列宽 100),并在 git pre-commit 中强制执行:
```bash
find . -name '*.cpp' -o -name '*.hpp' -o -name '*.h' | xargs clang-format -i
```
- 成员变量统一后缀 `_`,以和局部变量区分。

### 2.5 测试框架
- 主测试框架选型:GoogleTest / Catch2 二选一,全仓统一,不混用。
```cmake
include(FetchContent)
FetchContent_Declare(googletest GIT_REPOSITORY https://github.com/google/googletest.git)
FetchContent_MakeAvailable(googletest)
```
```cpp
#include <gtest/gtest.h>
#include "core/calc.hpp"

TEST(CalcTest, AddsNumbers) {
  const int sum = core::add(2, 3);   // 被测函数
  EXPECT_EQ(sum, 5);
}
```

## 3. 命名与风格

### 3.1 命名约定
| 类别              | 规则                 | 示例                     |
| ----------------- | -------------------- | ------------------------ |
| 类型/类/枚举      | PascalCase           | `class HttpServer`       |
| 函数/方法         | 小驼峰               | `parseRequest()`         |
| 局部变量          | 小驼峰               | `int taskCount`          |
| 成员变量          | 小驼峰 + 下划线后缀  | `int count_`             |
| 常量/枚举值       | 全大写下划线         | `kMaxRetries` / `WAIT`   |
| 命名空间          | 全小写               | `namespace core`         |
| 文件             | 全小写下划线         | `http_server.cpp`        |
| 模板参数(类型)   | 大写单字母/语义 Pascal | `typename T` / `typename TAllocator` |
| 宏               | 全大写下划线(尽量不用) | `MY_GUARD`             |
| 私有成员访问器   | 小驼峰               | `count()` / `setCount()` |

### 3.2 头文件规范
- 每个头文件包含自足的头文件保护(优先 `#pragma once`)并确保可单独 `#include`。
- 使用前置声明减少依赖;头文件内不做 `using namespace std;`。

### 3.3 正反例
```cpp
// 反例:命名混乱、裸 new、无 const
class myserver {
public:
    void START();            // 命名不规范
    int process(char* buf);  // 入参缺 const,未传递所有权语义
};
myserver* s = new myserver();  // 应使用智能指针

// 正例
namespace net {

class HttpServer {
public:
    explicit HttpServer(std::string name);       // explicit 单参构造
    void start();                                // 小驼峰
    [[nodiscard]] std::size_t connections() const; // const + 消费返回值

private:
    std::string name_;
    std::size_t connections_ = 0;
};

}  // namespace net

auto server = std::make_unique<net::HttpServer>("main");  // RAII,无需 delete
```

## 4. 语法与惯用法

### 4.1 类型别名(auto 与 using)
- 用 `auto` 表达复杂的模板类型,但不要在明明有明确类型时隐瞒意图(例如枚举、`int` 不要 `auto`)。
- 用 `using` 替代 `typedef`。
```cpp
using RequestHandler = std::function<Response(const Request&)>;  // 语义化别名

auto& body = request.body();                  // 明确可读
const char* s = "hello";                       // 不必写成 auto* s
```

### 4.2 容器统一规则
- 默认 `std::vector`;需要有序或去重时才用 `std::map`/`std::set`;关联顺序用无序容器 `unordered_*`。
- 遍历容器用 range-for 而非下标,优先引用避免拷贝。
```cpp
std::vector<std::string> files{...};
for (const std::string& f : files) {   // 引用,避免每次拷贝
    process(f);
}
```
- 移除元素使用 erase-remove 惯用法。
```cpp
files.erase(std::remove_if(files.begin(), files.end(),
            [](const std::string& f){ return f.empty(); }), files.end());
```

### 4.3 字符串
- 读取方使用 `std::string_view`(非空悬);拥有所有权时才用 `std::string`。
- 拼接优先 `std::string::append` 或 `<format>`(C++20);避免 `+=` 在循环里反复重分配。
```cpp
void log(std::string_view msg);            // 只读,不拷贝

std::string header = std::format("Lang: {} v{}", kName, version);  // C++20 std::format
```

### 4.4 类与 RAII 属性
- 让析构与资源释放绑定到作用域结束,构造/析构内部完成 acquire/release。
```cpp
class FileLock {
public:
    explicit FileLock(int fd) : fd_(fd) {}   // RAII:构造时获取
    ~FileLock() { if (fd_ != -1) ::close(fd_); }  // RAII:析构释放

    FileLock(const FileLock&) = delete;
    FileLock& operator=(const FileLock&) = delete;

private:
    int fd_;
};
```

### 4.5 右值与移动语义
- 为拥有动态资源的类显式实现/声明移动构造与移动赋值,并 `= delete` 拷贝。
- 传入大对象用右值引用 + `std::move`;返回大对象依靠移动省略(NRVO/RVO)。
```cpp
class Blob {
public:
    Blob(Blob&& o) noexcept : data_(std::exchange(o.data_, nullptr)), size_(o.size_) {
        o.size_ = 0;                       // 移出后处于有效但要被销毁的状态
    }
    Blob& operator=(Blob&& o) noexcept {
        if (this != &o) {
            swap(o);                        // copy-and-swap 保证异常安全
        }
        return *this;
    }
private:
    int* data_; std::size_t size_;
};

std::vector<Blob> blobs;
blobs.push_back(std::move(largeBlob));      // 转移所有权,避免深拷贝
```

### 4.6 结构化绑定与 Concepts
- `C++20` 结构化绑定解构多返回值,配 `std::tie` 已废弃。
- 用 `requires` + Concepts 约束模板,取代传统的 `enable_if` 魔法。

```cpp
auto [status, body] = request.execute();   // 结构化绑定

template<typename T>
concept Serializable = requires(const T& x) { { x.serialize() } -> std::convertible_to<std::string>; };

template<Serializable T>                    // 概念约束:只接受可序列化类型
std::vector<std::byte> pack(const T& obj);
```

## 5. 类型系统与内存

### 5.1 RAII 与智能指针选型
- 独享所有权用 `std::unique_ptr`;共享所有权用 `std::shared_ptr`(仅在确实需要共享时)。
- 工厂返回裸指针→改返回 `unique_ptr`;避免泄漏 `new`。
```cpp
class Widget { /* ... */ };
std::unique_ptr<Widget> make_widget() {
    return std::make_unique<Widget>();       // make_unique,绝不 new
}
```
- 只在所有权不明或预留给外部时用原始指针,并加注释说明生命周期由谁管理。

### 5.2 不可变与 const
- 所有不改动对象的方法都标 `const`;入参尽量 `const&`。
- 编译期常量用 `constexpr` 而非 `const` + 宏。
```cpp
constexpr std::size_t kPageSize = 4096;      // constexpr 优于宏
std::size_t size() const noexcept;           // const + noexcept 提供更强保证
```

### 5.3 值语义与按值传递
- 小对象(数值、枚举、`string_view`)按值传递;自定义类型按 `const&` 传递。
- 需要拥有所有权时按值吞入再 `std::move`(sink 参数)。
```cpp
void set_label(std::string label) {          // sink:调用方决定 move/copy
    label_ = std::move(label);
}
label = "text"s;   // 调用侧用字符串字面量 s 后缀
```

### 5.4 null 安全
- C++23 使用 `std::optional<T*>` 表达"可能为空的指针";指针非空假设用 `gsl::not_null` 或断言。
- 不空则用 `if (ptr)` 前置检查后进入窄作用域。
```cpp
std::optional<const Widget*> find_widget(int id);   // 显式表达"可能没有"
if (auto w = find_widget(1)) {
    if (*w) { apply(*w); }      // 两层判空,语义清晰
}
```

## 6. 错误处理

### 6.1 策略选择
- 可恢复的业务错误用返回值/`std::expected`(C++23)或 `std::optional`;异常仅用于不可恢复或构造函数失败。
- 库内部避免把异常当作流程控制;确需传播则在顶层统一捕获。
- 关闭 `-fno-exceptions` 的模块(如嵌入式或 hot path)必须显式标注 `noexcept` 并用错误码。

### 6.2 异常示例(构造函数 / 不可恢复)
```cpp
class Connection {
public:
    explicit Connection(std::string_view host) {
        // 失败时抛异常,保证不再返回一个半初始化对象
        if (host.empty()) {
            throw std::invalid_argument("host must not be empty");
        }
    }
};
```

### 6.3 std::expected(C++23)/optional 定义与调用
```cpp
enum class ErrorCode { kOk, kNotFound, kIo };

// 定义:返回 expected,替代“返回值+出参错误码”
std::expected<std::string, ErrorCode> read_config(std::string_view key) {
    if (!s_has_key(key)) return std::unexpected(ErrorCode::kNotFound);
    return std::string{s_values.at(key)};
}

// 调用:显式处理成功/失败分支
auto cfg = read_config("port");
if (cfg) {
    configure(cfg.value());            // 成功路径
} else if (cfg.error() == ErrorCode::kNotFound) {
    use_default();
} else {
    report(cfg.error());
}
```

### 6.4 使用 optional 表示“可能无结果”
```cpp
std::optional<int> parse_int(std::string_view text) {
    try {
        int v = std::stoi(std::string(text));
        return v;
    } catch (const std::invalid_argument&) {
        return std::nullopt;            // 表示解析失败,而非抛异常
    }
}
```

## 7. 异步与并发

### 7.1 并发原语选型
- 需要后台任务用 `std::async(std::launch::async)` + `std::future`;需求更复杂再上 `std::jthread` + stop token 或协程。
- 共享状态务必上锁(`std::mutex` + `std::lock_guard`)或用无锁原语并给出证明。
- 每个并发任务必须可取消(`std::jthread` 自带协作式取消)。

### 7.2 std::async 示例
```cpp
#include <future>
auto res = std::async(std::launch::async, [] {
    return compute_heavy();              // 后台计算
});
// ... 继续做别的事
int result = res.get();                  // 阻塞取结果
```

### 7.3 std::jthread 与协作式取消
```cpp
#include <thread>
#include <stop_token>
void worker(std::stop_token st) {
    while (!st.stop_requested()) {       // 协作式响应取消
        if (!poll()) break;
    }
}
std::jthread t(worker);                  // 析构时若仍为 joinable 自动 join,不悬挂
t.request_stop();                        // 请求取消
```

### 7.4 线程安全地操作共享状态
```cpp
class Counter {
public:
    void add(int n) {
        std::lock_guard<std::mutex> lock(mu_);   // RAII 解锁,异常安全
        value_ += n;
    }
    int get() const {
        std::lock_guard<std::mutex> lock(mu_);
        return value_;
    }
private:
    mutable std::mutex mu_;
    int value_ = 0;
};
```

### 7.5 协程(C++20,可选)
- 生命周期与资源释放交给 RAII 守卫,协程体内不裸 `co_await` 悬挂引用局部对象的地址。
```cpp
cppcoro::task<std::string> load(std::string_view url) {
    auto guard = ResourceGuard{};         // 协程挂起也保持 RAII
    auto body = co_await fetch(url);      // 挂起点
    co_return process(body);
}
```

## 8. 结构与架构

### 8.1 分层与依赖方向
- 依赖只允许自上而下:接口层 → 业务层 → 存储层;禁止循环依赖。
- 跨层数据传递使用已定义的数据结构(DTO),不共享私有实现。

### 8.2 目录树示例
```
apps/zcode-cli/
└── src/
    ├── api/            # 对外接口与 DTO
    ├── core/           # 纯业务逻辑,无 I/O
    ├── infra/          # 数据库、网络、文件等基础设施
    └── ui/             # 用户界面依赖
```

### 8.3 命名空间与模块封装
- 每个模块一个命名空间,私有实现放 `detail` 子命名空间。
```cpp
namespace core {       // 对外 API
template<class T> T clone(const T& v);
}
namespace core::detail { // 仅内部使用,对外不可见
void throw_if_invalid(...) { /* ... */ }
}
```

### 8.4 依赖注入与唯一 owner
- 通过构造函数注入依赖(对象);全局单例仅用于真正共享的资源并确保初始化顺序。
- 每个资源/状态必须有唯一 owner,禁止多人同时直接裸写全局状态。
```cpp
class Session {
public:
    explicit Session(std::shared_ptr<IDb> db)   // 依赖注入,可替换/测试
        : db_(std::move(db)) {}
private:
    std::shared_ptr<IDb> db_;                    // session 是 db 的唯一使用者
};
```

## 9. 构建 / 测试 / 发布

### 9.1 构建
```bash
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build -j
ctest --test-dir build --output-on-failure
```
- 生产构建开启 `-O2 -DNDEBUG`;Debug 开启 `-O0 -g` 并可加 sanitizer。

### 9.2 单元测试写法
```cpp
TEST(StorageTest, PersistsThenReads) {
    auto storage = core::DictionaryStorage::in_memory();
    storage->put("k", "v");
    EXPECT_EQ(storage->get("k"), "v");
}
```
- 尽量无 I/O、无网络、无真实时钟;对外部系统用 mock 依赖注入。

### 9.3 CI 流水线(GitHub Actions + CMake)
```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: cmake -S . -B build -DENABLE_ASAN=ON
      - run: cmake --build build
      - run: ctest --test-dir build --output-on-failure
      - run: clang-tidy src -p build --config-file=.clang-tidy
```

### 9.4 发布
- 多平台产物(windows/linux/macos arm64/x64)经 CI 矩阵构建;版本号由 Git tag 注入 CMake。

## 10. 安全与性能要点

### 10.1 RAII 与异常安全
- 所有资源(内存、文件、锁、socket)必须由 RAII 管理,绝无裸 `delete`。
- 一个修改函数要么全部成功要么无任何副作用,用 copy-and-swap 保证强异常保证。
- 避免缓存裸指针/裸引用越过对象析构。

### 10.2 内存与边界
- 用 `std::array`/`std::vector` 取代 C 数组;读固定大小 buffer 用 `.subspan`/`string_view`,不裸索引。
```cpp
std::array<char, 16> buf{};
read(fd_, buf.data(), buf.size());     // 固定边界,无越界
```
- 启用边界检查链接(`-D_GLIBCXX_ASSERTIONS` / ASAN)帮助捕捉下标越界。

### 10.3 性能要点
- String/容器循环中优先移动与引用,避免每轮拷贝;开销大的对象避免返回值副本,依赖移动语义。
- 避免在热循环中做不必要的动态内存分配,可复用 buffer。

### 10.4 隐式转换与溢出
- 关闭隐式窄化转换(`-Wconversion`),跨符号或跨宽度比较会报错,回填缩小操作改为静态与断言。

## 11. 常见陷阱与反模式

### 11.1 悬垂引用(容器失效导致)
使用 `std::string_view` 指向容器内部,容器扩容后引用失效。
```cpp
// 修正:只在容器稳定期间持有,或改为 std::string 拷贝
std::string pool;
std::vector<std::string_view> views;
for (const auto& s : list) views.push_back(std::string_view(s));  // list 变化后 views 失效
// 正确做法:views 保存 std::string 或保证 list 生命周期,且不再扩容时再生成
```

### 11.2 返回局部对象的引用
```cpp
// 反例:返回悬垂引用
const int& bad(int* p) { return *p; }   // 依赖外部生命周期
// 修正:按值返回或返回 owner(指针/optional)
```

### 11.3 用 auto 丢失类型意图
`auto x = someMap[k];` 可能拷贝大对象且不表达意图。
```cpp
// 修正:显式引用或类型
auto& x = someMap[k];                    // 引用,避免拷贝
```

### 11.4 裸 new/delete 泄漏
```cpp
// 反例
auto* p = new Widget();                  // 可能泄漏
// 修正
std::unique_ptr<Widget> p = std::make_unique<Widget>();
```

### 11.5 忘记 noexcept 导致折损性能与设计意图
为该 noexcept 却未标,swap/move 的强异常保证被打破。
```cpp
void swap(Blob& o) noexcept;             // move/swap 应 noexcept,避免 vector 回退拷贝
```

### 11.6 在头文件定义非内联函数引发 ODR
```cpp
// 反例:头文件中非 inline 定义 → 多处 include 触发多重定义
// 修正:声明放头文件,定义放 .cpp,或用 inline
```

### 11.7 全局 mutable 状态的内在并发未定义
多个线程无同步地写同一全局变量属于数据竞争。
```cpp
// 修正:改为线程局部、加锁保护或 atomics
static std::atomic<int> g_count{0};      // 用原子保证
```

### 11.8 字符数组越界
```cpp
char buf[8];
strcpy(buf, "this is too long");         // 越界
// 修正:使用 std::string 或 snprintf 限制长度
```

### 11.9 无视隐式窄化与符号溢出
`int a = 0xFFFFFFFF;` 属实现定义且告警。
```cpp
// 修正:检查值域或使用 uint32_t 并显式转换
```

### 11.10 move 后又使用被移对象
```cpp
std::string a = "x";
std::string b = std::move(a);
std::cout << a;                          // 未定义/不可移植,禁止假设被移内容
// 修正:move 后不要读取源对象,或重置
```

### 11.11 依赖求值顺序(未定义行为)
```cpp
i = ++i + i;                            // 未定义行为
// 修正:拆成独立语句,避免对同一变量多次求值
```

### 11.12 用宏代替 constexpr / inline 函数
宏不参与作用域和类型检查。
```cpp
// 修正
constexpr std::size_t kLimit = 100;      // 取代 #define LIMIT 100
```

### 11.13 死锁:加多个锁且顺序不一致
```cpp
// 修正:统一加锁顺序,或使用 std::scoped_lock 一次获取多锁
std::scoped_lock lk(mu_a_, mu_b_);       // 原子地加多个锁,避免死锁
```

### 11.14 异常吞掉后状态未回滚
```cpp
// 反例状态不一致
// 修正:使修改函数先将新值构造好再提交(强保证)
```

### 11.15 在析构函数中抛出异常
```cpp
~FileLock() { close_possibly_throwing(); }  // 析构抛异常→terminate
// 修正:析构内捕获或 noexcept 吸收
```

## 12. 自查检查清单

- [ ] 所有资源(socket/文件/锁/内存)由 RAII 管理,无裸 `new`/`delete`。
- [ ] 每个类有明确的 move 与拷贝语义,拷贝禁用的类已 `= delete`。
- [ ] 所有不改对象的方法都标记 `const`;入参用 `const&`。
- [ ] move/swap 标记 `noexcept`。
- [ ] 单参构造函数标记 `explicit`。
- [ ] 返回非 trivial 对象使用 `[[nodiscard]]` 或合理忽略。
- [ ] 头文件用 `#pragma once`,可独立包含,无 `using namespace std;`。
- [ ] 容器遍历使用 range-for + 引用,未无谓拷贝大对象。
- [ ] 字符串只读传参用 `std::string_view`,无悬垂。
- [ ] 错误路径:可恢复用 `expected`/`optional`,不可恢复用异常,无吞异常。
- [ ] 并发共享状态有锁保护或原子,无全局数据竞争。
- [ ] 后台任务可取消(`std::jthread`/stop_token)。
- [ ] 无宏代替常量与内联函数,均用 `constexpr`/`inline`。
- [ ] 无隐式窄化转换引发告警。
- [ ] 无悬垂标识符(引用/指针/view)越过对象生命周期。
- [ ] 析构函数不抛出异常。
- [ ] CI 启用 clang-tidy 与 sanitizer(ASan/UBSan)。
- [ ] 单元测试覆盖错误分支与边界,不只 happy path。
- [ ] 构建开启严格告警(`-Wall -Wextra -Werror`)。

## 13. 参考资料
- cppreference.com(类型、容器、标准算法)。
- C++ Core Guidelines(Isocpp.guidelines)。
- Effective Modern C++(Scott Meyers,移动语义与类型推导)。
- ISO C++20/23 标准草案(N4950 / N4950+ 补充)。