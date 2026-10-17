// Granblue Fantasy: Relink — «Небесный путь».
// Всё своё, по мотивам игры: небо и парящие острова Небесного мира, корабль экипажа, Chain Burst — косые панели
// с героями, которые врезаются в экран, — и косые бело-золотые панели её интерфейса:
//  · баннер на главной — полоса неба без рамки: сверху корона облаков, снизу море облаков, по нему тянется курс через
//    острова — по острову на условие, — корабль стоит у острова, до которого дошёл прогресс, на вымпеле счёт; логотип
//    парит там, где небо свободно от корабля. Выделение — облака расходятся, за логотипом раскрывается солнце, корабль
//    идёт по курсу к следующему острову, вымпел бьётся на ветру;
//  · при наведении на главную — тьма над списком расходится облаками от баннера, открывается вечернее небо;
//  · заставка — Chain Burst: косые панели с экипажем врезаются в экран сверху и снизу, поверх — название;
//    на странице панели разлетаются, и под ними открывается небо;
//  · страница — с палубы корабля: штурвал у руля (спица на условие, выполненные — золотые), логотип в небе; дальше
//    путь через небо: условия — косые панели на парящих островах по обе стороны курса, на выполненных островах
//    водружён флаг, невыполненные в облачной дымке; корабль у острова, до которого дошёл прогресс; в конце пути —
//    звёздный остров. Чек-листы — флажки на леере.
(() => {
  "use strict";

  const ID = "granblue-fantasy-relink";
  const CREW_WIDE = ["katalina", "rackam", "gran", "io", "eugen"];
  const CREW_NARROW = ["katalina", "gran", "io"];
  const SLIDE = 480; // панель врезается в экран
  const STAGGER = 65; // следующая — следом
  const HOLD = { direct: 950, repeat: 480, handoff: 520, first: 880 };
  // скалы островов: файл, пропорция (высота/ширина), уровень плато (доля высоты), на котором стоит панель
  const ROCKS = [
    ["island-wide", 543 / 1000, 0.25],
    ["island-wide-b", 657 / 1000, 0.4],
  ];

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
      const seen = sessionStorage.getItem("gf-chain") === "1";
      sessionStorage.setItem("gf-chain", "1");
      return seen;
    } catch {
      return false;
    }
  }

  // псевдослучайное число от номера — узор один и тот же при каждом заходе
  const rnd = (i, k) => ((Math.sin((i + 1) * 12.9898 + k * 78.233) * 43758.5453) % 1 + 1) % 1;
  const f1 = (v) => Math.round(v * 10) / 10;

  // плавный курс через точки (Catmull-Rom): по отрезку на промежуток, чтобы пройденная часть точно легла на весь путь
  function curveSegs(pts) {
    const segs = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] ?? pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] ?? p2;
      segs.push(
        ` C${f1(p1[0] + (p2[0] - p0[0]) / 6)} ${f1(p1[1] + (p2[1] - p0[1]) / 6)} ${f1(p2[0] - (p3[0] - p1[0]) / 6)} ${f1(p2[1] - (p3[1] - p1[1]) / 6)} ${f1(p2[0])} ${f1(p2[1])}`,
      );
    }
    return segs;
  }
  const pathD = (pts, segs) => (pts.length ? `M${f1(pts[0][0])} ${f1(pts[0][1])}${segs.join("")}` : "");

  const titleHtml = (game, esc, cls) =>
    game.logo ? `<img class="${cls}" src="${esc(game.logo)}" alt="">` : `<span class="${cls} gf-title-txt">${esc(game.title)}</span>`;

  function decoded(imgs, ms) {
    return Promise.race([Promise.all(imgs.map((im) => im.decode?.().catch(() => {}))), new Promise((r) => setTimeout(r, ms))]);
  }

  // флаг на древке: полотнище с ласточкиным хвостом и золотой каймой
  const FLAG = `<svg viewBox="0 0 60 40"><path class="cloth" d="M0 2 C14 -2 26 7 40 3 C47 1 53 1 60 3 L52 19 L60 35 C50 33 44 33 38 36 C25 41 13 32 0 36 Z"/><path class="trim" d="M0 6 C14 2 26 11 40 7 C47 5 53 5 58 6"/></svg>`;

  // ---------- острова на баннере: по одному на условие, волной по морю облаков ----------
  function banIsles(total) {
    return Array.from({ length: total }, (_, i) => {
      const k = total > 1 ? i / (total - 1) : 0.5;
      return {
        x: 8 + k * 84,
        y: 66 + Math.sin(i * 1.7 + 0.6) * 6 + (rnd(i, 1) - 0.5) * 4,
        s: 0.82 + rnd(i, 2) * 0.34,
        v: rnd(i, 3) < 0.62 ? "island" : "island-b",
      };
    });
  }

  // ---------- Chain Burst: косые панели во всю высоту, края параллельны, между ними — белая кромка ----------
  function chainScene(layer, assets, vw, vh, veil) {
    const crew = vw < 640 ? CREW_NARROW : CREW_WIDE;
    const n = crew.length;
    const slant = Math.round(Math.min(vh * 0.2, vw * 0.22));
    const W = (vw + slant) / n;
    layer.style.setProperty("--sl", `${slant}px`);
    layer.innerHTML = `
      ${veil ? `<i class="gf-chain-veil"></i>` : ""}
      ${crew
        .map((k, i) => {
          // крайние панели наполовину за краем экрана: лицо сдвинуть к видимой части
          const ix = i === n - 1 ? -0.42 : i === 0 ? 0.12 : 0;
          return `
        <div class="gf-cp ${i % 2 ? "up" : "down"}" style="left:${f1(-slant + i * W)}px;width:${f1(W + slant)}px;--i:${i};--o:${Math.abs(i - (n - 1) / 2)};--h:${Math.round((i - (n - 1) / 2) * 9)}deg;--ix:${ix}">
          <div class="gf-cp-in"><i class="gf-cp-burst"></i><span class="gf-cp-art"><img src="${assets}chain-${k}.webp" alt=""></span><i class="gf-cp-gloss"></i></div>
        </div>`;
        })
        .join("")}
      <i class="gf-chain-flash"></i>`;
    layer.gfCount = n;
    return [...layer.querySelectorAll("img")];
  }
  // экран закрыт уже на ~60% хода последней панели: дальше она только доводится
  const landMs = (n) => STAGGER * (n - 1) + Math.round(SLIDE * 0.62);
  // страница игры при первой отрисовке под заставкой декодирует крупные картинки, и кадры на ~0,35 с замирают.
  // Поэтому лента с названием встаёт раньше, а страница собирается, когда в заставке уже ничего не движется;
  // блик по панелям пробегает после этой паузы
  const TITLE_LEAD = 120;
  const BUILD_LAG = 300;
  const SHINE_AFTER = 450;

  GameThemes.register("granblue-fantasy-relink", {
    // ---------- главная: полоса неба между облаками ----------
    banner(b) {
      const A = b.assets;
      warm(["sky.webp", "cloud-band.webp", "island.webp", "island-b.webp", "airship.webp", ...CREW_WIDE.map((k) => `chain-${k}.webp`)].map((n) => A + n));
      warm([b.game.logo]);
      const { done, total } = b.progress;
      const pts = banIsles(total);
      const isles = pts
        .map(
          (p, i) =>
            `<i class="gf-ban-isle ${i < done ? "on" : ""}" style="left:${f1(p.x)}%;top:${f1(p.y)}%;--s:${p.s.toFixed(2)};--d:${(-rnd(i, 4) * 6).toFixed(2)}s"><img src="${A}${p.v}.webp" alt=""></i>`,
        )
        .join("");
      const rp = [[0, pts.length ? pts[0].y + 6 : 70], ...pts.map((p) => [p.x * 10, p.y])];
      const segs = curveSegs(rp);
      const k = Math.min(done, pts.length);
      const at = k > 0 ? pts[k - 1] : { x: 3, y: pts.length ? pts[0].y + 4 : 64 };
      // при выделении корабль проходит часть курса к следующему острову
      const to = pts[k] ?? { x: at.x + 5, y: at.y - 3 };
      const go = { x: (to.x - at.x) * 0.5, y: (to.y - at.y) * 0.5 };
      // логотип — там, где небо свободно от корабля
      const logoX = !total ? 50 : at.x < 46 ? 70 : 30;
      b.el.innerHTML = `
        <span class="gf-ban">
          <span class="gf-ban-scene" aria-hidden="true">
            <span class="gf-ban-air"><i class="gf-ban-sky"></i><i class="gf-ban-sun" style="left:${logoX}%"></i></span>
            <img class="gf-ban-sea s1" src="${A}cloud-band.webp" alt="">
            <img class="gf-ban-sea s2" src="${A}cloud-band.webp" alt="">
            <img class="gf-ban-sea s3" src="${A}cloud-band.webp" alt="">
            ${total ? `<svg class="gf-ban-route" viewBox="0 0 1000 100" preserveAspectRatio="none"><path class="all" d="${pathD(rp, segs)}"/><path class="past" d="${pathD(rp, segs.slice(0, done))}"/></svg>` : ""}
            ${isles}
            <img class="gf-ban-crown c1" src="${A}cloud-band.webp" alt="">
            <img class="gf-ban-crown c2" src="${A}cloud-band.webp" alt="">
            <img class="gf-ban-crown c3" src="${A}cloud-band.webp" alt="">
            <span class="gf-ban-logo" style="left:${logoX}%">${b.art.logo('class="gf-ban-logo-img" alt=""') || `<span class="gf-title-txt">${b.esc(b.game.title)}</span>`}</span>
            <span class="gf-ban-ship" style="left:${f1(at.x)}%;top:${f1(at.y)}%;--gx:${f1(go.x)};--gy:${f1(go.y)}">
              <span class="gf-ban-hull"><i class="gf-ban-wind"></i><img src="${A}airship.webp" alt=""></span>
              ${total ? `<span class="gf-ban-flag"><b>${done}</b><i>/</i>${total}</span>` : ""}
            </span>
          </span>
          <span class="gf-sr">${b.esc(b.game.title)}. ${total ? `Выполнено ${done} из ${total} условий закрытия` : "Условия ещё не заданы"}</span>
        </span>`;
    },

    // ---------- главная: при наведении тьма расходится облаками от баннера, открывается вечернее небо ----------
    stage(s) {
      const A = s.assets;
      const clouds = Array.from({ length: 10 }, (_, i) => {
        const ang = (i / 10) * Math.PI * 2 + rnd(i, 1) * 0.5;
        const R = 38 + rnd(i, 2) * 26;
        return `<img class="gf-st-cl" src="${A}${i % 3 === 2 ? "cloud-c" : "cloud-a"}.webp" alt="" style="--dx:${f1(Math.cos(ang) * R)}vmax;--dy:${f1(Math.sin(ang) * R * 0.62)}vmax;--s:${(0.7 + rnd(i, 3) * 0.6).toFixed(2)};--f:${rnd(i, 4) < 0.5 ? -1 : 1};--d:${Math.round(rnd(i, 5) * 160)}ms">`;
      }).join("");
      s.el.innerHTML = `
        <div class="gf-st" aria-hidden="true">
          <i class="gf-st-sky"></i>
          <i class="gf-st-dusk"></i>
          <i class="gf-st-rays"></i>
          <i class="gf-st-glow"></i>
          ${clouds}
          <span class="gf-st-ship"><img src="${A}airship.webp" alt=""></span>
          <i class="gf-st-vig"></i>
        </div>`;
    },

    // ---------- главная: Chain Burst — панели с экипажем врезаются в экран ----------
    cover(t) {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const layer = t.layer("gf-chain");
      const imgs = chainScene(layer, t.assets, vw, vh, false);
      const title = t.layer("gf-chain-title");
      title.innerHTML = `<i class="gf-chain-band"></i>${titleHtml(t.game, t.esc, "gf-chain-logo")}`;
      warm(["sky.webp", "rail-tile.webp", "filigree.webp", ...ROCKS.map((r) => `${r[0]}.webp`)].map((n) => t.assets + n));
      fetch(`data/conditions/${ID}.json`)
        .then((res) => (res.ok ? res.json() : null))
        .then((c) => warm((c?.groups ?? []).flatMap((gr) => gr.goals ?? []).slice(0, 4).map((g) => g.image)))
        .catch(() => {});
      t.data.seen = seenBefore();
      const n = layer.gfCount;
      // арт прогрет ещё в banner(): ждать декодирования почти не приходится
      return decoded([...imgs, ...title.querySelectorAll("img")], 120).then(
        () =>
          new Promise((resolve) => {
            t.data.started = performance.now();
            requestAnimationFrame(() => {
              void layer.offsetWidth;
              layer.classList.add("in");
            });
            setTimeout(() => {
              layer.classList.add("landed");
              title.classList.add("in");
            }, landMs(n) - TITLE_LEAD);
            setTimeout(resolve, landMs(n) + BUILD_LAG);
          }),
      );
    },

    // ---------- страница игры — с палубы через небо ----------
    page(ctx) {
      const { root, esc, assets, game } = ctx;
      const groups = (ctx.conditions?.groups ?? []).filter((gr) => (gr.goals ?? []).length);
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

      root.classList.add("gf");
      root.innerHTML = pageHtml();
      const voyage = root.querySelector(".gf-voyage");
      const isles = [...root.querySelectorAll(".gf-isle")];

      if (total) {
        chart();
        reveal();
        // картинки декодировать, пока экран закрыт: иначе на прокрутке они проявляются с запозданием
        later(() => root.querySelectorAll(".gf-shot img, .gf-gal img").forEach((im) => im.decode?.().catch(() => {})), 300);
      }
      sky();
      intro();

      return () => root.classList.remove("gf");

      // ---------- разметка ----------
      function pageHtml() {
        const nb = ctx.neighbors ?? {};
        const clouds = Array.from({ length: 9 }, (_, i) => {
          const near = i % 3 === 0;
          return `<img class="gf-cl ${near ? "near" : ""}" src="${assets}${i % 4 === 3 ? "cloud-c" : i % 4 === 1 ? "cloud-band" : "cloud-a"}.webp" alt="" style="--x:${f1(rnd(i, 1) * 100)}%;--w:${Math.round((near ? 420 : 240) + rnd(i, 2) * 260)}px;--o:${(near ? 0.95 : 0.55 + rnd(i, 3) * 0.3).toFixed(2)};--f:${rnd(i, 4) < 0.5 ? -1 : 1}">`;
        }).join("");
        return `
          <div class="gf-sky" aria-hidden="true"><i class="gf-sky-warm"></i>${clouds}</div>
          <div class="gf-page">
            <header class="gf-head">
              <a class="gf-back" href="#/"><span>К списку игр</span></a>
              <div class="gf-head-cloud" aria-hidden="true">
                <img class="c1" src="${assets}cloud-a.webp" alt="">
                <img class="c2" src="${assets}cloud-band.webp" alt="">
                <img class="c3" src="${assets}cloud-c.webp" alt="">
              </div>
              <h1 class="gf-logo">${game.logo ? `<img src="${esc(game.logo)}" alt="${esc(game.title)}">` : `<span class="gf-title-txt">${esc(game.title)}</span>`}</h1>
              <div class="gf-deck">
                <i class="gf-rail" aria-hidden="true"></i>
                ${total ? helmHtml() : ""}
              </div>
            </header>
            ${
              total
                ? `<main class="gf-voyage" aria-label="Условия закрытия">
                    <svg class="gf-route" aria-hidden="true"><path class="all"/><path class="past"/><g class="dots"></g></svg>
                    ${items.map((g, i) => isleHtml(g, i)).join("")}
                    <div class="gf-dest ${done === total ? "lit" : ""}" aria-hidden="true">
                      <i class="gf-dest-rays"></i>
                      <img class="gf-dest-isle" src="${assets}island.webp" alt="">
                      <img class="gf-dest-cloud" src="${assets}cloud-band.webp" alt="">
                      <i class="gf-dest-star"></i>
                    </div>
                    <div class="gf-ship" aria-hidden="true"><div class="gf-ship-bob"><img src="${assets}airship.webp" alt=""></div></div>
                  </main>`
                : `<main class="gf-voyage gf-empty"><p class="gf-empty-note">Условия закрытия для этой игры ещё не заданы.</p></main>`
            }
            <nav class="gf-nav" aria-label="Другие игры">
              ${nb.prev ? `<a class="prev" href="${esc(nb.prev.href)}"><span>${esc(nb.prev.title)}</span></a>` : ""}
              <a class="home" href="#/"><span>К списку игр</span></a>
              ${nb.next ? `<a class="next" href="${esc(nb.next.href)}"><span>${esc(nb.next.title)}</span></a>` : ""}
            </nav>
          </div>`;
      }

      // штурвал у руля: спица на условие, выполненные — золотые, остальные — тёмное дерево; в ступице счёт
      function helmHtml() {
        const spokes = Array.from({ length: total }, (_, i) => {
          const a = (i / total) * 360;
          return `<g class="sp ${items[i].done ? "on" : ""}" transform="rotate(${a.toFixed(2)})"><path d="M-3.6 -40 L-2.4 -90 L2.4 -90 L3.6 -40 Z"/><path class="knob" d="M-5 -91 C-7.2 -98 -4.6 -106 0 -115 C4.6 -106 7.2 -98 5 -91 Z"/></g>`;
        }).join("");
        const studs = Array.from({ length: total }, (_, i) => {
          const a = ((i + 0.5) / total) * Math.PI * 2;
          return `<circle class="stud" cx="${f1(Math.sin(a) * 74)}" cy="${f1(-Math.cos(a) * 74)}" r="2.6"/>`;
        }).join("");
        return `
          <div class="gf-helm" role="img" aria-label="Выполнено ${done} из ${total} условий закрытия">
            <i class="gf-helm-post" aria-hidden="true"></i>
            <svg class="gf-helm-wheel" viewBox="-124 -124 248 248" aria-hidden="true">
              <defs>
                <linearGradient id="gf-gold" x1="0" y1="-1" x2="0" y2="1"><stop offset="0" stop-color="#fff3c4"/><stop offset="0.45" stop-color="#e6b54a"/><stop offset="1" stop-color="#9a6716"/></linearGradient>
                <linearGradient id="gf-wood" x1="0" y1="-1" x2="0" y2="1"><stop offset="0" stop-color="#8a5a34"/><stop offset="1" stop-color="#4a2c16"/></linearGradient>
                <radialGradient id="gf-hub" cx="0.4" cy="0.35" r="0.7"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#f1e6cc"/></radialGradient>
              </defs>
              ${spokes}
              <circle class="rim-w" r="74"/>
              <circle class="rim" r="74"/>
              <circle class="rim2" r="64"/>
              ${studs}
              <circle class="hub" r="40"/>
              <circle class="hub2" r="34"/>
            </svg>
            <span class="gf-helm-count" aria-hidden="true"><b>${done}</b><i>/</i>${total}</span>
          </div>
          <p class="gf-plate" aria-hidden="true">условий закрытия</p>`;
      }

      function isleHtml(g, i) {
        const img = ctx.safeUrl(g.image);
        const fit = g.imageFit === "contain";
        const gallery = (g.gallery ?? []).map(ctx.safeUrl).filter(Boolean);
        const link = ctx.safeUrl(g.link);
        const cap = esc(g.title);
        const lists = (g.checklist ?? [])
          .filter((c) => (c.items ?? []).length)
          .map((c) => {
            const on = c.items.filter((it) => it.done).length;
            return `<div class="gf-bunting">
              <p class="gf-bunting-label">${c.label ? `${esc(c.label)} ` : ""}<b>${on}/${c.items.length}</b></p>
              <ul>${c.items.map((it, k) => `<li class="${it.done ? "on" : ""}" style="--r:${((rnd(i * 31 + k, 6) - 0.5) * 6).toFixed(1)}deg"><span>${esc(it.title)}</span></li>`).join("")}</ul>
            </div>`;
          })
          .join("");
        const [rock, ar, pl] = ROCKS[rnd(i, 7) < 0.55 ? 0 : 1];
        const flip = rnd(i, 9) < 0.5;
        return `
          <section class="gf-isle ${g.done ? "done" : "todo"} ${i % 2 ? "r" : "l"}" style="--d:${(-rnd(i, 5) * 7).toFixed(2)}s;--k:${(0.9 + rnd(i, 8) * 0.1).toFixed(3)};--off:${Math.round(rnd(i, 10) * 46)}px;--ar:${ar.toFixed(3)};--pl:${pl}" aria-label="№${esc(g.n)}${g.done ? ", выполнено" : ", не выполнено"}" data-gallery>
            <div class="gf-float">
              <img class="gf-rock ${flip ? "flip" : ""}" src="${assets}${rock}.webp" alt="" aria-hidden="true">
              ${g.done ? `<span class="gf-flag" aria-hidden="true"><i class="pole"></i>${FLAG}</span>` : ""}
              <article class="gf-card">
                <div class="gf-card-in">
                  ${img ? `<figure class="gf-shot ${fit ? "fit" : ""}"><img src="${esc(img)}" alt="" decoding="async" data-zoom data-caption="${cap}"></figure>` : ""}
                  <div class="gf-text">
                    <p class="gf-tag"><span class="gf-no">№<b>${esc(g.n)}</b></span>${g.done ? `<span class="gf-stars" aria-hidden="true"><i></i><i></i><i></i></span>` : ""}</p>
                    <h2 class="gf-title">${cap}</h2>
                    ${g.note ? `<blockquote class="gf-note">${esc(g.note)}</blockquote>` : ""}
                    ${g.details ? `<p class="gf-details">${esc(g.details)}</p>` : ""}
                    ${lists}
                    ${gallery.length ? `<div class="gf-gal">${gallery.map((u) => `<img src="${esc(u)}" alt="" decoding="async" data-zoom data-caption="${cap}">`).join("")}</div>` : ""}
                    ${link ? `<a class="gf-link" href="${esc(link)}" target="_blank" rel="noopener"><span>Подробнее&nbsp;↗</span></a>` : ""}
                  </div>
                </div>
              </article>
              <i class="gf-fil tr" aria-hidden="true"></i><i class="gf-fil bl" aria-hidden="true"></i>
              ${g.done ? "" : `<div class="gf-mist" aria-hidden="true"><img class="m1" src="${assets}cloud-c.webp" alt=""><img class="m2" src="${assets}cloud-a.webp" alt=""><img class="m3" src="${assets}cloud-c.webp" alt=""></div>`}
            </div>
          </section>`;
      }

      // ---------- карта: острова по обе стороны курса, курс, корабль и звёздный остров ----------
      function chart() {
        const svg = voyage.querySelector(".gf-route");
        const all = svg.querySelector(".all");
        const past = svg.querySelector(".past");
        const dots = svg.querySelector(".dots");
        const ship = voyage.querySelector(".gf-ship");
        const dest = voyage.querySelector(".gf-dest");
        const cards = isles.map((el) => el.querySelector(".gf-card"));
        let raf = 0;
        const place = () => {
          raf = 0;
          const W = voyage.clientWidth;
          const wide = W >= 820;
          voyage.classList.toggle("wide", wide);
          const top0 = parseFloat(getComputedStyle(voyage).paddingTop) || 0;
          let end;
          // на широком экране острова — в шахматном порядке: следующий начинается с середины предыдущего
          if (wide) {
            let yL = top0;
            let yR = top0;
            let prevTop = -1e9;
            let prevH = 0;
            isles.forEach((el, i) => {
              const right = i % 2 === 1;
              const h = cards[i].offsetHeight;
              const rock = el.querySelector(".gf-rock");
              const below = Math.max(0, rock.offsetTop + rock.offsetHeight - h);
              const top = Math.max(right ? yR : yL, prevTop + Math.min(prevH * 0.52, 300));
              el.style.top = `${Math.round(top)}px`;
              const bottom = top + h + below * 0.72 + 70;
              if (right) yR = bottom;
              else yL = bottom;
              prevTop = top;
              prevH = h;
            });
            const lastRight = (isles.length - 1) % 2 === 1;
            const dTop = Math.max(prevTop + prevH * 0.5, (lastRight ? yL : yR) - 40);
            const dX = lastRight ? W * 0.26 : W * 0.74;
            dest.style.left = `${Math.round(dX - dest.offsetWidth / 2)}px`;
            dest.style.top = `${Math.round(dTop)}px`;
            end = Math.max(yL, yR, dTop + dest.offsetHeight + 40);
            voyage.style.height = `${Math.round(end)}px`;
          } else {
            isles.forEach((el) => (el.style.top = ""));
            dest.style.top = "";
            dest.style.left = "";
            voyage.style.height = "";
          }
          // флаг ставится с внешней стороны острова, а если там край окна — с внутренней
          isles.forEach((el) => {
            if (!el.classList.contains("done")) return;
            let inner = false;
            if (wide) {
              const r = el.getBoundingClientRect();
              const room = el.classList.contains("r") ? window.innerWidth - r.right : r.left;
              inner = room < r.width * 0.045 + 84;
            }
            el.classList.toggle("inner", inner);
          });
          const H = voyage.offsetHeight;
          const tops = [];
          // на телефоне курс петляет в просветах между островами, за панелями
          const helm = root.querySelector(".gf-helm");
          const hr = helm?.getBoundingClientRect();
          const vr = voyage.getBoundingClientRect();
          const pts = [[hr ? hr.left + hr.width / 2 - vr.left : W * 0.5, 0]];
          cards.forEach((c, i) => {
            const x = isles[i].offsetLeft + c.offsetLeft;
            const y = isles[i].offsetTop + c.offsetTop;
            tops.push(y);
            if (wide) pts.push([i % 2 ? x - 40 : x + c.offsetWidth + 40, y + Math.min(c.offsetHeight * 0.36, 170)]);
            else pts.push([i % 2 ? W * 0.74 : W * 0.26, y - 46]);
          });
          const destPt = [dest.offsetLeft + dest.offsetWidth / 2, dest.offsetTop + dest.offsetHeight * 0.2];
          pts.push(destPt);
          svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
          svg.setAttribute("width", W);
          svg.setAttribute("height", H);
          const segs = curveSegs(pts);
          all.setAttribute("d", pathD(pts, segs));
          past.setAttribute("d", pathD(pts, segs.slice(0, done === total ? segs.length : done)));
          dots.innerHTML = pts
            .slice(1, -1)
            .map((p, i) => `<g class="${items[i].done ? "on" : ""}" transform="translate(${f1(p[0])} ${f1(p[1])})"><path d="M0 -9 L2.4 -2.4 L9 0 L2.4 2.4 L0 9 L-2.4 2.4 L-9 0 L-2.4 -2.4 Z"/></g>`)
            .join("");
          // корабль — у острова, до которого дошёл прогресс: в просвете между островами, носом к другому борту;
          // на телефоне — в просвете над панелью острова
          const k = Math.min(done, total);
          const here = pts[k];
          let sx = here[0];
          let sy = here[1];
          let flip = false;
          if (wide) {
            // в середине просвета между колоннами, на высоте своего острова, носом к следующему
            const next = pts[k + 1] ?? destPt;
            if (k > 0) sx = W / 2;
            flip = next[0] < sx;
          } else {
            sy = k === 0 ? here[1] : tops[k - 1] - 10;
            sx = k === 0 ? here[0] : here[0];
            flip = k > 0 && (k - 1) % 2 === 1;
          }
          ship.style.left = `${f1(sx)}px`;
          ship.style.top = `${f1(sy)}px`;
          ship.classList.toggle("gf-flip", flip);
        };
        const ask = () => {
          if (!raf) raf = requestAnimationFrame(place);
        };
        place();
        ctx.onCleanup(() => cancelAnimationFrame(raf));
        if ("ResizeObserver" in window) {
          const ro = new ResizeObserver(ask);
          ro.observe(voyage);
          cards.forEach((c) => ro.observe(c));
          ctx.onCleanup(() => ro.disconnect());
        } else ctx.listen(window, "resize", ask);
        document.fonts?.ready.then(() => root.isConnected && ask());
      }

      // ---------- острова всплывают из облаков, когда попадают в кадр; на выполненных разворачивается флаг ----------
      function reveal() {
        if (!motion || !("IntersectionObserver" in window)) {
          isles.forEach((el) => el.classList.add("seen"));
          return;
        }
        isles.forEach((el) => el.getBoundingClientRect().top < window.innerHeight && el.classList.add("seen"));
        root.classList.add("gf-rise");
        const io = new IntersectionObserver(
          (entries) => {
            for (const e of entries) {
              if (!e.isIntersecting) continue;
              e.target.classList.add("seen");
              io.unobserve(e.target);
            }
          },
          { rootMargin: "0px 0px -6% 0px", threshold: 0.02 },
        );
        later(() => isles.forEach((el) => io.observe(el)), ctx.handoff ? 900 : 1100);
        ctx.onCleanup(() => io.disconnect());
      }

      // ---------- небо: облака плывут на разной глубине, штурвал крутится, к концу пути небо уходит в закат ----------
      function sky() {
        const layer = root.querySelector(".gf-sky");
        const warmEl = layer.querySelector(".gf-sky-warm");
        const clouds = [...layer.querySelectorAll(".gf-cl")].map((el, i) => ({
          el,
          base: rnd(i, 9),
          depth: el.classList.contains("near") ? 0.55 : 0.12 + rnd(i, 10) * 0.25,
          sp: 0.4 + rnd(i, 11) * 0.8,
          ph: rnd(i, 12) * 6.28,
        }));
        const wheel = root.querySelector(".gf-helm-wheel");
        const apply = (now, y) => {
          const vh = window.innerHeight;
          const max = Math.max(1, document.documentElement.scrollHeight - vh);
          warmEl.style.opacity = Math.min(1, y / max).toFixed(3);
          const span = vh + 520;
          for (const c of clouds) {
            const yy = ((((c.base * span - y * c.depth) % span) + span) % span) - 260;
            const xx = Math.sin(now * 0.00007 * c.sp + c.ph) * 34;
            c.el.style.transform = `translate3d(${xx.toFixed(1)}px, ${yy.toFixed(1)}px, 0) scaleX(var(--f))`;
          }
          if (wheel) wheel.style.transform = `rotate(${(y * 0.09).toFixed(2)}deg)`;
        };
        // без анимации облака и штурвал стоят на месте, к закату небо всё равно теплеет
        if (!motion) {
          apply(0, 0);
          const tint = () => {
            const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
            warmEl.style.opacity = Math.min(1, window.scrollY / max).toFixed(3);
          };
          tint();
          ctx.listen(window, "scroll", tint, { passive: true });
          return;
        }
        apply(performance.now(), window.scrollY);
        ctx.loop((now) => apply(now, window.scrollY));
      }

      // ---------- вход: панели Chain Burst разлетаются, и под ними открывается небо ----------
      function intro() {
        const handed = ctx.handoff?.layers.find((l) => l.classList.contains("gf-chain"));
        const handedTitle = ctx.handoff?.layers.find((l) => l.classList.contains("gf-chain-title"));
        if (!motion) {
          handed?.remove();
          handedTitle?.remove();
          return;
        }
        let layer = handed;
        let title = handedTitle;
        let hold;
        if (layer?.gfCount && title) {
          const since = performance.now() - (ctx.handoff.data.started ?? performance.now());
          hold = Math.max(HOLD.handoff, landMs(layer.gfCount) + (ctx.handoff.data.seen ? HOLD.repeat : HOLD.first) - since);
          layer.classList.add("landed");
          const H = layer;
          later(() => H.classList.add("shine"), SHINE_AFTER);
        } else {
          // прямой заход: экран в белой вспышке, панели врезаются в неё, поверх — название
          layer?.remove();
          title?.remove();
          layer = ctx.layer("gf-chain");
          const imgs = chainScene(layer, assets, window.innerWidth, window.innerHeight, true);
          title = ctx.layer("gf-chain-title");
          title.innerHTML = `<i class="gf-chain-band"></i>${titleHtml(game, esc, "gf-chain-logo")}`;
          const L = layer;
          const T = title;
          const start = performance.now();
          decoded([...imgs, ...T.querySelectorAll("img")], 350).then(() => {
            later(() => {
              if (!L.isConnected) return;
              void L.offsetWidth;
              L.classList.add("in");
              later(() => {
                L.classList.add("landed", "shine");
                T.classList.add("in");
              }, landMs(L.gfCount));
            }, Math.max(0, BUILD_LAG + 80 - (performance.now() - start)));
          });
          hold = BUILD_LAG + 80 + landMs(layer.gfCount) + 120 + (seenBefore() ? HOLD.repeat : HOLD.direct);
        }
        const L = layer;
        const T = title;
        let opened = false;
        const open = () => {
          if (opened) return;
          opened = true;
          T.classList.add("out");
          later(() => L.classList.add("landed", "out"), 140);
          later(() => T.remove(), 900);
          later(() => L.remove(), 1500);
        };
        later(open, hold);
        ctx.onCleanup(() => {
          L.remove();
          T.remove();
        });
        for (const type of ["pointerdown", "keydown", "wheel"]) ctx.listen(window, type, open, { passive: true, once: true });
      }
    },
  });
})();
