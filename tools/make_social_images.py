# -*- coding: utf-8 -*-
r"""把公文渲染成抖音图文用的图片。

产出：
  raw/          每页高清原图（200 dpi），供自行剪辑
  vertical/     1080×1920（9:16）
  feed/         1080×1440（3:4，抖音图文推荐比例）
  cover/        版头特写，作封面用

用法：python make_social_images.py <pdf> <输出目录>
"""
import pathlib
import sys

import fitz
from PIL import Image, ImageDraw, ImageFilter

DPI = 200
BG = (247, 246, 243)          # 浅暖灰
PAGE_WIDE = 980
PAGE_NARROW = 940
SHADOW_BLUR = 16
SHADOW_ALPHA = 64

SIZES = {
    "vertical": (1080, 1920, PAGE_WIDE, 130),    # 名称 -> (画布宽, 画布高, 页面宽, 上边距)
    "feed": (1080, 1440, PAGE_NARROW, 70),
}


def render_raw(pdf_path: pathlib.Path, out_dir: pathlib.Path):
    doc = fitz.open(str(pdf_path))
    out_dir.mkdir(parents=True, exist_ok=True)
    paths = []
    for i in range(doc.page_count):
        pix = doc[i].get_pixmap(dpi=DPI)
        p = out_dir / f"page{i + 1}.png"
        pix.save(str(p))
        paths.append(p)
    return doc, paths


def finish_page(src: Image.Image, target_w: int) -> Image.Image:
    ratio = target_w / src.width
    page = src.resize((target_w, round(src.height * ratio)), Image.LANCZOS)
    white = Image.new("RGB", page.size, "white")
    white.paste(page, (0, 0))
    return white


def compose(page: Image.Image, size: tuple, out_path: pathlib.Path):
    cw, ch, pw, top = size
    page = finish_page(page, pw)

    canvas = Image.new("RGB", (cw, ch), BG)
    x = (cw - page.width) // 2
    y = top

    shadow = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    d = ImageDraw.Draw(shadow)
    d.rectangle([x + 3, y + 9, x + page.width + 3, y + page.height + 9],
                fill=(0, 0, 0, SHADOW_ALPHA))
    shadow = shadow.filter(ImageFilter.GaussianBlur(SHADOW_BLUR))
    canvas = Image.alpha_composite(canvas.convert("RGBA"), shadow).convert("RGB")

    canvas.paste(page, (x, y))
    d = ImageDraw.Draw(canvas)
    d.rectangle([x, y, x + page.width - 1, y + page.height - 1],
                outline=(212, 209, 203), width=1)
    canvas.save(out_path, "PNG", optimize=True)
    return canvas.size, y + page.height


def make_cover(pdf_path: pathlib.Path, out_path: pathlib.Path,
               top_mm: float = 18, bottom_mm: float = 95):
    """版头特写：裁出机关标志或标题区，放大后居中，作封面。

    裁切范围按文档而定：有红色版头的取 18–95 mm；
    无版头、仅标题的取 25–62 mm 左右。
    """
    doc = fitz.open(str(pdf_path))
    page = doc[0]
    mm = 72 / 25.4
    clip = fitz.Rect(0, top_mm * mm, page.rect.width, bottom_mm * mm)
    pix = page.get_pixmap(dpi=300, clip=clip)
    header = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)

    cw, ch = 1080, 1440
    canvas = Image.new("RGB", (cw, ch), BG)
    target_w = 940
    ratio = target_w / header.width
    header = header.resize((target_w, round(header.height * ratio)), Image.LANCZOS)

    card_h = header.height
    card = Image.new("RGB", (target_w, card_h), "white")
    card.paste(header, (0, 0))

    x = (cw - card.width) // 2
    y = (ch - card.height) // 2

    shadow = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    d = ImageDraw.Draw(shadow)
    d.rectangle([x + 4, y + 14, x + card.width + 4, y + card.height + 14],
                fill=(0, 0, 0, 80))
    shadow = shadow.filter(ImageFilter.GaussianBlur(22))
    canvas = Image.alpha_composite(canvas.convert("RGBA"), shadow).convert("RGB")
    canvas.paste(card, (x, y))
    d = ImageDraw.Draw(canvas)
    d.rectangle([x, y, x + card.width - 1, y + card.height - 1],
                outline=(212, 209, 203), width=1)

    canvas.save(out_path, "PNG", optimize=True)
    return canvas.size


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    opts = {}
    for a in sys.argv[1:]:
        if a.startswith("--cover-top="):
            opts["top"] = float(a.split("=", 1)[1])
        elif a.startswith("--cover-bottom="):
            opts["bottom"] = float(a.split("=", 1)[1])
    pdf = pathlib.Path(args[0])
    root = pathlib.Path(args[1])
    root.mkdir(parents=True, exist_ok=True)

    doc, raw = render_raw(pdf, root / "raw")
    print(f"原图：{len(raw)} 页，{DPI} dpi")

    for name, size in SIZES.items():
        d = root / name
        d.mkdir(exist_ok=True)
        print(f"\n{name}  {size[0]}x{size[1]}：")
        for i, p in enumerate(raw, 1):
            src = Image.open(p)
            out = d / f"{i:02d}.png"
            sz, bottom_px = compose(src, size, out)
            print(f"  {out.name}  {sz[0]}x{sz[1]}  页面底边 y={bottom_px}")

    (root / "cover").mkdir(exist_ok=True)
    cov = make_cover(pdf, root / "cover" / "00.png",
                     opts.get("top", 18), opts.get("bottom", 95))
    print(f"\n封面 cover/00.png  {cov[0]}x{cov[1]}")


if __name__ == "__main__":
    main()
