// Browser check: frame-time headroom at a Retina pixel ratio
// (docs/superpowers/specs/2026-10-05-performance-headroom-design.md). A race at
// Monaco in a 1728x1117 view at devicePixelRatio 2 (CDP device metrics, in a
// window of its own), every car driving itself, real requestAnimationFrame
// intervals measured. Runs in run-all (headless) and headed through
// tools/perf/check-headed.js (a real GPU, vsync and a Retina screen's worth
// of pixels: what the player sees).
// Expected: every value in `results` true, errors []. `measured` lists the
// frame intervals (median and 95th percentile, ms), the drawing buffer and the
// draw calls per tier.
// Returns { results, errors, measured } (the shared convention of every check in tools/checks).
async (page) => {
  const errors = [];
  const results = {};
  const measured = {};
  try {
    const own = await page.context().newCDPSession(page);
    const { windowId } = await own.send("Browser.getWindowForTarget");
    await own.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "minimized" } });
  } catch (e) { /* not fatal */ }
  const context = await page.context().browser().newContext({ viewport: null });
  // The renderer and scene as three announces them (its devtools hook).
  await context.addInitScript(() => {
    window.__three = { renderers: [], scenes: [] };
    const hook = new EventTarget();
    hook.addEventListener("observe", (e) => {
      const o = e.detail;
      if (o && o.isWebGLRenderer) window.__three.renderers.push(o);
      if (o && o.isScene) window.__three.scenes.push(o);
    });
    window.__THREE_DEVTOOLS__ = hook;
  });
  const p = await context.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  const cdp = await context.newCDPSession(p);
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1728, height: 1117, deviceScaleFactor: 2, mobile: false });
  const step = async (fn, arg) => { try { return await p.evaluate(fn, arg); } catch (e) { return `error: ${String(e).split("\n")[0].slice(0, 160)}`; } };
  await p.goto(`http://localhost:8765/play.html?${Date.now()}`);
  await p.evaluate(() => localStorage.setItem("f1pixelcup.graphics", "high"));
  await p.reload();
  await p.waitForFunction(() => window.Render3D && Render3D.ready && window.Game, null, { timeout: 60000 });

  const started = await step(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    Game.selectPlayers(1); Game.selectGridMode("back"); Game.selectWeatherMode("dry");
    Game.selectRaceMode("single"); Game.selectSinglePick("choose"); Game.chooseSingleCircuit("monaco"); Game.startCup();
    for (let i = 0; i < 1200 && !(state.phase === "race" && !state.preparing); i += 1) await wait(100);
    // The player's car drives itself too, so the camera goes round the lap.
    state.racers.forEach((r) => { if (r.isPlayer) r.isPlayer = false; });
    return state.phase === "race" && state.track.id === "monaco";
  });
  results.raceStarted = started === true || started;

  // A tier's frames over a few seconds, after a moment to settle.
  const measure = (tier) => step(async (tier) => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    Render3D.setGraphics(tier);
    await wait(2500);
    const r = window.__three.renderers.find((x) => x.domElement.id === "game3d");
    const frames = [];
    let shadowCalls = 0;
    let mainCalls = 0;
    const draw = r.renderBufferDirect;
    // Per frame: the draws into the shadow map (no scene) and the rest.
    r.renderBufferDirect = function (camera, scene) {
      if (scene) mainCalls += 1; else shadowCalls += 1;
      return draw.apply(this, arguments);
    };
    let last = 0;
    const end = performance.now() + 4000;
    await new Promise((resolve) => {
      const tick = (t) => {
        if (last) frames.push(t - last);
        last = t;
        if (performance.now() < end) requestAnimationFrame(tick); else resolve();
      };
      requestAnimationFrame(tick);
    });
    r.renderBufferDirect = draw;
    const sorted = [...frames].sort((a, b) => a - b);
    const at = (q) => +sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))].toFixed(1);
    return {
      median: at(0.5), p95: at(0.95), frames: frames.length,
      buffer: [r.domElement.width, r.domElement.height], css: [r.domElement.clientWidth, r.domElement.clientHeight],
      ratio: r.getPixelRatio(), graphics: Render3D.graphics(),
      shadowCalls: Math.round(shadowCalls / Math.max(1, frames.length)), mainCalls: Math.round(mainCalls / Math.max(1, frames.length)),
    };
  }, tier);
  for (const tier of ["high", "medium", "low"]) measured[tier] = await measure(tier);

  // Each tier draws at no more than its pixel ratio cap (never above the screen's).
  results.bufferWithinTierCap = await step((m) => {
    const bad = [];
    Object.entries(m).forEach(([tier, v]) => {
      if (!v || typeof v !== "object") { bad.push(`${tier}: ${v}`); return; }
      // The spec's caps (High 2, Medium 1.5, Low 1), never above the screen's ratio.
      const cap = Math.min(devicePixelRatio, { high: 2, medium: 1.5, low: 1 }[tier]);
      if (v.buffer[0] > Math.ceil(v.css[0] * cap) + 1) bad.push(`${tier}: ${v.buffer[0]}px wide for ${v.css[0]} css px at cap ${cap}`);
    });
    return bad.length === 0 || JSON.stringify(bad);
  }, measured);

  // A steady 60 fps on Medium at DPR 2: the median frame inside 60 fps, the
  // slowest twentieth no worse than a dropped frame now and then.
  const med = measured.medium;
  results.mediumHolds60 = (med && med.median <= 18 && med.p95 <= 25) || JSON.stringify(med && { median: med.median, p95: med.p95 });

  // The cars' shadows are one draw each: the shadow map's draws stay few.
  results.shadowDrawsFew = (measured.high && measured.high.shadowCalls < 260) || JSON.stringify(measured.high && measured.high.shadowCalls);
  results.carShadowOneMesh = await step(() => {
    const scene = window.__three.scenes.find((s) => s.children.some((c) => c.isDirectionalLight));
    const bad = [];
    let cars = 0;
    scene.children.forEach((root) => {
      let isCar = false;
      root.traverse((o) => { if (o.name === "car_body") isCar = true; });
      if (!isCar) return;
      cars += 1;
      const casters = [];
      root.traverse((o) => { if (o.isMesh && o.castShadow) casters.push(o); });
      if (casters.length !== 1 || casters[0].name !== "carShadow" || casters[0].layers.isEnabled(0)) bad.push(casters.map((c) => c.name).join(","));
    });
    return (cars >= 20 && bad.length === 0) || JSON.stringify({ cars, bad: bad.slice(0, 3) });
  });

  // Dynamic resolution: frames made slow (a busy main thread) lower the
  // ratio within a few seconds; fast again, it climbs back.
  results.slowFramesLowerRatio = await step(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    Render3D.setGraphics("high");
    await wait(1000);
    const before = Render3D.graphics().ratio;
    let busy = true;
    const burn = () => { const until = performance.now() + 30; while (performance.now() < until) { /* a slow frame */ } if (busy) requestAnimationFrame(burn); };
    requestAnimationFrame(burn);
    await wait(5000);
    busy = false;
    const during = Render3D.graphics().ratio;
    const r = window.__three.renderers.find((x) => x.domElement.id === "game3d");
    const drawn = r.getPixelRatio();
    return (typeof before === "number" && during < before && Math.abs(drawn - during) < 1e-6) || JSON.stringify({ before, during, drawn });
  });

  // The showroom too: silky.
  await step(() => Game.backToPitLane());
  measured.showroom = await step(async () => {
    await new Promise((r) => setTimeout(r, 2000));
    const frames = [];
    let last = 0;
    const end = performance.now() + 3000;
    await new Promise((resolve) => {
      const tick = (t) => { if (last) frames.push(t - last); last = t; if (performance.now() < end) requestAnimationFrame(tick); else resolve(); };
      requestAnimationFrame(tick);
    });
    const sorted = frames.sort((a, b) => a - b);
    return { median: +sorted[Math.floor(sorted.length / 2)].toFixed(1), p95: +sorted[Math.floor(sorted.length * 0.95)].toFixed(1) };
  });
  results.showroomHolds60 = (measured.showroom && measured.showroom.median <= 18 && measured.showroom.p95 <= 20) || JSON.stringify(measured.showroom);

  await context.close();
  return { results, errors, measured };
}
