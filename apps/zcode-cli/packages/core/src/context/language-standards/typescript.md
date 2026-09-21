# TypeScript 编码规范

> 本规范适用于使用 TypeScript ~5.x 开发的全部代码路径,包括 `packages/core`、`packages/services`、`packages/rpc`、`apps/zcode-cli` 以及任何使用 `tsx`/`ts-node` 运行的服务端脚本。
> 目标是写出类型严格、边界清晰、可被完整静态检查的代码:在编译期消灭可避免的运行时错误,并让 schema 校验成为运行时防线。
> 覆盖环境工具链、命名、语法惯用法、类型系统、错误处理、异步并发、架构分层、构建测试发布、安全性能与常见反模式。
> 这份规范与 JavaScript 规范相辅相成,但更强调结构类型、泛型约束、字面量联合与 runtime validator 的组织方式。

## 1. 概述与使用时机

TypeScript 是 JavaScript 的超集,为其加上静态类型与编译期检查。它并不能消除运行时的一切错误,`any`、`!` 断言与不完整的第三方类型会把静态优势全部抵消。

本仓库在以下场景必须使用 TypeScript(而非 `.js`):

- 包内新增的源码、测试、夹具与构建脚本。
- 承载协议、schema、RPC 类型的公共入口,例如 `packages/shared/src/zcode-protocol/index.ts`。
- 任何导出公共 API 的模块,需要稳定的类型签名供其他包消费。

在以下场景应尽量少用或不用 TypeScript 的类型能力:

- 临时调试脚本,建议用 `tsx` 直接运行并收敛到最小类型标注。
- JSON 配置或纯数据文件,不应写成 `.ts` 增加编译负担。

基本原则:所有对外接口必须有显式且严格的类型;内部实现对 `any` 的容忍度应低于 3%,且每一处 `any` 都必须用注释说明为何无法精确化。

## 2. 环境与工具链

### 2.1 Node 与包管理器

Node 版本以仓库根目录 `mise.toml` 为准,统一使用包管理器 `pnpm`。禁止混用 npm/yarn,避免 lockfile 与 node_modules 不一致。

```bash
# 安装依赖
pnpm install --frozen-lockfile

# 新增依赖(会写入对应 package.json 的 dependencies / devDependencies)
pnpm add zod@^3
pnpm add -D vitest typescript
```

### 2.2 TypeScript 编译

类型检查与产物构建分离。类型检查用 `tsc --noEmit`,产物构建交由 `tsup`/`swc` 完成并获得更快增量速度。

```jsonc
// tsconfig.base.json(节选)
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "useDefineForClassFields": true,
    "verbatimModuleSyntax": true,
    "noImplicitOverride": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  }
}
```

### 2.3 格式化与 lint

- 格式化:Prettier,统一单引号、尾逗号、行宽 100。
- lint:oxlint 作为主 lint 器,eslint(typescript-eslint 插件)处理 oxlint 未覆盖的规则。
- 测试:vitest,配合 `@vitest/coverage-v8`,断言使用 `expect`。

```jsonc
// .prettierrc.json
{
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "semi": true
}
```

```jsonc
// .oxlintrc.json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["typescript", "unicorn"],
  "rules": {
    "typescript/no-explicit-any": "warn",
    "typescript/no-non-null-assertion": "warn",
    "unicorn/prefer-spread": "error",
    "no-unused-vars": ["error", { "argsIgnorePattern": "^_" }]
  }
}
```

```bash
# 常用命令
pnpm typecheck           # 所有包 tsc --noEmit
pnpm lint                # oxlint + eslint
pnpm lint:fix            # 自动修复
pnpm fmt:check           # prettier --check
pnpm test --filter packages/core   # 仅跑 core 包测试
```

## 3. 命名与风格

### 3.1 命名约定

| 对象 | 约定 | 示例 |
| ---- | ---- | ---- |
| 类型/接口/枚举 | PascalCase | `SessionState`, `Result<T>` |
| 变量/函数/参数 | camelCase | `currentState`, `normalizePath` |
| 常量 | UPPER_SNAKE 仅在模块副作用常量 | `MAX_QUEUE_SIZE` |
| 泛型参数 | 单个大写字母或 `T` 前缀 | `T`, `TResult` |
| 抽象类型 | 优先 `interface`,当需要联合/工具类型时用 `type` | `interface`, `type Outcome = A \| B` |
| 私有/未使用参数 | 前缀 `_` | `_event` |
| 布尔 | `is`/`has`/`can`/`should` 前缀 | `isReady`, `hasPending` |

