// Composer 工作模式（mode list）选择：per-scope 单一所有者。
//
// 语义：模式选择是**会话级状态**，与 composer 的 mode/model 一样按 scope（sessionId，
// 草稿态 = "__draft__"）隔离；随会话持久化与恢复（localStorage），切换后自下一轮生效。
// 本 store 只拥有 workMode 一个字段，不复制 mode/model/text（那些仍归 composer draft）。
import { create } from "zustand";
import { DEFAULT_AGENT_WORK_MODE, isAgentWorkModeId, type AgentWorkModeId } from "@zcode/shared";
import { readSafeLocalStorage, writeSafeLocalStorage } from "@/lib/browserEnvironment.js";
import { logger } from "@/logger.js";

const STORAGE_KEY = "zcode-v4-composer-work-mode:v1";

type WorkModeByScope = Record<string, AgentWorkModeId>;

function loadWorkModeByScope(): WorkModeByScope {
  const raw = readSafeLocalStorage(STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    const result: WorkModeByScope = {};
    for (const [scopeKey, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (isAgentWorkModeId(value)) {
        result[scopeKey] = value;
      }
    }
    return result;
  } catch (error) {
    logger.warn("[v4-composer-work-mode] 读取失败，回退默认模式", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {};
  }
}

interface ComposerWorkModeStoreState {
  byScope: WorkModeByScope;
  setWorkMode: (scopeKey: string, workMode: AgentWorkModeId) => void;
  /** 新任务草稿被接纳后，把 workMode 从草稿 scope 转移到真实 session scope。 */
  promoteScope: (fromScopeKey: string, toScopeKey: string) => void;
}

export const useComposerWorkModeStore = create<ComposerWorkModeStoreState>()((set, get) => ({
  byScope: loadWorkModeByScope(),
  setWorkMode: (scopeKey, workMode) => {
    if (get().byScope[scopeKey] === workMode) return;
    set((state) => {
      const next = { ...state.byScope, [scopeKey]: workMode };
      writeSafeLocalStorage(STORAGE_KEY, JSON.stringify(next));
      return { byScope: next };
    });
  },
  promoteScope: (fromScopeKey, toScopeKey) => {
    const from = get().byScope[fromScopeKey];
    if (!from || fromScopeKey === toScopeKey) return;
    set((state) => {
      const next = { ...state.byScope, [toScopeKey]: from };
      delete next[fromScopeKey];
      writeSafeLocalStorage(STORAGE_KEY, JSON.stringify(next));
      return { byScope: next };
    });
  },
}));

/** 读取某 scope 的 workMode；未选择即默认（编码）模式。 */
export function resolveComposerWorkMode(scopeKey: string): AgentWorkModeId {
  return useComposerWorkModeStore.getState().byScope[scopeKey] ?? DEFAULT_AGENT_WORK_MODE;
}

/** 订阅某 scope 的 workMode（未选择即默认模式）。 */
export function useComposerWorkMode(scopeKey: string): AgentWorkModeId {
  return useComposerWorkModeStore(
    (state) => state.byScope[scopeKey] ?? DEFAULT_AGENT_WORK_MODE,
  );
}
