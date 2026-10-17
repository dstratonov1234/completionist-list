# assets/heroes.webp — Альфен и Шионне из ключевого арта Steam (library_hero_2x, белый фон) на прозрачном:
# прозрачность — по отличию от белого, так что белое поле уходит, а светлые волосы и доспех остаются.
#   curl -o hero2x.jpg https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/740130/5232af1e5ace55ba8ff4c3a893b7f1e85c9f9469/library_hero_2x.jpg
#   python -P themes/tales-of-arise/bake-heroes.py hero2x.jpg themes/tales-of-arise/assets/heroes.webp
import sys

import numpy as np
from PIL import Image, ImageFilter

src, out = sys.argv[1], sys.argv[2]
im = Image.open(src).convert("RGB")
W, H = im.size
im = im.crop((int(W * 0.445), 0, W, H))  # персонажи — правая часть арта
a = np.asarray(im).astype(np.float32) / 255
dw = 1 - a.min(-1)  # 0 — чистый белый
alpha = np.clip((dw - 0.035) / (0.11 - 0.035), 0, 1)
alpha = alpha * alpha * (3 - 2 * alpha)
# мелкие осколки и шум вокруг — убрать: альфа сглаживается и берётся связная масса
m = Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3))
rgba = np.dstack([a, np.asarray(m).astype(np.float32) / 255])
res = Image.fromarray((np.clip(rgba, 0, 1) * 255).astype(np.uint8), "RGBA")
res = res.resize((res.width // 2, res.height // 2), Image.LANCZOS)
res.save(out, "WEBP", quality=88, method=6)
print(res.size)
