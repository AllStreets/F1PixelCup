// Browser check: every power-up does what its card says, in the real game.
// Run with the Playwright MCP tool browser_run_code_unsafe,
// filename: tools/checks/powerups-check.js, dev server on http://localhost:8765.
// Expected: every value in `results` true, errors [].
// Returns { results, errors } (the shared convention of every check in tools/checks).
async (page) => {
  const errors = [];
  const results = {};
  // Keep the test tool's own empty tab (about:blank) out of the way.
  try {
    const own = await page.context().newCDPSession(page);
    const { windowId: ownWindow } = await own.send("Browser.getWindowForTarget");
    await own.send("Browser.setWindowBounds", { windowId: ownWindow, bounds: { windowState: "minimized" } });
  } catch (e) { /* not fatal */ }
  const context = await page.context().browser().newContext({ viewport: null });
  const p = await context.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  const cdp = await context.newCDPSession(p);
  const { windowId } = await cdp.send("Browser.getWindowForTarget");
  await cdp.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "normal" } });
  await cdp.send("Browser.setWindowBounds", { windowId, bounds: { width: 1440, height: 900 } });
  await p.goto(`http://localhost:8765/play.html?${Date.now()}`);
  await p.waitForTimeout(1500);

  // A race at Monza, 40 s in (past every limit), everyone on the grid.
  const setup = (circuit = 0) => p.evaluate(async (ti) => {
    Game.selectCup(0); state.activeCupIndex = 0; buildCupEntries(); startRace(ti);
    // A circuit's first appearance is built before anything moves: wait for it.
    for (let i = 0; i < 100 && state.preparing; i += 1) await new Promise((r) => requestAnimationFrame(r));
    state.phase = "race";
    const now = performance.now();
    state.raceStart = now - 40000;
    // Start the race clock the way lights-out does.
    state.lastTick = now;
    state.racers.forEach((r) => { r.lapStartAt = now; });
  }, circuit);
  const run = (fn, arg) => p.evaluate(fn, arg);

  // Item boxes: taking one hides it for 3 s, only the first car gets a roll.
  await setup();
  results.boxHidesAndReturns = await run(async () => {
    const pl = getPlayer();
    const box = state.track.itemBoxes[0];
    const other = state.racers.find((r) => !r.isPlayer);
    [pl, other].forEach((r) => { r.x = box.x; r.y = box.y; r.currentItem = "none"; r.rouletteUntil = 0; });
    updateRace(1 / 60, performance.now());
    const hidden = state.boxHiddenUntil[0] > performance.now();
    const rolled = [pl, other].filter((r) => r.rouletteUntil > 0).length === 1;
    state.boxHiddenUntil[0] = raceNow() - 1;
    return hidden && rolled;
  });

  // The roll uses the gap to the leader.
  // (Leclerc starts on pole, so a midfield car does the rolling and firing.)
  results.rollUsesGap = await run(() => {
    const pl = getSortedRacers()[10];
    const leader = getSortedRacers()[0];
    let tailish = 0;
    for (let i = 0; i < 300; i += 1) {
      pl.currentItem = "none"; pl.rouletteUntil = 1;
      pl.trackDistance = (leader.trackDistance - state.track.totalLength * 0.45 + state.track.totalLength) % state.track.totalLength;
      finishRoulette(pl, performance.now());
      if (["formationLap", "safetyCar", "overtakeMode", "stewardPenalty", "drs"].includes(pl.currentItem)) tailish += 1;
    }
    return tailish > 180;
  });

  // DRS: boost, longer on a straight.
  await setup();
  results.drs = await run(() => {
    const pl = getPlayer(); const now = performance.now();
    pl.currentItem = "drs"; useItem(pl, now);
    const len = pl.drsUntil - now;
    const straight = PowerUps.isStraight(getItemRoute(state.track), pl.trackDistance);
    return pl.currentItem === "none" && pl.boostUntil >= pl.drsUntil && len === (straight ? 3000 : 2000);
  });

  // Overtake Mode: faster and truly untouchable.
  results.overtakeMode = await run(() => {
    const pl = getPlayer(); const now = performance.now();
    pl.currentItem = "overtakeMode"; useItem(pl, now);
    const spun = spinRacer(pl, 850, now);
    return pl.protectedUntil - now === 5000 && spun === false && pl.spinUntil <= now;
  });

  // Undercut: fired at the car directly ahead, follows the track, spins it.
  await setup();
  results.undercut = await run(async () => {
    const sorted = getSortedRacers();
    const pl = sorted[10];
    // Live frames run between steps, so ask the game which car is directly ahead.
    const ahead = carAhead(pl);
    pl.currentItem = "undercut"; useItem(pl, performance.now());
    const s = state.shots[state.shots.length - 1];
    const aimed = s.type === "undercut" && s.targetId === ahead.id;
    state.racers.forEach((r) => { r.speed = 0; });
    const before = Object.fromEntries(state.racers.map((r) => [r.id, r.spinUntil]));
    let t = performance.now();
    for (let i = 0; i < 600 && state.shots.includes(s); i += 1) { t += 16.7; updateShots(1 / 60, t); }
    const route = getItemRoute(state.track);
    // It spins the first car in its path: the target, or one alongside it.
    const hit = state.racers.filter((r) => r.spinUntil !== before[r.id]);
    const hitAhead = hit.length === 1 && getRaceProgress(hit[0]) > getRaceProgress(pl);
    return aimed && !state.shots.includes(s) && hitAhead && Math.abs(s.lat) <= route.halfWidthAt(0) - PowerUps.SHOT_EDGE;
  });

  // Steward Penalty: passes the field, hits the leader; re-targets if the leader finishes.
  await setup();
  results.stewardPenalty = await run(() => {
    const pl = getSortedRacers()[10];
    const leader = getSortedRacers()[0];
    pl.currentItem = "stewardPenalty"; useItem(pl, performance.now());
    const s = state.shots.find((x) => x.type === "stewardPenalty");
    state.racers.forEach((r) => { r.speed = 0; });
    const others = state.racers.filter((r) => r.id !== leader.id && r.id !== pl.id);
    let t = performance.now();
    for (let i = 0; i < 1200 && state.shots.includes(s); i += 1) { t += 16.7; updateShots(1 / 60, t); }
    const hitLeader = leader.spinUntil > t - 2000;
    const bystandersSafe = others.filter((r) => r.spinUntil > 0).every((r) => Math.abs(PowerUps.wrapDelta(r.trackDistance, leader.trackDistance, state.track.totalLength)) < PowerUps.CAR_LENGTH);
    return hitLeader && bystandersSafe;
  });
  results.stewardRetargets = await run(() => {
    const pl = getPlayer();
    const first = getSortedRacers()[0];
    pl.currentItem = "stewardPenalty"; useItem(pl, performance.now());
    const s = state.shots.find((x) => x.type === "stewardPenalty");
    first.finished = true; first.finishPosition = 1;
    updateShots(1 / 60, performance.now() + 20);
    const next = getSortedRacers().find((r) => !r.finished);
    const ok = s.targetId === next.id;
    state.racers.forEach((r) => { r.finished = true; });
    updateShots(1 / 60, performance.now() + 40);
    return ok && !state.shots.includes(s);
  });

  // Debris: straight ahead, bounces, expires after 6 s.
  await setup();
  results.debris = await run(() => {
    const pl = getPlayer();
    pl.heading += 0.5;
    pl.currentItem = "debris"; useItem(pl, performance.now());
    const s = state.shots[state.shots.length - 1];
    const away = (pl.trackDistance + state.track.totalLength / 2) % state.track.totalLength;
    state.racers.forEach((r) => { r.x = -9999; r.trackDistance = away; });
    let t = performance.now();
    for (let i = 0; i < 400; i += 1) { t += 16.7; updateShots(1 / 60, t); }
    return s.bounces >= 1 && !state.shots.includes(s);
  });

  // Oil Slick: dropped behind, visible in the frame, spins whoever drives in.
  await setup();
  results.oilSlick = await run(() => {
    const pl = getPlayer();
    pl.currentItem = "oilSlick"; useItem(pl, performance.now());
    const h = state.hazards[state.hazards.length - 1];
    const behind = PowerUps.wrapDelta(h.d, pl.trackDistance, state.track.totalLength);
    const victim = state.racers.find((r) => !r.isPlayer);
    victim.trackDistance = h.d; victim.lat = h.lat;
    updateHazards(performance.now() + 2000);
    return Math.abs(behind + PowerUps.DROP_GAP) < 1 && victim.spinUntil > performance.now() && !state.hazards.includes(h)
      && powerUpFrame(performance.now()).hazards.length === state.hazards.length;
  });

  // Formation Lap: autopilot, fast, protected.
  results.formationLap = await run(() => {
    const pl = getPlayer(); const now = performance.now();
    pl.currentItem = "formationLap"; useItem(pl, now);
    return pl.formationUntil - now === 4000 && isProtected(pl, now) && spinRacer(pl, 850, now) === false;
  });

  // Quit mid-race: nothing carries over.
  results.resetClears = await run(() => {
    state.boxHiddenUntil[0] = raceNow() + 5000;
    Game.backToPitLane();
    buildCupEntries(); startRace(0);
    return state.shots.length === 0 && state.hazards.length === 0 && state.safetyCar === null
      && state.boxHiddenUntil.every((t) => !t) && state.lastSafetyCarAt === null;
  });

  // Safety Car: a car on track ahead of the leader, rivals capped and held, user free.
  await setup();
  results.safetyCar = await run(() => {
    const pl = getSortedRacers()[10];
    pl.currentItem = "safetyCar";
    const now = performance.now();
    useItem(pl, now);
    const sc = state.safetyCar;
    const leader = firstUnfinished();
    const ahead = sc && PowerUps.wrapDelta(sc.d, leader.trackDistance, state.track.totalLength) > 0;
    let t = now;
    for (let i = 0; i < 120; i += 1) { t += 16.7; updateRace(1 / 60, t); }
    const rivals = state.racers.filter((r) => r.id !== pl.id && !r.finished);
    const capped = rivals.every((r) => r.speed <= r.physics.maxSpeed * PowerUps.FACTORS.safetyCar + 1);
    const leaderBehind = PowerUps.wrapDelta(state.safetyCar.d, firstUnfinished().trackDistance, state.track.totalLength) > 0;
    return Boolean(sc) && ahead && capped && leaderBehind && state.lastSafetyCarAt !== null;
  });
  results.safetyCarLeaves = await run(() => {
    let t = performance.now();
    state.safetyCar.until = t;
    for (let i = 0; i < 200; i += 1) { t += 16.7; updateRace(1 / 60, t); }
    return state.safetyCar === null;
  });

  // The safety car is solid: even the car that called it can't drive through it.
  await setup();
  results.safetyCarSolid = await run(() => {
    const pl = getSortedRacers()[10];
    pl.currentItem = "safetyCar"; useItem(pl, performance.now());
    const sc = state.safetyCar;
    sc.d = (pl.trackDistance + 20) % state.track.totalLength;
    sc.lat = pl.lat;
    pl.speed = pl.physics.maxSpeed;
    updateRacer(pl, 1 / 60, performance.now());
    return pl.speed <= sc.speed + 1e-6;
  });

  // Pausing freezes everything in flight.
  await setup();
  results.pauseFreezes = await run(async () => {
    const pl = getPlayer();
    pl.currentItem = "debris"; useItem(pl, raceNow());
    const s = state.shots[state.shots.length - 1];
    s.expiresAt = raceNow() + 60000;
    state.boxHiddenUntil[0] = raceNow() + 60000;
    const clockBefore = raceNow();
    const leftShot = s.expiresAt - raceNow();
    const leftBox = state.boxHiddenUntil[0] - raceNow();
    togglePause();
    await new Promise((r) => setTimeout(r, 1500));
    togglePause();
    const resumedAt = performance.now();
    // Let the race run two frames after resuming: the clock must have moved on
    // by no more than the time actually spent running (however slow those
    // frames were), never by the 1.5 s spent paused.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const running = performance.now() - resumedAt;
    const moved = raceNow() - clockBefore;
    const nowShot = s.expiresAt - raceNow();
    const nowBox = state.boxHiddenUntil[0] - raceNow();
    // (+2 steps: the physics accumulator carries up to a step from before the pause.)
    const ok = moved > 0 && moved <= running + 2 * PHYSICS_STEP_MS && moved < 1000
      && Math.abs(leftShot - nowShot - moved) < 1 && Math.abs(leftBox - nowBox - moved) < 1;
    return ok || JSON.stringify({ moved, running, shot: leftShot - nowShot, box: leftBox - nowBox });
  });

  // Player oil: tap drops, hold trails, key-up drops, losing focus drops.
  await setup();
  results.oilTap = await run(async () => {
    const pl = getPlayer(); pl.currentItem = "oilSlick";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", key: " " }));
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "Space", key: " " }));
    return pl.currentItem === "none" && state.hazards.length === 1 && !pl.trailingOil;
  });
  results.oilHold = await run(async () => {
    const pl = getPlayer(); pl.currentItem = "oilSlick";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", key: " " }));
    // Holding is measured on the race clock: wait until enough race time has passed.
    for (let i = 0; i < 100 && !pl.trailingOil; i += 1) await new Promise((r) => setTimeout(r, 50));
    const trailing = pl.trailingOil && pl.currentItem === "oilSlick";
    // Cars are racing meanwhile and can drive over earlier slicks, so count
    // only what this release drops.
    const before = state.hazards.length;
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "Space", key: " " }));
    return trailing && !pl.trailingOil && pl.currentItem === "none" && state.hazards.length === before + 1;
  });
  results.oilBlurDrops = await run(async () => {
    const pl = getPlayer(); pl.currentItem = "oilSlick";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", key: " " }));
    // Holding is measured on the race clock: wait until enough race time has passed.
    for (let i = 0; i < 100 && !pl.trailingOil; i += 1) await new Promise((r) => setTimeout(r, 50));
    const before = state.hazards.length;
    window.dispatchEvent(new Event("blur"));
    return !pl.trailingOil && pl.currentItem === "none" && state.hazards.length === before + 1;
  });

  // AI: holds items for a reason, and uses every item in a real race.
  results.aiUsesEveryItem = await run(() => {
    const seen = new Set();
    const watch = (e) => { if (e.detail.type === "itemUsed") seen.add(e.detail.item); };
    window.addEventListener("f1:fx", watch);
    const all = CUPS.flatMap((cup, ci) => cup.tracks.map((_, ti) => [ci, ti]));
    for (const [ci, ti] of all.slice(0, 4)) {
      state.selectedCup = ci; state.activeCupIndex = ci; buildCupEntries(); startRace(ti);
      state.racers.forEach((r) => { r.isPlayer = false; });
      state.phase = "race";
      let now = 100000;
      state.raceStart = now;
      state.racers.forEach((r) => { r.lapStartAt = now; });
      for (let t = 0; t < 400 && !state.racers.every((r) => r.finished); t += 1 / 60) {
        now += 1000 / 60;
        updateRace(1 / 60, now);
      }
    }
    window.removeEventListener("f1:fx", watch);
    return PowerUps.ITEM_ORDER.every((id) => seen.has(id)) && typeof window.__usedItems === "undefined";
  });

  // DRS: the car's upper rear-wing flap really opens, then closes.
  await setup();
  results.drsFlap = await run(async () => {
    const pl = getPlayer();
    const closed = Render3D.inspect().flaps[pl.id];
    pl.currentItem = "drs"; useItem(pl, performance.now());
    await new Promise((r) => setTimeout(r, 400));
    const open = Render3D.inspect().flaps[pl.id];
    pl.drsUntil = performance.now();
    await new Promise((r) => setTimeout(r, 500));
    const shut = Render3D.inspect().flaps[pl.id];
    const deg = (x) => (x * 180) / Math.PI;
    return typeof closed === "number" && Math.abs(deg(closed)) < 0.5 && Math.abs(Math.abs(deg(open)) - 12) < 0.5 && Math.abs(deg(shut)) < 0.5;
  });

  // 3D: every thing on track is drawn where the game says it is.
  await setup();
  results.visibleIn3D = await run(async () => {
    const pl = getPlayer();
    const give = (id, opts) => { pl.currentItem = id; useItem(pl, performance.now(), opts); };
    state.racers.forEach((r) => { if (!r.isPlayer) r.speed = 0; });
    give("undercut"); give("debris"); give("stewardPenalty"); give("oilSlick"); give("safetyCar");
    const rival = state.racers.find((r) => !r.isPlayer); rival.currentItem = "oilSlick"; useItem(rival, performance.now(), { trail: true });
    // Freeze the race so nothing lands before the renderer is inspected; paused frames still draw.
    togglePause();
    await new Promise((r) => setTimeout(r, 300));
    const seen = Render3D.inspect();
    const f = powerUpFrame(renderClock());
    togglePause();
    return seen.shots === f.shots.length && seen.hazards === f.hazards.length && seen.trails === f.trails.length
      && seen.safetyCar === true && f.shots.length >= 2;
  });
  results.boxesHideIn3D = await run(async () => {
    // Box timers are on the race clock, which runs behind the wall clock after pauses.
    state.boxHiddenUntil = state.track.itemBoxes.map((_, i) => (i === 0 ? raceNow() + 3000 : 0));
    await new Promise((r) => setTimeout(r, 400));
    const hiddenScale = Render3D.inspect().boxScales[0];
    const otherScale = Render3D.inspect().boxScales[1];
    state.boxHiddenUntil[0] = raceNow() - 1;
    await new Promise((r) => setTimeout(r, 600));
    return hiddenScale < 0.05 && otherScale > 0.95 && Render3D.inspect().boxScales[0] > 0.95;
  });
  results.auditClean = await run(() => CIRCUITS.map((c) => TRACKS.find((t) => t.id === c.id))
    .every((track) => Render3D.auditScenery(track).length === 0));

  // HUD: the slot shows the real icon, cycles real icons while rolling, and says TRAILING.
  await setup();
  results.hud = await run(async () => {
    const pl = getPlayer();
    const now = performance.now();
    pl.currentItem = "none"; pl.rouletteUntil = now + 1000;
    const a = hudItemState(pl, now).key;
    const b = hudItemState(pl, now + 90).key;
    pl.rouletteUntil = 0; pl.currentItem = "oilSlick";
    const oil = hudItemState(pl, now);
    pl.trailingOil = true;
    const trail = hudItemState(pl, now);
    pl.trailingOil = false; pl.currentItem = "drs";
    const drs = hudItemState(pl, now);
    const img = itemIconImage("safetyCar");
    await new Promise((r) => setTimeout(r, 200));
    return PowerUps.ITEM_ORDER.includes(a) && a !== b
      && oil.hint === "Tap Space: drop · Hold: trail" && trail.hint === "TRAILING · release Space to drop"
      && drs.label === "DRS" && drs.hint === "Press Space to use" && img.complete && img.naturalWidth > 0;
  });


  // --- Final review fixes ---
  // The safety car pulls off to the edge of the road, never through a barrier (Monaco: tight street barriers).
  await setup(0);
  await p.evaluate(() => { state.selectedCup = 1; state.activeCupIndex = 1; buildCupEntries(); startRace(0); state.phase = "race"; state.raceStart = performance.now() - 40000; });
  results.safetyCarStaysOnRoad = await run(() => {
    const pl = getSortedRacers()[10];
    pl.currentItem = "safetyCar"; useItem(pl, performance.now());
    const sc = state.safetyCar;
    sc.until = performance.now();
    const route = getItemRoute(state.track);
    let t = performance.now(); let maxLat = 0;
    for (let i = 0; i < 200 && state.safetyCar; i += 1) { t += 16.7; updateSafetyCar(1 / 60, t); if (state.safetyCar) maxLat = Math.max(maxLat, Math.abs(state.safetyCar.lat)); }
    return state.safetyCar === null && maxLat <= route.halfWidthAt(0);
  });

  // A trailed slick destroyed by a shot leaves no held Space behind: the next Oil Slick does not trail itself.
  await setup();
  results.oilHoldClearedOnBlock = await run(() => {
    const pl = getPlayer();
    pl.currentItem = "oilSlick"; pl.oilHoldStart = raceNow() - 500; useItem(pl, raceNow(), { trail: true });
    const shooter = getSortedRacers().find((r) => r.id !== pl.id);
    state.shots.push({ type: "debris", ownerId: shooter.id, d: (pl.trackDistance - PowerUps.TRAIL_GAP + state.track.totalLength) % state.track.totalLength, lat: pl.lat, speed: 0, latVel: 0, targetId: "", targetLat: 0, armedAt: 0, expiresAt: Infinity, age: 0 });
    updateShots(1 / 60, performance.now());
    pl.currentItem = "oilSlick";
    updateRacer(pl, 1 / 60, performance.now());
    return !pl.trailingOil && pl.oilHoldStart === 0;
  });

  // A finished player can't fire items from the line.
  await setup();
  results.finishedPlayerCantFire = await run(() => {
    const pl = getPlayer();
    pl.finished = true; pl.currentItem = "safetyCar";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", key: " " }));
    return pl.currentItem === "safetyCar" && state.safetyCar === null;
  });

  // Behind the safety car a car alongside can't slip past (single file).
  await setup();
  results.safetyCarSingleFile = await run(() => {
    const pl = getSortedRacers()[10];
    pl.currentItem = "safetyCar"; useItem(pl, performance.now());
    const others = state.racers.filter((r) => r.id !== pl.id && !r.finished);
    const [front, back] = others.slice(0, 2);
    const route = getItemRoute(state.track);
    const place = (r, gap, lat) => { const d = (state.safetyCar.d - gap + state.track.totalLength) % state.track.totalLength; const w = route.toWorld(d, lat); Object.assign(r, { x: w.x, y: w.y, heading: w.heading, trackDistance: d, lat }); };
    place(front, 60, 30); front.speed = 40;
    place(back, 80, -30); back.speed = back.physics.maxSpeed;
    updateRacer(back, 1 / 60, performance.now());
    return back.speed <= 40 + 1e-6;
  });

  // The feed tells the truth when a protected leader shrugs off a Steward Penalty.
  await setup();
  results.stewardFeedHonest = await run(() => {
    const shooter = getSortedRacers()[10];
    const leader = firstUnfinished();
    leader.protectedUntil = raceNow() + 5000;
    shooter.currentItem = "stewardPenalty"; useItem(shooter, performance.now());
    const s = state.shots.find((x) => x.type === "stewardPenalty");
    s.d = leader.trackDistance; s.armedAt = 0;
    updateShots(1 / 60, performance.now());
    return state.feed[0].message.includes("Overtake Mode") && !state.feed[0].message.includes("lands");
  });

  // While paused the picture freezes too: a hidden box does not grow back on the pause screen.
  await setup();
  // (It once flaked: the shrink was waited for on wall-clock timeouts, so a
  // stalled or throttled page could pause before a frame had shrunk the box,
  // and the short deadline raced the wait. Now the wait is on rendered frames,
  // the deadline is set only once the box is gone, and without the pause the
  // box would be back well inside the wait.)
  results.pauseFreezesPicture = await run(async () => {
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    state.boxHiddenUntil = state.track.itemBoxes.map((_, i) => (i === 0 ? Infinity : 0));
    for (let i = 0; i < 240 && Render3D.inspect().boxScales[0] > 0.001; i += 1) await frame();
    const shrunk = Render3D.inspect().boxScales[0] <= 0.001;
    // Due back in 300 ms of race time...
    state.boxHiddenUntil[0] = raceNow() + 300;
    togglePause();
    // ...but paused for over a second: it must still be gone.
    await new Promise((r) => setTimeout(r, 1100));
    await frame(); await frame();
    const scale = Render3D.inspect().boxScales[0];
    togglePause();
    return (shrunk && scale <= 0.001) || JSON.stringify({ shrunk, scale });
  });


  // --- Leftover fixes ---
  // Releasing Space (or losing focus) while paused holds the trail; it drops on resume.
  await setup();
  results.oilHeldThroughPause = await run(async () => {
    const pl = getPlayer(); pl.currentItem = "oilSlick";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", key: " " }));
    // Holding is measured on the race clock: wait until enough race time has passed.
    for (let i = 0; i < 100 && !pl.trailingOil; i += 1) await new Promise((r) => setTimeout(r, 50));
    const trailing = pl.trailingOil;
    togglePause();
    const before = state.hazards.length;
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "Space", key: " " }));
    window.dispatchEvent(new Event("blur"));
    const heldWhilePaused = pl.trailingOil && state.hazards.length === before;
    togglePause();
    return trailing && heldWhilePaused && !pl.trailingOil && state.hazards.length === before + 1;
  });

  // A hidden tab pauses the race, so nothing runs out behind it.
  await setup();
  results.hiddenTabPauses = await run(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
    const paused = state.paused;
    delete document.hidden;
    if (state.paused) togglePause();
    return paused;
  });

  // Suzuka's bridge: cars on different levels never touch, and a box on one deck can't be taken from the other.
  await p.evaluate(() => { Game.selectCup(0); state.activeCupIndex = 0; buildCupEntries(); startRace(3); state.phase = "race"; state.raceStart = performance.now() - 40000; });
  results.bridgeLevelsApart = await run(() => {
    const route = getItemRoute(state.track);
    const { under, over } = TRACK_SHAPES.suzuka.bridges[0];
    const starts = state.track.cumulativeStarts;
    let best = { dist: Infinity };
    for (let a = starts[under - 3]; a < starts[under + 3]; a += 2) {
      for (let b = starts[over - 3]; b < starts[over + 3]; b += 2) {
        const pa = route.sample(a); const pb = route.sample(b);
        const dist = Math.hypot(pa.x - pb.x, pa.y - pb.y);
        if (dist < best.dist) best = { dist, a, b };
      }
    }
    const [low, high] = state.racers.filter((r) => !r.isPlayer).slice(0, 2);
    const put = (r, d) => { const w = route.toWorld(d, 0); Object.assign(r, { x: w.x, y: w.y, heading: w.heading, trackDistance: d, lat: 0, speed: 0, spinUntil: 0, spinImmuneUntil: 0, segmentHint: null }); };
    put(low, best.a); put(high, best.b);
    high.protectedUntil = raceNow() + 5000;
    const lowBefore = { x: low.x, y: low.y };
    handleRacerContacts(raceNow());
    const untouched = low.spinUntil === 0 && Math.hypot(low.x - lowBefore.x, low.y - lowBefore.y) < 0.01;
    // Traffic avoidance: a car on the other deck is not traffic.
    high.speed = 0;
    const avoided = applyTrafficAvoidance(low, 1, 0, 0);
    const noPhantomTraffic = avoided.throttle === 1 && avoided.brake === 0 && avoided.steerInput === 0;
    // A box on the upper deck: a car underneath can't take it...
    const bw = route.toWorld(best.b, 0);
    const saved = state.track.itemBoxes[0];
    state.track.itemBoxes[0] = { x: bw.x, y: bw.y, d: best.b };
    state.boxHiddenUntil = [];
    low.currentItem = "none"; low.rouletteUntil = 0;
    const lowTook = (() => { const before = state.boxHiddenUntil[0]; updateRacer(low, 1 / 60, raceNow()); return state.boxHiddenUntil[0] !== before; })();
    // ...and a car on that deck does.
    put(high, best.b); high.currentItem = "none"; high.rouletteUntil = 0; high.protectedUntil = 0;
    state.boxHiddenUntil = [];
    updateRacer(high, 1 / 60, raceNow());
    const highTook = state.boxHiddenUntil[0] > raceNow();
    state.track.itemBoxes[0] = saved;
    return untouched && noPhantomTraffic && !lowTook && highTook;
  });

  // An Undercut that loses its target really becomes Debris.
  await setup();
  results.undercutBecomesDebris = await run(() => {
    const sorted = getSortedRacers();
    const pl = sorted[10];
    pl.currentItem = "undercut"; useItem(pl, raceNow());
    const s = state.shots[state.shots.length - 1];
    const target = racerById(s.targetId);
    target.finished = true; target.finishPosition = 99;
    updateShots(1 / 60, raceNow());
    const now = raceNow();
    return s.type === "debris" && !s.targetId && Math.abs(s.latVel) > 0 && s.expiresAt <= now + PowerUps.TIMINGS.lifeMs.debris + 50;
  });
  results.undercutOvershootBecomesDebris = await run(() => {
    const sorted = getSortedRacers().filter((r) => !r.finished);
    const pl = sorted[10];
    pl.currentItem = "undercut"; useItem(pl, raceNow());
    const s = state.shots[state.shots.length - 1];
    const target = racerById(s.targetId);
    // The shot has gone past its target (it slipped by on the other side of the road).
    s.d = (target.trackDistance + PowerUps.CAR_LENGTH * 2) % state.track.totalLength;
    updateShots(1 / 60, raceNow());
    return s.type === "debris";
  });

  // A Steward Penalty fired from half a lap back at Spa still reaches the leader.
  await p.evaluate(() => { Game.selectCup(0); state.activeCupIndex = 0; buildCupEntries(); startRace(1); state.racers.forEach((r) => { r.isPlayer = false; }); state.phase = "race"; });
  results.longStewardArrives = await run(() => {
    let now = 200000;
    state.raceStart = now - 40000;
    state.racers.forEach((r) => { r.lapStartAt = now; });
    for (let i = 0; i < 60 * 20; i += 1) { now += 1000 / 60; updateRace(1 / 60, now); }
    const sorted = getSortedRacers().filter((r) => !r.finished);
    const leader = sorted[0];
    const L = state.track.totalLength;
    // Put the last car half a lap behind the leader, on the racing line.
    const back = sorted[sorted.length - 1];
    const route = getItemRoute(state.track);
    const d = ((leader.trackDistance - L * 0.5) % L + L) % L;
    const w = route.toWorld(d, 0);
    Object.assign(back, { x: w.x, y: w.y, heading: w.heading, trackDistance: d, lat: 0, segmentHint: null,
      lap: d > leader.trackDistance ? leader.lap - 1 : leader.lap, startedRaceLap: true });
    const gap = (getRaceProgress(leader) - getRaceProgress(back)) / L;
    if (gap < 0.45) return `gap only ${gap.toFixed(2)}`;
    const shooter = { r: back, gap };
    state.racers.forEach((r) => { r.currentItem = "none"; r.itemReadyAt = Infinity; });
    shooter.r.currentItem = "stewardPenalty"; useItem(shooter.r, raceNow(now));
    const s = state.shots.find((x) => x.type === "stewardPenalty");
    let landed = false;
    for (let i = 0; i < 60 * 90 && !landed; i += 1) {
      now += 1000 / 60; updateRace(1 / 60, now);
      landed = !state.shots.includes(s);
    }
    return landed && state.feed.some((f) => /Steward Penalty lands on|shrugs off the Steward Penalty/.test(f.message));
  });

  // Pausing freezes everything on track: shots, oil, a trailed slick and the safety car stay put.
  await setup();
  results.pauseFreezesEverything = await run(async () => {
    const sorted = getSortedRacers();
    const a = sorted[10];
    a.currentItem = "safetyCar"; useItem(a, raceNow());
    const b = sorted[12]; b.currentItem = "debris"; useItem(b, raceNow());
    const c = sorted[14]; c.currentItem = "oilSlick"; useItem(c, raceNow());
    const d = sorted[16]; d.currentItem = "oilSlick"; useItem(d, raceNow(), { trail: true });
    const snap = () => JSON.stringify({
      shots: state.shots.map((x) => [x.d.toFixed(3), x.lat.toFixed(3), Math.round(x.expiresAt - raceNow())]),
      hazards: state.hazards.map((x) => [x.d.toFixed(3), Math.round(x.expiresAt - raceNow())]),
      sc: state.safetyCar && [state.safetyCar.d.toFixed(3), Math.round(state.safetyCar.until - raceNow())],
      trail: d.trailingOil,
      cars: state.racers.map((r) => r.trackDistance.toFixed(3)),
    });
    togglePause();
    const before = snap();
    await new Promise((r) => setTimeout(r, 1000));
    const during = JSON.stringify({ ...JSON.parse(snap()) });
    togglePause();
    const after = snap();
    // During the pause nothing moves; on resume the time left is what it was
    // (remaining times read against the frozen clock, then the shifted one).
    return before === during && JSON.parse(after).shots.length === JSON.parse(before).shots.length;
  });

  // More oil than any fixed pool: every slick on track is drawn.
  await setup();
  results.manyOilAllDrawn = await run(async () => {
    const pl = getPlayer();
    for (let i = 0; i < 40; i += 1) {
      state.hazards.push({ type: "oilSlick", ownerId: "x", d: (pl.trackDistance + 200 + i * 40) % state.track.totalLength, lat: 0, armedAt: Infinity, expiresAt: Infinity });
    }
    await new Promise((r) => setTimeout(r, 300));
    return Render3D.inspect().hazards === state.hazards.length;
  });


  // An Undercut with nobody ahead is Debris from the start: Debris speed, and it drifts the way the car points.
  await setup();
  results.undercutWithNoTargetIsDebris = await run(() => {
    const leader = firstUnfinished();
    const route = getItemRoute(state.track);
    const verdicts = [-0.4, 0.4].map((turn) => {
      leader.heading = route.headingAt(leader.trackDistance) + turn;
      leader.currentItem = "undercut"; useItem(leader, raceNow());
      const s = state.shots[state.shots.length - 1];
      const debrisSpeed = leader.physics.maxSpeed * PowerUps.SHOT_SPEEDS.debris;
      return s.type === "debris" && Math.sign(s.latVel) === Math.sign(turn) && s.speed <= debrisSpeed + 1e-6;
    });
    return verdicts.every(Boolean);
  });

  // A tap on Space whose key-up comes during a pause drops the slick on resume.
  await setup();
  results.oilTapReleasedInPause = await run(() => {
    const pl = getPlayer(); pl.currentItem = "oilSlick";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", key: " " }));
    togglePause();
    const before = state.hazards.length;
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "Space", key: " " }));
    const held = pl.currentItem === "oilSlick" && state.hazards.length === before;
    togglePause();
    return held && pl.currentItem === "none" && state.hazards.length === before + 1 && !pl.trailingOil;
  });

  // Paused means still: no screen shake on the pause screen.
  await setup();
  results.noShakeWhilePaused = await run(() => {
    addScreenShake(10, 420);
    togglePause();
    const shake = getScreenShake();
    togglePause();
    return shake.x === 0 && shake.y === 0;
  });

  // If the 3D renderer ever throws mid-race, the game carries on in 2D rather than freezing.
  await setup();
  results.rendererCrashFallsBack = await (async () => {
    const before = errors.length;
    await p.evaluate(() => { window.Render3D.render = () => { throw new Error("test: renderer crashed"); }; });
    await p.waitForTimeout(600);
    const out = await p.evaluate(() => ({ failed: Render3D.failed, fallback: state.fallbackFrames, running: state.phase === "race" }));
    return out.failed && out.fallback > 0 && out.running && errors.length === before;
  })();


  // A renderer crash in the pit lane hides the 3D view (no frozen 3D car
  // behind the fallback) and the fallback is the team's showroom photo.
  results.garageCrashCleansUp = await (async () => {
    await p.evaluate(() => { Game.backToPitLane(); });
    await p.waitForTimeout(300);
    await p.evaluate(() => { window.Render3D.renderGarage = () => { throw new Error("test: showroom crashed"); }; window.Render3D.ready = true; window.Render3D.failed = false; });
    await p.waitForTimeout(1200);
    return p.evaluate(() => {
      const canvas3d = document.getElementById("game3d");
      const hidden = !canvas3d || getComputedStyle(canvas3d).display === "none";
      return hidden && !document.getElementById("canvas-shell").classList.contains("has-3d") && state.garageFallback === "photo";
    });
  })();

  await context.close();
  return { results, errors };
}
