// Проверка data/games.json перед коммитом: node scripts/validate.js
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const STATUSES = ["completed", "in_progress", "planned", "dropped"];
const DATE_RE = /^\d{4}(-\d{2}(-\d{2})?)?$/;
const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const errors = [];
const warnings = [];

let data;
try {
  data = JSON.parse(fs.readFileSync(path.join(root, "data/games.json"), "utf8"));
} catch (e) {
  console.error(`games.json не читается: ${e.message}`);
  process.exit(1);
}

if (!DATE_RE.test(data.updated ?? "")) errors.push(`"updated" должен быть датой YYYY-MM-DD`);
if (!Array.isArray(data.games)) errors.push(`"games" должен быть массивом`);

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
  if (g.report && !fs.existsSync(path.join(root, "reports", `${g.id}.md`))) errors.push(`${where}: report=true, но нет reports/${g.id}.md`);
  if (g.status === "completed" && !g.finished) warnings.push(`${where}: пройдена, но нет даты finished`);
  if (g.status === "in_progress" && !g.started) warnings.push(`${where}: в процессе, но нет даты started`);
}

for (const f of fs.readdirSync(path.join(root, "reports"))) {
  if (!f.endsWith(".md") || f.startsWith("_")) continue;
  const id = f.slice(0, -3);
  const g = (data.games ?? []).find((x) => x.id === id);
  if (!g) warnings.push(`reports/${f}: нет игры с таким id`);
  else if (!g.report) warnings.push(`reports/${f}: файл есть, но у игры report не true`);
}

for (const w of warnings) console.warn(`⚠ ${w}`);
for (const e of errors) console.error(`✗ ${e}`);
if (errors.length) process.exit(1);

const count = (s) => data.games.filter((g) => g.status === s).length;
console.log(`✓ OK: ${data.games.length} игр (пройдено ${count("completed")}, в процессе ${count("in_progress")}, в планах ${count("planned")}, брошено ${count("dropped")})`);
