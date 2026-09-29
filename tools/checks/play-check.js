// Browser check for play.html. Run with the Playwright MCP tool
// browser_run_code_unsafe, filename: tools/checks/play-check.js, dev server on
// http://localhost:8765. Uses the real window size (viewport: null).
// Expected: every boolean in `results` true, tiles 20, errors [].
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
  p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  const cdp = await context.newCDPSession(p);
  const { windowId } = await cdp.send("Browser.getWindowForTarget");
  const size = async (width, height) => {
    await cdp.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "normal" } });
    await cdp.send("Browser.setWindowBounds", { windowId, bounds: { width, height } });
    await p.waitForTimeout(500);
  };
  const visible = (id) => p.evaluate((el) => { const n = document.getElementById(el); return Boolean(n) && !n.classList.contains("hidden") && n.getClientRects().length > 0; }, id);
  const fills = () => p.evaluate(() => {
    const r = (id) => document.getElementById(id).getBoundingClientRect();
    const a = r("game"); const b = r("game3d");
    return a.width === innerWidth && a.height === innerHeight && b.width === innerWidth && b.height === innerHeight;
  });
  const noSideScroll = () => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  const out = {};

  await size(1440, 900);
  await p.goto(`http://localhost:8765/play.html?${Date.now()}`);
  await p.evaluate(() => localStorage.setItem("f1pixelcup.profile", JSON.stringify({ version: 1, careerPoints: 12, rating: 1210, totals: { races: 1, wins: "<img src=x onerror=window.__xss=1>" }, history: [] })));
  await p.reload();
  await p.waitForTimeout(1800);
  out.pitlane = await visible("pitlane");
  out.tiles = await p.locator(".driver-tile").count();
  out.fills1440 = await fills();
  out.chip = await p.locator("#career-chip").innerText();

  await p.locator('.driver-tile[data-driver="4"]').click();
  out.pickedNorris = (await p.locator("#driver-name").textContent()).includes("Norris");
  await p.keyboard.press("ArrowRight");
  out.arrowNext = (await p.locator("#driver-name").textContent()).includes("Piastri");
  await p.locator('[data-difficulty="2"]').click();
  out.legendOn = await p.locator('[data-difficulty="2"]').evaluate((n) => n.classList.contains("is-on"));
  await p.locator('[data-difficulty="1"]').click();

  await p.locator("#career-chip").click();
  out.careerOpen = await visible("career-screen");
  out.xss = await p.evaluate(() => window.__xss === undefined);
  await p.keyboard.press("Escape");
  out.careerClosedByEsc = !(await visible("career-screen"));
  await p.locator('[data-action="settings"]').click();
  out.settingsOpen = await visible("settings-screen");
  await p.keyboard.press("Escape");
  out.settingsClosedByEsc = !(await visible("settings-screen"));

  await size(1000, 700);
  out.fills1000 = await fills();
  out.noSideScroll1000 = await noSideScroll();
  await size(520, 800);
  out.noSideScroll520 = await noSideScroll();
  out.startInside520 = await p.evaluate(() => { const r = document.getElementById("start-cup").getBoundingClientRect(); return r.right <= innerWidth && r.bottom <= innerHeight && r.left >= 0; });
  await size(1440, 900);

  // Enter starts the cup when no other control has focus.
  await p.evaluate(() => document.activeElement && document.activeElement.blur());
  await p.keyboard.press("Enter");
  await p.waitForTimeout(400);
  out.startedOnce = await p.evaluate(() => state.phase === "countdown" && state.raceIndex === 0);
  out.pitlaneHiddenInRace = !(await visible("pitlane"));
  await p.waitForTimeout(5200);
  out.tower = await visible("tower");
  out.towerRows = await p.locator("#tower .tower-row").count();
  out.ticker = await p.locator("#ticker").innerText();
  await p.evaluate(() => document.fullscreenElement && document.exitFullscreen());

  await p.evaluate(() => {
    const player = getPlayer();
    player.isPlayer = false;
    // On autopilot the player may be the last car home, and the results are
    // recorded in the very step they cross the line: hand the car back to them
    // right then, as a real player would have it (as career-check does).
    const record = window.recordPlayerRace;
    window.recordPlayerRace = (finishers, fastest) => {
      player.isPlayer = true;
      window.recordPlayerRace = record;
      return record(finishers, fastest);
    };
    let now = performance.now();
    for (let t = 0; t < 900 && !state.resultsQueued; t += 1 / 60) {
      now += 1000 / 60;
      if (player.finished) player.isPlayer = true;
      updateRace(1 / 60, now);
    }
  });
  await p.waitForTimeout(400);
  out.results = await visible("results-screen");
  out.resultRows = await p.locator("#results-table .result-row").count();
  out.resultsCareer = await visible("results-career");
  await size(1000, 700);
  out.fillsWithResults = await fills();
  await size(1440, 900);
  await p.keyboard.press("Escape");
  await p.waitForTimeout(300);
  out.backToPitlane = await visible("pitlane");

  await p.goto(`http://localhost:8765/play.html?${Date.now()}#career`);
  await p.waitForTimeout(1500);
  out.deepLinkCareer = await visible("career-screen");

  await context.close();
  return { results: out, errors };
}
