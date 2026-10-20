// Browser check: a comeback is possible (docs/design/specs/2026-10-05-balance-design.md).
// The balance autopilot (tools/balance/comeback.js, a decent driver using its
// power-ups sensibly) starts last on Pro in six five-lap races, and on
// average finishes in the top eight. Before the balance work it averaged
// about 12th. Run with the Playwright MCP tool browser_run_code_unsafe,
// filename: tools/checks/balance-check.js, dev server on http://localhost:8765.
// Expected: every value in `results` true, errors [].
// Returns { results, errors } (the shared convention of every check in tools/checks).
async (page) => {
  const errors = [];
  const results = {};
  try {
    const own = await page.context().newCDPSession(page);
    const { windowId: ownWindow } = await own.send("Browser.getWindowForTarget");
    await own.send("Browser.setWindowBounds", { windowId: ownWindow, bounds: { windowState: "minimized" } });
  } catch (e) { /* not fatal */ }
  const context = await page.context().browser().newContext({ viewport: null });
  const p = await context.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  await p.goto(`http://localhost:8765/play.html?${Date.now()}`);
  await p.waitForTimeout(1500);
  await p.addScriptTag({ url: `http://localhost:8765/tools/balance/comeback.js?${Date.now()}` });
  const races = [["monza", 1], ["suzuka", 2], ["monaco", 3], ["bahrain", 4], ["hungaroring", 5], ["spa", 6]];
  const finishes = [];
  for (const [trackId, seed] of races) {
    finishes.push(await p.evaluate((o) => Comeback.race(o).finish, { diff: 1, trackId, seed, start: "back" }));
  }
  const mean = finishes.reduce((s, f) => s + f, 0) / finishes.length;
  results.comebackFromLastOnPro = mean <= 8 || JSON.stringify({ finishes, mean });
  await context.close();
  return { results, errors };
}
