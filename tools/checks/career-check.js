// Browser check: a full four-race cup with every car on autopilot, the podium
// shown twice, then a race quit mid-way. Run with the Playwright MCP tool
// browser_run_code_unsafe, filename: tools/checks/career-check.js, dev server
// on http://localhost:8765. Expected: races 4, cupsCompleted 1, the bonus
// counted once (careerAfterSecondPodium === careerAfterCup), quitRecorded 0,
// every perDriver value true, no errors.
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
  await p.waitForTimeout(1000);
  const result = await p.evaluate(() => {
    localStorage.removeItem("f1pixelcup.profile");
    const runRace = () => {
      state.racers.forEach((r) => { r.isPlayer = r.id === state.playerId ? true : false; });
      const player = getPlayer();
      player.isPlayer = false; // autopilot for the drive
      state.phase = "race";
      let now = 100000;
      state.raceStart = now;
      state.racers.forEach((r) => { r.lapStartAt = now; });
      for (let t = 0; t < 900 && !state.resultsQueued; t += 1 / 60) {
        now += 1000 / 60;
        if (player.finished) player.isPlayer = true; // back under the player's control once over the line
        updateRace(1 / 60, now);
      }
    };
    const strips = [];
    startCup();
    for (let race = 0; race < 4; race += 1) {
      runRace();
      strips.push(document.getElementById("results-career").innerText);
      nextRace();
    }
    const me = getPlayer().driver.id;
    const afterCup = Career.getDriver(me);
    showPodium();
    const afterSecondPodium = Career.getDriver(me);
    const podiumStrip = document.getElementById("podium-career").innerText;
    resetToGarage();
    // A race quit before the flag records nothing.
    startCup();
    const before = Career.getDriver(me).totals.races;
    state.phase = "race";
    for (let i = 0; i < 120; i += 1) updateRace(1 / 60, 200000 + i * 16);
    resetToGarage();
    const afterQuit = Career.getDriver(me).totals.races;
    return {
      strips,
      podiumStrip,
      races: afterCup.totals.races,
      cupsCompleted: afterCup.totals.cupsCompleted,
      careerAfterCup: afterCup.careerPoints,
      careerAfterSecondPodium: afterSecondPodium.careerPoints,
      historyTypes: afterCup.history.map((h) => h.type),
      bestLaps: Object.keys(afterCup.bestLaps),
      quitRecorded: afterQuit - before,
      panel: document.getElementById("career-chip").innerText,
    };
  });
  // One career per driver: a race as Hamilton builds Hamilton's career and
  // leaves Leclerc's alone; the chip follows the selected driver; the career
  // screen lists every driver raced, and choosing one selects them.
  const perDriver = await p.evaluate(async () => {
    resetToGarage();
    const leclercBefore = Career.getDriver("leclerc");
    const ham = DRIVERS.findIndex((d) => d.id === "hamilton");
    Game.selectDriver(ham);
    const chipNew = document.getElementById("career-chip").textContent;
    startCup();
    const player = getPlayer();
    player.isPlayer = false; // autopilot for the drive
    state.phase = "race";
    let now = 500000;
    state.raceStart = now;
    state.lastTick = now;
    state.racers.forEach((r) => { r.lapStartAt = now; });
    for (let t = 0; t < 900 && !state.resultsQueued; t += 1 / 60) {
      now += 1000 / 60;
      if (player.finished) player.isPlayer = true; // the player's again once over the line
      updateRace(1 / 60, now);
    }
    const lewis = Career.getDriver("hamilton");
    const leclercAfter = Career.getDriver("leclerc");
    resetToGarage();
    Game.selectDriver(ham);
    const chipLewis = document.getElementById("career-chip").textContent;
    document.getElementById("career-chip").click();
    const rows = [...document.querySelectorAll("#career-screen .career-drivers tbody tr")];
    const listed = rows.map((r) => r.textContent);
    const leclercRow = document.querySelector('#career-screen .career-drivers [data-driver="' + DRIVERS.findIndex((d) => d.id === "leclerc") + '"]');
    if (leclercRow) leclercRow.click();
    const nowSelected = DRIVERS[state.selectedDriver].id;
    const overlayClosed = !(window.Screens && Screens.isOverlayOpen());
    return {
      lewisRaced: lewis.totals.races === 1,
      leclercUntouched: leclercAfter.totals.races === leclercBefore.totals.races && leclercAfter.careerPoints === leclercBefore.careerPoints,
      chipNew: /Hamilton · New career/.test(chipNew),
      chipFollowsDriver: chipLewis.startsWith("Hamilton · ") && !/New career/.test(chipLewis),
      driversListed: listed.some((t) => t.includes("Lewis Hamilton")) && listed.some((t) => t.includes("Charles Leclerc")),
      pickFromList: nowSelected === "leclerc" && overlayClosed,
    };
  });
  await context.close();
  return { ...result, perDriver, errors };
}
