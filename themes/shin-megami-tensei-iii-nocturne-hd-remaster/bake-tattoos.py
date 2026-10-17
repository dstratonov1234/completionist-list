# Слой assets/tattoos.webp для заставки Nocturne: из library_hero_2x (Steam, 3840×1240) остаются только светящиеся
# татуировки Полудемона и его золотые глаза, со свечением, на прозрачном фоне.
#   curl -o hero2x.jpg https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1413480/library_hero_2x.jpg
#   python -P themes/shin-megami-tensei-iii-nocturne-hd-remaster/bake-tattoos.py hero2x.jpg themes/shin-megami-tensei-iii-nocturne-hd-remaster/assets/tattoos.webp
# Рядом с out пишется <out>-preview.jpg — слой на чёрном, смотреть глазами.
import sys

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

src, out = sys.argv[1], sys.argv[2]
im = np.asarray(Image.open(src).convert("RGB")).astype(np.float32) / 255
R, G, B = im[..., 0], im[..., 1], im[..., 2]
H, W = R.shape
k = W / 1920  # масштаб относительно 1x
yy, xx = np.mgrid[0:H, 0:W]
X, Y = xx / W, yy / H


def blur(a, s):
    img = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8))
    return np.asarray(img.filter(ImageFilter.GaussianBlur(s * k))).astype(np.float32) / 255


def sm(e0, e1, v):
    t = np.clip((v - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


# ---------- линии татуировок ----------
lum = 0.3 * R + 0.59 * G + 0.11 * B
cyan = np.clip((-2.2 * R + 1.1 * G + 1.1 * B - 0.25) * 1.4, 0, 1)
thin = np.clip((cyan - 1.15 * blur(cyan, 6)) * 2.2, 0, 1)  # тонкие линии, без пятен фона
near = np.clip(blur((lum < 0.33).astype(np.float32), 5) * 3.0, 0, 1)  # рядом с тёмной кожей
fig = np.clip(1.6 - np.sqrt(((X - 0.49) / 0.21) ** 2 + ((Y - 0.6) / 0.75) ** 2) * 1.6, 0, 1)
splash = 1 - sm(0.83, 0.9, Y) * sm(0.45, 0.5, X)  # брызги под руками
ink = sm(0.2, 0.55, thin * near * fig * splash)  # слабое — шум по контуру

# связные куски: линии — длинные и тонкие; крапинки по краю волос и кляксы-заливки — короткие или округлые
lab, nlab = ndimage.label(ink > 0.12)
if nlab:
    idx = np.arange(1, nlab + 1)
    area = ndimage.sum(np.ones_like(ink), lab, idx)
    spans = []
    for sl in ndimage.find_objects(lab):
        spans.append(max(sl[0].stop - sl[0].start, sl[1].stop - sl[1].start) if sl else 0)
    span = np.array(spans, dtype=np.float32)
    elong = span * span / np.maximum(area, 1)  # у линии ~ длина/толщина, у кляксы ~1–2
    keep = np.zeros(nlab + 1, bool)
    keep[1:] = ((span >= 30 * k) & (elong >= 4.2)) | ((area >= 3000 * k * k) & (elong >= 2.6))
    ink = ink * ndimage.binary_dilation(keep[lab], iterations=int(2 * k))

glow = np.clip(blur(ink, 5) * 1.9, 0, 1)
line_a = np.maximum(ink, glow * 0.75)
core = np.clip(ink * 1.2, 0, 1)
line_rgb = np.dstack([0.19 + 0.55 * core, 0.9 + 0.1 * core, 0.88 + 0.12 * core])

# ---------- глаза: раскалённое ядро, читаемая радужка из самого арта, золотой ореол ----------
eye_mask = np.clip(1.5 - np.sqrt(((X - 0.485) / 0.075) ** 2 + ((Y - 0.365) / 0.065) ** 2) * 1.5, 0, 1)
eyes = np.clip((R + G - 2 * B - 0.35) * 2.5, 0, 1) * eye_mask
hot = sm(0.55, 1.0, eyes)
iris = np.dstack([np.clip(R * 1.25, 0, 1), np.clip(G * 1.18, 0, 1), np.clip(B * 0.9, 0, 1)])
eye_rgb = iris * (1 - hot[..., None] * 0.7) + np.array([1.0, 0.97, 0.78]) * hot[..., None] * 0.7
halo = np.clip(blur(eyes, 8) * 3.6, 0, 1)
wide = np.clip(blur(eyes, 22) * 3.0, 0, 1)
gold = np.array([1.0, 0.74, 0.22])

# ---------- сборка: сверху глаза, под ними ореол, ещё ниже линии ----------
def over(top_rgb, top_a, bot_rgb, bot_a):
    a = top_a + bot_a * (1 - top_a)
    rgb = (top_rgb * top_a[..., None] + bot_rgb * (bot_a * (1 - top_a))[..., None]) / np.maximum(a, 1e-4)[..., None]
    return rgb, a

rgb, a = over(np.broadcast_to(gold, (H, W, 3)), wide * 0.55, line_rgb, line_a)
rgb, a = over(np.broadcast_to(gold, (H, W, 3)), halo * 0.9, rgb, a)
rgb, a = over(eye_rgb, eyes, rgb, a)

rgba = np.dstack([np.clip(rgb, 0, 1), np.clip(a, 0, 1)])
img = Image.fromarray((rgba * 255).astype(np.uint8), "RGBA")
img.save(out, "WEBP", quality=84, method=6)
prev = Image.new("RGBA", img.size, (0, 0, 0, 255))
prev.alpha_composite(img)
prev.convert("RGB").resize((W // 2, H // 2)).save(out.replace(".webp", "-preview.jpg"), quality=88)
print(img.size, "eyes px", int((eyes > 0.3).sum()), "kept", int(keep.sum()) if nlab else 0, "of", nlab)
