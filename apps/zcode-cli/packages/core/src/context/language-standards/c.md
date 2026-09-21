# C 编码规范

> 适用范围说明:本规范适用于项目内所有以 C 语言编写的底层实现,包括原生库、FFI 封装、系统调用封装与性能热点的嵌入式片段。目标标准为 C11(对编译器支持到 C17 的部分特性可酌情使用)。代码要求通过编译告警门禁、运行时 sanitizer 检查与单元测试。所有涉及指针、缓冲区、资源所有权与并发共享的实现都必须遵循本文档。本文档同时作为代码评审与对接新成员的依据。

## 1. 概述与使用时机

C 语言具备近乎零抽象的性能与极强的可移植性,但缺乏内存与类型安全。本规范的核心目标是用工程纪律抵消这些风险,让 C 代码在生产环境长期稳定运行。

- 当组件是底层系统接口的直连封装、FFI 桥接或性能关键路径时,使用 C 实现。
- 当功能可以用更高的抽象实现且没有性能与 ABI 约束时,不强行使用 C;但原生模块统一以 C11 作为基线。
- 新增原生模块前,先审视是否存在 ABI 与跨语言调用需求,明确边界与责任归属。

使用时机判断要点:

- 需要稳定 ABI 供外部语言或进程加载时,C 的普通结构体布局与 `extern` 导出最合适。
- 需要精确控制堆内存与字节布局时,C 提供直接手段,但必须配合本文档的资源释放约定。
- 需要大量手工内存操作且必须保证确定性时,C 是合适选择,但每处指针操作都要纳入边界检查策略。

最小概览示例:

```c
/* 约定:每个文件顶部用块注释说明模块职责 */
/* module: 用户会话计数器 */
#include <stddef.h>

static unsigned long g_count = 0;

/* 注册一次会话,返回当前总数 */
unsigned long session_register(void) {
    return g_count++;
}
```

## 2. 环境与工具链

统一的工具链与告警配置是安全的第一道防线。

### 2.1 编译器与构建

- 主构建使用 `gcc`,需跨平台验证时额外用 `clang` 编译,两者告警门禁对齐。
- 构建系统统一使用 `CMake`,禁止散落的 makefile 与手工脚本。
- 声明标准为 `-std=c11`;需要时补 `_GNU_SOURCE` 等特性宏,但要集中定义。

### 2.2 必开告警

编译命令必须开启以下告警与陷阱:

```bash
gcc -std=c11 -Wall -Wextra -Wpedantic \
    -Wshadow -Wconversion -Wsign-conversion \
    -Wformat=2 -Werror \
    -fstack-protector-strong -D_FORTIFY_SOURCE=2 \
    -c src/net.c -o build/net.o
```

同时在 CMake 中集中配置:

```cmake
set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)
add_compile_options(-Wall -Wextra -Wpedantic -Wshadow
                    -Wconversion -Wsign-conversion -Werror)
add_compile_options(-fstack-protector-strong)
```

### 2.3 sanitizer 与静态检查

调试构建开启 sanitizer,CI 上跑静态分析:

```bash
# 调试构建:AddressSanitizer 与 UndefinedBehaviorSanitizer
gcc -fsanitize=address,undefined -fno-omit-frame-pointer \
    -g -c src/session.c -o build/session.o

# 链接阶段同样加上 sanitizer
gcc -fsanitize=address,undefined build/session.o -o build/app

# 静态分析
clang-tidy src/session.c -- --std=c11 -Iinclude
```

## 3. 命名与风格

### 3.1 命名约定

| 类别 | 约定 | 示例 |
| --- | --- | --- |
| 类型(typedef) | `_t` 后缀 | `session_t`, `task_id_t` |
| 结构体实例 | 小写蛇形 | `session_map`, `buffer_len` |
| 函数 | 模块前缀 + 动词 | `sess_create`, `buf_resize` |
| 常量与宏 | 大写蛇形 | `MAX_BUF_SIZE`, `STATE_ACTIVE` |
| 枚举常量 | 大写蛇形带前缀 | `EVENT_OPEN`, `EVENT_CLOSE` |
| 文件 | 小写蛇形 | `session.c`, `net.c` |
| 全局变量 | 前缀 `g_` | `g_active_count` |
| 函数指针类型 | `_fn_t` | `cb_open_fn_t` |

