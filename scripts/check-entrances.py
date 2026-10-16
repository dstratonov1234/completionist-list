"""Сквозная проверка входа в игру с главной — для всех игр или для перечисленных:

    python -P scripts/check-entrances.py <out-dir> [--size 1280x800] [id ...]

Для каждой игры (локальный сервер http://localhost:8765 должен быть запущен):
главная → наведение на баннер → клик → 7 кадров (заставка и страница) → назад к списку →
проверка, что от заставки и страницы ничего не осталось (слои, классы на <html>), и ошибок консоли.
Итог — по строке кадров на игру в <out-dir>/entrances-<ширина>.jpg (смотреть через Read).
Кадры идут примерно через 0,1 с, 0,3 с, 0,5 с, 0,8 с, 1,3 с, 2,2 с и 4,8 с после клика.
Для покадровой плавности (нет ли кадра, где заставка возникает целиком) — шаги castStart/castStop в shots.mjs.
"""
import argparse
import json
import os
import random
import subprocess
import sys

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = ["s0", "s1", "s2", "s3", "s4", "s5", "s6"]

# Всё, что после возврата на список висит в body помимо самого сайта, — утечка.
LEAK = """(() => { const keep = new Set(["stage", "list-view", "game-view", "lightbox"]);
  const extra = [...document.body.children].filter((e) => !keep.has(e.id) && !["SCRIPT", "NOSCRIPT"].includes(e.tagName) && !/^fx-/.test(e.className));
  return { hash: location.hash, htmlClass: document.documentElement.className, game: document.documentElement.dataset.game ?? null,
    leaked: extra.map((e) => e.tagName + "." + e.className) }; })()"""


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    p = argparse.ArgumentParser()
    p.add_argument("out")
    p.add_argument("--size", default="1280x800")
    p.add_argument("ids", nargs="*")
    args = p.parse_intermixed_args()
    w, h = map(int, args.size.split("x"))
    out = os.path.abspath(args.out)
    os.makedirs(out, exist_ok=True)
    with open(os.path.join(ROOT, "data", "games.json"), encoding="utf-8") as f:
        ids = args.ids or [g["id"] for g in json.load(f)["games"]]

    rows = []
    for gid in ids:
        sel = f'.gbanner[data-game="{gid}"]'
        steps = [
            {"wait": 1800},
            {"eval": f"document.querySelector({json.dumps(sel)}).scrollIntoView({{block: 'center'}})"},
            {"wait": 400},
            {"hoverSel": sel},
            {"wait": 900},
            {"clickSel": sel},
            {"wait": 120, "shot": "s0"},
            {"wait": 150, "shot": "s1"},
            {"wait": 150, "shot": "s2"},
            {"wait": 250, "shot": "s3"},
            {"wait": 500, "shot": "s4"},
            {"wait": 900, "shot": "s5"},
            {"wait": 2600, "shot": "s6"},
            {"eval": "location.hash"},
            {"eval": "history.back()"},
            {"wait": 2500},
            {"eval": LEAK},
        ]
        prefix = os.path.join(out, f"{gid}-{w}").replace("\\", "/")
        url = f"http://localhost:8765/?v={random.randint(0, 10**9)}"
        r = subprocess.run(["node", os.path.join(ROOT, "scripts", "shots.mjs"), url, str(w), str(h), prefix, "no", json.dumps(steps)],
                           capture_output=True, text=True, encoding="utf-8", timeout=240)
        log = [l for l in r.stdout.splitlines() if l.startswith(("eval", "errors", "FAIL"))]
        print(f"== {gid}\n  " + "\n  ".join(log[-3:]) + (f"\n  stderr: {r.stderr.strip()[:300]}" if r.stderr.strip() else ""))
        rows.append((gid, [f"{prefix}-{s}.png" for s in SHOTS]))

    tw = 300 if w > 600 else 140
    th = int(tw * h / w)
    sheet = Image.new("RGB", (len(SHOTS) * tw, len(rows) * (th + 18)), (25, 25, 25))
    d = ImageDraw.Draw(sheet)
    for y, (gid, files) in enumerate(rows):
        for x, f in enumerate(files):
            try:
                im = Image.open(f).convert("RGB")
                im.thumbnail((tw - 4, th))
                sheet.paste(im, (x * tw + 2, y * (th + 18) + 16))
            except Exception as e:  # noqa: BLE001
                d.text((x * tw + 6, y * (th + 18) + 40), f"ERR {e}"[:40], fill=(255, 80, 80))
        d.text((4, y * (th + 18) + 2), gid, fill=(255, 255, 0))
    path = os.path.join(out, f"entrances-{w}.jpg")
    sheet.save(path, quality=85)
    print(path)


if __name__ == "__main__":
    main()
