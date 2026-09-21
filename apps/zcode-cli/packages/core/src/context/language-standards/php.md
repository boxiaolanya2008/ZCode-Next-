# PHP 编码规范

> 适用范围:面向 PHP 8.2+ 的现代 PHP 应用开发,包括 Web 接口、命令行工具、后台任务与共享库。
> 本规范以「严格类型 + PSR-12 风格 + PSR-4 自动加载」为基线,适用于 zcode-cli 项目中所有新增 PHP 代码。
> 旧版本(PHP 7.x)遗留代码若无法立即迁移,应遵循同一命名与安全约束,并在注释中标注迁移计划。
> 所有示例可在 PHP 8.2+ CLI 下直接运行验证,依赖通过 Composer 管理。

## 1. 概述与使用时机

PHP 是弱类型但支持显式声明的语言,容易写出「运行时才暴露类型错误」的代码。本规范的核心目标:

- **尽早失败**:启用 `strict_types`,使跨文件调用时的类型不匹配在调用点立即抛出 `TypeError`,而不是静默强制转换。
- **可预期行为**:通过返回类型、异常约定和 null 安全策略,让函数契约清晰。
- **可维护性**:遵循 PSR-12 命名与格式约定、PSR-4 自动加载,降低团队协作成本。
- **安全性**:在 SQL 拼接、命令执行、文件写入等边界处采用参数化与逃逸手段,杜绝注入。

本规范在以下场景必须遵循:

| 场景 | 要求 |
| --- | --- |
| 新增 PHP 文件 | 完全遵循本规范 |
| 修改既有文件 | 不改变其公共签名的前提下遵循;若需改变签名,先与负责人对齐 |
| 引用的第三方库 | 遵循其自身规范,但调用边界(如异常翻译)遵循本规范 |

## 2. 环境与工具链

### 2.1 版本与运行时

- 项目要求 PHP 8.2+;`composer.json` 中的 `require` 声明 `"php": ">=8.2"`。
- 允许使用 8.x 新增特性:对标属性(enums)、只读属性(readonly)、`match` 表达式、`str_contains`/`str_starts_with`/`str_ends_with`、不可变时间等。
- 通过 `php -v` 确认运行时;通过 `composer check-platform-reqs` 校验环境一致。

### 2.2 Composer

- 用 `composer.json` 管理依赖,禁止把第三方源码直接拷贝进项目。
- `composer install --prefer-dist --no-dev` 用于生产;`composer install` 用于开发。
- `--no-scripts` 在剥离构建阶段的容器镜像内用于避免执行 install 脚本。

```json
{
    "name": "example/package",
    "require": {
        "php": ">=8.2",
        "psr/log": "^3.0"
    },
    "require-dev": {
        "phpunit/phpunit": "^11.0",
        "friendsofphp/php-cs-fixer": "^3.59",
        "vimeo/psalm": "^5.26"
    },
    "autoload": {
        "psr-4": {
            "App\\": "src/"
        }
    },
    "autoload-dev": {
        "psr-4": {
            "App\\Tests\\": "tests/"
        }
    },
    "config": {
        "sort-packages": true,
        "optimize-autoloader": true
    },
    "scripts": {
        "cs": "php-cs-fixer fix --dry-run --diff",
        "psalm": "psalm",
        "test": "phpunit"
    }
}
```

### 2.3 php-cs-fixer 与 Psalm

- 使用 `php-cs-fixer` 统一格式,规则在 `.php-cs-fixer.php` 中声明。
- 使用 Psalm `strict` 级别做静态分析,在 CI 中作为门禁。

```php
<?php
// .php-cs-fixer.php —— 项目格式化规则
declare(strict_types=1);

$finder = PhpCsFixer\Finder::create()
    ->in([__DIR__.'/src', __DIR__.'/tests'])
    ->exclude('vendor');

return (new PhpCsFixer\Config())
    ->setRiskyAllowed(true)
    ->setRules([
        '@PSR12' => true,
        'declare_strict_types' => true, // 每个文件自动加 declare(strict_types=1)
        'no_unused_imports' => true,
        'ordered_imports' => ['sort_algorithm' => 'alpha'],
        'array_syntax' => ['syntax' => 'short'], // 一律 []
        'braces' => ['allow_single_line_anonymous_class_with_empty_body' => true],
    ])
    ->setFinder($finder);
```

