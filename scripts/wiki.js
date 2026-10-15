// Картинки и ссылки со статей вики (любая MediaWiki: Fandom, wiki.gg и т.п.) — для боссов, концовок, локаций.
//
//   node scripts/wiki.js hollowknight.fandom.com "Hornet" "The Radiance" "Nightmare King Grimm"
//   node scripts/wiki.js hollowknight.fandom.com/ru "Хорнет"
//   node scripts/wiki.js https://terraria.wiki.gg/api.php "Moon Lord"
//   node scripts/wiki.js hollowknight.fandom.com --images "Pure Vessel"   — все картинки статьи, если главная не подходит
//
// Для каждого названия: точная статья (с учётом редиректов), иначе первый результат поиска.
// Печатает JSON-заготовки для goals: { title, image, link }. Картинки проверяются HEAD-запросом.
// Главная картинка статьи бывает общей заглушкой (промо-арт и т.п.) — смотреть глазами перед тем, как вставлять.

const UA = { "User-Agent": "Mozilla/5.0 (completionist-list)" };

function apiUrl(wiki) {
  if (/api\.php$/.test(wiki)) return wiki.startsWith("http") ? wiki : `https://${wiki}`;
  const base = (wiki.startsWith("http") ? wiki : `https://${wiki}`).replace(/\/+$/, "");
  return `${base}/api.php`;
}

async function query(api, params) {
  const url = `${api}?${new URLSearchParams({ format: "json", formatversion: "2", ...params })}`;
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

// Wikimedia дописывает к ссылкам utm-метки — они не нужны.
function clean(url) {
  if (!url) return url;
  const u = new URL(url);
  for (const k of [...u.searchParams.keys()]) if (k.startsWith("utm_")) u.searchParams.delete(k);
  return u.toString();
}

async function imageOk(url) {
  try {
    const res = await fetch(url, { method: "HEAD", headers: UA, redirect: "follow" });
    return res.ok && (res.headers.get("content-type") ?? "").startsWith("image/");
  } catch {
    return false;
  }
}

const PAGE_PROPS = { prop: "pageimages|info", inprop: "url", pithumbsize: "800", piprop: "thumbnail|original" };

async function lookup(api, title) {
  const exact = await query(api, { action: "query", titles: title, redirects: "1", ...PAGE_PROPS });
  let page = exact.query?.pages?.find((p) => !p.missing);
  if (!page) {
    const found = await query(api, { action: "query", generator: "search", gsrsearch: title, gsrlimit: "1", ...PAGE_PROPS });
    page = found.query?.pages?.[0];
  }
  if (!page) return { query: title, error: "не найдено" };

  const candidates = [page.thumbnail?.source, page.original?.source].filter(Boolean).map(clean);
  let image;
  for (const c of candidates) if (await imageOk(c)) { image = c; break; }
  return { title: page.title, image, link: page.fullurl, ...(page.title !== title ? { query: title } : {}) };
}

async function pageImages(api, title) {
  const data = await query(api, {
    action: "query",
    titles: title,
    redirects: "1",
    generator: "images",
    gimlimit: "50",
    prop: "imageinfo",
    iiprop: "url|size",
    iiurlwidth: "800",
  });
  // Мелкие иконки навигации отбрасываем; файлы, в названии которых есть слова статьи, — первыми.
  const words = title.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  const score = (p) => words.filter((w) => p.title.toLowerCase().includes(w)).length;
  return (data.query?.pages ?? [])
    .filter((p) => p.imageinfo?.[0] && !/\.(svg|gif)$/i.test(p.title))
    .filter((p) => p.imageinfo[0].width >= 120 && p.imageinfo[0].height >= 120)
    .sort((x, y) => score(y) - score(x))
    .map((p) => ({ file: p.title, url: clean(p.imageinfo[0].thumburl ?? p.imageinfo[0].url), size: `${p.imageinfo[0].width}x${p.imageinfo[0].height}` }));
}

const args = process.argv.slice(2);
const listImages = args.includes("--images");
const [wiki, ...titles] = args.filter((a) => a !== "--images");
if (!wiki || !titles.length) {
  console.error('Использование: node scripts/wiki.js <вики, напр. hollowknight.fandom.com> [--images] "<статья>" ["<статья>" ...]');
  process.exit(1);
}

(async () => {
  const api = apiUrl(wiki);
  if (listImages) {
    for (const t of titles) console.log(JSON.stringify({ page: t, images: await pageImages(api, t) }, null, 2));
    return;
  }
  const out = [];
  for (const t of titles) {
    try {
      out.push(await lookup(api, t));
    } catch (e) {
      out.push({ query: t, error: e.message });
    }
  }
  console.log(JSON.stringify(out, null, 2));
})();
