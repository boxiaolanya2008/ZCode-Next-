import assert from "node:assert/strict";
import test from "node:test";

import { buildModelStyleMemorySection } from "../src/context/sections/model-style-memory.js";
import {
  MODEL_STYLE_MEMORY_MAX_CHARS,
  formatModelStyleMemoryContent,
  resolveModelStyleMemoryPath,
} from "../src/memory/model-style.js";

test("resolves distinct model style files under the same memory root", () => {
  const memoryRoot = "C:\\workspace\\memory";
  const first = resolveModelStyleMemoryPath({
    memoryRoot,
    modelId: "model/x",
    providerId: "provider/a",
  });
  const second = resolveModelStyleMemoryPath({
    memoryRoot,
    modelId: "model-x",
    providerId: "provider/a",
  });

  assert.notEqual(first, second);
  assert.match(first, /model-styles[\\/]provider-a--model-x-[a-f0-9]{16}\.md$/u);
  assert.match(second, /model-styles[\\/]provider-a--model-x-[a-f0-9]{16}\.md$/u);
});

test("formats style memory by removing frontmatter and enforcing a bound", () => {
  const content = `---\nname: style\n---\n${"x".repeat(MODEL_STYLE_MEMORY_MAX_CHARS + 100)}`;
  const formatted = formatModelStyleMemoryContent(content);

  assert.ok(formatted);
  assert.equal(formatted.length, MODEL_STYLE_MEMORY_MAX_CHARS);
  assert.equal(formatted.startsWith("x"), true);
});

test("builds a model-specific context section without exposing its path", () => {
  const section = buildModelStyleMemorySection({
    content: "Prefer small pure functions.",
  });

  assert.ok(section);
  assert.equal(section.source, "model_style_memory");
  assert.equal(section.injectionTarget, "meta_user");
  assert.equal(section.content.includes("Model-specific coding habits"), true);
  assert.equal(section.content.includes("model-styles"), false);
});
