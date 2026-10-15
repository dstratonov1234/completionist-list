// Импорт «условий закрытия» игры из markdown-файла пользователя в data/conditions/<id>.json.
//
//   node scripts/import-conditions.js "<путь к УСЛОВИЯ_ЗАКРЫТИЯ.md>" <id>
//
// Формат файла (его составляет пользователь по своей инструкции):
//   # Заголовок · ## Конечный список:
//   ### Группа → необязательный абзац → таблица | # | Цель | Что нового даёт | Что потребуется / Открывается | Как засчитываем | Статус |
//   **Чек-лист для #N:** → строки «☐ Пункт · ☑ Пункт», можно с префиксом «Базовые:»
// Остальные разделы и шапка («Цель», «Игра», редакция, «Точка закрытия», «Сознательно не делаем», «Источники», …)
// на сайт не идут:
// игра закрыта, когда выполнены все условия, — отдельная «точка закрытия» на сайте не нужна.
//
// Повторный импорт (пользователь прислал новую редакцию или отметил ☑) обновляет тексты и статусы,
// а картинки, ссылки, даты, заметки и прочее, что добавили на сайте, сохраняет — сопоставление по номеру цели.

const fs = require("fs");
const path = require("path");

const [src, id] = process.argv.slice(2);
if (!src || !id || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) {
  console.error('Использование: node scripts/import-conditions.js "<файл.md>" <id-игры>');
  process.exit(1);
}

const md = fs.readFileSync(src, "utf8").replace(/\r\n/g, "\n");
const lines = md.split("\n");
const today = new Date().toISOString().slice(0, 10);

// Markdown внутри ячеек: **жирный**, `код`, [текст](url) → текст.
const plain = (s) =>
  s
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
const firstUrl = (s) => s.match(/\]\((https?:[^)\s]+)\)/)?.[1];
const isDone = (s) => /☑|✅|✔|\[x\]/i.test(s);