```bash
# 格式化并应用(提交前运行)
vendor/bin/php-cs-fixer fix

# CI 只做检查,不改文件
vendor/bin/php-cs-fixer fix --dry-run --diff

# 静态分析(severity=1 表示把 error 视为必须修复)
vendor/bin/psalm --no-cache --output-format=console --report=/dev/stderr
```

### 2.4 psalm.xml

```xml
<?xml version="1.0"?>
<!-- psalm.xml —— 严格静态分析配置 -->
<psalm
    errorLevel="1"
    strictBinaryOperandCheck="true"
    findUnusedCode="true"
    findUnusedBaselineEntry="true">
    <projectFiles>
        <directory name="src"/>
        <ignoreFiles>
            <directory name="vendor"/>
        </ignoreFiles>
    </projectFiles>
</psalm>
```

## 3. 命名与风格

### 3.1 命名约定表

| 类型 | 约束 | 示例 |
| --- | --- | --- |
| 命名空间 | 反域名前缀 + 大写驼峰分段 | `App\Billing\Invoice` |
| 类 | 大写驼峰 `UpperCamelCase` | `InvoiceBuilder` |
| 接口 | 大写驼峰,多带行为语义 | `PaymentGatewayInterface` |
| trait | 大写驼峰 | `HasTimestamps` |
| 方法/函数 | 小驼峰 `lowerCamelCase` | `parseInvoiceNumber()` |
| 常量/枚举名 | `UPPER_SNAKE_CASE` | `MAX_RETRIES` |
| 枚举的 case | `UPPER_SNAKE_CASE` | `Status::PAID` |
| 变量/属性 | 小驼峰 | `$invoiceTotal` |
| 私有属性 | 小驼峰,不加下划线前缀 | `private int $count` |
| 布尔属性/方法 | 用 `is`/`has`/`can` 前缀 | `isPaid()`, `$isActive` |

### 3.2 正例与反例

```php
<?php
declare(strict_types=1);

namespace App\Billing;

// 正确:类名 UpperCamelCase、属性小驼峰、常量 UPPER_SNAKE_CASE
final class InvoiceStatus
{
    public const PAID = 'paid';

    public function __construct(
        private readonly string $id,
        private bool $isPaid = false,
    ) {
    }

    public function markAsPaid(): void
    {
        $this->isPaid = true;
    }
}
```

```php
<?php
// 反例:以下命名与风格不可使用
class invoice_status {           // 错:类名非 UpperCamelCase
    public $invoice_id;           // 错:snake_case 用于属性
    public function getInvoiceID() {} // 错:缩写大小写不统一
    private $_internal_count;     // 错:下划线前缀私有属性
    var $oldStyle = 1;            // 错:var 已废弃
}
```

## 4. 语法与惯用法

### 4.1 类型与标量声明

- 每个方法、属性、参数都尽量声明类型;返回 `void` 方法显式声明 `: void`。
- 标量类型包括 `int`、`float`、`string`、`bool`、`array`、`object`、`iterable`。
- 联合类型(union)与可空类型用 `?T` 或 `T|null`;推荐使用 `?T` 的短写法优先级低于联合类型中的显式 `null`。

```php
<?php
declare(strict_types=1);

function parseMoney(string $amount): int
{
    // 输入做一次规范化,避免反复判断
    $normalized = preg_replace('/[^0-9]/', '', $amount);
    return (int) $normalized;
}

function label(?string $name): string
{
    // 可空参数配合默认行为
    return $name ?? 'anonymous';
}
```

### 4.2 数组

- 一律使用短数组语法 `[]`,不用 `array()`。
- 使用解构(packed/destructuring)获取数组元素,避免逐一下标访问。
- 数组遍历优先 `foreach`,索引取值前用 `array_key_exists` 或 null 合并。

