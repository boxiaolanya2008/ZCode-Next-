import { readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type {
  SkillMarketCliStatus,
  SkillMarketDetail,
  SkillMarketInstallResult,
  SkillMarketInstallScope,
  SkillMarketInstalledSkill,
  SkillMarketListing,
  SkillMarketSearchResult,
} from "@zcode/shared";
import {
  SKILL_MARKET_CLI_MISSING_ERROR_CODE,
  SKILL_MARKET_COMMAND_FAILED_ERROR_CODE,
  SKILL_MARKET_UPDATE_CONFLICT_ERROR_CODE,
} from "@zcode/shared";
import { createServiceLogger } from "../logger/serviceLogger.js";
import { SKILL_FILE_NAME, walkSkillMarkdownPaths } from "../skills/skillDiscoveryWalk.js";
import { getUserZcodeSkillRoot, getWorkspaceZcodeSkillRoot } from "../skills/skillsService.js";
import type { ISkillMarketService } from "./skillMarket.js";
import { resolveSkillhubExecutable, runSkillhub } from "./skillhubCli.js";
import { parseSkillhubSearchOutput, parseSkillhubVersion } from "./skillhubOutput.js";
import {
  getSkillMarketRegistryEntry,
  hasTrackedFileChanges,
  hashSkillDirectory,
  upsertSkillMarketRegistryEntry,
} from "./skillMarketStore.js";

const logger = createServiceLogger("skill-market");

/** 官方安装文档给出的安装命令，CLI 缺失时展示给用户。 */
const SKILLHUB_INSTALL_GUIDE =
  "curl -fsSL https://skillhub-1388575217.cos.ap-guangzhou.myqcloud.com/install/install.sh | bash";

export class SkillMarketError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "SkillMarketError";
    this.code = code;
  }
}

