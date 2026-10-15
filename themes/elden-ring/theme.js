// Elden Ring — «Свет благодати».
// Заставка как карточка новой области (золотое имя на чёрном, тонкие линии), лучи благодати в баннере,
// группы условий закрытия — экраны инвентаря (сетка ячеек + панель описания, у выполненных —
// «ВРАГ ПОВЕРЖЕН»), золотой сигил прогресса, искры благодати за курсором и при касании, руины в дымке.
// Заголовки секций, панели, отчёт и карточка в списке — в theme.css.
(() => {
  "use strict";

  const SUBTITLE = {
    in_progress: "Благодать указывает путь",
    completed: "Путь завершён",
    planned: "Путь ещё впереди",
    dropped: "Благодать угасла",
  };

  GameThemes.register("elden-ring", {
    page(ctx) {
      const { root, el, esc, assets, game } = ctx;
      root.classList.add("er");

      intro();
      rays();
      const bg = backdrop();
      sigil();
      inventories();
      const motes = graceMotes();

      // Один rAF-цикл на всё: параллакс фона и искры благодати.
      if (!ctx.reducedMotion) {
        let lastY = -1;
        ctx.loop((now, dt) => {
          const y = window.scrollY;
          if (y !== lastY) {
            lastY = y;
            const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
            bg.style.transform = `translate3d(0, ${(-Math.min(1, y / max) * 80).toFixed(1)}px, 0)`;
          }
          motes?.step(now, dt);
        });
      }

      return () => root.classList.remove("er", "er-veiled");

      // ---------- заставка: имя области золотом на чёрном ----------
      function intro() {
        if (ctx.reducedMotion) return;
        // Первый заход за сессию — с чёрным экраном, повторные — только карточка поверх страницы.
        let seen = false;
        try {
          seen = sessionStorage.getItem("er-intro") === "1";
          sessionStorage.setItem("er-intro", "1");
        } catch {
          /* приватный режим — просто показываем полную заставку */
        }
        const veil = !seen;
        let sub = SUBTITLE[game.status] ?? "";
        const goals = ctx.goals?.() ?? [];
        if (game.status === "in_progress" && goals.length) sub += ` · ${goals.filter((x) => x?.done).length} из ${goals.length}`;

        const card = ctx.layer(`er-intro${veil ? " er-veil" : ""}`);
        card.innerHTML = `
          <div class="er-intro-card">
            <div class="er-intro-title">${esc(game.title)}</div>
            <img class="er-intro-rule" src="${assets}divider.webp" alt="">
            ${sub ? `<div class="er-intro-sub">${esc(sub)}</div>` : ""}
          </div>`;
        if (veil) root.classList.add("er-veiled");

        let done = false;
        const timers = [];
        const finish = (skip) => {
          if (done) return;
          done = true;
          card.classList.add("er-out");
          // При пропуске страница появляется сразу; иначе доигрывает подъём из темноты.
          if (skip) {
            card.classList.add("er-skip");
            root.classList.remove("er-veiled");
          }
          timers.push(setTimeout(() => card.remove(), skip ? 450 : 1000));
        };
        timers.push(setTimeout(() => finish(false), veil ? 3000 : 2400));
        // Пропуск: любой клик, касание, клавиша или прокрутка.
        for (const type of ["pointerdown", "keydown", "wheel", "touchstart"]) {
          ctx.listen(window, type, () => finish(true), { passive: true });
        }
        ctx.onCleanup(() => timers.forEach(clearTimeout));
      }

      // ---------- лучи благодати поверх арта баннера ----------
      function rays() {
        const media = el.hero?.querySelector(".hero-media");
        if (!media) return;
        const r = ctx.layer("er-rays", media);
        r.style.backgroundImage = `url("${assets}grace.webp")`;
      }

      // ---------- руины в золотой дымке за контентом ----------
      function backdrop() {
        const b = ctx.layer("er-backdrop");
        b.style.backgroundImage = `url("${assets}backdrop.webp")`;
        return b;
      }

      // ---------- сигил прогресса: концентрические кольца вокруг числа ----------
      // Берёт кольцо прогресса сайта (.ring с --p и .ring-text) или, в старой разметке, .side-progress.
      function sigil() {
        const side = el.side;
        if (!side) return;
        let target, p, label, center;
        const ring = side.querySelector(".ring");
        if (ring) {
          p = parseFloat(ring.style.getPropertyValue("--p"));
          label = ring.getAttribute("aria-label") ?? "";
          center = ring.querySelector(".ring-text");
          target = ring;
        } else {
          const box = side.querySelector(".side-progress");
          if (!box || game.progress == null) return;
          const pct = Math.round(Number(game.progress) || 0);
          p = pct / 100;
          label = `Прогресс ${pct}%`;
          center = document.createElement("div");
          center.innerHTML = `<b>${pct}</b><small>%</small>`;
          target = box;
        }
        if (!Number.isFinite(p)) return;
        p = Math.max(0, Math.min(1, p));
        const a = p * Math.PI * 2 - Math.PI / 2;
        const tip = { x: (100 + 78 * Math.cos(a)).toFixed(2), y: (100 + 78 * Math.sin(a)).toFixed(2) };
        const diamonds = [0, 90, 180, 270]
          .map((d) => `<path d="M100 1.5 104 6 100 10.5 96 6Z" transform="rotate(${d} 100 100)"/>`)
          .join("");
        const s = document.createElement("div");
        s.className = "er-sigil";
        s.setAttribute("role", "img");
        s.setAttribute("aria-label", label);
        s.innerHTML = `
          <div class="er-sigil-ring">
            <svg viewBox="0 0 200 200" aria-hidden="true">
              <circle class="er-s-line" cx="100" cy="100" r="96"/>
              <g class="er-s-diamonds">${diamonds}</g>
              <g class="er-s-spin"><circle class="er-s-ticks" cx="100" cy="100" r="89" pathLength="360"/></g>
              <circle class="er-s-track" cx="100" cy="100" r="78"/>
              <circle class="er-s-arc" cx="100" cy="100" r="78" pathLength="1000" stroke-dashoffset="${(1000 * (1 - p)).toFixed(1)}" transform="rotate(-90 100 100)"/>
              ${p > 0 ? `<circle class="er-s-tip" cx="${tip.x}" cy="${tip.y}" r="3.4"/>` : ""}
              <g class="er-s-spin-rev"><circle class="er-s-runes" cx="100" cy="100" r="66" pathLength="120"/></g>
              <circle class="er-s-line" cx="100" cy="100" r="58"/>
              <path class="er-s-star" d="M100 50 150 100 100 150 50 100Z M64.6 64.6H135.4V135.4H64.6Z"/>
            </svg>
            <div class="er-sigil-num"></div>
          </div>`;
        // Цифры переносим узлами из разметки сайта — без повторной сборки HTML из данных.
        if (center) s.querySelector(".er-sigil-num").append(...center.childNodes);
        target.replaceWith(s);
      }

      // ---------- группы условий как экран инвентаря: сетка ячеек + панель описания ----------
      // Карточки целей (.cond) сайта переезжают в панель описания целиком (со всеми фактами, чек-листом,
      // заметкой, галереей), видна одна — выбранная. Ячейки — listbox с перемещением стрелками.
      function inventories() {
        const groups = ctx.groups?.() ?? [...root.querySelectorAll(".cond-group")];
        const byN = new Map((ctx.goals?.() ?? []).map((g) => [String(g?.n), g]));
        groups.forEach((sec, gi) => inventory(sec, gi, byN));
      }

      function inventory(sec, gi, byN) {
        const list = sec.querySelector(".cond-list");
        const items = list ? [...list.children].filter((x) => x.matches(".cond[data-goal]")) : [];
        if (!items.length) return;
        const groupTitle = sec.querySelector(".sec-label")?.textContent?.trim() ?? "";
        const COLS = 5;
        const empty = Math.max(COLS * 2, Math.ceil(items.length / COLS) * COLS) - items.length;
        const panelId = `er-panel-${gi}`;

        const slots = items.map((art, i) => {
          const goal = byN.get(art.dataset.goal) ?? {};
          const done = art.classList.contains("done");
          const title = goal.title ?? art.querySelector(".cond-title")?.textContent ?? "";
          const n = goal.n ?? art.dataset.goal;
          const img = ctx.safeUrl(goal.image);
          return `
            <li role="option" class="er-slot ${done ? "er-done" : "er-todo"}" data-i="${i}" tabindex="${i ? -1 : 0}" aria-selected="false"
                aria-label="${esc(`№${n}. ${title} — ${done ? "выполнено" : "не выполнено"}`)}">
              <span class="er-slot-art">${img ? `<img src="${esc(img)}" alt="" loading="lazy" data-fallbacks="">` : ""}<b>${esc(n)}</b></span>
            </li>`;
        });

        const inv = document.createElement("div");
        inv.className = "er-inv";
        inv.innerHTML = `
          <div class="er-inv-in">
            <div class="er-inv-grid">
              <ol class="er-slots" role="listbox" aria-label="${esc(groupTitle || "Цели")}" aria-controls="${panelId}">
                ${slots.join("")}
                ${'<li class="er-slot er-empty" role="none" aria-hidden="true"></li>'.repeat(empty)}
              </ol>
              <p class="er-inv-hint" aria-hidden="true">${ctx.finePointer ? "<kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd><kbd>↓</kbd> выбор" : "Коснись ячейки"}</p>
            </div>
            <div class="er-inv-panel" id="${panelId}"></div>
          </div>`;
        const panel = inv.querySelector(".er-inv-panel");
        panel.append(...items);
        list.replaceWith(inv);

        const ol = inv.querySelector(".er-slots");
        const opts = [...ol.querySelectorAll('[role="option"]')];
        let cur = -1;
        let fanfareTimer = 0;
        ctx.onCleanup(() => clearTimeout(fanfareTimer));

        const select = (i, { focus = false, fanfare = false } = {}) => {
          if (i < 0 || i >= opts.length) return;
          if (focus) opts[i].focus({ preventScroll: false });
          if (i !== cur) {
            cur = i;
            opts.forEach((o, j) => {
              o.setAttribute("aria-selected", String(i === j));
              o.tabIndex = i === j ? 0 : -1;
            });
            items.forEach((a, j) => (a.hidden = i !== j));
            if (!ctx.reducedMotion) {
              items[i].classList.remove("er-enter");
              void items[i].offsetWidth;
              items[i].classList.add("er-enter");
            }
          }
          if (fanfare) felled(items[i]);
        };

        // «ВРАГ ПОВЕРЖЕН»: золотая надпись на тёмной полосе поверх картинки выполненной цели.
        // Небольшая задержка — чтобы при быстром проходе курсором по ячейкам не мигало.
        const felled = (art) => {
          clearTimeout(fanfareTimer);
          if (ctx.reducedMotion || !art.classList.contains("done")) return;
          fanfareTimer = setTimeout(() => {
            const host = art.querySelector(".cond-media") ?? art;
            host.querySelector(".er-felled")?.remove();
            const goal = byN.get(art.dataset.goal) ?? {};
            const enemy = /поверж|повергн|убит|побежд|сразил/i.test(`${goal.counts ?? ""} ${goal.title ?? ""}`);
            const text = enemy ? "Враг повержен" : "Цель достигнута";
            const b = document.createElement("div");
            b.className = "er-felled";
            b.setAttribute("aria-hidden", "true");
            b.innerHTML = `<span class="er-felled-text">${text}</span><span class="er-felled-ghost">${text}</span>`;
            host.append(b);
            b.addEventListener("animationend", (e) => e.target === b && b.remove());
            const gone = setTimeout(() => b.remove(), 3200); // на случай, если анимация не доиграла
            ctx.onCleanup(() => clearTimeout(gone));
          }, 160);
        };

        ctx.listen(ol, "click", (e) => {
          const li = e.target.closest('[role="option"]');
          if (li) select(+li.dataset.i, { focus: true, fanfare: true });
        });
        if (ctx.finePointer) {
          ctx.listen(ol, "mouseover", (e) => {
            const li = e.target.closest('[role="option"]');
            if (li && +li.dataset.i !== cur) select(+li.dataset.i, { fanfare: true });
          });
        }
        ctx.listen(ol, "keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            felled(items[cur]);
            return;
          }
          const cols = getComputedStyle(ol).gridTemplateColumns.split(" ").filter(Boolean).length || COLS;
          const last = opts.length - 1;
          let j = { ArrowRight: cur + 1, ArrowLeft: cur - 1, ArrowDown: cur + cols, ArrowUp: cur - cols, Home: 0, End: last }[e.key];
          if (j == null) return;
          e.preventDefault();
          if (e.key === "ArrowDown" && j > last) j = Math.floor(last / cols) > Math.floor(cur / cols) ? last : cur;
          if (j < 0 || j > last) return;
          select(j, { focus: true, fanfare: true });
        });

        select(0);
      }

      // ---------- искры благодати: шлейф за курсором и вспышка при касании ----------
      function graceMotes() {
        if (ctx.reducedMotion) return null;
        const layer = ctx.layer("er-motes");
        const pool = Array.from({ length: 48 }, () => {
          const i = document.createElement("i");
          layer.append(i);
          return { el: i, t: 1, life: 0, x: 0, y: 0, vx: 0, vy: 0, s: 1, a: 1, ph: 0 };
        });
        let next = 0;
        let alive = 0;
        const rand = (lo, hi) => lo + Math.random() * (hi - lo);

        const spawn = (x, y, vx, vy, life, s) => {
          const m = pool[next];
          next = (next + 1) % pool.length;
          Object.assign(m, { x, y, vx, vy, life, s, t: 0, a: rand(0.65, 1), ph: Math.random() * 6.28 });
          alive++;
        };

        if (ctx.finePointer) {
          let lx = -1e4, ly = -1e4, lt = 0;
          ctx.listen(
            window,
            "pointermove",
            (e) => {
              if (e.pointerType !== "mouse") return;
              const now = performance.now();
              if (Math.hypot(e.clientX - lx, e.clientY - ly) < 16 || now - lt < 28) return;
              lx = e.clientX;
              ly = e.clientY;
              lt = now;
              spawn(e.clientX + rand(-4, 4), e.clientY + rand(-4, 4), rand(-14, 14), rand(-48, -18), rand(0.9, 1.6), rand(0.5, 1));
            },
            { passive: true },
          );
        }
        ctx.listen(
          window,
          "pointerdown",
          (e) => {
            for (let k = 0; k < 12; k++) {
              const ang = rand(0, Math.PI * 2);
              const sp = rand(35, 110);
              spawn(e.clientX, e.clientY, Math.cos(ang) * sp, Math.sin(ang) * sp * 0.6 - 40, rand(0.7, 1.3), rand(0.6, 1.15));
            }
          },
          { passive: true },
        );

        return {
          step(now, dt) {
            if (!alive) return;
            alive = 0;
            for (const m of pool) {
              if (m.t >= m.life) continue;
              m.t += dt;
              if (m.t >= m.life) {
                m.el.style.opacity = "0";
                continue;
              }
              alive++;
              const k = m.t / m.life;
              m.vx *= 1 - 1.8 * dt;
              m.vy = m.vy * (1 - 1.2 * dt) - 22 * dt;
              m.x += (m.vx + Math.sin(now / 380 + m.ph) * 9) * dt;
              m.y += m.vy * dt;
              const o = (k < 0.15 ? k / 0.15 : (1 - k) / 0.85) * m.a;
              m.el.style.transform = `translate3d(${m.x.toFixed(1)}px, ${m.y.toFixed(1)}px, 0) scale(${(m.s * (1 - k * 0.45)).toFixed(3)})`;
              m.el.style.opacity = o.toFixed(3);
            }
          },
        };
      }
    },
  });
})();
