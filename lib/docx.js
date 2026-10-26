/**
 * 按 GB/T 9704—2012 生成 DOCX，零第三方依赖。
 *
 * 版式常量全部换算成 OOXML 单位：
 *   长度 twips（1/20 磅）；1 mm = 56.6929 twips
 *   字号 half-points（<w:sz w:val="32"/> 即 16 磅 = 三号）
 */

import { createZip } from "./zip.js";

const TWIPS_PER_MM = 56.6929;
const mm = (v) => Math.round(v * TWIPS_PER_MM);

/** 版式参数（国标） */
export const LAYOUT = {
  pageW: 210, pageH: 297,
  marginTop: 37, marginBottom: 35, marginLeft: 28, marginRight: 26,
  bodyPt: 16,        // 三号仿宋
  lineTwips: 560,    // 28 磅固定行距
  firstLineTwips: 640, // 首行缩进 2 字（2 × 16pt = 32pt = 640 twips）
};

/** 默认字体，可按平台覆盖 */
export const DEFAULT_FONTS = {
  body: "仿宋",
  h1: "黑体",
  h2: "楷体",
  page: "宋体",
  display: "华文中宋",   // 替代方正小标宋
};

const RED = "D40000";

const escapeXml = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function rPr({ font, sizePt, bold, color }) {
  const parts = [
    `<w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:eastAsia="${font}" w:cs="${font}"/>`,
  ];
  if (bold) parts.push("<w:b/>");
  if (color) parts.push(`<w:color w:val="${color}"/>`);
  if (sizePt) parts.push(`<w:sz w:val="${Math.round(sizePt * 2)}"/>`, `<w:szCs w:val="${Math.round(sizePt * 2)}"/>`);
  return `<w:rPr>${parts.join("")}</w:rPr>`;
}

function run(text, opts) {
  return `<w:r>${rPr(opts)}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
}

function pPr({ jc, line, before, after, firstLine, leftIndent, rightIndent, border }) {
  const parts = [];
  if (border) {
    parts.push(
      `<w:pBdr><w:bottom w:val="single" w:sz="12" w:space="1" w:color="${border}"/></w:pBdr>`,
    );
  }
  const spacing = [];
  if (before) spacing.push(`w:before="${before}"`);
  if (after) spacing.push(`w:after="${after}"`);
  spacing.push(`w:line="${line}"`, `w:lineRule="exact"`);
  parts.push(`<w:spacing ${spacing.join(" ")}/>`);
  if (firstLine !== undefined) parts.push(`<w:ind w:firstLine="${firstLine}"/>`);
  if (leftIndent !== undefined) parts.push(`<w:ind w:left="${leftIndent}"/>`);
  if (rightIndent !== undefined) parts.push(`<w:ind w:right="${rightIndent}"/>`);
  if (jc) parts.push(`<w:jc w:val="${jc}"/>`);
  return `<w:pPr>${parts.join("")}</w:pPr>`;
}

class Builder {
  constructor(fonts) {
    this.fonts = { ...DEFAULT_FONTS, ...fonts };
    this.paras = [];
  }

  add(text, opts = {}) {
    const {
      font = this.fonts.body,
      sizePt = LAYOUT.bodyPt,
      bold = false,
      color,
      jc,
      line = LAYOUT.lineTwips,
      before,
      after,
      firstLine,
      leftIndent,
      rightIndent,
      border,
    } = opts;
    this.paras.push(
      `<w:p>${pPr({ jc, line, before, after, firstLine, leftIndent, rightIndent, border })}${run(text, { font, sizePt, bold, color })}</w:p>`,
    );
  }

  org(text, bold = false) {
    this.add(text, {
      font: this.fonts.display, sizePt: 36, bold, color: RED,
      jc: "center", line: 880, after: 80,
    });
  }

  docno(text) {
    this.add(text, { font: this.fonts.page, sizePt: LAYOUT.bodyPt, jc: "center" });
    this.add("", { line: 20, before: 20, after: 180, border: RED });
  }

  title(text) {
    this.add(text, {
      font: this.fonts.display, sizePt: 22, jc: "center", line: 680, after: 160,
    });
  }

  to(text) {
    this.add(text, { firstLine: 0 });
  }

  body(text) {
    this.add(text, { firstLine: LAYOUT.firstLineTwips });
  }

  h1(text) {
    this.add(text, { font: this.fonts.h1, firstLine: LAYOUT.firstLineTwips });
  }

  h2(text) {
    this.add(text, { font: this.fonts.h2, firstLine: LAYOUT.firstLineTwips });
  }

  h3(text) {
    this.add(text, { bold: true, firstLine: LAYOUT.firstLineTwips });
  }

  attachments(items) {
    if (!items || items.length === 0) return;
    this.add(`附件：${items[0]}`, { firstLine: 0, leftIndent: 320, before: 320 });
    for (const it of items.slice(1)) {
      this.add(it, { firstLine: 0, leftIndent: 960 });
    }
  }

  sign(signOrg, signDate) {
    // 成文日期右空二字；署名居中于日期之上（GB/T 9704—2012 7.3.5.2）
    const CHAR = 16;           // 三号字 1 字 = 16 pt
    const units = (t) =>
      [...String(t)].reduce((n, ch) => n + (ch.codePointAt(0) > 0x2e80 ? 1 : 0.5), 0);
    const sigU = signOrg ? units(signOrg) : 0;
    const dateU = signDate ? units(signDate) : 0;
    const dateIndent = 2 * CHAR;                       // 日期右空二字
    const sigIndent = sigU && dateU && dateU > sigU
      ? dateIndent + ((dateU - sigU) * CHAR) / 2       // 署名相应增加右空，使其居中
      : dateIndent;
    if (signOrg) {
      this.add(signOrg, {
        jc: "right", firstLine: 0, rightIndent: sigIndent, before: 480,
      });
    }
    if (signDate) {
      this.add(signDate, { jc: "right", firstLine: 0, rightIndent: dateIndent });
    }
  }

  xml() {
    const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
    const R = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${W} ${R}><w:body>${this.paras.join("")}<w:sectPr>
<w:footerReference w:type="default" r:id="rId1"/>
<w:footerReference w:type="even" r:id="rId2"/>
<w:pgSz w:w="${mm(LAYOUT.pageW)}" w:h="${mm(LAYOUT.pageH)}"/>
<w:pgMar w:top="${mm(LAYOUT.marginTop)}" w:right="${mm(LAYOUT.marginRight)}" w:bottom="${mm(LAYOUT.marginBottom)}" w:left="${mm(LAYOUT.marginLeft)}" w:header="720" w:footer="720" w:gutter="0"/>
<w:cols w:space="720"/><w:docGrid w:linePitch="360"/></w:sectPr></w:body></w:document>`;
  }
}

