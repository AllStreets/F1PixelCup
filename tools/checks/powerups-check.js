// Browser check: every power-up does what its card says, in the real game.
// Run with the Playwright MCP tool browser_run_code_unsafe,
// filename: tools/checks/powerups-check.js, dev server on http://localhost:8765.
// Expected: every value in `results` true, errors [].
async (page) => {
  const errors = [];
  const results = {};
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
  const setup = (circuit = 0) => p.evaluate((ti) => {
    Game.selectCup(0); state.activeCupIndex = 0; buildCupEntries(); startRace(ti);
    state.phase = "race";
    const now = performance.now();
    state.raceStart = now - 40000;
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
    state.boxHiddenUntil[0] = performance.now() - 1;
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
    state.boxHiddenUntil[0] = performance.now() + 5000;
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
    pl.currentItem = "debris"; useItem(pl, performance.now());
    const s = state.shots[state.shots.length - 1];
    state.boxHiddenUntil[0] = performance.now() + 3000;
    const leftShot = s.expiresAt - performance.now();
    const leftBox = state.boxHiddenUntil[0] - performance.now();
    togglePause();
    await new Promise((r) => setTimeout(r, 1500));
    togglePause();
    const nowShot = s.expiresAt - performance.now();
    const nowBox = state.boxHiddenUntil[0] - performance.now();
    return Math.abs(leftShot - nowShot) < 150 && Math.abs(leftBox - nowBox) < 150;
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
    await new Promise((r) => setTimeout(r, 400));
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
    await new Promise((r) => setTimeout(r, 400));
    const before = state.hazards.length;
    window.dispatchEvent(new Event("blur"));
    return !pl.trailingOil && pl.currentItem === "none" && state.hazards.length === before + 1;
  });

  // AI: holds items for a reason, and uses every item in a real race.
  results.aiUsesEveryItem = await run(() => {
    window.__usedItems = [];
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
    return PowerUps.ITEM_ORDER.every((id) => window.__usedItems.includes(id));
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
    await new Promise((r) => setTimeout(r, 300));
    const seen = Render3D.inspect();
    const f = powerUpFrame(performance.now());
    return seen.shots === f.shots.length && seen.hazards === f.hazards.length && seen.trails === f.trails.length
      && seen.safetyCar === true && f.shots.length >= 2;
  });
  results.boxesHideIn3D = await run(async () => {
    state.boxHiddenUntil = state.track.itemBoxes.map((_, i) => (i === 0 ? performance.now() + 3000 : 0));
    await new Promise((r) => setTimeout(r, 400));
    const hiddenScale = Render3D.inspect().boxScales[0];
    const otherScale = Render3D.inspect().boxScales[1];
    state.boxHiddenUntil[0] = performance.now() - 1;
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
    pl.currentItem = "oilSlick"; pl.oilHoldStart = performance.now() - 500; useItem(pl, performance.now(), { trail: true });
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
    leader.protectedUntil = performance.now() + 5000;
    shooter.currentItem = "stewardPenalty"; useItem(shooter, performance.now());
    const s = state.shots.find((x) => x.type === "stewardPenalty");
    s.d = leader.trackDistance; s.armedAt = 0;
    updateShots(1 / 60, performance.now());
    return state.feed[0].message.includes("Overtake Mode") && !state.feed[0].message.includes("lands");
  });

  // While paused the picture freezes too: a hidden box does not grow back on the pause screen.
  await setup();
  results.pauseFreezesPicture = await run(async () => {
    state.boxHiddenUntil = state.track.itemBoxes.map((_, i) => (i === 0 ? performance.now() + 600 : 0));
    await new Promise((r) => setTimeout(r, 150));
    togglePause();
    // Stay paused past the box's deadline in wall-clock time.
    await new Promise((r) => setTimeout(r, 1100));
    const scale = Render3D.inspect().boxScales[0];
    togglePause();
    return scale < 0.05;
  });

  await context.close();
  return { results, errors };
}
