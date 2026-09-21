# Vue 3 编码规范

> 适用范围:本规范约束仓库内所有基于 Vue 3 的组件、页面、状态管理(Pinia)、组合式函数(composables)、路由与虚拟列表/大数据渲染代码。适用于 `packages/web`、`packages/ui` 以及桌面 WebView 内嵌的 Vue 渲染层。
>
> 项目使用组合式 API + `<script setup>`,禁令选项式 API 与混杂写法,确保编译期类型安全与可组合性。
>
> 组件访问服务通过 `packages/ui/src/hooks/`,平台操作走 `IPlatformService`;改任何 UI 前先读 `DESIGN.md`、`CONTEXT.md`,并遵守 `AGENTS.md` 的 UI/平台边界约束。

## 1. 概述与使用时机

Vue 3 是本仓库前端界面的组件框架。好的 Vue 代码应当是:模板清晰、逻辑收敛于 composable、状态单一来源、渲染性能可预期。

编写 Vue 的核心理念:

- **`<script setup>` 优先**:编译期向上建立响应式绑定,减少样板,类型友好。
- **组合式聚焦**:逻辑以可复用的 composable 组织,而不是散落在 `mounted` 大杂烩。
- **单一数据流**:`props` 下传、`emit` 上报、Pinia 集中管理真正的全局状态。
- **渲染性能敏感**:正确使用计算属性、`v-memo`、虚拟列表,避免无限渲染与重复渲染。

使用时机:

- 新增/重构组件、页面或共享 UI 时。
- 引入新状态、新路由、新异步数据流或长列表渲染时。
- 任何影响响应式依赖、watcher 清理、组件生命周期边界的地方。

## 2. 环境与工具链

### 2.1 脚手架与语言

- Vue 3.4+ 配合 `<script setup lang="ts">`;工具链为 Vite + `@vitejs/plugin-vue`。
- 强制开启 Vue `defineProps`/`defineEmits` 的宏类型推断,配合 `vue-tsc` 做类型检查。
- `tsconfig` 开启 `verbatimModuleSyntax`,`.vue` 内部用 TS 语法而非 JS。

工程化的 `tsconfig.json` 片段:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "jsx": "preserve",
    "verbatimModuleSyntax": true
  },
  "include": ["src/**/*.ts", "src/**/*.vue"]
}
```

### 2.2 Lint 与格式化

- ESLint + `eslint-plugin-vue`(推荐 `vue3-推荐` 规则集)。
- 单文件组件格式化统一 Prettier(`@vue/prettier` 组)。
- 模板校验启用了 `vue/multi-word-component-names`、`vue/no-unused-refs`、`vue/no-mutating-props` 等关键规则。

```js
// .eslintrc 片段
export default {
  extends: ['plugin:vue/vue3-recommended'],
  rules: {
    'vue/no-mutating-props': 'error',
    'vue/multi-word-component-names': 'error',
    'vue/require-explicit-emits': 'error'
  }
};
```

### 2.3 测试

- 单元/组件测试用 Vitest + `@vue/test-utils` + Testing Library。
- 断言优先面向行为(role/text/可访问属性),不绑定实现细节。
- 长列表/虚拟滚动用真实环境的最小化渲染测试,锁定条目数与滚动行为。

```bash
# 安装
pnpm add -D @vue/test-utils @testing-library/vue vitest

# 运行
pnpm test:unit
```

## 3. 命名与风格

### 3.1 命名约定表格

| 对象 | 约定 | 示例 | 反例 |
| ---- | ---- | ---- | ---- |
| 组件文件名 | MultiWord PascalCase | `UserProfileCard.vue` | `user.vue`, `Card.vue` |
| 组件名(模板中) | kebab-case | `<user-profile-card>` | `<UserProfileCard>`(限脚本中引用) |
| 组件 props | camelCase(模板 kebab) | `initialOpen` → `initial-open` | `initialopen` |
| 组件 emits | camelCase | `@update:model-value` | `on-click` |
| 组合式函数 | `use` 前缀 camelCase 文件 | `useUserSession.ts` | `userSession.ts` |
| ref | 复数/语义化,去掉 `Ref` 后缀 | `count`, `users` | `countRef`, `myRef` |
| reactive | 语义化对象 | `filters` | `data` |
| store 实例 | `use` + 名 | `const shop = useShopStore()` | `store`, `s` |
| 常量 | UPPER_SNAKE | `PAGE_SIZE = 50` | `pageSize` |
| 类型/接口 | PascalCase 前缀 `I/C` | `Props`, `Emit` | `propsType` |

### 3.2 正例与反例(脚本结构)

```vue
<script setup lang="ts">
import { ref, computed } from 'vue';
import { useShopStore } from '@/stores/shop';

