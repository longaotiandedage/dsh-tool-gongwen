/**
 * dsh-tool-gongwen — DSH 插件入口。
 *
 * 三个工具：
 *   gongwen_docx   按国标生成 DOCX（纯 JS，零外部依赖）
 *   gongwen_pdf    按国标生成 PDF（需本机 xelatex）
 *   gongwen_check  校验既有 DOCX / PDF 的版面
 *
 * 插件契约与官方工具包一致：导出 name / Config / inject / apply。
 */

import fs from "node:fs";
import path from "node:path";
import z from "@deepseek-ai/schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";

import { makeDocx } from "./docx.js";
import { makePdf } from "./tex.js";
import { checkLayout, formatReport } from "./check.js";

/** 插件在 Loader 中的稳定标识。 */
export const name = "gongwen";

/** 配置：字体名可按平台覆盖，xelatex 路径可指定。 */
export const Config = z.object({
  fonts: z.object({
    body: z.string().default("仿宋"),
    h1: z.string().default("黑体"),
    h2: z.string().default("楷体"),
    page: z.string().default("宋体"),
    display: z.string().default("华文中宋"),
  }).default({}),
});

/** 依赖的宿主服务。 */
export const inject = ["tools", "workingDirectory"];

const blocksSchema = {
  type: "array",
  description:
    "正文块序列。type 取 h1/h2/h3/to/body：h1 一级标题（一、）、h2 二级标题（（一））、h3 三级标题（1.）、to 主送机关、body 普通段落。",
  items: {
    type: "object",
    additionalProperties: false,
    properties: {
      type: {
        type: "string",
        required: true,
        description: "块类型：h1 | h2 | h3 | to | body",
      },
      text: { type: "string", required: true, description: "该块的文字内容" },
    },
  },
};

const commonParams = {
  org: { type: "string", description: "发文机关标志，如「××大学教务处文件」。红色小标宋、居中。" },
  orgBold: { type: "boolean", description: "发文机关标志是否加粗（肥字）。默认不加粗。" },
  docno: { type: "string", description: "发文字号，如「教字〔2026〕15 号」。其后自动加红色分隔线。" },
  title: { type: "string", description: "文件标题。二号小标宋、居中。" },
  to: { type: "string", description: "主送机关，如「各教学单位：」。顶格。" },
  blocks: blocksSchema,
  attachments: {
    type: "array",
    description: "附件说明，如 [\"1. 任务分工表\", \"2. 体例说明\"]。首行左空二字，续行对齐到「1.」所在的第 5 字（「附件：」占 3 字）。",
    items: { type: "string" },
  },
  signOrg: { type: "string", description: "发文机关署名，右空二字。" },
  signDate: { type: "string", description: "成文日期，右空四字。建议写「2026年10月26日」。" },
  output: {
    type: "string",
    required: true,
    description: "输出文件路径。相对路径以会话工作目录为基准。",
  },
};

function resolveOutput(exec, cwd, output) {
  if (typeof output !== "string" || output.trim() === "") {
    throw new Error("output 不能为空");
  }
  const target = path.isAbsolute(output) ? output : path.resolve(cwd, output);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  return target;
}

function specFrom(args) {
  return {
    org: args.org,
    orgBold: args.orgBold,
    docno: args.docno,
    title: args.title,
    to: args.to,
    blocks: args.blocks ?? [],
    attachments: args.attachments,
    signOrg: args.signOrg,
    signDate: args.signDate,
  };
}

const outSchema = {
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      path: { type: "string", required: true },
      bytes: { type: "integer", required: true },
      notes: { type: "array", items: { type: "string" } },
    },
  },
  render: (_args, value) => [
    {
      type: "text",
      text: `已生成 ${value.path}（${value.bytes} 字节）` +
        (value.notes?.length ? `\n${value.notes.join("\n")}` : ""),
    },
  ],
};

/** 注册三个公文工具。 */
export function apply(ctx, config) {
  const fonts = { ...(config?.fonts ?? {}) };

  ctx.tools.register(
    defineTool({
      name: "gongwen_docx",
      description:
        "按 GB/T 9704—2012《党政机关公文格式》生成中文公文 DOCX。版式：A4、天头 37mm、订口 28mm、版心 156×225mm、正文三号仿宋、固定行距 28 磅、首行缩进 2 字、三级标题体系（黑体/楷体/仿宋加粗）、奇偶页不同页码、红色发文机关标志与分隔线。纯 JS 实现，不需要外部程序。",
      parameters: commonParams,
      output: outSchema,
      async execute(args, exec) {
        const cwd = await ctx.workingDirectory.ensure(exec.agent, exec.signal);
        const target = resolveOutput(exec, cwd, args.output);
        const buf = makeDocx({ ...specFrom(args), fonts });
        fs.writeFileSync(target, buf);
        exec.signal.throwIfAborted();
        return { path: target, bytes: buf.length, notes: ["字体替代情况请用 gongwen_check 或自行核对。"] };
      },
    }),
  );

  ctx.tools.register(
    defineTool({
      name: "gongwen_pdf",
      description:
        "按 GB/T 9704—2012 生成中文公文 PDF。需要本机安装 TeX Live（xelatex）与中文字体；缺字体时自动降级并在结果里说明。内容参数与 gongwen_docx 相同。",
      parameters: commonParams,
      output: outSchema,
      async execute(args, exec) {
        const cwd = await ctx.workingDirectory.ensure(exec.agent, exec.signal);
        const target = resolveOutput(exec, cwd, args.output);
        const result = makePdf(specFrom(args), target);
        exec.signal.throwIfAborted();
        return {
          path: result.path,
          bytes: fs.statSync(result.path).size,
          notes: result.fonts ?? [],
        };
      },
    }),
  );

  ctx.tools.register(
    defineTool({
      name: "gongwen_check",
      description:
        "校验一个 DOCX 或 PDF 是否符合 GB/T 9704—2012 的版面要求：页面尺寸、四边白边、版心、正文字号、行距、奇偶页页码。返回逐项实测值与判定。",
      parameters: {
        path: {
          type: "string",
          required: true,
          description: "要校验的文件路径，支持 .docx 与 .pdf。",
        },
      },
      output: {
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            ok: { type: "boolean", required: true },
            report: { type: "string", required: true },
          },
        },
        render: (_args, value) => [{ type: "text", text: value.report }],
      },
      async execute(args, exec) {
        const cwd = await ctx.workingDirectory.ensure(exec.agent, exec.signal);
        const target = path.isAbsolute(args.path) ? args.path : path.resolve(cwd, args.path);
        if (!fs.existsSync(target)) throw new Error(`文件不存在：${target}`);
        const result = checkLayout(target);
        exec.signal.throwIfAborted();
        return { ok: result.ok, report: formatReport(result) };
      },
    }),
  );
}
