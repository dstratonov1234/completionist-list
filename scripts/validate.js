// Проверка data/games.json перед коммитом:
//   node scripts/validate.js                 — структура данных
//   node scripts/validate.js --check-images  — плюс доступность картинок (без Referer, как на сайте) и шрифтов темы
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const STATUSES = ["completed", "in_progress", "planned", "dropped"];
const GOAL_TYPES = ["boss", "ending", "challenge", "dlc", "location", "collectible", "other", "achievement"];
const DATE_RE = /^\d{4}(-\d{2}(-\d{2})?)?$/;
const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const URL_RE = /^https?:\/\/\S+$/;

const PARTICLES = ["embers", "sparks", "ash", "snow", "rain", "spores", "dust", "stars", "petals", "leaves", "bubbles"];
const TEXTURES = ["vignette", "grain", "scanlines", "glow", "fog", "paper", "halftone"];
const SECTION_KEYS = [...GOAL_TYPES, "report", "screenshots"];
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
      if (!SECTION_KEYS.includes(k)) errors.push(`${tw}: sections.${k} — неизвестная секция (есть ${SECTION_KEYS.join(", ")})`);
      if (typeof v !== "object" || (v.label == null && v.icon == null)) errors.push(`${tw}: sections.${k} — { label?, icon? }`);
    }
  }
  const cssFile = path.join(root, "themes", `${g.id}.css`);
  if (t.css === true && !fs.existsSync(cssFile)) errors.push(`${tw}: css=true, но нет themes/${g.id}.css`);
  if (t.css !== true && fs.existsSync(cssFile)) warnings.push(`${tw}: есть themes/${g.id}.css, но css не true — файл не подключится`);
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
  if (g.rating != null && !(g.rating >= 1 && g.rating <= 10)) errors.push(`${where}: rating от 1 до 10`);
  if (g.progress != null && !(g.progress >= 0 && g.progress <= 100)) errors.push(`${where}: progress от 0 до 100`);
  if (g.playtime != null && !(g.playtime >= 0)) errors.push(`${where}: playtime — число часов`);
  if (g.priority != null && !Number.isInteger(g.priority)) errors.push(`${where}: priority — целое число`);
  if (g.year != null && !Number.isInteger(g.year)) errors.push(`${where}: year — целое число`);
  if (g.steamAppId != null && !Number.isInteger(g.steamAppId)) errors.push(`${where}: steamAppId — число`);
  if (g.genres != null && !(Array.isArray(g.genres) && g.genres.every((x) => typeof x === "string"))) errors.push(`${where}: genres — массив строк`);
  if (g.achievements != null) {
    const { done, total } = g.achievements;
    if (!Number.isInteger(done) || !Number.isInteger(total) || done > total) errors.push(`${where}: achievements = { done, total }, done ≤ total`);
  }

  for (const k of ["cover", "hero", "logo"]) checkUrl(where, k, g[k], true);
  if (g.screenshots != null) {
    if (!Array.isArray(g.screenshots)) errors.push(`${where}: screenshots — массив ссылок`);
    else g.screenshots.forEach((u, j) => checkUrl(where, `screenshots[${j}]`, u, true));
  }
  if (g.links != null) {
    if (!Array.isArray(g.links)) errors.push(`${where}: links — массив { title, url }`);
    else g.links.forEach((l, j) => {
      if (!l?.title) errors.push(`${where}: links[${j}] без title`);
      checkUrl(where, `links[${j}].url`, l?.url ?? "", false);
    });
  }

  if (g.goals != null) {
    if (!Array.isArray(g.goals)) errors.push(`${where}: goals — массив`);
    const seen = new Map();
    for (const [j, goal] of (Array.isArray(g.goals) ? g.goals : []).entries()) {
      const gw = `${where} goals[${j}] (${goal?.title ?? "?"})`;
      if (!goal?.title) errors.push(`${gw}: нет title`);
      if (!GOAL_TYPES.includes(goal?.type)) errors.push(`${gw}: type должен быть одним из ${GOAL_TYPES.join(", ")}`);
      checkUrl(gw, "image", goal?.image, true);
      checkUrl(gw, "link", goal?.link, false);
      if (goal?.date != null && !DATE_RE.test(goal.date)) errors.push(`${gw}: date должен быть YYYY-MM-DD`);
      if (goal?.rarity != null && !(goal.rarity >= 0 && goal.rarity <= 100)) errors.push(`${gw}: rarity — процент 0–100`);
      if (goal?.done != null && typeof goal.done !== "boolean") errors.push(`${gw}: done — true/false`);
      if (goal?.fit != null && !["cover", "contain"].includes(goal.fit)) errors.push(`${gw}: fit — cover или contain`);
      if (goal?.image && goal.type !== "achievement") {
        if (seen.has(goal.image)) warnings.push(`${gw}: та же картинка, что у «${seen.get(goal.image)}» — возможно, общая заглушка вики`);
        else seen.set(goal.image, goal.title);
      }
    }
  }

  if (g.report && !fs.existsSync(path.join(root, "reports", `${g.id}.md`))) errors.push(`${where}: report=true, но нет reports/${g.id}.md`);
  if (g.status === "completed" && !g.finished) warnings.push(`${where}: пройдена, но нет даты finished`);
  if (g.status === "in_progress" && !g.started) warnings.push(`${where}: в процессе, но нет даты started`);
  if (!g.cover && !g.steamAppId) warnings.push(`${where}: нет обложки (cover или steamAppId)`);
  if (!g.hero && !g.steamAppId && !g.screenshots?.length) warnings.push(`${where}: нет картинки для баннера (hero или screenshots)`);
  if (g.status === "completed" && !g.goals?.length) warnings.push(`${where}: пройдена, но нет goals (боссы, ачивки, концовки)`);
  if (g.theme != null) checkTheme(where, g);
  else warnings.push(`${where}: нет theme — карточка и страница в стандартном оформлении`);
}

for (const f of fs.readdirSync(path.join(root, "reports"))) {
  if (!f.endsWith(".md") || f.startsWith("_")) continue;
  const id = f.slice(0, -3);
  const g = (data.games ?? []).find((x) => x.id === id);
  if (!g) warnings.push(`reports/${f}: нет игры с таким id`);
  else if (!g.report) warnings.push(`reports/${f}: файл есть, но у игры report не true`);
  const md = fs.readFileSync(path.join(root, "reports", f), "utf8");
  for (const m of md.matchAll(/!\[[^\]]*\]\((\S+?)(?:\s+"[^"]*")?\)/g)) images.set(m[1], `reports/${f}`);
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
    `✓ OK: ${data.games.length} игр (пройдено ${count("completed")}, в процессе ${count("in_progress")}, в планах ${count("planned")}, брошено ${count("dropped")})`,
  );
})();