```php
<?php
declare(strict_types=1);

$order = ['id' => 42, 'total' => 990];
// 解构命名,可读性更好
['id' => $orderId, 'total' => $total] = $order;

$mapping = ['a' => 1, 'b' => 2];
// 缺失键用 ?? 提供默认值,避免 undefined key 告警
$value = $mapping['c'] ?? 0;

// 列表解构
[$first, $second] = [10, 20]; // $first=10, $second=20
```

### 4.3 字符串

- 优先单引号;需要插值或转义等价字符才用双引号。
- 长字符串拼接用 `implode`、heredoc 多为模板;避免毫无必要的前后置拼接。
- 判断子串使用 `str_contains`/`str_starts_with`/`str_ends_with`。

```php
<?php
declare(strict_types=1);

$name = 'alice';
// 双引号插值,语义清晰
echo "Hello, $name!";

$parts = ['2024', '01', '15'];
// 无用的逐段拼接改用 implode
$date = implode('-', $parts);

$path = 'src/Controllers/HomeController.php';
if (str_ends_with($path, '.php')) {
    echo "这是 PHP 文件";
}
```

### 4.4 类与对象

- 优先 `final class`;继承只在确有扩展点时允许,并遵循开放封闭原则。
- 构造函数属性提升(constructor property promotion)用于简单依赖注入。
- 只读属性可防御意外修改,但不应用来掩盖初始化顺序问题。

```php
<?php
declare(strict_types=1);

namespace App\Support;

interface LoggerInterface
{
    public function log(string $message): void;
}

// 只读、构造时注入,避免 setter 提升可变状态
final readonly class Config
{
    public function __construct(
        public string $dsn,
        public int $timeout = 5,
    ) {
    }
}
```

### 4.5 参数、默认值与展开

- 默认值必须是常量表达式;禁止用可变值作为默认值。
- 通过可变参数 `...$args` 与命名参数结合,降低调用方传参顺序错误的风险。
- 命名参数只用于可读性明显提升的场景,与默认值配合时最安全。

```php
<?php
declare(strict_types=1);

function connect(
    string $dsn,
    bool $persistent = false,
    array $options = [],
): void {
    // 显式默认值,便于调用方只关心需要的参数
    /* ... */
}

// 可变参数
function sum(int ...$nums): int
{
    return array_sum($nums);
}
echo sum(1, 2, 3); // 6

// 命名参数调用:跳过默认项,只覆盖需要的
connect(dsn: 'mysql://user@host/db', options: ['charset' => 'utf8mb4']);
```

### 4.6 引用与数组参数

- 默认按值传递;需要修改外部变量才用引用参数(参数前加 `&`)。
- 引用参数会让调用契约隐式可变,尽量改用返回值或对象。
- 数组按值拷贝在 PHP 中代价低(写时复制),不要为了"省内存"滥用引用。

```php
<?php
declare(strict_types=1);

// 需要就地修改集合时,引用参数才合理;否则应返回新数组
function appendTo(array &$list, int $value): void
{
    $list[] = $value;
}

$items = [];
appendTo($items, 7); // $items 变成 [7]

// 更优做法:返回新数组,契约更清晰
function withAppend(array $list, int $value): array
{
    $list[] = $value;
    return $list;
}
```

## 5. 类型系统与内存

### 5.1 严格类型

- 每个文件开头写 `declare(strict_types=1);`,仅在可被多个文件直接包含的入口(极少)例外。
- 严格模式只影响「跨文件」的函数/方法调用;同文件内的调用不受影响,因此要保证整组文件都开启。
- 使用 `TypeError` 作为类型不符的统一错误信号。

```php
<?php
declare(strict_types=1);

function half(int $n): int
{
    return intdiv($n, 2);
}

// 在开启严格类型的文件中调用:
try {
    half('8'); // 抛出 TypeError,而不是把 '8' 强转成 8
} catch (\TypeError $e) {
    echo '类型不匹配: '.$e->getMessage();
}
```

### 5.2 null 安全

- 可空类型参数/返回值显式用 `?T` 或 `T|null`;用 `??` 提供默认,用 `?->` 做可空对象访问。
- 禁止通过 `isset()` 掩盖未初始化变量的逻辑错误。
- 集合形属性不适合空时返回 `null`,而是返回空数组,符合「宁可空集合不可 null」原则。

