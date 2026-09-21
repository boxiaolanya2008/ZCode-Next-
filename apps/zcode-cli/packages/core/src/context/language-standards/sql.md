# SQL 编码规范

> 适用范围:本规范约束仓库内所有直接编写 SQL、数据访问层(Repository/DAL/DAO)、ORM Entity 映射、数据库迁移(表结构变更)以及查询性能与事务相关代码。覆盖主流关系型数据库(PostgreSQL、MySQL、SQLite、SQL Server)的通用写法,并在必要时给出方言差异说明。
>
> 所有读写数据的代码路径必须以参数化查询或 ORM 绑定参数方式访问数据库,严禁字符串拼接 SQL。索引、事务、迁移必须遵循明确的维护流程。
>
> 本规范适用于新增 SQL 与重构既有 SQL(如 JOIN、子查询、更新批量数据)。涉及第三方生成 SQL 的开发者,也应保证输出满足本规范的安全与性能要求。

## 1. 概述与使用时机

SQL 是本仓库中持久层数据的书写语言。写好 SQL 不只是满足语法正确,更是保证数据完整性、查询性能、可维护性和安全性的基础。

写出好的 SQL 应遵循以下理念:

- **安全优先**:任何外部输入进入查询都必须通过参数绑定,这是数据访问层的铁律,不接受例外。
- **正确语义**:明确 NULL 语义、JOIN 类型、事务边界和隔离级别,避免"看起来对但边界错"的隐性 bug。
- **可读可维护**:格式化、命名一致、子查询命名清晰,让下一次修改的人能快速理解。
- **性能可预期**:用索引、正确写法和执行计划分析来保证复杂度可知,而不是事后堆缓存。

使用时机:

- 新增或修改读写数据的业务功能时,先写 SQL 或 ORM 查询,再补对应迁移。
- 排查慢查询、死锁、并发异常、数据不一致时,回到 SQL 与索引定义层面分析。
- 每次表结构变更必须先编写迁移,再修改应用层代码,保持"迁移先行"的顺序。

## 2. 环境与工具链

### 2.1 数据库

根据部署目标选择驱动与方言:

- PostgreSQL:驱动 `pg`(Node)或 `psycopg`(Python),支持丰富索引与事务特性。
- MySQL:驱动 `mysql2`。
- SQLite:驱动 `better-sqlite3`(同步)或 `sqlite3`,适合测试与本地开发。
- SQL Server:驱动 `mssql`。

本项目约定 ORM 统一使用 Drizzle ORM(PostgreSQL/SQLite)或 Prisma,二者都强制参数化查询。原型开发允许裸驱动,但必须走预编译 statement。

### 2.2 迁移工具

- 模式(DDL)迁移使用 Drizzle Kit 或 Prisma Migrate。
- 通过 DDL 之前必须生成迁移文件并纳入版本控制,禁止在生产库手工执行 `ALTER TABLE`。
- 迁移文件命名必须可排序(SQ 序号 + 描述),保证在任意环境按顺序回放结果一致。

### 2.3 Lint 与格式化

推荐工具链:

- `sqlfluff`(方言感知的 SQL linter)配合 `prettier-plugin-sql` 或 `@sql-formatter/sql` 做格式化。
- `sqlcommenter` 注入请求上下文注释,便于链路追踪。
- 查询静态检查使用 `sqlfluff lint`;错误级别阻止提交,警告级别允许存在。

对齐配置形如:

```sql
-- sqlfluff 通用规则:表名必须小写 snake_case,必须使用 LEFT JOIN 关键字,
-- 禁止使用 SELECT *。
-- config 片段(sqlfluff: dialect: postgres, rules: L019, L031, L034 开启)
```

### 2.4 构建与测试

- 单元测试对纯函数/SQL 片段做断言(Drizzle `eq()`,或字符串比对)。
- 集成测试必须在事务内运行(每条用例回滚),避免污染共享数据。
- 迁移验证在 CI 中用全新数据库实例执行全部迁移并冒烟断言表结构。

安装示例:

```bash
# 新增 sqlfluff 到 devDependencies
pnpm add -D sqlfluff prettier-plugin-sql

# 运行 SQL linter(返回非零退出码时 CI 失败)
pnpm exec sqlfluff lint migrations/ src/**/queries/
```

## 3. 命名与风格

### 3.1 命名约定表格

