#!/usr/bin/env node
/**
 * dsh-tool-gongwen 卸载脚本。
 *
 * 用法（一般由 uninstall.bat 调用）：
 *   node uninstall.mjs            从 desktop profile 卸载
 *   node uninstall.mjs web        从指定 profile 卸载
 *   node uninstall.mjs --keep-backup   保留备份目录（默认提示保留）
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PKG_NAME = "dsh-tool-gongwen";
const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith("--"));
const wantProfile = positional[0] || "desktop";

const log = (m) => console.log(m);
const ok = (m) => console.log("  [完成] " + m);
const bad = (m) => console.log("  [失败] " + m);

function fail(msg, hint) {
  bad(msg);
  if (hint) log("         " + hint);
  process.exit(1);
}

log("== dsh-tool-gongwen 卸载程序 ==\n");

const dshHome = process.env.DSH_HOME || path.join(os.homedir(), ".dsh");
const profilesDir = path.join(dshHome, "profiles");
if (!fs.existsSync(profilesDir)) fail("找不到 profiles 目录", profilesDir);

let profileDir = path.join(profilesDir, wantProfile);
if (!fs.existsSync(path.join(profileDir, "package.json"))) {
  const candidates = fs
    .readdirSync(profilesDir)
    .filter((d) => fs.existsSync(path.join(profilesDir, d, "package.json")));
  if (candidates.length === 0) fail("没有可用的 profile");
  profileDir = path.join(profilesDir, candidates[0]);
}
log("profile 目录  " + profileDir);

const runtime = path.join(dshHome, "dsh-runtimes", "dsh-primary-runtime", "dependencies");
const nodeExe = process.env.DSH_NODE || path.join(runtime, "node", "bin", "node.exe");
const pnpmEntry = path.join(runtime, "pnpm", "bin", "pnpm.mjs");

const pkgJsonPath = path.join(profileDir, "package.json");
let pkg;
try {
  pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));
} catch (e) {
  fail("profile 的 package.json 不是合法 JSON", e.message);
}

// 1. 从 bundles 移除
const bundles = pkg?.dsh?.profile?.bundles;
if (Array.isArray(bundles) && bundles.includes(PKG_NAME)) {
  pkg.dsh.profile.bundles = bundles.filter((b) => b !== PKG_NAME);
  fs.writeFileSync(pkgJsonPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");
  ok("已从 dsh.profile.bundles 移除");
} else {
  ok("bundles 里本来就没有，跳过");
}

// 2. 卸载依赖
if (fs.existsSync(pnpmEntry)) {
  log("\n正在卸载依赖……");
  const r = spawnSync(nodeExe, [pnpmEntry, "remove", PKG_NAME], {
    cwd: profileDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (r.status === 0) {
    ok("依赖已卸载");
  } else {
    bad("pnpm remove 未成功，可手动执行：pnpm remove " + PKG_NAME);
    log((r.stdout || "").trim().split("\n").slice(-4).join("\n"));
  }
} else {
  bad("找不到 pnpm，跳过依赖卸载");
}

log("\n==============================");
log(" 卸载完成，请重启 DSH 生效。");
log("==============================");
log("\n安装时留下的备份目录仍在 profile 下（.gongwen-backup-*），确认无问题后可删除。");
