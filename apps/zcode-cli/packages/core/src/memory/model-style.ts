import { createHash } from "node:crypto";
import { join } from "node:path";

export const MODEL_STYLE_MEMORY_MAX_BYTES = 64 * 1024;
export const MODEL_STYLE_MEMORY_MAX_CHARS = 20_000;

export function resolveModelStyleMemoryPath(input: {
  memoryRoot: string;
  modelId: string;
  providerId: string;
}): string {
  const identity = `${input.providerId}\u0000${input.modelId}`;
  const hash = createHash("sha256").update(identity).digest("hex").slice(0, 16);
  const providerSlug = sanitizeModelStyleSegment(input.providerId, "provider");
  const modelSlug = sanitizeModelStyleSegment(input.modelId, "model");
  return join(input.memoryRoot, "model-styles", `${providerSlug}--${modelSlug}-${hash}.md`);
}

export function formatModelStyleMemoryContent(content: string): string | undefined {
  const withoutFrontmatter = content
    .replace(/^\uFEFF?---(?:\r\n|\n)[\s\S]*?(?:\r\n|\n)---(?:\r\n|\n|$)/u, "")
    .trim();
  if (!withoutFrontmatter) return undefined;
  return withoutFrontmatter.slice(0, MODEL_STYLE_MEMORY_MAX_CHARS);
}

function sanitizeModelStyleSegment(value: string, fallback: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 48);
  return slug.length > 0 ? slug : fallback;
}
