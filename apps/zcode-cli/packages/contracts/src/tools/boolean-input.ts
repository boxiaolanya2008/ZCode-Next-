// ============================================================
// Boolean Input - lenient boolean schema shared by super tools
// ============================================================
// 与 Edit 工具同款语义：模型经 JSON 通道可能把布尔发成 "true"/"1"/"yes" 等字符串。
// 超级工具共用这一份，避免每个契约各自复制一遍归一化逻辑。

import { z } from "zod";

const TRUE_BOOLEAN_STRINGS = new Set(["true", "1", "yes", "y", "on"]);
const FALSE_BOOLEAN_STRINGS = new Set(["false", "0", "no", "n", "off"]);

export function semanticBoolean(): z.ZodEffects<z.ZodBoolean, boolean, unknown> {
  return z.preprocess((value) => {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") {
      if (value === 1) return true;
      if (value === 0) return false;
      return value;
    }
    if (typeof value !== "string") return value;

    const normalized = value.trim().toLowerCase();
    if (TRUE_BOOLEAN_STRINGS.has(normalized)) return true;
    if (FALSE_BOOLEAN_STRINGS.has(normalized)) return false;
    return value;
  }, z.boolean());
}
