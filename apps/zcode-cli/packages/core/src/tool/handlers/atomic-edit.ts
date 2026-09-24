// ============================================================
// AtomicEdit Tool Handler - validate-then-apply edits with rollback
// ============================================================
// 先预检全部匹配（不写盘），全部通过后按序复用 Edit 的 handler 写回；
// 写回后可选回读校验。任一步失败即回滚已写入文件，不留下半成品。

import {
  ATOMIC_EDIT_MAX_EDITS,
  ATOMIC_EDIT_TOOL_NAME,
  AtomicEditInputJsonSchema,
  AtomicEditInputSchema,
  AtomicEditOutputJsonSchema,
  AtomicEditOutputSchema,
  type AtomicEditFailure,
  type AtomicEditFileResult,
  type AtomicEditInput,
  type AtomicEditOutput,
  type DiffHunk,
  type EditOutput,
} from "@zcode/contracts";
import type { ToolEntry, ToolExecutionContext, ToolHandler } from "../types.js";
import { editToolEntry } from "./edit.js";
import {
  isToolHandlerFailure,
  preflightAtomicEdits,
  readBackMatches,
  resolveEditTargets,
  restoreFile,
  type EditTarget,
  type PreflightFilePlan,
} from "./super-edit-shared.js";

const ATOMIC_EDIT_DESCRIPTION = [
  "Apply several exact-text edits across one or more files all-or-nothing.",
  "",
  "- Every `old_string` is validated against the current file before any write. If one edit does not match, the whole call is rejected and no file is modified.",
  "- You must Read every target file in this conversation first.",
  "- After writing, each file is read back and compared with the expected content; a mismatch rolls the call back.",
  "- Use this when a set of edits must land together (e.g. a rename that must be consistent across files).",
].join("\n");

const atomicEditHandler: ToolHandler = async (input, context) => {
  const parsed = AtomicEditInputSchema.parse(input) as AtomicEditInput;
  const targets = resolveEditTargets(parsed.edits.slice(0, ATOMIC_EDIT_MAX_EDITS), context);
  const total = targets.length;

  const preflight = await preflightAtomicEdits(targets, context);
  if (!preflight.ok) {
    return rejectedOutput(total, parsed.verify, preflight.failures);
  }

  const appliedResults: AtomicEditFileResult[] = [];
  const writtenPlans: PreflightFilePlan[] = [];
  let failure: AtomicEditFailure | undefined;

  for (const plan of preflight.plans) {
    // 先登记再写入：同文件的多条编辑中途失败时，该文件也已有部分写入，必须一起回滚。
    writtenPlans.push(plan);
    const patch: DiffHunk[] = [];
    for (const index of plan.editIndexes) {
      const target = targets[index]!;
      const outcome = await applyTarget(target, context);
      if (isToolHandlerFailure(outcome)) {
        failure = {
          index,
          filePath: plan.filePath,
          errorCode: outcome.errorCode,
          message: outcome.message,
        };
        break;
      }
      patch.push(...(outcome as EditOutput).structuredPatch);
    }
    if (failure) break;
    appliedResults.push({
      filePath: plan.filePath,
      editCount: plan.editIndexes.length,
      structuredPatch: patch,
    });
  }

  if (failure) {
    return await rolledBackOutput(total, parsed.verify, [failure], writtenPlans, context);
  }

  if (parsed.verify) {
    for (const plan of writtenPlans) {
      if (await readBackMatches(plan, context)) continue;
      const mismatch: AtomicEditFailure = {
        index: plan.editIndexes[0] ?? 0,
        filePath: plan.filePath,
        errorCode: 0,
        message: "Read-back check failed: file content does not match the expected result.",
      };
      return await rolledBackOutput(total, parsed.verify, [mismatch], writtenPlans, context);
    }
  }

  return {
    status: "applied",
    total,
    applied: appliedResults.length,
    verified: parsed.verify,
    files: appliedResults,
    failures: [],
    rolledBackFiles: [],
  } satisfies AtomicEditOutput;
};

