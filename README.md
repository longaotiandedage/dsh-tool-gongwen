# dsh-tool-gongwen

DSH 插件：按 **GB/T 9704—2012《党政机关公文格式》** 生成与校验中文公文。

提供三个原生工具，无需模型自己抄写 OOXML：

| 工具 | 作用 | 依赖 |
|---|---|---|
| `gongwen_docx` | 生成合规格的 DOCX | 无（纯 JS） |
| `gongwen_pdf` | 生成合规格的 PDF | 本机 xelatex + 中文字体 |
| `gongwen_check` | 校验既有 DOCX / PDF 的版面 | 无 |

## 为什么做成插件

公文版式的难点不在"写什么"，而在**一堆容易记错的常量**：行距是 560 twips、
字号是半磅所以三号写作 32、首行缩进 2 字符等于 640 twips、分隔线要用段落边框、
奇偶页页码要改 `settings.xml`……这些每次手写都会错一处。

插件把机械部分固定下来，模型只负责内容和文种判断。技能 `gongwen-format`
仍负责"怎么写"，两者互补。

## 安装

插件是标准的 cordis 插件包，通过 profile 加载。

```bash
# 方式一：从 npm（发布后）
cd ~/.dsh/profiles/desktop
pnpm add dsh-tool-gongwen

# 方式二：本地开发
pnpm add "file:/path/to/dsh-tool-gongwen"
```

然后在 profile 的 `package.json` 里加入 bundles：

```json
{
  "dsh": {
    "profile": {
      "bundles": [
        "...",
        "dsh-tool-gongwen"
      ]
    }
  }
}
```

重启 DSH 或等待 HMR 重新加载。

## 用法

### 生成 DOCX

```
gongwen_docx({
  org: "华中科技大学教务处文件",
  docno: "教字〔2026〕15 号",
  title: "关于开展数值方法课程资源建设的通知",
  to: "各教学单位：",
  blocks: [
    { type: "body", text: "为加强……现将有关事项通知如下。" },
    { type: "h1", text: "一、建设目标" },
    { type: "h2", text: "（一）总体要求" },
    { type: "h3", text: "1. 讲义建设" },
    { type: "body", text: "编写中文讲义一部……" }
  ],
  attachments: ["1. 任务分工表", "2. 体例说明"],
  signOrg: "华中科技大学教务处",
  signDate: "2026年10月26日",
  output: "notice.docx"
})
```

### 生成 PDF

参数完全相同，`output` 换成 `.pdf` 即可。

### 校验

```
gongwen_check({ path: "notice.docx" })
```

输出逐项实测值与国标对照：

```
项目                    实测      国标   判定
页面宽                  210     210   OK
上白边（天头）               37      37   OK
版心宽                  156     156   OK
正文字号                  16      16   OK pt
行距                    28      28   OK pt
奇偶页不同页码                1       1   OK
结论：符合 GB/T 9704—2012
```

## 内容规格

| 字段 | 必需 | 说明 |
|---|---|---|
| `org` | 否 | 发文机关标志，红色小标宋、居中 |
| `docno` | 否 | 发文字号，其后自动加红色分隔线 |
| `title` | 建议 | 文件标题，二号小标宋、居中 |
| `to` | 否 | 主送机关，顶格 |
| `blocks` | 是 | 正文块序列，见下 |
| `attachments` | 否 | 附件说明，左空二字 |
| `signOrg` | 否 | 发文机关署名，右空二字 |
| `signDate` | 否 | 成文日期，右空四字 |
| `output` | 是 | 输出路径，相对路径按会话工作目录解析 |

块类型：`h1`（一、黑体）、`h2`（（一）楷体）、`h3`（1. 仿宋加粗）、
`to`（主送机关）、`body`（正文，首行缩进两字）。

## 版式实现

| 项目 | 值 | OOXML 写法 |
|---|---|---|
| 页面 | A4 210×297 mm | `<w:pgSz w:w="11906" w:h="16838"/>` |
| 天头 | 37 mm | `w:top="2098"`（twips） |
| 订口 | 28 mm | `w:left="1587"` |
| 右白边 | 26 mm | `w:right="1474"` |
| 下白边 | 35 mm | `w:bottom="1984"` |
| 正文 | 三号仿宋 16 pt | `<w:sz w:val="32"/>`（半磅） |
| 行距 | 固定 28 磅 | `w:line="560" w:lineRule="exact"` |
| 首行缩进 | 2 字符 | `w:firstLine="640"`（32 pt） |
| 奇偶页页码 | 单页右、双页左 | `evenAndOddHeaders` + 两个 footer |

长度单位换算是 `1 mm = 56.6929 twips`，代码里由 `mm()` 统一处理。

## 零依赖

DOCX 生成与 ZIP 读写全部自己实现（`lib/zip.js`、`lib/docx.js`），
只用 Node 内置的 `zlib` 与 `crypto` 以外的东西一概不引。

这样做的原因是插件运行在用户的 DSH 安装目录里，多一个 npm 依赖就多一处
安装失败的可能。代价是代码量大一些。

PDF 路线额外需要 xelatex，找不到时会给出明确错误而非静默失败。

## 校验的边界

- **DOCX**：读 `sectPr` 与 `styles.xml`，值精确，覆盖页面尺寸、四边白边、
  版心、正文字号、行距、奇偶页页码。
- **PDF**：只校验页面尺寸（解压对象流读 `MediaBox`）。白边需要文字坐标，
  本包不引入 PDF 解析器，请用技能 `gongwen-format` 里的
  `scripts/verify_layout.py`（依赖 PyMuPDF）。

## 示例

`examples/make-example.js` 生成一份《关于规范文档输出格式的通知》：

```bash
node examples/make-example.js examples
```

产出 `notice.docx` 与 `notice.pdf` 各一份，均已通过 `gongwen_check` 校验。

## 许可

MIT。
