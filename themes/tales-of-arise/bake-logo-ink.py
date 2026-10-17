# assets/logo-ink.webp — логотип Tales of ARISE для светлой бумаги: из белого логотипа Steam (logo_2x.png) буквы
# становятся тушью, серо-бирюзовый герб — тёмным индиго-бирюзовым, как на светлой версии логотипа.
#   curl -o logo2x.png https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/740130/logo_2x.png
#   python -P themes/tales-of-arise/bake-logo-ink.py logo2x.png themes/tales-of-arise/assets/logo-ink.webp
import sys

import numpy as np
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
im = np.asarray(Image.open(src).convert("RGBA")).astype(np.float32) / 255
rgb, a = im[..., :3], im[..., 3]
lum = (rgb * [0.3, 0.59, 0.11]).sum(-1)
k = np.clip((lum - 0.66) / (0.9 - 0.66), 0, 1)  # 1 — буквы, 0 — герб
ink = np.array([0.11, 0.10, 0.09])
crest = np.array([0.24, 0.38, 0.42])
res = np.dstack([ink * k[..., None] + crest * (1 - k[..., None]), a])
Image.fromarray((np.clip(res, 0, 1) * 255).astype(np.uint8), "RGBA").resize((960, 452), Image.LANCZOS).save(out, "WEBP", quality=92, method=6)
