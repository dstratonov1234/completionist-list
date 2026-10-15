// Fire Emblem Engage — «Карта сражения».
// Вход — момент «ENGAGE!»: синяя и красная панели (раскол волос Алеара) смыкаются по диагонали, вспыхивает
// кольцо Эмблемы, затем карточка с названием игры и панели разлетаются. С главной заставка начинается ещё на списке
// (cover): панели влетают поверх растворяющегося списка, а страница игры собирается уже под ними.
// Условия закрытия — тактическая карта: группы — секторы поля, цели — клетки с юнитами (выполненные —
// завербованы: в цвете, с кольцом; остальные — серые). По клеткам ходит фирменный курсор-рамка (стрелки, мышь,
// тап), выбор показывает окно юнита и «зону хода»; чек-лист — слоты колец. Прогресс — шкала Engage в панели-HUD
// над картой; искры за курсором.
(() => {
  "use strict";

  const FIELDS = [
    ["gives", "Что даёт"],
    ["needs", "Что потребуется"],
    ["unlock", "Открывается"],
    ["counts", "Как засчитываем"],
  ];
  const SPARK_COLORS = ["#ffe08a", "#f3c35c", "#8fc4ff", "#ff7a90"];
  // Сколько от начала заставки панели держат экран, прежде чем разлететься (повторный вход — быстрый темп).
  const HOLD = { full: 2500, quick: 1250 };
  // Когда панели сомкнулись и шов прочерчен (0.32s + 35% от 0.9s, × --k) — с этого момента экран закрыт.
  const SHUT = { full: 640, quick: 360 };

  // Заставка целиком лежит в одном слое; её CSS-анимации идут от момента создания, так что слой, начатый
  // на главной, просто доигрывает на странице игры.
  function engageMarkup(o, game, assets, esc) {
    o.innerHTML = `
      <div class="fe-eg-panel fe-eg-blue"><i></i></div>
      <div class="fe-eg-panel fe-eg-red"><i></i></div>
      <div class="fe-eg-seam"></div>
      <div class="fe-eg-flash"></div>
      <img class="fe-eg-burst" src="${assets}burst.webp" alt="">
      <img class="fe-eg-ring" src="${assets}ring.webp" alt="">
      <div class="fe-eg-word" data-text="ENGAGE">ENGAGE</div>
      <div class="fe-eg-card">
        <div class="fe-eg-title">${esc(game.title)}</div>
        <img class="fe-eg-rule" src="${assets}divider.webp" alt="">
      </div>`;
    // Диагональ шва — та же, что у краёв панелей (64% сверху → 36% снизу), угол зависит от пропорций экрана.
    const ang = (Math.atan2(0.28 * window.innerWidth, window.innerHeight) * 180) / Math.PI;
    o.style.setProperty("--ang", `${ang.toFixed(2)}deg`);
  }

  // Видел ли заставку в этой вкладке: повторные входы идут в быстром темпе.
  function seenBefore() {
    try {
      const seen = sessionStorage.getItem("fe-engage") === "1";
      sessionStorage.setItem("fe-engage", "1");
      return seen;
    } catch {
      return false; // приватный режим — каждый раз полная заставка
    }
  }

  GameThemes.register("fire-emblem-engage", {
    // Начало заставки ещё на главной: синяя и красная панели влетают поверх растворяющегося списка и смыкаются
    // по диагонали со вспышкой шва. Promise выполняется, когда экран закрыт; остальное доиграет page().
    cover(t) {
      const seen = seenBefore();
      const o = t.layer(`fe-engage${seen ? " fe-quick" : ""}`);
      engageMarkup(o, t.game, t.assets, t.esc);
      t.data.start = performance.now();
      t.data.seen = seen;
      return t.wait(seen ? SHUT.quick : SHUT.full);
    },

    page(ctx) {
      const { root, el, esc, assets, game } = ctx;
      const cond = ctx.conditions;
      const goals = ctx.goals();
      const total = goals.length;
      const done = goals.filter((g) => g.done).length;
      const motion = !ctx.reducedMotion;
      let alive = true;
      root.classList.add("fe");
      ctx.onCleanup(() => (alive = false));

      const sparks = sparkPool();
      entrance();
      heroFloor();
      hud();
      notes();
      const map = battleMap();

      return () => root.classList.remove("fe", "fe-hold", "fe-reveal");

      // ---------- вход: ENGAGE! ----------
      function entrance() {
        // Вход с главной: панели уже сомкнулись над списком (cover) — слой доигрывает кольцо, ENGAGE и карточку.
        const handed = ctx.handoff?.layers.find((l) => l.classList.contains("fe-engage")) ?? null;
        if (!motion) return handed?.remove();
        const seen = handed ? !!ctx.handoff.data?.seen : seenBefore();
        const start = (handed && ctx.handoff.data?.start) || performance.now();
        root.classList.add("fe-hold");
        let o = handed;
        if (!o) {
          o = ctx.layer(`fe-engage${seen ? " fe-quick" : ""}`);
          engageMarkup(o, game, assets, esc);
        }
        let out = false;
        let gone = 0;
        const finish = () => {
          if (out || !alive) return;
          out = true;
          // Пропуск в самом начале — панели ещё летят: просто гасим заставку, без разлёта.
          const early = performance.now() - start < (seen ? 260 : 480);
          o.classList.add("fe-out");
          if (early) o.classList.add("fe-fade");
          root.classList.remove("fe-hold");
          root.classList.add("fe-reveal");
          if (!early && sparks) {
            const cx = window.innerWidth / 2;
            const cy = window.innerHeight * 0.45;
            for (let i = 0; i < 18; i++) {
              const a = (i / 18) * Math.PI * 2;
              const d = Math.min(window.innerWidth, window.innerHeight) * (0.22 + Math.random() * 0.2);
              sparks.emit(cx, cy, Math.cos(a) * d, Math.sin(a) * d, 700 + Math.random() * 300, 1.4);
            }
          }
          gone = setTimeout(() => o.remove(), 750);
        };
        // Разлёт — в тот же момент от начала заставки, что и при прямом входе (с главной часть уже сыграна).
        const timer = setTimeout(finish, Math.max(120, (seen ? HOLD.quick : HOLD.full) - (performance.now() - start)));
        ctx.onCleanup(() => (clearTimeout(timer), clearTimeout(gone)));
        for (const type of ["pointerdown", "keydown", "wheel", "touchmove"]) ctx.listen(window, type, finish, { passive: true, once: true });
      }

      // ---------- пол-сетка тактической карты под баннером (повторён на .stage-layer в theme.css) ----------
      function heroFloor() {
        if (!el.hero) return;
        const floor = document.createElement("div");
        floor.className = "fe-floor";
        floor.setAttribute("aria-hidden", "true");
        el.hero.append(floor);
      }

      // ---------- HUD: шкала Engage вместо кольца ----------
      function hud() {
        const side = el.side;
        if (!side) return;
        side.classList.add("fe-hud");
        const ring = side.querySelector(".ring");
        if (!ring) return;
        const p = total ? done / total : 0;
        const full = total > 0 && done === total;
        const meter = document.createElement("div");
        meter.className = `fe-meter${full ? " fe-full" : ""}`;
        meter.setAttribute("role", "img");
        meter.setAttribute("aria-label", `Выполнено ${done} из ${total}`);
        meter.style.setProperty("--p", p.toFixed(4));
        meter.style.setProperty("--n", String(total > 0 && total <= 48 ? total : 1));
        if (total > 48) meter.classList.add("fe-smooth");
        meter.innerHTML = `
          <div class="fe-meter-dial" aria-hidden="true">
            <div class="fe-meter-track"></div>
            <div class="fe-meter-on"></div>
            <div class="fe-meter-gem"><i></i></div>
            <div class="fe-meter-count"><b>${done}</b><span>/${total}</span></div>
          </div>
          <div class="fe-meter-cap">
            <b>${full ? "ENGAGE!" : "Шкала Engage"}</b>
            <small>${full ? "Все условия закрытия выполнены" : `${Math.round(p * 100)}% условий закрытия`}</small>
          </div>`;
        ring.replaceWith(meter);
        side.querySelectorAll(".group-progress li").forEach((li) => {
          const b = li.querySelector("b");
          const [d, t] = (b?.textContent ?? "").split("/").map(Number);
          if (t && d === t) li.classList.add("fe-clear");
        });
      }

      // ---------- «условий ещё нет» — панель ----------
      function notes() {
        root.querySelector(".cond-none")?.classList.add("fe-none");
      }

      // ---------- тактическая карта ----------
      function battleMap() {
        const sections = ctx.groups();
        if (!cond || !sections.length || !total) return null;
        const groupsData = cond.groups ?? [];
        const byN = new Map();
        const groupOf = new Map();
        groupsData.forEach((gr, gi) => (gr.goals ?? []).forEach((g) => (byN.set(String(g.n), g), groupOf.set(String(g.n), gi))));

        const block = document.createElement("section");
        block.className = "fe-map-block";
        block.setAttribute("aria-label", "Карта условий закрытия");
        block.innerHTML = `
          <div class="fe-map">
            <div class="fe-field">
              <div class="fe-cursor" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
            </div>
            <aside class="fe-unit" id="fe-unit" data-gallery aria-label="Выбранное условие">
              <div class="fe-unit-frame" aria-hidden="true"></div>
              <div class="fe-unit-scroll" aria-live="polite"></div>
            </aside>
          </div>`;
        sections[0].before(block);
        const field = block.querySelector(".fe-field");
        const cursor = field.querySelector(".fe-cursor");
        const unit = block.querySelector(".fe-unit");
        const pane = unit.querySelector(".fe-unit-scroll");
        const dock = block.querySelector(".fe-map");

        sections.forEach((sec) => {
          const gi = Number(sec.dataset.group);
          const gr = groupsData[gi] ?? { goals: [] };
          const list = gr.goals ?? [];
          const d = list.filter((g) => g.done).length;
          const clear = list.length > 0 && d === list.length;
          sec.className = `cond-group fe-sector${clear ? " fe-clear" : ""}`;
          sec.innerHTML = `
            <h2 class="fe-sector-head">
              <span class="fe-sector-gem" aria-hidden="true"></span>
              <span class="sec-label">${esc(gr.title ?? "")}</span>
              <span class="fe-sector-count">${d}/${list.length}</span>
            </h2>
            ${gr.note ? `<p class="fe-sector-note">${esc(gr.note)}</p>` : ""}
            <div class="fe-tiles">${list.map(tileHtml).join("")}</div>`;
          field.insertBefore(sec, cursor);
        });

        const tiles = [...field.querySelectorAll(".fe-tile")];
        const tileByN = new Map(tiles.map((t) => [t.dataset.goal, t]));
        let cur = null;
        let hover = null;
        const narrow = window.matchMedia("(max-width: 820px)");

        // ---- курсор-рамка ----
        const place = (t, instant) => {
          if (!t || !alive) return;
          const f = field.getBoundingClientRect();
          const r = (t.querySelector(".fe-tile-art") ?? t).getBoundingClientRect();
          if (!r.width) return;
          cursor.classList.toggle("fe-instant", !!instant || !motion);
          cursor.style.width = `${r.width}px`;
          cursor.style.height = `${r.height}px`;
          cursor.style.transform = `translate3d(${(r.left - f.left).toFixed(1)}px, ${(r.top - f.top).toFixed(1)}px, 0)`;
          cursor.classList.add("on");
        };
        const target = () => hover ?? cur;

        // ---- окно юнита: на широком экране — справа (липкое), на узком — сразу под рядом выбранной клетки ----
        const dockUnit = () => {
          if (!cur) return;
          if (!narrow.matches) {
            if (unit.parentElement !== dock) dock.append(unit);
            unit.classList.remove("fe-inline");
            return;
          }
          const top = cur.offsetTop;
          let last = cur;
          for (let n = cur.nextElementSibling; n; n = n.nextElementSibling) {
            if (!n.classList.contains("fe-tile")) continue;
            if (Math.abs(n.offsetTop - top) > 2) break;
            last = n;
          }
          if (last.nextElementSibling !== unit) last.after(unit);
          unit.classList.add("fe-inline");
        };

        const select = (n, { focus = false, user = false } = {}) => {
          const t = tileByN.get(String(n));
          const g = byN.get(String(n));
          if (!t || !g) return;
          const changed = t !== cur;
          cur = t;
          for (const x of tiles) {
            const on = x === t;
            x.tabIndex = on ? 0 : -1;
            x.setAttribute("aria-current", on ? "true" : "false");
            x.classList.toggle("fe-sel", on);
          }
          if (changed) renderUnit(g);
          dockUnit();
          if (focus) t.focus({ preventScroll: true });
          if (focus || user) reveal(t);
          place(target(), false);
          if (user && changed && motion) {
            range(t);
            burst(t);
          }
        };

        // Показать выбранное: клетку, а на узком экране — и раскрывшееся под ней окно. На широком экране липкое окно
        // упирается в конец карты, и для нижних клеток его верх уходит за экран — тогда подкручиваем страницу вверх.
        const reveal = (t) => {
          const behavior = motion ? "smooth" : "auto";
          const vh = window.innerHeight;
          const r = t.getBoundingClientRect();
          if (narrow.matches) {
            const u = unit.getBoundingClientRect();
            const bottom = Math.max(r.bottom, Math.min(u.bottom, r.top + vh - 40));
            if (r.top < 12) window.scrollBy({ top: r.top - 12, behavior });
            else if (bottom > vh - 12) window.scrollBy({ top: Math.min(bottom - vh + 12, r.top - 12), behavior });
            return;
          }
          if (r.top < 12) return window.scrollBy({ top: r.top - 12, behavior });
          if (r.bottom > vh - 12) return window.scrollBy({ top: r.bottom - vh + 12, behavior });
          const u = unit.getBoundingClientRect();
          if (u.top < 0) {
            const up = Math.min(16 - u.top, vh - 12 - r.bottom);
            if (up > 4) window.scrollBy({ top: -up, behavior });
          }
        };

        // ---- «зона хода»: синие клетки расходятся ромбом от выбранной ----
        const range = (t) => {
          const grid = t.parentElement;
          const cells = [...grid.querySelectorAll(".fe-tile")];
          const pos = (x) => [Math.round(x.offsetLeft / Math.max(1, t.offsetWidth)), x.offsetTop];
          const rows = [...new Set(cells.map((x) => x.offsetTop))].sort((a, b) => a - b);
          const [c0, y0] = pos(t);
          const r0 = rows.indexOf(y0);
          for (const x of tiles) x.classList.remove("fe-range");
          void grid.offsetWidth;
          for (const x of cells) {
            if (x === t) continue;
            const [c, y] = pos(x);
            const d = Math.abs(c - c0) + Math.abs(rows.indexOf(y) - r0);
            if (d > 3) continue;
            x.style.setProperty("--d", String(d));
            x.classList.add("fe-range");
          }
        };

        // ---- искры при выборе ----
        const burst = (t) => {
          const r = t.getBoundingClientRect();
          const cx = r.left + r.width / 2;
          const cy = r.top + r.height / 2;
          for (let i = 0; i < 10; i++) {
            const a = (i / 10) * Math.PI * 2 + Math.random() * 0.4;
            const dist = r.width * (0.45 + Math.random() * 0.35);
            sparks?.emit(cx, cy, Math.cos(a) * dist, Math.sin(a) * dist, 620 + Math.random() * 260, 1.1);
          }
        };

        // ---- рендер окна юнита ----
        function renderUnit(g) {
          const gi = groupOf.get(String(g.n));
          const gTitle = groupsData[gi]?.title ?? "";
          const img = ctx.safeUrl(g.image);
          const idx = goals.findIndex((x) => String(x.n) === String(g.n));
          const facts = FIELDS.filter(([k]) => g[k])
            .map(([k, l]) => `<div class="fe-stat" data-field="${k}"><dt>${l}</dt><dd>${esc(g[k])}</dd></div>`)
            .concat((g.extra ?? []).map((x) => `<div class="fe-stat"><dt>${esc(x.label)}</dt><dd>${esc(x.value)}</dd></div>`))
            .join("");
          const gallery = (g.gallery ?? []).map(ctx.safeUrl).filter(Boolean);
          unit.classList.toggle("fe-done", !!g.done);
          pane.innerHTML = `
            <div class="fe-unit-bar">
              <span class="fe-unit-class">${esc(gTitle)}</span>
              ${
                total > 1
                  ? `<span class="fe-unit-nav">
                       <button type="button" class="fe-step" data-step="-1" aria-label="Предыдущее условие">◀</button>
                       <span class="fe-unit-pos">${idx + 1}/${total}</span>
                       <button type="button" class="fe-step" data-step="1" aria-label="Следующее условие">▶</button>
                     </span>`
                  : ""
              }
            </div>
            <header class="fe-unit-head">
              <div class="fe-unit-art${img ? "" : " fe-noimg"}">
                ${img ? `<img src="${esc(img)}" alt="${esc(g.title)}" data-zoom data-caption="${esc(g.title)}">` : ""}
                <span class="fe-unit-glyph" aria-hidden="true"><b>${esc(g.n)}</b></span>
                ${g.done ? `<img class="fe-unit-ring" src="${assets}ring.webp" alt="" aria-hidden="true">` : ""}
              </div>
              <div class="fe-unit-plate">
                <span class="fe-unit-n">№${esc(g.n)}</span>
                <h3 class="fe-unit-title">${esc(g.title)}</h3>
              </div>
            </header>
            <div class="fe-unit-state">${
              g.done
                ? `<span class="fe-badge fe-badge-done">✓ Выполнено</span>`
                : `<span class="fe-badge">Не выполнено</span>`
            }</div>
            ${facts ? `<dl class="fe-stats">${facts}</dl>` : ""}
            ${ringsHtml(g)}
            ${g.note ? `<blockquote class="fe-talk"><span class="fe-talk-name">Заметка</span>${esc(g.note)}</blockquote>` : ""}
            ${g.details ? `<p class="fe-unit-details">${esc(g.details)}</p>` : ""}
            ${gallery.length ? `<div class="fe-unit-gallery">${gallery.map((u) => `<img src="${esc(u)}" alt="" loading="lazy" data-zoom data-caption="${esc(g.title)}">`).join("")}</div>` : ""}
            ${ctx.safeUrl(g.link) ? `<a class="fe-unit-link" href="${esc(g.link)}" target="_blank" rel="noopener">Подробнее ↗</a>` : ""}`;
          pane.scrollTop = 0;
          if (motion) {
            pane.classList.remove("fe-swap");
            void pane.offsetWidth;
            pane.classList.add("fe-swap");
          }
        }

        // ---- события ----
        // Клик мышью/тапом сначала даёт focusin — его пропускаем, чтобы выбор (с «зоной хода») сделал сам клик.
        let pressing = false;
        ctx.listen(field, "pointerdown", () => (pressing = true));
        ctx.listen(window, "pointerup", () => setTimeout(() => (pressing = false)));
        ctx.listen(field, "click", (e) => {
          pressing = false;
          const t = e.target.closest(".fe-tile");
          if (t) select(t.dataset.goal, { user: true });
        });
        ctx.listen(unit, "click", (e) => {
          const b = e.target.closest(".fe-step");
          if (!b || !cur) return;
          const i = tiles.indexOf(cur);
          const next = tiles[(i + Number(b.dataset.step) + tiles.length) % tiles.length];
          select(next.dataset.goal, { user: true });
          unit.querySelector(`.fe-step[data-step="${b.dataset.step}"]`)?.focus({ preventScroll: true });
        });
        ctx.listen(field, "pointerover", (e) => {
          if (e.pointerType !== "mouse") return;
          const t = e.target.closest(".fe-tile");
          if (!t || t === hover) return;
          hover = t;
          place(t, false);
        });
        ctx.listen(field, "pointerleave", () => {
          hover = null;
          place(cur, false);
        });
        ctx.listen(field, "focusin", (e) => {
          const t = e.target.closest(".fe-tile");
          if (t && t !== cur && !pressing) select(t.dataset.goal);
        });
        ctx.listen(field, "keydown", (e) => {
          const t = e.target.closest(".fe-tile");
          if (!t) return;
          let next = null;
          const i = tiles.indexOf(t);
          if (e.key === "ArrowRight") next = tiles[i + 1] ?? tiles[0];
          else if (e.key === "ArrowLeft") next = tiles[i - 1] ?? tiles[tiles.length - 1];
          else if (e.key === "ArrowDown" || e.key === "ArrowUp") next = vertical(t, e.key === "ArrowDown" ? 1 : -1);
          else if (e.key === "Home") next = tiles[0];
          else if (e.key === "End") next = tiles[tiles.length - 1];
          else if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            select(t.dataset.goal, { user: true });
            return;
          }
          if (!next) return;
          e.preventDefault();
          hover = null;
          select(next.dataset.goal, { focus: true, user: true });
        });
        // Клетка сверху/снизу — по геометрии, сквозь все секторы.
        const vertical = (t, dir) => {
          const r = t.getBoundingClientRect();
          const cx = r.left + r.width / 2;
          let best = null;
          let bestDy = Infinity;
          let bestDx = Infinity;
          for (const x of tiles) {
            if (x === t) continue;
            const q = x.getBoundingClientRect();
            const dy = (q.top - r.top) * dir;
            if (dy < 4) continue;
            const dx = Math.abs(q.left + q.width / 2 - cx);
            if (dy < bestDy - 4 || (Math.abs(dy - bestDy) <= 4 && dx < bestDx)) {
              best = x;
              bestDy = dy;
              bestDx = dx;
            }
          }
          return best;
        };

        // Картинка не загрузилась — на клетке остаётся ромб с номером.
        ctx.listen(
          block,
          "error",
          (e) => {
            const img = e.target;
            if (!(img instanceof HTMLImageElement)) return;
            const art = img.closest(".fe-tile-art, .fe-unit-art");
            if (art && !img.classList.contains("fe-unit-ring")) {
              art.classList.add("fe-noimg");
              img.remove();
            }
          },
          true,
        );

        // Группы в HUD: прокрутка к сектору делает app.js, а мы ставим курсор на первую цель группы.
        if (el.side) {
          ctx.listen(el.side, "click", (e) => {
            const a = e.target.closest("[data-jump]");
            const first = a && groupsData[Number(a.dataset.jump)]?.goals?.[0];
            if (first) select(first.n);
          });
        }

        const relayout = () => {
          dockUnit();
          place(target(), true);
        };
        const ro = new ResizeObserver(() => relayout());
        ro.observe(field);
        ctx.onCleanup(() => ro.disconnect());
        ctx.listen(narrow, "change", relayout);

        // Сначала — последнее выполненное условие, иначе первое.
        const lastDone = goals.filter((g) => g.done).sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")))[0];
        select((lastDone ?? goals[0]).n);
        place(cur, true);

        return { field };
      }

      function tileHtml(g) {
        const img = ctx.safeUrl(g.image);
        const items = (g.checklist ?? []).flatMap((c) => c.items ?? []);
        const itemsDone = items.filter((x) => x.done).length;
        return `
          <button type="button" class="fe-tile ${g.done ? "fe-ok" : "fe-todo"}" data-goal="${esc(g.n)}" id="goal-${esc(g.n)}"
                  tabindex="-1" aria-current="false" aria-controls="fe-unit" style="--i:${Number(g.n) || 0}">
            <span class="fe-tile-art${img ? "" : " fe-noimg"}" aria-hidden="true">
              ${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : ""}
              <span class="fe-tile-glyph"><b>${esc(g.n)}</b></span>
              ${items.length ? `<span class="fe-tile-hp" style="--hp:${(itemsDone / items.length).toFixed(3)}"><i></i><em>${itemsDone}/${items.length}</em></span>` : ""}
            </span>
            <span class="fe-tile-n" aria-hidden="true">${esc(g.n)}</span>
            ${g.done ? `<span class="fe-tile-ring" aria-hidden="true"></span><span class="fe-tile-shine" aria-hidden="true"></span>` : ""}
            <span class="fe-tile-name">${esc(g.title)}</span>
            <span class="sr-only">, условие №${esc(g.n)} — ${g.done ? "выполнено" : "не выполнено"}</span>
          </button>`;
      }

      function ringsHtml(g) {
        const groups = (g.checklist ?? []).filter((c) => (c.items ?? []).length);
        if (!groups.length) return "";
        const items = groups.flatMap((c) => c.items);
        const d = items.filter((x) => x.done).length;
        return `
          <div class="fe-rings">
            <div class="fe-rings-head"><span>Чек-лист</span><b>${d}/${items.length}</b></div>
            ${groups
              .map(
                (c) => `
              <div class="fe-rings-group">
                ${c.label ? `<div class="fe-rings-label">${esc(c.label)}</div>` : ""}
                <ul>${c.items
                  .map(
                    (it) =>
                      `<li class="${it.done ? "on" : ""}"><i class="fe-slot" aria-hidden="true"></i><span>${esc(it.title)}</span><span class="sr-only">${it.done ? " — выполнено" : " — не выполнено"}</span></li>`,
                  )
                  .join("")}</ul>
              </div>`,
              )
              .join("")}
          </div>`;
      }

      // ---------- искры: пул из 24 ромбиков, анимация через Web Animations ----------
      function sparkPool() {
        if (!motion || typeof Element.prototype.animate !== "function") return null;
        const layer = ctx.layer("fe-sparks");
        const pool = Array.from({ length: 24 }, (_, i) => {
          const s = document.createElement("i");
          s.style.background = SPARK_COLORS[i % SPARK_COLORS.length];
          layer.append(s);
          return s;
        });
        let k = 0;
        const emit = (x, y, dx, dy, ms = 700, size = 1) => {
          const s = pool[k++ % pool.length];
          s.getAnimations().forEach((a) => a.cancel());
          s.animate(
            [
              { transform: `translate3d(${x}px, ${y}px, 0) rotate(45deg) scale(${size})`, opacity: 1 },
              { transform: `translate3d(${x + dx}px, ${y + dy}px, 0) rotate(45deg) scale(0)`, opacity: 0 },
            ],
            { duration: ms, easing: "cubic-bezier(.2,.7,.3,1)", fill: "forwards" },
          );
        };
        // След за курсором — только над картой и только с мышью.
        if (ctx.finePointer) {
          let last = 0;
          ctx.listen(
            document,
            "pointermove",
            (e) => {
              if (e.pointerType !== "mouse" || !map?.field) return;
              const now = performance.now();
              if (now - last < 45 || !map.field.contains(e.target)) return;
              last = now;
              emit(e.clientX + (Math.random() - 0.5) * 10, e.clientY + (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 30, 14 + Math.random() * 22, 650, 0.8);
            },
            { passive: true },
          );
        }
        return { emit };
      }
    },
  });
})();
