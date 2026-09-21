# HTML5 / CSS 编码规范

> 适用范围:本规范约束仓库内所有面向浏览器的结构性标记(HTML)与样式(CSS/SCSS/原生)代码,包括组件模板、页面骨架、样式文件以及设计系统基础层。适用于 `packages/web`、`packages/ui` 及桌面内嵌 WebView 的渲染层。
>
> 目标是在保证语义化、可访问性(WCAG)、响应式、深色模式与性能的同时,产出稳定、一致、可维护的结构与样式代码。
>
> 所有新增交互与视觉改动应先阅读 `DESIGN.md` 与 `CONTEXT.md`,遵循既有设计语言与领域词表,再编写标记与样式。

## 1. 概述与使用时机

HTML 定义内容的结构与语义,CSS 定义结构与内容的视觉呈现。二者分离是底线:结构只描述"这是什么",样式只描述"它长什么样"。

编写 HTML/CSS 的核心理念:

- **语义优先**:用正确的元素表达内容含义,而非用 `<div>` 堆出视觉需求。
- **可访问第一**:键盘可用、屏幕阅读器可读、对比度达标、焦点可见,是一等公民而非事后修补。
- **渐进增强**:基础体验在所有环境可用,增强特性在不支持时优雅降级。
- **性能敏感**:最小化 CSS 体积、避免布局抖动、按需加载,让页面更快被感知。

使用时机:

- 新增页面、组件、图标或设计 token 时。
- 修改任何影响布局、主题、字号、间距、颜色的点。
- 涉及到可访问性修复、响应式断点调整或深色模式的改动。

## 2. 环境与工具链

### 2.1 Lint 与格式化

- HTML 校验:使用 `html-validate`(可在 CI 校验语义与 a11y)与 `@html-eslint`.
- CSS/SCSS 校验:使用 `stylelint`(推荐 `stylelint-config-standard-scss`)作为门禁。
- 格式化:一律使用 Prettier(`prettier` 插件覆盖 html 与 scss),保持缩进与引号一致。

配置文件示例:

```json
{
  "stylelint": {
    "extends": ["stylelint-config-standard-scss"],
    "rules": {
      "max-nesting-depth": 3,
      "selector-max-id": 0,
      "declaration-block-no-duplicate-properties": true,
      "color-hex-length": "short"
    }
  }
}
```

### 2.2 构建与测试

- 样式经 PostCSS/Sass 编译,Sass 负责变量与混合宏。
- 视觉回归可用 Playwright 截图比对;组件 sniff 用 Testing Library 断言 DOM 语义。
- 浏览器目标以 `browserslist` 为准,配合 autoprefixer 自动加前缀。

```bash
# 安装 lint 工具
pnpm add -D stylelint stylelint-config-standard-scss html-validate

# CI 门禁命令
pnpm exec stylelint "src/**/*.scss"
pnpm exec html-validate "src/**/*.html"
```

## 3. 命名与风格

### 3.1 HTML 命名与属性风格

| 对象 | 约定 | 示例 | 反例 |
| ---- | ---- | ---- | ---- |
| 标签 | 全部小写 | `<section>` | `<SECTION>` |
| 属性 | 小写,双引号包裹 | `class="card"` | `CLASS='card'` |
| 布尔属性 | 省略值或 `=""` | `disabled` | `disabled="false"`(无效) |
| id | 小驼峰或 kebab,页面内唯一 | `id="main-nav"` | 重复 id |
| 自定义数据属性 | `data-` 前缀 | `data-testid` | `dataBe` |
| 页内锚点 | kebab-case | `href="#pricing"` | `href="#PricING"` |

页内锚点必须保持 kebab-case 且同一页面唯一,`id` 不存在时禁止引用。

### 3.2 CSS 命名约定

- 类名使用 BEM(block__element--modifier)或组件 scoped 前缀。
- 仅用类选择器和伪元素选择器,`id` 选择器与 `!important` 一律禁止。
- 状态用 modifier 表达(如 `--active`),不依赖元素顺序覆盖。

```html
<!-- 正例:BEM 语义清晰,状态独立 -->
<button class="btn btn--primary" aria-pressed="true">保存</button>
<div class="card__title">标题</div>
```

