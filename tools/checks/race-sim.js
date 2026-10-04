// Browser check: run a full five-lap race on every circuit with every car on
// autopilot, and report laps and lap times. Run with the Playwright MCP tool
// browser_run_code_unsafe, filename: tools/checks/race-sim.js, with the dev
// server on http://localhost:8765. Expected: every circuit finished: 20,
// laps [5,5], no errors.
// Returns { results, errors } (the shared convention of every check in tools/checks).
async (page) => {
  // Keep the test tool's own empty tab (about:blank) out of the way.
  try {
    const own = await page.context().newCDPSession(page);
    const { windowId: ownWindow } = await own.send("Browser.getWindowForTarget");
    await own.send("Browser.setWindowBounds", { windowId: ownWindow, bounds: { windowState: "minimized" } });
  } catch (e) { /* not fatal */ }
  const errors = [];
  const context = await page.context().browser().newContext({ viewport: null });
  const p = await context.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  // play.html arrives in Task 3; before that the game is index.html.
  const response = await p.goto(`http://localhost:8765/play.html?${Date.now()}`);
  if (!response || !response.ok()) await p.goto(`http://localhost:8765/?${Date.now()}`);
  await p.waitForTimeout(800);
  const results = await p.evaluate(() => {
    const out = [];
    // Every circuit once (the season races them all again).
    const all = CUPS.flatMap((cup, ci) => (cup.season ? [] : cup.tracks.map((t, ti) => [ci, ti])));
    for (const [ci, ti] of all) {
      state.selectedCup = ci;
      state.activeCupIndex = ci;
      buildCupEntries();
      startRace(ti);
      state.racers.forEach((r) => { r.isPlayer = false; });
      state.phase = "race";
      let now = 100000;
      state.raceStart = now;
      state.racers.forEach((r) => { r.lapStartAt = now; });
      const dt = 1 / 60;
      let t = 0;
      while (t < 900 && !state.racers.every((r) => r.finished)) {
        now += dt * 1000; t += dt;
        updateRace(dt, now);
      }
      const laps = state.racers.map((r) => r.lap);
      const best = state.racers.map((r) => r.bestLapTime).filter(Boolean).sort((a, b) => a - b);
      out.push({
        track: state.track.id,
        finished: state.racers.filter((r) => r.finished).length,
        laps: [Math.min(...laps), Math.max(...laps)],
        fastestLap: best.length ? (best[0] / 1000).toFixed(1) : null,
        medianLap: best.length ? (best[Math.floor(best.length / 2)] / 1000).toFixed(1) : null,
      });
    }
    return out;
  });
  await context.close();
  return { results, errors };
}
