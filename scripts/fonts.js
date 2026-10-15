// Шрифты Google Fonts для тем игр.
//
//   node scripts/fonts.js check "Cormorant SC" "Cinzel"          — есть ли кириллица, начертания и готовая строка для theme.fonts
//   node scripts/fonts.js list --cyrillic [--category Display] [текст] — поиск семейств (по популярности)
//
// Русский текст (заголовки секций, отчёт) должен рендериться шрифтом с кириллицей: headingFont и bodyFont — только такие.
// displayFont (название игры) может быть латинским, если название латиницей.

const META_URL = "https://fonts.google.com/metadata/fonts";

async function metadata() {
  const res = await fetch(META_URL, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`${res.status} ${META_URL}`);
  const text = await res.text();
  return JSON.parse(text.replace(/^\)\]\}'\s*/, "")).familyMetadataList;
}

// Строка для theme.fonts: прямые начертания из 400–800, без курсива.
function spec(f) {
  const weights = Object.keys(f.fonts).filter((k) => /^\d+$/.test(k)).map(Number);
  const use = [400, 600, 700].filter((w) => weights.includes(w));
  if (!use.length) use.push(...weights.filter((w) => w >= 300 && w <= 800).slice(0, 2));
  return use.length === 1 && use[0] === 400 ? f.family : `${f.family}:wght@${use.join(";")}`;
}

function row(f) {
  return {
    family: f.family,
    category: f.category,
    cyrillic: f.subsets.includes("cyrillic"),
    weights: Object.keys(f.fonts).join(" "),
    spec: spec(f),
  };
}

(async () => {
  const [cmd, ...args] = process.argv.slice(2);
  const all = await metadata();
  if (cmd === "check" && args.length) {
    for (const name of args) {
      const f = all.find((x) => x.family.toLowerCase() === name.toLowerCase());
      console.log(JSON.stringify(f ? row(f) : { family: name, error: "нет в Google Fonts" }));
    }
    return;
  }
  if (cmd === "list") {
    const cyr = args.includes("--cyrillic");
    const ci = args.indexOf("--category");
    const cat = ci >= 0 ? args[ci + 1] : null;
    const q = args.filter((a, i) => !a.startsWith("--") && i !== ci + 1).join(" ").toLowerCase();
    const found = all
      .filter((f) => (!cyr || f.subsets.includes("cyrillic")) && (!cat || f.category.toLowerCase() === cat.toLowerCase()))
      .filter((f) => !q || f.family.toLowerCase().includes(q))
      .sort((a, b) => a.popularity - b.popularity)
      .slice(0, 60);
    for (const f of found) console.log(`${f.family.padEnd(28)} ${f.category.padEnd(12)} ${Object.keys(f.fonts).join(" ")}`);
    return;
  }
  console.error('Использование: node scripts/fonts.js check "<семейство>" ... | list [--cyrillic] [--category Serif|Sans Serif|Display|Handwriting|Monospace] [текст]');
  process.exit(1);
})().catch((e) => {
  console.error(`Ошибка: ${e.message}`);
  process.exit(1);
});