| 对象 | 约定 | 示例 | 反例 |
| ---- | ---- | ---- | ---- |
| 表名 | 复数小写 snake_case | `orders`, `order_items` | `OrderTable`, `orders_new` |
| 列名 | 单数小写 snake_case | `user_id`, `created_at` | `userID`, `userid` |
| 主键 | `id`(单列)或 `{table}_id` 复合 | `id` | `orderId`, `ID` |
| 外键列 | `{引用的表/实体}_id` | `user_id` | `userId`, `uid` |
| 索引 | `idx_{表}_{列}`/联合 `idx_{表}_{c1}_{c2}` | `idx_orders_user_id` | `Index1`, `key_idx` |
| 唯一约束 | `uq_{表}_{列}` | `uq_users_email` | `UniqueConstraint` |
| 布尔列 | `is_`/`has_` 前缀 | `is_active` | `active`, `status` |
| 时间戳 | `created_at` / `updated_at` / `deleted_at` | 同上 | `time`, `modifyTime` |
| CTE/别名 | 简洁语义化、单数 | `active_users` | `a`, `t1`(除非必须) |

### 3.2 正例与反例

```sql
-- 正例:清晰命名,显式类型,启用软删除外键
CREATE TABLE products (
    id          BIGSERIAL PRIMARY KEY,
    shop_id     BIGINT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    name        VARCHAR(200) NOT NULL,
    price_cents INTEGER NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_products_shop_id ON products(shop_id);
```

```sql
-- 反例:命名含糊、类型随意、未建索引、无约束
CREATE TABLE Product ( p_id INT, PName text, prices decimal );
SELECT * FROM Product WHERE PName LIKE '%' || 'x' || '%';
```

### 3.3 大小写与关键字

- SQL 关键字一律大写(`SELECT`、`FROM`、`WHERE`、`JOIN`、`GROUP BY`)。
- 标识符(endToValidate);由 linter 保证一致。

## 4. 语法与惯用法

这一节给出查询书写的高频惯用法,分类型、集合语义、写入操作三个小节。

### 4.1 类型与列选择

- **不使用 `SELECT *`**:显式列清单,减小 IO、稳定结果形状、避免未来加列破坏下游。
- **日期时间**统一使用带时区类型(PostgreSQL `timestamptz`,MySQL `DATETIME(3)` 或 UTC 存储),应用层输出本地时区。
- **金额与精确小数**使用整数单位(cent)或 `numeric`,禁止 `float/double`。
- 字符串长度显式给出,索引列上的变长列给合理上限。

```sql
-- 正例:显式投影并转换时区
SELECT id, name, created_at AT TIME ZONE 'Asia/Shanghai' AS created_local
FROM orders
WHERE shop_id = $1
ORDER BY created_at DESC
LIMIT 50;

-- 反例:select * 会返回全部列并破坏下游契约
SELECT * FROM orders WHERE shop_id = $1;
```

### 4.2 集合与选择器语义

- `JOIN` 必须显式写 `INNER/LEFT/RIGHT`,禁止裸 `JOIN`(默认语义随方言而变)。
- 先过滤再聚合:在 `JOIN` 的 `ON` 或提前 `WHERE` 缩小集合,避免大表关联后的膨胀。
- 去重优先用 `EXISTS` 而非 `IN` 子查询(尤其当子查询可能返回 NULL 时)。
- 分页优先用 `WHERE id > $lastId ORDER BY id` 的 Keyset 分页,避免 `OFFSET` 深翻页爆炸。

```sql
-- 正例:EXISTS 语义清晰且不受 NULL 影响
SELECT u.id, u.email
FROM users u
WHERE EXISTS (
    SELECT 1 FROM orders o
    WHERE o.user_id = u.id
      AND o.status = 'paid'
);

-- 反例:IN 子查询含 NULL 时结果语义错误且大表性能差
SELECT u.id FROM users u
WHERE u.id NOT IN (SELECT o.user_id FROM orders o);
```

### 4.3 JOIN 与索引方向

- 关联列必须两侧是同一类型、同一排序规则,否则命中不了索引。
- 外键列与高频 WHERE 过滤列建索引,否则 `JOIN` 层面会退化为嵌套循环全扫。
- 为"排序+过滤"的查询建复合索引,顺序为等值列在前、排序列在后。

