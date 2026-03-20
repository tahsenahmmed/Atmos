#!/usr/bin/env python3
"""
Generate all ATMOS PWA icons.
Run: python3 gen_icons.py
Requires: Pillow  →  pip install Pillow
"""
import os, math
from PIL import Image, ImageDraw, ImageFont

SIZES = [72, 96, 128, 144, 152, 192, 384, 512]
OUT   = os.path.join(os.path.dirname(__file__), 'icons')
os.makedirs(OUT, exist_ok=True)

BG      = (4, 9, 15)       # --bg
ACCENT  = (79, 195, 247)   # --accent
WHITE   = (221, 238, 255)

def draw_icon(size):
    img  = Image.new('RGBA', (size, size), (0,0,0,0))
    draw = ImageDraw.Draw(img)
    pad  = size * 0.08
    r    = size * 0.22

    # Background rounded rect
    draw.rounded_rectangle([pad, pad, size-pad, size-pad],
                           radius=r, fill=BG + (255,))

    # Subtle gradient overlay (manual circles for depth)
    for i in range(6):
        alpha = int(18 - i * 2)
        offset = size * 0.12 * i
        draw.ellipse([-offset, -offset, size * 0.9 - offset, size * 0.9 - offset],
                     fill=ACCENT + (alpha,))

    # Cloud shape
    cx, cy = size * 0.5, size * 0.54
    cr = size * 0.18
    draw.ellipse([cx-cr, cy-cr*0.6, cx+cr, cy+cr*0.6], fill=WHITE+(210,))
    draw.ellipse([cx-cr*0.55, cy-cr*1.1, cx+cr*0.55, cy+cr*0.05], fill=WHITE+(210,))
    draw.ellipse([cx+cr*0.25, cy-cr*0.85, cx+cr*1.05, cy+cr*0.05], fill=WHITE+(190,))

    # Sun rays
    sx, sy = size * 0.28, size * 0.34
    sr = size * 0.10
    draw.ellipse([sx-sr, sy-sr, sx+sr, sy+sr], fill=ACCENT+(230,))
    for angle in range(0, 360, 45):
        rad   = math.radians(angle)
        inner = sr * 1.4
        outer = sr * 1.9
        x1 = sx + math.cos(rad) * inner
        y1 = sy + math.sin(rad) * inner
        x2 = sx + math.cos(rad) * outer
        y2 = sy + math.sin(rad) * outer
        lw = max(1, size // 60)
        draw.line([x1, y1, x2, y2], fill=ACCENT+(180,), width=lw)

    img.save(os.path.join(OUT, f'icon-{size}.png'), 'PNG')
    print(f'  ✓ icon-{size}.png')

print('Generating ATMOS PWA icons...')
for s in SIZES:
    draw_icon(s)
print(f'Done — {len(SIZES)} icons saved to ./icons/')