```php
<?php
declare(strict_types=1);

class User
{
    public function __construct(
        public readonly string $name,
        public readonly ?string $email = null,
    ) {
    }

    public function displayName(): string
    {
        // 可空属性通过 ?? 给出展示默认值
        return $this->email ?? '未填写邮箱';
    }
}

$user = new User(name: 'alice');
// ?-> 只在非 null 时继续访问
$upcased = $user->email?->toUpperCase(); // null 安全:结果为 null 而非调用报错
```

### 5.3 变量作用域

- 函数内只读全局可用「传入参数」;真需要全局状态则显式声明,并加注释说明原因。
- 静态局部变量 `static $counter` 用于惰性缓存,但要留意并发与状态残留。
- 避免在闭包中使用 `use(&$var)`,防止引用逃逸导致的难排查 bug。

```php
<?php
declare(strict_types=1);

$config = ['retries' => 3];

function makeClient(array $config): void
{
    // 通过参数传配置,而不是依赖全局 $config
    $retries = $config['retries'];
    /* ... */
}

// 只在请求生命周期内缓存一次的统计,允许 static 惰性初始化
function sequence(): int
{
    static $seq = 0;
    return ++$seq;
}
```

### 5.4 引用计数与内存

- PHP 自动通过引用计数管理内存,不会出现手动 free;只需避免无界累积(如常驻进程中的长期数组增长)。
- 大文件读取用流式处理,避免一次性 `file_get_contents` 加载到内存。
- 生成器可用于大集合,减少峰值内存,但不适合需要随机访问的场景。

```php
<?php
declare(strict_types=1);

// 流式读取大文件,避免整文件进内存
function readLargeLog(string $path): iterable
{
    $handle = fopen($path, 'rb');
    try {
        while (!feof($handle)) {
            $line = fgets($handle);
            if ($line !== false) {
                yield rtrim($line, "\n");
            }
        }
    } finally {
        fclose($handle);
    }
}

foreach (readLargeLog('/tmp/app.log') as $line) {
    // 逐行处理,内存占用稳定
}
```

## 6. 错误处理

### 6.1 异常与 Error

- 用异常表达预期失败;异常类型从领域语义出发,而不是只抛 `Exception`。
- 可恢复的输入/依赖问题抛自定义异常;不可恢复的编程错误让 `Error`(如 `TypeError`)自然冒泡。
- 捕获异常时`catch` 到最具体类型,避免全捕获并吞掉。

```php
<?php
declare(strict_types=1);

namespace App\Billing;

class PaymentFailed extends \RuntimeException
{
}

class PaymentService
{
    public function charge(float $amount): void
    {
        if ($amount <= 0) {
            throw new \InvalidArgumentException('金额必须大于 0');
        }
        $ok = $this->callGateway($amount);
        if (!$ok) {
            throw new PaymentFailed('网关调用失败');
        }
    }

    private function callGateway(float $amount): bool
    {
        /* 模拟外部调用 */
        return false;
    }
}

// 调用方:只捕获领域异常,把系统级错误交给上层兜底
try {
    (new PaymentService())->charge(9.9);
} catch (PaymentFailed $e) {
    // 记录并将面向用户的信息展示
    error_log($e->getMessage());
}
```

### 6.2 finally 与资源释放

- `finally` 用于无论成功失败都要执行的清理(关闭句柄、释放锁)。
- 不要「先 catch 再 finally 拷贝清理代码」。

```php
<?php
declare(strict_types=1);

function readWithLock(string $path): string
{
    $handle = fopen($path, 'rb');
    if ($handle === false) {
        throw new \RuntimeException("无法打开 $path");
    }
    try {
        flock($handle, LOCK_SH);
        $content = stream_get_contents($handle);
        return $content === false ? '' : $content;
    } finally {
        // 无论读取是否抛错,都释放锁并关闭
        flock($handle, LOCK_UN);
        fclose($handle);
    }
}
```

## 7. 异步与并发

