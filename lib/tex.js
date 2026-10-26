/**
 * 由同一份内容规格生成 LaTeX，并调用 xelatex 出 PDF。
 *
 * 依赖：本机需有 TeX Live（xelatex）与中文字体。缺了会给出明确错误。
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ASSET_STY = path.join(HERE, "..", "assets", "gongwen.sty");

const LATEX_SPECIAL = {
  "\\": "\\textbackslash{}",
  "%": "\\%",
  "&": "\\&",
  "#": "\\#",
  "_": "\\_",
  $: "\\$",
  "{": "\\{",
  "}": "\\}",
  "~": "\\textasciitilde{}",
  "^": "\\textasciicircum{}",
};

export function escapeLatex(text) {
  return String(text).replace(/[\\%&#_${}~^]/g, (ch) => LATEX_SPECIAL[ch]);
}

export function makeTex(spec) {
  const lines = [
    "% 由 dsh-tool-gongwen 生成",
    "\\documentclass[UTF8, fontset=none, twoside]{ctexart}",
    "\\usepackage{gongwen}",
    "",
    "\\begin{document}",
    "",
  ];

  if (spec.org) lines.push(
    `\\gworg{${spec.orgBold ? "\\bfseries " : ""}${escapeLatex(spec.org)}}`,
  );
  if (spec.docno) lines.push(`\\gwdocno{${escapeLatex(spec.docno)}}`);
  if (spec.title) lines.push(`\\gwtitle{${escapeLatex(spec.title)}}`);
  if (spec.to) lines.push(`\\gwto{${escapeLatex(spec.to)}}`);
  if (spec.org || spec.docno || spec.title || spec.to) lines.push("");

  for (const blk of spec.blocks || []) {
    const t = escapeLatex(blk.text ?? "");
    switch (blk.type) {
      case "h1": lines.push(`\\gwhone{${t}}`, ""); break;
      case "h2": lines.push(`\\gwhtwo{${t}}`, ""); break;
      case "h3": lines.push(`\\gwhthree{${t}}`, ""); break;
      case "to": lines.push(`\\gwto{${t}}`, ""); break;
      default: lines.push(`\\gwbody{${t}}`, ""); break;
    }
  }

  const hasTail = spec.attachments?.length || spec.signOrg || spec.signDate;
  if (hasTail) {
    lines.push("% 附件与落款必须同页，否则会出现只有两行字的孤页");
    lines.push("\\begin{samepage}");
    if (spec.attachments?.length) {
      lines.push(`\\gwattach{附件：${escapeLatex(spec.attachments[0])}}`);
      for (const it of spec.attachments.slice(1)) {
        lines.push(`\\gwattachcont{${escapeLatex(it)}}`);
      }
    }
    if (spec.signOrg || spec.signDate) {
      lines.push(
        `\\gwsign{${escapeLatex(spec.signOrg ?? "")}}{${escapeLatex(spec.signDate ?? "")}}`,
      );
    }
    lines.push("\\end{samepage}");
  }

  lines.push("", "\\end{document}", "");
  return lines.join("\n");
}

function findXelatex() {
  const fromEnv = process.env.DSH_GONGWEN_XELATEX;
  if (fromEnv) return fromEnv;
  const candidates =
    process.platform === "win32"
      ? [
          "E:\\texlive\\texlive\\2024\\bin\\windows\\xelatex.exe",
          "C:\\texlive\\2024\\bin\\windows\\xelatex.exe",
        ]
      : ["/usr/bin/xelatex", "/usr/local/bin/xelatex"];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return "xelatex";
}

/**
 * 生成 PDF。
 * @param {object} spec 内容规格
 * @param {string} outPath 目标 pdf 路径
 * @returns {{path: string, pages: number}}
 */
export function makePdf(spec, outPath) {
  if (!fs.existsSync(ASSET_STY)) {
    throw new Error(`缺少样式包：${ASSET_STY}`);
  }
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "gongwen-"));
  const texName = "gongwen-doc.tex";
  const texPath = path.join(work, texName);
  try {
    fs.writeFileSync(texPath, makeTex(spec), "utf8");
    fs.copyFileSync(ASSET_STY, path.join(work, "gongwen.sty"));

    const xelatex = findXelatex();
    const args = ["-interaction=nonstopmode", "-halt-on-error", texName];
    for (let pass = 1; pass <= 2; pass += 1) {
      try {
        execFileSync(xelatex, args, {
          cwd: work,
          stdio: "pipe",
          env: { ...process.env, TEXINPUTS: `.${path.delimiter}` },
        });
      } catch (err) {
        const logPath = path.join(work, "gongwen-doc.log");
        const log = fs.existsSync(logPath) ? fs.readFileSync(logPath, "utf8") : "";
        const errors = log
          .split("\n")
          .filter((l) => l.startsWith("!"))
          .slice(0, 6)
          .join("\n");
        throw new Error(
          `xelatex 第 ${pass} 遍失败（${xelatex}）\n${errors || err.message}`,
        );
      }
    }

    const pdfPath = path.join(work, "gongwen-doc.pdf");
    if (!fs.existsSync(pdfPath)) throw new Error("xelatex 没有生成 PDF");
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.copyFileSync(pdfPath, outPath);

    const log = fs.readFileSync(path.join(work, "gongwen-doc.log"), "utf8");
    const notes = [...log.matchAll(/gongwen: .*/g)].map((m) => m[0]);
    return { path: outPath, fonts: notes };
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}
