// Headed, GPU-accelerated frame-time harness at devicePixelRatio 2.
// node harness.js --port 8784 --label main --scenes showroom,monaco --tiers high,medium,low
//   [--size 1728x1117] [--secs 6] [--variant none|frozenCrowd|noCrowd|noPeople] [--out file.json]
// Measures, per scene and tier: rAF intervals (median, p95, % > 20 ms, % > 33 ms),
// the game's rAF callback time (JS + render submission), GPU time where the
// timer query exists, draw calls and triangles per frame, render() calls per frame.
const { chromium, webkit } = require("/private/tmp/claude-501/pw/node_modules/playwright");
const fs = require("fs");

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith("--")) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : true]);
  return acc;
}, []));
const port = args.port || 8784;
const label = args.label || `port${port}`;
const scenes = String(args.scenes || "showroom,monaco,singapore,lasvegas,spawet,twoplayer").split(",");
const tiers = String(args.tiers || "high,medium,low").split(",");
const [W, H] = String(args.size || "1728x1117").split("x").map(Number);
const SECS = Number(args.secs || 6);
const variant = args.variant || "none";
const dpr = Number(args.dpr || 2);
const base = args.base || `http://localhost:${port}`;

const INIT = `(() => {
  window.__perf = { renderers: [], scenes: [], frames: [], gpu: [], pending: [], cur: null };
  const et = new EventTarget();
  et.addEventListener("observe", (e) => { const o = e.detail; if (o && o.isScene) __perf.scenes.push(o); else if (o && o.isWebGLRenderer) __perf.renderers.push(o); });
  window.__THREE_DEVTOOLS__ = et;
  const raw = window.requestAnimationFrame.bind(window);
  window.__rawRAF = raw;
  __perf.timeline = [];
  const rec = (t) => { __perf.timeline.push(t); raw(rec); };
  raw(rec);
  __perf.marks = [];
  window.__mark = (m) => __perf.marks.push([performance.now(), m]);
  let ext = null; let gl = null; let tried = false;
  function glOf() {
    if (gl) return gl;
    const r = __perf.renderers.find((r) => r.domElement && r.domElement.id === "game3d") || __perf.renderers[0];
    if (!r) return null;
    gl = r.getContext();
    if (!tried) { tried = true; ext = gl.getExtension("EXT_disjoint_timer_query_webgl2"); __perf.hasTimer = Boolean(ext); }
    return gl;
  }
  function poll() {
    if (!ext) return;
    const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
    while (__perf.pending.length) {
      const q = __perf.pending[0];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      const ns = gl.getQueryParameter(q, gl.QUERY_RESULT);
      gl.deleteQuery(q);
      __perf.pending.shift();
      if (!disjoint && __perf.recording) __perf.gpu.push(ns / 1e6);
    }
  }
  window.requestAnimationFrame = (cb) => raw((t) => {
    const g = glOf();
    let q = null;
    if (g && ext && __perf.recording) { poll(); q = g.createQuery(); g.beginQuery(ext.TIME_ELAPSED_EXT, q); }
    const r = __perf.renderers.find((r) => r.domElement && r.domElement.id === "game3d");
    const c0 = r ? r.info.render.calls : 0;
    const t0 = performance.now();
    try { cb(t); } finally {
      const ms = performance.now() - t0;
      if (q) { g.endQuery(ext.TIME_ELAPSED_EXT); __perf.pending.push(q); }
      if (__perf.recording && ms > 0.5) __perf.cb.push(ms);
    }
  });
})();`;

function stats(list) {
  if (!list || !list.length) return null;
  const s = [...list].sort((a, b) => a - b);
  const at = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { n: s.length, median: +at(0.5).toFixed(2), p95: +at(0.95).toFixed(2), max: +s[s.length - 1].toFixed(1), over20: +(100 * s.filter((v) => v > 20).length / s.length).toFixed(1), over33: +(100 * s.filter((v) => v > 33.4).length / s.length).toFixed(1), mean: +(s.reduce((a, b) => a + b, 0) / s.length).toFixed(2) };
}

const SCENES = {
  showroom: { kind: "garage" },
  monaco: { circuit: "monaco", weather: "dry" },
  singapore: { circuit: "singapore", weather: "dry" },
  lasvegas: { circuit: "lasvegas", weather: "dry" },
  spawet: { circuit: "spa", weather: "wet" },
  twoplayer: { circuit: "monaco", weather: "dry", players: 2 },
  monza: { circuit: "monza", weather: "dry" },
};

