/**
 * 自检脚本：不依赖 DSH 运行时，直接验证库模块与产出文件。
 *
 * 用法：
 *   node test/selftest.mjs
 *
 * 覆盖：
 *   1. ZIP 读写往返
 *   2. 生成 DOCX 并回读校验版面
 *   3. 生成 PDF（需 xelatex，缺失则跳过）并读取页面尺寸
 *   4. 报告格式输出
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createZip, readZip } from "../lib/zip.js";
import { makeDocx } from "../lib/docx.js";
import { checkLayout, formatReport } from "../lib/check.js";
import { makePdf } from "../lib/tex.js";

const results = [];
const ok = (n, d = "") => results.push({ ok: true, n, d });
const bad = (n, d = "") => results.push({ ok: false, n, d });
const skip = (n, d = "") => results.push({ ok: true, n, d: "跳过：" + d });

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gongwen-selftest-"));

// ---------- 1. ZIP 往返 ----------
try {
  const payload = "内容中文 abc 0123";
  const zip = createZip([
    { name: "a.txt", data: payload },
    { name: "dir/b.txt", data: Buffer.from([0, 1, 2, 255]) },
  ]);
  const back = readZip(zip);
  const a = back.get("a.txt").toString("utf8");
  const b = back.get("dir/b.txt");
  a === payload && b.length === 4 && b[3] === 255
    ? ok("ZIP 读写往返", `${zip.length} 字节，2 个条目`)
    : bad("ZIP 读写往返", `a=${JSON.stringify(a)} b=[${b}]`);
} catch (e) {
  bad("ZIP 读写往返", e.message);
}

// ---------- 2. DOCX ----------
const SPEC = {
  org: "自检用俱乐部文件",
  docno: "自检字〔2026〕1 号",
  title: "关于插件自检的通知",
  to: "各测试组：",
  blocks: [
    { type: "body", text: "本文由自检脚本生成，用于确认版式参数正确。" },
    { type: "h1", text: "一、验证内容" },
    { type: "h2", text: "（一）生成与校验" },
    { type: "h3", text: "1. 版面" },
    { type: "body", text: "生成后回读 sectPr 与 styles，检查尺寸、字号与行距。" },
  ],
  attachments: ["1. 自检记录"],
  signOrg: "自检组",
  signDate: "2026年10月26日",
};

const docxPath = path.join(tmp, "selftest.docx");
try {
  const buf = makeDocx(SPEC);
  fs.writeFileSync(docxPath, buf);
  const r = checkLayout(docxPath);
  const passed = r.rows.filter((x) => x.ok).length;
  r.ok
    ? ok("生成 DOCX 并校验", `${buf.length} 字节，${r.rows.length} 项全部符合国标`)
    : bad("生成 DOCX 并校验", `${passed}/${r.rows.length} 项通过\n` + formatReport(r));
} catch (e) {
  bad("生成 DOCX 并校验", e.message);
}

// ---------- 3. PDF ----------
const pdfPath = path.join(tmp, "selftest.pdf");
try {
  const r = makePdf(SPEC, pdfPath);
  const c = checkLayout(pdfPath);
  fs.existsSync(pdfPath) && c.ok
    ? ok("生成 PDF 并校验", `${fs.statSync(pdfPath).size} 字节，页面尺寸符合国标`)
    : bad("生成 PDF 并校验", formatReport(c));
  if (r.fonts?.length) {
    for (const f of r.fonts) ok("字体", f.replace(/^gongwen: /, ""));
  }
} catch (e) {
  if (/xelatex|ENOENT|spawn/i.test(e.message)) {
    skip("生成 PDF 并校验", "未找到 xelatex，仅 DOCX 功能可用");
  } else {
    bad("生成 PDF 并校验", e.message);
  }
}

// ---------- 4. 报告格式 ----------
try {
  const r = checkLayout(docxPath);
  const text = formatReport(r);
  text.includes("项目") && text.includes("结论")
    ? ok("报告格式", text.split("\n").length + " 行")
    : bad("报告格式", text.slice(0, 80));
} catch (e) {
  bad("报告格式", e.message);
}

// ---------- 汇总 ----------
console.log("\n===== 自检结果 =====");
for (const r of results) {
  console.log(`${r.ok ? "  PASS" : "  FAIL"}  ${r.n}${r.d ? "  — " + r.d : ""}`);
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n合计 ${results.length} 项，通过 ${results.length - failed} 项，失败 ${failed} 项`);
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