### 3.2 正例

```c
/* 正例:明确的命名,模块前缀，类型带 _t */
#define MAX_BUF_SIZE 4096u

typedef struct {
    size_t len;
    unsigned char data[MAX_BUF_SIZE];
} frame_t;

static void frame_reset(frame_t *f) {
    f->len = 0; /* 清零依赖包含 data 数组 */
}
```

### 3.3 反例

```c
/* 反例:命名含混、类型无后缀、魔术数字 */
struct x { int n; };            /* 错误:结构体类型命名不规范 */
void dothings(int a, int b, int c) { (void)a; (void)b; (void)c; } /* 错误:动词不明确 */
#define MAX 100                  /* 错误:未说明单位 */
```

风格约定:

- 使用 clang-format 统一排版,列宽控制在 100 字符内。
- 每个公共头文件声明处附简短注释;不可读的名字一律禁止。
- 全局符号尽量 `static` 化,只在确有跨文件需要时导出。

## 4. 语法与惯用法

### 4.1 类型与集合

C 没有内建动态集合,推荐统一的容器实现,并坚持显式长度参数,不依赖终止符做长度推断。

```c
#include <stddef.h>

/* 使用长度 + 数据指针表示缓冲,禁止只传裸指针 */
static size_t digest(const unsigned char *data, size_t nbytes) {
    size_t acc = 0;
    for (size_t i = 0; i < nbytes; ++i) {
        acc += data[i];
    }
    return acc;
}
```

### 4.2 字符串

C 字符串以 `'\0'` 终止,边界与长度必须显式管理。复制使用带边界版本。

```c
#include <string.h>

static int copy_name(char *dst, size_t cap, const char *src) {
    size_t n = strnlen(src, cap);
    if (n == cap) {
        return -1; /* 源过长或未终止 */
    }
    memcpy(dst, src, n);
    dst[n] = '\0';
    return 0;
}
```

二进制字节块不属于字符串,必须携带独立长度并用 `memcpy`/`memcmp` 处理。

### 4.3 结构体、枚举与模式分支

用结构体表达数据布局,用枚举表达离散状态。访问枚举分支时走函数,不做裸字段切换。

```c
typedef enum {
    ST_ACTIVE = 1,
    ST_CLOSED = 2
} state_e;

typedef struct {
    state_e state;
    uint64_t worker_id;
} session_t;

static const char *state_name(state_e s) {
    switch (s) {
    case ST_ACTIVE: return "active";
    case ST_CLOSED: return "closed";
    default: return "unknown"; /* 显式兜底并记录外部传入未知值 */
    }
}
```

### 4.4 数组与索引

优先用 `for` 循环配合显式计数,杜绝依赖约定边界。

```c
static int find_max(const int *a, size_t n, int *out) {
    if (n == 0u) {
        return -1; /* 空输入返回错误 */
    }
    int best = a[0];
    for (size_t i = 1u; i < n; ++i) {
        if (a[i] > best) {
            best = a[i];
        }
    }
    *out = best;
    return 0;
}
```

### 4.5 指针与返回值

C 中指针既可表达"可能为空"也可表达"必须非空"。约定:

- 可空指针入参必须文档注明 `may be NULL`,并在入口检查。
- 函数返回值用 0 表示成功、负值表示错误,输出通过 `out` 参数写入。

## 5. 类型系统与内存

### 5.1 固定宽度整数与无符号

跨平台数据与协议字段统一使用固定宽度类型,来自 `<stdint.h>`。

```c
#include <stdint.h>

struct header {
    uint16_t type;  /* 固定 2 字节,不依赖 int 宽度 */
    uint32_t len;   /* 固定 4 字节 */
};
```

