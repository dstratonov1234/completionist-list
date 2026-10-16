// Lies of P — «Театр марионеток Крата» на главной и «Улица Звездочётов» на странице.
// Всё своё, по мотивам Крата Прекрасной эпохи и сказки о Пиноккио:
//  · баннер на главной — арка кукольного театра: P в арке, по ободу — лампочки-маркиза (горят по числу
//    выполненных условий), в замковом камне — счёт, логотип — на правом крыле; плашка висит на нитях,
//    уходящих вверх к невидимому кукловоду; выделение — нити поднимают её, как марионетку, она качается,
//    лампочки пробегают огнём, из арки вылетает голубая бабочка;
//  · при наведении на главную — театр: по краям выезжают бархатные кулисы, сверху на баннер сходятся два луча
//    софитов с пылью в свете, нити тянутся от баннера под самый потолок, внизу теплится рампа;
//  · страница — улица Звездочётов: у каждой цели стоит Звездочёт (как в игре — кованый треножник с
//    чашей-лилией), табличка в рамке модерна; выполненные — Звездочёт зажжён голубым столбом света, рамка
//    в золоте; невыполненные — Звездочёт тёмный, рамка потускнела, картинка в тумане. Таблички — в два ряда
//    вразбежку; голубая бабочка летит за курсором, а без него — к первому тёмному Звездочёту. Над улицей —
//    маркиза отеля «Крат» на нитях марионетки: в ней логотип, счёт и лампочки прогресса;
//  · заставка — кованые ворота Крата смыкаются поверх главной, логотип собирается из двух половин на створках;
//    на странице ворота распахиваются и уносят половины логотипа с собой.
(() => {
  "use strict";

  const HOLD = { direct: 750, repeat: 280, handoff: 280, first: 900 };
  const CLOSE_MS = 680;

  // ---------- арка баннера (viewBox 1000×210, растягивается на всю плашку) ----------
  // крылья по краям ниже, посередине — высокая арка с волютами у плеч
  const WING = 66;
  const ARCH = [
    // [x0,y0, c1x,c1y, c2x,c2y, x1,y1] — левая половина арки от плеча к вершине, правая — зеркально
    [176, 52, 232, 16, 362, 0, 500, 0],
    [500, 0, 638, 0, 768, 16, 824, 52],
  ];
  function rimPath(dy = 0, closed = true) {
    const y = (v) => (v + dy).toFixed(1);
    const [a, b] = ARCH;
    const top =
      `M0,${y(WING)} L140,${y(WING)} C160,${y(WING)} 170,${y(60)} 176,${y(52)} ` +
      `C${a[2]},${y(a[3])} ${a[4]},${y(a[5])} ${a[6]},${y(a[7])} ` +
      `C${b[2]},${y(b[3])} ${b[4]},${y(b[5])} ${b[6]},${y(b[7])} ` +
      `C830,${y(60)} 840,${y(WING)} 860,${y(WING)} L1000,${y(WING)}`;
    return closed ? `${top} L1000,210 L0,210 Z` : top;
  }
  // точки по дуге арки на равных расстояниях: t — доля длины дуги от левого плеча к правому
  const arcPts = (() => {
    const pts = [];
    for (const [x0, y0, c1x, c1y, c2x, c2y, x1, y1] of ARCH) {
      for (let i = pts.length ? 1 : 0; i <= 120; i++) {
        const t = i / 120;
        const u = 1 - t;
        pts.push([
          u * u * u * x0 + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * x1,
          u * u * u * y0 + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * y1,
        ]);
      }
    }
    const len = [0];
    for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    return (f) => {
      const L = f * len[len.length - 1];
      let i = len.findIndex((v) => v >= L);
      if (i <= 0) return pts[Math.max(0, i)];
      const k = (L - len[i - 1]) / (len[i] - len[i - 1] || 1);
      return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k];
    };
  })();
  // нити: где они держат плашку (доля длины дуги)
  const STRINGS = [0.1, 0.32, 0.68, 0.9];
  const pct = (v, of) => `${((v / of) * 100).toFixed(2)}%`;

  // лампочки прогресса: при большом числе условий — не больше 24, горит доля
  function bulbsLit(done, total, max) {
    const n = Math.min(total, max);
    return { n, lit: total ? Math.round((done / total) * n) : 0 };
  }

  // Картинки декодируются заранее — пока ворота ещё закрывают экран (или пока навели на баннер):
  // иначе первая отрисовка приходится на начало движения, и оно на миг замирает.
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
      const seen = sessionStorage.getItem("lp-gate") === "1";
      sessionStorage.setItem("lp-gate", "1");
      return seen;
    } catch {
      return false;
    }
  }

  // ворота: на каждой створке — своя половина логотипа, они сходятся при закрытии и расходятся при открытии
  function gatesHtml(game, esc, assets) {
    const title = game.logo ? `<img src="${esc(game.logo)}" alt="">` : `<span>${esc(game.title)}</span>`;
    const half = (side) => `
      <span class="lp-gate-half ${side}">
        <i style="background-image:url('${assets}gate-shadow.webp')"></i>
        <span class="lp-gate-logo" aria-hidden="true"><b>${title}</b></span>
      </span>`;
    return `
      <i class="lp-gate-veil"></i>
      ${half("l")}${half("r")}
      <span class="lp-gate-fog"></span>
      <span class="lp-sr">${esc(game.title)}</span>`;
  }

  GameThemes.register("lies-of-p", {
    // ---------- главная: арка кукольного театра на нитях ----------
    banner(b) {
      const { done, total } = b.progress;
      const logo = b.art.logo('alt=""');
      const { n, lit } = bulbsLit(done, total, 24);
      // лампочки — по ободу арки, ниже края; у вершины место под замковый камень со счётом
      const bulbs = Array.from({ length: n }, (_, i) => {
        const f = n === 1 ? 0.25 : i < n / 2 ? 0.03 + (0.41 * i) / Math.max(1, Math.ceil(n / 2) - 1) : 0.56 + (0.41 * (i - Math.ceil(n / 2))) / Math.max(1, n - Math.ceil(n / 2) - 1);
        const [x, y] = arcPts(Math.min(0.97, f));
        return `<i class="${i < lit ? "on" : ""}" style="left:${pct(x, 1000)};top:${pct(y + 19, 210)};--i:${i}"></i>`;
      }).join("");
      const strings = STRINGS.map((f) => {
        const [x, y] = arcPts(f);
        return `<i style="left:${pct(x, 1000)};top:${pct(y, 210)}"></i>`;
      }).join("");
      b.el.innerHTML = `
        <span class="lp-ban-rig">
          <span class="lp-ban-strings" aria-hidden="true">${strings}</span>
          <span class="lp-ban">
            <span class="lp-ban-art">${b.art.hero('alt="" loading="lazy"')}</span>
            <span class="lp-ban-shade"></span>
            <span class="lp-ban-spot"></span>
            <i class="lp-ban-frame"></i>
            <svg class="lp-ban-rim" viewBox="0 0 1000 210" preserveAspectRatio="none" aria-hidden="true">
              <path d="${rimPath(0.6, false)}"/><path class="in" d="${rimPath(8, false)}"/>
            </svg>
            <span class="lp-ban-bulbs" aria-hidden="true">${bulbs}</span>
            <span class="lp-ban-fly" aria-hidden="true"><img src="${b.assets}butterfly.webp" alt=""></span>
            <span class="lp-ban-logo">${logo || `<span class="lp-ban-name" aria-hidden="true">${b.esc(b.game.title)}</span>`}</span>
            <span class="lp-sr">${b.esc(b.game.title)}. ${total ? `Выполнено ${done} из ${total} условий закрытия` : "Условия ещё не заданы"}</span>
          </span>
          ${total ? `<span class="lp-ban-key" aria-hidden="true"><b>${done}</b><span>/${total}</span></span>` : ""}
        </span>`;
      b.el.style.setProperty("--lp-mask", `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1000 210' preserveAspectRatio='none'><path d='${rimPath()}'/></svg>`)}")`);
    },

    // ---------- главная: при наведении — сцена кукольного театра ----------
    // Кулисы выезжают из-за краёв к баннеру, сверху на него сходятся два луча софитов с пылью в свете,
    // нити от баннера тянутся под потолок (видны в просветах между баннерами), внизу теплится рампа.
    // Только CSS: всё выстроено по --bcx/--bcy/--bw/--bh и идёт, пока у слоя класс .on.
    stage(s) {
      // ворота и логотип — заранее, чтобы к клику их не пришлось декодировать
      warm([s.assets + "gate-shadow.webp", s.safeUrl(s.game.logo)]);
      const motes = (side) =>
        Array.from({ length: 16 }, (_, i) => {
          const r = (k) => ((Math.sin((i + 1) * (k + (side === "l" ? 3.1 : 7.7))) * 43758.5453) % 1 + 1) % 1;
          // вдоль луча: v — доля пути от потолка к баннеру, u — поперёк, около диагонали
          const v = 0.06 + r(2) * 0.9;
          const u = Math.max(0.02, Math.min(1, v + (r(1) - 0.5) * 0.45));
          return `<i style="--u:${u.toFixed(3)};--v:${v.toFixed(3)};--d:${(r(3) * -14).toFixed(2)}s;--t:${(9 + r(4) * 8).toFixed(1)}s;--z:${(0.6 + r(5) * 0.9).toFixed(2)}"></i>`;
        }).join("");
      const strings = STRINGS.map((f) => `<i style="--sx:${arcPts(f)[0] / 1000}"></i>`).join("");
      s.el.innerHTML = `
        <div class="lp-th">
          <div class="lp-th-strings">${strings}</div>
          <div class="lp-th-curtain l"><img src="${s.assets}curtain.webp" alt=""></div>
          <div class="lp-th-curtain r"><img src="${s.assets}curtain.webp" alt=""></div>
          <i class="lp-th-halo l"></i><i class="lp-th-halo r"></i>
          <div class="lp-th-beam l">${motes("l")}</div>
          <div class="lp-th-beam r">${motes("r")}</div>
          <i class="lp-th-foot"></i>
          <div class="lp-th-fly"><img src="${s.assets}butterfly.webp" alt=""></div>
        </div>`;
    },

    // ---------- главная: кованые ворота смыкаются поверх списка ----------
    cover(t) {
      const layer = t.layer("lp-gate");
      layer.innerHTML = gatesHtml(t.game, t.esc, t.assets);
      // пока ворота смыкаются — декодировать то, что откроется под ними
      warm(["street.webp", "stargazer.webp", "frame.webp", "frame-lit.webp", "frame-dim.webp", "marquee.webp", "cross.webp", "butterfly.webp"].map((f) => t.assets + f));
      fetch("data/conditions/lies-of-p.json")
        .then((r) => (r.ok ? r.json() : null))
        .then((c) => warm((c?.groups ?? []).flatMap((gr) => gr.goals ?? []).slice(0, 4).map((g) => g.image)))
        .catch(() => {});
      t.data.started = performance.now();
      t.data.seen = seenBefore();
      const imgs = [...layer.querySelectorAll("img")];
      const ready = Promise.race([Promise.all(imgs.map((im) => im.decode?.().catch(() => {}))), new Promise((r) => setTimeout(r, 120))]);
      return new Promise((resolve) => {
        ready.then(() => {
          void layer.offsetWidth; // начальное положение — до смены класса, чтобы ворота наплывали
          layer.classList.add("closing");
          setTimeout(() => layer.classList.add("titled"), 240);
          setTimeout(resolve, CLOSE_MS + 40);
        });
        setTimeout(resolve, CLOSE_MS + 600);
      });
    },

    // ---------- страница игры — улица Звездочётов ----------
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

      root.classList.add("lp");
      root.innerHTML = pageHtml();
      const stations = [...root.querySelectorAll(".lp-st")];

      backdrop();
      if (total) {
        street();
        portraits();
        lighting();
        butterfly();
      }
      intro();

      return () => root.classList.remove("lp");

      // ---------- разметка ----------
      function pageHtml() {
        const nb = ctx.neighbors ?? {};
        let k = 0;
        const runs = groups
          .map(
            (gr) => `
            ${groups.length > 1 ? `<h2 class="lp-group"><span>${esc(gr.title)}</span></h2>` : ""}
            <div class="lp-run">${gr.goals.map((g, i) => stationHtml(g, i % 2 ? "r" : "l", k++ < 2)).join("")}</div>`,
          )
          .join("");
        return `
          <div class="lp-page ${total ? "" : "lp-page-empty"}">
            <header class="lp-head">${mastHtml()}</header>
            <h1 class="lp-sr">${esc(game.title)}</h1>
            ${total ? `<main class="lp-street" aria-label="Условия закрытия">${runs}</main>` : `<main class="lp-street"><p class="lp-empty">Условия закрытия для этой игры ещё не заданы.</p></main>`}
            <footer class="lp-foot">
              <nav class="lp-post" aria-label="Другие игры">
                <i class="lp-post-base" aria-hidden="true"></i>
                <a class="lp-board home" href="#/"><span>К списку игр</span></a>
                ${nb.prev ? `<a class="lp-board l" href="${esc(nb.prev.href)}"><span>${esc(nb.prev.title)}</span></a>` : ""}
                ${nb.next ? `<a class="lp-board r" href="${esc(nb.next.href)}"><span>${esc(nb.next.title)}</span></a>` : ""}
              </nav>
            </footer>
          </div>`;
      }

      // маркиза отеля «Крат» на нитях марионетки: логотип, счёт, лампочки по краю панели
      function mastHtml() {
        const logo = ctx.art.logo('alt=""');
        const { n, lit } = bulbsLit(done, total, 24);
        // лампочки сидят на внутреннем золотом ободе маркизы (в % её коробки), симметрично: поровну сверху
        // и снизу, по бокам — по n/8; горят по часовой стрелке от левого верхнего угла
        const R = { x0: 14, x1: 86, top: 33.4, bottom: 73.2, left: 8.1, right: 91.9, y0: 45, y1: 61 };
        const side = n >= 6 ? Math.round(n / 8) : 0;
        const top = Math.ceil((n - 2 * side) / 2);
        const bottom = n - 2 * side - top;
        const row = (k, i) => (k === 1 ? 50 : R.x0 + ((R.x1 - R.x0) * i) / (k - 1));
        const col = (k, i) => (k === 1 ? 53 : R.y0 + ((R.y1 - R.y0) * i) / (k - 1));
        const spots = [
          ...Array.from({ length: top }, (_, i) => [row(top, i), R.top]),
          ...Array.from({ length: side }, (_, i) => [R.right, col(side, i)]),
          ...Array.from({ length: bottom }, (_, i) => [row(bottom, bottom - 1 - i), R.bottom]),
          ...Array.from({ length: side }, (_, i) => [R.left, col(side, side - 1 - i)]),
        ];
        const bulbs = spots.map(([x, y], i) => `<i class="${i < lit ? "on" : ""}" style="left:${x.toFixed(2)}%;top:${y.toFixed(2)}%"></i>`).join("");
        // нити от колец крестовины (её ширина — 300 из 640) к верху маркизы
        const rings = [0.119, 0.335, 0.665, 0.881].map((f) => 170 + 300 * f);
        const holds = [0.15, 0.34, 0.66, 0.85].map((f) => 640 * f);
        const lines = rings.map((x, i) => `<line x1="${x.toFixed(1)}" y1="120" x2="${holds[i].toFixed(1)}" y2="${i % 3 ? 274 : 308}"/>`).join("");
        return `
          <div class="lp-mast">
            <img class="lp-mast-cross" src="${assets}cross.webp" alt="" aria-hidden="true">
            <svg class="lp-mast-strings" viewBox="0 0 640 590" aria-hidden="true">${lines}</svg>
            <div class="lp-marquee">
              <i class="lp-marquee-panel"></i>
              <img class="lp-marquee-frame" src="${assets}marquee.webp" alt="" aria-hidden="true">
              ${total ? `<span class="lp-marquee-bulbs" aria-hidden="true">${bulbs}</span>` : ""}
              <a class="lp-head-logo" href="#/" aria-label="К списку игр">${logo || `<span class="lp-head-name">${esc(game.title)}</span>`}</a>
              ${total ? `<p class="lp-head-count" aria-label="Выполнено ${done} из ${total} условий закрытия"><span><b>${done}</b>/${total}</span><small>условий закрытия</small></p>` : ""}
            </div>
          </div>`;
      }

      // «Сюжетные боссы: A, B, C, …» → заголовок и таблички с именами; короткие названия — как есть
      function titleHtml(t) {
        const m = /^([^:]{2,60}):\s+(.+)$/.exec(t);
        const names = m ? m[2].split(/[,;]\s+/).filter(Boolean) : [];
        if (names.length < 4) return esc(t);
        return `${esc(m[1])}<span class="lp-names">${names.map((x) => `<span>${esc(x)}</span>`).join("")}</span>`;
      }

      function stationHtml(g, side, first) {
        const img = ctx.safeUrl(g.image);
        const fit = g.imageFit === "contain";
        const checklist = (g.checklist ?? [])
          .map(
            (c) => `
            <div class="lp-list">
              ${c.label ? `<h4>${esc(c.label)} · ${(c.items ?? []).filter((it) => it.done).length}/${(c.items ?? []).length}</h4>` : ""}
              <ul>${(c.items ?? []).map((it) => `<li class="${it.done ? "on" : ""}"><i aria-hidden="true"></i><span>${esc(it.title)}</span></li>`).join("")}</ul>
            </div>`,
          )
          .join("");
        const gallery = (g.gallery ?? []).map(ctx.safeUrl).filter(Boolean);
        const link = ctx.safeUrl(g.link);
        return `
          <section class="lp-st ${side} ${g.done ? "done" : "todo"}" aria-label="№${esc(g.n)}${g.done ? ", выполнено" : ", не выполнено"}">
            <div class="lp-sg" aria-hidden="true">
              <i class="lp-sg-beam"></i><i class="lp-sg-flame"></i>
              ${g.done ? `<b class="lp-sg-sparks"><i></i><i></i><i></i><i></i></b>` : ""}
              <img src="${assets}stargazer.webp" alt="">
            </div>
            <article class="lp-plaque">
              <span class="lp-plaque-n">№ ${esc(g.n)}</span>
              <div class="lp-plaque-pic ${fit ? "fig" : ""}">${img ? `<img src="${esc(img)}" alt="" loading="${first ? "eager" : "lazy"}" decoding="async" data-zoom data-caption="${esc(g.title)}">` : ""}</div>
              <h3 class="lp-plaque-title">${titleHtml(g.title)}</h3>
              ${checklist}
              ${g.note ? `<blockquote class="lp-note">«${esc(g.note)}»</blockquote>` : ""}
              ${g.details ? `<p class="lp-details">${esc(g.details)}</p>` : ""}
              ${gallery.length ? `<div class="lp-gallery">${gallery.map((u) => `<img src="${esc(u)}" alt="" loading="lazy" data-zoom data-caption="${esc(g.title)}">`).join("")}</div>` : ""}
              <div class="lp-plaque-foot">
                <span class="lp-state">${g.done ? "Звездочёт зажжён" : "Ещё не пройдено"}</span>
                ${link ? `<a class="lp-lore" href="${esc(link)}" target="_blank" rel="noopener">Подробнее&nbsp;↗</a>` : ""}
              </div>
            </article>
          </section>`;
      }

      // ---------- фон: туманная улица Крата ----------
      function backdrop() {
        const bg = ctx.layer("lp-backdrop");
        bg.style.backgroundImage = `url("${assets}street.webp")`;
        ctx.layer("lp-fog").innerHTML = `<i class="a"></i><i class="b"></i>`;
      }

      // ---------- таблички в два ряда вразбежку: каждая следующая ниже предыдущей, без пустых полос ----------
      function street() {
        const wide = window.matchMedia("(min-width: 980px)");
        const ROW = 4;
        const GAP = 30;
        const STEP = 150; // минимум, на сколько следующая табличка ниже предыдущей
        let queued = false;
        const layout = () => {
          queued = false;
          for (const run of root.querySelectorAll(".lp-run")) {
            const list = [...run.children];
            if (!wide.matches) {
              list.forEach((s) => (s.style.gridRow = ""));
              continue;
            }
            const end = [0, 0];
            let prev = -Infinity;
            list.forEach((s, i) => {
              const c = i % 2;
              const span = Math.ceil((s.offsetHeight + GAP) / ROW);
              const start = Math.max(end[c], prev + Math.ceil(STEP / ROW));
              s.style.gridRow = `${start + 1} / span ${span}`;
              end[c] = start + span;
              prev = start;
            });
          }
        };
        const queue = () => {
          if (queued) return;
          queued = true;
          requestAnimationFrame(layout);
        };
        layout();
        if ("ResizeObserver" in window) {
          const ro = new ResizeObserver(queue);
          stations.forEach((s) => ro.observe(s));
          ctx.onCleanup(() => ro.disconnect());
        }
        ctx.listen(wide, "change", queue);
      }

      // портреты (выше, чем шире) — кадрировать по лицу, а не по середине
      function portraits() {
        for (const im of root.querySelectorAll(".lp-plaque-pic:not(.fig) img, .lp-gallery img")) {
          const mark = () => im.naturalHeight > im.naturalWidth * 1.05 && im.classList.add("tall");
          if (im.complete) mark();
          else ctx.listen(im, "load", mark, { once: true });
        }
      }

      // ---------- Звездочёт зажигается, когда выполненная цель впервые попадает в кадр ----------
      function lighting() {
        const lit = stations.filter((s) => s.classList.contains("done"));
        if (!motion || !("IntersectionObserver" in window)) {
          lit.forEach((s) => s.classList.add("lit"));
          return;
        }
        const io = new IntersectionObserver(
          (entries) => {
            for (const en of entries) {
              if (!en.isIntersecting) continue;
              io.unobserve(en.target);
              en.target.classList.add("lit", "igniting");
            }
          },
          { threshold: 0.3 },
        );
        // пока закрыта заставка — не зажигаем: вспышка должна быть видна
        later(() => lit.forEach((s) => io.observe(s)), ctx.handoff ? 1000 : 800);
        ctx.onCleanup(() => io.disconnect());
      }

      // ---------- голубая бабочка: летит за курсором, а без него — к первому тёмному Звездочёту ----------
      function butterfly() {
        const fly = ctx.layer("lp-fly");
        fly.innerHTML = `<img src="${assets}butterfly.webp" alt="">`;
        if (!motion) {
          fly.remove();
          return;
        }
        const home = (stations.find((s) => s.classList.contains("todo")) ?? stations[stations.length - 1]).querySelector(".lp-sg img");
        const pos = { x: window.innerWidth * 0.8, y: window.innerHeight * 0.2, vx: 0, vy: 0 };
        let pointer = null;
        let lastMove = 0;
        if (ctx.finePointer) {
          ctx.listen(window, "pointermove", (e) => {
            pointer = { x: e.clientX, y: e.clientY };
            lastMove = performance.now();
          }, { passive: true });
        }
        ctx.loop((now, dt) => {
          let tx;
          let ty;
          if (pointer && now - lastMove < 2200) {
            tx = pointer.x + 26;
            ty = pointer.y - 22;
          } else {
            const r = home.getBoundingClientRect();
            tx = r.left + r.width / 2 + Math.cos(now / 700) * 24;
            ty = r.top - 34 + Math.sin(now / 520) * 12;
          }
          pos.vx = (pos.vx + (tx - pos.x) * 4.2 * dt) * 0.9;
          pos.vy = (pos.vy + (ty - pos.y) * 4.2 * dt) * 0.9;
          pos.x += pos.vx * dt * 6;
          pos.y += pos.vy * dt * 6;
          const flap = 0.55 + 0.45 * Math.abs(Math.sin(now / 90));
          const tilt = Math.max(-30, Math.min(30, pos.vx * 0.6));
          fly.style.transform = `translate3d(${pos.x.toFixed(1)}px, ${pos.y.toFixed(1)}px, 0) rotate(${tilt.toFixed(1)}deg) scaleX(${flap.toFixed(2)})`;
        });
      }

      // ---------- вход: ворота распахиваются ----------
      function intro() {
        const handed = ctx.handoff?.layers.find((l) => l.classList.contains("lp-gate"));
        if (!motion) return handed?.remove();
        let layer = handed;
        let hold;
        if (layer) {
          const since = performance.now() - (ctx.handoff.data.started ?? 0);
          hold = Math.max(HOLD.handoff, (ctx.handoff.data.seen ? 0 : HOLD.first) - since);
        } else {
          layer = ctx.layer("lp-gate lp-direct closing titled");
          layer.innerHTML = gatesHtml(game, esc, assets);
          hold = seenBefore() ? HOLD.repeat : HOLD.direct;
        }
        const gate = layer;
        let finished = false;
        const end = () => {
          if (finished) return;
          finished = true;
          gate.remove();
        };
        let opened = false;
        const open = () => {
          if (opened || finished) return;
          opened = true;
          gate.classList.add("opening");
          later(end, 1100);
        };
        later(open, hold);
        ctx.onCleanup(end);
        for (const type of ["pointerdown", "keydown", "wheel"]) ctx.listen(window, type, open, { passive: true, once: true });
      }
    },
  });
})();