### 3.2 正例与反例

```ts
// 反例:命名含糊、可空随手、magic number
let x: any;
function get(t: string, b: boolean) {
  return b ? t.toUpperCase() : t.trim();
}

// 正例:语义清晰,类型精确
let isSessionReady = false;
function normalizePath(input: string, trimTrailingSlash: boolean): string {
  return trimTrailingSlash ? input.replace(/\/+$/, '') : input;
}

// 反例:魔法常量散落
if (error.code === 401 || error.code === 403) { /* ... */ }

// 正例:命名常量 + 联合类型
const AUTH_FAILURE_CODES = new Set([401, 403] satisfies ReadonlySet<number>);
if (AUTH_FAILURE_CODES.has(error.code)) { /* ... */ }
```

## 4. 语法与惯用法

### 4.1 类型与字面量

优先使用 `type` 表达联合/映射,用 `interface` 表达可扩展的对象契约。常量推导使用 `as const` 锁死字面量,再通过索引访问抽出联合类型。

```ts
const HTTP_METHODS = ['GET', 'POST', 'DELETE'] as const;
// 反推联合:keyof 在 as const 对象上可确定覆盖
type HttpMethod = (typeof HTTP_METHODS)[number]; // 'GET' | 'POST' | 'DELETE'

const STATE_KEYS = {
  workspacePath: 'workspacePath',
  remoteSessionId: 'remoteSessionId',
} as const;
type StateKey = keyof typeof STATE_KEYS;
```

### 4.2 集合与 map

用 `Map`/`Set` 而非对象做字典,规避原型污染与方法名冲突;遍历 `Map` 用 `for...of` 或 `entries()`。

```ts
const pending = new Map<string, Deferred>();
function claim(id: string): void {
  if (pending.has(id)) {
    throw new Error(`already claimed: ${id}`);
  }
  pending.set(id, defer());
}
for (const [id, d] of pending.entries()) {
  d.reject(new Error(`cancelled: ${id}`));
}
```

### 4.3 字符串

优先用模板字面量拼接,避免 `+` 缠斗;多行文本用模板字符串保留缩进。复杂占位用命名占位符。

```ts
function describeIdentity(workspaceIdentity: string, workspacePath: string): string {
  // 身份 key 统一由 identity?.trim() || path 归一化
  const key = workspaceIdentity || workspacePath;
  return `resolving identity=[${key.trim()}] within path=[${workspacePath}]`;
}

// 反例:嵌套 + 与转义链
const bad = '(' + workspaceIdentity + ')' + ' => ' + path;
```

### 4.4 类与对象

类中使用 `public`/`private`/`protected` 显式修饰,构造参数属性注解 `readonly`。子类覆写方法必须加 `override`,防止签名漂移。

```ts
abstract class BaseWorker {
  protected abstract readonly scope: string;
  constructor(private readonly logger: ServiceLogger) {}

  abstract run(input: string): Promise<string>;

  protected log(level: LogLevel, message: string): void {
    this.logger.log(this.scope, level, message);
  }
}

class UrlWorker extends BaseWorker {
  protected override readonly scope = 'url';
  override async run(input: string): Promise<string> {
    return new URL(input).href;
  }
}
```

### 4.5 解构与可选链

解构读取时给大写便利对象取别名,避免与块级同名冲突;可选链与空值合并同时用于深层读取。

```ts
const { data, error, status } = response;
const serviceUrl = config?.services?.url ?? FALLBACK_URL;

// 反例:手写的逐层判空
const url = config && config.services && config.services.url
  ? config.services.url
  : FALLBACK_URL;
// 正例:可选链 + 空值合并
const url = config?.services?.url ?? FALLBACK_URL;
```

### 4.6 模块与导入

使用具名导入导出,禁止默认导出对象形成的隐式反命名;`verbatimModuleSyntax` 下用 `import type` 显式标注类型导入。`export type *` 谨慎使用。

```ts
// 类型导入与值导入分离
import type { SessionState } from './protocol.js';
import { createSession, updateSession } from './repo.js';

// 禁止
export default { createSession, updateSession };
// 应使用具名导出
export { createSession, updateSession };
```

## 5. 类型系统与内存

### 5.1 严格模式与显式类型

开启 `strict` 主开关。`noUncheckedIndexedAccess` 下数组与对象索引会产生 `T | undefined`,必须处理空值;不要无脑 `!` 断言。

```ts
function firstOr<T>(items: readonly T[], fallback: T): T {
  // noUncheckedIndexedAccess 使 items[0] 类型为 T | undefined
  const first = items[0];
  return first ?? fallback;
}
```

