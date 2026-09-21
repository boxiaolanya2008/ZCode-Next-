// ============================================================
// Language Coding Standards - system prompt section
// ============================================================
//
// 在 Main Agent 的稳定 system body 中注入"语言编码规范"段：
// 指示模型在编写/实质修改某语言代码前，先读取对应的规范文件，再参照其约定完成用户需求。
// 规范正文按语言单独存放 .md（见 ../language-standards/），本模块只负责生成段文本。

import type { ContextSection } from "../types.js";
import {
  LANGUAGE_STANDARD_FILES,
  resolveLanguageStandardsDir,
} from "../language-standards/index.js";
import { estimateTokens } from "../utils.js";

/** 全语言通用约束：作为规范文件不可达时的兜底，也是所有语言的最低门槛。 */
const UNIVERSAL_CODING_RULES = [
  "# Language coding standards",
  "- The user's request is the source of truth. If it is vague or ambiguous, state the ambiguity and your chosen interpretation clearly BEFORE writing code, then ship code that best matches the surrounding project's conventions.",
  "- When the task requires writing or substantially editing code in one of the languages listed below, FIRST read the matching spec file (Read the absolute path, or Glob inside the standards directory), THEN follow it.",
  "- The listed spec files are a minimum bar covering naming, structure, error handling, toolchain conventions and common pitfalls. Prefer them over ad hoc style choices.",
  "- If the matching spec file cannot be read, fall back to the general engineering rules below and continue; never block the task on an unreachable spec.",
  "",
  "General engineering rules (apply to all languages):",
  "- Match the surrounding code: its naming, comment density, and idioms. Keep names explicit and self-documenting; prefer clear intent over cleverness.",
  "- Keep functions and modules small and single-purpose; separate business logic from I/O; give every piece of state a single owner; make error paths explicit and recoverable where possible.",
  "- Follow the repository's actual build, test, and lint commands for the target package, and verify changes the way the project itself does.",
].join("\n");

function buildStandardsIndex(stdandsDir: string): string {
  const lines = LANGUAGE_STANDARD_FILES.map((entry) => {
    const extensions = entry.fileExtension.join("/");
    return `- ${entry.language} (${extensions}) \u2192 ${stdandsDir}/${entry.fileItem}`;
  });
  return [
    "",
    `Standards directory: ${stdandsDir}`,
    "",
    ...lines,
  ].join("\n");
}

export function buildLanguageStandardsSection(): ContextSection {
  const content = [
    UNIVERSAL_CODING_RULES,
    buildStandardsIndex(resolveLanguageStandardsDir()),
  ].join("\n");

  return {
    name: "Language Coding Standards",
    source: "language_standards",
    injectionTarget: "system",
    cacheHint: "stable",
    chars: content.length,
    tokens: estimateTokens(content),
    content,
    preview: content.slice(0, 100),
  };
}