function applyTarget(target: EditTarget, context: ToolExecutionContext) {
  return editToolEntry.handler(
    {
      file_path: target.filePath,
      old_string: target.oldString,
      new_string: target.newString,
      replace_all: target.replaceAll,
    },
    context,
  );
}

function rejectedOutput(
  total: number,
  verified: boolean,
  failures: readonly AtomicEditFailure[],
): AtomicEditOutput {
  return {
    status: "rejected",
    total,
    applied: 0,
    verified,
    files: [],
    failures: [...failures],
    rolledBackFiles: [],
  };
}

async function rolledBackOutput(
  total: number,
  verified: boolean,
  failures: readonly AtomicEditFailure[],
  writtenPlans: readonly PreflightFilePlan[],
  context: ToolExecutionContext,
): Promise<AtomicEditOutput> {
  const rolledBackFiles: string[] = [];
  for (const plan of writtenPlans) {
    try {
      await restoreFile(plan, context);
      rolledBackFiles.push(plan.filePath);
    } catch {
      // 回滚是尽力而为：单个文件恢复失败不应掩盖原始失败原因，失败文件不记入 rolledBackFiles。
    }
  }
  return {
    status: "rolled_back",
    total,
    applied: 0,
    verified,
    files: [],
    failures: [...failures],
    rolledBackFiles,
  };
}

function formatAtomicEditModelContent(output: unknown): string {
  if (!isRecord(output)) return "Atomic edit completed.";
  const status = output.status;
  const total = typeof output.total === "number" ? output.total : 0;
  if (status === "applied") {
    const files = Array.isArray(output.files) ? output.files.length : 0;
    const verified = output.verified === true ? " All files verified by read-back." : "";
    return `AtomicEdit applied ${total} edit(s) across ${files} file(s).${verified} File state is current in your context.`;
  }
  const failures = Array.isArray(output.failures) ? output.failures : [];
  const detail = failures
    .map((entry) => {
      if (!isRecord(entry)) return "";
      return `- #${entry.index} ${String(entry.filePath)}: ${String(entry.message)}`;
    })
    .filter(Boolean)
    .join("\n");
  if (status === "rejected") {
    return `AtomicEdit rejected: validation failed, no file was modified. Fix the failing edits and retry.\n${detail}`;
  }
  const rolledBack = Array.isArray(output.rolledBackFiles) ? output.rolledBackFiles : [];
  return `AtomicEdit rolled back: a write or read-back check failed and ${rolledBack.length} file(s) were restored.\n${detail}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export const atomicEditToolEntry: ToolEntry = {
  capability: "Validate then apply several exact-text edits all-or-nothing, with rollback",
  metadata: {
    name: ATOMIC_EDIT_TOOL_NAME,
    description: ATOMIC_EDIT_DESCRIPTION,
    readOnly: false,
    destructive: false,
    concurrentSafe: false,
    timeoutMs: 60000,
    maxOutputBytes: 1_000_000,
    sideEffectScope: "workspace",
    riskLevel: "medium",
    needsApproval: true,
  },
  handler: atomicEditHandler,
  formatModelContent: formatAtomicEditModelContent,
  inputSchema: AtomicEditInputJsonSchema,
  outputSchema: AtomicEditOutputJsonSchema,
  runtimeInputSchema: AtomicEditInputSchema,
  runtimeOutputSchema: AtomicEditOutputSchema,
  permission: {
    permission: "edit",
    reason: "AtomicEdit modifies file contents through the file-system adapter",
    riskLevel: "medium",
    sideEffectScope: "workspace",
    needsApproval: true,
    // 同 BatchEdit：嵌套 edits 没有稳定顶层路径规则，不提供持久化 allow 模式。
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
    userVisibleMessage: "AtomicEdit was cancelled; any applied edits were rolled back",
  },
  trace: {
    required: true,
    propagateToAdapters: true,
    recordInput: "summary",
    recordOutput: "summary",
  },
};
