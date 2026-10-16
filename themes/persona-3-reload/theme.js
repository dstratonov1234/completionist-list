// Persona 3 Reload — «Часы Тёмного часа».
// Всё своё, по мотивам интерфейса P3R:
//  · баннер на главной — кадр игры с её HUD: арт во всю плашку-параллелограмм, слева внизу — табличка локации
//    (как «Iwatodai Station») с логотипом, справа вверху — «календарь»: контурное слово, счёт условий и
//    маленькие часы вместо фазы луны; при выделении сквозь плашку разлетается синее стекло призыва;
//  · при наведении на главную опускается Тёмный час: из баннера расползается зелёная мгла, снизу вырастает
//    Тартар, у подножия проступают тёмные лужи;
//  · страница — часы Тёмного часа: по кругу циферблата разложены карты Арканы, по одной на условие (номер —
//    римской цифрой), стрелка указывает на выбранную, деления кольца горят у выполненных, в центре — счёт;
//    справа — крупная карта выбранного условия с лентой RANK MAX и наклонная плашка диалога, как в игре;
//  · фирменный эффект — стекло призыва: осколки дрейфуют по экрану и разлетаются от карты при выборе;
//  · заставка — экран трескается синим стеклом от баннера, поверх — логотип на наклонной полосе;
//    на странице осколки разлетаются от центра и открывают часы.
(() => {
  "use strict";

  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const easeOut = (x) => 1 - Math.pow(1 - x, 3);
  const easeInOut = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

  function roman(n) {
    const map = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
    let x = Math.max(0, Math.floor(+n || 0));
    if (!x) return "0";
    let out = "";
    for (const [v, s] of map) while (x >= v) (out += s), (x -= v);
    return out;
  }

  // кольцо из делений — по одному на условие; выполненные горят (маленькие часы баннера и циферблат).
  // angles — середины делений в градусах от 12 часов (если карты стоят на своих часах), иначе равные доли.
  function ringSvg(list, cls, r = 44, width = 7, angles = null) {
    const n = Math.max(1, list.length);
    const span = angles ? 22 : 360 / n;
    const gap = angles ? 0 : n > 1 ? Math.min(6, 120 / n) : 0;
    const segs = list
      .map((g, i) => {
        const mid = angles ? angles[i] : (i + 0.5) * span;
        const a0 = (mid - span / 2 + gap / 2 - 90) * (Math.PI / 180);
        const a1 = (mid + span / 2 - gap / 2 - 90) * (Math.PI / 180);
        const p = (a) => `${(50 + r * Math.cos(a)).toFixed(2)},${(50 + r * Math.sin(a)).toFixed(2)}`;
        const large = a1 - a0 > Math.PI ? 1 : 0;
        return `<path class="${g.done ? "on" : ""}" d="M${p(a0)}A${r},${r} 0 ${large},1 ${p(a1)}" stroke-width="${width}"/>`;
      })
      .join("");
    return `<svg class="${cls}" viewBox="0 0 100 100" aria-hidden="true" focusable="false">${segs}</svg>`;
  }

  // ---------- заставка: синее стекло призыва ----------
  const COVER_MS = 700;
  const GROW = 0.2; // с — осколок «вспыхивает»
  const SPREAD = 0.42; // с — трещина бежит от баннера до дальнего угла
  const OPEN = { span: 0.32, fly: 0.62 }; // с — волна разлёта от центра и полёт одного осколка
  const HOLD = { direct: 650, repeat: 260, handoff: 280, first: 800 };
  const GLASS = ["#050d33", "#081649", "#0b1e5f", "#0c2470"];
  const CRACK = 0.26; // с — белые трещины разбегаются от баннера раньше, чем темнеет стекло

  function makeGlass(layer, game, esc, ox, oy) {
    const canvas = document.createElement("canvas");
    const title = document.createElement("div");
    title.className = "p3-glass-title";
    title.innerHTML = game.logo
      ? `<span class="p3-glass-band"><img src="${esc(game.logo)}" alt="${esc(game.title)}"></span>`
      : `<span class="p3-glass-band p3-glass-text">${esc(game.title)}</span>`;
    layer.append(canvas, title);
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const g = canvas.getContext("2d");
    g.scale(dpr, dpr);
    const far = Math.max(Math.hypot(ox, oy), Math.hypot(w - ox, oy), Math.hypot(ox, h - oy), Math.hypot(w - ox, h - oy)) || 1;
    const midFar = Math.hypot(w / 2, h / 2) || 1;
    // сетка с дрожанием, каждая ячейка — два треугольника: осколки стекла
    const cell = Math.max(70, Math.min(130, Math.hypot(w, h) / 13));
    const cols = Math.ceil(w / cell) + 1;
    const rows = Math.ceil(h / cell) + 1;
    const pts = [];
    for (let r = 0; r < rows; r++) {
      pts.push([]);
      for (let c = 0; c < cols; c++) {
        const jx = c === 0 || c === cols - 1 ? 0 : (Math.random() - 0.5) * cell * 0.8;
        const jy = r === 0 || r === rows - 1 ? 0 : (Math.random() - 0.5) * cell * 0.8;
        pts[r].push([Math.min(w, c * (w / (cols - 1)) + jx), Math.min(h, r * (h / (rows - 1)) + jy)]);
      }
    }
    const shards = [];
    const add = (a, b, c) => {
      const cx = (a[0] + b[0] + c[0]) / 3;
      const cy = (a[1] + b[1] + c[1]) / 3;
      const d = Math.hypot(cx - ox, cy - oy) / far;
      const dm = Math.hypot(cx - w / 2, cy - h / 2) / midFar;
      const ang = Math.atan2(cy - h / 2, cx - w / 2) + (Math.random() - 0.5) * 0.6;
      const speed = 260 + Math.random() * 420;
      shards.push({
        p: [a, b, c],
        cx,
        cy,
        cd: 0.16 + d * CRACK + Math.random() * 0.03,
        delay: 0.1 + d * SPREAD + Math.random() * 0.06,
        od: dm * OPEN.span + Math.random() * 0.08,
        color: GLASS[Math.floor(Math.random() * GLASS.length)],
        sheen: Math.random(),
        ph: Math.random() * Math.PI * 2,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed - 80,
        rot: (Math.random() - 0.5) * 5,
      });
    };
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const a = pts[r][c];
        const b = pts[r][c + 1];
        const d = pts[r + 1][c];
        const e = pts[r + 1][c + 1];
        if (Math.random() < 0.5) (add(a, b, e), add(a, e, d));
        else (add(a, b, d), add(b, e, d));
      }
    }
    // лучи трещин: ломаные из точки удара до края экрана
    const rays = Array.from({ length: 8 }, (_, i) => {
      let a = (i / 8) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      let x = ox;
      let y = oy;
      const pts2 = [[x, y]];
      const step = far / 7;
      for (let k = 0; k < 9; k++) {
        a += (Math.random() - 0.5) * 0.45;
        x += Math.cos(a) * step * (0.7 + Math.random() * 0.6);
        y += Math.sin(a) * step * (0.7 + Math.random() * 0.6);
        pts2.push([x, y]);
      }
      return pts2;
    });
    // рваные кольца вокруг точки удара
    const rings = [0.07, 0.17].map((k) =>
      Array.from({ length: 26 }, (_, i) => {
        const a = (i / 26) * Math.PI * 2;
        const r = far * k * (0.88 + Math.random() * 0.24);
        return [ox + Math.cos(a) * r, oy + Math.sin(a) * r];
      }),
    );
    return { layer, canvas, title, g, w, h, shards, rays, rings, t0: performance.now(), draw: null, stopped: false };
  }

  // один цикл на заставку: стекло живёт (по нему бежит блик) от главной до открытия страницы
  function runGlass(b) {
    let last = performance.now();
    const tick = (now) => {
      if (b.stopped || !b.layer.isConnected) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      b.draw?.(now, dt);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function shardPath(g, s) {
    g.beginPath();
    g.moveTo(s.p[0][0], s.p[0][1]);
    g.lineTo(s.p[1][0], s.p[1][1]);
    g.lineTo(s.p[2][0], s.p[2][1]);
    g.closePath();
  }

  // блик: светлая диагональная полоса медленно идёт по стеклу — стекло «живое» во время паузы
  function sheenAt(b, s, bt) {
    const band = ((bt * 0.45) % 1.8) - 0.4; // 0..1 — диагональ экрана
    const pos = (s.cx / b.w) * 0.6 + (s.cy / b.h) * 0.4;
    const near = Math.max(0, 1 - Math.abs(pos - band) * 6);
    return 0.05 + s.sheen * 0.12 + near * 0.5 + Math.sin(bt * 2.2 + s.ph) * 0.04;
  }

  function drawCover(b, t, bt = t) {
    const { g, w, h } = b;
    g.clearRect(0, 0, w, h);
    let last = 0;
    const solid = clamp01(t / (COVER_MS / 1000)); // пока трещит — стекло чуть прозрачное, к концу плотное
    for (const s of b.shards) {
      last = Math.max(last, s.delay + GROW);
      const c = clamp01((t - s.cd) / 0.08);
      if (c <= 0) continue;
      const k = clamp01((t - s.delay) / GROW);
      shardPath(g, s);
      if (k > 0) {
        g.globalAlpha = easeOut(k) * (0.82 + 0.18 * solid);
        g.fillStyle = s.color;
        g.fill();
        g.globalAlpha = easeOut(k) * sheenAt(b, s, bt);
        g.fillStyle = "#dff6ff";
        g.fill();
      }
      // трещина: яркая белая кромка, пока стекло не потемнело, потом тонкий светлый край
      g.globalAlpha = c * (k > 0 ? 0.55 : 0.95);
      g.lineWidth = k > 0 ? 1.2 : 1.8;
      g.strokeStyle = "#f2fbff";
      g.stroke();
    }
    // поверх — лучи и кольца удара: бегут первыми, потом остаются светлыми прожилками в стекле
    const p = clamp01(t / 0.28);
    if (p > 0) {
      const fade = 1 - 0.6 * clamp01((t - 0.45) / 0.35);
      g.lineCap = "round";
      g.lineJoin = "round";
      g.strokeStyle = "#ffffff";
      for (const r of b.rays) {
        const upto = p * (r.length - 1);
        g.beginPath();
        g.moveTo(r[0][0], r[0][1]);
        for (let k = 1; k <= Math.ceil(upto); k++) {
          const f = Math.min(1, upto - (k - 1));
          g.lineTo(r[k - 1][0] + (r[k][0] - r[k - 1][0]) * f, r[k - 1][1] + (r[k][1] - r[k - 1][1]) * f);
        }
        g.globalAlpha = 0.95 * fade;
        g.lineWidth = 2.4;
        g.stroke();
      }
      b.rings.forEach((ring, i) => {
        const a = clamp01((p - 0.35 - i * 0.25) / 0.3);
        if (a <= 0) return;
        g.beginPath();
        ring.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y)));
        g.closePath();
        g.globalAlpha = a * 0.9 * fade;
        g.lineWidth = 1.8;
        g.stroke();
      });
    }
    g.globalAlpha = 1;
    return t >= last;
  }

  function drawOpen(b, u, dt, bt) {
    const { g, w, h } = b;
    g.clearRect(0, 0, w, h);
    let alive = false;
    for (const s of b.shards) {
      const k = clamp01((u - s.od) / OPEN.fly);
      if (k >= 1) continue;
      alive = true;
      const e = k * k;
      g.save();
      g.translate(s.cx + s.vx * e * 0.9, s.cy + s.vy * e * 0.9 + 260 * e * e);
      g.rotate(s.rot * e);
      g.scale(1 - 0.35 * e, 1 - 0.35 * e);
      g.translate(-s.cx, -s.cy);
      shardPath(g, s);
      // осколок плотный, пока не полетел, потом гаснет — без полупрозрачной пелены над страницей
      const a = 1 - clamp01((k - 0.25) / 0.75);
      g.globalAlpha = a;
      g.fillStyle = s.color;
      g.fill();
      g.globalAlpha = a * sheenAt(b, s, bt) * (1 + k);
      g.fillStyle = "#dff6ff";
      g.fill();
      g.globalAlpha = a * 0.6;
      g.lineWidth = 1.2;
      g.strokeStyle = "#e9f8ff";
      g.stroke();
      g.restore();
    }
    g.globalAlpha = 1;
    return !alive;
  }

  function seenBefore() {
    try {
      const seen = sessionStorage.getItem("p3-glass") === "1";
      sessionStorage.setItem("p3-glass", "1");
      return seen;
    } catch {
      return false;
    }
  }

  GameThemes.register("persona-3-reload", {
    // ---------- главная: кадр игры с её HUD ----------
    // Композиция — как экран прогулки в P3R: арт во всю плашку-параллелограмм, слева внизу — табличка локации
    // с логотипом, справа вверху — «календарь»: большое контурное слово, счёт условий и маленькие жёлтые часы
    // (деление на условие) там, где в игре луна. Выделение — наступает Тёмный час: стрелка часов доходит
    // до полуночи, ARCANA сменяется зелёным DARK HOUR, от часов за край плашки разлетается стекло призыва,
    // плашка чуть поворачивается и поднимается; следом (с задержкой) за списком опускается зелёная мгла.
    banner(b) {
      const { done, total } = b.progress;
      const list = Array.from({ length: Math.min(total, 40) }, (_, i) => ({ done: i < done }));
      const logo = b.art.logo('alt=""');
      // осколки стекла вылетают от часов «календаря» за край плашки
      const shards = Array.from({ length: 7 }, (_, i) => {
        const a = -Math.PI * 0.95 + (i / 6) * Math.PI * 1.5;
        const dist = 120 + (i % 3) * 55;
        return `<i style="--tx:${(Math.cos(a) * dist).toFixed(0)}px;--ty:${(Math.sin(a) * dist * 0.75).toFixed(0)}px;--r:${(i % 2 ? 1 : -1) * (140 + i * 30)}deg;--s:${30 + (i % 3) * 14}px;--d:${120 + i * 30}ms"><b></b></i>`;
      }).join("");
      b.el.innerHTML = `
        <span class="p3-ban-frame" aria-hidden="true"></span>
        <span class="p3-ban">
          <span class="p3-ban-art">${b.art.hero('alt="" loading="lazy"')}</span>
          <span class="p3-ban-cal" aria-hidden="true">
            <span class="p3-ban-word"><span class="p3-w1">ARCANA</span><span class="p3-w2">DARK HOUR</span></span>
            <span class="p3-ban-num"><b>${done}</b><span>/${total || "—"}</span></span>
            ${total ? `<span class="p3-ban-clock">${ringSvg(list, "p3-ring")}<i></i></span>` : ""}
          </span>
          <span class="p3-ban-loc">${logo ? `<span class="p3-ban-logo">${logo}</span>` : `<span class="p3-ban-name" aria-hidden="true">${b.esc(b.game.title)}</span>`}</span>
          <span class="p3-sr">${b.esc(b.game.title)}. ${total ? `Выполнено ${done} из ${total} условий закрытия` : "Условия ещё не заданы"}</span>
        </span>
        <span class="p3-ban-shards" aria-hidden="true">${shards}</span>`;
    },

    // ---------- главная: при наведении опускается Тёмный час ----------
    // Из самого баннера (--bcx/--bcy от движка) по экрану расползается зелёная мгла Тёмного часа — после того,
    // как стрелка часов на баннере дошла до полуночи; снизу вырастает Тартар, по краям встают гробы,
    // у подножия проступают тёмные лужи, в воздухе висит зелёная пыль.
    // Только CSS: анимации идут, пока у слоя класс .on.
    stage(s) {
      const motes = Array.from({ length: 22 }, (_, i) => {
        const x = (i * 41 + 9) % 100;
        const y = 12 + ((i * 29) % 80);
        return `<i style="--x:${x}%;--y:${y}%;--d:${((i * 0.37) % 3).toFixed(2)}s;--t:${(5 + (i % 4) * 1.3).toFixed(1)}s;--s:${2 + (i % 3)}px"></i>`;
      }).join("");
      // гробы — люди в Тёмный час; стоят по краям, где их не закрывает список
      const coffins = [[3, 15], [9, 12], [15, 10], [85, 11], [91, 14], [97, 12]]
        .map(([x, h], i) => `<i style="--x:${x}%;--h:${h}vh;--d:${(0.5 + i * 0.12).toFixed(2)}s"></i>`)
        .join("");
      s.el.innerHTML = `
        <div class="p3-hv">
          <div class="p3-hv-mist"></div>
          <div class="p3-hv-tower" style="background-image:url('${s.assets}tower.webp')"></div>
          <div class="p3-hv-pools"></div>
          <div class="p3-hv-coffins">${coffins}</div>
          <div class="p3-hv-motes">${motes}</div>
        </div>`;
    },

    // ---------- главная: экран трескается синим стеклом от баннера ----------
    cover(t) {
      const banner = document.querySelector('.gbanner[data-game="persona-3-reload"]')?.getBoundingClientRect();
      const ox = banner ? banner.left + banner.width * 0.82 : window.innerWidth / 2;
      const oy = banner ? banner.top + banner.height * 0.35 : window.innerHeight / 2;
      const b = makeGlass(t.layer("p3-glass"), t.game, t.esc, ox, oy);
      t.data.glass = b;
      t.data.started = performance.now();
      t.data.seen = seenBefore();
      setTimeout(() => b.title.classList.add("in"), 360);
      return new Promise((resolve) => {
        const start = performance.now();
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          resolve();
        };
        b.draw = (now) => {
          if (drawCover(b, (now - start) / 1000, (now - b.t0) / 1000)) finish();
        };
        runGlass(b); // цикл не останавливается: по стеклу бежит блик, пока страница не откроет заставку
        setTimeout(() => {
          if (done) return;
          drawCover(b, 9);
          finish();
        }, COVER_MS + 250);
      });
    },

    // ---------- страница игры — часы Тёмного часа ----------
    page(ctx) {
      const { root, esc, assets, game } = ctx;
      const cond = ctx.conditions;
      const groups = (cond?.groups ?? []).filter((gr) => (gr.goals ?? []).length);
      const goals = groups.flatMap((gr) => gr.goals);
      const done = goals.filter((g) => g.done).length;
      const total = goals.length;
      const motion = !ctx.reducedMotion;
      const sel = { group: 0, i: 0 };
      let angles = [];
      const timers = new Set();
      const later = (fn, ms) => {
        const id = setTimeout(() => (timers.delete(id), fn()), ms);
        timers.add(id);
        return id;
      };
      ctx.onCleanup(() => timers.forEach(clearTimeout));

      root.classList.add("p3");
      root.innerHTML = pageHtml();
      const $ = (q) => root.querySelector(q);

      backdrop();
      if (groups.length) {
        tabs();
        keys();
        selectGroup(firstGroup(), firstGoal(firstGroup()), false);
      }
      intro();

      return () => root.classList.remove("p3");

      function firstGroup() {
        const gi = groups.findIndex((gr) => gr.goals.some((g) => !g.done));
        return gi < 0 ? 0 : gi;
      }

      function firstGoal(gi) {
        const i = groups[gi].goals.findIndex((g) => !g.done);
        return i < 0 ? 0 : i;
      }

      // ---------- разметка ----------
      function pageHtml() {
        const logo = ctx.art.logo('alt=""');
        const nb = ctx.neighbors ?? {};
        return `
          <div class="p3-page ${groups.length ? "" : "p3-page-empty"}">
            <header class="p3-top">
              <a class="p3-loc" href="#/" aria-label="К списку игр">
                ${logo ? `<span class="p3-loc-logo">${logo}</span>` : `<span class="p3-loc-name">${esc(game.title)}</span>`}
              </a>
              <h1 class="p3-sr">${esc(game.title)}</h1>
              <div class="p3-cal" role="img" aria-label="Выполнено ${done} из ${total} условий закрытия">
                <span class="p3-cal-word" aria-hidden="true">ARCANA</span>
                <span class="p3-cal-num" aria-hidden="true"><b>${done}</b>/${total}</span>
                <span class="p3-cal-label" aria-hidden="true">условий закрытия</span>
              </div>
            </header>
            ${
              groups.length
                ? `
            <main class="p3-main">
              <section class="p3-clock-wrap">
                ${
                  groups.length > 1
                    ? `<div class="p3-tabs" role="tablist" aria-label="Группы условий">${groups
                        .map(
                          (gr, gi) =>
                            `<button type="button" role="tab" class="p3-tab" data-group="${gi}" aria-selected="false" tabindex="-1"><span>${esc(gr.title)}</span><b>${gr.goals.filter((g) => g.done).length}/${gr.goals.length}</b></button>`,
                        )
                        .join("")}</div>`
                    : `<h2 class="p3-group-one">${esc(groups[0].title)}</h2>`
                }
                <div class="p3-clock" data-gallery>
                  <img class="p3-dial" src="${assets}dial.webp" alt="" aria-hidden="true">
                  <div class="p3-ring-slot"></div>
                  <div class="p3-hand" aria-hidden="true"><i></i></div>
                  <div class="p3-center" aria-hidden="true">
                    <b class="p3-center-num"></b>
                    <span class="p3-center-label">условие</span>
                  </div>
                  <span class="p3-xii" aria-hidden="true">XII</span>
                  <div class="p3-cards" role="listbox" aria-label="Условия группы" tabindex="0"></div>
                </div>
              </section>
              <section class="p3-detail" aria-live="polite">
                <div class="p3-big"></div>
                <div class="p3-dialog"></div>
              </section>
            </main>`
                : `<main class="p3-main"><p class="p3-empty">Условия закрытия для этой игры ещё не заданы.</p></main>`
            }
            <footer class="p3-prompts">
              ${groups.length ? `<span class="p3-prompt"><button type="button" class="p3-key" data-step="-1" aria-label="Предыдущее условие">◀</button><button type="button" class="p3-key" data-step="1" aria-label="Следующее условие">▶</button>Условие</span>` : ""}
              ${groups.length > 1 ? `<span class="p3-prompt"><button type="button" class="p3-key" data-group-step="-1" aria-label="Предыдущая группа">Q</button><button type="button" class="p3-key" data-group-step="1" aria-label="Следующая группа">E</button>Группа</span>` : ""}
              ${nb.prev ? `<a class="p3-prompt p3-prompt-nb" href="${esc(nb.prev.href)}">◂ ${esc(nb.prev.title)}</a>` : ""}
              ${nb.next ? `<a class="p3-prompt p3-prompt-nb" href="${esc(nb.next.href)}">${esc(nb.next.title)} ▸</a>` : ""}
              <a class="p3-prompt" href="#/"><span class="p3-key p3-key-esc">Esc</span>Назад</a>
            </footer>
          </div>`;
      }

      // ---------- фон: глубокая синяя вода, дрейфующие осколки стекла и пузырьки ----------
      function backdrop() {
        const bg = ctx.layer("p3-backdrop");
        bg.style.backgroundImage = `url("${assets}deep.webp")`;
        const fx = ctx.layer("p3-drift");
        fx.innerHTML =
          Array.from({ length: 14 }, (_, i) => `<i class="p3-shard" style="--x:${(i * 47 + 11) % 100}%;--y:${(i * 31 + 7) % 100}%;--r:${(i * 53) % 360}deg;--s:${16 + (i % 5) * 9}px;--t:${14 + (i % 6) * 3}s;--d:${-((i * 2.3) % 14).toFixed(1)}s"></i>`).join("") +
          Array.from({ length: 16 }, (_, i) => `<i class="p3-bubble" style="--x:${(i * 37 + 3) % 100}%;--s:${4 + (i % 4) * 3}px;--t:${9 + (i % 5) * 2.5}s;--d:${-((i * 1.7) % 12).toFixed(1)}s"></i>`).join("");
      }

      // ---------- группы ----------
      function tabs() {
        const list = $(".p3-tabs");
        if (!list) return;
        ctx.listen(list, "click", (e) => {
          const t = e.target.closest(".p3-tab");
          if (t) selectGroup(+t.dataset.group, 0, true);
        });
        ctx.listen(list, "keydown", (e) => {
          const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
          if (!d) return;
          e.preventDefault();
          stepGroup(d);
          root.querySelector(`.p3-tab[data-group="${sel.group}"]`)?.focus();
        });
      }

      function stepGroup(d) {
        selectGroup((sel.group + d + groups.length) % groups.length, 0, true);
      }

      function selectGroup(gi, i, user) {
        sel.group = gi;
        root.querySelectorAll(".p3-tab").forEach((t, j) => {
          t.setAttribute("aria-selected", String(j === gi));
          t.tabIndex = j === gi ? 0 : -1;
        });
        const list = groups[gi].goals;
        const n = list.length;
        // номера 1–12 без повторов — карты встают на свои часы (XII — метка Тёмного часа), иначе равно по кругу
        const nums = list.map((g) => +g.n);
        const hours = nums.every((x) => Number.isInteger(x) && x >= 1 && x <= 11) && new Set(nums).size === n;
        angles = list.map((g, j) => (hours ? +g.n * 30 : (j / n) * 360));
        $(".p3-clock").classList.toggle("hours", hours);
        $(".p3-ring-slot").innerHTML = ringSvg(list, "p3-ring", 46.5, 2.6, hours ? angles : null);
        $(".p3-cards").innerHTML = list
          .map((g, j) => {
            const a = angles[j];
            return `
            <button type="button" role="option" class="p3-card ${g.done ? "done" : ""}" data-i="${j}" style="--a:${a}deg" aria-selected="false" tabindex="-1" aria-label="№${esc(g.n)}. ${esc(g.title)}${g.done ? ". Выполнено" : ""}">
              <span class="p3-card-in">
                ${g.done && ctx.safeUrl(g.image) ? `<img src="${esc(g.image)}" alt="" loading="lazy" draggable="false" class="${g.imageFit === "contain" ? "fig" : ""}">` : ""}
                <b>${roman(g.n)}</b>
              </span>
            </button>`;
          })
          .join("");
        selectGoal(i, user && motion);
      }

      function selectGoal(i, burst) {
        const list = groups[sel.group].goals;
        const n = list.length;
        const prev = sel.i;
        sel.i = (i + n) % n;
        const g = list[sel.i];
        root.querySelectorAll(".p3-card").forEach((c, j) => {
          c.setAttribute("aria-selected", String(j === sel.i));
          c.classList.toggle("cur", j === sel.i);
        });
        $(".p3-center-num").textContent = roman(g.n);
        // стрелка идёт кратчайшим путём (не крутится через весь круг на стыке 12 часов)
        const hand = $(".p3-hand");
        const target = angles[sel.i] ?? (sel.i / n) * 360;
        const cur = parseFloat(hand.dataset.a ?? target);
        let delta = ((target - (cur % 360) + 540) % 360) - 180;
        if (prev === sel.i) delta = 0;
        const next = hand.dataset.a == null ? target : cur + delta;
        hand.dataset.a = String(next);
        hand.style.setProperty("--a", `${next}deg`);
        bigCard(g);
        dialog(g);
        if (burst) shatter();
      }

      // ---------- крупная карта выбранного условия ----------
      function bigCard(g) {
        const img = ctx.safeUrl(g.image);
        // выполненная — карта открыта: сцена — в окне 4:3 посреди узора карты, рендер — во весь рост на голубом;
        // невыполненная — карта лежит рубашкой вверх
        const fig = g.imageFit === "contain";
        const art = g.done && img
          ? `<span class="p3-tarot-art"><img class="p3-tarot-img" src="${esc(img)}" alt="" data-zoom data-caption="${esc(g.title)}"></span>`
          : "";
        $(".p3-big").innerHTML = `
          <div class="p3-tarot ${g.done ? "done" : ""} ${fig ? "fig" : ""}">
            <span class="p3-tarot-num">${roman(g.n)}</span>
            ${art}
            <span class="p3-tarot-rank">${g.done ? "Rank MAX" : "Не выполнено"}</span>
          </div>`;
        const t = $(".p3-tarot");
        if (motion) {
          t.classList.add("enter");
          later(() => t.classList.remove("enter"), 450);
        }
      }

      // ---------- плашка диалога ----------
      function dialog(g) {
        const checklist = (g.checklist ?? [])
          .map(
            (c) => `
            <div class="p3-list">
              ${c.label ? `<h3>${esc(c.label)}</h3>` : ""}
              <ul>${(c.items ?? []).map((it) => `<li class="${it.done ? "on" : ""}"><i aria-hidden="true"></i><span>${esc(it.title)}</span></li>`).join("")}</ul>
            </div>`,
          )
          .join("");
        const gallery = (g.gallery ?? []).map(ctx.safeUrl).filter(Boolean);
        const link = ctx.safeUrl(g.link);
        $(".p3-dialog").innerHTML = `
          <span class="p3-dialog-tag">№${esc(g.n)} · ${esc(groups[sel.group].title)}</span>
          <h2 class="p3-dialog-title">${esc(g.title)}</h2>
          ${checklist}
          ${g.note ? `<blockquote class="p3-note">«${esc(g.note)}»</blockquote>` : ""}
          ${g.details ? `<p class="p3-details">${esc(g.details)}</p>` : ""}
          ${gallery.length ? `<div class="p3-gallery" data-gallery>${gallery.map((u) => `<img src="${esc(u)}" alt="" loading="lazy" data-zoom data-caption="${esc(g.title)}">`).join("")}</div>` : ""}
          ${link ? `<a class="p3-lore" href="${esc(link)}" target="_blank" rel="noopener">Подробнее <span aria-hidden="true">↗</span></a>` : ""}
          <i class="p3-dialog-next" aria-hidden="true"></i>`;
      }

      // ---------- стекло призыва: осколки разлетаются от крупной карты ----------
      function shatter() {
        const host = $(".p3-big");
        const burst = document.createElement("span");
        burst.className = "p3-burst";
        burst.setAttribute("aria-hidden", "true");
        burst.innerHTML = Array.from({ length: 10 }, (_, i) => {
          const a = (i / 10) * Math.PI * 2 + Math.random() * 0.5;
          const dist = 170 + Math.random() * 110;
          return `<i style="--tx:${(Math.cos(a) * dist).toFixed(0)}px;--ty:${(Math.sin(a) * dist).toFixed(0)}px;--r:${Math.round(Math.random() * 540 - 270)}deg;--s:${20 + Math.round(Math.random() * 22)}px"><b></b></i>`;
        }).join("");
        host.append(burst);
        later(() => burst.remove(), 800);
      }

      // ---------- управление ----------
      function keys() {
        ctx.listen($(".p3-cards"), "click", (e) => {
          const c = e.target.closest(".p3-card");
          if (c) selectGoal(+c.dataset.i, motion && +c.dataset.i !== sel.i);
        });
        ctx.listen($(".p3-prompts"), "click", (e) => {
          const b = e.target.closest("button");
          if (!b) return;
          if (b.dataset.step) selectGoal(sel.i + +b.dataset.step, motion);
          else if (b.dataset.groupStep) stepGroup(+b.dataset.groupStep);
        });
        // ←/→/↑/↓ — по кругу карт, Home/End — первая и последняя, Q/E — группы; со всей страницы
        ctx.listen(window, "keydown", (e) => {
          if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector("dialog[open]")) return;
          if (e.target.closest?.("input, textarea, select, [contenteditable], .p3-tabs")) return;
          const key = e.key.toLowerCase();
          if (groups.length > 1 && (key === "q" || key === "й")) return stepGroup(-1);
          if (groups.length > 1 && (key === "e" || key === "у")) return stepGroup(1);
          const n = groups[sel.group].goals.length;
          const to = { ArrowRight: sel.i + 1, ArrowDown: sel.i + 1, ArrowLeft: sel.i - 1, ArrowUp: sel.i - 1, Home: 0, End: n - 1 }[e.key];
          if (to == null) return;
          // стрелки вверх/вниз прокручивают узкую страницу — там их не перехватываем
          if ((e.key === "ArrowUp" || e.key === "ArrowDown") && window.innerWidth <= 900) return;
          e.preventDefault();
          selectGoal(to, motion);
        });
      }

      // ---------- вход: осколки разлетаются от центра ----------
      function intro() {
        const handed = ctx.handoff?.layers.find((l) => l.classList.contains("p3-glass"));
        if (!motion) return handed?.remove();
        let b = handed && ctx.handoff.data?.glass;
        let hold;
        if (b) {
          const since = performance.now() - (ctx.handoff.data.started ?? 0);
          hold = Math.max(HOLD.handoff, (ctx.handoff.data.seen ? 0 : HOLD.first) - since);
        } else {
          handed?.remove();
          b = makeGlass(ctx.layer("p3-glass p3-direct"), game, esc, window.innerWidth / 2, window.innerHeight / 2);
          const t0 = b.t0;
          b.draw = (now) => drawCover(b, 9, (now - t0) / 1000);
          drawCover(b, 9, 0);
          runGlass(b);
          b.title.classList.add("in");
          hold = seenBefore() ? HOLD.repeat : HOLD.direct;
        }
        const glass = b;
        let start = 0;
        let finished = false;
        const end = () => {
          if (finished) return;
          finished = true;
          glass.stopped = true;
          glass.layer.remove();
        };
        const open = () => {
          if (start || finished) return;
          start = performance.now();
          glass.title.classList.add("out");
          glass.draw = (now, dt) => {
            if (drawOpen(glass, (now - start) / 1000, dt, (now - glass.t0) / 1000)) end();
          };
          later(end, 2000);
        };
        later(open, hold);
        ctx.onCleanup(end);
        for (const type of ["pointerdown", "keydown", "wheel"]) ctx.listen(window, type, open, { passive: true, once: true });
      }
    },
  });
})();
