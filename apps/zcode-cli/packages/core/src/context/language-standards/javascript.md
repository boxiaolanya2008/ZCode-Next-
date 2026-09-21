# JavaScript 编码规范

> 本规范适用于仓库内使用纯 JavaScript(含 `.cjs`/`.mjs`/`.js`)编写的运行时依赖、脚本、Web 端代码以及 Node 服务端胶水代码;凡涉及可静态推导的对象结构,优先改为 TypeScript,这里覆盖必须停留 `.js` 的路径。
> 目标是把 ES 语义吃透:严格相等、空值合并、可选链、类字段、模块、`structuredClone`、现代集合,并让这些语义在 Web 浏览器与 Node 两套宿主下行为一致。
> 本规范与 TypeScript 规范并列使用,但这里不涉及类型体操与 schema 推导,而聚焦 ES2024+ 的运行时惯用法、宿主差异与安全性。
> 适用于桌面 renderer、`packages/web` 客户端、`packages/server` 服务端存根,以及任何用 `node:` 前缀的标准库脚本。

## 1. 概述与使用时机

JavaScript 是浏览器与 Node 的公共语言,没有编译期类型检查,运行时语义细节(相等性、真值、原型、异步时序)直接决定正确性。规范的目标是在无类型系统保护的前提下,靠显式约定降低 bug 率。

本仓库在以下场景必须使用 JavaScript(而非 `.ts`):

- 需要与 CommonJS 生态直接交互的脚本,如 `scripts/*.cjs`。
- 面向浏览器环境的纯脚本片段,或在打包产物中避免编译的定位代码。
- 手写 ESM 的 `.mjs` 工具脚本。

在以下场景应避免写 `.js`:

- 承载公共协议类型、数据结构与跨包 API 的模块(应使用 TypeScript)。
- 任何被多个包复用的领域逻辑(类型系统是硬需求)。

核心思路:行为可预测优于代码短。用 `===` 替代隐式转换,用 `??` 替代 `||` 处理空值,用可选链替代逐层判空,用 `Map`/`Set` 替代裸对象字典。

## 2. 环境与工具链

### 2.1 Node 与模块系统

Node 版本以 `mise.toml` 为准。包内 `.js` 统一使用 ESM(`"type": "module"`),系统工具脚本若依赖 `__dirname` 等 CJS 语义应使用 `.cjs` 后缀并显式 `require`。

```json
{
  "name": "my-script",
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "demo": "node scripts/demo.mjs",
    "legacy": "node scripts/legacy.cjs"
  }
}
```

### 2.2 格式化与 lint

Prettier 负责格式;oxlint / eslint 负责语义检查。启用 `eqeqeq`、`no-var`、`prefer-const`、`no-prototype-builtins` 等规则把 ES 惯用法固化下来。

```jsonc
// .oxlintrc.json
{
  "plugins": [
    "unicorn",
    "eslint:recommended"
  ],
  "rules": {
    "eqeqeq": ["error", "always"],
    "no-var": "error",
    "prefer-const": "error",
    "no-await-in-loop": "warn",
    "prefer-promise-reject-errors": "error",
    "no-prototype-builtins": "error"
  }
}
```

```bash
pnpm lint --filter web            # lint web 客户端
pnpm fmt:check                    # 格式检查
node scripts/demo.mjs             # 直接运行 .mjs 脚本
```

### 2.3 测试与断言

浏览器侧用 vitest(jsdom 环境),Node 侧直接使用 Node 内置 `node:test` 与 `assert/strict`,避免多余依赖。

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePath } from './path.js';

test('normalizePath trims trailing slashes', () => {
  assert.equal(normalizePath('/a/b/'), '/a/b');
  assert.equal(normalizePath('/a/b'), '/a/b');
});
```

## 3. 命名与风格

### 3.1 命名约定

| 对象 | 约定 | 示例 |
| ---- | ---- | ---- |
| 变量/函数/参数 | camelCase | `currentState`, `normalizePath` |
| 常量 | UPPER_SNAKE 仅模块级常量 | `MAX_RETRY` |
| 类/构造函数 | PascalCase | `class SessionBus` |
| 布尔 | `is`/`has`/`can`/`should` 前缀 | `isOnline`, `hasFocus` |
| 事件处理器 | `handle<X>` 或 `on<X>` | `onMessage`, `handleClick` |
| 私有字段(ES 私有) | `#` 前缀字段 | `#retries` |
| 未使用参数 | 前缀 `_` | `_event` |

### 3.2 正例与反例

