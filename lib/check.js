/**
 * 版面校验：量出实际尺寸，与 GB/T 9704—2012 逐项对照。
 *
 * DOCX：直接读 sectPr / styles，值精确，无渲染误差。
 * PDF ：只读 MediaBox（页面尺寸）。文字坐标需要 PDF 解析器，本包不引入第三方依赖，
 *       因此 PDF 的白边无法在此校验，需用技能里的 scripts/verify_layout.py。
 */

import fs from "node:fs";
import { inflateRawSync, inflateSync } from "node:zlib";
import { readZip } from "./zip.js";

const TWIPS_PER_MM = 56.6929;
const PT_PER_MM = 72 / 25.4;

export const TARGET = {
  pageW: 210,
  pageH: 297,
  top: 37,
  bottom: 35,
  left: 28,
  right: 26,
  bodyW: 156,
  bodyH: 225,
};

export const TOL = 1.0;   // 国标 ±1 mm

const toMm = (twips) => twips / TWIPS_PER_MM;

function row(name, actual, expected, tol = TOL) {
  const ok = Math.abs(actual - expected) <= tol;
  return { name, actual: Math.round(actual * 10) / 10, expected, ok };
}

function xmlOf(files, name) {
  const buf = files.get(name);
  return buf ? buf.toString("utf8") : null;
}

export function checkDocx(filePath) {
  const files = readZip(fs.readFileSync(filePath));
  const doc = xmlOf(files, "word/document.xml");
  if (!doc) throw new Error("不是有效的 docx：缺 word/document.xml");

  const sect = doc.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/);
  if (!sect) throw new Error("docx 里找不到 sectPr，无法读取页面设置");

  const pgSz = sect[0].match(/<w:pgSz[^/]*\/>/);
  const pgMar = sect[0].match(/<w:pgMar[^/]*\/>/);
  if (!pgSz || !pgMar) throw new Error("sectPr 缺 pgSz 或 pgMar");

  const attr = (node, key) => {
    const m = node.match(new RegExp(`w:${key}="(\\d+)"`));
    return m ? Number(m[1]) : NaN;
  };

  const pageW = toMm(attr(pgSz[0], "w"));
  const pageH = toMm(attr(pgSz[0], "h"));
  const top = toMm(attr(pgMar[0], "top"));
  const bottom = toMm(attr(pgMar[0], "bottom"));
  const left = toMm(attr(pgMar[0], "left"));
  const right = toMm(attr(pgMar[0], "right"));

  const rows = [
    row("页面宽", pageW, TARGET.pageW),
    row("页面高", pageH, TARGET.pageH),
    row("上白边（天头）", top, TARGET.top),
    row("下白边", bottom, TARGET.bottom),
    row("左白边（订口）", left, TARGET.left),
    row("右白边", right, TARGET.right),
    row("版心宽", pageW - left - right, TARGET.bodyW),
    row("版心高", pageH - top - bottom, TARGET.bodyH),
  ];

  // 正文样式：字号与行距
  const styles = xmlOf(files, "word/styles.xml");
  const details = [];
  if (styles) {
    const sz = styles.match(/<w:sz w:val="(\d+)"\/>/);
    if (sz) {
      const pt = Number(sz[1]) / 2;
      details.push({ name: "正文字号", actual: pt, expected: 16, unit: "pt", ok: Math.abs(pt - 16) < 0.01 });
    }
    const spacing = styles.match(/<w:spacing w:line="(\d+)" w:lineRule="exact"\/>/);
    if (spacing) {
      const pt = Number(spacing[1]) / 20;
      details.push({ name: "行距", actual: pt, expected: 28, unit: "pt", ok: Math.abs(pt - 28) < 0.01 });
    }
  }

  // 奇偶页页脚
  const settings = xmlOf(files, "word/settings.xml");
  const evenOdd = Boolean(settings && settings.includes("<w:evenAndOddHeaders/>"));
  details.push({
    name: "奇偶页不同页码",
    actual: evenOdd ? 1 : 0,
    expected: 1,
    unit: "",
    ok: evenOdd,
  });

  return {
    file: filePath,
    kind: "docx",
    rows,
    details,
    ok: rows.every((r) => r.ok) && details.every((d) => d.ok),
  };
}

