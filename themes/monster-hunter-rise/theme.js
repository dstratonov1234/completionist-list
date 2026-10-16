// Monster Hunter Rise (+ Sunbreak) — «Свиток охоты».
// Всё своё, по мотивам Камуры и интерфейса Rise:
//  · баннер на главной — свиток с деревянными валиками по краям: на васи слева надписан логотип и счёт
//    штрихами 正 (японский счёт пятёрками — штрих на условие), справа арт проступает внутри мазка туши;
//    выделение — «квест принят»: валики разъезжаются, мазок разгорается из туши в цвет, штрихи 正
//    дописываются кистью, на свиток с размаху ложится красная печать;
//  · при наведении на главную — представление монстра, как в катсценах Rise: через фон одним махом
//    проходит огромный мазок кисти, в нём проступает арт, вокруг брызги красной туши и лепестки сакуры;
//  · страница — эмакимоно, горизонтальный свиток во всю ширину: в начале — заглавие (логотип, счёт 正),
//    дальше по свитку — охоты, по одной на условие: картина, номер в красной печати, подпись; выполненные
//    получают круглую печать «済», которая ставится, когда охота впервые попадает в кадр;
//    под свитком — нить Жука-проволочника: по ней видно, где ты в свитке, жук перелетает к выбранной охоте;
//  · заставка — от баннера разворачивается свиток на весь экран: валики разъезжаются, на бумаге — брызги
//    туши, логотип и печать; на странице свиток сворачивается к центру и открывает эмакимоно.
(() => {
  "use strict";

  // ---------- счёт штрихами 正: каждый знак — пять штрихов, штрих на условие ----------
  const SEI = ["M5 7 L35 6", "M20 6 L20 40", "M21 22 L33 22", "M9 24 L9 40", "M3 40 L37 39"];

  function tallySvg(done, total, cls) {
    const n = Math.max(1, Math.ceil(total / 5));
    let k = 0;
    const glyphs = Array.from({ length: n }, (_, gi) => {
      const strokes = SEI.map((d, si) => {
        const idx = gi * 5 + si;
        if (idx >= total) return "";
        const on = idx < done;
        return `<path class="${on ? "on" : ""}" d="${d}" pathLength="1" style="--k:${on ? k++ : 0}"/>`;
      }).join("");
      return `<g transform="translate(${gi * 44} 0)">${strokes}</g>`;
    }).join("");
    return `<svg class="${cls}" viewBox="0 0 ${n * 44 - 4} 46" aria-hidden="true" focusable="false">${glyphs}</svg>`;
  }

  // диапазоны и «число–число» не разрываются переносом («HR 20–40», «A1–A9», «#4–#6»)
  const nobreak = (html) => html.replace(/((?<=^|\s)\S{1,3}\s)?(\S+[–—-]\S+)/g, (m, pre = "", r) => `<span class="mh-nw">${pre.replace(/\s$/, "&nbsp;")}${r}</span>`);

  // узкий экран — свиток висит сверху вниз
  const narrow = () => window.matchMedia("(max-width: 760px)").matches;

  // ---------- заставка: свиток разворачивается ----------
  const UNROLL_MS = 680;
  const ROLLUP_MS = 720;
  const HOLD = { direct: 1000, repeat: 300, handoff: 280, first: 1350 };

  // rect — прямоугольник баннера: свиток заставки начинается ровно с него (бумага и валики на своих местах)
  function makeScroll(layer, game, esc, rect = null) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    layer.innerHTML = `
      <div class="mh-scroll-paper">
        <i class="mh-scroll-tex"></i>
        <i class="mh-scroll-splash"></i>
        <div class="mh-scroll-title">${
          game.logo ? `<img src="${esc(game.logo)}" alt="${esc(game.title)}">` : `<span>${esc(game.title)}</span>`
        }</div>
        <span class="mh-scroll-seal" aria-hidden="true">狩</span>
        <div class="mh-scroll-petals" aria-hidden="true">${Array.from({ length: 12 }, (_, i) => `<i style="--x:${(i * 37 + 5) % 100}%;--d:${-((i * 0.7) % 6).toFixed(1)}s;--t:${(5 + (i % 4) * 1.2).toFixed(1)}s"></i>`).join("")}</div>
      </div>
      <i class="mh-scroll-roll l"></i><i class="mh-scroll-roll r"></i>`;
    const r = rect ?? { left: w / 2 - 40, right: w / 2 + 40, top: h / 2 - 100, bottom: h / 2 + 100 };
    return {
      layer,
      w,
      h,
      r,
      paper: layer.querySelector(".mh-scroll-paper"),
      rolls: [...layer.querySelectorAll(".mh-scroll-roll")],
    };
  }

  // разворот: свиток вырастает из баннера — сначала до высоты экрана, затем валики уезжают к краям
  function unroll(s, ms) {
    const { paper, rolls, w, h, r } = s;
    const opts = { duration: ms, easing: "cubic-bezier(0.5, 0, 0.25, 1)", fill: "forwards" };
    const pl = r.left + 22;
    const pr = r.right - 22;
    const midX = (pl + pr) / 2;
    const mid = (a, b, k) => a + (b - a) * k;
    // валик заставки (34 × 104vh, по центру экрана) встаёт на место валика баннера (24 × высота + 18)
    const rollH = h * 1.04;
    const sy = (r.bottom - r.top + 18) / rollH;
    const ty = (r.top + r.bottom) / 2 - h / 2;
    const roll = (cx0, cx1, edge) => [
      { transform: `translate(${cx0 - edge}px, ${ty}px) scale(0.71, ${sy})` },
      { transform: `translate(${mid(cx0, cx1, 0.25) - edge}px, 0px) scale(0.85, 1)`, offset: 0.4 },
      { transform: "translate(0, 0) scale(1, 1)" },
    ];
    const half = (x) => Math.max(0, x);
    return [
      paper.animate(
        [
          { clipPath: `inset(${half(r.top)}px ${half(w - pr)}px ${half(h - r.bottom)}px ${half(pl)}px)` },
          { clipPath: `inset(0px ${half(w - mid(pr, w, 0.25))}px 0px ${half(mid(pl, 0, 0.25))}px)`, offset: 0.4 },
          { clipPath: "inset(0px 0px 0px 0px)" },
        ],
        opts,
      ),
      rolls[0].animate(roll(r.left + 16, 17, 17), opts),
      rolls[1].animate(roll(r.right - 16, w - 17, w - 17), opts),
      // рисунок баннера растворяется в чистую бумагу, а не пропадает за кадр
      s.paper.querySelector(".mh-scroll-tex").animate([{ opacity: 0.15 }, { opacity: 1, offset: 0.3 }, { opacity: 1 }], { duration: ms, fill: "forwards" }),
    ];
  }

  // сворачивание: бумага скатывается с обоих краёв к центру, валики сходятся и гаснут
  function rollUp(s, ms) {
    const { paper, rolls, w } = s;
    const half = w / 2;
    const opts = { duration: ms, easing: "cubic-bezier(0.4, 0, 0.2, 1)", fill: "forwards" };
    return [
      paper.animate([{ clipPath: "inset(0px 0px 0px 0px)" }, { clipPath: `inset(0px ${half}px 0px ${half}px)` }], opts),
      rolls[0].animate([{ transform: "translateX(0)", opacity: 1 }, { transform: `translateX(${half - 17}px)`, opacity: 1, offset: 0.85 }, { transform: `translateX(${half - 17}px)`, opacity: 0 }], opts),
      rolls[1].animate([{ transform: "translateX(0)", opacity: 1 }, { transform: `translateX(${17 - half}px)`, opacity: 1, offset: 0.85 }, { transform: `translateX(${17 - half}px)`, opacity: 0 }], opts),
    ];
  }

  function seenBefore() {
    try {
      const seen = sessionStorage.getItem("mh-scroll") === "1";
      sessionStorage.setItem("mh-scroll", "1");
      return seen;
    } catch {
      return false;
    }
  }

  GameThemes.register("monster-hunter-rise", {
    // ---------- главная: свиток с валиками ----------
    // Композиция — как настоящее эмакимоно, которое читают справа налево: у правого валика на чистой бумаге
    // заглавие — логотип и счёт штрихами 正, левее арт проступает внутри мазка туши. Выделение — «квест
    // принят»: валики разъезжаются, мазок разгорается из туши в цвет, штрихи 正 дописываются кистью,
    // рядом со счётом ложится красная печать.
    banner(b) {
      const { done, total } = b.progress;
      const logo = b.art.logo('alt=""');
      b.el.innerHTML = `
        <span class="mh-ban-roll l" aria-hidden="true"></span>
        <span class="mh-ban">
          <span class="mh-ban-ink"><span class="mh-ban-art">${b.art.hero('alt="" loading="lazy"')}</span></span>
          <span class="mh-ban-title">
            ${logo ? `<span class="mh-ban-logo">${logo}</span>` : `<span class="mh-ban-name" aria-hidden="true">${b.esc(b.game.title)}</span>`}
            ${
              total
                ? `<span class="mh-ban-count" aria-hidden="true">${tallySvg(done, Math.min(total, 40), "mh-tally")}<span class="mh-ban-num"><b>${done}</b>/${total}</span><span class="mh-ban-seal">狩</span></span>`
                : `<span class="mh-ban-seal" aria-hidden="true">狩</span>`
            }
          </span>
          <span class="mh-sr">${b.esc(b.game.title)}. ${total ? `Выполнено ${done} из ${total} условий закрытия` : "Условия ещё не заданы"}</span>
        </span>
        <span class="mh-ban-roll r" aria-hidden="true"></span>`;
    },

    // ---------- главная: при наведении — представление монстра ----------
    // Через фон одним махом проходит огромный мазок кисти, в нём проступает арт в тонах туши, вокруг
    // разлетаются брызги красной туши и падают лепестки сакуры. Только CSS: анимации идут, пока у слоя .on.
    stage(s) {
      const petals = Array.from({ length: 18 }, (_, i) => `<i style="--x:${(i * 43 + 7) % 100}%;--d:${-((i * 0.9) % 9).toFixed(1)}s;--t:${(8 + (i % 5) * 1.6).toFixed(1)}s;--s:${8 + (i % 3) * 4}px"></i>`).join("");
      s.el.innerHTML = `
        <div class="mh-hv">
          <div class="mh-hv-sweep"><div class="mh-hv-ink">${s.art.hero('alt=""')}</div></div>
          <i class="mh-hv-splash a"></i><i class="mh-hv-splash b"></i><i class="mh-hv-splash c"></i>
          <div class="mh-hv-petals">${petals}</div>
        </div>`;
    },

    // ---------- главная: свиток разворачивается от баннера ----------
    cover(t) {
      const banner = document.querySelector('.gbanner[data-game="monster-hunter-rise"]')?.getBoundingClientRect();
      const s = makeScroll(t.layer("mh-scroll"), t.game, t.esc, banner);
      t.data.scroll = s;
      t.data.started = performance.now();
      t.data.seen = seenBefore();
      setTimeout(() => s.layer.classList.add("titled"), 230);
      return new Promise((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          resolve();
        };
        const anims = unroll(s, UNROLL_MS);
        anims[0].finished.then(finish, finish);
        setTimeout(finish, UNROLL_MS + 250);
      });
    },

    // ---------- страница игры — эмакимоно ----------
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
      let cur = -1;

      root.classList.add("mh");
      root.innerHTML = pageHtml();
      const $ = (q) => root.querySelector(q);
      const scroller = $(".mh-scroller");
      const panels = [...root.querySelectorAll(".mh-panel")];

      backdrop();
      if (total) {
        navigation();
        stamps();
        later(() => select(firstGoal(), false, false), 0);
      }
      intro();

      return () => root.classList.remove("mh");

      function firstGoal() {
        const i = items.findIndex((x) => !x.g.done);
        return i < 0 ? 0 : i;
      }

      // ---------- разметка ----------
      function pageHtml() {
        const logo = ctx.art.logo('alt=""');
        const nb = ctx.neighbors ?? {};
        const body = items
          .map(({ g, group }, i) => {
            const head = group !== items[i - 1]?.group && groups.length > 1 ? `<section class="mh-divider" aria-hidden="true"><span>${esc(group)}</span></section>` : "";
            return head + panelHtml(g, i);
          })
          .join("");
        return `
          <div class="mh-page ${total ? "" : "mh-page-empty"}">
            <div class="mh-scroller">
              <div class="mh-emaki">
                <section class="mh-head">
                  <a class="mh-head-logo" href="#/" aria-label="К списку игр">${logo || `<span class="mh-head-name">${esc(game.title)}</span>`}</a>
                  <h1 class="mh-sr">${esc(game.title)}</h1>
                  ${groups.length === 1 ? `<p class="mh-head-group">${esc(groups[0].title)}</p>` : ""}
                  ${
                    total
                      ? `<div class="mh-head-count" role="img" aria-label="Выполнено ${done} из ${total} условий закрытия">
                          ${tallySvg(done, total, "mh-tally mh-tally-big")}
                          <p class="mh-head-num" aria-hidden="true"><b>${done}</b>/${total}</p>
                        </div>
                        <p class="mh-head-hint" aria-hidden="true"><span class="mh-wide">Свиток листается колесом и стрелками</span><span class="mh-tall">Свиток листается вниз</span></p>`
                      : `<p class="mh-empty">Условия закрытия для этой игры ещё не заданы.</p>`
                  }
                </section>
                ${body}
                <section class="mh-tail">
                  <i class="mh-tail-splash" aria-hidden="true"></i>
                  <nav class="mh-tail-nav" aria-label="Другие игры">
                    ${nb.prev ? `<a href="${esc(nb.prev.href)}">◂ ${esc(nb.prev.title)}</a>` : ""}
                    ${nb.next ? `<a href="${esc(nb.next.href)}">${esc(nb.next.title)} ▸</a>` : ""}
                    <a href="#/" class="mh-tail-back"><span>К списку игр</span></a>
                  </nav>
                </section>
              </div>
            </div>
            <span class="mh-roll l" aria-hidden="true"></span><span class="mh-roll r" aria-hidden="true"></span>
            ${
              total
                ? `<div class="mh-thread" role="tablist" aria-label="Охоты на свитке">
                    <i class="mh-thread-line"></i><i class="mh-thread-zip"></i>
                    ${items.map(({ g }, i) => `<button type="button" class="mh-tick ${g.done ? "on" : ""}" style="--p:${total > 1 ? i / (total - 1) : 0.5}" data-i="${i}" role="tab" aria-selected="false" aria-label="№${esc(g.n)}. ${esc(g.title)}" tabindex="-1"></button>`).join("")}
                    <span class="mh-bug" aria-hidden="true"><i></i></span>
                  </div>`
                : ""
            }
            <footer class="mh-prompts">
              ${total ? `<span class="mh-prompt"><button type="button" class="mh-key" data-step="-1" aria-label="Предыдущее условие">◀</button><button type="button" class="mh-key" data-step="1" aria-label="Следующее условие">▶</button>Охота</span>` : ""}
              <a class="mh-prompt" href="#/"><span class="mh-key mh-key-esc"><span class="mh-kb">Esc</span><span class="mh-pad">←</span></span>Назад</a>
            </footer>
          </div>`;
      }

      function panelHtml(g, i) {
        const img = ctx.safeUrl(g.image);
        const fig = g.imageFit === "contain";
        const checklist = (g.checklist ?? [])
          .map(
            (c) => `
            <div class="mh-list">
              ${c.label ? `<h3>${esc(c.label)}</h3>` : ""}
              <ul>${(c.items ?? []).map((it) => `<li class="${it.done ? "on" : ""}"><i aria-hidden="true"></i><span>${esc(it.title)}</span></li>`).join("")}</ul>
            </div>`,
          )
          .join("");
        const gallery = (g.gallery ?? []).map(ctx.safeUrl).filter(Boolean);
        const link = ctx.safeUrl(g.link);
        return `
          <article class="mh-panel ${g.done ? "done" : ""} ${fig ? "fig" : "scene"} ${fig && gallery.length ? "duo" : ""}" data-i="${i}" tabindex="-1" aria-label="№${esc(g.n)}. ${esc(g.title)}${g.done ? ". Выполнено" : ""}">
            <span class="mh-num" aria-hidden="true">${esc(g.n)}</span>
            ${g.done ? `<span class="mh-done" aria-hidden="true"><b>済</b><small>выполнено</small></span>` : ""}
            <div class="mh-body">
              <div class="mh-pic" data-gallery>
                <i class="mh-pic-ink" aria-hidden="true"></i>
                ${img ? `<img class="mh-pic-main" src="${esc(img)}" alt="" loading="lazy" data-zoom data-caption="${esc(g.title)}">` : `<span class="mh-pic-blank" aria-hidden="true">${esc(g.n)}</span>`}
                ${fig ? gallery.slice(0, 2).map((u) => `<img class="mh-pic-mate" src="${esc(u)}" alt="" loading="lazy" data-zoom data-caption="${esc(g.title)}">`).join("") : ""}
              </div>
              <h2 class="mh-title">${nobreak(esc(g.title))}</h2>
              ${checklist}
              ${g.note ? `<blockquote class="mh-note">«${esc(g.note)}»</blockquote>` : ""}
              ${g.details ? `<p class="mh-details">${esc(g.details)}</p>` : ""}
              ${!fig && gallery.length ? `<div class="mh-gallery" data-gallery>${gallery.map((u) => `<img src="${esc(u)}" alt="" loading="lazy" data-zoom data-caption="${esc(g.title)}">`).join("")}</div>` : ""}
              ${link ? `<a class="mh-lore" href="${esc(link)}" target="_blank" rel="noopener">Подробнее ↗</a>` : ""}
            </div>
          </article>`;
      }

      // ---------- фон: тёмные доски Камуры, лепестки сакуры ----------
      function backdrop() {
        const bg = ctx.layer("mh-backdrop");
        bg.style.backgroundImage = `url("${assets}wood.webp")`;
        if (!motion) return;
        const p = ctx.layer("mh-petals");
        p.innerHTML = Array.from({ length: 14 }, (_, i) => `<i style="--x:${(i * 41 + 3) % 100}%;--d:${-((i * 1.3) % 12).toFixed(1)}s;--t:${(11 + (i % 5) * 2).toFixed(1)}s;--s:${7 + (i % 3) * 4}px"></i>`).join("");
      }

      // ---------- выбор охоты: прокрутка свитка, жук на нити ----------
      function select(i, user, scroll = true) {
        if (!total) return;
        const n = Math.max(0, Math.min(total - 1, i));
        const prev = cur;
        cur = n;
        panels.forEach((p, j) => p.classList.toggle("cur", j === n));
        root.querySelectorAll(".mh-tick").forEach((t, j) => t.setAttribute("aria-selected", String(j === n)));
        moveBug(prev, n, user);
        if (scroll) {
          const p = panels[n];
          if (narrow()) p.scrollIntoView({ block: "center", behavior: user && motion ? "smooth" : "auto" });
          else scroller.scrollTo({ left: p.offsetLeft - (scroller.clientWidth - p.offsetWidth) / 2, behavior: user && motion ? "smooth" : "auto" });
        }
        if (user) panels[n].focus({ preventScroll: true });
      }

      // жук-проволочник перелетает по нити; за ним на миг вспыхивает натянутая проволока
      function moveBug(from, to, user) {
        const bug = $(".mh-bug");
        if (!bug) return;
        const p = total > 1 ? to / (total - 1) : 0.5;
        bug.style.setProperty("--p", p);
        if (!user || !motion || from < 0 || from === to) return;
        const a = total > 1 ? from / (total - 1) : 0.5;
        const zip = $(".mh-thread-zip");
        zip.style.setProperty("--a", Math.min(a, p));
        zip.style.setProperty("--b", Math.max(a, p));
        zip.classList.remove("go");
        void zip.offsetWidth;
        zip.classList.add("go");
      }

      function navigation() {
        // колесо листает свиток вбок (на широком экране)
        ctx.listen(
          scroller,
          "wheel",
          (e) => {
            if (narrow() || e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
            e.preventDefault();
            scroller.scrollLeft += e.deltaY * (e.deltaMode === 1 ? 32 : 1);
          },
          { passive: false },
        );
        // текущая охота — та, что ближе к середине кадра
        let raf = 0;
        ctx.listen(
          narrow() ? window : scroller,
          "scroll",
          () => {
            if (raf) return;
            raf = requestAnimationFrame(() => {
              raf = 0;
              const mid = narrow() ? window.innerHeight / 2 : window.innerWidth / 2;
              let best = cur;
              let dist = Infinity;
              panels.forEach((p, j) => {
                const r = p.getBoundingClientRect();
                const c = narrow() ? r.top + r.height / 2 : r.left + r.width / 2;
                if (Math.abs(c - mid) < dist) (dist = Math.abs(c - mid)), (best = j);
              });
              if (best !== cur) select(best, false, false);
            });
          },
          { passive: true },
        );
        ctx.onCleanup(() => cancelAnimationFrame(raf));
        ctx.listen($(".mh-thread"), "click", (e) => {
          const t = e.target.closest(".mh-tick");
          if (t) select(+t.dataset.i, true);
        });
        ctx.listen($(".mh-prompts"), "click", (e) => {
          const b = e.target.closest("button[data-step]");
          if (b) select(cur + +b.dataset.step, true);
        });
        ctx.listen(scroller, "click", (e) => {
          const p = e.target.closest(".mh-panel");
          if (p && !e.target.closest("a, img[data-zoom]")) select(+p.dataset.i, true);
        });
        ctx.listen(window, "keydown", (e) => {
          if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector("dialog[open]")) return;
          if (e.target.closest?.("input, textarea, select, [contenteditable]")) return;
          const to = { ArrowRight: cur + 1, ArrowLeft: cur - 1, Home: 0, End: total - 1 }[e.key];
          if (to == null) return;
          e.preventDefault();
          select(to, true);
        });
      }

      // печать «済» ставится, когда выполненная охота впервые попадает в кадр
      function stamps() {
        const done = panels.filter((p) => p.classList.contains("done"));
        if (!motion || !("IntersectionObserver" in window)) {
          done.forEach((p) => p.classList.add("stamped"));
          return;
        }
        const io = new IntersectionObserver(
          (entries) => {
            for (const en of entries) {
              if (!en.isIntersecting) continue;
              io.unobserve(en.target);
              later(() => en.target.classList.add("stamped", "stamping"), 120);
            }
          },
          { root: narrow() ? null : scroller, threshold: 0.55 },
        );
        // пока закрыта заставка — не ставим: печать должна быть видна
        later(() => done.forEach((p) => io.observe(p)), ctx.handoff ? 1100 : 900);
        ctx.onCleanup(() => io.disconnect());
      }

      // ---------- вход: свиток сворачивается к центру ----------
      function intro() {
        const handed = ctx.handoff?.layers.find((l) => l.classList.contains("mh-scroll"));
        if (!motion) return handed?.remove();
        let s = handed && ctx.handoff.data?.scroll;
        let hold;
        if (s) {
          const since = performance.now() - (ctx.handoff.data.started ?? 0);
          hold = Math.max(HOLD.handoff, (ctx.handoff.data.seen ? 0 : HOLD.first) - since);
        } else {
          handed?.remove();
          s = makeScroll(ctx.layer("mh-scroll mh-direct titled"), game, esc);
          hold = seenBefore() ? HOLD.repeat : HOLD.direct;
        }
        const scroll = s;
        let started = false;
        let finished = false;
        const end = () => {
          if (finished) return;
          finished = true;
          scroll.layer.remove();
        };
        const open = () => {
          if (started || finished) return;
          started = true;
          const anims = rollUp(scroll, ROLLUP_MS);
          anims[0].finished.then(end, end);
          later(end, ROLLUP_MS + 500);
        };
        later(open, hold);
        ctx.onCleanup(end);
        for (const type of ["pointerdown", "keydown", "wheel"]) ctx.listen(window, type, open, { passive: true, once: true });
      }
    },
  });
})();
