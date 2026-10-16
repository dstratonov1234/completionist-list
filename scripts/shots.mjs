// Headless Chrome через CDP — проверка тем и переходов глазами. Встроенный браузер-панель, когда скрыта,
// замораживает requestAnimationFrame и CSS-анимации, поэтому заставки и переходы проверяем здесь.
//
//   node scripts/shots.mjs <url> <width> <height> <outPrefix> [reduced] '<steps-json>'
//
// outPrefix — путь без расширения в scratchpad (файлы: <outPrefix>-<имя>.png / <outPrefix>-<кадр>.jpg).
// reduced — эмулировать prefers-reduced-motion. Шаги выполняются по порядку, в каждом можно несколько ключей:
//   {"wait": ms}                       пауза
//   {"eval": "js"}                     выполнить в странице, результат печатается (await работает)
//   {"hoverSel": "css"}                навести мышь на центр элемента (за краем экрана — сперва прокрутить к нему)
//   {"clickSel": "css"}                кликнуть по центру элемента (так же)
//   {"mouse": [["mouseMoved",x,y], ["mousePressed",x,y], ["mouseReleased",x,y]]}
//   {"key": "Escape", "vk": 27}        нажать клавишу
//   {"shot": "имя", "full": true}      скриншот (full — всю страницу)
//   {"traceStart": true} … {"traceStop": "имя"}   трасса производительности (style, layout, шрифты, JS) —
//                                      <outPrefix>-<имя>.json, открывается в DevTools → Performance
//   {"cdp": ["Domain.method", {...}], "save": "имя"}   любой вызов CDP (например Profiler.start/stop);
//                                      с save — ответ в <outPrefix>-<имя>.json, иначе печатается
//   {"castStart": "имя"} … {"castStop": true}   запись кадров скринкаста (20–50 к/с) — для плавности переходов:
//                                      файлы <outPrefix>-<имя><№>_<мс от начала>.jpg
// В конце печатаются ошибки консоли страницы (должно быть «errors: 0»).
// Chrome: переменная CHROME или стандартный путь установки.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const [url, width, height, out, reduced, stepsJson] = process.argv.slice(2);
if (!url || !width || !height || !out) {
  console.error("Использование: node scripts/shots.mjs <url> <width> <height> <outPrefix> [reduced] '<steps-json>'");
  process.exit(1);
}
const steps = JSON.parse(stepsJson || '[{"wait":2500,"shot":"a"}]');
const chromePath =
  process.env.CHROME ||
  [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].find((p) => existsSync(p));
if (!chromePath) {
  console.error("Не найден Chrome — укажи путь в переменной CHROME");
  process.exit(1);
}