```sql
-- 高频查询:按用户查订单并按时间倒序
CREATE INDEX idx_orders_user_created ON orders(user_id, created_at DESC);

SELECT id, total_cents FROM orders
WHERE user_id = $1
ORDER BY created_at DESC
LIMIT 20;   -- 该查询可走上述复合索引,避免 filesort/temp
```

### 4.4 写入操作(DML)

- `INSERT` 显式列出列名,禁止依赖列顺序。
- 批量写入用多值 `INSERT ... VALUES (...), (...)` 或 `INSERT ... ON CONFLICT`(Postgres)/`ON DUPLICATE KEY`(MySQL)。
- `UPDATE` 必须带 `WHERE`;默认禁止无条件 `UPDATE/DELETE`(需代码 review 特批)。
- 更新与检查组合可用 `UPDATE ... RETURNING`(Postgres)减少一次往返。

```sql
-- Postgres 幂等插入:存在即更新,返回受影响行
INSERT INTO user_tokens (user_id, token_hash, expires_at)
VALUES ($1, $2, $3)
ON CONFLICT (user_id)
DO UPDATE SET token_hash = excluded.token_hash, expires_at = excluded.expires_at
RETURNING id;

-- 反例:全量覆盖整张表,危险且无法回滚到某一条
UPDATE user_tokens SET token_hash = 'x';
```

## 5. 类型与安全/语义(NULL 与类型)

NULL 是 SQL 最容易出错的地方。三条铁律:

### 5.1 三值逻辑

- `NULL = NULL` 结果为 `NULL`(未知),不是 `TRUE`。
- 判断 NULL 必须用 `IS NULL` / `IS NOT NULL`;通用比较/等值 `=` 会吞掉 NULL 行。
- 聚合中 `COUNT(col)` 忽略 NULL,`COUNT(*)` 统计全部行,二者语义不同。

```sql
-- 反例:NOW 会让 NULL 的 deleted_at 被错误过滤,等价于永久删除
SELECT id FROM users WHERE deleted_at != NULL;

-- 正例:显式判断
SELECT id FROM users WHERE deleted_at IS NULL;

-- COUNT 语义:统计邮箱非空的数量(忽略 NULL)
SELECT COUNT(email) AS email_provided,
       COUNT(*)     AS total_users
FROM users;
```

### 5.2 约束驱动的数据安全

- 重要的不变量用数据库约束表达(`NOT NULL`, `UNIQUE`, `CHECK`),不要依赖应用层检查。
- 唯一约束应配合 `ON CONFLICT` / 捕获重复键异常做幂等,而不是先查后插(存在竞态)。

```sql
-- 正例:数据库强制唯一,应用只需捕获 23505
CREATE UNIQUE INDEX uq_users_email ON users(email);

INSERT INTO users (email, name) VALUES ($1, $2)
ON CONFLICT (email) DO NOTHING;
```

### 5.3 加锁与乐观并发

- 读后写场景(read-modify-write)用行锁 `SELECT ... FOR UPDATE` 防并发覆盖。
- 仅检查存在性并插入用带锁事务或唯一约束,不能裸读再插。
- 更新携带 `version` 字段做乐观锁,冲突时重试或报错。

```sql
-- Postgres:MONEY 账户余额扣减,锁定该行防并发扣款
BEGIN;
SELECT balance_cents FROM accounts WHERE id = $1 FOR UPDATE;
UPDATE accounts
   SET balance_cents = balance_cents - $2
 WHERE id = $1
   AND balance_cents >= $2;
COMMIT;
```

## 6. 错误与回滚(事务与回滚)

### 6.1 原子事务边界

- 多个写操作若必须满足"要么全成要么全否",放进一个显式事务。
- 事务应尽量短小,避免在事务内做网络请求、外部 API 调用。
- `DML` 出错要 `ROLLBACK`;连接归还连接池前必须保证事务已干净结束。

```sql
-- 正例:订单 + 库存两步写入,任一步失败整体回滚
BEGIN;
INSERT INTO orders (id, user_id, total_cents) VALUES ($1, $2, $3);
UPDATE inventory SET qty = qty - $4 WHERE sku = $5 AND qty >= $4;
-- 若 UPDATE 未触及任何行(qty 不足),应用检测后 ROLLBACK
COMMIT;
```

```sql
-- 反例:两个写操作分散提交,中途异常会留下半完成的脏数据
INSERT INTO orders (id, user_id) VALUES ($1, $2);
COMMIT;
UPDATE inventory SET qty = qty - 1 WHERE sku = $3;
COMMIT;
```

