import type { ModelMessageContent, ModelMessageContentBlock } from "@zcode/contracts";
import {
  cloneRuntimeMessageEntry,
  isRuntimeAttachmentEntry,
  type ModelInputMessage,
  type RuntimeMessageEntry,
} from "../../agent/message-history.js";

export interface ProviderContextSanitizationResult {
  entries: RuntimeMessageEntry[];
  removedFailedToolCallCount: number;
  removedFailedToolResultCount: number;
  removedReasoningBlockCount: number;
}

export function sanitizeProviderContextEntries(
  entries: readonly RuntimeMessageEntry[],
): ProviderContextSanitizationResult {
  const failedToolCallIds = new Set(
    entries.flatMap((entry) => {
      if (isRuntimeAttachmentEntry(entry) || entry.message.role !== "tool") return [];
      return entry.message.isError === true && entry.message.toolCallId
        ? [entry.message.toolCallId]
        : [];
    }),
  );
  const sanitizedEntries: RuntimeMessageEntry[] = [];
  let removedFailedToolCallCount = 0;
  let removedFailedToolResultCount = 0;
  let removedReasoningBlockCount = 0;

  for (const entry of entries) {
    if (isRuntimeAttachmentEntry(entry)) {
      sanitizedEntries.push(cloneRuntimeMessageEntry(entry));
      continue;
    }

    if (entry.message.role === "tool" && entry.message.isError === true) {
      removedFailedToolResultCount += 1;
      continue;
    }

    const sanitizedMessage = sanitizeMessage(entry.message, failedToolCallIds, {
      onRemovedToolCall: () => {
        removedFailedToolCallCount += 1;
      },
      onRemovedReasoningBlock: () => {
        removedReasoningBlockCount += 1;
      },
    });
    if (!sanitizedMessage) continue;
    sanitizedEntries.push({
      ...entry,
      message: sanitizedMessage,
    });
  }

  return {
    entries: sanitizedEntries,
    removedFailedToolCallCount,
    removedFailedToolResultCount,
    removedReasoningBlockCount,
  };
}

function sanitizeMessage(
  message: ModelInputMessage,
  failedToolCallIds: ReadonlySet<string>,
  counters: {
    onRemovedToolCall: () => void;
    onRemovedReasoningBlock: () => void;
  },
): ModelInputMessage | undefined {
  const content =
    typeof message.content === "string"
      ? message.content
      : stripReasoningBlocks(message.content, counters.onRemovedReasoningBlock);
  const normalizedContent = Array.isArray(content) && content.length === 0 ? "" : content;
  const toolCalls = message.toolCalls?.filter((toolCall) => {
    if (!failedToolCallIds.has(toolCall.id)) return true;
    counters.onRemovedToolCall();
    return false;
  });
  const hasContent =
    typeof normalizedContent === "string"
      ? normalizedContent.length > 0
      : normalizedContent.length > 0;
  const hasToolCalls = toolCalls !== undefined && toolCalls.length > 0;
  if (message.role === "assistant" && !hasContent && !hasToolCalls) return undefined;
  return {
    ...message,
    content: normalizedContent,
    ...(toolCalls ? { toolCalls } : {}),
  };
}

function stripReasoningBlocks(
  content: ModelMessageContent,
  onRemoved: () => void,
): ModelMessageContent {
  if (typeof content === "string") return content;
  const blocks: ModelMessageContentBlock[] = content.filter((block) => {
    if (block.type !== "reasoning") return true;
    onRemoved();
    return false;
  });
  return blocks;
}
