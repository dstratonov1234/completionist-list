(() => {
  "use strict";

  const STATUSES = {
    in_progress: { label: "В процессе", badge: "▶ В процессе" },
    completed: { label: "Пройдено", badge: "🏆 Пройдено" },
    planned: { label: "В планах", badge: "📌 В планах" },
    dropped: { label: "Брошено", badge: "✕ Брошено" },
  };
  const STATUS_ORDER = ["in_progress", "completed", "planned", "dropped"];

  // Порядок секций на странице игры. layout: "cards" — карточки с большой картинкой, "list" — компактные строки с иконкой.
  const GOAL_TYPES = {
    boss: { label: "Боссы", icon: "⚔️", layout: "cards" },
    ending: { label: "Концовки", icon: "🎬", layout: "cards" },
    challenge: { label: "Испытания", icon: "🔥", layout: "cards" },
    dlc: { label: "Дополнения", icon: "🧩", layout: "cards" },
    location: { label: "Локации", icon: "🗺️", layout: "cards" },
    collectible: { label: "Коллекции", icon: "💎", layout: "cards" },
    other: { label: "Прочее", icon: "✨", layout: "cards" },
    achievement: { label: "Достижения", icon: "🏆", layout: "list" },
  };

  const els = {
    listView: document.getElementById("list-view"),
    header: document.getElementById("site-header"),
    stats: document.getElementById("stats"),
    tabs: document.getElementById("tabs"),
    search: document.getElementById("search"),
    list: document.getElementById("list"),
    gameView: document.getElementById("game-view"),
    updated: document.getElementById("updated"),
    lightbox: document.getElementById("lightbox"),
    lbImg: document.getElementById("lb-img"),
    lbCaption: document.getElementById("lb-caption"),
  };

  const state = {
    games: [],
    byId: new Map(),
    tab: null,
    query: "",
    listScroll: 0,
    reportCache: new Map(),
    lightbox: { items: [], index: 0 },
  };

  const SITE_TITLE = "Completionist List";

  // ---------- helpers ----------

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  const safeUrl = (u) => (typeof u === "string" && /^https?:\/\//i.test(u) ? u : "");

  const fmtFull = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const fmtMonth = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric", timeZone: "UTC" });

  // Accepts "YYYY", "YYYY-MM" or "YYYY-MM-DD".
  function parseDate(s) {
    if (!s) return null;
    const [y, m = 1, d = 1] = String(s).split("-").map(Number);
    if (!y) return null;
    return new Date(Date.UTC(y, m - 1, d));
  }

  function fmtDate(s) {
    const d = parseDate(s);
    if (!d) return "";
    const parts = String(s).split("-").length;
    if (parts === 1) return String(d.getUTCFullYear());
    return (parts === 2 ? fmtMonth : fmtFull).format(d).replace(/\s*г\.$/, "");
  }

  function daysBetween(a, b) {
    const da = parseDate(a), db = parseDate(b);
    if (!da || !db || String(a).length < 10 || String(b).length < 10) return null;
    return Math.max(1, Math.round((db - da) / 86400000) + 1);
  }

  const fmtHours = (h) => `${Number(h).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} ч`;

  function plural(n, one, few, many) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
    return many;
  }

  function hashHue(str) {
    let h = 0;
    for (const ch of str) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    return h % 360;
  }

  function initials(title) {
    const words = title.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
    return (words.slice(0, 2).map((w) => w[0]).join("") || "?").toUpperCase();
  }

  const gradient = (title) => {
    const hue = hashHue(title);
    return `linear-gradient(135deg,hsl(${hue} 55% 38%),hsl(${(hue + 40) % 360} 60% 22%))`;
  };

  const steamAsset = (g, file) => (g.steamAppId ? `https://cdn.cloudflare.steamstatic.com/steam/apps/${g.steamAppId}/${file}` : "");

  const coverUrl = (g) => safeUrl(g.cover) || steamAsset(g, "header.jpg");

  const unique = (arr) => [...new Set(arr.filter(Boolean))];

  // <img> that walks through fallback URLs on error; the last resort is removing itself.
  function imgTag(urls, attrs = "") {
    const [first, ...rest] = unique(urls.map(safeUrl));
    if (!first) return "";
    return `<img src="${esc(first)}" data-fallbacks="${esc(rest.join(" "))}" ${attrs}>`;
  }

  document.addEventListener(
    "error",
    (e) => {
      const img = e.target;
      if (!(img instanceof HTMLImageElement) || !img.hasAttribute("data-fallbacks")) return;
      const [next, ...rest] = img.dataset.fallbacks.split(" ").filter(Boolean);
      if (next) {
        img.dataset.fallbacks = rest.join(" ");
        img.src = next;
        return;
      }
      if (img.classList.contains("hero-logo")) img.closest(".hero")?.classList.remove("has-logo");
      img.remove();
    },
    true,
  );

  // Картинка цели без явного fit: широкие кадры (скриншоты) — на всю карточку, арт персонажей — целиком.
  // Вертикальная обложка (бокс-арт) в широкой рамке: показываем целиком поверх размытой копии.
  document.addEventListener(
    "load",
    (e) => {
      const img = e.target;
      if (!(img instanceof HTMLImageElement) || !img.naturalHeight) return;
      const wide = img.naturalWidth / img.naturalHeight > 1.3;
      const goal = img.closest(".goal-media.auto");
      if (goal) {
        goal.classList.toggle("cover", wide);
        goal.classList.toggle("contain", !wide);
      }
      const frame = img.parentElement?.matches(".cover, .hero-media") ? img.parentElement : null;
      if (frame) {
        frame.classList.toggle("portrait", !wide);
        frame.style.setProperty("--frame-img", wide ? "none" : `url(${JSON.stringify(img.currentSrc || img.src)})`);
      }
    },
    true,
  );

  function coverHtml(g) {
    const fallback = `<div class="cover-fallback" style="background:${gradient(g.title)}">${esc(initials(g.title))}</div>`;
    return fallback + imgTag([coverUrl(g)], `alt="" loading="lazy"`);
  }

  // ---------- sorting ----------

  const time = (s) => parseDate(s)?.getTime() ?? null;
  const desc = (a, b) => (b ?? -Infinity) - (a ?? -Infinity);

  function compare(a, b) {
    if (a.status !== b.status) return STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
    let r = 0;
    switch (a.status) {
      case "completed":
        r = desc(time(a.finished), time(b.finished));
        break;
      case "in_progress":
        r = desc(time(a.started), time(b.started));
        break;
      case "planned":
        r = (a.priority ?? Infinity) - (b.priority ?? Infinity) || (time(a.added) ?? 0) - (time(b.added) ?? 0);
        break;
      case "dropped":
        r = desc(time(a.finished ?? a.started), time(b.finished ?? b.started));
        break;
    }
    return (Number.isNaN(r) ? 0 : r) || a.title.localeCompare(b.title, "ru");
  }

  const visibleGames = (tab) => state.games.filter((g) => tab === "all" || g.status === tab).sort(compare);

  // ---------- list view ----------

  function counts() {
    const c = { all: state.games.length };
    for (const s of STATUS_ORDER) c[s] = 0;
    for (const g of state.games) c[g.status] = (c[g.status] ?? 0) + 1;
    return c;
  }

  function renderStats() {
    const c = counts();
    const hours = state.games.reduce((sum, g) => sum + (Number(g.playtime) || 0), 0);
    const rated = state.games.filter((g) => g.status === "completed" && g.rating != null);
    const avg = rated.length ? rated.reduce((s, g) => s + Number(g.rating), 0) / rated.length : null;
    const achievements = state.games.reduce((sum, g) => sum + (Number(g.achievements?.done) || 0), 0);

    const tiles = [
      ["completed", "Пройдено", c.completed],
      ["in_progress", "В процессе", c.in_progress],
      ["planned", "В планах", c.planned],
      ["", "Часов", Math.round(hours).toLocaleString("ru-RU")],
    ];
    if (achievements) tiles.push(["", "Ачивок", achievements.toLocaleString("ru-RU")]);
    if (avg != null) tiles.push(["", "Ср. оценка", avg.toFixed(1)]);

    els.stats.innerHTML = tiles
      .map(([cls, label, val]) => `<div class="stat ${cls}"><dt>${label}</dt><dd>${val}</dd></div>`)
      .join("");
  }

  // Шапка главной подсвечивается артом последней закрытой (или текущей) игры.
  function renderHeaderArt() {
    const g = state.games.filter((x) => x.status === "completed").sort(compare)[0] ?? state.games.filter((x) => x.status === "in_progress").sort(compare)[0];
    const url = g && (safeUrl(g.hero) || steamAsset(g, "library_hero.jpg") || safeUrl(g.screenshots?.[0]) || coverUrl(g));
    if (url) els.header.style.setProperty("--header-img", `url(${JSON.stringify(url)})`);
  }

  function availableTabs() {
    const c = counts();
    const tabs = ["in_progress", "completed", "planned"];
    if (c.dropped) tabs.push("dropped");
    tabs.push("all");
    return tabs;
  }

  function defaultTab() {
    const c = counts();
    return ["in_progress", "completed", "planned"].find((s) => c[s] > 0) ?? "all";
  }

  function renderTabs() {
    const c = counts();
    els.tabs.innerHTML = availableTabs()
      .map((key) => {
        const label = key === "all" ? "Все" : STATUSES[key].label;
        const current = key === state.tab ? ' aria-current="page"' : "";
        return `<a class="tab" data-status="${key}" href="#/${key}"${current}>${label}<span class="count">${c[key] ?? 0}</span></a>`;
      })
      .join("");
  }

  const achText = (g) => (g.achievements?.total ? `${g.achievements.done ?? 0}/${g.achievements.total}` : "");

  function cardMeta(g) {
    const bits = [];
    if (g.platform) bits.push(`<span class="chip">${esc(g.platform)}</span>`);
    switch (g.status) {
      case "completed":
        if (g.finished) bits.push(`<span>✓ ${esc(fmtDate(g.finished))}</span>`);
        if (g.playtime != null) bits.push(`<span>⏱ ${esc(fmtHours(g.playtime))}</span>`);
        if (achText(g)) bits.push(`<span>🏆 ${esc(achText(g))}</span>`);
        if (g.rating != null) bits.push(`<span class="rating">★ ${esc(g.rating)}/10</span>`);
        break;
      case "in_progress":
        if (g.started) bits.push(`<span>с ${esc(fmtDate(g.started))}</span>`);
        if (g.playtime != null) bits.push(`<span>⏱ ${esc(fmtHours(g.playtime))}</span>`);
        if (achText(g)) bits.push(`<span>🏆 ${esc(achText(g))}</span>`);
        break;
      case "planned":
        if (g.added) bits.push(`<span>добавлено ${esc(fmtDate(g.added))}</span>`);
        break;
      case "dropped":
        if (g.finished || g.started) bits.push(`<span>${esc(fmtDate(g.finished || g.started))}</span>`);
        if (g.playtime != null) bits.push(`<span>⏱ ${esc(fmtHours(g.playtime))}</span>`);
        break;
    }
    return bits.length ? `<div class="meta">${bits.join("")}</div>` : "";
  }

  const progressBar = (p) =>
    `<div class="progress" title="${esc(p)}%"><div style="width:${Math.min(100, Math.max(0, Number(p) || 0))}%"></div></div>`;

  function cardHtml(g) {
    const s = STATUSES[g.status] ?? { badge: g.status };
    const priority = g.status === "planned" && g.priority != null ? `<span class="badge priority">#${esc(g.priority)}</span>` : "";
    const progress = g.status === "in_progress" && g.progress != null ? progressBar(g.progress) : "";
    const completion = g.status === "completed" && g.completion ? `<div class="completion-note">${esc(g.completion)}</div>` : "";
    const note = g.notes ? `<div class="note">${esc(g.notes)}</div>` : "";
    const footer = g.report ? `<div class="card-footer">Читать отчёт →</div>` : "";

    return `
      <a class="card ${esc(g.status)}" href="#/game/${encodeURIComponent(g.id)}">
        <div class="cover">${coverHtml(g)}<span class="badge">${s.badge}</span>${priority}</div>
        <div class="card-body">
          <h3 class="card-title">${esc(g.title)}</h3>
          ${cardMeta(g)}
          ${progress}
          ${completion}
          ${note}
          ${footer}
        </div>
      </a>`;
  }

  function emptyHtml() {
    if (state.query) return `<div class="empty"><strong>Ничего не найдено</strong>Попробуй другой запрос.</div>`;
    const text = {
      in_progress: ["Сейчас ничего не проходится", "Самое время начать что-нибудь из планов."],
      completed: ["Пока ни одной закрытой игры", "Первый трофей впереди."],
      planned: ["Список планов пуст", "Добавь игры, в которые хочешь сыграть."],
      dropped: ["Брошенных игр нет", ""],
      all: ["Список пока пуст", "Скоро здесь появятся игры."],
    }[state.tab];
    return `<div class="empty"><strong>${text[0]}</strong>${text[1]}</div>`;
  }

  function renderList() {
    const q = state.query.trim().toLowerCase();
    const games = visibleGames(state.tab).filter(
      (g) => !q || g.title.toLowerCase().includes(q) || (g.aliases ?? []).some((a) => a.toLowerCase().includes(q)),
    );
    els.list.innerHTML = games.length ? games.map(cardHtml).join("") : emptyHtml();
  }

  // ---------- game view ----------

  function linkIcon(url) {
    const host = (() => {
      try {
        return new URL(url).hostname.replace(/^www\./, "");
      } catch {
        return "";
      }
    })();
    if (/steampowered|steamcommunity/.test(host)) return ["🎮", host];
    if (/fandom|wiki|fextralife/.test(host)) return ["📖", host];
    if (/howlongtobeat/.test(host)) return ["⏱", host];
    if (/youtube|youtu\.be/.test(host)) return ["▶", host];
    if (/twitch/.test(host)) return ["📺", host];
    if (/reddit/.test(host)) return ["💬", host];
    return ["🔗", host];
  }

  function gameLinks(g) {
    const links = (g.links ?? []).filter((l) => safeUrl(l.url));
    if (g.steamAppId && !links.some((l) => /store\.steampowered\.com/.test(l.url))) {
      links.unshift({ title: "Steam", url: `https://store.steampowered.com/app/${g.steamAppId}/` });
    }
    return links;
  }

  function goalMedia(goal, type) {
    const url = safeUrl(goal.image);
    const fit = goal.fit === "cover" || goal.fit === "contain" ? goal.fit : "auto contain";
    const fallback = `<div class="goal-fallback">${GOAL_TYPES[type]?.icon ?? "✨"}</div>`;
    const caption = esc(goal.title);
    return `<div class="goal-media ${fit}">${fallback}${
      url ? imgTag([url], `alt="${caption}" loading="lazy" data-zoom data-caption="${caption}"`) : ""
    }</div>`;
  }

  function goalFoot(goal) {
    const bits = [];
    if (goal.date) bits.push(`<span>${esc(fmtDate(goal.date))}</span>`);
    if (goal.rarity != null) bits.push(`<span class="${goal.rarity < 10 ? "rare-text" : ""}">${esc(goal.rarity)}% игроков</span>`);
    if (safeUrl(goal.link)) bits.push(`<a href="${esc(goal.link)}" target="_blank" rel="noopener">Подробнее ↗</a>`);
    return bits.length ? `<div class="goal-foot">${bits.join("")}</div>` : "";
  }

  function goalCard(goal, type) {
    const pending = goal.done === false;
    return `
      <figure class="goal ${pending ? "pending" : ""}">
        ${goalMedia(goal, type)}
        <figcaption>
          <h4>${pending ? "○ " : ""}${esc(goal.title)}</h4>
          ${goal.description ? `<p class="goal-desc">${esc(goal.description)}</p>` : ""}
          ${goal.note ? `<p class="goal-note">${esc(goal.note)}</p>` : ""}
          ${goalFoot(goal)}
        </figcaption>
      </figure>`;
  }

  function achievementRow(goal) {
    const pending = goal.done === false;
    const rare = goal.rarity != null && goal.rarity < 10;
    const url = safeUrl(goal.image);
    return `
      <div class="ach ${pending ? "pending" : ""} ${rare ? "rare" : ""}">
        <div class="ach-icon">${url ? imgTag([url], `alt="" loading="lazy" data-zoom data-caption="${esc(goal.title)}"`) : "🏆"}</div>
        <div class="ach-text">
          <div class="ach-title">${esc(goal.title)}</div>
          ${goal.description ? `<div class="ach-desc">${esc(goal.description)}</div>` : ""}
          ${goal.note ? `<div class="goal-note">${esc(goal.note)}</div>` : ""}
        </div>
        <div class="ach-side">
          ${goal.rarity != null ? `<span class="ach-rarity">${esc(goal.rarity)}%</span>` : ""}
          ${goal.date ? `<span>${esc(fmtDate(goal.date))}</span>` : ""}
          ${safeUrl(goal.link) ? `<a href="${esc(goal.link)}" target="_blank" rel="noopener">↗</a>` : ""}
        </div>
      </div>`;
  }

  function goalsHtml(g) {
    const groups = {};
    for (const goal of g.goals ?? []) {
      if (!goal?.title) continue;
      const type = GOAL_TYPES[goal.type] ? goal.type : "other";
      (groups[type] ??= []).push(goal);
    }
    return Object.entries(GOAL_TYPES)
      .filter(([type]) => groups[type])
      .map(([type, t]) => {
        const items = groups[type];
        const done = items.filter((x) => x.done !== false).length;
        const count = done === items.length ? items.length : `${done}/${items.length}`;
        const body =
          t.layout === "list"
            ? `<div class="ach-list" data-gallery>${items.map(achievementRow).join("")}</div>`
            : `<div class="goal-grid" data-gallery>${items.map((x) => goalCard(x, type)).join("")}</div>`;
        return `<section class="block"><h2>${t.icon} ${t.label} <span class="block-count">${count}</span></h2>${body}</section>`;
      })
      .join("");
  }

  function screenshotsHtml(g) {
    const shots = (g.screenshots ?? []).map(safeUrl).filter(Boolean);
    if (!shots.length) return "";
    return `
      <section class="block">
        <h2>🖼 Скриншоты</h2>
        <div class="shots" data-gallery>
          ${shots.map((u, i) => `<button class="shot" type="button">${imgTag([u], `alt="Скриншот ${i + 1}" loading="lazy" data-zoom data-caption="${esc(g.title)}"`)}</button>`).join("")}
        </div>
      </section>`;
  }

  function fact(label, value, cls = "") {
    return value == null || value === "" ? "" : `<div class="fact ${cls}"><dt>${label}</dt><dd>${esc(value)}</dd></div>`;
  }

  function scoreHtml(rating) {
    if (rating == null) return "";
    const r = Math.max(0, Math.min(10, Number(rating)));
    const pips = Array.from({ length: 10 }, (_, i) => `<i class="${i < Math.round(r) ? "on" : ""}"></i>`).join("");
    return `<div class="score"><div><span class="score-num">${esc(rating)}</span><span class="score-max">/10</span></div><div class="pips">${pips}</div></div>`;
  }

  function sideHtml(g) {
    const days = g.status === "completed" ? daysBetween(g.started, g.finished) : null;
    const links = gameLinks(g);
    return `
      <aside class="game-side">
        <div class="side-card">
          ${scoreHtml(g.rating)}
          ${g.status === "in_progress" && g.progress != null ? `<div class="side-progress"><div class="side-label">Прогресс · ${esc(g.progress)}%</div>${progressBar(g.progress)}</div>` : ""}
          <dl class="facts">
            ${fact("Платформа", g.platform)}
            ${fact("Начато", fmtDate(g.started))}
            ${fact(g.status === "dropped" ? "Брошено" : "Завершено", fmtDate(g.finished))}
            ${fact("Время", g.playtime != null ? fmtHours(g.playtime) : null)}
            ${fact("Дней", days != null ? `${days} ${plural(days, "день", "дня", "дней")}` : null)}
            ${fact("Достижения", achText(g))}
            ${fact("Приоритет", g.status === "planned" && g.priority != null ? `#${g.priority}` : null)}
            ${fact("Добавлено", fmtDate(g.added))}
            ${fact("Разработчик", g.developer)}
            ${fact("Год выхода", g.year)}
          </dl>
        </div>
        ${
          links.length
            ? `<nav class="side-card links" aria-label="Ссылки">${links
                .map((l) => {
                  const [icon, host] = linkIcon(l.url);
                  return `<a href="${esc(l.url)}" target="_blank" rel="noopener"><span class="link-icon">${icon}</span><span><b>${esc(l.title ?? host)}</b><small>${esc(host)}</small></span><span class="link-arrow">↗</span></a>`;
                })
                .join("")}</nav>`
            : ""
        }
      </aside>`;
  }

  function neighborsHtml(g) {
    const list = visibleGames(state.tab === "all" || state.tab === g.status ? state.tab : g.status);
    const i = list.findIndex((x) => x.id === g.id);
    const prev = list[i - 1], next = list[i + 1];
    if (!prev && !next) return "";
    const link = (x, dir) =>
      x
        ? `<a class="neighbor ${dir}" href="#/game/${encodeURIComponent(x.id)}"><small>${dir === "prev" ? "← Предыдущая" : "Следующая →"}</small><b>${esc(x.title)}</b></a>`
        : "<span></span>";
    return `<nav class="neighbors">${link(prev, "prev")}${link(next, "next")}</nav>`;
  }

  function renderGame(g) {
    const s = STATUSES[g.status] ?? { badge: g.status };
    const heroUrls = [g.hero, steamAsset(g, "library_hero.jpg"), ...(g.screenshots ?? []), coverUrl(g)];
    const logoUrls = [g.logo, steamAsset(g, "logo.png")];
    const hasLogo = unique(logoUrls.map(safeUrl)).length > 0;
    const genres = (g.genres ?? []).map((x) => `<span class="chip">${esc(x)}</span>`).join("");
    const metaBits = [g.platform, g.year, g.developer].filter(Boolean).map((x) => `<span>${esc(x)}</span>`).join("");

    els.gameView.innerHTML = `
      <header class="hero ${esc(g.status)} ${hasLogo ? "has-logo" : ""}">
        <div class="hero-media" style="background:${gradient(g.title)}">${imgTag(heroUrls, 'alt=""')}</div>
        <div class="wrap hero-inner">
          <a class="back" href="#/${esc(state.tab)}">← К списку</a>
          <div class="hero-title">
            ${hasLogo ? imgTag(logoUrls, `class="hero-logo" alt="${esc(g.title)}"`) : ""}
            <h1>${esc(g.title)}</h1>
            <div class="hero-meta"><span class="status-pill">${s.badge}</span>${metaBits}</div>
            ${genres ? `<div class="hero-genres">${genres}</div>` : ""}
          </div>
        </div>
      </header>
      <div class="wrap game-layout ${esc(g.status)}">
        <div class="game-main">
          ${g.completion ? `<div class="completion-banner"><span>${g.status === "completed" ? "🏆" : "🎯"}</span><div><small>${g.status === "completed" ? "Закрыто" : "Цель"}</small>${esc(g.completion)}</div></div>` : ""}
          ${g.description ? `<p class="lead">${esc(g.description)}</p>` : ""}
          ${g.notes ? `<p class="game-notes">${esc(g.notes)}</p>` : ""}
          ${
            g.report || g.status === "completed"
              ? `<section class="block"><h2>📝 Отчёт</h2><div class="report" id="report" data-gallery>${
                  g.report ? `<p class="muted">Загружаю отчёт…</p>` : `<p class="muted">Отчёт пока не добавлен.</p>`
                }</div></section>`
              : ""
          }
          ${goalsHtml(g)}
          ${screenshotsHtml(g)}
          ${neighborsHtml(g)}
        </div>
        ${sideHtml(g)}
      </div>`;

    if (g.report) loadReport(g);
  }

  async function loadReport(g) {
    const target = document.getElementById("report");
    try {
      let html = state.reportCache.get(g.id);
      if (!html) {
        const res = await fetch(`reports/${encodeURIComponent(g.id)}.md`, { cache: "no-cache" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        html = DOMPurify.sanitize(marked.parse(await res.text()));
        state.reportCache.set(g.id, html);
      }
      if (!target.isConnected) return;
      target.innerHTML = html;
      enhanceReport(target);
    } catch (err) {
      if (target.isConnected) target.innerHTML = `<p class="muted">Не удалось загрузить отчёт (${esc(err.message)}).</p>`;
    }
  }

  // Картинка одна в абзаце → figure с подписью из alt; несколько подряд → галерея.
  function enhanceReport(root) {
    const isBlank = (n) => n.nodeType === Node.TEXT_NODE && !n.textContent.trim();
    for (const p of root.querySelectorAll("p")) {
      const nodes = [...p.childNodes].filter((n) => !isBlank(n) && n.nodeName !== "BR");
      if (!nodes.length || !nodes.every((n) => n.nodeName === "IMG")) continue;
      const figures = nodes.map((img) => {
        const fig = document.createElement("figure");
        fig.append(img);
        if (img.alt) {
          const cap = document.createElement("figcaption");
          cap.textContent = img.alt;
          fig.append(cap);
        }
        return fig;
      });
      const wrap = document.createElement("div");
      wrap.className = figures.length > 1 ? "report-gallery" : "report-figure";
      wrap.append(...figures);
      p.replaceWith(wrap);
    }
    for (const img of root.querySelectorAll("img")) {
      img.loading = "lazy";
      if (!img.closest("a")) {
        img.setAttribute("data-zoom", "");
        img.dataset.caption = img.title || img.alt || "";
      }
    }
    for (const a of root.querySelectorAll('a[href^="http"]')) {
      a.target = "_blank";
      a.rel = "noopener";
    }
  }

  // ---------- lightbox ----------

  function showLightbox(i) {
    const { items } = state.lightbox;
    state.lightbox.index = (i + items.length) % items.length;
    const img = items[state.lightbox.index];
    els.lbImg.src = img.currentSrc || img.src;
    els.lbImg.alt = img.alt;
    els.lbCaption.textContent = [img.dataset.caption, items.length > 1 ? `${state.lightbox.index + 1} / ${items.length}` : ""]
      .filter(Boolean)
      .join(" · ");
    els.lightbox.classList.toggle("single", items.length < 2);
    if (!els.lightbox.open) els.lightbox.showModal();
  }

  document.addEventListener("click", (e) => {
    const img = e.target.closest?.("img[data-zoom]") ?? e.target.querySelector?.(":scope > img[data-zoom]");
    if (!img || els.lightbox.contains(img)) return;
    const group = img.closest("[data-gallery]");
    state.lightbox.items = group ? [...group.querySelectorAll("img[data-zoom]")] : [img];
    showLightbox(state.lightbox.items.indexOf(img));
  });

  els.lightbox.querySelector(".lb-close").addEventListener("click", () => els.lightbox.close());
  els.lightbox.querySelector(".lb-prev").addEventListener("click", () => showLightbox(state.lightbox.index - 1));
  els.lightbox.querySelector(".lb-next").addEventListener("click", () => showLightbox(state.lightbox.index + 1));
  els.lightbox.addEventListener("click", (e) => {
    if (e.target === els.lightbox || e.target.tagName === "FIGURE") els.lightbox.close();
  });

  document.addEventListener("keydown", (e) => {
    if (els.lightbox.open) {
      if (e.key === "ArrowLeft") showLightbox(state.lightbox.index - 1);
      if (e.key === "ArrowRight") showLightbox(state.lightbox.index + 1);
      return;
    }
    if (e.key === "Escape" && !els.gameView.hidden) location.hash = `#/${state.tab}`;
  });

  // ---------- routing ----------

  function showList() {
    const wasGame = !els.gameView.hidden;
    els.gameView.hidden = true;
    els.gameView.innerHTML = "";
    els.listView.hidden = false;
    document.title = SITE_TITLE;
    renderTabs();
    renderList();
    if (wasGame) window.scrollTo(0, state.listScroll);
  }

  function showGame(g) {
    if (!els.listView.hidden) state.listScroll = window.scrollY;
    els.listView.hidden = true;
    els.gameView.hidden = false;
    document.title = `${g.title} — ${SITE_TITLE}`;
    renderGame(g);
    window.scrollTo(0, 0);
  }

  function route() {
    const hash = decodeURIComponent(location.hash.replace(/^#\/?/, ""));
    const [head, ...rest] = hash.split("/");
    if (els.lightbox.open) els.lightbox.close();

    if (head === "game") {
      const g = state.byId.get(rest.join("/"));
      if (g) {
        state.tab ??= defaultTab();
        showGame(g);
        return;
      }
    }
    state.tab = availableTabs().includes(head) ? head : state.tab ?? defaultTab();
    showList();
  }

  els.search.addEventListener("input", () => {
    state.query = els.search.value;
    renderList();
  });

  window.addEventListener("hashchange", route);

  // ---------- boot ----------

  async function boot() {
    try {
      const res = await fetch("data/games.json", { cache: "no-cache" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      state.games = (data.games ?? []).filter((g) => g && g.id && g.title);
      state.byId = new Map(state.games.map((g) => [g.id, g]));
      if (data.updated) els.updated.textContent = `Обновлено: ${fmtDate(data.updated)}`;
    } catch (err) {
      els.list.innerHTML = `<div class="empty"><strong>Не удалось загрузить список</strong>${esc(err.message)}</div>`;
      return;
    }
    renderStats();
    renderHeaderArt();
    route();
  }

  boot();
})();
