/**
 * 生成项目说明的公文格式 PDF（dogfooding：用本插件自己的 makePdf）。
 *
 * 用法：node examples/make-readme.js
 * 输出：docs/项目说明.pdf
 */
import fs from "node:fs";
import path from "node:path";
import { makePdf } from "../lib/tex.js";

export const SPEC = {
  title: "公文格式 DSH 插件项目说明",
  blocks: [
    {
      type: "body",
      text: "本插件为 DeepSeek Harness 的命令通道提供中文公文排版能力。中文公文的版式由 GB/T 9704—2012《党政机关公文格式》规定，参数琐碎且相互牵连：固定行距二十八磅、三号字折合十六磅、首行缩进两字折合六百四十 twips、发文机关标志须为红色小标宋、页码须单页居右双页居左。任一处记错，整份文件即不合规。本插件把上述机械部分固定为代码，由三个原生工具承担；内容组织、文种选择与措辞规范仍由使用者判断。",
    },
    { type: "h1", text: "一、功能构成" },
    {
      type: "body",
      text: "插件提供三个工具。gongwen_docx 用于生成符合国标的 DOCX，纯 JavaScript 实现，不依赖外部程序。gongwen_pdf 用于生成符合国标的 PDF，需本机安装 TeX Live 与中文字体。gongwen_check 用于校验既有 DOCX 或 PDF 的版面，输出逐项实测值与国标对照。",
    },
    { type: "h1", text: "二、版式实现" },
    { type: "h3", text: "1. 单位换算" },
    {
      type: "body",
      text: "OOXML 的长度单位为 twips，即二十分之一磅；字号单位为半磅。故一毫米等于五十六点六九二九 twips，三号字写作三十二。代码中以 mm() 与字号乘二的方式统一换算，不手写常数。",
    },
    { type: "h3", text: "2. 落款" },
    {
      type: "body",
      text: "成文日期长于发文机关署名时，按 GB/T 9704—2012 第 7.3.5.2 条，日期右空二字并相应增加署名右空字数，视觉结果为署名相对日期居中。若两行各自按固定字数右空，日期一行反而更靠左，呈现歪斜。",
    },
    { type: "h3", text: "3. 附件说明" },
    {
      type: "body",
      text: "「附件：」占三个字，首行左空二字后序号落在第五字，故续行亦须左空五字。写成六字则明显偏右，写成三字则偏左。",
    },
    { type: "h1", text: "三、校验能力" },
    {
      type: "body",
      text: "DOCX 的校验读取 sectPr 与 styles.xml，所得为精确值，覆盖页面尺寸、四边白边、版心、正文字号、行距与奇偶页设置。PDF 的校验仅能读取页面尺寸，方法为解压对象流后读取 MediaBox；四边白边需文字坐标，须改用配套技能的校验脚本。",
    },
    { type: "h1", text: "四、使用须知" },
    {
      type: "body",
      text: "示例文件中的机构名称、发文字号、日期与联系方式均属虚构，不指向任何真实存在的机关、企业或组织。使用本插件生成正式文件时，不得冒用真实机构的名称与文号；伪造国家机关公文可能触犯《刑法》第二百八十条。本插件不生成印章，公文生效依赖真实印章。",
    },
  ],
  signOrg: "dsh-tool-gongwen 项目组",
  signDate: "2026年10月26日",
};

const outDir = process.argv[2] || "docs";
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, "项目说明.pdf");
const r = makePdf(SPEC, out);
console.log(`已生成 ${r.path}`);
for (const f of r.fonts) console.log(`  ${f}`);
console.log(`  字节 ${fs.statSync(out).size}`);
