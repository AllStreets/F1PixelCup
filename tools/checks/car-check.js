// Browser check: car v2 in the game (docs/superpowers/specs/2026-09-30-car-v2-design.md).
// Run with the Playwright MCP tool browser_run_code_unsafe, with the dev
// server on http://localhost:8765. Returns { results, errors } (the shared
// convention of every check in tools/checks); every result should be true.
async (page) => {
  const errors = [];
  const context = await page.context().browser().newContext({ viewport: null });
  const p = await context.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await p.goto(`http://localhost:8765/play.html?${Date.now()}`);
  await p.waitForFunction(() => window.Render3D && Render3D.ready, null, { timeout: 30000 });
  const results = {};
  const step = async (fn, arg) => {
    try { return await p.evaluate(fn, arg); } catch (e) { return String(e).slice(0, 300); }
  };
  const saved = await step(() => ({ weather: localStorage.getItem("f1pixelcup.weather"), grid: localStorage.getItem("f1pixelcup.grid") }));

  const race = async (weather) => {
    await step((w) => { Game.backToPitLane(); Game.selectCup(0); Game.selectGridMode("back"); Game.selectWeatherMode(w); Game.startCup(); }, weather);
    await p.waitForFunction(() => state.phase === "race" && !state.preparing, null, { timeout: 30000 });
    await p.waitForTimeout(500);
    return step(() => Object.values(Render3D.inspect().cars));
  };
  const dry = await race("dry");
  // All ten liveries: every team's car painted its own colour, as planned,
  // and shaded by the baked occlusion.
  const teams = {};
  dry.forEach((c) => { teams[c.team] = c; });
  results.tenLiveries = (Object.keys(teams).length === 10
    && Object.values(teams).every((c) => c.body === c.planned && c.ao)
    && new Set(Object.values(teams).map((c) => c.body)).size === 10) || JSON.stringify(teams);
  // Dry, the tyres are yellow-lettered mediums; wet, green intermediates.
  const wet = await race("wet");
  results.tyresForTheWeather = (dry.every((c) => c.tyreInk === "#f2c200") && wet.every((c) => c.tyreInk === "#2fb34a")) || JSON.stringify({ dry: dry[0], wet: wet[0] });
  await step((s) => {
    Game.backToPitLane();
    const put = (k, v) => (v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v));
    put("f1pixelcup.weather", s.weather);
    put("f1pixelcup.grid", s.grid);
    state.weatherMode = s.weather || "dry";
    state.gridMode = s.grid || "back";
  }, saved);
  await context.close();
  return { results, errors };
}
