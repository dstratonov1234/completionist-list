// Tales of ARISE — «Сценки».
// Всё своё, по мотивам игры: её сценки-скиты в манга-панелях, акварельный ключевой арт на белом, Пылающий меч
// Альфена и шкала AG из ромбов в боевом интерфейсе:
//  · баннер на главной — полоса из манга-страницы: слева панель с логотипом тушью и шкалой AG по числу условий,
//    справа панель, из которой Альфен и Шионне выходят за рамку. Выделение — вокруг логотипа взрываются линии
//    концентрации, герои подаются вперёд за рамку, с Пылающего меча летят искры, ромбы AG вспыхивают;
//  · при наведении на главную — тёмная страница манги: белые линии концентрации сходятся к баннеру, плывут искры;
//  · заставка — лист прогорает от баннера огнём Пылающего меча, в углях проступает логотип; на странице угли
//    прогорают насквозь, и из-под них открывается светлая страница;
//  · страница — лист манги: каждое условие — панель-сценка. Выполненные прорисованы тушью и раскрашены акварелью
//    (проявляются, когда попадают в кадр), невыполненные — карандашные наброски. Слова игрока — облачко речи,
//    подробности — плашка рассказчика, картинки галереи — маленькие врезки поверх панели.
(() => {
  "use strict";

  const ID = "tales-of-arise";
  const CLOSE_MS = 760;
  const HOLD = { direct: 1500, repeat: 750, handoff: 700, first: 1250 };

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
      const seen = sessionStorage.getItem("ta-skit") === "1";
      sessionStorage.setItem("ta-skit", "1");
      return seen;
    } catch {
      return false;
    }
  }

  // псевдослучайное число от номера — узор один и тот же при каждом заходе
  const rnd = (i, k) => ((Math.sin((i + 1) * 12.9898 + k * 78.233) * 43758.5453) % 1 + 1) % 1;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const smooth = (e0, e1, x) => {
    const t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  };

  // шкала AG: ромбы по числу условий, горят выполненные
  const agHtml = (done, total, cls = "") =>
    `<span class="ta-ag ${cls}" aria-hidden="true">${Array.from({ length: total }, (_, i) => `<i class="${i < done ? "on" : ""}" style="--i:${i}"></i>`).join("")}</span>`;

  // линии концентрации: тонкие клинья остриём к центру, от случайного радиуса до края
  function speedLines(n, seed, r0, r1, R) {
    let d = "";
    for (let i = 0; i < n; i++) {
      const a = ((i + rnd(seed + i, 1) * 0.8) / n) * Math.PI * 2;
      const w = (0.0025 + rnd(seed + i, 2) * 0.0085) * Math.PI;
      const r = r0 + rnd(seed + i, 3) * (r1 - r0);
      const p = (rr, aa) => `${(rr * Math.cos(aa)).toFixed(1)},${(rr * Math.sin(aa)).toFixed(1)}`;
      d += `M${p(r, a)}L${p(R, a - w)}L${p(R, a + w)}Z`;
    }
    return d;
  }

  // ---------- огонь: лист прогорает (заставка) и угли прогорают насквозь (страница) ----------
  // Поле шума и расстояния считается один раз в четверть разрешения; каждый кадр по нему решается, где бумага
  // цела, где обугливается впереди огня, где горит кромка, где уголь. Сверху — искры, летящие с кромки.
  function fireScene(layer, vw, vh) {
    const S = 3;
    const w = Math.ceil(vw / S);
    const h = Math.ceil(vh / S);
    const small = document.createElement("canvas");
    small.width = w;
    small.height = h;
    const sg = small.getContext("2d");
    const img = sg.createImageData(w, h);
    const px = img.data;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cv = document.createElement("canvas");
    cv.className = "ta-fire-cv";
    cv.width = Math.round(vw * dpr);
    cv.height = Math.round(vh * dpr);
    layer.prepend(cv);
    const g = cv.getContext("2d");

    // шум: несколько октав сглаженного value noise
    const noise = new Float32Array(w * h);
    const grain = new Float32Array(w * h);
    const lattice = (gx, gy, k) => rnd(gx * 7919 + gy * 104729 + k * 31, k);
    const vnoise = (x, y, k) => {
      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      const fx = x - x0;
      const fy = y - y0;
      const sx = fx * fx * (3 - 2 * fx);
      const sy = fy * fy * (3 - 2 * fy);
      const a = lattice(x0, y0, k) + (lattice(x0 + 1, y0, k) - lattice(x0, y0, k)) * sx;
      const b = lattice(x0, y0 + 1, k) + (lattice(x0 + 1, y0 + 1, k) - lattice(x0, y0 + 1, k)) * sx;
      return a + (b - a) * sy;
    };
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let v = 0;
        let amp = 0.55;
        let f = 1 / 34;
        for (let o = 0; o < 4; o++) {
          v += vnoise(x * f, y * f, o + 1) * amp;
          amp *= 0.5;
          f *= 2.1;
        }
        noise[y * w + x] = v;
        grain[y * w + x] = vnoise(x / 1.8, y / 1.8, 9);
      }
    }
    const field = new Float32Array(w * h);
    const setOrigin = (ox, oy) => {
      const cx = ox / S;
      const cy = oy / S;
      const far = Math.max(Math.hypot(cx, cy), Math.hypot(w - cx, cy), Math.hypot(cx, h - cy), Math.hypot(w - cx, h - cy));
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) field[y * w + x] = (Math.hypot(x - cx, y - cy) / far) * 0.8 + noise[y * w + x] * 0.34;
    };

    const E = 0.05; // ширина горящей кромки
    const SCORCH = 0.06; // бумага буреет впереди огня
    const st = { mode: "idle", t: -1, t0: 0, dur: 1, ease: (k) => k, onDone: null, sparks: [], last: 0, now: performance.now() };

    // заставка: всё, что за кромкой, — уголь; кромка горит; впереди — подпалина
    const paintBurn = (t) => {
      for (let i = 0, j = 0; i < w * h; i++, j += 4) {
        const diff = t - field[i];
        let r = 0, gg = 0, b = 0, a = 0;
        if (diff > E) {
          charAt(i, j, st.now);
          r = px[j]; gg = px[j + 1]; b = px[j + 2];
          a = 255;
          // тлеющие точки в угле сразу за кромкой
          const glow = smooth(E * 3.2, E, diff) * smooth(0.62, 0.9, grain[i]);
          if (glow > 0) {
            r += glow * 210;
            gg += glow * 70;
          }
        } else if (diff > 0) {
          const k = diff / E; // 0 — свежая кромка, 1 — уже уголь
          if (k < 0.18) {
            const q = k / 0.18;
            r = 255; gg = 246 - q * 66; b = 200 - q * 150;
          } else if (k < 0.5) {
            const q = (k - 0.18) / 0.32;
            r = 255 - q * 40; gg = 180 - q * 110; b = 50 - q * 40;
          } else {
            const q = (k - 0.5) / 0.5;
            r = 215 - q * 190; gg = 70 - q * 58; b = 10 - q * 2;
          }
          a = 255;
        } else if (diff > -SCORCH) {
          const k = 1 + diff / SCORCH; // 0 — край подпалины, 1 — у самой кромки
          r = 70; gg = 36; b = 12;
          a = k * k * 190;
        }
        px[j] = r; px[j + 1] = gg; px[j + 2] = b; px[j + 3] = a;
      }
    };
    // страница: уголь прогорает насквозь — внутри дыры видно страницу, у края дыры горит кромка
    const paintReveal = (t) => {
      for (let i = 0, j = 0; i < w * h; i++, j += 4) {
        const diff = t - field[i];
        let r = 0, gg = 0, b = 0, a = 0;
        if (diff > E) {
          a = 0;
        } else if (diff > 0) {
          const k = diff / E; // 1 — у самой дыры, 0 — уходит в уголь
          if (k > 0.82) {
            const q = (k - 0.82) / 0.18;
            r = 255; gg = 190 + q * 56; b = 60 + q * 140;
            a = 255 * (1 - q * 0.85);
          } else if (k > 0.45) {
            const q = (k - 0.45) / 0.37;
            r = 200 + q * 55; gg = 55 + q * 135; b = 8 + q * 52;
            a = 255;
          } else {
            const q = k / 0.45;
            charAt(i, j, st.now);
            r = px[j] + q * 186; gg = px[j + 1] + q * 45; b = px[j + 2];
            a = 255;
          }
        } else {
          charAt(i, j, st.now);
          r = px[j]; gg = px[j + 1]; b = px[j + 2]; a = 255;
          const glow = smooth(-E * 2.4, 0, diff) * smooth(0.6, 0.9, grain[i]);
          if (glow > 0) {
            r += glow * 200;
            gg += glow * 64;
          }
        }
        px[j] = r; px[j + 1] = gg; px[j + 2] = b; px[j + 3] = a;
      }
    };
    // уголь: тёмная гарь с пеплом, по прожилкам (гребни шума) тлеет и дышит жар
    const ember = (i, now) => {
      const ridge = Math.abs(noise[i] - 0.52 - Math.sin(now * 0.00035 + grain[i] * 2) * 0.012);
      const vein = smooth(0.026, 0.002, ridge);
      if (vein <= 0) return 0;
      return vein * (0.45 + 0.55 * (0.5 + 0.5 * Math.sin(now * 0.0024 + grain[i] * 9 + noise[i] * 30)));
    };
    const charAt = (i, j, now) => {
      const g0 = grain[i];
      const ash = smooth(0.8, 0.97, g0) * 26;
      const c = 9 + g0 * 12 + ash;
      const e = ember(i, now);
      px[j] = c + 5 + e * 235;
      px[j + 1] = c * 0.72 + ash * 0.2 + e * 92;
      px[j + 2] = c * 0.58 + ash * 0.2 + e * 22;
      px[j + 3] = 255;
    };
    const paintChar = (now = performance.now()) => {
      for (let i = 0, j = 0; i < w * h; i++, j += 4) charAt(i, j, now);
    };

    // искры: рождаются на горящей кромке, летят вверх, мерцают и гаснут
    const spawn = (n) => {
      for (let s = 0, tries = 0; s < n && tries < n * 30; tries++) {
        const i = Math.floor(Math.random() * w * h);
        const diff = st.t - field[i];
        if (diff <= 0 || diff > E) continue;
        s++;
        st.sparks.push({
          x: (i % w) * S + Math.random() * S,
          y: Math.floor(i / w) * S + Math.random() * S,
          vx: (Math.random() - 0.5) * 50,
          vy: -50 - Math.random() * 130,
          life: 0,
          max: 0.6 + Math.random() * 1.1,
          r: 0.8 + Math.random() * 1.8,
          f: Math.random() * 6,
        });
      }
    };
    const spawnVein = (n, now) => {
      for (let s = 0, tries = 0; s < n && tries < n * 60; tries++) {
        const i = Math.floor(Math.random() * w * h);
        if (ember(i, now) < 0.5) continue;
        s++;
        st.sparks.push({ x: (i % w) * S, y: Math.floor(i / w) * S, vx: (Math.random() - 0.5) * 30, vy: -25 - Math.random() * 60, life: 0, max: 0.9 + Math.random() * 1.2, r: 0.6 + Math.random() * 1.2, f: Math.random() * 6 });
      }
    };
    const drawSparks = (dt) => {
      g.globalCompositeOperation = "lighter";
      for (const p of st.sparks) {
        p.life += dt;
        p.vy -= 30 * dt;
        p.vx += Math.sin(p.f + p.life * 7) * 22 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        const k = 1 - p.life / p.max;
        if (k <= 0) continue;
        const fl = 0.6 + 0.4 * Math.sin(p.f + p.life * 26);
        g.globalAlpha = k * fl;
        g.fillStyle = "rgba(255, 196, 96, 1)";
        g.beginPath();
        g.arc(p.x, p.y, p.r * 2.6, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "rgba(255, 248, 220, 1)";
        g.beginPath();
        g.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        g.fill();
      }
      st.sparks = st.sparks.filter((p) => p.life < p.max);
      g.globalAlpha = 1;
      g.globalCompositeOperation = "source-over";
    };

    const frame = (now) => {
      if (!layer.isConnected) return;
      const dt = Math.min(0.05, (now - (st.last || now)) / 1000);
      st.last = now;
      st.now = now;
      if (st.mode === "char") {
        paintChar(now);
        if (Math.random() < 0.7) spawnVein(1, now);
      }
      if (st.mode === "burn" || st.mode === "reveal") {
        const k = clamp((now - st.t0) / st.dur, 0, 1);
        st.t = -0.06 + st.ease(k) * 1.26;
        (st.mode === "burn" ? paintBurn : paintReveal)(st.t);
        spawn(st.mode === "burn" ? 10 : 14);
        if (k >= 1) {
          const cb = st.onDone;
          st.onDone = null;
          if (st.mode === "burn") {
            st.mode = "char";
            paintChar();
          } else {
            st.mode = "gone";
          }
          cb?.();
        }
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, vw, vh);
      if (st.mode !== "gone" && st.mode !== "idle") {
        sg.putImageData(img, 0, 0);
        g.imageSmoothingEnabled = true;
        g.imageSmoothingQuality = "high";
        // сетка четверти разрешения не видна: лёгкое размытие при растяжении, сверху — свечение горящей кромки
        g.filter = "blur(2.2px)";
        g.drawImage(small, 0, 0, vw, vh);
        if (st.mode === "burn" || st.mode === "reveal") {
          g.globalCompositeOperation = "lighter";
          g.globalAlpha = 0.55;
          g.filter = "blur(16px)";
          g.drawImage(small, 0, 0, vw, vh);
          g.globalAlpha = 1;
          g.globalCompositeOperation = "source-over";
        }
        g.filter = "none";
      }
      drawSparks(dt);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);

    layer.taFire = {
      burn(ox, oy, dur, ease, onDone) {
        setOrigin(ox, oy);
        Object.assign(st, { mode: "burn", t0: performance.now(), dur, ease, onDone });
      },
      char() {
        st.mode = "char";
        paintChar();
      },
      reveal(ox, oy, dur, ease, onDone) {
        setOrigin(ox, oy);
        Object.assign(st, { mode: "reveal", t0: performance.now(), dur, ease, onDone });
      },
    };
  }

  // кривая CSS cubic-bezier
  function easing(x1, y1, x2, y2) {
    const bx = (t) => 3 * x1 * t * (1 - t) ** 2 + 3 * x2 * t * t * (1 - t) + t ** 3;
    const by = (t) => 3 * y1 * t * (1 - t) ** 2 + 3 * y2 * t * t * (1 - t) + t ** 3;
    return (x) => {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      let lo = 0;
      let hi = 1;
      let t = x;
      for (let i = 0; i < 18; i++) {
        t = (lo + hi) / 2;
        if (bx(t) < x) lo = t;
        else hi = t;
      }
      return by(t);
    };
  }
  const EASE_CATCH = easing(0.55, 0, 0.6, 1); // огонь занимается и разгоняется
  const EASE_EAT = easing(0.3, 0.05, 0.4, 1);

  const titleHtml = (game, esc) => (game.logo ? `<img src="${esc(game.logo)}" alt="">` : `<span>${esc(game.title)}</span>`);

  GameThemes.register("tales-of-arise", {
    // ---------- главная: полоса манга-страницы ----------
    banner(b) {
      warm(["heroes.webp", "logo-ink.webp", "paper.webp", "wash.webp", "wash-blue.webp", "hatch.webp"].map((n) => b.assets + n));
      const { done, total } = b.progress;
      const sparks = Array.from({ length: 14 }, (_, i) => `<i style="--x:${(10 + rnd(i, 1) * 22).toFixed(1)}%;--y:${(30 + rnd(i, 2) * 55).toFixed(1)}%;--d:${(rnd(i, 3) * 1.4).toFixed(2)}s;--t:${(1 + rnd(i, 4) * 0.9).toFixed(2)}s;--dx:${((rnd(i, 5) - 0.5) * 50).toFixed(0)}px"></i>`).join("");
      b.el.innerHTML = `
        <span class="ta-ban">
          <span class="ta-ban-sheet" aria-hidden="true"></span>
          <span class="ta-ban-p1" aria-hidden="true">
            <i class="ta-ban-wash"></i>
            <svg class="ta-ban-p1-lines" viewBox="-700 -700 1400 1400" preserveAspectRatio="xMidYMid slice"><path d="${speedLines(150, 23, 160, 340, 1000)}"/></svg>
          </span>
          <span class="ta-ban-p2" aria-hidden="true">
            <svg class="ta-ban-lines" viewBox="-700 -700 1400 1400" preserveAspectRatio="xMidYMid slice"><path d="${speedLines(120, 5, 110, 240, 1000)}"/></svg>
            ${total ? `<span class="ta-ban-hud"><span class="ta-ban-hud-label">AG</span>${agHtml(done, total)}<span class="ta-ban-count"><b>${done}</b><i>/</i>${total}</span></span>` : ""}
          </span>
          <span class="ta-ban-art" aria-hidden="true">
            <span class="ta-ban-fig"><img class="ta-ban-heroes" src="${b.assets}heroes.webp" alt=""><span class="ta-ban-sparks">${sparks}</span></span>
          </span>
          <span class="ta-ban-cap" aria-hidden="true"><img src="${b.assets}logo-ink.webp" alt=""></span>
          <span class="ta-sr">${b.esc(b.game.title)}. ${total ? `Выполнено ${done} из ${total} условий закрытия` : "Условия ещё не заданы"}</span>
        </span>`;
    },

    // ---------- главная: при наведении — тёмная страница манги, линии концентрации к баннеру ----------
    stage(s) {
      const embers = Array.from({ length: 26 }, (_, i) => `<i style="--x:${(rnd(i, 6) * 100).toFixed(1)}%;--s:${(2 + rnd(i, 7) * 3).toFixed(1)}px;--t:${(5 + rnd(i, 8) * 6).toFixed(1)}s;--d:${(-rnd(i, 9) * 9).toFixed(1)}s;--dx:${((rnd(i, 10) - 0.5) * 140).toFixed(0)}px"></i>`).join("");
      s.el.innerHTML = `
        <div class="ta-st">
          <svg class="ta-st-lines" viewBox="-2000 -2000 4000 4000" aria-hidden="true">
            <path class="a" d="${speedLines(260, 11, 150, 520, 2900)}"/>
            <path class="b" d="${speedLines(200, 77, 220, 640, 2900)}"/>
          </svg>
          <i class="ta-st-vig"></i>
          <div class="ta-st-embers" aria-hidden="true">${embers}</div>
        </div>`;
    },

    // ---------- главная: лист прогорает от баннера ----------
    cover(t) {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const r = document.querySelector(`.gbanner.picked[data-game="${ID}"]`)?.getBoundingClientRect();
      // огонь занимается от Пылающего меча на баннере
      const ox = r && r.width ? r.left + r.width * 0.62 : vw / 2;
      const oy = r && r.width ? r.top + r.height * 0.55 : vh / 2;
      const layer = t.layer("ta-fire");
      fireScene(layer, vw, vh);
      const title = t.layer("ta-title");
      title.innerHTML = titleHtml(t.game, t.esc);
      warm([t.assets + "paper.webp", t.assets + "logo-ink.webp"]);
      fetch(`data/conditions/${ID}.json`)
        .then((res) => (res.ok ? res.json() : null))
        .then((c) => warm((c?.groups ?? []).flatMap((gr) => gr.goals ?? []).slice(0, 6).map((g) => g.image)))
        .catch(() => {});
      t.data.started = performance.now();
      t.data.seen = seenBefore();
      return new Promise((resolve) => {
        layer.taFire.burn(ox, oy, CLOSE_MS, EASE_CATCH, () => {
          title.classList.add("in");
          resolve();
        });
        setTimeout(resolve, CLOSE_MS + 700);
      });
    },

    // ---------- страница игры — лист манги со сценками ----------
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

      root.classList.add("ta");
      root.innerHTML = pageHtml();
      const panels = [...root.querySelectorAll(".ta-panel")];

      if (total) {
        layout();
        ink();
        meter();
        // картинки декодировать, пока экран закрыт: иначе на прокрутке они проявляются с запозданием
        later(() => root.querySelectorAll(".ta-art, .ta-inset img").forEach((im) => im.decode?.().catch(() => {})), 300);
      }
      embers();
      intro();

      return () => root.classList.remove("ta");

      // ---------- разметка ----------
      function pageHtml() {
        const nb = ctx.neighbors ?? {};
        return `
          <div class="ta-page">
            <header class="ta-head">
              <a class="ta-back" href="#/"><span>К списку игр</span></a>
              <h1 class="ta-head-title"><img src="${assets}logo-ink.webp" alt="${esc(game.title)}"></h1>
              ${
                total
                  ? `<div class="ta-hud" role="img" aria-label="Выполнено ${done} из ${total} условий закрытия">
                      <span class="ta-hud-label" aria-hidden="true">AG</span>
                      ${agHtml(done, total, "big")}
                      <span class="ta-hud-count" aria-hidden="true"><b>${done}</b><i>/</i>${total}</span>
                    </div>
                    <p class="ta-hud-cap" aria-hidden="true">условий закрытия</p>`
                  : ""
              }
            </header>
            ${total ? `<main class="ta-book" aria-label="Условия закрытия">${items.map((g, i) => panelHtml(g, i)).join("")}</main>` : `<main class="ta-book ta-book-empty"><p class="ta-narr ta-empty">Условия закрытия для этой игры ещё не заданы.</p></main>`}
            <nav class="ta-nav" aria-label="Другие игры">
              ${nb.prev ? `<a class="prev" href="${esc(nb.prev.href)}"><span>${esc(nb.prev.title)}</span></a>` : ""}
              <a class="home" href="#/"><span>К списку игр</span></a>
              ${nb.next ? `<a class="next" href="${esc(nb.next.href)}"><span>${esc(nb.next.title)}</span></a>` : ""}
            </nav>
          </div>`;
      }

      // ---------- ряды панелей, как на странице манги: по 3 и 2, на планшете по 2, на телефоне по одной ----------
      // соседние панели делит косой просвет; у каждого просвета свой наклон, общий для двух соседей
      function layout() {
        const book = root.querySelector(".ta-book");
        let mode = "";
        const place = () => {
          const W = book.clientWidth;
          const next = W >= 1060 ? "wide" : W >= 700 ? "mid" : "narrow";
          if (next === mode) return;
          mode = next;
          const pattern = mode === "wide" ? [3, 2] : mode === "mid" ? [2] : [1];
          const maxRow = Math.max(...pattern);
          const sizes = [];
          let left = panels.length;
          for (let k = 0; left > 0; k++) {
            let n = Math.min(pattern[k % pattern.length], left);
            // не оставлять одну панель последней в ряду: забрать её в этот ряд или отдать следующему
            if (n > 1 && left - n === 1) n = n + 1 <= maxRow ? n + 1 : n - 1;
            sizes.push(n);
            left -= n;
          }
          const frag = document.createDocumentFragment();
          let at = 0;
          sizes.forEach((n, ri) => {
            const row = document.createElement("div");
            row.className = `ta-row n${n}`;
            if (mode !== "narrow") row.style.setProperty("--rh", `${ri === 0 ? 440 : Math.round(340 + rnd(ri, 6) * 80)}px`);
            const tilt = Array.from({ length: n + 1 }, (_, j) => (j === 0 || j === n ? 0 : (rnd(ri * 7 + j, 4) < 0.5 ? -1 : 1) * (0.25 + rnd(ri * 7 + j, 5) * 0.25)));
            for (let j = 0; j < n; j++) {
              const el = panels[at + j];
              el.classList.toggle("first", j === 0);
              el.classList.toggle("last", j === n - 1);
              el.style.setProperty("--tl", tilt[j].toFixed(3));
              el.style.setProperty("--tr", tilt[j + 1].toFixed(3));
              row.append(el);
            }
            at += n;
            frag.append(row);
          });
          book.replaceChildren(frag);
        };
        place();
        if ("ResizeObserver" in window) {
          const ro = new ResizeObserver(() => place());
          ro.observe(book);
          ctx.onCleanup(() => ro.disconnect());
        }
      }

      function panelHtml(g, i) {
        const img = ctx.safeUrl(g.image);
        const fit = g.imageFit === "contain";
        const gallery = (g.gallery ?? []).map(ctx.safeUrl).filter(Boolean);
        const link = ctx.safeUrl(g.link);
        const cap = esc(g.title);
        const len = (g.title ?? "").length;
        // широкая сцена — шире; длинное условие — тоже
        const weight = (fit ? 1.15 : 1.55) + (len > 160 ? 1 : len > 90 ? 0.45 : 0);
        const lists = (g.checklist ?? [])
          .filter((c) => (c.items ?? []).length)
          .map((c) => `<div class="ta-list">${c.label ? `<b>${esc(c.label)}</b>` : ""}<ul>${c.items.map((it) => `<li class="${it.done ? "on" : ""}">${esc(it.title)}</li>`).join("")}</ul></div>`)
          .join("");
        const size = len > 200 ? "xl" : len > 110 ? "l" : len > 60 ? "m" : "s";
        return `
          <section class="ta-panel ${g.done ? "done" : "todo"} ${fit ? "fig" : "scene"}" style="--w:${weight.toFixed(2)};--tl:0;--tr:0;--hue:${(rnd(i, 8) * 40 - 20).toFixed(0)}deg" aria-label="№${esc(g.n)}${g.done ? ", выполнено" : ", не выполнено"}" data-gallery>
            <div class="ta-frame"><div class="ta-fill">
              ${fit ? `<i class="ta-wash ${i % 3 === 1 ? "blue" : ""}"></i>` : ""}
              ${img ? `<img class="ta-art" src="${esc(img)}" alt="" decoding="async" data-zoom data-caption="${cap}">` : ""}
              <i class="ta-sketch" aria-hidden="true"></i>
            </div></div>
            <span class="ta-num" aria-hidden="true">${esc(g.n)}</span>
            ${gallery.length ? `<span class="ta-insets" style="--n:${gallery.length}">${gallery.map((u, k) => `<span class="ta-inset" style="--k:${k}"><img src="${esc(u)}" alt="" decoding="async" data-zoom data-caption="${cap}"></span>`).join("")}</span>` : ""}
            <div class="ta-text">
              ${g.note ? `<p class="ta-bubble">${esc(g.note)}</p>` : ""}
              <div class="ta-cap ${size}">
                <h3>${cap}</h3>
                ${g.details ? `<p class="ta-details">${esc(g.details)}</p>` : ""}
                ${lists}
                ${link ? `<a class="ta-lore" href="${esc(link)}" target="_blank" rel="noopener">Подробнее&nbsp;↗</a>` : ""}
              </div>
            </div>
          </section>`;
      }

      // ---------- выполненная панель, впервые попав в кадр, прорисовывается тушью и раскрашивается ----------
      function ink() {
        const doneP = panels.filter((p) => p.classList.contains("done"));
        if (!motion || !("IntersectionObserver" in window)) {
          doneP.forEach((p) => p.classList.add("inked"));
          return;
        }
        const io = new IntersectionObserver(
          (entries) => {
            for (const en of entries) {
              if (!en.isIntersecting) continue;
              io.unobserve(en.target);
              en.target.classList.add("inked");
            }
          },
          { threshold: 0.35 },
        );
        later(() => doneP.forEach((p) => io.observe(p)), ctx.handoff ? 1500 : 1700);
        ctx.onCleanup(() => io.disconnect());
      }

      // ---------- шкала AG в шапке: ромбы заряжаются один за другим, когда открылась страница ----------
      function meter() {
        const hud = root.querySelector(".ta-hud");
        if (!hud) return;
        if (!motion) return hud.classList.add("charged");
        later(() => hud.classList.add("charged"), ctx.handoff ? 1300 : 1500);
      }

      // ---------- курсор — искры Пылающего меча ----------
      function embers() {
        if (!ctx.finePointer || !motion) return;
        const layer = ctx.layer("ta-sparks");
        const cv = document.createElement("canvas");
        layer.append(cv);
        const g = cv.getContext("2d");
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        let vw = 0;
        let vh = 0;
        const size = () => {
          vw = window.innerWidth;
          vh = window.innerHeight;
          cv.width = Math.round(vw * dpr);
          cv.height = Math.round(vh * dpr);
        };
        size();
        ctx.listen(window, "resize", size);
        let sparks = [];
        let px = -1;
        let py = -1;
        ctx.listen(window, "pointermove", (e) => {
          const moved = px < 0 ? 0 : Math.hypot(e.clientX - px, e.clientY - py);
          px = e.clientX;
          py = e.clientY;
          const n = Math.min(4, Math.floor(moved / 14) + (Math.random() < 0.3 ? 1 : 0));
          for (let k = 0; k < n && sparks.length < 90; k++) {
            sparks.push({ x: px + (Math.random() - 0.5) * 6, y: py + (Math.random() - 0.5) * 6, vx: (Math.random() - 0.5) * 40, vy: -30 - Math.random() * 70, life: 0, max: 0.5 + Math.random() * 0.7, r: 0.7 + Math.random() * 1.4, f: Math.random() * 6 });
          }
        }, { passive: true });
        ctx.loop((now, dt) => {
          g.setTransform(dpr, 0, 0, dpr, 0, 0);
          g.clearRect(0, 0, vw, vh);
          if (!sparks.length) return;
          for (const p of sparks) {
            p.life += dt;
            p.vy -= 24 * dt;
            p.vx += Math.sin(p.f + p.life * 8) * 18 * dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            const k = 1 - p.life / p.max;
            if (k <= 0) continue;
            g.globalAlpha = k * (0.65 + 0.35 * Math.sin(p.f + p.life * 30));
            g.fillStyle = "#ff8a2a";
            g.beginPath();
            g.arc(p.x, p.y, p.r * 2.4, 0, Math.PI * 2);
            g.fill();
            g.fillStyle = "#ffe9b0";
            g.beginPath();
            g.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            g.fill();
          }
          g.globalAlpha = 1;
          sparks = sparks.filter((p) => p.life < p.max);
        });
      }

      // ---------- вход: угли прогорают насквозь, и из-под них открывается страница ----------
      function intro() {
        const fire = ctx.handoff?.layers.find((l) => l.classList.contains("ta-fire"));
        const handedTitle = ctx.handoff?.layers.find((l) => l.classList.contains("ta-title"));
        if (!motion) {
          fire?.remove();
          handedTitle?.remove();
          return;
        }
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        let layer = fire;
        let title = handedTitle;
        let hold;
        if (layer?.taFire && title) {
          const since = performance.now() - (ctx.handoff.data.started ?? 0);
          hold = Math.max(HOLD.handoff, (ctx.handoff.data.seen ? 0 : HOLD.first) - since);
        } else {
          // прямой заход: экран уже в углях, логотип тлеет в них
          layer?.remove();
          title?.remove();
          layer = ctx.layer("ta-fire");
          fireScene(layer, vw, vh);
          layer.taFire.char();
          title = ctx.layer("ta-title");
          title.innerHTML = titleHtml(game, esc);
          later(() => title.classList.add("in"), 90);
          hold = seenBefore() ? HOLD.repeat : HOLD.direct;
        }
        const L = layer;
        const ttl = title;
        root.classList.add("ta-intro");
        let opened = false;
        const open = () => {
          if (opened) return;
          opened = true;
          ttl.classList.add("out");
          later(() => {
            root.classList.remove("ta-intro");
            L.taFire.reveal(vw / 2, vh * 0.42, 1150, EASE_EAT, () => later(() => L.remove(), 1400));
          }, 160);
          later(() => ttl.remove(), 900);
          later(() => L.isConnected && L.remove(), 3200);
        };
        later(open, hold);
        ctx.onCleanup(() => {
          L.remove();
          ttl.remove();
          root.classList.remove("ta-intro");
        });
        for (const type of ["pointerdown", "keydown", "wheel"]) ctx.listen(window, type, open, { passive: true, once: true });
      }
    },
  });
})();
