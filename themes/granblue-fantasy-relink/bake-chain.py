"""Запекает арт Chain Burst (gbf.wiki, «X (Relink) Chain.png») в узкие портреты для заставки.

python -P themes/granblue-fantasy-relink/bake-chain.py
"""
import io
import urllib.request
from pathlib import Path

from PIL import Image

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"}
OUT = Path(__file__).parent / "assets"
# имя: (путь на gbf.wiki, центр лица по x в кадре 1280×720)
CHARS = {
    "katalina": ("8/86/Katalina_%28Relink%29_Chain.png", 625),
    "rackam": ("2/28/Rackam_%28Relink%29_Chain.png", 560),
    "gran": ("4/4d/Gran_%28Relink%29_Chain.png", 593),
    "io": ("9/9e/Io_%28Relink%29_Chain.png", 642),
    "eugen": ("a/a6/Eugen_%28Relink%29_Chain.png", 625),
}
W = 560


def fetch(path):
    name = path.split("/")[-1]
    url = f"https://gbf.wiki/images/thumb/{path}/1280px-{name}.webp"
    return Image.open(io.BytesIO(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120).read())).convert("RGBA")


for key, (path, fx) in CHARS.items():
    im = fetch(path)
    x0 = max(0, min(im.width - W, fx - W // 2))
    crop = im.crop((x0, 0, x0 + W, im.height))
    dst = OUT / f"chain-{key}.webp"
    crop.save(dst, "WEBP", quality=82, method=6)
    print(dst.name, crop.size, dst.stat().st_size // 1024, "KB")
