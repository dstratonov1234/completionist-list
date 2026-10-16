// Siralim Ultimate — «Экран боя».
// Всё своё, по мотивам интерфейса Siralim:
//  · баннер на главной — мини-экран боя: арт, логотип и ряд карточек отряда (по карточке на условие,
//    полоса здоровья полная — выполнено), при наведении у логотипа прыгает курсор меню ▶;
//  · при наведении на баннер за главной открывается портал в реалм: пиксельный реалм проступает, в небе
//    раскручивается покадровый пиксельный водоворот, вверх плывут кристаллы;
//  · страница — окно игры посередине на фоне реалма: строка заголовка с логотипом и кристаллами, строка
//    сообщения («Выберите условие.» печатается по буквам), меню команд слева — список условий с курсором ▶, поле боя в центре на
//    пиксельном реалме (картинка цели, вспышка удара и всплывающая надпись, как цифры урона), справа —
//    список «врагов» (чек-лист цели: красным — не побеждён, ✓ — побеждён), снизу — карточки отряда,
//    под ними — окно диалога с именем цели и подробностями, текст печатается по буквам;
//  · заставка — пиксельный портал между реалмами: водоворот закручивается из баннера ещё на главной,
//    заливает экран, проступает название; на странице игры портал схлопывается к центру.
(() => {
  "use strict";

  const FIELDS = [
    ["gives", "Что даёт"],
    ["needs", "Что потребуется"],
    ["unlock", "Открывается"],
    ["counts", "Как засчитываем"],
  ];
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const easeOut = (x) => 1 - Math.pow(1 - x, 3);
  const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

  // ---------- заставка: пиксельный портал ----------
  const PX = 5; // размер «пикселя» портала в экранных точках
  const COVER_MS = 720;
  const OPEN_MS = 760;
  const HOLD = { direct: 600, repeat: 240, handoff: 260 };
  // палитра водоворота: от тёмного фиолетового к светлому краю
  const SWIRL = [
    [24, 10, 48],
    [44, 18, 86],
    [72, 30, 130],
    [104, 52, 176],
    [148, 92, 222],
  ];
  const EDGE = [[214, 186, 255], [255, 255, 255], [120, 220, 255]];

  function makePortal(layer, game, esc, ox, oy) {
    const canvas = document.createElement("canvas");
    const title = document.createElement("div");
    title.className = "sir-portal-title";
    title.innerHTML = `<span>${esc(game.title)}</span>`;
    layer.append(canvas, title);
    const w = Math.ceil(window.innerWidth / PX);
    const h = Math.ceil(window.innerHeight / PX);
    canvas.width = w;
    canvas.height = h;
    const g = canvas.getContext("2d");
    const img = g.createImageData(w, h);
    const cx = ox / PX;
    const cy = oy / PX;
    const far = Math.max(Math.hypot(cx, cy), Math.hypot(w - cx, cy), Math.hypot(cx, h - cy), Math.hypot(w - cx, h - cy)) + 4;
    return { layer, canvas, title, g, img, w, h, cx, cy, far };
  }

  // Портал радиусом r (в «пикселях»): внутри — закрученные полосы, по краю — светлое кольцо.
  function drawPortal(p, r, spin) {
    const { img, w, h, cx, cy } = p;
    const d = img.data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const dx = x - cx;
        const dy = y - cy;
        const dist = Math.hypot(dx, dy);
        if (dist > r) {
          d[i + 3] = 0;
          continue;
        }
        let c;
        if (dist > r - 2.2) c = EDGE[(x + y) & 1 ? 0 : 1];
        else if (dist > r - 4) c = EDGE[2];
        else {
          const a = Math.atan2(dy, dx);
          const band = Math.sin(a * 3 + dist * 0.22 - spin) * 0.5 + 0.5;
          const depth = clamp01(dist / Math.max(24, r));
          c = SWIRL[Math.min(4, Math.floor((band * 0.65 + depth * 0.35) * 5))];
        }
        d[i] = c[0];
        d[i + 1] = c[1];
        d[i + 2] = c[2];
        d[i + 3] = 255;
      }
    }
    p.g.putImageData(img, 0, 0);
  }

  function seenBefore() {
    try {
      const seen = sessionStorage.getItem("sir-portal") === "1";
      sessionStorage.setItem("sir-portal", "1");
      return seen;
    } catch {
      return false;
    }
  }

  // ---------- карточки отряда: по карточке на условие, полоса здоровья — выполнено или нет ----------
  function partyHtml(list, esc, cls) {
    return list
      .map(
        (g, i) => `
        <span class="sir-card ${g.done ? "on" : ""} ${cls}" data-i="${i}">
          <span class="sir-card-n">${esc(g.n)}</span>
          <span class="sir-hp"><i></i></span>
        </span>`,
      )
      .join("");
  }

  // Покадровый спрайт портала для главной: кадры водоворота в одну полосу, CSS листает их шагами.
  function portalSprite(frames, size) {
    const c = document.createElement("canvas");
    c.width = size * frames;
    c.height = size;
    const g = c.getContext("2d");
    const img = g.createImageData(size * frames, size);
    const d = img.data;
    const r = size / 2 - 1;
    for (let f = 0; f < frames; f++) {
      const spin = (f / frames) * Math.PI * 2;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const dx = x - size / 2 + 0.5;
          const dy = y - size / 2 + 0.5;
          const dist = Math.hypot(dx, dy);
          if (dist > r) continue;
          let col;
          if (dist > r - 1.6) col = EDGE[(x + y) & 1 ? 0 : 1];
          else if (dist > r - 3) col = EDGE[2];
          else {
            const band = Math.sin(Math.atan2(dy, dx) * 3 + dist * 0.42 - spin) * 0.5 + 0.5;
            col = SWIRL[Math.min(4, Math.floor((band * 0.65 + (dist / r) * 0.35) * 5))];
          }
          const i = (y * size * frames + f * size + x) * 4;
          d[i] = col[0];
          d[i + 1] = col[1];
          d[i + 2] = col[2];
          d[i + 3] = 255;
        }
      }
    }
    g.putImageData(img, 0, 0);
    return c.toDataURL();
  }

  GameThemes.register("siralim-ultimate", {
    // ---------- главная: мини-экран боя ----------
    banner(b) {
      const { done, total } = b.progress;
      const logo = b.art.logo('class="sir-ban-logo" alt=""');
      const cards = Array.from({ length: Math.min(total, 12) }, (_, i) => ({ n: i + 1, done: i < done }));
      b.el.innerHTML = `
        <span class="sir-ban">
          <span class="sir-ban-art">${b.art.hero('alt="" loading="lazy"')}</span>
          <span class="sir-ban-main">
            <span class="sir-cursor" aria-hidden="true">▶</span>
            ${logo || `<span class="sir-ban-name" aria-hidden="true">${b.esc(b.game.title)}</span>`}
            <span class="sir-sr">${b.esc(b.game.title)}</span>
          </span>
          <span class="sir-ban-party">
            <span class="sir-ban-count"><img src="${b.assets}gem.webp" alt=""><b>${done}</b>/${total || "—"}</span>
            <span class="sir-ban-cards">${total ? partyHtml(cards, b.esc, "sir-card-sm") : `<span class="sir-ban-empty">Условия ещё не заданы</span>`}</span>
          </span>
        </span>`;
    },

    // ---------- главная: при наведении открывается портал в реалм ----------
    // Пиксельный реалм проступает за списком, в небе раскручивается водоворот (покадровый спрайт),
    // вверх плывут кристаллы. Только CSS: анимации идут, пока у слоя класс .on.
    stage(s) {
      let sprite = "";
      try {
        sprite = portalSprite(6, 48);
      } catch {}
      const motes = Array.from({ length: 14 }, (_, i) => {
        const x = (i * 53 + 7) % 100;
        return `<img src="${s.assets}gem.webp" alt="" style="--x:${x}%;--d:${((i * 0.41) % 3).toFixed(2)}s;--t:${(5 + (i % 4) * 1.2).toFixed(1)}s;--s:${10 + (i % 3) * 6}px">`;
      }).join("");
      s.el.innerHTML = `
        <div class="sir-hv">
          <div class="sir-hv-realm" style="background-image:url('${s.assets}realm.webp')"></div>
          ${sprite ? `<div class="sir-hv-portal"><i style="background-image:url(${sprite})"></i></div>` : ""}
          <div class="sir-hv-motes">${motes}</div>
          <div class="sir-hv-scan"></div>
        </div>`;
    },

    // ---------- главная: портал открывается из баннера ----------
    cover(t) {
      const banner = document.querySelector('.gbanner[data-game="siralim-ultimate"]')?.getBoundingClientRect();
      const ox = banner ? banner.left + banner.width * 0.3 : window.innerWidth / 2;
      const oy = banner ? banner.top + banner.height / 2 : window.innerHeight / 2;
      const p = makePortal(t.layer("sir-portal"), t.game, t.esc, ox, oy);
      t.data.portal = p;
      t.data.started = performance.now();
      t.data.seen = seenBefore();
      setTimeout(() => p.title.classList.add("in"), 360);
      return new Promise((resolve) => {
        const start = performance.now();
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          drawPortal(p, p.far, 0);
          resolve();
        };
        const tick = (now) => {
          if (done) return;
          const k = (now - start) / COVER_MS;
          drawPortal(p, p.far * easeOut(clamp01(k)), k * 7);
          if (k >= 1) finish();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        setTimeout(finish, COVER_MS + 200);
      });
    },

    // ---------- страница игры — целиком своя ----------
    page(ctx) {
      const { root, esc, assets, game } = ctx;
      const cond = ctx.conditions;
      const goals = (cond?.groups ?? []).flatMap((gr) => (gr.goals ?? []).map((g) => ({ g, group: gr.title })));
      const done = goals.filter((x) => x.g.done).length;
      const total = goals.length;
      const motion = !ctx.reducedMotion;
      const timers = new Set();
      const later = (fn, ms) => {
        const id = setTimeout(() => (timers.delete(id), fn()), ms);
        timers.add(id);
        return id;
      };
      ctx.onCleanup(() => timers.forEach(clearTimeout));
      let cur = 0;
      let typing = null; // печать окна диалога
      let msgTyping = null; // печать строки сообщения

      root.classList.add("sir");
      root.innerHTML = pageHtml();
      const $ = (q) => root.querySelector(q);

      backdrop();
      if (total) {
        battle();
        select(firstGoal(), false);
      }
      intro();

      return () => root.classList.remove("sir");

      function firstGoal() {
        const i = goals.findIndex((x) => !x.g.done);
        return i < 0 ? 0 : i;
      }

      // ---------- разметка ----------
      function pageHtml() {
        const logo = ctx.art.logo('class="sir-titlebar-logo" alt=""');
        const nb = ctx.neighbors ?? {};
        return `
          <div class="sir-page">
          <div class="sir-window">
            <header class="sir-titlebar">
              ${logo}
              <h1 class="${logo ? "sir-sr" : "sir-titlebar-name"}">${esc(game.title)}</h1>
              ${total ? `<span class="sir-gems" aria-label="Выполнено ${done} из ${total}"><img src="${assets}gem.webp" alt=""><b>${done}</b>/${total}</span>` : ""}
              <a class="sir-back" href="#/"><span class="sir-key">Esc</span>К списку</a>
            </header>

            <div class="sir-msg">
              <p class="sir-msg-text" aria-live="polite"></p>
            </div>

            ${
              total
                ? `
            <section class="sir-battle" id="sir-battle" aria-label="Условия закрытия">
              <div class="sir-win sir-commands">
                <ul class="sir-cmd-list" role="listbox" aria-label="Условия закрытия" tabindex="0">
                  ${goals
                    .map(
                      ({ g }, i) => `
                    <li role="option" id="sir-cmd-${i}" class="sir-cmd ${g.done ? "done" : ""}" data-i="${i}" aria-selected="false">
                      <span class="sir-cursor" aria-hidden="true">▶</span>
                      <span class="sir-cmd-n">${esc(g.n)}</span>
                      <span class="sir-cmd-name">${esc(g.title)}</span>
                    </li>`,
                    )
                    .join("")}
                </ul>
              </div>
              <div class="sir-win sir-field" data-gallery>
                <div class="sir-field-art"></div>
                <div class="sir-field-fx" aria-hidden="true"></div>
              </div>
              <div class="sir-win sir-enemies">
                <div class="sir-enemies-head"></div>
                <ul class="sir-enemy-list"></ul>
              </div>
              <div class="sir-party" role="group" aria-label="Отряд условий">
                ${goals
                  .map(
                    ({ g }, i) => `
                  <button type="button" class="sir-card sir-card-lg ${g.done ? "on" : ""}" data-i="${i}" aria-label="Условие ${esc(g.n)}: ${esc(g.title)}">
                    <span class="sir-card-n">${esc(g.n)}</span>
                    <span class="sir-card-name">${esc(g.title)}</span>
                    <span class="sir-hp"><i></i></span>
                  </button>`,
                  )
                  .join("")}
              </div>
            </section>

            <section class="sir-win sir-dialog" aria-live="polite">
              <header class="sir-dialog-name"></header>
              <div class="sir-dialog-body"></div>
            </section>`
                : `<section class="sir-win sir-dialog"><div class="sir-dialog-body"><p>Условия закрытия для этой игры ещё не заданы.</p></div></section>`
            }
          </div>

            ${
              nb.prev || nb.next
                ? `<nav class="sir-nav">
                    ${nb.prev ? `<a class="sir-menu-item" href="${esc(nb.prev.href)}"><span class="sir-cursor" aria-hidden="true">◀</span>${esc(nb.prev.title)}</a>` : "<span></span>"}
                    ${nb.next ? `<a class="sir-menu-item" href="${esc(nb.next.href)}">${esc(nb.next.title)}<span class="sir-cursor" aria-hidden="true">▶</span></a>` : ""}
                  </nav>`
                : ""
            }
          </div>`;
      }

      // ---------- фон: пиксельный реалм, лёгкий параллакс ----------
      function backdrop() {
        const bg = ctx.layer("sir-backdrop");
        bg.style.backgroundImage = `url("${assets}realm.webp")`;
        if (!motion) return;
        let y = -1;
        ctx.loop(() => {
          if (window.scrollY === y) return;
          y = window.scrollY;
          bg.style.transform = `translate3d(0, ${(-y * 0.06).toFixed(1)}px, 0) scale(1.1)`;
        });
      }

      // ---------- экран боя ----------
      function battle() {
        const list = $(".sir-cmd-list");
        ctx.listen(list, "click", (e) => {
          const li = e.target.closest(".sir-cmd");
          if (li) select(+li.dataset.i, true);
        });
        ctx.listen(list, "keydown", (e) => {
          const to = { ArrowDown: cur + 1, ArrowUp: cur - 1, ArrowRight: cur + 1, ArrowLeft: cur - 1, Home: 0, End: total - 1 }[e.key];
          if (to == null) return;
          e.preventDefault();
          select((to + total) % total, true);
        });
        ctx.listen($(".sir-party"), "click", (e) => {
          const c = e.target.closest(".sir-card");
          if (c) select(+c.dataset.i, true);
        });
        // клик по окну диалога — допечатать текст сразу
        ctx.listen($(".sir-dialog"), "click", () => typing?.finish());
      }

      function select(i, user) {
        cur = i;
        const { g, group } = goals[i];
        root.querySelectorAll(".sir-cmd").forEach((li, j) => li.setAttribute("aria-selected", String(j === i)));
        root.querySelectorAll(".sir-party .sir-card").forEach((c, j) => c.classList.toggle("cur", j === i));
        $(".sir-cmd-list").setAttribute("aria-activedescendant", `sir-cmd-${i}`);
        if (user) root.querySelector(`#sir-cmd-${i}`)?.scrollIntoView({ block: "nearest" });

        // поле боя
        const img = ctx.safeUrl(g.image);
        const field = $(".sir-field");
        field.classList.toggle("done", !!g.done);
        field.classList.toggle("sprite", g.imageFit === "contain");
        $(".sir-field-art").innerHTML = img
          ? `<img src="${esc(img)}" alt="${esc(g.title)}" data-zoom data-caption="${esc(g.title)}">`
          : `<span class="sir-field-blank">${esc(g.n)}</span>`;
        if (user && motion) hit(g);

        // список «врагов» — чек-лист цели
        const items = (g.checklist ?? []).flatMap((c) => (c.items ?? []).map((it) => ({ ...it, label: c.label })));
        const head = $(".sir-enemies-head");
        const enemies = $(".sir-enemy-list");
        if (items.length) {
          const d = items.filter((it) => it.done).length;
          head.innerHTML = `<span>Враги</span><b>${d}/${items.length}</b>`;
          let label = null;
          enemies.innerHTML = items
            .map((it) => {
              const sub = it.label && it.label !== label ? `<li class="sir-enemy-label">${esc((label = it.label))}</li>` : "";
              return `${sub}<li class="sir-enemy ${it.done ? "on" : ""}"><i aria-hidden="true">${it.done ? "✓" : "✕"}</i>${esc(it.title)}</li>`;
            })
            .join("");
        } else {
          head.innerHTML = `<span>Враг</span><b>${g.done ? "1/1" : "0/1"}</b>`;
          enemies.innerHTML = `<li class="sir-enemy ${g.done ? "on" : ""}"><i aria-hidden="true">${g.done ? "✓" : "✕"}</i>${esc(g.title)}</li>`;
        }

        // окно диалога и строка сообщения
        $(".sir-dialog-name").innerHTML = `<span class="sir-dialog-n">№${esc(g.n)}</span>${esc(g.title)}${g.done ? `<span class="sir-state on">✓ Выполнено</span>` : `<span class="sir-state">Не выполнено</span>`}`;
        const blocks = [];
        for (const [key, label] of FIELDS) if (g[key]) blocks.push([label, g[key]]);
        for (const x of g.extra ?? []) if (x?.label) blocks.push([x.label, x.value]);
        const body = $(".sir-dialog-body");
        body.innerHTML = `
          ${blocks.map(([l]) => `<p class="sir-line"><b>${esc(l)}:</b> <span></span></p>`).join("")}
          ${g.details ? `<p class="sir-line sir-details"><span></span></p>` : ""}
          ${g.note ? `<blockquote class="sir-line sir-note"><span></span></blockquote>` : ""}
          ${(g.gallery ?? []).map(ctx.safeUrl).filter(Boolean).length ? `<div class="sir-gallery" data-gallery>${g.gallery.map(ctx.safeUrl).filter(Boolean).map((u) => `<img src="${esc(u)}" alt="" loading="lazy" data-zoom data-caption="${esc(g.title)}">`).join("")}</div>` : ""}
          ${ctx.safeUrl(g.link) ? `<a class="sir-menu-item sir-lore" href="${esc(g.link)}" target="_blank" rel="noopener"><span class="sir-cursor" aria-hidden="true">▶</span>Подробнее на вики ↗</a>` : ""}`;
        const spans = [...body.querySelectorAll(".sir-line > span")];
        const texts = blocks.map(([, v]) => String(v));
        if (g.details) texts.push(g.details);
        if (g.note) texts.push(`«${g.note}»`);
        type(spans.map((el, k) => [el, texts[k]]), user);
        type([[$(".sir-msg-text"), `${group ? `${group}. ` : ""}Выберите условие.`]], false, true);
      }

      // текст печатается по буквам, как в диалогах игры; клик — допечатать сразу
      function type(pairs, user, quiet) {
        (quiet ? msgTyping : typing)?.cancel();
        if (!motion) {
          for (const [el, text] of pairs) el.textContent = text;
          return;
        }
        let k = 0;
        let pos = 0;
        let alive = true;
        const speed = quiet ? 30 : 6; // мс на символ
        const job = {
          finish() {
            if (!alive) return;
            alive = false;
            for (const [el, text] of pairs) el.textContent = text;
          },
          cancel() {
            alive = false;
          },
        };
        for (const [el] of pairs) el.textContent = "";
        const step = () => {
          if (!alive) return;
          const pair = pairs[k];
          if (!pair) return (alive = false);
          pos = Math.min(pair[1].length, pos + 2);
          pair[0].textContent = pair[1].slice(0, pos);
          if (pos >= pair[1].length) (k++, (pos = 0));
          later(step, speed);
        };
        later(step, user ? 120 : 380);
        if (quiet) msgTyping = job;
        else typing = job;
        return job;
      }

      // вспышка удара и всплывающая надпись, как цифры урона
      function hit(g) {
        const field = $(".sir-field");
        field.classList.remove("sir-flash");
        void field.offsetWidth;
        field.classList.add("sir-flash");
        const fx = $(".sir-field-fx");
        const pop = document.createElement("span");
        pop.className = `sir-dmg ${g.done ? "on" : ""}`;
        pop.textContent = g.done ? "Победа!" : "???";
        pop.style.left = `${40 + Math.random() * 20}%`;
        fx.append(pop);
        later(() => pop.remove(), 1100);
      }

      // ---------- вход: портал схлопывается к центру ----------
      function intro() {
        const handed = ctx.handoff?.layers.find((l) => l.classList.contains("sir-portal"));
        if (!motion) return handed?.remove();
        let p = handed && ctx.handoff.data?.portal;
        let hold;
        if (p) {
          const since = performance.now() - (ctx.handoff.data.started ?? 0);
          hold = Math.max(HOLD.handoff, (ctx.handoff.data.seen ? 0 : 1150) - since);
        } else {
          handed?.remove();
          p = makePortal(ctx.layer("sir-portal sir-direct"), game, esc, window.innerWidth / 2, window.innerHeight / 2);
          p.title.classList.add("in");
          hold = seenBefore() ? HOLD.repeat : HOLD.direct;
        }
        drawPortal(p, p.far, 0);
        const portal = p;
        // портал схлопывается к центру экрана: сначала смещаем его центр, затем сжимаем радиус
        const tx = portal.w / 2;
        const ty = portal.h / 2;
        const sx = portal.cx;
        const sy = portal.cy;
        let start = 0;
        let finished = false;
        const end = () => {
          if (finished) return;
          finished = true;
          portal.layer.remove();
        };
        const open = () => {
          if (start || finished) return;
          start = performance.now();
          portal.title.classList.add("out");
          const tick = (now) => {
            if (finished) return;
            const k = clamp01((now - start) / OPEN_MS);
            const e = easeInOut(k);
            portal.cx = sx + (tx - sx) * Math.min(1, k * 2);
            portal.cy = sy + (ty - sy) * Math.min(1, k * 2);
            const far = Math.max(Math.hypot(portal.cx, portal.cy), Math.hypot(portal.w - portal.cx, portal.cy), Math.hypot(portal.cx, portal.h - portal.cy), Math.hypot(portal.w - portal.cx, portal.h - portal.cy)) + 4;
            drawPortal(portal, far * (1 - e), 3 + k * 9);
            if (k >= 1) end();
            else requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
          later(end, OPEN_MS + 900);
        };
        later(open, hold);
        ctx.onCleanup(end);
        for (const type of ["pointerdown", "keydown", "wheel"]) ctx.listen(window, type, open, { passive: true, once: true });
      }
    },
  });
})();
