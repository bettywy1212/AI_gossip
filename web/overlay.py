"""漫画中文叠字（Pillow 实现，跨平台，替代 scripts/overlay-text.ps1 的人工流程）

生图 prompt 要求顶部 25% 留净空，这里在净空区叠「黑底半透明条 + 白字标题」，
风格对应 references/illustration-guide.md 的日常轻漫画规范。
"""

from __future__ import annotations

import io
import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

# 按优先级找中文粗体字体；FONT_PATH 环境变量可覆盖（Linux 部署时指到打包字体）
_FONT_CANDIDATES = [
    os.getenv("FONT_PATH", ""),
    "C:/Windows/Fonts/msyhbd.ttc",   # 微软雅黑 Bold
    "C:/Windows/Fonts/msyh.ttc",     # 微软雅黑
    "C:/Windows/Fonts/simhei.ttf",   # 黑体
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
    "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
]


def _find_font() -> str:
    for p in _FONT_CANDIDATES:
        if p and Path(p).exists():
            return p
    raise FileNotFoundError("找不到中文字体，请设置 FONT_PATH 环境变量")


def overlay_title(png_bytes: bytes, title: str) -> bytes:
    """在图片顶部净空区叠加中文标题，返回新的 PNG 字节。"""
    title = (title or "").strip()
    if not title:
        return png_bytes

    img = Image.open(io.BytesIO(png_bytes)).convert("RGBA")
    w, h = img.size

    # 字号：标题占宽度约 88%，同时不超过顶部净空区（25%）的 55%
    font_path = _find_font()
    size = int(w * 0.88 / max(len(title), 1))
    size = min(size, int(h * 0.25 * 0.55))
    size = max(size, 18)
    font = ImageFont.truetype(font_path, size)

    draw = ImageDraw.Draw(img)
    bbox = draw.textbbox((0, 0), title, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]

    pad_x, pad_y = int(size * 0.55), int(size * 0.35)
    bar_w, bar_h = tw + pad_x * 2, th + pad_y * 2
    bar_x = (w - bar_w) // 2
    bar_y = int(h * 0.045)

    # 半透明黑条（圆角）+ 白字，微弱描边保证任何底色可读
    bar = Image.new("RGBA", (bar_w, bar_h), (0, 0, 0, 0))
    ImageDraw.Draw(bar).rounded_rectangle(
        [0, 0, bar_w - 1, bar_h - 1], radius=int(size * 0.3), fill=(20, 18, 24, 200)
    )
    img.alpha_composite(bar, (bar_x, bar_y))
    draw.text(
        (bar_x + pad_x - bbox[0], bar_y + pad_y - bbox[1]),
        title,
        font=font,
        fill=(255, 255, 255, 255),
        stroke_width=max(1, size // 28),
        stroke_fill=(20, 18, 24, 255),
    )

    out = io.BytesIO()
    img.convert("RGB").save(out, format="PNG")
    return out.getvalue()
