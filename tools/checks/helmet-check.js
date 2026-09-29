// Browser check: every driver's helmet is painted with their own design
// (docs/superpowers/specs/2026-09-29-helmets-design.md). Run with the
// Playwright MCP tool browser_run_code_unsafe, filename:
// tools/checks/helmet-check.js, dev server on http://localhost:8765.
// Expected: every value in `results` true, errors [].
// Returns { results, errors } (the shared convention of every check in tools/checks).
async (page) => {
  const errors = [];
  const results = {};
  try {
    const own = await page.context().newCDPSession(page);
    const { windowId } = await own.send("Browser.getWindowForTarget");
    await own.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "minimized" } });
  } catch (e) { /* not fatal */ }
  const context = await page.context().browser().newContext({ viewport: null });
  const p = await context.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  const cdp = await context.newCDPSession(p);
  const { windowId } = await cdp.send("Browser.getWindowForTarget");
  await cdp.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "normal" } });
  await cdp.send("Browser.setWindowBounds", { windowId, bounds: { width: 1440, height: 900 } });
  await p.goto(`http://localhost:8765/play.html?${Date.now()}`);
  await p.waitForFunction(() => window.Render3D && Render3D.ready, null, { timeout: 30000 });

  const info = await p.evaluate(() => DRIVERS.map((d) => ({ id: d.id, want: d.helmet, got: Render3D.helmetInfo(d.id) })));
  const close = (a, b) => {
    const n = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    return n(a).every((v, i) => Math.abs(v - n(b)[i]) <= 6);
  };
  const bad = [];
  info.forEach(({ id, want, got }) => {
    if (!got || !got.painted) { bad.push(`${id}: not painted`); return; }
    if (!close(got.crown, want.crown)) bad.push(`${id}: crown ${got.crown} not ${want.crown}`);
    if (!close(got.base, want.base)) bad.push(`${id}: base ${got.base} not ${want.base}`);
    if (!close(got.visor, want.visor)) bad.push(`${id}: visor ${got.visor} not ${want.visor}`);
  });
  results.everyHelmetPainted = bad.length === 0 || JSON.stringify(bad.slice(0, 8));
  results.oneTexturePerDriver = new Set(info.map((x) => x.got && x.got.textureId)).size === info.length;
  const lec = info.find((x) => x.id === "leclerc").got;
  const ham = info.find((x) => x.id === "hamilton").got;
  results.leclercAndHamiltonDiffer = Boolean(lec && ham) && lec.base !== ham.base;
  // In a race, the car on track wears it.
  results.carOnTrackWearsIt = await p.evaluate(async () => {
    Game.selectDriver(DRIVERS.findIndex((d) => d.id === "hamilton"));
    Game.startCup();
    for (let i = 0; i < 300 && state.preparing; i += 1) await new Promise((r) => requestAnimationFrame(r));
    for (let i = 0; i < 3; i += 1) await new Promise((r) => requestAnimationFrame(r));
    const worn = Render3D.inspect().helmets || {};
    const ok = worn.hamilton === Render3D.helmetInfo("hamilton").textureId && worn.leclerc === Render3D.helmetInfo("leclerc").textureId;
    Game.backToPitLane();
    return ok || JSON.stringify(worn).slice(0, 200);
  });
  await context.close();
  return { results, errors };
}
