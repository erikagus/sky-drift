// Records a scripted flight of Sky Drift, frame by frame, at an exact 60 fps.
//   node tools/record/record.mjs SCENARIO OUT_DIR [--w 1920 --h 1080 --fps 60 --seconds N --gpu]
// The game runs with ?record=1 (fixed time step, seeded random). A pilot written below reads the plane's state each
// frame and decides which keys are held, so a take is the same every time. Frames go to OUT_DIR as 00000.jpg ...
// then: ffmpeg -framerate 60 -i OUT_DIR/%05d.jpg -c:v libx264 -crf 14 -pix_fmt yuv420p out.mp4
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const args = process.argv.slice(2);
const scenarioName = args[0], outDir = args[1];
const opt = (k, d) => { const i = args.indexOf("--" + k); return i === -1 ? d : args[i + 1]; };
const W = Number(opt("w", 1920)), H = Number(opt("h", 1080)), FPS = Number(opt("fps", 60));
const URL = opt("url", "http://127.0.0.1:5288/");
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
if (!scenarioName || !outDir) { console.error("usage: record.mjs SCENARIO OUT_DIR"); process.exit(1); }

// ---------------------------------------------------------------- the pilot
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
/** hold keys so the plane turns toward world point (tx, tz) and holds altitude ty */
function steerTo(s, tx, tz, ty, { bank = 0.25, climbGain = 0.04 } = {}) {
  const want = Math.atan2(-(tx - s.x), -(tz - s.z));                  // heading 0 flies toward -z, positive heading toward -x
  const err = wrap(want - s.heading);
  const held = [];
  if (err > bank * 0.4) held.push("KeyA"); else if (err < -bank * 0.4) held.push("KeyD");
  const dy = ty - s.y;
  if (dy > 2 && s.pitch < 0.25) held.push("KeyW"); else if (dy < -2 && s.pitch > -0.25) held.push("KeyS");
  return held;
}

// A scenario: setup for the page, how long, and a pilot(t, state) -> { held, press }.
const SCENARIOS = {
  // the coast: skim low over the turquoise bay, bank around the island, climb away
  coast: {
    setup: { biome: "coast", time: "noon", cam: 0, z: 0, y: 30 },
    seconds: 6,
    pilot: (t, s) => {
      const held = steerTo(s, Math.sin((s.z - 80) * 0.02) * 40, s.z - 120, t < 3.6 ? 12 : 34, {});
      if (t > 1.0 && t < 3.2) held.push("ShiftLeft");
      return { held, press: [] };
    },
  },
  // the delivery: fly to the nearest village and press E when the game offers it, until "Delivered!"
  deliver: {
    setup: { biome: "valley", time: "noon", cam: 0, z: -35, y: 44, mode: "courier" },
    seconds: 9,
    pilot: (t, s, mem) => {
      const tgt = s.target;
      const held = [];
      let press = [];
      if (tgt) {
        const dist = Math.hypot(s.x - tgt.x, s.z - tgt.z);
        held.push(...steerTo(s, tgt.x, tgt.z, tgt.topY + 16, { bank: 0.18 }));
        if (!mem.dropped && dist < 14 && s.z > tgt.z - 4) { press = ["KeyE"]; mem.dropped = t; }
      } else {
        held.push(...steerTo(s, s.river, s.z - 100, 44));
      }
      return { held, press };
    },
  },
};

// ---------------------------------------------------------------- Chrome over the DevTools protocol
const sc = SCENARIOS[scenarioName];
if (!sc) { console.error("unknown scenario", scenarioName, Object.keys(SCENARIOS)); process.exit(1); }
const seconds = Number(opt("seconds", sc.seconds));
fs.mkdirSync(outDir, { recursive: true });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "sd-rec-"));
const port = 9300 + Math.floor(Math.random() * 500);
const flags = ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, `--window-size=${W},${H}`, "--hide-scrollbars", "--mute-audio", "--no-first-run", "--disable-background-timer-throttling", "--disable-renderer-backgrounding"];
if (!args.includes("--gpu")) flags.push("--use-angle=swiftshader", "--enable-unsafe-swiftshader");
const chrome = spawn(CHROME, [...flags, "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const quit = (code) => { try { chrome.kill(); } catch {} setTimeout(() => process.exit(code), 300); };

let ws, nextId = 1; const pending = new Map();
async function connect() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const page = list.find((t) => t.type === "page");
      if (page) { ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; }); break; }
    } catch {}
    await sleep(250);
  }
  if (!ws) throw new Error("could not reach Chrome");
  ws.onmessage = (m) => { const d = JSON.parse(m.data); const p = pending.get(d.id); if (p) { pending.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); } };
}
const cdp = (method, params = {}) => new Promise((res, rej) => { const id = nextId++; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expr) => { const r = await cdp("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || "eval failed"); return r.result.value; };

try {
  await connect();
  await cdp("Page.enable");
  await cdp("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await cdp("Page.navigate", { url: `${URL}?autostart=1&record=1` });
  for (let i = 0; i < 240 && !(await ev("Boolean(window.__rec && window.__rec.ready())").catch(() => false)); i++) await sleep(500);
  await sleep(1500);                                           // the world's models finish loading
  await ev(`window.__rec.setup(${JSON.stringify(sc.setup)})`);
  const dt = 1 / FPS, total = Math.round(seconds * FPS), mem = {};
  for (let i = 0; i < 90; i++) await ev("window.__rec.step(1/60, [], [])");   // warm up: the world builds its first chunks
  await ev(`window.__rec.setup(${JSON.stringify(sc.setup)})`);
  const PRE = 2 * FPS;                                          // the plane flies for two seconds first, so the camera is settled behind it
  for (let f = -PRE; f < 0; f++) {
    const s = await ev("window.__rec.state()");
    const { held, press } = sc.pilot(f * dt, s, mem);
    await ev(`window.__rec.step(${dt}, ${JSON.stringify(held)}, ${JSON.stringify(press)})`);
  }
  const t0 = Date.now();
  for (let f = 0; f < total; f++) {
    const s = await ev("window.__rec.state()");
    const { held, press } = sc.pilot(f * dt, s, mem);
    await ev(`window.__rec.step(${dt}, ${JSON.stringify(held)}, ${JSON.stringify(press)})`);
    const shot = await cdp("Page.captureScreenshot", { format: "jpeg", quality: 94, captureBeyondViewport: false });
    fs.writeFileSync(path.join(outDir, String(f).padStart(5, "0") + ".jpg"), Buffer.from(shot.data, "base64"));
    if (press.length) console.log(`PRESS ${press} at frame ${f} (${(f * dt).toFixed(2)} s)`);
    if (s.deliveries !== (mem.last ?? 0)) { console.log(`DELIVERED at frame ${f} (${(f * dt).toFixed(2)} s)`); mem.last = s.deliveries; }
    if (f % 30 === 0) console.log(`frame ${f}/${total}  ${((Date.now() - t0) / (f + 1) / 1000).toFixed(2)} s per frame  y=${s.y.toFixed(0)} x=${s.x.toFixed(0)} z=${s.z.toFixed(0)} deliveries=${s.deliveries}`);
  }
  console.log("done", total, "frames in", ((Date.now() - t0) / 1000).toFixed(0), "s");
  quit(0);
} catch (e) { console.error("FAILED", e.message); quit(1); }
