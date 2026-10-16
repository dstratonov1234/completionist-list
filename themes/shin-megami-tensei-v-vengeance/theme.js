// Shin Megami Tensei V: Vengeance — «Компендиум».
// Всё своё, по мотивам интерфейса SMT V:
//  · баннер на главной — слот сохранения: арт, логотип, фаза луны по прогрессу и шкала Магацухи,
//    при наведении въезжает голубая полоса выбора, как курсор в меню;
//  · при наведении на баннер над главной собирается Магацухи: багровая сетка, поднимающиеся капли,
//    луна в фазе прогресса всходит в углу, сквозь дымку проступают демоны с обложки;
//  · страница — экран компендиума во всю высоту: сверху HUD (луна с числом выполненных, логотип, шкала
//    Магацухи), слева вертикальные вкладки «рас» (группы условий) со значками ходов и записи компендиума,
//    в центре арена — цели стоят на светящейся воде, выбранная крупно, остальные по бокам; невыполненные —
//    силуэты, как незарегистрированные демоны; при выборе под ногами вспыхивает круг призыва; справа —
//    табличка экрана статуса; внизу арены — подсказки кнопок (B — назад, L/R — группа, ◀▶ — условие);
//  · капли Магацухи поднимаются по экрану, тянутся за курсором и за выполненными целями;
//  · заставка — плоские багровые круги, как на обложке Vengeance, расцветают из баннера ещё на главной,
//    поверх проступает огромная «V» и название; на странице круги лопаются и открывают экран.
(() => {
  "use strict";

  const FIELDS = [
    ["gives", "Что даёт"],
    ["needs", "Что потребуется"],
    ["unlock", "Открывается"],
    ["counts", "Как засчитываем"],
  ];

  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const SCALE = [1, 0.56, 0.4]; // арена: масштаб выбранной цели и соседей
  const easeOut = (x) => 1 - Math.pow(1 - x, 3);
  const easeIn = (x) => x * x * x;
  let uid = 0;

  // ---------- луна: фаза по доле выполненных условий (0 — новолуние, 1 — полнолуние) ----------
  function litPath(cx, cy, r, k) {
    if (k <= 0.001) return "";
    if (k >= 0.999) return `M${cx - r},${cy}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0Z`;
    const rx = (r * Math.abs(1 - 2 * k)).toFixed(2);
    return `M${cx},${cy - r}A${r},${r} 0 0,1 ${cx},${cy + r}A${rx},${r} 0 0,${k < 0.5 ? 0 : 1} ${cx},${cy - r}Z`;
  }

  function moonSvg(assets, k, cls) {
    const id = `smt-lit-${++uid}`;
    return `
      <svg class="${cls}" viewBox="0 0 200 200" aria-hidden="true" focusable="false">
        <defs><clipPath id="${id}"><path d="${litPath(100, 100, 85.5, k)}"/></clipPath></defs>
        <image class="smt-moon-dark" href="${assets}moon.webp" x="6" y="6" width="188" height="190"/>
        <image href="${assets}moon.webp" x="6" y="6" width="188" height="190" clip-path="url(#${id})"/>
      </svg>`;
  }

  const gauge = (k) => `<span class="smt-gauge" style="--p:${clamp01(k).toFixed(3)}"><i></i></span>`;

  // ---------- заставка: плоские круги Магацухи и «V» ----------
  const PALETTE = ["#6e0c1b", "#8e1226", "#b3182f", "#d42340", "#4a0812", "#ec3a52", "#5a0a16"];
  const BASE = "#250409";
  const COVER_MS = 760;
  const GROW = 0.42; // с — рост одного круга
  const SPREAD = 0.34; // с — волна от точки клика до дальнего угла
  const FILL = [0.36, 0.66]; // с — подложка проявляется плавно, чтобы не осталось просветов
  const VSLASH = [0.34, 0.62]; // с — две черты «V» прочерчиваются
  const OPEN = { pop: 0.34, spread: 0.42, fill: 0.26, v: 0.18 };
  const HOLD = { direct: 650, repeat: 260, handoff: 280 };

  function makeBloom(layer, game, esc, ox, oy) {
    const canvas = document.createElement("canvas");
    const title = document.createElement("div");
    title.className = "smt-bloom-title";
    title.innerHTML = `<span>${esc(game.title)}</span>`;
    layer.append(canvas, title);
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const g = canvas.getContext("2d");
    g.scale(dpr, dpr);
    const diag = Math.hypot(w, h);
    const far = Math.max(Math.hypot(ox, oy), Math.hypot(w - ox, oy), Math.hypot(ox, h - oy), Math.hypot(w - ox, h - oy)) || 1;
    const n = Math.round(44 + Math.min(1.6, (w * h) / (1440 * 900)) * 34);
    const circles = [{ x: ox, y: oy, r: diag * 0.2, c: "#b3182f", ring: false, d: 0, delay: 0 }];
    for (let i = 0; i < n; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      const d = Math.hypot(x - ox, y - oy) / far;
      circles.push({ x, y, r: diag * (0.04 + Math.random() * 0.15), c: PALETTE[i % PALETTE.length], ring: i % 5 === 0, d, delay: d * SPREAD + Math.random() * 0.07 });
    }
    for (const c of circles) c.pop = Math.random() * 0.12 + c.d * OPEN.spread;
    // «V» Vengeance: две черты сходятся под названием
    const cx = w / 2;
    const v = [
      [cx - Math.min(w * 0.3, h * 0.55), h * 0.12],
      [cx, h * 0.8],
      [cx + Math.min(w * 0.34, h * 0.62), h * 0.06],
    ];
    return { layer, canvas, title, g, w, h, circles, drops: [], v };
  }

  function grid(g, w, h, alpha) {
    if (alpha <= 0) return;
    g.save();
    g.globalAlpha = alpha * 0.2;
    g.strokeStyle = "#ff4a5f";
    g.lineWidth = 1;
    g.beginPath();
    for (let x = 0; x <= w; x += 28) (g.moveTo(x + 0.5, 0), g.lineTo(x + 0.5, h));
    for (let y = 0; y <= h; y += 28) (g.moveTo(0, y + 0.5), g.lineTo(w, y + 0.5));
    g.stroke();
    g.restore();
  }

  // плоский круг, как на обложке: заливка, тёмное ядро-тень и тонкий светлый край; часть — только кольца
  function disc(g, c, x, y, r, alpha) {
    if (r <= 0.5 || alpha <= 0) return;
    g.globalAlpha = alpha;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    if (c.ring) {
      g.lineWidth = Math.max(2, r * 0.06);
      g.strokeStyle = c.c;
      g.stroke();
    } else {
      g.fillStyle = c.c;
      g.fill();
      g.globalAlpha = alpha * 0.35;
      g.beginPath();
      g.arc(x + r * 0.12, y + r * 0.14, r * 0.72, 0, Math.PI * 2);
      g.fillStyle = "#1a0207";
      g.fill();
      g.globalAlpha = alpha * 0.7;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.lineWidth = 1.2;
      g.strokeStyle = "#ff7a8b";
      g.stroke();
    }
    g.globalAlpha = 1;
  }

  function vslash(g, b, p, alpha) {
    if (p <= 0 || alpha <= 0) return;
    const [a, m, c] = b.v;
    const seg = (from, to, k) => [from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k];
    const l1 = clamp01(p * 2);
    const l2 = clamp01(p * 2 - 1);
    g.save();
    g.lineCap = "round";
    g.lineJoin = "miter";
    for (const [width, color, a2] of [[34, "#7a0a1a", 0.9], [18, "#ff3b54", 1], [5, "#fff2f4", 1]]) {
      g.globalAlpha = alpha * a2;
      g.lineWidth = width;
      g.strokeStyle = color;
      g.beginPath();
      g.moveTo(...a);
      g.lineTo(...seg(a, m, l1));
      if (l2 > 0) g.lineTo(...seg(m, c, l2));
      g.stroke();
    }
    g.restore();
  }

  function drawIn(b, t) {
    const { g, w, h } = b;
    g.clearRect(0, 0, w, h);
    const fill = clamp01((t - FILL[0]) / (FILL[1] - FILL[0]));
    if (fill > 0) {
      g.globalAlpha = fill;
      g.fillStyle = BASE;
      g.fillRect(0, 0, w, h);
      g.globalAlpha = 1;
    }
    for (const c of b.circles) disc(g, c, c.x, c.y, c.r * easeOut(clamp01((t - c.delay) / GROW)), 1);
    grid(g, w, h, fill);
    vslash(g, b, easeOut(clamp01((t - VSLASH[0]) / (VSLASH[1] - VSLASH[0]))), 1);
    return t >= Math.max(FILL[1], VSLASH[1]);
  }

  function drawOut(b, u, dt) {
    const { g, w, h } = b;
    g.clearRect(0, 0, w, h);
    const fill = 1 - clamp01(u / OPEN.fill);
    if (fill > 0) {
      g.globalAlpha = fill;
      g.fillStyle = BASE;
      g.fillRect(0, 0, w, h);
      g.globalAlpha = 1;
    }
    let alive = false;
    for (const c of b.circles) {
      const k = clamp01((u - c.pop) / OPEN.pop);
      if (k >= 1) {
        if (!c.burst) {
          c.burst = true;
          const count = c.r > 60 ? 6 : 3;
          for (let i = 0; i < count; i++) {
            const a = Math.random() * Math.PI * 2;
            const v = 60 + Math.random() * 160;
            b.drops.push({ x: c.x, y: c.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, r: 2 + Math.random() * 5, life: 0.45 + Math.random() * 0.3, t: 0 });
          }
        }
        continue;
      }
      alive = true;
      disc(g, c, c.x, c.y - k * 26, c.r * (1 + k * 0.12) * (1 - easeIn(k)), 1 - k * 0.4);
    }
    grid(g, w, h, fill);
    vslash(g, b, 1, 1 - clamp01(u / OPEN.v));
    for (const d of b.drops) {
      d.t += dt;
      if (d.t >= d.life) continue;
      alive = true;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.vy += 260 * dt;
      g.globalAlpha = 1 - d.t / d.life;
      g.fillStyle = "#ff4a5f";
      g.beginPath();
      g.arc(d.x, d.y, d.r * (1 - (d.t / d.life) * 0.5), 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    return !alive && fill <= 0;
  }

  function seenBefore() {
    try {
      const seen = sessionStorage.getItem("smt-bloom") === "1";
      sessionStorage.setItem("smt-bloom", "1");
      return seen;
    } catch {
      return false;
    }
  }

  GameThemes.register("shin-megami-tensei-v-vengeance", {
    // ---------- главная: слот сохранения ----------
    // Композиция — по центру: большая луна в фазе прогресса с числом выполненных, под ней логотип, по бокам
    // из красной тьмы проступают демоны с обложки, внизу — значки ходов (по одному на условие).
    // При наведении луна разгорается, поднимаются капли Магацухи, смыкаются скобки захвата цели.
    banner(b) {
      const { done, total } = b.progress;
      const k = total ? done / total : 0;
      const logo = b.art.logo('class="smt-ban-logo" alt=""');
      const turns = total ? Array.from({ length: Math.min(total, 40) }, (_, i) => `<i class="${i < done ? "on" : ""}"></i>`).join("") : "";
      const orbs = Array.from({ length: 7 }, (_, i) => `<i style="--x:${12 + i * 13}%;--d:${(i * 0.23).toFixed(2)}s;--s:${6 + (i % 3) * 4}px"></i>`).join("");
      b.el.innerHTML = `
        <span class="smt-ban">
          <span class="smt-ban-art"><span class="smt-ban-side smt-ban-l">${b.art.hero('alt="" loading="lazy"')}</span><span class="smt-ban-side smt-ban-r">${b.art.hero('alt="" loading="lazy"')}</span></span>
          <span class="smt-ban-glow"></span>
          <span class="smt-ban-orbs" aria-hidden="true">${orbs}</span>
          <span class="smt-ban-lock" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
          <span class="smt-ban-center">
            <span class="smt-ban-moon">
              ${moonSvg(b.assets, k, "smt-ban-moonsvg")}
              <span class="smt-ban-count">${total ? `<b>${done}</b><span>/${total}</span>` : `<span>—</span>`}</span>
            </span>
            ${logo || `<span class="smt-ban-name" aria-hidden="true">${b.esc(b.game.title)}</span>`}
            <span class="smt-sr">${b.esc(b.game.title)}. ${total ? `Выполнено ${done} из ${total} условий закрытия` : "Условия ещё не заданы"}</span>
          </span>
          ${turns ? `<span class="smt-ban-turns" aria-hidden="true">${turns}</span>` : ""}
        </span>`;
    },

    // ---------- главная: при наведении над главной собирается Магацухи ----------
    // Багровая сетка проступает, снизу поднимаются капли, в углу всходит луна в фазе прогресса,
    // сквозь красную дымку видны демоны с обложки. Только CSS: анимации идут, пока у слоя класс .on.
    stage(s) {
      const { done, total } = s.progress;
      const k = total ? done / total : 0;
      const orbs = Array.from({ length: 24 }, (_, i) => {
        const x = (i * 61) % 100;
        return `<i style="--x:${x}%;--d:${((i * 0.29) % 2.4).toFixed(2)}s;--t:${(4.2 + (i % 5) * 0.8).toFixed(1)}s;--s:${8 + (i % 4) * 7}px"></i>`;
      }).join("");
      s.el.innerHTML = `
        <div class="smt-hv">
          <div class="smt-hv-art">${s.art.hero('alt=""')}</div>
          <div class="smt-hv-haze"></div>
          <div class="smt-hv-grid"></div>
          <div class="smt-hv-orbs">${orbs}</div>
          <div class="smt-hv-moon">${moonSvg(s.assets, k, "smt-hv-moonsvg")}</div>
        </div>`;
    },

    // ---------- главная: начало заставки ----------
    cover(t) {
      const banner = document.querySelector('.gbanner[data-game="shin-megami-tensei-v-vengeance"]')?.getBoundingClientRect();
      const ox = banner ? banner.left + banner.width * 0.62 : window.innerWidth / 2;
      const oy = banner ? banner.top + banner.height / 2 : window.innerHeight / 2;
      const b = makeBloom(t.layer("smt-bloom"), t.game, t.esc, ox, oy);
      t.data.bloom = b;
      t.data.started = performance.now();
      t.data.seen = seenBefore();
      setTimeout(() => b.title.classList.add("in"), 380);
      return new Promise((resolve) => {
        const start = performance.now();
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          drawIn(b, 99);
          resolve();
        };
        const tick = (now) => {
          if (done) return;
          if (drawIn(b, (now - start) / 1000)) finish();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        setTimeout(finish, COVER_MS + 200);
      });
    },

    // ---------- страница игры — экран компендиума во всю высоту ----------
    page(ctx) {
      const { root, esc, assets, game } = ctx;
      const cond = ctx.conditions;
      const groups = (cond?.groups ?? []).filter((gr) => (gr.goals ?? []).length);
      const goals = groups.flatMap((gr) => gr.goals);
      const done = goals.filter((g) => g.done).length;
      const total = goals.length;
      const k = total ? done / total : 0;
      const motion = !ctx.reducedMotion;
      const frame = []; // задачи единственного rAF-цикла
      const sel = { race: 0, i: 0 };

      root.classList.add("smt");
      root.innerHTML = pageHtml();
      const $ = (q) => root.querySelector(q);
      const arena = $(".smt-arena");
      const lineup = $(".smt-lineup");

      backdrop();
      if (groups.length) {
        races();
        keys();
        selectRace(firstRace(), firstGoal(firstRace()), false);
      }
      magatsuhi();
      intro();
      if (frame.length) ctx.loop((now, dt) => frame.forEach((fn) => fn(now, dt)));

      return () => root.classList.remove("smt");

      // ---------- разметка: HUD сверху, слева расы и записи компендиума, в центре арена, справа статус ----------
      function pageHtml() {
        const logo = ctx.art.logo('class="smt-hud-logo" alt=""');
        const nb = ctx.neighbors ?? {};
        return `
          <div class="smt-page ${groups.length ? "" : "smt-page-empty"}">
            <header class="smt-hud">
              <div class="smt-hud-moon" role="img" aria-label="Выполнено ${done} из ${total}">
                ${moonSvg(assets, k, "smt-hud-moonsvg")}
                <span class="smt-hud-moonval"><b>${done}</b>/${total}</span>
              </div>
              <div class="smt-hud-title">
                ${logo}
                <h1 class="${logo ? "smt-sr" : "smt-hud-name"}">${esc(game.title)}</h1>
                <span class="smt-hud-kicker">Компендиум условий закрытия</span>
              </div>
              <div class="smt-hud-mag" aria-hidden="true">
                <span class="smt-hud-maglabel">Магацухи</span>
                ${gauge(k)}
              </div>
            </header>

            ${
              groups.length
                ? `
            <aside class="smt-side">
              <div class="smt-races" role="tablist" aria-orientation="vertical" aria-label="Группы условий">
                ${groups
                  .map((gr, ri) => {
                    const d = gr.goals.filter((g) => g.done).length;
                    return `
                  <button type="button" role="tab" class="smt-race" id="smt-race-${ri}" data-race="${ri}" aria-controls="smt-arena" aria-selected="false" tabindex="-1">
                    <span class="smt-race-name">${esc(gr.title)}</span>
                    <span class="smt-race-count">${d}/${gr.goals.length}</span>
                    <span class="smt-race-turns" aria-hidden="true">${gr.goals.map((g) => `<i class="${g.done ? "on" : ""}"></i>`).join("")}</span>
                  </button>`;
                  })
                  .join("")}
              </div>
              <h2 class="smt-sec smt-index-head">Записи</h2>
              <ol class="smt-index-list"></ol>
            </aside>

            <section class="smt-arena" id="smt-arena" role="tabpanel">
              <div class="smt-floor" aria-hidden="true"><i class="smt-caustics"></i><i class="smt-summon"></i></div>
              <div class="smt-stagebox" data-gallery>
                <div class="smt-lineup" role="listbox" aria-label="Условия группы" tabindex="0"></div>
                <button type="button" class="smt-arrow smt-arrow-l" data-step="-1" aria-label="Предыдущее условие">◀</button>
                <button type="button" class="smt-arrow smt-arrow-r" data-step="1" aria-label="Следующее условие">▶</button>
              </div>
              <footer class="smt-prompts">
                <span class="smt-prompt"><span class="smt-btn">◀▶</span>Условие</span>
                <span class="smt-prompt"><span class="smt-btn smt-btn-sh">L</span><span class="smt-btn smt-btn-sh">R</span>Группа</span>
                ${nb.prev ? `<a class="smt-prompt smt-prompt-nb" href="${esc(nb.prev.href)}"><span class="smt-btn smt-btn-sh">ZL</span>${esc(nb.prev.title)}</a>` : ""}
                ${nb.next ? `<a class="smt-prompt smt-prompt-nb" href="${esc(nb.next.href)}"><span class="smt-btn smt-btn-sh">ZR</span>${esc(nb.next.title)}</a>` : ""}
                <a class="smt-prompt smt-prompt-back" href="#/"><span class="smt-btn smt-btn-b">B</span>Назад</a>
              </footer>
            </section>

            <aside class="smt-plate" aria-live="polite"></aside>`
                : `
            <section class="smt-arena smt-arena-empty">
              <div class="smt-floor" aria-hidden="true"><i class="smt-caustics"></i></div>
              <p class="smt-empty">Условия закрытия для этой игры ещё не заданы.</p>
              <footer class="smt-prompts"><a class="smt-prompt smt-prompt-back" href="#/"><span class="smt-btn smt-btn-b">B</span>Назад</a></footer>
            </section>`
            }
          </div>`;
      }

      function stateTag(g) {
        return g.done ? `<span class="smt-tag smt-tag-on">Выполнено</span>` : `<span class="smt-tag">Не выполнено</span>`;
      }

      // ---------- фон: багровая сетка с каплями, лёгкий параллакс ----------
      function backdrop() {
        const bg = ctx.layer("smt-backdrop");
        bg.style.backgroundImage = `url("${assets}grid.webp")`;
        if (!motion) return;
        let y = -1;
        frame.push(() => {
          if (window.scrollY === y) return;
          y = window.scrollY;
          bg.style.transform = `translate3d(0, ${(-y * 0.08).toFixed(1)}px, 0) scale(1.12)`;
        });
      }

      // ---------- расы ----------
      function firstRace() {
        const ri = groups.findIndex((gr) => gr.goals.some((g) => !g.done));
        return ri < 0 ? 0 : ri;
      }

      function firstGoal(ri) {
        const i = groups[ri].goals.findIndex((g) => !g.done);
        return i < 0 ? 0 : i;
      }

      function races() {
        const tabs = $(".smt-races");
        ctx.listen(tabs, "click", (e) => {
          const tab = e.target.closest(".smt-race");
          if (tab) selectRace(+tab.dataset.race, 0, true);
        });
        ctx.listen(tabs, "keydown", (e) => {
          const d = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
          if (d) {
            e.preventDefault();
            stepRace(d, true);
          } else if (e.key === "Home" || e.key === "End") {
            e.preventDefault();
            selectRace(e.key === "Home" ? 0 : groups.length - 1, 0, true);
          } else return;
          root.querySelector(`#smt-race-${sel.race}`)?.focus();
        });
        ctx.listen($(".smt-index-list"), "click", (e) => {
          const b = e.target.closest(".smt-entry");
          if (b) selectGoal(+b.dataset.i, motion);
        });
      }

      function stepRace(d, user) {
        selectRace((sel.race + d + groups.length) % groups.length, 0, user);
      }

      function selectRace(ri, i, user) {
        sel.race = ri;
        root.querySelectorAll(".smt-race").forEach((t, j) => {
          t.setAttribute("aria-selected", String(j === ri));
          t.tabIndex = j === ri ? 0 : -1;
        });
        arena.setAttribute("aria-labelledby", `smt-race-${ri}`);
        const gr = groups[ri];
        // записи компендиума этой расы
        $(".smt-index-list").innerHTML = gr.goals
          .map(
            (g, j) => `
            <li><button type="button" class="smt-entry ${g.done ? "done" : ""}" data-i="${j}">
              <span class="smt-entry-n">${esc(g.n)}</span>
              <span class="smt-entry-name">${esc(g.title)}</span>
              <span class="smt-entry-state" aria-hidden="true">${g.done ? "✓" : ""}</span>
            </button></li>`,
          )
          .join("");
        lineup.innerHTML = gr.goals
          .map(
            (g, j) => `
            <button type="button" role="option" class="smt-demon ${g.done ? "done" : ""} ${g.imageFit === "contain" ? "fig" : "scene"}" data-i="${j}" aria-selected="false" tabindex="-1" aria-label="№${esc(g.n)}. ${esc(g.title)}">
              ${ctx.safeUrl(g.image) ? `<img src="${esc(g.image)}" alt="" draggable="false">` : `<span class="smt-demon-blank">${esc(g.n)}</span>`}
            </button>`,
          )
          .join("");
        // ширины картинок известны только после загрузки — тогда и перестраиваем ряд
        lineup.querySelectorAll("img").forEach((img) => img.complete || img.addEventListener("load", layoutLineup, { once: true }));
        selectGoal(i, user && motion);
      }

      // ---------- арена: ряд целей на воде ----------
      function layoutLineup() {
        const items = [...lineup.children];
        const width = (el, a) => (el.offsetWidth || 200) * (SCALE[a] ?? 0.4);
        const gap = Math.max(10, (lineup.clientWidth || 600) * 0.03);
        const xs = items.map(() => 0);
        for (const dir of [-1, 1]) {
          let x = width(items[sel.i] ?? items[0], 0) / 2;
          for (let a = 1, j = sel.i + dir; j >= 0 && j < items.length; a++, j += dir) {
            const half = width(items[j], Math.min(a, 2)) / 2;
            x += gap + half;
            xs[j] = dir * x;
            x += half;
          }
        }
        items.forEach((el, j) => {
          const a = Math.abs(j - sel.i);
          el.style.transform = `translateX(-50%) translateX(${xs[j].toFixed(1)}px) scale(${SCALE[Math.min(a, 2)]})`;
          el.style.zIndex = String(10 - a);
          el.style.opacity = a > 2 ? "0" : a === 0 ? "1" : a === 1 ? "0.7" : "0.35";
          el.style.visibility = a > 2 ? "hidden" : "visible";
          el.classList.toggle("side", a > 0);
        });
      }

      function selectGoal(i, pulse) {
        const list = groups[sel.race].goals;
        sel.i = (i + list.length) % list.length;
        const g = list[sel.i];
        [...lineup.children].forEach((el, j) => {
          el.setAttribute("aria-selected", String(j === sel.i));
          el.querySelector("img")?.removeAttribute("data-zoom");
        });
        root.querySelectorAll(".smt-entry").forEach((b, j) => b.classList.toggle("cur", j === sel.i));
        root.querySelector(`.smt-entry[data-i="${sel.i}"]`)?.scrollIntoView({ block: "nearest" });
        layoutLineup();
        // увеличение — только у выбранной цели; ставим после клика, чтобы выбор соседа не открыл лайтбокс
        requestAnimationFrame(() => {
          const img = lineup.children[sel.i]?.querySelector("img");
          if (img) {
            img.setAttribute("data-zoom", "");
            img.setAttribute("data-caption", g.title);
          }
        });
        plate(g);
        arena.classList.toggle("done", !!g.done);
        if (pulse) {
          for (const c of ["smt-summon-on", "smt-scan"]) {
            for (const el of [arena, $(".smt-plate")]) {
              el.classList.remove(c);
              void el.offsetWidth;
              el.classList.add(c);
            }
          }
        }
      }

      // ---------- табличка экрана статуса ----------
      function plate(g) {
        const checklist = (g.checklist ?? [])
          .map(
            (c) => `
            <div class="smt-skills">
              <h3 class="smt-sec">${esc(c.label || "Навыки")}</h3>
              <ul>${(c.items ?? []).map((it) => `<li class="${it.done ? "on" : ""}"><i aria-hidden="true"></i><span>${esc(it.title)}</span><b>${it.done ? "✓" : ""}</b></li>`).join("")}</ul>
            </div>`,
          )
          .join("");
        const gallery = (g.gallery ?? []).map(ctx.safeUrl).filter(Boolean);
        const link = ctx.safeUrl(g.link);
        $(".smt-plate").innerHTML = `
          <div class="smt-id">
            <span class="smt-lv" aria-hidden="true"><small>№</small><b>${esc(g.n)}</b></span>
            <div class="smt-id-text">
              <span class="smt-id-race">${esc(groups[sel.race].title)}</span>
              <h2 class="smt-id-name">${esc(g.title)}</h2>
            </div>
          </div>
          ${stateTag(g)}
          ${checklist}
          ${g.note ? `<blockquote class="smt-note">${esc(g.note)}</blockquote>` : ""}
          ${g.details ? `<p class="smt-details">${esc(g.details)}</p>` : ""}
          ${gallery.length ? `<div class="smt-gallery" data-gallery>${gallery.map((u) => `<img src="${esc(u)}" alt="" loading="lazy" data-zoom data-caption="${esc(g.title)}">`).join("")}</div>` : ""}
          ${link ? `<a class="smt-lore" href="${esc(link)}" target="_blank" rel="noopener"><span class="smt-btn">Y</span>Подробнее ↗</a>` : ""}`;
      }

      // ---------- управление: стрелки, клики, свайпы, L/R ----------
      function keys() {
        ctx.listen(lineup, "click", (e) => {
          const d = e.target.closest(".smt-demon");
          if (d && +d.dataset.i !== sel.i) selectGoal(+d.dataset.i, motion);
        });
        ctx.listen($(".smt-stagebox"), "click", (e) => {
          const a = e.target.closest(".smt-arrow");
          if (a) selectGoal(sel.i + +a.dataset.step, motion);
        });
        ctx.listen(lineup, "keydown", (e) => {
          const n = groups[sel.race].goals.length;
          const to = { ArrowRight: sel.i + 1, ArrowLeft: sel.i - 1, Home: 0, End: n - 1 }[e.key];
          if (to == null) return;
          e.preventDefault();
          selectGoal(to, motion);
        });
        // L / R с клавиатуры — Q и E, как плечевые кнопки
        ctx.listen(window, "keydown", (e) => {
          if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector("dialog[open]")) return;
          if (e.target.closest?.("input, textarea, [contenteditable]")) return;
          const key = e.key.toLowerCase();
          if (key === "q" || key === "й") stepRace(-1, true);
          else if (key === "e" || key === "у") stepRace(1, true);
        });
        let x0 = null;
        ctx.listen(lineup, "pointerdown", (e) => (x0 = e.pointerType === "mouse" ? null : e.clientX), { passive: true });
        ctx.listen(
          lineup,
          "pointerup",
          (e) => {
            if (x0 == null) return;
            const dx = e.clientX - x0;
            x0 = null;
            if (Math.abs(dx) > 40) selectGoal(sel.i + (dx < 0 ? 1 : -1), motion);
          },
          { passive: true },
        );
        ctx.listen(window, "resize", layoutLineup, { passive: true });
      }

      // ---------- вход: круги лопаются, «V» гаснет ----------
      function intro() {
        const handed = ctx.handoff?.layers.find((l) => l.classList.contains("smt-bloom"));
        if (!motion) return handed?.remove();
        let b = handed && ctx.handoff.data?.bloom;
        let hold;
        if (b) {
          drawIn(b, 99);
          const since = performance.now() - (ctx.handoff.data.started ?? 0);
          hold = Math.max(HOLD.handoff, (ctx.handoff.data.seen ? 0 : 1200) - since);
        } else {
          handed?.remove();
          b = makeBloom(ctx.layer("smt-bloom smt-direct"), game, esc, window.innerWidth / 2, window.innerHeight / 2);
          drawIn(b, 99);
          b.title.classList.add("in");
          hold = seenBefore() ? HOLD.repeat : HOLD.direct;
        }
        const bloom = b;
        let start = 0;
        let finished = false;
        const end = () => {
          if (finished) return;
          finished = true;
          bloom.layer.remove();
        };
        const open = () => {
          if (start || finished) return;
          start = performance.now();
          bloom.title.classList.add("out");
          let last = start;
          const tick = (now) => {
            if (finished) return;
            const dt = Math.min(0.05, (now - last) / 1000);
            last = now;
            if (drawOut(bloom, (now - start) / 1000, dt)) end();
            else requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
          timers.push(setTimeout(end, 1800));
        };
        const timers = [setTimeout(open, hold)];
        ctx.onCleanup(() => (timers.forEach(clearTimeout), end()));
        for (const type of ["pointerdown", "keydown", "wheel"]) ctx.listen(window, type, open, { passive: true, once: true });
      }

      // ---------- Магацухи: капли поднимаются по экрану, тянутся за курсором и за выполненной целью ----------
      function magatsuhi() {
        if (!motion) return;
        const layer = ctx.layer("smt-mag");
        const cv = document.createElement("canvas");
        layer.append(cv);
        const g = cv.getContext("2d");
        const dpr = Math.min(1.5, window.devicePixelRatio || 1);
        let w = 0;
        let h = 0;
        const resize = () => {
          w = window.innerWidth;
          h = window.innerHeight;
          cv.width = Math.round(w * dpr);
          cv.height = Math.round(h * dpr);
          g.setTransform(dpr, 0, 0, dpr, 0, 0);
        };
        resize();
        ctx.listen(window, "resize", resize, { passive: true });

        const sprite = document.createElement("canvas");
        sprite.width = sprite.height = 64;
        const sg = sprite.getContext("2d");
        const grad = sg.createRadialGradient(32, 32, 0, 32, 32, 32);
        grad.addColorStop(0, "rgba(255,170,180,1)");
        grad.addColorStop(0.22, "rgba(255,74,95,0.95)");
        grad.addColorStop(0.5, "rgba(200,20,45,0.35)");
        grad.addColorStop(1, "rgba(120,0,20,0)");
        sg.fillStyle = grad;
        sg.fillRect(0, 0, 64, 64);

        const orbs = [];
        const ambient = () => Math.round(16 * Math.min(1.6, Math.max(0.4, (w * h) / (1440 * 900))));
        const spawn = (x, y, kind) =>
          orbs.push({
            x,
            y,
            vx: (Math.random() - 0.5) * (kind === "trail" ? 40 : kind === "aura" ? 24 : 8),
            vy: -(kind === "ambient" ? 12 + Math.random() * 26 : 30 + Math.random() * 50),
            r: kind === "ambient" ? 2 + Math.random() * 5 : 3 + Math.random() * 6,
            a: kind === "ambient" ? 0.16 + Math.random() * 0.28 : 0.85,
            life: kind === "ambient" ? 9 + Math.random() * 8 : 0.8 + Math.random() * 0.6,
            t: 0,
            kind,
            ph: Math.random() * 6.28,
          });
        for (let i = 0; i < ambient(); i++) (spawn(Math.random() * w, Math.random() * h, "ambient"), (orbs[orbs.length - 1].t = Math.random() * 6));

        let lastSpawn = 0;
        if (ctx.finePointer) {
          ctx.listen(
            window,
            "pointermove",
            (e) => {
              const now = performance.now();
              if (now - lastSpawn > 34) {
                lastSpawn = now;
                spawn(e.clientX, e.clientY, "trail");
              }
            },
            { passive: true },
          );
        }

        let auraT = 0;
        frame.push((now, dt) => {
          // выбранная выполненная цель «дышит» Магацухи
          auraT += dt;
          if (arena?.classList.contains("done") && auraT > 0.09) {
            auraT = 0;
            const fig = lineup?.children[sel.i]?.getBoundingClientRect();
            if (fig && fig.bottom > 0 && fig.top < h) spawn(fig.left + fig.width * (0.2 + Math.random() * 0.6), fig.bottom - fig.height * Math.random() * 0.3, "aura");
          }
          g.clearRect(0, 0, w, h);
          let amb = 0;
          for (let i = orbs.length - 1; i >= 0; i--) {
            const o = orbs[i];
            o.t += dt;
            if (o.t >= o.life || o.y < -20) {
              orbs.splice(i, 1);
              continue;
            }
            if (o.kind === "ambient") amb++;
            o.x += (o.vx + Math.sin(now / 900 + o.ph) * (o.kind === "ambient" ? 10 : 0)) * dt;
            o.y += o.vy * dt;
            const fade = o.kind === "ambient" ? Math.min(1, o.t / 1.5, (o.life - o.t) / 2) : 1 - o.t / o.life;
            const s = o.r * 4 * (o.kind === "ambient" ? 1 : 1 - (o.t / o.life) * 0.5);
            g.globalAlpha = Math.max(0, o.a * fade);
            g.drawImage(sprite, o.x - s / 2, o.y - s / 2, s, s);
          }
          g.globalAlpha = 1;
          for (let i = amb; i < ambient(); i++) spawn(Math.random() * w, h + 10, "ambient");
        });
      }
    },
  });
})();
