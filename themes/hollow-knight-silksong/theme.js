// Hollow Knight: Silksong — «Шёлк и песня Фарлума».
// Вход — алые шёлковые кулисы: с главной они сходятся ещё над списком (cover) и расходятся уже над
// страницей игры; при прямом заходе стоят закрытыми и расходятся. Курсор тянет за собой красную нить
// (верлет-верёвка на canvas); секции «сшиты» стежком, который протягивает игла при прокрутке; в баннере
// висит игла с колокольчиком — знак очереди / прогресса; за страницей — позолоченная цитадель с параллаксом.
// Модуль не завязан на конкретные секции: всё, чего нет на странице, просто пропускается.
(() => {
  "use strict";

  const ID = "hollow-knight-silksong";
  // Две нити от точки подвеса к краям (Λ): общий кусок для знака в баннере и для «заплаток»-целей.
  const V_SVG = `<svg viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><path class="ss-v-l" d="M50 0 L3 30"/><path class="ss-v-r" d="M50 0 L97 30"/></svg>`;
  const LOOSE_SVG = `<svg viewBox="0 0 24 80" aria-hidden="true"><path d="M4 0 C 4 14, 20 18, 16 34 S 4 52, 12 66 S 20 76, 16 80"/></svg>`;

  // Кулисы: две половины, ламбрекен сверху (::before) и узел с колокольчиком посередине.
  const curtainsHtml = (assets) => `
    <div class="ss-curtain ss-l"></div>
    <div class="ss-curtain ss-r"></div>
    <div class="ss-clasp"><img src="${assets}knot.webp" alt=""><img class="ss-clasp-bell" src="${assets}bell.webp" alt=""></div>`;

  // Кулисы сходятся за SHUT_MS; сомкнувшись, стоят закрытыми около HOLD_MS, затем расходятся.
  const SHUT_MS = 720;
  const HOLD_MS = 380;
  const OPEN_MS = 420; // прямой заход: сколько кулисы стоят закрытыми до раскрытия
  const GONE_MS = 1880; // от начала раскрытия до удаления слоя

  GameThemes.register("hollow-knight-silksong", {
    // Начало заставки ещё на главной: кулисы сходятся с боков над растворяющимся списком,
    // сверху опускается ламбрекен, на стыке — узел, колокольчик звенит. Promise — когда экран закрыт.
    cover(t) {
      const c = t.layer("ss-curtains ss-cover ss-pre");
      c.innerHTML = curtainsHtml(t.assets);
      void c.offsetWidth; // зафиксировать раскрытое положение, чтобы закрытие шло transition-ом
      c.classList.remove("ss-pre");
      t.data.shutAt = performance.now() + SHUT_MS;
      return t.wait(SHUT_MS + 30);
    },

    page(ctx) {
      const { root, el, esc, assets, game } = ctx;
      const motion = !ctx.reducedMotion;
      root.classList.add("ss");

      const timers = [];
      const later = (fn, ms) => timers.push(setTimeout(fn, ms));
      ctx.onCleanup(() => timers.forEach(clearTimeout));

      try { curtains(); } catch (e) { console.error(e); }
      try { citadel(); } catch (e) { console.error(e); }
      try { ornament(); } catch (e) { console.error(e); }
      try { tapestry(); } catch (e) { console.error(e); }
      try { hoop(); } catch (e) { console.error(e); }
      try { seams(); } catch (e) { console.error(e); }
      try { silkLoop(); } catch (e) { console.error(e); }

      return () => root.classList.remove("ss");

      // ---------- вход: две шёлковые кулисы расходятся ----------
      function curtains() {
        // С главной кулисы уже сомкнулись над экраном (cover) — только раскрываем их.
        const handed = ctx.handoff?.layers?.find?.((l) => l?.classList?.contains("ss-curtains"));
        if (handed) {
          if (!motion) return handed.remove();
          const since = performance.now() - (Number(ctx.handoff.data?.shutAt) || 0);
          const hold = Math.max(120, Math.min(HOLD_MS, HOLD_MS - since));
          later(() => handed.classList.add("ss-open"), hold);
          later(() => handed.remove(), hold + GONE_MS);
          return;
        }
        if (!motion) return;
        const c = ctx.layer("ss-curtains");
        c.innerHTML = curtainsHtml(assets);
        later(() => c.classList.add("ss-open"), OPEN_MS);
        later(() => c.remove(), OPEN_MS + GONE_MS);
      }

      // ---------- фон: цитадель за контентом ----------
      function citadel() {
        ctx.layer("ss-citadel");
      }

      // ---------- игла с колокольчиком в баннере: очередь / прогресс / итог ----------
      function ornament() {
        const hero = el.hero;
        if (!hero) return;
        const info = status();
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `ss-ornament ss-${esc(game.status ?? "planned")}`;
        btn.setAttribute("aria-label", `${info.label}: ${info.value}${info.sub ? `, ${info.sub}` : ""}. Позвонить в колокольчик`);
        if (info.frac != null) btn.style.setProperty("--frac", info.frac.toFixed(3));
        btn.innerHTML = `
          <span class="ss-orn-sway">
            <span class="ss-orn-thread"></span>
            <img class="ss-orn-needle" src="${assets}needle.webp" alt="">
            <span class="ss-orn-v">${V_SVG}</span>
            <span class="ss-orn-plaque">
              <small>${esc(info.label)}</small>
              <b>${esc(info.value)}</b>
              ${info.frac != null ? `<span class="ss-orn-bar"><i></i></span>` : ""}
              ${info.sub ? `<em>${esc(info.sub)}</em>` : ""}
            </span>
            <span class="ss-orn-bell"><img src="${assets}bell.webp" alt=""><i class="ss-orn-ripple"></i></span>
          </span>`;
        hero.append(btn);
        hero.classList.add("ss-has-ornament");

        let t = 0;
        ctx.listen(btn, "click", () => {
          btn.classList.remove("ss-ring");
          void btn.offsetWidth;
          btn.classList.add("ss-ring");
          clearTimeout(t);
          t = setTimeout(() => btn.classList.remove("ss-ring"), 1700);
        });
        ctx.onCleanup(() => clearTimeout(t));
      }

      function status() {
        // Прогресс — по условиям закрытия (ctx.goals()), иначе по сводке game.goals {done,total}, иначе game.progress.
        let all = [];
        try {
          all = typeof ctx.goals === "function" ? [].concat(ctx.goals() ?? []) : [];
        } catch {
          all = [];
        }
        const sum = game.goals && !Array.isArray(game.goals) && typeof game.goals === "object" ? game.goals : null;
        const total = all.length || Number(sum?.total) || 0;
        const done = all.length ? all.filter((g) => g?.done === true).length : Number(sum?.done) || 0;
        const pct = total ? (done / total) * 100 : Number.isFinite(Number(game.progress)) && game.progress != null ? Number(game.progress) : null;
        const clamp01 = (n) => Math.max(0, Math.min(1, n));
        switch (game.status) {
          case "in_progress":
            return {
              label: "Восхождение",
              value: pct != null ? `${Math.round(pct)}%` : game.playtime != null ? ctx.fmtHours(game.playtime) : "в пути",
              sub: game.started ? `с ${ctx.fmtDate(game.started)}` : "",
              frac: pct != null ? clamp01(pct / 100) : null,
            };
          case "completed":
            return {
              label: "Вершина достигнута",
              value: total ? `${done}/${total}` : "✦",
              sub: game.finished ? ctx.fmtDate(game.finished) : "",
              frac: total ? clamp01(done / total) : 1,
            };
          default: {
            const p = game.priority;
            return {
              label: p === 1 ? "Следующая в очереди" : "В очереди",
              value: p != null ? `№ ${p}` : "❈",
              sub: game.added ? `добавлена ${ctx.fmtDate(game.added)}` : "",
              frac: null,
            };
          }
        }
      }

      // ---------- гобелен: каждая цель — вышитая заплатка, висящая на шёлковых нитях ----------
      // Выполненная — прошита по всему краю, висит ровно, под ней колокольчик; невыполненная —
      // прошита наполовину, висит чуть криво, с распущенной нитью, приглушена.
      function tapestry() {
        let secs = [];
        try {
          secs = typeof ctx.groups === "function" ? [].concat(ctx.groups() ?? []) : [];
        } catch {
          secs = [];
        }
        if (!secs.length) secs = [...root.querySelectorAll(".cond-group")];
        let k = 0;
        for (const sec of secs) {
          const list = sec?.querySelector?.(".cond-list");
          if (!list) continue;
          list.classList.add("ss-tapestry");
          for (const art of list.querySelectorAll(":scope > .cond")) patch(art, k++);
        }
        if (!k) return;
        // картинка цели открывается в лайтбоксе и с клавиатуры (Enter / пробел)
        ctx.listen(root, "keydown", (e) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          const m = e.target.closest?.(".ss-media-btn");
          if (!m || m !== e.target || !(m.matches("img[data-zoom]") || m.querySelector(":scope > img[data-zoom]"))) return;
          e.preventDefault();
          m.click();
        });
      }

      function patch(art, i) {
        const done = art.classList.contains("done");
        art.classList.add("ss-patch");
        art.style.setProperty("--ss-tilt", done ? "0deg" : `${i % 2 ? 0.9 : -0.9}deg`);
        art.style.setProperty("--ss-d", `${((i % 4) * 0.14).toFixed(2)}s`);

        const hang = document.createElement("span");
        hang.className = "ss-hanger";
        hang.setAttribute("aria-hidden", "true");
        hang.innerHTML = `${V_SVG}<i class="ss-pin"></i><img class="ss-hanger-needle" src="${assets}needle.webp" alt="">`;
        art.prepend(hang);

        const deco = document.createElement("span");
        deco.setAttribute("aria-hidden", "true");
        if (done) {
          deco.className = "ss-pbell";
          deco.innerHTML = `<img src="${assets}bell.webp" alt="">`;
        } else {
          deco.className = "ss-loose";
          deco.innerHTML = LOOSE_SVG;
        }
        art.append(deco);

        const title = art.querySelector(".cond-title")?.textContent?.trim() ?? "";
        const media = art.querySelector(":scope > .cond-media");
        if (media?.querySelector(":scope > img[data-zoom]")) zoomable(media, `Открыть изображение${title ? `: ${title}` : ""}`);
        art.querySelectorAll(".cond-gallery img[data-zoom]").forEach((img, j) => zoomable(img, `Открыть кадр ${j + 1}${title ? `: ${title}` : ""}`));
      }

      function zoomable(node, label) {
        node.classList.add("ss-media-btn");
        node.tabIndex = 0;
        node.setAttribute("role", "button");
        node.setAttribute("aria-label", label);
      }

      // ---------- кольцо прогресса в боковой панели — пяльцы с намотанной нитью ----------
      function hoop() {
        const ring = el.side?.querySelector(".ring") ?? root.querySelector(".game-side .ring");
        if (!ring) return;
        ring.classList.add("ss-hoop");
        const clamp = document.createElement("span");
        clamp.className = "ss-hoop-clamp";
        clamp.setAttribute("aria-hidden", "true");
        ring.append(clamp);
      }

      // ---------- стежок, сшивающий секции: игла протягивает нить при прокрутке ----------
      function seams() {
        const main = el.main ?? root.querySelector(".game-main");
        if (!main) return;
        const blocks = [...main.querySelectorAll(":scope > .block")];
        if (!blocks.length) return;
        for (const b of blocks) {
          b.classList.add("ss-sewable");
          const s = document.createElement("span");
          s.className = "ss-stitch";
          s.setAttribute("aria-hidden", "true");
          s.innerHTML = `<img class="ss-knot" src="${assets}knot.webp" alt=""><span class="ss-seam"><span class="ss-seam-run"><img class="ss-seam-needle" src="${assets}needle.webp" alt=""></span></span>`;
          b.prepend(s);
        }
        blocks[blocks.length - 1].classList.add("ss-last");
        if (!motion || !("IntersectionObserver" in window)) {
          blocks.forEach((b) => b.classList.add("ss-sewn"));
          return;
        }
        const io = new IntersectionObserver(
          (entries) => {
            for (const e of entries) {
              if (!e.isIntersecting) continue;
              e.target.classList.add("ss-sewn");
              io.unobserve(e.target);
            }
          },
          { rootMargin: "0px 0px -60px 0px", threshold: 0 },
        );
        blocks.forEach((b) => io.observe(b));
        ctx.onCleanup(() => io.disconnect());
      }

      // ---------- один rAF-цикл: параллакс цитадели + нить за курсором ----------
      function silkLoop() {
        if (!motion) return;
        const bg = document.querySelector("body > .ss-citadel");
        const thread = ctx.finePointer ? silkThread() : null;
        let y = -1;
        ctx.loop((now, dt) => {
          if (bg && window.scrollY !== y) {
            y = window.scrollY;
            bg.style.transform = `translate3d(0, ${(-y * 0.06).toFixed(1)}px, 0) scale(1.12)`;
          }
          thread?.(now, dt);
        });
      }

      // Красная шёлковая нить тянется за курсором: верлет-верёвка из нескольких звеньев, один canvas.
      function silkThread() {
        const layer = ctx.layer("ss-silk");
        const cv = document.createElement("canvas");
        layer.append(cv);
        const g = cv.getContext("2d");
        if (!g) return null;

        const N = 16, SEG = 8.5, GRAV = 0.38, DAMP = 0.968;
        const pts = Array.from({ length: N }, () => ({ x: 0, y: 0, px: 0, py: 0 }));
        let mx = 0, my = 0, seen = false, moved = false, gold = false, sy = window.scrollY;
        let dpr = 1, W = 0, H = 0, acc = 0, box = null;

        const resize = () => {
          dpr = Math.min(2, window.devicePixelRatio || 1);
          W = window.innerWidth;
          H = window.innerHeight;
          cv.width = Math.round(W * dpr);
          cv.height = Math.round(H * dpr);
          cv.style.width = `${W}px`;
          cv.style.height = `${H}px`;
          box = null;
          moved = true;
        };
        resize();
        ctx.listen(window, "resize", resize, { passive: true });

        ctx.listen(
          window,
          "pointermove",
          (e) => {
            if (e.pointerType && e.pointerType !== "mouse" && e.pointerType !== "pen") return;
            mx = e.clientX;
            my = e.clientY;
            if (!seen) {
              seen = true;
              pts.forEach((p, i) => ((p.x = p.px = mx), (p.y = p.py = my + i * SEG)));
            }
            gold = !!e.target?.closest?.("a, button, [role='button'], summary, input, label");
            moved = true;
            layer.classList.add("ss-on");
          },
          { passive: true },
        );
        ctx.listen(document, "pointerleave", () => layer.classList.remove("ss-on"));
        ctx.listen(window, "blur", () => layer.classList.remove("ss-on"));
        ctx.listen(
          window,
          "pointerdown",
          () => {
            for (let i = 1; i < N; i++) pts[i].px += (Math.random() - 0.5) * 7 * (i / N);
            moved = true;
          },
          { passive: true },
        );
        ctx.listen(
          window,
          "scroll",
          () => {
            const d = Math.max(-40, Math.min(40, window.scrollY - sy));
            sy = window.scrollY;
            for (let i = 1; i < N; i++) pts[i].py += d * 0.1 * (i / N);
            moved = true;
          },
          { passive: true },
        );

        const step = (now) => {
          const a = pts[0];
          a.x = a.px = mx;
          a.y = a.py = my;
          for (let i = 1; i < N; i++) {
            const p = pts[i];
            const vx = (p.x - p.px) * DAMP, vy = (p.y - p.py) * DAMP;
            p.px = p.x;
            p.py = p.y;
            p.x += vx + Math.sin(now / 900 + i * 0.5) * 0.012 * i;
            p.y += vy + GRAV;
          }
          for (let k = 0; k < 8; k++) {
            for (let i = 1; i < N; i++) {
              const p = pts[i - 1], q = pts[i];
              const dx = q.x - p.x, dy = q.y - p.y;
              const d = Math.hypot(dx, dy) || 0.001;
              const f = (d - SEG) / d;
              if (i === 1) {
                q.x -= dx * f;
                q.y -= dy * f;
              } else {
                q.x -= dx * f * 0.5;
                q.y -= dy * f * 0.5;
                p.x += dx * f * 0.5;
                p.y += dy * f * 0.5;
              }
            }
          }
        };

        const energy = () => {
          let e = 0;
          for (let i = 1; i < N; i++) e += Math.abs(pts[i].x - pts[i].px) + Math.abs(pts[i].y - pts[i].py);
          return e;
        };

        const draw = () => {
          if (box) g.clearRect(box[0], box[1], box[2] - box[0], box[3] - box[1]);
          let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
          for (const p of pts) {
            if (p.x < x0) x0 = p.x;
            if (p.y < y0) y0 = p.y;
            if (p.x > x1) x1 = p.x;
            if (p.y > y1) y1 = p.y;
          }
          const pad = 10;
          box = [(x0 - pad) * dpr, (y0 - pad) * dpr, (x1 + pad) * dpr, (y1 + pad) * dpr];

          g.setTransform(dpr, 0, 0, dpr, 0, 0);
          g.lineCap = "round";
          g.lineJoin = "round";
          const path = () => {
            g.beginPath();
            g.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < N - 1; i++) {
              const p = pts[i], q = pts[i + 1];
              g.quadraticCurveTo(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2);
            }
            g.lineTo(pts[N - 1].x, pts[N - 1].y);
          };
          path();
          g.strokeStyle = gold ? "rgba(242,180,94,0.22)" : "rgba(229,72,60,0.22)";
          g.lineWidth = 5;
          g.stroke();
          g.strokeStyle = gold ? "#f2b45e" : "#e5483c";
          g.lineWidth = 1.7;
          g.stroke();
          g.strokeStyle = "rgba(255,214,190,0.45)";
          g.lineWidth = 0.6;
          g.stroke();
          const t = pts[N - 1];
          g.fillStyle = gold ? "#f2b45e" : "#c8312b";
          g.beginPath();
          g.arc(t.x, t.y, 2.3, 0, Math.PI * 2);
          g.fill();
          g.setTransform(1, 0, 0, 1, 0, 0);
        };

        return (now, dt) => {
          if (!seen) return;
          acc = Math.min(acc + dt, 0.05);
          const h = 1 / 60;
          let stepped = false;
          while (acc >= h) {
            step(now);
            acc -= h;
            stepped = true;
          }
          if (!stepped && !moved) return;
          if (!moved && energy() < 0.04) return;
          moved = false;
          draw();
        };
      }
    },
  });
})();