const COLUMNS = [
  [/^#$|^№$/, "n"],
  [/^цель/i, "title"],
  [/нового|даёт|дает/i, "gives"],
  [/потребуется|нужно/i, "needs"],
  [/открывается|открыть/i, "unlock"],
  [/засчитыва/i, "counts"],
  [/статус/i, "status"],
];

function sectionLines(title) {
  const start = lines.findIndex((l) => new RegExp(`^##\\s+${title}`, "i").test(l));
  if (start < 0) return [];
  let end = lines.findIndex((l, i) => i > start && /^##\s/.test(l) && !/^###/.test(l));
  if (end < 0) end = lines.length;
  return lines.slice(start + 1, end);
}

function paragraphs(block) {
  return block
    .join("\n")
    .split(/\n\s*\n/)
    .map((p) => plain(p.replace(/\n/g, " ")))
    .filter(Boolean);
}

function parseTable(block, i) {
  const row = (l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  const header = row(block[i]).map((h) => COLUMNS.find(([re]) => re.test(h))?.[1] ?? h);
  const out = [];
  for (let j = i + 2; j < block.length && block[j].trim().startsWith("|"); j++) {
    const cells = row(block[j]);
    const goal = { extra: [] };
    header.forEach((key, k) => {
      const raw = cells[k] ?? "";
      if (key === "n") goal.n = Number(raw.replace(/\D/g, ""));
      else if (key === "status") goal.done = isDone(raw);
      else if (["title", "gives", "needs", "unlock", "counts"].includes(key)) {
        if (plain(raw)) goal[key] = plain(raw);
        if (key === "title" && firstUrl(raw)) goal.link = firstUrl(raw);
      } else if (plain(raw)) goal.extra.push({ label: plain(key), value: plain(raw) });
    });
    if (!goal.extra.length) delete goal.extra;
    if (goal.title) out.push(goal);
  }
  return out;
}

// Чек-лист: строки с ☐/☑, пункты через «·»; «Базовые: ☐ A · ☐ B» → подгруппа «Базовые».
function parseChecklist(block, i) {
  const groups = [];
  let cur = null;
  for (let j = i + 1; j < block.length; j++) {
    const l = block[j];
    if (!l.trim()) {
      if (groups.length) break;
      continue;
    }
    if (!/[☐☑✅]/.test(l)) {
      if (groups.length) break;
      continue;
    }
    const text = l.replace(/^\s*[-*]\s*/, "");
    const label = text.match(/^([^☐☑✅:]+):\s*/);
    if (label || !cur || /^\s*[-*]/.test(l)) {
      cur = { label: label ? plain(label[1]) : null, items: [] };
      groups.push(cur);
    }
    const body = label ? text.slice(label[0].length) : text;
    for (const part of body.split(/·|\s{2,}(?=[☐☑✅])/)) {
      const m = part.match(/([☐☑✅])\s*(.+)/);
      if (m) cur.items.push({ title: plain(m[2]), done: m[1] !== "☐" });
    }
  }
  return groups.filter((g) => g.items.length).map((g) => (g.label ? g : { items: g.items }));
}

// ---------- разбор ----------

const title = plain(lines.find((l) => /^#\s/.test(l))?.replace(/^#\s+/, "") ?? id);

const listBlock = sectionLines("Конечный список");
const groups = [];
const byN = new Map();
let group = null;
for (let i = 0; i < listBlock.length; i++) {
  const l = listBlock[i];
  if (/^###\s/.test(l)) {
    group = { title: plain(l.replace(/^###\s+/, "")), goals: [] };
    groups.push(group);
    continue;
  }
  if (!group) continue;
  if (l.trim().startsWith("|") && /^\s*\|[\s|:-]+\|\s*$/.test(listBlock[i + 1] ?? "")) {
    for (const g of parseTable(listBlock, i)) {
      group.goals.push(g);
      byN.set(g.n, g);
    }
    while (i + 1 < listBlock.length && listBlock[i + 1].trim().startsWith("|")) i++;
    continue;
  }
  const check = l.match(/чек-?лист\s+для\s+#?(\d+)/i);
  if (check) {
    const target = byN.get(Number(check[1]));
    const cl = parseChecklist(listBlock, i);
    if (target && cl.length) target.checklist = cl;
    continue;
  }
  if (l.trim() && !group.goals.length && !/^статус:/i.test(l.trim())) {
    group.note = [group.note, plain(l)].filter(Boolean).join(" ");
  }
}

// На сайт идут только группы и цели: «Цель», раздел «Игра» и редакция — служебные, их не показываем.
const parsed = { title, groups: groups.filter((g) => g.goals.length) };

// ---------- слияние с тем, что уже есть на сайте ----------

const out = path.join(__dirname, "..", "data", "conditions", `${id}.json`);
const KEEP = ["image", "imageFit", "link", "date", "note", "details", "gallery"];
if (fs.existsSync(out)) {
  const prev = JSON.parse(fs.readFileSync(out, "utf8"));
  const old = new Map(prev.groups.flatMap((g) => g.goals).map((g) => [g.n, g]));
  for (const g of parsed.groups.flatMap((x) => x.goals)) {
    const o = old.get(g.n);
    if (!o) continue;
    for (const k of KEEP) if (o[k] != null && g[k] == null) g[k] = o[k];
    if (o.done && !g.done) g.done = true; // отметку с сайта не снимаем молча
    if (g.checklist && o.checklist) {
      const oldItems = new Map(o.checklist.flatMap((c) => c.items).map((it) => [it.title, it]));
      for (const it of g.checklist.flatMap((c) => c.items)) {
        const oi = oldItems.get(it.title);
        if (oi?.done) it.done = true;
        if (oi?.date) it.date = oi.date;
      }
    }
  }
  for (const k of Object.keys(prev)) if (!(k in parsed) && k !== "groups") parsed[k] = prev[k];
}
for (const g of parsed.groups.flatMap((x) => x.goals)) if (g.done && !g.date) g.date = today;

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(parsed, null, 2) + "\n");

const all = parsed.groups.flatMap((g) => g.goals);
console.log(`✓ ${path.relative(process.cwd(), out)}: ${parsed.groups.length} групп, ${all.length} целей, выполнено ${all.filter((g) => g.done).length}`);
for (const g of parsed.groups) console.log(`  ${g.title}: ${g.goals.map((x) => `#${x.n}${x.done ? "☑" : ""}${x.checklist ? `(+${x.checklist.flatMap((c) => c.items).length})` : ""}`).join(" ")}`);
