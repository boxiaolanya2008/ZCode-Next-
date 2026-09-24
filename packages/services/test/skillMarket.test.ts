import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  parseSkillhubSearchOutput,
  parseSkillhubVersion,
} from "../src/skill-market/skillhubOutput.js";
import {
  hasTrackedFileChanges,
  hashSkillDirectory,
} from "../src/skill-market/skillMarketStore.js";

test("parseSkillhubSearchOutput 解析 JSON 数组", () => {
  const listings = parseSkillhubSearchOutput(
    JSON.stringify([
      { name: "pdf", description: "PDF 工具", version: "1.2.0", author: "acme" },
      { slug: "xlsx", summary: "表格" },
    ]),
  );
  assert.equal(listings.length, 2);
  assert.deepEqual(listings[0], {
    name: "pdf",
    installed: false,
    description: "PDF 工具",
    version: "1.2.0",
    source: "acme",
  });
  assert.equal(listings[1]?.name, "xlsx");
});

test("parseSkillhubSearchOutput 解析 {skills: []} 对象", () => {
  const listings = parseSkillhubSearchOutput(
    JSON.stringify({ skills: [{ name: "docx", description: "文档" }] }),
  );
  assert.equal(listings.length, 1);
  assert.equal(listings[0]?.name, "docx");
});

test("parseSkillhubSearchOutput 回退到按行解析并跳过表头", () => {
  const listings = parseSkillhubSearchOutput(
    ["NAME  DESCRIPTION", "pdf - PDF 工具", "xlsx\t表格\tacme\t2.0.0", "ppt@3.1.0  幻灯片"].join(
      "\n",
    ),
  );
  assert.deepEqual(
    listings.map((item) => item.name),
    ["pdf", "xlsx", "ppt"],
  );
  assert.equal(listings[1]?.source, "acme");
  assert.equal(listings[1]?.version, "2.0.0");
  assert.equal(listings[2]?.version, "3.1.0");
});

test("parseSkillhubVersion 提取语义化版本", () => {
  assert.equal(parseSkillhubVersion("skillhub 1.4.2\n"), "1.4.2");
  assert.equal(parseSkillhubVersion("no version here"), undefined);
});

test("hashSkillDirectory 与本地改动检测", async () => {
  const dir = await mkdtemp(join(tmpdir(), "skill-market-test-"));
  try {
    await writeFile(join(dir, "SKILL.md"), "# skill\n", "utf-8");
    await writeFile(join(dir, "helper.txt"), "v1", "utf-8");
    const baseline = await hashSkillDirectory(dir);
    assert.deepEqual(Object.keys(baseline).sort(), ["SKILL.md", "helper.txt"]);
    assert.equal(hasTrackedFileChanges(baseline, await hashSkillDirectory(dir)), false);

    await writeFile(join(dir, "helper.txt"), "v2", "utf-8");
    assert.equal(hasTrackedFileChanges(baseline, await hashSkillDirectory(dir)), true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
