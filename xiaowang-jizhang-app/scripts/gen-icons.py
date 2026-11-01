"""生成安卓应用图标：橙色渐变底 + 白色钱袋 + ¥（与下载页 logo 同款）

产物：
  android/app/src/main/res/mipmap-*/ic_launcher.png            方形图标（Android 7 及以下）
  android/app/src/main/res/mipmap-*/ic_launcher_round.png      圆形图标
  android/app/src/main/res/mipmap-*/ic_launcher_foreground.png 自适应图标前景（透明底）
  ../download-site/icon.png                                    512px，供下载页 logo / favicon 使用

用法：python3 scripts/gen-icons.py
"""
import os
import numpy as np
from PIL import Image, ImageDraw

SIZE = 1024
C_TOP = (255, 180, 0)     # #FFB400
C_BOTTOM = (255, 138, 0)  # #FF8A00
WHITE = (255, 255, 255)
YEN = (255, 138, 0)       # 钱袋上的 ¥ 用品牌橙

APP_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
RES = os.path.join(APP_DIR, 'android', 'app', 'src', 'main', 'res')
SITE = os.path.join(APP_DIR, '..', 'download-site')


def gradient(size, c1, c2):
    """45 度对角渐变，模拟 CSS linear-gradient(160deg)"""
    t = (np.linspace(0, 1, size).reshape(-1, 1)
         + np.linspace(0, 1, size).reshape(1, -1)) / 2
    arr = np.zeros((size, size, 4), dtype=np.uint8)
    for i in range(3):
        arr[:, :, i] = c1[i] + (c2[i] - c1[i]) * t
    arr[:, :, 3] = 255
    return Image.fromarray(arr, 'RGBA')


def draw_yen(d, cx, cy, s, fill):
    """几何绘制 ¥：Y 形 + 两道横线"""
    hs = s * 0.5
    lw = max(2, int(s * 0.115))
    half = lw / 2

    def bar(x0, x1, y):
        d.rounded_rectangle([x0, y - half, x1, y + half], radius=half, fill=fill)

    # Y 的两撇 + 竖
    for sx in (-hs * 0.55, hs * 0.55):
        d.line([(cx + sx, cy - hs), (cx, cy)], fill=fill, width=lw)
        d.ellipse([cx + sx - half, cy - hs - half, cx + sx + half, cy - hs + half], fill=fill)
    d.line([(cx, cy), (cx, cy + hs)], fill=fill, width=lw)
    # 两道横线
    bar(cx - hs * 0.66, cx + hs * 0.66, cy - hs * 0.02)
    bar(cx - hs * 0.66, cx + hs * 0.66, cy + hs * 0.36)


def draw_bag(d, cx, cy, w, h, fill, yen_fill):
    """钱袋：束口 + 袋身 + ¥"""
    top = cy - h / 2 + h * 0.22
    bot = cy + h / 2
    # 袋身（大圆角 → 袋形）
    d.rounded_rectangle([cx - w / 2, top, cx + w / 2, bot],
                        radius=int(w * 0.40), fill=fill)
    # 束口
    nw, nh = w * 0.66, h * 0.20
    d.rounded_rectangle([cx - nw / 2, top - nh * 0.55, cx + nw / 2, top + nh * 0.30],
                        radius=int(nh * 0.5), fill=fill)
    # ¥ 居中于袋身
    draw_yen(d, cx, (top + bot) / 2, min(w, h * 0.78) * 0.46, yen_fill)


def make_foreground(size):
    """自适应图标前景：透明底 + 白色钱袋（内容控制在中心 66% 安全区内）"""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    draw_bag(d, size / 2, size / 2, size * 0.52, size * 0.52, WHITE, YEN)
    return img


def make_legacy(size, round_icon=False):
    """Android 7 及以下的方形/圆形图标"""
    bg = gradient(size, C_TOP, C_BOTTOM)
    mask = Image.new('L', (size, size), 0)
    md = ImageDraw.Draw(mask)
    if round_icon:
        md.ellipse([0, 0, size - 1, size - 1], fill=255)
    else:
        md.rounded_rectangle([0, 0, size - 1, size - 1],
                             radius=int(size * 0.24), fill=255)
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    img.paste(bg, (0, 0), mask)
    d = ImageDraw.Draw(img)
    draw_bag(d, size / 2, size / 2, size * 0.56, size * 0.56, WHITE, YEN)
    return img


def main():
    densities = {
        'mipmap-mdpi': 48, 'mipmap-hdpi': 72, 'mipmap-xhdpi': 96,
        'mipmap-xxhdpi': 144, 'mipmap-xxxhdpi': 192
    }
    fg_src = make_foreground(SIZE)
    legacy_src = make_legacy(SIZE)
    round_src = make_legacy(SIZE, round_icon=True)

    for folder, px in densities.items():
        out = os.path.join(RES, folder)
        os.makedirs(out, exist_ok=True)
        fg_src.resize((px, px), Image.LANCZOS).save(
            os.path.join(out, 'ic_launcher_foreground.png'))
        legacy_src.resize((px, px), Image.LANCZOS).save(
            os.path.join(out, 'ic_launcher.png'))
        round_src.resize((px, px), Image.LANCZOS).save(
            os.path.join(out, 'ic_launcher_round.png'))
        print(f'  {folder}: {px}px ✓')

    # 下载页 logo / favicon
    os.makedirs(SITE, exist_ok=True)
    legacy_src.resize((512, 512), Image.LANCZOS).save(os.path.join(SITE, 'icon.png'))
    print('  download-site/icon.png 512px ✓')


if __name__ == '__main__':
    print('生成应用图标：橙渐变 + 白色钱袋 ¥')
    main()
    print('完成')