- PHP-FPM 默认是「每请求进程」模型,进程内状态在请求结束即释放;常驻进程(CLI/Swoole/Workerman)需要显式管理生命周期。
- 避免在进程内使用可变全局单例存储请求级数据,防止常驻进程下的状态污染。
- 并发修改同一文件/资源时使用 `flock`;进程间通信优先消息队列或数据库事务。

```php
<?php
declare(strict_types=1);

// 进程间对计数文件做原子递增
function incrementCounter(string $file): int
{
    $handle = fopen($file, 'c+');
    if ($handle === false) {
        throw new \RuntimeException("无法打开 $file");
    }
    try {
        flock($handle, LOCK_EX); // 独占锁,避免并发写坏数据
        $value = (int) stream_get_contents($handle);
        $value++;
        rewind($handle);
        ftruncate($handle, 0);
        fwrite($handle, (string) $value);
        fflush($handle);
        return $value;
    } finally {
        flock($handle, LOCK_UN);
        fclose($handle);
    }
}
```

## 8. 结构与架构

### 8.1 分层与职责

- 通过命名空间体现模块边界:业务逻辑(Service)、数据访问(Repository)、HTTP 层(Controller)分开。
- Controller/DTO 只做入参校验与出参序列化;真实规则放进 Service 层,保证可复用与可测。
- 使用 Composer 的 PSR-4 把每个模块目录映射到命名空间前缀。

```text
src/
├── Billing/
│   ├── Invoice.php          # 实体
│   ├── InvoiceRepository.php
│   └── PaymentService.php
├── Http/
│   ├── Controller/
│   │   └── InvoiceController.php
│   └── Request/
│       └── CreateInvoiceRequest.php
├── Support/
│   └── Logger.php
└── core.php                 # 领域初始化入口
tests/
└── Billing/
    ├── InvoiceTest.php
    └── PaymentServiceTest.php
```

### 8.2 依赖注入

- 构造函数注入为主;需要时才用 setter 注入(可省略、可替换的场景)。
- 不使用静态 `ServiceLocator`/全局容器在业务代码里取依赖,否则难测试、难追踪 owner。
- 只读属性配合构造注入,表达「初始化后不可变」的依赖关系。

```php
<?php
declare(strict_types=1);

namespace App\Billing;

interface InvoiceRepositoryInterface
{
    public function find(string $id): ?Invoice;
}

final class PaymentService
{
    // 依赖通过构造注入,只读防篡改
    public function __construct(
        private readonly InvoiceRepositoryInterface $repository,
    ) {
    }

    public function refund(string $invoiceId): void
    {
        $invoice = $this->repository->find($invoiceId);
        if ($invoice === null) {
            throw new \InvalidArgumentException('发票不存在');
        }
        /* ... */
    }
}
```

### 8.3 状态唯一 owner

- 每个业务状态字段只能有一个模块拥有写权限;其余模块只能读取或订阅事件。
- 避免同一份状态散落在多个类中被随意修改,出现「两条写入路径」。

```php
<?php
declare(strict_types=1);

// 唯一 owner:发票的状态只能由本实体私有方法修改
final class Invoice
{
    private string $status = 'draft';

    public function pay(): void
    {
        if ($this->status !== 'draft') {
            throw new \LogicException('只能支付草稿发票');
        }
        $this->status = 'paid';
    }
}
```

## 9. 构建 / 测试 / 发布

### 9.1 构建流程

- `composer install`、`php-cs-fixer`、`psalm`、`phpunit` 串成脚本,CI 一键执行。
- 发布产物中不包含 `vendor` 源码之外的测试与开发依赖;使用 `composer install --no-dev`。
- 生产环境 `composer dump-autoload --optimize` 生成优化 autoloader。

```bash
#!/usr/bin/env bash
set -euo pipefail
# build.sh —— 本地/CI 统一构建脚本
composer install --prefer-dist
vendor/bin/php-cs-fixer fix --dry-run --diff
vendor/bin/psalm --no-cache
vendor/bin/phpunit
composer dump-autoload --optimize
echo "构建通过"
```

### 9.2 测试写法

- 单元测试聚焦单个 Service/实体,注入 mock;集成测试走真实依赖但裁剪外部副作用。
- 断言使用语义化 API(如 `assertSame`、`assertGreaterThan`),不要断言内部实现。
- 每个公共方法至少覆盖「正常路径」与合作失败路径。