// 正例:props/emits 通过宏显式声明,类型单一来源
interface Props {
  initialOpen?: boolean;
  items: string[];
}
const props = withDefaults(defineProps<Props>(), { initialOpen: false });
const emit = defineEmits<{ 'update:model-value': [value: boolean] }>();

const count = ref(0);          // ref 命名不带后缀
const shop = useShopStore();   // store 前缀
const doubled = computed(() => count.value * 2);
</script>
```

```vue
<!-- 反例:选项式 + props 松散、命名含糊 -->
<script lang="ts">
export default {
  props: ['val'],
  data() { return { lst: [], myRef: 0 }; },
  mounted() { /* 纯逻辑放进 mounted */ }
};
</script>
```

## 4. 语法与惯用法

### 4.1 `<script setup>` 与宏

- 一律使用 `<script setup lang="ts">`;仅当需要额外顶层选项时才补一个普通 `<script>`。
- 用 `defineProps`/`defineEmits` 派生类型,不重复手写运行时 props。
- `defineOptions` 用于 `inheritAttrs`、`name` 等非逻辑元数据。

```vue
<script setup lang="ts">
import { defineProps, defineEmits, defineOptions } from 'vue';

defineOptions({ inheritAttrs: false, name: 'AppModal' });

interface Props {
  open: boolean;
  title?: string;
}
const props = defineProps<Props>();
const emit = defineEmits<{ close: [] }>();

const close = () => emit('close');
</script>

<template>
  <div class="modal" role="dialog" aria-modal="true" @click.self="close">
    <h3>{{ props.title ?? '提示' }}</h3>
    <slot />
  </div>
</template>
```

### 4.2 模板语法与内联

- 模板内不写复杂逻辑;需计算的值全部收敛到 `computed`。
- `v-for` 必须带 `:key`,且 key 来自稳定字段(不能是 `index` 用于可重排列表)。
- 事件绑定用简写 `@`,但语义不缩写表达的事件应写完整。

```vue
<template>
  <!-- 正例:计算属性承载过滤逻辑 -->
  <li v-for="item in activeItems" :key="item.id">
    {{ item.name }}
  </li>
</template>

<script setup lang="ts">
import { computed } from 'vue';
const items = ref([{ id: 1, name: 'a', active: true }]);
const activeItems = computed(() => items.value.filter(i => i.active));
</script>
```

```vue
<!-- 反例:模板内写复杂表达式 + 用 index 作 key -->
<template>
  <li v-for="(it, i) in items" :key="i">
    {{ it.name.toUpperCase().trim() }}  <!-- 逻辑放模板,难以测试 -->
  </li>
</template>
```

### 4.3 `v-model` 与受控绑定

- 组件的 `v-model` 通过 `defineModel<T>()()`(Vue 3.4+)或 props+emit 组合实现。
- 不要直接 `props.x = ...`;通过 `emit` 回传更新,保持单向数据流。
- 布尔型的受控状态用 `v-model`/`untested` 时保持类型一致。

```vue
<script setup lang="ts">
import { defineModel } from 'vue';

// 正例:defineModel 提供类型化的双向绑定
const model = defineModel<boolean>({ default: false });

function toggle() { model.value = !model.value; }
</script>

<template>
  <button type="button" :aria-checked="model" @click="toggle">
    选项
  </button>