- 位掩码与集合标志用无符号类型,避免符号位带来的意外。
- 负数语义只存在于 `intXX_t`,不要拿无符号表达错误码。
- 隐式符号转换告警 `-Wsign-conversion` 必须清零。

### 5.2 内存安全:越界、悬垂与泄漏

C 中内存错误是最高风险,必须用以下纪律缓解:

- 所有下标运算前先核对边界,配合 `-fsanitize=address` 验证。
- 释放指针后立即置 `NULL`,杜绝双重释放与悬垂。
- 每个 malloc 必须配对对应的 free,所有权归属写进注释。

```c
#include <stdlib.h>

static frame_t *frame_new(size_t n) {
    frame_t *f = malloc(sizeof(frame_t) + n);
    if (f == NULL) {
        return NULL;
    }
    f->len = n;
    return f;
}

static void frame_free(frame_t **fp) {
    if (fp != NULL && *fp != NULL) {
        free(*fp);
        *fp = NULL; /* 释放后置空,防二次释放 */
    }
}
```

### 5.3 传入传出参数与所有权

所有权转移要清晰:文档明确"谁分配谁释放"。

```c
/* 调用方负责释放返回的字符串 */
char *build_label(const char *name) {
    size_t n = strlen(name) + 8u;
    char *s = malloc(n);
    if (s == NULL) {
        return NULL;
    }
    snprintf(s, n, "label:%s", name);
    return s; /* 所有权转移给调用方 */
}
```

## 6. 错误处理

### 6.1 返回码约定

统一使用返回码表达错误,0 成功、负数失败,并在文档中列出各错误码含义。避免散落的状态判断。

```c
enum {
    ERR_SUCCESS = 0,
    ERR_NOMEM = -1,
    ERR_BADARG = -2,
    ERR_INVALIDSIZE = -3
};
```

### 6.2 错误输出通过 out 参数

函数值返回值码,结果经 `*out` 传出;每个失败 return 前清理已分配资源。

```c
static int parse_len(const unsigned char *buf, size_t n, uint32_t *out) {
    if (buf == NULL || out == NULL) {
        return ERR_BADARG;
    }
    if (n < 4u) {
        return ERR_INVALIDSIZE;
    }
    *out = ((uint32_t)buf[0] << 24) | ((uint32_t)buf[1] << 16);
    return ERR_SUCCESS;
}
```

### 6.3 统一错误上下文

对外接口尽量返回可比对的错误码,而不是只返回 `errno` 或裸整数。底层失败用 `errno` 记录细节,对外再映射为固定码。

```c
#include <errno.h>

static int open_source(const char *path, FILE **out) {
    FILE *fp = fopen(path, "rb");
    if (fp == NULL) {
        /* errno 已设置,向上层记录;对外仍返回统一码 */
        return ERR_BADARG;
    }
    *out = fp;
    return ERR_SUCCESS;
}
```

错误约定:可预期失败(边界、空指针、分配失败)必须显式检查并返回码,不能靠运行时崩溃提示;日志只在必要处记录细节。

## 7. 异步与并发

### 7.1 线程与锁

共享状态用 `pthread_mutex_t` 保护,加锁与解锁成对并尽量靠近临界区。

```c
#include <pthread.h>

static pthread_mutex_t g_lock = PTHREAD_MUTEX_INITIALIZER;
static unsigned long g_count = 0UL;

static void session_inc(void) {
    pthread_mutex_lock(&g_lock);
    g_count++;
    pthread_mutex_unlock(&g_lock);
}
```

### 7.2 原子操作

单计数器优先用原子变量,避免锁开销。

```c
#include <stdatomic.h>

static atomic_ulong g_inflight = 0;

static void probe_begin(void) {
    atomic_fetch_add(&g_inflight, 1UL);
}
```

### 7.3 信号安全

