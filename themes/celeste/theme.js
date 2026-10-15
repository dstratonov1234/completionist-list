// Celeste — «Гора»: условия закрытия как восхождение.
// Все цели — отметки на тропе вверх по пиксельной горе (выполненные — с флагом, впереди — пустые);
// выбор отметки открывает её «открытку» с маркой и штемпелем; общий прогресс — высота подъёма
// (кристальное сердце на тропе, мини-гора в боковой панели), на вершине ждёт золотая клубника.
// Вход — пиксельная шторка: по клику на баннер она наползает вверх по склону ещё на главной (cover),
// а на странице игры рассыпается дальше вверх по склону; фон — ночное пиксельное небо с горами;
// курсор оставляет след рывка цветами волос (быстро — синий «рывок»), клик — пиксельный взрыв.
// Один rAF-цикл на всё; при prefers-reduced-motion — без анимаций и курсорных эффектов.
(() => {
  "use strict";

  const HAIR = { red: "#d6455e", pink: "#ff6f91", blue: "#5fcde4", gold: "#ffd36e", snow: "#fff4fb" };
  const HEX = /^#[0-9a-f]{6}$/i;
  const COLOR = /^#[0-9a-f]{3,8}$/i;
  const FONT = /^[\w\s-]+$/;

  // Шторка: наползает за FILL с, держит карточку HOLD с и рассыпается за DUR с; фронт идёт шагами по 1/24.
  const FILL = 0.65;
  const DUR = 0.8;
  const HOLD = { direct: 0.5, handoff: 0.3 };
  const STEPS = 24;

  const FIELDS = [
    ["gives", "Что даёт"],
    ["needs", "Что потребуется"],
    ["unlock", "Открывается"],
    ["counts", "Как засчитываем"],
  ];

  GameThemes.register("celeste", {
    // Начало входа ещё на главной: по клику шторка наползает вверх по склону поверх гаснущего списка,
    // в середине проявляется карточка с названием. Promise выполняется, когда экран закрыт целиком;
    // дальше ту же шторку (t.data.wipe) рассыпает page().
    cover(t) {
      const w = buildWipe(t.layer("ce-wipe ce-cover"), t.game, t.esc);
      if (!w) return t.wait(450);
      t.data.wipe = w;
      return new Promise((resolve) => {
        let t0 = null;
        let lastStep = -1;
        let over = false;
        const finish = (full) => {
          if (over) return;
          over = true;
          clearTimeout(fallback);
          if (full) w.paint(w.end, true);
          resolve();
        };
        // Страховка: если кадры не идут (вкладка в фоне), экран всё равно закрывается вовремя.
        const fallback = setTimeout(() => finish(true), FILL * 1000 + 300);
        const tick = (now) => {
          if (over) return;
          if (!w.layer.isConnected) return finish(false);
          t0 ??= now;
          const p = ((now - t0) / 1000 / FILL) * w.end;
          if (p >= w.end) return finish(true);
          const step = Math.floor(p * STEPS);
          if (step !== lastStep) {
            lastStep = step;
            w.paint(step / STEPS, true);
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    },

    page(ctx) {
      const { root, game, esc, assets } = ctx;
      root.classList.add("ce");
      const undo = [];

      const steps = collect(ctx.conditions);
      const climbApi = climb(ctx, steps);
      altimeter(ctx, steps);
      sideJump(ctx, steps, climbApi);
      segmentBars(ctx);

      const tickers = [sky(ctx), entrance(ctx), dash(ctx)].filter(Boolean);
      if (tickers.length) ctx.loop((now, dt) => tickers.forEach((t) => t(now, dt)));

      return () => {
        undo.reverse().forEach((fn) => fn());
        root.classList.remove("ce");
      };

      // ---------- цели плоским списком вместе с группой ----------
      function collect(cond) {
        const out = [];
        (cond?.groups ?? []).forEach((group, gi) => {
          for (const goal of group?.goals ?? []) if (goal && typeof goal === "object" && goal.title) out.push({ goal, group, gi });
        });
        return out;
      }

      // ---------- восхождение: гора с отметками + открытка выбранной цели ----------
      function climb(ctx, steps) {
        const main = ctx.el.main;
        const N = steps.length;
        if (!main || !N) return null;
        const done = steps.filter((s) => s.goal.done).length;
        const m = mountain(N, game.title);
        const pctY = (y) => ((y / m.H) * 100).toFixed(2);

        const nodes = steps
          .map((s, i) => {
            const p = m.at((i + 1) / N);
            const label = `#${s.goal.n ?? i + 1} ${s.goal.title}: ${s.goal.done ? "выполнено" : "впереди"}`;
            return `
              <button type="button" role="tab" class="ce-node ${s.goal.done ? "ce-on" : "ce-off"}" id="ce-node-${i}" data-i="${i}"
                style="left:${p[0].toFixed(2)}%;top:${pctY(p[1])}%;--nd:${Math.round((m.dots * (i + 1)) / N)}" aria-selected="false" aria-controls="ce-postcard" tabindex="-1"
                aria-label="${esc(label)}">
                <span class="ce-node-mark">${s.goal.done ? `<img src="${assets}flag.webp" alt="">` : ""}</span>
                <span class="ce-node-num" aria-hidden="true">${esc(s.goal.n ?? i + 1)}</span>
              </button>`;
          })
          .join("");

        const heart = m.at(done / N);
        const top = m.at(1);
        const sec = document.createElement("section");
        sec.className = "block ce-climb";
        sec.innerHTML = `
          <h2><span class="sec-icon" aria-hidden="true"></span><span class="sec-label">Восхождение</span> <span class="block-count">${done}/${N}</span></h2>
          <div class="ce-climb-wrap">
            <div class="ce-mtn ${done === N ? "ce-complete" : ""}" style="aspect-ratio:100 / ${m.H}">
              ${m.svg(done / N)}
              <div class="ce-nodes" role="tablist" aria-label="Отметки на пути к вершине" aria-orientation="vertical">${nodes}</div>
              <span class="ce-summit" style="left:${top[0]}%;top:${pctY(top[1])}%" aria-hidden="true"></span>
              ${done < N ? `<span class="ce-heart" style="left:${heart[0].toFixed(2)}%;top:${pctY(heart[1])}%;--nd:${Math.round((m.dots * done) / N)}" aria-hidden="true"></span>` : ""}
              <span class="ce-alt-tag" aria-hidden="true">Высота <b>${Math.round((done / N) * 100)}%</b></span>
            </div>
            <article class="ce-postcard" id="ce-postcard" role="tabpanel" data-gallery tabindex="-1"></article>
          </div>`;

        const anchor = ctx.groups()[0] ?? main.querySelector(".neighbors");
        anchor ? anchor.before(sec) : main.append(sec);
        const hidden = ctx.groups();
        hidden.forEach((g) => g.classList.add("ce-gone"));
        undo.push(() => {
          sec.remove();
          hidden.forEach((g) => g.classList.remove("ce-gone"));
        });

        const list = sec.querySelector(".ce-nodes");
        const buttons = [...list.querySelectorAll(".ce-node")];
        const card = sec.querySelector(".ce-postcard");
        let cur = -1;

        const select = (i, { focus = false, reveal = false } = {}) => {
          i = Math.max(0, Math.min(N - 1, i));
          buttons.forEach((b, j) => {
            b.setAttribute("aria-selected", String(i === j));
            b.tabIndex = i === j ? 0 : -1;
          });
          if (focus) buttons[i].focus({ preventScroll: reveal });
          if (i !== cur) {
            cur = i;
            card.setAttribute("aria-labelledby", buttons[i].id);
            card.innerHTML = postcard(steps[i], i, N);
            card.classList.toggle("ce-todo", !steps[i].goal.done);
            card.classList.remove("ce-in");
            void card.offsetWidth;
            card.classList.add("ce-in");
          }
          if (reveal) {
            const r = card.getBoundingClientRect();
            if (r.top > window.innerHeight * 0.7 || r.bottom < 80) {
              card.scrollIntoView({ behavior: ctx.reducedMotion ? "auto" : "smooth", block: "start" });
            }
          }
        };

        ctx.listen(list, "click", (e) => {
          const b = e.target.closest(".ce-node");
          if (b) select(+b.dataset.i, { reveal: true });
        });
        ctx.listen(list, "keydown", (e) => {
          const k = { ArrowUp: cur + 1, ArrowRight: cur + 1, ArrowDown: cur - 1, ArrowLeft: cur - 1, Home: 0, End: N - 1 }[e.key];
          if (k == null) return;
          e.preventDefault();
          select(k, { focus: true });
        });
        ctx.listen(card, "click", (e) => {
          const b = e.target.closest("[data-step]");
          if (b && !b.disabled) select(cur + Number(b.dataset.step));
        });
        // Сломанная картинка — показываем пиксельную заглушку вместо пустой рамки.
        ctx.listen(
          card,
          "error",
          (e) => {
            if (e.target.tagName !== "IMG") return;
            const photo = e.target.closest(".ce-pc-photo");
            if (photo) photo.classList.add("ce-broken");
            else e.target.hidden = true;
          },
          true,
        );

        const firstTodo = steps.findIndex((s) => !s.goal.done);
        select(firstTodo >= 0 ? firstTodo : N - 1);
        return { select, section: sec };
      }

      // ---------- открытка цели ----------
      function postcard({ goal, group }, i, N) {
        const img = ctx.safeUrl(goal.image);
        const summit = i === N - 1;
        const facts = FIELDS.filter(([k]) => goal[k])
          .map(([k, label]) => [label, goal[k]])
          .concat((goal.extra ?? []).filter((x) => x && x.label).map((x) => [x.label, x.value]))
          .map(([dt, dd]) => `<div class="ce-pc-fact"><dt>${esc(dt)}</dt><dd>${esc(dd)}</dd></div>`)
          .join("");
        const gallery = (goal.gallery ?? []).map(ctx.safeUrl).filter(Boolean);
        const stamp = goal.done ? (summit ? "golden" : "berry") : "todo";
        return `
          <header class="ce-pc-head">
            <div class="ce-pc-heading">
              <div class="ce-pc-kicker"><span class="ce-pc-num">#${esc(goal.n ?? i + 1)}</span>${group?.title ? `<span class="ce-pc-group">${esc(group.title)}</span>` : ""}</div>
              <h3 class="ce-pc-title">${esc(goal.title)}</h3>
              <p class="ce-pc-state">${
                goal.done
                  ? `<span class="ce-pc-flag" aria-hidden="true"></span>Отметка взята`
                  : `<span class="ce-pc-ring" aria-hidden="true"></span>Отметка впереди`
              }</p>
            </div>
            <div class="ce-pc-stamp ce-stamp-${stamp}" aria-hidden="true">
              <span></span>
            </div>
          </header>
          ${group?.note ? `<p class="ce-pc-groupnote">${esc(group.note)}</p>` : ""}
          ${img ? `<figure class="ce-pc-photo"><img src="${esc(img)}" alt="${esc(goal.title)}" data-zoom data-caption="${esc(goal.title)}"></figure>` : ""}
          ${facts ? `<dl class="ce-pc-facts">${facts}</dl>` : ""}
          ${checklist(goal)}
          ${goal.note ? `<blockquote class="ce-pc-note">${esc(goal.note)}</blockquote>` : ""}
          ${goal.details ? `<p class="ce-pc-details">${esc(goal.details)}</p>` : ""}
          ${gallery.length ? `<div class="ce-pc-gallery">${gallery.map((u) => `<img src="${esc(u)}" alt="" loading="lazy" data-zoom data-caption="${esc(goal.title)}">`).join("")}</div>` : ""}
          ${ctx.safeUrl(goal.link) ? `<a class="ce-pc-link" href="${esc(goal.link)}" target="_blank" rel="noopener">Подробнее ↗</a>` : ""}
          <footer class="ce-pc-foot">
            <button type="button" class="ce-btn" data-step="-1" ${i ? "" : "disabled"}><span aria-hidden="true">▼</span> Ниже</button>
            <span class="ce-pc-count">${i + 1} / ${N}</span>
            <button type="button" class="ce-btn" data-step="1" ${i < N - 1 ? "" : "disabled"}>Выше <span aria-hidden="true">▲</span></button>
          </footer>`;
      }

      function checklist(goal) {
        const groups = (goal.checklist ?? []).filter((c) => c && Array.isArray(c.items));
        const items = groups.flatMap((c) => c.items.filter(Boolean));
        if (!items.length) return "";
        const ok = items.filter((x) => x.done).length;
        return `
          <div class="ce-pc-check">
            <div class="ce-pc-check-head">Чек-лист <b>${ok}/${items.length}</b></div>
            ${groups
              .map(
                (c) => `
              ${c.label ? `<div class="ce-pc-check-label">${esc(c.label)}</div>` : ""}
              <ul>${c.items
                .filter(Boolean)
                .map((it) => `<li class="${it.done ? "ce-ok" : ""}"><span class="ce-box" aria-hidden="true"></span>${esc(it.title)}<span class="sr-only">${it.done ? " — выполнено" : " — не выполнено"}</span></li>`)
                .join("")}</ul>`,
              )
              .join("")}
          </div>`;
      }

      // ---------- боковая панель: мини-гора вместо кольца — высота подъёма ----------
      function altimeter(ctx, steps) {
        const ring = ctx.el.side?.querySelector(".ring");
        if (!ring) return;
        const N = steps.length;
        const done = steps.filter((s) => s.goal.done).length;
        const p = N ? done / N : 0;
        const m = mountain(0, "alt", 1.25);
        const box = document.createElement("div");
        box.className = `ce-alt ${N && done === N ? "ce-complete" : ""}`;
        box.setAttribute("role", "img");
        box.setAttribute("aria-label", ring.getAttribute("aria-label") || `Выполнено ${done} из ${N}`);
        box.innerHTML = `
          <div class="ce-alt-mtn">${m.svg(p, true)}</div>
          <div class="ce-alt-text">
            <small>Высота</small>
            <b>${Math.round(p * 100)}%</b>
            <span>${done} из ${N} ${ctx.plural(N, "отметки", "отметок", "отметок")}</span>
          </div>`;
        ring.hidden = true;
        ring.after(box);
        undo.push(() => {
          box.remove();
          ring.hidden = false;
        });

        // полностью пройденные группы — с клубникой
        const tallies = (ctx.conditions?.groups ?? []).map((g) => (g?.goals ?? []).filter((x) => x?.title));
        ctx.el.side.querySelectorAll(".group-progress [data-jump]").forEach((a) => {
          const gs = tallies[+a.dataset.jump];
          const li = a.closest("li");
          if (li && gs?.length && gs.every((x) => x.done)) {
            li.classList.add("ce-full");
            undo.push(() => li.classList.remove("ce-full"));
          }
        });
      }

      // ---------- ссылки групп в боковой панели выбирают отметку этой группы на горе ----------
      function sideJump(ctx, steps, api) {
        if (!api || !ctx.el.side) return;
        ctx.listen(ctx.el.side, "click", (e) => {
          const a = e.target.closest?.("[data-jump]");
          if (!a) return;
          const gi = +a.dataset.jump;
          let i = steps.findIndex((s) => s.gi === gi && !s.goal.done);
          if (i < 0) i = steps.findIndex((s) => s.gi === gi);
          if (i < 0) return;
          e.preventDefault();
          e.stopPropagation();
          api.select(i, { focus: true, reveal: true });
          api.section.scrollIntoView({ behavior: ctx.reducedMotion ? "auto" : "smooth", block: "start" });
        });
      }

      // ---------- полоски прогресса групп — по сегменту на цель ----------
      function segmentBars(ctx) {
        const bars = [];
        const groups = ctx.conditions?.groups ?? [];
        ctx.el.side?.querySelectorAll(".group-progress li").forEach((li) => {
          const a = li.querySelector("[data-jump]");
          const n = (groups[+a?.dataset.jump]?.goals ?? []).filter((x) => x?.title).length;
          const bar = li.querySelector(".progress");
          if (bar && n) bars.push([bar, n]);
        });
        for (const [bar, n] of bars) {
          bar.style.setProperty("--ce-seg", `${100 / Math.min(n, 40)}%`);
          bar.classList.add("ce-seg");
          undo.push(() => bar.classList.remove("ce-seg"));
        }
      }

      // ---------- ночное небо: дальние горы, звёзды, ближний хребет ----------
      function sky(ctx) {
        const bg = ctx.layer("ce-sky");
        bg.innerHTML = `<div class="ce-sky-far"></div><div class="ce-stars"></div><div class="ce-stars ce-stars-b"></div><div class="ce-ridge"></div>`;
        const [far, starsA, starsB, ridge] = bg.children;
        // Звёзды — по одному элементу на слой, каждая звезда — квадратная тень (дёшево и чётко).
        const stars = (n, seed) => {
          const r = rand(seed);
          return Array.from({ length: n }, () => {
            const x = (r() * 100).toFixed(1);
            const y = (r() * 62).toFixed(1);
            const big = r() > 0.8;
            const c = r() > 0.7 ? HAIR.pink : r() > 0.5 ? HAIR.gold : HAIR.snow;
            return `${x}vw ${y}vh 0 ${big ? "1px" : "0"} ${c}`;
          }).join(",");
        };
        starsA.style.boxShadow = stars(26, 11);
        starsB.style.boxShadow = stars(22, 97);
        if (ctx.reducedMotion) return null;

        let y = -1;
        return () => {
          if (window.scrollY === y) return;
          y = window.scrollY;
          // Сдвиг округляется до целых пикселей — параллакс «шагает», как в пиксельной игре.
          far.style.transform = `translate3d(0, ${-Math.round(Math.min(y * 0.03, 90))}px, 0)`;
          ridge.style.transform = `translate3d(0, ${-Math.round(Math.min(y * 0.09, 140))}px, 0)`;
          starsA.style.transform = starsB.style.transform = `translate3d(0, ${-Math.round(Math.min(y * 0.015, 50))}px, 0)`;
        };
      }

      // ---------- вход: пиксельная шторка с названием, рассыпается вверх по склону ----------
      // С главной шторка уже закрывает экран (cover → ctx.handoff): рассыпаем её же.
      // Прямой заход по ссылке или перезагрузка — шторка появляется сразу закрытой, как раньше.
      function entrance(ctx) {
        const handed = ctx.handoff?.layers?.find((l) => l.classList?.contains("ce-wipe")) ?? null;
        const taken = handed?.isConnected && !ctx.reducedMotion ? ctx.handoff.data?.wipe ?? null : null;
        if (handed && !taken) handed.remove();
        if (!taken && ctx.reducedMotion) return null;
        const w = taken ?? buildWipe(ctx.layer("ce-wipe"), game, esc);
        if (!w) return null;
        if (!taken) w.paint(-1, false);
        // Страховка: если кадры не идут (вкладка в фоне, экономия энергии), шторка не должна висеть.
        const safety = setTimeout(() => w.layer.remove(), 3500);
        ctx.onCleanup(() => clearTimeout(safety));

        const hold = taken ? HOLD.handoff : HOLD.direct;
        let t0 = null;
        let lastStep = -1;
        let finished = false;
        return (now) => {
          if (finished) return;
          t0 ??= now;
          const s = (now - t0) / 1000;
          if (s > hold) w.card.classList.add("out");
          const p = ((s - hold) / DUR) * w.end;
          if (p <= 0) return;
          if (p >= w.end) {
            finished = true;
            w.layer.remove();
            return;
          }
          // Шаги по 1/24 — рассыпание идёт рывками, без плавной интерполяции.
          const step = Math.floor(p * STEPS);
          if (step === lastStep) return;
          lastStep = step;
          w.paint(step / STEPS, false);
        };
      }

      // ---------- курсор: след рывка цветами волос и пиксельный взрыв по клику ----------
      function dash(ctx) {
        if (!ctx.finePointer || ctx.reducedMotion) return null;
        const layer = ctx.layer("ce-dash");
        const N = 18;
        const GRID = 4;
        const STEP = 13;
        const bits = Array.from({ length: N }, () => {
          const el = document.createElement("i");
          layer.append(el);
          return { el, life: 0, x: 0, y: 0, shown: -1 };
        });
        const snap = (v) => Math.round(v / GRID) * GRID;
        let next = 0;
        let lx = null;
        let ly = null;
        let lt = 0;
        let flip = false;

        const drop = (x, y, fast) => {
          const b = bits[next++ % N];
          b.x = snap(x) - 4;
          b.y = snap(y) - 4;
          b.life = 1;
          b.shown = -1;
          flip = !flip;
          b.el.className = fast ? "ce-fast" : flip ? "ce-red" : "";
        };

        ctx.listen(
          window,
          "pointermove",
          (e) => {
            if (e.pointerType === "touch") return;
            const x = e.clientX;
            const y = e.clientY;
            if (lx == null) {
              [lx, ly, lt] = [x, y, e.timeStamp];
              return;
            }
            const dx = x - lx;
            const dy = y - ly;
            const d = Math.hypot(dx, dy);
            if (d < STEP) return;
            const fast = d / Math.max(8, e.timeStamp - lt) > 1.5;
            const n = Math.min(5, Math.floor(d / STEP));
            for (let k = 1; k <= n; k++) drop(lx + (dx * k) / n, ly + (dy * k) / n, fast);
            [lx, ly, lt] = [x, y, e.timeStamp];
          },
          { passive: true },
        );
        ctx.listen(document, "pointerleave", () => (lx = null));

        const COLORS = [HAIR.pink, HAIR.gold, HAIR.snow, HAIR.blue];
        ctx.listen(
          window,
          "pointerdown",
          (e) => {
            if (e.pointerType === "touch" || e.button !== 0 || layer.childElementCount > N + 32) return;
            const x = snap(e.clientX);
            const y = snap(e.clientY);
            for (let k = 0; k < 8; k++) {
              const a = (k / 8) * Math.PI * 2;
              const s = document.createElement("b");
              s.style.left = `${x - 3}px`;
              s.style.top = `${y - 3}px`;
              s.style.background = COLORS[k % COLORS.length];
              s.style.setProperty("--dx", `${snap(Math.cos(a) * 30)}px`);
              s.style.setProperty("--dy", `${snap(Math.sin(a) * 30)}px`);
              s.addEventListener("animationend", () => s.remove(), { once: true });
              layer.append(s);
            }
          },
          { passive: true },
        );

        return (now, dt) => {
          for (const b of bits) {
            if (b.life <= 0) continue;
            b.life = Math.max(0, b.life - dt * 3.4);
            // Размер и прозрачность тоже ступенчатые: четыре «кадра» затухания.
            const q = Math.ceil(b.life * 4);
            if (q === b.shown) continue;
            b.shown = q;
            b.el.style.opacity = q ? String(0.25 + q * 0.19) : "0";
            b.el.style.transform = `translate3d(${b.x}px, ${b.y}px, 0) scale(${q / 4})`;
          }
        };
      }
    },
  });

  // ---------- пиксельная шторка: сетка клеток во весь экран и карточка с названием ----------
  // Одна шторка на весь вход: её строит cover() на главной или entrance() при прямом заходе.
  // У каждой клетки свой порог — диагональ снизу-слева вверх-направо + немного случайности, так что
  // волна идёт вверх по склону. paint(p, fill): p — фронт волны (0…end); fill — за фронтом клетки
  // закрыты (наползание), иначе открыты (рассыпание); у фронта — кайма цветами волос.
  function buildWipe(layer, game, esc) {
    layer.innerHTML = `
      <canvas></canvas>
      <div class="ce-wipe-card">
        <span class="ce-wipe-berry"></span>
        <strong>${esc(game.title)}</strong>
      </div>`;
    const t = game.theme ?? {};
    // Токены темы — прямо на слое: на главной у html ещё нет переменных игры, а карточка
    // должна выглядеть одинаково до и после перехода.
    const accent2 = COLOR.test(t.accent2 ?? "") ? t.accent2 : t.accent;
    const font = t.displayFont ?? t.headingFont;
    if (COLOR.test(t.accent ?? "")) layer.style.setProperty("--t-accent", t.accent);
    if (COLOR.test(accent2 ?? "")) layer.style.setProperty("--t-accent-2", accent2);
    if (FONT.test(font ?? "")) layer.style.setProperty("--t-display", `'${font}', Inter, system-ui, sans-serif`);

    const canvas = layer.querySelector("canvas");
    const card = layer.querySelector(".ce-wipe-card");
    const g = canvas.getContext("2d");
    if (!g) {
      layer.remove();
      return null;
    }

    const cell = window.innerWidth < 600 ? 30 : 44;
    const cols = Math.ceil(window.innerWidth / cell) + 1;
    const rows = Math.ceil(window.innerHeight / cell) + 1;
    canvas.width = cols;
    canvas.height = rows;
    canvas.style.width = `${cols * cell}px`;
    canvas.style.height = `${rows * cell}px`;

    const bg = rgb(HEX.test(t.bg ?? "") ? t.bg : "#140a1f");
    const alt = mix(bg, rgb(HEX.test(t.surface ?? "") ? t.surface : "#22132f"), 0.55);
    const edgeA = rgb(HEX.test(t.accent ?? "") ? t.accent : HAIR.pink);
    const edgeB = rgb(HEX.test(t.accent2 ?? "") ? t.accent2 : HAIR.gold);

    const r = rand(String(game.title).length + 5);
    const th = new Float32Array(cols * rows);
    const shade = new Uint8Array(cols * rows);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        th[y * cols + x] = ((x / cols + (1 - y / rows)) / 2) * 0.78 + r() * 0.22;
        shade[y * cols + x] = r() > 0.82 ? 1 : 0;
      }
    }
    const img = g.createImageData(cols, rows);
    const EDGE = 0.07;
    // Порядок от закрытой части к открытой одинаков в обе стороны: тёмные клетки → розовая → золотая кайма.
    const paint = (p, fill) => {
      const d = img.data;
      for (let i = 0; i < th.length; i++) {
        const k = p - th[i];
        const dark = shade[i] ? alt : bg;
        const c = fill
          ? k < 0 ? null : k < EDGE ? edgeB : k < EDGE * 2 ? edgeA : dark
          : k < 0 ? dark : k < EDGE ? edgeA : k < EDGE * 2 ? edgeB : null;
        const o = i * 4;
        if (c) {
          d[o] = c[0];
          d[o + 1] = c[1];
          d[o + 2] = c[2];
          d[o + 3] = 255;
        } else d[o + 3] = 0;
      }
      g.putImageData(img, 0, 0);
    };
    return { layer, card, paint, end: 1 + EDGE * 2 };
  }

  // ---------- пиксельная гора ----------
  // Силуэт строится по столбцам шириной U в координатах viewBox 0..100 × 0..H и квантуется по сетке —
  // поэтому края ступенчатые, как в пиксель-арте. Тропа — серпантин от подножия к вершине;
  // at(t) даёт точку на тропе по доле длины (0 — лагерь у подножия, 1 — вершина).
  function mountain(N, seed, ratio) {
    const ar = ratio ?? Math.max(0.4, 0.85 - Math.max(0, N - 8) * 0.02);
    const H = Math.round(100 / ar);
    const U = 2;
    const PEAK = Math.round(H * 0.16);
    const q = (v) => Math.round(v / U) * U;
    const r = rand(hash(String(seed)) + N);

    const cols = [];
    for (let c = 0; c < 100 / U; c++) {
      const x = c * U + U / 2;
      const main = PEAK + (Math.abs(x - 50) / 50) * (H - PEAK) * 1.04 + (r() < 0.3 ? (r() < 0.5 ? -U : U) : 0);
      const back = Math.min(H * 0.46 + Math.abs(x - 17) * 1.3, H * 0.36 + Math.abs(x - 85) * 1.15) + (r() < 0.3 ? U : 0);
      cols.push({ x: c * U, main: Math.min(H, Math.max(PEAK, q(main))), back: Math.min(H, q(back)) });
    }
    const outline = (key, from = 0, to = cols.length) => {
      let pts = `${cols[from].x},${H}`;
      for (let c = from; c < to; c++) pts += ` ${cols[c].x},${cols[c][key]} ${cols[c].x + U},${cols[c][key]}`;
      return `${pts} ${cols[to - 1].x + U},${H}`;
    };
    const mid = cols.length / 2;
    const snowLine = PEAK + (H - PEAK) * 0.2;
    const snow = cols
      .map((c, i) => {
        if (c.main >= snowLine) return "";
        const bottom = Math.max(c.main + U, q(snowLine + (r() - 0.5) * U * 3));
        return `<rect class="${i < mid ? "ce-snow" : "ce-snow-dark"}" x="${c.x}" y="${c.main}" width="${U}" height="${bottom - c.main}"/>`;
      })
      .join("");

    // серпантин
    // Каждый виток — почти горизонтальный проход поперёк склона и вертикальный подъём у края:
    // углы прямые, поэтому соседние отметки не слипаются даже на узкой вершине.
    const legs = Math.max(2, Math.min(12, Math.ceil(N / 2.2)));
    const baseY = H - 6;
    const topY = PEAK + 6;
    const dy = (baseY - topY) / legs;
    const half = (y) => ((y - PEAK) / (H - PEAK)) * 50 * 0.66;
    const pts = [];
    for (let k = 0; k < legs; k++) {
      const y0 = baseY - k * dy;
      const y1 = y0 - dy * 0.3;
      const s = k % 2 ? 1 : -1;
      if (k === 0) pts.push([50 + s * half(y0), y0]);
      if (k === legs - 1) {
        pts.push([50, topY]);
        break;
      }
      const x1 = 50 - s * half(y1);
      pts.push([x1, y1], [x1, y0 - dy]);
    }
    const seg = [];
    let total = 0;
    for (let k = 1; k < pts.length; k++) {
      const len = Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
      seg.push(len);
      total += len;
    }
    const at = (t) => {
      let d = Math.max(0, Math.min(1, t)) * total;
      for (let k = 0; k < seg.length; k++) {
        if (d <= seg[k] || k === seg.length - 1) {
          const f = seg[k] ? Math.min(1, d / seg[k]) : 0;
          return [pts[k][0] + (pts[k + 1][0] - pts[k][0]) * f, pts[k][1] + (pts[k + 1][1] - pts[k][1]) * f];
        }
        d -= seg[k];
      }
      return pts[pts.length - 1];
    };

    const stars = Array.from({ length: 16 }, (_, i) => {
      const x = q(r() * 100);
      const y = q(r() * H * 0.45);
      const col = cols[Math.min(cols.length - 1, Math.floor(x / U))];
      if (y >= Math.min(col.main, col.back) - U) return "";
      return `<rect class="ce-star ce-tw${i % 3}" x="${x}" y="${y}" width="${r() > 0.75 ? U : U / 2}" height="${r() > 0.75 ? U : U / 2}"/>`;
    }).join("");

    // svg(p): p — доля пройденного; mini — для мини-горы сбоку (заливка по высоте вместо тропы)
    const svg = (p, mini) => {
      let trail = "";
      if (!mini) {
        const seen = new Set();
        const n = Math.ceil(total / 2.6);
        for (let i = 0; i <= n; i++) {
          const [x, y] = at(i / n);
          const key = `${Math.round(x)},${Math.round(y)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const on = i / n <= p + 1e-6;
          trail += `<rect class="${on ? "ce-dot-on" : "ce-dot"}" style="--d:${i}" x="${Math.round(x) - 0.7}" y="${Math.round(y) - 0.7}" width="1.4" height="1.4"/>`;
        }
        const [fx, fy] = pts[0];
        const bx = Math.round(fx) - 4;
        const by = Math.round(fy) + 1;
        trail += `<g class="ce-fire"><rect class="ce-log" x="${bx - 1}" y="${by + 2}" width="5" height="1"/><rect class="ce-flame" x="${bx}" y="${by}" width="3" height="2"/><rect class="ce-flame2" x="${bx + 1}" y="${by - 1}" width="1" height="1.5"/></g>`;
      }
      const fillY = q(H - p * (H - PEAK));
      const id = `ce-clip-${mini ? "alt" : "mtn"}`;
      return `
        <svg viewBox="0 0 100 ${H}" preserveAspectRatio="xMidYMid meet" shape-rendering="crispEdges" aria-hidden="true" focusable="false">
          ${stars}
          <polygon class="ce-back" points="${outline("back")}"/>
          <polygon class="ce-face" points="${outline("main")}"/>
          <polygon class="ce-face-dark" points="${outline("main", mid)}"/>
          ${
            mini
              ? `<clipPath id="${id}"><rect x="0" y="${fillY}" width="100" height="${H}"/></clipPath>
                 <g clip-path="url(#${id})"><polygon class="ce-fill" points="${outline("main")}"/><polygon class="ce-fill-dark" points="${outline("main", mid)}"/></g>`
              : ""
          }
          ${snow}
          ${mini && p > 0 && p < 1 ? `<rect class="ce-level" x="0" y="${fillY}" width="100" height="1"/>` : ""}
          ${trail}
        </svg>`;
    };

    return { H, at, svg, dots: Math.ceil(total / 2.6) };
  }

  // ---------- хелперы ----------

  function hash(s) {
    let h = 7;
    for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 100003;
    return h;
  }

  function rand(seed) {
    let s = Math.floor(Math.abs(seed) * 9301 + 49297) % 233280 || 1;
    return () => {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
  }

  function rgb(hex) {
    return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  }

  function mix(a, b, k) {
    return a.map((v, i) => Math.round(v + (b[i] - v) * k));
  }
})();
