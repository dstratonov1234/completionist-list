"""Запекает маску толпы: только сплошные силуэты, без полупрозрачных арок и флагов фона.

В сгенерированной толпе (assets/crowd.webp) за силуэтами остались бледные арки колизея — маска
пропускала их, и над баннером проступал прямоугольник. Здесь остаётся только то, что касается
сплошной заливки (с краевым сглаживанием), всё остальное становится прозрачным.

python -P themes/chained-beasts/bake-crowd.py
"""
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter

A = Path(__file__).parent / "assets"
im = Image.open(A / "crowd.webp").convert("RGBA")
r, g, b, a = im.split()
lum = Image.merge("RGB", (r, g, b)).convert("L")
# сплошное: почти непрозрачное и тёмное
solid = Image.eval(a, lambda v: 255 if v > 210 else 0)
dark = Image.eval(lum, lambda v: 255 if v < 60 else 0)
core = ImageChops.multiply(solid, dark)
# рядом со сплошным — сглаженный край силуэта, его оставить
near = core.filter(ImageFilter.MaxFilter(5))
alpha = ImageChops.multiply(a, near)
out = Image.new("RGBA", im.size, (0, 0, 0, 0))
out.putalpha(alpha)
# снизу у картинки прозрачная кромка — при повторе по низу экрана она светилась бы линией
w, h = out.size
bottom = h
while bottom > h // 2 and sum(alpha.crop((0, bottom - 1, w, bottom)).get_flattened_data()) / w < 230:
    bottom -= 1
out = out.crop((0, 0, w, bottom))
out.save(A / "crowd-mask.webp", "WEBP", quality=90, method=6)
print("crowd-mask.webp", out.size, (A / "crowd-mask.webp").stat().st_size // 1024, "KB")
