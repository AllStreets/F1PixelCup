// Browser check: a fresh window never shows the old 2D pixel car while the 3D
// car loads -- only a loading state -- and the 2D view is used only if 3D fails.
// Run with the Playwright MCP tool browser_run_code_unsafe,
// filename: tools/checks/loading-check.js, dev server on http://localhost:8765.
// Expected: every value in `results` true, errors [].
async (page) => {
  const errors = [];
  const results = {};
  try {
    const own = await page.context().newCDPSession(page);
    const { windowId } = await own.send("Browser.getWindowForTarget");
    await own.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "minimized" } });
  } catch (e) { /* not fatal */ }

  const open = async (routeCar) => {
    const context = await page.context().browser().newContext({ viewport: null });
    const p = await context.newPage();
    p.on("pageerror", (e) => errors.push(String(e)));
    const cdp = await context.newCDPSession(p);
    const { windowId } = await cdp.send("Browser.getWindowForTarget");
    await cdp.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "normal" } });
    await cdp.send("Browser.setWindowBounds", { windowId, bounds: { width: 1440, height: 900 } });
    await p.route("**/assets/f1_car.glb*", (route) => routeCar(route, p));
    await p.goto(`http://localhost:8765/play.html?${Date.now()}`);
    return { context, p };
  };

  // Slow car download: poll while it is on its way.
  {
    const { context, p } = await open(async (route, pg) => { await pg.waitForTimeout(2500); await route.continue(); });
    const samples = [];
    for (let i = 0; i < 12; i += 1) {
      samples.push(await p.evaluate(() => ({
        ready: Boolean(window.Render3D && window.Render3D.ready),
        fallback: state.fallbackFrames,
        loader: !document.getElementById("view-loading").hidden,
      })));
      await p.waitForTimeout(150);
    }
    await p.waitForTimeout(2500);
    const after = await p.evaluate(() => ({ ready: Render3D.ready, fallback: state.fallbackFrames, loader: !document.getElementById("view-loading").hidden }));
    const loading = samples.filter((s) => !s.ready);
    results.noPixelCarWhileLoading = loading.length > 3 && loading.every((s) => s.fallback === 0 && s.loader);
    results.loaderGoesWhenReady = after.ready && !after.loader && after.fallback === 0;
    await p.unrouteAll({ behavior: "ignoreErrors" });
    await context.close();
  }

  // The car can't load at all: the game still works, in 2D, with no loader left up.
  {
    const { context, p } = await open((route) => route.abort());
    await p.waitForTimeout(2500);
    const out = await p.evaluate(() => ({ failed: Boolean(window.Render3D && window.Render3D.failed), fallback: state.fallbackFrames, loader: !document.getElementById("view-loading").hidden }));
    results.fallsBackOnFailure = out.failed && out.fallback > 0 && !out.loader;
    await p.unrouteAll({ behavior: "ignoreErrors" });
    await context.close();
  }

  // The renderer script can't load (blocked, or it throws while starting):
  // the boot script says so at once and the game goes straight to 2D.
  {
    const context = await page.context().browser().newContext({ viewport: null });
    const p = await context.newPage();
    p.on("pageerror", (e) => errors.push(String(e)));
    await p.route("**/render3d.js*", (route) => route.abort());
    await p.goto(`http://localhost:8765/play.html?${Date.now()}`);
    await p.waitForTimeout(2000);
    const out = await p.evaluate(() => ({ failed: Boolean(window.Render3D && window.Render3D.failed), fallback: state.fallbackFrames, loader: !document.getElementById("view-loading").hidden }));
    results.rendererFailureFallsBack = out.failed && out.fallback > 0 && !out.loader;
    await p.unrouteAll({ behavior: "ignoreErrors" });
    await context.close();
  }

  // Nothing answers at all (the boot script itself never arrives): the loading
  // state holds, then after the safety timeout the game still works, in 2D.
  {
    const context = await page.context().browser().newContext({ viewport: null });
    const p = await context.newPage();
    p.on("pageerror", (e) => errors.push(String(e)));
    await p.route("**/render3d-boot.js*", (route) => route.abort());
    await p.goto(`http://localhost:8765/play.html?${Date.now()}`);
    await p.waitForTimeout(2000);
    const early = await p.evaluate(() => ({ fallback: state.fallbackFrames, loader: !document.getElementById("view-loading").hidden }));
    await p.waitForTimeout(9500);
    const late = await p.evaluate(() => ({ fallback: state.fallbackFrames, loader: !document.getElementById("view-loading").hidden }));
    results.timeoutFallsBack = early.fallback === 0 && early.loader && late.fallback > 0 && !late.loader;
    await p.unrouteAll({ behavior: "ignoreErrors" });
    await context.close();
  }

  // A race started while the car is still loading holds its lights.
  {
    const context = await page.context().browser().newContext({ viewport: null });
    const p = await context.newPage();
    p.on("pageerror", (e) => errors.push(String(e)));
    await p.route("**/assets/f1_car.glb*", async (route) => { await p.waitForTimeout(3000); await route.continue(); });
    await p.goto(`http://localhost:8765/play.html?${Date.now()}`);
    await p.waitForTimeout(300);
    await p.evaluate(() => Game.startCup());
    await p.waitForTimeout(2000);
    const held = await p.evaluate(() => ({ phase: state.phase, raceStart: state.raceStart, loader: !document.getElementById("view-loading").hidden }));
    results.lightsWaitForTheCar = held.phase === "countdown" && !held.raceStart && held.loader;
    await p.unrouteAll({ behavior: "ignoreErrors" });
    await context.close();
  }

  return { results, errors };
}
