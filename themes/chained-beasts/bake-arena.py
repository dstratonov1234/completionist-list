"""Запекает фон страницы — размытую малиновую арену из Steam (page_bg_raw) — в assets/arena.webp.

python -P themes/chained-beasts/bake-arena.py
"""
import io
import urllib.request
from pathlib import Path

from PIL import Image

URL = "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/3569420/a1a576a70613c706ee653ede2c70452ca8081f85/page_bg_raw.jpg"
dst = Path(__file__).parent / "assets" / "arena.webp"
im = Image.open(io.BytesIO(urllib.request.urlopen(URL, timeout=60).read())).convert("RGB")
im.save(dst, "WEBP", quality=80, method=6)
print(dst.name, im.size, dst.stat().st_size // 1024, "KB")
