// Browser check: the pit lane's showroom car never sits under the pit lane's
// own controls (the cups, the circuits, the driver, the strip, Start), at any
// window size, for every cup and the season, with one or two players. Run with
// the Playwright MCP tool browser_run_code_unsafe, filename:
// tools/checks/showroom-check.js, dev server on http://localhost:8765.
// Expected: every value in `results` true, errors []. Returns { results, errors }.
async (page) => {
  try {
    const own = await page.context().newCDPSession(page);
    const { windowId } = await own.send("Browser.getWindowForTarget");
    await own.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "minimized" } });
  } catch (e) { /* not fatal */ }
  const errors = [];
  const results = {};
  const context = await page.context().browser().newContext({ viewport: null });
  const p = await context.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  const cdp = await context.newCDPSession(p);
  const { windowId } = await cdp.send("Browser.getWindowForTarget");
  await cdp.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "normal" } });
  await cdp.send("Browser.setWindowBounds", { windowId, bounds: { width: 1600, height: 900 } });
  await p.goto(`http://localhost:8765/play.html?${Date.now()}`);
  await p.waitForFunction(() => window.Render3D && Render3D.ready, null, { timeout: 30000 });
  const frames = (n) => p.evaluate((n) => new Promise((done) => { let i = 0; const f = () => (++i >= n ? done() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

  // The car as drawn (its box projected to the page) against every control
  // of the pit lane that is showing.
  const measure = () => p.evaluate(() => {
    const g = Render3D.inspect().garage;
    const boxes = [...document.querySelectorAll("#pitlane .pitlane-top, #pitlane .choice-row, #pitlane .choice-hint, #pitlane .cup-circuits, #pitlane .new-season, #pitlane .pitlane-driver, #pitlane #driver-strip, #pitlane #start-cup")]
      .filter((el) => el.getClientRects().length && !el.classList.contains("hidden") && !el.hidden)
      .map((el) => ({ id: el.id || el.className.split(" ")[0], r: el.getBoundingClientRect() }))
      .filter((b) => b.r.width > 0 && b.r.height > 0);
    const car = g && g.car;
    const hits = car ? boxes.filter((b) => !(b.r.right <= car.left || b.r.left >= car.right || b.r.bottom <= car.top || b.r.top >= car.bottom)).map((b) => b.id) : ["no car measured"];
    // And the pit lane's own blocks never overlap one another.
    const blocks = [...document.querySelectorAll("#pitlane .pitlane-top, #pitlane .pitlane-choices, #pitlane .pitlane-driver, #pitlane #driver-strip, #pitlane #start-cup")]
      .map((el) => ({ id: el.id || el.className.split(" ")[0], r: el.getBoundingClientRect() }));
    const clash = [];
    blocks.forEach((a, i) => blocks.slice(i + 1).forEach((b) => {
      if (!(a.r.right <= b.r.left || b.r.right <= a.r.left || a.r.bottom <= b.r.top || b.r.bottom <= a.r.top)) clash.push(`${a.id}/${b.id}`);
    }));
    const onScreen = car && car.left >= 0 && car.top >= 0 && car.right <= innerWidth && car.bottom <= innerHeight;
    return { clash, w: innerWidth, h: innerHeight, car: car && { l: Math.round(car.left), t: Math.round(car.top), r: Math.round(car.right), b: Math.round(car.bottom) }, shown: Boolean(g && g.shown), hits, onScreen: Boolean(onScreen) };
  });

  const sizes = [[1600, 900], [1280, 720], [1120, 700], [1000, 700], [700, 900], [390, 844]];
  const bad = [];
  const seen = [];
  for (const [w, h] of sizes) {
    await cdp.send("Browser.setWindowBounds", { windowId, bounds: { width: w, height: h } });
    for (const [label, setup] of [
      ["opening", () => { Game.selectPlayers(1); Game.selectCup(0); }],
      ["season", () => { Game.selectCup(CUPS.findIndex((c) => c.season)); }],
      ["two players", () => { Game.selectCup(0); Game.selectPlayers(2); }],
    ]) {
      await p.evaluate(setup);
      await frames(4);
      const m = await measure();
      seen.push({ size: `${w}x${h}`, label, ...m });
      // Shown, on screen, and under nothing. (A car with no room left is not
      // drawn at all, rather than drawn under the controls: that is reported.)
      if (m.shown && (m.hits.length || !m.onScreen)) bad.push({ size: `${w}x${h}`, label, car: m.car, hits: m.hits, onScreen: m.onScreen });
      // Hidden only where a phone leaves no room at all.
      if (!m.shown && w >= 600) bad.push({ size: `${w}x${h}`, label, hidden: true });
      if (m.clash.length) bad.push({ size: `${w}x${h}`, label, clash: m.clash });
    }
  }
  await p.evaluate(() => { Game.selectPlayers(1); Game.selectCup(0); });
  results.carClearOfThePitLane = bad.length === 0 || JSON.stringify(bad).slice(0, 1200);

  await context.close();
  return { results, errors };
}
