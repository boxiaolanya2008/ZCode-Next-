// ============================================================
// Tool Usage Guide - stable system prompt section
// ============================================================
// 在 system prompt 开头（与 cli_prefix 相邻）注入"超级工具使用导引"段：
// 教模型超级工具能做什么、何时优先用、与基础工具的关系、常见错误与重试方式。
// 本段为稳定（cacheHint: "stable"）内容，且随当前 runtime 实际注册的超级工具集演进：
// 某个超级工具不在工具表里，就不对它写导引，避免把模型引向不存在的工具。

import {
  ATOMIC_EDIT_TOOL_NAME,
  BATCH_EDIT_TOOL_NAME,
  SMART_SEARCH_TOOL_NAME,
} from "@zcode/contracts";
import type { ContextSection } from "../types.js";
import { estimateTokens } from "../utils.js";

const SUPER_TOOL_NAMES = [
  BATCH_EDIT_TOOL_NAME,
  ATOMIC_EDIT_TOOL_NAME,
  SMART_SEARCH_TOOL_NAME,
] as const;

const READ_BEFORE_EDIT_GUIDE = [
  "## Read before you edit",
  "- Read a file before editing it. Edit, BatchEdit and AtomicEdit all require a prior Read of that file in this conversation; otherwise the call fails with a \"File has not been read yet\" error.",
  "- Re-Read if the file changed since your last Read, or you will hit a stale-file error.",
].join("\n");

const BATCH_EDIT_GUIDE = [
  "## BatchEdit — many edits in one call",
  "- Use it when a change spans multiple files or several locations: pass `edits[]`, each `{ file_path, old_string, new_string, replace_all? }`.",
  "- Matching rules are identical to Edit: `old_string` must match the file exactly (including indentation) and be unique unless `replace_all` is true.",
  "- Edits run in order. One failing edit does not stop the others; read the per-edit results and retry only the failures.",
].join("\n");

const ATOMIC_EDIT_GUIDE = [
  "## AtomicEdit — all-or-nothing",
  "- Use it when a set of edits must land together, e.g. a rename that has to stay consistent across files.",
  "- Every `old_string` is validated before any write. If one fails, the whole call is rejected (`status: \"rejected\"`) and no file is modified.",
  "- After writing, each file is read back; a mismatch rolls the whole call back (`status: \"rolled_back\"`).",
  "- When you see `rejected` or `rolled_back`, fix the failing edit (usually a non-unique or whitespace-mismatched `old_string`) and retry.",
].join("\n");

const SMART_SEARCH_GUIDE = [
  "## SmartSearch — locate and read snippets in one call",
  "- Use it when you want located, readable snippets in a single call: pass `query` (regex) with optional `glob`/`path`, and set `context_lines` for surrounding lines.",
  "- Results come back as `path:line:text`, so you can edit directly from them instead of issuing several search round-trips.",
].join("\n");

const COMMON_ERRORS_GUIDE = [
  "## Common errors and retries",
  "- \"String to replace not found\" → the `old_string` does not match; re-Read and copy the exact text (strip any line-number prefix).",
  "- \"Found N matches ... replace_all is false\" → add more surrounding context to make it unique, or set `replace_all: true`.",
  "- \"File has not been read yet\" / stale file → Read the file again, then retry.",
  "- Large results are summarized or truncated; narrow the query or read specific ranges instead of dumping whole files.",
].join("\n");

/**
 * 构建工具使用导引段。`availableToolNames` 是当前 runtime 的工具表；
 * 缺席（测试/旧调用方）时按全部超级工具可用处理。没有任何超级工具可用时返回 null。
 */
export function buildToolUsageGuideSection(
  availableToolNames: readonly string[] | undefined,
): ContextSection | null {
  const available =
    availableToolNames === undefined
      ? new Set<string>(SUPER_TOOL_NAMES)
      : new Set(availableToolNames);
  const hasSuperTools = SUPER_TOOL_NAMES.some((name) => available.has(name));
  if (!hasSuperTools) return null;

  const blocks = ["# Using the editing and search tools"];
  blocks.push(
    "You have super tools layered on top of the basic file tools. Prefer them for the situations below; the basic tools (Read/Write/Edit/Glob/Grep) remain available and are the building blocks underneath.",
  );
  blocks.push(READ_BEFORE_EDIT_GUIDE);
  if (available.has(BATCH_EDIT_TOOL_NAME)) blocks.push(BATCH_EDIT_GUIDE);
  if (available.has(ATOMIC_EDIT_TOOL_NAME)) blocks.push(ATOMIC_EDIT_GUIDE);
  if (available.has(SMART_SEARCH_TOOL_NAME)) blocks.push(SMART_SEARCH_GUIDE);
  blocks.push(COMMON_ERRORS_GUIDE);

  const content = blocks.join("\n\n");
  return {
    name: "Tool Usage Guide",
    source: "tool_usage_guide",
    injectionTarget: "system",
    cacheHint: "stable",
    chars: content.length,
    tokens: estimateTokens(content),
    content,
    preview: content.slice(0, 100),
  };
}
