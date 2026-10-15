// Данные игры из Steam для data/games.json.
//
//   node scripts/steam.js search "hollow knight"     — найти appid
//   node scripts/steam.js info 367520                — обложка, баннер, лого, скриншоты, описание, жанры, ссылки
//   node scripts/steam.js achievements 367520 [текст] — достижения с иконками и редкостью (можно отфильтровать)
//
// Печатает JSON, который можно вставить в запись игры / в её goals. Все картинки проверяются HEAD-запросом.

const ASSET_BASE = "https://shared.akamai.steamstatic.com/store_item_assets/";
const UA = { "User-Agent": "Mozilla/5.0 (completionist-list)", "Accept-Language": "ru,en;q=0.8" };

async function getJson(url) {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function imageOk(url) {
  try {
    const res = await fetch(url, { method: "HEAD", headers: UA, redirect: "follow" });
    return res.ok && (res.headers.get("content-type") ?? "").startsWith("image/");
  } catch {
    return false;
  }
}

async function firstOk(urls) {
  for (const u of urls.filter(Boolean)) if (await imageOk(u)) return u;
  return undefined;
}

const stripT = (u) => u?.replace(/\?t=\d+$/, "");

async function search(term) {
  const url = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(term)}&l=russian&cc=RU`;
  const data = await getJson(url);
  const rows = (data.items ?? []).map((i) => ({ appid: i.id, name: i.name, type: i.type }));
  console.log(JSON.stringify(rows, null, 2));
}

// Часть игр в регионе RU скрыта (нет скриншотов, appdetails пустой) — тогда берём регион US, язык оставляем русский.
async function storeItem(appid, country) {
  const input = {
    ids: [{ appid: Number(appid) }],
    context: { language: "russian", country_code: country },
    data_request: { include_assets: true, include_basic_info: true, include_release: true, include_screenshots: true },
  };
  const store = await getJson(
    `https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?input_json=${encodeURIComponent(JSON.stringify(input))}`,
  );
  const item = store.response?.store_items?.[0];
  const details = (await getJson(`https://store.steampowered.com/api/appdetails?appids=${appid}&l=russian&cc=${country}`))[appid]?.data;
  return { item, details };
}

async function info(appid) {
  let { item, details } = await storeItem(appid, "RU");
  if (!details || !item?.screenshots?.all_ages_screenshots?.length) {
    const us = await storeItem(appid, "US");
    if (us.item?.name) ({ item, details } = us);
  }
  if (!item || !item.name) throw new Error(`appid ${appid} не найден`);
  details ??= {};

  const a = item.assets ?? {};
  const asset = (file) => (file && a.asset_url_format ? ASSET_BASE + a.asset_url_format.replace("${FILENAME}", file) : undefined);
  const legacy = (file) => `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/${file}`;

  const cover = await firstOk([stripT(asset(a.header)), stripT(details.header_image), legacy("header.jpg")]);
  const hero = await firstOk([stripT(asset(a.library_hero)), legacy("library_hero.jpg"), stripT(details.background_raw)]);
  const logo = await firstOk([stripT(asset(a.library_logo)), `${ASSET_BASE}steam/apps/${appid}/logo.png`, legacy("logo.png")]);

  const shots = (item.screenshots?.all_ages_screenshots ?? [])
    .sort((x, y) => x.ordinal - y.ordinal)
    .map((s) => stripT(ASSET_BASE + s.filename))
    .slice(0, 8);
  const screenshots = [];
  for (const s of shots) if (await imageOk(s)) screenshots.push(s);

  const year =
    (item.release?.steam_release_date && new Date(item.release.steam_release_date * 1000).getUTCFullYear()) ||
    Number((details.release_date?.date ?? "").match(/\d{4}/)?.[0]) ||
    undefined;

  const links = [{ title: "Steam", url: `https://store.steampowered.com/app/${appid}/` }];
  if (details.website) links.push({ title: "Официальный сайт", url: details.website });
  links.push({ title: "HowLongToBeat", url: `https://howlongtobeat.com/?q=${encodeURIComponent(item.name)}` });

  const out = {
    title: item.name,
    steamAppId: Number(appid),
    cover,
    hero,
    logo,
    screenshots,
    description: item.basic_info?.short_description ?? details.short_description,
    developer: (item.basic_info?.developers ?? []).map((d) => d.name).join(", ") || (details.developers ?? []).join(", ") || undefined,
    year,
    genres: (details.genres ?? []).map((g) => g.description),
    links,
  };
  console.log(JSON.stringify(out, null, 2));
}

async function achievements(appid, filter) {
  const res = await fetch(`https://steamcommunity.com/stats/${appid}/achievements/?l=russian`, { headers: UA });
  const html = await res.text();
  const decode = (s) =>
    s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
  const rows = [];
  const re =
    /<div class="achieveRow[^"]*">\s*<div class="achieveImgHolder">\s*<img src="([^"]+)"[\s\S]*?<div class="achievePercent">([\d.,]+)%<\/div>[\s\S]*?<h3>([\s\S]*?)<\/h3>\s*<h5>([\s\S]*?)<\/h5>/g;
  for (const m of html.matchAll(re)) {
    rows.push({
      type: "achievement",
      title: decode(m[3]),
      description: decode(m[4]),
      image: m[1],
      rarity: Number(m[2].replace(",", ".")),
    });
  }
  if (!rows.length) throw new Error("достижения не найдены (у игры их нет или страница скрыта)");
  const q = filter?.toLowerCase();
  const list = q ? rows.filter((r) => `${r.title} ${r.description}`.toLowerCase().includes(q)) : rows;
  console.error(`всего достижений: ${rows.length}, показано: ${list.length}`);
  console.log(JSON.stringify(list, null, 2));
}

const [cmd, arg, extra] = process.argv.slice(2);
const run = { search: () => search(arg), info: () => info(arg), achievements: () => achievements(arg, extra) }[cmd];
if (!run || !arg) {
  console.error('Использование: node scripts/steam.js search "<название>" | info <appid> | achievements <appid> [фильтр]');
  process.exit(1);
}
run().catch((e) => {
  console.error(`Ошибка: ${e.message}`);
  process.exit(1);
});
