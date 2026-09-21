# Python 编码规范

> 本文档面向基于 Python 3.12+ 的工程代码（应用服务、CLI、数据处理、基础库），用于统一团队在类型标注、异常处理、异步并发、依赖管理与项目结构上的写法。适用范围覆盖新建模块、重构既有代码以及代码评审三个环节。规范强调"可执行"：每一条都给出具体做法、命令或可直接落地的代码骨架，而不是空泛的原则。

## 1. 概述与使用时机

### 1.1 目标

Python 是一门动态语言，但工程化的 Python 必须具备相当的纪律性。本规范的核心诉求有三点：

- **让类型可读、可查**：全量类型注解，配合 `mypy`/`pyright` 在 CI 中作为门禁，把"运行时才发现类型错"压到编码阶段。
- **让异常路径清晰**：异常链、自定义异常层级、`raise`/`except` 的使用边界都有明确约定，避免 `except Exception` 吞错或抛出无上下文的裸异常。
- **让并发可推理**：统一使用 `asyncio` + 结构化并发，明确"谁用线程、谁用协程、谁负责取消"，不靠 `time.sleep` 和 `threading.Lock` 堆砌。

### 1.2 使用时机

| 场景 | 是否套用本规范 |
| --- | --- |
| 新建 Python 包或服务 | 必须，从头对齐 |
| 重构已有模块 | 必须，重构范围需满足规范门禁 |
| 快速原型 / 一次性脚本（`/tmp/a.py`） | 可放宽，但涉及多人复用则必须对齐 |
| 移植/评审他人代码 | 按规范逐条点评 |

### 1.3 规范与现实的平衡

规范用于降低沟通成本，不用于制造摩擦：

- 当某个约定在团队尚未使用某语言特性时，不强推；但一旦写入了代码库，就按规范统一。
- 对"性能敏感热路径"可以写实的局部优化，但必须注释说明为何绕开惯用法。
- 规范优先于个人偏好，可执行检查（linter/typechecker）优先于口头约定。

## 2. 环境与工具链

### 2.1 版本基线

- **CPython**：`3.12+`（推荐 `3.12` 或 `3.13`，项目 `.python-version` 或 `mise.toml` 锁定）。
- **包管理**：项目默认使用 `uv`；若沿用既有 `requirements.txt`/`pip` 流程，需在 `pyproject.toml` 中声明工具链。
- **格式化**：`ruff format`（对齐 black 风格）。
- **Lint**：`ruff`。
- **静态类型**：`mypy`（或 `pyright`，二者选一并在配置中固定）。
- **测试**：`pytest` + `pytest-asyncio`。

### 2.2 用 uv 管理环境

`uv` 同时负责创建虚拟环境、锁定依赖、运行脚本，替代 `pip install` + `venv` 的手工组合。

```python
# pyproject.toml 关键片段（不必照抄，展示 uv 依赖声明与元数据）
[project]
name = "plutus-payments"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
    "httpx>=0.27,<0.29",
    "pydantic>=2.7,<3",
]

[dependency-groups]
dev = [
    "pytest>=8.2",
    "pytest-asyncio>=0.23",
    "ruff>=0.5",
    "mypy>=1.10",
]

[tool.uv]
package = true

[tool.ruff]
line-length = 100
target-version = "py312"

[tool.ruff.lint]
select = ["E", "F", "I", "UP", "B", "SIM", "C4", "ASYNC"]
ignore = ["E501"]

[tool.mypy]
python_version = "3.12"
strict = true
warn_unreachable = true
```

```bash
# 常用命令：同步并锁定依赖 / 添加运行依赖 / 添加开发依赖
uv sync
uv add "pydantic>=2.7"
uv add --group dev "pytest-asyncio"
uv run python -m plutus_payments.main
```

### 2.3 用 ruff + mypy 做门禁

```bash
# 格式化并检查
ruff format --check .
ruff check .            # lint
mypy src               # 类型检查

# 若已有大量历史代码，先制定"新代码门禁"再逐步整改存量
ruff check --fix .      # 自动修复安全项（I 排序、UP 升级等）
```
> 注意：`ruff --fix` 只做语法安全的自动修复，结构性 lint（B、SIM 等）仍需人工确认。

### 2.4 解释器与运行入口

不要依赖全局解释器。`pyproject.toml` 通过 `[project.scripts]` 声明命令行入口：