```css
/* 正例:作用域清晰,启用状态通过 modifier 表达 */
.btn { padding: 8px 16px; }
.btn--primary { background: var(--color-primary); }
.btn[disabled] { opacity: 0.5; cursor: not-allowed; }

/* 反例:id 选择器 + !important + 深度层级 */
#sidebar .data { color: red !important; }
```

### 3.3 属性书写顺序

- 先盒模型(display、position、width/height、margin/padding)、再视觉(background、border、color、font),最后 misc(animation、transform)。
- 使用 Prettier + stylelint 的 `order` 规则,人工无需纠结顺序,交给工具统一。

```css
/* 典型顺序 */
.component {
  display: flex;
  position: relative;
  width: 100%;
  margin: 0 auto;
  padding: 12px 16px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  font-size: 14px;
  transition: transform 0.2s ease;
}
```

## 4. 语法与惯用法

### 4.1 语义化标签与展开式

- 页面骨架使用语义容器:`<header>`、`<nav>`、`<main>`、`<article>`、`<section>`、`<aside>`、`<footer>`。
- 唯一主要内容放在 `<main>`,`页脚` 用 `<footer>`,`面包屑/导航` 用 `<nav aria-label>`。
- 每个页面有且仅有一个 `h1`,heading 层级不跳跃。

```html
<!-- 正例:语义化骨架 -->
<body>
  <header>
    <nav aria-label="主导航">…</nav>
  </header>
  <main>
    <h1>订单列表</h1>
    <section aria-labelledby="today-title">
      <h2 id="today-title">今日订单</h2>
    </section>
  </main>
  <footer>…</footer>
</body>
```

### 4.2 表单语义

- 每个输入必须有可见且关联的 `<label for>`;无可见 label 时才用 `aria-label`。
- 单选/多选的视觉由原生 input 或 `role` 正确暴露,不裸用 `div` 模拟。
- 校验提示用 `aria-describedby` 关联,错误信息与输入建立程序化联系。

```html
<!-- 正例:显式关联、错误提示可访问 -->
<div class="field">
  <label for="email">邮箱</label>
  <input id="email" type="email" required
         aria-describedby="email-hint email-error" />
  <span id="email-hint" class="hint">请输入公司邮箱</span>
  <span id="email-error" role="alert" hidden>邮箱格式不正确</span>
</div>
```

### 4.3 SCSS 结构:变量、嵌套与混合宏

- 样式值使用变量/设计 token(`--color-*`、`--space-*`),不使用魔法数字。
- 嵌套深度 ≤ 3,避免过度嵌套导致特异性膨胀。
- 复用片段抽为 `@mixin` 或 `@extend`,但 `@extend` 优于 `%placeholder`。

```scss
// 正例:变量 + 语义化颜色,嵌套克制
$space-sm: 8px;
.sidebar {
  background: var(--surface-secondary);
  padding: $space-sm;

  &__item {
    display: flex;
    gap: 8px;
  }

  // 状态 modifier 放在同一逻辑层,不深层嵌套
  &__item.is-active { color: var(--accent); }
}
```

### 4.4 选择器复杂度的克制

- 层级控制在"元素 + 一个 class"或纯 class,避免 3 级 `html body .x .y`.
- 需要作用域时用 `&__` 派生(BEM),不以 DOM 结构锚定样式。

```css
/* 反例:过度依赖结构,易碎 */
.widget > .header > .title > span { color: blue; }

/* 正例:单一职责 class */
.widget__title { color: var(--accent); }
```

## 5. 语义与可访问性(WCAG)

### 5.1 焦点与键盘

- 可交互元素必须是可聚焦的;自定义交互元素补 `tabindex="0"` 与键盘事件。
- 焦点样式可见,不可移除 `:focus` / `:focus-visible` 的默认 outline(必要时替换为明显指示)。
- 模态、抽屉等要管理焦点陷阱并在关闭时归还焦点。

```css
/* 正例:保留明显且一致的焦点环 */
.btn:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
}
```

### 5.2 对比度与文字

- 正文文本对比度 ≥ 4.5:1,大号文本及 UI 组件 ≥ 3:1。
- 字号建议 16px 基准或自定义比例;不用 `px` 硬编码重要正文时可用 `rem`.
- 链接区分不仅依赖颜色,需搭配下划线或图标。

```css
/* 正例:语义化 design token + rem 基准 */
:root { font-size: 16px; }
.body-copy {
  font-size: 1rem;                  /* 16px,随用户缩放 */
  line-height: 1.6;
  color: var(--text-primary);       /* 对比度 >= 4.5:1 */
}
a:not([class]) { text-decoration: underline; }
```

