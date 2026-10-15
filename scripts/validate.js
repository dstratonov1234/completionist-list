// Проверка data/games.json перед коммитом:
//   node scripts/validate.js                 — структура данных
//   node scripts/validate.js --check-images  — плюс HEAD-запрос к каждой картинке (без Referer, как на сайте)
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const STATUSES = ["completed", "in_progress", "planned", "dropped"];
const GOAL_TYPES = ["boss", "ending", "challenge", "dlc", "location", "collectible", "other", "achievement"];
const DATE_RE = /^\d{4}(-\d{2}(-\d{2})?)?$/;
const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const URL_RE = /^https?:\/\/\S+$/;

const errors = [];
const warnings = [];
const images = new Map(); // url -> where

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
      try {
        const res = await fetch(url, { method: "HEAD", redirect: "follow", headers: { "User-Agent": "Mozilla/5.0" } });
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

(async () => {
  if (process.argv.includes("--check-images")) await checkImages();
  for (const w of warnings) console.warn(`⚠ ${w}`);
  for (const e of errors) console.error(`✗ ${e}`);
  if (errors.length) process.exit(1);
  const count = (s) => data.games.filter((g) => g.status === s).length;
  console.log(
    `✓ OK: ${data.games.length} игр (пройдено ${count("completed")}, в процессе ${count("in_progress")}, в планах ${count("planned")}, брошено ${count("dropped")})`,
  );
})();
