#!/usr/bin/env python3
"""生成 PWA / Android 图标：蓝色渐变底 + 白色对话气泡。"""
import math
import os

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SS = 4  # 超采样倍数


def gradient(size):
    small = Image.new("RGB", (64, 64))
    pixels = small.load()
    start = (95, 126, 255)
    end = (56, 78, 228)
    for y in range(64):
        for x in range(64):
            t = (x + y) / 126
            pixels[x, y] = tuple(round(a + (b - a) * t) for a, b in zip(start, end))
    return small.resize((size, size), Image.BILINEAR)


def draw_bubble(size, scale=1.0, background=True, rounded=0.22):
    """size: 画布边长；scale: 气泡相对设计稿缩放；background: 是否绘制渐变底。"""
    canvas = size * SS
    unit = canvas / 1024
    img = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    if background:
        img.paste(gradient(canvas), (0, 0))
        mask = Image.new("L", (canvas, canvas), 0)
        ImageDraw.Draw(mask).rounded_rectangle(
            (0, 0, canvas - 1, canvas - 1), radius=int(canvas * rounded), fill=255
        )
        img.putalpha(mask)

    def px(value):
        return (512 + (value - 512) * scale) * unit

    draw = ImageDraw.Draw(img)
    # 气泡主体（设计稿 1024 坐标系）
    draw.rounded_rectangle(
        (px(236), px(300), px(788), px(692)),
        radius=112 * scale * unit,
        fill=(255, 255, 255, 255),
    )
    # 左下角小尾巴
    draw.polygon(
        [(px(300), px(640)), (px(300), px(806)), (px(470), px(690))],
        fill=(255, 255, 255, 255),
    )
    # 三个圆点
    for dot_x in (400, 512, 624):
        r = 26 * scale * unit
        draw.ellipse(
            (px(dot_x) - r, px(496) - r, px(dot_x) + r, px(496) + r),
            fill=(77, 107, 254, 255),
        )

    return img.resize((size, size), Image.LANCZOS)


def save(img, path):
    full = os.path.join(ROOT, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    img.save(full, "PNG", optimize=True)
    print("wrote", path, img.size)


def svg():
    return """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#5f7eff"/>
      <stop offset="1" stop-color="#384ee4"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#g)"/>
  <rect x="236" y="300" width="276" height="196" rx="56" fill="#fff"/>
  <path d="M300 640 L300 806 L470 690 Z" fill="#fff"/>
  <circle cx="400" cy="496" r="13" fill="#4d6bfe"/>
  <circle cx="512" cy="496" r="13" fill="#4d6bfe"/>
  <circle cx="624" cy="496" r="13" fill="#4d6bfe"/>
</svg>
"""


def main():
    # PWA：桌面 / 安装图标
    save(draw_bubble(512), "pwa/icons/icon-512.png")
    save(draw_bubble(192), "pwa/icons/icon-192.png")
    save(draw_bubble(512, background=True, rounded=0), "pwa/icons/icon-maskable-512.png")
    save(draw_bubble(180, background=True, rounded=0), "pwa/icons/apple-touch-icon.png")

    # Android：传统图标与自适应图标前景
    for density, size in {
        "mdpi": 48,
        "hdpi": 72,
        "xhdpi": 96,
        "xxhdpi": 144,
        "xxxhdpi": 192,
    }.items():
        save(draw_bubble(size), f"android/res/mipmap-{density}/ic_launcher.png")

    foreground = Image.new("RGBA", (432, 432), (0, 0, 0, 0))
    foreground.alpha_composite(draw_bubble(432, scale=0.85, background=False), (0, 0))
    save(foreground, "android/res/drawable-nodpi/ic_launcher_foreground.png")

    with open(os.path.join(ROOT, "pwa/icons/icon.svg"), "w", encoding="utf-8") as handle:
        handle.write(svg())
    print("wrote pwa/icons/icon.svg")


if __name__ == "__main__":
    main()
