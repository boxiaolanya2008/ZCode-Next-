#!/usr/bin/env node
// 校验桌面端图标资源一致性。
//
// 背景：图标生成脚本 scripts/generate-zcode-icon.py 依赖 Pillow，且未接入任何构建
// 步骤，因此 packages/desktop/build 下的图标是"手工生成后提交"的二进制资产。历史上
// public/logo/icons 里还另存了一套 .ico/.icns，安装包一旦取到那套就会显示旧图标。
// 本脚本不依赖 Pillow，可在 CI / pre-push 兜底：
//   1. build/ 下的 .png/.ico/.icns 必须来自同一套渲染（防止只更新 PNG 忘记重生成 .ico/.icns）；
//   2. public/logo/icons 不得再出现旧版重复的 .ico/.icns。
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BUILD = join(ROOT, "packages/desktop/build");
const ICONS = join(BUILD, "icons");
const PUBLIC_ICONS = join(ROOT, "public/logo/icons");

const md5 = (buffer) => createHash("md5").update(buffer).digest("hex");

function icoLargestEmbedded(path) {
  const data = readFileSync(path);
  const count = data.readUInt16LE(4);
  let best = null;
  for (let index = 0; index < count; index += 1) {
    const offset = 6 + index * 16;
    const size = data.readUInt32LE(offset + 8);
    const imageOffset = data.readUInt32LE(offset + 12);
    if (best === null || size > best.size) best = { size, imageOffset };
  }
  if (!best) throw new Error(`ICO 无条目: ${path}`);
  return data.subarray(best.imageOffset, best.imageOffset + best.size);
}

function icnsChunk(path, type) {
  const data = readFileSync(path);
  if (data.toString("ascii", 0, 4) !== "icns") throw new Error(`非 ICNS 文件: ${path}`);
  let cursor = 8;
  while (cursor + 8 <= data.length) {
    const id = data.toString("ascii", cursor, cursor + 4);
    const length = data.readUInt32BE(cursor + 4);
    if (length < 8) break;
    if (id === type) return data.subarray(cursor + 8, cursor + length);
    cursor += length;
  }
  return null;
}

const failures = [];
const expectEqual = (label, actual, expected) => {
  if (actual !== expected) failures.push(`${label}: ${actual} != ${expected}`);
};

const png256 = md5(readFileSync(join(ICONS, "256x256.png")));
const png512 = md5(readFileSync(join(ICONS, "512x512.png")));
const png1024 = md5(readFileSync(join(ICONS, "1024x1024.png")));

expectEqual("build/icon.png", md5(readFileSync(join(BUILD, "icon.png"))), png512);
expectEqual("build/icon_windows.png", md5(readFileSync(join(BUILD, "icon_windows.png"))), png256);
expectEqual("build/icon_installer.png", md5(readFileSync(join(BUILD, "icon_installer.png"))), png512);
expectEqual("build/icon.ico", md5(icoLargestEmbedded(join(BUILD, "icon.ico"))), png256);
expectEqual(
  "build/icon_installer.ico",
  md5(icoLargestEmbedded(join(BUILD, "icon_installer.ico"))),
  png256,
);
for (const name of ["icon.icns", "icon_installer.icns"]) {
  const chunk = icnsChunk(join(BUILD, name), "ic10");
  if (!chunk) failures.push(`${name}: 缺少 ic10(1024) 块`);
  else expectEqual(name, md5(chunk), png1024);
}

for (const name of ["icon.ico", "icon.icns"]) {
  if (existsSync(join(PUBLIC_ICONS, name))) {
    failures.push(
      `public/logo/icons/${name} 为旧版重复图标，请删除（图标唯一来源是 packages/desktop/build）`,
    );
  }
}

if (failures.length > 0) {
  console.error("[verify-zcode-icons] 失败：");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}
console.log("[verify-zcode-icons] OK：桌面图标资源同源且无旧版重复。");
