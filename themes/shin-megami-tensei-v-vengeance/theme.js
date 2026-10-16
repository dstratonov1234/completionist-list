// Shin Megami Tensei V: Vengeance — «Компендиум демонов».
// Условия закрытия — записи компендиума: карточки с номером-«уровнем»; у невыполненных — красная плашка
// «Не выполнено», как «Unreg.» у незарегистрированного демона, и приглушённый арт. Карточка открывает экран
// анализа: арт на светящейся воде, сведения и чек-лист по бокам, ◀ ▶ листают цели. Прогресс — фаза луны
// (как счётчик луны в углу экрана игры), по группам — значки ходов (Press Turn). Магацухи: красные капли
// поднимаются по экрану и тянутся за курсором. Вход — багровые круги расцветают из баннера ещё на главной
// (cover), заливают экран, проявляется название; на странице игры круги лопаются и открывают её.
(() => {
  "use strict";

  const FIELDS = [
    ["gives", "Что даёт"],
    ["needs", "Что потребуется"],
    ["unlock", "Открывается"],
    ["counts", "Как засчитываем"],
  ];

  // ---------- заставка: круги Магацухи ----------
  const PALETTE = ["#5a0a16", "#7d0f20", "#a3162c", "#c81f38", "#3a0610", "#e8344b", "#8e1226"];
  const BASE = "#2a050c";
  const COVER_MS = 720; // круги закрывают экран целиком к этому моменту
  const GROW = 0.42; // с — рост одного круга
  const SPREAD = 0.34; // с — волна от точки клика до дальнего угла
  const FILL = [0.36, 0.66]; // с — подложка под кругами проявляется плавно, чтобы не осталось просветов
  const OPEN = { pop: 0.34, spread: 0.42, fill: 0.26 }; // с — лопание кругов при открытии
  const HOLD = { direct: 650, repeat: 260, handoff: 280 }; // мс — пауза с названием перед открытием

  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const easeOut = (x) => 1 - Math.pow(1 - x, 3);
  const easeIn = (x) => x * x * x;

  function makeBloom(layer, game, esc, ox, oy) {
    const canvas = document.createElement("canvas");
    const title = document.createElement("div");
    title.className = "smt-bloom-title";
    title.innerHTML = `<span>${esc(game.title)}</span><i></i>`;
    layer.append(canvas, title);
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const g = canvas.getContext("2d");
    g.scale(dpr, dpr);
    const diag = Math.hypot(w, h);
    const far = Math.max(Math.hypot(ox, oy), Math.hypot(w - ox, oy), Math.hypot(ox, h - oy), Math.hypot(w - ox, h - oy)) || 1;
    const n = Math.round(42 + Math.min(1.6, (w * h) / (1440 * 900)) * 34);
    const circles = [{ x: ox, y: oy, r: diag * 0.2, c: "#a3162c", d: 0, delay: 0 }];
    for (let i = 0; i < n; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      const d = Math.hypot(x - ox, y - oy) / far;
      circles.push({ x, y, r: diag * (0.05 + Math.random() * 0.15), c: PALETTE[i % PALETTE.length], d, delay: d * SPREAD + Math.random() * 0.07 });
    }
    // мелкие брызги при лопании
    for (const c of circles) c.pop = Math.random() * 0.12 + (1 - c.d) * OPEN.spread * 0.15 + c.d * OPEN.spread * 0.85;
    return { layer, canvas, title, g, w, h, circles, drops: [], ox, oy };
  }

  function grid(g, w, h, alpha) {
    if (alpha <= 0) return;
    g.save();
    g.globalAlpha = alpha * 0.22;
    g.strokeStyle = "#ff4a5f";
    g.lineWidth = 1;
    g.beginPath();
    for (let x = 0; x <= w; x += 28) (g.moveTo(x + 0.5, 0), g.lineTo(x + 0.5, h));
    for (let y = 0; y <= h; y += 28) (g.moveTo(0, y + 0.5), g.lineTo(w, y + 0.5));
    g.stroke();
    g.restore();
  }

  function disc(g, x, y, r, color, alpha) {
    if (r <= 0.5 || alpha <= 0) return;
    g.globalAlpha = alpha;
    const grad = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.05, x, y, r);
    grad.addColorStop(0, "#ff6a7c");
    grad.addColorStop(0.18, color);
    grad.addColorStop(1, "#14020590");
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = alpha * 0.55;
    g.strokeStyle = "#ff8090";
    g.lineWidth = 1.2;
    g.stroke();
    g.globalAlpha = 1;
  }

  // Наплыв: t — секунды от начала. Возвращает true, когда экран закрыт полностью.
  function drawIn(b, t) {
    const { g, w, h } = b;
    g.clearRect(0, 0, w, h);
    const fill = clamp01((t - FILL[0]) / (FILL[1] - FILL[0]));
    if (fill > 0) {
      g.globalAlpha = fill;
      g.fillStyle = BASE;
      g.fillRect(0, 0, w, h);
      g.globalAlpha = 1;
    }
    for (const c of b.circles) disc(g, c.x, c.y, c.r * easeOut(clamp01((t - c.delay) / GROW)), c.c, 1);
    grid(g, w, h, fill);
    return t >= FILL[1];
  }

  // Лопание: u — секунды от начала открытия. Возвращает true, когда всё исчезло.
  function drawOut(b, u, dt) {
    const { g, w, h } = b;
    g.clearRect(0, 0, w, h);
    const fill = 1 - clamp01(u / OPEN.fill);
    if (fill > 0) {
      g.globalAlpha = fill;
      g.fillStyle = BASE;
      g.fillRect(0, 0, w, h);
      g.globalAlpha = 1;
    }
    let alive = false;
    for (const c of b.circles) {
      const k = clamp01((u - c.pop) / OPEN.pop);
      if (k >= 1) {
        if (!c.burst) {
          c.burst = true;
          const count = c.r > 60 ? 6 : 3;
          for (let i = 0; i < count; i++) {
            const a = Math.random() * Math.PI * 2;
            const v = 60 + Math.random() * 160;
            b.drops.push({ x: c.x, y: c.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, r: 2 + Math.random() * 5, life: 0.45 + Math.random() * 0.3, t: 0 });
          }
        }
        continue;
      }
      alive = true;
      const s = 1 - easeIn(k);
      disc(g, c.x, c.y - k * 26, c.r * (1 + k * 0.12) * s, c.c, 1 - k * 0.4);
    }
    grid(g, w, h, fill);
    for (const d of b.drops) {
      d.t += dt;
      if (d.t >= d.life) continue;
      alive = true;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.vy += 260 * dt;
      g.globalAlpha = 1 - d.t / d.life;
      g.fillStyle = "#ff4a5f";
      g.beginPath();
      g.arc(d.x, d.y, d.r * (1 - d.t / d.life * 0.5), 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    return !alive && fill <= 0;
  }

  function seenBefore() {
    try {
      const seen = sessionStorage.getItem("smt-bloom") === "1";
      sessionStorage.setItem("smt-bloom", "1");
      return seen;
    } catch {
      return false;
    }
  }

  GameThemes.register("shin-megami-tensei-v-vengeance", {
    // С главной: из баннера расцветают багровые круги и заливают растворяющийся список, проявляется название.
    cover(t) {
      const banner = document.querySelector('.gbanner[data-game="shin-megami-tensei-v-vengeance"]')?.getBoundingClientRect();
      const ox = banner ? banner.left + banner.width * 0.62 : window.innerWidth / 2;
      const oy = banner ? banner.top + banner.height / 2 : window.innerHeight / 2;
      const layer = t.layer("smt-bloom");
      const b = makeBloom(layer, t.game, t.esc, ox, oy);
      t.data.bloom = b;
      t.data.started = performance.now();
      t.data.seen = seenBefore();
      setTimeout(() => b.title.classList.add("in"), 300);
      return new Promise((resolve) => {
        const start = performance.now();
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          drawIn(b, 99);
          resolve();
        };
        const tick = (now) => {
          if (done) return;
          if (drawIn(b, (now - start) / 1000)) finish();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        setTimeout(finish, COVER_MS + 200); // если rAF стоит (фоновая вкладка) — экран всё равно закрыт
      });
    },

    page(ctx) {
      const { root, el, esc, assets, game } = ctx;
      const cond = ctx.conditions;
      const goals = ctx.goals();
      const done = goals.filter((g) => g.done).length;
      const total = goals.length;
      const motion = !ctx.reducedMotion;
      const frame = []; // задачи единственного rAF-цикла
      root.classList.add("smt");

      intro();
      backdrop();
      compendium();
      moon();
      turns();
      magatsuhi();
      if (frame.length) ctx.loop((now, dt) => frame.forEach((fn) => fn(now, dt)));

      return () => {
        root.classList.remove("smt");
        document.documentElement.classList.remove("smt-lock");
      };

      // ---------- вход: круги лопаются и открывают страницу ----------
      function intro() {
        const handed = ctx.handoff?.layers.find((l) => l.classList.contains("smt-bloom"));
        if (!motion) return handed?.remove();
        let b = handed && ctx.handoff.data?.bloom;
        let hold;
        if (b) {
          drawIn(b, 99);
          const since = performance.now() - (ctx.handoff.data.started ?? 0);
          hold = Math.max(HOLD.handoff, (ctx.handoff.data.seen ? 0 : 1150) - since);
        } else {
          handed?.remove();
          const layer = ctx.layer("smt-bloom smt-direct");
          b = makeBloom(layer, game, esc, window.innerWidth / 2, window.innerHeight / 2);
          drawIn(b, 99);
          b.title.classList.add("in");
          hold = seenBefore() ? HOLD.repeat : HOLD.direct;
        }
        const bloom = b;
        let start = 0;
        let finished = false;
        const end = () => {
          if (finished) return;
          finished = true;
          bloom.layer.remove();
        };
        const open = () => {
          if (start || finished) return;
          start = performance.now();
          bloom.title.classList.add("out");
          bloom.layer.classList.add("smt-opening");
          let last = start;
          const tick = (now) => {
            if (finished) return;
            const dt = Math.min(0.05, (now - last) / 1000);
            last = now;
            if (drawOut(bloom, (now - start) / 1000, dt)) end();
            else requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
          timers.push(setTimeout(end, 1800)); // запасной путь, если rAF стоит
        };
        const timers = [setTimeout(open, hold)];
        ctx.onCleanup(() => (timers.forEach(clearTimeout), end()));
        for (const type of ["pointerdown", "keydown", "wheel"]) ctx.listen(window, type, open, { passive: true, once: true });
      }

      // ---------- фон: багровая сетка с каплями, лёгкий параллакс ----------
      function backdrop() {
        const bg = ctx.layer("smt-backdrop");
        bg.style.backgroundImage = `url("${assets}grid.webp")`;
        if (!motion) return;
        let y = -1;
        frame.push(() => {
          if (window.scrollY === y) return;
          y = window.scrollY;
          bg.style.transform = `translate3d(0, ${(-y * 0.08).toFixed(1)}px, 0) scale(1.12)`;
        });
      }

      // ---------- компендиум: карточки целей и экран анализа ----------
      function compendium() {
        const sections = ctx.groups();
        if (!cond || !sections.length || !total) return;
        const order = [];
        sections.forEach((sec, gi) => {
          const gr = cond.groups[gi];
          const list = sec.querySelector(".cond-list");
          if (!gr || !list) return;
          sec.classList.add("smt-race");
          const grid = document.createElement("div");
          grid.className = "smt-grid";
          grid.innerHTML = (gr.goals ?? []).map((g) => cardHtml(g)).join("");
          list.replaceWith(grid);
          for (const g of gr.goals ?? []) order.push({ g, gr });
        });
        const analyze = analyzer(order);
        ctx.listen(root, "click", (e) => {
          const card = e.target.closest(".smt-card");
          if (card && root.contains(card)) analyze.open(card.dataset.n, card);
        });
      }

      function tags(g) {
        return (g.extra ?? [])
          .filter((x) => x?.label && x.value && String(x.value).length <= 28)
          .map((x) => `<span class="smt-chip">${esc(x.label)}: ${esc(x.value)}</span>`)
          .join("");
      }

      function stateTag(g) {
        return g.done ? `<span class="smt-tag smt-tag-on">Выполнено</span>` : `<span class="smt-tag">Не выполнено</span>`;
      }

      function artHtml(g, cls, zoom) {
        const img = ctx.safeUrl(g.image);
        if (!img) return `<span class="${cls} smt-noart"><b>${esc(g.n)}</b></span>`;
        const fit = g.imageFit === "contain" ? "smt-fit" : "";
        const z = zoom ? ` data-zoom data-caption="${esc(g.title)}"` : ` loading="lazy"`;
        return `<span class="${cls} ${fit}"><img src="${esc(img)}" alt="${zoom ? esc(g.title) : ""}"${z}></span>`;
      }

      function cardHtml(g) {
        const steps = (g.checklist ?? []).flatMap((c) => c?.items ?? []);
        const stepCount = steps.length ? `<span class="smt-chip">Шаги: ${steps.filter((s) => s?.done).length}/${steps.length}</span>` : "";
        return `
          <button type="button" class="smt-card ${g.done ? "smt-reg" : "smt-unreg"}" data-n="${esc(g.n)}" aria-haspopup="dialog">
            ${artHtml(g, "smt-card-art", false)}
            <span class="smt-lv" aria-hidden="true"><small>№</small><b>${esc(g.n)}</b></span>
            <span class="smt-card-body">
              <span class="smt-card-name">${esc(g.title)}</span>
              <span class="smt-card-meta">${stateTag(g)}${tags(g)}${stepCount}</span>
            </span>
          </button>`;
      }

      function analyzer(order) {
        const dlg = document.createElement("dialog");
        dlg.className = "smt-analyze";
        dlg.setAttribute("aria-labelledby", "smt-an-name");
        root.append(dlg);
        let cur = 0;
        let opener = null;
        ctx.onCleanup(() => {
          if (dlg.open) dlg.close();
          dlg.remove();
        });

        const factsHtml = (g) =>
          FIELDS.filter(([k]) => g[k])
            .map(([k, label]) => `<div class="smt-stat"><dt>${label}</dt><dd>${esc(g[k])}</dd></div>`)
            .concat((g.extra ?? []).filter((x) => x?.label).map((x) => `<div class="smt-stat"><dt>${esc(x.label)}</dt><dd>${esc(x.value)}</dd></div>`))
            .join("");

        const checklistHtml = (g) =>
          (g.checklist ?? [])
            .map(
              (c) => `
              <div class="smt-skills">
                <div class="smt-skills-head">${esc(c.label || "Чек-лист")}</div>
                <ul>${(c.items ?? []).map((it) => `<li class="${it.done ? "on" : ""}"><i aria-hidden="true"></i><span>${esc(it.title)}</span><b>${it.done ? "✓" : ""}</b></li>`).join("")}</ul>
              </div>`,
            )
            .join("");

        const render = () => {
          const { g, gr } = order[cur];
          const facts = factsHtml(g);
          const gallery = (g.gallery ?? []).map(ctx.safeUrl).filter(Boolean);
          const link = ctx.safeUrl(g.link);
          const more = [
            checklistHtml(g),
            g.note ? `<blockquote class="smt-an-note">${esc(g.note)}</blockquote>` : "",
            g.details ? `<p class="smt-an-details">${esc(g.details)}</p>` : "",
            gallery.length ? `<div class="smt-an-gallery" data-gallery>${gallery.map((u) => `<img src="${esc(u)}" alt="" loading="lazy" data-zoom data-caption="${esc(g.title)}">`).join("")}</div>` : "",
            link ? `<a class="smt-an-link" href="${esc(link)}" target="_blank" rel="noopener">Подробнее ↗</a>` : "",
          ].join("");
          dlg.classList.toggle("smt-reg", !!g.done);
          dlg.innerHTML = `
            <div class="smt-an">
              <header class="smt-an-head">
                <span class="smt-lv smt-lv-big" aria-hidden="true"><small>№</small><b>${esc(g.n)}</b></span>
                <div class="smt-an-id">
                  <span class="smt-an-race">${esc(gr.title)}</span>
                  <h3 id="smt-an-name">${esc(g.title)}</h3>
                </div>
                ${stateTag(g)}
                <button type="button" class="smt-an-close" aria-label="Закрыть">✕</button>
              </header>
              <div class="smt-an-body">
                <figure class="smt-an-stage" data-gallery>
                  ${artHtml(g, "smt-an-art", true)}
                </figure>
                ${facts ? `<section class="smt-an-col smt-an-stats" aria-label="Сведения"><div class="smt-an-sub">Сведения</div><dl>${facts}</dl></section>` : ""}
                ${more ? `<section class="smt-an-col smt-an-more" aria-label="Подробности">${more}</section>` : ""}
              </div>
              <footer class="smt-an-foot">
                <button type="button" class="smt-an-step" data-step="-1" aria-label="Предыдущее условие"><span aria-hidden="true">◀</span> Пред.</button>
                <span class="smt-an-pos">${cur + 1} / ${order.length}</span>
                <button type="button" class="smt-an-step" data-step="1" aria-label="Следующее условие">След. <span aria-hidden="true">▶</span></button>
              </footer>
            </div>`;
          if (motion) {
            dlg.classList.remove("smt-scan");
            void dlg.offsetWidth;
            dlg.classList.add("smt-scan");
          }
        };

        const step = (d) => {
          cur = (cur + d + order.length) % order.length;
          render();
          dlg.querySelector(`.smt-an-step[data-step="${d}"]`)?.focus();
        };

        ctx.listen(dlg, "click", (e) => {
          if (e.target === dlg || e.target.closest(".smt-an-close")) return dlg.close();
          const s = e.target.closest(".smt-an-step");
          if (s) step(Number(s.dataset.step));
        });
        ctx.listen(dlg, "keydown", (e) => {
          if (e.key === "ArrowRight") (e.preventDefault(), step(1));
          else if (e.key === "ArrowLeft") (e.preventDefault(), step(-1));
        });
        ctx.listen(dlg, "close", () => {
          document.documentElement.classList.remove("smt-lock");
          // вернуть фокус на карточку той цели, на которой закрыли экран
          const n = order[cur]?.g.n;
          (root.querySelector(`.smt-card[data-n="${CSS.escape(String(n))}"]`) ?? opener)?.focus({ preventScroll: false });
        });

        return {
          open(n, card) {
            const i = order.findIndex((x) => String(x.g.n) === String(n));
            if (i < 0) return;
            cur = i;
            opener = card;
            render();
            document.documentElement.classList.add("smt-lock");
            dlg.showModal();
            dlg.querySelector(".smt-an-close")?.focus();
          },
        };
      }

      // ---------- прогресс — фаза луны ----------
      function litPath(cx, cy, r, k) {
        if (k <= 0.001) return "";
        if (k >= 0.999) return `M${cx - r},${cy}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0Z`;
        const rx = (r * Math.abs(1 - 2 * k)).toFixed(2);
        return `M${cx},${cy - r}A${r},${r} 0 0,1 ${cx},${cy + r}A${rx},${r} 0 0,${k < 0.5 ? 0 : 1} ${cx},${cy - r}Z`;
      }

      function moon() {
        const ring = el.side?.querySelector(".ring");
        if (!ring || !total) return;
        const k = done / total;
        const box = document.createElement("div");
        box.className = `smt-moon ${k >= 1 ? "smt-full" : ""}`;
        box.setAttribute("role", "img");
        box.setAttribute("aria-label", `Выполнено ${done} из ${total}`);
        box.style.setProperty("--k", k.toFixed(3));
        box.innerHTML = `
          <svg viewBox="0 0 200 200" aria-hidden="true" focusable="false">
            <defs><clipPath id="smt-lit"><path d="${litPath(100, 100, 85.5, k)}"/></clipPath></defs>
            <image class="smt-moon-dark" href="${assets}moon.webp" x="6" y="6" width="188" height="190"/>
            <image class="smt-moon-lit" href="${assets}moon.webp" x="6" y="6" width="188" height="190" clip-path="url(#smt-lit)"/>
          </svg>
          <div class="smt-moon-count"><b>${done}</b><span>/${total}</span></div>
          <small>условий выполнено</small>`;
        ring.replaceWith(box);
      }

      // ---------- по группам — значки ходов ----------
      function turns() {
        const items = [...(el.side?.querySelectorAll(".group-progress li") ?? [])];
        if (!cond || !items.length) return;
        items.forEach((li, i) => {
          const gs = cond.groups[i]?.goals ?? [];
          const bar = li.querySelector(".progress");
          if (!gs.length || !bar) return;
          const icons = document.createElement("span");
          icons.className = "smt-turns";
          icons.setAttribute("aria-hidden", "true");
          icons.innerHTML = gs.map((g) => `<i class="${g.done ? "on" : ""}"></i>`).join("");
          bar.replaceWith(icons);
        });
      }

      // ---------- Магацухи: капли поднимаются по экрану и тянутся за курсором ----------
      function magatsuhi() {
        if (!motion) return;
        const layer = ctx.layer("smt-mag");
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

        // светящаяся капля — один спрайт, дальше только drawImage
        const sprite = document.createElement("canvas");
        sprite.width = sprite.height = 64;
        const sg = sprite.getContext("2d");
        const grad = sg.createRadialGradient(32, 32, 0, 32, 32, 32);
        grad.addColorStop(0, "rgba(255,170,180,1)");
        grad.addColorStop(0.22, "rgba(255,74,95,0.95)");
        grad.addColorStop(0.5, "rgba(200,20,45,0.35)");
        grad.addColorStop(1, "rgba(120,0,20,0)");
        sg.fillStyle = grad;
        sg.fillRect(0, 0, 64, 64);

        const orbs = [];
        const ambient = () => Math.round(18 * Math.min(1.6, Math.max(0.4, (w * h) / (1440 * 900))));
        const spawn = (x, y, trail) =>
          orbs.push({
            x,
            y,
            vx: (Math.random() - 0.5) * (trail ? 40 : 8),
            vy: -(trail ? 20 + Math.random() * 40 : 12 + Math.random() * 26),
            r: trail ? 3 + Math.random() * 6 : 2 + Math.random() * 5,
            a: trail ? 0.8 : 0.18 + Math.random() * 0.3,
            life: trail ? 0.7 + Math.random() * 0.5 : 9 + Math.random() * 8,
            t: 0,
            trail,
            ph: Math.random() * 6.28,
          });
        for (let i = 0; i < ambient(); i++) (spawn(Math.random() * w, Math.random() * h, false), (orbs[orbs.length - 1].t = Math.random() * 6));

        let px = 0;
        let py = 0;
        let lastSpawn = 0;
        if (ctx.finePointer) {
          ctx.listen(
            window,
            "pointermove",
            (e) => {
              px = e.clientX;
              py = e.clientY;
              const now = performance.now();
              if (now - lastSpawn > 34 && !document.querySelector("dialog[open]")) {
                lastSpawn = now;
                spawn(px, py, true);
              }
            },
            { passive: true },
          );
        }

        frame.push((now, dt) => {
          g.clearRect(0, 0, w, h);
          let amb = 0;
          for (let i = orbs.length - 1; i >= 0; i--) {
            const o = orbs[i];
            o.t += dt;
            if (o.t >= o.life || o.y < -20) {
              orbs.splice(i, 1);
              continue;
            }
            if (!o.trail) amb++;
            o.x += (o.vx + Math.sin(now / 900 + o.ph) * (o.trail ? 0 : 10)) * dt;
            o.y += o.vy * dt;
            const fade = o.trail ? 1 - o.t / o.life : Math.min(1, o.t / 1.5, (o.life - o.t) / 2);
            const s = o.r * 4 * (o.trail ? 1 - (o.t / o.life) * 0.5 : 1);
            g.globalAlpha = Math.max(0, o.a * fade);
            g.drawImage(sprite, o.x - s / 2, o.y - s / 2, s, s);
          }
          g.globalAlpha = 1;
          for (let i = amb; i < ambient(); i++) spawn(Math.random() * w, h + 10, false);
        });
      }
    },
  });
})();
