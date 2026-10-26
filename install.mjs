#!/usr/bin/env node
/**
 * dsh-tool-gongwen 一键安装脚本。
 *
 * 用法（一般由 install.bat 调用）：
 *   node install.mjs               安装到 desktop profile
 *   node install.mjs web           安装到指定 profile
 *   node install.mjs --dry-run     只检查环境并打印计划，不改任何文件
 *   node install.mjs --rollback    还原最近一次安装前的备份
 *
 * 做的事：
 *   1. 定位 DSH 安装目录、profile、自带 pnpm
 *   2. 备份 profile 的 package.json 与 pnpm-lock.yaml
 *   3. pnpm add 本仓库
 *   4. 把插件名登记进 dsh.profile.bundles
 *   5. 提示重启
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG_NAME = "dsh-tool-gongwen";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const rollback = args.includes("--rollback");
const positional = args.filter((a) => !a.startsWith("--"));
const wantProfile = positional[0] || "desktop";

const log = (m) => console.log(m);
const ok = (m) => console.log("  [完成] " + m);
const warn = (m) => console.log("  [注意] " + m);
const bad = (m) => console.log("  [失败] " + m);

function fail(msg, hint) {
  bad(msg);
  if (hint) log("         " + hint);
  log("\n安装未完成。");
  process.exit(1);
}

// ---------------------------------------------------------------- 环境探测
log("== dsh-tool-gongwen 安装程序 ==\n");

const dshHome =
  process.env.DSH_HOME || path.join(os.homedir(), ".dsh");
log("DSH 目录      " + dshHome);
if (!fs.existsSync(dshHome)) {
  fail("找不到 DSH 目录", "请确认 DSH 已安装并至少启动过一次，或设置环境变量 DSH_HOME。");
}

const profilesDir = path.join(dshHome, "profiles");
if (!fs.existsSync(profilesDir)) fail("找不到 profiles 目录", profilesDir);

// 选 profile：优先指定名，否则在有 package.json 的目录里挑
let profileDir = path.join(profilesDir, wantProfile);
if (!fs.existsSync(path.join(profileDir, "package.json"))) {
  const candidates = fs
    .readdirSync(profilesDir)
    .filter((d) => fs.existsSync(path.join(profilesDir, d, "package.json")));
  if (candidates.length === 0) fail("没有可用的 profile", "检查 " + profilesDir);
  warn(`profile "${wantProfile}" 不存在，改用 "${candidates[0]}"`);
  profileDir = path.join(profilesDir, candidates[0]);
}
log("profile 目录  " + profileDir);

// pnpm 与 node 来自 DSH 自带运行时
const runtime = path.join(
  dshHome, "dsh-runtimes", "dsh-primary-runtime", "dependencies",
);
const nodeExe = process.env.DSH_NODE || path.join(runtime, "node", "bin", "node.exe");
const pnpmEntry = path.join(runtime, "pnpm", "bin", "pnpm.mjs");
if (!fs.existsSync(pnpmEntry)) {
  fail("找不到 DSH 自带的 pnpm", "期望位置：" + pnpmEntry);
}
log("pnpm          " + pnpmEntry);
log("本插件目录    " + HERE);
log("");

const pkgJsonPath = path.join(profileDir, "package.json");
const lockPath = path.join(profileDir, "pnpm-lock.yaml");

// ---------------------------------------------------------------- 回滚
if (rollback) {
  const backups = fs
    .readdirSync(profileDir)
    .filter((d) => d.startsWith(".gongwen-backup-"))
    .sort();
  if (backups.length === 0) fail("没有找到安装备份");
  const latest = path.join(profileDir, backups[backups.length - 1]);
  log("回滚到 " + latest);
  for (const f of ["package.json", "pnpm-lock.yaml"]) {
    const src = path.join(latest, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(profileDir, f));
  }
  ok("配置已还原，请重新执行 pnpm install 并重启 DSH");
  process.exit(0);
}

// ---------------------------------------------------------------- 读配置
let pkg;
try {
  pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));
} catch (e) {
  fail("profile 的 package.json 不是合法 JSON", e.message);
}
pkg.dsh ??= {};
pkg.dsh.profile ??= {};
pkg.dsh.profile.bundles ??= [];
const bundles = pkg.dsh.profile.bundles;
const already = bundles.includes(PKG_NAME);
const installed = fs.existsSync(path.join(profileDir, "node_modules", PKG_NAME));

log("现状：");
log("  bundles 里" + (already ? "已有" : "没有") + " " + PKG_NAME);
log("  node_modules 里" + (installed ? "已有" : "没有"));
log("");

if (dryRun) {
  log("== 预演模式，以下步骤不会真正执行 ==");
  log("  1. 备份 package.json 与 pnpm-lock.yaml 到 .gongwen-backup-<时间戳>/");
  log(`  2. pnpm add "file:${HERE}"`);
  log(`  3. 把 "${PKG_NAME}" 加入 dsh.profile.bundles`);
  log("  4. 提示重启 DSH");
  log("\n环境检查通过。");
  process.exit(0);
}

// ---------------------------------------------------------------- 备份
const stamp = new Date()
  .toISOString()
  .replace(/[-:T]/g, "")
  .slice(0, 14);
const backupDir = path.join(profileDir, `.gongwen-backup-${stamp}`);
fs.mkdirSync(backupDir, { recursive: true });
fs.copyFileSync(pkgJsonPath, path.join(backupDir, "package.json"));
if (fs.existsSync(lockPath)) fs.copyFileSync(lockPath, path.join(backupDir, "pnpm-lock.yaml"));
ok("已备份到 " + path.basename(backupDir));

// ---------------------------------------------------------------- 安装
function runPnpm(sub) {
  const r = spawnSync(nodeExe, [pnpmEntry, ...sub], {
    cwd: profileDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return { code: r.status, out: (r.stdout || "") + (r.stderr || "") };
}

if (!installed) {
  log("\n正在安装依赖……");
  const r = runPnpm(["add", `file:${HERE}`]);
  const tail = r.out.trim().split("\n").slice(-6).join("\n");
  if (r.code !== 0 && !installed) {
    fs.copyFileSync(path.join(backupDir, "package.json"), pkgJsonPath);
    fail("pnpm add 失败", "输出末段：\n" + tail);
  }
  ok("依赖已安装");
} else {
  ok("依赖已存在，跳过安装");
}

// ---------------------------------------------------------------- 登记 bundles
if (!already) {
  bundles.push(PKG_NAME);
  fs.writeFileSync(pkgJsonPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");
  ok(`已把 "${PKG_NAME}" 登记进 dsh.profile.bundles`);
} else {
  ok("bundles 已登记，无需改动");
}

// ---------------------------------------------------------------- 收尾
log("\n==============================");
log(" 安装完成，请重启 DSH 生效。");
log("==============================");
log("\n重启后可在会话中这样验证：");
log('  用 gongwen_docx 生成一份关于测试的通知，输出到 test.docx');
log("\n卸载：运行 uninstall.bat，或 node install.mjs --rollback 还原配置后手动 pnpm remove");
