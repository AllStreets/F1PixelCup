// Capture the landing page's images from the real game, HUD hidden.
// Run with the Playwright MCP tool browser_run_code_unsafe,
// filename: tools/capture-shots.js, dev server on http://localhost:8765.
// Then resize with sips (see README). Writes to assets/shots/.
// To retake only some parts, set globalThis.CAPTURE_PARTS first, for example
// ["items"]; the default takes circuits, teams and items.
async (page) => {
  // Keep the test tool's own empty tab (about:blank) out of the way.
  try {
    const own = await page.context().newCDPSession(page);
    const { windowId: ownWindow } = await own.send("Browser.getWindowForTarget");
    await own.send("Browser.setWindowBounds", { windowId: ownWindow, bounds: { windowState: "minimized" } });
  } catch (e) { /* not fatal */ }
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

  // Who drives in each shot is data (SHOT_DRIVERS in game-data.js), so the
  // site's alt text names the same driver: Leclerc first, Hamilton second,
  // then the rest of the grid.
  const SHOTS = await p.evaluate(() => SHOT_DRIVERS);

  // One shot per circuit, the player on autopilot a few seconds in.
  const circuits = await p.evaluate(() => CUPS.flatMap((cup, ci) => cup.tracks.map((t, ti) => ({ ci, ti, id: t.id }))));
  const drive = async (c, driverId) => {
    await p.evaluate(({ ci, ti, driverId }) => {
      state.selectedDriver = DRIVERS.findIndex((d) => d.id === driverId);
      state.selectedCup = ci; state.activeCupIndex = ci; buildCupEntries(); startRace(ti);
    }, { ...c, driverId });
    await p.waitForTimeout(5600);
    await p.evaluate(() => { getPlayer().isPlayer = false; });
  };
  for (const c of parts.includes("circuits") ? circuits : []) {
    await drive(c, SHOTS.circuits[c.id]);
    await p.waitForTimeout(6500);
    await hideOverlays();
    await p.waitForTimeout(150);
    await shot(`circuit-${c.id}`);
    written.push(`circuit-${c.id}`);
  }
  // The hero: Leclerc's Ferrari leading the field through the forest at Spa.
  if (parts.includes("circuits") || parts.includes("hero")) {
    await drive(circuits.find((c) => c.id === "spa"), SHOTS.hero);
    await p.waitForTimeout(6500);
    await hideOverlays();
    await p.waitForTimeout(150);
    await shot("hero");
    written.push("hero");
  }

  // One shot per power-up. Each is posed like a photo mode: a few seconds into
  // a real race the game is paused and the item is placed on the road just
  // ahead of the featured car, so the chase camera frames it. Everything in
  // the picture is the game's own renderer.
  const ITEM_SHOTS = [
    { id: "oilSlick", circuit: "monaco" },
    { id: "debris", circuit: "silverstone" },
    { id: "drs", circuit: "monza" },
    { id: "undercut", circuit: "silverstone" },
    { id: "overtakeMode", circuit: "spa" },
    { id: "stewardPenalty", circuit: "suzuka" },
    { id: "formationLap", circuit: "interlagos" },
    { id: "safetyCar", circuit: "silverstone" },
  ].map((s) => ({ ...s, driver: SHOTS.items[s.id] }));
  // The hand-built item models must be in before any item is photographed.
  await p.waitForFunction(() => window.Render3D && Render3D.inspect && Render3D.inspect().items.ready, null, { timeout: 30000 });
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
      state.paused = true;
      state.pausedAt = now;
      // Photo mode on a straight: just past a row of boxes (rows sit on the
      // straightest stretches), the player in the middle of the road, the item
      // close ahead in their lane, and the rest of the field spread up the road
      // for life in the background -- not parked on top of the item.
      // The straightest stretch after a box row (rows sit on straights, but
      // some circuits' straights are short): the least turning over 120 ahead.
      // Far enough past the row that the camera, behind the car, is clear of it.
      const turn = (d) => Math.abs(Math.atan2(Math.sin(route.toWorld((d + 120) % L, 0).heading - route.toWorld(d % L, 0).heading),
        Math.cos(route.toWorld((d + 120) % L, 0).heading - route.toWorld(d % L, 0).heading)));
      const rows = state.track.itemBoxes.filter((_, i) => i % 3 === 1).map((b) => (b.d + 60) % L);
      const base = rows.reduce((best, d) => (turn(d) < turn(best) ? d : best), rows[0]);
      const at = (gap) => (base + gap) % L;
      const put = (r, gap, lat) => {
        const w = route.toWorld(at(gap), lat);
        Object.assign(r, { x: w.x, y: w.y, heading: w.heading, angle: w.heading, trackDistance: at(gap), lat, speed: 0 });
      };
      put(pl, 0, 0);
      state.racers.filter((r) => r !== pl).forEach((r, i) => {
        r.currentItem = "none"; r.rouletteUntil = 0; r.trailingOil = false; r.spinUntil = 0;
        put(r, 260 + i * 34, i % 2 ? 14 : -14);
      });
      pl.spinUntil = 0;
      state.shots = [];
      state.hazards = [];
      state.fxFlashes = [];
      state.particles = [];
      const shot = (type, gap, lat) => state.shots.push({ type, ownerId: pl.id, d: at(gap), lat, speed: 0, latVel: 0, targetId: "", targetLat: lat, armedAt: 0, expiresAt: Infinity, age: 1 });
      const rival = () => state.racers.find((x) => x !== pl && !x.finished);
      // Close ahead and a little to one side, so the car doesn't hide it.
      if (id === "oilSlick") state.hazards.push({ type: "oilSlick", ownerId: "x", d: at(22), lat: 11, armedAt: Infinity, expiresAt: Infinity });
      if (id === "debris") shot("debris", 18, 9);
      if (id === "undercut") { shot("undercut", 22, 7); put(rival(), 80, 4); }
      if (id === "stewardPenalty") { shot("stewardPenalty", 34, 0); put(rival(), 90, 0); }
      if (id === "drs") { pl.drsUntil = now + 600000; pl.boostUntil = now + 600000; }
      if (id === "overtakeMode") pl.protectedUntil = now + 600000;
      if (id === "formationLap") pl.formationUntil = now + 600000;
      if (id === "safetyCar") state.safetyCar = { ownerId: pl.id, d: at(45), lat: 9, speed: 0, until: now + 600000, leaveUntil: 0 };
      // A hand-placed camera per item, behind the car and off to the side away
      // from the item, aimed at the item: car and item share the frame.
      // [gap, lat, height] for the camera and for the point it looks at.
      // The camera sits on the item's side of the car (so the car never hides
      // it), low and behind, aimed between the car and the item.
      const FRAME = {
        oilSlick: { from: [-30, 20, 13], at: [12, 4, 1] },
        debris: { from: [-30, 17, 10], at: [10, 3, 2] },
        undercut: { from: [-30, 16, 8], at: [12, 2, 2.5] },
        stewardPenalty: { from: [-26, -5, 7.5], at: [24, 0, 8] },
        safetyCar: { from: [-34, 19, 9], at: [24, 3, 3] },
        drs: { from: [-30, -9, 9], at: [2, 0, 3] },
        overtakeMode: { from: [-30, -9, 9], at: [2, 0, 3] },
        formationLap: { from: [-30, -9, 9], at: [2, 0, 3] },
      }[id];
      const spot = ([gap, lat, h]) => { const w = route.toWorld(at(gap), lat); return { x: w.x, y: w.y, d: at(gap), h }; };
      Render3D.setPhotoCamera({ from: spot(FRAME.from), at: spot(FRAME.at), fov: 44 });
    }, s.id);
    await hideOverlays();
    await p.waitForTimeout(600);
    await shot(`items/${s.id}`);
    written.push(`items/${s.id}`);
    await p.evaluate(() => {
      Render3D.setPhotoCamera(null);
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
