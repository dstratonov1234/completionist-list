// Chained Beasts — «Вердикт толпы».
// Всё своё, по мотивам игры: комикс-тушь на малиновом, гладиаторы-звери на цепях, рваные знамёна, которыми толпа
// судит бой (Variety / Tempo / Carnage и лавровый венок со счётом), броски толпы на арену:
//  · баннер на главной — один широкий мазок малиновой краски: в нём арена и гладиаторы, слева логотип, от него
//    провисает цепь — звено на условие (выполненные раскалены добела) — к лавровому венку со счётом. Выделение —
//    толпа вскакивает над краем мазка, цепь рывком натягивается, гладиаторы подаются вперёд, летят розы;
//  · при наведении на главную — арена: сверху и снизу поднимаются трибуны, свет падает на баннер, толпа бросает розы;
//  · заставка — экран закрашивают широкие мазки кистью, поверх с ударом падает логотип; на странице мазки срывает;
//  · страница — знамёна под балками арены, каждое на своих цепях и качается: первое — знамя игры с лавровым венком
//    (лист на условие, выполненные — золотые), дальше — по знамени на условие. Выполненные — с золотыми лентами по
//    краям и венком внизу, толпа бросает им розы, когда они показываются; невыполненные — тёмные и пустые.
(() => {
  "use strict";

  const ID = "chained-beasts";
  const STROKES = 5;
  const SLIDE = 430; // мазок проходит экран
  const STAGGER = 75; // следующий — следом
  const TITLE_LEAD = 60;
  const BUILD_LAG = 320; // страница собирается под заставкой, когда в ней уже ничего не движется
  const HOLD = { direct: 820, repeat: 420, handoff: 380, first: 700 };

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
      const seen = sessionStorage.getItem("cb-arena") === "1";
      sessionStorage.setItem("cb-arena", "1");
      return seen;
    } catch {
      return false;
    }
  }

  // псевдослучайное число от номера — узор один и тот же при каждом заходе
  const rnd = (i, k) => ((Math.sin((i + 1) * 12.9898 + k * 78.233) * 43758.5453) % 1 + 1) % 1;
  const f1 = (v) => Math.round(v * 10) / 10;

  function decoded(imgs, ms) {
    return Promise.race([Promise.all(imgs.map((im) => im.decode?.().catch(() => {}))), new Promise((r) => setTimeout(r, ms))]);
  }

  const logoHtml = (game, esc, cls, alt = "") =>
    game.logo ? `<img class="${cls}" src="${esc(game.logo)}" alt="${alt}">` : `<span class="${cls} cb-title-txt">${esc(game.title)}</span>`;

  // лавровый венок прогресса: по листу на условие, по двум ветвям снизу вверх; выполненные — золотые
  function laurelSvg(items) {
    const n = items.length;
    const left = Math.ceil(n / 2);
    const s = Math.max(0.75, Math.min(1.45, 14 / n));
    const r = 80;
    const A0 = 102; // низ ветки, градусы
    const A1 = -48; // верх ветки
    const leaf = "M0 0 C6 -6 8 -16 0 -26 C-8 -16 -6 -6 0 0 Z";
    const pt = (side, a) => [side * Math.cos((a * Math.PI) / 180) * r, Math.sin((a * Math.PI) / 180) * r];
    const leaves = items
      .map((g, i) => {
        const side = i < left ? -1 : 1;
        const k = side < 0 ? i : i - left;
        const m = side < 0 ? left : n - left;
        const t = m > 1 ? k / (m - 1) : 0.5;
        const a = A0 + (A1 - A0) * (0.1 + t * 0.9);
        const [x, y] = pt(side, a);
        const base = side < 0 ? -a : a;
        // пара листьев по обе стороны ветки, к её концу
        return [34, -34]
          .map((tilt) => `<path class="${g.done ? "on" : ""}" transform="translate(${f1(x)} ${f1(y)}) rotate(${f1(base + side * tilt)}) scale(${s.toFixed(2)})" d="${leaf}"/>`)
          .join("");
      })
      .join("");
    const tip = (side) => {
      const [x, y] = pt(side, A1 - 6);
      return `<path class="tip" transform="translate(${f1(x)} ${f1(y)}) rotate(${f1(side < 0 ? -(A1 - 6) : A1 - 6)}) scale(${s.toFixed(2)})" d="${leaf}"/>`;
    };
    const p = (side, a) => pt(side, a).map(f1).join(" ");
    return `<svg class="cb-laurel" viewBox="-120 -120 240 240" aria-hidden="true"><path class="stem" d="M${p(-1, A0)} A${r} ${r} 0 0 1 ${p(-1, A1 - 4)} M${p(1, A0)} A${r} ${r} 0 0 0 ${p(1, A1 - 4)}"/>${leaves}${tip(-1)}${tip(1)}</svg>`;
  }

  // ---------- заставка: мазки кистью во всю ширину, по очереди с разных сторон ----------
  function wipeScene(layer, assets, vh) {
    layer.innerHTML =
      `<i class="cb-wipe-base"></i>` +
      Array.from({ length: STROKES }, (_, i) => {
        const y = ((i + 0.5) / STROKES) * 100 + (rnd(i, 1) - 0.5) * 8;
        const rot = (i % 2 ? 1 : -1) * (4 + rnd(i, 2) * 8);
        const from = i % 2 ? 1 : -1;
        return `<img class="cb-stroke ${i % 2 ? "ink" : "red"}" src="${assets}brush-${i % 2 ? "ink" : "crimson"}.webp" alt="" style="top:${f1(y)}%;--h:${Math.round(vh * (0.46 + rnd(i, 8) * 0.14))}px;--r:${f1(rot)}deg;--from:${from};--i:${i};--o:${f1(Math.abs(i - (STROKES - 1) / 2))}">`;
      }).join("") +
      `<i class="cb-wipe-flash"></i>`;
    return [...layer.querySelectorAll("img")];
  }
  const landMs = () => STAGGER * (STROKES - 1) + Math.round(SLIDE * 0.7);

  GameThemes.register("chained-beasts", {
    // ---------- главная: мазок краски с ареной, цепью и венком ----------
    banner(b) {
      const A = b.assets;
      warm(["brush-crimson.webp", "brush-ink.webp", "crowd.webp", "laurel.webp", "rose.webp"].map((n) => A + n));
      warm([b.game.hero, b.game.logo]);
      // шрифты темы — заранее: без заставки (reduced motion) их подмена была бы видна
      for (const f of ['16px "Rubik Dirt"', '16px "Pangolin"']) document.fonts?.load(f).catch(() => {});
      const { done, total } = b.progress;
      // цепь провисает между логотипом и венком; натянутая — почти прямая
      const n = Math.max(total, 1);
      const links = Array.from({ length: n }, (_, i) => {
        const t = n > 1 ? i / (n - 1) : 0.5;
        const sag = 46;
        const W = 420;
        const y0 = sag * 4 * t * (1 - t);
        const a0 = (Math.atan((sag * 4 * (1 - 2 * t)) / W) * 180) / Math.PI;
        const y1 = y0 * 0.08 - 4;
        const a1 = a0 * 0.08;
        return `<i class="cb-link ${i < done ? "on" : ""}" style="left:${f1(t * 100)}%;--y0:${f1(y0)}px;--a0:${f1(a0)}deg;--y1:${f1(y1)}px;--a1:${f1(a1)}deg;--d:${Math.round(Math.abs(t - 0.5) * 120)}ms"></i>`;
      }).join("");
      const roses = Array.from({ length: 7 }, (_, i) => `<img class="cb-ban-rose" src="${A}rose.webp" alt="" style="--x:${f1(10 + rnd(i, 3) * 78)}%;--dx:${Math.round((rnd(i, 4) - 0.5) * 180)}px;--dy:${Math.round(-70 - rnd(i, 5) * 80)}px;--rot:${Math.round((rnd(i, 6) - 0.5) * 720)}deg;--d:${Math.round(rnd(i, 7) * 500)}ms">`).join("");
      b.el.innerHTML = `
        <span class="cb-ban">
          <span class="cb-ban-crowd" aria-hidden="true"><i></i></span>
          <span class="cb-ban-stroke" aria-hidden="true">
            ${b.art.hero('class="cb-ban-hero" alt=""')}
            <i class="cb-ban-tint"></i>
            <i class="cb-ban-flash"></i>
          </span>
          <span class="cb-ban-logo" aria-hidden="true">${logoHtml(b.game, b.esc, "cb-ban-logo-img")}</span>
          ${total ? `<span class="cb-ban-chain" aria-hidden="true" style="--n:${n}">${links}</span>
          <span class="cb-ban-score" aria-hidden="true"><img src="${A}laurel.webp" alt=""><b>${done}</b><i>/${total}</i></span>` : ""}
          <span class="cb-ban-roses" aria-hidden="true">${roses}</span>
          <span class="cb-sr">${b.esc(b.game.title)}. ${total ? `Выполнено ${done} из ${total} условий закрытия` : "Условия ещё не заданы"}</span>
        </span>`;
    },

    // ---------- главная: при наведении — арена, трибуны и броски толпы ----------
    stage(s) {
      const A = s.assets;
      const throws = Array.from({ length: 14 }, (_, i) => `<span class="cb-st-throw" style="--x0:${f1(rnd(i, 1) * 100)}vw;--tx:${f1((rnd(i, 2) - 0.5) * 70)}vw;--peak:${Math.round(-30 - rnd(i, 3) * 30)}vh;--t:${(2.2 + rnd(i, 4) * 1.6).toFixed(2)}s;--d:${(-rnd(i, 5) * 3.8).toFixed(2)}s;--rot:${Math.round(360 + rnd(i, 6) * 720)}deg"><span><img src="${A}rose.webp" alt=""></span></span>`).join("");
      s.el.innerHTML = `
        <div class="cb-st" aria-hidden="true">
          <i class="cb-st-red"></i>
          <i class="cb-st-beam"></i>
          <div class="cb-st-tier far"></div>
          <div class="cb-st-tier near"></div>
          ${throws}
          <i class="cb-st-vig"></i>
        </div>`;
    },

    // ---------- главная: экран закрашивают мазки кистью ----------
    cover(t) {
      const vh = window.innerHeight;
      const layer = t.layer("cb-wipe");
      const imgs = wipeScene(layer, t.assets, vh);
      const title = t.layer("cb-wipe-title");
      title.innerHTML = `<span class="cb-wipe-shake">${logoHtml(t.game, t.esc, "cb-wipe-logo")}</span>`;
      warm(["cloth.webp", "beam.webp", "laurel.webp"].map((n) => t.assets + n));
      fetch(`data/conditions/${ID}.json`)
        .then((res) => (res.ok ? res.json() : null))
        .then((c) => warm((c?.groups ?? []).flatMap((gr) => gr.goals ?? []).slice(0, 6).map((g) => g.image)))
        .catch(() => {});
      t.data.seen = seenBefore();
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
            }, landMs() - TITLE_LEAD);
            setTimeout(resolve, landMs() + BUILD_LAG);
          }),
      );
    },

    // ---------- страница игры — знамёна под балками арены ----------
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

      root.classList.add("cb");
      root.innerHTML = pageHtml();
      const rack = root.querySelector(".cb-rack");
      const flags = [...root.querySelectorAll(".cb-flag")];

      layout();
      pictures();
      if (motion) swing();
      if (total) {
        cheer();
        // картинки декодировать, пока экран закрыт: иначе на прокрутке они проявляются с запозданием
        later(() => root.querySelectorAll(".cb-pic img, .cb-gal img").forEach((im) => im.decode?.().catch(() => {})), 300);
      }
      intro();

      return () => root.classList.remove("cb");

      // ---------- разметка ----------
      function pageHtml() {
        const nb = ctx.neighbors ?? {};
        return `
          <div class="cb-wall" aria-hidden="true"><i class="cb-wall-dark"></i><div class="cb-wall-crowd"></div></div>
          <div class="cb-page">
            <a class="cb-back" href="#/"><span>К списку игр</span></a>
            <main class="cb-rack" aria-label="Условия закрытия">
              ${titleFlag()}
              ${total ? items.map((g, i) => goalFlag(g, i)).join("") : `<article class="cb-flag goal todo empty" style="--len:46px"><div class="cb-swing">${hangers()}<div class="cb-cloth"><p class="cb-empty">Условия закрытия для этой игры ещё не заданы.</p></div></div></article>`}
            </main>
            <nav class="cb-nav" aria-label="Другие игры">
              <i class="cb-beam" aria-hidden="true"></i>
              <div class="cb-nav-row">
                ${nb.prev ? `<span class="cb-nav-wrap"><a class="cb-pennant prev" href="${esc(nb.prev.href)}"><span>${esc(nb.prev.title)}</span></a></span>` : ""}
                <span class="cb-nav-wrap"><a class="cb-pennant home" href="#/"><span>К списку игр</span></a></span>
                ${nb.next ? `<span class="cb-nav-wrap"><a class="cb-pennant next" href="${esc(nb.next.href)}"><span>${esc(nb.next.title)}</span></a></span>` : ""}
              </div>
            </nav>
          </div>`;
      }

      function hangers() {
        return `<i class="cb-chain l" aria-hidden="true"></i><i class="cb-chain r" aria-hidden="true"></i><i class="cb-rod" aria-hidden="true"></i>`;
      }

      // знамя игры: логотип и лавровый венок прогресса
      function titleFlag() {
        return `
          <article class="cb-flag title" style="--len:34px">
            <div class="cb-swing">
              ${hangers()}
              <div class="cb-cloth">
                <h1 class="cb-logo">${logoHtml(game, esc, "cb-logo-img", esc(game.title))}</h1>
                ${
                  total
                    ? `<div class="cb-score" role="img" aria-label="Выполнено ${done} из ${total} условий закрытия">
                        ${laurelSvg(items)}
                        <span class="cb-score-num" aria-hidden="true"><b>${done}</b><i>/${total}</i></span>
                      </div>
                      <p class="cb-score-cap" aria-hidden="true">условий закрытия</p>`
                    : ""
                }
              </div>
            </div>
          </article>`;
      }

      function goalFlag(g, i) {
        const img = ctx.safeUrl(g.image);
        const gallery = (g.gallery ?? []).map(ctx.safeUrl).filter(Boolean);
        const link = ctx.safeUrl(g.link);
        const cap = esc(g.title);
        const lists = (g.checklist ?? [])
          .filter((c) => (c.items ?? []).length)
          .map((c) => {
            const on = c.items.filter((it) => it.done).length;
            return `<div class="cb-list">
              <p class="cb-list-label">${c.label ? `${esc(c.label)} ` : ""}<b>${on}/${c.items.length}</b></p>
              <ul>${c.items.map((it) => `<li class="${it.done ? "on" : ""}">${esc(it.title)}</li>`).join("")}</ul>
            </div>`;
          })
          .join("");
        return `
          <article class="cb-flag goal ${g.done ? "done" : "todo"}" style="--len:${Math.round(26 + rnd(i, 1) * 52)}px" aria-label="№${esc(g.n)}${g.done ? ", выполнено" : ", не выполнено"}" data-gallery>
            <div class="cb-swing">
              ${hangers()}
              <span class="cb-hex" aria-hidden="true">${esc(g.n)}</span>
              <div class="cb-cloth">
                ${img ? `<figure class="cb-pic"><img src="${esc(img)}" alt="" decoding="async" data-zoom data-caption="${cap}"></figure>` : ""}
                <h2 class="cb-title">${cap}</h2>
                ${g.note ? `<blockquote class="cb-note">${esc(g.note)}</blockquote>` : ""}
                ${g.details ? `<p class="cb-details">${esc(g.details)}</p>` : ""}
                ${lists}
                ${gallery.length ? `<div class="cb-gal">${gallery.map((u) => `<img src="${esc(u)}" alt="" decoding="async" data-zoom data-caption="${cap}">`).join("")}</div>` : ""}
                ${link ? `<a class="cb-link-out" href="${esc(link)}" target="_blank" rel="noopener">Подробнее&nbsp;↗</a>` : ""}
                <span class="cb-verdict" aria-hidden="true"><img src="${assets}laurel.webp" alt=""><i></i></span>
              </div>
            </div>
          </article>`;
      }

      // ---------- ряды под балками: знамя игры шире, на телефоне — по одному ----------
      function layout() {
        let mode = "";
        const place = () => {
          const W = rack.clientWidth;
          const next = W >= 1080 ? "wide" : W >= 720 ? "mid" : W >= 540 ? "pair" : "narrow";
          if (next === mode) return;
          mode = next;
          const slots = { wide: 4, mid: 3, pair: 2, narrow: 1 }[mode];
          const rows = [];
          let row = [];
          let used = 0;
          for (const f of flags) {
            const span = f.classList.contains("title") ? Math.min(2, slots) : 1;
            if (used + span > slots) {
              rows.push(row);
              row = [];
              used = 0;
            }
            row.push(f);
            used += span;
            f.style.setProperty("--span", span);
          }
          if (row.length) rows.push(row);
          const frag = document.createDocumentFragment();
          rows.forEach((r) => {
            const el = document.createElement("div");
            el.className = "cb-row";
            el.style.setProperty("--slots", slots);
            el.innerHTML = `<i class="cb-beam" aria-hidden="true"></i><div class="cb-hang"></div>`;
            el.querySelector(".cb-hang").append(...r);
            frag.append(el);
          });
          rack.replaceChildren(frag);
        };
        place();
        if ("ResizeObserver" in window) {
          const ro = new ResizeObserver(() => place());
          ro.observe(rack);
          ctx.onCleanup(() => ro.disconnect());
        }
      }

      // квадратные иконки — в квадратном окне, скриншоты — в широком
      function pictures() {
        root.querySelectorAll(".cb-pic img").forEach((im) => {
          const mark = () => im.naturalWidth && im.parentElement.classList.toggle("wide", im.naturalWidth / im.naturalHeight > 1.25);
          if (im.complete) mark();
          else ctx.listen(im, "load", mark);
        });
      }

      // ---------- знамёна качаются: от ветра, от прокрутки и когда их задевают курсором ----------
      function swing() {
        const P = flags.map((el, i) => ({
          el,
          sw: el.querySelector(".cb-swing"),
          a: 0,
          v: 0,
          ph: rnd(i, 3) * 6.28,
          sp: 0.6 + rnd(i, 4) * 0.5,
          k: el.classList.contains("title") ? 0.5 : 1,
        }));
        let lastY = window.scrollY;
        let wind = 0;
        ctx.listen(window, "scroll", () => {
          const y = window.scrollY;
          wind = Math.max(-3, Math.min(3, wind + (y - lastY) * 0.02));
          lastY = y;
        }, { passive: true });
        if (ctx.finePointer) {
          for (const p of P) {
            ctx.listen(p.el, "pointermove", (e) => {
              p.v += Math.max(-0.6, Math.min(0.6, e.movementX * 0.035)) * p.k;
            });
          }
        }
        // толчок от броска толпы
        for (const p of P) p.el.cbPush = (f) => (p.v += f * p.k);
        ctx.loop((now, dt) => {
          const s = Math.min(dt, 50) / 16.7;
          wind *= Math.pow(0.9, s);
          for (const p of P) {
            const breeze = Math.sin(now * 0.0011 * p.sp + p.ph) * 0.5 * p.k + wind * 0.4 * p.k;
            p.v += (-(p.a - breeze) * 0.02 - p.v * 0.045) * s;
            p.a += p.v * s;
            p.sw.style.transform = `rotate(${p.a.toFixed(3)}deg)`;
          }
        });
      }

      // ---------- выполненное знамя, впервые показавшись, получает розы от толпы ----------
      function cheer() {
        const doneF = flags.filter((f) => f.classList.contains("done"));
        if (!motion || !("IntersectionObserver" in window)) return;
        const layer = ctx.layer("cb-throws");
        const io = new IntersectionObserver(
          (entries) => {
            for (const e of entries) {
              if (!e.isIntersecting) continue;
              io.unobserve(e.target);
              throwRoses(e.target, layer);
            }
          },
          { threshold: 0.35 },
        );
        later(() => doneF.forEach((f) => io.observe(f)), ctx.handoff ? 1100 : 1400);
        ctx.onCleanup(() => io.disconnect());
      }

      function throwRoses(flag, layer) {
        const r = flag.querySelector(".cb-cloth").getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        for (let i = 0; i < 4; i++) {
          const el = document.createElement("img");
          el.className = "cb-throw";
          el.src = `${assets}rose.webp`;
          el.alt = "";
          layer.append(el);
          const x0 = Math.max(20, Math.min(vw - 20, r.left + r.width / 2 + (Math.random() - 0.5) * vw * 0.6));
          const x1 = r.left + r.width * (0.2 + Math.random() * 0.6);
          const y1 = r.top + r.height * (0.25 + Math.random() * 0.5);
          const peak = Math.min(y1, vh * 0.5) - 80 - Math.random() * 90;
          const spin = (Math.random() - 0.5) * 900;
          const T = 900 + Math.random() * 300;
          const d = i * 120 + Math.random() * 80;
          const anim = el.animate(
            [
              { transform: `translate(${x0}px, ${vh + 40}px) rotate(0deg)`, opacity: 1 },
              { transform: `translate(${(x0 + x1) / 2}px, ${peak}px) rotate(${spin / 2}deg)`, opacity: 1, easing: "cubic-bezier(.4,0,1,1)" },
              { transform: `translate(${x1}px, ${y1}px) rotate(${spin}deg)`, opacity: 1, offset: 0.78 },
              { transform: `translate(${x1 + (Math.random() - 0.5) * 30}px, ${y1 + 70}px) rotate(${spin + 40}deg)`, opacity: 0 },
            ],
            { duration: T, delay: d, easing: "cubic-bezier(.2,.6,.4,1)", fill: "both" },
          );
          later(() => flag.cbPush?.((Math.random() - 0.5) * 2.4), d + T * 0.78);
          anim.onfinish = () => el.remove();
        }
      }

      // ---------- вход: мазки срывает с экрана ----------
      function intro() {
        const handed = ctx.handoff?.layers.find((l) => l.classList.contains("cb-wipe"));
        const handedTitle = ctx.handoff?.layers.find((l) => l.classList.contains("cb-wipe-title"));
        if (!motion) {
          handed?.remove();
          handedTitle?.remove();
          return;
        }
        let layer = handed;
        let title = handedTitle;
        let hold;
        if (layer && title) {
          const since = performance.now() - (ctx.handoff.data.started ?? performance.now());
          hold = Math.max(HOLD.handoff, landMs() + (ctx.handoff.data.seen ? HOLD.repeat : HOLD.first) - since);
          layer.classList.add("in", "landed");
          title.classList.add("in");
        } else {
          // прямой заход: экран уже закрашен, логотип падает, когда страница соберётся
          layer?.remove();
          title?.remove();
          layer = ctx.layer("cb-wipe");
          wipeScene(layer, assets, window.innerHeight);
          layer.classList.add("in", "landed", "still");
          title = ctx.layer("cb-wipe-title");
          title.innerHTML = `<span class="cb-wipe-shake">${logoHtml(game, esc, "cb-wipe-logo")}</span>`;
          const T = title;
          const Lw = layer;
          decoded([...T.querySelectorAll("img")], 350).then(() => later(() => (T.classList.add("in"), Lw.classList.add("slam")), BUILD_LAG));
          hold = BUILD_LAG + (seenBefore() ? HOLD.repeat : HOLD.direct);
        }
        const L = layer;
        const T = title;
        let opened = false;
        const open = () => {
          if (opened) return;
          opened = true;
          T.classList.add("out");
          L.classList.add("out");
          later(() => T.remove(), 700);
          later(() => L.remove(), 1300);
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
