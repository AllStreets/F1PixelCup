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
  // As rendered: each car photographed side on, its sidepod read off the
  // screen, is its team's colour (lit and shaded, so a generous tolerance).
  const pixelAt = async (x, y) => {
    const png = await p.screenshot({ clip: { x: x - 1, y: y - 1, width: 3, height: 3 } });
    return p.evaluate(async (b64) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.width; c.height = img.height;
      const g = c.getContext("2d");
      g.drawImage(img, 0, 0);
      const d = g.getImageData(Math.floor(img.width / 2), Math.floor(img.height / 2), 1, 1).data;
      return [d[0], d[1], d[2]];
    }, png.toString("base64"));
  };
  const painted = {};
  for (const driverId of ["leclerc", "norris", "russell"]) {
    const view = await step(async (driverId) => {
      Game.backToPitLane();
      Game.selectGridMode("back");
      Game.selectWeatherMode("dry");
      Game.selectDriver(DRIVERS.findIndex((d) => d.id === driverId));
      Game.startCup();
      for (let i = 0; i < 400 && state.preparing; i += 1) await new Promise((r) => requestAnimationFrame(r));
      state.paused = true; state.pausedAt = performance.now();
      document.getElementById("screens").style.visibility = "hidden";
      document.getElementById("game").style.visibility = "hidden";
      const pl = getPlayer();
      const c = Math.cos(pl.heading);
      const s = Math.sin(pl.heading);
      const spot = (fwd, side, h) => ({ x: pl.x + c * fwd - s * side, y: pl.y + s * fwd + c * side, d: pl.trackDistance, h });
      // The sidepod's flank, a little ahead of its middle, 0.48 m up (car
      // scale 6): clear of every team's pinstripe and lower band.
      Render3D.setPhotoCamera({ from: spot(1.2, 26, 3.1), at: spot(1.2, 0, 2.88), fov: 4 });
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return { w: innerWidth, h: innerHeight, team: state.cupEntries.find((e) => e.isPlayer).kart.id, want: Object.values(Render3D.inspect().cars).find((car) => car.team === state.cupEntries.find((e) => e.isPlayer).kart.id).planned };
    }, driverId);
    const px = await pixelAt(Math.round(view.w / 2), Math.round(view.h / 2));
    painted[view.team] = { px, want: view.want };
    await step(() => {
      Render3D.setPhotoCamera(null);
      state.paused = false;
      document.getElementById("screens").style.visibility = "";
      document.getElementById("game").style.visibility = "";
    });
  }
  const close = (px, hex, tol) => [1, 3, 5].every((i, k) => Math.abs(px[k] - parseInt(hex.slice(i, i + 2), 16)) <= tol);
  results.liveriesAsRendered = Object.values(painted).every(({ px, want }) => close(px, want, 110))
    && new Set(Object.values(painted).map(({ px }) => px.join())).size === 3 || JSON.stringify(painted);

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
