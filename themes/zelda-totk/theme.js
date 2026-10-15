// The Legend of Zelda: Tears of the Kingdom — «Журнал странника».
// Страница — планшет: каменная рамка с бирюзовыми глифами, по которой бегут огоньки; вкладки — группы
// условий закрытия; цели — записи журнала приключений: слева список с отметками, справа запись
// (на телефоне — аккордеон). Вход — облака расходятся и открывают небо (с главной облака сначала
// наплывают с краёв поверх списка — cover()), в баннере — парящие острова с параллаксом и облачная гряда.
(() => {
  "use strict";

  // Облака заставки: x, y (% экрана), ширина (vmax), куда уплывает (-1 влево / 1 вправо), задержка (с), зеркально
  const CLOUDS = [
    [16, 14, 72, -1, 0.0, 0], [84, 10, 78, 1, 0.04, 1], [50, 26, 66, 1, 0.1, 0],
    [22, 46, 86, -1, 0.06, 1], [80, 50, 80, 1, 0.12, 0], [46, 66, 74, -1, 0.16, 0],
    [12, 86, 80, -1, 0.2, 0], [88, 88, 84, 1, 0.22, 1],
  ];
  const CHECK = `<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M4.8 10.6l3.4 3.4 7-7.6"/></svg>`;
  const pad2 = (n) => (/^\d$/.test(String(n)) ? `0${n}` : String(n));
  const OPEN_MS = 1900; // сколько длится «облака расходятся» (самое долгое облако: 1,6 с + 0,22 с задержки)

  // Небо, облака и название игры — одна и та же заставка и на главной (cover), и при прямом входе.
  function gateHtml(game, assets, esc) {
    return `
      <div class="zt-gate-sky"></div>
      ${CLOUDS.map(
        ([x, y, w, d, t, f]) =>
          `<img class="zt-gate-cloud" src="${assets}cloud.webp" alt="" style="--x:${x}%;--y:${y}%;--w:${w}vmax;--d:${d};--t:${t}s;--f:${f ? -1 : 1}">`,
      ).join("")}
      <div class="zt-gate-title">
        <img src="${assets}glyph-divider.webp" alt="">
        <div class="zt-gate-name">${esc(game.title)}</div>
      </div>`;
  }

  GameThemes.register("zelda-totk", {
    // Начало заставки ещё на главной: облака наплывают с краёв поверх растворяющегося списка, небо и
    // название проявляются. Promise выполняется, когда небо закрыло экран; разводит облака уже page().
    async cover(t) {
      const g = t.layer("zt-gate zt-cover");
      // Шрифты темы на главной заданы только у сцены/баннера — берём их оттуда, чтобы название не
      // сменило шрифт, когда страница игры выставит те же переменные на <html>.
      const src = document.querySelector('.stage-layer[data-game="zelda-totk"], .gbanner[data-game="zelda-totk"]');
      for (const k of ["--t-display", "--t-heading", "--t-body"]) {
        const v = src?.style.getPropertyValue(k);
        if (v) g.style.setProperty(k, v);
      }
      g.innerHTML = gateHtml(t.game, t.assets, t.esc);
      t.data.started = performance.now();
      // облака не должны «вспыхнуть» посреди наплыва, когда догрузятся, — ждём их, но недолго
      const imgs = [...g.querySelectorAll("img")];
      await Promise.race([Promise.all(imgs.map((i) => i.decode?.().catch(() => {}))), t.wait(300)]);
      void g.offsetWidth; // стартовое положение (облака за краями) должно примениться до перехода
      g.classList.add("zt-closed");
      await t.wait(720);
    },

    page(ctx) {
      const { root, el, esc, assets, game } = ctx;
      root.classList.add("zt");
      let alive = true;
      ctx.onCleanup(() => (alive = false));

      gate();
      const sky = heroSky();
      const pad = device();
      sidePanel(pad);
      root.querySelector(".cond-none")?.classList.add("zt-none");
      motion(sky);

      return () => root.classList.remove("zt");

      // ---------- вход: облака расходятся и открывают небо ----------
      function gate() {
        // Пришли с главной: небо и облака уже закрывают экран (cover) — остаётся их развести.
        const handed = ctx.handoff?.layers.find((l) => l.classList.contains("zt-gate"));
        if (handed) return reveal(handed);
        if (ctx.reducedMotion) return;
        let seen = false;
        try {
          seen = sessionStorage.getItem("zt-gate") === "1";
          sessionStorage.setItem("zt-gate", "1");
        } catch {}
        const g = ctx.layer("zt-gate");
        g.innerHTML = gateHtml(game, assets, esc);
        const open = () => {
          if (g.classList.contains("zt-open")) return;
          settleTitle(g);
          g.classList.add("zt-open");
        };
        const t1 = setTimeout(open, seen ? 350 : 1150);
        const t2 = setTimeout(() => g.remove(), seen ? 2200 : 3000);
        ctx.onCleanup(() => (clearTimeout(t1), clearTimeout(t2)));
        for (const type of ["pointerdown", "keydown", "wheel"]) ctx.listen(window, type, open, { passive: true, once: true });
      }

      // Анимация появления названия (fill: both) держит opacity/transform, и при .zt-open оно пропадало
      // за кадр. Снимаем её на текущем кадре — дальше название уходит обычным переходом.
      function settleTitle(g) {
        const title = g.querySelector(".zt-gate-title");
        if (!title) return;
        const { opacity, transform } = getComputedStyle(title);
        title.style.animation = "none";
        title.style.opacity = opacity;
        title.style.transform = transform;
        void title.offsetWidth;
        title.style.opacity = title.style.transform = "";
      }

      // Облака расходятся так же, как при прямом входе. Название к этому моменту уже читается; страница
      // под небом успевает проявиться (≥ 250 мс), а всего от клика проходит столько же, сколько при первом входе.
      function reveal(g) {
        try {
          sessionStorage.setItem("zt-gate", "1");
        } catch {}
        let t2 = 0;
        const open = () => {
          if (!alive || g.classList.contains("zt-open")) return;
          g.classList.add("zt-open");
          t2 = setTimeout(() => g.remove(), ctx.reducedMotion ? 0 : OPEN_MS);
        };
        const since = performance.now() - (ctx.handoff.data?.started ?? 0);
        const t1 = setTimeout(open, ctx.reducedMotion ? 0 : Math.max(250, 1150 - since));
        ctx.onCleanup(() => (clearTimeout(t1), clearTimeout(t2)));
        for (const type of ["pointerdown", "keydown", "wheel"]) ctx.listen(window, type, open, { passive: true, once: true });
      }

      // ---------- баннер: острова, облачная гряда, разделитель под названием ----------
      function heroSky() {
        const hero = el.hero;
        const media = hero?.querySelector(".hero-media");
        if (!hero || !media) return null;

        const h1 = el.heroTitle?.querySelector("h1");
        h1?.insertAdjacentHTML("afterend", `<img class="zt-hero-rule" src="${assets}glyph-divider.webp" alt="">`);

        const isles = document.createElement("div");
        isles.className = "zt-isles";
        isles.setAttribute("aria-hidden", "true");
        isles.innerHTML = [1, 0.5, 0.28]
          .map((d, i) => `<span class="zt-isle zt-isle-${i + 1}" data-depth="${d}"><img src="${assets}island.webp" alt=""></span>`)
          .join("");
        media.append(isles);

        const bank = document.createElement("div");
        bank.className = "zt-bank";
        bank.setAttribute("aria-hidden", "true");
        bank.innerHTML = "<i></i>";
        hero.append(bank);
        return { hero, media, bank, isles: [...isles.children].map((n) => ({ n, d: Number(n.dataset.depth) || 0.5 })) };
      }

      // ---------- планшет с вкладками: каждая секция (.block) — вкладка ----------
      function device() {
        const main = el.main;
        const blocks = main ? [...main.querySelectorAll(":scope > .block")] : [];
        if (!blocks.length) return null;
        const groupsData = ctx.conditions?.groups ?? [];

        const padEl = document.createElement("section");
        padEl.className = "zt-pad";
        padEl.setAttribute("aria-label", "Журнал приключений");
        padEl.innerHTML = `
          <div class="zt-pad-frame" aria-hidden="true"><i class="zt-spark"></i><i class="zt-spark"></i></div>
          <div class="zt-pad-bar">
            <button type="button" class="zt-shoulder" data-step="-1" tabindex="-1" aria-hidden="true">L</button>
            <div class="zt-tabs" role="tablist" aria-label="Разделы журнала"></div>
            <button type="button" class="zt-shoulder" data-step="1" tabindex="-1" aria-hidden="true">R</button>
          </div>
          <div class="zt-screen"></div>`;
        main.insertBefore(padEl, blocks[0]);
        const tablist = padEl.querySelector(".zt-tabs");
        const screen = padEl.querySelector(".zt-screen");
        const tabs = [];
        const panels = [];
        const meta = [];

        blocks.forEach((block, i) => {
          const label = block.querySelector(".sec-label")?.textContent.trim() || `Раздел ${i + 1}`;
          const gi = block.matches(".cond-group") ? Number(block.dataset.group) : -1;
          const goals = gi >= 0 ? groupsData[gi]?.goals ?? [] : null;
          const done = goals ? goals.filter((x) => x?.done).length : 0;
          const complete = !!goals?.length && done === goals.length;

          const tab = document.createElement("button");
          tab.type = "button";
          tab.id = `zt-tab-${i}`;
          tab.className = complete ? "zt-complete" : "";
          tab.setAttribute("role", "tab");
          tab.setAttribute("aria-controls", `zt-panel-${i}`);
          tab.setAttribute("aria-selected", "false");
          tab.tabIndex = -1;
          tab.innerHTML = `<span class="zt-tab-label">${esc(label)}</span>${
            goals?.length
              ? `<span class="zt-tab-count">${complete ? CHECK : ""}<span>${done}/${goals.length}</span></span><span class="sr-only">, выполнено ${done} из ${goals.length}</span>`
              : ""
          }`;
          tablist.append(tab);

          const panel = document.createElement("div");
          panel.className = "zt-panel";
          panel.id = `zt-panel-${i}`;
          panel.setAttribute("role", "tabpanel");
          panel.setAttribute("aria-labelledby", tab.id);
          panel.tabIndex = 0;
          panel.hidden = true;
          block.classList.add("zt-sheet");
          panel.append(block);
          screen.append(panel);
          if (goals) questLog(block, goals);

          tabs.push(tab);
          panels.push(panel);
          meta.push({ goals, complete });
        });

        const ink = document.createElement("span");
        ink.className = "zt-ink";
        ink.setAttribute("aria-hidden", "true");
        ink.innerHTML = "<i></i><b></b>";
        tablist.append(ink);
        padEl.classList.toggle("zt-single", tabs.length < 2);

        let cur = -1;
        const moveInk = () => {
          const t = tabs[cur];
          if (!t || !alive || !t.offsetWidth) return;
          const x = t.offsetLeft + 12;
          const w = Math.max(12, t.offsetWidth - 24);
          ink.firstChild.style.transform = `translateX(${x}px) scaleX(${w})`;
          ink.lastChild.style.transform = `translateX(${(x + w / 2).toFixed(1)}px) rotate(45deg)`;
        };
        const keepVisible = (t) => {
          const l = t.offsetLeft - 16;
          const r = t.offsetLeft + t.offsetWidth + 16;
          if (l < tablist.scrollLeft) tablist.scrollLeft = l;
          else if (r > tablist.scrollLeft + tablist.clientWidth) tablist.scrollLeft = r - tablist.clientWidth;
        };

        const select = (i, { focus = false, user = false } = {}) => {
          i = (i + tabs.length) % tabs.length;
          if (i !== cur) {
            const dir = cur < 0 ? 0 : i > cur ? 1 : -1;
            cur = i;
            tabs.forEach((t, j) => {
              t.setAttribute("aria-selected", String(i === j));
              t.tabIndex = i === j ? 0 : -1;
            });
            panels.forEach((p, j) => (p.hidden = i !== j));
            const p = panels[i];
            p.classList.remove("zt-in");
            if (!ctx.reducedMotion) {
              p.style.setProperty("--dir", dir);
              void p.offsetWidth;
              p.classList.add("zt-in");
            }
            moveInk();
            keepVisible(tabs[i]);
          }
          if (focus) tabs[i].focus();
        };

        ctx.listen(tablist, "click", (e) => {
          const t = e.target.closest('[role="tab"]');
          if (t) select(tabs.indexOf(t), { user: true });
        });
        ctx.listen(tablist, "keydown", (e) => {
          const next = { ArrowRight: cur + 1, ArrowLeft: cur - 1, Home: 0, End: tabs.length - 1 }[e.key];
          if (next == null) return;
          e.preventDefault();
          select(next, { focus: true, user: true });
        });
        for (const b of padEl.querySelectorAll(".zt-shoulder")) {
          ctx.listen(b, "click", () => select(cur + Number(b.dataset.step), { user: true }));
        }
        if ("ResizeObserver" in window) {
          const ro = new ResizeObserver(moveInk);
          ro.observe(tablist);
          ctx.onCleanup(() => ro.disconnect());
        }
        document.fonts?.ready.then(moveInk);

        // Первая вкладка — первая группа с невыполненными целями (если всё выполнено — первая).
        select(Math.max(0, meta.findIndex((m) => m.goals?.length && !m.complete)));
        const settle = setTimeout(() => ink.classList.add("zt-ready"), 60);
        ctx.onCleanup(() => clearTimeout(settle));

        return { el: padEl, tabs, select, panelOf: (node) => panels.findIndex((p) => p.contains(node)) };
      }

      // ---------- цели группы — журнал приключений ----------
      // Кнопка-запись и сама цель (.cond) идут парами: на широком экране сетка ставит записи в левую
      // колонку, а открытую цель — справа; на узком тот же порядок становится аккордеоном.
      function questLog(block, goals) {
        const t = { done: goals.filter((x) => x?.done).length, total: goals.length };
        block
          .querySelector(":scope > h2")
          ?.insertAdjacentHTML(
            "afterend",
            `<p class="zt-sheet-sub">${t.total ? `Выполнено ${t.done} из ${t.total}` : "В этой группе пока нет целей"}</p>`,
          );
        const list = block.querySelector(".cond-list");
        const arts = list ? [...list.querySelectorAll(":scope > .cond")] : [];
        if (!list || !arts.length) return;

        const log = document.createElement("div");
        log.className = "zt-log";
        log.style.setProperty("--rows", arts.length);
        const quests = arts.map((art, j) => {
          const g = goals.find((x) => String(x?.n) === art.dataset.goal) ?? goals[j] ?? {};
          const done = art.classList.contains("done");
          const title = g.title ?? art.querySelector(".cond-title")?.textContent ?? "";
          const steps = (g.checklist ?? []).flatMap((c) => c?.items ?? []);
          const sub = done
            ? "Выполнено"
            : steps.length
              ? `Не выполнено · шаги ${steps.filter((s) => s?.done).length}/${steps.length}`
              : "Не выполнено";
          if (!art.id) art.id = `zt-goal-${block.dataset.group ?? "x"}-${j}`;

          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = `zt-quest ${done ? "zt-done" : "zt-todo"}`;
          btn.style.setProperty("--k", j);
          btn.setAttribute("aria-expanded", "false");
          btn.setAttribute("aria-controls", art.id);
          btn.innerHTML = `
            <span class="zt-check" aria-hidden="true">${done ? CHECK : ""}</span>
            <span class="zt-quest-text">
              <span class="zt-quest-title">${g.n != null ? `<span class="zt-quest-n">${esc(pad2(g.n))}</span>` : ""}${esc(title)}</span>
              <span class="zt-quest-sub">${esc(sub)}</span>
            </span>
            <span class="zt-quest-rune" aria-hidden="true"><i></i></span>`;
          art.classList.add("zt-entry");
          art.hidden = true;
          entry(art, done);
          log.append(btn, art);
          return { btn, art };
        });
        list.replaceWith(log);

        // Раскладку выбирает CSS (container query); здесь только узнаём, какая сейчас.
        const accordion = () => getComputedStyle(log).display !== "grid";
        let sel = -1;
        const open = (j, { user = false } = {}) => {
          if (j === sel) return;
          quests.forEach((q, k) => {
            const on = k === j;
            q.btn.setAttribute("aria-expanded", String(on));
            q.btn.classList.toggle("zt-sel", on);
            q.art.hidden = !on;
          });
          sel = j;
          const q = quests[j];
          if (!q) return;
          q.art.classList.remove("zt-in");
          if (user && !ctx.reducedMotion) {
            void q.art.offsetWidth;
            q.art.classList.add("zt-in");
          }
          if (user && accordion()) q.btn.scrollIntoView({ block: "nearest", behavior: ctx.reducedMotion ? "auto" : "smooth" });
        };

        ctx.listen(log, "click", (e) => {
          const b = e.target.closest(".zt-quest");
          const j = quests.findIndex((q) => q.btn === b);
          if (j >= 0) open(j, { user: true });
        });
        ctx.listen(log, "keydown", (e) => {
          const k = quests.findIndex((q) => q.btn === document.activeElement);
          if (k < 0) return;
          const next = { ArrowDown: k + 1, ArrowUp: k - 1, Home: 0, End: quests.length - 1 }[e.key];
          if (next == null) return;
          e.preventDefault();
          const j = (next + quests.length) % quests.length;
          quests[j].btn.focus();
          if (!accordion()) open(j, { user: true }); // в режиме «список + запись» выбор следует за фокусом
        });
        open(Math.max(0, quests.findIndex((q) => q.btn.classList.contains("zt-todo"))));
      }

      // Запись цели: отметка у статуса, глиф-разделитель, печать «выполнено», галочки в шагах.
      function entry(art, done) {
        const st = art.querySelector(".cond-state");
        if (st) {
          st.textContent = st.textContent.replace(/^\s*✓\s*/, "");
          st.insertAdjacentHTML("afterbegin", `<span class="zt-check" aria-hidden="true">${done ? CHECK : ""}</span>`);
        }
        art.querySelector(".cond-head")?.insertAdjacentHTML("afterend", `<img class="zt-rule" src="${assets}glyph-divider.webp" alt="" aria-hidden="true">`);
        for (const box of art.querySelectorAll(".cond-check li.done .cond-box")) box.innerHTML = CHECK;
        const head = art.querySelector(".cond-check-head");
        if (head?.firstChild?.nodeType === Node.TEXT_NODE) head.firstChild.textContent = "Шаги задания ";
        if (done) art.querySelector(".cond-media")?.insertAdjacentHTML("beforeend", `<span class="zt-seal" aria-hidden="true">${CHECK}</span>`);
      }

      // ---------- боковая панель: кольцо в глифах, ссылки групп переключают вкладки ----------
      function sidePanel(pad) {
        const side = el.side;
        if (!side) return;
        side.classList.add("zt-side");
        side.querySelector(".ring")?.insertAdjacentHTML("afterbegin", `<img class="zt-ring-glyph" src="${assets}glyph-ring.webp" alt="" aria-hidden="true">`);
        for (const li of side.querySelectorAll(".group-progress li")) {
          const m = /^(\d+)\s*\/\s*(\d+)$/.exec(li.querySelector("b")?.textContent.trim() ?? "");
          if (m && +m[2] > 0 && m[1] === m[2]) li.classList.add("zt-complete");
        }
        if (!pad) return;
        ctx.listen(
          root,
          "click",
          (e) => {
            const a = e.target.closest?.("[data-jump]");
            if (!a) return;
            const grp = root.querySelector(`.cond-group[data-group="${CSS.escape(a.dataset.jump)}"]`);
            const i = grp ? pad.panelOf(grp) : -1;
            if (i < 0) return;
            e.preventDefault();
            e.stopPropagation(); // вместо прокрутки к скрытой секции — открыть её вкладку
            pad.select(i, { user: true });
            pad.el.scrollIntoView({ behavior: ctx.reducedMotion ? "auto" : "smooth", block: "start" });
            pad.tabs[i].focus({ preventScroll: true });
          },
          true,
        );
      }

      // ---------- параллакс неба: один rAF-цикл на баннер ----------
      function motion(sky) {
        if (!sky || ctx.reducedMotion) return;
        let tx = 0, ty = 0, px = 0, py = 0, lastY = -1, lastX = 9, lastP = 9;
        if (ctx.finePointer) {
          ctx.listen(
            window,
            "pointermove",
            (e) => {
              tx = e.clientX / window.innerWidth - 0.5;
              ty = e.clientY / window.innerHeight - 0.5;
            },
            { passive: true },
          );
        }
        ctx.loop((now, dt) => {
          const k = 1 - Math.pow(0.004, dt);
          px += (tx - px) * k;
          py += (ty - py) * k;
          const y = window.scrollY;
          if (y === lastY && Math.abs(px - lastX) < 0.001 && Math.abs(py - lastP) < 0.001) return;
          lastY = y;
          lastX = px;
          lastP = py;
          if (y > sky.hero.offsetHeight + 100) return;
          sky.media.style.transform = `translate3d(0, ${(y * 0.3).toFixed(1)}px, 0)`;
          for (const it of sky.isles) {
            it.n.style.transform = `translate3d(${(-px * it.d * 46).toFixed(1)}px, ${(-py * it.d * 18 - y * it.d * 0.22).toFixed(1)}px, 0)`;
          }
          sky.bank.style.transform = `translate3d(${(-px * 18).toFixed(1)}px, ${(-y * 0.08).toFixed(1)}px, 0)`;
        });
      }
    },
  });
})();
