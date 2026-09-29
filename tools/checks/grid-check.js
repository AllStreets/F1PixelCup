// Browser check: starting grids, qualifying and difficulty, in the real game.
// Run with the Playwright MCP tool browser_run_code_unsafe,
// filename: tools/checks/grid-check.js, dev server on http://localhost:8765.
// Expected: every value in `results` true, errors []. `measured` reports the
// difficulty margins.
// Returns { results, errors } (the shared convention of every check in tools/checks).
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
  // One failing step reports its error instead of stopping the whole check.
  const step = async (fn, arg) => { try { return await p.evaluate(fn, arg); } catch (e) { return `error: ${String(e).split("\n")[0].slice(0, 160)}`; } };
  await p.goto(`http://localhost:8765/play.html?${Date.now()}`);
  await step(() => { localStorage.removeItem("f1pixelcup.grid"); localStorage.removeItem("f1pixelcup.profile"); localStorage.removeItem("f1pixelcup.profile.v2"); localStorage.removeItem("f1pixelcup.driver"); });
  await p.reload();
  await p.waitForTimeout(1800);
  await step(() => {
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
  results.defaultFromTheBack = await step(() => {
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
  results.laterRacesByStandings = await step(() => {
    state.cupEntries.forEach((entry, i) => { entry.points = entry.isPlayer ? 99 : (i * 7) % 40; });
    state.raceIndex = 1;
    startRace(1);
    const expected = state.cupEntries.filter((e) => !e.isPlayer).map((e) => e.points);
    const got = state.gridOrder.slice(0, -1).map((id) => state.cupEntries.find((e) => e.driver.id === id).points);
    const sorted = [...got].every((v, i) => i === 0 || v <= got[i - 1]);
    return sorted && got.length === expected.length && state.gridOrder[state.gridOrder.length - 1] === getPlayer().driver.id;
  });

  // The choice persists, and is locked while a cup runs.
  results.gridChoicePersistsAndLocks = await step(() => {
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
  // ...and a reload brings it back.
  await p.reload();
  await p.waitForTimeout(1800);
  results.gridChoiceSurvivesReload = await step(() => Game.getPitLaneState().gridMode === "qualifying"
    && document.querySelector('#grid-pills [data-grid="qualifying"]').getAttribute("aria-pressed") === "true"
    && document.getElementById("grid-pills").getAttribute("role") === "group");
  await step(() => {
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

  // Timing the field never freezes the page: it runs across frames behind a
  // progress display, and no frame takes long.
  results.noHitchTimingTheField = await step(async () => {
    Game.startCup();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const panel = document.getElementById("view-loading");
    const sawTiming = state.phase === "qualifyingSim" && !panel.hidden && /Timing the field/.test(panel.textContent);
    // Frames while the field is being timed (the circuit itself is built on
    // the first frame of the session, behind the panel; that's measured apart).
    let last = performance.now();
    let worst = 0;
    let frames = 0;
    while (state.phase === "qualifyingSim") {
      await new Promise((r) => requestAnimationFrame(r));
      const t = performance.now();
      if (frames > 0) worst = Math.max(worst, t - last);
      last = t;
      frames += 1;
    }
    window.__worstFrame = worst;
    return (sawTiming && frames > 3 && worst < 100 && state.phase === "qualifying") || JSON.stringify({ sawTiming, frames, worst: Math.round(worst), phase: state.phase });
  });

  // The timed laps leave nothing behind: no particles, the real Math.random,
  // the real field, world box, track, feed and clock.
  results.simLeavesNoTrace = await step(() => {
    const before = { random: Math.random, racers: state.racers, world: JSON.stringify(WORLD), track: state.track, feed: state.feed.length, particles: state.particles.length, lastTick: state.lastTick };
    const entry = state.cupEntries.find((e) => !e.isPlayer);
    simulateQualifyingLapSeeded(entry, TRACKS[3], 77);
    const same = Math.random === before.random && state.racers === before.racers && JSON.stringify(WORLD) === before.world
      && state.track === before.track && state.feed.length === before.feed && state.particles.length === before.particles && state.lastTick === before.lastTick;
    return same && before.particles === 0;
  });

  // A sim that throws still puts everything back, and the lap just has no time.
  results.simThrowIsSafe = await step(() => {
    const before = { random: Math.random, racers: state.racers, world: JSON.stringify(WORLD), track: state.track };
    const real = window.updateRacer;
    window.updateRacer = () => { throw new Error("test: sim crashed"); };
    let out;
    try { out = simulateQualifyingLapSeeded(state.cupEntries.find((e) => !e.isPlayer), TRACKS[0], 5); } catch (e) { out = "threw"; }
    window.updateRacer = real;
    return out !== "threw" && out.timeMs === null && Math.random === before.random && state.racers === before.racers
      && JSON.stringify(WORLD) === before.world && state.track === before.track;
  });

  // The CPU laps really use the difficulty: the same driver and seed laps quicker on Legend than Rookie.
  results.simUsesDifficulty = await step(() => {
    const entry = state.cupEntries.find((e) => !e.isPlayer);
    const saved = state.cupDifficulty;
    state.cupDifficulty = 0; const rookie = simulateQualifyingLapSeeded(entry, state.track, 42).timeMs;
    state.cupDifficulty = 2; const legend = simulateQualifyingLapSeeded(entry, state.track, 42).timeMs;
    state.cupDifficulty = saved;
    return legend < rookie * 0.97;
  });

  // Qualifying: alone on track, items off, CPU times simulated for real.
  results.qualifyingSession = await step(() => {
    const q = state.qualifying;
    return state.phase === "qualifying" && state.racers.length === 1 && state.racers[0].isPlayer
      && state.boxHiddenUntil.every((t) => t === Infinity)
      && q && q.times.length === 19 && q.times.every((t) => t.timeMs > 0 && Array.isArray(t.splits));
  });

  // The player's qualifying car steps at the same fixed 1/60 s as the CPU laps, whatever the frame rate.
  results.fixedStepQualifying = await step(() => {
    const q = state.qualifying;
    const start = state.lastTick;
    let now = performance.now();
    [50, 33, 8, 120].forEach((ms) => { now += ms; updateQualifying(ms / 1000, now); });
    const moved = state.lastTick - start;
    const steps = moved / (1000 / 60);
    return q && Math.abs(steps - Math.round(steps)) < 1e-6 && steps > 0;
  });

  // "Get ready" waits for the 3D world, and a pause doesn't eat into it.
  results.readyWaitsAndPauses = await step(async () => {
    Game.backToPitLane(); Game.startCup();
    while (state.phase === "qualifyingSim") await new Promise((r) => requestAnimationFrame(r));
    const q = state.qualifying;
    const wasReady = Render3D.ready;
    Render3D.ready = false;
    const d0 = getPlayer().trackDistance;
    const r0 = q.readyElapsed;
    let now = performance.now();
    for (let i = 0; i < 180; i += 1) { now += 1000 / 60; updateQualifying(1 / 60, now); }
    const heldWhileLoading = q.readyElapsed === r0 && r0 < QUALI_READY_MS && getPlayer().trackDistance === d0;
    Render3D.ready = wasReady;
    togglePause();
    await new Promise((r) => setTimeout(r, 2200));
    togglePause();
    const stillGettingReady = q.readyElapsed < QUALI_READY_MS;
    return heldWhileLoading && stillGettingReady;
  });

  // P pauses qualifying too.
  results.pKeyPausesQualifying = await step(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "p" }));
    const paused = state.paused;
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "p" }));
    return paused && !state.paused;
  });

  // A hidden tab pauses qualifying too.
  results.hiddenTabPausesQualifying = await step(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
    const paused = state.paused && state.phase === "qualifying";
    delete document.hidden;
    if (state.paused) togglePause();
    return paused;
  });

  // The session's messages reach the ticker.
  results.qualifyingFeedShows = await step(() => /qualifying/i.test(document.getElementById("ticker").textContent));

  // A CPU time is a real simulated lap: the same seed simulates the same lap.
  results.cpuTimesAreSimulated = await step(() => {
    const q = state.qualifying;
    const sample = q.times[4];
    const entry = state.cupEntries.find((e) => e.driver.id === sample.id);
    const again = simulateQualifyingLapSeeded(entry, state.track, sample.seed);
    return again.timeMs === sample.timeMs;
  });

  // The player's lap is timed at the line, to the millisecond, with a live
  // delta to the provisional pole at the timing points.
  results.playerLapTimed = await step(() => {
    const player = getPlayer();
    player.isPlayer = false; // autopilot for the check
    let now = performance.now();
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
    return state.phase === "qualifyingResults" && q.playerTimeMs > 10000 && Math.abs(k - Math.round(k)) > 1e-6 && sawDelta && worstDelta < 5000
      && player.finished === true;
  });

  // The classification: the Start button has focus, Enter starts the race, and it says when points count.
  results.classificationKeyboard = await step(() => {
    const focused = document.activeElement && document.activeElement.dataset.action === "race";
    const note = /count when you finish the race/i.test(document.getElementById("qualifying-screen").textContent);
    const rowsUseId = [...document.querySelectorAll("#qualifying-screen .quali-row")].every((r) => r.dataset.id && r.dataset.driver === undefined);
    return focused && note && rowsUseId;
  });

  // The classification: 20 rows in time order, pole highlighted; the race grid is that order.
  results.classificationSetsGrid = await step(() => {
    const rows = [...document.querySelectorAll("#qualifying-screen .quali-row")];
    const visible = !document.getElementById("qualifying-screen").classList.contains("hidden");
    const order = state.qualifying.order;
    // Enter starts the race from the classification.
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    return visible && rows.length === 20 && rows[0].classList.contains("is-pole")
      && rows.every((row, i) => row.dataset.id === order[i])
      && state.phase === "countdown" && state.gridOrder.join() === order.join();
  });

  // Qualifying is worth career points and counts poles.
  results.careerCountsQualifying = await step(() => {
    const player = getPlayer();
    const qPos = state.qualifying.order.indexOf(player.driver.id) + 1;
    state.phase = "race";
    state.raceStart = state.lastTick = performance.now();
    completeRemainingFinishers(raceNow());
    finalizeRace();
    const profile = Career.getDriver(player.driver.id);
    const last = profile.history[profile.history.length - 1];
    const award = Career.qualifyingAward({ position: qPos, difficulty: getDifficulty().id });
    const strip = document.getElementById("results-career").textContent;
    const adds = profile.careerPoints === last.careerPointsEarned + last.qualifying.careerPoints;
    Screens.showCareer();
    const careerText = document.getElementById("career-screen").textContent;
    Screens.closeOverlay();
    return last.qualifying && last.qualifying.position === qPos && last.qualifying.careerPoints === award.careerPoints
      && profile.totals.poles === (qPos === 1 ? 1 : 0) && adds
      && /Poles/.test(careerText) && careerText.includes(`P${qPos}`)
      && strip.includes(`Qualifying P${qPos}`);
  });

  // One flying lap means one: backing over the line aborts it (no time), and a lap that never
  // comes in is ended at the limit, counted from the release.
  results.oneFlyingLapOnly = await step(async () => {
    Game.backToPitLane(); Game.startCup();
    while (state.phase === "qualifyingSim") await new Promise((r) => requestAnimationFrame(r));
    const player = getPlayer();
    const q = state.qualifying;
    q.readyElapsed = QUALI_READY_MS; q.handedOver = true; player.qualiAutopilot = false;
    const L = state.track.totalLength;
    const route = getItemRoute(state.track);
    let now = performance.now();
    const drive = (d) => { const w = route.toWorld(d, 0); Object.assign(player, { x: w.x, y: w.y, speed: 0, segmentHint: null }); now += 16.7; updateLapProgress(player, raceNow() + 16.7, 1 / 60); };
    [L - 20, L - 5, 10, 30].forEach(drive); // over the line: lap started
    const started = player.startedRaceLap;
    [10, L - 5].forEach(drive); // and back over it
    const aborted = state.phase === "qualifyingResults" && q.playerTimeMs === null && q.aborted === true;
    Game.backToPitLane(); Game.startCup();
    while (state.phase === "qualifyingSim") await new Promise((r) => requestAnimationFrame(r));
    state.qualifying.readyElapsed = QUALI_READY_MS; state.qualifying.handedOver = true; getPlayer().qualiAutopilot = false;
    state.qualifying.releasedAt = state.lastTick - QUALI_TIME_LIMIT_MS - 1;
    updateQualifying(1 / 60, performance.now());
    const timedOut = state.phase === "qualifyingResults" && state.qualifying.playerTimeMs === null;
    return started && aborted && timedOut;
  });

  // Esc pauses qualifying; Q from the pause leaves for the pit lane.
  results.escAndQuitInQualifying = await step(async () => {
    Game.backToPitLane();
    Game.startCup();
    while (state.phase === "qualifyingSim") await new Promise((r) => requestAnimationFrame(r));
    const inQuali = state.phase === "qualifying";
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    const paused = state.paused;
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "q" }));
    return inQuali && paused && state.phase === "garage" && !state.paused;
  });

  // A from-the-back cup records no qualifying at all.
  results.fromBackRecordsNoQualifying = await step(() => {
    Game.backToPitLane();
    Game.selectGridMode("back");
    const me = DRIVERS[state.selectedDriver].id;
    const before = Career.getDriver(me).history.length;
    Game.startCup();
    state.phase = "race";
    state.raceStart = state.lastTick = performance.now();
    completeRemainingFinishers(raceNow());
    finalizeRace();
    const h = Career.getDriver(me).history;
    return h.length === before + 1 && h[h.length - 1].qualifying === null;
  });

  // A new circuit is built behind a panel before the lights come on: the lights never jump.
  results.circuitBuiltBeforeLights = await step(async () => {
    Game.backToPitLane();
    Game.selectGridMode("back");
    Game.selectCup(1); // a cup whose circuits haven't been built in this page yet
    Game.startCup();
    await new Promise((r) => requestAnimationFrame(r));
    const panel = document.getElementById("view-loading");
    const building = Boolean(state.preparing) && !panel.hidden && /Building the circuit/.test(panel.textContent);
    while (state.preparing) await new Promise((r) => requestAnimationFrame(r));
    const lightsFrom = state.countdownStart;
    Game.backToPitLane();
    Game.selectCup(0);
    Game.selectGridMode("qualifying");
    // The lights start from the moment the circuit finished building, not before.
    return (building && lightsFrom >= state.preparedAt - 0.5) || JSON.stringify({ building, lightsFrom, preparedAt: state.preparedAt });
  });

  // No item box on the grid or the qualifying roll-in, on any circuit: every box
  // is well clear of all 20 grid slots and of the line the qualifying car rolls
  // in on. And the boxes the 3D world draws are exactly the game's boxes.
  results.noBoxesOnGrid = await step(() => {
    const bad = [];
    TRACKS.forEach((track) => {
      const route = getItemRoute(track);
      const L = track.totalLength;
      const spots = layoutGrid(track, 20).map((slot) => ({ x: slot.x, y: slot.y }));
      for (let d = L - QUALI_RUN_UP - QUALI_RUN_IN; d <= L + 150; d += 15) spots.push(route.toWorld(d % L, 0));
      track.itemBoxes.forEach((box) => {
        const gap = Math.min(...spots.map((s) => Math.hypot(s.x - box.x, s.y - box.y)));
        if (gap < 90) bad.push(`${track.id} (${box.x}, ${box.y}) ${Math.round(gap)}`);
      });
      if (track.itemBoxes.length < 9) bad.push(`${track.id} has ${track.itemBoxes.length} boxes`);
    });
    const drawn = Render3D.inspect().boxScales.length === state.track.itemBoxes.length;
    return (bad.length === 0 && drawn) || JSON.stringify({ bad, drawn });
  });

  // Difficulty really changes the CPU drivers: Rookie is slower than Pro, Pro
  // slower than Legend -- alone on track (qualifying laps) and in full races.
  const ladder = await step(() => {
    Game.backToPitLane();
    // The field itself is drawn at random: seed that too, so every run measures the same drivers.
    seedRandom(1);
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
        // No player in this race, so no catch-up: this measures the driving alone.
        state.playerId = null;
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
  // The README states the measured margins: Pro 7-15% quicker than Rookie, Legend 2.5-9.5% quicker than Pro.
  const ordered = (xs) => xs[0] > xs[1] * 1.05 && xs[1] > xs[2] * 1.02;
  results.difficultyLadder = Object.values(ladder.lap).every(ordered) && Object.values(ladder.race).every(ordered);

  await context.close();
  return { results, measured, errors };
}
