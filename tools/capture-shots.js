// Capture the landing page's images from the real game, HUD hidden.
// Run with the Playwright MCP tool browser_run_code_unsafe,
// filename: tools/capture-shots.js, dev server on http://localhost:8765.
// Then resize with sips (see README). Writes to assets/shots/.
// To retake only some parts, set globalThis.CAPTURE_PARTS first, for example
// ["items"]; the default takes circuits, teams and items.
async (page) => {
  const parts = globalThis.CAPTURE_PARTS || ["circuits", "teams", "items"];
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
  for (const c of parts.includes("circuits") ? circuits : []) {
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

  // One shot per power-up. Each is posed like a photo mode: a few seconds into
  // a real race the game is paused and the item is placed on the road just
  // ahead of the featured car, so the chase camera frames it. Everything in
  // the picture is the game's own renderer.
  const ITEM_SHOTS = [
    { id: "oilSlick", circuit: "monaco", driver: "leclerc" },
    { id: "debris", circuit: "silverstone", driver: "leclerc" },
    { id: "drs", circuit: "monza", driver: "leclerc" },
    { id: "undercut", circuit: "silverstone", driver: "hamilton" },
    { id: "overtakeMode", circuit: "spa", driver: "leclerc" },
    { id: "stewardPenalty", circuit: "suzuka", driver: "hamilton" },
    { id: "formationLap", circuit: "interlagos", driver: "hamilton" },
    { id: "safetyCar", circuit: "silverstone", driver: "leclerc" },
  ];
  for (const s of parts.includes("items") ? ITEM_SHOTS : []) {
    const c = circuits.find((x) => x.id === s.circuit);
    await p.evaluate(({ ci, ti, driverId }) => {
      state.selectedDriver = DRIVERS.findIndex((d) => d.id === driverId);
      state.selectedCup = ci; state.activeCupIndex = ci; buildCupEntries(); startRace(ti);
    }, { ...c, driverId: s.driver });
    await p.waitForTimeout(5600);
    await p.evaluate(() => { getPlayer().isPlayer = false; });
    await p.waitForTimeout(4000);
    await p.evaluate((id) => {
      const pl = getPlayer();
      const now = performance.now();
      const L = state.track.totalLength;
      const route = getItemRoute(state.track);
      const ahead = (gap) => (pl.trackDistance + gap) % L;
      state.paused = true;
      state.pausedAt = now;
      state.racers.forEach((r) => { if (r !== pl) { r.currentItem = "none"; r.rouletteUntil = 0; r.trailingOil = false; } });
      state.shots = [];
      state.hazards = [];
      state.fxFlashes = [];
      state.particles = [];
      state.racers.forEach((r) => { r.spinUntil = 0; });
      const shot = (type, gap, lat) => state.shots.push({ type, ownerId: pl.id, d: ahead(gap), lat, speed: 0, latVel: 0, targetId: "", targetLat: lat, armedAt: 0, expiresAt: Infinity, age: 1 });
      const rivalAt = (gap, lat) => {
        const r = state.racers.find((x) => x !== pl && !x.finished);
        const w = route.toWorld(ahead(gap), lat);
        Object.assign(r, { x: w.x, y: w.y, heading: w.heading, trackDistance: ahead(gap), lat, speed: 0 });
      };
      if (id === "oilSlick") state.hazards.push({ type: "oilSlick", ownerId: "x", d: ahead(52), lat: pl.lat - 6, armedAt: Infinity, expiresAt: Infinity });
      if (id === "debris") shot("debris", 38, pl.lat + 13);
      if (id === "undercut") { shot("undercut", 46, pl.lat); rivalAt(120, pl.lat); }
      if (id === "stewardPenalty") { shot("stewardPenalty", 66, 0); rivalAt(150, 0); }
      if (id === "drs") { pl.drsUntil = now + 600000; pl.boostUntil = now + 600000; }
      if (id === "overtakeMode") pl.protectedUntil = now + 600000;
      if (id === "formationLap") pl.formationUntil = now + 600000;
      if (id === "safetyCar") state.safetyCar = { ownerId: pl.id, d: ahead(62), lat: 0, speed: 0, until: now + 600000, leaveUntil: 0 };
    }, s.id);
    await hideOverlays();
    await p.waitForTimeout(600);
    await shot(`items/${s.id}`);
    written.push(`items/${s.id}`);
    await p.evaluate(() => {
      state.paused = false;
      document.getElementById("game").style.visibility = "";
      document.getElementById("screens").style.visibility = "";
    });
  }

  // One showroom shot per team, the car framed in the right part of the window.
  await p.evaluate(() => resetToGarage());
  const teams = await p.evaluate(() => TEAMS.map((t) => ({ id: t.id, driver: DRIVERS.findIndex((d) => d.teamId === t.id) })));
  const box = await p.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  // The showroom turntable turns at one radian every 3 s; wait for the same
  // front three-quarter angle on every car so the grid is consistent.
  const SHOWROOM_ANGLE = 0.3;
  for (const t of parts.includes("teams") ? teams : []) {
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
