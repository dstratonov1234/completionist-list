// Hollow Knight — «Дневник Халлоунеста».
// Заставка области при входе; условия закрытия — как Дневник охотника (список слева, запись справа,
// невыполненные — силуэты); прогресс — сосуд души, который наполняется; курсор — светомуха; пещера на фоне.
(() => {
  "use strict";

  // Карточка области: только название игры между филигранью — без статуса и прогресса.
  function areaCard(el, game, assets, esc) {
    el.innerHTML = `
      <img src="${assets}divider.webp" alt="">
      <div class="hk-area-name">${esc(game.title)}</div>
      <img class="hk-flip" src="${assets}divider.webp" alt="">`;
  }

  GameThemes.register("hollow-knight", {
    // Начало заставки ещё на главной: опускается тёмная вуаль Халлоунеста и проявляется карточка области.
    cover(t) {
      t.layer("hk-veil");
      areaCard(t.layer("hk-area-title"), t.game, t.assets, t.esc);
      return t.wait(650);
    },

    page(ctx) {
      const { root, el, esc, assets, game } = ctx;
      const goals = ctx.goals();
      const done = goals.filter((g) => g.done).length;
      root.classList.add("hk");

      areaTitle();
      cavern();
      journal();
      vessel();
      lumafly();

      return () => root.classList.remove("hk");

      // ---------- заставка области, как при входе в новую локацию ----------
      function areaTitle() {
        // Вход с главной: вуаль и карточка уже на экране (cover) — вуаль поднимается, карточка ещё висит.
        const veil = ctx.handoff?.layers.find((l) => l.classList.contains("hk-veil"));
        const handed = ctx.handoff?.layers.find((l) => l.classList.contains("hk-area-title"));
        if (ctx.reducedMotion && !handed) return;
        const t = handed ?? ctx.layer("hk-area-title");
        if (!handed) areaCard(t, game, assets, esc);
        const timers = [
          veil && setTimeout(() => veil.classList.add("out"), 450),
          veil && setTimeout(() => veil.remove(), 1500),
          setTimeout(() => t.classList.add("out"), handed ? 2200 : 2600),
          setTimeout(() => t.remove(), handed ? 3800 : 4200),
        ];
        ctx.onCleanup(() => timers.forEach((x) => x && clearTimeout(x)));
      }

      // ---------- пещера за контентом, с лёгким параллаксом ----------
      function cavern() {
        const bg = ctx.layer("hk-cavern");
        bg.style.backgroundImage = `url("${assets}cavern.webp")`;
        if (ctx.reducedMotion) return;
        let y = -1;
        ctx.loop(() => {
          if (window.scrollY === y) return;
          y = window.scrollY;
          bg.style.transform = `translate3d(0, ${(-y * 0.12).toFixed(1)}px, 0) scale(1.15)`;
        });
      }

      // ---------- Дневник охотника: все условия закрытия ----------
      function journal() {
        const groups = ctx.groups();
        const cond = ctx.conditions;
        if (!cond || !groups.length || !goals.length) return;

        const block = document.createElement("section");
        block.className = "block hk-journal-block";
        block.innerHTML = `
          <h2><span class="sec-label">Дневник</span><span class="block-count">${done}/${goals.length}</span></h2>
          <div class="hk-journal">
            <div class="hk-journal-list" role="listbox" aria-label="Условия закрытия">
              ${cond.groups
                .map(
                  (gr, gi) => `
                <div class="hk-group" data-group="${gi}">${esc(gr.title)}</div>
                ${(gr.goals ?? [])
                  .map(
                    (g) => `
                  <div role="option" tabindex="-1" data-n="${esc(g.n)}" class="hk-item ${g.done ? "" : "hk-unknown"}">
                    <span class="hk-thumb">${ctx.safeUrl(g.image) ? `<img src="${esc(g.image)}" alt="" loading="lazy">` : `<span class="hk-thumb-n">${esc(g.n)}</span>`}</span>
                    <span class="hk-name">${esc(g.title)}</span>
                  </div>`,
                  )
                  .join("")}`,
                )
                .join("")}
            </div>
            <article class="hk-entry" data-gallery aria-live="polite"></article>
          </div>`;
        groups[0].before(block);
        groups.forEach((s) => s.remove());

        const list = block.querySelector(".hk-journal-list");
        const entry = block.querySelector(".hk-entry");
        const items = [...list.querySelectorAll(".hk-item")];
        const byN = new Map(goals.map((g) => [String(g.n), g]));
        const FIELDS = [
          ["gives", "Что даёт"],
          ["needs", "Что потребуется"],
          ["unlock", "Открывается"],
          ["counts", "Как засчитываем"],
        ];

        const show = (n, focus) => {
          const g = byN.get(String(n));
          if (!g) return;
          items.forEach((it) => {
            const on = it.dataset.n === String(n);
            it.setAttribute("aria-selected", String(on));
            it.tabIndex = on ? 0 : -1;
            if (on && focus) it.focus();
          });
          const img = ctx.safeUrl(g.image);
          const facts = FIELDS.filter(([k]) => g[k])
            .map(([k, l]) => `<p><b>${l}.</b> ${esc(g[k])}</p>`)
            .concat((g.extra ?? []).map((x) => `<p><b>${esc(x.label)}.</b> ${esc(x.value)}</p>`))
            .join("");
          const checklist = (g.checklist ?? [])
            .map(
              (c) => `
              <div class="hk-check">
                ${c.label ? `<div class="hk-check-label">${esc(c.label)}</div>` : ""}
                <ul>${(c.items ?? []).map((it) => `<li class="${it.done ? "on" : ""}"><i aria-hidden="true"></i>${esc(it.title)}</li>`).join("")}</ul>
              </div>`,
            )
            .join("");
          entry.classList.toggle("hk-unknown", !g.done);
          entry.innerHTML = `
            <div class="hk-entry-art">
              ${img ? `<img src="${esc(img)}" alt="${esc(g.title)}" data-zoom data-caption="${esc(g.title)}">` : `<span class="hk-entry-empty">${esc(g.n)}</span>`}
            </div>
            <div class="hk-entry-n">Условие №${esc(g.n)}</div>
            <h3>${esc(g.title)}</h3>
            <img class="hk-entry-divider" src="${assets}divider.webp" alt="">
            <div class="hk-entry-state">${g.done ? "Выполнено" : "Ещё не выполнено"}</div>
            ${facts ? `<div class="hk-entry-facts">${facts}</div>` : ""}
            ${checklist}
            ${g.note ? `<blockquote>${esc(g.note)}</blockquote>` : ""}
            ${g.details ? `<p class="hk-entry-details">${esc(g.details)}</p>` : ""}
            ${ctx.safeUrl(g.link) ? `<footer><a href="${esc(g.link)}" target="_blank" rel="noopener">Подробнее ↗</a></footer>` : ""}`;
          entry.classList.remove("hk-enter");
          void entry.offsetWidth;
          entry.classList.add("hk-enter");
        };

        ctx.listen(list, "click", (e) => {
          const it = e.target.closest(".hk-item");
          if (it) show(it.dataset.n);
        });
        ctx.listen(list, "mouseover", (e) => {
          const it = e.target.closest(".hk-item");
          if (it && ctx.finePointer && it.getAttribute("aria-selected") !== "true") show(it.dataset.n);
        });
        ctx.listen(list, "keydown", (e) => {
          const cur = items.findIndex((it) => it.getAttribute("aria-selected") === "true");
          const next = { ArrowDown: cur + 1, ArrowRight: cur + 1, ArrowUp: cur - 1, ArrowLeft: cur - 1, Home: 0, End: items.length - 1 }[e.key];
          if (next == null) return;
          e.preventDefault();
          show(items[(next + items.length) % items.length].dataset.n, true);
        });

        // Ссылки групп в боковой панели ведут в дневник: открываем первую цель группы.
        if (el.side) {
          ctx.listen(el.side, "click", (e) => {
            const a = e.target.closest("[data-jump]");
            if (!a) return;
            e.preventDefault();
            e.stopPropagation();
            const first = cond.groups[+a.dataset.jump]?.goals?.[0];
            if (first) show(first.n);
            block.scrollIntoView({ behavior: ctx.reducedMotion ? "auto" : "smooth", block: "start" });
          });
        }

        // Первой открываем последнюю выполненную цель (или первую, если ничего не выполнено).
        const lastDone = [...goals].filter((g) => g.done).sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")))[0];
        show((lastDone ?? goals[0]).n);
      }

      // ---------- прогресс — сосуд души ----------
      function vessel() {
        const ring = el.side?.querySelector(".ring");
        if (!ring || !goals.length) return;
        const v = document.createElement("div");
        v.className = "hk-vessel";
        v.style.setProperty("--fill", (done / goals.length).toFixed(3));
        v.setAttribute("role", "img");
        v.setAttribute("aria-label", `Выполнено ${done} из ${goals.length}`);
        v.innerHTML = `
          <div class="hk-orb">
            <div class="hk-soul"><i></i><i></i></div>
            <img src="${assets}vessel.webp" alt="">
          </div>
          <div class="hk-vessel-text"><b>${done}</b><span>/${goals.length}</span><small>${done === goals.length ? "Душа наполнена" : "Душа наполняется"}</small></div>`;
        ring.replaceWith(v);
      }

      // ---------- курсор — светомуха ----------
      function lumafly() {
        if (!ctx.finePointer || ctx.reducedMotion) return;
        const glow = ctx.layer("hk-lumafly");
        let tx = -999, ty = -999, x = -999, y = -999;
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
          glow.style.transform = `translate3d(${(x - 130).toFixed(1)}px, ${(y - 130 + bob).toFixed(1)}px, 0)`;
        });
      }
    },
  });
})();
