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
    stats: document.getElementById("stats"),
    tabs: document.getElementById("tabs"),
    search: document.getElementById("search"),
    list: document.getElementById("list"),
    updated: document.getElementById("updated"),
    dialog: document.getElementById("game-dialog"),
    dialogBody: document.getElementById("dialog-body"),
  };

  const state = {
    games: [],
    byId: new Map(),
    tab: null,
    query: "",
    reportCache: new Map(),
  };

  // ---------- helpers ----------

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

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

  function coverUrl(g) {
    if (g.cover) return g.cover;
    if (g.steamAppId) return `https://cdn.cloudflare.steamstatic.com/steam/apps/${g.steamAppId}/header.jpg`;
    return null;
  }

  function coverHtml(g) {
    const hue = hashHue(g.title);
    const fallback = `<div class="cover-fallback" style="background:linear-gradient(135deg,hsl(${hue} 55% 38%),hsl(${(hue + 40) % 360} 60% 22%))">${esc(initials(g.title))}</div>`;
    const url = coverUrl(g);
    const img = url ? `<img data-cover src="${esc(url)}" alt="" loading="lazy" style="position:relative">` : "";
    return fallback + img;
  }

  // Hide broken cover images so the generated fallback shows through.
  document.addEventListener("error", (e) => {
    if (e.target instanceof HTMLImageElement && e.target.hasAttribute("data-cover")) e.target.remove();
  }, true);

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

  // ---------- rendering ----------

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

    const tiles = [
      ["completed", "Пройдено", c.completed],
      ["in_progress", "В процессе", c.in_progress],
      ["planned", "В планах", c.planned],
      ["", "Часов", Math.round(hours).toLocaleString("ru-RU")],
    ];
    if (avg != null) tiles.push(["", "Ср. оценка", avg.toFixed(1)]);

    els.stats.innerHTML = tiles
      .map(([cls, label, val]) => `<div class="stat ${cls}"><dt>${label}</dt><dd>${val}</dd></div>`)
      .join("");
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

  function cardMeta(g) {
    const bits = [];
    if (g.platform) bits.push(`<span class="chip">${esc(g.platform)}</span>`);
    switch (g.status) {
      case "completed":
        if (g.finished) bits.push(`<span>✓ ${esc(fmtDate(g.finished))}</span>`);
        if (g.playtime != null) bits.push(`<span>⏱ ${esc(fmtHours(g.playtime))}</span>`);
        if (g.rating != null) bits.push(`<span class="rating">★ ${esc(g.rating)}/10</span>`);
        break;
      case "in_progress":
        if (g.started) bits.push(`<span>с ${esc(fmtDate(g.started))}</span>`);
        if (g.playtime != null) bits.push(`<span>⏱ ${esc(fmtHours(g.playtime))}</span>`);
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

  function cardHtml(g) {
    const s = STATUSES[g.status] ?? { badge: g.status };
    const priority = g.status === "planned" && g.priority != null ? `<span class="badge priority">#${esc(g.priority)}</span>` : "";
    const progress =
      g.status === "in_progress" && g.progress != null
        ? `<div class="progress" title="${esc(g.progress)}%"><div style="width:${Math.min(100, Math.max(0, Number(g.progress)))}%"></div></div>`
        : "";
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
    const games = state.games
      .filter((g) => state.tab === "all" || g.status === state.tab)
      .filter((g) => !q || g.title.toLowerCase().includes(q) || (g.aliases ?? []).some((a) => a.toLowerCase().includes(q)))
      .sort(compare);
    els.list.innerHTML = games.length ? games.map(cardHtml).join("") : emptyHtml();
  }

  // ---------- dialog ----------

  function fact(label, value) {
    return value == null || value === "" ? "" : `<div class="fact"><dt>${label}</dt><dd>${esc(value)}</dd></div>`;
  }

  async function loadReport(g) {
    if (state.reportCache.has(g.id)) return state.reportCache.get(g.id);
    const res = await fetch(`reports/${encodeURIComponent(g.id)}.md`, { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const md = await res.text();
    const html = DOMPurify.sanitize(marked.parse(md));
    state.reportCache.set(g.id, html);
    return html;
  }

  async function openGame(g) {
    const s = STATUSES[g.status] ?? { label: g.status };
    const days = g.status === "completed" ? daysBetween(g.started, g.finished) : null;
    const steam = g.steamAppId
      ? `<p><a class="muted" href="https://store.steampowered.com/app/${esc(g.steamAppId)}/" target="_blank" rel="noopener">Страница в Steam ↗</a></p>`
      : "";

    els.dialogBody.innerHTML = `
      <div class="dialog-cover">${coverHtml(g)}<button class="dialog-close" type="button" aria-label="Закрыть">×</button></div>
      <div class="dialog-content ${esc(g.status)}">
        <h2 id="dialog-title">${esc(g.title)}</h2>
        <span class="status-pill">${s.label}</span>
        ${g.completion ? `<p class="completion-note">${esc(g.completion)}</p>` : ""}
        <dl class="facts">
          ${fact("Платформа", g.platform)}
          ${fact("Начато", fmtDate(g.started))}
          ${fact(g.status === "dropped" ? "Брошено" : "Завершено", fmtDate(g.finished))}
          ${fact("Время", g.playtime != null ? fmtHours(g.playtime) : null)}
          ${fact("Дней", days != null ? `${days} ${plural(days, "день", "дня", "дней")}` : null)}
          ${fact("Оценка", g.rating != null ? `★ ${g.rating}/10` : null)}
          ${fact("Прогресс", g.status === "in_progress" && g.progress != null ? `${g.progress}%` : null)}
          ${fact("Приоритет", g.status === "planned" && g.priority != null ? `#${g.priority}` : null)}
          ${fact("Добавлено", fmtDate(g.added))}
        </dl>
        ${g.notes ? `<p class="muted">${esc(g.notes)}</p>` : ""}
        ${steam}
        <div class="report" id="report" ${g.report || g.status === "completed" ? "" : "hidden"}>
          ${g.report ? `<p class="muted">Загружаю отчёт…</p>` : `<p class="muted">Отчёт пока не добавлен.</p>`}
        </div>
      </div>`;

    els.dialogBody.querySelector(".dialog-close").addEventListener("click", () => els.dialog.close());
    if (!els.dialog.open) els.dialog.showModal();
    els.dialog.scrollTop = 0;

    if (g.report) {
      const target = els.dialogBody.querySelector("#report");
      try {
        target.innerHTML = await loadReport(g);
      } catch (err) {
        target.innerHTML = `<p class="muted">Не удалось загрузить отчёт (${esc(err.message)}).</p>`;
      }
    }
  }

  els.dialog.addEventListener("click", (e) => {
    if (e.target === els.dialog) els.dialog.close();
  });

  els.dialog.addEventListener("close", () => {
    if (location.hash.startsWith("#/game/")) {
      history.replaceState(null, "", `#/${state.tab}`);
      document.title = "Completionist List";
    }
  });

  // ---------- routing ----------

  function route() {
    const hash = decodeURIComponent(location.hash.replace(/^#\/?/, ""));
    const [head, ...rest] = hash.split("/");

    if (head === "game") {
      const g = state.byId.get(rest.join("/"));
      if (g) {
        if (!state.tab) state.tab = defaultTab();
        renderTabs();
        renderList();
        document.title = `${g.title} — Completionist List`;
        openGame(g);
        return;
      }
    }

    state.tab = availableTabs().includes(head) ? head : state.tab ?? defaultTab();
    if (els.dialog.open) els.dialog.close();
    renderTabs();
    renderList();
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
    route();
  }

  boot();
})();
