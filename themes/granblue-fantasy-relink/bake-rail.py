"""Режет перила (assets/rail.webp) на бесшовный фрагмент: от середины одного столбика до середины следующего.

python -P themes/granblue-fantasy-relink/bake-rail.py
"""
from pathlib import Path

from PIL import Image

A = Path(__file__).parent / "assets"
im = Image.open(A / "rail.webp").convert("RGBA")
w, h = im.size
alpha = im.getchannel("A")
# навершия столбиков — единственное, что торчит в верхних 6% картинки
band = int(h * 0.06)
cols = [x for x in range(w) if any(alpha.getpixel((x, y)) > 128 for y in range(band))]
groups = []
for x in cols:
    if groups and x - groups[-1][-1] <= 3:
        groups[-1].append(x)
    else:
        groups.append([x])
centers = [round(sum(g) / len(g)) for g in groups if len(g) > 4]
print("столбики:", centers)
# последние два столбика: между ними нет верёвки
a, b = centers[-2], centers[-1]
tile = im.crop((a, 0, b, h))
tile.save(A / "rail-tile.webp", "WEBP", quality=86, method=6)
print("rail-tile.webp", tile.size, (A / "rail-tile.webp").stat().st_size // 1024, "KB")