### 5.3 图像与替代文本

- 意义图必须提供 `alt`;装饰图用 `alt=""` 空字符串交给 `aria-hidden`.
- 图标 `/按钮`:语义化用 `<img alt="关闭">` 或用带 `aria-label` 的按钮包裹 svg。
- 不支持时提供降级文本或 `role="img"` + `aria-label`.

```html
<!-- 意义图:提供业务 alt -->
<img src="/diagram.png" alt="订单金额走势图" />

<!-- 装饰图:空 alt,避免被读屏朗读 -->
<img src="/pattern.svg" alt="" aria-hidden="true" />

<!-- 图标按钮:显式可访问名 -->
<button type="button" aria-label="关闭弹窗">
  <svg aria-hidden="true"><use xlink:href="#icon-close" /></svg>
</button>
```

### 5.4 ARIA 使用纪律

- 优先使用原生语义元素,ARIA 仅在原生无法表达时补充。
- 不重复修饰:已有 `<button>` 不要再加 `role="button"`.
- `aria-hidden="true"` 的元素内容不会进入可访问树,注意不要藏住重要信息。

## 6. 异常与回退(渐进增强)

### 6.1 特性检测与降级

- 使用 `@supports` / `@media (prefers-*| etc.)` 做渐进增强,不假定特性必然可用。
- 现代布局(`grid`)提供语义 fallback(如 `flex` 或基础块布局)。
- 动效表达 `@media (prefers-reduced-motion)` 时关闭大范围动画,尊重用户设置。

```css
/* 正例:网格带基础回退,动画尊重用户偏好 */
.panel { display: flex; flex-wrap: wrap; }
@supports (display: grid) {
  .panel { display: grid; grid-template-columns: repeat(3, 1fr); }
}

@media (prefers-reduced-motion: reduce) {
  * { animation: none !important; transition: none !important; }
}
```

### 6.2 字体与图片回退

- `font-family` 瀑布回退到系统字体栈;`font-display: swap` 避免 FOIT 白屏。
- 重要图片使用合适大小与 `loading="lazy"`,保留兜底背景色。

```css
/* 正例:字体回退栈 + swap */
@font-face {
  font-family: "InterVariable";
  src: url("/fonts/inter.woff2") format("woff2-variations");
  font-display: swap;   /* 加载期间先用回退字体渲染 */
}
body {
  font-family: "InterVariable", system-ui, -apple-system, "Segoe UI", sans-serif;
}
```

### 6.3 加载失败兜底

- 关键布局不依赖异步字体/图片;加载失败时用 `fallback` 文本与占位背景。
- 视频/图片 `onerror` 替换为占位;但样式层的回退优先于脚本兜底。

## 7. 异步与并发(加载策略)

### 7.1 关键 CSS 与按需加载

- 首屏关键样式内联或放入 `<style>` 中,非关键样式按路由/路由组件按需引入。
- 使用 `rel="preload"`/`prefetch` 平衡,不在首屏加载全部媒体资源。
- 图片 `loading="lazy"` + `decoding="async"` 用于屏外资源。

```html
<!-- 正例:关键字体预加载,图片懒加载 -->
<link rel="preload" href="/fonts/inter.woff2" as="font" type="font/woff2" crossorigin />
<img src="/banner.jpg" alt="季节活动横幅" loading="lazy" decoding="async" />
```

### 7.2 避免布局抖动(CLS)

- 为图片、自定义接口预留稳定的宽高(宽高比盒子或 `aspect-ratio`)。
- 字体与图片替换造成的位移要最小化,预留网格槽位。
- 动态注入内容尽量在文档流位置替换,不用绝对定位闪现。

```css
/* 正例:固定宽高比占位,替换图片不引起跳动 */
.media-frame { aspect-ratio: 16 / 9; width: 100%; background: var(--skeleton); }
```

### 7.3 交互性能:防抖与批量

- 滚动/resize 事件用 rAF 或 throttle;`ResizeObserver` 优于监听 resize 手算。
- 动画强制 GPU 合成层属性(transform/opacity),不触发 layout 反复。
- 字体图标用 SVG sprite 或内联,不引入整包字体拖慢渲染。

## 8. 结构与架构(目录与组件)