### 5.2 不可变与 readonly

对外暴露的入参用 `readonly` 修饰,防止调用方在函数内部修改其内部状态;集合使用 `ReadonlyArray`。

```ts
type ReadonlyRecord = Readonly<Record<string, string>>;

function mergeMeta(base: ReadonlyRecord, extra: ReadonlyRecord): ReadonlyRecord {
  return { ...base, ...extra }; // 不改变入参,返回新对象
}
```

### 5.3 联合类型与收窄

用可辨识联合(discriminated union)代替布尔标志组合,依靠 `discriminant` 字段收窄分支,避免状态空间爆炸。

```ts
type FetchOutcome =
  | { kind: 'ok'; value: string }
  | { kind: 'error'; code: number };

function render(outcome: FetchOutcome): string {
  switch (outcome.kind) {
    case 'ok':
      return outcome.value; // 此时只存在 value
    case 'error':
      return `error:${outcome.code}`;
  }
}
```

### 5.4 空安全

字符串与 `undefined` 语义不同,用于身份聚合时必须遵循 `workspaceIdentity?.trim() || workspacePath` 的归一化规则;函数式空值用空值并合运算符而非 `||` 处理 0/''。

```ts
const port = params.port ?? 8080;      // ok:0 会被保留
const badPort = params.port || 8080;   // 反例:0 被覆盖为 8080

function identity(identity: string | undefined, path: string): string {
  return identity?.trim() || path; // 空身份回退到工作区路径
}
```

### 5.5 结构化类型

TypeScript 是结构化类型系统——形状相同即兼容。因此跨包复用类型要从公开入口引用,而非复制定义,避免"结构相同但语义不同"的隐式耦合。

```ts
import type { ErrorKind } from 'pkg/shared'; // 从公开入口引用
// 反例
// type ErrorKind = 'timeout' | 'auth' | 'io';
```

## 6. 错误处理

采用三类错误模型,按场景选择:异常、`Result`(可辨识)、结构化错误对象。同步断言类使用异常;预期内失败如「未找到」「已存在」使用 `Result`,避免把控制流当异常。

### 6.1 定义

```ts
export type Result<T, E = Error> = { kind: 'ok'; value: T } | { kind: 'err'; err: E };

// 反例:吞掉错误,返回 any
function load(): any { try { return parse(); } catch { return null; } }

// 正例:显式 Result
export function tryParse(raw: string): Result<Config, Error> {
  try {
    return { kind: 'ok', value: JSON.parse(raw) as Config };
  } catch (cause) {
    return { kind: 'err', err: cause instanceof Error ? cause : new Error(String(cause)) };
  }
}
```

### 6.2 调用

```ts
function consume(): void {
  const parsed = tryParse(rawText);
  if (parsed.kind === 'err') {
    // 记录错误并快速失败,而非静默继续
    console.error('parse failed', parsed.err);
    return;
  }
  useConfig(parsed.value);
}
```

### 6.3 结构化错误

对协议边界,错误要携带种类与稳定友好的字段,而非自由字符串。

```ts
export interface ProtocolError {
  readonly kind: ErrorKind;
  readonly message: string;
  readonly detail?: Record<string, unknown>;
}
```

## 7. 异步与并发

### 7.1 优先 async/await

回调与裸 Promise 的 `.then` 链只应用于适配遗留 API;新代码必须 async/await,并处理拒绝,避免 unhandled rejection。

```ts
async function loadSession(id: string): Promise<Session> {
  if (!id) throw new Error('missing session id');
  const raw = await client.get(`/sessions/${id}`);
  return parseSession(raw);
}
```

### 7.2 Promise.all 与等待策略

互不依赖的并发用 `Promise.all`,但优先 `Promise.allSettled` 以容纳单项失败,避免整体坍缩。

```ts
const results = await Promise.allSettled([refreshA(), refreshB(), refreshC()]);
const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
if (failed.length > 0) {
  console.warn('partial refresh failure', failed.map((f) => f.reason));
}
```

### 7.3 超时与取消

给 IO 加上超时;不可中断的 promise 用 `Promise.race` 制造超时,同时防悬空。真正可取消的操作传入 `AbortSignal`。

```ts
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms),
    ),
  ]);
}

// 可取消场景
async function fetchWithSignal(url: string, signal: AbortSignal): Promise<Response> {
  return fetch(url, { signal });
}
```

### 7.4 竞态保护

