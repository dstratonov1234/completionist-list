// Hollow Knight — «Карта Халлоунеста».
// Всё своё, по мотивам интерфейса и мира Hollow Knight:
//  · баннер на главной — кадр игры: сцену обрамляют чёрные силуэты переднего плана (корни сверху, уступ с
//    грибами снизу, края тонут во тьме), слева вверху — HUD игры: сосуд души и ряд масок, по маске на условие
//    (белые — выполнено), под ними логотип; выделение — «Фокус»: силуэты расходятся, к сосуду стекается душа,
//    маски по очереди вспыхивают, светомухи разгораются;
//  · при наведении на главную — поднимается Бездна: по краям экрана из темноты тянутся щупальца пустоты,
//    в черноте один за другим открываются белые глаза сосудов, сверху падает бледный свет;
//  · заставка — пустота захлёстывает экран, на черноте — карточка области с названием игры между филигранью;
//    на странице пустота опадает, карточка ещё висит и гаснет, как при входе в новую локацию;
//  · страница — карта Халлоунеста в духе карт Корнифера: условия — комнаты, связанные ходами в один путь;
//    выполненные — нанесены на карту (чёткие стены, скамейка), невыполненные — не исследованы (пунктир,
//    картинка в тумане); маркер Рыцаря стоит у первой неисследованной комнаты; HUD — сосуд души и маски —
//    висит в углу экрана, а душа выполненных комнат, попадая в кадр, улетает в сосуд; курсор — светомуха.
(() => {
  "use strict";

  const CLOSE_MS = 700;
  const HOLD = { direct: 700, repeat: 260, handoff: 260, first: 850 };

  // маски HUD, скамейка и маркер Рыцаря нарисованы в theme.css (SVG в data URI)
  function masksHtml(done, total, max = 30) {
    const n = Math.min(total, max);
    const lit = total ? Math.round((done / total) * n) : 0;
    return Array.from({ length: n }, (_, i) => `<i class="hk-mask ${i < lit ? "on" : ""}" style="--i:${i}"></i>`).join("");
  }

  // сосуд души: стекло с душой внутри (уровень — доля выполненного) и рамка
  function vesselHtml(assets, k) {
    return `<span class="hk-vessel" style="--fill:${Math.max(0, Math.min(1, k)).toFixed(3)}"><i class="hk-soul"><b></b></i><img src="${assets}vessel.webp" alt=""></span>`;
  }

  // область карты по словам в названии условия — у комнаты цвет этой области, как на карте игры
  const AREAS = [
    ["godhome", /Pantheon|Godseeker|Godhome|Hall of Gods/i],
    ["palace", /White Palace|Path of Pain/i],
    ["grimm", /Grimm/i],
    ["hive", /\bHive\b|Lifeblood/i],
    ["void", /Void|Abyss|Shade/i],
    ["dream", /Dream|Seer|Radiance|Ascension/i],
    ["fungal", /Mushroom|Fungal/i],
    ["green", /Sheo|Nailsmith|Greenpath|Nailmaster|Mato|Oro/i],
    ["colosseum", /Colosseum/i],
  ];
  const areaOf = (title) => (AREAS.find(([, re]) => re.test(title)) ?? ["crossroads"])[0];

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
      const seen = sessionStorage.getItem("hk-void") === "1";
      sessionStorage.setItem("hk-void", "1");
      return seen;
    } catch {
      return false;
    }
  }

  // пустота заставки: щупальца снизу и сверху и чернота за ними
  function voidHtml(assets) {
    const t = (cls) => `<i class="hk-void-t ${cls}" style="background-image:url('${assets}tendrils.webp')"></i>`;
    return `<i class="hk-void-black"></i>${t("b")}${t("t")}`;
  }
  // карточка области: только название игры между филигранью
  function cardHtml(game, esc, assets) {
    return `
      <img class="hk-card-fil" src="${assets}divider.webp" alt="">
      <span class="hk-card-name">${esc(game.title)}</span>
      <img class="hk-card-fil flip" src="${assets}divider.webp" alt="">`;
  }

  GameThemes.register("hollow-knight", {
    // ---------- главная: кадр игры с HUD ----------
    banner(b) {
      // щупальца Бездны декодируются заранее — чтобы первое наведение не спотыкалось
      warm([b.assets + "tendrils.webp"]);
      const { done, total } = b.progress;
      const logo = b.art.logo('alt=""');
      const flies = Array.from({ length: 6 }, (_, i) => `<i style="--x:${[38, 52, 66, 30, 80, 90][i]}%;--y:${[28, 64, 22, 70, 40, 18][i]}%;--d:${(i * 0.7).toFixed(1)}s"></i>`).join("");
      // «Фокус», как в игре: душа уходит из сосуда и спиралью стягивается к Рыцарю — частицы по кругу вокруг него
      const wisps = Array.from({ length: 18 }, (_, i) => `<i style="--j:${(((i * 37) % 70) - 35).toFixed(0)}px;--k:${(((i * 53) % 60) - 30).toFixed(0)}px;--d:${(i * 0.045).toFixed(3)}s"></i>`).join("");
      b.el.innerHTML = `
        <span class="hk-ban">
          <span class="hk-ban-art">${b.art.hero('alt="" loading="lazy"')}</span>
          <span class="hk-ban-haze"></span>
          <span class="hk-ban-dim"></span>
          <span class="hk-ban-flies" aria-hidden="true">${flies}</span>
          <i class="hk-ban-roots" aria-hidden="true"></i>
          <i class="hk-ban-ledge" aria-hidden="true"></i>
          <span class="hk-ban-focus" aria-hidden="true">${wisps}<b></b></span>
          <span class="hk-ban-hud" aria-hidden="true">
            ${vesselHtml(b.assets, total ? done / total : 0)}
            <span class="hk-ban-hud-right">
              <span class="hk-masks">${masksHtml(done, total)}</span>
              ${total ? `<span class="hk-ban-count"><b>${done}</b> / ${total}</span>` : ""}
            </span>
          </span>
          <span class="hk-ban-logo">${logo || `<span class="hk-ban-name" aria-hidden="true">${b.esc(b.game.title)}</span>`}</span>
          <span class="hk-sr">${b.esc(b.game.title)}. ${total ? `Выполнено ${done} из ${total} условий закрытия` : "Условия ещё не заданы"}</span>
        </span>`;
    },

    // ---------- главная: при наведении — поднимается Бездна ----------
    // Только CSS: щупальца тянутся из-за краёв к баннеру, глаза открываются, сверху — бледный свет.
    stage(s) {
      warm([s.assets + "tendrils.webp", s.assets + "divider.webp"]);
      const rnd = (i, k) => ((Math.sin((i + 1) * 12.9898 + k * 78.233) * 43758.5453) % 1 + 1) % 1;
      // глаза — в полях по бокам и под баннером, в просветах между баннерами
      const eyes = Array.from({ length: 10 }, (_, i) => {
        const side = i % 2 ? "r" : "l";
        const x = side === "l" ? `calc((var(--bcx, 50vw) - var(--bw, 0px) / 2) * ${(0.1 + rnd(i, 1) * 0.75).toFixed(3)})` : `calc(100% - (100% - var(--bcx, 50vw) - var(--bw, 0px) / 2) * ${(0.1 + rnd(i, 1) * 0.75).toFixed(3)})`;
        const z = 0.6 + rnd(i, 3) * 1.1; // дальние — мельче и размытее
        return `<i class="${z < 0.95 ? "far" : ""}" style="left:${x};top:${(22 + rnd(i, 2) * 70).toFixed(1)}%;--s:${z.toFixed(2)};--d:${(0.5 + rnd(i, 4) * 1.6).toFixed(2)}s;--b:${(3 + rnd(i, 5) * 5).toFixed(1)}s"><b></b><b></b></i>`;
      }).join("");
      // и в просветах прямо над и под баннером — сосуды выглядывают из-за плашек
      const near = Array.from({ length: 4 }, (_, i) => {
        const fx = (0.16 + i * 0.22 + rnd(i, 7) * 0.06).toFixed(3);
        const y = "calc(var(--bcy, 50vh) + var(--bh, 0px) / 2 - 26px)"; // наполовину за нижним краем баннера
        return `<i class="near" style="left:calc(var(--bcx, 50vw) - var(--bw, 0px) / 2 + var(--bw, 0px) * ${fx});top:${y};--s:1;--d:${(0.9 + i * 0.25).toFixed(2)}s;--b:${(4 + rnd(i, 8) * 4).toFixed(1)}s"><b></b><b></b></i>`;
      }).join("");
      s.el.innerHTML = `
        <div class="hk-ab">
          <i class="hk-ab-light"></i>
          <div class="hk-ab-t l" style="background-image:url('${s.assets}tendrils.webp')"></div>
          <div class="hk-ab-t r" style="background-image:url('${s.assets}tendrils.webp')"></div>
          <div class="hk-ab-t b" style="background-image:url('${s.assets}tendrils.webp')"></div>
          <div class="hk-ab-eyes">${eyes}${near}</div>
        </div>`;
    },

    // ---------- главная: пустота захлёстывает экран, проступает карточка области ----------
    cover(t) {
      const v = t.layer("hk-void");
      v.innerHTML = voidHtml(t.assets);
      const card = t.layer("hk-card");
      card.innerHTML = cardHtml(t.game, t.esc, t.assets);
      warm(["mappaper.webp", "cavern.webp", "vessel.webp"].map((f) => t.assets + f));
      fetch("data/conditions/hollow-knight.json")
        .then((r) => (r.ok ? r.json() : null))
        .then((c) => warm((c?.groups ?? []).flatMap((gr) => gr.goals ?? []).slice(0, 6).map((g) => g.image)))
        .catch(() => {});
      t.data.started = performance.now();
      t.data.seen = seenBefore();
      const imgs = [...card.querySelectorAll("img")];
      const ready = Promise.race([Promise.all(imgs.map((im) => im.decode?.().catch(() => {}))), new Promise((r) => setTimeout(r, 120))]);
      return new Promise((resolve) => {
        ready.then(() => {
          void v.offsetWidth;
          v.classList.add("in");
          setTimeout(() => card.classList.add("in"), 330);
          setTimeout(resolve, CLOSE_MS + 40);
        });
        setTimeout(resolve, CLOSE_MS + 600);
      });
    },

    // ---------- страница игры — карта Халлоунеста ----------
    page(ctx) {
      const { root, esc, assets, game } = ctx;
      const cond = ctx.conditions;
      const groups = (cond?.groups ?? []).filter((gr) => (gr.goals ?? []).length);
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

      root.classList.add("hk");
      root.innerHTML = pageHtml();
      const map = root.querySelector(".hk-map");
      const rooms = [...root.querySelectorAll(".hk-room")];

      backdrop();
      const hud = total ? hudLayer() : null;
      if (total) {
        layout();
        portraits();
        soul();
        lumafly();
      }
      intro();

      return () => root.classList.remove("hk");

      // ---------- разметка ----------
      function pageHtml() {
        const logo = ctx.art.logo('alt=""');
        const nb = ctx.neighbors ?? {};
        const firstTodo = items.find((g) => !g.done);
        let i = 0;
        const body = groups
          .map(
            (gr) => `
            ${groups.length > 1 ? `<h2 class="hk-region">${esc(gr.title)}</h2>` : ""}
            ${gr.goals.map((g) => roomHtml(g, i++, g === firstTodo)).join("")}`,
          )
          .join("");
        return `
          <div class="hk-page ${total ? "" : "hk-page-empty"}">
            <header class="hk-head">
              <a class="hk-head-logo" href="#/" aria-label="К списку игр">${logo || `<span class="hk-head-name">${esc(game.title)}</span>`}</a>
              <h1 class="hk-sr">${esc(game.title)}${total ? `. Выполнено ${done} из ${total} условий закрытия` : ""}</h1>
            </header>
            ${
              total
                ? `<main class="hk-map" aria-label="Условия закрытия"><svg class="hk-paths" aria-hidden="true"></svg>${body}</main>`
                : `<main class="hk-map hk-map-empty"><p class="hk-empty">Условия закрытия для этой игры ещё не заданы.</p></main>`
            }
            <nav class="hk-menu" aria-label="Другие игры">
              ${nb.prev ? `<a href="${esc(nb.prev.href)}">${esc(nb.prev.title)}</a>` : ""}
              <a href="#/">К списку игр</a>
              ${nb.next ? `<a href="${esc(nb.next.href)}">${esc(nb.next.title)}</a>` : ""}
            </nav>
          </div>`;
      }

      // «Боссы: A, B, C, …» → заголовок и таблички с именами (слова те же, меняется только вид)
      function titleHtml(t) {
        const m = /^([^:]{2,60}):\s+(.+)$/.exec(t);
        const names = m ? m[2].split(/[,;]\s+/).filter(Boolean) : [];
        if (names.length < 4) return esc(t);
        return `${esc(m[1])}<span class="hk-names">${names.map((x) => `<span>${esc(x)}</span>`).join("")}</span>`;
      }

      function roomHtml(g, i, here) {
        const img = ctx.safeUrl(g.image);
        const fit = g.imageFit === "contain";
        const checklist = (g.checklist ?? [])
          .map(
            (c) => `
            <div class="hk-list">
              ${c.label ? `<h4>${esc(c.label)} · ${(c.items ?? []).filter((it) => it.done).length}/${(c.items ?? []).length}</h4>` : ""}
              <ol>${(c.items ?? []).map((it) => `<li class="${it.done ? "on" : ""}"><span>${esc(it.title)}</span></li>`).join("")}</ol>
            </div>`,
          )
          .join("");
        const gallery = (g.gallery ?? []).map(ctx.safeUrl).filter(Boolean);
        const link = ctx.safeUrl(g.link);
        // одна картинка галереи — вставкой в угол главной, несколько — рядом под текстом
        const inset = gallery.length === 1 ? `<img class="hk-inset" src="${esc(gallery[0])}" alt="" loading="lazy" data-zoom data-caption="${esc(g.title)}">` : "";
        return `
          <section class="hk-room ${g.done ? "done" : "todo"} ${here ? "here" : ""}" data-area="${areaOf(g.title)}" data-i="${i}" aria-label="№${esc(g.n)}${g.done ? ", выполнено" : ", не выполнено"}" data-gallery>
            <span class="hk-room-n" aria-hidden="true">${esc(g.n)}</span>
            ${g.done ? `<i class="hk-bench" aria-hidden="true" title="Скамейка"></i>` : ""}
            ${here ? `<i class="hk-knight" aria-hidden="true"></i>` : ""}
            <div class="hk-room-pic ${fit ? "fig" : ""}">${img ? `<img src="${esc(img)}" alt="" loading="${i < 3 ? "eager" : "lazy"}" decoding="async" data-zoom data-caption="${esc(g.title)}">` : ""}${inset}</div>
            <h3 class="hk-room-title">${titleHtml(g.title)}</h3>
            ${checklist}
            ${g.note ? `<blockquote class="hk-note">«${esc(g.note)}»</blockquote>` : ""}
            ${g.details ? `<p class="hk-details">${esc(g.details)}</p>` : ""}
            ${gallery.length > 1 ? `<div class="hk-gallery">${gallery.map((u) => `<img src="${esc(u)}" alt="" loading="lazy" data-zoom data-caption="${esc(g.title)}">`).join("")}</div>` : ""}
            <footer class="hk-room-foot">

              ${link ? `<a class="hk-lore" href="${esc(link)}" target="_blank" rel="noopener">Подробнее&nbsp;↗</a>` : ""}
            </footer>
          </section>`;
      }

      // ---------- фон: бумага карты поверх пещеры ----------
      function backdrop() {
        const bg = ctx.layer("hk-backdrop");
        bg.innerHTML = `<i style="background-image:url('${assets}cavern.webp')"></i><b style="background-image:url('${assets}mappaper.webp')"></b>`;
      }

      // ---------- HUD в углу экрана: сосуд души и маски ----------
      function hudLayer() {
        const el = ctx.layer("hk-hud");
        el.setAttribute("aria-hidden", "true");
        el.innerHTML = `${vesselHtml(assets, done / total)}<span class="hk-hud-right"><span class="hk-masks">${masksHtml(done, total)}</span><span class="hk-hud-count"><b>${done}</b> / ${total} условий закрытия</span></span><span class="hk-hud-mini"><b>${done}</b>/${total}</span>`;
        // в начале страницы HUD целиком, ниже — только сосуд со счётом, чтобы не закрывать комнаты
        let mini = null;
        let lastY = window.scrollY;
        const narrow = window.matchMedia("(max-width: 760px)");
        const sync = () => {
          const y = window.scrollY;
          const m = y > 140;
          if (m !== mini) el.classList.toggle("mini", (mini = m));
          if (narrow.matches && Math.abs(y - lastY) > 6) el.classList.toggle("away", m && y > lastY);
          if (Math.abs(y - lastY) > 6) lastY = y;
        };
        sync();
        ctx.listen(window, "scroll", sync, { passive: true });
        return el;
      }

      // ---------- комнаты змейкой по сетке и ходы между ними ----------
      function layout() {
        const svg = map.querySelector(".hk-paths");
        let queued = false;
        let cols = 0;
        const place = () => {
          queued = false;
          const w = map.clientWidth;
          const c = w >= 1040 ? 3 : w >= 640 ? 2 : 1;
          if (c !== cols) {
            cols = c;
            map.style.setProperty("--cols", c);
            // змейка по рядам: чётные слева направо, нечётные — обратно. Комната, в которой много всего (таблички
            // имён, чек-лист, несколько картинок), — зал на две колонки; не влезает в ряд — начинает новый.
            // Карта неровная, как у Корнифера: разная ширина, сдвиги по высоте, на телефоне — изломы влево-вправо
            const h = (i, k2) => ((Math.sin((i + 1) * 91.7 + k2 * 17.3) * 43758.5453) % 1 + 1) % 1;
            const wide = (r) => !!r.querySelector(".hk-names, .hk-list, .hk-gallery");
            const ghosts = [];
            let row = 0;
            let used = 0;
            let rev = false;
            let col = 1;
            rooms.forEach((r, i) => {
              const span = c > 1 && wide(r) ? 2 : 1;
              if (used + span > c) {
                row++;
                used = 0;
              }
              if (used === 0) {
                rev = row % 2 === 1;
                col = rev ? c : 1;
              }
              r.style.gridRow = String(row + 1);
              r.style.gridColumn = `${rev ? col - span + 1 : col} / span ${span}`;
              r.classList.toggle("hall", span > 1);
              if (c === 1) {
                r.style.marginTop = "";
                r.style.width = "88%";
                r.style.justifySelf = i % 2 ? "end" : "start";
              } else {
                r.style.marginTop = `${Math.round(h(i, 1) * (span > 1 ? 40 : 84))}px`;
                r.style.width = span > 1 ? "100%" : `${Math.round(78 + h(i, 2) * 22)}%`;
                r.style.justifySelf = span > 1 ? "stretch" : ["start", "center", "end"][Math.floor(h(i, 3) * 3)];
              }
              col = rev ? col - span : col + span;
              used += span;
              const last = i === rooms.length - 1;
              const nextSpan = last ? 0 : c > 1 && wide(rooms[i + 1]) ? 2 : 1;
              if (c > 1 && !last && used + nextSpan > c && used < c) ghosts.push({ row, cols: rev ? [1, c - used] : [used + 1, c] });
            });
            map.querySelectorAll(".hk-ghost").forEach((g) => g.remove());
            for (const g of ghosts) {
              const el = document.createElement("i");
              el.className = "hk-ghost";
              el.setAttribute("aria-hidden", "true");
              el.style.gridRow = String(g.row + 1);
              el.style.gridColumn = `${g.cols[0]} / ${g.cols[1] + 1}`;
              el.style.marginTop = `${Math.round(h(g.row, 5) * 70)}px`;
              el.style.width = `${Math.round(54 + h(g.row, 6) * 30)}%`;
              el.style.justifySelf = ["start", "center", "end"][Math.floor(h(g.row, 7) * 3)];
              map.appendChild(el);
            }
          }
          paths();
        };
        // ход между комнатами — двойная линия, как проходы на карте; в неисследованное — пунктир
        const paths = () => {
          const box = map.getBoundingClientRect();
          svg.setAttribute("viewBox", `0 0 ${box.width} ${box.height}`);
          svg.setAttribute("width", box.width);
          svg.setAttribute("height", box.height);
          let d1 = "";
          let d2 = "";
          for (let i = 0; i < rooms.length - 1; i++) {
            const a = rooms[i].getBoundingClientRect();
            const b = rooms[i + 1].getBoundingClientRect();
            const A = { l: a.left - box.left, r: a.right - box.left, t: a.top - box.top, b: a.bottom - box.top };
            const B = { l: b.left - box.left, r: b.right - box.left, t: b.top - box.top, b: b.bottom - box.top };
            let p;
            if (B.l >= A.r - 2 || B.r <= A.l + 2) {
              const toRight = B.l >= A.r - 2;
              const x1 = toRight ? A.r - 4 : A.l + 4;
              const x2 = toRight ? B.l + 4 : B.r - 4;
              const lo = Math.max(A.t, B.t) + 40;
              const hi = Math.min(A.b, B.b) - 40;
              if (lo < hi) {
                const y = Math.round((lo + hi) / 2);
                p = `M${x1},${y}H${x2}`;
              } else {
                const ya = Math.round((A.t + A.b) / 2);
                const yb = Math.round((B.t + B.b) / 2);
                const xm = Math.round((x1 + x2) / 2);
                p = `M${x1},${ya}H${xm}V${yb}H${x2}`;
              }
            } else {
              const lo = Math.max(A.l, B.l) + 40;
              const hi = Math.min(A.r, B.r) - 40;
              const x = Math.round(lo < hi ? (lo + hi) / 2 : (A.l + A.r) / 2);
              p = `M${x},${A.b - 4}V${B.t + 4}`;
            }
            if (rooms[i + 1].classList.contains("done")) d1 += p;
            else d2 += p;
          }
          svg.innerHTML = `
            <path class="w" d="${d1}"/><path class="i" d="${d1}"/>
            <path class="w dim" d="${d2}"/><path class="i" d="${d2}"/>`;
        };
        const queue = () => {
          if (queued) return;
          queued = true;
          requestAnimationFrame(place);
        };
        place();
        if ("ResizeObserver" in window) {
          const ro = new ResizeObserver(queue);
          ro.observe(map);
          rooms.forEach((r) => ro.observe(r));
          ctx.onCleanup(() => ro.disconnect());
        }
        ctx.listen(window, "resize", queue, { passive: true });
      }

      // портреты (выше, чем шире) — кадрировать по лицу
      function portraits() {
        for (const im of root.querySelectorAll(".hk-room-pic:not(.fig) img, .hk-gallery img")) {
          const mark = () => im.naturalHeight > im.naturalWidth * 1.05 && im.classList.add("tall");
          if (im.complete) mark();
          else ctx.listen(im, "load", mark, { once: true });
        }
      }

      // ---------- душа: выполненная комната, впервые попав в кадр, отдаёт душу сосуду ----------
      function soul() {
        const lit = rooms.filter((r) => r.classList.contains("done"));
        if (!motion || !("IntersectionObserver" in window) || !hud) {
          lit.forEach((r) => r.classList.add("seen"));
          return;
        }
        const fx = ctx.layer("hk-soulfx");
        const vessel = hud.querySelector(".hk-vessel");
        let flying = 0;
        const fly = (room) => {
          const r = room.getBoundingClientRect();
          const v = vessel.getBoundingClientRect();
          const tx = v.left + v.width * 0.5;
          const ty = v.top + v.height * 0.47;
          for (let k = 0; k < 5; k++) {
            if (flying > 30) break;
            const w = document.createElement("i");
            const sx = r.left + r.width * (0.2 + Math.random() * 0.6);
            const sy = r.top + Math.min(r.height, 260) * (0.2 + Math.random() * 0.5);
            const mx = (sx + tx) / 2 + (Math.random() - 0.5) * 160;
            const my = Math.min(sy, ty) - 40 - Math.random() * 80;
            fx.appendChild(w);
            flying++;
            const anim = w.animate(
              [
                { transform: `translate(${sx}px, ${sy}px) scale(0.4)`, opacity: 0 },
                { transform: `translate(${mx}px, ${my}px) scale(1)`, opacity: 1, offset: 0.45 },
                { transform: `translate(${tx}px, ${ty}px) scale(0.5)`, opacity: 0.9 },
              ],
              { duration: 900 + k * 90 + Math.random() * 200, delay: k * 70, easing: "cubic-bezier(0.45, 0, 0.25, 1)", fill: "both" },
            );
            hud.classList.add("peek");
            clearTimeout(hud.peekTimer);
            hud.peekTimer = setTimeout(() => hud.classList.remove("peek"), 2000);
            anim.onfinish = () => {
              w.remove();
              flying--;
              vessel.classList.remove("gain");
              void vessel.offsetWidth;
              vessel.classList.add("gain");
            };
          }
        };
        const io = new IntersectionObserver(
          (entries) => {
            for (const en of entries) {
              if (!en.isIntersecting) continue;
              io.unobserve(en.target);
              en.target.classList.add("seen");
              fly(en.target);
            }
          },
          { threshold: 0.35 },
        );
        // пока закрыта заставка — не начинаем: душа должна быть видна
        later(() => lit.forEach((r) => io.observe(r)), ctx.handoff ? 1100 : 900);
        ctx.onCleanup(() => io.disconnect());
      }

      // ---------- курсор — светомуха ----------
      function lumafly() {
        if (!ctx.finePointer || !motion) return;
        const glow = ctx.layer("hk-lumafly");
        glow.innerHTML = "<i></i>";
        let tx = -999;
        let ty = -999;
        let x = -999;
        let y = -999;
        ctx.listen(window, "pointermove", (e) => {
          tx = e.clientX;
          ty = e.clientY;
          glow.classList.add("on");
        }, { passive: true });
        ctx.listen(document, "pointerleave", () => glow.classList.remove("on"));
        ctx.loop((now, dt) => {
          const k = 1 - Math.pow(0.0009, dt);
          x += (tx - x) * k;
          y += (ty - y) * k;
          const bob = Math.sin(now / 420) * 4;
          glow.style.transform = `translate3d(${(x - 110).toFixed(1)}px, ${(y - 110 + bob).toFixed(1)}px, 0)`;
        });
      }

      // ---------- вход: пустота опадает, карточка области гаснет следом ----------
      function intro() {
        const handedVoid = ctx.handoff?.layers.find((l) => l.classList.contains("hk-void"));
        const handedCard = ctx.handoff?.layers.find((l) => l.classList.contains("hk-card"));
        if (!motion) {
          handedVoid?.remove();
          handedCard?.remove();
          return;
        }
        let v = handedVoid;
        let card = handedCard;
        let hold;
        if (v && card) {
          const since = performance.now() - (ctx.handoff.data.started ?? 0);
          hold = Math.max(HOLD.handoff, (ctx.handoff.data.seen ? 0 : HOLD.first) - since);
        } else {
          v?.remove();
          card?.remove();
          v = ctx.layer("hk-void in direct");
          v.innerHTML = voidHtml(assets);
          card = ctx.layer("hk-card in direct");
          card.innerHTML = cardHtml(game, esc, assets);
          hold = seenBefore() ? HOLD.repeat : HOLD.direct;
        }
        const vv = v;
        const cc = card;
        root.classList.add("hk-intro");
        ctx.onCleanup(() => root.classList.remove("hk-intro"));
        let opened = false;
        const open = () => {
          if (opened) return;
          opened = true;
          vv.classList.add("out");
          cc.classList.add("out");
          // шапка страницы проявляется, когда карточка гаснет: двух названий сразу не видно
          later(() => root.classList.remove("hk-intro"), 900);
          later(() => vv.remove(), 1500);
          later(() => cc.remove(), 1500);
        };
        later(open, hold);
        ctx.onCleanup(() => {
          vv.remove();
          cc.remove();
        });
        for (const type of ["pointerdown", "keydown", "wheel"]) ctx.listen(window, type, open, { passive: true, once: true });
      }
    },
  });

})();
