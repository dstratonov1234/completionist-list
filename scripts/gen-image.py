"""Генерация ассетов для тем игр через OpenAI Images API.

    python -P scripts/gen-image.py --manifest themes/<id>/assets.json [--key-file <путь>] [--force имя]
    python -P scripts/gen-image.py --list-models [--key-file <путь>]

Ключ берётся из переменной окружения OPENAI_API_KEY, из --key-file или из файла по умолчанию
~/.config/completionist-list/openai.key. Ключ НИКОГДА не кладётся в репозиторий (он публичный) —
только в переменную окружения или в файл вне репозитория.

assets.json — список ассетов темы (лежит в репозитории, чтобы можно было перегенерировать):
    {
      "model": "gpt-image-2.5-flare",
      "assets": [
        {"name": "frame", "prompt": "...", "size": "1024x1024", "background": "transparent",
         "quality": "medium", "max_width": 1024, "format": "webp", "mirror": false}
      ]
    }
size: 1024x1024 | 1536x1024 | 1024x1536. background: transparent | opaque. mirror: true — ассет считается
левым верхним углом рамки, рядом сохраняются зеркальные <name>-tr/-bl/-br. Прозрачные поля вокруг
картинки обрезаются автоматически ("trim": false — оставить холст как есть).
Готовые файлы: themes/<id>/assets/<name>.webp (или .png/.jpg). Уже существующие не перегенерируются,
если не указан --force <name> (или --force all).
"""

import argparse
import base64
import io
import json
import os
import sys
import time
import urllib.error
import urllib.request

from PIL import Image

API = "https://api.openai.com/v1"
# Ключ пользователя, который он разрешил тратить на ассеты тем; лежит вне репозитория.
DEFAULT_KEY_FILE = os.path.join(os.path.expanduser("~"), ".config", "completionist-list", "openai.key")
DEFAULT_MODEL = "gpt-image-2.5-flare"


def api_key(args):
    key = os.environ.get("OPENAI_API_KEY")
    key_file = args.key_file or (DEFAULT_KEY_FILE if os.path.exists(DEFAULT_KEY_FILE) else None)
    if not key and key_file:
        with open(key_file, encoding="utf-8") as f:
            key = f.read().strip()
    if not key:
        sys.exit(f"Нет ключа: задай OPENAI_API_KEY, --key-file или положи ключ в {DEFAULT_KEY_FILE} (вне репозитория).")
    return key


def request(key, path, payload=None):
    req = urllib.request.Request(
        API + path,
        data=json.dumps(payload).encode() if payload is not None else None,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        method="POST" if payload is not None else "GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")
        try:
            msg = json.loads(body)["error"]["message"]
        except Exception:  # noqa: BLE001
            msg = body[:500]
        raise RuntimeError(f"{e.code}: {msg}") from None


def generate(key, model, asset):
    payload = {
        "model": model,
        "prompt": asset["prompt"],
        "size": asset.get("size", "1024x1024"),
        "quality": asset.get("quality", "medium"),
        "n": 1,
    }
    if asset.get("background"):
        payload["background"] = asset["background"]
    for attempt in range(3):
        try:
            data = request(key, "/images/generations", payload)
            return base64.b64decode(data["data"][0]["b64_json"])
        except RuntimeError as e:
            if attempt == 2 or not str(e).startswith(("429", "500", "502", "503")):
                raise
            time.sleep(5 * (attempt + 1))


def trim(img, pad=6):
    """Обрезает пустые прозрачные поля: модель кладёт орнамент посреди большого холста."""
    if img.mode != "RGBA":
        return img
    box = img.split()[3].point(lambda a: 255 if a > 8 else 0).getbbox()
    if not box:
        return img
    l, t, r, b = box
    return img.crop((max(0, l - pad), max(0, t - pad), min(img.width, r + pad), min(img.height, b + pad)))


def save(raw, path, max_width, fmt, do_trim=True):
    img = Image.open(io.BytesIO(raw))
    if do_trim:
        img = trim(img)
    if max_width and img.width > max_width:
        img = img.resize((max_width, round(img.height * max_width / img.width)), Image.LANCZOS)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if fmt == "jpg":
        img.convert("RGB").save(path, quality=84, optimize=True, progressive=True)
    elif fmt == "png":
        img.save(path, optimize=True)
    else:
        img.save(path, "WEBP", quality=84, method=6)
    return img.size


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    p = argparse.ArgumentParser()
    p.add_argument("--manifest")
    p.add_argument("--key-file")
    p.add_argument("--force", action="append", default=[])
    p.add_argument("--list-models", action="store_true")
    args = p.parse_args()
    key = api_key(args)

    if args.list_models:
        ids = sorted(m["id"] for m in request(key, "/models")["data"])
        print("\n".join(i for i in ids if "image" in i))
        return

    if not args.manifest:
        p.error("нужен --manifest themes/<id>/assets.json")
    with open(args.manifest, encoding="utf-8") as f:
        manifest = json.load(f)
    model = manifest.get("model", DEFAULT_MODEL)
    out_dir = os.path.join(os.path.dirname(args.manifest), "assets")

    for asset in manifest["assets"]:
        fmt = asset.get("format", "webp")
        path = os.path.join(out_dir, f"{asset['name']}.{fmt}")
        forced = "all" in args.force or asset["name"] in args.force
        if os.path.exists(path) and not forced:
            print(f"= {path} (уже есть)")
            continue
        t = time.time()
        try:
            raw = generate(key, model, asset)
        except RuntimeError as e:
            print(f"✗ {asset['name']}: {e}")
            continue
        w, h = save(raw, path, asset.get("max_width", 1024), fmt, asset.get("trim", True))
        print(f"✓ {path} {w}x{h} {os.path.getsize(path) // 1024} КБ, {time.time() - t:.0f} с")
        if asset.get("mirror"):
            mirror_corners(path, fmt)


def mirror_corners(path, fmt):
    """Из угла «верх-лево» делает остальные три: <name>-tr, -bl, -br (для рамок из четырёх углов)."""
    base, ext = os.path.splitext(path)
    img = Image.open(path)
    variants = {
        "tr": img.transpose(Image.FLIP_LEFT_RIGHT),
        "bl": img.transpose(Image.FLIP_TOP_BOTTOM),
        "br": img.transpose(Image.ROTATE_180),
    }
    for suffix, im in variants.items():
        out = f"{base}-{suffix}{ext}"
        if fmt == "webp":
            im.save(out, "WEBP", quality=84, method=6)
        else:
            im.save(out)
        print(f"  ↳ {out}")


if __name__ == "__main__":
    main()