### 6.2 迁移的事务化回滚

- PostgreSQL/SQLite 的 DDL 支持事务,可整体回滚;MySQL 的多数 DDL 不支持,需谨慎。
- 每个迁移文件单向顺序执行,失败时标明可回滚策略(若无法回滚,至少在注释标注)。
- 迁移前快照数据,迁移后跑数据校验断言。

```sql
-- 迁移示例:加列并回填,事务包裹,Drizzle 生成的 up/down 成对
-- up
ALTER TABLE orders ADD COLUMN currency CHAR(3) NOT NULL DEFAULT 'USD';
UPDATE orders SET currency = 'USD' WHERE currency = 'USD';
-- down
ALTER TABLE orders DROP COLUMN currency;
```

### 6.3 失败的统一处理

- 捕获数据库错误码(如唯一冲突 23505、死锁 40P01)并转成领域错误,不把底层错误抛给上层。
- 连接/statement 失败时应重试(仅幂等语句),重试需指数退避。

## 7. 异步与并发(事务隔离)

### 7.1 隔离级别选择

- 默认使用 MySQL/Postgres 的 READ COMMITTED;对快照读需求用 REPEATABLE READ/可重复读。
- 需要串行化写入(如库存扣减、账户余额)时用写锁或 SERIALIZABLE,并做好冲突重试。
- 不盲目提升隔离级别;先用明确索引与短事务解决并发问题。

```sql
-- Postgres:防止"幻读式"库存超卖,通过行锁 + 条件更新保证原子
BEGIN ISOLATION LEVEL READ COMMITTED;
UPDATE inventory
   SET qty = qty - $2
 WHERE sku = $1 AND qty >= $2
RETURNING qty;
-- 若影响行数为 0,ROLLBACK 并提示库存不足;否则 COMMIT。
COMMIT;
```

### 7.2 应用层异步队列

- 幂等任务(如发送邮件、生成报表)应由消息队列推动,避免在请求线程内长时间占用数据库连接。
- 队列消费者必须幂等(带唯一键去重),防止重复消费导致数据重复写入。

### 7.3 连接池与并发上限

- 连接池上限与后端容量匹配,防止数据库被请求打挂(Maximum pool 合理设置)。
- 长事务与慢查询会耗尽池,须用 `statement_timeout`(Postgres)兜底。

```sql
-- Postgres:给应用层会话设置查询超时,防止失控查询拖垮连接池
SET statement_timeout = '10s';
```

## 8. 结构与架构(模式分层)

### 8.1 数据访问分层

- 业务层只依赖仓储/查询接口,隔离具体 SQL 与 ORM,便于测试替换。
- SQL/查询对象集中放置,业务代码不散落 `db.query(...)` 字符串。
- 同一数据库的读写路径尽量收敛,避免多条写入通道形成数据竞态。

典型目录结构:

```
src/
  data/
    schema.ts          # Drizzle/Prisma schema 定义
    migrations/        # 迁移文件(每个文件一个事务)
    repositories/
      user.repo.ts      # 用户相关查询
      order.repo.ts     # 订单相关查询(含 JOIN/事务)
    queries/
      dashboard.sql     # 复杂报表 SQL
      dashboard.sql.ts  # 类型化封装
  domain/
    user.ts             # 领域服务,依赖 repository 接口
    order.ts
```

### 8.2 查询复用与 CTE

- 复杂多步骤查询优先用 CTE(`WITH`)自上而下可读,而不是多层嵌套子查询。
- 同一报表多处复用的中间结果用 CTE 或视图,避免复制粘贴导致口径漂移。
- 分区/分桶逻辑清晰地带出 `PARTITION BY`,需要"每分组最新一条"时用窗口函数 `ROW_NUMBER()`。

```sql
-- 每用户最近一笔已支付订单(窗口函数代替自连接)
WITH ranked AS (
    SELECT user_id, id AS order_id, total_cents,
           ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) AS rn
    FROM orders
    WHERE status = 'paid'
)
SELECT user_id, order_id, total_cents
FROM ranked
WHERE rn = 1;
```

## 9. 构建 / 测试 / 发布(迁移命令)

### 9.1 迁移命令与发布顺序

- 发布顺序:先生成并提交迁移 → CI 对全新库回放 → 再发布应用代码。
- 向后兼容:先加列(应用读新列)、再改代码、最后删旧列,避免上线窗口读失败。
- 大表结构变更(加索引/改类型)走差额回填或分批,不在热路径单次锁表太久。

