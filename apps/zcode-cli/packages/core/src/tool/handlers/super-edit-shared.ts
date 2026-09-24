// ============================================================
// Super Edit Shared - helpers reused by BatchEdit / AtomicEdit
// ============================================================
// 超级编辑工具（BatchEdit / AtomicEdit）共用的编辑计划与预检逻辑。
// 只复用既有实现：匹配用 edit-matchers，写回交给 Edit 的 handler，
// 这里只补充「先校验后写入 + 失败回滚」所需的读文件、分组与预检。

import type {
  FileSystemLineEndings,
  FileSystemReadTextResult,
  FileSystemTextEncoding,
  TraceContext,
} from "@zcode/contracts";
import { EditErrorCode, isFileSystemPortError } from "@zcode/contracts";
import {
  findEditMatch,
  normalizeLineEndings,
  normalizeReplacementForMatch,
  preserveQuoteStyle,
} from "../edit-matchers.js";
import { resolveWorkspacePath } from "../path-policy.js";
import {
  createReadFileStateKey,
  findEditableReadFileState,
  normalizeReadFileStateMtimeMs,
} from "../read-file-state.js";
import type { ReadFileStateEntry, ToolExecutionContext, ToolHandlerFailure } from "../types.js";
import type { AtomicEditFailure, BatchEditInput } from "@zcode/contracts";

/** 单条编辑项：与 BatchEdit / AtomicEdit 的 edits[] 元素结构一致。 */
export type EditInputItem = BatchEditInput["edits"][number];

export interface EditTarget {
  index: number;
  filePath: string;
  oldString: string;
  newString: string;
  replaceAll: boolean;
}

export interface PreflightFilePlan {
  filePath: string;
  originalContent: string;
  expectedContent: string;
  editIndexes: number[];
  encoding: FileSystemTextEncoding;
  lineEndings: FileSystemLineEndings;
  revision?: FileSystemReadTextResult["revision"];
}

export interface PreflightOutcome {
  ok: boolean;
  plans: PreflightFilePlan[];
  failures: AtomicEditFailure[];
}

export function isToolHandlerFailure(value: unknown): value is ToolHandlerFailure {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { result?: unknown }).result === false
  );
}

export function createEditTrace(context: ToolExecutionContext): TraceContext {
  return {
    traceId: context.traceId,
    spanId: context.spanId,
    parentSpanId: context.parentSpanId,
    sessionId: context.sessionId,
    turnId: context.turnId,
  } as unknown as TraceContext;
}

/** 把模型发出的编辑项解析成绝对路径目标，保持输入顺序。 */
export function resolveEditTargets(
  edits: readonly EditInputItem[],
  context: ToolExecutionContext,
): EditTarget[] {
  return edits.map((edit, index) => ({
    index,
    filePath: resolveWorkspacePath({
      inputPath: edit.file_path,
      operation: "write",
      workingDirectory: context.workingDirectory,
      workspaceRoot: context.workspaceRoot,
    }),
    oldString: edit.old_string,
    newString: edit.new_string,
    replaceAll: edit.replace_all,
  }));
}

/**
 * 按解析后的文件路径分组，保持首次出现顺序；同文件的多条编辑按输入顺序排列。
 * 同一文件的多条编辑需要按序叠加，不能各自对着原始内容独立校验。
 */
export function groupTargetsByFile(
  targets: readonly EditTarget[],
): Array<{ filePath: string; targets: EditTarget[] }> {
  const groups: Array<{ filePath: string; targets: EditTarget[] }> = [];
  const index = new Map<string, number>();
  for (const target of targets) {
    const existing = index.get(target.filePath);
    if (existing === undefined) {
      index.set(target.filePath, groups.length);
      groups.push({ filePath: target.filePath, targets: [target] });
      continue;
    }
    groups[existing]!.targets.push(target);
  }
  return groups;
}

/**
 * AtomicEdit 的预检：在任何写入之前，逐文件回读、校验 read-state 与全部匹配，
 * 并按序在内存中叠加出目标内容。任一条失败即整体拒绝（不产生半成品写入）。
 */
export async function preflightAtomicEdits(
  targets: readonly EditTarget[],
  context: ToolExecutionContext,
): Promise<PreflightOutcome> {
  const fileSystemPort = context.fileSystemPort;
  if (!fileSystemPort) {
    throw new Error("FileSystemPort is not configured for AtomicEdit tool");
  }

  const failures: AtomicEditFailure[] = [];
  const plans: PreflightFilePlan[] = [];

  for (const group of groupTargetsByFile(targets)) {
    const plan = await preflightFile(group.filePath, group.targets, context, failures);
    if (plan) plans.push(plan);
  }

  return { ok: failures.length === 0, plans, failures };
}