</template>
```

### 4.4 计算属性与 watcher 选择

- 优先 `computed` 处理派生态;避免在 `ref` 上到处手动赋值。
- 需要副作用响应时才用 `watch`;`watchEffect` 用于自动追踪依赖的自包含副作用。
- watcher 处理异步时必须带取消/竞态防护(见第 7 节)。

```ts
// computed 纯派生,不写副作用
import { ref, computed } from 'vue';
const priceCents = ref(1999);
const display = computed(() =>
  `¥${(priceCents.value / 100).toFixed(2)}`
);
```

## 5. 类型与安全(交叉点位)

### 5.1 props/emits 严格类型

- props 用 TS 接口定义并按需 `withDefaults` 提供默认值。
- emits 用别名元组形式标注参数类型,禁止 `emit('x', any)` 糊参数。
- `defineExpose` 刻意暴露的 API 也声明类型,避免外部误用内部 ref。

```ts
import { defineProps, withDefaults } from 'vue';

interface Props { page: number; perPage?: number }
const props = withDefaults(defineProps<Props>(), { perPage: 20 });
```

### 5.2 模板、响应式与 TS 的协同

- 模板编译由 `vue-tsc` 校验,保证模板内引用都有类型。
- `ref<number|null>` 等联合类型的运行时收窄在 `computed`/函数内完成。
- `v-memo`、`v-for` 中依赖的响应式读取要类型且越少越好。

### 5.3 深色模式与语义 token

- 颜色一律走 CSS 变量/design token(见 HTML/CSS 篇),组件不写死色值。
- 组件要响应主题切换时依赖 `data-theme` 的 CSS 变量,不在组件状态里复制主题。

## 6. 错误与边界

### 6.1 onErrorCaptured 错误边界

- 使用 `onErrorCaptured` 捕获后代组件抛错,展示占位而非白屏。
- 错误边界组件应可配置回退与上报埋点,不吞掉可诊断信息。
- 异步错误(`await`)用 `try/catch` 落本地错误状态而非抛给渲染链。

```vue
<script setup lang="ts">
import { ref, onErrorCaptured } from 'vue';

const failed = ref(false);
onErrorCaptured((err) => {
  console.error('[ErrorBoundary]', err);   // 上报并标明来源
  failed.value = true;
  return false;   // 阻止继续冒泡
});
</script>

<template>
  <slot v-if="!failed" />
  <div v-else role="alert">组件加载失败,请刷新重试</div>
</template>
```

### 6.2 资源与异步清理

- `watch`/`onMounted` 中注册的解绑、定时器、事件监听必须在 `onUnmounted` 清理。
- 请求失败时重置 `loading` 状态并展示可重试 UI,不能无限 loading。
- 组件卸载后不得再更新 ref(竞态防护见 7.3)。

```ts
import { ref, onMounted, onUnmounted } from 'vue';

const elapsed = ref(0);
let timer: number | undefined;

onMounted(() => { timer = window.setInterval(() => elapsed.value++, 1000); });
onUnmounted(() => window.clearInterval(timer));
```

## 7. 异步与并发

### 7.1 异步数据流与 loading 状态机

- 数据拉取统一封装进 composable,暴露 `{ data, pending, error, retry }`,类型化。
- 用单一状态对象表达 `idle/loading/success/error`,避免多个布尔变量互相矛盾。
- 依赖 props/参数的变化而重新拉取用 `watch(..., { immediate: true })` 带竞态防护。

```ts
// composables/useUser.ts —— 单一数据流,取消过期请求
import { ref, watch } from 'vue';
import { fetchUser } from '@/services/user';

export function useUser(userId: () => number | undefined) {
  const data = ref<null | User>(null);
  const error = ref<string | null>(null);
  const pending = ref(false);
  let latest = 0;

  watch(
    userId,
    async (id) => {
      const tag = ++latest;           // 竞态标记
      if (!id) { data.value = null; error.value = null; return; }
      pending.value = true; error.value = null;
      try {
        const res = await fetchUser(id);
        if (tag === latest) data.value = res;   // 只应用最新一次结果
      } catch (e) {
        if (tag === latest) error.value = String(e);
      } finally {
        if (tag === latest) pending.value = false;
      }
    },
    { immediate: true }
  );

  return { data, pending, error };
}
```

### 7.2 异步组件与代码分割

- 路由级与重型组件用 `defineAsyncComponent` + `import()` 按需加载。
- 提供 `loadingComponent`/`delay`/`timeout` 参数,避免白屏与长加载。
- 大型第三方组件包尽量懒加载,缩小首屏 bundle。

```ts
import { defineAsyncComponent } from 'vue';

