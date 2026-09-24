import assert from "node:assert/strict";
import test from "node:test";

import {
  createRuntimeAssistantEntry,
  createRuntimeToolResultEntry,
  createRuntimeUserEntry,
} from "../src/agent/message-history.js";
import { sanitizeProviderContextEntries } from "../src/runtime/helpers/provider-context-sanitization.js";

test("removes reasoning and failed tool history from the provider copy", () => {
  const originalEntries = [
    createRuntimeUserEntry("keep the request"),
    createRuntimeAssistantEntry(
      "successful answer",
      [{ id: "ok-call", name: "Read", input: { path: "README.md" } }],
      [{ type: "reasoning", text: "private reasoning" }],
    ),
    createRuntimeToolResultEntry("ok-call", "Read", "file content", false),
    createRuntimeAssistantEntry(
      "failed attempt",
      [{ id: "failed-call", name: "Bash", input: { command: "false" } }],
      [{ type: "reasoning", text: "more private reasoning" }],
    ),
    createRuntimeToolResultEntry("failed-call", "Bash", "command failed", true),
  ];

  const result = sanitizeProviderContextEntries(originalEntries);

  assert.equal(result.removedReasoningBlockCount, 2);
  assert.equal(result.removedFailedToolCallCount, 1);
  assert.equal(result.removedFailedToolResultCount, 1);
  assert.deepEqual(
    result.entries.map((entry) => ("message" in entry ? entry.message.role : "attachment")),
    ["user", "assistant", "tool", "assistant"],
  );
  const assistant = result.entries[1];
  assert.ok(assistant && "message" in assistant);
  assert.deepEqual(assistant.message.content, [{ type: "text", text: "successful answer" }]);
  const failedAssistant = result.entries[3];
  assert.ok(failedAssistant && "message" in failedAssistant);
  assert.deepEqual(failedAssistant.message.content, [{ type: "text", text: "failed attempt" }]);
  assert.deepEqual(failedAssistant.message.toolCalls, []);
  assert.equal(originalEntries[1]?.message.role, "assistant");
  assert.equal(originalEntries[4]?.message.isError, true);
});

test("keeps successful tool calls and pending tool results", () => {
  const result = sanitizeProviderContextEntries([
    createRuntimeAssistantEntry("working", [{ id: "call", name: "Read", input: {} }]),
    createRuntimeToolResultEntry("call", "Read", "content", false),
  ]);

  assert.equal(result.removedFailedToolCallCount, 0);
  assert.equal(result.removedFailedToolResultCount, 0);
  assert.equal(result.entries.length, 2);
});
