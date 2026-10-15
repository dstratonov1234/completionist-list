"""Палитра из арта игры — основа для theme в data/games.json.

    python -I scripts/palette.py <url или путь> [<url> ...] [--k 8]
    python -I scripts/palette.py --contrast "#e6ebf5" "#0a0d14"

Скачивает картинку в память (на диск не пишет), кластеризует цвета (k-means) и печатает:
доли цветов, кандидатов в bg/surface/text/accent и контраст текста к фону (WCAG).
"""

import io
import sys
import urllib.request

import numpy as np
from PIL import Image


def load(src):
    if src.startswith("http"):
        req = urllib.request.Request(src, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=30) as r:
            data = r.read()
        img = Image.open(io.BytesIO(data))
    else:
        img = Image.open(src)
    img = img.convert("RGB")
    img.thumbnail((240, 240))
    return np.asarray(img, dtype=np.float64).reshape(-1, 3)


def kmeans(px, k, iters=25, seed=7):
    rng = np.random.default_rng(seed)
    centers = px[rng.choice(len(px), size=k, replace=False)]
    for _ in range(iters):
        d = ((px[:, None, :] - centers[None, :, :]) ** 2).sum(-1)
        labels = d.argmin(1)
        new = np.array([px[labels == i].mean(0) if (labels == i).any() else centers[i] for i in range(k)])
        if np.allclose(new, centers):
            break
        centers = new
    shares = np.bincount(labels, minlength=k) / len(px)
    return centers, shares


def hexc(c):
    return "#%02x%02x%02x" % tuple(int(round(v)) for v in c)


def parse_hex(h):
    h = h.lstrip("#")
    if len(h) == 3:
        h = "".join(ch * 2 for ch in h)
    return np.array([int(h[i : i + 2], 16) for i in (0, 2, 4)], dtype=np.float64)


def rel_lum(c):
    c = np.asarray(c, dtype=np.float64) / 255
    c = np.where(c <= 0.03928, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def contrast(a, b):
    la, lb = sorted((rel_lum(a), rel_lum(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def saturation(c):
    c = np.asarray(c) / 255
    mx, mn = c.max(), c.min()
    return 0.0 if mx == 0 else (mx - mn) / mx


def mix(a, b, t):
    return np.asarray(a) * (1 - t) + np.asarray(b) * t


def analyse(src, k):
    px = load(src)
    centers, shares = kmeans(px, k)
    order = np.argsort(-shares)
    print(f"\n== {src}")
    print("  доля   цвет     яркость  насыщ.")
    for i in order:
        c = centers[i]
        print(f"  {shares[i] * 100:5.1f}%  {hexc(c)}  {rel_lum(c):6.3f}   {saturation(c):5.2f}")

    significant = [i for i in order if shares[i] >= 0.03]
    darkest = min(significant, key=lambda i: rel_lum(centers[i]))
    lightest = max(significant, key=lambda i: rel_lum(centers[i]))
    accents = sorted(
        (i for i in order if shares[i] >= 0.015),
        key=lambda i: saturation(centers[i]) * (0.4 + min(rel_lum(centers[i]) * 3, 1)),
        reverse=True,
    )[:3]

    bg = centers[darkest]
    # фон темнее и чуть насыщеннее, чем в арте, — чтобы текст читался
    bg_dark = mix(bg, [0, 0, 0], 0.55)
    surface = mix(bg_dark, centers[accents[0]] if accents else bg, 0.08) + 8
    text = mix(centers[lightest], [255, 255, 255], 0.6)
    print("  кандидаты:")
    print(f"    bg      {hexc(bg_dark)}   (тёмный из арта {hexc(bg)})")
    print(f"    surface {hexc(np.clip(surface, 0, 255))}")
    print(f"    text    {hexc(text)}   контраст к bg {contrast(text, bg_dark):.1f}:1")
    for i in accents:
        print(f"    accent  {hexc(centers[i])}   контраст к bg {contrast(centers[i], bg_dark):.1f}:1")


def main(argv):
    # Консоль Windows по умолчанию cp1252 — без этого русский вывод падает.
    sys.stdout.reconfigure(encoding="utf-8")
    if not argv:
        print(__doc__)
        return 1
    if argv[0] == "--contrast":
        a, b = parse_hex(argv[1]), parse_hex(argv[2])
        r = contrast(a, b)
        verdict = "AAA" if r >= 7 else "AA" if r >= 4.5 else "AA крупный текст" if r >= 3 else "мало"
        print(f"{argv[1]} на {argv[2]}: {r:.2f}:1 ({verdict})")
        return 0
    k = 8
    if "--k" in argv:
        i = argv.index("--k")
        k = int(argv[i + 1])
        argv = argv[:i] + argv[i + 2 :]
    for src in argv:
        try:
            analyse(src, k)
        except Exception as e:  # noqa: BLE001 — печатаем и идём к следующей картинке
            print(f"\n== {src}\n  ошибка: {e}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