信号处理函数只能调用 async-signal-safe 函数,不得调用 malloc、printf、锁等非安全接口。信号处理器内只做标志写入。

```c
#include <signal.h>

static volatile sig_atomic_t g_stop = 0;

static void on_signal(int sig) {
    (void)sig;
    g_stop = 1; /* 仅置标志,不做其他系统调用 */
}
```

线程约定:定义好每个锁保护的资源集合,同一资源不接受多个锁;加锁顺序全局统一以免死锁;避免在持锁时调用重入不安全的函数。

## 8. 结构与架构

### 8.1 目录与模块划分

按子系统划分目录,头文件放在 `include/`,实现放在 `src/`。

```text
netlib/
├── include/netlib/
│   ├── session.h
│   └── frame.h
├── src/
│   ├── session.c
│   └── frame.c
├── tests/
│   └── test_session.c
└── CMakeLists.txt
```

每个 `.c` 配套一个同名 `.h`,头文件只暴露最小公共接口,内部符号 `static`。

### 8.2 接口隔离与状态 owner

每个模块内的全局可变状态必须只有一个 owner,写入集中在少数函数;对外只暴露操作接口,不暴露内部结构体字段。

```c
/* session.h:只暴露不透明句柄与操作 */
typedef struct session session_t;

session_t *session_new(void);
int        session_start(session_t *s, uint64_t id);
void       session_close(session_t *s);
```

内部实现保有具体字段,保证布局不被外部依赖:

```c
/* session.c:具体定义对外不可见 */
struct session {
    uint64_t id;
    state_e  state;
};
```

状态约定:唯一 owner 负责一致性;输出展示用快照读取,避免在遍历同时被并发写。

## 9. 构建 / 测试 / 发布

### 9.1 CMake 构建

统一由 CMake 驱动,调试与发布配置分离,测试通过 `add_test` 注册。

```cmake
cmake_minimum_required(VERSION 3.20)
project(netlib C)

set(CMAKE_C_STANDARD 11)
add_library(netlib STATIC src/session.c src/frame.c)
add_executable(test_session tests/test_session.c)
target_link_libraries(test_session PRIVATE netlib)
enable_testing()
add_test(NAME session_test COMMAND test_session)
```

构建命令:

```bash
cmake -B build -DCMAKE_BUILD_TYPE=Debug
cmake --build build
ctest --test-dir build --output-on-failure
```

### 9.2 单元测试与 sanitizer

测试命名清晰,同时开启 sanitizer 运行以发现越界与泄漏。

```c
/* tests/test_session.c */
#include <assert.h>
#include <stdio.h>
#include "../include/netlib/session.h"

static void test_new_close(void) {
    session_t *s = session_new();
    assert(s != NULL);
    session_close(s);
}

int main(void) {
    test_new_close();
    printf("all tests passed\n");
    return 0;
}
```

调试构建打开 `-fsanitize=address,undefined` 并跑全部用例;CI 要求 `ASAN_OPTIONS=detect_leaks=1`。

### 9.3 发布与 ABI

入口被外部加载时注意 ABI 稳定:只增不改已有函数签名,枚举与结构体布局视作冻结契约,发布记录 changelog。

## 10. 安全与性能要点

### 10.1 缓冲区与溢出防护

所有写操作使用带长度上限的函数:`snprintf` 代替 `sprintf`,`strnlen` 结合显式缓冲,`memcpy` 传入目标容量。

```c
static void pack_id(char *dst, size_t cap, uint32_t id) {
    size_t n = snprintf(dst, cap, "id=%u", (unsigned)id);
    (void)n; /* snprintf 已保证不越界写入 */
}
```

配合 `-D_FORTIFY_SOURCE=2` 在运行期补防御路径。

### 10.2 资源释放与所有权

每个分配有唯一释放点,错误分支同样释放,避免早期 return 泄漏。

```c
static int run_pipeline(const char *p) {
    char *work = strdup(p);
    if (work == NULL) {
        return ERR_NOMEM;
    }
    int rc = process(work);
    free(work); /* 无论 process 是否成功都释放 */
    return rc;
}
```