```python
# pyproject.toml
[project.scripts]
plutus = "plutus_payments.main:main"
```

```python
# main 入口保持极薄，真正的逻辑放在模块内
def main() -> None:
    raise SystemExit(plutus_payments.cli.run())

if __name__ == "__main__":
    main()
```

## 3. 命名与风格

### 3.1 命名约定表

| 对象 | 约定 | 示例 | 反面示例 |
| --- | --- | --- | --- |
| 模块 / 包 | `snake_case`，不以下划线开头 | `payment_engine.py` | `PaymentEngine.py` |
| 类 / 异常 | `PascalCase` | `ValidationError`, `OrderService` | `orderService` |
| 函数 / 方法 / 变量 | `snake_case` | `total_price()`, `user_id` | `totalPrice`, `userId` |
| 常量 | `UPPER_CASE` | `MAX_RETRY` | `maxRetry` |
| 私有成员 | 单下划线前缀 `_` | `self._repo` | 直接裸用 |
| 类型参数 | 单个大写字母 | `def find[T](...) -> T | None` | `def find(item_type)` |
| 布尔变量 | 使用 `is_`/`has_`/`should_` 前缀 | `is_visible` | `flag` |

### 3.2 正例与反例

```python
# 正例：语义完整、类型明确、私有成员受约束
MAX_BATCH = 100


class InvoiceService:
    def __init__(self, repo: InvoiceRepo, notifier: Notifier) -> None:
        self._repo = repo
        self._notifier = notifier

    def pay(self, invoice_id: str) -> Invoice:
        invoice = self._repo.get(invoice_id)
        if invoice.is_paid:
            raise AlreadyPaidError(invoice_id)
        return self._repo.mark_paid(invoice)
```

```python
# 反例：中文拼音/缩写堆叠、类型缺失、魔法值裸奔
def pay(icode):  # Bad：icode 是什么？
    if invoice_stat == 1:  # Bad：1 表示已支付？不可读
        return -1  # Bad：-1 是什么语义？
    return 0
```

```python
# 数字枚举用 enum，抛弃裸整数魔法值
from enum import StrEnum


class PaymentState(StrEnum):
    PENDING = "pending"
    PAID = "paid"
    REFUNDED = "refunded"
```

### 3.3 风格细节

- 行宽 100，`ruff format` 负责排版，不手工对齐。
- 导入手动分行按字母序排序（`ruff check --select I` 强制）。
- 一律使用 `from x import y` 而非 `import x.y.z` 的直接深引用。
- 字符串拼接不用 `+`/`%`，用 f-string（见 §4.3）。

## 4. 语法与惯用法

### 4.1 类型 annotation 与泛型

函数签名必须标注参数与返回类型；无法确定时用 `object` 或 `Any` 但要谨慎。

```python
from collections.abc import Iterable


def find[T](items: Iterable[T], predicate: Callable[[T], bool]) -> T | None:
    """返回第一个满足 predicate 的元素，没有则返回 None。"""
    for item in items:
        if predicate(item):
            return item
    return None
```

### 4.2 集合与推导式

优先用推导式与 `dict`/`set` 字面量，避免显式循环拼装。

```python
prices = {"apple": 3.0, "banana": 1.5, "pear": 2.0}
expensive = {k: v for k, v in prices.items() if v >= 2.0}
unique_ids = {item.id for item in items}
sorted_names = sorted(names, key=lambda n: n.lower())
```

```python
# 反例：能用内置就不用再手写
# Bad：手动计数
count = sum(1 for x in items if x.kind == "A")
# Good：内建 bool 在容器/非空判断上的惯用
is_empty = not items
```

### 4.3 字符串

尽量使用 f-string，关键对齐处用 format spec；不裸拼。

```python
user = {"name": "Tom", "paid": 1234.5}
msg = f"用户 {user['name']:<10} 已支付 {user['paid']:>8.2f} 元"
price = f"{1234.5:,.2f}"          # -> "1,234.50"
```

### 4.4 类与对象

- 普通数据对象优先用 `@dataclass` 或 `pydantic`，别手写 `__init__`/`__repr__`/`__eq__`。
- 出入参校验用 pydantic 的 validator 集中管理。
- 继承深度超过两层时，考虑用组合替代。

```python
from dataclasses import dataclass, field


@dataclass(frozen=True)
class Rect:
    width: float
    height: float
    area: float = field(init=False)

    def __post_init__(self) -> None:
        object.__setattr__(self, "area", self.width * self.height)
```

