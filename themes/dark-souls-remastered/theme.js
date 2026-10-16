// Dark Souls: Remastered — «Сквозь белый свет».
// Всё своё, по мотивам интерфейса и мира Dark Souls:
//  · баннер на главной — бой с боссом: слева рыцарь у костра, справа — полоса здоровья босса с логотипом
//    вместо имени; босс — сама игра: полоса поделена по числу условий, золотом — нанесённый урон
//    (выполненное), красным — оставшаяся жизнь; у торцов плашки светятся завесы тумана. Выделение —
//    удар: золото вспыхивает, полоса вздрагивает, завесы разгораются, из костра взметаются искры;
//  · при наведении на главную — костёр зажжён: под баннером разгорается огонь, по просветам между
//    баннерами поднимаются искры, тьма вокруг дрожит в его отсвете;
//  · заставка — проход сквозь туман: белый свет растёт из самого баннера и заливает экран, на тёмной
//    полосе проступает золотом название игры; на странице свет рассеивается;
//  · страница — арены одна за другой: кадр во всю ширину, внизу — имя условия над полосой здоровья, как
//    у босса. Невыполненные — за завесой тумана, полоса полная; выполненные — когда арена впервые
//    попадает в кадр, полосу добивают, она гаснет, имя становится золотым, и на миг проступает
//    «VICTORY ACHIEVED»; в шапке — полоса всей игры. Внизу — костёр и его меню.
(() => {
  "use strict";

  const CLOSE_MS = 700;
  const HOLD = { direct: 700, repeat: 260, handoff: 260, first: 900 };

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
      const seen = sessionStorage.getItem("ds-fog") === "1";
      sessionStorage.setItem("ds-fog", "1");
      return seen;
    } catch {
      return false;
    }
  }

  // полоса здоровья босса, поделённая по числу условий: красное — оставшаяся жизнь, золото — нанесённый урон
  const bar = (hp, n, cls = "") => {
    const ticks = Array.from({ length: Math.max(0, n - 1) }, (_, k) => `<b style="left:${(((k + 1) / n) * 100).toFixed(3)}%"></b>`).join("");
    return `<span class="ds-bar ${cls}" style="--hp:${Math.max(0, Math.min(1, hp)).toFixed(4)}" aria-hidden="true"><i class="dealt"></i><i class="hp"></i><i class="ticks">${ticks}</i></span>`;
  };

  // логотип без пустого поля вокруг надписи (в logo.png она занимает лишь середину по высоте)
  const logoBox = (art, game, esc, cls) => {
    const logo = art.logo('alt=""');
    return logo ? `<span class="${cls} ds-logo">${logo}</span>` : `<span class="${cls} ds-logo-text">${esc(game.title)}</span>`;
  };

  // заставка: белый свет из баннера, туман, тёмная полоса с названием
  function veilHtml(assets) {
    return `<i class="ds-veil-light"></i><i class="ds-veil-base"></i><i class="ds-veil-fog" style="background-image:url('${assets}mist.webp')"></i>`;
  }
  const titleHtml = (game, esc) => `<span class="ds-band">${esc(game.title)}</span>`;

  GameThemes.register("dark-souls-remastered", {
    // ---------- главная: бой с боссом у костра ----------
    banner(b) {
      warm([b.assets + "mist.webp", b.assets + "boss.webp"]);
      const { done, total } = b.progress;
      // искры: вторая половина видна только при выделении — костёр взметает их втрое гуще
      const embers = Array.from({ length: 30 }, (_, i) => `<i class="${i >= 12 ? "more" : ""}" style="--x:${(((i * 37) % 90) - 45).toFixed(0)}px;--d:${(i * 0.09).toFixed(2)}s;--t:${(1.3 + ((i * 7) % 9) / 10).toFixed(2)}s;--s:${(1 + ((i * 5) % 7) / 6).toFixed(2)}"></i>`).join("");
      const sheet = (side) => `<span class="ds-ban-gate ${side}" aria-hidden="true"><i style="background-image:url('${b.assets}mist.webp')"></i></span>`;
      b.el.innerHTML = `
        <span class="ds-ban">
          <span class="ds-ban-art">${b.art.hero('alt="" loading="lazy"')}</span>
          <span class="ds-ban-foe" aria-hidden="true"><i style="background-image:url('${b.assets}mist.webp')"></i><img src="${b.assets}boss.webp" alt=""></span>
          <span class="ds-ban-dim" aria-hidden="true"></span>
          <span class="ds-ban-fire" aria-hidden="true"></span>
          <span class="ds-ban-lit" aria-hidden="true"></span>
          <span class="ds-ban-embers" aria-hidden="true">${embers}</span>
          ${sheet("l")}${sheet("r")}
          <span class="ds-ban-boss">
            ${logoBox(b.art, b.game, b.esc, "ds-ban-name")}
            ${total ? `<span class="ds-ban-count" aria-hidden="true"><b>${done}</b> / ${total}</span>` : ""}
            ${bar(total ? (total - done) / total : 1, total || 1)}
          </span>
          <span class="ds-sr">${b.esc(b.game.title)}. ${total ? `Выполнено ${done} из ${total} условий закрытия` : "Условия ещё не заданы"}</span>
        </span>`;
    },

    // ---------- главная: при наведении — костёр зажжён ----------
    // Только CSS: огонь под баннером, искры поднимаются от его нижнего края по просветам, отсвет дрожит.
    stage(s) {
      const embers = Array.from({ length: 80 }, (_, i) => {
        const r = (k) => ((Math.sin((i + 1) * 12.9898 + k * 78.233) * 43758.5453) % 1 + 1) % 1;
        return `<i style="--u:${r(1).toFixed(3)};--d:${(r(2) * -6).toFixed(2)}s;--t:${(3 + r(3) * 3.6).toFixed(2)}s;--s:${(1 + r(4) * 1.4).toFixed(2)};--x:${((r(5) - 0.5) * 180).toFixed(0)}px"></i>`;
      }).join("");
      s.el.innerHTML = `
        <div class="ds-st">
          <i class="ds-st-dark"></i>
          <i class="ds-st-fire"></i>
          <div class="ds-st-embers">${embers}</div>
        </div>`;
    },

    // ---------- главная: проход сквозь туман — свет растёт из баннера ----------
    cover(t) {
      const veil = t.layer("ds-veil");
      veil.innerHTML = veilHtml(t.assets);
      // откуда растёт свет — с баннера, на который нажали
      const r = document.querySelector('.gbanner.picked[data-game="dark-souls-remastered"]')?.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const box = r && r.width ? r : { left: vw * 0.2, top: vh * 0.4, width: vw * 0.6, height: vh * 0.2 };
      // свет — круг размером с экран, в начале сжатый до прямоугольника баннера: растёт без огромной текстуры
      const D = Math.round(Math.max(vw, vh) * 1.6);
      veil.style.setProperty("--cx", `${Math.round(box.left + box.width / 2)}px`);
      veil.style.setProperty("--cy", `${Math.round(box.top + box.height / 2)}px`);
      veil.style.setProperty("--D", `${D}px`);
      veil.style.setProperty("--sx", (box.width / D).toFixed(4));
      veil.style.setProperty("--sy", (box.height / D).toFixed(4));
      const title = t.layer("ds-title");
      title.innerHTML = titleHtml(t.game, t.esc);
      warm(["stone.webp", "bonfire.webp"].map((f) => t.assets + f));
      fetch("data/conditions/dark-souls-remastered.json")
        .then((res) => (res.ok ? res.json() : null))
        .then((c) => warm((c?.groups ?? []).flatMap((gr) => gr.goals ?? []).slice(0, 3).map((g) => g.image)))
        .catch(() => {});
      t.data.started = performance.now();
      t.data.seen = seenBefore();
      return new Promise((resolve) => {
        void veil.offsetWidth; // начальное состояние — до смены класса, чтобы свет рос плавно
        veil.classList.add("in");
        setTimeout(() => title.classList.add("in"), 380);
        setTimeout(resolve, CLOSE_MS + 40);
      });
    },

    // ---------- страница игры — арены одна за другой ----------
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

      root.classList.add("ds");
      root.innerHTML = pageHtml();
      const arenas = [...root.querySelectorAll(".ds-arena")];

      backdrop();
      if (total) {
        headBar();
        victories();
      }
      intro();

      return () => root.classList.remove("ds");

      // ---------- разметка ----------
      function pageHtml() {
        const nb = ctx.neighbors ?? {};
        let i = 0;
        const body = groups
          .map(
            (gr) => `
            ${groups.length > 1 ? `<h2 class="ds-group"><span>${esc(gr.title)}</span></h2>` : ""}
            ${gr.goals.map((g) => arenaHtml(g, i++)).join("")}`,
          )
          .join("");
        const embers = Array.from({ length: 10 }, (_, k) => `<i style="--x:${(((k * 29) % 50) - 25).toFixed(0)}px;--d:${(k * 0.27).toFixed(2)}s;--t:${(1.8 + ((k * 7) % 9) / 9).toFixed(2)}s"></i>`).join("");
        return `
          <div class="ds-page ${total ? "" : "ds-page-empty"}">
            <header class="ds-head">
              <a class="ds-head-link" href="#/" aria-label="К списку игр">${logoBox(ctx.art, game, esc, "ds-head-logo")}</a>
              <h1 class="ds-sr">${esc(game.title)}</h1>
              ${
                total
                  ? `<div class="ds-head-boss" role="img" aria-label="Выполнено ${done} из ${total} условий закрытия">
                      ${bar(1, total, "big")}
                      <span class="ds-head-count"><b>${done}</b> / ${total} условий закрытия</span>
                    </div>`
                  : ""
              }
            </header>
            ${total ? `<main class="ds-arenas" aria-label="Условия закрытия">${body}</main>` : `<main class="ds-arenas"><p class="ds-empty">Условия закрытия для этой игры ещё не заданы.</p></main>`}
            <footer class="ds-rest">
              <div class="ds-bonfire" aria-hidden="true">
                <i class="ds-bonfire-glow"></i>
                <i class="ds-flame a"></i><i class="ds-flame b"></i><i class="ds-flame c"></i>
                <img src="${assets}bonfire.webp" alt="">
                <b class="ds-bonfire-embers">${embers}</b>
              </div>
              <nav class="ds-menu" aria-label="Другие игры">
                ${nb.prev ? `<a href="${esc(nb.prev.href)}"><i aria-hidden="true">◂</i><span>${esc(nb.prev.title)}</span></a>` : ""}
                <a href="#/"><i aria-hidden="true">◆</i><span>К списку игр</span></a>
                ${nb.next ? `<a href="${esc(nb.next.href)}"><i aria-hidden="true">▸</i><span>${esc(nb.next.title)}</span></a>` : ""}
              </nav>
            </footer>
          </div>`;
      }

      // перечень боссов или мест — табличками (слова те же, меняется только вид)
      function nameHtml(t) {
        const m = /^([^:]{2,60}):\s+(.+)$/.exec(t);
        const list = (s) => s.split(/,\s+/).filter(Boolean);
        if (m && list(m[2]).length >= 4) return `<span class="ds-name-main">${esc(m[1])}</span><span class="ds-names">${list(m[2]).map((x) => `<span>${esc(x)}</span>`).join("")}</span>`;
        if (!m && list(t).length >= 4) return `<span class="ds-names big">${list(t).map((x) => `<span>${esc(x)}</span>`).join("")}</span>`;
        return `<span class="ds-name-main">${esc(t)}</span>`;
      }

      function arenaHtml(g, i) {
        const img = ctx.safeUrl(g.image);
        const fit = g.imageFit === "contain";
        const gallery = (g.gallery ?? []).map(ctx.safeUrl).filter(Boolean);
        const link = ctx.safeUrl(g.link);
        const checklist = (g.checklist ?? [])
          .map(
            (c) => `
            <div class="ds-list">
              ${c.label ? `<h4>${esc(c.label)} · ${(c.items ?? []).filter((it) => it.done).length}/${(c.items ?? []).length}</h4>` : ""}
              <ul>${(c.items ?? []).map((it) => `<li class="${it.done ? "on" : ""}"><span>${esc(it.title)}</span></li>`).join("")}</ul>
            </div>`,
          )
          .join("");
        const extra = checklist || g.note || g.details;
        // туман у каждой арены свой: тот же клуб, но сдвинут и отражён по-разному — без повтора узора
        const fx = ((i * 37) % 100) / 100;
        return `
          <section class="ds-arena ${g.done ? "done" : "todo"} ${gallery.length ? (gallery.length > 2 ? "items-row" : "items-side") : ""}" aria-label="№${esc(g.n)}${g.done ? ", выполнено" : ", не выполнено"}" data-gallery>
            <div class="ds-arena-frame">
              <div class="ds-arena-pic ${fit ? "fig" : ""}">
                ${img && fit ? `<img class="ds-arena-blur" src="${esc(img)}" alt="" loading="lazy">` : ""}
                ${img ? `<img class="ds-arena-img" src="${esc(img)}" alt="" loading="${i < 2 ? "eager" : "lazy"}" decoding="async" data-zoom data-caption="${esc(g.title)}">` : ""}
              </div>
              <i class="ds-arena-shade"></i>
              ${
                g.done
                  ? `<span class="ds-victory" aria-hidden="true"><span class="ds-band">Victory Achieved</span></span>`
                  : `<span class="ds-arena-fog" style="--fx:${(fx * 100).toFixed(0)}%;--fl:${i % 2 ? -1 : 1}" aria-hidden="true"><i style="background-image:url('${assets}mist.webp')"></i></span>
                     <span class="ds-prompt" aria-hidden="true">Traverse the white light</span>`
              }
              <span class="ds-arena-n" aria-hidden="true">${esc(g.n)}</span>
              <div class="ds-arena-boss">
                <h3 class="ds-arena-name">${nameHtml(g.title)}</h3>
                ${link ? `<a class="ds-lore" href="${esc(link)}" target="_blank" rel="noopener">Подробнее&nbsp;↗</a>` : ""}
                ${bar(g.done ? 0 : 1, 1)}
              </div>
            </div>
            ${gallery.length ? `<div class="ds-items">${gallery.slice(0, 3).map((u) => `<img src="${esc(u)}" alt="" loading="lazy" data-zoom data-caption="${esc(g.title)}">`).join("")}</div>` : ""}
            ${
              extra
                ? `<div class="ds-arena-text">
                    ${checklist}
                    ${g.note ? `<blockquote class="ds-note">«${esc(g.note)}»</blockquote>` : ""}
                    ${g.details ? `<p class="ds-details">${esc(g.details)}</p>` : ""}
                  </div>`
                : ""
            }
          </section>`;
      }

      // ---------- фон: древняя кладка, пепел ----------
      function backdrop() {
        const bg = ctx.layer("ds-backdrop");
        bg.style.backgroundImage = `url("${assets}stone.webp")`;
        const ash = Array.from({ length: 22 }, (_, i) => {
          const r = (k) => ((Math.sin((i + 1) * 91.17 + k * 37.7) * 43758.5453) % 1 + 1) % 1;
          return `<i style="left:${(r(1) * 100).toFixed(1)}%;--d:${(r(2) * -16).toFixed(2)}s;--t:${(12 + r(3) * 10).toFixed(1)}s;--s:${(0.5 + r(4) * 1).toFixed(2)};--x:${((r(5) - 0.5) * 160).toFixed(0)}px"></i>`;
        }).join("");
        ctx.layer("ds-ash").innerHTML = motion ? ash : "";
      }

      // ---------- полоса всей игры: полная — и удар до оставшейся жизни ----------
      function headBar() {
        const el = root.querySelector(".ds-head-boss .ds-bar");
        const hp = (total - done) / total;
        if (!motion) {
          el.style.setProperty("--hp", hp.toFixed(4));
          return;
        }
        later(() => {
          el.classList.add("hit");
          el.style.setProperty("--hp", hp.toFixed(4));
        }, ctx.handoff ? 1200 : 1050);
      }

      // ---------- победа: арена впервые в кадре — полосу добивают, она гаснет, имя золотеет ----------
      function victories() {
        const won = arenas.filter((a) => a.classList.contains("done"));
        if (!motion || !("IntersectionObserver" in window)) {
          won.forEach((a) => a.classList.add("slain", "settled"));
          return;
        }
        won.forEach((a) => a.querySelector(".ds-arena-boss .ds-bar").style.setProperty("--hp", "1"));
        const io = new IntersectionObserver(
          (entries) => {
            for (const en of entries) {
              if (!en.isIntersecting) continue;
              io.unobserve(en.target);
              const a = en.target;
              const b = a.querySelector(".ds-arena-boss .ds-bar");
              b.classList.add("hit");
              b.style.setProperty("--hp", "0");
              later(() => a.classList.add("slain"), 420);
              later(() => a.classList.add("settled"), 2100);
            }
          },
          { threshold: 0.3 },
        );
        later(() => won.forEach((a) => io.observe(a)), ctx.handoff ? 1100 : 900);
        ctx.onCleanup(() => io.disconnect());
      }

      // ---------- вход: название гаснет, затем свет рассеивается вместе с проявлением шапки ----------
      function intro() {
        const handedVeil = ctx.handoff?.layers.find((l) => l.classList.contains("ds-veil"));
        const handedTitle = ctx.handoff?.layers.find((l) => l.classList.contains("ds-title"));
        if (!motion) {
          handedVeil?.remove();
          handedTitle?.remove();
          return;
        }
        let veil = handedVeil;
        let title = handedTitle;
        let hold;
        if (veil && title) {
          const since = performance.now() - (ctx.handoff.data.started ?? 0);
          hold = Math.max(HOLD.handoff, (ctx.handoff.data.seen ? 0 : HOLD.first) - since);
        } else {
          veil?.remove();
          title?.remove();
          veil = ctx.layer("ds-veil in direct");
          veil.innerHTML = veilHtml(assets);
          title = ctx.layer("ds-title in direct");
          title.innerHTML = titleHtml(game, esc);
          hold = seenBefore() ? HOLD.repeat : HOLD.direct;
        }
        const v = veil;
        const ttl = title;
        root.classList.add("ds-intro");
        let opened = false;
        const open = () => {
          if (opened) return;
          opened = true;
          ttl.classList.add("out");
          later(() => {
            v.classList.add("out");
            root.classList.remove("ds-intro");
          }, 170);
          later(() => ttl.remove(), 800);
          later(() => v.remove(), 1700);
        };
        later(open, hold);
        ctx.onCleanup(() => {
          v.remove();
          ttl.remove();
          root.classList.remove("ds-intro");
        });
        for (const type of ["pointerdown", "keydown", "wheel"]) ctx.listen(window, type, open, { passive: true, once: true });
      }
    },
  });
})();
