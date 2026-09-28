// Capture the landing page's images from the real game, HUD hidden.
// Run with the Playwright MCP tool browser_run_code_unsafe,
// filename: tools/capture-shots.js, dev server on http://localhost:8765.
// Then resize with sips (see README). Writes to assets/shots/.
async (page) => {
  // Relative to the Playwright server, which runs from the repo root.
  const OUT = "assets/shots/";
  const context = await page.context().browser().newContext({ viewport: null });
  const p = await context.newPage();
  const cdp = await context.newCDPSession(p);
  const { windowId } = await cdp.send("Browser.getWindowForTarget");
  await cdp.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "normal" } });
  await cdp.send("Browser.setWindowBounds", { windowId, bounds: { width: 1600, height: 1000 } });
  await p.goto(`http://localhost:8765/play.html?${Date.now()}`);
  await p.waitForTimeout(2000);
  const hideOverlays = () => p.evaluate(() => {
    document.getElementById("game").style.visibility = "hidden";
    document.getElementById("screens").style.visibility = "hidden";
  });
  // Page screenshots (the canvas shell fills the window); clip crops in page
  // coordinates.
  const shot = (name, clip) => p.screenshot({ path: `${OUT}${name}.jpg`, type: "jpeg", quality: 88, scale: "css", ...(clip ? { clip } : {}) });
  const written = [];

  // One shot per circuit, the player on autopilot a few seconds in, driving
  // as Charles Leclerc or Lewis Hamilton so the Ferrari leads the pictures.
  const FEATURED = { monza: "leclerc", spa: "leclerc", silverstone: "hamilton", suzuka: "leclerc",
    monaco: "leclerc", singapore: "hamilton", bahrain: "leclerc", interlagos: "hamilton" };
  const circuits = await p.evaluate(() => CUPS.flatMap((cup, ci) => cup.tracks.map((t, ti) => ({ ci, ti, id: t.id }))));
  for (const c of circuits) {
    await p.evaluate(({ ci, ti, driverId }) => {
      state.selectedDriver = DRIVERS.findIndex((d) => d.id === driverId);
      state.selectedCup = ci; state.activeCupIndex = ci; buildCupEntries(); startRace(ti);
    }, { ...c, driverId: FEATURED[c.id] });
    await p.waitForTimeout(5600);
    await p.evaluate(() => { getPlayer().isPlayer = false; });
    await p.waitForTimeout(6500);
    await hideOverlays();
    await p.waitForTimeout(150);
    await shot(`circuit-${c.id}`);
    written.push(`circuit-${c.id}`);
    if (c.id === "spa") {
      await shot("hero");
      written.push("hero");
    }
  }

  // One showroom shot per team, the car framed in the right part of the window.
  await p.evaluate(() => resetToGarage());
  const teams = await p.evaluate(() => TEAMS.map((t) => ({ id: t.id, driver: DRIVERS.findIndex((d) => d.teamId === t.id) })));
  const box = await p.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  // The showroom turntable turns at one radian every 3 s; wait for the same
  // front three-quarter angle on every car so the grid is consistent.
  const SHOWROOM_ANGLE = 0.3;
  for (const t of teams) {
    await p.evaluate((index) => Game.selectDriver(index), t.driver);
    await hideOverlays();
    await p.waitForTimeout(600);
    const wait = await p.evaluate((target) => {
      const turn = Math.PI * 2;
      return ((((target - performance.now() / 3000) % turn) + turn) % turn) * 3000;
    }, SHOWROOM_ANGLE);
    await p.waitForTimeout(wait);
    await shot(`team-${t.id}`, { x: box.width * 0.42, y: box.height * 0.3, width: box.width * 0.54, height: box.height * 0.66 });
    written.push(`team-${t.id}`);
  }
  await context.close();
  return written;
}