```php
<?php
declare(strict_types=1);

namespace App\Billing;

use PHPUnit\Framework\TestCase;

final class PaymentServiceTest extends TestCase
{
    public function testChargeWithNegativeAmountThrows(): void
    {
        $service = new PaymentService();
        $this->expectException(\InvalidArgumentException::class);
        $service->charge(-1.0); // 负金额应直接拒绝
    }

    public function testChargeSuccessWhenGatewayAccepts(): void
    {
        $service = new PaymentService(pretendGateway: true);
        $result = $service->charge(99.9);
        $this->assertTrue($result);
    }
}
```

### 9.3 CI 配置示例

```yaml
# .github/workflows/ci.yml 片段
jobs:
  php:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: shivammathur/setup-php@v2
        with:
          php-version: '8.3'
          coverage: xdebug
      - run: composer install --prefer-dist --no-progress
      - run: vendor/bin/php-cs-fixer fix --dry-run --diff
      - run: vendor/bin/psalm
      - run: vendor/bin/phpunit --coverage-text
```

## 10. 安全与性能要点

- **SQL 注入**:一律使用 PDO 预处理 + 绑定参数,禁止字符串拼接 SQL。
- **命令注入**:需要执行系统命令时,用 `escapeshellarg` 处理每个参数,且优先考虑参数数组形式。
- **XSS**:输出到 HTML 前用 `htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8')`。
- **临时文件**:不要用可预测路径写入临时文件,优先 `tempnam`/`sys_get_temp_dir` 组合并限制权限。

```php
<?php
declare(strict_types=1);

// 正确的 SQL 参数化
function findByName(PDO $pdo, string $name): array
{
    $stmt = $pdo->prepare('SELECT * FROM users WHERE name = :name');
    $stmt->execute(['name' => $name]); // 绑定参数,注入无效
    return $stmt->fetchAll();
}

// 输出转义
function renderName(string $raw): string
{
    return htmlspecialchars($raw, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}
```

```php
<?php
declare(strict_types=1);

// 安全地创建临时文件:随机名 + 最小权限
function writePageOnce(string $content): string
{
    $file = tempnam(sys_get_temp_dir(), 'pg');
    if ($file === false) {
        throw new \RuntimeException('无法创建临时文件');
    }
    file_put_contents($file, $content);
    chmod($file, 0o600); // 仅当前用户可读写
    return $file;
}
```

## 11. 常见陷阱与反模式

### 陷阱 1:未启用 `strict_types`
- 同目录文件可能各自动态强制转换,导致数据被悄悄截断。
- 修正:每个文件开头 `declare(strict_types=1);`,并在 `.php-cs-fixer` 中自动化。

### 陷阱 2:字符串拼 SQL
- 用户输入直接进入 SQL,是最高危注入面。
- 修正:始终使用 PDO/数据库驱动的参数绑定,见第 10 节示例。

### 陷阱 3:`==` 宽松比较
- `"abc" == 0` 为 `true`、`"1" == 1` 相等,造成隐蔽逻辑错误。
- 修正:比较类型严格用 `===`/`!==`。

```php
<?php
declare(strict_types=1);

$input = '1e0';
if ($input == 1) {          // true,宽松类型陷阱
    echo '相当于 1';
}
if ($input === '1') {       // false,严格的类型+值比较
    echo '字符串 1';
}
```

### 陷阱 4:`.=` 大规模循环拼接
- 在循环内反复 `$str .= $chunk` 会在长文本下造成内存分页低效。
- 修正:先收集数组再 `implode`。

```php
<?php
declare(strict_types=1);

$lines = [];
for ($i = 0; $i < 1000; $i++) {
    $lines[] = "line-$i";
}
$joined = implode("\n", $lines); // 优于循环内拼接
```

### 陷阱 5:全捕获吞异常
- `catch (\Exception $e) {}` 把错误藏起来,无法定位。
- 修正:catch 具体类型,至少记录日志或重新包装。

