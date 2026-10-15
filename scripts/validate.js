// Проверка data/games.json перед коммитом:
//   node scripts/validate.js                 — структура данных
//   node scripts/validate.js --check-images  — плюс доступность картинок (без Referer, как на сайте) и шрифтов темы
//   node scripts/validate.js --fix           — пересчитать goals { done, total } в games.json по data/conditions
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const STATUSES = ["completed", "in_progress", "planned"];
const DATE_RE = /^\d{4}(-\d{2}(-\d{2})?)?$/;
const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const URL_RE = /^https?:\/\/\S+$/;

const PARTICLES = ["embers", "sparks", "ash", "snow", "rain", "spores", "dust", "stars", "petals", "leaves", "bubbles"];
const TEXTURES = ["vignette", "grain", "scanlines", "glow", "fog", "paper", "halftone"];
const SECTION_KEYS = [];
const HEX_RE = /^#[0-9a-f]{6}$/i;
const FONT_SPEC_RE = /^[\w\s:@;,.+-]+$/;

const errors = [];
const warnings = [];
const images = new Map(); // url -> where
const fontSpecs = new Map(); // spec -> where
const russianFonts = new Map(); // family -> where (шрифты, которыми набран русский текст)

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function checkTheme(where, g) {
  const t = g.theme;
  const tw = `${where} theme`;
  if (typeof t !== "object" || Array.isArray(t)) return errors.push(`${tw}: должен быть объектом`);
  for (const k of ["bg", "surface", "text", "accent"]) if (!HEX_RE.test(t[k] ?? "")) errors.push(`${tw}: ${k} — цвет #rrggbb (обязательно)`);
  if (t.accent2 != null && !HEX_RE.test(t.accent2)) errors.push(`${tw}: accent2 — цвет #rrggbb`);
  if (HEX_RE.test(t.text ?? "") && HEX_RE.test(t.bg ?? "")) {
    const c = contrast(t.text, t.bg);
    if (c < 4.5) errors.push(`${tw}: контраст text/bg ${c.toFixed(1)}:1 — нужно ≥ 4.5`);
  }
  if (HEX_RE.test(t.text ?? "") && HEX_RE.test(t.surface ?? "") && contrast(t.text, t.surface) < 4.5) {
    errors.push(`${tw}: контраст text/surface ${contrast(t.text, t.surface).toFixed(1)}:1 — нужно ≥ 4.5`);
  }
  if (HEX_RE.test(t.accent ?? "") && HEX_RE.test(t.bg ?? "") && contrast(t.accent, t.bg) < 3) {
    warnings.push(`${tw}: accent плохо виден на bg (${contrast(t.accent, t.bg).toFixed(1)}:1, лучше ≥ 3)`);
  }

  const families = new Set(["Inter"]);
  if (t.fonts != null) {
    if (!Array.isArray(t.fonts)) errors.push(`${tw}: fonts — массив строк Google Fonts`);
    for (const spec of Array.isArray(t.fonts) ? t.fonts : []) {
      if (typeof spec !== "string" || !FONT_SPEC_RE.test(spec)) {
        errors.push(`${tw}: fonts — неверная строка «${spec}»`);
        continue;
      }
      families.add(spec.split(":")[0].replace(/\+/g, " ").trim());
      fontSpecs.set(spec, tw);
    }
  }
  for (const k of ["displayFont", "headingFont", "bodyFont"]) {
    if (t[k] == null) continue;
    if (!families.has(t[k])) errors.push(`${tw}: ${k} «${t[k]}» не подключён в fonts`);
    if (k !== "displayFont" || /[а-яё]/i.test(g.title ?? "")) russianFonts.set(t[k], `${tw}: ${k}`);
  }

  const p = typeof t.particles === "string" ? { type: t.particles } : t.particles;
  if (p != null) {
    if (!PARTICLES.includes(p.type)) errors.push(`${tw}: particles.type — одно из ${PARTICLES.join(", ")}`);
    const colors = [].concat(p.color ?? []);
    if (colors.some((c) => !HEX_RE.test(c))) errors.push(`${tw}: particles.color — #rrggbb или массив таких`);
    if (p.density != null && !(p.density >= 0.2 && p.density <= 3)) errors.push(`${tw}: particles.density — от 0.2 до 3`);
    if (p.layer != null && !["front", "back"].includes(p.layer)) errors.push(`${tw}: particles.layer — front или back`);
  }
  if (t.textures != null) {
    const tx = [].concat(t.textures);
    const bad = tx.filter((x) => !TEXTURES.includes(x));
    if (bad.length) errors.push(`${tw}: textures — только ${TEXTURES.join(", ")} (лишнее: ${bad.join(", ")})`);
  }
  if (t.radius != null && !(t.radius >= 0 && t.radius <= 28)) errors.push(`${tw}: radius — 0–28 px`);
  if (t.bodySize != null && !(t.bodySize >= 13 && t.bodySize <= 20)) errors.push(`${tw}: bodySize — 13–20 px`);
  if (t.headingWeight != null && !(t.headingWeight >= 300 && t.headingWeight <= 900)) errors.push(`${tw}: headingWeight — 300–900`);
  if (t.headingCase != null && !["uppercase", "none"].includes(t.headingCase)) errors.push(`${tw}: headingCase — uppercase или none`);
  if (t.headingSpacing != null && !/^-?\d*\.?\d+em$/.test(t.headingSpacing)) errors.push(`${tw}: headingSpacing — например "0.08em"`);
  if (t.sections != null) {
    for (const [k, v] of Object.entries(t.sections)) {
      if (!SECTION_KEYS.includes(k) && !/^group-\d+$/.test(k)) errors.push(`${tw}: sections.${k} — неизвестная секция (есть ${SECTION_KEYS.join(", ")})`);
      if (typeof v !== "object" || (v.label == null && v.icon == null)) errors.push(`${tw}: sections.${k} — { label?, icon? }`);
    }
  }
  for (const [flag, file] of [["css", "theme.css"], ["js", "theme.js"]]) {
    const full = path.join(root, "themes", g.id, file);
    if (t[flag] === true && !fs.existsSync(full)) errors.push(`${tw}: ${flag}=true, но нет themes/${g.id}/${file}`);
    if (t[flag] !== true && fs.existsSync(full)) warnings.push(`${tw}: есть themes/${g.id}/${file}, но ${flag} не true — файл не подключится`);
  }
  if (t.js === true) {
    const src = fs.existsSync(path.join(root, "themes", g.id, "theme.js")) ? fs.readFileSync(path.join(root, "themes", g.id, "theme.js"), "utf8") : "";
    if (src && !src.includes(`GameThemes.register("${g.id}"`)) errors.push(`${tw}: theme.js должен вызывать GameThemes.register("${g.id}", …)`);
  }
  const assetsDir = path.join(root, "themes", g.id, "assets");
  if (fs.existsSync(assetsDir)) {
    for (const f of fs.readdirSync(assetsDir)) {
      const kb = fs.statSync(path.join(assetsDir, f)).size / 1024;
      if (kb > 600) warnings.push(`${tw}: themes/${g.id}/assets/${f} весит ${Math.round(kb)} КБ — сжать (max_width / webp)`);
    }
  }
}