const ReportCharts = defineAsyncComponent({
  loader: () => import('@/components/ReportCharts.vue'),
  delay: 200,          // 延迟 200ms 后才显示 loading
  timeout: 8000        // 超时进入 error
});
```

### 7.3 竞态与无限请求防护(Teleport to 虚拟列表)

- 高频触发(输入、滚动)的异步用 debounce/throttle 收敛,防连发请求。
- 长列表滚动加载须有"防重复触发"护栏(loading 互斥)。
- 组件复用同一异步逻辑必须抽 composable,禁止每个组件各写一套竞态布尔。

```ts
// 滚动加载护栏:同一时刻不重复拉取下一页
import { ref } from 'vue';
const page = ref(1);
const loadingPage = ref(false);
const hasMore = ref(true);

async function loadMore() {
  if (loadingPage.value || !hasMore.value) return;   // 护栏
  loadingPage.value = true;
  try {
    const items = await fetchPage(page.value);
    list.value.push(...items);
    hasMore.value = items.length > 0;
    page.value += 1;
  } finally {
    loadingPage.value = false;
  }
}
```

## 8. 结构与架构

### 8.1 目录与模块边界

按"页面 → 区块组件 → 原子组件 → 共享 composable/store"分层,并遵守依赖方向。

```
src/
  hooks/                 # 全局组合式函数(服务访问走这里)
    useUserSession.ts
    useDebounce.ts
  stores/                # Pinia store(唯一全局状态 owner)
    shop.ts
  components/
    common/              # 原子/基础组件
    feature/             # 区块组件
  composables/           # 组件内复用逻辑(如 useUser)
  views/                 # 路由页面级组件
  router/
    index.ts
```

### 8.2 组件拆分原则

- 足够"小而单一职责":一个文件处理一个可复用关注点,过大(>300 行模板)应拆分。
- 无实际复用的"一次性包装"不应过度抽象;先保持直接,面板需求再抽。
- 通过 props/slots 让纯展示组件与业务组件解耦,便于测试与复用。

### 8.3 Pinia store 的状态单一来源

- 真正的全局/跨组件状态进 Pinia;组件隔离状态保持本地 `ref`.
- store 用 setup 风格声明 `state/getters/actions`,action 内做异步与错误处理。
- 不用 store 存可从服务端实时推拉的瞬态 UI 数据(避免被当作服务端事实)。

```ts
// stores/shop.ts —— 单一状态来源
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export const useShopStore = defineStore('shop', () => {
  const cart = ref<CartItem[]>([]);
  const total = computed(() =>
    cart.value.reduce((s, i) => s + i.priceCents * i.qty, 0)
  );

  function addItem(item: CartItem) { cart.value.push(item); }
  async function checkout() {
    // 调用创建订单服务,失败时抛错由调用方处理
    await checkoutService(cart.value);
    cart.value = [];
  }
  return { cart, total, checkout, addItem };
});
```

## 9. 构建 / 测试 / 发布

### 9.1 构建与类型检查

- `vue-tsc` 参与 typecheck,模板类型错误在 CI 拦截;`pnpm build` 走 Vite。
- 混合了 Host 边界的平台能力来自注入的 `IPlatformService`,不 `import` 具体实现。
- 发布用 Vite + 代码分包,长列表组件与重型图表按路由拆分。

```bash
pnpm vue-tsc --noEmit          # 模板类型门禁
pnpm build                     # vite build(分包、指纹)
pnpm typecheck && pnpm lint    # CI 全量
```

### 9.2 组件测试写法

- 优先 Testing Library 行为断言(`getByRole`, `findByText`),不锁定实现类名。
- 异步交互用 `await` + `flushPromises`/`findBy*`,验证 loading→success/error 转变。
- 事件触发后断言 emit 内容与 DOM 可访问状态(`aria-*`)。

```ts
import { render, screen, fireEvent } from '@testing-library/vue';
import AppCounter from './AppCounter.vue';

