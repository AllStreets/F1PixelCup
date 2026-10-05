// Browser check: the season (docs/superpowers/specs/2026-10-01-calendar-design.md,
// section 4). A season starts from the pit lane, its first race is run to the
// flag, the standings are saved; a reload offers to resume it and resumes at
// race 2 with the same standings, driver and settings; "New season" asks once
// more before it starts over. Run with the Playwright MCP tool
// browser_run_code_unsafe, filename: tools/checks/season-check.js, dev
// server on http://localhost:8765. Expected: every value in `results` true,
// errors []. Returns { results, errors }.
async (page) => {
  try {
    const own = await page.context().newCDPSession(page);
    const { windowId } = await own.send("Browser.getWindowForTarget");
    await own.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "minimized" } });
  } catch (e) { /* not fatal */ }
  const errors = [];
  const results = {};
  const context = await page.context().browser().newContext({ viewport: null });
  const p = await context.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  const open = async () => {
    await p.goto(`http://localhost:8765/play.html?${Date.now()}`);
    await p.waitForFunction(() => window.Game && window.Season, null, { timeout: 30000 });
  };
  const step = async (fn, arg) => { try { return await p.evaluate(fn, arg); } catch (e) { return `error: ${String(e).split("\n")[0].slice(0, 200)}`; } };
  await open();
  await step(() => { localStorage.removeItem(Season.STORAGE_KEY); localStorage.removeItem("f1pixelcup.cup"); });
  await open();

  // The season is a choice after the cups; it races all 24 of the calendar in order.
  results.seasonOnOffer = await step(() => {
    const cups = Game.getPitLaneState().cups;
    const season = cups.find((c) => c.season);
    const shown = (() => { Game.selectCup(cups.indexOf(season)); return document.getElementById("cup-circuits").textContent; })();
    Game.selectCup(0);
    // The six calendar cups, the two historic cups, then the season (the
    // calendar only: no historic circuit in it).
    const ok = cups.length === CUP_DEFS.length + 1 && cups[cups.length - 1] === season && season && season.name === "2025 Season" && season.circuits.length === 24
      && !CIRCUITS.filter((c) => c.historic).some((c) => season.circuits.includes(c.name))
      && shown === `24 rounds: ${CIRCUITS[0].name} to ${CIRCUITS[23].name}`
      && season.circuits[0] === CIRCUITS[0].name && season.circuits[23] === CIRCUITS[23].name;
    return ok || JSON.stringify(cups.map((c) => [c.name, c.circuits.length]));
  });

  // Start it as Hamilton on Legend, from the back, and run race 1 to the flag
  // with every car on autopilot.
  results.firstRaceSaved = await step(() => {
    const index = Game.getPitLaneState().cups.findIndex((c) => c.season);
    Game.selectCup(index);
    Game.selectDriver(DRIVERS.findIndex((d) => d.id === "hamilton"));
    Game.selectDifficulty(2);
    Game.selectGridMode("back");
    Game.selectWeatherMode("dry");
    Game.startCup();
    if (state.track.id !== "albertpark" || state.raceIndex !== 0) return `started at ${state.track.id} ${state.raceIndex}`;
    state.racers.forEach((r) => { r.isPlayer = false; });
    state.phase = "race";
    let now = 100000;
    state.raceStart = now;
    state.lastTick = now;
    state.racers.forEach((r) => { r.lapStartAt = now; });
    for (let t = 0; t < 900 && state.phase === "race"; t += 1 / 60) { now += 1000 / 60; updateRace(1 / 60, now); }
    const saved = Season.parse(localStorage.getItem(Season.STORAGE_KEY), { trackIds: SEASON.circuitIds, field: DRIVERS.map((d) => d.id), teamOf: Object.fromEntries(DRIVERS.map((d) => [d.id, d.teamId])) });
    if (!saved) return `phase ${state.phase}, nothing saved`;
    const table = Season.driverStandings(saved);
    const total = table.reduce((a, r) => a + r.points, 0);
    const shown = state.cupEntries.map((e) => [e.driver.id, e.points]);
    // 25 to 1 is 101, and one more if the fastest lap was in the top ten.
    const ok = state.phase === "results" && saved.nextRace === 1 && saved.driverId === "hamilton" && saved.difficulty === "legend"
      && (total === 101 || total === 102)
      && JSON.stringify(shown) === JSON.stringify(table.map((r) => [r.driverId, r.points]))
      && !document.getElementById("results-standings").classList.contains("hidden")
      // The season's tables: the 20 drivers, then the 10 constructors.
      && document.querySelectorAll("#results-standings .result-row").length === 30;
    window.__seasonRun = saved.runId;
    return ok || JSON.stringify({ phase: state.phase, next: saved.nextRace, total, driver: saved.driverId });
  });

  // Leave, pick someone else, reload: the pit lane offers race 2, and starting
  // resumes it with the saved driver, difficulty and standings.
  const before = await step(() => ({ run: window.__seasonRun, table: JSON.stringify(Season.driverStandings(Season.parse(localStorage.getItem(Season.STORAGE_KEY), { trackIds: SEASON.circuitIds, field: DRIVERS.map((d) => d.id), teamOf: Object.fromEntries(DRIVERS.map((d) => [d.id, d.teamId])) })).map((r) => [r.driverId, r.points])) }));
  await step(() => { Game.backToPitLane(); Game.selectDriver(DRIVERS.findIndex((d) => d.id === "leclerc")); Game.selectDifficulty(0); });
  await open();
  results.resumes = await step((before) => {
    const s = Game.getPitLaneState();
    const label = document.getElementById("start-cup").textContent;
    const remembered = s.cups[s.selectedCup].season;
    if (!remembered || !s.savedSeason || s.savedSeason.nextRace !== 2 || !/Resume season · Race 2 of 24/.test(label)) return JSON.stringify({ remembered, saved: s.savedSeason, label });
    Game.startCup();
    const table = JSON.stringify(state.cupEntries.map((e) => [e.driver.id, e.points]));
    const ok = state.raceIndex === 1 && state.track.id === "shanghai" && getPlayer().driver.id === "hamilton"
      && getDifficulty().id === "legend" && state.cupRunId === before.run && table === before.table;
    return ok || JSON.stringify({ race: state.raceIndex, track: state.track.id, driver: getPlayer().driver.id, diff: getDifficulty().id, run: state.cupRunId === before.run, same: table === before.table });
  }, before);

  // Quit in the middle of race 2: it isn't counted, and the season resumes at race 2.
  results.quitMidRaceResumesThere = await step(() => {
    state.racers.forEach((r) => { r.isPlayer = false; });
    state.phase = "race";
    let now = 100000; state.raceStart = now; state.lastTick = now;
    for (let t = 0; t < 8; t += 1 / 60) { now += 1000 / 60; updateRace(1 / 60, now); }
    Game.backToPitLane();
    const s = Game.getPitLaneState();
    // And the pit lane's own driver is back (the season raced Hamilton).
    return (s.savedSeason && s.savedSeason.nextRace === 2 && s.driver.id === "leclerc") || JSON.stringify({ saved: s.savedSeason, driver: s.driver.id });
  });

  // "New season" asks once more, then starts over at race 1 with a new run.
  results.newSeasonAsksFirst = await step((before) => {
    Game.backToPitLane();
    Game.newSeason();
    const asking = state.phase === "garage" && /Click again/.test(document.getElementById("new-season").textContent);
    Game.newSeason();
    const ok = asking && state.phase !== "garage" && state.raceIndex === 0 && state.track.id === "albertpark" && state.cupRunId !== before.run
      && state.cupEntries.every((e) => e.points === 0);
    Game.backToPitLane();
    return ok || JSON.stringify({ asking, phase: state.phase, race: state.raceIndex, run: state.cupRunId === before.run });
  }, before);

  // A historic cup's circuits name their layouts in the pit lane.
  results.historicErasShown = await step(() => {
    const cups = Game.getPitLaneState().cups;
    const i = CUPS.findIndex((c) => c.id === "legendsCup");
    Game.selectCup(i);
    const text = document.getElementById("cup-circuits").textContent;
    Game.selectCup(0);
    const ok = CUPS[i].tracks.every((t) => text.includes(t.name) && t.era && text.includes(t.era)) && cups[i].eras.every(Boolean);
    return ok || text.slice(0, 300);
  });

  // The season is one player's: with two players picked, choosing it shows
  // one player (the second greyed out) and starts with one.
  results.seasonIsOnePlayer = await step(() => {
    localStorage.removeItem(Season.STORAGE_KEY);
    Game.selectCup(0);
    Game.selectPlayers(2);
    Game.selectCup(Game.getPitLaneState().cups.findIndex((c) => c.season));
    const two = document.querySelector('#players-pills [data-players="2"]');
    const shows = two.disabled && !two.classList.contains("is-on") && document.getElementById("second-driver").hidden;
    Game.startCup();
    const players = state.cupPlayers;
    Game.backToPitLane();
    Game.selectCup(0);
    Game.selectPlayers(1);
    return (shows && players === 1) || JSON.stringify({ shows, players });
  });

  // A broken save is ignored: the season simply starts fresh.
  results.brokenSaveIgnored = await step(() => {
    Game.selectCup(Game.getPitLaneState().cups.findIndex((c) => c.season));
    localStorage.setItem(Season.STORAGE_KEY, "{\"version\":1,\"results\":[1]}");
    const s = Game.getPitLaneState();
    return (s.cups[s.selectedCup].season && s.savedSeason === null) || JSON.stringify({ season: s.cups[s.selectedCup].season, saved: s.savedSeason });
  });

  // With qualifying, a season's weekend starts with the qualifying lap.
  results.qualifyingInASeason = await step(() => {
    localStorage.removeItem(Season.STORAGE_KEY);
    Game.selectGridMode("qualifying");
    Game.startCup();
    const ok = /qualifying/i.test(state.phase) && state.track.id === "albertpark" && state.cupGridMode === "qualifying";
    const phase = state.phase;
    Game.backToPitLane();
    Game.selectGridMode("back");
    return ok || JSON.stringify({ phase, track: state.track.id });
  });

  // The last race: run to the flag, the save is cleared, the championship is
  // recorded in the career exactly once, and the podium names both champions.
  results.lastRaceCrowns = await step(() => {
    const ctx = { trackIds: SEASON.circuitIds, field: DRIVERS.map((d) => d.id), teamOf: Object.fromEntries(DRIVERS.map((d) => [d.id, d.teamId])) };
    let season = Season.start({ runId: "check-final", driverId: "leclerc", difficulty: "pro", gridMode: "back", weatherMode: "dry", ...ctx });
    for (let i = 0; i < 23; i += 1) season = Season.addRace(season, { order: [...ctx.field], fastest: null });
    localStorage.setItem(Season.STORAGE_KEY, Season.serialize(season));
    Game.selectCup(Game.getPitLaneState().cups.findIndex((c) => c.season));
    Game.startCup();
    if (state.raceIndex !== 23 || state.track.id !== "yasmarina") return `resumed at ${state.raceIndex} ${state.track.id}`;
    state.racers.forEach((r) => { r.isPlayer = false; });
    state.phase = "race";
    let now = 100000; state.raceStart = now; state.lastTick = now;
    state.racers.forEach((r) => { r.lapStartAt = now; });
    for (let t = 0; t < 900 && state.phase === "race"; t += 1 / 60) { now += 1000 / 60; updateRace(1 / 60, now); }
    const cleared = localStorage.getItem(Season.STORAGE_KEY) === null;
    Game.nextRace();
    const podium = state.phase === "podium";
    const kicker = document.getElementById("podium-kicker").textContent;
    const title = document.getElementById("podium-title").textContent;
    const cups = Career.getDriver("leclerc").history.filter((h) => h.type === "cup" && h.cupRunId === "check-final").length;
    Game.backToPitLane();
    const ok = cleared && podium && cups === 1 && /2025 Season complete · Constructors' champions: /.test(kicker)
      && (title === "World champion" || /^You finished/.test(title));
    return ok || JSON.stringify({ cleared, podium, cups, kicker, title });
  });
  // The site's "Start the season" link opens the pit lane on the season.
  await p.goto(`http://localhost:8765/play.html?cup=season&${Date.now()}`);
  await p.waitForFunction(() => window.Game && window.Season, null, { timeout: 30000 });
  results.linkOpensSeason = await step(() => {
    const s = Game.getPitLaneState();
    return (s.cups[s.selectedCup].season && !/cup=/.test(location.search)) || JSON.stringify({ cup: s.cups[s.selectedCup].name, search: location.search });
  });
  await step(() => {
    localStorage.removeItem(Season.STORAGE_KEY);
    localStorage.removeItem("f1pixelcup.cup");
    Game.selectWeatherMode("dry");
    Game.selectDifficulty(1);
    Game.selectDriver(DRIVERS.findIndex((d) => d.id === "leclerc"));
  });
  await context.close();
  return { results, errors };
}
