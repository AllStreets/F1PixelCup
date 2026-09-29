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
    const onFrames = order.filter((r) => { const k = r.finishTime / frame; return Math.abs(k - Math.round(k)) < 0.001; }).length;
    window.__onFrames = onFrames;
    return flagged && increasing && possible && state.phase === "results" && onFrames <= 2;
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
    Game.selectCup(0); state.activeCupIndex = 0; buildCupEntries(); startRace(0);
    state.phase = "race";
    const [first, second] = state.racers;
    state.raceStart = 1000;
    finishRacer(first, 181000.9);
    finishRacer(second, 181000.2);
    settleFinishers();
    return second.finishPosition === 1 && first.finishPosition === 2;
  });

  // A slow machine: 20 frames a second. Physics steps are capped, and the race
  // clock follows the physics, so times match the same race run smoothly.
  const raceWinner = (frameMs) => p.evaluate((frameMs) => {
    Game.selectCup(0); state.activeCupIndex = 0; buildCupEntries(); startRace(0);
    state.racers.forEach((r) => { r.isPlayer = false; });
    state.phase = "race";
    let now = 100000;
    state.raceStart = now;
    state.racers.forEach((r) => { r.lapStartAt = now; });
    const dt = Math.min(frameMs / 1000, 0.033);
    let guard = 0;
    while (!state.resultsQueued && guard < 200000) { now += frameMs; updateRace(dt, now); guard += 1; }
    const winner = [...state.racers].sort((a, b) => a.finishPosition - b.finishPosition)[0];
    return { time: winner.finishTime, best: Math.min(...state.racers.map((r) => r.bestLapTime || Infinity)) };
  }, frameMs);
  const smooth = await raceWinner(1000 / 60);
  const choppy = await raceWinner(50);
  results.slowMachineTimesReal = Math.abs(choppy.time / smooth.time - 1) < 0.05 && Math.abs(choppy.best / smooth.best - 1) < 0.05;

  // The timing tower shows real time gaps: finished cars by finish time,
  // cars still running by the time they passed the same timing point.
  results.towerGapsAreTimes = await p.evaluate(() => {
    Game.selectCup(0); state.activeCupIndex = 0; buildCupEntries(); startRace(0);
    state.racers.forEach((r) => { r.isPlayer = false; });
    state.phase = "race";
    let now = 100000;
    state.raceStart = now;
    state.racers.forEach((r) => { r.lapStartAt = now; });
    for (let i = 0; i < 60 * 70; i += 1) { now += 1000 / 60; updateRace(1 / 60, now); }
    const standings = getRaceStandings();
    const sorted = getSortedRacers();
    const leader = sorted[0];
    const okRunning = sorted.slice(1, 8).every((r, i) => {
      const expected = timeGap(r, leader);
      return expected !== null && standings[i + 1].gap === `+${formatGap(expected / 1000)}`;
    });
    return okRunning && standings[0].gap === "LEADER";
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

  await context.close();
  return { results, errors };
}