it('点击增加并发出 update', async () => {
  const { emitted } = render(AppCounter, { props: { count: 0 } });
  await fireEvent.click(screen.getByRole('button', { name: '增加' }));
  expect(emitted()['update:count'][0]).toEqual([1]);
});
```

### 9.3 CI 与发布门禁

- `typecheck` + `lint` + `test:unit` + 视觉回归全部通过才可合入。
- 无 `console.log`/调试残留;交互改动带 E2E 用例(见 HTML/CSS 篇的 Playwright)。
- 发布产物包含按路由分包的优化与 Sourcemap 策略取舍。

## 10. 安全与性能要点

### 10.1 模板注入与 XSS

- 默认用 `{{ }}` 插值(自动转义);`v-html` 仅用于受信任的白名单富文本。
- 用户可控 URL 进入 `href`/`src` 前做协议过滤,禁 `javascript:`。
- 富文本编辑器内容必先经 DOM 白名单 sanitizer 再渲染。

```vue
<!-- 正例:插值自动转义 -->
<p>{{ comment.text }}</p>
<!-- 反例:除非 sanitize,否则禁止 -->
<p v-html="comment.text"></p>
```

### 10.2 CSP 与风格注入

- 生产启用 CSP,避免把用户输入拼进 `style`(属性)或 `<style>` 文本。
- 动态样式尽量通过 class 切换 + token,不用内联合成字符串。

### 10.3 渲染性能

- 纯静态/不受数据影响的节点用 `v-once`,降低首次解析与更新成本。
- 大规模列表用虚拟列表(见 10.5);重复渲染源码用 `v-memo` 隔离不稳定区。
- 深依赖对象用 `markRaw`/`shallowRef` 控制重粒度剔除不需要的响应式深转换。

```vue
<!-- 正例:v-once 渲染不变的静态区,后续不参与响应式更新 -->
<div v-once>{{ staticBanner }}</div>
```

### 10.4 虚拟列表与大数据渲染

- 长列表(上千条)必须虚拟化渲染:`@tanstack/vue-virtual` 或自研滚动窗口。
- 虚拟列表注意事项:容器固定高度、条目固定/预估高度、稳态 key、剔除屏外 DOM。
- 不平衡高度条目提供 `estimateSize` 与测量回调,避免滚动错位。

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { useVirtualizer } from '@tanstack/vue-virtual';

const rows = ref<Row[]>(new Array(10000).fill(null).map((_, i) => ({ id: i })));
const parentRef = ref<HTMLElement | null>(null);

const virtualizer = useVirtualizer({
  count: rows.value.length,
  getScrollElement: () => parentRef.value,
  estimateSize: () => 40       // 预估行高,虚拟窗口据此计算
});
</script>

<template>
  <div ref="parentRef" class="vlist" role="list">
    <div class="vlist__spacer" :style="{ height: virtualizer.getTotalSize() + 'px' }">
      <div v-for="v in virtualizer.getVirtualItems()" :key="v.key"
           class="vlist__row"
           :style="{ transform: `translateY(${v.start}px)` }">
        {{ rows[v.index].id }}
      </div>
    </div>
  </div>
</template>
```

### 10.5 无限渲染防护

- 绝不依赖在渲染期间修改自身依赖的响应式(ref 写入触发重渲染)造成循环。
- 大数据 `computed` 不产生突变;需要 append 的用数组 `push` 且配合 `v-memo`。
- 滚动/输入驱动更新的逻辑放事件回调或 watcher,不放进 render 计算。

## 11. 常见陷阱与反模式

### 11.1 【陷阱】mutating props
直接修改 `props.x` 违反单向数据流且多父组件引时同步错乱;用 `emit` 回传。

```vue
<!-- 反例 --> <input v-model="props.query" />
<!-- 正例 --> <input :value="query" @input="emit('update:model-value', $event.target.value)" />
```

### 11.2 【陷阱】选项式与 `<script setup>` 混合
两套 API 混用难维护;统一 `<script setup>` + 组合式。

### 11.3 【陷阱】用 index 作 v-for key(程序可重排)
增删/排序时复用错乱;改用稳定字段或生成 id。

### 11.4 【陷阱】模板塞复杂逻辑
不可测、难维护;收敛到 `computed` 或方法。

### 11.5 【陷阱】`watch` 有异步但无竞态防护
旧请求晚于新请求返回会覆盖新数据;用 token/comparison guard。

### 11.6 【陷阱】watch 副作用未清理
interval/listener 在组件卸载仍运转;`onUnmounted` 清理。

