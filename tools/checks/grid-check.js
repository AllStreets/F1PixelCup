// Browser check: starting grids, qualifying and difficulty, in the real game.
// Run with the Playwright MCP tool browser_run_code_unsafe,
// filename: tools/checks/grid-check.js, dev server on http://localhost:8765.
// Expected: every value in `results` true, errors []. `measured` reports the
// difficulty margins.
async (page) => {
  const errors = [];
  const results = {};
  const measured = {};
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
  await p.evaluate(() => { localStorage.removeItem("f1pixelcup.grid"); localStorage.removeItem("f1pixelcup.profile"); });
  await p.reload();
  await p.waitForTimeout(1800);
  await p.evaluate(() => {
    window.seedRandom = (seed) => {
      let s32 = seed >>> 0;
      Math.random = () => {
        s32 = (s32 + 0x6d2b79f5) >>> 0;
        let t = Math.imul(s32 ^ (s32 >>> 15), 1 | s32);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    };
  });

  // Default: from the back. The player lines up 20th.
  results.defaultFromTheBack = await p.evaluate(() => {
    const pit = Game.getPitLaneState();
    const pill = document.querySelector('#grid-pills [data-grid="back"]');
    Game.startCup();
    const player = getPlayer();
    const last = state.gridOrder[state.gridOrder.length - 1];
    // The last row is two cars side by side: the player is in it.
    const L = state.track.totalLength;
    const back = (r) => (r.trackDistance + L / 2) % L;
    const lastRow = Math.min(...state.racers.map(back));
    return pit.gridMode === "back" && pill && pill.classList.contains("is-on")
      && last === player.driver.id && Math.abs(back(player) - lastRow) < 1;
  });

  // Race two lines up by cup standings, leader on pole, player still last.
  results.laterRacesByStandings = await p.evaluate(() => {
    state.cupEntries.forEach((entry, i) => { entry.points = entry.isPlayer ? 99 : (i * 7) % 40; });
    state.raceIndex = 1;
    startRace(1);
    const expected = state.cupEntries.filter((e) => !e.isPlayer).map((e) => e.points);
    const got = state.gridOrder.slice(0, -1).map((id) => state.cupEntries.find((e) => e.driver.id === id).points);
    const sorted = [...got].every((v, i) => i === 0 || v <= got[i - 1]);
    return sorted && got.length === expected.length && state.gridOrder[state.gridOrder.length - 1] === getPlayer().driver.id;
  });

  // The choice persists, and is locked while a cup runs.
  results.gridChoicePersistsAndLocks = await p.evaluate(() => {
    Game.backToPitLane();
    Game.selectGridMode("qualifying");
    const saved = localStorage.getItem("f1pixelcup.grid") === "qualifying";
    const pill = document.querySelector('#grid-pills [data-grid="qualifying"]');
    const on = pill && pill.classList.contains("is-on");
    Game.startCup();
    Game.selectGridMode("back");
    const locked = state.gridMode === "qualifying" && state.cupGridMode === "qualifying";
    return saved && on && locked;
  });

  // Qualifying: alone on track, items off, CPU times simulated for real.
  results.qualifyingSession = await p.evaluate(() => {
    const q = state.qualifying;
    return state.phase === "qualifying" && state.racers.length === 1 && state.racers[0].isPlayer
      && state.boxHiddenUntil.every((t) => t === Infinity)
      && q && q.times.length === 19 && q.times.every((t) => t.timeMs > 0 && Array.isArray(t.splits));
  });

  // A CPU time is a real simulated lap: the same seed simulates the same lap.
  results.cpuTimesAreSimulated = await p.evaluate(() => {
    const q = state.qualifying;
    const sample = q.times[4];
    const entry = state.cupEntries.find((e) => e.driver.id === sample.id);
    const again = simulateQualifyingLapSeeded(entry, state.track, sample.seed);
    return again.timeMs === sample.timeMs;
  });

  // The player's lap is timed at the line, to the millisecond, with a live
  // delta to the provisional pole at the timing points.
  results.playerLapTimed = await p.evaluate(() => {
    const player = getPlayer();
    player.isPlayer = false; // autopilot for the check
    let now = state.lastTick;
    let sawDelta = false;
    let worstDelta = 0;
    for (let i = 0; i < 60 * 120 && state.phase === "qualifying"; i += 1) {
      now += 1000 / 60;
      updateQualifying(1 / 60, now);
      const delta = qualifyingDeltaNow();
      if (delta !== null) { sawDelta = true; worstDelta = Math.max(worstDelta, Math.abs(delta)); }
    }
    // Driven by the same AI, the player's car is never seconds adrift of the
    // provisional pole at a timing point -- the delta is measured like for like.
    window.__worstDelta = worstDelta;
    player.isPlayer = true;
    const q = state.qualifying;
    const frame = 1000 / 60;
    const k = q.playerTimeMs / frame;
    return state.phase === "qualifyingResults" && q.playerTimeMs > 10000 && Math.abs(k - Math.round(k)) > 1e-6 && sawDelta && worstDelta < 5000;
  });

  // The classification: 20 rows in time order, pole highlighted; the race grid is that order.
  results.classificationSetsGrid = await p.evaluate(() => {
    const rows = [...document.querySelectorAll("#qualifying-screen .quali-row")];
    const visible = !document.getElementById("qualifying-screen").classList.contains("hidden");
    const order = state.qualifying.order;
    Game.startRaceFromQualifying();
    return visible && rows.length === 20 && rows[0].classList.contains("is-pole")
      && rows.every((row, i) => row.dataset.driver === order[i])
      && state.phase === "countdown" && state.gridOrder.join() === order.join();
  });

  // Qualifying is worth career points and counts poles.
  results.careerCountsQualifying = await p.evaluate(() => {
    const player = getPlayer();
    const qPos = state.qualifying.order.indexOf(player.driver.id) + 1;
    state.phase = "race";
    state.raceStart = state.lastTick = performance.now();
    completeRemainingFinishers(raceNow());
    finalizeRace();
    const profile = Career.getProfile();
    const last = profile.history[profile.history.length - 1];
    const award = Grid.qualifyingAward({ position: qPos, difficulty: getDifficulty().id });
    const strip = document.getElementById("results-career").textContent;
    return last.qualifying && last.qualifying.position === qPos && last.qualifying.careerPoints === award.careerPoints
      && profile.totals.poles === (qPos === 1 ? 1 : 0)
      && (award.careerPoints === 0 || strip.includes(`Qualifying P${qPos}`));
  });

  // Esc pauses qualifying; Q from the pause leaves for the pit lane.
  results.escAndQuitInQualifying = await p.evaluate(async () => {
    Game.backToPitLane();
    Game.startCup();
    const inQuali = state.phase === "qualifying";
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    const paused = state.paused;
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "q" }));
    return inQuali && paused && state.phase === "garage" && !state.paused;
  });

  // Difficulty really changes the CPU drivers: Rookie is slower than Pro, Pro
  // slower than Legend -- alone on track (qualifying laps) and in full races.
  const ladder = await p.evaluate(() => {
    Game.backToPitLane();
    buildCupEntries();
    const lap = {};
    ["monza", "monaco", "suzuka"].forEach((id) => {
      const track = TRACKS.find((t) => t.id === id);
      lap[id] = [0, 1, 2].map((diff) => {
        state.difficulty = diff;
        seedRandom(5);
        const t = state.cupEntries.map((e) => simulateQualifyingLap(e, track).timeMs).filter(Boolean).sort((a, b) => a - b);
        return t[Math.floor(t.length / 2)];
      });
    });
    const race = {};
    [0, 2].forEach((ti) => {
      race[TRACKS[ti].id] = [0, 1, 2].map((diff) => {
        seedRandom(31 + ti);
        // A race uses the difficulty the cup started with.
        state.difficulty = diff;
        state.cupDifficulty = diff;
        Game.selectCup(0); state.activeCupIndex = 0; buildCupEntries(); startRace(ti);
        state.racers.forEach((r) => { r.isPlayer = false; });
        state.phase = "race";
        let now = 100000; state.raceStart = now; state.lastTick = now;
        state.racers.forEach((r) => { r.lapStartAt = now; });
        for (let t = 0; t < 900 && !state.resultsQueued; t += 1 / 60) { state.boxHiddenUntil = state.track.itemBoxes.map(() => Infinity); now += 1000 / 60; updateRace(1 / 60, now); }
        return state.racers.map((r) => r.finishTime).sort((a, b) => a - b)[10];
      });
    });
    state.difficulty = 1;
    return { lap, race };
  });
  measured.ladder = ladder;
  const ordered = (xs) => xs[0] > xs[1] * 1.02 && xs[1] > xs[2] * 1.02;
  results.difficultyLadder = Object.values(ladder.lap).every(ordered) && Object.values(ladder.race).every(ordered);

  await context.close();
  return { results, measured, errors };
}
