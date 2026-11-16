#!/usr/bin/env python3
"""Generate app icons for web and Android (legacy + adaptive + notification)."""
from __future__ import annotations

import os
from PIL import Image, ImageDraw

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
PRI = (39, 73, 201, 255)       # #2749C9
GOLD = (242, 183, 5, 255)      # #F2B705
WHITE = (255, 255, 255, 255)
LINE = (213, 220, 233, 255)
INK = (15, 26, 53, 255)
CLEAR = (0, 0, 0, 0)

DENSITIES = {
    "mdpi": 1,
    "hdpi": 1.5,
    "xhdpi": 2,
    "xxhdpi": 3,
    "xxxhdpi": 4,
}


def rounded_rect(draw, box, radius, fill):
    draw.rounded_rectangle(box, radius=max(1, int(radius)), fill=fill)


def draw_check(draw, cx, cy, size, color, width):
    x1 = cx - size * 0.42
    y1 = cy + size * 0.02
    x2 = cx - size * 0.10
    y2 = cy + size * 0.38
    x3 = cx + size * 0.46
    y3 = cy - size * 0.36
    draw.line([(x1, y1), (x2, y2), (x3, y3)], fill=color, width=max(2, int(width)))


def paint_notebook(draw, s, ox=0, oy=0):
    """Notebook + gold binding (RTL, right side) + lines + check. Coords in 1024 space."""
    l, t, r, b = ox + 250, oy + 198, ox + 774, oy + 848
    rad = s(56)
    rounded_rect(draw, [l, t, r, b], rad, WHITE)
    bind_w = s(72)
    rounded_rect(draw, [r - bind_w, t, r, b], rad, GOLD)
    draw.rectangle([r - bind_w, t, r - rad, b], fill=GOLD)
    for i in range(4):
        y = t + s(150) + i * s(92)
        rounded_rect(draw, [l + s(70), y, r - s(118), y + s(16)], s(8), LINE)
    cx, cy, cr = l + s(170), b - s(128), s(70)
    draw.ellipse([cx - cr, cy - cr, cx + cr, cy + cr], fill=PRI)
    draw_check(draw, cx, cy, s(78), WHITE, s(18))


def make_full(size):
    scale = size / 1024.0

    def s(v):
        return max(1, int(round(v * scale)))

    img = Image.new("RGBA", (size, size), PRI)
    draw = ImageDraw.Draw(img)
    # work in a 1024 buffer then resize for clean curves
    if size != 1024:
        base = make_full(1024)
        return base.resize((size, size), Image.Resampling.LANCZOS)
    paint_notebook(draw, s)
    return img


def make_foreground(size):
    if size != 1024:
        return make_foreground(1024).resize((size, size), Image.Resampling.LANCZOS)
    img = Image.new("RGBA", (1024, 1024), CLEAR)
    draw = ImageDraw.Draw(img)

    def s(v):
        return max(1, int(round(v)))

    paint_notebook(draw, s)
    return img


def make_round(size):
    sq = make_full(size)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, size - 1, size - 1], fill=255)
    out = Image.new("RGBA", (size, size), CLEAR)
    out.paste(sq, (0, 0))
    out.putalpha(mask)
    return out


def make_stat(size):
    """White silhouette for the status-bar notification icon."""
    if size < 48:
        src = make_stat(96)
        return src.resize((size, size), Image.Resampling.LANCZOS)
    img = Image.new("RGBA", (size, size), CLEAR)
    draw = ImageDraw.Draw(img)
    m = size * 0.14
    rounded_rect(draw, [m, m, size - m, size - m], size * 0.12, WHITE)
    # cut a hole so it reads as a page, then a check
    inner = Image.new("RGBA", (size, size), CLEAR)
    idraw = ImageDraw.Draw(inner)
    draw_check(idraw, size * 0.50, size * 0.52, size * 0.42, WHITE, max(2, int(size * 0.10)))
    # status icons must be white-on-transparent only; keep a simple check
    img = Image.new("RGBA", (size, size), CLEAR)
    draw = ImageDraw.Draw(img)
    draw_check(draw, size * 0.50, size * 0.52, size * 0.56, WHITE, max(2, int(size * 0.12)))
    return img


def save(img, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, "PNG")
    print("wrote", os.path.relpath(path, ROOT))


def main():
    full_1024 = make_full(1024)
    fg_1024 = make_foreground(1024)
    save(full_1024, os.path.join(ROOT, "resources", "icon.png"))
    save(fg_1024, os.path.join(ROOT, "resources", "icon-foreground.png"))
    save(make_full(512), os.path.join(ROOT, "www", "icon.png"))
    save(make_full(192), os.path.join(ROOT, "www", "icon-192.png"))

    android = os.path.join(ROOT, "resources", "android")
    for name, d in DENSITIES.items():
        mip = os.path.join(android, "mipmap-" + name)
        drw = os.path.join(android, "drawable-" + name)
        save(make_full(int(48 * d)), os.path.join(mip, "ic_launcher.png"))
        save(make_round(int(48 * d)), os.path.join(mip, "ic_launcher_round.png"))
        save(make_foreground(int(108 * d)), os.path.join(mip, "ic_launcher_foreground.png"))
        save(make_stat(int(24 * d)), os.path.join(drw, "ic_stat_icon.png"))

    xml_dir = os.path.join(android, "mipmap-anydpi-v26")
    os.makedirs(xml_dir, exist_ok=True)
    adaptive = """<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
"""
    for n in ("ic_launcher.xml", "ic_launcher_round.xml"):
        p = os.path.join(xml_dir, n)
        with open(p, "w", encoding="utf-8") as f:
            f.write(adaptive)
        print("wrote", os.path.relpath(p, ROOT))

    values = os.path.join(android, "values")
    os.makedirs(values, exist_ok=True)
    colors = """<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#2749C9</color>
</resources>
"""
    p = os.path.join(values, "ic_launcher_background.xml")
    with open(p, "w", encoding="utf-8") as f:
        f.write(colors)
    print("wrote", os.path.relpath(p, ROOT))


if __name__ == "__main__":
    main()