```bash
# 生成迁移(auto: 比对 schema 差异)
pnpm drizzle-kit generate --name add_orders_currency

# 本地回放
pnpm drizzle-kit migrate

# 生产发布走 CI 中的迁移任务,相同命令且带锁防止并发迁移
pnpm drizzle-kit migrate --force
```

### 9.2 测试写法

- 仓储/查询测试连真实测试库(内存或专用容器),断言 SQL 返回结果,不以 mock 为主。
- 用例在事务内执行并回滚,保证互不污染;断言覆盖 NULL、空集、边界值。
- 性能回归给慢查询加断言上限(EXPLAIN 无 seq scan 的关键路径)。

```sql
-- 测试断言示例(伪码,配合事务回滚)
-- 期望:EXISTS 查询对"无订单用户"返回空集
-- 期望:金额扣减在余额不足时返回 0 行
```

### 9.3 CI 集成

- `sqlfluff lint` 作为 PR 门禁,格式错误阻止合入。
- 迁移脚本在 CI 全新 PostgreSQL 实例全量执行并校验 Diff。

## 10. 安全与性能要点

### 10.1 注入防护(参数化)

- 一切用户输入进入 SQL 必须参数绑定(`$1`/`?`/命名绑定)。**禁止字符串拼 SQL**。
- 表名、列名、排序字段不可直接拼接;需要动态时用白名单映射。
- ORM 默认参数化,编写裸 SQL 时同样遵守。

```sql
-- 正例:参数绑定,输入多大都只是数据
SELECT id, name FROM users WHERE email = $1;
-- 反例:拼接即注入点
SELECT id, name FROM users WHERE email = '" + input + "';
```

### 10.2 权限与最小暴露

- 数据库账号区分只读/读写;报表与离线任务用只读账号。
- 敏感列(密码哈希、令牌)在 SELECT 中不投影,或脱敏返回。
- 应用层白名单排序字段与分页上限(防止拖库与资源耗尽)。

### 10.3 性能:索引与执行计划

- 慢查询先 `EXPLAIN (ANALYZE, BUFFERS)` 再优化;不凭直觉加索引。
- 覆盖查询的复合索引应包含 SELECT 列(covering index),减少回表。
- 避免对函数/表达式列直接建普通索引,需函数索引或改为冗余列。

```sql
-- Postgres:定位 seq scan,定位后补索引
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM orders WHERE user_id = $1;

-- 若出现 Seq Scan,建立索引
CREATE INDEX idx_orders_user_id ON orders(user_id);
```

### 10.4 大数据量策略

- 深分页/导出用 keyset(cursor)分页而不用 `OFFSET`。
- 一次性导入大批量用 `COPY`(Postgres)或分片事务批次。
- 报表聚合在数据库内完成,避免把全表拉到应用内存。

```sql
-- Keyset 分页:cursor = 上页最后一条的 (created_at, id)
SELECT id, created_at
FROM orders
WHERE (created_at, id) < ($1, $2)   -- 上一页游标
ORDER BY created_at DESC, id DESC
LIMIT 50;
```

### 10.5 防抖与限流(写路径)

- 写放量(如签到、点击)先做幂等键与唯一约束,配合限流阀值。
- 热点行更新(计数器)用原子 `UPDATE ... SET n = n + 1` 而非读改写。

## 11. 常见陷阱与反模式

### 11.1 【陷阱】`SELECT COUNT(*)` 全表扫描判断存在
大表上 `COUNT(*)` 代价高;只需存在性用 `EXISTS`。

```sql
-- 反例:SELECT COUNT(*) FROM orders WHERE user_id=$1; 应用 JS 判断 > 0
-- 正例:SELECT EXISTS(SELECT 1 FROM orders WHERE user_id=$1) AS has_orders;
```

### 11.2 【陷阱】OFFSET 深翻页性能炸裂
`OFFSET 100000` 也须从头扫描;应改 keyset 分页(见 10.4)。

### 11.3 【陷阱】`NOT IN` 遇 NULL 返回空集
`WHERE x NOT IN (subquery)` 当子查询含 NULL 时结果恒为空,改用 `NOT EXISTS`。