async function preflightFile(
  filePath: string,
  targets: readonly EditTarget[],
  context: ToolExecutionContext,
  failures: AtomicEditFailure[],
): Promise<PreflightFilePlan | undefined> {
  const fileSystemPort = context.fileSystemPort!;
  const firstIndex = targets[0]!.index;

  let read: FileSystemReadTextResult;
  try {
    read = await fileSystemPort.readTextFile(
      { path: filePath, trace: createEditTrace(context) },
      { signal: context.abortSignal },
    );
  } catch (error) {
    if (isFileSystemPortError(error) && error.code === "not_found") {
      failures.push({
        index: firstIndex,
        filePath,
        errorCode: EditErrorCode.FILE_NOT_EXIST,
        message: `File does not exist. Note: your current working directory is ${context.workingDirectory}.`,
      });
      return undefined;
    }
    throw error;
  }

  const readStateFailure = getEditableReadStateFailure(filePath, read, context.readFileState);
  if (readStateFailure) {
    failures.push({
      index: firstIndex,
      filePath,
      errorCode: readStateFailure.errorCode,
      message: readStateFailure.message,
    });
    return undefined;
  }

  let content = normalizeLineEndings(read.content);
  for (const target of targets) {
    const applied = applyOneEdit(content, target);
    if ("errorCode" in applied) {
      failures.push({ index: target.index, filePath, ...applied });
      return undefined;
    }
    content = applied.content;
  }

  return {
    filePath,
    originalContent: normalizeLineEndings(read.content),
    expectedContent: content,
    editIndexes: targets.map((target) => target.index),
    encoding: read.encoding,
    lineEndings: read.lineEndings ?? detectLineEndings(read.content),
    revision: read.revision,
  };
}

function applyOneEdit(
  content: string,
  target: EditTarget,
): { content: string } | { errorCode: number; message: string } {
  const oldString = normalizeLineEndings(target.oldString);
  const requestedNew = normalizeLineEndings(target.newString);

  if (oldString === requestedNew) {
    return {
      errorCode: EditErrorCode.NO_CHANGE,
      message: "No changes to make: old_string and new_string are exactly the same.",
    };
  }
  if (oldString === "") {
    return {
      errorCode: EditErrorCode.FILE_EXISTS_NO_OLD_STRING,
      message:
        "AtomicEdit cannot create a file with an empty old_string. Use Write or Edit to create new files.",
    };
  }

  const match = findEditMatch({ content, search: oldString, replaceAll: target.replaceAll });
  if (match.status === "not_found") {
    return {
      errorCode: EditErrorCode.OLD_STRING_NOT_FOUND,
      message: `String to replace not found in file.\nString: ${target.oldString}`,
    };
  }
  if (match.status === "ambiguous") {
    return { errorCode: EditErrorCode.AMBIGUOUS_REPLACE, message: ambiguousMessage(match.candidateCount) };
  }

  const actualOldString = match.actualString;
  const matchCount = countOccurrences(content, actualOldString);
  if (!target.replaceAll && matchCount > 1) {
    return { errorCode: EditErrorCode.AMBIGUOUS_REPLACE, message: ambiguousMessage(matchCount) };
  }

  const normalizedNew = normalizeReplacementForMatch(match.strategy, requestedNew);
  const actualNewString = preserveQuoteStyle(oldString, actualOldString, normalizedNew);
  return { content: applyEditToContent(content, actualOldString, actualNewString, target.replaceAll) };
}

function ambiguousMessage(matchCount: number): string {
  return `Found ${matchCount} matches of the string to replace, but replace_all is false. Set replace_all to true to replace all, or provide more context to uniquely identify one occurrence.`;
}

/** 把文件恢复成预检时读到的原始内容（回滚用），并同步 read-state。 */
export async function restoreFile(
  plan: PreflightFilePlan,
  context: ToolExecutionContext,
): Promise<void> {
  const fileSystemPort = context.fileSystemPort;
  if (!fileSystemPort) return;
  const result = await fileSystemPort.writeTextFile(
    {
      path: plan.filePath,
      content: plan.originalContent,
      encoding: plan.encoding,
      lineEndings: plan.lineEndings,
      createParents: true,
      atomic: true,
      trace: createEditTrace(context),
    },
    { signal: context.abortSignal },
  );
  const readFileState = context.readFileState;
  if (!readFileState) return;
  // 回滚也是一次真实写入：把 read-state 指回原始内容，避免后续 Edit 因读到
  // 被回滚前的内容而误报 stale。
  readFileState.set(createReadFileStateKey(plan.filePath, 1, undefined), {
    path: plan.filePath,
    content: plan.originalContent,
    offset: undefined,
    limit: undefined,
    isPartialView: false,
    readAt: new Date(),
    sourceTool: "Edit",
    revisionId: result.revision?.id,
    mtimeMs: normalizeReadFileStateMtimeMs(result.revision?.mtimeMs),
    sizeBytes: result.revision?.sizeBytes ?? Buffer.byteLength(plan.originalContent, "utf8"),
  } satisfies ReadFileStateEntry);
}