### 陷阱 6:可变全局单例
- 常驻进程下会在请求间残留数据,出现偶发状态污染。
- 修正:构造注入 + 请求作用域容器(见第 8 节)。

### 陷阱 7:`error_log` 直接面向用户
- 把详细信息输出到响应,泄漏内部路径与数据。
- 修正:记录到日志通道,响应用通用文案。

### 陷阱 8:临时文件名可预测且带竞态
- 多进程同时写同一路径会互相覆盖。
- 修正:`tempnam` + `flock`(见第 7、10 节)。

### 陷阱 9:滥用静态方法持有状态
- `static` 属性在长生命周期进程中成为胯请求共享可变状态。
- 修正:仅在数据天然持久且确实需要跨请求缓存时使用,并加注释。

### 陷阱 10:深层嵌套的 `if/else`
- 可读性差且易形成多条写入路径。
- 修正:提前 return、`match` 表达式、守卫子句。

```php
<?php
declare(strict_types=1);

function rank(int $score): string
{
    return match (true) {
        $score >= 90 => 'A',
        $score >= 60 => 'B',
        default      => 'C',
    };
}
```

### 陷阱 11:混用 `isset` 抑制变量
- `isset($a['k'])` 掩盖「键从未初始化」的设计问题。
- 修正:类型化属性 + 构造时默认值,避免靠 isset 兜底。

### 陷阱 12:把时间格式化塞进业务层
- 时区/格式到处重复,改为依赖注入一个专门的日期服务,保证一致 owner。

### 陷阱 13:直接依赖全局 `$_GET/$_POST`
- 在非 Web 环境与测试下不可用。
- 修正:通过 Request DTO 显式收集并校验输入。

### 陷阱 14:循环中执行重复 DB 查询
- 造成 N+1 查询。
- 修正:先批量取回 `IN (...)` 再映射,见伪代码:

```php
<?php
declare(strict_types=1);

// 反例:逐条查
// foreach ($ids as $id) { $rows[] = $repo->find($id); }

// 修正:批量查询一次
$rows = $repo->findMany($ids); // 内部使用 IN 子句
```

### 陷阱 15:不校验外部返回就解引用
- 第三方返回 `null` 时直接访问属性就抛错。
- 修正:可空链 `?->` / 类型映射 / 显式校验,见第 5 节。

## 12. 自查检查清单

自检 PHP 代码是否达标,勾选以下各项:

- [ ] 每个 `.php` 文件首行包含 `declare(strict_types=1);`
- [ ] 文件命名与类名符合 PSR-4 自动加载,路径与命名空间一致
- [ ] PSR-12:缩进 4 空格、大括号换行、无多余空行
- [ ] 类/接口/trait 命名 `UpperCamelCase`,方法/变量 `lowerCamelCase`
- [ ] 常量与枚举 case 使用 `UPPER_SNAKE_CASE`
- [ ] 数组使用短语法 `[]`,不使用 `array()`
- [ ] 所有公开 API 的参数与返回类型已声明,`void` 显式声明
- [ ] SQL 全部参数化,无字符串拼接
- [ ] 输出前对动态内容做转义(HTML/JSON)
- [ ] 临时文件使用 `tempnam`/`flock`,无固定可预测路径
- [ ] 错误按语义分类:领域异常、非法参数、编程错误分别处理
- [ ] `finally` 正确处理资源与锁释放
- [ ] 不存在吞异常的空 catch 块
- [ ] 严格控制状态 owner,无「两条写入路径」
- [ ] 依赖通过构造器注入,无静态取依赖
- [ ] 大文件采用流式/生成器,无一次性全量加载
- [ ] `php-cs-fixer --dry-run` 通过
- [ ] `psalm` 在 `errorLevel=1` 下无错误
- [ ] 关键路径有单元测试覆盖正常与失败分支

## 13. 参考资料

- PSR-12:Extended Coding Style Guide — 代码风格基线。
- PSR-4:Autoloading Standard — 命名空间与目录映射。
- 官方 PHP Manual — 类型系统、内存、数组与字符串语义。
- Psalm 文档(v5+) — strict 级别的静态分析用法。
- php-cs-fixer 手册 — 规则与配置参考。