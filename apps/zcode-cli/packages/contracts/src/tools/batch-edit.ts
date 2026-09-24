// ============================================================
// BatchEdit Tool - many exact-text edits across files in one call
// ============================================================
// Super tool: 上层能力，底层按顺序复用 Edit 的匹配与写回实现。
// 单条失败不会中断其余编辑；每条结果单独回传，便于模型定点重试。

import { z } from "zod";
import type { ToolCallId, TraceId } from "../interfaces/shared.js";
import { EditDiffHunkSchema, type DiffHunk } from "./edit.js";
import { EditItemSchema } from "./edit-item.js";
import { toToolJsonSchema } from "./json-schema.js";

export const BATCH_EDIT_TOOL_NAME = "BatchEdit";
export const BATCH_EDIT_MAX_EDITS = 50;

// -----------------------------------------------
// Input Schema
// -----------------------------------------------

export const BatchEditInputSchema = z.object({
  edits: z
    .array(EditItemSchema)
    .min(1)
    .max(BATCH_EDIT_MAX_EDITS)
    .describe(
      "Ordered edits applied one by one with the same matching rules as Edit. Read each target file first; an edit whose old_string does not match fails on its own without aborting the rest.",
    ),
});

export type BatchEditInput = z.infer<typeof BatchEditInputSchema>;

export const BatchEditInputJsonSchema = toToolJsonSchema(BatchEditInputSchema);

// -----------------------------------------------
// Output Types
// -----------------------------------------------

export interface BatchEditItemResult {
  index: number;
  filePath: string;
  status: "applied" | "failed";
  /** EditErrorCode when status is "failed". */
  errorCode?: number;
  message?: string;
  structuredPatch?: DiffHunk[];
  replaceAll?: boolean;
}

export interface BatchEditOutput {
  total: number;
  applied: number;
  failed: number;
  /** Distinct file paths touched by the request, in first-appearance order. */
  files: string[];
  results: BatchEditItemResult[];
}

export const BatchEditItemResultSchema = z
  .object({
    index: z.number().int().nonnegative(),
    filePath: z.string(),
    status: z.enum(["applied", "failed"]),
    errorCode: z.number().int().optional(),
    message: z.string().optional(),
    structuredPatch: z.array(EditDiffHunkSchema).optional(),
    replaceAll: z.boolean().optional(),
  })
  .strict();

export const BatchEditOutputSchema = z
  .object({
    total: z.number().int().nonnegative(),
    applied: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    files: z.array(z.string()),
    results: z.array(BatchEditItemResultSchema),
  })
  .strict();

export const BatchEditOutputJsonSchema = toToolJsonSchema(BatchEditOutputSchema);

// -----------------------------------------------
// Tool Call Structure
// -----------------------------------------------

export interface BatchEditToolCall {
  id: ToolCallId;
  name: "BatchEdit";
  input: BatchEditInput;
  traceId: TraceId;
  startedAt: Date;
}

export interface BatchEditToolResult {
  toolCallId: ToolCallId;
  output: BatchEditOutput;
  traceId: TraceId;
  durationMs: number;
}

// -----------------------------------------------
// BatchEdit Errors
// -----------------------------------------------

export const BatchEditErrorCode = {
  NO_EDITS: 1,
  TOO_MANY_EDITS: 2,
  ALL_FAILED: 3,
} as const;

export type BatchEditErrorCode = (typeof BatchEditErrorCode)[keyof typeof BatchEditErrorCode];
