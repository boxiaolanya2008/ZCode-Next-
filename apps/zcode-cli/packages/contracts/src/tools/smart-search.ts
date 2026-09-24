// ============================================================
// SmartSearch Tool - aggregated content search with line context
// ============================================================
// Super tool: 一次调用聚合 Glob + Grep 检索，返回带行号与上下文的片段，
// 避免模型为同一次检索连续发起 Glob -> Grep -> Read 三次调用。

import { z } from "zod";
import type { ToolCallId, TraceId } from "../interfaces/shared.js";
import { semanticBoolean } from "./boolean-input.js";
import { toToolJsonSchema } from "./json-schema.js";

export const SMART_SEARCH_TOOL_NAME = "SmartSearch";
export const SMART_SEARCH_DEFAULT_MAX_RESULTS = 100;
export const SMART_SEARCH_MAX_RESULTS = 500;
export const SMART_SEARCH_MAX_CONTEXT_LINES = 20;

// -----------------------------------------------
// Input Schema
// -----------------------------------------------

export const SmartSearchInputSchema = z.object({
  query: z
    .string()
    .describe("Regex content pattern (ripgrep syntax, e.g. \"log.*Error\", \"function\\\\s+\\\\w+\")"),
  path: z
    .string()
    .optional()
    .describe("Absolute directory or file to search; defaults to the working directory"),
  glob: z.string().optional().describe('Glob filter for candidate files, e.g. "**/*.ts"'),
  ignore_case: semanticBoolean()
    .optional()
    .default(false)
    .describe("Case-insensitive search (default false)"),
  context_lines: z
    .number()
    .int()
    .nonnegative()
    .max(SMART_SEARCH_MAX_CONTEXT_LINES)
    .optional()
    .default(0)
    .describe("Lines of context shown before and after each match (default 0)"),
  max_results: z
    .number()
    .int()
    .positive()
    .max(SMART_SEARCH_MAX_RESULTS)
    .optional()
    .default(SMART_SEARCH_DEFAULT_MAX_RESULTS)
    .describe("Maximum matching lines to return (default 100)"),
});

export type SmartSearchInput = z.infer<typeof SmartSearchInputSchema>;

export const SmartSearchInputJsonSchema = toToolJsonSchema(SmartSearchInputSchema);

// -----------------------------------------------
// Output Types
// -----------------------------------------------

export interface SmartSearchOutput {
  /** Distinct files with at least one match, in result order. */
  files: string[];
  /** Matching lines rendered as "path:line:text", including context lines. */
  matches: string;
  numMatches: number;
  numFiles: number;
  truncated: boolean;
}

export const SmartSearchOutputSchema = z
  .object({
    files: z.array(z.string()),
    matches: z.string(),
    numMatches: z.number().int().nonnegative(),
    numFiles: z.number().int().nonnegative(),
    truncated: z.boolean(),
  })
  .strict();

export const SmartSearchOutputJsonSchema = toToolJsonSchema(SmartSearchOutputSchema);

// -----------------------------------------------
// Tool Call Structure
// -----------------------------------------------

export interface SmartSearchToolCall {
  id: ToolCallId;
  name: "SmartSearch";
  input: SmartSearchInput;
  traceId: TraceId;
  startedAt: Date;
}

export interface SmartSearchToolResult {
  toolCallId: ToolCallId;
  output: SmartSearchOutput;
  traceId: TraceId;
  durationMs: number;
}

// -----------------------------------------------
// SmartSearch Errors
// -----------------------------------------------

export const SmartSearchErrorCode = {
  EMPTY_QUERY: 1,
  INVALID_PATH: 2,
} as const;

export type SmartSearchErrorCode = (typeof SmartSearchErrorCode)[keyof typeof SmartSearchErrorCode];