```js
// 反例:var、含糊名、隐式全局
var x = 0;
function f() { return 1; }

// 正例:const、语义名
let attemptCount = 0;
function compute() { return 1; }

// 反例:魔法常量
if (e.status === 408 || e.status === 429) retry();
// 正例:具名常量
const RETRYABLE_STATUS = new Set([408, 429]);
if (RETRYABLE_STATUS.has(e.status)) retry();
```

## 4. 语法与惯用法

### 4.1 严格相等与类型强转

默认只用 `===`/`!==`。仅在确实需要抽象相等时才用 `==`,且必须注释说明场景(如判断 `null == undefined`)。

```js
// 反例:宽松相等隐藏类型问题
if (input == 0) { /* '' 和 '0' 也会进入 */ }

// 正例:严格相等
if (input === 0) { /* ... */ }

// 合法用法:同时判断 null 与 undefined
if (value == null) { /* 等价于 value === null || value === undefined */ }
```

### 4.2 空值合并与可选链

需要 null/undefined 兜底时用 `??`,需要吸收任何 falsy 时(除非确有其意)避免 `||`。深层读取始终用可选链。

```js
const port = opts?.port ?? 8080;     // 0 会被保留
const seed = opts?.seed || 'default'; // 若 seed 可能为 '' 则不适用于此写法

// 反例:逐层判空
const name = user && user.profile && user.profile.name
  ? user.profile.name
  : 'anonymous';
// 正例
const name = user?.profile?.name ?? 'anonymous';
```

### 4.3 解构与默认值

函数入参用参数解构并给默认值;从对象读取多个字段时一次解构,避免重复链式访问。

```js
function render({ title, count = 0, visible = true }) {
  return `${title}:${count}${visible ? ' (可见)' : ''}`;
}

// 反例
function render(cfg) {
  const title = cfg.title ? cfg.title : '未命名';
  const count = cfg.count !== undefined ? cfg.count : 0;
}
```

### 4.4 类与对象

使用 ES class 语法与私有字段 `#`;多态行为优先组合与结构,不用继承层级。构造对象字面量时用简洁方法与计算属性名。

```js
class Counter {
  #value = 0;              // 真正的私有字段
  #max;

  constructor(max = Number.POSITIVE_INFINITY) {
    this.#max = max;
  }

  inc() {
    if (this.#value >= this.#max) return;
    this.#value += 1;
  }

  get value() {
    return this.#value;
  }
}
```

### 4.5 数组与集合操作

优先 `for...of` 与高阶方法(`map`/`filter`/`reduce`),避免 `for i` 索引来动手管理边界;随后用解构与 rest 简化首/尾与展开。

```js
const ids = items.map((it) => it.id).filter(Boolean);
const [first, ...rest] = ids;
const total = rest.reduce((acc, n) => acc + n, 0);

// 反例
const out = [];
for (let i = 0; i < items.length; i += 1) {
  if (items[i].id) out.push(items[i].id);
}
```

### 4.6 现代集合与深拷贝

字典语义用 `Map`/`Set`,深拷贝优先 `structuredClone`,非必要不写递归 clone 或 JSON 往返。

```js
const seen = new Set();
for (const key of keys) {
  if (seen.has(key)) continue;
  seen.add(key);
}

// 深拷贝
const copied = structuredClone(original);
// 反例:丢失 undefined/函数/循环引用/Date 身份
const bad = JSON.parse(JSON.stringify(original));
```

## 5. 类型系统与内存

纯 JS 无静态类型,但可以用运行时约定与最小强度约束靠拢类型安全:

### 5.1 常量与冻结

模块级常量用 `Object.freeze` 包裹,避免被误改;字面量对象如需当作 enum 语义,用冻结与代理防护。

```js
const DEFAULTS = Object.freeze({
  port: 8080,
  host: '127.0.0.1',
});
// 反例:DEFAULTS.port = 9000 可被静默改写
```

### 5.2 空值防护

对可能为 null/undefined 的值,读取前用可选链,写入前判断存在;集合索引可能稀疏时显式处理。

```js
function lookup(map, key) {
  const hit = map?.get(key);
  return hit ?? null;    // 区分「无值」与「未命中」
}

// 反例:下标直接使用,可能取到 undefined
function head(list) {
  return list[0];
}
// 正例:显式表达未命中回调
function head(list, fallback) {
  return list[0] ?? fallback;
}
```

### 5.3 结构化守约与自省

虽然无常量类型,但对外传入/返回的对象约定字段白名单,并配合运行时断言(如 `node:assert` 或手写 guard),替代类型系统。