### 8.1 目录组织

样式与页面按路由/模块组织,Token 与基础样式独立成层。

```
src/
  styles/
    tokens/
      colors.scss       # 设计 token(色板、语义色)
      spacing.scss      # 间距/字号比例
      z-index.scss      # 层叠等级
    base/
      reset.scss        # 样式重置
      typography.scss   # 排版基元
    utilities.scss      # 工具类(如需)
  components/
    button/
      button.scss       # BEM 样式,与组件同目录
    sidebar/…
  pages/
    dashboard/
      dashboard.scss    # 页面专属样式
```

### 8.2 组件与样式边界

- 组件样式就近放置(同目录同名 scss),避免全局类名冲突。
- 有状态组件通过 modifier 暴露状态,样式层不外泄组件内部 DOM 假设。
- 使用 CSS custom properties(变量)在组件边界做主题化,深色模式通过 token 切换。

```css
/* 正例:主题通过 token 切换,组件不硬编码颜色 */
:root {
  --surface: #ffffff;
  --text: #1a1a1a;
}
[data-theme="dark"] {
  --surface: #121212;
  --text: #e6e6e6;
}
.card { background: var(--surface); color: var(--text); }
```

## 9. 构建 / 测试 / 发布

### 9.1 构建与发布

- SCSS 经 Sass 编译、autoprefixer 加前缀、CSS 压缩(CSSNano/lightningcss)。
- 深色模式与主题包(theme token)在构建期即可确定,发布后通过 `data-theme` 切换。
- 视觉回归快照提交到仓库,作为 UI 变更门禁。

```bash
# 本地构建样式
pnpm build:css
# 生产:压缩 + sourcemap 关闭 + hash 文件名(指纹缓存)
```

### 9.2 测试(-a11y)

- a11y 断言:axtree 校验 DOMMatrix 结构与 label 关联(`toBeAccessible`).
- 视觉回归:Playwright 截图,测量整页 CLS 低于阈值。
- 契约测试:样式 token 一致性(如暗色模式对比度脚本)。

```bash
pnpm test:acc              # 可访问性断言
pnpm test:visual           # 截图 diff
pnpm test:token-a11y       # 对比度与 token 校验
```

## 10. 安全与性能要点

### 10.1 XSS 防护

- 用户内容一律经转义后输出,不在 `innerHTML` 直接插入富文本(除非走白名单 sanitizer)。
- 使用平台的 text 节点/文本插值 API,避免 `v-html` 类原始注入(禁用场景需 review)。
- 链接 href 校验协议(仅 `http/https/mailto`),防 `javascript:` 注入。

```html
<!-- 正例:文本由框架转义 -->
<span>{{ userProvidedName }}</span>
<!-- 反例:原始 HTML 注入为 XSS 风险 -->
<span v-html="userProvidedName"></span>
```

### 10.2 CSP 与安全头

- 生产站点启用 CSP(`default-src 'self'`),`style-src` 尽量不含 `unsafe-inline`。
- 敏感样式尽量走外部样式表而非内联 `style=`(满足 CSP 且便于缓存)。
- 关键交互节点不乱用 `eval`/`Function` 构造脚本。

### 10.3 性能:渲染成本

- 避免在滚动路径中触发强制同步布局;批量读写 DOM。
- `content-visibility:auto` 让屏外区块跳过渲染,降低长页面成本。
- `overflow: hidden` 慎用截断 a11y;大数据列表用容器滚动 + 虚拟化方案(见 Vue 篇)。

```css
/* 正例:长页面屏外区块跳过渲染 */
.long-list section { content-visibility: auto; contain-intrinsic-size: 400px; }
```

### 10.4 图标与字体性能

- 图标用内联 SVG 或 sprite,裁剪 unused 字形。
- 可变字体(wght)合并粗细减少体积;`font-display: swap` 控 CLS。

## 11. 常见陷阱与反模式

### 11.1 【陷阱】全用 `<div>` 做一切
无语义使屏幕阅读器与测试都难以理解;改用语义标签加 `aria`。

### 11.2 【陷阱】用 `id` 选择器 + `!important` 覆盖
特异性失控、难以维护;用 class 与 specifictoken 覆盖。

```css
/* 反例 */ #x { color:red !important; }
/* 正例 */ .x { color: var(--danger); }
```

