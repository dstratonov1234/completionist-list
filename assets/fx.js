// Атмосферные частицы для страниц игр: window.GameFX.start({ type, color, density }) / GameFX.stop().
(() => {
  "use strict";

  // dir: -1 вверх, 1 вниз, 0 — плавают во все стороны. speed — px/с, size — px, drift — амплитуда покачивания.
  const PRESETS = {
    embers: { count: 55, dir: -1, speed: [25, 70], size: [1.2, 2.8], drift: 22, glow: true, twinkle: 3, alpha: [0.5, 1], shape: "dot" },
    sparks: { count: 40, dir: -1, speed: [80, 160], size: [0.8, 1.8], drift: 30, glow: true, twinkle: 6, alpha: [0.6, 1], shape: "dot" },
    ash: { count: 70, dir: 1, speed: [8, 24], size: [0.8, 2.4], drift: 16, glow: false, twinkle: 0, alpha: [0.25, 0.6], shape: "dot" },
    snow: { count: 100, dir: 1, speed: [18, 50], size: [1, 3.4], drift: 22, glow: false, twinkle: 0, alpha: [0.45, 0.95], shape: "dot" },
    rain: { count: 140, dir: 1, speed: [650, 950], size: [12, 24], drift: 0, glow: false, twinkle: 0, alpha: [0.12, 0.3], shape: "line" },
    spores: { count: 38, dir: 0, speed: [5, 16], size: [1.4, 3.2], drift: 26, glow: true, twinkle: 1.4, alpha: [0.3, 0.95], shape: "dot" },
    dust: { count: 80, dir: 0, speed: [2, 9], size: [0.6, 1.7], drift: 10, glow: false, twinkle: 0.6, alpha: [0.15, 0.45], shape: "dot" },
    stars: { count: 140, dir: 0, speed: [0, 1.5], size: [0.5, 1.9], drift: 0, glow: true, twinkle: 2.2, alpha: [0.15, 1], shape: "dot" },
    petals: { count: 26, dir: 1, speed: [20, 45], size: [5, 9], drift: 45, glow: false, twinkle: 0, alpha: [0.6, 0.95], shape: "petal" },
    leaves: { count: 18, dir: 1, speed: [25, 55], size: [7, 12], drift: 60, glow: false, twinkle: 0, alpha: [0.6, 0.95], shape: "petal" },
    bubbles: { count: 30, dir: -1, speed: [15, 40], size: [2, 7], drift: 14, glow: false, twinkle: 0, alpha: [0.25, 0.6], shape: "ring" },
  };

  let canvas, ctx, raf, particles = [], cfg, colors, sprites, last = 0, w = 0, h = 0;
  const rand = (a, b) => a + Math.random() * (b - a);

  // Пре-рендер светящейся точки: drawImage спрайта сильно дешевле shadowBlur на каждой частице.
  function makeSprite(color) {
    const s = document.createElement("canvas");
    s.width = s.height = 64;
    const c = s.getContext("2d");
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, color);
    g.addColorStop(0.18, color);
    g.addColorStop(0.45, color.length === 7 ? color + "55" : color);
    g.addColorStop(1, "transparent");
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
    return s;
  }

  function spawn(initial) {
    const p = cfg.preset;
    const angle = Math.random() * Math.PI * 2;
    return {
      x: Math.random() * w,
      y: initial ? Math.random() * h : p.dir === -1 ? h + 10 : p.dir === 1 ? -10 : Math.random() * h,
      vx: p.dir === 0 ? Math.cos(angle) : 0,
      vy: p.dir === 0 ? Math.sin(angle) : p.dir,
      speed: rand(...p.speed),
      size: rand(...p.size),
      alpha: rand(...p.alpha),
      phase: Math.random() * Math.PI * 2,
      freq: rand(0.3, 1.1),
      rot: Math.random() * Math.PI,
      spin: rand(-1.5, 1.5),
      color: Math.floor(Math.random() * colors.length),
    };
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const target = Math.round(cfg.preset.count * cfg.density * Math.min(1.6, Math.max(0.35, (w * h) / (1440 * 900))));
    while (particles.length < target) particles.push(spawn(true));
    particles.length = target;
  }

  function draw(p, t) {
    const pr = cfg.preset;
    const a = pr.twinkle ? p.alpha * (0.55 + 0.45 * Math.sin(t * pr.twinkle * p.freq + p.phase)) : p.alpha;
    ctx.globalAlpha = Math.max(0, a);
    const color = colors[p.color];
    if (pr.shape === "dot" && pr.glow) {
      const s = p.size * 7;
      ctx.drawImage(sprites[p.color], p.x - s / 2, p.y - s / 2, s, s);
    } else if (pr.shape === "dot") {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    } else if (pr.shape === "line") {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.size * 0.18, p.y - p.size);
      ctx.stroke();
    } else if (pr.shape === "ring") {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.stroke();
    } else if (pr.shape === "petal") {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.scale(1, 0.45 + 0.35 * Math.sin(t * 2 * p.freq + p.phase));
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(0, 0, p.size, p.size * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    const t = now / 1000;
    const pr = cfg.preset;
    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const sway = pr.drift ? Math.sin(t * p.freq + p.phase) * pr.drift : 0;
      if (pr.shape === "line") {
        p.x += p.speed * 0.18 * dt;
        p.y += p.speed * dt;
      } else {
        p.x += (p.vx * p.speed + sway * (pr.dir === 0 ? 0.3 : 1)) * dt;
        p.y += p.vy * p.speed * dt + (pr.dir === 0 ? Math.cos(t * p.freq + p.phase) * pr.drift * 0.3 * dt : 0);
      }
      p.rot += p.spin * dt;
      const m = 20 + p.size * 4;
      if (p.y < -m || p.y > h + m || p.x < -m || p.x > w + m) {
        if (pr.dir === 0) {
          p.x = (p.x + w + 2 * m) % (w + 2 * m) - m;
          p.y = (p.y + h + 2 * m) % (h + 2 * m) - m;
        } else {
          particles[i] = spawn(false);
          continue;
        }
      }
      draw(p, t);
    }
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", resize);
    canvas?.remove();
    canvas = ctx = null;
    particles = [];
  }

  function start(opts) {
    stop();
    const preset = PRESETS[opts?.type];
    if (!preset || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    cfg = { preset, density: Math.max(0.2, Math.min(3, Number(opts.density) || 1)) };
    colors = [].concat(opts.color || "#ffffff");
    sprites = colors.map(makeSprite);
    canvas = document.createElement("canvas");
    canvas.className = "fx-particles" + (opts.layer === "back" ? " back" : "");
    canvas.setAttribute("aria-hidden", "true");
    document.body.append(canvas);
    ctx = canvas.getContext("2d");
    resize();
    window.addEventListener("resize", resize);
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  window.GameFX = { start, stop, presets: Object.keys(PRESETS) };
})();