(async () => {
  const isWebkit = args.browser === "webkit";
  const browser = isWebkit ? await webkit.launch({ headless: false }) : await chromium.launch({
    headless: false,
    args: [`--window-size=${Math.min(W, 1500)},${Math.min(H, 940)}`, "--window-position=0,0", "--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist",
      "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--disable-background-timer-throttling", "--autoplay-policy=no-user-gesture-required"],
  });
  const ctx = isWebkit ? await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: dpr }) : await browser.newContext({ viewport: null });
  await ctx.addInitScript(INIT);
  const results = [];
  for (const name of scenes) {
    const sc = SCENES[name];
    if (!sc) { results.push({ scene: name, error: "unknown scene" }); continue; }
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
    const cdp = isWebkit ? { send: async () => ({ metrics: [] }) } : await ctx.newCDPSession(page);
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: dpr, mobile: false });
    await cdp.send("Performance.enable");
    try {
      await page.goto(`${base}/play.html?perf=${Date.now()}`);
      await page.evaluate(() => { try { localStorage.setItem("f1pixelcup.graphics", "high"); } catch (e) {} });
      await page.reload();
      await page.waitForFunction(() => window.Render3D && Render3D.ready && window.Game, null, { timeout: 60000 });
      const env = await page.evaluate(() => ({ dpr: devicePixelRatio, w: innerWidth, h: innerHeight }));
      if (sc.kind !== "garage") {
        const started = await page.evaluate(async (sc) => {
          const wait = (ms) => new Promise((r) => setTimeout(r, ms));
          if (Game.selectPlayers) Game.selectPlayers(sc.players || 1);
          else if (sc.players === 2) return "no two-player";
          Game.selectGridMode("back");
          if (Game.selectWeatherMode) Game.selectWeatherMode(sc.weather);
          if (Game.chooseSingleCircuit && Game.selectRaceMode) {
            Game.selectRaceMode("single");
            if (Game.selectSinglePick) Game.selectSinglePick("choose");
            Game.chooseSingleCircuit(sc.circuit);
            Game.startCup();
          } else {
            const cups = typeof CUPS !== "undefined" ? CUPS : (window.GameData && GameData.cups) || [];
            const idsOf = (c) => c.circuitIds || (c.tracks || []).map((t) => t.id);
            const ci = cups.findIndex((c) => idsOf(c).includes(sc.circuit));
            if (ci < 0) return `no circuit ${sc.circuit}`;
            Game.selectCup(ci);
            const ri = idsOf(cups[ci]).indexOf(sc.circuit);
            Game.startCup();
            if (ri > 0) { await wait(300); startRaceWeekend(ri); }
          }
          for (let i = 0; i < 1200; i += 1) {
            if (state.phase === "race" && !state.preparing) break;
            await wait(100);
          }
          if (state.track && state.track.id !== sc.circuit) return `wrong circuit ${state.track.id}`;
          if (state.phase !== "race") return `phase ${state.phase}`;
          // Every human car drives itself (the CPU's own driving), so the camera goes round the lap.
          state.racers.forEach((r) => { if (r.isPlayer) { r.isPlayer = false; r.__wasPlayer = true; } });
          return true;
        }, sc);
        if (started !== true) { results.push({ scene: name, error: String(started) }); await page.close(); continue; }
      }
      // Variants (reversible), interleaved round by round so machine noise hits each alike.
      await page.evaluate(() => {
        window.__applyVariant = (variantAll) => {
          const parts = String(variantAll).split("+");
          let variant = "none";
          const realDpr = window.__realDpr || (window.__realDpr = window.devicePixelRatio);
          let wantDpr = realDpr; let shadows = true;
          parts.forEach((p) => {
            const [k, val] = p.split(":");
            if (k === "dpr") wantDpr = Number(val);
            else if (k === "shadow") shadows = val !== "off";
            else variant = p;
          });
          Object.defineProperty(window, "devicePixelRatio", { get: () => wantDpr, configurable: true });
          __perf.scenes.forEach((s) => s.traverse((o) => { if (o.isDirectionalLight && (o.userData.__cast === undefined)) o.userData.__cast = o.castShadow; if (o.isDirectionalLight && o.userData.__cast) o.castShadow = shadows; }));
          __perf.scenes.forEach((s) => s.traverse((o) => {
            if (!o.isInstancedMesh || !/^people:/.test(o.name || "")) return;
            const crowd = /people:crowd_/.test(o.name);
            if (!o.userData.__orig) o.userData.__orig = o.material;
            const orig = o.userData.__orig;
            o.layers.set(0);
            o.material = orig;
            if (variant === "noCrowd" && crowd) o.layers.disableAll();
            if (variant === "noPeople") o.layers.disableAll();
            if (variant === "frozenCrowd" && crowd) {
              if (!o.userData.__frozenMat) {
                const m = orig.clone();
                m.userData = orig.userData;
                m.onBeforeCompile = (shader) => {
                  orig.onBeforeCompile(shader);
                  shader.vertexShader = shader.vertexShader.replace(/\/\/ How excited[\s\S]*?(?=int role)/, "");
                };
                m.customProgramCacheKey = () => "person-frozen";
                o.userData.__frozenMat = m;
              }
              o.material = o.userData.__frozenMat;
            }
          }));
        };
      });
      const variants = String(variant).split(",");
      const rounds = Number(args.rounds || 1);
      const out = { scene: name, env, tiers: {} };
      const acc = {};
      for (let round = 0; round < rounds; round += 1) for (const tier of tiers) for (const v of variants) {
        await page.evaluate((t) => Render3D.setGraphics && Render3D.setGraphics(t), tier);
        await page.evaluate((v) => __applyVariant(v), v);
        await page.evaluate((ms) => new Promise((r) => setTimeout(r, ms)), round === 0 ? 2000 : 800);
        const m0 = (await cdp.send("Performance.getMetrics")).metrics;
        const res = await page.evaluate(async (secs) => {
          __perf.cb = []; __perf.gpu = []; __perf.recording = true;
          const r = __perf.renderers.find((r) => r.domElement && r.domElement.id === "game3d");
          const intervals = [];
          const draws = [];
          let last = 0;
          const end = performance.now() + secs * 1000;
          let c = r ? r.info.render.calls : 0; let tr = r ? r.info.render.triangles : 0;
          await new Promise((resolve) => {
            const tick = (t) => {
              if (last) intervals.push(t - last);
              last = t;
              if (r && !r.info.autoReset) {
                draws.push([r.info.render.calls - c, r.info.render.triangles - tr]);
                c = r.info.render.calls; tr = r.info.render.triangles;
              } else if (r) draws.push([r.info.render.calls, r.info.render.triangles]);
              if (performance.now() < end) __rawRAF(tick); else resolve();
            };
            __rawRAF(tick);
          });
          __perf.recording = false;
          await new Promise((r) => setTimeout(r, 100));
          const player = state.racers && state.racers.find((x) => x.__wasPlayer);
          return { intervals, cb: __perf.cb.slice(), gpu: __perf.gpu.slice(), hasTimer: __perf.hasTimer, draws, speed: player ? Math.round(player.speed) : null, phase: state.phase, canvas: r ? [r.domElement.width, r.domElement.height, r.getPixelRatio()] : null };
        }, SECS);
        const m1 = (await cdp.send("Performance.getMetrics")).metrics;
        const metric = (n) => (m1.find((m) => m.name === n) || {}).value - (m0.find((m) => m.name === n) || {}).value;
        const key = variants.length > 1 ? `${tier}/${v}` : tier;
        const a = acc[key] || (acc[key] = { intervals: [], cb: [], gpu: [], draws: [], task: 0, frames: 0, hasTimer: res.hasTimer });
        a.intervals.push(...res.intervals); a.cb.push(...res.cb); a.gpu.push(...res.gpu); a.draws.push(...res.draws.slice(2));
        a.task += metric("TaskDuration") * 1000; a.frames += res.intervals.length;
        a.speed = res.speed; a.phase = res.phase; a.canvas = res.canvas;
      }
      const medianOf = (x) => { const s = [...x].sort((p, q) => p - q); return s.length ? s[Math.floor(s.length / 2)] : null; };
      Object.entries(acc).forEach(([key, a]) => {
        out.tiers[key] = {
          frame: stats(a.intervals), cb: stats(a.cb), gpu: a.hasTimer ? stats(a.gpu) : "no timer",
          taskMsPerFrame: +(a.task / Math.max(1, a.frames)).toFixed(2),
          calls: medianOf(a.draws.map((d) => d[0])), tris: medianOf(a.draws.map((d) => d[1])), speed: a.speed, phase: a.phase, canvas: a.canvas,
        };
      });
      if (errors.length) out.errors = errors.slice(0, 5);
      results.push(out);
    } catch (e) {
      results.push({ scene: name, error: String(e).slice(0, 300), errors });
    }
    await page.close();
  }
  await browser.close();
  const summary = { label, size: `${W}x${H}`, dpr, variant, results };
  if (args.out) fs.writeFileSync(args.out, JSON.stringify(summary, null, 1));
  // A compact table.
  console.log(`== ${label} ${W}x${H} dpr${dpr} variant=${variant}`);
  results.forEach((r) => {
    if (r.error) { console.log(`${r.scene}: ERROR ${r.error}`); return; }
    Object.entries(r.tiers).forEach(([t, v]) => {
      const f = v.frame || {};
      const g = typeof v.gpu === "object" && v.gpu ? `gpu ${v.gpu.median}/${v.gpu.p95}` : "gpu -";
      console.log(`${r.scene.padEnd(10)} ${t.padEnd(18)} frame med ${f.median} p95 ${f.p95} >20 ${f.over20}% >33 ${f.over33}% | cb ${v.cb ? `${v.cb.median}/${v.cb.p95}` : "-"} | ${g} | task ${v.taskMsPerFrame} | calls ${v.calls} tris ${v.tris} | canvas ${v.canvas} spd ${v.speed}`);
    });
  });
})();
