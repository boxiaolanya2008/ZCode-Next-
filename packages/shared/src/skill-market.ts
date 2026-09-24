/**
 * Skills 市场（SkillHub 接入）领域类型。
 *
 * 数据来源是 SkillHub 官方 CLI（`skillhub search/install`），不是直接抓取网页。
 * 这些类型只描述 UI 与服务之间的数据形状，browser-safe：不引入任何 Node 依赖。
 */

/** `skillhub` CLI 的可用性状态。缺失时必须携带安装引导，不能静默失败。 */
export interface SkillMarketCliStatus {
  available: boolean;
  /** 可读到的 CLI 版本。 */
  version?: string;
  /** CLI 缺失时给用户的安装命令（依据官方安装文档）。 */
  installGuide?: string;
}

/** 搜索结果中的单条 skill。 */
export interface SkillMarketListing {
  /** skillhub 中的唯一名称，也是 `skillhub install` 的参数。 */
  name: string;
  description?: string;
  /** 来源（作者/仓库/市场）。 */
  source?: string;
  /** 远端最新版本。 */
  version?: string;
  /** 是否已安装到本地 skills 目录。 */
  installed: boolean;
  /** 本地已安装版本（可读到时）。 */
  installedVersion?: string;
  /** 本地是否存在用户改动（与安装时记录的清单不一致）。 */
  hasLocalChanges?: boolean;
}

export interface SkillMarketSearchResult {
  keyword: string;
  skills: SkillMarketListing[];
  cli: SkillMarketCliStatus;
}

/** 详情：CLI 没有独立 info 命令，详情由精确搜索 + 本地安装态推导。 */
export interface SkillMarketDetail extends SkillMarketListing {
  /** CLI 未提供结构化字段时保留原始文本，供 UI 兜底展示。 */
  raw?: string;
}

export interface SkillMarketInstallResult {
  name: string;
  /** 安装后的 SKILL.md 绝对路径（供 `/` 命令发现）。 */
  path: string;
  version?: string;
  /** 本次是否为对已安装 skill 的更新。 */
  updated: boolean;
}

/** 已安装到 zcode skills 目录的 skill 概览。 */
export interface SkillMarketInstalledSkill {
  name: string;
  path: string;
  version?: string;
  hasLocalChanges?: boolean;
}

/** 安装范围：user = `~/.zcode/skills`；workspace = `<workspace>/.zcode/skills`。 */
export type SkillMarketInstallScope = "user" | "workspace";

/** 更新遇到本地改动时的错误码，UI 据此提示用户确认，而不是静默覆盖。 */
export const SKILL_MARKET_UPDATE_CONFLICT_ERROR_CODE = "skill_market_update_conflict";

/** CLI 缺失时的错误码。 */
export const SKILL_MARKET_CLI_MISSING_ERROR_CODE = "skill_market_cli_missing";

/** 执行 skillhub 命令失败时的错误码。 */
export const SKILL_MARKET_COMMAND_FAILED_ERROR_CODE = "skill_market_command_failed";
