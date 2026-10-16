// Monster Hunter: World (+ Iceborne) — «Доска заданий Астеры».
// Всё своё, по мотивам Астеры и следопытства World:
//  · баннер на главной — квестовый листок, приколотый к доске двумя кнопками: рваный пергамент, сверху
//    тёмная вывеска с логотипом, по арту тянется цепочка следов монстра — по отпечатку на условие
//    (светятся зелёным, как следы для жуков-следопытов, — выполнено; бледные — нет), в конце следа —
//    бирка со счётом и латунная клетка с жуками; выделение — «квест принят»: листок поднимается и
//    выпрямляется, следы по очереди вспыхивают, жуки в клетке разгораются;
//  · при наведении на главную — выслеживание: проступает ночной лес, в полях по обе стороны списка снизу
//    вверх загораются цепочки следов, по ним поднимаются жуки-следопыты — к горящим следам когтей наверху;
//  · страница — доска заданий: листки-квесты приколоты кнопками вразнобой; у выполненных — латунный
//    жетон Гильдии, у невыполненных — зелёные следы и жуки-следопыты, которые сами ведут к ним, как в игре;
//    по клику листок переворачивается (загнутый уголок подсказывает) — на обороте подробности и чек-лист;
//    прогресс — латунная клетка-фонарь у вывески: сколько выполнено, столько жуков светится внутри;
//  · заставка — уход на охоту: экран темнеет, из следов на баннере вырываются потоки жуков-следопытов и
//    кружат вокруг логотипа; на странице рой разлетается и темнота уходит.
(() => {
  "use strict";

  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const easeOut = (x) => 1 - Math.pow(1 - x, 3);

  // ---------- цепочка следов на баннере (в процентах плашки) ----------
  function trailPoint(k) {
    const x = 6 + k * 70;
    const y = 79 - 9 * Math.sin(k * Math.PI * 1.15 + 0.3) - k * 4;
    return [x, y];
  }

  // ---------- спрайт светлячка для canvas ----------
  let flySprite = null;
  function sprite() {
    if (flySprite) return flySprite;
    const c = document.createElement("canvas");
    c.width = c.height = 48;
    const g = c.getContext("2d");
    const gr = g.createRadialGradient(24, 24, 0, 24, 24, 24);
    gr.addColorStop(0, "rgba(240,255,210,1)");
    gr.addColorStop(0.18, "rgba(170,255,120,0.95)");
    gr.addColorStop(0.45, "rgba(90,230,80,0.35)");
    gr.addColorStop(1, "rgba(40,160,40,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 48, 48);
    flySprite = c;
    return c;
  }

  // ---------- заставка: потоки жуков-следопытов ----------
  const COVER_MS = 680;
  const HOLD = { direct: 800, repeat: 300, handoff: 280, first: 900 };
  const STREAMS = 6;

  function makeSwarm(layer, game, esc, rect) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    layer.innerHTML = `
      <i class="mw-swarm-dark"></i>
      <canvas></canvas>
      <div class="mw-swarm-title">${game.logo ? `<img src="${esc(game.logo)}" alt="${esc(game.title)}">` : `<span>${esc(game.title)}</span>`}</div>`;
    const canvas = layer.querySelector("canvas");
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const g = canvas.getContext("2d");
    g.scale(dpr, dpr);
    const cx = w / 2;
    const cy = h * 0.47;
    const r = rect ?? { left: cx - 200, right: cx + 200, top: cy - 60, bottom: cy + 60 };
    const n = Math.round(110 + Math.min(1.6, (w * h) / (1440 * 900)) * 50);
    const orbit = Math.min(w, h) * 0.34;
    // жуки летят потоками: у каждого потока своя орбита и фаза, жуки потока идут друг за другом
    const flies = Array.from({ length: n }, (_, i) => {
      const st = i % STREAMS;
      const k = Math.random();
      const sx = r.left + (r.right - r.left) * (0.06 + k * 0.7);
      const sy = r.top + (r.bottom - r.top) * (0.72 + (Math.random() - 0.5) * 0.25);
      return {
        sx,
        sy,
        st,
        lag: (i / STREAMS) * 0.045 + Math.random() * 0.02,
        ring: orbit * (0.62 + st * 0.11) + (Math.random() - 0.5) * 16,
        tilt: 0.5 + (st % 3) * 0.12,
        dir: st % 2 ? 1 : -1,
        phase: (st / STREAMS) * Math.PI * 2,
        wob: Math.random() * Math.PI * 2,
        size: 5 + Math.random() * 7,
        delay: Math.random() * 0.22,
        out: { a: Math.random() * Math.PI * 2, v: 0.6 + Math.random() * 1.1 },
      };
    });
    return { layer, canvas, g, w, h, cx, cy, flies, dark: layer.querySelector(".mw-swarm-dark"), title: layer.querySelector(".mw-swarm-title"), t0: performance.now(), draw: null, stopped: false };
  }

  function runSwarm(s) {
    const tick = (now) => {
      if (s.stopped || !s.layer.isConnected) return;
      s.draw?.(now);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // позиция жука в момент t (секунды заставки); open — секунды с начала открытия (или -1)
  function flyAt(s, f, t, open) {
    const ang = f.phase + (t - f.lag * 6) * 0.9 * f.dir;
    const tx = s.cx + Math.cos(ang) * f.ring;
    const ty = s.cy + Math.sin(ang) * f.ring * f.tilt + Math.sin(t * 2.4 + f.wob) * 7;
    const k = easeOut(clamp01((t - f.delay) / 0.75));
    let x = f.sx + (tx - f.sx) * k;
    let y = f.sy + (ty - f.sy) * k;
    if (open >= 0) {
      const o = easeOut(clamp01(open / 0.7));
      const dist = Math.max(s.w, s.h) * o * f.out.v;
      x += Math.cos(f.out.a) * dist;
      y += Math.sin(f.out.a) * dist;
    }
    return [x, y, k];
  }

  function drawSwarm(s, t, open = -1) {
    const { g, w, h } = s;
    const sp = sprite();
    g.clearRect(0, 0, w, h);
    g.globalCompositeOperation = "lighter";
    const fade = open >= 0 ? 1 - clamp01((open - 0.25) / 0.5) : 1;
    for (const f of s.flies) {
      // жук и короткий шлейф за ним
      for (let j = 2; j >= 0; j--) {
        const [x, y, k] = flyAt(s, f, t - j * 0.035, open >= 0 ? Math.max(0, open - j * 0.035) : -1);
        const flick = 0.75 + 0.25 * Math.sin(t * 9 + f.wob * 3);
        const size = f.size * (1 - j * 0.22);
        g.globalAlpha = (0.35 + 0.65 * Math.min(1, k * 1.5)) * flick * fade * (j ? 0.35 / j : 1);
        g.drawImage(sp, x - size, y - size, size * 2, size * 2);
      }
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = "source-over";
  }

  function seenBefore() {
    try {
      const seen = sessionStorage.getItem("mw-swarm") === "1";
      sessionStorage.setItem("mw-swarm", "1");
      return seen;
    } catch {
      return false;
    }
  }

  // поворот листка на доске — стабильный по номеру, чтобы доска не «прыгала» между заходами
  const tilt = (n) => (((n * 37) % 9) - 4) * 0.45;

  GameThemes.register("monster-hunter-world", {
    // ---------- главная: квестовый листок на доске ----------
    // Композиция — как листок с доски заданий: сверху вывеска с логотипом, по арту тянется цепочка следов
    // монстра (отпечаток на условие), в конце следа — бирка со счётом и латунная клетка с жуками.
    // Выделение — «квест принят»: листок выпрямляется и поднимается, следы по очереди вспыхивают,
    // жуки в клетке разгораются.
    banner(b) {
      const { done, total } = b.progress;
      const logo = b.art.logo('alt=""');
      const n = Math.min(total, 40);
      // отпечатки — двумя слоями: светящиеся (выполнено) отдельно, чтобы свечение не обрезала маска отпечатка
      const mark = (i) => {
        const k = n > 1 ? i / (n - 1) : 0.5;
        const [x, y] = trailPoint(k);
        const side = i % 2 ? 1 : -1;
        // отпечатки левой и правой лапы, пальцами вверх, — читаются как следы, а не как стрелки
        return `<i style="left:${x.toFixed(2)}%;top:${(y + side * 2.4).toFixed(2)}%;--a:${side * 16}deg;--i:${i}"></i>`;
      };
      const ids = Array.from({ length: n }, (_, i) => i);
      const marks = `<span class="mw-ban-tracks on">${ids.filter((i) => i < done).map(mark).join("")}</span><span class="mw-ban-tracks off">${ids.filter((i) => i >= done).map(mark).join("")}</span>`;
      const [ex, ey] = trailPoint(1);
      const k = total ? done / total : 0;
      b.el.innerHTML = `
        <span class="mw-ban">
          <span class="mw-ban-art">${b.art.hero('alt="" loading="lazy"')}</span>
          ${n ? `<span class="mw-ban-trail" aria-hidden="true">${marks}</span>` : ""}
          <span class="mw-ban-head">${logo ? `<span class="mw-ban-logo">${logo}</span>` : `<span class="mw-ban-name" aria-hidden="true">${b.esc(b.game.title)}</span>`}</span>
          ${
            total
              ? `<span class="mw-ban-end" style="left:${(ex + 3).toFixed(2)}%;top:${ey.toFixed(2)}%" aria-hidden="true">
                  <span class="mw-ban-count"><b>${done}</b>/${total}</span>
                  <span class="mw-ban-cage" style="--k:${k.toFixed(3)}"><i></i><img src="${b.assets}cage.webp" alt=""></span>
                </span>`
              : ""
          }
          <span class="mw-sr">${b.esc(b.game.title)}. ${total ? `Выполнено ${done} из ${total} условий закрытия` : "Условия ещё не заданы"}</span>
        </span>
        <span class="mw-ban-tack l" aria-hidden="true"></span><span class="mw-ban-tack r" aria-hidden="true"></span>`;
    },

    // ---------- главная: при наведении — выслеживание ----------
    // Проступает ночной лес; по обеим сторонам списка (в полях, которые видно) снизу вверх загораются цепочки
    // следов, по ним поднимаются жуки-следопыты — к горящим следам когтей наверху.
    // Только CSS: анимации идут, пока у слоя класс .on.
    stage(s) {
      const steps = 11;
      const track = (side) =>
        `<div class="mw-hv-track ${side}">${Array.from({ length: steps }, (_, i) => `<i style="--y:${(100 - (i + 0.5) * (100 / steps)).toFixed(1)}%;--x:${i % 2 ? 9 : -9}px;--d:${(0.15 + i * 0.1).toFixed(2)}s;--r:${i % 2 ? 8 : -8}deg"></i>`).join("")}</div>`;
      const flies = Array.from({ length: 16 }, (_, i) => `<i class="${i % 2 ? "l" : "r"}" style="--d:${(-i * 0.43).toFixed(2)}s;--t:${(4.2 + (i % 4) * 0.7).toFixed(1)}s;--s:${(5 + (i % 3) * 2).toFixed(0)}px;--w:${(8 + (i % 5) * 4).toFixed(0)}px"><b></b></i>`).join("");
      const claw = `-webkit-mask-image:url('${s.assets}track.webp');mask-image:url('${s.assets}track.webp')`;
      s.el.innerHTML = `
        <div class="mw-hv">
          <div class="mw-hv-forest" style="background-image:url('${s.assets}jungle.webp')"></div>
          <div class="mw-hv-mist"></div>
          ${track("l")}${track("r")}
          <div class="mw-hv-flies">${flies}</div>
          <i class="mw-hv-claws l" style="${claw}"></i><i class="mw-hv-claws r" style="${claw}"></i>
        </div>`;
    },

    // ---------- главная: уход на охоту — потоки жуков из следов на баннере ----------
    cover(t) {
      const banner = document.querySelector('.gbanner[data-game="monster-hunter-world"]')?.getBoundingClientRect();
      const s = makeSwarm(t.layer("mw-swarm"), t.game, t.esc, banner);
      t.data.swarm = s;
      t.data.started = performance.now();
      t.data.seen = seenBefore();
      setTimeout(() => s.layer.classList.add("titled"), 300);
      return new Promise((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          resolve();
        };
        s.draw = (now) => {
          const sec = (now - s.t0) / 1000;
          drawSwarm(s, sec);
          if (sec * 1000 >= COVER_MS) finish();
        };
        void s.dark.offsetWidth; // темнота наплывает переходом, а не появляется целиком
        s.layer.classList.add("going");
        runSwarm(s); // рой кружит и дальше, пока страница не откроет заставку
        setTimeout(finish, COVER_MS + 250);
      });
    },

    // ---------- страница игры — доска заданий ----------
    page(ctx) {
      const { root, esc, assets, game } = ctx;
      const cond = ctx.conditions;
      const groups = (cond?.groups ?? []).filter((gr) => (gr.goals ?? []).length);
      const items = groups.flatMap((gr) => gr.goals.map((g) => ({ g, group: gr.title })));
      const done = items.filter((x) => x.g.done).length;
      const total = items.length;
      const motion = !ctx.reducedMotion;
      const timers = new Set();
      const later = (fn, ms) => {
        const id = setTimeout(() => (timers.delete(id), fn()), ms);
        timers.add(id);
        return id;
      };
      ctx.onCleanup(() => timers.forEach(clearTimeout));

      root.classList.add("mw");
      root.innerHTML = pageHtml();
      const $ = (q) => root.querySelector(q);
      const slips = [...root.querySelectorAll(".mw-slip")];
      // жуки-следопыты по умолчанию ведут к первой невыполненной цели — как в игре
      const home = slips.find((s) => !s.classList.contains("done")) ?? null;
      let target = home;

      backdrop();
      if (total) {
        board();
        scoutflies();
      }
      intro();

      return () => root.classList.remove("mw");

      // ---------- разметка ----------
      function pageHtml() {
        const logo = ctx.art.logo('alt=""');
        const nb = ctx.neighbors ?? {};
        const caged = Array.from({ length: Math.min(done, 40) }, (_, i) => `<i style="--x:${(14 + ((i * 37) % 72)).toFixed(0)}%;--y:${(18 + ((i * 53) % 64)).toFixed(0)}%;--d:${(-i * 0.43).toFixed(2)}s;--t:${(2.6 + (i % 5) * 0.4).toFixed(1)}s"></i>`).join("");
        let body = "";
        items.forEach(({ g, group }, i) => {
          if (groups.length > 1 && group !== items[i - 1]?.group) body += `<h2 class="mw-group"><span>${esc(group)}</span></h2>`;
          body += slipHtml(g, i);
        });
        return `
          <div class="mw-page ${total ? "" : "mw-page-empty"}">
            <header class="mw-head">
              <a class="mw-notice" href="#/" aria-label="К списку игр">
                <span class="mw-nail l" aria-hidden="true"></span><span class="mw-nail r" aria-hidden="true"></span>
                ${logo ? `<span class="mw-notice-logo">${logo}</span>` : `<span class="mw-notice-name">${esc(game.title)}</span>`}
              </a>
              <h1 class="mw-sr">${esc(game.title)}</h1>
              ${
                total
                  ? `<div class="mw-cage" role="img" aria-label="Выполнено ${done} из ${total} условий закрытия">
                      <span class="mw-cage-hook" aria-hidden="true"></span>
                      <span class="mw-cage-glass" aria-hidden="true">
                        <span class="mw-cage-glow" style="--k:${(done / total).toFixed(3)}"></span>
                        <img src="${assets}cage.webp" alt="">
                        <span class="mw-cage-flies">${caged}</span>
                      </span>
                      <span class="mw-cage-plate" aria-hidden="true"><b>${done}</b><span>/${total}</span></span>
                      <span class="mw-cage-label" aria-hidden="true">условий закрытия</span>
                    </div>`
                  : ""
              }
            </header>
            ${
              total
                ? `<main class="mw-board" aria-label="Доска заданий">${body}</main>`
                : `<main class="mw-board"><p class="mw-empty">Условия закрытия для этой игры ещё не заданы.</p></main>`
            }
            <footer class="mw-foot">
              ${nb.prev ? `<a class="mw-tag" href="${esc(nb.prev.href)}"><span class="mw-nail l"></span>◂ ${esc(nb.prev.title)}</a>` : ""}
              <a class="mw-tag mw-tag-back" href="#/"><span class="mw-nail l"></span><span class="mw-nail r"></span>К списку игр</a>
              ${nb.next ? `<a class="mw-tag" href="${esc(nb.next.href)}"><span class="mw-nail r"></span>${esc(nb.next.title)} ▸</a>` : ""}
            </footer>
          </div>`;
      }

      function slipHtml(g, i) {
        const img = ctx.safeUrl(g.image);
        const fig = g.imageFit === "contain";
        const all = (g.checklist ?? []).flatMap((c) => c.items ?? []);
        const cDone = all.filter((it) => it.done).length;
        const checklist = (g.checklist ?? [])
          .map(
            (c) => `
            <div class="mw-list">
              ${c.label ? `<h4>${esc(c.label)} · ${(c.items ?? []).filter((it) => it.done).length}/${(c.items ?? []).length}</h4>` : ""}
              <ul>${(c.items ?? []).map((it) => `<li class="${it.done ? "on" : ""}"><i aria-hidden="true"></i><span>${esc(it.title)}</span></li>`).join("")}</ul>
            </div>`,
          )
          .join("");
        const gallery = (g.gallery ?? []).map(ctx.safeUrl).filter(Boolean);
        const link = ctx.safeUrl(g.link);
        const hasBack = !!(checklist || g.note || g.details || gallery.length || link || img);
        // отметка — внизу листка, в одной строке для обоих состояний: латунный жетон Гильдии или следы
        const mark = g.done
          ? `<span class="mw-state done" aria-hidden="true"><span class="mw-medal"></span><span>выполнено</span></span>`
          : `<span class="mw-state todo" aria-hidden="true"><span class="mw-todo-paws"><i></i><i></i><i></i></span><span>${all.length ? `${cDone} из ${all.length}` : "не выполнено"}</span></span>`;
        return `
          <article class="mw-slip ${g.done ? "done" : "todo"} ${fig ? "fig" : "scene"} ${hasBack ? "two" : ""}" data-i="${i}" style="--r:${tilt(+g.n || i)}deg">
            <div class="mw-slip-in">
              <div class="mw-face mw-front">
                <span class="mw-slip-n">№ ${esc(g.n)}</span>
                <div class="mw-pic">${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : `<span class="mw-pic-blank" aria-hidden="true">${esc(g.n)}</span>`}</div>
                <h3 class="mw-slip-title">${esc(g.title)}</h3>
                ${mark}
                ${hasBack ? `<i class="mw-fold" aria-hidden="true"></i>` : ""}
              </div>
              ${
                hasBack
                  ? `<div class="mw-face mw-back" data-gallery>
                      <span class="mw-slip-n">№ ${esc(g.n)}</span>
                      <h3 class="mw-back-title">${esc(g.title)}</h3>
                      ${checklist}
                      ${g.note ? `<blockquote class="mw-note">«${esc(g.note)}»</blockquote>` : ""}
                      ${g.details ? `<p class="mw-details">${esc(g.details)}</p>` : ""}
                      ${img || gallery.length ? `<div class="mw-gallery">${[img, ...gallery].filter(Boolean).map((u) => `<img src="${esc(u)}" alt="" loading="lazy" data-zoom data-caption="${esc(g.title)}">`).join("")}</div>` : ""}
                      ${link ? `<a class="mw-lore" href="${esc(link)}" target="_blank" rel="noopener">Подробнее ↗</a>` : ""}
                    </div>`
                  : ""
              }
            </div>
            <button type="button" class="mw-slip-hit" aria-expanded="false" aria-label="№${esc(g.n)}. ${esc(g.title)}${g.done ? ". Выполнено" : ". Не выполнено"}${hasBack ? ". Перевернуть листок" : ""}"></button>
            <span class="mw-slip-tack" aria-hidden="true"></span>
          </article>`;
      }

      // ---------- фон: доски Астеры в свете фонарей ----------
      function backdrop() {
        const bg = ctx.layer("mw-backdrop");
        bg.style.backgroundImage = `url("${assets}board.webp")`;
      }

      // ---------- доска: переворот листков, клавиатура ----------
      function board() {
        const flip = (slip, on) => {
          if (!slip.querySelector(".mw-back")) return;
          const want = on ?? !slip.classList.contains("flipped");
          slips.forEach((s) => {
            if (s !== slip && s.classList.contains("flipped")) {
              s.classList.remove("flipped");
              s.querySelector(".mw-slip-hit").setAttribute("aria-expanded", "false");
            }
          });
          slip.classList.toggle("flipped", want);
          // оборот длиннее лицевой стороны — листок раздвигает доску вниз, а не ложится на соседей
          const back = slip.querySelector(".mw-back");
          const front = slip.querySelector(".mw-front");
          slip.style.marginBottom = want ? `${Math.max(0, back.scrollHeight - front.offsetHeight)}px` : "";
          slip.querySelector(".mw-slip-hit").setAttribute("aria-expanded", String(want));
        };
        const boardEl = $(".mw-board");
        ctx.listen(boardEl, "click", (e) => {
          if (e.target.closest("a, img[data-zoom]")) return;
          const slip = e.target.closest(".mw-slip");
          if (slip) flip(slip);
        });
        // жуки облетают листок под курсором или в фокусе, а без него — ведут к невыполненной цели
        ctx.listen(boardEl, "pointerover", (e) => {
          const s = e.target.closest(".mw-slip");
          if (s) target = s;
        });
        ctx.listen(boardEl, "pointerleave", () => (target = home));
        ctx.listen(boardEl, "focusin", (e) => {
          const s = e.target.closest(".mw-slip");
          if (s) target = s;
        });
        // стрелки — по листкам в сетке, только когда фокус уже на доске; Esc — сначала перевернуть обратно
        ctx.listen(
          window,
          "keydown",
          (e) => {
            if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector("dialog[open]")) return;
            const cur = document.activeElement?.closest?.(".mw-slip");
            if (e.key === "Escape") {
              const open = root.querySelector(".mw-slip.flipped");
              if (open) {
                e.preventDefault();
                e.stopImmediatePropagation();
                flip(open, false);
                open.querySelector(".mw-slip-hit").focus();
              }
              return;
            }
            const d = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] }[e.key];
            if (!d || !cur) return;
            e.preventDefault();
            const i = slips.indexOf(cur);
            let next = i;
            if (d[0]) next = Math.max(0, Math.min(slips.length - 1, i + d[0]));
            else {
              const r = cur.getBoundingClientRect();
              const cx = r.left + r.width / 2;
              let best = null;
              let bd = Infinity;
              for (const s of slips) {
                const q = s.getBoundingClientRect();
                if (d[1] > 0 ? q.top <= r.top + r.height / 2 : q.bottom >= r.top + r.height / 2) continue;
                const dist = Math.abs(q.left + q.width / 2 - cx) + Math.abs(q.top - r.top) * 0.5;
                if (dist < bd) (bd = dist), (best = s);
              }
              if (best) next = slips.indexOf(best);
            }
            slips[next].querySelector(".mw-slip-hit").focus();
            slips[next].scrollIntoView({ block: "nearest", behavior: motion ? "smooth" : "auto" });
          },
          { capture: true },
        );
      }

      // ---------- жуки-следопыты: облетают листок, на который смотришь, а без него — невыполненную цель ----------
      function scoutflies() {
        if (!motion) return;
        const layer = ctx.layer("mw-flies");
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
        const sp = sprite();
        const flies = Array.from({ length: 22 }, () => ({ x: Math.random() * w, y: Math.random() * h, vx: 0, vy: 0, ph: Math.random() * 6.28, s: 4 + Math.random() * 6, seed: Math.random() * 6.28 }));
        ctx.loop((now, dt) => {
          const t = now / 1000;
          let tx = null;
          let ty = null;
          let rw = 0;
          let rh = 0;
          if (target && target.isConnected) {
            const r = target.getBoundingClientRect();
            if (r.bottom > 0 && r.top < h) {
              tx = r.left + r.width / 2;
              ty = r.top + r.height / 2;
              rw = r.width / 2;
              rh = r.height / 2;
            }
          }
          g.clearRect(0, 0, w, h);
          g.globalCompositeOperation = "lighter";
          for (const f of flies) {
            let ax;
            let ay;
            if (tx != null) {
              const a = t * 0.9 + f.seed;
              const gx = tx + Math.cos(a) * (rw + 14);
              const gy = ty + Math.sin(a * 1.3) * (rh + 10);
              ax = (gx - f.x) * 3;
              ay = (gy - f.y) * 3;
            } else {
              ax = Math.cos(t * 0.6 + f.seed) * 30;
              ay = Math.sin(t * 0.8 + f.seed * 2) * 30;
            }
            f.vx = (f.vx + ax * dt) * 0.94;
            f.vy = (f.vy + ay * dt) * 0.94;
            f.x += f.vx * dt;
            f.y += f.vy * dt;
            if (f.x < -20) f.x = w + 10;
            if (f.x > w + 20) f.x = -10;
            if (f.y < -20) f.y = h + 10;
            if (f.y > h + 20) f.y = -10;
            g.globalAlpha = 0.55 + 0.45 * Math.sin(t * 5 + f.ph);
            g.drawImage(sp, f.x - f.s, f.y - f.s, f.s * 2, f.s * 2);
          }
          g.globalAlpha = 1;
          g.globalCompositeOperation = "source-over";
        });
      }

      // ---------- вход: рой разлетается, темнота уходит ----------
      function intro() {
        const handed = ctx.handoff?.layers.find((l) => l.classList.contains("mw-swarm"));
        if (!motion) return handed?.remove();
        let s = handed && ctx.handoff.data?.swarm;
        let hold;
        if (s) {
          const since = performance.now() - (ctx.handoff.data.started ?? 0);
          hold = Math.max(HOLD.handoff, (ctx.handoff.data.seen ? 0 : HOLD.first) - since);
        } else {
          handed?.remove();
          s = makeSwarm(ctx.layer("mw-swarm mw-direct titled going"), game, esc, null);
          // прямой заход: рой уже на орбитах
          s.t0 = performance.now() - 1500;
          s.draw = (now) => drawSwarm(s, (now - s.t0) / 1000);
          runSwarm(s);
          hold = seenBefore() ? HOLD.repeat : HOLD.direct;
        }
        const swarm = s;
        let start = 0;
        let finished = false;
        const end = () => {
          if (finished) return;
          finished = true;
          swarm.stopped = true;
          swarm.layer.remove();
        };
        const open = () => {
          if (start || finished) return;
          start = performance.now();
          swarm.layer.classList.add("leaving");
          swarm.draw = (now) => {
            const u = (now - start) / 1000;
            drawSwarm(swarm, (now - swarm.t0) / 1000, u);
            if (u > 0.95) end();
          };
          later(end, 1500);
        };
        later(open, hold);
        ctx.onCleanup(end);
        for (const type of ["pointerdown", "keydown", "wheel"]) ctx.listen(window, type, open, { passive: true, once: true });
      }
    },
  });
})();
