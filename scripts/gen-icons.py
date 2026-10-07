# -*- coding: utf-8 -*-
"""
gen-icons.py · 生成全部 PWA / iOS 图标
主视觉：像素苹果 + 线条小狗 + 层次草地 + 像素小花 + 暖棕波点
背景：#FDF8EC（奶油米黄）  苹果：像素红  小狗：深棕线条
用法： python scripts/gen-icons.py
"""
from __future__ import annotations

import math
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "icons")

CREAM = (253, 248, 236, 255)
DOT = (220, 201, 166, 90)
GRASS = ["#8FB683", "#A3C795", "#6E9A5F", "#7DBF8A", "#4F7040", "#5A7A4A", "#436034"]

APPLE_ART = [
    (5, 5, 6, 1, "r"), (4, 6, 8, 1, "r"), (3, 7, 10, 6, "r"),
    (4, 13, 8, 1, "r"), (5, 14, 6, 1, "r"),
    (5, 7, 2, 2, "e"), (4, 8, 2, 3, "e"),
    (7, 2, 2, 3, "b"), (9, 2, 3, 1, "l"), (10, 1, 2, 2, "l"),
]
PAL = {
    "r": (214, 69, 80, 255), "e": (233, 137, 143, 255), "b": (139, 107, 71, 255),
    "l": (125, 191, 138, 255), "g": (90, 122, 74, 255), "h": (240, 213, 140, 255),
    "n": (232, 168, 124, 255), "w": (253, 248, 236, 255),
}
DOG = (91, 64, 48, 255)


def cubic(p0, p1, p2, p3, n=28):
    pts = []
    for i in range(n + 1):
        t = i / n
        mt = 1 - t
        x = mt**3 * p0[0] + 3 * mt**2 * t * p1[0] + 3 * mt * t**2 * p2[0] + t**3 * p3[0]
        y = mt**3 * p0[1] + 3 * mt**2 * t * p1[1] + 3 * mt * t**2 * p2[1] + t**3 * p3[1]
        pts.append((x, y))
    return pts


def draw_grass(base: Image.Image, S: int) -> None:
    d = ImageDraw.Draw(base, "RGBA")
    top = int(S * 0.755)
    bands = 4
    band = (S - top) / bands
    for i in range(bands):
        y = top + i * band
        color = GRASS[i * 2 % len(GRASS)]
        alt = GRASS[(i * 2 + 1) % len(GRASS)]
        d.rectangle([0, y, S, y + band], fill=color)
        # 深浅色块交错，制造回归/立体质感
        block = S / 16
        for k in range(0, 16, 2):
            d.rectangle([k * block, y, (k + 1) * block, y + band], fill=alt)

    # 像素草丛
    blades = [(0.06, 0.11), (0.17, 0.16), (0.30, 0.09), (0.44, 0.18), (0.58, 0.12),
              (0.72, 0.17), (0.85, 0.10), (0.94, 0.15)]
    for idx, (bx, bh) in enumerate(blades):
        x = int(bx * S)
        h = int(bh * S)
        base_y = int(S * (0.775 + (idx % 2) * 0.035))
        step = max(2, int(S * 0.016))
        k = 0
        while k < h:
            off = 0 if (k // step) % 2 == 0 else int(step * 0.7)
            d.rectangle([x + off, base_y - k, x + off + step, base_y - k + step],
                        fill=GRASS[3] if k > h / 2 else GRASS[5])
            k += step

    # 像素树
    for tx, ty, sc in ((0.13, 0.70, 1.0), (0.87, 0.685, 1.15)):
        cx, cy = int(tx * S), int(ty * S)
        cw = max(3, int(S * 0.018 * sc))
        for i in range(5):
            w = int(S * (0.05 + i * 0.028) * sc)
            d.rectangle([cx - w, cy - i * cw * 1.1, cx + w, cy - i * cw * 1.1 + cw],
                        fill=(79, 112, 64, 255) if i < 2 else (90, 122, 74, 255))
        d.rectangle([cx - cw * 0.6, cy, cx + cw * 0.6, cy + cw * 4], fill=(139, 107, 71, 255))

    # 像素小花
    for fx, fy, col in ((0.235, 0.795, (233, 137, 143, 255)),
                        (0.55, 0.815, (240, 213, 140, 255)),
                        (0.795, 0.79, (232, 168, 124, 255))):
        x, y = int(fx * S), int(fy * S)
        p = max(2, int(S * 0.011))
        d.rectangle([x, y + p, x + p, y + p * 5], fill=(90, 122, 74, 255))
        for dx, dy in ((-p * 2, 0), (p * 2, 0), (0, -p * 2)):
            d.rectangle([x + dx, y + dy, x + dx + p * 2, y + dy + p * 2], fill=col)
        d.rectangle([x, y + p, x + p, y + p * 2], fill=(240, 213, 140, 255))

    # 暖棕波点（治愈感）
    for dx, dy, r in ((0.08, 0.12, 0.011), (0.24, 0.07, 0.008), (0.83, 0.10, 0.012),
                      (0.92, 0.22, 0.008), (0.66, 0.05, 0.007)):
        cx, cy, rr = int(dx * S), int(dy * S), max(1, int(r * S))
        d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=DOT)


