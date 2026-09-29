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
    const ahead = sorted[9];
    pl.currentItem = "undercut"; useItem(pl, performance.now());
    const s = state.shots[state.shots.length - 1];
    const aimed = s.type === "undercut" && s.targetId === ahead.id;
    state.racers.forEach((r) => { r.speed = 0; });
    let t = performance.now();
    for (let i = 0; i < 600 && state.shots.includes(s); i += 1) { t += 16.7; updateShots(1 / 60, t); }
    const route = getItemRoute(state.track);
    return aimed && !state.shots.includes(s) && ahead.spinUntil > t - 1000 && Math.abs(s.lat) <= route.halfWidthAt(0) - PowerUps.SHOT_EDGE;
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

  await context.close();
  return { results, errors };
}
