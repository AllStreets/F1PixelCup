// Browser check: one race clock. After the player finishes, the rest of the
// field is fast-forwarded -- and shots, oil and the safety car keep pace with
// it -- and every driver's total race time is real and shown on the results.
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
    shooter.currentItem = "debris"; useItem(shooter, raceNow());
    const s = state.shots[state.shots.length - 1];
    s.latVel = 0;
    const d0 = s.d;
    updateRace(1 / 60, now + 16.7);
    const moved = PowerUps.wrapDelta(s.d, d0, state.track.totalLength);
    return Math.abs(moved - s.speed * (7 / 60)) < 1;
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
    state.phase = "race";
    const now = performance.now();
    state.raceStart = now - 60000;
    completeRemainingFinishers(raceNow());
    return state.racers.every((r) => r.finished && r.timeEstimated === true && r.finishTime > 0);
  });

  await context.close();
  return { results, errors };
}
