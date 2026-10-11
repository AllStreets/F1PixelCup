// Browser check: the racing itself (docs/superpowers/specs/2026-10-05-balance-design.md).
// The tow, fair contact, cars slipping past one that is spinning, and the
// barriers: an unsteered car runs off and glances off the wall it can see,
// never through it and never stuck, while a steered one stays on the road.
// Run with the Playwright MCP tool browser_run_code_unsafe,
// filename: tools/checks/racing-check.js, dev server on http://localhost:8765.
// Expected: every value in `results` true, errors [].
// Returns { results, errors } (the shared convention of every check in tools/checks).
async (page) => {
  const errors = [];
  const results = {};
  try {
    const own = await page.context().newCDPSession(page);
    const { windowId: ownWindow } = await own.send("Browser.getWindowForTarget");
    await own.send("Browser.setWindowBounds", { windowId: ownWindow, bounds: { windowState: "minimized" } });
  } catch (e) { /* not fatal */ }
  const context = await page.context().browser().newContext({ viewport: null });
  const p = await context.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  await p.goto(`http://localhost:8765/play.html?${Date.now()}`);
  await p.waitForTimeout(1500);
  await p.addScriptTag({ url: `http://localhost:8765/tools/balance/comeback.js?${Date.now()}` });

  // A race at a circuit, on Pro, the clock running; `alone` takes every car
  // but the player and `keep` others off the road.
  const setup = (trackId) => p.evaluate(async (id) => {
    const ci = CUPS.findIndex((cup) => !cup.season && cup.tracks.some((t) => t.id === id));
    state.selectedCup = ci; state.activeCupIndex = ci; state.activeCup = CUPS[ci];
    state.cupDifficulty = 1; state.difficulty = 1;
    buildCupEntries(); startRace(CUPS[ci].tracks.findIndex((t) => t.id === id));
    for (let i = 0; i < 100 && state.preparing; i += 1) await new Promise((r) => requestAnimationFrame(r));
    state.phase = "race";
    state.weather = "dry";
    const now = performance.now();
    state.raceStart = now - 40000;
    state.lastTick = now;
    state.racers.forEach((r) => { r.lapStartAt = now; });
  }, trackId);
  const run = (fn, arg) => p.evaluate(fn, arg);

  // The tow: on Monza's main straight a car close behind another reaches a
  // higher speed than the same car alone. (It used to be held back instead.)
  await setup("monza");
  results.towPullsCarAlong = await run(() => {
    const route = getItemRoute(state.track);
    const pl = getPlayer();
    const ahead = state.racers.find((r) => !r.isPlayer);
    state.racers.forEach((r) => { if (r !== pl && r !== ahead) r.finished = true; });
    const place = (r, d, speed) => {
      const w = route.toWorld(d, 0);
      Object.assign(r, { x: w.x, y: w.y, heading: w.heading, trackDistance: d, lat: 0, speed, segmentHint: null, spinUntil: 0 });
    };
    const L = state.track.totalLength;
    const from = L - 900;
    const drive = (withCar) => {
      place(pl, from, pl.physics.maxSpeed * 0.95);
      place(ahead, withCar ? from + 40 : from + L / 2, pl.physics.maxSpeed * 0.95);
      ahead.physics = { ...pl.physics };
      ahead.aiOffset = 0;
      input.throttle = true;
      let t = raceNow();
      let top = 0;
      for (let i = 0; i < 90; i += 1) {
        t += PHYSICS_STEP_MS;
        updateRacer(pl, PHYSICS_DT, t);
        top = Math.max(top, pl.speed);
        // The car ahead holds its speed down the straight.
        ahead.trackDistance = (ahead.trackDistance + ahead.speed * PHYSICS_DT) % L;
        const w = route.toWorld(ahead.trackDistance, 0);
        ahead.x = w.x; ahead.y = w.y;
      }
      input.throttle = false;
      return top;
    };
    const alone = drive(false);
    const towed = drive(true);
    return towed > alone + 3 || JSON.stringify({ alone, towed });
  });

  // Wheel to wheel: two cars side by side touch and are pushed apart across
  // the road; neither is thrown back.
  await setup("monza");
  results.sideBySideHolds = await run(() => {
    const route = getItemRoute(state.track);
    const [a, b] = state.racers;
    const d = state.track.totalLength - 900;
    [[a, -7], [b, 7]].forEach(([r, lat], i) => {
      const w = route.toWorld(d + i * 4, lat);
      Object.assign(r, { x: w.x, y: w.y, heading: w.heading, trackDistance: d + i * 4, lat, speed: 200, segmentHint: null });
    });
    state.racers.forEach((r) => { if (r !== a && r !== b) r.finished = true; });
    handleRacerContacts(raceNow());
    const apart = Math.hypot(a.x - b.x, a.y - b.y);
    return (a.speed >= 196 && b.speed >= 196 && apart >= PowerUps.CAR_WIDTH - 0.5) || JSON.stringify({ a: a.speed, b: b.speed, apart });
  });

  // Nose to tail it still costs the car behind.
  results.rearEndCosts = await run(() => {
    const route = getItemRoute(state.track);
    const [a, b] = state.racers;
    const d = state.track.totalLength - 700;
    [[a, 0, 220], [b, 18, 150]].forEach(([r, gap, speed]) => {
      const w = route.toWorld(d + gap, 0);
      Object.assign(r, { x: w.x, y: w.y, heading: w.heading, trackDistance: d + gap, lat: 0, speed, segmentHint: null, spinUntil: 0, protectedUntil: 0 });
    });
    handleRacerContacts(raceNow());
    return a.speed <= 150 * 0.9 + 0.5 || JSON.stringify({ back: a.speed });
  });

  // A car spinning in the road: the car behind slips past, no contact.
  results.spinningCarIsPassed = await run(() => {
    const route = getItemRoute(state.track);
    const [a, b] = state.racers;
    const d = state.track.totalLength - 500;
    const now = raceNow();
    [[a, 0, 220], [b, 14, 60]].forEach(([r, gap, speed]) => {
      const w = route.toWorld(d + gap, 2);
      Object.assign(r, { x: w.x, y: w.y, heading: w.heading, trackDistance: d + gap, lat: 2, speed, segmentHint: null });
    });
    b.spinUntil = now + 1000;
    handleRacerContacts(now);
    const passed = a.speed === 220 && b.speed === 60;
    b.spinUntil = 0;
    return passed || JSON.stringify({ a: a.speed, b: b.speed });
  });

  // The setting "Spinning cars block the road": off by default; on, the same
  // spinning car at Monza is solid (the car behind is held to its speed), the
  // race's recording says so, and the setting survives a reload.
  results.solidSpinsOffByDefault = await run(() => Game.isSolidSpins() === false && state.raceSolidSpins === false
    && window.localStorage.getItem("f1pixelcup.solidSpins") === null);
  await run(() => { Game.setSolidSpins(true); });
  await setup("monza");
  results.solidSpinningCarBlocks = await run(() => {
    const route = getItemRoute(state.track);
    const [a, b] = state.racers;
    state.racers.forEach((r) => { if (r !== a && r !== b) r.finished = true; });
    const d = state.track.totalLength - 500;
    const now = raceNow();
    [[a, 0, 220], [b, 14, 60]].forEach(([r, gap, speed]) => {
      const w = route.toWorld(d + gap, 2);
      Object.assign(r, { x: w.x, y: w.y, heading: w.heading, trackDistance: d + gap, lat: 2, speed, segmentHint: null, spinUntil: 0, protectedUntil: 0, formationUntil: 0 });
    });
    b.spinUntil = now + 1000;
    handleRacerContacts(now);
    const gap = PowerUps.wrapDelta(b.trackDistance, a.trackDistance, state.track.totalLength);
    const apart = Math.hypot(a.x - b.x, a.y - b.y);
    const held = a.speed;
    // Run a step so the recording starts, and read what it says of the race.
    updateRace(1 / 60, now + 1000 / 60);
    const recorded = state.recording && state.recording.header.solidSpins;
    return (held <= 60 * 0.9 + 0.5 && apart >= PowerUps.CAR_LENGTH - 0.5 && recorded === true)
      || JSON.stringify({ held, apart, gap, recorded });
  });
  await p.reload();
  await p.waitForTimeout(1500);
  results.solidSpinsSurvivesReload = await run(() => {
    const kept = Game.isSolidSpins() === true;
    Screens.showSettings();
    const shown = document.getElementById("spins-toggle").textContent === "On" && /solid/.test(document.getElementById("spins-note").textContent);
    // Back to the default for whatever runs next, and the pill follows.
    document.getElementById("spins-toggle").click();
    const off = Game.isSolidSpins() === false && document.getElementById("spins-toggle").textContent === "Off"
      && window.localStorage.getItem("f1pixelcup.solidSpins") === "off";
    return (kept && shown && off) || JSON.stringify({ kept, shown, off });
  });
  await p.addScriptTag({ url: `http://localhost:8765/tools/balance/comeback.js?${Date.now()}` });
  // Off again, a new race passes through a spinning car and records that.
  await setup("monza");
  results.passThroughAgainAndRecorded = await run(() => {
    const route = getItemRoute(state.track);
    const [a, b] = state.racers;
    state.racers.forEach((r) => { if (r !== a && r !== b) r.finished = true; });
    const d = state.track.totalLength - 500;
    const now = raceNow();
    [[a, 0, 220], [b, 14, 60]].forEach(([r, gap, speed]) => {
      const w = route.toWorld(d + gap, 2);
      Object.assign(r, { x: w.x, y: w.y, heading: w.heading, trackDistance: d + gap, lat: 2, speed, segmentHint: null, spinUntil: 0 });
    });
    b.spinUntil = now + 1000;
    handleRacerContacts(now);
    const through = a.speed === 220 && b.speed === 60;
    updateRace(1 / 60, now + 1000 / 60);
    return (through && state.raceSolidSpins === false && state.recording.header.solidSpins === false) || JSON.stringify({ a: a.speed, b: b.speed });
  });

  // The wall. Suzuka's first corners, flat out from the line with nobody
  // steering: the car runs wide off the road, meets the barrier exactly where
  // it is drawn, never past it, glances off and carries on round the lap.
  await setup("suzuka");
  results.unsteeredHitsTheWall = await run(() => {
    const pl = getPlayer();
    state.racers.forEach((r) => { if (r !== pl) r.finished = true; });
    const track = state.track;
    const prof = Runoff.profile(track);
    const route = getItemRoute(track);
    const start = 0;
    const w = route.toWorld(start, 0);
    Object.assign(pl, { x: w.x, y: w.y, heading: w.heading, trackDistance: start, lat: 0, speed: pl.physics.maxSpeed * 0.95, segmentHint: null, wallHits: 0 });
    input.throttle = true;
    let t = raceNow();
    let worst = -Infinity;
    let offroad = false;
    const from = pl.trackDistance;
    for (let i = 0; i < 60 * 8; i += 1) {
      t += PHYSICS_STEP_MS;
      updateRacer(pl, PHYSICS_DT, t);
      offroad = offroad || pl.offroad;
      const wall = Runoff.wallLimits(prof, track.pitLane, pl.trackDistance, pl.lat, Math.abs(pl.lat)).outer;
      worst = Math.max(worst, Math.abs(pl.lat) + PowerUps.CAR_WIDTH / 2 - wall);
    }
    input.throttle = false;
    const moved = PowerUps.wrapDelta(pl.trackDistance, from, track.totalLength);
    return (pl.wallHits >= 1 && offroad && worst <= 1.5 && moved > 300) || JSON.stringify({ hits: pl.wallHits, offroad, worst, moved });
  });

  // A lap of Monaco steered (the balance autopilot, a decent driver) meets
  // the wall at most once; the same lap unsteered meets it again and again,
  // and still gets round.
  results.steeringMatters = await run(() => {
    const steered = Comeback.race({ diff: 1, trackId: "monaco", seed: 3, start: "pole", laps: 1, steer: true });
    const unsteered = Comeback.race({ diff: 1, trackId: "monaco", seed: 3, start: "pole", laps: 1, steer: false });
    return (steered.wallHits <= 1 && unsteered.wallHits >= 3 && unsteered.simSeconds < 600)
      || JSON.stringify({ steered: steered.wallHits, unsteered: unsteered.wallHits, time: unsteered.simSeconds });
  });

  await context.close();
  return { results, errors };
}