异步回写 UI/状态前校验请求标识,防止过期响应覆盖新结果。使用递增令牌或对外部副作用加锁。

```ts
let latestReqId = 0;
async function loadAndRender(): Promise<void> {
  const myId = ++latestReqId;
  const data = await client.get('/data');
  // 只有仍是最新请求才落盘
  if (myId !== latestReqId) return;
  setState(data);
}
```

## 8. 结构与架构

### 8.1 分层与依赖方向

依赖方向单向向内:controller / 调用方 → service → repo → domain。UI 通过 `packages/ui/src/hooks/` 访问服务,平台操作走 `IPlatformService`,禁止 UI 直接调用 Repo 或具体 Runtime 实现。

```
packages/core/src/
├── context/
│   └── language-standards/
│       ├── typescript.md
│       └── index.ts
├── domain/          # 纯业务模型与类型,零副作用
├── services/        # 编排,持有唯一的业务状态 owner
└── ports/           # 抽象接口定义依赖边界
```

### 8.2 状态唯一 owner

任何状态只能有唯一 owner 和唯一写入路径,禁止多条路径并行修改。`Zustand` 状态放 `packages/ui/src/store/`,UI 局部状态不冒充服务端事实。

```ts
// 反例:两处可写同一状态
window.ws.onmessage = (e) => setPending(e.data);
service.onMessage = (e) => setPending(e.data);

// 正例:单一入口
function applyRemoteMessage(msg: RemoteMessage): void {
  setPending(msg);
}
```

### 8.3 依赖注入与接口

跨环境差异(Desktop/Web/本地/远程)用 DI 注入实现,调用方只依赖抽象端口,便于测试替换。

```ts
interface PlatformService {
  readFile(path: string): Promise<Buffer>;
}

function makeApp(platform: PlatformService) {
  return { load: (p: string) => platform.readFile(p) };
}
```

## 9. 构建 / 测试 / 发布

### 9.1 构建命令

```bash
pnpm typecheck           # 全量类型检查
pnpm lint                # lint 检查
pnpm architecture:check --changed  # 提交前架构边界检查
pnpm build --filter packages/core   # 单包构建
pnpm verify:pre-push     # 提交前综合检查
```

### 9.2 测试写法

vitest + 可辨识结果断言;测试命名描述行为而非实现;外部网络/IO 用 mock 隔离。

```ts
import { describe, it, expect } from 'vitest';
import { tryParse } from './config.js';

describe('tryParse', () => {
  it('parses valid json into ok result', () => {
    const r = tryParse('{"a":1}');
    expect(r.kind).toBe('ok');
    expect(r.value).toEqual({ a: 1 });
  });

  it('returns err result for malformed input', () => {
    const r = tryParse('not-json');
    expect(r).toMatchObject({ kind: 'err' });
  });
});
```

### 9.3 CI 与 lint 配置

CI 中顺序执行 fmt:check、lint、typecheck、architecture:check(全量)与受影响的包测试。

```yaml
# .github/workflows/ci.yml(节选)
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: '.nvmrc', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm fmt:check
      - run: pnpm lint
      - run: pnpm typecheck
```

## 10. 安全与性能要点

### 10.1 zod schema 边界校验

外部输入(请求体、env、远端消息)在进入业务逻辑前必须经 zod schema 校验,能同时得到类型与运行时保证。用它生成类型,消除「schema 与类型漂移」。

```ts
import { z } from 'zod';

const RemoteMessageSchema = z.object({
  id: z.string().min(1),
  payload: z.unknown(),
  at: z.number().int().nonnegative(),
});
// 从 schema 抽出类型,单一事实来源
export type RemoteMessage = z.infer<typeof RemoteMessageSchema>;

export function parseRemote(raw: unknown): RemoteMessage {
  return RemoteMessageSchema.parse(raw); // 校验失败会抛出可读错误
}
```

### 10.2 原型污染与输入卫生

构造字典类变量时小心 `__proto__` 注入;外部 key 进对象前用过滤后的白名单。服务端端到端消息处理必须经 z 校验后再落状态。

```ts
// 反例:直接用外部对象做 key
const cache: Record<string, any> = {};
cache[controlledKey] = value; // key 可控时可能触发 __proto__

// 正例:限制 key 来源
const allowlist = new Set(['id', 'name', 'ts'] as const);
for (const key of Object.keys(external)) {
  if (allowlist.has(key as never)) { /* 只取白名单字段 */ }
}
```

### 10.3 事件泄漏与订阅清理

全局监听器、定时器、事件源必须在组件卸载或会话结束时释放,防止累积连接与内存泄漏。