let data;
try {
  data = JSON.parse(fs.readFileSync(path.join(root, "data/games.json"), "utf8"));
} catch (e) {
  console.error(`games.json не читается: ${e.message}`);
  process.exit(1);
}

if (!DATE_RE.test(data.updated ?? "")) errors.push(`"updated" должен быть датой YYYY-MM-DD`);
if (!Array.isArray(data.games)) errors.push(`"games" должен быть массивом`);

function checkUrl(where, key, value, isImage) {
  if (value == null) return;
  if (typeof value !== "string" || !URL_RE.test(value)) errors.push(`${where}: ${key} должен быть http(s)-ссылкой`);
  else if (isImage) images.set(value, `${where}: ${key}`);
}

// Поля «об игре» сайт больше не показывает — страница только про условия закрытия.
const OBSOLETE = ["description", "genres", "developer", "year", "rating", "achievements", "completion", "screenshots", "links", "progress", "report", "platform"];
const FIX = process.argv.includes("--fix");
let fixed = 0;

function checkConditions(where, g) {
  const file = path.join(root, "data", "conditions", `${g.id}.json`);
  if (!fs.existsSync(file)) {
    if (g.goals) errors.push(`${where}: есть goals, но нет data/conditions/${g.id}.json`);
    else if (g.status !== "planned") warnings.push(`${where}: нет условий закрытия (data/conditions/${g.id}.json)`);
    return;
  }
  const cw = `conditions/${g.id}.json`;
  let c;
  try {
    c = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    return errors.push(`${cw}: не читается: ${e.message}`);
  }
  if (!Array.isArray(c.groups) || !c.groups.length) return errors.push(`${cw}: нужен непустой groups`);
  for (const k of ["aim", "title", "revision"]) if (c[k] != null && typeof c[k] !== "string") errors.push(`${cw}: ${k} — строка`);
  for (const k of ["setup"]) if (c[k] != null && !(Array.isArray(c[k]) && c[k].every((x) => typeof x === "string"))) errors.push(`${cw}: ${k} — массив строк`);

  const nums = new Set();
  const seenImg = new Map();
  let done = 0;
  let total = 0;
  for (const [gi, gr] of c.groups.entries()) {
    if (!gr?.title) errors.push(`${cw} groups[${gi}]: нет title`);
    if (!Array.isArray(gr?.goals) || !gr.goals.length) errors.push(`${cw} groups[${gi}] (${gr?.title}): нужен непустой goals`);
    for (const goal of gr?.goals ?? []) {
      const gw = `${cw} #${goal?.n ?? "?"}`;
      total++;
      if (!Number.isInteger(goal?.n)) errors.push(`${gw}: n — номер цели`);
      else if (nums.has(goal.n)) errors.push(`${gw}: повторяющийся номер`);
      nums.add(goal?.n);
      if (!goal?.title) errors.push(`${gw}: нет title`);
      if (typeof goal?.done !== "boolean") errors.push(`${gw}: done — true/false`);
      if (goal?.done) done++;
      if (goal?.done && !goal.date) warnings.push(`${gw}: выполнена, но нет даты date`);
      if (goal?.date != null && !DATE_RE.test(goal.date)) errors.push(`${gw}: date — YYYY-MM-DD`);
      for (const k of ["gives", "needs", "unlock", "counts", "note", "details"]) if (goal?.[k] != null && typeof goal[k] !== "string") errors.push(`${gw}: ${k} — строка`);
      checkUrl(gw, "image", goal?.image, true);
      checkUrl(gw, "link", goal?.link, false);
      for (const [j, u] of (goal?.gallery ?? []).entries()) checkUrl(gw, `gallery[${j}]`, u, true);
      if (goal?.image) {
        if (seenImg.has(goal.image)) warnings.push(`${gw}: та же картинка, что у #${seenImg.get(goal.image)} — возможно, общая заглушка вики`);
        else seenImg.set(goal.image, goal.n);
      }
      for (const [j, cl] of (goal?.checklist ?? []).entries()) {
        if (!Array.isArray(cl?.items) || !cl.items.every((it) => it?.title && typeof it.done === "boolean")) {
          errors.push(`${gw}: checklist[${j}].items — [{ title, done }]`);
        }
      }
    }
  }

  const want = { done, total };
  if (g.goals?.done !== done || g.goals?.total !== total) {
    if (FIX) {
      g.goals = want;
      fixed++;
    } else {
      errors.push(`${where}: goals ${JSON.stringify(g.goals ?? null)} не совпадает с условиями ${JSON.stringify(want)} — запусти с --fix`);
    }
  }
  if (g.status === "completed" && done < total) warnings.push(`${where}: статус «пройдено», но выполнено ${done} из ${total} условий`);
  if (g.status !== "completed" && total && done === total) warnings.push(`${where}: все условия выполнены — пора ставить status: completed`);
}