### 11.3 【陷阱】多个 h1 或跳级 heading
破坏文档大纲;确保唯一 `h1`,层级连续。

### 11.4 【陷阱】移除 focus outline
键盘用户无法定位焦点,WCAG 失败;保留 `focus-visible` 指示。

### 11.5 【陷阱】无 label 的表单输入
屏幕阅读器无法关联;用 `for`/`aria-label` 补名。

### 11.6 【陷阱】`px` 硬编整文字号与间距
不利于用户放大缩放;正文用 `rem`,间距用 token。

### 11.7 【陷阱】过度嵌套 SCSS
`10 层嵌套` 产生超强特异性;限制嵌套深度并扁平用 class。

### 11.8 【陷阱】`alt=""` 用在含义图上
重要信息被读屏跳过;意义图补语义 `alt`.

### 11.9 【陷阱】把 `disabled="false"` 当布尔属性
布尔属性存在即生效;移除属性才是启用,错误用法会导致永远禁用。

```html
<!-- 反例:disabled="false" 仍是禁用 -->
<button disabled="false">提交</button>
<!-- 正例 -->
<button :disabled="!canSubmit">提交</button>
```

### 11.10 【陷阱】首屏加载全部样式/图片
拖慢 LCP;关键样式内联,屏外资源懒加载,图片预留宽高比。

### 11.11 【陷阱】暗色模式硬编码颜色
无法正确覆盖;通过 token 与 `data-theme` 切换。

### 11.12 【陷阱】动画忽略 `prefers-reduced-motion`
对动效敏感者造成不适(眩晕);提供降级关闭入口。

### 11.13 【陷阱】`innerHTML` 直插用户数据
XSS 入口;使用转义文本,富文本走白名单 sanitizer。

### 11.14 【陷阱】`overflow:auto` 但不能键盘滚动
自定义滚动容器的焦点元素不可达;容器保持可聚焦或用原生滚动。

### 11.15 【陷阱】依赖 DOM 结构进行隐藏语义(如 `title` 属性)
title 仅悬停可见且延迟;使用 sr-only 文本或 `aria-label`。

### 11.16 【陷阱】乱用 `!important` 修复弹性
反复面缝补特有性;重构类结构与 token 体系一次到位。

## 12. 自查检查清单

- [ ] 结构使用语义标签,页面有唯一 `h1`,层级连续。
- [ ] 每个表单输入都有可见 `label` 或正确的 `aria-label`。
- [ ] 所有交互元素可聚焦且 `focus-visible` 焦点可见。
- [ ] 图像 `alt` 语义匹配(意义图有 alt,装饰图为空 alt)。
- [ ] 未用 `id` 选择器、未用 `!important`。
- [ ] class 遵循 BEM,嵌套深度 ≤ 3,无过度层级。
- [ ] 无裸 `v-html`/`innerHTML` 直接注入未经净化的用户内容。
- [ ] 颜色使用设计 token,未硬编码魔法色值。
- [ ] 深色模式通过 token + `data-theme` 切换,无散落硬编码白/黑。
- [ ] 正文文字对比度 ≥ 4.5:1,UI 组件 ≥ 3:1。
- [ ] 字号正文用 `rem`,间距用 token,未滥用 `px`。
- [ ] 关键 CSS/图片按需加载,屏外资源 `loading="lazy"`。
- [ ] 关键资源预留宽高比,替换不引起 CLS。
- [ ] 动效尊重 `prefers-reduced-motion` 并降级。
- [ ] 图标为语义化 SVG 或有 `aria-label`,非裸 `<div>` 绘制。
- [ ] 未在滚动路径强制同步布局,未滥用 resize 手算。
- [ ] 样式经 `stylelint` 与 Prettier,无 lint 错误。
- [ ] a11y 与视觉回归测试已通过。
- [ ] 生产站点启用 CSP,`style-src` 无不必要的 `unsafe-inline`。
- [ ] 未使用 `title` 属性承载关键语义信息。

## 13. 参考资料

- MDN Web Docs:HTML 语义、CSS 值与单位、`@media` 与特性查询。
- W3C WAI/WCAG 2.2:可访问性成功标准。
- `stylelint` / `html-validate` 规则文档。
- 本仓库 `DESIGN.md` 设计规范与 `CONTEXT.md` 领域词表,以及 `packages/ui` 既有组件样式作为最长久的风格与 token 参照。