// Shin Megami Tensei III: Nocturne HD Remaster — «Метки Полудемона».
// Всё своё, по мотивам мира Nocturne — татуировок Полудемона (тёмные полосы с бирюзовым светящимся контуром,
// плавные изгибы, острые концы) и Магатамы, которая живёт в нём и даёт силу:
//  · баннер на главной — вытянутая шестигранная плашка: слева логотип, в центре Полудемон, справа Магатама со
//    счётом; из-под Магатамы к его рукам тянутся полосы татуировки, по одной на условие: выполненные светятся,
//    невыполненные — тёмные. Выделение — от Магатамы по светящимся полосам бежит ток, Магатама пульсирует;
//  · при наведении на главную — пробуждение Магатамы: вокруг неё проступает огромный контур Магатамы, от неё
//    волнами расходятся соты, из краёв баннера в поля прорастают полосы татуировки;
//  · заставка — пробуждение Полудемона: шестигранник баннера раскрывается на весь экран, камера наезжает на его
//    лицо, арт гаснет — в темноте горят только татуировки и золотые глаза, сверху проступает логотип; на странице
//    всё растворяется;
//  · страница — соты: в одной соте Магатама, налитая по числу выполненных условий, в остальных — условия
//    (картинка, номер, название; текст обтекает скосы). Выполненные обведены полосой татуировки, невыполненные —
//    серые с пунктиром. Подробности (что сказал, как закрыто, чек-листы) — в окне «Анализ», как навык Analyze;
//    клик по картинке — она и галерея крупно; под курсором проступает сетка сот.
(() => {
  "use strict";

  const ID = "shin-megami-tensei-iii-nocturne-hd-remaster";
  const CLOSE_MS = 700;
  const HOLD = { direct: 2300, repeat: 1100, handoff: 1100, first: 2900 };
  // Магатама в квадрате 100×100: круглая голова справа сверху, хвост загибается вниз-влево к острому концу
  const MG = "M28,97 C10,86 4,62 18,38 A34,34 0 1 1 52,72 C42,73 33,82 28,97 Z";

  const warmed = new Map();
  function warm(urls) {
    for (const u of urls) {
      if (!u || warmed.has(u)) continue;
      const im = new Image();
      im.decoding = "async";
      im.src = u;
      im.decode?.().catch(() => {});
      warmed.set(u, im);
    }
  }

  function seenBefore() {
    try {
      const seen = sessionStorage.getItem("sn-mark") === "1";
      sessionStorage.setItem("sn-mark", "1");
      return seen;
    } catch {
      return false;
    }
  }

  // псевдослучайное число от номера — узор один и тот же при каждом заходе
  const rnd = (i, k) => ((Math.sin((i + 1) * 12.9898 + k * 78.233) * 43758.5453) % 1 + 1) % 1;
  let uid = 0;

  // картинка вики для ячейки — вписанная в 800×800 (в разы легче, декодируется без рывков на прокрутке);
  // полная — для лайтбокса
  const thumb = (u) => {
    const m = /^(https:\/\/static\.wikia\.nocookie\.net\/.+?\/revision\/latest)(?:\/scale-to-width-down\/\d+)?(\?.*)?$/.exec(u ?? "");
    return m ? `${m[1]}/thumbnail-down/width/800/height/800${m[2] ?? ""}` : u;
  };

  // ---------- полоса татуировки: тёмная лента с контуром, сужается к острому концу ----------
  const bez = (c, t) => {
    const u = 1 - t;
    const a = u * u * u, b = 3 * u * u * t, d = 3 * u * t * t, e = t * t * t;
    return [a * c[0][0] + b * c[1][0] + d * c[2][0] + e * c[3][0], a * c[0][1] + b * c[1][1] + d * c[2][1] + e * c[3][1]];
  };
  const bezD = (c, t) => {
    const u = 1 - t;
    const a = 3 * u * u, b = 6 * u * t, d = 3 * t * t;
    return [a * (c[1][0] - c[0][0]) + b * (c[2][0] - c[1][0]) + d * (c[3][0] - c[2][0]), a * (c[1][1] - c[0][1]) + b * (c[2][1] - c[1][1]) + d * (c[3][1] - c[2][1])];
  };
  // c — четыре точки кривой от основания к острию, w — ширина у основания; tin — доля длины, на которой лента
  // нарастает из острия (0 — тупое основание, его прячут под баннером или Магатамой)
  function band(c, w, steps = 18, tin = 0) {
    const L = [];
    const R = [];
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const p = bez(c, t);
      const d = bezD(c, t);
      const len = Math.hypot(d[0], d[1]) || 1;
      const k = tin ? Math.min(1, t / tin) : 1;
      const hw = (w / 2) * Math.pow(1 - t, 0.62) * k * k * (3 - 2 * k);
      L.push([p[0] - (d[1] / len) * hw, p[1] + (d[0] / len) * hw]);
      R.push([p[0] + (d[1] / len) * hw, p[1] - (d[0] / len) * hw]);
    }
    const line = (pts) => pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("");
    return { fill: `${line(L)}${line(R.slice().reverse()).replace(/^M/, "L")}Z`, left: line(L), right: line(R), L, R };
  }
  // f — лента, g — свечение контура, e — контур; c — ток по контуру (только на баннере)
  function bandSvg(b, cls, attrs = "", flow = false) {
    const edge = (k) => `<path class="${k}" d="${b.left}" pathLength="1"/><path class="${k}" d="${b.right}" pathLength="1"/>`;
    return `<g class="sn-b ${cls}" ${attrs}><path class="f" d="${b.fill}"/>${edge("g")}${edge("e")}${flow ? edge("c") : ""}</g>`;
  }

  // полосы на баннере (поле 560×210, Магатама справа — с центром в 480,105): из-под неё веером к рукам Полудемона
  function banBands(n) {
    const out = [];
    const w = Math.max(6, Math.min(19, 210 / n));
    const spread0 = Math.min(104, n * w * 0.95);
    for (let i = 0; i < n; i++) {
      const f = n === 1 ? 0.5 : i / (n - 1);
      const y0 = 105 + (f - 0.5) * spread0;
      const y3 = 142 + (f - 0.5) * 112 + (rnd(i, 1) - 0.5) * 8;
      const x3 = 100 + rnd(i, 2) * 40 + (1 - f) * 60;
      const c = [[452, y0], [340, y0 + (rnd(i, 3) - 0.5) * 26], [x3 + 120, y3 - (f - 0.5) * 70 + (rnd(i, 4) - 0.5) * 18], [x3, y3]];
      out.push(band(c, w));
    }
    return out;
  }

  // Магатама: тело, налитое бирюзой по доле выполненного, контур со свечением, счёт в голове
  function magatama(done, total) {
    const id = `sn-mg-${++uid}`;
    const top = total ? 100 - (100 * done) / total : 100;
    return `
      <defs>
        <clipPath id="${id}"><path d="${MG}"/></clipPath>
        <radialGradient id="${id}-b" cx="40%" cy="28%" r="80%"><stop offset="0" stop-color="#14272b"/><stop offset="1" stop-color="#040809"/></radialGradient>
        <linearGradient id="${id}-f" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#2fe6e0" stop-opacity="0.62"/><stop offset="1" stop-color="#2fe6e0" stop-opacity="0.22"/></linearGradient>
        <mask id="${id}-m" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100"><rect width="100" height="100" fill="#fff"/>${total ? `<circle cx="52" cy="37" r="18" fill="#000"/>` : ""}</mask>
      </defs>
      <path class="mg-body" d="${MG}" fill="url(#${id}-b)"/>
      <g clip-path="url(#${id})"><rect class="mg-fill" x="0" y="${top.toFixed(1)}" width="100" height="${(100 - top).toFixed(1)}" fill="url(#${id}-f)"/><rect class="mg-surf" x="0" y="${top.toFixed(1)}" width="100" height="1.4" mask="url(#${id}-m)"/></g>
      <path class="mg-glow" d="${MG}"/><path class="mg-edge" d="${MG}"/>
      ${total ? `<text class="mg-n" x="52" y="50" text-anchor="middle">${done}</text><text class="mg-t" x="58" y="95">/${total}</text>` : ""}`;
  }

  // ---------- заставка «Пробуждение»: арт Полудемона и запечённые из него татуировки с глазами ----------
  // assets/tattoos.webp — только светящиеся линии и глаза из library_hero_2x на прозрачном (bake-tattoos.py рядом).
  // Всё рисуется на одном canvas из заранее декодированных картинок: два слоя по 3840×1240 в DOM с режимом screen
  // и анимированной обрезкой ложились на видеокарту тяжело; на canvas за кадр — обрезка и две отрисовки.
  const ART_W = 3840;
  const ART_H = 1240;
  const hero2x = (u) => (u ?? "").replace(/library_hero\.jpg(\?.*)?$/, "library_hero_2x.jpg");
  // картинки заставки: декодировать заранее (при наведении), в кадре — готовый ImageBitmap
  const bitmaps = new Map();
  function prep(url) {
    if (!url) return Promise.resolve(null);
    let e = bitmaps.get(url);
    if (!e) {
      const im = new Image();
      im.decoding = "async";
      im.src = url;
      e = { bmp: null };
      e.ready = im
        .decode()
        .then(() => (window.createImageBitmap ? createImageBitmap(im) : im))
        .then((b) => (e.bmp = b))
        .catch(() => null);
      bitmaps.set(url, e);
    }
    return e.ready;
  }
  const bmp = (url) => bitmaps.get(url)?.bmp ?? null;
  const within = (promises, ms) => Promise.race([Promise.all(promises), new Promise((res) => setTimeout(res, ms))]);

  // кривая CSS cubic-bezier — анимация на canvas в привычном темпе
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
  const EASE = easing(0.25, 0.1, 0.25, 1);
  const EASE_OPEN = easing(0.7, 0, 0.2, 1);
  const EASE_PUSH = easing(0.55, 0, 0.15, 1);
  const EASE_LIT = easing(0.3, 0.1, 0.3, 1);
  const EASE_RETREAT = easing(0.42, 0, 0.62, 0.7); // гаснет всё быстрее — свет уходит в глаза
  const EASE_LAST = easing(0.85, 0, 0.9, 0.5); // глаза держатся до последнего
  const EASE_REVEAL = easing(0.6, 0, 0.25, 1);
  const EASE_OUT = easing(0.2, 0.7, 0.3, 1);
  const LINEAR = (k) => k;

  // кадр арта как на баннере: object-fit: cover с его object-position и увеличением при выделении → [масштаб, x, y]
  function bannerMap(ban) {
    const box = (ban.querySelector(".sn-ban-in") ?? ban).getBoundingClientRect();
    const img = ban.querySelector(".sn-ban-art img");
    const [px, py] = (img ? getComputedStyle(img).objectPosition : "50% 22%").split(" ").map((v) => parseFloat(v) / 100);
    const zoom = 1.035;
    const sc = Math.max(box.width / ART_W, box.height / ART_H);
    const x = box.left + (box.width - ART_W * sc) * (Number.isFinite(px) ? px : 0.5);
    const y = box.top + (box.height - ART_H * sc) * (Number.isFinite(py) ? py : 0.22);
    const cx = box.left + box.width / 2;
    const cy = box.top + box.height / 2;
    return [sc * zoom, cx + (x - cx) * zoom, cy + (y - cy) * zoom];
  }
  // наезд на лицо: глаза чуть ниже середины экрана. На широком экране арт закрывает экран целиком; на узком камера
  // отъезжает, чтобы вошла фигура с метками на руках (сверху и снизу — тьма, как кадр в кино)
  function faceMap(vw, vh, k = 1) {
    if (vw < vh) {
      const sc = Math.max(vw / (ART_W * 0.42), (vh / ART_H) * 0.6) * k;
      return [sc, vw * 0.5 - ART_W * sc * 0.487, vh * 0.47 - ART_H * sc * 0.37];
    }
    const sc = Math.max(vw / ART_W, vh / ART_H) * 1.32 * k;
    return [sc, Math.min(0, Math.max(vw - ART_W * sc, vw * 0.5 - ART_W * sc * 0.487)), Math.min(0, Math.max(vh - ART_H * sc, vh * 0.47 - ART_H * sc * 0.37))];
  }
  // шестигранник [лево, верх, право, низ, скос]: «весь экран» — с запасом за краями
  const screenHex = (vw, vh) => [-0.35 * vw, -0.35 * vh, 1.35 * vw, 1.35 * vh, 0.3 * vw];

  // глаза Полудемона на арте (доли ширины и высоты)
  const EYES = [
    [0.453, 0.39],
    [0.521, 0.345],
  ];
  // тень по арту — те же доли, что у .sn-ban-shade на баннере: стык с плашкой незаметен, засветы приглушены
  const ART_SHADE = [[0, 0.86], [0.22, 0.62], [0.37, 0.12], [0.46, 0], [0.58, 0], [0.7, 0.6], [0.78, 0.8], [1, 0.92]];
  const ART_SHADE_DEEP = [[0, 0.94], [0.22, 0.86], [0.37, 0.42], [0.45, 0.06], [0.57, 0.04], [0.65, 0.5], [0.72, 0.84], [1, 0.96]];

  // Сцена на canvas внутри слоя. Свойства (layer.snWake.go(свойство, к чему, мс, кривая, задержка), set — сразу):
  // clip — шестигранник плашки, map — кадр арта, dark — темнота, ink — свет татуировок, lit — докуда от лица
  // разгорелись татуировки (0…1, волна со вспышкой на фронте), flare — вспышка глаз, hole — [x, y, радиус]
  // шестигранного окна во тьме, через которое открывается страница. Цикл rAF живёт, пока жив слой.
  function wakeScene(layer, vw, vh, init, sources) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cv = document.createElement("canvas");
    cv.className = "sn-wake-cv";
    cv.setAttribute("aria-hidden", "true");
    cv.width = Math.round(vw * dpr);
    cv.height = Math.round(vh * dpr);
    layer.append(cv);
    const g = cv.getContext("2d");
    g.imageSmoothingQuality = "high";
    // буфер для татуировок, проявленных волной, и для глаз
    const buf = document.createElement("canvas");
    buf.width = cv.width;
    buf.height = cv.height;
    const bg = buf.getContext("2d");
    bg.imageSmoothingQuality = "high";
    // виньетка: углы кадра темнее, взгляд — на лицо
    const vign = g.createRadialGradient(vw / 2, vh * 0.46, Math.min(vw, vh) * 0.28, vw / 2, vh * 0.46, Math.hypot(vw, vh) * 0.62);
    vign.addColorStop(0, "rgba(2, 6, 7, 0)");
    vign.addColorStop(1, "rgba(2, 6, 7, 0.72)");
    const fixed = (v) => ({ from: v, to: v, t0: 0, dur: 0, ease: LINEAR });
    const tw = {
      clip: fixed(init.clip),
      map: fixed(init.map),
      dark: fixed(init.dark),
      ink: fixed(init.ink),
      lit: fixed(init.lit ?? 0),
      flare: fixed(init.flare ?? 0),
      deep: fixed(init.deep ?? 0),
      hole: fixed([0, 0, 0]),
    };
    const at = (t, n) => {
      const k = t.dur ? t.ease(Math.min(1, Math.max(0, (n - t.t0) / t.dur))) : 1;
      return Array.isArray(t.from) ? t.from.map((v, i) => v + (t.to[i] - v) * k) : t.from + (t.to - t.from) * k;
    };
    const hexAt = (cx, cy, r) => {
      g.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 3;
        if (i) g.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
        else g.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
      }
      g.closePath();
    };
    let holeCell = 1; // радиус окна, равного соте-Магатаме
    let litDir = 1; // 1 — разгорается, −1 — гаснет
    let holeTo = 1;
    const paint = (n) => {
      const [l, t, r, b, c] = at(tw.clip, n);
      const [sc, x, y] = at(tw.map, n);
      const dark = at(tw.dark, n);
      const glow = at(tw.ink, n);
      const lit = at(tw.lit, n);
      const flare = at(tw.flare, n);
      const deep = at(tw.deep, n);
      const [hx, hy, hr] = at(tw.hole, n);
      const w = ART_W * sc;
      const h = ART_H * sc;
      const { art, ink } = sources();
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, vw, vh);
      g.save();
      g.beginPath();
      g.moveTo(l + c, t);
      g.lineTo(r - c, t);
      g.lineTo(r, (t + b) / 2);
      g.lineTo(r - c, b);
      g.lineTo(l + c, b);
      g.lineTo(l, (t + b) / 2);
      g.closePath();
      g.clip();
      g.fillStyle = "#020506";
      g.fillRect(0, 0, vw, vh);
      if (art) {
        // уходя в темноту, арт тускнеет и обесцвечивается: во тьме не светятся брызги, только татуировки
        if (dark > 0.002) g.filter = `brightness(${(1 - 0.25 * dark).toFixed(3)}) saturate(${(1 - 0.82 * dark).toFixed(3)})`;
        g.drawImage(art, x, y, w, h);
        g.filter = "none";
      }
      const artShade = g.createLinearGradient(x, 0, x + w, 0);
      ART_SHADE.forEach(([o, a], i) => {
        const [o2, a2] = ART_SHADE_DEEP[i];
        artShade.addColorStop(o + (o2 - o) * deep, `rgba(3, 9, 11, ${(a + (a2 - a) * deep).toFixed(3)})`);
      });
      g.fillStyle = artShade;
      g.fillRect(0, 0, vw, vh);
      g.fillStyle = vign;
      g.fillRect(0, 0, vw, vh);
      if (dark > 0.002) {
        // овал у лица пропускает ~20%: проступают лицо и волосы; дальше — сплошная чернота
        const fx = x + w * 0.487;
        const fy = y + h * 0.42;
        const face = g.createRadialGradient(fx, fy, 0, fx, fy, w * 0.2);
        face.addColorStop(0, "rgba(2, 5, 6, 0.8)");
        face.addColorStop(0.3, "rgba(2, 5, 6, 0.86)");
        face.addColorStop(0.6, "rgba(2, 5, 6, 0.97)");
        face.addColorStop(1, "#020405");
        g.globalAlpha = dark;
        g.fillStyle = face;
        g.fillRect(0, 0, vw, vh);
        g.globalAlpha = 1;
      }
      if (ink && glow > 0.002 && lit > 0.002) {
        const cx = x + w * 0.487;
        const cy = y + h * 0.4;
        // радиус волны — по самим меткам (тело на арте), а не до углов экрана: волна идёт по линиям ровно, без пустых долей;
        // при lit = 1 сплошная часть маски (0…0.7 радиуса) как раз накрывает дальние метки
        const ex = Math.max(Math.abs(x + w * 0.33 - cx), Math.abs(x + w * 0.67 - cx));
        const ey = Math.max(Math.abs(y + h * 0.1 - cy), Math.abs(y + h * 0.98 - cy));
        const reach = Math.max(1, (lit * Math.hypot(ex, ey)) / 0.68);
        const full = lit >= 0.999;
        // татуировки в буфере, проявленные радиальной волной от лица (stops — [доля радиуса, непрозрачность])
        const waved = (stops) => {
          bg.setTransform(dpr, 0, 0, dpr, 0, 0);
          bg.globalCompositeOperation = "source-over";
          bg.clearRect(0, 0, vw, vh);
          bg.drawImage(ink, x, y, w, h);
          bg.globalCompositeOperation = "destination-in";
          const gr = bg.createRadialGradient(cx, cy, 0, cx, cy, reach);
          for (const [o, a] of stops) gr.addColorStop(o, `rgba(0, 0, 0, ${a})`);
          bg.fillStyle = gr;
          bg.fillRect(0, 0, vw, vh);
          return buf;
        };
        const lines = full ? null : waved(litDir < 0 ? [[0, 1], [0.42, 1], [1, 0]] : [[0, 1], [0.7, 1], [1, 0]]);
        const put = () => (full ? g.drawImage(ink, x, y, w, h) : g.drawImage(lines, 0, 0, vw, vh));
        g.globalCompositeOperation = "screen";
        // широкий ореол — светящийся воздух вокруг меток
        g.globalAlpha = glow * 0.8;
        g.filter = `blur(${Math.max(22, Math.round(w / 60))}px)`;
        put();
        // ближнее свечение и сами линии
        g.globalAlpha = glow * 0.75;
        g.filter = `blur(${Math.max(4, Math.round(w / 420))}px)`;
        put();
        g.filter = "none";
        g.globalAlpha = glow;
        put();
        // фронт волны — линии вспыхивают почти добела, пока по ним проходит свет
        if (!full) {
          g.globalCompositeOperation = "lighter";
          g.globalAlpha = glow * 0.9;
          g.globalAlpha = glow * (litDir < 0 ? 0.5 : 0.9);
          g.drawImage(waved(litDir < 0 ? [[0, 0], [0.38, 0], [0.7, 1], [1, 0]] : [[0, 0], [0.62, 0], [0.84, 1], [1, 0]]), 0, 0, vw, vh);
        }
        g.globalCompositeOperation = "source-over";
        g.globalAlpha = 1;
      }
      // глаза — самая горячая точка: тот же слой в мягких пятнах вокруг глаз, режим lighter
      if (ink && flare > 0.002) {
        const rr = w * 0.024;
        bg.setTransform(dpr, 0, 0, dpr, 0, 0);
        bg.globalCompositeOperation = "source-over";
        bg.clearRect(0, 0, vw, vh);
        for (const [ex, ey] of EYES) {
          const px = x + w * ex;
          const py = y + h * ey;
          const sp = bg.createRadialGradient(px, py, 0, px, py, rr);
          sp.addColorStop(0, "rgba(0, 0, 0, 1)");
          sp.addColorStop(0.55, "rgba(0, 0, 0, 0.85)");
          sp.addColorStop(1, "rgba(0, 0, 0, 0)");
          bg.fillStyle = sp;
          bg.fillRect(px - rr, py - rr, rr * 2, rr * 2);
        }
        bg.globalCompositeOperation = "source-in";
        bg.drawImage(ink, x, y, w, h);
        g.globalCompositeOperation = "lighter";
        g.globalAlpha = Math.min(1, flare);
        g.filter = `blur(${Math.max(6, Math.round(w / 300))}px)`;
        g.drawImage(buf, 0, 0, vw, vh);
        g.filter = "none";
        g.globalAlpha = Math.min(1, flare) * 0.85;
        g.drawImage(buf, 0, 0, vw, vh);
        g.globalCompositeOperation = "source-over";
        g.globalAlpha = 1;
      }
      // окно во тьме — шестигранник, растущий из соты-Магатамы; по его краю бежит свет
      if (hr > 0.5) {
        g.globalCompositeOperation = "destination-out";
        hexAt(hx, hy, hr);
        g.fill();
        g.globalCompositeOperation = "source-over";
        // край разгорается, пока окно растёт до соты, и гаснет, пока окно раскрывает страницу
        const fade = hr <= holeCell + 0.5 ? hr / Math.max(1, holeCell) : Math.max(0, 1 - (hr - holeCell) / Math.max(1, holeTo - holeCell));
        if (fade > 0.01) {
          hexAt(hx, hy, hr);
          g.lineJoin = "round";
          g.strokeStyle = `rgba(184, 255, 251, ${(0.95 * fade).toFixed(3)})`;
          g.lineWidth = 2.5;
          g.shadowColor = "rgba(47, 230, 224, 0.95)";
          g.shadowBlur = 26;
          g.stroke();
          g.shadowBlur = 0;
        }
      }
      g.restore();
    };
    let raf = 0;
    const frame = () => {
      raf = 0;
      if (!layer.isConnected) return;
      const n = performance.now();
      paint(n);
      if (Object.values(tw).some((t) => n < t.t0 + t.dur)) raf = requestAnimationFrame(frame);
    };
    layer.snWake = {
      go(prop, to, dur, ease = EASE, delay = 0) {
        const n = performance.now();
        tw[prop] = { from: at(tw[prop], n), to, t0: n + delay, dur, ease };
        if (prop === "lit") litDir = to < tw.lit.from ? -1 : 1;
        if (prop === "hole") {
          if (tw.hole.from[2] < 1) holeCell = to[2];
          holeTo = to[2];
        }
        if (!raf) raf = requestAnimationFrame(frame);
      },
      set(prop, v) {
        tw[prop] = fixed(v);
      },
      repaint: () => paint(performance.now()),
    };
    paint(performance.now());
  }

  const titleHtml = (game, esc) => (game.logo ? `<img src="${esc(game.logo)}" alt="">` : `<span>${esc(game.title)}</span>`);

  // шестиугольник ячейки (viewBox 100×115.47), сжатый к центру: s = 1 — по краю
  const hexPath = (s) => {
    const cx = 50;
    const cy = 57.735;
    const pts = [[50, 0], [100, 28.87], [100, 86.6], [50, 115.47], [0, 86.6], [0, 28.87]];
    return `M${pts.map(([x, y]) => `${(cx + (x - cx) * s).toFixed(2)},${(cy + (y - cy) * s).toFixed(2)}`).join(" L")} Z`;
  };
  const RIM_OUT = hexPath(0.972);
  const RIM_IN = hexPath(0.906);

  GameThemes.register("shin-megami-tensei-iii-nocturne-hd-remaster", {
    // ---------- главная: метки Полудемона ----------
    banner(b) {
      const { done, total } = b.progress;
      const n = Math.max(1, total);
      const mid = `sn-bm-${++uid}`;
      const bands = banBands(n).map((bd, i) => bandSvg(bd, i < done ? "on" : "off", `style="--i:${i}"`, true)).join("");
      const logo = b.art.logo('alt=""');
      b.el.innerHTML = `
        <span class="sn-ban">
          <span class="sn-ban-in">
            <span class="sn-ban-art">${b.art.hero('alt="" loading="lazy"')}</span>
            <span class="sn-ban-hex" aria-hidden="true"></span>
            <span class="sn-ban-shade" aria-hidden="true"></span>
            <span class="sn-ban-logo">${logo || `<span class="sn-ban-name">${b.esc(b.game.title)}</span>`}</span>
            <svg class="sn-ban-ink" viewBox="0 0 560 210" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">
              <defs>
                <linearGradient id="${mid}-g" x1="0" x2="560" y1="0" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0.64" stop-color="#fff"/><stop offset="0.8" stop-color="#000"/></linearGradient>
                <mask id="${mid}" maskUnits="userSpaceOnUse" x="0" y="0" width="560" height="210"><rect width="560" height="210" fill="url(#${mid}-g)"/></mask>
              </defs>
              <g mask="url(#${mid})">${bands}</g>
              <g class="sn-mg" transform="translate(405 30) scale(1.5)">${magatama(done, total)}</g>
            </svg>
            <span class="sn-sr">${b.esc(b.game.title)}. ${total ? `Выполнено ${done} из ${total} условий закрытия` : "Условия ещё не заданы"}</span>
          </span>
        </span>`;
    },

    // ---------- главная: при наведении — пробуждение Магатамы ----------
    // Только CSS: контур огромной Магатамы вокруг Магатамы баннера, волны сот от неё, полосы в поля.
    stage(s) {
      const ring = (k) => `<i class="sn-st-ring" style="--k:${k}"></i>`;
      // полосы в пикселях (поле 520×560, x = 0 — край баннера, основание спрятано под ним)
      const vine = (i) => {
        const y0 = 170 + rnd(i, 4) * 220;
        const len = 220 + rnd(i, 5) * 300;
        const bend = (rnd(i, 6) - 0.5) * 260;
        const c = [[-140, y0], [len * 0.3, y0 + bend * 0.12], [len * 0.7, y0 + bend], [len, y0 + bend * 0.7]];
        return bandSvg(band(c, 12 + rnd(i, 7) * 10, 22, 0.14), "on", `style="--d:${(0.1 + (i % 7) * 0.08).toFixed(2)}s"`);
      };
      const vines = (side) => Array.from({ length: 7 }, (_, i) => vine(i + (side === "r" ? 7 : 0))).join("");
      prep(hero2x(s.game.hero));
      prep(`${s.assets}tattoos.webp`);
      s.el.innerHTML = `
        <div class="sn-st">
          <i class="sn-st-hex"></i>
          ${[0, 1, 2, 3].map(ring).join("")}
          <svg class="sn-st-mg" viewBox="-4 -4 108 108" aria-hidden="true"><path class="glow" d="${MG}" pathLength="1"/><path class="core" d="${MG}" pathLength="1"/><circle class="glow" cx="56" cy="34" r="8" pathLength="1"/><circle class="core" cx="56" cy="34" r="8" pathLength="1"/></svg>
          <svg class="sn-st-vines l" viewBox="0 0 520 560" aria-hidden="true">${vines("l")}</svg>
          <svg class="sn-st-vines r" viewBox="0 0 520 560" aria-hidden="true">${vines("r")}</svg>
        </div>`;
    },

    // ---------- главная: пробуждение — шестигранник баннера раскрывается, камера наезжает на лицо ----------
    cover(t) {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const ban = document.querySelector(`.gbanner.picked[data-game="${ID}"] .sn-ban`);
      const r = ban?.getBoundingClientRect();
      const fallback = ban?.querySelector(".sn-ban-art img"); // обычный арт — уже показан на баннере
      const big = hero2x(t.game.hero);
      const inkUrl = `${t.assets}tattoos.webp`;
      const wake = t.layer("sn-wake");
      const cut = (ban && parseFloat(getComputedStyle(ban).getPropertyValue("--cut"))) || 36;
      // начало — точно поверх баннера: та же форма и тот же кадр арта
      wakeScene(
        wake,
        vw,
        vh,
        {
          clip: r && r.width ? [r.left, r.top, r.right, r.bottom, cut] : [vw * 0.15, vh * 0.4, vw * 0.85, vh * 0.6, cut],
          map: r && r.width ? bannerMap(ban) : faceMap(vw, vh, 0.85),
          dark: 0,
          ink: 0,
        },
        () => ({ art: bmp(big) ?? (fallback?.complete ? fallback : null), ink: bmp(inkUrl) }),
      );
      void wake.offsetWidth;
      wake.classList.add("in");
      const title = t.layer("sn-title");
      title.innerHTML = titleHtml(t.game, t.esc);
      fetch(`data/conditions/${ID}.json`)
        .then((res) => (res.ok ? res.json() : null))
        .then((c) => warm((c?.groups ?? []).flatMap((gr) => gr.goals ?? []).slice(0, 6).map((g) => thumb(g.image))))
        .catch(() => {});
      t.data.started = performance.now();
      t.data.seen = seenBefore();
      const imgs = [...title.querySelectorAll("img")].map((im) => im.decode?.().catch(() => {}));
      return new Promise((resolve) => {
        within([prep(big), prep(inkUrl), ...imgs], 160).then(() => {
          const s = wake.snWake;
          s.repaint();
          s.go("clip", screenHex(vw, vh), 720, EASE_OPEN);
          s.go("map", faceMap(vw, vh), 1000, EASE_PUSH);
          s.go("deep", 1, 900, EASE);
          s.go("flare", 1, 320, EASE, 140);
          s.go("ink", 0.7, 500, EASE, 250);
          s.go("lit", 0.42, 950, EASE_LIT, 260);
          setTimeout(resolve, CLOSE_MS + 40);
        });
        setTimeout(resolve, CLOSE_MS + 600);
      });
    },

    // ---------- страница игры — соты ----------
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

      root.classList.add("sn");
      root.innerHTML = pageHtml();
      const comb = root.querySelector(".sn-comb");
      const cells = [...root.querySelectorAll(".sn-cell")];

      backdrop();
      if (total) {
        pictures();
        layout();
        lens();
        awaken();
        analyze();
      }
      intro();

      return () => root.classList.remove("sn");

      // ---------- разметка ----------
      function pageHtml() {
        const logo = ctx.art.logo('alt=""');
        const nb = ctx.neighbors ?? {};
        return `
          <div class="sn-page ${total ? "" : "sn-page-empty"}">
            <header class="sn-head">
              <a class="sn-head-logo" href="#/" aria-label="К списку игр">${logo || `<span class="sn-head-name">${esc(game.title)}</span>`}</a>
              <h1 class="sn-sr">${esc(game.title)}</h1>
            </header>
            ${
              total
                ? `<main class="sn-comb" aria-label="Условия закрытия">${coreHtml()}${items.map(cellHtml).join("")}</main>`
                : `<main class="sn-comb sn-comb-empty"><p class="sn-empty">Условия закрытия для этой игры ещё не заданы.</p></main>`
            }
            <nav class="sn-nav" aria-label="Другие игры">
              ${nb.prev ? `<a class="prev" href="${esc(nb.prev.href)}"><span>${esc(nb.prev.title)}</span></a>` : ""}
              <a class="home" href="#/"><span>К списку игр</span></a>
              ${nb.next ? `<a class="next" href="${esc(nb.next.href)}"><span>${esc(nb.next.title)}</span></a>` : ""}
            </nav>
            <dialog class="sn-analyze" aria-labelledby="sn-an-title"></dialog>
          </div>`;
      }

      function rimHtml() {
        return `
        <svg class="sn-rim" viewBox="0 0 100 115.47" preserveAspectRatio="none" aria-hidden="true">
          <path class="band" d="${RIM_OUT} ${RIM_IN}" fill-rule="evenodd"/>
          <path class="glow" d="${RIM_OUT}" pathLength="1"/><path class="glow" d="${RIM_IN}" pathLength="1"/>
          <path class="out" d="${RIM_OUT}" pathLength="1"/><path class="in" d="${RIM_IN}" pathLength="1"/>
        </svg>`;
      }

      // сота-Магатама: налита по доле выполненного
      function coreHtml() {
        return `
          <section class="sn-cell sn-core done" aria-label="Выполнено ${done} из ${total} условий закрытия">
            <div class="sn-hex">
              <svg class="sn-core-mg" viewBox="-8 -8 116 116" aria-hidden="true">${magatama(done, total)}</svg>
            </div>
            <p class="sn-core-l" aria-hidden="true">условий закрытия</p>
            ${rimHtml()}
          </section>`;
      }

      function extraOf(g) {
        return !!(g.note || g.details || (g.checklist ?? []).some((c) => (c.items ?? []).length));
      }

      function cellHtml(g, i) {
        const img = ctx.safeUrl(g.image);
        const fit = g.imageFit === "contain";
        const gallery = (g.gallery ?? []).map(ctx.safeUrl).filter(Boolean);
        const link = ctx.safeUrl(g.link);
        const len = (g.title ?? "").length;
        const size = len > 220 ? "xxl" : len > 130 ? "xl" : len > 80 ? "l" : len > 45 ? "m" : "s";
        const list = (g.checklist ?? []).flatMap((c) => c.items ?? []);
        const cap = esc(g.title);
        return `
          <section class="sn-cell ${g.done ? "done" : "todo"} t-${size}" aria-label="№${esc(g.n)}${g.done ? ", выполнено" : ", не выполнено"}" data-gallery>
            <div class="sn-hex">
              <div class="sn-pic ${fit ? "fig" : ""}">
                ${img ? `<img class="sn-face" src="${esc(thumb(img))}" data-full="${esc(img)}" alt="" decoding="async"><img class="sn-full" src="${esc(img)}" alt="" loading="lazy" hidden data-zoom data-caption="${cap}">` : ""}
                ${gallery.map((u) => `<img class="sn-more" src="${esc(u)}" alt="" loading="lazy" hidden data-zoom data-caption="${cap}">`).join("")}
              </div>
              <span class="sn-n" aria-hidden="true">${esc(g.n)}</span>
              ${extraOf(g) ? `<button class="sn-scan" type="button" data-i="${i}">Анализ${list.length ? ` · ${list.filter((it) => it.done).length}/${list.length}` : ""}</button>` : ""}
              ${gallery.length ? `<span class="sn-plus" title="Ещё картинок: ${gallery.length}" aria-hidden="true"><svg viewBox="0 0 16 16"><rect x="1.5" y="4.5" width="10" height="10" rx="1"/><path d="M4.5 1.5h9a1 1 0 0 1 1 1v9"/></svg>${gallery.length}</span>` : ""}
              <div class="sn-txt ${size}">
                <i class="sn-sl l" aria-hidden="true"></i><i class="sn-sl r" aria-hidden="true"></i>
                <h3>${cap}</h3>
                ${link ? `<a class="sn-lore" href="${esc(link)}" target="_blank" rel="noopener">Подробнее&nbsp;↗</a>` : ""}
              </div>
            </div>
            ${rimHtml()}
          </section>`;
      }

      // ---------- фон: чернота с бирюзовой дымкой и красными брызгами ключевого арта ----------
      function backdrop() {
        const bg = ctx.layer("sn-backdrop");
        bg.innerHTML = `<i style="background-image:url('${assets}void.webp')"></i><b class="a" style="background-image:url('${assets}splatter.webp')"></b><b class="b" style="background-image:url('${assets}splatter.webp')"></b>`;
      }

      // ---------- картинки: миниатюра не загрузилась — полная; заранее декодировать, пока экран закрыт ----------
      function pictures() {
        for (const im of root.querySelectorAll(".sn-face")) {
          ctx.listen(im, "error", () => {
            if (im.dataset.full && im.src !== im.dataset.full) im.src = im.dataset.full;
          }, { once: true });
        }
        later(() => root.querySelectorAll(".sn-face").forEach((im) => im.decode?.().catch(() => {})), 300);
      }

      // ---------- соты: ряды со сдвигом на полячейки, Магатама — посередине первого ряда; узко — столбец ----------
      function layout() {
        let queued = false;
        const place = () => {
          queued = false;
          const W = comb.clientWidth;
          const cols = W >= 1000 ? 3 : W >= 640 ? 2 : 1;
          comb.classList.toggle("list", cols === 1);
          if (cols === 1) {
            cells.forEach((c) => (c.style.cssText = ""));
            comb.style.height = "";
            return;
          }
          const gap = 14;
          const w = Math.min(cols === 3 ? 380 : 330, (W - (cols - 1) * gap - gap / 2) / (cols + 0.5));
          const h = w * 1.1547;
          const rowH = h * 0.75 + gap * 0.87;
          const used = cols * w + (cols - 1) * gap + (w + gap) / 2;
          const left0 = (W - used) / 2;
          // места: Магатама (первая в разметке) — в середине первого ряда при трёх столбцах
          const slots = cells.map((_, i) => (cols === 3 ? (i === 0 ? 1 : i === 1 ? 0 : i) : i));
          // одна ячейка в последнем ряду — в его середину: встаёт между вершинами ряда выше
          if (cols === 3 && cells.length % 3 === 1 && cells.length > 3) slots[slots.length - 1] += 1;
          cells.forEach((c, i) => {
            const k = slots[i];
            const row = Math.floor(k / cols);
            const col = k % cols;
            const x = left0 + col * (w + gap) + (row % 2 ? (w + gap) / 2 : 0);
            c.style.cssText = `left:${x.toFixed(1)}px;top:${(row * rowH).toFixed(1)}px;width:${w.toFixed(1)}px;height:${h.toFixed(1)}px`;
          });
          const rows = Math.floor(Math.max(...slots) / cols) + 1;
          comb.style.height = `${((rows - 1) * rowH + h).toFixed(0)}px`;
        };
        const queue = () => {
          if (queued) return;
          queued = true;
          requestAnimationFrame(place);
        };
        place();
        if ("ResizeObserver" in window) {
          const ro = new ResizeObserver(queue);
          ro.observe(comb);
          ctx.onCleanup(() => ro.disconnect());
        }
      }

      // ---------- под курсором проступает сетка сот ----------
      function lens() {
        if (!ctx.finePointer || !motion) return;
        const el = ctx.layer("sn-lens");
        el.innerHTML = "<i></i>";
        const tile = el.firstChild;
        let tx = -999;
        let ty = -999;
        let x = -999;
        let y = -999;
        ctx.listen(window, "pointermove", (e) => {
          tx = e.clientX;
          ty = e.clientY;
          el.classList.add("on");
        }, { passive: true });
        ctx.listen(document, "pointerleave", () => el.classList.remove("on"));
        ctx.loop((now, dt) => {
          const k = 1 - Math.pow(0.0006, dt);
          x += (tx - x) * k;
          y += (ty - y) * k;
          const R = 170;
          el.style.transform = `translate3d(${(x - R).toFixed(1)}px, ${(y - R).toFixed(1)}px, 0)`;
          // узор стоит на месте, линза скользит по нему
          tile.style.transform = `translate3d(${(-(x - R) % 52).toFixed(1)}px, ${(-(y - R) % 90).toFixed(1)}px, 0)`;
        });
      }

      // ---------- выполненная ячейка, впервые попав в кадр, обводится полосой татуировки ----------
      function awaken() {
        const lit = cells.filter((c) => c.classList.contains("done"));
        if (!motion || !("IntersectionObserver" in window)) {
          lit.forEach((c) => c.classList.add("lit"));
          return;
        }
        const io = new IntersectionObserver(
          (entries) => {
            for (const en of entries) {
              if (!en.isIntersecting) continue;
              io.unobserve(en.target);
              en.target.classList.add("lit");
            }
          },
          { threshold: 0.4 },
        );
        later(() => lit.forEach((c) => io.observe(c)), ctx.handoff ? 1000 : 820);
        ctx.onCleanup(() => io.disconnect());
      }

      // ---------- «Анализ»: условие крупно — картинка, слова, как закрыто, чек-листы, галерея ----------
      function analyze() {
        const dlg = root.querySelector(".sn-analyze");
        let from = null;
        const open = (g, btn) => {
          const img = ctx.safeUrl(g.image);
          const gallery = (g.gallery ?? []).map(ctx.safeUrl).filter(Boolean);
          const link = ctx.safeUrl(g.link);
          const cap = esc(g.title);
          const lists = (g.checklist ?? [])
            .filter((c) => (c.items ?? []).length)
            .map((c) => `<div class="sn-an-list">${c.label ? `<h4>${esc(c.label)}</h4>` : ""}<ul>${c.items.map((it) => `<li class="${it.done ? "on" : ""}">${esc(it.title)}</li>`).join("")}</ul></div>`)
            .join("");
          const pics = [img, ...gallery].filter(Boolean);
          dlg.innerHTML = `
            <div class="sn-an ${g.done ? "done" : "todo"}" data-gallery>
              <header class="sn-an-head">
                <span class="sn-an-n">${esc(g.n)}</span><span class="sn-an-cap">Анализ</span>
                <button class="sn-an-close" type="button" aria-label="Закрыть">✕</button>
              </header>
              <div class="sn-an-body">
                ${img ? `<div class="sn-an-pic ${g.imageFit === "contain" ? "fig" : ""}"><img src="${esc(thumb(img))}" alt=""></div>` : ""}
                <div class="sn-an-txt">
                  <h2 id="sn-an-title">${cap}</h2>
                  <p class="sn-an-state">${g.done ? "Выполнено" : "Не выполнено"}</p>
                  ${g.note ? `<blockquote class="sn-an-note">«${esc(g.note)}»</blockquote>` : ""}
                  ${g.details ? `<p class="sn-an-details">${esc(g.details)}</p>` : ""}
                  ${lists}
                  ${link ? `<a class="sn-lore" href="${esc(link)}" target="_blank" rel="noopener">Подробнее&nbsp;↗</a>` : ""}
                </div>
              </div>
              ${pics.length > 1 ? `<div class="sn-an-gal">${pics.map((u) => `<img src="${esc(thumb(u))}" alt="" data-zoom data-caption="${cap}">`).join("")}</div>` : ""}
            </div>`;
          from = btn;
          dlg.showModal();
        };
        ctx.listen(root, "click", (e) => {
          const btn = e.target.closest(".sn-scan");
          if (btn) open(items[+btn.dataset.i], btn);
        });
        ctx.listen(dlg, "click", (e) => {
          if (e.target === dlg || e.target.closest(".sn-an-close")) dlg.close();
        });
        // Esc закрывает только окно: дальше документа не пускаем, иначе движок уведёт к списку игр
        ctx.listen(dlg, "keydown", (e) => {
          if (e.key === "Escape") e.stopPropagation();
        });
        ctx.listen(dlg, "close", () => from?.focus());
        ctx.onCleanup(() => dlg.open && dlg.close());
      }

      // ---------- вход: арт гаснет, в темноте горят татуировки и глаза, логотип; потом всё растворяется ----------
      function intro() {
        const handed = ctx.handoff?.layers.find((l) => l.classList.contains("sn-wake"));
        const handedTitle = ctx.handoff?.layers.find((l) => l.classList.contains("sn-title"));
        if (!motion) {
          handed?.remove();
          handedTitle?.remove();
          return;
        }
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        let wake = handed;
        let title = handedTitle;
        let hold;
        let ready;
        if (wake?.snWake && title) {
          const since = performance.now() - (ctx.handoff.data.started ?? 0);
          hold = Math.max(HOLD.handoff, (ctx.handoff.data.seen ? 0 : HOLD.first) - since);
          ready = Promise.resolve();
        } else {
          // прямой заход: экран уже тёмный, татуировки разгораются из темноты
          wake?.remove();
          title?.remove();
          const big = hero2x(game.hero);
          const inkUrl = `${assets}tattoos.webp`;
          wake = ctx.layer("sn-wake in direct");
          wakeScene(wake, vw, vh, { clip: screenHex(vw, vh), map: faceMap(vw, vh), dark: 1, ink: 0, deep: 1 }, () => ({ art: bmp(big), ink: bmp(inkUrl) }));
          title = ctx.layer("sn-title");
          title.innerHTML = titleHtml(game, esc);
          hold = seenBefore() ? HOLD.repeat : HOLD.direct;
          ready = within([prep(big), prep(inkUrl), ...[...title.querySelectorAll("img")].map((im) => im.decode?.().catch(() => {}))], 700);
        }
        const w = wake;
        const ttl = title;
        root.classList.add("sn-intro");
        ready.then(() => {
          if (!w.isConnected) return;
          const s = w.snWake;
          s.go("dark", 1, 700);
          s.go("ink", 1, 600);
          s.go("lit", 1, w.classList.contains("direct") ? 1500 : 1250, EASE_LIT);
          if (w.classList.contains("direct")) {
            s.go("flare", 1, 380, EASE);
            later(() => s.go("flare", 0.6, 1300), 420);
          } else {
            s.go("flare", 0.6, 1400);
          }
          // медленный наезд дальше, пока горят татуировки
          s.go("map", faceMap(vw, vh, 1.05), 2600, LINEAR);
          later(() => ttl.classList.add("in"), 260);
        });
        let opened = false;
        const open = () => {
          if (opened) return;
          opened = true;
          const s = w.snWake;
          // 1. метки гаснут от краёв к лицу, глаза — последними
          s.go("lit", 0, 820, EASE_RETREAT);
          s.go("flare", 0, 1050, EASE_LAST);
          // 2. логотип перелетает на место логотипа страницы
          flyTitle(ttl);
          // 3. тьма открывается шестигранником из соты-Магатамы
          const core = root.querySelector(".sn-core .sn-hex") ?? root.querySelector(".sn-head-logo");
          const cr = core?.getBoundingClientRect();
          const hx = cr ? cr.left + cr.width / 2 : vw / 2;
          const hy = cr ? cr.top + cr.height / 2 : vh / 2;
          const r0 = cr ? cr.height / 2 : 60;
          const rMax = Math.hypot(Math.max(hx, vw - hx), Math.max(hy, vh - hy)) / Math.cos(Math.PI / 6) + 20;
          // окно растёт из точки: на миг становится ровно сотой-Магатамой (светящийся край), потом открывает всё
          s.set("hole", [hx, hy, 0]);
          s.go("hole", [hx, hy, r0 * 0.985], 420, EASE_OUT, 880);
          later(() => s.go("hole", [hx, hy, rMax], 1050, EASE_REVEAL), 880 + 420 + 160);
          // логотип страницы — сразу под прилетевшим, без своего проявления
          later(() => {
            const head = root.querySelector(".sn-head");
            if (head) head.style.transition = "none";
            root.classList.remove("sn-intro");
            if (head) {
              void head.offsetWidth;
              head.style.transition = "";
            }
          }, 900);
          later(() => ttl.remove(), 1750);
          later(() => w.remove(), 2600);
        };
        // логотип заставки плавно садится на место логотипа в шапке страницы
        function flyTitle(el) {
          const from = el.querySelector("img, span");
          const to = root.querySelector(".sn-head-logo img, .sn-head-logo .sn-head-name");
          if (!from || !to) {
            el.classList.add("out");
            return;
          }
          const a = from.getBoundingClientRect();
          const b = to.getBoundingClientRect();
          from.style.transformOrigin = "0 0";
          from.style.transition = "transform 0.82s cubic-bezier(0.65, 0, 0.25, 1), filter 0.82s ease";
          from.style.transform = `translate(${(b.left - a.left).toFixed(1)}px, ${(b.top - a.top).toFixed(1)}px) scale(${(b.width / a.width).toFixed(4)})`;
          from.style.filter = "drop-shadow(0 4px 12px rgba(0, 0, 0, 0.9))";
        }
        later(open, hold);
        ctx.onCleanup(() => {
          w.remove();
          ttl.remove();
          root.classList.remove("sn-intro");
        });
        for (const type of ["pointerdown", "keydown", "wheel"]) ctx.listen(window, type, open, { passive: true, once: true });
      }
    },
  });
})();
