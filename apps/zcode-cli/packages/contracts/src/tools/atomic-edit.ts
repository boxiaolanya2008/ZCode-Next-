// ============================================================
// AtomicEdit Tool - validate-then-apply edits with rollback
// ============================================================
// Super tool: 编辑前校验全部匹配（预检），编辑后回读校验；任一步失败即回滚，
// 不留下半成品写入。底层复用 Edit 的匹配与写回实现。

import { z } from "zod";
import type { ToolCallId, TraceId } from "../interfaces/shared.js";
import { EditDiffHunkSchema, type DiffHunk } from "./edit.js";
import { EditItemSchema } from "./edit-item.js";
import { toToolJsonSchema } from "./json-schema.js";

export const ATOMIC_EDIT_TOOL_NAME = "AtomicEdit";
export const ATOMIC_EDIT_MAX_EDITS = 50;

// -----------------------------------------------
// Input Schema
// -----------------------------------------------

export const AtomicEditInputSchema = z.object({
  edits: z
    .array(EditItemSchema)
    .min(1)
    .max(ATOMIC_EDIT_MAX_EDITS)
    .describe(
      "Ordered edits applied all-or-nothing. Every old_string is validated against the current file before any write; if one fails the whole call is rejected with no writes.",
    ),
  verify: z
    .boolean()
    .optional()
    .default(true)
    .describe("Read every written file back and compare with the expected content (default true)"),
});

export type AtomicEditInput = z.infer<typeof AtomicEditInputSchema>;

export const AtomicEditInputJsonSchema = toToolJsonSchema(AtomicEditInputSchema);

// -----------------------------------------------
// Output Types
// -----------------------------------------------

export interface AtomicEditFileResult {
  filePath: string;
  editCount: number;
  structuredPatch: DiffHunk[];
}

export interface AtomicEditFailure {
  index: number;
  filePath: string;
  /** EditErrorCode when the failure comes from edit matching. */
  errorCode: number;
  message: string;
}

export interface AtomicEditOutput {
  /** applied: all writes succeeded (and verified when requested).
   *  rejected: pre-flight validation failed; nothing was written.
   *  rolled_back: a write or read-back check failed; earlier writes were reverted. */
  status: "applied" | "rejected" | "rolled_back";
  total: number;
  applied: number;
  verified: boolean;
  files: AtomicEditFileResult[];
  failures: AtomicEditFailure[];
  rolledBackFiles: string[];
}

export const AtomicEditFileResultSchema = z
  .object({
    filePath: z.string(),
    editCount: z.number().int().nonnegative(),
    structuredPatch: z.array(EditDiffHunkSchema),
  })
  .strict();

export const AtomicEditFailureSchema = z
  .object({
    index: z.number().int().nonnegative(),
    filePath: z.string(),
    errorCode: z.number().int(),
    message: z.string(),
  })
  .strict();

export const AtomicEditOutputSchema = z
  .object({
    status: z.enum(["applied", "rejected", "rolled_back"]),
    total: z.number().int().nonnegative(),
    applied: z.number().int().nonnegative(),
    verified: z.boolean(),
    files: z.array(AtomicEditFileResultSchema),
    failures: z.array(AtomicEditFailureSchema),
    rolledBackFiles: z.array(z.string()),
  })
  .strict();

export const AtomicEditOutputJsonSchema = toToolJsonSchema(AtomicEditOutputSchema);

// -----------------------------------------------
// Tool Call Structure
// -----------------------------------------------

export interface AtomicEditToolCall {
  id: ToolCallId;
  name: "AtomicEdit";
  input: AtomicEditInput;
  traceId: TraceId;
  startedAt: Date;
}

export interface AtomicEditToolResult {
  toolCallId: ToolCallId;
  output: AtomicEditOutput;
  traceId: TraceId;
  durationMs: number;
}

// -----------------------------------------------
// AtomicEdit Errors
// -----------------------------------------------

export const AtomicEditErrorCode = {
  NO_EDITS: 1,
  TOO_MANY_EDITS: 2,
  PRECHECK_FAILED: 3,
  ROLLED_BACK: 4,
} as const;

export type AtomicEditErrorCode = (typeof AtomicEditErrorCode)[keyof typeof AtomicEditErrorCode];
