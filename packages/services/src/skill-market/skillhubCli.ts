import { spawn } from "node:child_process";
import { accessSync, constants, existsSync } from "node:fs";
import { delimiter, join } from "node:path";

/**
 * `skillhub` CLI 的跨平台调用适配器。
 *
 * 依据官方安装文档 https://skillhub.cn/install/skillhub.md：
 * - `skillhub search <kw>` 搜索；
 * - `skillhub install <name> --dir <skills 目录>` 安装到指定目录。
 *
 * 这里集中处理外部进程 I/O：跨平台可执行文件解析（Windows `.cmd`/`.bat`）、
 * 参数数组传递、超时、输出截断与非零退出归一化。业务层只表达意图。
 */

export interface SkillhubRunOptions {
  args: string[];
  cwd?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
  env?: NodeJS.ProcessEnv;
}

export interface SkillhubRunResult {
  executable: string;
  args: string[];
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  outputTruncated: boolean;
}

export const DEFAULT_SKILLHUB_TIMEOUT_MS = 60_000;
export const DEFAULT_SKILLHUB_OUTPUT_BYTES = 2 * 1024 * 1024;

const KILL_GRACE_MS = 1_500;

function isExecutableFile(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function resolveCommandOnPath(
  names: readonly string[],
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
): string | null {
  const pathEnv = env.PATH ?? env.Path;
  if (!pathEnv) {
    return null;
  }
  for (const entry of pathEnv.split(delimiter)) {
    if (!entry) {
      continue;
    }
    for (const name of names) {
      const candidate = join(entry, name);
      if (existsSync(candidate) && isExecutableFile(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

/**
 * 解析 skillhub 可执行文件。找不到时返回 null（由调用方给出安装引导，不静默失败）。
 * Windows 下优先命中 `.cmd`/`.exe`/`.bat` 扩展名。
 */
export function resolveSkillhubExecutable(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string | null {
  const names =
    platform === "win32"
      ? ["skillhub.cmd", "skillhub.exe", "skillhub.bat", "skillhub"]
      : ["skillhub"];
  return resolveCommandOnPath(names, env, platform);
}

function isWindowsShellScript(path: string): boolean {
  return /\.(cmd|bat)$/iu.test(path);
}

function forceKill(child: ReturnType<typeof spawn>, platform: NodeJS.Platform): void {
  if (platform === "win32" && typeof child.pid === "number") {
    const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    killer.once("error", () => {});
    killer.once("close", () => {});
    return;
  }
  child.kill("SIGKILL");
}

/**
 * 执行一次 skillhub 命令。spawn 失败（ENOENT 等）归一化为非零退出结果，
 * 不向调用方抛未处理异常；命令缺失的语义由调用方通过 resolveSkillhubExecutable 判定。
 */
export async function runSkillhub(
  options: SkillhubRunOptions,
  deps?: { env?: NodeJS.ProcessEnv; platform?: NodeJS.Platform },
): Promise<SkillhubRunResult> {
  const env = options.env ?? deps?.env ?? process.env;
  const platform = deps?.platform ?? process.platform;
  const executable = resolveSkillhubExecutable(env, platform) ?? "skillhub";
  const timeoutMs = options.timeoutMs ?? DEFAULT_SKILLHUB_TIMEOUT_MS;
  const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_SKILLHUB_OUTPUT_BYTES;
  // Windows 上 .cmd/.bat 不能直接 spawn，必须经 shell 启动；POSIX 保持 shell:false 以避免注入。
  const useShell = platform === "win32" && isWindowsShellScript(executable);

  return await new Promise<SkillhubRunResult>((resolve) => {
    let stdout = "";
    let stderr = "";
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let timedOut = false;
    let outputTruncated = false;
    let settled = false;

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(executable, options.args, {
        ...(options.cwd ? { cwd: options.cwd } : {}),
        env,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
        shell: useShell,
      });
    } catch (error) {
      resolve({
        executable,
        args: options.args,
        stdout: "",
        stderr: error instanceof Error ? error.message : String(error),
        exitCode: -1,
        timedOut: false,
        outputTruncated: false,
      });
      return;
    }

    const settle = (exitCode: number | null): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      child.stdout?.off("data", onStdout);
      child.stderr?.off("data", onStderr);
      child.removeAllListeners("error");
      child.removeAllListeners("close");
      resolve({
        executable,
        args: options.args,
        stdout,
        stderr,
        exitCode,
        timedOut,
        outputTruncated,
      });
    };

    const appendChunk = (chunk: Buffer, target: "stdout" | "stderr"): void => {
      if (outputTruncated) {
        return;
      }
      const byteLength = chunk.byteLength;
      const currentBytes = target === "stdout" ? stdoutBytes : stderrBytes;
      if (currentBytes + byteLength > maxOutputBytes) {
        outputTruncated = true;
        forceKill(child, platform);
        return;
      }
      if (target === "stdout") {
        stdout += chunk.toString("utf-8");
        stdoutBytes += byteLength;
      } else {
        stderr += chunk.toString("utf-8");
        stderrBytes += byteLength;
      }
    };
    const onStdout = (chunk: Buffer) => appendChunk(chunk, "stdout");
    const onStderr = (chunk: Buffer) => appendChunk(chunk, "stderr");

    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      timedOut = true;
      child.kill();
      setTimeout(() => {
        if (settled) {
          return;
        }
        forceKill(child, platform);
        settle(null);
      }, KILL_GRACE_MS);
    }, timeoutMs);

    child.once("error", (error) => {
      // spawn 失败（命令缺失/权限）降级为失败结果，避免泄漏成未处理拒绝。
      stderr = error instanceof Error ? error.message : String(error);
      settle(-1);
    });
    child.stdout?.on("data", onStdout);
    child.stderr?.on("data", onStderr);
    child.once("close", (exitCode) => settle(exitCode));
  });
}