const port = 9300 + Math.floor(Math.random() * 500);
// Профиль — всегда абсолютный путь во временной папке: с относительным Chrome уходит в обычное окно пользователя.
const prof = mkdtempSync(path.join(tmpdir(), "shots-"));
const chrome = spawn(chromePath, [
  "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run", `--remote-debugging-port=${port}`,
  `--user-data-dir=${prof}`, "--window-size=1400,1000", "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, id = 0;
const pending = new Map();
const events = [];
const cast = { name: null, frames: [] };
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const i = ++id;
    pending.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
const mouse = async (type, x, y) => {
  await send("Input.dispatchMouseEvent", { type, x, y, button: type === "mouseMoved" ? "none" : "left", clickCount: 1 });
  await sleep(16);
};

try {
  let target;
  for (let k = 0; k < 120 && !target; k++) {
    await sleep(250);
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      target = list.find((t) => t.type === "page");
    } catch {}
  }
  if (!target) throw new Error("Chrome не поднял отладочный порт");
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) {
      const p = pending.get(d.id);
      pending.delete(d.id);
      d.error ? p.rej(new Error(JSON.stringify(d.error))) : p.res(d.result);
    } else if (d.method === "Page.screencastFrame") {
      cast.frames.push({ t: d.params.metadata.timestamp, data: d.params.data });
      ws.send(JSON.stringify({ id: ++id, method: "Page.screencastFrameAck", params: { sessionId: d.params.sessionId } }));
    } else if (d.method) events.push(d);
  };
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: +width, height: +height, deviceScaleFactor: 1, mobile: Number(width) < 768 });
  if (reduced === "reduced") await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await send("Page.navigate", { url });

  for (const s of steps) {
    if (s.wait) await sleep(s.wait);
    if (s.eval) {
      const r = await send("Runtime.evaluate", { expression: s.eval, awaitPromise: true, returnByValue: true });
      console.log("eval:", JSON.stringify(r.result?.value ?? r.exceptionDetails?.text));
    }
    if (s.hoverSel || s.clickSel) {
      const sel = JSON.stringify(s.hoverSel || s.clickSel);
      const r = await send("Runtime.evaluate", {
        expression: `(() => { const el = document.querySelector(${sel}); if (!el) return null; const r = el.getBoundingClientRect();
          if (r.top < 0 || r.bottom > innerHeight) el.scrollIntoView({ block: "center" });
          const b = el.getBoundingClientRect(); return [Math.round(b.x + b.width / 2), Math.round(b.y + b.height / 2)]; })()`,
        returnByValue: true,
      });
      if (!r.result.value) throw new Error(`нет элемента ${sel}`);
      const [x, y] = r.result.value;
      await mouse("mouseMoved", x, y);
      if (s.clickSel) (await mouse("mousePressed", x, y), await mouse("mouseReleased", x, y));
    }
    if (s.mouse) for (const [type, x, y] of s.mouse) await mouse(type, x, y);
    if (s.key) await send("Input.dispatchKeyEvent", { type: "keyDown", key: s.key, code: s.key, windowsVirtualKeyCode: s.vk ?? 0 });
    if (s.traceStart) {
      events.length = 0;
      await send("Tracing.start", {
        transferMode: "ReportEvents",
        traceConfig: { includedCategories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "blink", "loading", "v8.execute", "fonts"] },
      });
    }
    if (s.traceStop) {
      await send("Tracing.end");
      for (let k = 0; k < 100 && !events.some((e) => e.method === "Tracing.tracingComplete"); k++) await sleep(100);
      const trace = events.filter((e) => e.method === "Tracing.dataCollected").flatMap((e) => e.params.value);
      writeFileSync(`${out}-${s.traceStop}.json`, JSON.stringify({ traceEvents: trace }));
      console.log("trace", s.traceStop, trace.length, "events");
    }
    if (s.cdp) {
      const r = await send(s.cdp[0], s.cdp[1] ?? {});
      if (s.save) writeFileSync(`${out}-${s.save}.json`, JSON.stringify(r));
      else console.log("cdp:", s.cdp[0], JSON.stringify(r).slice(0, 300));
    }
    if (s.castStart) {
      cast.name = s.castStart;
      cast.frames = [];
      await send("Page.startScreencast", { format: "jpeg", quality: 70, everyNthFrame: 1 });
    }
    if (s.castStop && cast.name) {
      await send("Page.stopScreencast");
      const t0 = cast.frames[0]?.t ?? 0;
      cast.frames.forEach((f, i) =>
        writeFileSync(`${out}-${cast.name}${String(i).padStart(3, "0")}_${String(Math.round((f.t - t0) * 1000)).padStart(5, "0")}.jpg`, Buffer.from(f.data, "base64")),
      );
      console.log("cast", cast.name, cast.frames.length, "frames");
      cast.name = null;
    }
    if (s.shot) {
      const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: !!s.full });
      writeFileSync(`${out}-${s.shot}.png`, Buffer.from(r.data, "base64"));
      console.log("shot", s.shot);
    }
  }
  const errs = events.filter((e) => e.method === "Runtime.exceptionThrown" || (e.method === "Runtime.consoleAPICalled" && e.params.type === "error"));
  console.log("errors:", errs.length, errs.map((e) => JSON.stringify(e.params).slice(0, 300)).join("\n"));
} catch (e) {
  console.error("FAIL", e);
} finally {
  try { ws?.close(); } catch {}
  chrome.kill();
  await sleep(300);
  try { rmSync(prof, { recursive: true, force: true }); } catch {}
  process.exit(0);
}
