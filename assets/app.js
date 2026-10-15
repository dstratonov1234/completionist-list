(() => {
  "use strict";

  const STATUSES = {
    in_progress: { label: "В процессе", badge: "▶ В процессе" },
    completed: { label: "Пройдено", badge: "🏆 Пройдено" },
    planned: { label: "В планах", badge: "📌 В планах" },
    dropped: { label: "Брошено", badge: "✕ Брошено" },
  };
  const STATUS_ORDER = ["in_progress", "completed", "planned", "dropped"];

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
    conditionsCache: new Map(),
    // Версия данных (games.json → updated) — добавляется к файлам тем, чтобы после обновления не висел старый кэш.
    version: "",
    pageToken: 0,
    lightbox: { items: [], index: 0 },
  };

  const SITE_TITLE = "Completionist List";

  // ---------- per-game themes ----------
  // theme в games.json: цвета, шрифты, частицы и текстуры конкретной игры. Применяется к её карточке
  // (переменные на .themed-card) и ко всей странице игры (переменные + .themed на <html>).

  const COLOR_RE = /^#[0-9a-f]{3,8}$/i;
  const FONT_RE = /^[\w\s-]+$/;
  const TEXTURES = { front: ["vignette", "grain", "scanlines"], back: ["glow", "fog", "paper", "halftone"] };
  const DEFAULT_THEME_COLOR = document.querySelector('meta[name="theme-color"]')?.content ?? "#0c0e13";
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

  function luminance(hex) {
    const h = hex.replace("#", "");
    const full = h.length <= 4 ? [...h.slice(0, 3)].map((c) => c + c).join("") : h.slice(0, 6);
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  const fx = { front: null, back: null, vars: [] };

  function themeVars(t) {
    if (!t || ![t.bg, t.surface, t.text, t.accent].every((c) => COLOR_RE.test(c ?? ""))) return null;
    const sans = "Inter, system-ui, sans-serif";
    const font = (name) => (FONT_RE.test(name ?? "") ? `'${name}', ${sans}` : sans);
    const radius = clamp(Number(t.radius ?? 14) || 0, 0, 28);
    return {
      "--t-scheme": luminance(t.bg) < 0.35 ? "dark" : "light",
      "--t-radius-pill": radius < 8 ? `${radius}px` : "999px",
      "--t-bg": t.bg,
      "--t-surface": t.surface,
      "--t-text": t.text,
      "--t-accent": t.accent,
      "--t-accent-2": COLOR_RE.test(t.accent2 ?? "") ? t.accent2 : t.accent,
      "--t-display": font(t.displayFont ?? t.headingFont),
      "--t-heading": font(t.headingFont),
      "--t-body": font(t.bodyFont),
      "--t-body-size": `${clamp(Number(t.bodySize) || 15, 13, 20)}px`,
      "--t-radius": `${radius}px`,
      "--t-heading-case": t.headingCase === "uppercase" ? "uppercase" : "none",
      "--t-heading-weight": String(clamp(Number(t.headingWeight) || 700, 300, 900)),
      "--t-heading-spacing": /^-?\d*\.?\d+em$/.test(t.headingSpacing ?? "") ? t.headingSpacing : "0em",
      "--t-hero-pos": /^[\w\s%.-]+$/.test(t.heroPosition ?? "") ? t.heroPosition : "center 30%",
    };
  }

  const styleAttr = (vars) => (vars ? Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(";") : "");

  function loadStylesheet(href) {
    if (document.querySelector(`link[data-src="${CSS.escape(href)}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.src = href;
    document.head.append(link);
  }

  // Шрифты всех тем и их собственные css грузятся сразу: карточки в списке тоже оформлены.
  function loadThemeAssets(games) {
    for (const g of games) {
      if (!themeVars(g.theme)) continue;
      for (const spec of g.theme.fonts ?? []) {
        if (/^[\w\s:@;,.+-]+$/.test(spec)) loadStylesheet(`https://fonts.googleapis.com/css2?family=${spec.trim().replace(/ /g, "+")}&display=swap`);
      }
      if (g.theme.css === true) loadStylesheet(`themes/${encodeURIComponent(g.id)}/theme.css?v=${state.version}`);
    }
  }

  // ---------- per-game modules: themes/<id>/theme.js ----------
  // Модуль даёт игре собственный UI/UX/VFX: GameThemes.register("<id>", { page(ctx) { …; return cleanup } }).
  // page() вызывается после отрисовки страницы игры и может перестраивать разметку, добавлять слои,
  // анимации и интерактив. Всё, что зарегистрировано через ctx (listen, loop, layer, onCleanup),
  // убирается автоматически при уходе со страницы.

  const modules = { registry: new Map(), loading: new Map(), cleanups: [], token: 0 };

  window.GameThemes = {
    register(id, mod) {
      modules.registry.set(id, mod);
    },
  };

  function loadModule(id) {
    if (modules.registry.has(id)) return Promise.resolve(modules.registry.get(id));
    if (!modules.loading.has(id)) {
      modules.loading.set(
        id,
        new Promise((resolve) => {
          const s = document.createElement("script");
          s.src = `themes/${encodeURIComponent(id)}/theme.js?v=${state.version}`;
          s.onload = () => resolve(modules.registry.get(id) ?? null);
          s.onerror = () => resolve(null);
          document.head.append(s);
        }),
      );
    }
    return modules.loading.get(id);
  }

  function unmountModule() {
    modules.token++;
    for (const fn of modules.cleanups.splice(0).reverse()) {
      try {
        fn();
      } catch (e) {
        console.error(e);
      }
    }
    els.gameView.classList.remove("module-pending");
  }

  function makeCtx(g, cond, reportReady) {
    const root = els.gameView;
    const cleanups = modules.cleanups;
    return {
      game: g,
      root,
      html: document.documentElement,
      assets: `themes/${encodeURIComponent(g.id)}/assets/`,
      reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      finePointer: window.matchMedia("(pointer: fine)").matches,
      el: {
        hero: root.querySelector(".hero"),
        heroTitle: root.querySelector(".hero-title"),
        layout: root.querySelector(".game-layout"),
        main: root.querySelector(".game-main"),
        side: root.querySelector(".game-side"),
      },
      conditions: cond,
      goals: () => allGoals(cond),
      groups: () => [...root.querySelectorAll(".cond-group")],
      goalEl: (n) => root.querySelector(`.cond[data-goal="${n}"]`),
      section: (key) => root.querySelector(`.block[data-section="${key}"]`),
      reportReady,
      esc,
      safeUrl,
      fmtDate,
      fmtHours,
      plural,
      onCleanup: (fn) => cleanups.push(fn),
      listen(target, type, fn, opts) {
        target.addEventListener(type, fn, opts);
        cleanups.push(() => target.removeEventListener(type, fn, opts));
      },
      loop(fn) {
        let id;
        let last = performance.now();
        const tick = (now) => {
          fn(now, Math.min(0.05, (now - last) / 1000));
          last = now;
          id = requestAnimationFrame(tick);
        };
        id = requestAnimationFrame(tick);
        cleanups.push(() => cancelAnimationFrame(id));
      },
      layer(className, parent = document.body) {
        const el = document.createElement("div");
        el.className = className;
        el.setAttribute("aria-hidden", "true");
        parent.append(el);
        cleanups.push(() => el.remove());
        return el;
      },
      fx: window.GameFX,
    };
  }

  async function mountModule(g, cond, reportReady) {
    if (g.theme?.js !== true) return;
    const token = ++modules.token;
    els.gameView.classList.add("module-pending");
    const reveal = setTimeout(() => els.gameView.classList.remove("module-pending"), 2500);
    const mod = await loadModule(g.id);
    clearTimeout(reveal);
    if (token !== modules.token) return;
    els.gameView.classList.remove("module-pending");
    if (!mod?.page) return;
    try {
      const cleanup = mod.page(makeCtx(g, cond, reportReady));
      if (typeof cleanup === "function") modules.cleanups.push(cleanup);
    } catch (e) {
      console.error(`theme ${g.id}:`, e);
    }
  }

  function clearPageTheme() {
    unmountModule();
    const root = document.documentElement;
    root.classList.remove("themed");
    delete root.dataset.game;
    for (const k of fx.vars) root.style.removeProperty(k);
    fx.vars = [];
    fx.front?.remove();
    fx.back?.remove();
    fx.front = fx.back = null;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", DEFAULT_THEME_COLOR);
    window.GameFX?.stop();
  }

  function fxLayer(kind, names) {
    if (!names.length) return null;
    const el = document.createElement("div");
    el.className = `fx-${kind}`;
    el.setAttribute("aria-hidden", "true");
    el.innerHTML = names.map((n) => `<i class="tx-${n}"></i>`).join("");
    document.body.append(el);
    return el;
  }

  function applyPageTheme(g) {
    clearPageTheme();
    const root = document.documentElement;
    root.dataset.game = g.id;
    const vars = themeVars(g.theme);
    if (!vars) return;
    root.classList.add("themed");
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
    fx.vars = Object.keys(vars);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", g.theme.bg);

    const textures = [].concat(g.theme.textures ?? []);
    fx.back = fxLayer("back", textures.filter((x) => TEXTURES.back.includes(x)));
    fx.front = fxLayer("front", textures.filter((x) => TEXTURES.front.includes(x)));

    const p = typeof g.theme.particles === "string" ? { type: g.theme.particles } : g.theme.particles;
    if (p?.type) window.GameFX?.start({ ...p, color: p.color ?? g.theme.accent });
  }

  // Заголовок секции страницы игры; тема может заменить иконку (ornament) и название (sections.<key>).
  function sectionHead(g, key, label, icon, count) {
    const custom = g.theme?.sections?.[key] ?? {};
    const shownIcon = custom.icon ?? (themeVars(g.theme) && g.theme.ornament) ?? icon;
    const countHtml = count != null ? ` <span class="block-count">${esc(count)}</span>` : "";
    return `<h2><span class="sec-icon">${esc(shownIcon)}</span><span class="sec-label">${esc(custom.label ?? label)}</span>${countHtml}</h2>`;
  }

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

  // Вертикальная обложка (бокс-арт) в широкой рамке: показываем целиком поверх размытой копии.
  document.addEventListener(
    "load",
    (e) => {
      const img = e.target;
      if (!(img instanceof HTMLImageElement) || !img.naturalHeight) return;
      const wide = img.naturalWidth / img.naturalHeight > 1.3;
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
    const goalsDone = state.games.reduce((sum, g) => sum + (Number(g.goals?.done) || 0), 0);
    const tiles = [
      ["completed", "Закрыто игр", c.completed],
      ["in_progress", "В процессе", c.in_progress],
      ["planned", "В планах", c.planned],
      ["", "Целей выполнено", goalsDone.toLocaleString("ru-RU")],
    ];
    els.stats.innerHTML = tiles
      .map(([cls, label, val]) => `<div class="stat ${cls}"><dt>${label}</dt><dd>${val}</dd></div>`)
      .join("");
  }

  // Шапка главной подсвечивается артом последней закрытой (или текущей) игры.
  function renderHeaderArt() {
    const g = state.games.filter((x) => x.status === "completed").sort(compare)[0] ?? state.games.filter((x) => x.status === "in_progress").sort(compare)[0];
    const url = g && (safeUrl(g.hero) || steamAsset(g, "library_hero.jpg") || coverUrl(g));
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

  const goalsText = (t) => `${t.done} из ${t.total} ${plural(t.total, "цели", "целей", "целей")}`;

  function cardMeta(g) {
    const bits = [];
    if (g.platform) bits.push(`<span class="chip">${esc(g.platform)}</span>`);
    const date = {
      completed: g.finished && `✓ ${fmtDate(g.finished)}`,
      in_progress: g.started && `с ${fmtDate(g.started)}`,
      planned: g.added && `добавлено ${fmtDate(g.added)}`,
      dropped: (g.finished || g.started) && fmtDate(g.finished || g.started),
    }[g.status];
    if (date) bits.push(`<span>${esc(date)}</span>`);
    return bits.length ? `<div class="meta">${bits.join("")}</div>` : "";
  }

  const progressBar = (done, total) => {
    const p = total ? Math.round((done / total) * 100) : 0;
    return `<div class="progress" title="${p}%"><div style="width:${p}%"></div></div>`;
  };

  function cardHtml(g) {
    const s = STATUSES[g.status] ?? { badge: g.status };
    const priority = g.status === "planned" && g.priority != null ? `<span class="badge priority">#${esc(g.priority)}</span>` : "";
    const t = g.goals?.total ? g.goals : null;
    const goals = t
      ? `<div class="card-goals"><span>${esc(goalsText(t))}</span>${g.status === "planned" ? "" : progressBar(t.done, t.total)}</div>`
      : "";
    const note = g.notes ? `<div class="note">${esc(g.notes)}</div>` : "";
    const footer = g.report ? `<div class="card-footer">Читать отчёт →</div>` : "";
    const vars = themeVars(g.theme);

    return `
      <a class="card ${esc(g.status)} ${vars ? "themed-card" : ""}" data-game="${esc(g.id)}" style="${esc(styleAttr(vars))}" href="#/game/${encodeURIComponent(g.id)}">
        <div class="cover">${coverHtml(g)}<span class="badge">${s.badge}</span>${priority}</div>
        <div class="card-body">
          <h3 class="card-title">${esc(g.title)}</h3>
          ${cardMeta(g)}
          ${goals}
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

  // ---------- game view: условия закрытия ----------
  // Страница игры — только про цели, которые пользователь сам поставил себе для закрытия
  // (data/conditions/<id>.json, импорт из его markdown), прогресс по ним и итоговый отчёт.

  const allGoals = (c) => (c?.groups ?? []).flatMap((gr) => gr.goals ?? []);
  const tally = (goals) => ({ done: goals.filter((x) => x.done).length, total: goals.length });

  async function loadConditions(g) {
    if (!g.goals?.total) return null;
    if (!state.conditionsCache.has(g.id)) {
      const res = await fetch(`data/conditions/${encodeURIComponent(g.id)}.json`, { cache: "no-cache" }).catch(() => null);
      state.conditionsCache.set(g.id, res?.ok ? await res.json() : null);
    }
    return state.conditionsCache.get(g.id);
  }

  function fact(label, value) {
    return value == null || value === "" ? "" : `<div class="fact"><dt>${label}</dt><dd>${esc(value)}</dd></div>`;
  }

  const FIELDS = [
    ["gives", "Что даёт"],
    ["needs", "Что потребуется"],
    ["unlock", "Открывается"],
    ["counts", "Как засчитываем"],
  ];

  function checklistHtml(goal) {
    const groups = goal.checklist ?? [];
    const items = groups.flatMap((c) => c.items ?? []);
    if (!items.length) return "";
    const t = tally(items);
    return `
      <div class="cond-check">
        <div class="cond-check-head">Чек-лист <b>${t.done}/${t.total}</b></div>
        ${groups
          .map(
            (c) => `
          <div class="cond-check-group">
            ${c.label ? `<div class="cond-check-label">${esc(c.label)}</div>` : ""}
            <ul>${(c.items ?? []).map((it) => `<li class="${it.done ? "done" : ""}"><span class="cond-box" aria-hidden="true"></span>${esc(it.title)}<span class="sr-only">${it.done ? " — выполнено" : " — не выполнено"}</span></li>`).join("")}</ul>
          </div>`,
          )
          .join("")}
      </div>`;
  }

  function goalHtml(goal) {
    const img = safeUrl(goal.image);
    const facts = FIELDS.filter(([k]) => goal[k])
      .map(([k, label]) => `<div class="cond-fact" data-field="${k}"><dt>${label}</dt><dd>${esc(goal[k])}</dd></div>`)
      .concat((goal.extra ?? []).map((x) => `<div class="cond-fact"><dt>${esc(x.label)}</dt><dd>${esc(x.value)}</dd></div>`))
      .join("");
    const gallery = (goal.gallery ?? []).map(safeUrl).filter(Boolean);
    return `
      <article class="cond ${goal.done ? "done" : "todo"}" data-goal="${esc(goal.n)}" id="goal-${esc(goal.n)}">
        <div class="cond-media ${img ? "" : "empty"}" data-gallery>
          ${img ? imgTag([img], `alt="${esc(goal.title)}" loading="lazy" data-zoom data-caption="${esc(goal.title)}"`) : ""}
          <span class="cond-num">#${esc(goal.n)}</span>
        </div>
        <div class="cond-body">
          <header class="cond-head">
            <h3 class="cond-title">${esc(goal.title)}</h3>
            <span class="cond-state">${goal.done ? `✓ Выполнено${goal.date ? ` · ${esc(fmtDate(goal.date))}` : ""}` : "Не выполнено"}</span>
          </header>
          ${facts ? `<dl class="cond-facts">${facts}</dl>` : ""}
          ${checklistHtml(goal)}
          ${goal.note ? `<blockquote class="cond-note">${esc(goal.note)}</blockquote>` : ""}
          ${goal.details ? `<p class="cond-details">${esc(goal.details)}</p>` : ""}
          ${gallery.length ? `<div class="cond-gallery" data-gallery>${gallery.map((u) => imgTag([u], `alt="" loading="lazy" data-zoom data-caption="${esc(goal.title)}"`)).join("")}</div>` : ""}
          ${safeUrl(goal.link) ? `<a class="cond-link" href="${esc(goal.link)}" target="_blank" rel="noopener">Подробнее ↗</a>` : ""}
        </div>
      </article>`;
  }

  function groupsHtml(g, cond) {
    return (cond.groups ?? [])
      .map((gr, i) => {
        const t = tally(gr.goals ?? []);
        return `
          <section class="block cond-group" data-section="group" data-group="${i}">
            ${sectionHead(g, `group-${i}`, gr.title, "◆", `${t.done}/${t.total}`)}
            ${gr.note ? `<p class="cond-group-note">${esc(gr.note)}</p>` : ""}
            <div class="cond-list">${(gr.goals ?? []).map(goalHtml).join("")}</div>
          </section>`;
      })
      .join("");
  }

  function summaryHtml(g, cond) {
    const t = tally(allGoals(cond));
    const pct = t.total ? Math.round((t.done / t.total) * 100) : 0;
    return `
      <section class="cond-summary">
        <div class="cond-total">
          <b>${t.done}</b><span>из ${t.total}</span>
          <small>${g.status === "completed" ? "Игра закрыта" : `${pct}% условий закрытия выполнено`}</small>
        </div>
        ${progressBar(t.done, t.total)}
        ${cond.aim ? `<p class="cond-aim"><b>Цель закрытия.</b> ${esc(cond.aim)}</p>` : ""}
        ${cond.setup?.length ? `<ul class="cond-setup">${cond.setup.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
        ${cond.revision ? `<p class="cond-rev">${esc(cond.revision)}</p>` : ""}
      </section>`;
  }

  function sideHtml(g, cond) {
    const t = tally(allGoals(cond));
    const p = t.total ? t.done / t.total : 0;
    const days = g.status === "completed" ? daysBetween(g.started, g.finished) : null;
    const groups = (cond?.groups ?? []).map((gr) => ({ title: gr.title, ...tally(gr.goals ?? []) }));
    return `
      <aside class="game-side">
        <div class="side-card">
          ${
            cond
              ? `<div class="ring" style="--p:${p.toFixed(3)}" role="img" aria-label="Выполнено ${t.done} из ${t.total}">
                   <div class="ring-text"><b>${t.done}</b><small>из ${t.total}</small></div>
                 </div>
                 <ul class="group-progress">
                   ${groups.map((x, i) => `<li><a href="#" data-jump="${i}">${esc(x.title)}</a><b>${x.done}/${x.total}</b>${progressBar(x.done, x.total)}</li>`).join("")}
                 </ul>`
              : ""
          }
          <dl class="facts">
            ${fact("Платформа", g.platform)}
            ${fact("Начато", fmtDate(g.started))}
            ${fact(g.status === "dropped" ? "Брошено" : "Закрыто", fmtDate(g.finished))}
            ${fact("Дней", days != null ? `${days} ${plural(days, "день", "дня", "дней")}` : null)}
            ${fact("Время", g.playtime != null ? fmtHours(g.playtime) : null)}
            ${fact("В очереди", g.status === "planned" && g.priority != null ? `#${g.priority}` : null)}
            ${fact("Добавлено", fmtDate(g.added))}
          </dl>
        </div>
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

  function renderGame(g, cond) {
    const s = STATUSES[g.status] ?? { badge: g.status };
    const heroUrls = [g.hero, steamAsset(g, "library_hero.jpg"), coverUrl(g)];
    const logoUrls = [g.logo, steamAsset(g, "logo.png")];
    const hasLogo = unique(logoUrls.map(safeUrl)).length > 0;
    const metaBits =
      [g.platform].filter(Boolean).map((x) => `<span>${esc(x)}</span>`).join("") +
      (g.demo ? `<span class="demo-chip" title="Пробная игра для демонстрации сайта">демо</span>` : "");

    els.gameView.innerHTML = `
      <header class="hero ${esc(g.status)} ${hasLogo ? "has-logo" : ""}">
        <div class="hero-media" style="background:${gradient(g.title)}">${imgTag(heroUrls, 'alt=""')}</div>
        <div class="wrap hero-inner">
          <a class="back" href="#/${esc(state.tab)}">← К списку</a>
          <div class="hero-title">
            ${hasLogo ? imgTag(logoUrls, `class="hero-logo" alt="${esc(g.title)}"`) : ""}
            <h1>${esc(g.title)}</h1>
            <div class="hero-meta"><span class="status-pill">${s.badge}</span>${metaBits}</div>
          </div>
        </div>
      </header>
      <div class="wrap game-layout ${esc(g.status)}">
        <div class="game-main">
          ${cond ? summaryHtml(g, cond) : `<p class="muted cond-none">Условия закрытия для этой игры ещё не добавлены.</p>`}
          ${g.notes ? `<p class="game-notes">${esc(g.notes)}</p>` : ""}
          ${cond ? groupsHtml(g, cond) : ""}
          ${
            cond?.closing?.length
              ? `<section class="block" data-section="closing">${sectionHead(g, "closing", "Точка закрытия", "⚑")}<div class="cond-closing">${cond.closing.map((p) => `<p>${esc(p)}</p>`).join("")}</div></section>`
              : ""
          }
          ${
            g.report || g.status === "completed"
              ? `<section class="block" data-section="report">${sectionHead(g, "report", "Отчёт", "📝")}<div class="report" id="report" data-gallery>${
                  g.report ? `<p class="muted">Загружаю отчёт…</p>` : `<p class="muted">Отчёт пока не добавлен.</p>`
                }</div></section>`
              : ""
          }
          ${neighborsHtml(g)}
        </div>
        ${sideHtml(g, cond)}
      </div>`;

    return g.report ? loadReport(g) : Promise.resolve();
  }

  // Клик по группе в боковой панели — прокрутка к ней.
  els.gameView.addEventListener("click", (e) => {
    const a = e.target.closest("[data-jump]");
    if (!a) return;
    e.preventDefault();
    els.gameView.querySelector(`.cond-group[data-group="${a.dataset.jump}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

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
    state.pageToken++;
    const wasGame = !els.gameView.hidden;
    clearPageTheme();
    els.gameView.hidden = true;
    els.gameView.innerHTML = "";
    els.listView.hidden = false;
    document.title = SITE_TITLE;
    renderTabs();
    renderList();
    if (wasGame) window.scrollTo(0, state.listScroll);
  }

  async function showGame(g) {
    const token = ++state.pageToken;
    if (!els.listView.hidden) state.listScroll = window.scrollY;
    els.listView.hidden = true;
    els.gameView.hidden = false;
    document.title = `${g.title} — ${SITE_TITLE}`;
    applyPageTheme(g);
    const cond = await loadConditions(g);
    if (token !== state.pageToken) return;
    const reportReady = renderGame(g, cond);
    window.scrollTo(0, 0);
    mountModule(g, cond, reportReady);
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
      state.version = encodeURIComponent(data.updated ?? "");
      state.byId = new Map(state.games.map((g) => [g.id, g]));
      if (data.updated) els.updated.textContent = `Обновлено: ${fmtDate(data.updated)}`;
      document.getElementById("demo-note").hidden = !state.games.some((g) => g.demo);
    } catch (err) {
      els.list.innerHTML = `<div class="empty"><strong>Не удалось загрузить список</strong>${esc(err.message)}</div>`;
      return;
    }
    loadThemeAssets(state.games);
    renderStats();
    renderHeaderArt();
    route();
  }

  boot();
})();
