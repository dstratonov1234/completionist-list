(() => {
  "use strict";

  const els = {
    listView: document.getElementById("list-view"),
    search: document.getElementById("search"),
    list: document.getElementById("list"),
    gameView: document.getElementById("game-view"),
    lightbox: document.getElementById("lightbox"),
    lbImg: document.getElementById("lb-img"),
    lbCaption: document.getElementById("lb-caption"),
  };

  const state = {
    games: [],
    byId: new Map(),
    query: "",
    collapsed: new Set(),
    currentGame: null,
    entering: false,
    arriving: false,
    listScroll: 0,
    conditionsCache: new Map(),
    // Версия данных (games.json → updated) — добавляется к файлам тем, чтобы после обновления не висел старый кэш.
    version: "",
    pageToken: 0,
    handoff: null, // начало заставки, сыгранное на главной (cover), — ждёт страницу игры
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

  // Общий контекст темы на главной (banner, stage): данные игры, ассеты и картинки с запасными адресами.
  function themeBase(g, extra) {
    const hasLogo = unique(logoUrls(g).map(safeUrl)).length > 0;
    return {
      game: g,
      assets: `themes/${encodeURIComponent(g.id)}/assets/`,
      progress: { done: g.goals?.done ?? 0, total: g.goals?.total ?? 0 },
      reducedMotion: reduceMotion(),
      finePointer: window.matchMedia("(pointer: fine)").matches,
      art: {
        hero: (attrs = 'alt=""') => imgTag(heroUrls(g), attrs),
        logo: (attrs = 'alt=""') => (hasLogo ? imgTag(logoUrls(g), attrs) : ""),
        cover: (attrs = 'alt=""') => imgTag([coverUrl(g)], attrs),
      },
      esc,
      safeUrl,
      plural,
      ...extra,
    };
  }

  // Тема строит свой баннер целиком: banner(b), b.el — <a class="gbanner">, его содержимое тема заменяет.
  // Пока модуль грузится, баннер скрыт (.module-pending), чтобы не мелькал общий вид.
  function decorateBanners() {
    for (const el of els.list.querySelectorAll(".gbanner")) {
      const g = state.byId.get(el.dataset.game);
      if (g?.theme?.js !== true) continue;
      const mod = modules.registry.get(g.id);
      if (mod) {
        buildBanner(mod, g, el);
        continue;
      }
      el.classList.add("module-pending");
      const reveal = setTimeout(() => el.classList.remove("module-pending"), 2500);
      loadModule(g.id).then((m) => {
        clearTimeout(reveal);
        if (m && el.isConnected) buildBanner(m, g, el);
        el.classList.remove("module-pending");
        if (m?.stage) rebuildStage(g);
      });
    }
  }

  function buildBanner(mod, g, el) {
    if (!mod.banner || el.classList.contains("custom")) return;
    try {
      mod.banner(themeBase(g, { el }));
      el.classList.add("custom");
    } catch (e) {
      console.error(`theme ${g.id} banner:`, e);
    }
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

  // Заставка, начатая на главной (cover), передаётся странице игры: её слои уже закрывают экран,
  // page() должна их открыть и убрать. Если модуль не справился — страховка убирает их через 6 с.
  function takeHandoff(g, cleanups) {
    const handoff = state.handoff?.id === g.id ? state.handoff : null;
    if (!handoff) return null;
    state.handoff = null;
    const drop = () => handoff.layers.forEach((el) => el.remove());
    const safety = setTimeout(drop, 6000);
    cleanups.push(() => (clearTimeout(safety), drop()));
    return { layers: handoff.layers, data: handoff.data };
  }

  function makeCtx(g, cond) {
    const root = els.gameView;
    const cleanups = modules.cleanups;
    const handoff = takeHandoff(g, cleanups);
    return {
      // { layers, data } — если вход был с главной и тема сыграла начало заставки в cover(); иначе null
      handoff,
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
      // соседние игры по порядку списка: { id, title, href } или null — для своей навигации темы
      neighbors: neighborsOf(g),
      art: themeBase(g).art,
      goals: () => allGoals(cond),
      groups: () => [...root.querySelectorAll(".cond-group")],
      goalEl: (n) => root.querySelector(`.cond[data-goal="${n}"]`),
      section: (key) => root.querySelector(`.block[data-section="${key}"]`),
      // Отчёты на сайт не выводятся (они только для Claude); оставлено для совместимости модулей.
      reportReady: Promise.resolve(),
      esc,
      safeUrl,
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

  async function mountModule(g, cond) {
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
      const cleanup = mod.page(makeCtx(g, cond));
      if (typeof cleanup === "function") modules.cleanups.push(cleanup);
    } catch (e) {
      console.error(`theme ${g.id}:`, e);
    }
  }

  // cover(tctx): начало заставки игры, которое играет ещё на главной сразу после клика по баннеру.
  // Должна вернуть Promise, который выполнится, когда экран полностью закрыт. Слои создавать через tctx.layer().
  function makeCoverCtx(g) {
    dropHandoff();
    const handoff = { id: g.id, layers: [], data: {} };
    state.handoff = handoff;
    // На главной переменные темы (--t-display и др.) есть только у баннера — слоям заставки их даём сами.
    const vars = styleAttr(themeVars(g.theme));
    return {
      game: g,
      assets: `themes/${encodeURIComponent(g.id)}/assets/`,
      finePointer: window.matchMedia("(pointer: fine)").matches,
      data: handoff.data,
      esc,
      layer(className, parent = document.body) {
        const el = document.createElement("div");
        el.className = className;
        el.setAttribute("aria-hidden", "true");
        if (vars) el.setAttribute("style", vars);
        parent.append(el);
        handoff.layers.push(el);
        return el;
      },
      wait: (ms) => new Promise((r) => setTimeout(r, ms)),
    };
  }

  function dropHandoff() {
    state.handoff?.layers.forEach((el) => el.remove());
    state.handoff = null;
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
      if (img.classList.contains("gb-logo")) img.closest(".gbanner")?.classList.remove("has-logo");
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

  // ---------- главная: категории сверху вниз ----------
  // Закрытые → в процессе → в планах; внутри категории — по алфавиту. Категорию можно свернуть стрелкой
  // (запоминается в браузере). У каждой игры — свой баннер, оформленный её темой.

  const CATEGORIES = [
    { status: "completed", label: "Закрытые" },
    { status: "in_progress", label: "В процессе" },
    { status: "planned", label: "В планах" },
  ];

  const byTitle = (a, b) => a.title.localeCompare(b.title, "ru", { sensitivity: "base" });
  const ordered = () => CATEGORIES.flatMap((c) => state.games.filter((g) => g.status === c.status).sort(byTitle));

  const COLLAPSE_KEY = "cl-collapsed";

  function loadCollapsed() {
    try {
      return new Set(JSON.parse(localStorage.getItem(COLLAPSE_KEY) ?? "[]"));
    } catch {
      return new Set();
    }
  }

  function saveCollapsed() {
    try {
      localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...state.collapsed]));
    } catch {
      /* приватный режим и т.п. — просто не запоминаем */
    }
  }

  const progressBar = (done, total) => {
    const p = total ? Math.round((done / total) * 100) : 0;
    return `<div class="progress" title="${p}%"><div style="width:${p}%"></div></div>`;
  };

  const heroUrls = (g) => [g.hero, steamAsset(g, "library_hero.jpg"), coverUrl(g)];
  const logoUrls = (g) => [g.logo, steamAsset(g, "logo.png")];

  function bannerHtml(g) {
    // Ни статуса игры, ни дат: статус виден по категории в списке и по числу выполненных условий.
    const vars = themeVars(g.theme);
    const hasLogo = unique(logoUrls(g).map(safeUrl)).length > 0;
    const t = g.goals?.total ? g.goals : null;
    const progress = t
      ? `<div class="gb-count"><b>${t.done}</b><span>из ${t.total}</span></div>
         <div class="gb-label">${plural(t.total, "условие закрытия", "условия закрытия", "условий закрытия")}</div>
         ${progressBar(t.done, t.total)}`
      : `<div class="gb-label">Условия закрытия ещё не заданы</div>`;

    return `
      <a class="gbanner ${esc(g.status)} ${vars ? "themed-card" : ""} ${hasLogo ? "has-logo" : ""}" data-game="${esc(g.id)}"
         style="${esc(styleAttr(vars))}" href="#/game/${encodeURIComponent(g.id)}">
        <div class="gb-media" style="background:${gradient(g.title)}">${imgTag(heroUrls(g), 'alt="" loading="lazy"')}</div>
        <div class="gb-body">
          <div class="gb-main">
            <div class="gb-title">
              ${hasLogo ? imgTag(logoUrls(g), `class="gb-logo" alt="" loading="lazy"`) : ""}
              <h3 class="gb-name">${esc(g.title)}</h3>
            </div>
          </div>
          <div class="gb-progress">${progress}</div>
        </div>
      </a>`;
  }

  function renderList() {
    const q = state.query.trim().toLowerCase();
    const match = (g) => !q || g.title.toLowerCase().includes(q) || (g.aliases ?? []).some((a) => a.toLowerCase().includes(q));
    const html = CATEGORIES.map((c) => {
      const all = state.games.filter((g) => g.status === c.status);
      const games = all.filter(match).sort(byTitle);
      if (!games.length) return "";
      const collapsed = !q && state.collapsed.has(c.status);
      return `
        <section class="cat ${c.status} ${collapsed ? "collapsed" : ""}" data-cat="${c.status}">
          <h2 class="cat-head">
            <button type="button" class="cat-toggle" aria-expanded="${!collapsed}" aria-controls="cat-${c.status}">
              <span class="cat-arrow" aria-hidden="true"></span>
              <span class="cat-title">${c.label}</span>
              <span class="cat-count">${q ? `${games.length} из ${all.length}` : all.length}</span>
            </button>
          </h2>
          <div class="cat-body" id="cat-${c.status}"${collapsed ? " inert" : ""}>
            <div class="cat-inner">${games.map(bannerHtml).join("")}</div>
          </div>
        </section>`;
    }).join("");
    els.list.innerHTML =
      html ||
      (q
        ? `<div class="empty"><strong>Ничего не найдено</strong>Попробуй другой запрос.</div>`
        : `<div class="empty"><strong>Список пока пуст</strong>Скоро здесь появятся игры.</div>`);
    decorateBanners();
  }

  function toggleCat(btn) {
    const sec = btn.closest(".cat");
    const collapsed = !sec.classList.contains("collapsed");
    sec.classList.toggle("collapsed", collapsed);
    btn.setAttribute("aria-expanded", String(!collapsed));
    sec.querySelector(".cat-body").inert = collapsed;
    if (collapsed) state.collapsed.add(sec.dataset.cat);
    else state.collapsed.delete(sec.dataset.cat);
    saveCollapsed();
  }

  // ---------- сцена: фон главной и бесшовный вход в игру ----------
  // Наведение на баннер меняет фон главной на стартовый кадр страницы этой игры (её баннер-арт на её фоне,
  // ровно как наверху страницы игры). Клик: главная растворяется, страница игры проявляется поверх того же кадра.

  const stageEl = document.getElementById("stage");
  const stage = { current: null, leaveTimer: 0 };
  const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function stageLayer(g) {
    let layer = stageEl.querySelector(`.stage-layer[data-game="${CSS.escape(g.id)}"]`);
    if (layer) return layer;
    const vars = themeVars(g.theme);
    layer = document.createElement("div");
    layer.className = `stage-layer ${vars ? "themed-card" : ""}`;
    layer.dataset.game = g.id;
    if (vars) layer.setAttribute("style", styleAttr(vars));
    fillStage(g, layer);
    stageEl.append(layer);
    return layer;
  }

  // Стартовый кадр страницы игры: общий (баннер-арт) или свой у темы — stage(s), s.el — слой сцены.
  function fillStage(g, layer) {
    const mod = g.theme?.js === true ? modules.registry.get(g.id) : null;
    if (mod?.stage) {
      try {
        layer.innerHTML = "";
        mod.stage(themeBase(g, { el: layer }));
        layer.classList.add("custom");
        return;
      } catch (e) {
        console.error(`theme ${g.id} stage:`, e);
      }
    }
    layer.innerHTML = `<div class="stage-hero"><div class="hero-media" style="background:${gradient(g.title)}">${imgTag(heroUrls(g), 'alt=""')}</div></div>`;
  }

  function rebuildStage(g) {
    const layer = stageEl.querySelector(`.stage-layer[data-game="${CSS.escape(g.id)}"]`);
    if (layer && !layer.classList.contains("custom")) fillStage(g, layer);
  }

  function setStage(g, { instant = false } = {}) {
    clearTimeout(stage.leaveTimer);
    const id = g?.id ?? null;
    if (stage.current === id && !instant) return;
    stage.current = id;
    stageEl.classList.toggle("instant", instant);
    const target = g ? stageLayer(g) : null;
    for (const l of stageEl.querySelectorAll(".stage-layer")) if (l !== target) l.classList.remove("on");
    if (target) {
      if (instant) target.classList.add("on");
      // слой включается кадром позже (чтобы сработал переход); если за этот кадр навели на другой баннер — не включаем
      else requestAnimationFrame(() => stage.current === id && target.classList.add("on"));
    }
    document.body.classList.toggle("staged", !!g);
    if (instant) requestAnimationFrame(() => requestAnimationFrame(() => stageEl.classList.remove("instant")));
  }

  const bannerGame = (el) => state.byId.get(el?.closest?.(".gbanner")?.dataset.game);

  // Сцене темы — где баннер, на который навели: центр и размер в координатах окна (--bcx, --bcy, --bw, --bh),
  // чтобы задумка наведения могла выстроиться вокруг самого баннера, а заставка — начаться оттуда же.
  function placeStage(g, banner) {
    if (!banner) return;
    stage.banner = banner;
    const r = banner.getBoundingClientRect();
    const layer = stageLayer(g);
    layer.style.setProperty("--bcx", `${Math.round(r.left + r.width / 2)}px`);
    layer.style.setProperty("--bcy", `${Math.round(r.top + r.height / 2)}px`);
    layer.style.setProperty("--bw", `${Math.round(r.width)}px`);
    layer.style.setProperty("--bh", `${Math.round(r.height)}px`);
  }

  let placing = 0;
  window.addEventListener(
    "scroll",
    () => {
      if (placing || !stage.current || state.entering || state.arriving || location.hash.startsWith("#/game/")) return;
      placing = requestAnimationFrame(() => {
        placing = 0;
        const g = state.byId.get(stage.current);
        if (g && stage.banner?.isConnected && stage.banner.dataset.game === g.id) placeStage(g, stage.banner);
      });
    },
    { passive: true },
  );

  els.list.addEventListener("pointerover", (e) => {
    if (e.pointerType !== "mouse") return;
    const g = bannerGame(e.target);
    if (!g) return;
    setStage(g);
    placeStage(g, e.target.closest(".gbanner"));
    if (g.theme?.js === true) loadModule(g.id); // чтобы заставка могла начаться сразу по клику
  });

  els.list.addEventListener("pointerout", (e) => {
    // Во время входа в игру список становится «прозрачным» для мыши и браузер шлёт pointerout —
    // фон в этот момент сбрасывать нельзя, иначе переход перестанет быть бесшовным.
    if (state.entering || state.arriving || document.body.classList.contains("leaving")) return;
    if (e.pointerType !== "mouse" || !bannerGame(e.target) || bannerGame(e.relatedTarget)) return;
    clearTimeout(stage.leaveTimer);
    stage.leaveTimer = setTimeout(() => setStage(null), 260);
  });

  els.list.addEventListener("focusin", (e) => {
    const g = bannerGame(e.target);
    if (!g) return;
    setStage(g);
    placeStage(g, e.target.closest(".gbanner"));
    if (g.theme?.js === true) loadModule(g.id);
  });

  els.list.addEventListener("click", (e) => {
    const btn = e.target.closest(".cat-toggle");
    if (btn) return toggleCat(btn);
    const g = bannerGame(e.target);
    if (!g || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    enterGame(g);
  });

  async function enterGame(g) {
    if (state.entering) return;
    state.listScroll = window.scrollY;
    const href = `#/game/${encodeURIComponent(g.id)}`;
    if (reduceMotion()) {
      location.hash = href;
      return;
    }
    state.entering = true;
    setStage(g);
    // Выбранный баннер держит своё выделение, пока главная растворяется (мышь с него в этот момент «уходит»)
    els.list.querySelector(`.gbanner[data-game="${CSS.escape(g.id)}"]`)?.classList.add("picked");
    document.body.classList.add("leaving");
    requestAnimationFrame(() => clearTimeout(stage.leaveTimer));
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));

    // Заставка игры (занавес, тучи, глитч…) начинается прямо на главной и закрывает экран;
    // страница игры собирается под ней, а её page() открывает заставку уже на игре — без скачков.
    const mod = g.theme?.js === true ? await Promise.race([loadModule(g.id), wait(800)]) : null;
    if (mod?.cover) {
      try {
        await Promise.race([Promise.resolve(mod.cover(makeCoverCtx(g))), wait(2500)]);
        state.entering = false;
        state.arriving = true;
        location.hash = href;
        return;
      } catch (e) {
        console.error(`theme ${g.id} cover:`, e);
        dropHandoff();
      }
    }

    const img = stageLayer(g).querySelector("img");
    const loaded =
      img && !img.complete
        ? new Promise((r) => {
            img.addEventListener("load", r, { once: true });
            img.addEventListener("error", r, { once: true });
            setTimeout(r, 1200);
          })
        : null;
    await Promise.all([new Promise((r) => setTimeout(r, 450)), loaded]);
    state.entering = false;
    state.arriving = true;
    location.hash = href;
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
            <span class="cond-state">${goal.done ? "✓ Выполнено" : "Не выполнено"}</span>
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

  function sideHtml(g, cond) {
    const t = tally(allGoals(cond));
    const p = t.total ? t.done / t.total : 0;
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
          ${g.playtime != null ? `<dl class="facts">${fact("Время", fmtHours(g.playtime))}</dl>` : ""}
        </div>
      </aside>`;
  }

  function neighborsOf(g) {
    const list = ordered();
    const i = list.findIndex((x) => x.id === g.id);
    const pick = (x) => (x ? { id: x.id, title: x.title, href: `#/game/${encodeURIComponent(x.id)}` } : null);
    return { prev: pick(list[i - 1]), next: pick(list[i + 1]) };
  }

  function neighborsHtml(g) {
    const list = ordered();
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
    const hasLogo = unique(logoUrls(g).map(safeUrl)).length > 0;
    const demo = g.demo ? `<div class="hero-meta"><span class="demo-chip" title="Пробная игра для демонстрации сайта">демо</span></div>` : "";

    els.gameView.innerHTML = `
      <header class="hero ${esc(g.status)} ${hasLogo ? "has-logo" : ""}">
        <div class="hero-media" style="background:${gradient(g.title)}">${imgTag(heroUrls(g), 'alt=""')}</div>
        <div class="wrap hero-inner">
          <a class="back" href="#/">← К списку</a>
          <div class="hero-title">
            ${hasLogo ? imgTag(logoUrls(g), `class="hero-logo" alt="${esc(g.title)}"`) : ""}
            <h1>${esc(g.title)}</h1>
            ${demo}
          </div>
        </div>
      </header>
      <div class="wrap game-layout ${esc(g.status)}">
        <div class="game-main">
          ${cond ? "" : `<p class="muted cond-none">Условия закрытия для этой игры ещё не добавлены.</p>`}
          ${cond ? groupsHtml(g, cond) : ""}
          ${neighborsHtml(g)}
        </div>
        ${sideHtml(g, cond)}
      </div>`;
  }

  // Клик по группе в боковой панели — прокрутка к ней.
  els.gameView.addEventListener("click", (e) => {
    const a = e.target.closest("[data-jump]");
    if (!a) return;
    e.preventDefault();
    els.gameView.querySelector(`.cond-group[data-group="${a.dataset.jump}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

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
    // Esc в открытом окне темы (экран анализа и т.п.) закрывает только окно, со страницы не уводит
    if (e.key === "Escape" && !els.gameView.hidden && !document.querySelector("dialog[open]")) location.hash = "#/";
  });

  // ---------- routing ----------

  function showList() {
    state.pageToken++;
    dropHandoff();
    const fromGame = els.gameView.hidden ? null : state.currentGame;
    clearPageTheme();
    els.gameView.hidden = true;
    els.gameView.classList.remove("arriving");
    els.gameView.innerHTML = "";
    els.listView.hidden = false;
    document.body.classList.remove("leaving");
    for (const b of els.list.querySelectorAll(".gbanner.picked")) b.classList.remove("picked");
    document.title = SITE_TITLE;
    state.currentGame = null;
    stageEl.hidden = false;
    renderList();
    if (!fromGame) return;
    window.scrollTo(0, state.listScroll);
    if (reduceMotion()) return setStage(null, { instant: true });
    // Обратный путь: стартовый кадр игры остаётся на месте и плавно гаснет, пока главная проявляется.
    stageEl.classList.add("bare");
    setStage(fromGame, { instant: true });
    els.listView.classList.add("returning");
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        stageEl.classList.remove("bare");
        setStage(null);
      }),
    );
    setTimeout(() => els.listView.classList.remove("returning"), 700);
  }

  async function showGame(g) {
    const token = ++state.pageToken;
    if (!els.listView.hidden && !state.arriving) state.listScroll = window.scrollY;
    const arriving = state.arriving;
    state.arriving = false;
    state.currentGame = g;
    els.listView.hidden = true;
    els.gameView.hidden = false;
    els.gameView.classList.toggle("arriving", arriving);
    document.title = `${g.title} — ${SITE_TITLE}`;
    applyPageTheme(g);
    const cond = await loadConditions(g);
    if (token !== state.pageToken) return;
    renderGame(g, cond);
    window.scrollTo(0, 0);
    mountModule(g, cond);
    // Страница игры проявилась поверх того же кадра — сцену убираем без анимации
    // (на странице игры фон — её собственный, сцена бы его закрыла).
    setTimeout(() => {
      if (token !== state.pageToken) return;
      document.body.classList.remove("leaving");
      setStage(null, { instant: true });
      stageEl.hidden = true;
    }, arriving ? 600 : 0);
  }

  function route() {
    const hash = decodeURIComponent(location.hash.replace(/^#\/?/, ""));
    const [head, ...rest] = hash.split("/");
    if (els.lightbox.open) els.lightbox.close();
    const g = head === "game" ? state.byId.get(rest.join("/")) : null;
    if (g) showGame(g);
    else showList();
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
      // build — хэш кода сайта (ставит validate.js --fix): новые файлы тем не берутся из кэша
      state.version = encodeURIComponent(data.build ?? data.updated ?? "");
      state.byId = new Map(state.games.map((g) => [g.id, g]));
    } catch (err) {
      els.list.innerHTML = `<div class="empty"><strong>Не удалось загрузить список</strong>${esc(err.message)}</div>`;
      return;
    }
    state.collapsed = loadCollapsed();
    loadThemeAssets(state.games);
    route();
  }

  boot();
})();
