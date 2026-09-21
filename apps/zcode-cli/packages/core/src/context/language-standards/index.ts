// ============================================================
// Language Coding Standards - registry & path resolution
// ============================================================
//
// 每种主流语言一份 Markdown 编码规范。system prompt 中的 "Language coding standards"
// 段会指示模型在写某语言代码前先从本目录读取对应规范。
//
// 运行时这些 .md 是经文件系统被模型 Read 的（不是被打包工具内联），因此需要让
// resolveLanguageStandardsDir() 能在源码工程、CLI/SEA 单文件、桌面 glm 各类运行形态下
// 都定位到规范目录（见 docs/specs/language-coding-standards.md 的携带矩阵）。

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface LanguageStandardDescriptor {
  /** 语言展示名（供 system prompt 渲染）。 */
  readonly language: string;
  /** 规范文件名（相对语言规范目录）。 */
  readonly fileItem: string;
  /** 常见扩展名提示，帮助模型把代码类型映射到对应规范。 */
  readonly fileExtension: readonly string[];
}

/** 规范目录内的标记文件：用于识别"当前目录就是语言规范目录"。 */
const STANDARDS_MARKER_FILE = "typescript.md";

/** 语言→规范文件映射（与 language-standards/ 目录下的实际文件名一一对应）。 */
export const LANGUAGE_STANDARD_FILES: readonly LanguageStandardDescriptor[] = [
  {
    language: "TypeScript",
    fileItem: "typescript.md",
    fileExtension: ["ts", "tsx", "mts", "cts"],
  },
  {
    language: "JavaScript",
    fileItem: "javascript.md",
    fileExtension: ["js", "jsx", "mjs", "cjs"],
  },
  { language: "Python", fileItem: "python.md", fileExtension: ["py"] },
  { language: "Go", fileItem: "go.md", fileExtension: ["go"] },
  { language: "Rust", fileItem: "rust.md", fileExtension: ["rs"] },
  { language: "Java", fileItem: "java.md", fileExtension: ["java"] },
  { language: "C", fileItem: "c.md", fileExtension: ["c", "h"] },
  { language: "C++", fileItem: "cpp.md", fileExtension: ["cc", "cpp", "cxx", "hpp", "hh"] },
  { language: "C#", fileItem: "csharp.md", fileExtension: ["cs", "csx"] },
  { language: "Swift", fileItem: "swift.md", fileExtension: ["swift"] },
  {
    language: "Objective-C",
    fileItem: "objective-c.md",
    fileExtension: ["m", "mm", "h"],
  },
  { language: "Kotlin", fileItem: "kotlin.md", fileExtension: ["kt", "kts"] },
  { language: "Ruby", fileItem: "ruby.md", fileExtension: ["rb"] },
  { language: "PHP", fileItem: "php.md", fileExtension: ["php"] },
  { language: "Shell / Bash", fileItem: "shell.md", fileExtension: ["sh", "bash"] },
  { language: "SQL", fileItem: "sql.md", fileExtension: ["sql"] },
  {
    language: "HTML / CSS",
    fileItem: "html-css.md",
    fileExtension: ["html", "htm", "css", "scss", "less"],
  },
  { language: "Vue", fileItem: "vue.md", fileExtension: ["vue"] },
  { language: "Scala", fileItem: "scala.md", fileExtension: ["scala", "sc"] },
];

/**
 * 当前模块的基目录。
 *
 * - CJS 打包产物（cli/SEA/桌面 glm 的 zcode.cjs）直接复用 Node 的 `__dirname`，
 *   `__dirname` 指向产物所在目录（dist/ 或 glm/）。
 * - ESM 源码 / glance 产物（tsx、core/dist）没有 `__dirname`，回退到 `import.meta.url`。
 */
function currentModuleDirectory(): string {
  // CJS 打包产物（cli/SEA/桌面 glm 的 zcode.cjs）里 `__dirname` 是模块级变量（非 globalThis 属性），
  // 直接用裸标识符 + typeof 守卫：ESM 源码/产物下 `__dirname` 未定义，安全回退到 import.meta.url。
  if (typeof __dirname === "string" && __dirname.length > 0) {
    return __dirname;
  }
  return dirname(fileURLToPath(import.meta.url));
}

/**
 * 返回语言规范目录的绝对路径。
 *
 * 候选顺序（首个存在标记文件的目录胜出）：
 * 1. `<模块基目录>/language-standards` —— 打包 sidecar 布局（cli/SEA 的 dist、桌面 glm）。
 * 2. `<模块基目录>本身` —— 源码/产物与 index.ts 同目录布局。
 *
 * 目录不可达时返回优先的候选路径（调用方按不可达降级，不中断任务）。
 */
export function resolveLanguageStandardsDir(): string {
  const base = currentModuleDirectory();
  const candidates = [
    resolve(base, "language-standards"),
    base,
  ];
  for (const candidate of candidates) {
    if (existsSync(resolve(candidate, STANDARDS_MARKER_FILE))) {
      return candidate;
    }
  }
  return candidates[0];
}