```js
function isCommand(v) {
  return (
    v !== null &&
    typeof v === 'object' &&
    typeof v.id === 'string' &&
    typeof v.cmd === 'string'
  );
}

function apply(cmd) {
  assert(isCommand(cmd), 'invalid command payload');
  // 之后可安全使用 cmd.id / cmd.cmd
}
```

### 5.4 避免共享可变状态

模块级可变状态是隐形全局,会跨请求/跨容器泄漏。需要状态时用工厂返回闭包,或明确生命周期并由唯一 owner 管理。

```js
// 反例:模块级可变会造成状态泄漏
let counter = 0;
export function next() { return ++counter; }

// 正例:工厂隔离
export function createCounter() {
  let value = 0;
  return Object.freeze({
    next() { value += 1; return value; },
    value: () => value,
  });
}
```

### 5.5 结构拷贝与身份

保留对象引用身份与原型信息时用 `structuredClone`;仅需浅拷贝用展开运算符。原样引用数组时避免直接改入参。

```js
const base = { a: 1, nested: { b: 2 } };
const shallow = { ...base };          // nested 仍共享
const deep = structuredClone(base);   // nested 独立

function addToList(list, item) {
  return [...list, item];             // 返回新数组,不改入参
}
```

## 6. 错误处理

### 6.1 抛出真实 Error

总是抛出带 `name` 与 `message` 的 `Error`(或子类),禁止丢裸字符串或对象,便于堆栈与过滤。

```js
// 反例
throw 'oops';
throw { code: 1 };

// 正例
class AppError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'AppError';
    this.code = code;
  }
}
throw new AppError('connect failed', 'E_CONN');
```

### 6.2 使用 Result 处理预期失败

对「未找到 / 已存在 / 取不到可选值」这类预期分支,返回结构化对象而非抛异常,避免把正常流程塞进 try/catch。

```js
function tryParse(raw) {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err : new Error(String(err)) };
  }
}

const r = tryParse(text);
if (r.ok) use(r.value);
else log.error('parse', r.error);
```

### 6.3 finally 与清理

使用 `try/finally` 或 `AsyncLocalStorage` 保证清理逻辑在成功与失败后都执行,关闭资源、释放监听。

```js
let handle;
try {
  handle = openResource();
  await doWork(handle);
} finally {
  handle?.close();      // 无论是否抛错都释放
}
```

## 7. 异步与并发

### 7.1 async/await 与拒绝处理

所有异步链用 async/await;顶层未捕获拒绝加 `process.on('unhandledRejection')` 兜底检测,避免静默失败。

```js
async function main() {
  const data = await fetchJson('/api');
  app.render(data);
}

// 兜底观测
process.on('unhandledRejection', (reason) => {
  console.error('unhandled rejection', reason);
});
```

### 7.2 并发等待策略

互不依赖的并发等待用 `Promise.all`/`allSettled`;期望容纳部分失败时用 `allSettled` 聚合,不让单项拖垮整体。

```js
const [a, b, c] = await Promise.all([loadA(), loadB(), loadC()]);

const settled = await Promise.allSettled(pendingJobs);
const failed = settled.filter((s) => s.status === 'rejected');
if (failed.length) console.warn('jobs失败', failed.length);
```

### 7.3 超时与取消

IO 与等待必须设超时;浏览器侧用 `AbortController` 取消 fetch,Node 侧配合 `setTimeout` 制造超时上限。悬空 promise 是内存与行为隐患。

```js
function withTimeout(promise, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`timeout ${ms}ms`)), ms);
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      controller.signal.addEventListener('abort', () => reject(controller.signal.reason)),
    ),
  ]).finally(() => clearTimeout(timer));
}
```

### 7.4 竞态与去抖

异步回手动触发 UI 更新前校验令牌,丢弃过期响应;高频事件用去抖/节流或多实例隔离。

```js
let runId = 0;
async function renderLatest() {
  const myId = ++runId;
  const data = await client.get('/data');
  if (myId !== runId) return;   // 已有更新请求,丢弃本次
  paint(data);
}
```

### 7.5 定时器与 rAF 清理

`setInterval`/`setTimeout`/`requestAnimationFrame` 的句柄在组件卸载、页面隐藏或会话结束时清除,避免后台累积。

```js
const handles = new Set();
function schedule(fn, delay) {
  const t = setTimeout(() => { handles.delete(t); fn(); }, delay);
  handles.add(t);
  return t;
}
function cancelAll() {
  for (const t of handles) clearTimeout(t);
  handles.clear();
}
```