### 4.5 函数与闭包

- 一行参数过 4 个且互相关联时，抽成数据对象或关键字参数。
- 闭包捕获循环变量时用默认参数绑定（3.12 前）或避免在循环里定义闭包。

```python
# 反例（经典坑）：循环后闭包持有最后一次循环变量
funcs = [lambda: i for i in range(3)]
print([f() for f in funcs])  # [2, 2, 2]

# 正例：默认参数提前绑定
funcs = [lambda i=i: i for i in range(3)]
print([f() for f in funcs])  # [0, 1, 2]
```

```python
# 装饰器：保留元数据并使用类型
from functools import wraps
from collections.abc import Callable, Coroutine
from typing import ParamSpec, TypeVar

P = ParamSpec("P")
R = TypeVar("R")


def logged(func: Callable[P, R]) -> Callable[P, R]:
    @wraps(func)
    def wrapper(*args: P.args, **kwargs: P.kwargs) -> R:
        print(f"call {func.__name__}")
        return func(*args, **kwargs)
    return wrapper
```

### 4.6 模块与导入

- 模块内顶端只做 import 与常量声明，把可执行逻辑包装成函数。
- 避免 `from dataclasses import *` 与相对导入跳出包边界。
- 一个模块容量宜控制在数百行内，超出则按职责拆分。

```python
# payment.py —— 模块顶端
"""支付领域模块。"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from enum import StrEnum

import httpx  # 第三方在标准库之后

PAYMENT_TIMEOUT = 10.0  # 常量放在函数之前
```

## 5. 类型系统与内存

### 5.1 类型提示的风格

- 新代码一律写类型注解；存量重构接触到的函数同步补齐。
- 对外 API 的注解要"完整、精确"，内部热路径可适度 `# type: ignore[reason]` 并注释原因。
- 返回 `None` 显式写 `-> None`；`dict`/`list` 用泛型 `dict[str, int]` 而非 `dict`。

```python
def bloat_level(size: int) -> str:  # type: ignore[no-untyped-def]
    # 存量函数，全局开关，忽略类型仅限此处
    return "huge" if size > 1024 else "ok"
```

### 5.2 `TypedDict` 与 `dataclass` 的选择

| 诉求 | 推荐 |
| --- | --- |
| 结构化数据、要校验 | `pydantic.BaseModel` |
| 内存紧凑读多写少 | `typing.NamedTuple` |
| 变字段的 plain 容器 | `TypedDict` |
| 带默认值/自由改动 | `@dataclass` |

```python
from typing import NotRequired, TypedDict


class Payload(TypedDict):
    amount: float
    currency: str
    note: NotRequired[str]  # 可选键


def process(p: Payload) -> str:
    return f"{p['amount']:.2f} {p['currency']}"
```

### 5.3 不可变与所有权

- 默认传递的值是引用；要避免调用方意外改动内部状态，则冻结 dataclass 或用 `Mapping`（只读视图）作为参数类型。
- 对"共享缓存/全局状态"要在模块内写明唯一 owner 与同步方式。

```python
from typing import Mapping

# 参数用 Mapping 表示只读，禁止在函数内修改
def render(theme: Mapping[str, str]) -> str:
    return f"bg={theme.get('bg', '#fff')}"

# Bad：直接暴露可变内部结构，调用方可随意改动
_cache: dict[str, str] = {}
def get_cache() -> dict[str, str]:
    return _cache

# Good：返回只读视图
def get_cache_view() -> Mapping[str, str]:
    return _cache
```

### 5.4 内存要点

- 大文件用迭代器/流式读取，不一次性 `read()` 进内存。
- 使用 `weakref`/`@lru_cache(maxsize=N)` 控制缓存上限，避免无限增长。
- 明确谁创建资源、谁负责释放（context manager 统一收尾）。

```python
# 流式处理大日志，避免内存暴涨
def count_large_log(path: str) -> int:
    hits = 0
    with open(path, encoding="utf-8") as fh:  # 文件会被 context manager 关闭
        for line in fh:
            if "ERROR" in line:
                hits += 1
    return hits
```

## 6. 错误处理

### 6.1 异常层级

业务模块应定义自己的异常基类，统一语义并便于上层 catch。

