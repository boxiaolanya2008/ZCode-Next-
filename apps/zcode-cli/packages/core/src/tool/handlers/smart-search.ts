// ============================================================
// SmartSearch Tool Handler - aggregated Glob + Grep retrieval
// ============================================================
// 一次调用完成「按 glob 限定候选文件 + 正则内容检索 + 行号与上下文」，
// 复用 file-system adapter 的 searchText（与 Grep 同源），返回结构化片段。

import { isAbsolute, relative, sep } from "node:path";
import {
  SMART_SEARCH_MAX_RESULTS,
  SMART_SEARCH_TOOL_NAME,
  SmartSearchInputJsonSchema,
  SmartSearchInputSchema,
  SmartSearchOutputJsonSchema,
  SmartSearchOutputSchema,
  CoreErrorType,
  createCoreError,
  isFileSystemPortError,
  type FileSystemSearchTextEntry,
  type SmartSearchInput,
  type SmartSearchOutput,
  type TraceContext,
} from "@zcode/contracts";
import { resolveToolWorkingDirectory, resolveWorkspacePath } from "../path-policy.js";
import type { ToolEntry, ToolHandler } from "../types.js";

const SMART_SEARCH_DESCRIPTION = [
  "Search file contents in one call and get matching snippets with line numbers and optional context.",
  "",
  "- `query` is a ripgrep-compatible regex (e.g. \"log.*Error\", \"function\\\\s+\\\\w+\").",
  "- Narrow the search with `glob` (e.g. \"**/*.ts\") and `path`; add `context_lines` for surrounding lines.",
  "- Prefer this over running Glob and Grep separately when you want located, readable snippets in a single round-trip.",
].join("\n");

const smartSearchHandler: ToolHandler = async (input, context) => {
  const parsed = SmartSearchInputSchema.parse(input) as SmartSearchInput;
  const fileSystemPort = context.fileSystemPort;

  if (!fileSystemPort) {
    throw createCoreError(
      CoreErrorType.ConfigurationError,
      "FileSystemPort is not configured for SmartSearch tool",
      {
        context: { toolCallId: context.toolCallId, toolName: SMART_SEARCH_TOOL_NAME },
        recoverable: false,
      },
    );
  }

  const searchPath = parsed.path
    ? resolveWorkspacePath({
        inputPath: parsed.path,
        operation: "read",
        workingDirectory: context.workingDirectory,
        workspaceRoot: context.workspaceRoot,
      })
    : resolveToolWorkingDirectory(undefined, {
        operation: "read",
        workingDirectory: context.workingDirectory,
        workspaceRoot: context.workspaceRoot,
      });

  let result;
  try {
    result = await fileSystemPort.searchText(
      {
        path: searchPath,
        pattern: parsed.query,
        glob: parsed.glob,
        outputMode: "content",
        beforeContext: parsed.context_lines,
        afterContext: parsed.context_lines,
        context: parsed.context_lines,
        showLineNumbers: true,
        ignoreCase: parsed.ignore_case,
        headLimit: Math.min(parsed.max_results, SMART_SEARCH_MAX_RESULTS),
        trace: {
          traceId: context.traceId,
          spanId: context.spanId,
          parentSpanId: context.parentSpanId,
          sessionId: context.sessionId,
          turnId: context.turnId,
        } as unknown as TraceContext,
      },
      { signal: context.abortSignal },
    );
  } catch (error) {
    if (isFileSystemPortError(error) && error.code === "cancelled") {
      throw createCoreError(CoreErrorType.ToolCancelled, "SmartSearch was cancelled", {
        cause: error,
        context: { path: searchPath, toolCallId: context.toolCallId, toolName: SMART_SEARCH_TOOL_NAME },
        recoverable: true,
      });
    }
    throw error;
  }

  const files: string[] = [];
  const seen = new Set<string>();
  const lines = result.entries.map((entry) => {
    const displayPath = toDisplayPath(entry.path, context.workingDirectory);
    if (!seen.has(displayPath)) {
      seen.add(displayPath);
      files.push(displayPath);
    }
    return formatEntry(entry, displayPath);
  });

  return {
    files,
    matches: lines.join("\n"),
    numMatches: result.numMatches,
    numFiles: files.length,
    truncated: result.truncated,
  } satisfies SmartSearchOutput;
};

function formatEntry(entry: FileSystemSearchTextEntry, displayPath: string): string {
  const text = entry.text ?? "";
  return entry.lineNumber !== undefined ? `${displayPath}:${entry.lineNumber}:${text}` : `${displayPath}:${text}`;
}

function toDisplayPath(filePath: string, workingDirectory: string): string {
  const relativePath = relative(workingDirectory, filePath);
  if (relativePath && !relativePath.startsWith("..") && !isAbsolute(relativePath)) {
    return relativePath.split(sep).join("/");
  }
  return filePath;
}

function formatSmartSearchModelContent(output: unknown): string {
  if (!isRecord(output)) return "No matches found";
  const matches = typeof output.matches === "string" ? output.matches : "";
  if (matches.length === 0) return "No matches found";
  const numMatches = typeof output.numMatches === "number" ? output.numMatches : 0;
  const numFiles = typeof output.numFiles === "number" ? output.numFiles : 0;
  const truncatedNote = output.truncated === true ? "\n\n[Results truncated; narrow the query or glob.]" : "";
  return `Found ${numMatches} match(es) across ${numFiles} file(s):\n${matches}${truncatedNote}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export const smartSearchToolEntry: ToolEntry = {
  capability: "Aggregate glob-filtered content search with line numbers and context snippets",
  metadata: {
    name: SMART_SEARCH_TOOL_NAME,
    description: SMART_SEARCH_DESCRIPTION,
    readOnly: true,
    destructive: false,
    concurrentSafe: true,
    timeoutMs: 30000,
    maxOutputBytes: 100_000,
    sideEffectScope: "none",
    riskLevel: "low",
    needsApproval: false,
  },
  handler: smartSearchHandler,
  formatModelContent: formatSmartSearchModelContent,
  inputSchema: SmartSearchInputJsonSchema,
  outputSchema: SmartSearchOutputJsonSchema,
  runtimeInputSchema: SmartSearchInputSchema,
  runtimeOutputSchema: SmartSearchOutputSchema,
  permission: {
    permission: "read",
    reason: "SmartSearch only searches file contents and has no external side effects",
    riskLevel: "low",
    sideEffectScope: "none",
    needsApproval: false,
    patternSources: ["path", "input"],
    alwaysAllowPatternSources: ["path", "input"],
    denyPriority: "beforeAsk",
  },
  resultBudget: {
    maxInlineBytes: 100_000,
    maxModelBytes: 100_000,
    strategy: "artifact",
    preview: {
      maxBytes: 100_000,
      direction: "head",
    },
    artifact: {
      enabled: true,
      retention: "session",
    },
  },
  timeout: {
    defaultMs: 30000,
    maxMs: 30000,
    allowCallOverride: false,
  },
  cancellation: {
    supported: true,
    cleanup: "none",
    userVisibleMessage: "SmartSearch was cancelled before search results were returned",
  },
  trace: {
    required: true,
    propagateToAdapters: true,
    recordInput: "summary",
    recordOutput: "summary",
  },
};
