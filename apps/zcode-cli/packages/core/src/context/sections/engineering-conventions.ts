// ============================================================
// Engineering Conventions - stable system prompt section
// ============================================================
//
// 在 Main Agent 的稳定 system body 注入"工程约定"段，包含两组不可协商的行为基线：
//  1. SVG 图标制作：当模型需要产出 SVG 图标时，同时支持静态与动态（动画）形态，
//     并遵循可访问性与主题自适应约定。
//  2. Git 提交信息格式：生成 commit / 提交说明时按给定示例逐字模仿。
// 本段为稳定（cacheHint: "stable"）system 内容，随所有会话生效。

import type { ContextSection } from "../types.js";
import { estimateTokens } from "../utils.js";

const SVG_ICON_RULES = [
  "# SVG 图标制作",
  "- 当需要产出 SVG 图标时，应提供**合法、可独立渲染**的 SVG：根 `<svg>` 带 `viewBox`；图形用 `<path>`/`<rect>`/`<circle>`/`<polygon>` 表达；默认建议 24x24 网格并按需设定宽高。",
  "- 图标同时支持**静态与动态**两种形态：",
  "  - 静态：`<svg role=\"img\" aria-label=\"...\">`，路径的 fill/stroke 统一用 `currentColor` 以跟随主题文字色；不加无意义装饰。",
  "  - 动态（动画）：优先使用 SMIL（`<animate>`、`<animateTransform>`、`<animateMotion>`）或内联 `<style>` 的 CSS 动画；动画简短克制，并将动画包在 `@media (prefers-reduced-motion: no-preference)` 内以尊重系统的“减弱动态效果”设置。",
  "- 可访问性：给图标加 `<title>`（内容与 `aria-label` 一致）与 `role=\"img\"`；纯装饰图标用 `aria-hidden=\"true\"`。",
  "- 禁止使用占位图片或外链生成的图片作为图标；图标必须能通过 SVG 源码直接内联使用。",
].join("\n");

const COMMIT_CONVENTION_RULES = [
  "# Git 提交信息格式",
  "- 生成 commit / 提交说明时，按**下方示例的格式逐字模仿**，括号、方括号、编号与类型标签均保留：",
  "- **提交1 (42177815)**: `[APP.Launcher][1/2]{【Feature】【16.1】切换暗色模式图标加载流程优化}`",
  "- **提交2 (42178965)**: `[JAR.settingslib][2/2]{【Feature】【16.1】切换暗色模式图标加载流程优化}`",
  "- 结构：`[模块/Scope][第N分/共M分]{【类型】【版本】中文描述}`。",
  "- 规则：`【类型】`保留标签（如 【Feature】/【Bugfix】），`【版本】`字段务必保留；描述用中文、精确、面向产出目标；同一功能拆多个提交时用 `[1/2]`、`[2/2]` 等顺序编号。",
].join("\n");

export function buildEngineeringConventionsSection(): ContextSection {
  const content = [SVG_ICON_RULES, COMMIT_CONVENTION_RULES].join("\n\n");

  return {
    name: "Engineering Conventions",
    source: "engineering_conventions",
    injectionTarget: "system",
    cacheHint: "stable",
    chars: content.length,
    tokens: estimateTokens(content),
    content,
    preview: content.slice(0, 100),
  };
}