## 8. 结构与架构

### 8.1 分层与目录

前端目录按「领域/组件/hooks/store」组织;服务端按「route/service/repo/domain」分层,依赖方向单向朝内。浏览器代码不要反向依赖 Node 内置模块。

```
src/
├── components/       # 无业务副作用,纯渲染
├── hooks/            # 通过 hooks 访问服务,不直接调 window
├── store/            # zustand 状态,唯一 owner
├── services/         # 编排与网络
├── api/              # 接口封装与 schema 校验
└── main.js           # 入口,组装依赖
```

### 8.2 状态唯一 owner

任何状态只由一个模块拥有并写入。UI 与远端同步的字段需防止回环(广播回来不再写回)。UI 局部状态不得被当作服务端事实。

```js
// 反例:两处都能写
window.addEventListener('message', (e) => store.setPending(e.data));
service.onMessage((e) => store.setPending(e.data));
// 正例
function applyMessage(msg) { store.setPending(msg); }
```

### 8.3 依赖注入

跨环境差异(浏览器 fetch / Node fetch、本地 vs 远程)以注入方式提供实现,调用方只依赖行为契约,便于测试替换。

```js
function createApp({ fetchImpl = fetch, storage = localStorage }) {
  return {
    async load() {
      const res = await fetchImpl('/api');
      return res.json();
    },
    save(v) { storage.setItem('k', JSON.stringify(v)); },
  };
}
```

## 9. 构建 / 测试 / 发布

### 9.1 构建与脚本

统一脚本入口定义在 `package.json` 的 `scripts` 段;发布前跑格式、lint、测试并构建。

```json
{
  "scripts": {
    "build": "vite build",
    "test": "vitest run",
    "lint": "oxlint src",
    "fmt": "prettier --write .",
    "prepublishOnly": "pnpm lint && pnpm test && pnpm build"
  }
}
```

### 9.2 测试写法

测试描述用户可观察的行为;浏览器组件用 jsdom 隔离 DOM;Node 业务用 `node:test`。避免依赖真实网络。

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tryParse } from './parse.js';

test('tryParse accepts valid json', () => {
  const r = tryParse('{"a":1}');
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, { a: 1 });
});

test('tryParse rejects malformed input', () => {
  const r = tryParse('nope');
  assert.equal(r.ok, false);
  assert.ok(r.error instanceof Error);
});
```

### 9.3 CI 流水线

CI 按序执行格式、lint、测试与构建,并可通过覆盖率阈值卡点。

```yaml
# 节选
- run: pnpm install --frozen-lockfile
- run: pnpm fmt:check
- run: pnpm lint
- run: pnpm test
- run: pnpm build
```

## 10. 安全与性能要点

### 10.1 XSS 与输出转义

浏览器渲染动态内容一律由框架转义,绝不通过 `innerHTML` 拼接用户输入;Node 侧对 HTML/脚本片段做转义再写出。

```js
// 反例:用户输入直拼 innerHTML => XSS
el.innerHTML = '<div>' + userInput + '</div>';

