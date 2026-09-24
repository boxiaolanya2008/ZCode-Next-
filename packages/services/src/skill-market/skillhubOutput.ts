import type { SkillMarketListing } from "@zcode/shared";

/**
 * `skillhub search` 输出解析。
 *
 * CLI 未在官方文档中约定结构化输出格式，这里优先解析 JSON（数组 / 含 skills|results|data|items 的对象 /
 * 以名称为键的对象），失败时回退到按行解析常见分隔符。解析只做尽力而为，
 * 不做网络或文件 I/O。
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return undefined;
}

function normalizeListing(raw: unknown, fallbackName?: string): SkillMarketListing | null {
  if (typeof raw === "string") {
    const name = raw.trim();
    return name ? { name, installed: false } : null;
  }
  if (!isRecord(raw)) {
    return null;
  }
  const name =
    readString(raw, ["name", "slug", "id", "skill", "skillName", "package"]) ?? fallbackName;
  if (!name) {
    return null;
  }
  const description = readString(raw, ["description", "desc", "summary", "intro", "about"]);
  const source = readString(raw, ["source", "author", "repo", "repository", "owner", "publisher"]);
  const version = readString(raw, ["version", "latestVersion", "latest", "ver"]);
  return {
    name,
    installed: false,
    ...(description ? { description } : {}),
    ...(source ? { source } : {}),
    ...(version ? { version } : {}),
  };
}

function extractJsonArray(parsed: unknown): unknown[] | null {
  if (Array.isArray(parsed)) {
    return parsed;
  }
  if (!isRecord(parsed)) {
    return null;
  }
  for (const key of ["skills", "results", "data", "items", "list"]) {
    const value = parsed[key];
    if (Array.isArray(value)) {
      return value;
    }
    if (isRecord(value)) {
      return Object.values(value);
    }
  }
  // 以名称为键的对象：{ "abc": { version, description } }
  const values = Object.values(parsed);
  if (values.length > 0 && values.every((value) => isRecord(value) || typeof value === "string")) {
    return Object.entries(parsed).map(([key, value]) =>
      isRecord(value) ? { name: key, ...value } : { name: key, description: value },
    );
  }
  return null;
}

function parseJsonOutput(stdout: string): SkillMarketListing[] | null {
  const trimmed = stdout.trim();
  if (!trimmed.startsWith("[") && !trimmed.startsWith("{")) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  const array = extractJsonArray(parsed);
  if (!array) {
    return null;
  }
  const listings: SkillMarketListing[] = [];
  for (const entry of array) {
    const listing = normalizeListing(entry);
    if (listing) {
      listings.push(listing);
    }
  }
  return listings;
}

const LINE_HEADER_PATTERNS = [
  /^[-=*_\s]+$/u,
  /^(name|skill|package|result|search|no\s+result|found)\b/iu,
];

function parseLineOutput(stdout: string): SkillMarketListing[] {
  const listings: SkillMarketListing[] = [];
  const seen = new Set<string>();
  for (const rawLine of stdout.split(/\r?\n/u)) {
    const line = rawLine.replace(/\u001b\[[0-9;]*m/gu, "").trim();
    if (!line || LINE_HEADER_PATTERNS.some((pattern) => pattern.test(line))) {
      continue;
    }
    const listing = parseLine(line);
    if (listing && !seen.has(listing.name)) {
      seen.add(listing.name);
      listings.push(listing);
    }
  }
  return listings;
}

function parseLine(line: string): SkillMarketListing | null {
  const tabParts = line.split("\t").map((part) => part.trim());
  if (tabParts.length >= 2 && tabParts[0]) {
    return {
      name: tabParts[0],
      installed: false,
      ...(tabParts[1] ? { description: tabParts[1] } : {}),
      ...(tabParts[2] ? { source: tabParts[2] } : {}),
      ...(tabParts[3] ? { version: tabParts[3] } : {}),
    };
  }
  // `name - description` / `name – description`
  const dashMatch = /^([^\s-][^–—-]*?)\s+[–—-]\s+(.+)$/u.exec(line);
  if (dashMatch?.[1]) {
    return { name: dashMatch[1].trim(), description: dashMatch[2]?.trim(), installed: false };
  }
  // `name@version  description`
  const atMatch = /^([A-Za-z0-9][\w@./-]*?)@([\w.+-]+)(?:\s{2,}(.+))?$/u.exec(line);
  if (atMatch?.[1]) {
    return {
      name: atMatch[1],
      installed: false,
      version: atMatch[2],
      ...(atMatch[3] ? { description: atMatch[3].trim() } : {}),
    };
  }
  // 纯名称，或 `name   description`
  const spaced = /^(\S+)\s{2,}(.+)$/u.exec(line);
  if (spaced?.[1]) {
    return { name: spaced[1], description: spaced[2]?.trim(), installed: false };
  }
  const name = line.split(/\s/u)[0];
  return name ? { name, installed: false } : null;
}

export function parseSkillhubSearchOutput(stdout: string): SkillMarketListing[] {
  const json = parseJsonOutput(stdout);
  if (json && json.length > 0) {
    return json;
  }
  return parseLineOutput(stdout);
}

/** 从 `skillhub --version` 输出中提取版本号。 */
export function parseSkillhubVersion(stdout: string): string | undefined {
  const match = /(\d+\.\d+\.\d+(?:[-+][\w.]+)?)/u.exec(stdout);
  return match?.[1];
}
