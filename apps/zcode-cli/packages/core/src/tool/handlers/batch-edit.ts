// ============================================================
// BatchEdit Tool Handler - super tool over Edit
// ============================================================
// 一次调用对多个文件做多处精确文本修改；每条按顺序复用 Edit 的 handler，
// 因此匹配、read-before-edit、写回与结构化 diff 语义与 Edit 完全一致。
// 单条失败不中断其余编辑，逐条回传结果，便于模型定点重试。

import {
  BATCH_EDIT_MAX_EDITS,
  BATCH_EDIT_TOOL_NAME,
  BatchEditErrorCode,
  BatchEditInputJsonSchema,
  BatchEditInputSchema,
  BatchEditOutputJsonSchema,
  BatchEditOutputSchema,
  type BatchEditInput,
  type BatchEditItemResult,
  type BatchEditOutput,
  type EditOutput,
} from "@zcode/contracts";
import type { ToolEntry, ToolHandler, ToolHandlerFailure } from "../types.js";
import { editToolEntry } from "./edit.js";
import { isToolHandlerFailure, resolveEditTargets } from "./super-edit-shared.js";

const BATCH_EDIT_DESCRIPTION = [
  "Apply several exact-text edits across one or more files in a single call.",
  "",
  "- Reuses the Edit tool's matching rules: `old_string` must match the file exactly (including indentation) and be unique unless `replace_all` is true.",
  "- You must Read every target file in this conversation first, or the individual edit fails.",
  "- Edits are applied in order. One failing edit does not abort the others; each result is reported separately so you can retry only the failures.",
  "- Prefer this over many separate Edit calls when a change touches multiple files or locations.",
].join("\n");

const batchEditHandler: ToolHandler = async (input, context) => {
  const parsed = BatchEditInputSchema.parse(input) as BatchEditInput;
  const targets = resolveEditTargets(parsed.edits.slice(0, BATCH_EDIT_MAX_EDITS), context);

  const results: BatchEditItemResult[] = [];
  const files: string[] = [];
  const seen = new Set<string>();

  for (const target of targets) {
    if (!seen.has(target.filePath)) {
      seen.add(target.filePath);
      files.push(target.filePath);
    }

    const outcome = await editToolEntry.handler(
      {
        file_path: target.filePath,
        old_string: target.oldString,
        new_string: target.newString,
        replace_all: target.replaceAll,
      },
      context,
    );

    if (isToolHandlerFailure(outcome)) {
      results.push({
        index: target.index,
        filePath: target.filePath,
        status: "failed",
        errorCode: outcome.errorCode,
        message: outcome.message,
      });
      continue;
    }

    const output = outcome as EditOutput;
    results.push({
      index: target.index,
      filePath: target.filePath,
      status: "applied",
      structuredPatch: output.structuredPatch,
      replaceAll: output.replaceAll,
    });
  }

  const applied = results.filter((result) => result.status === "applied").length;
  if (applied === 0) {
    return batchFailure(results);
  }

  return {
    total: results.length,
    applied,
    failed: results.length - applied,
    files,
    results,
  } satisfies BatchEditOutput;
};

function batchFailure(results: readonly BatchEditItemResult[]): ToolHandlerFailure {
  const first = results[0];
  const detail = first ? ` First failure: ${first.message ?? "unknown error"}` : "";
  return {
    result: false,
    errorCode: BatchEditErrorCode.ALL_FAILED,
    message: `All ${results.length} edits failed; no file was modified.${detail}`,
  };
}

function formatBatchEditModelContent(output: unknown): string {
  if (!isRecord(output)) return "Batch edit completed.";
  const applied = typeof output.applied === "number" ? output.applied : 0;
  const failed = typeof output.failed === "number" ? output.failed : 0;
  const files = Array.isArray(output.files) ? output.files : [];
  const parts = [`Applied ${applied} edit(s) across ${files.length} file(s).`];
  if (failed > 0) {
    parts.push(`${failed} edit(s) failed — see the results for details.`);
  }
  parts.push("File state is current in your context — no need to Read it back.");
  return parts.join(" ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export const batchEditToolEntry: ToolEntry = {
  capability: "Apply many exact-text edits across files in one call, reusing Edit semantics",
  metadata: {
    name: BATCH_EDIT_TOOL_NAME,
    description: BATCH_EDIT_DESCRIPTION,
    readOnly: false,
    destructive: false,
    concurrentSafe: false,
    timeoutMs: 60000,
    maxOutputBytes: 1_000_000,
    sideEffectScope: "workspace",
    riskLevel: "medium",
    needsApproval: true,
  },
  handler: batchEditHandler,
  formatModelContent: formatBatchEditModelContent,
  inputSchema: BatchEditInputJsonSchema,
  outputSchema: BatchEditOutputJsonSchema,
  runtimeInputSchema: BatchEditInputSchema,
  runtimeOutputSchema: BatchEditOutputSchema,
  permission: {
    permission: "edit",
    reason: "BatchEdit modifies file contents through the file-system adapter",
    riskLevel: "medium",
    sideEffectScope: "workspace",
    needsApproval: true,
    // 入参是嵌套 edits 列表，没有顶层 file_path 可提取成稳定路径规则；
    // 不提供持久化 allow 模式，避免一次「总是允许」把整个工具永久放行。
    patternSources: ["input"],
    alwaysAllowPatternSources: [],
    denyPriority: "beforeAsk",
  },
  resultBudget: {
    maxInlineBytes: 1_000_000,
    maxModelBytes: 100_000,
    strategy: "truncate",
    preview: {
      maxBytes: 100_000,
      direction: "head",
    },
  },
  timeout: {
    defaultMs: 60000,
    maxMs: 60000,
    allowCallOverride: false,
  },
  cancellation: {
    supported: true,
    cleanup: "bestEffort",
    userVisibleMessage: "BatchEdit was cancelled before all file operations completed",
  },
  trace: {
    required: true,
    propagateToAdapters: true,
    recordInput: "summary",
    recordOutput: "summary",
  },
};
