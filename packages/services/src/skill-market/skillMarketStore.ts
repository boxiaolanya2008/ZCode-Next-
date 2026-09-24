import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { getAppConfigDir } from "../paths.js";

/**
 * Skills 市场安装登记表。
 *
 * 只记录「由 SkillHub 安装/更新过」的 skill 及其被跟踪文件哈希，用于增量更新时的
 * 本地改动检测。skills 本体仍存放在 zcode skills 目录，登记表只是元数据，不构成第二套 skills 存储。
 */

export interface SkillMarketRegistryEntry {
  name: string;
  /** 安装所在 skills 根目录绝对路径。 */
  root: string;
  /** SKILL.md 绝对路径。 */
  path: string;
  version?: string;
  source?: string;
  installedAt: number;
  /** 相对 skill 目录的文件路径 → sha256，安装时快照。 */
  files: Record<string, string>;
}

interface SkillMarketRegistry {
  version: 1;
  entries: Record<string, SkillMarketRegistryEntry>;
}

const EMPTY_REGISTRY: SkillMarketRegistry = { version: 1, entries: {} };

const HASH_EXCLUDED_DIRS = new Set(["node_modules", ".git", ".zcode"]);
const HASH_MAX_FILES = 512;

function registryFilePath(): string {
  return join(getAppConfigDir(), "skills-market", "installed.json");
}

function entryKey(root: string, name: string): string {
  return `${root.replaceAll("\\", "/").toLowerCase()}::${name.trim().toLowerCase()}`;
}

export async function readSkillMarketRegistry(): Promise<SkillMarketRegistry> {
  try {
    const raw = await readFile(registryFilePath(), "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      (parsed as { version?: unknown }).version === 1 &&
      typeof (parsed as { entries?: unknown }).entries === "object" &&
      (parsed as { entries?: unknown }).entries !== null
    ) {
      return parsed as SkillMarketRegistry;
    }
  } catch {
    // 登记表缺失或损坏时按空表处理：不阻断安装，只是无法做本地改动检测。
  }
  return { ...EMPTY_REGISTRY, entries: {} };
}

async function writeSkillMarketRegistry(registry: SkillMarketRegistry): Promise<void> {
  const path = registryFilePath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(registry, null, 2)}\n`, "utf-8");
}

export async function getSkillMarketRegistryEntry(
  root: string,
  name: string,
): Promise<SkillMarketRegistryEntry | undefined> {
  const registry = await readSkillMarketRegistry();
  return registry.entries[entryKey(root, name)];
}

export async function upsertSkillMarketRegistryEntry(
  entry: SkillMarketRegistryEntry,
): Promise<void> {
  const registry = await readSkillMarketRegistry();
  registry.entries[entryKey(entry.root, entry.name)] = entry;
  await writeSkillMarketRegistry(registry);
}

async function hashFile(path: string): Promise<string> {
  const content = await readFile(path);
  return createHash("sha256").update(content).digest("hex");
}

/**
 * 对 skill 目录内的文件做有界遍历并计算 sha256 清单。
 * 跳过 node_modules/.git 等目录，并对文件数量设上限，避免异常目录拖垮更新检查。
 */
export async function hashSkillDirectory(skillDir: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  const stack: Array<{ dir: string; depth: number }> = [{ dir: skillDir, depth: 0 }];
  while (stack.length > 0 && Object.keys(files).length < HASH_MAX_FILES) {
    const current = stack.pop();
    if (!current) {
      break;
    }
    let entries;
    try {
      entries = await readdir(current.dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (Object.keys(files).length >= HASH_MAX_FILES) {
        break;
      }
      const entryPath = join(current.dir, entry.name);
      if (entry.isDirectory()) {
        if (HASH_EXCLUDED_DIRS.has(entry.name)) {
          continue;
        }
        stack.push({ dir: entryPath, depth: current.depth + 1 });
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      try {
        const relPath = relative(skillDir, entryPath).split(sep).join("/");
        files[relPath] = await hashFile(entryPath);
      } catch {
        // 读取失败的文件不纳入清单，视为不可跟踪。
      }
    }
  }
  return files;
}

/** 比对安装时快照与当前磁盘清单，判断用户是否改动过被跟踪文件。 */
export function hasTrackedFileChanges(
  recorded: Record<string, string>,
  current: Record<string, string>,
): boolean {
  const recordedKeys = Object.keys(recorded);
  if (recordedKeys.length === 0) {
    return false;
  }
  for (const key of recordedKeys) {
    if (current[key] !== recorded[key]) {
      return true;
    }
  }
  return false;
}
