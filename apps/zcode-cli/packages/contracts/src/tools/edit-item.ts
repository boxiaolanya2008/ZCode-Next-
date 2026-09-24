// ============================================================
// Edit Item - shared edit descriptor for super edit tools
// ============================================================
// BatchEdit / AtomicEdit 共用的单条编辑描述；与 Edit 工具入参一一对应，
// 因此底层可以复用 Edit 的匹配语义而不引入第二种编辑方言。

import { z } from "zod";
import { semanticBoolean } from "./boolean-input.js";

export const EditItemSchema = z.object({
  file_path: z.string().describe("The absolute path to the file to modify"),
  old_string: z
    .string()
    .describe(
      "The exact text to replace; must match the file including indentation, and be unique unless replace_all is set",
    ),
  new_string: z.string().describe("The replacement text; must differ from old_string"),
  replace_all: semanticBoolean()
    .optional()
    .default(false)
    .describe("Replace every occurrence of old_string in this file (default false)"),
});

export type EditItem = z.infer<typeof EditItemSchema>;