const ids = new Set();
for (const [i, g] of (data.games ?? []).entries()) {
  const where = `games[${i}] (${g.id ?? g.title ?? "?"})`;
  if (!g.id || !ID_RE.test(g.id)) errors.push(`${where}: id должен быть kebab-case латиницей`);
  if (ids.has(g.id)) errors.push(`${where}: повторяющийся id`);
  ids.add(g.id);
  if (!g.title) errors.push(`${where}: нет title`);
  if (!STATUSES.includes(g.status)) errors.push(`${where}: status должен быть одним из ${STATUSES.join(", ")}`);
  for (const k of ["started", "finished", "added"]) {
    if (g[k] != null && !DATE_RE.test(g[k])) errors.push(`${where}: ${k} должен быть YYYY, YYYY-MM или YYYY-MM-DD`);
  }
  if (g.playtime != null && !(g.playtime >= 0)) errors.push(`${where}: playtime — число часов`);
  if (g.priority != null && !Number.isInteger(g.priority)) errors.push(`${where}: priority — целое число`);
  if (g.steamAppId != null && !Number.isInteger(g.steamAppId)) errors.push(`${where}: steamAppId — число`);
  const obsolete = OBSOLETE.filter((k) => g[k] != null);
  if (obsolete.length) warnings.push(`${where}: поля ${obsolete.join(", ")} на сайте не показываются — убрать`);

  for (const k of ["cover", "hero", "logo"]) checkUrl(where, k, g[k], true);
  checkConditions(where, g);

  if (g.status === "completed" && !g.finished) warnings.push(`${where}: пройдена, но нет даты finished`);
  if (g.status === "in_progress" && !g.started) warnings.push(`${where}: в процессе, но нет даты started`);
  if (!g.cover && !g.steamAppId) warnings.push(`${where}: нет обложки (cover или steamAppId)`);
  if (!g.hero && !g.steamAppId) warnings.push(`${where}: нет картинки для баннера (hero)`);
  if (g.theme != null) checkTheme(where, g);
  else warnings.push(`${where}: нет theme — карточка и страница в стандартном оформлении`);
}

