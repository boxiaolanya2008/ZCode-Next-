# Spec: 语言编码规范注入(Language Coding Standards)

## 背景与目的

Main Agent 的 system prompt 当前只给了通用约束(identity、`# Harness`、通信/上下文管理)。
模型在写具体编程语言时缺少该语言的严谨编码规范(命名、结构、错误处理、工具链约定、常见陷阱),
导致产出风格不统一、可读性差。本特性为模型补充按语言区分的编码规范。

## 产品规则

1. 按主流编程语言各提供一份 Markdown 规范文件,作为该语言代码的编写要求。
2. system prompt 增加一段**稳定的编码规范段**:当模型需要编写或实质性修改某语言代码时,
   必须先使用 `Read`(或 `Glob`)读取对应的规范文件(绝对路径由运行时注入),再参照其要求执行。
3. 规范文件不可达时,降级为遵循通用编码约束(见系统提示中的全局规则),不得中断任务。
4. 模型对"模糊需求指令"应主动化:先按规范文件中的约束澄清假设、给出明确约定,再落代码。

## 状态所有者与接口

- **状态所有者**: `apps/zcode-cli/packages/core/src/context/language-standards/` 内的 `.md` 文件与
  `index.ts`(语言→文件名映射、目录解析)。
- **接口**:
  - `resolveLanguageStandardsDir(): string` —— 返回规范目录绝对路径(级联解析,见下)。
  - `buildLanguageStandardsSection(): ContextSection` —— 生成稳定(`cacheHint: "stable"`)system 段。
  - `buildCli`(apps/zcode-cli/packages/cli/scripts/build.mjs)与
    `stage-agent-bundle.mjs`(packages/desktop/scripts)负责把规范目录作为 sidecar 复制到各产物。
- **依赖方向**: section 构建只读文件系统定位目录,不嵌入规范全文;规范正文在 `.md` 中。

## 规范文件读取路径与携带

规范正文在运行时经文件系统被模型 `Read`,因此必须在各分发产物中随同携带:

| 运行形态 | API 产物落点 | 规范目录落点 |
| --- | --- | --- |
| 源码 / dev(tsx / core dist) | — | `src/context/language-standards/`(与 `index.ts` 同目录) |
| CLI(普通) | `packages/cli/dist/zcode.cjs` | `dist/language-standards/`(同 dist) |
| SEA 单文件 | `dist/zcode-<target>.sea` | `dist/language-standards/`(同 dist) |
| 桌面 | `packages/desktop/bundled-agents/<os>-<arch>/glm/zcode.cjs` | `glm/language-standards/`(同 glm) |

`index.ts` 的 `resolveLanguageStandardsDir` 按候选顺序探测并返回第一个存在的目录:

1. `path.join(当前模块基目录, language-standards)` —— 覆盖 CLI/SEA/桌面 sidecar(`__dirname` 为 `dist` 或 `glm`)。
2. `当前模块基目录自身`(若含标记文件 `typescript.md`) —— 覆盖源码与 tsc 产物同目录布局。

`__dirname` 在 CJS bundle 中可用;ESM 源码/产物回退到 `import.meta.url`。

## 验收场景

- **GIVEN** 模型任务要求写 TypeScript 文件; **WHEN** 开始编写;**THEN** 先读到
  `<dir>/typescript.md` 并按其约定产出(命名、类型、错误处理等)。
- **GIVEN** 规范目录不可达; **WHEN** 写代码;**THEN** 使用全局通用约束继续,不中断。
- **GIVEN** 桌面与 CLI 均构建;**THEN** 在 `dist/language-standards/` 与 `glm/language-standards/`
  均能取到各语言 `.md`。