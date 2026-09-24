import type {
  SkillMarketCliStatus,
  SkillMarketDetail,
  SkillMarketInstallResult,
  SkillMarketInstallScope,
  SkillMarketInstalledSkill,
  SkillMarketSearchResult,
} from "@zcode/shared";
import { ServiceChannels } from "@zcode/shared";
import { createServiceDescriptor } from "../descriptors.js";

/**
 * Skills 市场（SkillHub 接入）服务。
 *
 * 状态所有者：zcode skills 目录（磁盘事实）。UI 只持有查询/安装进度等临时态。
 * 实现收敛 `skillhub` CLI 调用与 skills 目录读写，Node 实现在 `@zcode/services/node`。
 */
export interface ISkillMarketService {
  /** 探测 `skillhub` CLI 是否可用；缺失时返回安装引导。 */
  getCliStatus(): Promise<SkillMarketCliStatus>;
  /** 关键词搜索（`skillhub search <kw>`）。 */
  search(params: { keyword: string }): Promise<SkillMarketSearchResult>;
  /** 详情（精确搜索 + 本地安装态）。 */
  getDetail(params: { name: string }): Promise<SkillMarketDetail>;
  /** 查询已安装到 zcode skills 目录的 skill。 */
  listInstalled(params?: {
    workspacePath?: string;
    workspaceIdentity?: string;
  }): Promise<SkillMarketInstalledSkill[]>;
  /** 安装到 zcode skills 目录（`skillhub install <name> --dir <dir>`）。 */
  install(params: {
    name: string;
    scope?: SkillMarketInstallScope;
    workspacePath?: string;
    workspaceIdentity?: string;
  }): Promise<SkillMarketInstallResult>;
  /**
   * 增量更新已安装 skill。
   * 冲突策略：安装时记录被跟踪文件的哈希；更新前比对，若用户改动过被跟踪文件，
   * 返回 `skill_market_update_conflict`，不静默覆盖（见 docs/specs/skills-market.md）。
   */
  update(params: {
    name: string;
    scope?: SkillMarketInstallScope;
    workspacePath?: string;
    workspaceIdentity?: string;
  }): Promise<SkillMarketInstallResult>;
}

export const ISkillMarketService = createServiceDescriptor<ISkillMarketService>(
  ServiceChannels.SkillMarket,
);
