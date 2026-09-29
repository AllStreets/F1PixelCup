// Browser check: the small things -- focus, the phone note, the ticker, quitting
// after the flag, escaping, other tabs. Run with the Playwright MCP tool
// browser_run_code_unsafe, filename: tools/checks/minors-check.js, dev server on
// http://localhost:8765.
// Expected: every value in `results` true, errors [].
// Returns { results, errors } (the shared convention of every check in tools/checks).
async (page) => {
  const errors = [];
  const results = {};
  try {
    const own = await page.context().newCDPSession(page);
    const { windowId } = await own.send("Browser.getWindowForTarget");
    await own.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "minimized" } });
  } catch (e) { /* not fatal */ }
  const step = async (p, fn, arg) => { try { return await p.evaluate(fn, arg); } catch (e) { return `error: ${String(e).split("\n")[0].slice(0, 160)}`; } };

  // ---- A phone: the note first, once, and then whatever was asked for ----
  {
    const phone = await page.context().browser().newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const q = await phone.newPage();
    q.on("pageerror", (e) => errors.push(String(e)));
    await q.goto(`http://localhost:8765/play.html?driver=hamilton#career`);
    await q.waitForTimeout(1200);
    const noteFirst = await step(q, () => !document.getElementById("phone-note").classList.contains("hidden")
      && document.getElementById("career-screen").classList.contains("hidden"));
    await step(q, () => document.querySelector('#phone-note [data-action="close"]').click());
    await q.waitForTimeout(200);
    const careerAfter = await step(q, () => !document.getElementById("career-screen").classList.contains("hidden")
      && /Lewis Hamilton · career/i.test(document.getElementById("career-card").innerText));
    results.phoneNoteThenCareer = noteFirst === true && careerAfter === true;

    // From the site's own note, "Play anyway" doesn't meet the same note again.
    const r = await phone.newPage();
    r.on("pageerror", (e) => errors.push(String(e)));
    await r.goto(`http://localhost:8765/?${Date.now()}`);
    await r.waitForTimeout(800);
    await r.locator("#hero a.go-btn").click();
    await r.waitForTimeout(300);
    await r.locator("#phone-play-note a.go-btn").click();
    await r.waitForURL(/play\.html/);
    await r.waitForTimeout(1200);
    results.phoneNoteOnce = await step(r, () => document.getElementById("phone-note").classList.contains("hidden"));
    await phone.close();
  }

  // ---- A computer ----
  const context = await page.context().browser().newContext({ viewport: null });
  const p = await context.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  const cdp = await context.newCDPSession(p);
  const { windowId } = await cdp.send("Browser.getWindowForTarget");
  const size = async (width, height) => {
    await cdp.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "normal" } });
    await cdp.send("Browser.setWindowBounds", { windowId, bounds: { width, height } });
    await p.waitForTimeout(400);
  };
  await size(1440, 900);
  await p.goto(`http://localhost:8765/play.html?${Date.now()}`);
  await p.waitForTimeout(1500);

  // Picking with the keyboard keeps focus on what was picked.
  const keepsFocus = async (selector) => {
    await p.locator(selector).focus();
    await p.keyboard.press("Enter");
    await p.waitForTimeout(100);
    return p.evaluate((sel) => document.activeElement && document.activeElement.matches(sel), selector);
  };
  results.focusStaysOnPill = await keepsFocus('[data-difficulty="2"]') && await keepsFocus('[data-grid="qualifying"]')
    && await keepsFocus('[data-cup="1"]') && await keepsFocus('[data-difficulty="1"]') && await keepsFocus('[data-grid="back"]')
    && await keepsFocus('[data-cup="0"]');
  results.focusStaysOnTile = await keepsFocus('.driver-tile[data-driver="7"]');

  // Arrows move through the drivers, and the chosen tile is scrolled into view.
  await size(640, 800);
  await p.evaluate(() => { document.activeElement && document.activeElement.blur(); Game.selectDriver(0); });
  const seen = [];
  for (let i = 0; i < 19; i += 1) {
    await p.keyboard.press("ArrowRight");
    await p.waitForTimeout(40);
    seen.push(await p.evaluate(() => {
      const strip = document.getElementById("driver-strip").getBoundingClientRect();
      const tile = document.querySelector(".driver-tile.is-on").getBoundingClientRect();
      return tile.left >= strip.left - 1 && tile.right <= strip.right + 1 && tile.top >= 0 && tile.bottom <= innerHeight;
    }));
  }
  results.arrowTileInView = seen.every(Boolean) || JSON.stringify(seen);
  await size(1440, 900);

  // An open overlay keeps focus inside it, and hands it back when it closes.
  await p.evaluate(() => Game.selectDriver(DRIVERS.findIndex((d) => d.id === "leclerc")));
  await p.locator("#career-chip").focus();
  await p.keyboard.press("Enter");
  await p.waitForTimeout(150);
  const inside = [await p.evaluate(() => document.getElementById("career-screen").contains(document.activeElement))];
  for (let i = 0; i < 12; i += 1) {
    await p.keyboard.press(i % 3 === 2 ? "Shift+Tab" : "Tab");
    inside.push(await p.evaluate(() => document.getElementById("career-screen").contains(document.activeElement)));
  }
  await p.keyboard.press("Escape");
  await p.waitForTimeout(150);
  const back = await p.evaluate(() => document.activeElement === document.getElementById("career-chip"));
  results.overlayTrapsFocus = (inside.every(Boolean) && back) || JSON.stringify({ inside, back });

  // Another tab's race shows up here without a reload.
  results.otherTabRefreshes = await step(p, () => {
    const key = Career.STORAGE_KEY;
    const saved = JSON.parse(localStorage.getItem(key) || "null") || { version: 2, profileId: "p", lastDriverId: null, drivers: {} };
    saved.drivers.leclerc = { driverId: "leclerc", careerPoints: 4321, rating: 1400, ratedRaces: 12,
      totals: { races: 12, wins: 3, podiums: 5, cupsCompleted: 1, cupsWon: 1, poles: 0 }, bestLaps: {}, history: [] };
    localStorage.setItem(key, JSON.stringify(saved));
    window.dispatchEvent(new StorageEvent("storage", { key, newValue: localStorage.getItem(key) }));
    return /4,321 pts/.test(document.getElementById("career-chip").textContent);
  });

  // The first line of a race reaches the ticker.
  results.firstFeedLine = await step(p, async () => {
    Game.selectGridMode("back");
    Game.startCup();
    await new Promise((r) => requestAnimationFrame(r));
    const t = document.getElementById("ticker");
    return !t.classList.contains("hidden") && /loaded/i.test(t.textContent);
  });

  // Strip lines carry names from data: none of it is ever read as HTML.
  results.stripEscaped = await step(p, () => {
    const name = state.track.name;
    state.track.name = "<img src=x onerror=window.__stripXss=1>";
    const lines = careerForRace({ driverId: "leclerc", careerPoints: 4, racePoints: 2, multiplier: 2, careerTotal: 4,
      rating: { before: 1200, after: 1210, delta: 10 }, tier: "<b>F4</b>", newBestLap: { ms: 36000 } }).lines;
    state.track.name = name;
    return lines.every((l) => !/<img|<b>/.test(l)) && lines.some((l) => l.includes("&lt;img"));
  });

  // Quitting after the flag keeps the race: the player's result counts.
  results.quitAfterFlagKeepsRace = await step(p, async () => {
    for (let i = 0; i < 200 && state.preparing; i += 1) await new Promise((r) => requestAnimationFrame(r));
    const me = getPlayer();
    const before = Career.getDriver(me.driver.id).totals.races;
    // One CPU car stays on the grid, so the race is still running when the player finishes.
    const stuck = state.racers.find((r) => !r.isPlayer);
    const hold = { x: stuck.x, y: stuck.y, angle: stuck.angle };
    const record = window.recordPlayerRace;
    window.recordPlayerRace = (f, fl) => { me.isPlayer = true; return record(f, fl); };
    me.isPlayer = false;
    state.phase = "race";
    let now = 900000; state.raceStart = now; state.lastTick = now;
    state.racers.forEach((r) => { r.lapStartAt = now; });
    for (let t = 0; t < 900 && !me.finished; t += 1 / 60) {
      now += 1000 / 60;
      Object.assign(stuck, hold); stuck.speed = 0;
      updateRace(1 / 60, now);
    }
    me.isPlayer = true;
    const midway = me.finished && !state.resultsQueued;
    togglePause();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "q", code: "KeyQ" }));
    window.recordPlayerRace = record;
    const after = Career.getDriver(me.driver.id).totals.races;
    return (midway && after === before + 1 && state.phase === "garage") || JSON.stringify({ midway, before, after, phase: state.phase });
  });

  // The "couldn't be saved" line appears only when saving failed -- never
  // because of where the car finished.
  results.savedWarningOnlyOnFailure = await step(p, () => {
    const strip = document.getElementById("results-career");
    const warning = () => /couldn.t be saved/i.test(strip.innerText);
    const summary = (position, saved) => ({ driverId: "leclerc", careerPoints: 0, racePoints: 0, multiplier: 2, careerTotal: 0,
      rating: { before: 1200, after: 1190, delta: -10 }, tier: "F4", position, saved });
    const seen = [4, 12, 20].map((pos) => {
      Screens.showResults({ kicker: "", title: "", rows: [], career: careerForRace(summary(pos, true)), nextLabel: "Next" });
      return warning();
    });
    Screens.showResults({ kicker: "", title: "", rows: [], career: careerForRace(summary(12, false)), nextLabel: "Next" });
    const onFailure = warning();
    Game.backToPitLane();
    return (seen.every((w) => !w) && onFailure) || JSON.stringify({ seen, onFailure });
  });

  await context.close();

  // The landing page follows another tab too.
  {
    const ctx = await page.context().browser().newContext({ viewport: null });
    const l = await ctx.newPage();
    l.on("pageerror", (e) => errors.push(String(e)));
    await l.goto(`http://localhost:8765/?${Date.now()}`);
    await l.waitForTimeout(800);
    results.landingFollowsOtherTab = await step(l, () => {
      const key = Career.STORAGE_KEY;
      localStorage.setItem(key, JSON.stringify({ version: 2, profileId: "p", lastDriverId: "norris", drivers: {
        norris: { driverId: "norris", careerPoints: 777, rating: 1333, ratedRaces: 3,
          totals: { races: 3, wins: 1, podiums: 2, cupsCompleted: 0, cupsWon: 0, poles: 0 }, bestLaps: {}, history: [] } } }));
      window.dispatchEvent(new StorageEvent("storage", { key, newValue: localStorage.getItem(key) }));
      return /Latest · Lando Norris/i.test(document.getElementById("career-summary").innerText);
    });
    await ctx.close();
  }
  return { results, errors };
}
