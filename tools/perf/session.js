// A real play session, timed end to end: page load and the showroom, then
// races, frame intervals in 2 s windows with marks.
// node session.js --base https://f1-pixel-cup.vercel.app --label live [--size 1512x982] [--browser webkit] [--tier auto]
const { chromium, webkit } = require("/private/tmp/claude-501/pw/node_modules/playwright");
const fs = require("fs");
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith("--")) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : true]);
  return acc;
}, []));
const base = args.base || `http://localhost:${args.port || 8784}`;
const [W, H] = String(args.size || "1728x1117").split("x").map(Number);
const tier = args.tier || "auto";
const circuits = String(args.circuits || "monaco,lasvegas").split(",");
const RACE_S = Number(args.race || 30);
const harnessSrc = fs.readFileSync("/private/tmp/claude-501/perf/harness.js", "utf8");
const INIT = eval(harnessSrc.match(/const INIT = (`[\s\S]*?`);/)[1]);

const SLOT_DIR = "/private/tmp/claude-501/pw/slots";
async function takeSlot() {
  const path = require("path");
  fs.mkdirSync(SLOT_DIR, { recursive: true });
  for (;;) {
    for (let i = 0; i < 2; i += 1) {
      const d = path.join(SLOT_DIR, String(i));
      try { fs.mkdirSync(d); fs.writeFileSync(path.join(d, "pid"), String(process.pid)); return d; } catch (e) {
        try { process.kill(Number(fs.readFileSync(path.join(d, "pid"), "utf8")), 0); } catch (gone) { fs.rmSync(d, { recursive: true, force: true }); }
      }
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}
(async () => {
  const held = await takeSlot();
  const release = () => { try { fs.rmSync(held, { recursive: true, force: true }); } catch (e) {} };
  process.on("exit", release);
  for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { release(); process.exit(130); });
  const isWebkit = args.browser === "webkit";
  const browser = isWebkit ? await webkit.launch({ headless: false }) : await chromium.launch({
    headless: false,
    args: ["--window-size=1500,940", "--window-position=0,0", "--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist",
      "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--disable-background-timer-throttling", "--autoplay-policy=no-user-gesture-required"],
  });
  const ctx = isWebkit ? await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 }) : await browser.newContext({ viewport: null });
  await ctx.addInitScript(INIT);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  if (!isWebkit) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 2, mobile: false });
  }
  await page.goto(`${base}/play.html`);
  await page.evaluate((t) => { try { if (t === "auto") localStorage.removeItem("f1pixelcup.graphics"); else localStorage.setItem("f1pixelcup.graphics", t); } catch (e) {} }, tier);
  await page.reload();
  await page.evaluate(() => __mark("load"));
  await page.waitForFunction(() => window.Render3D && Render3D.ready && window.Game, null, { timeout: 90000 });
  await page.evaluate(() => __mark("ready"));
  await page.waitForTimeout(Number(args.showroom || 20) * 1000);
  for (const c of circuits) {
    const ok = await page.evaluate(async (c) => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      __mark(`start ${c}`);
      Game.selectGridMode("back"); Game.selectWeatherMode("dry");
      Game.selectRaceMode("single"); Game.selectSinglePick && Game.selectSinglePick("choose"); Game.chooseSingleCircuit(c); Game.startCup();
      for (let i = 0; i < 1200 && !(state.phase === "countdown" && !state.preparing) && state.phase !== "race"; i += 1) await wait(50);
      __mark(`countdown ${c}`);
      for (let i = 0; i < 1200 && state.phase !== "race"; i += 1) await wait(50);
      __mark(`race ${c}`);
      state.racers.forEach((r) => { if (r.isPlayer) { r.isPlayer = false; r.__wasPlayer = true; } });
      return state.phase;
    }, c);
    await page.waitForTimeout(RACE_S * 1000);
    await page.evaluate((c) => { __mark(`quit ${c}`); Game.backToPitLane(); }, c);
    await page.waitForTimeout(5000);
  }
  const data = await page.evaluate(() => ({ t: __perf.timeline, marks: __perf.marks, graphics: Render3D.graphics ? Render3D.graphics() : null }));
  await browser.close();
  const t0 = data.marks[0][0];
  const windows = [];
  const WIN = 2000;
  for (let a = t0; a < data.t[data.t.length - 1]; a += WIN) {
    const ts = data.t.filter((t) => t >= a && t < a + WIN);
    const iv = ts.slice(1).map((t, i) => t - ts[i]).sort((x, y) => x - y);
    if (!iv.length) continue;
    const marks = data.marks.filter(([m]) => m >= a && m < a + WIN).map(([, n]) => n);
    windows.push({ at: ((a - t0) / 1000).toFixed(0), fps: +(iv.length / (WIN / 1000)).toFixed(0), med: +iv[Math.floor(iv.length / 2)].toFixed(1), p95: +iv[Math.floor(iv.length * 0.95)].toFixed(1), max: +iv[iv.length - 1].toFixed(0), over33: iv.filter((v) => v > 33.4).length, marks: marks.join(";") });
  }
  console.log(`== session ${args.label || base} ${W}x${H} tier=${tier} graphics=${JSON.stringify(data.graphics)}`);
  windows.forEach((w) => console.log(`${w.at.padStart(4)}s fps ${String(w.fps).padStart(3)} med ${w.med} p95 ${w.p95} max ${w.max} >33:${w.over33} ${w.marks}`));
  if (errors.length) console.log("errors", errors.slice(0, 5));
  if (args.out) fs.writeFileSync(args.out, JSON.stringify({ windows, marks: data.marks }, null, 1));
})();