/**
 * 在 PDF 里找 MediaBox。
 *
 * xelatex 产出的 PDF 把页面对象放进压缩的对象流（/ObjStm），直接搜原始字节找不到，
 * 所以这里把所有 stream 都尝试解压一遍再搜。只依赖 zlib，不引入 PDF 库。
 */
function findMediaBox(buf) {
  const raw = buf.toString("latin1");
  const scan = (text) => {
    const m = text.match(/\/MediaBox\s*\[\s*([\d.\-\s]+)\]/);
    return m ? m[1].trim().split(/\s+/).map(Number) : null;
  };

  const direct = scan(raw);
  if (direct) return direct;

  let pos = 0;
  while (pos < buf.length) {
    const start = buf.indexOf("stream", pos);
    if (start < 0) break;
    pos = start + 6;
    // 跳过 "endstream" 中的 stream
    if (buf.subarray(Math.max(0, start - 3), start).toString() === "end") continue;

    let dataStart = start + 6;
    if (buf[dataStart] === 0x0d) dataStart += 1;
    if (buf[dataStart] === 0x0a) dataStart += 1;
    const end = buf.indexOf("endstream", dataStart);
    if (end < 0) break;

    const slice = buf.subarray(dataStart, end);
    // xelatex 用 zlib 包装（inflateSync），有的工具用裸 deflate（inflateRawSync）
    for (const inflate of [inflateSync, inflateRawSync]) {
      try {
        const hit = scan(inflate(slice).toString("latin1"));
        if (hit) return hit;
        break;
      } catch {
        /* 换另一种 */
      }
    }
    pos = end + 9;
  }
  return null;
}

export function checkPdf(filePath) {
  const buf = fs.readFileSync(filePath);
  const nums = findMediaBox(buf);
  if (!nums || nums.length !== 4) {
    throw new Error("PDF 里找不到 MediaBox（可能是加密或非标准 PDF）");
  }

  const pageW = Math.abs(nums[2] - nums[0]) / PT_PER_MM;
  const pageH = Math.abs(nums[3] - nums[1]) / PT_PER_MM;

  const rows = [
    row("页面宽", pageW, TARGET.pageW),
    row("页面高", pageH, TARGET.pageH),
  ];

  return {
    file: filePath,
    kind: "pdf",
    rows,
    details: [],
    note: "PDF 只校验页面尺寸；白边需要文字坐标，请用 skill 的 scripts/verify_layout.py（依赖 PyMuPDF）。",
    ok: rows.every((r) => r.ok),
  };
}

export function checkLayout(filePath) {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".docx")) return checkDocx(filePath);
  if (lower.endsWith(".pdf")) return checkPdf(filePath);
  throw new Error("只支持 .docx 与 .pdf");
}

export function formatReport(result) {
  const lines = [`文件：${result.file}`];
  const head = `${"项目".padEnd(16)}${"实测".padStart(8)}${"国标".padStart(8)}   判定`;
  lines.push(head, "-".repeat(46));
  for (const r of result.rows) {
    lines.push(
      `${r.name.padEnd(16)}${String(r.actual).padStart(8)}${String(r.expected).padStart(8)}   ${r.ok ? "OK" : "偏差"}`,
    );
  }
  if (result.details.length) {
    lines.push("");
    for (const d of result.details) {
      lines.push(
        `${d.name.padEnd(16)}${String(d.actual).padStart(8)}${String(d.expected).padStart(8)}   ${d.ok ? "OK" : "偏差"}${d.unit ? " " + d.unit : ""}`,
      );
    }
  }
  if (result.note) lines.push("", result.note);
  lines.push("", result.ok ? "结论：符合 GB/T 9704—2012" : "结论：存在偏差");
  return lines.join("\n");
}
