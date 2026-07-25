"""按「课代表失联」Figma 母版批量生成 AI 八卦特刊分享工牌。

角色原画、身份名和金句可替换；其余构图保持固定，保证四张工牌属于同一套
软雕塑 × 新闻剪报宇宙。测试入口上线后可传入 --url 替换占位二维码。
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
FONT_BOLD = "C:/Windows/Fonts/msyhbd.ttc"
FONT_REGULAR = "C:/Windows/Fonts/msyh.ttc"
CANVAS = (1080, 1920)
CREAM = "#f6eedb"
INK = "#28221b"
MUTED = "#786d5b"
RED = "#c44332"

OTHER_THREE = (
    {
        "source": ROOT / "static/ip/characters/ai-gossip-id-card-low-battery-reporter.png",
        "output": ROOT / "static/ip/badges/ai-gossip-share-badge-low-battery-reporter.png",
        "title": "电量见底\n记者",
        "quote": "我想知道，\n但脑子已经下班。",
        "art_x": 250,
        "temp": "TEMP. 01",
    },
    {
        "source": ROOT / "static/ip/characters/ai-gossip-id-card-press-release-escapee.png",
        "output": ROOT / "static/ip/badges/ai-gossip-share-badge-press-release-escapee.png",
        "title": "通稿\n逃犯",
        "quote": "我想吃瓜，\n但别让我看通稿。",
        "art_x": 280,
        "temp": "TEMP. 02",
    },
    {
        "source": ROOT / "static/ip/characters/ai-gossip-id-card-seen-unreplied-runner.png",
        "output": ROOT / "static/ip/badges/ai-gossip-share-badge-seen-unreplied-runner.png",
        "title": "已读未回\n选手",
        "quote": "我打开很多，\n真正进场总差最后一步。",
        "art_x": 280,
        "temp": "TEMP. 04",
    },
)


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size)


def fit_font(text: str, max_width: int, start_size: int) -> ImageFont.FreeTypeFont:
    size = start_size
    while size > 24:
        candidate = font(FONT_BOLD, size)
        if candidate.getbbox(text)[2] <= max_width:
            return candidate
        size -= 2
    return font(FONT_BOLD, 24)


def fit_multiline_font(text: str, max_width: int, start_size: int) -> ImageFont.FreeTypeFont:
    """让最长一行标题落在母版身份区的固定宽度内。"""
    size = start_size
    while size > 56:
        candidate = font(FONT_BOLD, size)
        if all(candidate.getbbox(line)[2] <= max_width for line in text.splitlines()):
            return candidate
        size -= 2
    return font(FONT_BOLD, 56)


def draw_qr_placeholder(draw: ImageDraw.ImageDraw, x: int, y: int) -> None:
    """仅保留版式位置；没有公开 URL 时不伪造可扫码二维码。"""
    pattern = (
        "111000101",
        "101010001",
        "111011111",
        "000100101",
        "110011000",
        "001101110",
        "111000011",
        "101110101",
        "111001111",
    )
    cell = 16
    for row, bits in enumerate(pattern):
        for col, bit in enumerate(bits):
            if bit == "1":
                color = RED if (row + col) % 4 == 0 else INK
                draw.rectangle(
                    (x + col * cell, y + row * cell, x + (col + 1) * cell - 1, y + (row + 1) * cell - 1),
                    fill=color,
                )


def draw_badge(
    source: Path,
    output: Path,
    title: str,
    quote: str,
    url: str = "",
    art_x: int = 210,
    temp: str = "TEMP. 03",
) -> None:
    img = Image.new("RGB", CANVAS, CREAM)
    draw = ImageDraw.Draw(img)

    # 仅保留母版定义的外框。
    draw.rectangle((48, 48, 1032, 1872), outline=INK, width=2)

    # 刊头
    draw.text((76, 88), "AI 八卦特刊", font=font(FONT_BOLD, 48), fill=INK)

    # 角色主视觉：830 × 1180，严格复用母版画面比例。
    art = Image.open(source).convert("RGB").resize((830, 1180), Image.Resampling.LANCZOS)
    img.paste(art, (art_x, 210))

    # 身份标题按长度自适应；刊头固定为母版标题基准 132 的小 4 号，
    # 避免四张工牌因身份名称长度不同而出现刊头字号不一致。
    title_font = fit_multiline_font(title, 500, 132)
    mast_font = font(FONT_BOLD, 128)
    draw.multiline_text(
        (76, 170), f"编辑部临时工牌\n{temp}",
        font=mast_font, fill=RED, spacing=16, stroke_width=5, stroke_fill=CREAM,
    )

    # 身份档案（唯一的内结构线是标签下的番茄红线）；叠字统一加奶油色描边保证可读。
    draw.text((78, 1048), "你的读瓜身份", font=font(FONT_BOLD, 27), fill=RED, stroke_width=4, stroke_fill=CREAM)
    draw.rectangle((78, 1090, 268, 1095), fill=RED)
    draw.multiline_text((76, 1115), title, font=title_font, fill=INK, spacing=12, stroke_width=6, stroke_fill=CREAM)
    title_bottom = draw.multiline_textbbox((76, 1115), title, font=title_font, spacing=12)[3]
    quote_y = max(1462, title_bottom + 48)
    draw.multiline_text((80, quote_y), quote, font=font(FONT_REGULAR, 42), fill=INK, spacing=12, stroke_width=4, stroke_fill=CREAM)

    # 传播页脚与二维码严格共享底部网格基线。
    draw.text((78, 1640), "AI GOSSIP WEB", font=font(FONT_BOLD, 44), fill=INK)
    draw.text((80, 1715), "扫码测试你的读瓜身份", font=font(FONT_BOLD, 34), fill=RED)
    if url:
        try:
            import qrcode
        except ImportError as exc:
            raise RuntimeError("二维码功能需要安装 qrcode[pil]") from exc
        qr = qrcode.QRCode(version=None, box_size=10, border=1)
        qr.add_data(url)
        qr.make(fit=True)
        qr_img = qr.make_image(fill_color=INK, back_color=CREAM).convert("RGB")
        qr_img.thumbnail((144, 144), Image.Resampling.LANCZOS)
        img.paste(qr_img, (804 + (144 - qr_img.width) // 2, 1608 + (144 - qr_img.height) // 2))
        draw.text((80, 1770), "测试入口", font=font(FONT_REGULAR, 23), fill=MUTED)
    else:
        draw_qr_placeholder(draw, 804, 1608)
        draw.text((80, 1770), "测试入口 URL 待接入", font=font(FONT_REGULAR, 23), fill=MUTED)
        draw.multiline_text((804, 1760), "QR\nTEST", font=font(FONT_BOLD, 21), fill=MUTED, spacing=4)

    output.parent.mkdir(parents=True, exist_ok=True)
    img.save(output, "PNG", optimize=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--title")
    parser.add_argument("--quote")
    parser.add_argument("--url", default="")
    parser.add_argument("--art-x", type=int, default=210)
    parser.add_argument("--temp", default="TEMP. 03")
    parser.add_argument(
        "--other-three",
        action="store_true",
        help="批量生成电量见底记者、通稿逃犯、已读未回选手三张工牌。",
    )
    args = parser.parse_args()
    if args.other_three:
        for badge in OTHER_THREE:
            draw_badge(**badge, url=args.url)
    else:
        missing = [name for name in ("source", "output", "title", "quote") if getattr(args, name) is None]
        if missing:
            parser.error(f"缺少参数：{', '.join('--' + name for name in missing)}")
        draw_badge(args.source, args.output, args.title, args.quote, args.url, args.art_x, args.temp)
