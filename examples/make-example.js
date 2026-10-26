/**
 * 生成示例公文（关于规范文档输出格式的通知）。
 *
 * 用法：node examples/make-example.js [输出目录]
 */
import fs from "node:fs";
import path from "node:path";
import { makeDocx } from "../lib/docx.js";

export const SPEC = {
  org: "大肥鱼俱乐部文件",
  docno: "肥字〔2026〕7 号",
  title: "关于规范文档输出格式的通知",
  to: "各部门、各项目组：",
  blocks: [
    {
      type: "body",
      text: "为统一文档输出格式，提高公文的规范性与可读性，经研究决定，自本通知印发之日起，凡以本单位名义对外报送、对内印发的正式文档，一律按 GB/T 9704—2012《党政机关公文格式》排版。现将有关事项通知如下。",
    },
    { type: "h1", text: "一、适用范围" },
    { type: "h2", text: "（一）适用文档" },
    {
      type: "body",
      text: "通知、报告、请示、批复、函、纪要、方案、总结、汇报材料等正式文档，均适用本通知。",
    },
    { type: "h2", text: "（二）不适用情形" },
    {
      type: "body",
      text: "以代码清单、宽表格或大量数学公式为主体的技术文档，因三号字版心每行仅容二十八字，强行套用会导致断行混乱，可沿用技术文档体例，但须在文档首页注明体例名称。",
    },
    { type: "h1", text: "二、版式要求" },
    { type: "h3", text: "1. 页面与版心" },
    {
      type: "body",
      text: "采用 A4 纸，天头三十七毫米，订口二十八毫米，右白边二十六毫米，下白边三十五毫米，版心一百五十六毫米乘二百二十五毫米。",
    },
    { type: "h3", text: "2. 字体与字号" },
    {
      type: "body",
      text: "正文用三号仿宋，固定行距二十八磅，首行缩进两字；文件标题用二号小标宋；一级标题用三号黑体，二级标题用三号楷体，三级标题用三号仿宋加粗。",
    },
    { type: "h3", text: "3. 页码" },
    {
      type: "body",
      text: "页码用四号宋体，数字两侧各置一条一字线，单页居右，双页居左。",
    },
    { type: "h1", text: "三、执行要求" },
    {
      type: "body",
      text: "各部门应指定专人负责格式审核。文件印发前，须核对页边距、字号、行距与页码四项。发现偏差的，退回修改后重新报送。",
    },
    {
      type: "body",
      text: "已有模板不符合上述要求的，应于本月底前完成修订。格式核查中遇到技术问题，及时与大肥鱼俱乐部联系。",
    },
    { type: "body", text: "本通知自印发之日起执行。" },
  ],
  attachments: ["1. 公文格式自查表", "2. 版式参数对照表"],
  signOrg: "大肥鱼俱乐部",
  signDate: "2026年10月26日",
};

const outDir = process.argv[2] || "examples";
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, "notice.docx");
fs.writeFileSync(out, makeDocx(SPEC));
console.log(`已生成 ${out}（${fs.statSync(out).size} 字节）`);
