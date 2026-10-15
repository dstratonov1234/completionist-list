// Cyberpunk 2077 — «нетраннерский HUD Найт-Сити».
// Вход через глитч-шторку, HUD поверх экрана (уголки, строка состояния с часами, координатами и
// счётчиком контрактов, сканирующая линия), штамп статуса в баннере (FLATLINED для брошенной игры).
// Условия закрытия — контракты фиксера: выполненные получают штамп и «скан», невыполненные —
// зашифрованы (картинка под замком, дешифруется по клику/Enter/тапу). Заголовки и названия
// дешифруются при прокрутке, баннер изредка рвёт глитчем, курсор — прицел, сбоку — HUD-датчик
// прогресса и биомонитор, который зависит от статуса игры. Всё, чего нет на странице, пропускается.
(() => {
  "use strict";

  const GLYPHS = "ABCDEF0123456789#%&@$*+=/<>[]ЖЩЫЮЯЭ▓▒░";
  const SPACE = /\s/;
  const SVGNS = 'xmlns="http://www.w3.org/2000/svg"';

  // Слова штампа, строки состояния и биомонитора по статусу игры. date — какое поле дат показать.
  const STATES = {
    dropped: { stamp: "FLATLINED", bar: "Связь потеряна", sub: "Брошено", pulse: "Нет сигнала", date: "finished", prefix: "" },
    completed: { stamp: "JOB DONE", bar: "Контракт закрыт", sub: "Пройдено", pulse: "Стабилен", date: "finished", prefix: "" },
    in_progress: { stamp: "JACKED IN", bar: "Соединение активно", sub: "В процессе", pulse: "Активен", date: "started", prefix: "с " },
    planned: { stamp: "STANDBY", bar: "Ожидание подключения", sub: "В планах", pulse: "Ожидание", date: "added", prefix: "добавлено " },
  };
  const UNKNOWN = { stamp: "NO SIGNAL", bar: "Нет данных", sub: "", pulse: "Нет данных", date: "", prefix: "" };

  // FNV-1a: стабильные «серийники» и координаты из данных.
  function hash(str) {
    let h = 0x811c9dc5;
    for (const ch of String(str)) h = Math.imul(h ^ ch.codePointAt(0), 0x01000193) >>> 0;
    return h;
  }

  const glyph = () => GLYPHS[(Math.random() * GLYPHS.length) | 0];
  const scramble = (chars) => chars.map((c) => (SPACE.test(c) ? c : glyph())).join("");
  const pad = (n, w = 2) => String(n).padStart(w, "0");
  const hex4 = (s) => `0x${(hash(s) & 0xffff).toString(16).toUpperCase().padStart(4, "0")}`;

  GameThemes.register("cyberpunk-2077", {
    page(ctx) {
      const { root, el, esc, assets, game } = ctx;
      const html = document.documentElement;
      const motion = !ctx.reducedMotion;
      const known = Object.hasOwn(STATES, game.status);
      const st = known ? STATES[game.status] : UNKNOWN;
      const tone = `cp-s-${known ? game.status : "unknown"}`;
      const seed = hash(game.id);
      const goals = (typeof ctx.goals === "function" ? ctx.goals() : null) ?? [];
      const tally = { done: goals.filter((g) => g.done).length, total: goals.length };
      const hasIO = typeof IntersectionObserver === "function";
      let alive = true;

      root.classList.add("cp", tone);
      if (motion) root.classList.add("cp-anim");
      ctx.onCleanup(() => (alive = false));

      const jobsQueue = []; // активные дешифровки текста
      const frame = []; // покадровые задачи единственного rAF-цикла
      const timers = new Set();
      ctx.onCleanup(() => timers.forEach(clearTimeout));
      const later = (fn, ms) => {
        const id = setTimeout(() => (timers.delete(id), alive && fn()), ms);
        timers.add(id);
      };

      // Одно «окно» на всю страницу: что попало в кадр — один раз проигрывает своё появление.
      const seen = new Map();
      const io = hasIO
        ? new IntersectionObserver(
            (entries) => {
              for (const e of entries) {
                if (!e.isIntersecting) continue;
                io.unobserve(e.target);
                seen.get(e.target)?.();
                seen.delete(e.target);
              }
            },
            { rootMargin: "0px 0px -12% 0px" },
          )
        : null;
      if (io) ctx.onCleanup(() => io.disconnect());
      const onView = (node, fn) => {
        if (!io || !motion) return fn();
        seen.set(node, fn);
        io.observe(node);
      };

      backdrop();
      const hud = statusBar();
      stamp();
      statusPill();
      headings();
      briefing();
      contracts();
      gauge();
      biomonitor();
      report();
      heroGlitch();
      reticle();
      entrance();

      let lastSec = -1;
      ctx.loop((now, dt) => {
        const sec = Math.floor(Date.now() / 1000);
        if (sec !== lastSec) {
          lastSec = sec;
          hud?.tick();
        }
        if (jobsQueue.length) runDecoders(now);
        for (const fn of frame) fn(now, dt);
      });

      return () => {
        root.classList.remove("cp", "cp-anim", tone);
        html.classList.remove("cp-cross");
      };

      // ---------- дешифровка текста: символы перебирают глифы и встают на место ----------
      function decode(node, text, { dur = 700, delay = 0 } = {}) {
        if (!node) return;
        const prev = jobsQueue.findIndex((j) => j.node === node);
        if (prev >= 0) jobsQueue.splice(prev, 1);
        if (!motion) {
          node.textContent = text;
          return;
        }
        const chars = [...text];
        const start = performance.now() + delay;
        const n = Math.max(1, chars.length);
        const at = chars.map((_, i) => start + (i / n) * dur * 0.6 + Math.random() * dur * 0.4);
        jobsQueue.push({ node, chars, at, end: Math.max(start, ...at), last: 0 });
        node.textContent = scramble(chars);
      }

      function runDecoders(now) {
        for (let k = jobsQueue.length - 1; k >= 0; k--) {
          const j = jobsQueue[k];
          if (!j.node.isConnected || now >= j.end) {
            j.node.textContent = j.chars.join("");
            jobsQueue.splice(k, 1);
            continue;
          }
          if (now - j.last < 55) continue; // ~18 смен в секунду — перебор символов, а не мерцание
          j.last = now;
          j.node.textContent = j.chars.map((c, i) => (now >= j.at[i] || SPACE.test(c) ? c : glyph())).join("");
        }
      }

      // Настоящий текст — в скрытый span для скринридеров, видимая копия (aria-hidden) — для эффекта.
      function splitForDecode(node) {
        const text = node?.textContent.trim();
        if (!text || node.querySelector(".cp-dec")) return null;
        node.innerHTML = `<span class="cp-sr">${esc(text)}</span><span class="cp-dec" aria-hidden="true">${esc(text)}</span>`;
        return { dec: node.querySelector(".cp-dec"), text };
      }

      // Текст, который дешифруется, когда попадает в кадр (до этого — глифы).
      function decodeOnView(node, opts = {}) {
        const t = splitForDecode(node);
        if (!t) return null;
        if (motion) t.dec.textContent = scramble([...t.text]);
        onView(node, () => decode(t.dec, t.text, { dur: 480 + Math.min(t.text.length, 40) * 18, ...opts }));
        return t;
      }

      // ---------- фон: ночной город, лёгкий параллакс ----------
      function backdrop() {
        const city = ctx.layer("cp-city");
        city.style.backgroundImage = `url("${assets}city.webp")`;
        if (!motion) return;
        let y = -1;
        frame.push(() => {
          if (window.scrollY === y) return;
          y = window.scrollY;
          city.style.transform = `translate3d(0, ${(-y * 0.06).toFixed(1)}px, 0)`;
        });
      }

      // ---------- HUD: уголки, строка состояния, сканирующая линия ----------
      function statusBar() {
        const h = ctx.layer(`cp-hud ${tone}`);
        const hours = Number(game.playtime);
        const uptime =
          game.playtime != null && Number.isFinite(hours) && hours > 0
            ? `${pad(Math.floor(hours), 3)}:${pad(Math.round((hours % 1) * 60) % 60)}:00`
            : "";
        h.innerHTML = `
          <i class="cp-br cp-br-tl"></i><i class="cp-br cp-br-tr"></i><i class="cp-br cp-br-bl"></i><i class="cp-br cp-br-br"></i>
          <div class="cp-bar">
            <span class="cp-bar-id">◢ NC//NET</span>
            <span class="cp-bar-title">${esc(game.title)}</span>
            <span class="cp-bar-status"><i></i><b></b></span>
            ${tally.total ? `<span class="cp-bar-jobs">Контракты <b>${tally.done}/${tally.total}</b></span>` : ""}
            <span class="cp-bar-geo"></span>
            ${uptime ? `<span class="cp-bar-up">Uptime <b>${uptime}</b></span>` : ""}
            <span class="cp-bar-clock">--:--:--</span>
          </div>
          ${motion ? `<div class="cp-scan"></div>` : ""}`;
        decode(h.querySelector(".cp-bar-status b"), st.bar.toUpperCase(), { dur: 900, delay: 350 });

        const clock = h.querySelector(".cp-bar-clock");
        const geo = h.querySelector(".cp-bar-geo");
        const lat = 37.2 + (seed % 9000) / 10000;
        const lon = 121.6 + ((seed >>> 13) % 9000) / 10000;
        let jitter = 0;
        return {
          tick() {
            const d = new Date();
            clock.textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
            if (motion) jitter = (Math.random() - 0.5) * 0.0006;
            geo.textContent = `N ${(lat + jitter).toFixed(4)}° W ${(lon - jitter).toFixed(4)}°`;
          },
        };
      }

      // ---------- штамп статуса в баннере ----------
      function stamp() {
        const hero = el.hero;
        if (!hero) return;
        const date = st.date && game[st.date] ? `${st.prefix}${ctx.fmtDate(game[st.date])}` : "";
        const prog = tally.total ? `${tally.done}/${tally.total}` : "";
        const sub = [st.sub, date, prog].filter(Boolean).join(" · ");
        const s = document.createElement("div");
        s.className = "cp-stamp";
        s.setAttribute("aria-hidden", "true");
        s.innerHTML = `
          <span class="cp-stamp-frame"></span>
          <b class="cp-stamp-word" data-text="${esc(st.stamp)}">${esc(st.stamp)}</b>
          ${sub ? `<span class="cp-stamp-sub">${esc(sub)}</span>` : ""}`;
        hero.append(s);
        ctx.onCleanup(() => s.remove());
      }

      // Плашка статуса без эмодзи — в HUD-стиле.
      function statusPill() {
        const pill = el.hero?.querySelector(".status-pill");
        if (!pill) return;
        const text = pill.textContent.replace(/^[^\p{L}\p{N}]+/u, "").trim();
        if (text) pill.textContent = text;
      }

      // ---------- заголовки секций: индекс справа и дешифровка при прокрутке ----------
      function headings() {
        root.querySelectorAll(".block > h2").forEach((h, i) => {
          if (h.querySelector(".cp-idx")) return;
          h.insertAdjacentHTML("beforeend", `<span class="cp-idx" aria-hidden="true">0x${pad((i + 1).toString(16).toUpperCase())}</span>`);
        });
        // Без логотипа название игры в баннере — обычный h1: дешифруем его на входе.
        const h1 = el.hero && !el.hero.classList.contains("has-logo") ? el.hero.querySelector("h1") : null;
        const title = splitForDecode(h1);
        if (title) decode(title.dec, title.text, { dur: 900, delay: 650 });

        for (const label of root.querySelectorAll(".block > h2 .sec-label")) decodeOnView(label);
      }

      // ---------- брифинг (.cond-summary): сегментная шкала по целям ----------
      function briefing() {
        const sum = root.querySelector(".cond-summary");
        if (!sum) return;
        const bar = sum.querySelector(".progress");
        if (bar && tally.total && tally.total <= 60) {
          const seg = document.createElement("div");
          seg.className = "cp-segbar";
          seg.setAttribute("aria-hidden", "true");
          seg.innerHTML = goals.map((g, i) => `<i class="${g.done ? "on" : ""}" style="--k:${i}"></i>`).join("");
          bar.replaceWith(seg);
          onView(seg, () => seg.classList.add("cp-in"));
        }
        const big = sum.querySelector(".cond-total b");
        if (big && motion) decode(big, big.textContent, { dur: 600, delay: 900 });
      }

      // ---------- цели — контракты фиксера ----------
      function contracts() {
        const arts = [...root.querySelectorAll(".cond[data-goal]")];
        if (!arts.length) return;
        const byN = new Map(goals.map((g) => [String(g.n), g]));
        const titles = new WeakMap();
        const groupTitles = (ctx.conditions?.groups ?? []).map((g) => g?.title ?? "");

        for (const art of arts) {
          if (art.classList.contains("cp-job")) continue;
          const goal = byN.get(art.dataset.goal) ?? { title: art.querySelector(".cond-title")?.textContent ?? "", done: art.classList.contains("done") };
          const done = !!goal.done;
          art.classList.add("cp-job");
          const grp = groupTitles[Number(art.closest(".cond-group")?.dataset.group)] ?? "";

          // Шапка контракта: номер, «серийник», группа.
          art.querySelector(".cond-body")?.insertAdjacentHTML(
            "afterbegin",
            `<div class="cp-job-id" aria-hidden="true"><span>◢ Контракт ${esc(pad(art.dataset.goal))}</span><span>${hex4(goal.title)}</span>${grp ? `<span class="cp-job-grp">${esc(grp)}</span>` : ""}</div>`,
          );

          // Плашка состояния без эмодзи: ◆ выполнено / ▲ не выполнено.
          const state = art.querySelector(".cond-state");
          if (state) {
            const date = done && goal.date ? ` · ${esc(ctx.fmtDate(goal.date))}` : "";
            state.innerHTML = done ? `<i aria-hidden="true">◆</i> Выполнено${date}` : `<i aria-hidden="true">▲</i> Не выполнено`;
          }

          // Картинка: у выполненных — штамп, у невыполненных — замок шифрования.
          const media = art.querySelector(".cond-media");
          const img = media?.querySelector("img");
          if (media && done) {
            media.insertAdjacentHTML("beforeend", `<span class="cp-done-stamp" aria-hidden="true">Выполнено</span><span class="cp-done-scan" aria-hidden="true"></span>`);
          } else if (media && img) {
            media.insertAdjacentHTML(
              "beforeend",
              `<button type="button" class="cp-lock" aria-pressed="false" aria-label="Дешифровать картинку: ${esc(goal.title)}">
                 <span class="cp-lock-ico" aria-hidden="true"></span>
                 <b>Зашифровано</b>
                 <small>${ctx.finePointer ? "Клик — дешифровать" : "Нажми, чтобы дешифровать"}</small>
               </button>`,
            );
          } else if (media) {
            media.insertAdjacentHTML("beforeend", `<span class="cp-lock-ico" aria-hidden="true"></span>`);
          }

          const title = decodeOnView(art.querySelector(".cond-title"), { delay: 80 });
          if (title) titles.set(art, title);
          onView(art, () => art.classList.add("cp-in"));
        }

        // Наведение/фокус на невыполненный контракт — название коротко перешифровывается.
        if (motion) {
          const lastPing = new WeakMap();
          const ping = (e) => {
            const art = e.target.closest?.(".cp-job.todo");
            const t = art && titles.get(art);
            if (!t) return;
            const now = performance.now();
            if (now - (lastPing.get(art) ?? 0) < 1600) return;
            lastPing.set(art, now);
            decode(t.dec, t.text, { dur: 420 });
          };
          const list = el.main ?? root;
          ctx.listen(list, "pointerover", (e) => e.pointerType === "mouse" && ping(e), { passive: true });
          ctx.listen(list, "focusin", ping);
        }

        // Замок: Enter/пробел/клик/тап — дешифровка; повторно — зашифровать обратно (фокус остаётся на кнопке).
        ctx.listen(root, "click", (e) => {
          const btn = e.target.closest?.(".cp-lock");
          if (!btn || !root.contains(btn)) return;
          e.preventDefault();
          const art = btn.closest(".cp-job");
          const label = btn.querySelector("b");
          const title = titles.get(art)?.text ?? art.querySelector(".cond-title")?.textContent.trim() ?? "";
          if (art.classList.contains("cp-open")) {
            art.classList.remove("cp-open");
            btn.setAttribute("aria-pressed", "false");
            btn.setAttribute("aria-label", `Дешифровать картинку: ${title}`);
            decode(label, "Зашифровано", { dur: 300 });
            return;
          }
          if (art.classList.contains("cp-decrypting")) return;
          art.classList.add("cp-decrypting");
          decode(label, "Доступ получен", { dur: 420 });
          later(() => {
            art.classList.remove("cp-decrypting");
            art.classList.add("cp-open");
            btn.setAttribute("aria-pressed", "true");
            btn.setAttribute("aria-label", `Зашифровать картинку обратно: ${title}`);
            label.textContent = "Дешифровано";
          }, motion ? 560 : 0);
        });
      }

      // ---------- сбоку: HUD-датчик вместо кольца прогресса ----------
      function gauge() {
        const ring = el.side?.querySelector(".ring");
        if (!ring) return;
        const n = goals.length;
        const C = 60, R = 47, SWEEP = 270, START = 135;
        const pt = (deg) => {
          const a = (deg * Math.PI) / 180;
          return `${(C + R * Math.cos(a)).toFixed(2)} ${(C + R * Math.sin(a)).toFixed(2)}`;
        };
        const arc = (a0, a1) => `M${pt(a0)}A${R} ${R} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${pt(a1)}`;
        let segs = "";
        if (n && n <= 60) {
          const step = SWEEP / n;
          const gap = Math.min(4, step * 0.28);
          segs = goals
            .map((g, i) => `<path class="cp-seg ${g.done ? "on" : ""}" style="--k:${i}" d="${arc(START + i * step + gap / 2, START + (i + 1) * step - gap / 2)}"/>`)
            .join("");
        } else {
          const p = n ? tally.done / n : 0;
          segs = `<path class="cp-seg" d="${arc(START, START + SWEEP)}"/>${p > 0 ? `<path class="cp-seg on" style="--k:0" d="${arc(START, START + Math.max(1, SWEEP * p))}"/>` : ""}`;
        }
        const ticks = Array.from({ length: 48 }, (_, i) => {
          const a = (i * 7.5 * Math.PI) / 180;
          const r0 = i % 4 ? 54 : 52;
          return `M${(C + r0 * Math.cos(a)).toFixed(2)} ${(C + r0 * Math.sin(a)).toFixed(2)}L${(C + 57 * Math.cos(a)).toFixed(2)} ${(C + 57 * Math.sin(a)).toFixed(2)}`;
        }).join("");
        const pct = n ? Math.round((tally.done / n) * 100) : 0;

        const g = document.createElement("div");
        g.className = "cp-gauge";
        g.setAttribute("role", "img");
        g.setAttribute("aria-label", ring.getAttribute("aria-label") || `Выполнено ${tally.done} из ${n}`);
        g.innerHTML = `
          <svg ${SVGNS} viewBox="0 0 120 120" aria-hidden="true">
            <g class="cp-gauge-ticks"><path d="${ticks}"/></g>
            ${segs}
          </svg>
          <div class="cp-gauge-text" aria-hidden="true">
            <b>${tally.done}</b><span>/${n}</span>
            <small>${pct}% · Контракты</small>
          </div>`;
        ring.replaceWith(g);
        onView(g, () => g.classList.add("cp-in"));
      }

      // ---------- сбоку: биомонитор, зависит от статуса игры ----------
      function biomonitor() {
        const card = el.side?.querySelector(".side-card");
        if (!card) return;
        const beat = (x) => `M${x} 24H${x + 34}l4-4 4 4H${x + 52}l3 4 5-20 5 30 4-14H${x + 84}q8-7 16 0H${x + 120}`;
        const kind = known ? game.status : "unknown";
        const line =
          kind === "dropped"
            ? `<path d="M0 24H26l4-4 4 4H44l3 4 5-14 5 18 4-8H240"/>`
            : kind === "planned" || kind === "unknown"
              ? `<path class="cp-ecg-idle" d="M0 24H240"/>`
              : `<path d="${beat(0)}"/><path d="${beat(120)}"/>`;
        card.insertAdjacentHTML(
          "afterbegin",
          `<div class="cp-bio" aria-hidden="true">
             <div class="cp-bio-head"><span>◢ Биомонитор</span><b>${esc(st.pulse)}</b></div>
             <div class="cp-ecg cp-ecg-${kind}"><svg ${SVGNS} viewBox="0 0 240 40" preserveAspectRatio="none">${line}</svg></div>
           </div>`,
        );
      }

      // ---------- отчёт: терминальный журнал ----------
      function report() {
        const mark = () => {
          if (!alive) return;
          const r = root.querySelector(".report");
          if (r && !r.classList.contains("cp-report")) r.classList.add("cp-report");
        };
        mark();
        ctx.reportReady?.then(mark, () => {});
      }

      // ---------- глитч баннера: редкие короткие разрывы картинки ----------
      function heroGlitch() {
        const hero = el.hero;
        if (!hero || !motion) return;
        const box = document.createElement("div");
        box.className = "cp-slices";
        box.setAttribute("aria-hidden", "true");
        box.innerHTML = "<i></i><i></i><i></i><i></i>";
        const media = hero.querySelector(".hero-media");
        if (media) media.after(box);
        else hero.prepend(box);
        ctx.onCleanup(() => box.remove());
        const slices = [...box.children];

        const shift = () => {
          for (const s of slices) {
            const top = Math.random() * 88;
            const height = 2 + Math.random() * 14;
            s.style.clipPath = `inset(${top.toFixed(1)}% 0 ${Math.max(0, 100 - top - height).toFixed(1)}% 0)`;
            s.style.transform = `translate3d(${((Math.random() - 0.5) * 70).toFixed(0)}px, 0, 0)`;
          }
          hero.style.setProperty("--cp-band", `${(Math.random() * 80).toFixed(1)}%`);
          hero.classList.toggle("cp-burst-b", Math.random() < 0.5);
        };

        // Вспышка ≈ 0,25 с с одним сдвигом посередине и паузой 5–11 с — далеко от порога 3 вспышек в секунду.
        let next = performance.now() + 2600 + Math.random() * 1800;
        let mid = 0;
        let end = 0;
        frame.push((now) => {
          if (end) {
            if (mid && now >= mid) {
              mid = 0;
              shift();
            }
            if (now >= end) {
              end = 0;
              hero.classList.remove("cp-burst", "cp-burst-b");
              next = now + 5000 + Math.random() * 6000;
            }
            return;
          }
          if (now < next || document.hidden) return;
          const r = hero.getBoundingClientRect();
          if (r.bottom < 40 || r.top > window.innerHeight) {
            next = now + 1500;
            return;
          }
          const img = hero.querySelector(".hero-media img");
          const src = img?.currentSrc || img?.src;
          if (src) box.style.setProperty("--cp-src", `url(${JSON.stringify(src)})`);
          shift();
          hero.classList.add("cp-burst");
          mid = now + 110;
          end = now + 250;
        });
        ctx.onCleanup(() => hero.classList.remove("cp-burst", "cp-burst-b"));
      }

      // ---------- курсор-прицел (только мышь, без reduced motion) ----------
      function reticle() {
        if (!ctx.finePointer || !motion) return;
        const r = ctx.layer("cp-reticle");
        r.innerHTML = `
          <svg ${SVGNS} viewBox="-32 -32 64 64">
            <circle class="cp-ret-ring" r="17"></circle>
            <path class="cp-ret-ticks" d="M0-28V-21M0 21V28M-28 0H-21M21 0H28"></path>
            <path class="cp-ret-lock" d="M-24-14V-24H-14M14-24H24V-14M24 14V24H14M-14 24H-24V14"></path>
          </svg>
          <span class="cp-reticle-read"></span>`;
        const read = r.querySelector(".cp-reticle-read");
        const LOCK = "a, button, [role='button'], [tabindex]:not([tabindex='-1']), img[data-zoom], summary, input, label";
        let tx = -100, ty = -100, x = -100, y = -100;
        let on = false, lock = false, lastRead = 0, shown = "";
        html.classList.add("cp-cross");

        ctx.listen(window, "pointermove", (e) => {
          if (e.pointerType && e.pointerType !== "mouse") return;
          tx = e.clientX;
          ty = e.clientY;
          if (!on) {
            on = true;
            if (x < 0) (x = tx), (y = ty);
            r.classList.add("on");
          }
        }, { passive: true });
        ctx.listen(document, "pointerout", (e) => {
          if (e.relatedTarget) return;
          on = false;
          r.classList.remove("on");
        });
        ctx.listen(document, "pointerover", (e) => {
          const hit = !!e.target.closest?.(LOCK);
          if (hit !== lock) {
            lock = hit;
            r.classList.toggle("lock", lock);
          }
        }, { passive: true });

        frame.push((now, dt) => {
          if (!on) return;
          const k = 1 - Math.exp(-dt * 26);
          x += (tx - x) * k;
          y += (ty - y) * k;
          r.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
          if (now - lastRead < 90) return;
          lastRead = now;
          const text = lock ? "ЦЕЛЬ ◆ ЗАХВАТ" : `X ${pad(Math.round(tx), 4)} · Y ${pad(Math.round(ty), 4)}`;
          if (text !== shown) read.textContent = shown = text;
        });
      }

      // ---------- вход: глитч-шторка из полос ----------
      function entrance() {
        if (!motion) return;
        const bands = 7;
        const order = [...Array(bands).keys()].sort(() => Math.random() - 0.5);
        const w = ctx.layer(`cp-boot ${tone}`);
        w.innerHTML = `
          ${order.map((d, i) => `<i class="${i % 2 ? "cp-r" : "cp-l"}" style="--i:${i};--d:${d}"></i>`).join("")}
          <div class="cp-boot-glitch"></div>
          <div class="cp-boot-text"><span>◢ NC//NET · Подключение</span><b></b></div>`;
        decode(w.querySelector(".cp-boot-text b"), String(game.title).toUpperCase(), { dur: 380 });
        later(() => w.remove(), 1500);
      }
    },
  });
})();