### 11.4 【陷阱】隐式类型转换导致索引失效
`WHERE created_at = '2026-01-01'` 若列是 timestamptz 会做类型转换,可能失效;传入同类型参数。

### 11.5 【陷阱】没有 WHERE 的 UPDATE/DELETE
误删全表;强制代码评审且带上可视确认。

### 11.6 【陷阱】事务内做外部网络请求
长事务持锁,死锁与连接池耗尽;把外部调用移出事务。

### 11.7 【陷阱】两列 JOIN 一侧有索引一侧无
大表关联退化;两侧都应建索引。

### 11.8 【陷阱】软删除列无索引
`WHERE deleted_at IS NULL` 高频,但默认给 `is_active` 建索引,`deleted_at` 常漏;补复合或单列索引。

### 11.9 【陷阱】浮点存金额
`float` 存钱有精度问题;用整数单位或 `numeric`。

```sql
-- 反例:price_cents DOUBLE PRECISION
-- 正例:price_cents INTEGER CHECK (price_cents >= 0)
```

### 11.10 【陷阱】连接池耗尽
慢查询/长事务多时耗尽;给查询加超时(`statement_timeout`)并限制池大小。

### 11.11 【陷阱】把 `COUNT(col)` 当作总行数
解释详见 5.1;要总数请用 `COUNT(*)`。

### 11.12 【陷阱】`SELECT *` 破坏下游契约
加列即破坏;总是显式投影。

### 11.13 【陷阱】主键使用 GUID 默认随机序致索引碎片
写放大;可用 `UUIDv7` 时间有序或雪花 ID 降碎片。

### 11.14 【陷阱】先查后插的竞态
`if not exists then insert` 有竞态;用唯一约束 + `ON CONFLICT` 幂等。

### 11.15 【陷阱】子查询当字段未限制行数
`(SELECT name FROM orders WHERE user_id=u.id)` 可能返回多行而报错;限定 `LIMIT 1` 或用聚合/EXISTS。

### 11.16 【陷阱】索引列上函数
`WHERE LOWER(email)=...` 若未建函数索引则无法命中 `idx_users_email`;建 `idx ON users(LOWER(email))` 或存规范化列。

## 12. 自查检查清单

- [ ] 所有外部输入均使用参数化绑定,无字符串拼接 SQL。
- [ ] 无 `SELECT *`,显式列出所需列。
- [ ] 表名/列名小写 snake_case,索引名遵循 `idx_*`。
- [ ] 金额/精确小数使用整数或 `numeric`,未用浮点。
- [ ] 时间戳使用带时区类型,应用层做时区转换。
- [ ] `JOIN` 明确写出 `INNER/LEFT`,未使用裸 `JOIN`。
- [ ] NULL 判断使用 `IS NULL`/`IS NOT NULL`。
- [ ] 存在性判断使用 `EXISTS` 而非 `COUNT(*)`/`NOT IN`。
- [ ] 深分页使用 keyset 分页,未用大 `OFFSET`。
- [ ] 高频 WHERE 与 JOIN 列均有索引,复合索引导向正确。
- [ ] 排序字段被复合索引覆盖,无 filesort/temp 风险。
- [ ] 多步写入置于原子事务内,异常可整体回滚。
- [ ] 迁移文件已生成并提交,发布顺序向后兼容。
- [ ] 更新语句始终带 `WHERE`,无无脑 UPDATE/DELETE。
- [ ] 唯一约束与 `ON CONFLICT` 用于幂等插入。
- [ ] 读后写场景加锁(`FOR UPDATE`)或乐观锁 version。
- [ ] 慢查询关键路径已 `EXPLAIN` 验证无 Seq Scan。
- [ ] 数据库账号遵循最小权限(读写分离)。
- [ ] 事务短小,未在事务内发起外部网络请求。
- [ ] 迁移回滚策略明确,破坏性变更已标注。
- [ ] SQL 通过 `sqlfluff lint` ,格式一致。
- [ ] 测试覆盖 NULL、空集、边界值并有回滚。

## 13. 参考资料

- PostgreSQL 文档:SQL 命令、索引、事务隔离、`EXPLAIN`。
- MySQL 参考手册:读写、约束、字符集与隔离。
- Drizzle ORM / Prisma:迁移与查询 API。
- `sqlfluff` 规则文档:方言配置与规则说明。
- 本仓库 `CONTEXT.md` 领域词表与 `packages/services` 的既有仓储示例,作为迁移与查询风格的参照。