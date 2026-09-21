# Vue 编码规范

> 适用于 Vue 工程(Vue 2/3,含 Nuxt、组合式 API)。用户需求模糊时,先按本规范明确 Vue 版本与架构,再实现。

## 1. 风格与命名

- 组件/目录用 PascalCase(多词),单文件组件用 `<script setup>`(Vue 3)组织;ref/computed 命名语义化。
- 模板语义化、可读;事件命名 kebab-case;不把混乱状态散落。
- 中文注释,代码保留英文标识符。

## 2. 状态与响应式

- 组合式 API:`ref` 用于标量/物理值,`reactive` 用于对象;页面状态与可复用状态分层。
- 派生状态用 `computed`;副作用用 `watch` 明确依赖并清理;避免组件内过多相互 watch 成网。
- 全局/跨组件状态收敛到统一 store(Pinia 之类),不能只在组件里手写 setInterval 共享。

## 3. 结构与复用

- 单文件 ≤ 400 行;UI/状态/逻辑分层(模板/脚本/样式);小组件与插槽提升复用。
- 业务逻辑与平台/服务解耦;I/O 走 service/hook 注入,不在组件模板直接写底层网络。
- props/emits 类型对齐,显式 defineProps/defineEmits;不把实现细节暴露给父级。

## 4. 异步与生命周期

- 在 `onMounted`/`onUnmounted` 内正确注册/清理副作用与监听;可选取消与竞态处理。
- 依赖注入(provide/inject)在明确祖先边界使用,避免隐式耦合。
- 异步与 Vue 的响应式配合注意时序,避免泄漏。

## 5. 性能与无障碍

- 列表用 key,避免不必要重渲染;大列表用虚拟滚动;懒加载按需。
- 键盘导航/焦点管理、`aria` 可访问性达标。

## 6. 构建 / 测试 / 工具

- 以仓库 `package.json`/Vite 为准;行为变更补测试(Vitest/Vue Test Utils 等)。

## 7. 常见陷阱

- 响应式丢失:`reactive` 解构后的替换、`ref` 在 `template` 内自动解包;深层对象响应性。
- `v-for` 与 `v-if` 同元素;watch 的 immediate/flush 语义;内存/监听泄露。