function resolveInstallRoot(params: {
  scope?: SkillMarketInstallScope;
  workspacePath?: string;
}): string {
  if (params.scope === "workspace") {
    if (!params.workspacePath) {
      throw new SkillMarketError(
        SKILL_MARKET_COMMAND_FAILED_ERROR_CODE,
        "安装到工作区目录需要 workspacePath",
      );
    }
    return getWorkspaceZcodeSkillRoot(params.workspacePath);
  }
  return getUserZcodeSkillRoot();
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

/** 读取 SKILL.md frontmatter 的 name（仅用于定位安装结果，缺失时回退目录名）。 */
async function readSkillFrontmatterName(skillPath: string): Promise<string> {
  const fallback = basename(dirname(skillPath));
  try {
    const content = (await readFile(skillPath, "utf-8")).replace(/\r\n|\r/gu, "\n");
    const match = /^---\n([\s\S]*?)\n---(?:\n|$)/u.exec(content);
    if (!match) {
      return fallback;
    }
    const nameMatch = /^name:\s*(.+)$/mu.exec(match[1] ?? "");
    const raw = nameMatch?.[1]?.trim().replace(/^["']|["']$/gu, "");
    return raw || fallback;
  } catch {
    return fallback;
  }
}

async function readInstalledVersion(skillDir: string): Promise<string | undefined> {
  try {
    const raw = await readFile(join(skillDir, "_meta.json"), "utf-8");
    const parsed = JSON.parse(raw) as { version?: unknown };
    return typeof parsed.version === "string" && parsed.version.trim().length > 0
      ? parsed.version.trim()
      : undefined;
  } catch {
    return undefined;
  }
}

/** 在 skills 根目录中定位名称匹配的 skill，返回 SKILL.md 路径。 */
async function findInstalledSkillPath(root: string, name: string): Promise<string | null> {
  const target = normalizeName(name);
  let fallback: string | null = null;
  for await (const skillPath of walkSkillMarkdownPaths(root, { onError: () => {} })) {
    const dirName = normalizeName(basename(dirname(skillPath)));
    if (dirName === target) {
      return skillPath;
    }
    if (!fallback && normalizeName(await readSkillFrontmatterName(skillPath)) === target) {
      fallback = skillPath;
    }
  }
  return fallback;
}

async function collectInstalledSkills(root: string): Promise<SkillMarketInstalledSkill[]> {
  const results: SkillMarketInstalledSkill[] = [];
  for await (const skillPath of walkSkillMarkdownPaths(root, { onError: () => {} })) {
    const skillDir = dirname(skillPath);
    const name = await readSkillFrontmatterName(skillPath);
    const registryEntry = await getSkillMarketRegistryEntry(root, name);
    const version = registryEntry?.version ?? (await readInstalledVersion(skillDir));
    const hasLocalChanges = registryEntry
      ? hasTrackedFileChanges(registryEntry.files, await hashSkillDirectory(skillDir))
      : undefined;
    results.push({
      name,
      path: skillPath,
      ...(version ? { version } : {}),
      ...(hasLocalChanges !== undefined ? { hasLocalChanges } : {}),
    });
  }
  return results;
}

function buildInstalledIndex(
  installed: SkillMarketInstalledSkill[],
): Map<string, SkillMarketInstalledSkill> {
  const index = new Map<string, SkillMarketInstalledSkill>();
  for (const skill of installed) {
    index.set(normalizeName(skill.name), skill);
  }
  return index;
}

export function createSkillMarketService(): ISkillMarketService {
  async function getCliStatus(): Promise<SkillMarketCliStatus> {
    const executable = resolveSkillhubExecutable();
    if (!executable) {
      return { available: false, installGuide: SKILLHUB_INSTALL_GUIDE };
    }
    const result = await runSkillhub({ args: ["--version"], timeoutMs: 10_000 });
    const version = parseSkillhubVersion(`${result.stdout}\n${result.stderr}`);
    return { available: true, ...(version ? { version } : {}) };
  }

  async function requireCli(): Promise<void> {
    if (!resolveSkillhubExecutable()) {
      throw new SkillMarketError(
        SKILL_MARKET_CLI_MISSING_ERROR_CODE,
        `未检测到 skillhub CLI，请先安装：${SKILLHUB_INSTALL_GUIDE}`,
      );
    }
  }

  async function runSearch(keyword: string): Promise<SkillMarketListing[]> {
    const result = await runSkillhub({ args: ["search", keyword] });
    if (result.exitCode !== 0) {
      throw new SkillMarketError(
        SKILL_MARKET_COMMAND_FAILED_ERROR_CODE,
        result.timedOut
          ? "skillhub search 超时"
          : `skillhub search 失败（退出码 ${String(result.exitCode)}）：${result.stderr.trim()}`,
      );
    }
    return parseSkillhubSearchOutput(result.stdout);
  }

  async function markInstalled(
    listings: SkillMarketListing[],
    workspacePath?: string,
  ): Promise<SkillMarketListing[]> {
    const installed = buildInstalledIndex([
      ...(await collectInstalledSkills(getUserZcodeSkillRoot())),
      ...(workspacePath ? await collectInstalledSkills(getWorkspaceZcodeSkillRoot(workspacePath)) : []),
    ]);
    return listings.map((listing) => {
      const match = installed.get(normalizeName(listing.name));
      if (!match) {
        return listing;
      }
      return {
        ...listing,
        installed: true,
        ...(match.version ? { installedVersion: match.version } : {}),
        ...(match.hasLocalChanges !== undefined ? { hasLocalChanges: match.hasLocalChanges } : {}),
      };
    });
  }

  async function installSkill(params: {
    name: string;
    mode: "install" | "update";
    scope?: SkillMarketInstallScope;
    workspacePath?: string;
  }): Promise<SkillMarketInstallResult> {
    await requireCli();
    const name = params.name.trim();
    if (!name) {
      throw new SkillMarketError(SKILL_MARKET_COMMAND_FAILED_ERROR_CODE, "skill 名称不能为空");
    }
    const root = resolveInstallRoot(params);
    const existingEntry = await getSkillMarketRegistryEntry(root, name);
    const existingPath = await findInstalledSkillPath(root, name);
    const wasInstalled = Boolean(existingEntry || existingPath);

    if (params.mode === "update") {
      if (!wasInstalled || !existingPath) {
        throw new SkillMarketError(
          SKILL_MARKET_COMMAND_FAILED_ERROR_CODE,
          `skill 尚未安装，无法更新：${name}`,
        );
      }
      if (existingEntry) {
        const current = await hashSkillDirectory(dirname(existingPath));
        if (hasTrackedFileChanges(existingEntry.files, current)) {
          throw new SkillMarketError(
            SKILL_MARKET_UPDATE_CONFLICT_ERROR_CODE,
            // 错误经 RPC 传输后自定义 code 字段可能丢失，消息里附带稳定标记供 UI 识别。
            `检测到本地改动，已跳过覆盖：${name} [${SKILL_MARKET_UPDATE_CONFLICT_ERROR_CODE}]`,
          );
        }
      }
    }

    const result = await runSkillhub({ args: ["install", name, "--dir", root] });
    if (result.exitCode !== 0) {
      throw new SkillMarketError(
        SKILL_MARKET_COMMAND_FAILED_ERROR_CODE,
        result.timedOut
          ? "skillhub install 超时"
          : `skillhub install 失败（退出码 ${String(result.exitCode)}）：${result.stderr.trim()}`,
      );
    }

    const installedPath = await findInstalledSkillPath(root, name);
    if (!installedPath) {
      throw new SkillMarketError(
        SKILL_MARKET_COMMAND_FAILED_ERROR_CODE,
        `skillhub install 完成但未在 skills 目录找到该 skill：${name}`,
      );
    }
    const skillDir = dirname(installedPath);
    const version =
      (await getSkillMarketRegistryEntry(root, name))?.version ??
      (await readInstalledVersion(skillDir));
    const files = await hashSkillDirectory(skillDir);
    await upsertSkillMarketRegistryEntry({
      name,
      root,
      path: installedPath,
      ...(version ? { version } : {}),
      installedAt: Date.now(),
      files,
    });
    logger.info(undefined, params.mode === "update" ? "skill 已更新" : "skill 已安装", {
      name,
      root,
    });
    return {
      name,
      path: installedPath,
      ...(version ? { version } : {}),
      updated: wasInstalled,
    };
  }

  return {
    getCliStatus,

    async search(params: { keyword: string }): Promise<SkillMarketSearchResult> {
      const keyword = params.keyword.trim();
      const cli = await getCliStatus();
      if (!cli.available) {
        return { keyword, skills: [], cli };
      }
      const skills = await markInstalled(await runSearch(keyword));
      return { keyword, skills, cli };
    },

    async getDetail(params: { name: string }): Promise<SkillMarketDetail> {
      await requireCli();
      const name = params.name.trim();
      const listings = await runSearch(name);
      const exact =
        listings.find((item) => normalizeName(item.name) === normalizeName(name)) ?? listings[0];
      if (!exact) {
        throw new SkillMarketError(
          SKILL_MARKET_COMMAND_FAILED_ERROR_CODE,
          `未找到 skill：${name}`,
        );
      }
      const [marked] = await markInstalled([exact]);
      return { ...(marked ?? exact), raw: JSON.stringify(exact) };
    },

    async listInstalled(params?: {
      workspacePath?: string;
      workspaceIdentity?: string;
    }): Promise<SkillMarketInstalledSkill[]> {
      const skills = [
        ...(await collectInstalledSkills(getUserZcodeSkillRoot())),
        ...(params?.workspacePath
          ? await collectInstalledSkills(getWorkspaceZcodeSkillRoot(params.workspacePath))
          : []),
      ];
      return skills.sort((left, right) => left.name.localeCompare(right.name));
    },

    async install(params: {
      name: string;
      scope?: SkillMarketInstallScope;
      workspacePath?: string;
      workspaceIdentity?: string;
    }): Promise<SkillMarketInstallResult> {
      return await installSkill({ ...params, mode: "install" });
    },

    async update(params: {
      name: string;
      scope?: SkillMarketInstallScope;
      workspacePath?: string;
      workspaceIdentity?: string;
    }): Promise<SkillMarketInstallResult> {
      return await installSkill({ ...params, mode: "update" });
    },
  };
}