```python
# errors.py —— 应用自定义异常根部
class AppError(Exception):
    """所有业务异常的基类。"""


class NotFoundError(AppError):
    def __init__(self, resource: str, ident: str) -> None:
        super().__init__(f"{resource} 不存在: {ident}")
        self.resource = resource
        self.ident = ident


class ValidationError(AppError):
    def __init__(self, field: str, message: str) -> None:
        super().__init__(f"字段 {field} 校验失败: {message}")
        self.field = field
```

### 6.2 抛/接的原则

- 一律用 `raise ... from exc` 保留异常链，不要吞掉原始异常。
- 精确捕获异常类型，捕获区间越小越好；`except Exception` 仅允许出现在最外层兜底。
- 不要在 except 里静默 pass（捕获但不处理是不被允许的）。

```python
try:
    data = await fetch(id)
except KeyError as exc:
    raise NotFoundError("user", id) from exc  # 保留底层线索
finally:
    await session.close()  # 无论成败都释放资源
```

```python
# 反例：吞错且无链，无法排查
try:
    result = parse(payload)
except Exception:
    print("parse failed")  # Bad：连锁根因已丢失
```

### 6.3 自定义异常的断言式使用

用断言表达"不该成立的前置条件"，业务校验则应抛显式异常而非断言（断言可被 `-O` 关闭）。

```python
def withdraw(amount: float) -> None:
    if amount <= 0:
        raise ValidationError("amount", "必须为正数")
    assert self._repo is not None  # 仅用于检查内部不变量
```

## 7. 异步与并发

### 7.1 asyncio 基础

- 网络 I/O、数据库调用使用 `asyncio`；CPU 密集或阻塞式第三方库才考虑线程/进程。
- 统一入口用 `asyncio.run(main())`，不在模块顶层裸跑事件循环。
- 并发任务用 `asyncio.gather(...)`，并设置超时与取消。

```python
import asyncio

async def fetch_one(url: str) -> int:
    await asyncio.sleep(0.1)  # 模拟网络 IO
    return len(url)


async def main() -> None:
    results = await asyncio.gather(
        *[fetch_one(f"http://x/{i}") for i in range(5)],
        return_exceptions=True,  # 逐任务收集异常而非整体中断
    )
    print(results)


if __name__ == "__main__":
    asyncio.run(main())
```

### 7.2 超时与取消

不要写无超时的 await。用 `asyncio.timeout`（3.11+）或 `asyncio.wait_for` 兜底。

```python
import asyncio

async def call_api(client, payload):
    try:
        async with asyncio.timeout(3.0):      # 3 秒内必须完成
            return await client.post(payload)
    except TimeoutError:
        return fallback()  # 结构化回退
```

```python
# 并发限额：用 semaphore 控制并发数，避免打开无限连接
sem = asyncio.Semaphore(10)


async def bounded_fetch(url: str) -> str:
    async with sem:
        return await http_get(url)
```

### 7.3 为什么尽量避开裸线程

线程共享全局解释状态且难以推理；若必须用线程，用 `concurrent.futures.ThreadPoolExecutor` 并对所有被共享的 Mutable 结构加锁或用 `threading.Lock`。以模块抬头注释写明 owner。

```python
from concurrent.futures import ThreadPoolExecutor

with ThreadPoolExecutor(max_workers=4) as pool:
    totals = list(pool.map(compute_heavy, range(100)))
```

## 8. 结构与架构

### 8.1 包分层

一个典型服务包的目录：

```text
plutus_payments/
├── __init__.py
├── main.py            # 极薄的进程入口
├── config.py          # 配置加载（pydantic-settings）
├── cli.py             # CLI 编排
├── domain/            # 纯业务模型，不依赖 IO
│   ├── models.py
│   └── errors.py
├── ports.py           # 抽象接口（仓储、通知等）
├── adapters/          # 接口的具体实现（DB、HTTP、消息队列）
│   ├── repo.py
│   └── notifier.py
├── app.py             # 组装：把 adapters 注入到 use-case
└── tests/
    ├── unit/
    └── integration/
```

### 8.2 依赖方向

- 依赖只允许"上层依赖抽象、实现依赖抽象"：controller/service 依赖 `ports`，`adapters` 实现 `ports`，domain 不 import 任何 adapter。
- 状态唯一 owner：某个集合的增删改只能经由一个 repository/service 方法，不允许多处直接 `dict[name] = ...`。

