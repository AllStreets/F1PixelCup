// Browser check: one race clock. It advances exactly as far as the physics
// does (fast-forward after the flag, slow machines, pauses), so every lap and
// race time is real; finishing order agrees with finish times; results and
// the timing tower show true times; narrow windows still read.
// Run with the Playwright MCP tool browser_run_code_unsafe,
// filename: tools/checks/race-clock-check.js, dev server on http://localhost:8765.
// Expected: every value in `results` true, errors [].
async (page) => {
  const errors = [];
  const results = {};
  // Keep the test tool's own empty tab (about:blank) out of the way.
  try {
    const own = await page.context().newCDPSession(page);
    const { windowId } = await own.send("Browser.getWindowForTarget");
    await own.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "minimized" } });
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
  // Races have randomness in them (driver mistakes, item rolls). Each race
  // here is seeded, so every run of this check simulates the same races.
  await p.evaluate(() => {
    window.seedRandom = (seed) => {
      let state32 = seed >>> 0;
      Math.random = () => {
        state32 = (state32 + 0x6d2b79f5) >>> 0;
        let t = Math.imul(state32 ^ (state32 >>> 15), 1 | state32);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    };
  });

  // Shots keep pace with the fast-forwarded field.
  results.flagShotsKeepPace = await p.evaluate(() => {
    Game.selectCup(0); state.activeCupIndex = 0; buildCupEntries(); startRace(0);
    state.phase = "race";
    const now = performance.now();
    state.raceStart = now - 40000;
    const pl = getPlayer();
    pl.finished = true; pl.finishPosition = 1;
    state.flagOutAt = now;
    const shooter = getSortedRacers().find((r) => !r.finished);
    shooter.currentItem = "debris"; useItem(shooter, raceNow(now));
    const s = state.shots[state.shots.length - 1];
    s.latVel = 0;
    // A clear stretch of road: nobody for it to hit during the seven steps.
    s.d = (shooter.trackDistance + state.track.totalLength / 2) % state.track.totalLength;
    shooter.currentItem = "safetyCar"; useItem(shooter, raceNow(now));
    const sc = state.safetyCar;
    sc.d = (s.d + 400) % state.track.totalLength;
    const d0 = s.d;
    const sc0 = sc.d;
    updateRace(1 / 60, now + 16.7);
    const L = state.track.totalLength;
    const moved = PowerUps.wrapDelta(s.d, d0, L);
    const scMoved = PowerUps.wrapDelta(sc.d, sc0, L);
    return Math.abs(moved - s.speed * (7 / 60)) < 1 && Math.abs(scMoved - sc.pace * (7 / 60)) < 1;
  });

  // A whole race, the player retiring early so most of the field is
  // fast-forwarded: every time must still be a real race time.
  results.flagTimesReal = await p.evaluate(() => {
    seedRandom(7);
    Game.selectCup(0); state.activeCupIndex = 0; buildCupEntries(); startRace(0);
    state.racers.forEach((r) => { r.isPlayer = false; });
    const pl = state.racers.find((r) => r.id === state.playerId);
    state.phase = "race";
    let now = 100000;
    state.raceStart = now;
    state.racers.forEach((r) => { r.lapStartAt = now; });
    const dt = 1 / 60;
    let flagged = false;
    for (let t = 0; t < 900 && !state.resultsQueued; t += dt) {
      now += 1000 * dt;
      if (!flagged && pl.lap >= 1) {
        pl.isPlayer = true;
        finishRacer(pl, raceNow(now));
        flagged = true;
      }
      updateRace(dt, now);
    }
    const order = [...state.racers].sort((a, b) => a.finishPosition - b.finishPosition).filter((r) => r.id !== pl.id);
    const increasing = order.every((r, i) => i === 0 || r.finishTime >= order[i - 1].finishTime);
    // Five laps can't be faster than five of the car's best lap.
    const possible = order.every((r) => r.bestLapTime > 0 && r.finishTime >= r.bestLapTime * 5 * 0.97);
    window.__lastOrder = order.map((r) => [r.driver.code, Math.round(r.finishTime), Math.round(r.bestLapTime)]);
    // Times are taken where the car crossed the line, between frames, not
    // rounded to the frame that noticed it (1/60 s steps from the start).
    const frame = 1000 / 60;
    // Snapped times sit on a step boundary to float precision; a genuine crossing can land
    // a hair from one, so only (near-)exact multiples count.
    const onFrames = order.filter((r) => { const k = r.finishTime / frame; return Math.abs(k - Math.round(k)) < 1e-6; }).length;
    window.__onFrames = onFrames;
    return flagged && increasing && possible && state.phase === "results" && onFrames === 0;
  });

  // The results screen shows every driver's total race time and the gap.
  results.resultsShowTimes = await p.evaluate(() => {
    const head = document.querySelector("#results-table .result-head").textContent;
    const rows = [...document.querySelectorAll("#results-table .result-row")];
    const times = rows.map((row) => row.querySelector(".r-time") && row.querySelector(".r-time").textContent.trim());
    const gaps = rows.map((row) => row.querySelector(".r-gap") && row.querySelector(".r-gap").textContent.trim());
    return head.includes("Time") && head.includes("Gap") && rows.length === 20
      && times.every((t) => /^~?\d+:\d{2}\.\d{3}$/.test(t || ""))
      && /^[—–-]$|^Winner$/.test(gaps[0] || "") && gaps.slice(1).every((g) => /^~?\+\d+\.\d{3}$/.test(g || "") || /^~?\+\d+:\d{2}\.\d{3}$/.test(g || ""));
  });

  // Cars only placed by the safety valve are marked as estimated, never passed off as timed.
  results.estimatedTimesMarked = await p.evaluate(() => {
    seedRandom(7);
    Game.selectCup(0); state.activeCupIndex = 0; buildCupEntries(); startRace(0);
    state.racers.forEach((r) => { r.isPlayer = false; });
    state.phase = "race";
    let now = 100000;
    state.raceStart = now;
    state.racers.forEach((r) => { r.lapStartAt = now; });
    // Race until half the field is home, then pull the safety valve.
    for (let t = 0; t < 900 && state.racers.filter((r) => r.finished).length < 10; t += 1 / 60) { now += 1000 / 60; updateRace(1 / 60, now); }
    const timed = state.racers.filter((r) => r.finished);
    const slowestTimed = Math.max(...timed.map((r) => r.finishTime));
    const elapsed = raceNow(now) - state.raceStart;
    completeRemainingFinishers(raceNow(now));
    const placed = state.racers.filter((r) => r.timeEstimated).sort((a, b) => a.finishPosition - b.finishPosition);
    return timed.every((r) => !r.timeEstimated) && placed.length === 10
      && placed.every((r, i) => r.finishTime >= elapsed && r.finishTime > slowestTimed && (i === 0 || r.finishTime > placed[i - 1].finishTime));
  });

  // A photo finish: two cars cross in the same step, in the opposite order to
  // the order the game visits them. Places follow the times.
  results.photoFinishOrder = await p.evaluate(() => {
    seedRandom(7);
    Game.selectCup(0); state.activeCupIndex = 0; buildCupEntries(); startRace(0);
    state.racers.forEach((r) => { r.isPlayer = false; });
    state.phase = "race";
    const now = 200000;
    state.raceStart = now - 180000;
    const L = state.track.totalLength;
    const route = getItemRoute(state.track);
    // Two cars on the last lap, just short of the line, on either side of the
    // road. The one the game visits first is slower, so it crosses later.
    const [first, second] = state.racers;
    // Placed in the start line's own frame: `back` is the true distance short of the line.
    const line = route.sample(0);
    const put = (r, back, lat, speed) => {
      const x = line.x - line.tx * back + line.nx * lat;
      const y = line.y - line.ty * back + line.ny * lat;
      Object.assign(r, { x, y, heading: Math.atan2(line.ty, line.tx), trackDistance: L - back, lat, speed, lap: state.track.laps - 1,
        startedRaceLap: true, lapAccum: L, lapStartAt: now - 36000, segmentHint: null, finished: false });
    };
    put(first, 1.4, -24, 110);
    put(second, 0.9, 24, 230);
    // Everyone else is well back.
    state.racers.slice(2).forEach((r, i) => { const w = route.toWorld(L - 900 - i * 40, 0); Object.assign(r, { x: w.x, y: w.y, heading: w.heading, trackDistance: L - 900 - i * 40, speed: 0, segmentHint: null }); });
    state.lastTick = now;
    updateRace(1 / 60, now + 1000 / 60);
    const both = first.finished && second.finished;
    return both && second.finishTime < first.finishTime && second.finishPosition === 1 && first.finishPosition === 2;
  });

  // A slow machine: 20 frames a second. Physics steps are capped, and the race
  // clock follows the physics, so times match the same race run smoothly.
  const raceWinner = (frameMs) => p.evaluate((frameMs) => {
    seedRandom(7);
    Game.selectCup(0); state.activeCupIndex = 0; buildCupEntries(); startRace(0);
    state.racers.forEach((r) => { r.isPlayer = false; });
    state.phase = "race";
    let now = 100000;
    state.raceStart = now;
    state.racers.forEach((r) => { r.lapStartAt = now; });
    const dt = Math.min(frameMs / 1000, 0.033);
    let guard = 0;
    // Items off: this compares the clock, not the luck of the boxes.
    while (!state.resultsQueued && guard < 200000) {
      state.boxHiddenUntil = state.track.itemBoxes.map(() => Infinity);
      now += frameMs; updateRace(dt, now); guard += 1;
    }
    const times = state.racers.map((r) => r.finishTime).sort((a, b) => a - b);
    return { median: times[10], best: Math.min(...state.racers.map((r) => r.bestLapTime || Infinity)) };
  }, frameMs);
  const smooth = await raceWinner(1000 / 60);
  const choppy = await raceWinner(50);
  // A wall-time clock would read about 50% slower at 20 fps (50 ms frames, 33 ms of physics).
  results.slowMachineTimesReal = Math.abs(choppy.median / smooth.median - 1) < 0.04 && Math.abs(choppy.best / smooth.best - 1) < 0.04;

  // The timing tower shows real time gaps: never negative, even right after
  // the lead changes hands, and each gap agrees with the distance between the
  // cars at their speed.
  results.towerGapsAreTimes = await p.evaluate(() => {
    seedRandom(7);
    Game.selectCup(0); state.activeCupIndex = 0; buildCupEntries(); startRace(0);
    state.racers.forEach((r) => { r.isPlayer = false; });
    state.phase = "race";
    let now = 100000;
    state.raceStart = now;
    state.racers.forEach((r) => { r.lapStartAt = now; });
    let negative = 0;
    let checked = 0;
    let agreeing = 0;
    for (let i = 0; i < 60 * 90; i += 1) {
      now += 1000 / 60;
      updateRace(1 / 60, now);
      if (i % 30) continue;
      const standings = getRaceStandings();
      negative += standings.filter((row) => row.gap.includes("-")).length;
      const sorted = getSortedRacers().filter((r) => !r.finished);
      for (let k = 1; k < Math.min(sorted.length, 6); k += 1) {
        const ahead = sorted[k - 1];
        const behind = sorted[k];
        const byTime = gapSeconds(behind, ahead) - gapSeconds(ahead, sorted[0]) * 0;
        const interval = gapSeconds(behind, sorted[0]) - gapSeconds(ahead, sorted[0]);
        const byDistance = (getRaceProgress(ahead) - getRaceProgress(behind)) / Math.max(40, behind.speed);
        checked += 1;
        if (Math.abs(interval - byDistance) < 0.6 + byDistance * 0.35) agreeing += 1;
      }
    }
    // A forced overtake of the leader mid-sector: the gap can't go negative.
    const [lead, second] = getSortedRacers().filter((r) => !r.finished);
    const s = lead.lastSplit;
    second.splits[s] = lead.splits[s] - 400;
    const gapAfterPass = gapSeconds(lead, second);
    return negative === 0 && checked > 50 && agreeing / checked > 0.9 && gapAfterPass >= 0;
  });

  // Lap times never show 60 seconds: they round to the millisecond first.
  results.lapTimesRound = await p.evaluate(() => formatLapTime(59999.9) === "1:00.000" && formatRaceTime(119999.6) === "2:00.000");

  // Narrow windows: the results still show every driver's name, on one screen width.
  results.resultsNarrow = await (async () => {
    await p.evaluate(() => {
      Game.selectCup(0); state.activeCupIndex = 0; buildCupEntries(); startRace(0);
      state.racers.forEach((r) => { r.isPlayer = false; });
      state.phase = "race";
      let now = 100000; state.raceStart = now; state.racers.forEach((r) => { r.lapStartAt = now; });
      for (let t = 0; t < 900 && !state.resultsQueued; t += 1 / 60) { now += 1000 / 60; updateRace(1 / 60, now); }
    });
    const verdicts = [];
    for (const width of [760, 520, 390]) {
      await cdp.send("Browser.setWindowBounds", { windowId, bounds: { width, height: 800 } });
      await p.waitForTimeout(400);
      verdicts.push(await p.evaluate(() => {
        const rows = [...document.querySelectorAll("#results-table .result-row")];
        const names = rows.map((r) => r.children[2].getBoundingClientRect().width);
        const table = document.getElementById("results-table");
        const cells = rows.flatMap((r) => [...r.children].filter((c) => getComputedStyle(c).display !== "none"));
        const noSpill = cells.every((c) => c.scrollWidth <= c.clientWidth + 1 || c.tagName === "I");
        return names.every((w) => w >= 70) && table.scrollWidth <= table.clientWidth + 1 && noSpill;
      }));
    }
    await cdp.send("Browser.setWindowBounds", { windowId, bounds: { width: 1440, height: 900 } });
    return verdicts.every(Boolean);
  })();


  // The race clock through lights-out, a hitch and into the results: it only
  // ever moves by the physics steps, and the results screen draws on it too.
  results.clockContinuous = await p.evaluate(() => {
    seedRandom(7);
    Game.selectCup(0); state.activeCupIndex = 0; buildCupEntries(); startRace(0);
    state.racers.forEach((r) => { r.isPlayer = false; });
    let now = 500000;
    state.countdownStart = now - 4500;
    updateCountdown(now);
    const lightsOut = state.raceStart;
    // A half-second hitch before the first race frame, then a 33 ms step, then normal frames.
    now += 500; updateRace(0.033, now);
    const firstTick = state.lastTick;
    const ticks = [firstTick];
    [1 / 60, 0.033, 1 / 60, 1 / 60].forEach((dt) => { now += 1000 * dt + 7; updateRace(dt, now); ticks.push(state.lastTick); });
    const steps = [33, 1000 / 60, 33, 1000 / 60, 1000 / 60];
    const stepsOk = ticks.every((t, i) => Math.abs((i === 0 ? t - lightsOut : t - ticks[i - 1]) - steps[i]) < 0.01);
    for (let t = 0; t < 900 && !state.resultsQueued; t += 1 / 60) { now += 1000 / 60; updateRace(1 / 60, now); }
    const inResults = state.phase === "results" && raceNow() === state.lastTick && renderClock() === state.lastTick;
    return stepsOk && inResults;
  });

  // Reversing back over the start line gives the lap back instead of gaining one.
  results.reverseOverLine = await p.evaluate(() => {
    Game.selectCup(0); state.activeCupIndex = 0; buildCupEntries(); startRace(0);
    state.phase = "race";
    const L = state.track.totalLength;
    const route = getItemRoute(state.track);
    const car = state.racers[3];
    let now = 300000;
    const drive = (d) => { const w = route.toWorld(d, 0); Object.assign(car, { x: w.x, y: w.y, segmentHint: null }); now += 16.7; updateLapProgress(car, now, 1 / 60); recordTimingPoint(car, now); };
    Object.assign(car, { lap: 2, startedRaceLap: true, lapAccum: 40, trackDistance: 30, lapStartAt: now - 2000, lastLapTime: 36000 });
    const before = getRaceProgress(car);
    [20, 10, L - 5, L - 20].forEach(drive);
    const backwards = getRaceProgress(car);
    [L - 5, 10, 40].forEach(drive);
    const again = getRaceProgress(car);
    return car.lap === 2 && backwards < before && Math.abs(again - before) < 30 && car.lastLapTime === 36000;
  });

  // The place-change flash on the HUD fires when a place changes hands.
  results.placeFlash = await p.evaluate(() => {
    Game.selectCup(0); state.activeCupIndex = 0; buildCupEntries(); startRace(0);
    state.phase = "race"; state.lastTick = 400000;
    const player = getPlayer();
    const sorted = getSortedRacers();
    state.hudLastPlace = sorted.findIndex((r) => r.id === player.id) + 2;
    drawDriverHud(state.track, player);
    return state.hudPlaceFlashUntil > raceNow();
  });

  await context.close();
  return { results, errors };
}