// 正例:使用 textContent,框架安全的插值
el.querySelector('.name').textContent = userInput;
```

### 10.2 原型污染防护

把外部可控 key 用作对象字段需防 `__proto__`/`constructor` 注入;字典类结构优先 `Map`。

```js
// 反例
const bucket = {};
bucket[key] = value;   // key 为 '__proto__' 时污染原型
// 正例
const bucket = new Map();
bucket.set(key, value);
```

### 10.3 事件与订阅清理

全局监听、`EventSource`、`WebSocket`、定时器在卸载时统一释放,防止重复触发与连接泄漏。

```js
class Sub {
  #es;
  #abort = new AbortController();
  start() {
    this.#es = new EventSource('/events');
    this.#es.addEventListener('message', (e) => this.#onData(e.data), {
      signal: this.#abort.signal,
    });
  }
  stop() {
    this.#abort.abort();
    this.#es?.close();
  }
}
```

### 10.4 减少重排与重渲染

高频路径批量操作 DOM,避免逐条更新造成重排;react 组件用 memo 化,jsdom 环境注意避免同步阻塞主线程。

```js
// 反例:循环内逐节点写 DOM
for (const row of rows) list.appendChild(makeRow(row));
// 正例:DocumentFragment 批量插入
const frag = document.createDocumentFragment();
for (const row of rows) frag.appendChild(makeRow(row));
list.appendChild(frag);
```

### 10.5 内存与循环引用

避免模块级持有大对象;用 `WeakMap`/`WeakSet` 做关联缓存,允许 GC 回收,防止长期驻留。

```js
const meta = new WeakMap();          // 键弱引用,可被回收
function annotate(obj, k, v) {
  meta.set(obj, { ...(meta.get(obj) ?? {}), [k]: v });
}
```

## 11. 常见陷阱与反模式

以下陷阱均为高发问题,每条附修正要点。

【陷阱】使用 `==` 引入隐式类型转换,`'0' == 0`、`'' == false` 都为真。
- 修正:一律 `===`/`!==`;确需同时判 null/undefined 用 `value == null` 并注释。

【陷阱】用 `||` 做默认值,0、''、false 被错误替换。
- 修正:仅 null/undefined 兜底用 `??`。

【陷阱】手写 `json.parse(json.stringify(x))` 做深拷贝。
- 修正:用 `structuredClone`,避开 undefined/函数/循环引用/Date 身份丢失。

【陷阱】直接 `el.innerHTML += ...` 拼接用户输入。
- 修正:用 textContent/框架插值,见第 10.1 节。

【陷阱】用对象当字典并直接以外部 key 下标写入。
- 修正:用 `Map` 或白名单 key,见第 10.2 节。

【陷阱】模块级可变计数/缓存造成跨请求状态泄漏。
- 修正:工厂封装状态,见第 5.4 节。

【陷阱】`setInterval`/EventSource 不保存句柄、不清理。
- 修正:统一句柄集合并在停用时释放,见第 7.5 / 10.3 节。

【陷阱】Promise 拒绝无人处理,生成 unhandled rejection。
- 修正:async/await + 顶层捕获 + 兜底监听,见第 7.1 节。

【陷阱】`Promise.all` 单项失败拖垮整体。
- 修正:用 `allSettled` 聚合失败,见第 7.2 节。

【陷阱】异步回写不校验令牌,过期响应覆盖新 UI。
- 修正:递增 runId 校验,见第 7.4 节。

【陷阱】用裸字符串或对象当作异常 `throw 'x'`。
- 修正:抛 `Error` 子类并带 code,见第 6.1 节。

【陷阱】把预期失败当异常塞进 try/catch。
- 修正:预期分支返回 Result 对象,见第 6.2 节。

【陷阱】直接修改传入数组/对象入参,污染调用方。
- 修正:返回新对象/新数组,见第 5.5 节。

【陷阱】`for i` 下标手动管理数组遍历边界。
- 修正:用 `for...of` 与高阶方法,见第 4.5 节。

【陷阱】在跨度大的异步任务里共享 mutable 全局,隐藏竞态。
- 修正:闭包隔离 + 令牌校验。

【陷阱】事件总线到处 `addEventListener` 却不复用同一个 Listener。
- 修正:统一生命周期管理并传入 AbortSignal。

## 12. 自查检查清单

- [ ] 未使用 `var`;常量用 `const`,变化值用 `let`
- [ ] 比较一律使用 `===`/`!==`;`==` 仅 `value == null` 且有注释
- [ ] 空值兜底用 `??` 而非 `||`
- [ ] 深层读取全程使用可选链 `?.`
- [ ] 深拷贝使用 `structuredClone`,无 JSON 往返 hack
- [ ] 字典使用 `Map`/`Set`,无外部 key 污染对象/原型
- [ ] 抛出的是 `Error` 子类并带稳定的 `code`
- [ ] 预期失败返回 Result 结构,而非吞异常或抛异常
- [ ] 所有异步链 async/await 且有拒绝处理
- [ ] 并发等待用 `allSettled` 并聚合失败
- [ ] IO 与等待均设超时或取消信号
- [ ] 异步回写前校验 runId,丢弃过期响应
- [ ] 定时器/EventSource/WebSocket 均保存句柄并清理
- [ ] 模块级无可变共享状态;状态有唯一 owner
- [ ] 未通过 innerHTML 拼接用户输入
- [ ] 未通过 `window` 直接访问平台能力(已走注入/抽象)
- [ ] 函数返回新对象/新数组,未修改入参
- [ ] `pnpm fmt:check`、`pnpm lint`、`pnpm test` 均通过

## 13. 参考资料

- MDN Web Docs:ES2024+ 语法、`structuredClone`、`AbortSignal`。
- Node.js 官方文档:`node:test`、`assert/strict`、`AbortController`。
- 本仓库 `CONTEXT.md`、`DESIGN.md` 与 `AGENTS.md`。
- TC39 规范与本仓库现状相符的模块系统约定。