### 10.3 确定性

避免依赖未定义行为叠加:整数溢出、移位越界、未初始化读取一律规避;读接口尽量确定输出顺序。

## 11. 常见陷阱与反模式

- `【陷阱】` 用 `sprintf` 拼接不检查长度:越界写。修正:改用 `snprintf` 并传入容量。
- `【陷阱】` `memcpy` 目标太小:堆破坏。修正:传入目标容量并核对边界。
- `【陷阱】` 已释放指针未置空:悬垂与双重释放。修正:`free` 后立即 `*p = NULL`。
- `【陷阱】` 整型提升后隐式符号转换:告警被忽略。修正:开启 `-Wsign-conversion` 并显式转换。
- `【陷阱】` 边界计算溢出:`n+1` 分配可能溢出。修正:优先校验或用 size_t 且先判上限。
- `【陷阱】` 错误路径不释放资源:`return` 前泄漏。修正:集中清理或 `goto cleanup` 统一出口。
- `【陷阱】` 依赖 `int` 宽度传输协议字段:跨平台不一致。修正:统一 `uintXX_t`。
- `【陷阱】` 用 `strcmp` 比较未终止缓冲区:越界读。修正:`strnlen` + 显式长度。
- `【陷阱】` 信号处理器内调用非安全函数(non-async-signal-safe):死锁或崩溃。修正:处理器只置标志。
- `【陷阱】` 锁顺序不一致导致死锁:两份资源加锁顺序相反。修正:定义全局加锁顺序。
- `【陷阱】` 未初始化局部变量读取:undefined behavior。修正:声明时初始化。
- `【陷阱】` 把返回值错误码与 `errno` 混用、判定混乱。修正:对外统一固定码,细节再经 `errno` 记录。

```c
/* 反例修正:统一清理出口,避免错误路径泄漏 */
static int handle(const char *path) {
    char *buf = malloc(256);
    if (buf == NULL) {
        return ERR_NOMEM;
    }
    int rc = do_work(buf, path);
    free(buf);
    return rc;
}
```

## 12. 自查检查清单

- [ ] 编译开启 `-Wall -Wextra -Wpedantic -Werror` 且无告警。
- [ ] 开启 `-Wshadow -Wconversion -Wsign-conversion` 且清零。
- [ ] 声明 `-std=c11`,构建走 CMake。
- [ ] 所有可变长度写入使用 `snprintf`/容量参数。
- [ ] 没有 `strcpy`/`sprintf` 等无边界函数。
- [ ] 每个 `malloc` 有配对 `free`,错误路径也释放。
- [ ] 释放指针后均置 `NULL`。
- [ ] 协议与跨平台字段使用 `uintXX_t` 固定宽度。
- [ ] 所有下标操作已做边界校验。
- [ ] 可空入参在入口检查 `NULL`。
- [ ] 对外错误用统一返回码,细节不依赖未记录整数。
- [ ] 模块内部全局状态 `static`,导出接口最小。
- [ ] 每份共享状态由唯一锁/原子保护,锁顺序一致。
- [ ] 信号处理器只做标志写入。
- [ ] 未初始化局部变量已避免(声明即赋值)。
- [ ] 调试构建 `-fsanitize=address,undefined` 跑通全部用例。
- [ ] `clang-tidy`/静态检查无新增告警。
- [ ] 头文件只暴露公共接口,不泄漏内部结构体布局。

## 13. 参考资料

- ISO C11 / C17 标准与 `cppreference.com`。
- GNU 编译器诊断选项手册(Warning Options)。
- AddressSanitizer / UndefinedBehaviorSanitizer 文档。
- CMake 官方文档与 `add_test` 指南。
- POSIX 线程与 async-signal-safe 函数清单。

遵循上述规范,用一致的工具链、边界校验与资源纪律,让 C 代码在贴近底层的同时保持可审计的内存安全边界。