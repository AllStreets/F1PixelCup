// Browser check: keyboard focus on menu screens and short windows.
// Run with the Playwright MCP tool browser_run_code_unsafe,
// filename: tools/checks/keys-check.js, dev server on http://localhost:8765.
// Expected: enterOnPillSelects true, enterOnPillDidNotStart true,
// nextRaceIgnoredMidRace true, shortWindowStartReachable true, errors [].
async (page) => {
  // Keep the test tool's own empty tab (about:blank) out of the way.
  try {
    const own = await page.context().newCDPSession(page);
    const { windowId: ownWindow } = await own.send("Browser.getWindowForTarget");
    await own.send("Browser.setWindowBounds", { windowId: ownWindow, bounds: { windowState: "minimized" } });
  } catch (e) { /* not fatal */ }
  const errors = [];
  const out = {};
  const context = await page.context().browser().newContext({ viewport: null });
  const p = await context.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  const cdp = await context.newCDPSession(p);
  const { windowId } = await cdp.send("Browser.getWindowForTarget");
  const size = async (width, height) => {
    await cdp.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "normal" } });
    await cdp.send("Browser.setWindowBounds", { windowId, bounds: { width, height } });
    await p.waitForTimeout(500);
  };

  await size(1440, 900);
  await p.goto(`http://localhost:8765/play.html?${Date.now()}`);
  await p.waitForTimeout(1500);

  // Enter on a focused cup pill selects that cup; it must not start a race.
  await p.locator('[data-cup="1"]').focus();
  await p.keyboard.press("Enter");
  await p.waitForTimeout(300);
  out.enterOnPillSelects = await p.evaluate(() => state.selectedCup === 1);
  out.enterOnPillDidNotStart = await p.evaluate(() => state.phase === "garage");

  // Next race can only happen from the results screen.
  await p.evaluate(() => { Game.selectCup(0); Game.startCup(); });
  await p.waitForTimeout(300);
  out.nextRaceIgnoredMidRace = await p.evaluate(() => {
    state.phase = "race";
    const before = state.raceIndex;
    Game.nextRace();
    return state.raceIndex === before && state.phase === "race";
  });
  await p.evaluate(() => Game.backToPitLane());
  await p.evaluate(() => document.fullscreenElement && document.exitFullscreen());

  // A short, wide window: the Start button must be reachable.
  await size(1280, 520);
  out.shortWindowStartReachable = await p.evaluate(() => {
    const pit = document.getElementById("pitlane");
    pit.scrollTop = pit.scrollHeight;
    const r = document.getElementById("start-cup").getBoundingClientRect();
    return r.bottom <= innerHeight && r.top >= 0 && r.right <= innerWidth;
  });
  out.shortWindowNoSideScroll = await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

  await context.close();
  return { ...out, errors };
}
