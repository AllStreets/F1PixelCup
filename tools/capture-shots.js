// Capture the landing page's images from the real game, HUD hidden (shown in
// the race-day shots, where the HUD is the point).
// Run with the Playwright MCP tool browser_run_code_unsafe,
// filename: tools/capture-shots.js, dev server on http://localhost:8765.
// Writes to assets/shots/. Then resize with sips:
//   sips -Z 1920 -s formatOptions 78 assets/shots/hero.jpg
//   sips -Z 900 -s formatOptions 76 assets/shots/{circuit,team,trackside}-*.jpg
//   sips -Z 960 assets/shots/items/*.jpg
//   sips -Z 360 assets/shots/helmets/*.jpg
// The race-day shots (assets/shots/race-day/) get an 800 px and a 400 px copy each,
//   sips -Z 800 -s formatOptions 74 <shot>.jpg --out <shot>-800.jpg
//   sips -Z 400 -s formatOptions 72 <shot>.jpg --out <shot>-400.jpg
// then sips -Z 1600 -s formatOptions 76 <shot>.jpg. The README's (docs/readme/):
//   sips -s formatOptions 80 hero.jpg
//   sips -Z 1200 -s formatOptions 80 pitlane.jpg picker.jpg
//   sips -Z 800 -s formatOptions 78 <each other picture>.jpg
// To retake only some parts, set globalThis.CAPTURE_PARTS first, for example
// ["items"]; the default takes circuits, teams, items, helmets, trackside and
// trackside2025 (the 2025 venues' landmarks). The race-day parts are
// "replay", "podium" and "split" (assets/shots/race-day/); "choices" takes
// the pit lane's race choices and the circuit picker; "readme" takes the
// README's pictures (docs/readme/).
async (page) => {
  // Keep the test tool's own empty tab (about:blank) out of the way.
  try {
    const own = await page.context().newCDPSession(page);
    const { windowId: ownWindow } = await own.send("Browser.getWindowForTarget");
    await own.send("Browser.setWindowBounds", { windowId: ownWindow, bounds: { windowState: "minimized" } });
  } catch (e) { /* not fatal */ }
  const parts = globalThis.CAPTURE_PARTS || ["circuits", "teams", "items", "helmets", "trackside", "trackside2025"];
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

  // Every picture shows the hand-built item models (boxes included), so they
  // must be in before anything is photographed.
  await p.waitForFunction(() => window.Render3D && Render3D.inspect && Render3D.inspect().items.ready, null, { timeout: 30000 });

  // Who drives in each shot is data (SHOT_DRIVERS in game-data.js), so the
  // site's alt text names the same driver: Leclerc first, Hamilton second,
  // then the rest of the grid.
  const SHOTS = await p.evaluate(() => SHOT_DRIVERS);

  // One shot per circuit, the player on autopilot a few seconds in.
  const circuits = await p.evaluate(() => CUPS.flatMap((cup, ci) => (cup.season ? [] : cup.tracks.map((t, ti) => ({ ci, ti, id: t.id })))));
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
      const rows = state.track.itemBoxes.map((b) => (b.d + 60) % L);
      const base = rows.length ? rows.reduce((best, d) => (turn(d) < turn(best) ? d : best), rows[0]) : 0;
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
        stewardPenalty: { from: [-24, -5, 9.5], at: [24, 0, 6.5] },
        safetyCar: { from: [-34, 19, 9], at: [24, 3, 3] },
        drs: { from: [-30, -9, 9], at: [2, 0, 3] },
        overtakeMode: { from: [-30, -9, 9], at: [2, 0, 3] },
        formationLap: { from: [-30, -9, 9], at: [2, 0, 3] },
      }[id];
      const spot = ([gap, lat, h]) => { const w = route.toWorld(at(gap), lat); return { x: w.x, y: w.y, d: at(gap), h }; };
      Render3D.setPhotoCamera({ from: spot(FRAME.from), at: spot(FRAME.at), fov: 44 });
    }, s.id);
    // Whatever happens, the game gets its own camera back.
    try {
      await hideOverlays();
      await p.waitForTimeout(600);
      await shot(`items/${s.id}`);
      written.push(`items/${s.id}`);
    } finally {
      await p.evaluate(() => {
        Render3D.setPhotoCamera(null);
        state.paused = false;
        document.getElementById("game").style.visibility = "";
        document.getElementById("screens").style.visibility = "";
      });
    }
  }

  // One helmet portrait per driver, for the site's driver cards: each car on
  // the grid, paused, with a photo camera low at the front three-quarter (the
  // visor, the design and the cockpit's edge). The halo stays: it's the car.
  for (const id of parts.includes("helmets") ? await p.evaluate(() => DRIVERS.map((d) => d.id)) : []) {
    await p.evaluate(async (id) => {
      Game.backToPitLane();
      Game.selectGridMode("back");
      Game.selectDriver(DRIVERS.findIndex((d) => d.id === id));
      Game.startCup();
      for (let i = 0; i < 300 && state.preparing; i += 1) await new Promise((r) => requestAnimationFrame(r));
      state.paused = true;
      state.pausedAt = performance.now();
      const pl = getPlayer();
      const c = Math.cos(pl.heading ?? pl.angle);
      const s = Math.sin(pl.heading ?? pl.angle);
      const spot = ([fwd, side, h]) => ({ x: pl.x + c * fwd - s * side, y: pl.y + s * fwd + c * side, d: pl.trackDistance, h });
      Render3D.setPhotoCamera({ from: spot([7.5, -5.5, 6.2]), at: spot([-0.6, 0, 4.6]), fov: 30 });
    }, id);
    try {
      await hideOverlays();
      await p.waitForTimeout(500);
      const view = await p.evaluate(() => ({ w: innerWidth, h: innerHeight }));
      const side = Math.round(Math.min(view.w, view.h) * 0.42);
      await shot(`helmets/${id}`, { x: Math.round(view.w / 2 - side / 2), y: Math.round(view.h / 2 - side / 2), width: side, height: side });
      written.push(`helmets/${id}`);
    } finally {
      await p.evaluate(() => {
        Render3D.setPhotoCamera(null);
        state.paused = false;
        document.getElementById("game").style.visibility = "";
        document.getElementById("screens").style.visibility = "";
      });
    }
  }

  // The trackside world (Stage J): a photo camera on each landmark, the
  // yachts, a stand's crowd on its feet and the pit crews, a few seconds into
  // a real race (the player parked by what is pictured, the field running).
  const TRACKSIDE = [
    { name: "trackside-casino", circuit: "monaco", aim: "casino", back: 40, h: 12, ah: 40, fov: 60, side: 0 },
    { name: "trackside-yachts", circuit: "monaco", aim: "yachts" },
    // Down the main straight to the Flyer, the pits and Marina Bay Sands beside it.
    { name: "trackside-singapore", circuit: "singapore", aim: "road", from: -500, to: 100, h: 14, fov: 62 },
    { name: "trackside-crowd", circuit: "monaco", aim: "stand" },
    { name: "trackside-crews", circuit: "monaco", aim: "crew" },
    { name: "trackside-wing", circuit: "silverstone", aim: "silverstoneWing", back: 60, h: 30, ah: 30, fov: 60, side: 40 },
    // The 2025 venues (docs/superpowers/specs/2026-10-01-landmarks-2025-design.md).
    { part: "trackside2025", name: "trackside-sphere", circuit: "lasvegas", aim: "vegasSphere", back: 20, h: 18, ah: 150, fov: 70, side: 0 },
    { part: "trackside2025", name: "trackside-flames", circuit: "baku", aim: "flameTowers", back: 30, h: 15, ah: 200, fov: 55, side: 0 },
    { part: "trackside2025", name: "trackside-biosphere", circuit: "montreal", aim: "biosphere", back: 30, h: 15, ah: 70, fov: 55, side: 0 },
    { part: "trackside2025", name: "trackside-austin", circuit: "cota", aim: "cotaTower", back: 30, h: 15, ah: 90, fov: 60, side: 0 },
    { part: "trackside2025", name: "trackside-forosol", circuit: "mexico", aim: "foroSol", back: 25, h: 30, ah: 40, fov: 70, side: 0 },
    { part: "trackside2025", name: "trackside-miami", circuit: "miami", aim: "miamiStadium", back: 20, h: 18, ah: 45, fov: 70, side: 0 },
  ];
  for (const t of TRACKSIDE.filter((x) => parts.includes(x.part || "trackside"))) {
    const c = circuits.find((x) => x.id === t.circuit);
    await p.evaluate(() => Render3D.loadAllModels && Render3D.loadAllModels());
    await drive(c, SHOTS.circuits[c.id]);
    await p.waitForTimeout(1500);
    await hideOverlays();
    await p.evaluate((t) => {
      const ts = Render3D.inspect().trackside;
      const nearestRoad = (x, z) => state.track.points.reduce((a, b) => (Math.hypot(b.x - x, b.y - z) < Math.hypot(a.x - x, a.y - z) ? b : a));
      const park = (x, z) => { const pl = getPlayer(); const r = nearestRoad(x, z); pl.x = r.x; pl.y = r.y; pl.speed = 0; };
      let from;
      let at;
      let fov = 55;
      if (t.aim === "road") {
        const route = getItemRoute(state.track);
        const L = state.track.totalLength;
        const a = route.toWorld(((t.from % L) + L) % L, 0);
        const b = route.toWorld(((t.to % L) + L) % L, 0);
        from = { x: a.x, y: a.y, h: t.h };
        at = { x: b.x, y: b.y, h: 10 };
        fov = t.fov;
      } else if (t.aim === "yachts") {
        // Over the water, the moored yachts sterns to the quay.
        const moored = ts.yachts.yachts.filter((v) => v.moored);
        const y = moored[Math.min(12, moored.length - 1)];
        const f = { x: Math.cos(y.heading), z: Math.sin(y.heading) };
        from = { x: y.x + f.x * 260 + f.z * 156, y: y.z + f.z * 260 - f.x * 156, h: 40 };
        at = { x: y.x, y: y.z, h: 10 };
        fov = 50;
      } else if (t.aim === "stand") {
        // In front of the stand by the road, the player beside it: on their feet.
        const gap = (st) => Math.hypot(nearestRoad(st.x, st.z).x - st.x, nearestRoad(st.x, st.z).y - st.z);
        const st = ts.standSpots.reduce((a, b) => (gap(b) < gap(a) ? b : a));
        const f = { x: -Math.sin(st.yaw), z: -Math.cos(st.yaw) };
        const sd = { x: Math.cos(st.yaw), z: -Math.sin(st.yaw) };
        park(st.x, st.z);
        from = { x: st.x + f.x * 58 + sd.x * 75, y: st.z + f.z * 58 + sd.z * 75, h: 10 };
        at = { x: st.x, y: st.z, h: 28 };
        fov = 68;
      } else if (t.aim === "crew") {
        const crew = Render3D.auditPeople(state.track).samples.crew[0];
        const r = nearestRoad(crew.x, crew.z);
        const dx = r.x - crew.x;
        const dz = r.y - crew.z;
        const l = Math.hypot(dx, dz) || 1;
        from = { x: crew.x + (dx / l) * 40 + 25, y: crew.z + (dz / l) * 40, h: 8 };
        at = { x: crew.x, y: crew.z, h: 7 };
        fov = 40;
      } else {
        const L = ts.landmarks.find((x) => x.name === t.aim);
        const dx = L.x - L.trackAt.x;
        const dz = L.z - L.trackAt.z;
        const d = Math.hypot(dx, dz) || 1;
        const ux = dx / d;
        const uz = dz / d;
        from = { x: L.trackAt.x - ux * t.back - uz * t.side, y: L.trackAt.z - uz * t.back + ux * t.side, h: t.h };
        at = { x: L.x, y: L.z, h: t.ah };
        fov = t.fov;
      }
      // The player parked (no speed blur), out of the picture unless it belongs there.
      if (t.aim !== "stand") park(at.x, at.y);
      Render3D.setPhotoCamera({ from: { ...from, d: 0 }, at: { ...at, d: 0 }, fov });
    }, t);
    await p.waitForTimeout(1200);
    await shot(t.name);
    written.push(t.name);
    await p.evaluate(() => Render3D.setPhotoCamera(null));
  }

  // One showroom shot per team, the car framed in the right part of the window.
  await p.evaluate(() => resetToGarage());
  const teams = await p.evaluate(() => TEAMS.map((t) => ({ id: t.id, driver: DRIVERS.findIndex((d) => d.teamId === t.id) })));
  const box = await p.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  // The showroom turntable turns at one radian every 3 s; wait for the same
  // front three-quarter angle on every car so the grid is consistent.
  const SHOWROOM_ANGLE = 0.3;
  // The car stands in the picture's frame (the pit lane would fit it beside
  // its controls, which are hidden for the photographs).
  await p.evaluate((b) => Screens.setShowroomArea({ left: b.width * 0.42, top: b.height * 0.3, right: b.width * 0.96, bottom: b.height * 0.96 }), box);
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

  // ---- Race day: replays, the podium, two players (the site's #race-day). ----
  // Full 1600x900 pictures with the game's own HUD where it is the point (the
  // replay's broadcast graphics, both split views), written to
  // assets/shots/race-day/; sips makes the web sizes (see the header).
  const RD = `${OUT}race-day/`;
  const DAY = SHOTS.raceDay;
  const sizeTo = async (width, height) => {
    await cdp.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "normal" } });
    await cdp.send("Browser.setWindowBounds", { windowId, bounds: { width, height } });
    await p.waitForTimeout(600);
  };
  const dayShot = async (name, dir = RD) => {
    await p.screenshot({ path: `${dir}${name}.jpg`, type: "jpeg", quality: 92, scale: "css" });
    written.push(`${dir === RD ? "race-day" : "readme"}/${name}`);
  };
  const freshGame = async () => {
    await p.goto(`http://localhost:8765/play.html?${Date.now()}`);
    await p.waitForFunction(() => window.Render3D && Render3D.ready, null, { timeout: 60000 });
  };
  // The cup and the race index of a circuit, wherever the cups put it.
  const spotOf = (circuit) => p.evaluate((id) => {
    const ci = CUPS.findIndex((c) => c.tracks.some((t) => t.id === id));
    return { ci, ti: CUPS[ci].tracks.findIndex((t) => t.id === id) };
  }, circuit);

  // Replays: a real race at Monaco, run on autopilot (Leclerc fourth on the
  // grid, Hamilton fifth, among the front-runners so the cameras find a
  // pack), then opened from the results screen's own button. Each camera is
  // shot playing at 1x, a moment after a seek.
  // Each race-day part takes the folder it writes to and which of its
  // pictures to take (the README takes some of them too).
  const shootReplays = async (dir, names) => {
    await sizeTo(1600, 900);
    await freshGame();
    await p.evaluate(async ({ DAY, ci, ti }) => {
      Game.selectDriver(DRIVERS.findIndex((d) => d.id === DAY.replay));
      Game.selectPlayers(1); Game.selectCup(ci); Game.selectGridMode("back"); Game.selectWeatherMode("dry"); Game.startCup();
      const front = ["norris", "piastri", "verstappen", DAY.replay, DAY.onboard, "russell"];
      const rest = state.cupEntries.map((e) => e.driver.id).filter((id) => !front.includes(id));
      state.raceIndex = ti;
      state.qualifying = { raceIndex: ti, order: [...front, ...rest] };
      startRace(ti);
      state.qualifying = null;
      for (let i = 0; i < 900 && state.preparing; i += 1) await new Promise((r) => requestAnimationFrame(r));
      const pl = getPlayer();
      pl.isPlayer = false;
      state.phase = "race";
      let now = performance.now();
      state.raceStart = now; state.lastTick = now; state.simOffset = 0;
      state.racers.forEach((r) => { r.lapStartAt = now; });
      for (let steps = 0; state.phase === "race" && steps < 60 * 900; steps += 1) { now += 1000 / 60; updateRace(1 / 60, now); }
      pl.isPlayer = true;
      if (state.phase === "race") throw new Error("capture-shots: the replay's race did not finish in 15 simulated minutes");
    }, { DAY, ...(await spotOf("monaco")) });
    await p.click("#results-replay");
    await p.waitForTimeout(1500);
    // [name, camera, whose car (null: the director's choice), race time in ms]
    const REPLAY_SHOTS = [
      ["replay-trackside", "trackside", DAY.replay, 4000],
      ["replay-onboard", "onboard", DAY.onboard, 5000],
      ["replay-helicopter", "helicopter", DAY.replay, 3000],
      ["replay-director", "director", null, 8000],
    ];
    for (const [name, camera, driverId, t] of REPLAY_SHOTS.filter(([n]) => !names || names.includes(n))) {
      await p.evaluate(({ camera, driverId, t }) => {
        Game.replay.setCamera(camera);
        if (driverId) state.replay.focusId = state.racers.find((r) => r.driver.id === driverId).id;
        Game.replay.seek(t - 1200);
        if (!state.replay.playing) Game.replay.togglePlay();
      }, { camera, driverId, t });
      await p.waitForTimeout(1200);
      await dayShot(name, dir);
    }
  };
  if (parts.includes("replay")) await shootReplays(RD);

  // The podium: a cup whose four races finish in a set order, scored by the
  // game's own finalizeRace (DAY.podium first, second and third), then the
  // ceremony. The page's own title and button are hidden; the name plates
  // (HTML, placed under each driver) stay. Shot at the timeline's beats (ceremony.js).
  const shootPodium = async (dir, names) => {
    await sizeTo(1600, 900);
    await freshGame();
    await p.evaluate((top) => {
      Game.selectDriver(DRIVERS.findIndex((d) => d.id === top[0]));
      Game.selectPlayers(1);
      Game.selectCup(0);
      Game.selectGridMode("back");
      Game.selectWeatherMode("dry");
      Game.startCup();
      for (let race = 0; race < getActiveCup().tracks.length; race += 1) {
        const rank = (r) => { const i = top.indexOf(r.driver.id); return i < 0 ? 99 : i; };
        [...state.racers].sort((a, b) => rank(a) - rank(b) || a.driver.name.localeCompare(b.driver.name)).forEach((r, i) => {
          r.finished = true;
          r.finishPosition = i + 1;
          r.finishTime = 300000 + i * 2100;
          r.bestLapTime = 60000 + i * 300;
        });
        state.phase = "race";
        state.resultsQueued = true;
        finalizeRace();
        nextRace();
      }
    }, DAY.podium);
    await p.waitForFunction(() => Render3D.podium && Render3D.podium.inspect().drawing, null, { timeout: 60000 });
    await p.addStyleTag({ content: "#podium-screen .podium-head, #podium-screen .podium-foot { visibility: hidden !important; }" });
    const BEATS = [["podium-arms", 4.8], ["podium-trophy", 7.2], ["podium-spray", 13], ["podium-orbit", 27]];
    for (const [name, t] of BEATS.filter(([n]) => !names || names.includes(n))) {
      await p.waitForFunction((tt) => Render3D.podium.inspect().t >= tt, t, { timeout: 60000 });
      await dayShot(name, dir);
    }
  };
  if (parts.includes("podium")) await shootPodium(RD);

  // Two players: P1 and P2 (DAY.players) from the back on autopilot, both
  // views and both HUDs; at Spa in the dry, at Monaco in the rain, and on a
  // window over 2.1 times as wide as it is tall (1600x700), where the views sit
  // side by side. Plus the pit lane's Players choice.
  const shootSplit = async (dir, names, pitLane) => {
    const SPLIT_SHOTS = [
      ["split-spa", "spa", "dry", 1600, 900, 10],
      ["split-monaco-wet", "monaco", "wet", 1600, 900, 8],
      ["split-side-by-side", "spa", "dry", 1600, 700, 14],
    ];
    for (const [name, circuit, weather, w, h, seconds] of SPLIT_SHOTS.filter(([n]) => !names || names.includes(n))) {
      await sizeTo(w, h);
      await freshGame();
      await p.evaluate(({ DAY, ci, ti, weather }) => {
        Game.selectDriver(DRIVERS.findIndex((d) => d.id === DAY.players[0]));
        Game.selectPlayers(2);
        state.secondDriver = DRIVERS.findIndex((d) => d.id === DAY.players[1]);
        Game.selectCup(ci); Game.selectGridMode("back"); Game.selectWeatherMode(weather);
        renderGarage();
        Game.startCup();
        if (ti > 0) { state.raceIndex = ti; startRace(ti); }
      }, { DAY, weather, ...(await spotOf(circuit)) });
      await p.waitForFunction(() => state.phase === "race", null, { timeout: 90000 });
      // Starting a cup goes full screen; the window goes back to its size.
      await p.evaluate(() => document.fullscreenElement && document.exitFullscreen()).catch(() => {});
      await sizeTo(w, h);
      await p.evaluate(() => humans().forEach((racer) => { racer.isPlayer = false; }));
      await p.waitForTimeout(seconds * 1000);
      await dayShot(name, dir);
    }
    if (!pitLane) return;
    // The pit lane, two players picked: the whole screen, at 1600x900.
    await sizeTo(1600, 900);
    await freshGame();
    await p.evaluate((DAY) => {
      Game.selectDriver(DRIVERS.findIndex((d) => d.id === DAY.players[0]));
      Game.selectPlayers(2);
      state.secondDriver = DRIVERS.findIndex((d) => d.id === DAY.players[1]);
      renderGarage();
    }, DAY);
    await p.waitForTimeout(1500);
    await dayShot("split-pitlane", dir);
  };
  if (parts.includes("split")) await shootSplit(RD, null, true);

  // ---- Choosing races (the site's "Your way" card): the pit lane with a
  // random cup drawn, and the circuit picker with a custom cup being chosen, both
  // at 1600x900 as the game draws them. sips makes the web size (see the header).
  if (parts.includes("choices")) {
    await sizeTo(1600, 900);
    await freshGame();
    await p.evaluate(() => {
      Game.selectDriver(DRIVERS.findIndex((d) => d.id === SHOT_DRIVERS.hero));
      Game.selectPlayers(1);
      Game.selectRaceMode("random");
    });
    await p.waitForTimeout(1500);
    await p.screenshot({ path: `${OUT}choices-pitlane.jpg`, type: "jpeg", quality: 90, scale: "css" });
    written.push("choices-pitlane");
    await p.evaluate(() => {
      Game.selectRaceMode("custom");
      Game.clearCustomCircuits();
      // Three of four chosen: the running order, and a slot still to fill.
      ["monaco", "spa", "suzuka"].forEach(Game.toggleCustomCircuit);
      Screens.showCircuitPicker();
      document.activeElement.blur();
    });
    await p.waitForTimeout(800);
    await p.screenshot({ path: `${OUT}choices-picker.jpg`, type: "jpeg", quality: 90, scale: "css" });
    written.push("choices-picker");
    await p.evaluate(() => Screens.closeOverlay());
  }
  // ---- The README (docs/readme/): a fresh set of pictures for the GitHub
  // page, every one a 1600x900 window as the game draws it. Posed shots work
  // like the power-up photos: a few seconds into a real race the game is
  // paused, named cars are placed along the road (lap distance and offset
  // from the centreline, so they sit on it as racing cars do) and a hand-placed
  // camera frames them. Chase shots are the game's own camera on autopilot.
  // The race-day pictures (replays, the podium, two players) are the parts
  // above, written here too. sips makes the GitHub sizes (see the header).
  if (parts.includes("readme")) {
    const RM = "docs/readme/";
    // Set globalThis.README_ONLY to a list of names to retake only those:
    // hero, harbour, cars, night, sphere, rain, replay (both replay
    // pictures), podium (both), split, pitlane (with the picker).
    const want = (name) => !globalThis.README_ONLY || globalThis.README_ONLY.includes(name);
    // Who and where: Leclerc leads the hero with Hamilton beside him, and
    // the rest of the gallery spreads across the grid. The README's captions
    // name these drivers by hand: change both together.
    const POSED = [
      { name: "hero", circuit: "monaco", anchor: "yachts", shift: 100,
        cars: [["leclerc", 0, -6], ["hamilton", -16, 9], ["norris", -44, -3], ["piastri", -60, 7], ["verstappen", -86, 0], ["russell", -104, -7]],
        cam: { from: [38, -30, 13], at: [-25, 8, 8], fov: 42 } },
      { name: "harbour", circuit: "monaco", anchor: "yachts", shift: 100,
        cars: [["verstappen", 0, -5], ["alonso", -26, 7], ["gasly", -52, -3], ["albon", -78, 5]],
        cam: { from: [-120, -70, 70], at: [40, 40, 0], fov: 55 } },
      { name: "cars", circuit: "suzuka", anchor: "start", shift: 260,
        cars: [["norris", 0, -6], ["piastri", -16, 9], ["verstappen", -44, -3], ["antonelli", -60, 7], ["russell", -86, 0]],
        cam: { from: [40, -30, 14], at: [-20, 0, 2], fov: 40 } },
      { name: "night", circuit: "singapore", anchor: "lm:marinaBaySands",
        cars: [["russell", 0, -5], ["alonso", -30, 6], ["gasly", -55, -4]],
        cam: { from: [-70, 0, 14], at: [60, 0, 22], fov: 55 } },
      { name: "sphere", circuit: "lasvegas", anchor: "lm:vegasSphere", shift: 120,
        cars: [["piastri", 0, -5], ["antonelli", -30, 6], ["sainz", -55, -4]],
        cam: { from: [60, -25, 10], at: [-60, 40, 45], fov: 65 } },
    ];
    const CHASE = [
      { name: "rain", circuit: "spa", weather: "wet", driver: "hamilton", seconds: 14 },
    ];
    const startAt = async (circuit, driverId, weather) => {
      await freshGame();
      await p.evaluate(({ driverId, weather, ci, ti }) => {
        Game.selectDriver(DRIVERS.findIndex((d) => d.id === driverId));
        Game.selectPlayers(1); Game.selectCup(ci); Game.selectGridMode("back"); Game.selectWeatherMode(weather || "dry");
        Game.startCup();
        if (ti > 0) { state.raceIndex = ti; startRace(ti); }
      }, { driverId, weather, ...(await spotOf(circuit)) });
      await p.waitForFunction(() => state.phase === "race", null, { timeout: 90000 });
      // Starting a cup goes full screen; the window goes back to its size.
      await p.evaluate(() => document.fullscreenElement && document.exitFullscreen()).catch(() => {});
      await sizeTo(1600, 900);
      await p.evaluate(() => { getPlayer().isPlayer = false; });
    };
    const rmShot = async (name) => {
      await p.screenshot({ path: `${RM}${name}.jpg`, type: "jpeg", quality: 92, scale: "css" });
      written.push(`readme/${name}`);
    };
    for (const s of POSED.filter((x) => want(x.name))) {
      await sizeTo(1600, 900);
      await startAt(s.circuit, s.cars[0][0], s.weather);
      await p.waitForTimeout(5000);
      await hideOverlays();
      await p.evaluate((s) => {
        state.paused = true;
        state.pausedAt = performance.now();
        const L = state.track.totalLength;
        const route = getItemRoute(state.track);
        const ts = Render3D.inspect().trackside;
        const nearestD = (x, z) => {
          let best = 0;
          for (let d = 0, bd = Infinity; d < L; d += 4) {
            const q = route.toWorld(d, 0);
            const e = Math.hypot(q.x - x, q.y - z);
            if (e < bd) { bd = e; best = d; }
          }
          return best;
        };
        let d0 = 0;
        if (s.anchor === "yachts") {
          const moored = ts.yachts.yachts.filter((v) => v.moored);
          const y = moored[Math.min(12, moored.length - 1)];
          d0 = nearestD(y.x, y.z);
        } else if (s.anchor.startsWith("lm:")) {
          const lm = ts.landmarks.find((x) => x.name === s.anchor.slice(3));
          d0 = nearestD(lm.x, lm.z);
        }
        d0 += s.shift || 0;
        const at = (gap) => (((d0 + gap) % L) + L) % L;
        const put = (r, gap, lat) => {
          const q = route.toWorld(at(gap), lat);
          Object.assign(r, { x: q.x, y: q.y, heading: q.heading, angle: q.heading, trackDistance: at(gap), lat, speed: 0, spinUntil: 0 });
        };
        const named = s.cars.map((c) => c[0]);
        s.cars.forEach(([id, gap, lat]) => put(state.racers.find((r) => r.driver.id === id), gap, lat));
        // The rest of the field queues behind, out of the way of the picture.
        state.racers.filter((r) => !named.includes(r.driver.id)).forEach((r, i) => put(r, -130 - i * 26, i % 2 ? 12 : -12));
        state.shots = []; state.hazards = []; state.particles = []; state.fxFlashes = [];
        const spot = ([gap, lat, h]) => { const q = route.toWorld(at(gap), lat); return { x: q.x, y: q.y, d: at(gap), h }; };
        Render3D.setPhotoCamera({ from: spot(s.cam.from), at: spot(s.cam.at), fov: s.cam.fov });
      }, s);
      try {
        await p.waitForTimeout(800);
        await rmShot(s.name);
      } finally {
        await p.evaluate(() => { Render3D.setPhotoCamera(null); state.paused = false; });
      }
    }
    for (const s of CHASE.filter((x) => want(x.name))) {
      await sizeTo(1600, 900);
      await startAt(s.circuit, s.driver, s.weather);
      await p.waitForTimeout(s.seconds * 1000);
      await hideOverlays();
      await p.waitForTimeout(150);
      await rmShot(s.name);
    }
    if (want("replay")) await shootReplays(RM, ["replay-onboard", "replay-helicopter"]);
    if (want("podium")) await shootPodium(RM, ["podium-trophy", "podium-spray"]);
    if (want("split")) await shootSplit(RM, ["split-spa"], false);
    // The pit lane with the hero's driver picked, and the circuit picker
    // choosing a custom cup.
    if (want("pitlane")) {
      // A fresh browser store first: the pit lane shows the career, which
      // the capture's own races would otherwise have scored.
      await sizeTo(1600, 900);
      await p.evaluate(() => localStorage.clear());
      await freshGame();
      await p.evaluate(() => {
        Game.selectDriver(DRIVERS.findIndex((d) => d.id === SHOT_DRIVERS.hero));
        Game.selectPlayers(1);
        Game.selectRaceMode("cup");
        Game.selectCup(0);
      });
      await p.waitForTimeout(1500);
      await rmShot("pitlane");
      await p.evaluate(() => {
        Game.selectRaceMode("custom");
        Game.clearCustomCircuits();
        ["monaco", "spa", "suzuka"].forEach(Game.toggleCustomCircuit);
        Screens.showCircuitPicker();
        document.activeElement.blur();
      });
      await p.waitForTimeout(800);
      await rmShot("picker");
      await p.evaluate(() => Screens.closeOverlay());
    }
  }
  await p.evaluate(() => Screens.setShowroomArea(null));
  await context.close();
  return written;
}
