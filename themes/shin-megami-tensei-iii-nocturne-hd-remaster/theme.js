// Shin Megami Tensei III: Nocturne HD Remaster — «Метки Полудемона».
// Всё своё, по мотивам мира Nocturne — татуировок Полудемона (тёмные полосы с бирюзовым светящимся контуром,
// плавные изгибы, острые концы) и Магатамы, которая живёт в нём и даёт силу:
//  · баннер на главной — вытянутая шестигранная плашка: слева логотип, в центре Полудемон, справа Магатама со
//    счётом; из-под Магатамы к его рукам тянутся полосы татуировки, по одной на условие: выполненные светятся,
//    невыполненные — тёмные. Выделение — от Магатамы по светящимся полосам бежит ток, Магатама пульсирует;
//  · при наведении на главную — пробуждение Магатамы: вокруг неё проступает огромный контур Магатамы, от неё
//    волнами расходятся соты, из краёв баннера в поля прорастают полосы татуировки;
//  · заставка — метки расползаются: полосы татуировки разбегаются от баннера по экрану, всё тонет в черноте,
//    проступает логотип; на странице полосы убегают за края экрана, чернота уходит;
//  · страница — соты: в одной соте Магатама, налитая по числу выполненных условий, в остальных — условия
//    (картинка, номер, название; текст обтекает скосы). Выполненные обведены полосой татуировки, невыполненные —
//    серые с пунктиром. Подробности (что сказал, как закрыто, чек-листы) — в окне «Анализ», как навык Analyze;
//    клик по картинке — она и галерея крупно; под курсором проступает сетка сот.
(() => {
  "use strict";

  const ID = "shin-megami-tensei-iii-nocturne-hd-remaster";
  const CLOSE_MS = 700;
  const HOLD = { direct: 700, repeat: 260, handoff: 260, first: 880 };
  // Магатама в квадрате 100×100: круглая голова справа сверху, хвост загибается вниз-влево к острому концу
  const MG = "M28,97 C10,86 4,62 18,38 A34,34 0 1 1 52,72 C42,73 33,82 28,97 Z";

  const warmed = new Set();
  function warm(urls) {
    for (const u of urls) {
      if (!u || warmed.has(u)) continue;
      warmed.add(u);
      const im = new Image();
      im.decoding = "async";
      im.src = u;
      im.decode?.().catch(() => {});
    }
  }

  function seenBefore() {
    try {
      const seen = sessionStorage.getItem("sn-mark") === "1";
      sessionStorage.setItem("sn-mark", "1");
      return seen;
    } catch {
      return false;
    }
  }

  // псевдослучайное число от номера — узор один и тот же при каждом заходе
  const rnd = (i, k) => ((Math.sin((i + 1) * 12.9898 + k * 78.233) * 43758.5453) % 1 + 1) % 1;
  let uid = 0;

  // картинка вики для ячейки — вписанная в 800×800 (в разы легче, декодируется без рывков на прокрутке);
  // полная — для лайтбокса
  const thumb = (u) => {
    const m = /^(https:\/\/static\.wikia\.nocookie\.net\/.+?\/revision\/latest)(?:\/scale-to-width-down\/\d+)?(\?.*)?$/.exec(u ?? "");
    return m ? `${m[1]}/thumbnail-down/width/800/height/800${m[2] ?? ""}` : u;
  };

  // ---------- полоса татуировки: тёмная лента с контуром, сужается к острому концу ----------
  const bez = (c, t) => {
    const u = 1 - t;
    const a = u * u * u, b = 3 * u * u * t, d = 3 * u * t * t, e = t * t * t;
    return [a * c[0][0] + b * c[1][0] + d * c[2][0] + e * c[3][0], a * c[0][1] + b * c[1][1] + d * c[2][1] + e * c[3][1]];
  };
  const bezD = (c, t) => {
    const u = 1 - t;
    const a = 3 * u * u, b = 6 * u * t, d = 3 * t * t;
    return [a * (c[1][0] - c[0][0]) + b * (c[2][0] - c[1][0]) + d * (c[3][0] - c[2][0]), a * (c[1][1] - c[0][1]) + b * (c[2][1] - c[1][1]) + d * (c[3][1] - c[2][1])];
  };
  // c — четыре точки кривой от основания к острию, w — ширина у основания; tin — доля длины, на которой лента
  // нарастает из острия (0 — тупое основание, его прячут под баннером или Магатамой)
  function band(c, w, steps = 18, tin = 0) {
    const L = [];
    const R = [];
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const p = bez(c, t);
      const d = bezD(c, t);
      const len = Math.hypot(d[0], d[1]) || 1;
      const k = tin ? Math.min(1, t / tin) : 1;
      const hw = (w / 2) * Math.pow(1 - t, 0.62) * k * k * (3 - 2 * k);
      L.push([p[0] - (d[1] / len) * hw, p[1] + (d[0] / len) * hw]);
      R.push([p[0] + (d[1] / len) * hw, p[1] - (d[0] / len) * hw]);
    }
    const line = (pts) => pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("");
    return { fill: `${line(L)}${line(R.slice().reverse()).replace(/^M/, "L")}Z`, left: line(L), right: line(R), L, R };
  }
  // f — лента, g — свечение контура, e — контур; c — ток по контуру (только на баннере)
  function bandSvg(b, cls, attrs = "", flow = false) {
    const edge = (k) => `<path class="${k}" d="${b.left}" pathLength="1"/><path class="${k}" d="${b.right}" pathLength="1"/>`;
    return `<g class="sn-b ${cls}" ${attrs}><path class="f" d="${b.fill}"/>${edge("g")}${edge("e")}${flow ? edge("c") : ""}</g>`;
  }

  // полосы на баннере (поле 560×210, Магатама справа — с центром в 480,105): из-под неё веером к рукам Полудемона
  function banBands(n) {
    const out = [];
    const w = Math.max(6, Math.min(19, 210 / n));
    const spread0 = Math.min(104, n * w * 0.95);
    for (let i = 0; i < n; i++) {
      const f = n === 1 ? 0.5 : i / (n - 1);
      const y0 = 105 + (f - 0.5) * spread0;
      const y3 = 142 + (f - 0.5) * 112 + (rnd(i, 1) - 0.5) * 8;
      const x3 = 100 + rnd(i, 2) * 40 + (1 - f) * 60;
      const c = [[452, y0], [340, y0 + (rnd(i, 3) - 0.5) * 26], [x3 + 120, y3 - (f - 0.5) * 70 + (rnd(i, 4) - 0.5) * 18], [x3, y3]];
      out.push(band(c, w));
    }
    return out;
  }

  // полосы заставки — к краям экрана. inside: начинаются острием внутри баннера, вразброс (баннер растворяется,
  // и тупые начала по его краю сложились бы в тёмную рамку); иначе — острием чуть снаружи рамки (вокруг логотипа)
  function coverBands(box, vw, vh, inside = true) {
    const out = [];
    const N = 20;
    const reach = Math.max(vw, vh);
    for (let i = 0; i < N; i++) {
      const side = i % 4 === 1 ? 1 : i % 4 === 3 ? 3 : i % 8 < 4 ? 0 : 2; // 0 — вверх, 1 — вправо, 2 — вниз, 3 — влево
      const t = 0.08 + rnd(i, 3) * 0.84;
      const u = rnd(i, 7);
      const depth = inside ? (side % 2 ? box.width * (0.04 + u * 0.24) : box.height * (0.3 + u * 0.45)) : -(6 + u * 36);
      const x = side === 1 ? box.right - depth : side === 3 ? box.left + depth : box.left + box.width * t;
      const y = side === 0 ? box.top + depth : side === 2 ? box.bottom - depth : box.top + box.height * t;
      const dir = side === 0 ? [0, -1] : side === 1 ? [1, 0] : side === 2 ? [0, 1] : [-1, 0];
      const len = Math.max(0, depth) + 240 + rnd(i, 4) * reach * 0.6;
      const bend = (rnd(i, 5) - 0.5) * len * 0.9;
      const at = (k, b) => [x + dir[0] * len * k - dir[1] * bend * b, y + dir[1] * len * k + dir[0] * bend * b];
      out.push(band([[x, y], at(0.35, 0.1), at(0.7, 0.85), at(1, 0.6)], 18 + rnd(i, 6) * 20, 26, 0.16));
    }
    return out;
  }

  // Магатама: тело, налитое бирюзой по доле выполненного, контур со свечением, счёт в голове
  function magatama(done, total) {
    const id = `sn-mg-${++uid}`;
    const top = total ? 100 - (100 * done) / total : 100;
    return `
      <defs>
        <clipPath id="${id}"><path d="${MG}"/></clipPath>
        <radialGradient id="${id}-b" cx="40%" cy="28%" r="80%"><stop offset="0" stop-color="#14272b"/><stop offset="1" stop-color="#040809"/></radialGradient>
        <linearGradient id="${id}-f" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#2fe6e0" stop-opacity="0.62"/><stop offset="1" stop-color="#2fe6e0" stop-opacity="0.22"/></linearGradient>
        <mask id="${id}-m" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100"><rect width="100" height="100" fill="#fff"/>${total ? `<circle cx="52" cy="37" r="18" fill="#000"/>` : ""}</mask>
      </defs>
      <path class="mg-body" d="${MG}" fill="url(#${id}-b)"/>
      <g clip-path="url(#${id})"><rect class="mg-fill" x="0" y="${top.toFixed(1)}" width="100" height="${(100 - top).toFixed(1)}" fill="url(#${id}-f)"/><rect class="mg-surf" x="0" y="${top.toFixed(1)}" width="100" height="1.4" mask="url(#${id}-m)"/></g>
      <path class="mg-glow" d="${MG}"/><path class="mg-edge" d="${MG}"/>
      ${total ? `<text class="mg-n" x="52" y="50" text-anchor="middle">${done}</text><text class="mg-t" x="58" y="95">/${total}</text>` : ""}`;
  }

  // кривая CSS cubic-bezier — для анимации на canvas в том же темпе, что и CSS
  function easing(x1, y1, x2, y2) {
    const bx = (t) => 3 * x1 * t * (1 - t) ** 2 + 3 * x2 * t * t * (1 - t) + t ** 3;
    const by = (t) => 3 * y1 * t * (1 - t) ** 2 + 3 * y2 * t * t * (1 - t) + t ** 3;
    return (x) => {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      let lo = 0;
      let hi = 1;
      let t = x;
      for (let i = 0; i < 18; i++) {
        t = (lo + hi) / 2;
        if (bx(t) < x) lo = t;
        else hi = t;
      }
      return by(t);
    };
  }
  const EASE_DRAW = easing(0.4, 0, 0.3, 1);
  const EASE_RUN = easing(0.5, 0, 0.75, 0.6);
  const EASE = easing(0.25, 0.1, 0.25, 1);

  // Полосы заставки — на canvas. Те же ленты с контуром и свечением, но за кадр — одна заливка и два штриха:
  // сотня путей SVG на весь экран, перерисованных каждый кадр, роняла частоту кадров на треть.
  // Видимая часть контура — от a до b (доли длины): прорисовка 0→1, убегание за края — a 0→1.
  function veilLines(veil, bands, vw, vh) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cv = document.createElement("canvas");
    cv.className = "sn-veil-lines";
    cv.setAttribute("aria-hidden", "true");
    cv.width = Math.round(vw * dpr);
    cv.height = Math.round(vh * dpr);
    veil.append(cv);
    const g = cv.getContext("2d");
    const fill = new Path2D(bands.map((b) => b.fill).join(""));
    const edges = bands.flatMap((b) => [b.L, b.R]).map((pts) => {
      const len = [0];
      for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      return { pts, len, total: len[len.length - 1] || 1 };
    });
    const part = (path, { pts, len, total }, a, b) => {
      const from = a * total;
      const to = b * total;
      let started = false;
      for (let i = 1; i < pts.length; i++) {
        if (len[i] < from) continue;
        if (len[i - 1] > to) break;
        const seg = len[i] - len[i - 1] || 1;
        const u0 = Math.max(0, (from - len[i - 1]) / seg);
        const u1 = Math.min(1, (to - len[i - 1]) / seg);
        const [x0, y0] = pts[i - 1];
        const dx = pts[i][0] - x0;
        const dy = pts[i][1] - y0;
        if (!started) path.moveTo(x0 + dx * u0, y0 + dy * u0);
        started = true;
        path.lineTo(x0 + dx * u1, y0 + dy * u1);
      }
    };
    const draw = (a, b, body) => {
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, vw, vh);
      if (body > 0.002) {
        g.globalAlpha = body;
        g.fillStyle = "rgba(8, 34, 36, 0.92)";
        g.fill(fill);
        g.globalAlpha = 1;
      }
      if (b - a < 0.001) return;
      const path = new Path2D();
      for (const e of edges) part(path, e, a, b);
      g.lineCap = "round";
      g.lineJoin = "round";
      g.strokeStyle = "rgba(47, 230, 224, 0.26)";
      g.lineWidth = 8;
      g.stroke(path);
      g.strokeStyle = "#2fe6e0";
      g.lineWidth = 2;
      g.stroke(path);
    };
    const st = { mode: "", t0: 0, raf: 0 };
    const frame = (now) => {
      st.raf = 0;
      if (!veil.isConnected) return;
      const t = now - st.t0;
      if (st.mode === "in") draw(0, EASE_DRAW(t / 660), EASE(Math.max(0, t - 250) / 400));
      else draw(EASE_RUN(t / 750), 1, 1 - EASE(t / 300));
      if (t < 800) st.raf = requestAnimationFrame(frame);
    };
    const run = (mode) => {
      st.mode = mode;
      st.t0 = performance.now();
      if (!st.raf) st.raf = requestAnimationFrame(frame);
    };
    // drawIn — прорисовать, shown — сразу целиком (прямой заход), runOff — убежать за края
    veil.snLines = { drawIn: () => run("in"), shown: () => draw(0, 1, 1), runOff: () => run("out") };
  }
  const titleHtml = (game, esc) => (game.logo ? `<img src="${esc(game.logo)}" alt="">` : `<span>${esc(game.title)}</span>`);

  // шестиугольник ячейки (viewBox 100×115.47), сжатый к центру: s = 1 — по краю
  const hexPath = (s) => {
    const cx = 50;
    const cy = 57.735;
    const pts = [[50, 0], [100, 28.87], [100, 86.6], [50, 115.47], [0, 86.6], [0, 28.87]];
    return `M${pts.map(([x, y]) => `${(cx + (x - cx) * s).toFixed(2)},${(cy + (y - cy) * s).toFixed(2)}`).join(" L")} Z`;
  };
  const RIM_OUT = hexPath(0.972);
  const RIM_IN = hexPath(0.906);

  GameThemes.register("shin-megami-tensei-iii-nocturne-hd-remaster", {
    // ---------- главная: метки Полудемона ----------
    banner(b) {
      const { done, total } = b.progress;
      const n = Math.max(1, total);
      const mid = `sn-bm-${++uid}`;
      const bands = banBands(n).map((bd, i) => bandSvg(bd, i < done ? "on" : "off", `style="--i:${i}"`, true)).join("");
      const logo = b.art.logo('alt=""');
      b.el.innerHTML = `
        <span class="sn-ban">
          <span class="sn-ban-in">
            <span class="sn-ban-art">${b.art.hero('alt="" loading="lazy"')}</span>
            <span class="sn-ban-hex" aria-hidden="true"></span>
            <span class="sn-ban-shade" aria-hidden="true"></span>
            <span class="sn-ban-logo">${logo || `<span class="sn-ban-name">${b.esc(b.game.title)}</span>`}</span>
            <svg class="sn-ban-ink" viewBox="0 0 560 210" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">
              <defs>
                <linearGradient id="${mid}-g" x1="0" x2="560" y1="0" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0.64" stop-color="#fff"/><stop offset="0.8" stop-color="#000"/></linearGradient>
                <mask id="${mid}" maskUnits="userSpaceOnUse" x="0" y="0" width="560" height="210"><rect width="560" height="210" fill="url(#${mid}-g)"/></mask>
              </defs>
              <g mask="url(#${mid})">${bands}</g>
              <g class="sn-mg" transform="translate(405 30) scale(1.5)">${magatama(done, total)}</g>
            </svg>
            <span class="sn-sr">${b.esc(b.game.title)}. ${total ? `Выполнено ${done} из ${total} условий закрытия` : "Условия ещё не заданы"}</span>
          </span>
        </span>`;
    },

    // ---------- главная: при наведении — пробуждение Магатамы ----------
    // Только CSS: контур огромной Магатамы вокруг Магатамы баннера, волны сот от неё, полосы в поля.
    stage(s) {
      const ring = (k) => `<i class="sn-st-ring" style="--k:${k}"></i>`;
      // полосы в пикселях (поле 520×560, x = 0 — край баннера, основание спрятано под ним)
      const vine = (i) => {
        const y0 = 170 + rnd(i, 4) * 220;
        const len = 220 + rnd(i, 5) * 300;
        const bend = (rnd(i, 6) - 0.5) * 260;
        const c = [[-140, y0], [len * 0.3, y0 + bend * 0.12], [len * 0.7, y0 + bend], [len, y0 + bend * 0.7]];
        return bandSvg(band(c, 12 + rnd(i, 7) * 10, 22, 0.14), "on", `style="--d:${(0.1 + (i % 7) * 0.08).toFixed(2)}s"`);
      };
      const vines = (side) => Array.from({ length: 7 }, (_, i) => vine(i + (side === "r" ? 7 : 0))).join("");
      s.el.innerHTML = `
        <div class="sn-st">
          <i class="sn-st-hex"></i>
          ${[0, 1, 2, 3].map(ring).join("")}
          <svg class="sn-st-mg" viewBox="-4 -4 108 108" aria-hidden="true"><path class="glow" d="${MG}" pathLength="1"/><path class="core" d="${MG}" pathLength="1"/><circle class="glow" cx="56" cy="34" r="8" pathLength="1"/><circle class="core" cx="56" cy="34" r="8" pathLength="1"/></svg>
          <svg class="sn-st-vines l" viewBox="0 0 520 560" aria-hidden="true">${vines("l")}</svg>
          <svg class="sn-st-vines r" viewBox="0 0 520 560" aria-hidden="true">${vines("r")}</svg>
        </div>`;
    },

    // ---------- главная: метки расползаются по экрану ----------
    cover(t) {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const r = document.querySelector(`.gbanner.picked[data-game="${ID}"]`)?.getBoundingClientRect();
      const box = r && r.width ? r : { left: vw * 0.2, right: vw * 0.8, top: vh * 0.42, bottom: vh * 0.58, width: vw * 0.6, height: vh * 0.16 };
      const veil = t.layer("sn-veil");
      veil.innerHTML = `<i class="sn-veil-black"></i>`;
      veilLines(veil, coverBands(box, vw, vh), vw, vh);
      const title = t.layer("sn-title");
      title.innerHTML = titleHtml(t.game, t.esc);
      warm([t.assets + "void.webp"]);
      fetch(`data/conditions/${ID}.json`)
        .then((res) => (res.ok ? res.json() : null))
        .then((c) => warm((c?.groups ?? []).flatMap((gr) => gr.goals ?? []).slice(0, 6).map((g) => thumb(g.image))))
        .catch(() => {});
      t.data.started = performance.now();
      t.data.seen = seenBefore();
      const imgs = [...title.querySelectorAll("img")];
      const ready = Promise.race([Promise.all(imgs.map((im) => im.decode?.().catch(() => {}))), new Promise((res) => setTimeout(res, 120))]);
      return new Promise((resolve) => {
        ready.then(() => {
          void veil.offsetWidth; // чернота начинает с нуля — до смены класса
          veil.classList.add("in");
          veil.snLines.drawIn();
          setTimeout(() => title.classList.add("in"), 360);
          setTimeout(resolve, CLOSE_MS + 40);
        });
        setTimeout(resolve, CLOSE_MS + 600);
      });
    },

    // ---------- страница игры — соты ----------
    page(ctx) {
      const { root, esc, assets, game } = ctx;
      const cond = ctx.conditions;
      const groups = (cond?.groups ?? []).filter((gr) => (gr.goals ?? []).length);
      const items = groups.flatMap((gr) => gr.goals);
      const done = items.filter((g) => g.done).length;
      const total = items.length;
      const motion = !ctx.reducedMotion;
      const timers = new Set();
      const later = (fn, ms) => {
        const id = setTimeout(() => (timers.delete(id), fn()), ms);
        timers.add(id);
        return id;
      };
      ctx.onCleanup(() => timers.forEach(clearTimeout));

      root.classList.add("sn");
      root.innerHTML = pageHtml();
      const comb = root.querySelector(".sn-comb");
      const cells = [...root.querySelectorAll(".sn-cell")];

      backdrop();
      if (total) {
        pictures();
        layout();
        lens();
        awaken();
        analyze();
      }
      intro();

      return () => root.classList.remove("sn");

      // ---------- разметка ----------
      function pageHtml() {
        const logo = ctx.art.logo('alt=""');
        const nb = ctx.neighbors ?? {};
        return `
          <div class="sn-page ${total ? "" : "sn-page-empty"}">
            <header class="sn-head">
              <a class="sn-head-logo" href="#/" aria-label="К списку игр">${logo || `<span class="sn-head-name">${esc(game.title)}</span>`}</a>
              <h1 class="sn-sr">${esc(game.title)}</h1>
            </header>
            ${
              total
                ? `<main class="sn-comb" aria-label="Условия закрытия">${coreHtml()}${items.map(cellHtml).join("")}</main>`
                : `<main class="sn-comb sn-comb-empty"><p class="sn-empty">Условия закрытия для этой игры ещё не заданы.</p></main>`
            }
            <nav class="sn-nav" aria-label="Другие игры">
              ${nb.prev ? `<a class="prev" href="${esc(nb.prev.href)}"><span>${esc(nb.prev.title)}</span></a>` : ""}
              <a class="home" href="#/"><span>К списку игр</span></a>
              ${nb.next ? `<a class="next" href="${esc(nb.next.href)}"><span>${esc(nb.next.title)}</span></a>` : ""}
            </nav>
            <dialog class="sn-analyze" aria-labelledby="sn-an-title"></dialog>
          </div>`;
      }

      function rimHtml() {
        return `
        <svg class="sn-rim" viewBox="0 0 100 115.47" preserveAspectRatio="none" aria-hidden="true">
          <path class="band" d="${RIM_OUT} ${RIM_IN}" fill-rule="evenodd"/>
          <path class="glow" d="${RIM_OUT}" pathLength="1"/><path class="glow" d="${RIM_IN}" pathLength="1"/>
          <path class="out" d="${RIM_OUT}" pathLength="1"/><path class="in" d="${RIM_IN}" pathLength="1"/>
        </svg>`;
      }

      // сота-Магатама: налита по доле выполненного
      function coreHtml() {
        return `
          <section class="sn-cell sn-core done" aria-label="Выполнено ${done} из ${total} условий закрытия">
            <div class="sn-hex">
              <svg class="sn-core-mg" viewBox="-8 -8 116 116" aria-hidden="true">${magatama(done, total)}</svg>
            </div>
            <p class="sn-core-l" aria-hidden="true">условий закрытия</p>
            ${rimHtml()}
          </section>`;
      }

      function extraOf(g) {
        return !!(g.note || g.details || (g.checklist ?? []).some((c) => (c.items ?? []).length));
      }

      function cellHtml(g, i) {
        const img = ctx.safeUrl(g.image);
        const fit = g.imageFit === "contain";
        const gallery = (g.gallery ?? []).map(ctx.safeUrl).filter(Boolean);
        const link = ctx.safeUrl(g.link);
        const len = (g.title ?? "").length;
        const size = len > 220 ? "xxl" : len > 130 ? "xl" : len > 80 ? "l" : len > 45 ? "m" : "s";
        const list = (g.checklist ?? []).flatMap((c) => c.items ?? []);
        const cap = esc(g.title);
        return `
          <section class="sn-cell ${g.done ? "done" : "todo"} t-${size}" aria-label="№${esc(g.n)}${g.done ? ", выполнено" : ", не выполнено"}" data-gallery>
            <div class="sn-hex">
              <div class="sn-pic ${fit ? "fig" : ""}">
                ${img ? `<img class="sn-face" src="${esc(thumb(img))}" data-full="${esc(img)}" alt="" decoding="async"><img class="sn-full" src="${esc(img)}" alt="" loading="lazy" hidden data-zoom data-caption="${cap}">` : ""}
                ${gallery.map((u) => `<img class="sn-more" src="${esc(u)}" alt="" loading="lazy" hidden data-zoom data-caption="${cap}">`).join("")}
              </div>
              <span class="sn-n" aria-hidden="true">${esc(g.n)}</span>
              ${extraOf(g) ? `<button class="sn-scan" type="button" data-i="${i}">Анализ${list.length ? ` · ${list.filter((it) => it.done).length}/${list.length}` : ""}</button>` : ""}
              ${gallery.length ? `<span class="sn-plus" title="Ещё картинок: ${gallery.length}" aria-hidden="true"><svg viewBox="0 0 16 16"><rect x="1.5" y="4.5" width="10" height="10" rx="1"/><path d="M4.5 1.5h9a1 1 0 0 1 1 1v9"/></svg>${gallery.length}</span>` : ""}
              <div class="sn-txt ${size}">
                <i class="sn-sl l" aria-hidden="true"></i><i class="sn-sl r" aria-hidden="true"></i>
                <h3>${cap}</h3>
                ${link ? `<a class="sn-lore" href="${esc(link)}" target="_blank" rel="noopener">Подробнее&nbsp;↗</a>` : ""}
              </div>
            </div>
            ${rimHtml()}
          </section>`;
      }

      // ---------- фон: чернота с бирюзовой дымкой и красными брызгами ключевого арта ----------
      function backdrop() {
        const bg = ctx.layer("sn-backdrop");
        bg.innerHTML = `<i style="background-image:url('${assets}void.webp')"></i><b class="a" style="background-image:url('${assets}splatter.webp')"></b><b class="b" style="background-image:url('${assets}splatter.webp')"></b>`;
      }

      // ---------- картинки: миниатюра не загрузилась — полная; заранее декодировать, пока экран закрыт ----------
      function pictures() {
        for (const im of root.querySelectorAll(".sn-face")) {
          ctx.listen(im, "error", () => {
            if (im.dataset.full && im.src !== im.dataset.full) im.src = im.dataset.full;
          }, { once: true });
        }
        later(() => root.querySelectorAll(".sn-face").forEach((im) => im.decode?.().catch(() => {})), 300);
      }

      // ---------- соты: ряды со сдвигом на полячейки, Магатама — посередине первого ряда; узко — столбец ----------
      function layout() {
        let queued = false;
        const place = () => {
          queued = false;
          const W = comb.clientWidth;
          const cols = W >= 1000 ? 3 : W >= 640 ? 2 : 1;
          comb.classList.toggle("list", cols === 1);
          if (cols === 1) {
            cells.forEach((c) => (c.style.cssText = ""));
            comb.style.height = "";
            return;
          }
          const gap = 14;
          const w = Math.min(cols === 3 ? 380 : 330, (W - (cols - 1) * gap - gap / 2) / (cols + 0.5));
          const h = w * 1.1547;
          const rowH = h * 0.75 + gap * 0.87;
          const used = cols * w + (cols - 1) * gap + (w + gap) / 2;
          const left0 = (W - used) / 2;
          // места: Магатама (первая в разметке) — в середине первого ряда при трёх столбцах
          const slots = cells.map((_, i) => (cols === 3 ? (i === 0 ? 1 : i === 1 ? 0 : i) : i));
          // одна ячейка в последнем ряду — в его середину: встаёт между вершинами ряда выше
          if (cols === 3 && cells.length % 3 === 1 && cells.length > 3) slots[slots.length - 1] += 1;
          cells.forEach((c, i) => {
            const k = slots[i];
            const row = Math.floor(k / cols);
            const col = k % cols;
            const x = left0 + col * (w + gap) + (row % 2 ? (w + gap) / 2 : 0);
            c.style.cssText = `left:${x.toFixed(1)}px;top:${(row * rowH).toFixed(1)}px;width:${w.toFixed(1)}px;height:${h.toFixed(1)}px`;
          });
          const rows = Math.floor(Math.max(...slots) / cols) + 1;
          comb.style.height = `${((rows - 1) * rowH + h).toFixed(0)}px`;
        };
        const queue = () => {
          if (queued) return;
          queued = true;
          requestAnimationFrame(place);
        };
        place();
        if ("ResizeObserver" in window) {
          const ro = new ResizeObserver(queue);
          ro.observe(comb);
          ctx.onCleanup(() => ro.disconnect());
        }
      }

      // ---------- под курсором проступает сетка сот ----------
      function lens() {
        if (!ctx.finePointer || !motion) return;
        const el = ctx.layer("sn-lens");
        el.innerHTML = "<i></i>";
        const tile = el.firstChild;
        let tx = -999;
        let ty = -999;
        let x = -999;
        let y = -999;
        ctx.listen(window, "pointermove", (e) => {
          tx = e.clientX;
          ty = e.clientY;
          el.classList.add("on");
        }, { passive: true });
        ctx.listen(document, "pointerleave", () => el.classList.remove("on"));
        ctx.loop((now, dt) => {
          const k = 1 - Math.pow(0.0006, dt);
          x += (tx - x) * k;
          y += (ty - y) * k;
          const R = 170;
          el.style.transform = `translate3d(${(x - R).toFixed(1)}px, ${(y - R).toFixed(1)}px, 0)`;
          // узор стоит на месте, линза скользит по нему
          tile.style.transform = `translate3d(${(-(x - R) % 52).toFixed(1)}px, ${(-(y - R) % 90).toFixed(1)}px, 0)`;
        });
      }

      // ---------- выполненная ячейка, впервые попав в кадр, обводится полосой татуировки ----------
      function awaken() {
        const lit = cells.filter((c) => c.classList.contains("done"));
        if (!motion || !("IntersectionObserver" in window)) {
          lit.forEach((c) => c.classList.add("lit"));
          return;
        }
        const io = new IntersectionObserver(
          (entries) => {
            for (const en of entries) {
              if (!en.isIntersecting) continue;
              io.unobserve(en.target);
              en.target.classList.add("lit");
            }
          },
          { threshold: 0.4 },
        );
        later(() => lit.forEach((c) => io.observe(c)), ctx.handoff ? 1000 : 820);
        ctx.onCleanup(() => io.disconnect());
      }

      // ---------- «Анализ»: условие крупно — картинка, слова, как закрыто, чек-листы, галерея ----------
      function analyze() {
        const dlg = root.querySelector(".sn-analyze");
        let from = null;
        const open = (g, btn) => {
          const img = ctx.safeUrl(g.image);
          const gallery = (g.gallery ?? []).map(ctx.safeUrl).filter(Boolean);
          const link = ctx.safeUrl(g.link);
          const cap = esc(g.title);
          const lists = (g.checklist ?? [])
            .filter((c) => (c.items ?? []).length)
            .map((c) => `<div class="sn-an-list">${c.label ? `<h4>${esc(c.label)}</h4>` : ""}<ul>${c.items.map((it) => `<li class="${it.done ? "on" : ""}">${esc(it.title)}</li>`).join("")}</ul></div>`)
            .join("");
          const pics = [img, ...gallery].filter(Boolean);
          dlg.innerHTML = `
            <div class="sn-an ${g.done ? "done" : "todo"}" data-gallery>
              <header class="sn-an-head">
                <span class="sn-an-n">${esc(g.n)}</span><span class="sn-an-cap">Анализ</span>
                <button class="sn-an-close" type="button" aria-label="Закрыть">✕</button>
              </header>
              <div class="sn-an-body">
                ${img ? `<div class="sn-an-pic ${g.imageFit === "contain" ? "fig" : ""}"><img src="${esc(thumb(img))}" alt=""></div>` : ""}
                <div class="sn-an-txt">
                  <h2 id="sn-an-title">${cap}</h2>
                  <p class="sn-an-state">${g.done ? "Выполнено" : "Не выполнено"}</p>
                  ${g.note ? `<blockquote class="sn-an-note">«${esc(g.note)}»</blockquote>` : ""}
                  ${g.details ? `<p class="sn-an-details">${esc(g.details)}</p>` : ""}
                  ${lists}
                  ${link ? `<a class="sn-lore" href="${esc(link)}" target="_blank" rel="noopener">Подробнее&nbsp;↗</a>` : ""}
                </div>
              </div>
              ${pics.length > 1 ? `<div class="sn-an-gal">${pics.map((u) => `<img src="${esc(thumb(u))}" alt="" data-zoom data-caption="${cap}">`).join("")}</div>` : ""}
            </div>`;
          from = btn;
          dlg.showModal();
        };
        ctx.listen(root, "click", (e) => {
          const btn = e.target.closest(".sn-scan");
          if (btn) open(items[+btn.dataset.i], btn);
        });
        ctx.listen(dlg, "click", (e) => {
          if (e.target === dlg || e.target.closest(".sn-an-close")) dlg.close();
        });
        // Esc закрывает только окно: дальше документа не пускаем, иначе движок уведёт к списку игр
        ctx.listen(dlg, "keydown", (e) => {
          if (e.key === "Escape") e.stopPropagation();
        });
        ctx.listen(dlg, "close", () => from?.focus());
        ctx.onCleanup(() => dlg.open && dlg.close());
      }

      // ---------- вход: логотип гаснет, полосы убегают за края, чернота уходит ----------
      function intro() {
        const handedVeil = ctx.handoff?.layers.find((l) => l.classList.contains("sn-veil"));
        const handedTitle = ctx.handoff?.layers.find((l) => l.classList.contains("sn-title"));
        if (!motion) {
          handedVeil?.remove();
          handedTitle?.remove();
          return;
        }
        let veil = handedVeil;
        let title = handedTitle;
        let hold;
        if (veil && title) {
          const since = performance.now() - (ctx.handoff.data.started ?? 0);
          hold = Math.max(HOLD.handoff, (ctx.handoff.data.seen ? 0 : HOLD.first) - since);
        } else {
          veil?.remove();
          title?.remove();
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          // полосы расходятся от логотипа, а не из-под него
          const lw = Math.min(760, vw * 0.8) * 1.04;
          const lh = lw * (155 / 600);
          const box = { left: (vw - lw) / 2, right: (vw + lw) / 2, top: (vh - lh) / 2, bottom: (vh + lh) / 2, width: lw, height: lh };
          veil = ctx.layer("sn-veil in direct");
          veil.innerHTML = `<i class="sn-veil-black"></i>`;
          veilLines(veil, coverBands(box, vw, vh, false), vw, vh);
          veil.snLines.shown();
          title = ctx.layer("sn-title direct");
          title.innerHTML = titleHtml(game, esc);
          // логотип — только декодированным целиком, а не недогруженной полосой сверху
          const ttlIn = title;
          const logoImg = title.querySelector("img");
          Promise.race([logoImg?.decode?.() ?? Promise.resolve(), new Promise((res) => setTimeout(res, 700))])
            .catch(() => {})
            .then(() => ttlIn.classList.add("in"));
          hold = seenBefore() ? HOLD.repeat : HOLD.direct;
        }
        const v = veil;
        const ttl = title;
        root.classList.add("sn-intro");
        let opened = false;
        const open = () => {
          if (opened) return;
          opened = true;
          ttl.classList.add("out");
          later(() => {
            v.classList.add("out");
            v.snLines?.runOff();
            root.classList.remove("sn-intro");
          }, 200);
          later(() => ttl.remove(), 800);
          later(() => v.remove(), 1500);
        };
        later(open, hold);
        ctx.onCleanup(() => {
          v.remove();
          ttl.remove();
          root.classList.remove("sn-intro");
        });
        for (const type of ["pointerdown", "keydown", "wheel"]) ctx.listen(window, type, open, { passive: true, once: true });
      }
    },
  });
})();