/** 回读文件并与预检期望内容比对（编辑后校验）。 */
export async function readBackMatches(
  plan: PreflightFilePlan,
  context: ToolExecutionContext,
): Promise<boolean> {
  const fileSystemPort = context.fileSystemPort;
  if (!fileSystemPort) return true;
  const read = await fileSystemPort.readTextFile(
    { path: plan.filePath, trace: createEditTrace(context) },
    { signal: context.abortSignal },
  );
  return normalizeLineEndings(read.content) === plan.expectedContent;
}

function getEditableReadStateFailure(
  filePath: string,
  currentRead: FileSystemReadTextResult,
  readFileState: ToolExecutionContext["readFileState"],
): ToolHandlerFailure | undefined {
  if (!readFileState) return undefined;

  const lastRead = findEditableReadFileState(readFileState, filePath);
  if (!lastRead || lastRead.isPartialView) {
    return {
      result: false,
      errorCode: EditErrorCode.FILE_NOT_READ,
      message: "File has not been read yet. Read it first before writing to it.",
    };
  }
  if (!hasReadStateChanged(lastRead, currentRead)) return undefined;
  if (isStrictFullRead(lastRead) && lastRead.content === currentRead.content) return undefined;

  return {
    result: false,
    errorCode: EditErrorCode.STALE_FILE,
    message:
      "File has been modified since read, either by the user or by a linter. Read it again before attempting to write it.",
  };
}

function isStrictFullRead(entry: ReadFileStateEntry): boolean {
  if (entry.isPartialView) return false;
  return (entry.offset ?? 1) <= 1 && entry.limit === undefined;
}

function hasReadStateChanged(
  lastRead: ReadFileStateEntry,
  currentRead: FileSystemReadTextResult,
): boolean {
  const currentMtimeMs = currentRead.revision?.mtimeMs;
  if (lastRead.mtimeMs !== undefined && currentMtimeMs !== undefined) {
    const normalizedCurrentMtimeMs = normalizeReadFileStateMtimeMs(currentMtimeMs);
    const normalizedLastReadMtimeMs = normalizeReadFileStateMtimeMs(lastRead.mtimeMs);
    const mtimeAdvanced =
      normalizedCurrentMtimeMs !== undefined &&
      normalizedLastReadMtimeMs !== undefined &&
      normalizedCurrentMtimeMs > normalizedLastReadMtimeMs;
    return mtimeAdvanced || lastRead.sizeBytes !== currentRead.sizeBytes;
  }
  if (lastRead.sizeBytes !== undefined && lastRead.sizeBytes !== currentRead.sizeBytes) return true;
  const currentRevisionId = currentRead.revision?.id;
  return Boolean(
    lastRead.revisionId && currentRevisionId && lastRead.revisionId !== currentRevisionId,
  );
}

function countOccurrences(content: string, needle: string): number {
  let count = 0;
  let position = 0;
  while (position < content.length) {
    const index = content.indexOf(needle, position);
    if (index === -1) break;
    count += 1;
    position = index + needle.length;
  }
  return count;
}

function applyEditToContent(
  content: string,
  oldString: string,
  newString: string,
  replaceAll: boolean,
): string {
  if (newString !== "") {
    return replaceLiteral(content, oldString, newString, replaceAll);
  }
  const search =
    !oldString.endsWith("\n") && content.includes(`${oldString}\n`) ? `${oldString}\n` : oldString;
  return replaceLiteral(content, search, newString, replaceAll);
}

function replaceLiteral(
  content: string,
  search: string,
  replacement: string,
  replaceAll: boolean,
): string {
  // String.replace 的字符串 replacement 会把 $$/$& 当特殊 token；用函数形式规避。
  return replaceAll
    ? content.replaceAll(search, () => replacement)
    : content.replace(search, () => replacement);
}

function detectLineEndings(content: string): FileSystemLineEndings {
  let crlfCount = 0;
  let lfCount = 0;
  for (let index = 0; index < content.length; index += 1) {
    if (content[index] !== "\n") continue;
    if (index > 0 && content[index - 1] === "\r") {
      crlfCount += 1;
    } else {
      lfCount += 1;
    }
  }
  return crlfCount > lfCount ? "CRLF" : "LF";
}