const footerXml = (jc, font, sizePt) => {
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  const R = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const pr = rPr({ font, sizePt });
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr ${W} ${R}><w:p><w:pPr><w:jc w:val="${jc}"/></w:pPr>
<w:r>${pr}<w:t xml:space="preserve">— </w:t></w:r>
<w:fldSimple w:instr=" PAGE "><w:r>${pr}<w:t>1</w:t></w:r></w:fldSimple>
<w:r>${pr}<w:t xml:space="preserve"> —</w:t></w:r>
</w:p></w:ftr>`;
};

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
<Override PartName="/word/footer2.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer2.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
</Relationships>`;

const SETTINGS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:evenAndOddHeaders/>
</w:settings>`;

const stylesXml = (fonts) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults>
<w:rPrDefault><w:rPr>
<w:rFonts w:ascii="${fonts.body}" w:hAnsi="${fonts.body}" w:eastAsia="${fonts.body}"/>
<w:sz w:val="${LAYOUT.bodyPt * 2}"/><w:szCs w:val="${LAYOUT.bodyPt * 2}"/>
</w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:line="${LAYOUT.lineTwips}" w:lineRule="exact"/></w:pPr></w:pPrDefault>
</w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
</w:styles>`;

/**
 * 由内容规格生成 docx Buffer。
 * @param {object} spec 见 README 的「内容规格」
 * @returns {Buffer}
 */
export function makeDocx(spec) {
  const fonts = { ...DEFAULT_FONTS, ...(spec.fonts || {}) };
  const b = new Builder(fonts);

  if (spec.org) b.org(spec.org, Boolean(spec.orgBold));
  if (spec.docno) b.docno(spec.docno);
  if (spec.title) b.title(spec.title);
  if (spec.to) b.to(spec.to);

  for (const blk of spec.blocks || []) {
    const text = blk.text ?? "";
    switch (blk.type) {
      case "h1": b.h1(text); break;
      case "h2": b.h2(text); break;
      case "h3": b.h3(text); break;
      case "to": b.to(text); break;
      default: b.body(text); break;
    }
  }

  if (spec.attachments?.length) b.attachments(spec.attachments);
  if (spec.signOrg || spec.signDate) b.sign(spec.signOrg, spec.signDate);

  return createZip([
    { name: "[Content_Types].xml", data: CONTENT_TYPES },
    { name: "_rels/.rels", data: ROOT_RELS },
    { name: "word/document.xml", data: b.xml() },
    { name: "word/_rels/document.xml.rels", data: DOC_RELS },
    { name: "word/styles.xml", data: stylesXml(fonts) },
    { name: "word/settings.xml", data: SETTINGS },
    { name: "word/footer1.xml", data: footerXml("right", fonts.page, 14) },
    { name: "word/footer2.xml", data: footerXml("left", fonts.page, 14) },
  ]);
}