```python
# ports.py —— 抽象接口
class InvoiceRepo(Protocol):
    def get(self, ident: str) -> Invoice: ...
    def save(self, invoice: Invoice) -> None: ...

# adapters/repo.py —— 实现
class PostgresInvoiceRepo:
    def get(self, ident: str) -> Invoice: ...
    def save(self, invoice: Invoice) -> None: ...
```

### 8.3 依赖注入

构造函数注入为主，避免全局单例隐式耦合；组装点集中到 `app.py`。

```python
class InvoiceService:
    def __init__(self, repo: InvoiceRepo, notifier: Notifier) -> None:
        self._repo = repo       # 注入的抽象，测试时可替换
        self._notifier = notifier
```

## 9. 构建 / 测试 / 发布

### 9.1 构建命令

```bash
uv build              # 打 wheel + sdist
uv publish            # 发布到私有 PyPI
```

### 9.2 测试写法

用 pytest + fixture 组织；异步测试用 `pytest-asyncio`。

```python
# tests/unit/test_invoice_service.py
import pytest


@pytest.fixture
def service(stub_repo):
    from plutus_payments.app import make_service
    return make_service(stub_repo)  # 注入测试替身


def test_mark_paid_updates_state(service, stub_repo) -> None:
    invoice = service.pay("inv-1")
    assert invoice.is_paid is True
    assert stub_repo.saved == ["inv-1"]
```

```python
import pytest
import pytest_asyncio as pat


@pat.fixture
async def db():
    await db_up()
    yield
    await db_down()


@pytest.mark.asyncio
async def test_fetch(db) -> None:
    row = await load(db, 1)
    assert row.amount == 10
```

### 9.3 CI 门禁

```yaml
# .github/workflows/ci.yml —— 最小可落地版本（示意）
name: python-ci
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v5
      - run: uv sync
      - run: ruff format --check .
      - run: ruff check .
      - run: mypy src
      - run: uv run pytest
```

### 9.4 版本与发布纪律

- 语义化版本 `MAJOR.MINOR.PATCH`，破坏性变更升 MAJOR。
- 每次发布要更新 `CHANGELOG`，并跑一次完整 `uv run pytest` + `mypy`。

## 10. 安全与性能要点

### 10.1 注入

- SQL 一律走参数化；只用 f-string 拼 SQL 是被禁止的。
- 命令执行使用 `subprocess.run([...], shell=False)`，列参数而非 shell 字符串。

```python
import subprocess

# Bad：shell=True + 拼接，潜在注入
subprocess.run(f"echo {user_input}", shell=True)

# Good：参数列表，不经 shell
subprocess.run(["echo", user_input], shell=False)
```

```python
# SQL 参数化
def get_user(conn, uid: str):
    return conn.execute("SELECT * FROM users WHERE id = %s", (uid,)).fetchone()
```

### 10.2 敏感数据

- 秘钥从环境变量/密钥管理读取，不硬编码、不打日志。
- 日志脱敏：`repr` 可以保留类型，但禁止打印 AppSecret/Password。

```python
def log_conn(cfg: dict) -> None:
    safe = {k: ("***" if "secret" in k.lower() else v) for k, v in cfg.items()}
    logger.info("conn: %s", safe)
```

### 10.3 性能要点

- 优先 pydantic/typing 校验而不是裸 `assert`（出厂 `-O` 会移除 assert）。
- 热点批量操作聚合为一次 DB 往返，避免 N+1。
- 用 `yield`/生成器做惰性求值，避免一次性物化超大集合。

```python
def lazy_lines(path: str):
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            yield line.strip()
```

## 11. 常见陷阱与反模式

【陷阱1】`except Exception: pass` 吞掉错误，掩盖根本原因。
修正：精确捕获 + 至少记录日志或 `raise ... from exc`。

【陷阱2】在 `except BaseException`/`except:` 中接住 `KeyboardInterrupt`/`SystemExit`。
修正：只捕获 `Exception` 及其子类，别用裸露 `except:`。

【陷阱3】默认参数用可变对象 `def f(x=[])`。
修正：用 `def f(x: list | None = None)` 并在函数内 `x = x if x is not None else []`。

【陷阱4】闭包捕获循环变量（见 §4.5）。
修正：用默认参数 `lambda i=i: ...` 提前绑定。

【陷阱5】浮点金额直接比较 `if total == 100`。
修正：金额用 `Decimal` 或整数最小单位（分）。