### 11.7 【陷阱】`v-memo`/虚拟列表的 key 非稳定
翻页或滚动导致 DOM 复用错误条目;保证 key 稳定且与索引解耦。

### 11.8 【陷阱】把只读 UI 状态塞进 Pinia
非全局状态入 store 造成多余订阅与同步;保持组件本地 ref。

### 11.9 【陷阱】深响应式大对象拖慢渲染
大数组/纯数据对象用 `shallowRef`/`markRaw` 控制监听粒度。

### 11.10 【陷阱】无限渲染(render 中改自身依赖)
`v-for` 内 push 或模板内触发副作用形成循环;把更新移出 render。

### 11.11 【陷阱】富文本直接 `v-html`
XSS 入口;只用 sanitize 后的可信 HTML。

```vue
<!-- 反例 --> <div v-html="userInput" />
<!-- 正例 --> <div>{{ userInput }}</div>  <!-- 或经 sanitizer -->
```

### 11.12 【陷阱】`emits` 未显式声明
隐式 emit 难追踪、文档缺失;用 `defineEmits` 声明参数类型。

### 11.13 【陷阱】所有状态都用 `reactive` 或深 `ref`
过度响应式引发横推更新的性能损耗;能 locate 的单值用 `ref`,纯网状结构用 `reactive`.

### 11.14 【陷阱】首屏加载大量组件不分割
包体积膨胀;用 `defineAsyncComponent` 按路由/模块切分。

### 11.15 【陷阱】绝对定位/离屏元素无限渲染或焦点丢失
长列表请用虚拟滚动而非全部渲染;交互聚焦请归还焦点。

### 11.16 【陷阱】timeout/清理忘绑定与卸载竞态
定时器与请求交叉污染;统一走 `onUnmounted` + 竞态 token。

## 12. 自查检查清单

- [ ] 组件使用 `<script setup lang="ts">`,无选项式 API 残留。
- [ ] `defineProps`/`defineEmits` 有严格类型,默认值走 `withDefaults`。
- [ ] 无 `v-html` 直接渲染未净化的用户内容。
- [ ] 无 props 原地赋值,更新通过 emit 回传。
- [ ] `v-for` 均有稳定 key,未用 index 作可重排序列 key。
- [ ] 模板内无复杂表达式,逻辑收敛于 computed/方法。
- [ ] 长列表(≥上千)使用虚拟列表,未全量渲染。
- [ ] 无在渲染期间修改自身依赖的无限渲染风险。
- [ ] 异步数据流统一为 `{data, pending, error, retry}`,无散落布尔。
- [ ] watch/异步有竞态防护,过期结果不会覆盖最新数据。
- [ ] 定时器/监听在 `onUnmounted` 清理,无泄漏。
- [ ] `onErrorCaptured` 覆盖关键组件错误边界,回退可见。
- [ ] 真正的全局状态进 Pinia,瞬态 UI 状态保持本地 ref。
- [ ] 组件访问服务走 `hooks/` 与 `IPlatformService`,未直接达具体实现。
- [ ] 颜色使用设计 token,深色模式依赖 `data-theme`,无硬编码色值。
- [ ] 重型组件用 `defineAsyncComponent` 按路由/模块分包。
- [ ] 深响应式大对象使用 `shallowRef`/`markRaw` 控制粒度。
- [ ] 无关紧要的静态区使用 `v-once`,降低重复解析成本。
- [ ] 交互改动有 E2E/组件测试覆盖,断言聚焦行为与 a11y。
- [ ] 通过 `vue-tsc` 类型检查与 ESLint(含 vue3-recommended)。
- [ ] 无 `console.log`/调试残留,无死代码与未使用引用。

## 13. 参考资料

- Vue 官方文档:`<script setup>`、组合式 API、`defineModel`、生命周期与渲染机制。
- Pinia 文档:setup store、getters、actions 与最佳实践。
- `@tanstack/vue-virtual` 文档:虚拟列表 API 与度量。
- `vitest` + `@vue/test-utils` + Testing Library:组件与交互测试。
- 本仓库 `AGENTS.md` 的 UI/平台边界、`packages/ui/src/hooks/` 服务访问规范,以及 `CONTEXT.md` 领域词表作为组件命名的参照。