def draw_art(overlay: Image.Image, S: int) -> None:
    """在透明层上画像素苹果 + 线条小狗"""
    d = ImageDraw.Draw(overlay, "RGBA")

    # ---- 像素苹果 ----
    cell = S * 0.044
    ox, oy = S * 0.32 - 8 * cell, S * 0.86 - 15 * cell
    for gx, gy, gw, gh, ck in APPLE_ART:
        d.rectangle([ox + gx * cell, oy + gy * cell,
                     ox + (gx + gw) * cell, oy + (gy + gh) * cell], fill=PAL[ck])

    # ---- 线条小狗 ----
    k = S * 0.0060

    def P(x, y):
        return (ox2 + x * k, oy2 + y * k)

    ox2, oy2 = S * 0.92 - 55 * k, S * 0.90 - 60 * k
    lw = max(2, int(2.6 * k))

    def line(pts, width=None):
        d.line([P(*p) for p in pts], fill=DOG, width=width or lw, joint="curve")

    # 头
    hx, hy = P(32, 22)
    r = 12 * k
    d.ellipse([hx - r, hy - r, hx + r, hy + r], outline=DOG, width=lw)
    # 耳朵
    line(cubic((20, 16), (14, 14), (10, 19), (11, 25)) + cubic((11, 25), (12, 31), (16, 34), (20, 31)))
    line(cubic((44, 16), (50, 14), (54, 19), (53, 25)) + cubic((53, 25), (52, 31), (48, 34), (44, 31)))
    # 眼睛
    for ex, ey in ((27, 20), (37, 20)):
        px, py = P(ex, ey)
        er = max(1.5, 1.7 * k)
        d.ellipse([px - er, py - er, px + er, py + er], fill=DOG)
    # 鼻子
    nx, ny = P(32, 27.4)
    nr = 2.7 * k
    d.ellipse([nx - nr, ny - nr, nx + nr, ny + nr], fill=DOG)
    # 嘴
    line([(32, 30), (32, 33)])
    line(cubic((32, 33), (30.2, 36), (27, 36.2), (24.8, 34.2)))
    line(cubic((32, 33), (33.8, 36), (37, 36.2), (39.2, 34.2)))
    # 身体
    body = cubic((22, 34), (18, 42), (20, 50), (26, 54))
    body += cubic((26, 54), (30, 54), (34, 54), (38, 54))
    body += cubic((38, 54), (44, 50), (46, 42), (42, 34))
    line(body)
    # 前腿
    line([(26, 54), (26, 60)])
    line([(38, 54), (38, 60)])
    # 尾巴
    line(cubic((46, 36), (52, 34), (55, 41), (52, 47)))


def render(S: int, art_scale: float = 1.0) -> Image.Image:
    base = Image.new("RGBA", (S, S), CREAM)
    draw_grass(base, S)

    overlay = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    big = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    draw_art(big, S)
    if art_scale != 1.0:
        ns = max(8, int(S * art_scale))
        big = big.resize((ns, ns), Image.LANCZOS)
        overlay.alpha_composite(big, ((S - ns) // 2, (S - ns) // 2))
    else:
        overlay = big
    base.alpha_composite(overlay)
    return base.convert("RGB")


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    targets = [
        ("icon-1024.png", 1024, 1.0),
        ("icon-512.png", 512, 1.0),
        ("icon-512-maskable.png", 512, 0.72),
        ("icon-384.png", 384, 1.0),
        ("icon-192.png", 192, 1.0),
        ("icon-144.png", 144, 1.0),
        ("apple-touch-icon-180.png", 180, 1.0),
        ("apple-touch-icon-167.png", 167, 1.0),
        ("apple-touch-icon-152.png", 152, 1.0),
        ("apple-touch-icon-120.png", 120, 1.0),
        ("favicon-32.png", 32, 1.0),
    ]
    for name, size, scale in targets:
        img = render(size, scale)
        path = os.path.join(OUT, name)
        img.save(path, "PNG", optimize=True)
        print(f"  [ok] {name}  {size}x{size}  {os.path.getsize(path) // 1024} KB")
    print(f"\nall icons -> {OUT}")


if __name__ == "__main__":
    main()
