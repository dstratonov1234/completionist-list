// Legend of Grimrock — «Тайник за стеной».
// Всё своё, по мотивам сеточного подземелья Гримрока: каменные стены из блоков, факелы в железных держателях,
// решётки, ниши с полкой, потайные стены, которые уходят в пол, и шаг по клеткам:
//  · баннер на главной — кусок стены с неровным краем кладки: слева высечено золотом название и ряд факелов по
//    числу условий (горят — выполнены), справа дверной проём в коридор с решёткой. Выделение — решётка с лязгом
//    уходит вверх, камера делает два шага вперёд по клеткам, факелы вспыхивают;
//  · при наведении на главную — коридор: стены, пол и потолок из камня сходятся к баннеру, факелы по стенам
//    загораются один за другим от ближних к дальним;
//  · заставка — три шага по клеткам того же коридора к глухой стене, на которой высечено название; на странице
//    стена, как тайник, со скрежетом уходит в пол;
//  · страница — тайная комната: каждое условие в нише стены (картинка — то, что лежит в нише). Выполненные — решётка
//    поднята, рядом горит факел; невыполненные — за решёткой во тьме. Курсор — факел в руке.
(() => {
  "use strict";

  const ID = "legend-of-grimrock";
  const CLOSE_MS = 780;
  const HOLD = { direct: 1600, repeat: 750, handoff: 750, first: 1400 };

  // коридор в мировых единицах: перспектива, сечение, длина клетки, ближний край, число клеток
  const P = 900;
  const CW = 1400;
  const CH = 1000;
  const T = 900;
  const Z0 = 600;
  const TORCHES = [0, 2, 4, 6]; // клетки с парой факелов; ближняя пара стоит у самого экрана — её видно в полях по бокам списка
  const END_K = 4; // в заставке за этой клеткой — глухая стена
  // яркость камня: у каждой поверхности одна на всю длину (по клеткам была бы ступенька на каждом стыке);
  // вдаль коридор темнеет общим туманом поверх кадра
  const LIT = { floor: 0.85, ceil: 0.7, wall: 0.92, end: 0.56 };

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
      const seen = sessionStorage.getItem("lg-step") === "1";
      sessionStorage.setItem("lg-step", "1");
      return seen;
    } catch {
      return false;
    }
  }

  // псевдослучайное число от номера — узор один и тот же при каждом заходе
  const rnd = (i, k) => ((Math.sin((i + 1) * 12.9898 + k * 78.233) * 43758.5453) % 1 + 1) % 1;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

  const ROMAN = [[10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  function roman(n) {
    let v = Number(n);
    if (!Number.isFinite(v) || v <= 0 || v > 39) return String(n);
    let s = "";
    for (const [k, r] of ROMAN) while (v >= k) (s += r), (v -= k);
    return s;
  }

  // название, высеченное золотом, как в логотипе игры
  const titleHtml = (cls = "") => `<span class="lg-logo ${cls}" aria-hidden="true"><small>Legend of</small><b>Grimrock</b></span>`;

  // факел: держатель и пламя (у незажжённого пламя спрятано)
  const torchHtml = (assets, cls = "", style = "") =>
    `<i class="lg-torch ${cls}" style="${style}"><img class="lg-torch-sconce" src="${assets}sconce.webp" alt=""><img class="lg-torch-flame" src="${assets}flame.webp" alt=""><b class="lg-torch-glow"></b></i>`;

  // ---------- коридор: пол, потолок и стены — по одной сплошной плоскости (без швов между клетками);
  // факелы — «плакаты» лицом к камере, свет факела — мягкое пятно чуть впереди стены и на полу ----------
  // name — имя, el — элемент с мировой глубиной data-z: заставка гасит то, что подходит вплотную к камере
  // финал заставки: глухая стена ближе экрана ровно настолько, чтобы закрыть его целиком; название на ней —
  // того же размера, что на плоской стене, которая сменит её у самого экрана
  function finale(vw, vh) {
    const s = Math.max(vw / CW, vh / CH) * 1.08;
    const delta = clamp(P * (1 - 1 / s), 60, P * 0.82);
    const sEnd = P / (P - delta);
    const fs2d = clamp(vw * 0.09, 54, 150);
    return { delta, sEnd, fs: fs2d / sEnd, y: ((0.47 - 0.5) * vh) / sEnd };
  }

  function hallHtml(assets, title) {
    const cells = END_K;
    const end = true;
    const zEnd = Z0 - cells * T;
    const L = Z0 - zEnd;
    const zc = (Z0 + zEnd) / 2;
    const surf = (cls, b, w, h, tf, pos) =>
      `<i class="lg-pl ${cls}" style="--b:${b};width:${w}px;height:${h}px;background-position:${pos};transform:${tf}"></i>`;
    let html = "";
    // пол и потолок: ширина — сечение, высота — длина коридора; узор стен и пола привязан к ближнему краю
    html += surf("floor", LIT.floor, CW, L, `translate3d(0px, ${CH / 2}px, ${zc}px) rotateX(90deg) translate(-50%, -50%)`, "50% 100%");
    html += surf("ceil", LIT.ceil, CW, L, `translate3d(0px, ${-CH / 2}px, ${zc}px) rotateX(-90deg) translate(-50%, -50%)`, "50% 0");
    html += surf("wall l", LIT.wall, L, CH, `translate3d(${-CW / 2}px, 0px, ${zc}px) rotateY(90deg) translate(-50%, -50%)`, "0 50%");
    html += surf("wall r", LIT.wall, L, CH, `translate3d(${CW / 2}px, 0px, ${zc}px) rotateY(-90deg) translate(-50%, -50%)`, "100% 50%");
    TORCHES.forEach((k, n) => {
      if (k >= cells) return;
      const tz = k === 0 ? 20 : Z0 - (k + 0.5) * T;
      const d = (0.12 + n * 0.22).toFixed(2);
      for (const side of [-1, 1]) {
        // свет на стене — над пламенем; на полу — у подножия стены
        html += `<i class="lg-glow wall" data-z="${tz}" style="--d:${d}s;transform:translate3d(${side * (CW / 2 - 3)}px, ${-CH * 0.12}px, ${tz}px) rotateY(${side * -90}deg) translate(-50%, -50%)"></i>`;
        html += `<i class="lg-glow floor" data-z="${tz}" style="--d:${d}s;transform:translate3d(${side * (CW / 2 - 150)}px, ${CH / 2 - 3}px, ${tz}px) rotateX(90deg) translate(-50%, -50%)"></i>`;
        // центр коробки выше держателя на полпламени: держатель — на уровне груди, пламя над ним
        const tf = `translate3d(${side * (CW / 2 - 60)}px, ${CH * 0.04 + 151}px, ${tz}px) translate(-50%, -50%)`;
        html += torchHtml(assets, "lg-hall-torch", `--d:${d}s;transform:${tf}`).replace('class="lg-torch', `data-z="${tz}" class="lg-torch`);
      }
    });
    if (end) {
      html += `<i class="lg-pl endwall" style="--b:${LIT.end};transform:translate3d(0px, 0px, ${zEnd}px) translate(-50%, -50%)"></i>`;
      // название высечено на дальней стене и растёт с каждым шагом; у экрана его сменяет такое же на плоской стене
      html += `<i class="lg-endtitle" style="--fs:${title.fs.toFixed(2)}px;transform:translate3d(0px, ${title.y.toFixed(1)}px, ${zEnd + 3}px) translate(-50%, -50%)">${titleHtml()}</i>`;
    }
    // туман — внутри коридора, чтобы проявляться и гаснуть вместе с ним
    return `<div class="lg-hall"><div class="lg-world">${html}</div><i class="lg-hall-depth"></i></div><i class="lg-hall-fog"></i>`;
  }

  const stageHall = () => document.querySelector(`.stage-layer[data-game="${ID}"] .lg-st`);
  function resetHall(host) {
    if (!host) return;
    host.querySelector(".lg-world")?.style.removeProperty("transform");
    host.querySelector(".lg-hall-depth")?.style.removeProperty("opacity");
    for (const el of host.querySelectorAll("[data-z]")) el.style.removeProperty("opacity");
  }

  // ---------- стена во весь экран (стык с глухой стеной коридора) и уход стены в пол ----------
  const wallHtml = (tile) =>
    `<div class="lg-wall" style="--tile:${tile.toFixed(1)}px"><i class="lg-wall-glow l"></i><i class="lg-wall-glow r"></i>${titleHtml("lg-wall-title")}<i class="lg-wall-edge"></i></div><div class="lg-dust">${Array.from({ length: 26 }, (_, i) => `<i style="--x:${(rnd(i, 1) * 100).toFixed(1)}%;--s:${(4 + rnd(i, 2) * 10).toFixed(1)}px;--dx:${((rnd(i, 3) - 0.5) * 160).toFixed(0)}px;--dy:${(-30 - rnd(i, 4) * 120).toFixed(0)}px;--t:${(0.7 + rnd(i, 5) * 0.8).toFixed(2)}s;--w:${(rnd(i, 6) * 0.35).toFixed(2)}s"></i>`).join("")}</div>`;

  // ---------- кладка: неровный верх плашки — блоки в размер кирпича выступают на разную высоту ----------
  function capHtml(seed) {
    let html = "";
    for (let i = 0; i < 16; i++) {
      const w = 1 + Math.round(rnd(seed + i, 1) * 2); // 1–3 кирпича
      const h = rnd(seed + i, 2) < 0.45 ? 0 : rnd(seed + i, 3) < 0.6 ? 11 : 20;
      html += `<i style="flex:${w};height:${h}px;background-position:${(rnd(seed + i, 4) * 100).toFixed(0)}% ${(rnd(seed + i, 5) * 100).toFixed(0)}%"></i>`;
    }
    return html;
  }

  GameThemes.register("legend-of-grimrock", {
    // ---------- главная: кусок стены подземелья ----------
    banner(b) {
      // текстуры коридора и заставки — заранее, чтобы первое наведение и вход не спотыкались
      warm(["wall", "floor", "ceiling", "sconce", "flame", "panel"].map((n) => `${b.assets}${n}.webp`));
      const { done, total } = b.progress;
      const marks = Array.from({ length: total }, (_, i) => torchHtml(b.assets, i < done ? "on" : "", `--i:${i}`)).join("");
      b.el.innerHTML = `
        <span class="lg-ban">
          <span class="lg-ban-cap" aria-hidden="true">${capHtml(3)}</span>
          <span class="lg-ban-wall" aria-hidden="true"></span>
          <i class="lg-ban-jamb" aria-hidden="true"></i>
          <span class="lg-ban-door" aria-hidden="true">
            <span class="lg-ban-view">${b.art.hero('alt="" loading="lazy"')}</span>
            <i class="lg-ban-depth"></i>
            <i class="lg-ban-grate"></i>
          </span>
          ${torchHtml(b.assets, "on lg-ban-torch l")}
          ${torchHtml(b.assets, "on lg-ban-torch r")}
          <span class="lg-ban-side">
            ${titleHtml("lg-ban-title")}
            ${total ? `<span class="lg-ban-marks" aria-hidden="true">${marks}</span><span class="lg-ban-count" aria-hidden="true"><b>${done}</b> / ${total}</span>` : ""}
          </span>
          <span class="lg-sr">${b.esc(b.game.title)}. ${total ? `Выполнено ${done} из ${total} условий закрытия` : "Условия ещё не заданы"}</span>
        </span>`;
    },

    // ---------- главная: при наведении — коридор к баннеру, факелы загораются ----------
    stage(s) {
      const motes = Array.from({ length: 22 }, (_, i) => `<i style="--x:${(rnd(i, 7) * 100).toFixed(1)}%;--y:${(rnd(i, 8) * 100).toFixed(1)}%;--t:${(7 + rnd(i, 9) * 8).toFixed(1)}s;--d:${(-rnd(i, 10) * 10).toFixed(1)}s"></i>`).join("");
      s.el.innerHTML = `<div class="lg-st">${hallHtml(s.assets, finale(window.innerWidth, window.innerHeight))}<div class="lg-motes" aria-hidden="true">${motes}</div></div>`;
    },

    // ---------- главная: три шага по клеткам к глухой стене ----------
    // Идём по тому же коридору, что уже стоит за списком при наведении: он уже нарисован, поэтому шаг
    // начинается сразу (второй такой же коридор браузер растрировал бы ~0,5 с — и экран бы замер).
    cover(t) {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const r = document.querySelector(`.gbanner.picked[data-game="${ID}"]`)?.getBoundingClientRect();
      const x0 = r && r.width ? r.left + r.width / 2 : vw / 2;
      const y0 = r && r.width ? r.top + r.height / 2 : vh / 2;
      const layer = t.layer("lg-gate");
      const fin = finale(vw, vh);
      const ze = Z0 - END_K * T;
      const czEnd = fin.delta - ze;
      // коридор с фона главной; если его нет (вход с клавиатуры без наведения) — свой, проявляется поверх
      // коридор с фона берём, только если он уже на экране (навели мышью); с клавиатуры он ещё только проявляется
      let host = stageHall();
      if (!host?.closest(".stage-layer.on")) host = null;
      if (host) {
        layer.innerHTML = wallHtml(T * fin.sEnd);
        const et = host.querySelector(".lg-endtitle");
        et.style.setProperty("--fs", `${fin.fs.toFixed(2)}px`);
        et.style.transform = `translate3d(0px, ${fin.y.toFixed(1)}px, ${ze + 3}px) translate(-50%, -50%)`;
      } else {
        layer.innerHTML = hallHtml(t.assets, fin) + wallHtml(T * fin.sEnd);
        layer.classList.add("own");
        host = layer;
      }
      const pivot = host === layer ? layer : host.closest(".stage-layer");
      pivot.style.setProperty("--bcx", `${x0}px`);
      pivot.style.setProperty("--bcy", `${y0}px`);
      const world = host.querySelector(".lg-world");
      const depth = host.querySelector(".lg-hall-depth");
      // факелы и пятна света, подходя к камере, растворяются, а не раздуваются на весь экран
      const near = [...host.querySelectorAll("[data-z]")].map((el) => ({ el, z: Number(el.dataset.z) }));
      layer.querySelector(".lg-wall").style.setProperty("--b", String(LIT.end));
      t.data.started = performance.now();
      t.data.seen = seenBefore();
      fetch(`data/conditions/${ID}.json`)
        .then((res) => (res.ok ? res.json() : null))
        .then((c) => warm((c?.groups ?? []).flatMap((gr) => gr.goals ?? []).slice(0, 6).map((g) => g.image)))
        .catch(() => {});

      // шаг: камера едет на клетку вперёд (рывок — пауза), голова чуть проседает; точка схода плывёт к центру
      const STEPS = 3;
      const STEP_MS = 228;
      const GAP = 18;
      const total = STEPS * STEP_MS + (STEPS - 1) * GAP;
      const frame = (el) => {
        let cz = 0;
        let bob = 0;
        const k = Math.min(1, el / total);
        const i = Math.min(STEPS - 1, Math.floor(el / (STEP_MS + GAP)));
        const local = clamp((el - i * (STEP_MS + GAP)) / STEP_MS, 0, 1);
        cz = (czEnd / STEPS) * (i + ease(local));
        bob = Math.sin(Math.PI * local) * 9;
        const v = ease(k);
        pivot.style.setProperty("--bcx", `${(x0 + (vw / 2 - x0) * v).toFixed(1)}px`);
        pivot.style.setProperty("--bcy", `${(y0 + (vh / 2 - y0) * v).toFixed(1)}px`);
        world.style.transform = `translateZ(${cz.toFixed(1)}px) translateY(${bob.toFixed(1)}px)`;
        // туман вдали рассеивается по мере того, как стена приближается
        depth.style.opacity = (1 - ease(k)).toFixed(3);
        for (const p of near) p.el.style.opacity = clamp((P - 120 - (p.z + cz)) / 320, 0, 1).toFixed(3);
      };
      return new Promise((resolve) => {
        const finish = () => {
          frame(total);
          layer.classList.add("walled", "titled");
          resolve();
        };
        let start = 0;
        const tick = (now) => {
          if (!layer.isConnected) return resolve();
          if (!start) start = now;
          const el = now - start;
          if (el >= total) return finish();
          frame(el);
          requestAnimationFrame(tick);
        };
        void layer.offsetWidth;
        layer.classList.add("in");
        frame(0);
        requestAnimationFrame(tick);
        setTimeout(() => layer.classList.contains("walled") || finish(), total + 700);
      });
    },

    // ---------- страница игры — тайная комната с нишами ----------
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

      root.classList.add("lg");
      root.innerHTML = pageHtml();
      const niches = [...root.querySelectorAll(".lg-niche")];

      backdrop();
      if (total) {
        reveal();
        headTorches();
      }
      torchlight();
      intro();

      return () => root.classList.remove("lg");

      // ---------- разметка ----------
      function pageHtml() {
        const nb = ctx.neighbors ?? {};
        const marks = Array.from({ length: total }, (_, i) => torchHtml(assets, i < done ? "on" : "", `--i:${i}`)).join("");
        return `
          <div class="lg-page">
            <header class="lg-head">
              <a class="lg-back" href="#/"><span>К списку игр</span></a>
              <a class="lg-head-title" href="#/" aria-label="К списку игр" tabindex="-1">${titleHtml("lg-head-logo")}</a>
              <h1 class="lg-sr">${esc(game.title)}</h1>
              ${
                total
                  ? `<div class="lg-head-progress" role="img" aria-label="Выполнено ${done} из ${total} условий закрытия">
                      <span class="lg-head-torches" aria-hidden="true">${marks}</span>
                      <span class="lg-head-count" aria-hidden="true"><b>${done}</b><i>/</i>${total}<small>условий закрытия</small></span>
                    </div>`
                  : ""
              }
            </header>
            ${
              total
                ? `<main class="lg-room" aria-label="Условия закрытия">${items.map(nicheHtml).join("")}</main>`
                : `<main class="lg-room lg-room-empty"><p class="lg-empty">Условия закрытия для этой игры ещё не заданы.</p></main>`
            }
            <nav class="lg-nav" aria-label="Другие игры">
              ${nb.prev ? `<a class="prev" href="${esc(nb.prev.href)}"><span>${esc(nb.prev.title)}</span></a>` : ""}
              <a class="home" href="#/"><span>К списку игр</span></a>
              ${nb.next ? `<a class="next" href="${esc(nb.next.href)}"><span>${esc(nb.next.title)}</span></a>` : ""}
            </nav>
          </div>`;
      }

      function nicheHtml(g, i) {
        const img = ctx.safeUrl(g.image);
        const fit = g.imageFit === "contain";
        const gallery = (g.gallery ?? []).map(ctx.safeUrl).filter(Boolean);
        const link = ctx.safeUrl(g.link);
        const cap = esc(g.title);
        const lists = (g.checklist ?? [])
          .filter((c) => (c.items ?? []).length)
          .map((c) => `<div class="lg-note-list">${c.label ? `<b>${esc(c.label)}</b>` : ""}<ul>${c.items.map((it) => `<li class="${it.done ? "on" : ""}">${esc(it.title)}</li>`).join("")}</ul></div>`)
          .join("");
        const note = g.note || g.details || lists;
        return `
          <section class="lg-niche ${g.done ? "done" : "todo"}" style="--i:${i}" aria-label="№${esc(g.n)}${g.done ? ", выполнено" : ", не выполнено"}" data-gallery>
            <span class="lg-keystone" aria-hidden="true">${roman(g.n)}</span>
            <div class="lg-frame">
              <div class="lg-hole">
                <div class="lg-pic ${fit ? "fig" : ""}">${img ? `<img src="${esc(img)}" alt="" decoding="async" data-zoom data-caption="${cap}">` : ""}</div>
                <i class="lg-hole-shade" aria-hidden="true"></i>
                <i class="lg-grate" aria-hidden="true"></i>
              </div>
              <i class="lg-shelf" aria-hidden="true"></i>
              ${torchHtml(assets, g.done ? "on lg-niche-torch" : "lg-niche-torch")}
            </div>
            <div class="lg-plaque ${(g.title ?? "").length > 48 ? "long" : ""}">
              <h3>${cap}</h3>
              ${gallery.length ? `<span class="lg-plaque-gallery">${gallery.map((u) => `<img src="${esc(u)}" alt="" loading="lazy" data-zoom data-caption="${cap}">`).join("")}</span>` : ""}
              ${link ? `<a class="lg-lore" href="${esc(link)}" target="_blank" rel="noopener">Подробнее&nbsp;↗</a>` : ""}
            </div>
            ${
              note
                ? `<div class="lg-note">
                    ${g.note ? `<p class="lg-note-quote">«${esc(g.note)}»</p>` : ""}
                    ${g.details ? `<p>${esc(g.details)}</p>` : ""}
                    ${lists}
                  </div>`
                : ""
            }
          </section>`;
      }

      // ---------- фон: стена комнаты в сумраке ----------
      function backdrop() {
        ctx.layer("lg-backdrop").innerHTML = "<i></i><b></b>";
      }

      // ---------- факелы в шапке: выполненные загораются по одному, когда открылась страница ----------
      function headTorches() {
        const lit = [...root.querySelectorAll(".lg-head-torches .lg-torch.on")];
        if (!motion) return lit.forEach((el) => el.classList.add("burn"));
        lit.forEach((el, i) => later(() => el.classList.add("burn"), (ctx.handoff ? 1700 : 1900) + i * 160));
      }

      // ---------- выполненная ниша, впервые попав в кадр: решётка уходит вверх, загорается факел ----------
      function reveal() {
        const doneNiches = niches.filter((n) => n.classList.contains("done"));
        if (!motion || !("IntersectionObserver" in window)) {
          doneNiches.forEach((n) => n.classList.add("open"));
          return;
        }
        const io = new IntersectionObserver(
          (entries) => {
            for (const en of entries) {
              if (!en.isIntersecting) continue;
              io.unobserve(en.target);
              en.target.classList.add("open");
            }
          },
          { threshold: 0.45 },
        );
        later(() => doneNiches.forEach((n) => io.observe(n)), ctx.handoff ? 2000 : 2200);
        ctx.onCleanup(() => io.disconnect());
      }

      // ---------- курсор — факел в руке: тёплый круг света с живым мерцанием ----------
      function torchlight() {
        if (!ctx.finePointer || !motion) return;
        const el = ctx.layer("lg-torchlight");
        let tx = -999;
        let ty = -999;
        let x = -999;
        let y = -999;
        let n = 0;
        ctx.listen(window, "pointermove", (e) => {
          tx = e.clientX;
          ty = e.clientY;
          if (x < -900) (x = tx), (y = ty);
          el.classList.add("on");
        }, { passive: true });
        ctx.listen(document, "pointerleave", () => el.classList.remove("on"));
        ctx.loop((now, dt) => {
          const k = 1 - Math.pow(0.002, dt);
          x += (tx - x) * k;
          y += (ty - y) * k;
          n += dt;
          const flick = 1 + Math.sin(n * 13.1) * 0.025 + Math.sin(n * 7.3 + 1.7) * 0.035 + Math.sin(n * 23.7) * 0.015;
          el.style.transform = `translate3d(${(x - 330).toFixed(1)}px, ${(y - 330).toFixed(1)}px, 0) scale(${flick.toFixed(3)})`;
        });
      }

      // ---------- вход: стена со скрежетом уходит в пол ----------
      function intro() {
        const handed = ctx.handoff?.layers.find((l) => l.classList.contains("lg-gate"));
        if (!motion) {
          handed?.remove();
          return;
        }
        let gate = handed;
        let hold;
        if (gate && gate.classList.contains("walled")) {
          const since = performance.now() - (ctx.handoff.data.started ?? 0);
          hold = Math.max(HOLD.handoff, (ctx.handoff.data.seen ? 0 : HOLD.first) - since);
        } else {
          gate?.remove();
          // прямой заход: глухая стена уже перед глазами, название проступает из темноты
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          const s = Math.max(vw / CW, vh / CH) * 1.08;
          gate = ctx.layer("lg-gate in walled direct");
          gate.innerHTML = wallHtml(T * s);
          gate.querySelector(".lg-wall").style.setProperty("--b", String(LIT.end));
          hold = seenBefore() ? HOLD.repeat : HOLD.direct;
        }
        const g = gate;
        root.classList.add("lg-intro");
        later(() => g.classList.add("titled"), g.classList.contains("direct") ? 120 : 0);
        let opened = false;
        const open = () => {
          if (opened) return;
          opened = true;
          g.classList.add("sink");
          later(() => root.classList.remove("lg-intro"), 1050);
          later(() => g.remove(), 1700);
          later(() => resetHall(stageHall()), 1700);
        };
        later(open, hold);
        ctx.onCleanup(() => {
          g.remove();
          root.classList.remove("lg-intro");
          resetHall(stageHall());
        });
        for (const type of ["pointerdown", "keydown", "wheel"]) ctx.listen(window, type, open, { passive: true, once: true });
      }
    },
  });
})();