for (const f of fs.existsSync(path.join(root, "data", "conditions")) ? fs.readdirSync(path.join(root, "data", "conditions")) : []) {
  if (f.endsWith(".json") && !ids.has(f.slice(0, -5))) warnings.push(`data/conditions/${f}: нет игры с таким id`);
}

if (FIX && fixed) {
  fs.writeFileSync(path.join(root, "data/games.json"), JSON.stringify(data, null, 2) + "\n");
  console.log(`исправлено goals у ${fixed} игр`);
}

async function checkImages() {
  const list = [...images.entries()];
  let i = 0;
  async function worker() {
    while (i < list.length) {
      const [url, where] = list[i++];
      const head = () => fetch(url, { method: "HEAD", redirect: "follow", headers: { "User-Agent": "Mozilla/5.0" } });
      try {
        // одна повторная попытка: CDN иногда рвёт соединение при пачке параллельных запросов
        const res = await head().catch(() => new Promise((r) => setTimeout(r, 800)).then(head));
        const type = res.headers.get("content-type") ?? "";
        if (!res.ok || !type.startsWith("image/")) errors.push(`${where}: картинка не открывается (${res.status} ${type}) ${url}`);
      } catch (e) {
        errors.push(`${where}: картинка не открывается (${e.message}) ${url}`);
      }
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker));
  console.log(`проверено картинок: ${list.length}`);
}

async function checkFonts() {
  for (const [spec, where] of fontSpecs) {
    const url = `https://fonts.googleapis.com/css2?family=${spec.trim().replace(/ /g, "+")}&display=swap`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } }).catch((e) => ({ ok: false, status: e.message }));
    if (!res.ok) errors.push(`${where}: Google Fonts не отдаёт «${spec}» (${res.status}) — проверь название и начертания: node scripts/fonts.js check`);
  }
  if (russianFonts.size) {
    const res = await fetch("https://fonts.google.com/metadata/fonts", { headers: { "User-Agent": "Mozilla/5.0" } });
    const list = JSON.parse((await res.text()).replace(/^\)\]\}'\s*/, "")).familyMetadataList;
    for (const [family, where] of russianFonts) {
      if (family === "Inter") continue;
      const f = list.find((x) => x.family === family);
      if (f && !f.subsets.includes("cyrillic")) errors.push(`${where}: «${family}» без кириллицы — русский текст будет другим шрифтом`);
    }
  }
  console.log(`проверено шрифтов: ${fontSpecs.size}`);
}

(async () => {
  if (process.argv.includes("--check-images")) {
    await checkImages();
    await checkFonts();
  }
  for (const w of warnings) console.warn(`⚠ ${w}`);
  for (const e of errors) console.error(`✗ ${e}`);
  if (errors.length) process.exit(1);
  const count = (s) => data.games.filter((g) => g.status === s).length;
  console.log(
    `✓ OK: ${data.games.length} игр (закрыто ${count("completed")}, в процессе ${count("in_progress")}, в планах ${count("planned")})`,
  );
})();