【陷阱6】`is` 与 `==` 混用：`x is 1000` 对相同值的小整数可能成立、大整数不稳。
修正：与 `None` 用 `is`，值比较一律 `==`。

【陷阱7】`if not x` 判断集合是否为空时，误把 False/0 当"空集合"。
修正：明确语义，空集合判断用 `if x is None` 分情况或 `len(x)==0` 显式表达。

【陷阱8】用 `time.sleep` 重试或等待外部状态，阻塞事件循环。
修正：在 asyncio 中用 `await asyncio.sleep`，重试加指数退避+抖动（backoff）。

【陷阱9】`raise Exception(...)` 抛出无业务语义的裸异常，无法细分捕获。
修正：抛自定义异常 `ValidationError`/`NotFoundError`，定义在 `domain/errors.py`。

【陷阱10】深度学习里用全局 `import mymodule` 却依赖模块内的隐藏共享状态被并发修改。
修正：收敛可变状态到唯一 owner，用 context manager 包裹修改。

【陷阱11】`__init__.py` 中执行逻辑 import 第三方，导致 import 时期副作用。
修正：`__init__.py` 尽量只有版本号与导出；副作用放在 `main()`。

【陷阱12】`assert` 用来做业务校验，`python -O` 会被移除，校验失效。
修正：业务校验用显式 `raise`，`assert` 只留给内部不变量。

【陷阱13】用可变对象做 `defaultdict`/缓存且不设上限，内存无限增长。
修正：`functools.lru_cache(maxsize=N)` 或定期清理。

【陷阱14】对文件 `read()` 大文件整块读入内存。
修正：逐行/分块迭代（见 §5.4）。

【陷阱15】手写 `__str__`/`__repr__`/`__eq__` 而改用 dataclass 会更快更稳。
修正：普通数据对象一律 `@dataclass`/pydantic。

【陷阱16】`float('nan')` 参与比较会永久 `!=` 自己，break 死循环或进入 NaN 传导。
修正：显式 `math.isnan(x)`。

## 12. 自查检查清单

- [ ] `python_version` 固定在 3.12+，且 `.python-version`/`mise.toml` 已锁定。
- [ ] 用 `uv` 管理依赖，生成 `uv.lock` 并提交仓库。
- [ ] `ruff format --check .` 通过。
- [ ] `ruff check .` 无 Error 级问题（E/F/I/UP/B/SIM/C4/ASYNC 全开）。
- [ ] `mypy src`（strict）通过，无未标注的函数。
- [ ] 每个服务器/CLI 入口都是项目脚本或 `if __name__ == "__main__": main()`。
- [ ] 所有类/函数/变量命名符合 §3.1 的命名表。
- [ ] 数据对象使用 dataclass/pydantic/NamedTuple/TypedDict，无手写样板。
- [ ] 字符串在可读处使用 f-string，无裸 `+`/`%` 拼接。
- [ ] 自定义异常继承统一 `AppError` 基类，错误语义单一清晰。
- [ ] 所有 `except` 均有处理（记录日志、转换、`raise ... from`），无静默 pass。
- [ ] `raise` 均用 `from exc` 保持异常链。
- [ ] 网络/DB 异步调用均有超时，无无界 `await`。
- [ ] asyncio 并发使用 `gather`/`Semaphore` 控制限额，入口用 `asyncio.run`。
- [ ] SQL 全部参数化，`subprocess` 一律 `shell=False`。
- [ ] 密钥不硬编码、不写入日志，日志对敏感字段脱敏。
- [ ] 金额用 `Decimal`/整数分，未做浮点相等比较。
- [ ] 大文件采用流式/惰性迭代，缓存设上限。
- [ ] 包结构符合 §8.1，依赖方向自上而下，状态有唯一 owner。
- [ ] 新增/修改的公共函数有 pytest 用例覆盖，CI 中 `uv run pytest` 通过。

## 13. 参考资料

- [PEP 8](https://peps.python.org/pep-0008/)：风格指南。
- [PEP 484 / 483#type-hints](https://peps.python.org/pep-0484/)：类型注解。
- [PEP 587 / asyncio 文档](https://docs.python.org/3/library/asyncio.html)：异步编程。
- [ruff](https://docs.astral.sh/ruff/)：lint 与格式化。
- [mypy](https://mypy.readthedocs.io/)：静态类型检查。
- [pytest](https://docs.pytest.org/)：测试框架。