```ts
let timer: ReturnType<typeof setTimeout> | undefined;
export function startPolling(): void {
  timer = setInterval(poll, 1000);
}
export function stopPolling(): void {
  if (timer !== undefined) {
    clearInterval(timer);
    timer = undefined;
  }
}
```

### 10.4 减少不必要渲染与计算

高频路径使用 memo/纯函数,避免在 UI 渲染时重复执行重量计算;集合过滤结果缓存化。

## 11. 常见陷阱与反模式

以下陷阱基于典型踩坑,每个给出修正要点。

【陷阱】滥用 `any`:全盘丢失类型检查。
- 修正:用 `unknown` 起手,配合 zod 或收窄函数逐步精确化。

【陷阱】无脑非空断言 `!`:底层数据变化后崩溃。
- 修正:对 `noUncheckedIndexedAccess` 产物先做空值分支,不假设索引恒存在。

【陷阱】把 `||` 当空值默认:数字 0、空字符串被错误覆盖。
- 修正:仅对 null/undefined 使用 `??`。

【陷阱】联合类型用 `boolean | undefined` 表达三态。
- 修正:用可辨识联合或显式枚举语义区分「未设置 / false / true」。

【陷阱】构造函数或外部输入不校验直接顶层解构。
- 修正:`z.parse` 通过后再解构使用。

【陷阱】状态被多处写入,owner 不清。
- 修正:收敛到唯一 owner 和唯一写入函数,见第 8.2 节。

【陷阱】`Promise.all` 单项失败导致整体拒绝,难以定位。
- 修正:改用 `Promise.allSettled` 并聚合失败。

【陷阱】永远给异步操作设置超时,否则悬空 promise 泄漏等待。
- 修正:统一 `withTimeout` 包装,见第 7.3 节。

【陷阱】构造 `Record<string, T>` 时 key 来自外部,存在原型污染。
- 修正:白名单 key 或用 `new Map`。

【陷阱】`enum` 与联合字符串混用,前后端常不一致。
- 修正:优先 `as const` + 联合,见第 4.1 节。

【陷阱】拷贝类型定义而非引用公开入口,切面漂移。
- 修正:从 `packages/shared` 公开入口复用,见第 5.5 节。

【陷阱】事件总线到处 addEventListener,忘记清理导致重复触发。
- 修正:统一生命周期回收,见第 10.3 节。

【陷阱】错误吞没:catch 后打印或返回 null,破坏可观测性。
- 修正:失败必须记录并快速失败,见第 6 节。

【陷阱】对象字面量推导出宽泛 string,通配配置的 key 拼写。
- 修正:用 `as const` 锁字面量再抽取联合,或使用 `satisfies` 校验。

【陷阱】`.then` 链嵌套与回调地狱。
- 修正:一律 async/await,见第 7.1 节。

## 12. 自查检查清单

- [ ] `strict: true` 且 `noUncheckedIndexedAccess` 已开启
- [ ] 未引入任何顶层 `any`;如有必然 `any` 都写了理由注释
- [ ] 所有对外接口/导出函数有显式、严格的类型签名
- [ ] 外部输入(请求/env/远端消息)均经 zod schema 校验后再进入业务
- [ ] 类型与 schema 来自同一事实来源,而非复制
- [ ] 使用 `as const` 保留字面量联合,避免释义宽泛
- [ ] 错误用可辨识 `Result` 或结构化错误表示,未吞错
- [ ] 所有 IO 与等待设有超时或 AbortSignal
- [ ] 并发等待用 `Promise.allSettled` 而非裸 `Promise.all`
- [ ] 状态存在唯一 owner 与唯一写入路径
- [ ] 未用 `||` 处理 0/'';仅用 `??` 做空值默认
- [ ] 不存在裸索引 `arr[i]` 未做空值分支
- [ ] 未使用相对路径跨包导入实现细节;已用公开入口
- [ ] 平台能力通过 `IPlatformService`，而非直接调用 `window`
- [ ] 事件监听/定时器/流均做了卸载时清理
- [ ] 未把 UI 局部状态冒充服务端事实
- [ ] `pnpm typecheck` 与 `pnpm lint` 通过,结果真实

## 13. 参考资料

- TypeScript 官方手册与 Release Notes(5.x)。
- zod 文档:schema 校验与 `z.infer` 类型推导。
- 本仓库 `CONTEXT.md`、`DESIGN.md` 与 `AGENTS.md` 中的领域约定。
- Microsoft `definitely-typed` 与类型社区最佳实践。