// Browser check: smooth motion and the driving HUD. Run with the Playwright
// MCP tool browser_run_code_unsafe, with the dev server on
// http://localhost:8765. Returns { results, errors } (the shared convention
// of every check in tools/checks); every result should be true.
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
  const saved = await step(() => ({ grid: localStorage.getItem("f1pixelcup.grid") }));

  // Where the player's car is drawn, frame by frame, for 3 s at speed. The
  // distance it moves each frame should be even: a judder is frames that
  // move it by nothing and frames that move it by twice as much.
  const watch = () => step(async () => {
    const drawn = [];
    const real = window.drawDriverView;
    window.drawDriverView = (track) => {
      const player = getPlayer();
      if (player) drawn.push([player.x, player.y, Math.abs(player.speed)]);
      return real(track);
    };
    const hud = { speedPanel: 0, speedLines: 0 };
    const realPanel = window.drawSpeedPanel;
    const realLines = window.drawSpeedLines;
    window.drawSpeedPanel = (pl) => { hud.speedPanel += 1; return realPanel(pl); };
    window.drawSpeedLines = (pl) => { hud.speedLines += 1; return realLines(pl); };
    const t0 = performance.now();
    while (performance.now() - t0 < 3000) await new Promise((r) => requestAnimationFrame(r));
    window.drawDriverView = real;
    window.drawSpeedPanel = realPanel;
    window.drawSpeedLines = realLines;
    const moves = [];
    for (let i = 1; i < drawn.length; i += 1) {
      if (drawn[i][2] < 60) continue;
      moves.push(Math.hypot(drawn[i][0] - drawn[i - 1][0], drawn[i][1] - drawn[i - 1][1]));
    }
    const mean = moves.reduce((a, b) => a + b, 0) / Math.max(1, moves.length);
    const sd = Math.sqrt(moves.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, moves.length));
    // Frames that didn't move the car at all while it was driving.
    const still = moves.filter((m) => m < mean * 0.2).length;
    return { frames: drawn.length, moving: moves.length, spread: +(sd / mean).toFixed(3), still, ...hud };
  });

  await step(() => { Game.backToPitLane(); Game.selectCup(0); Game.selectGridMode("qualifying"); Game.startCup(); });
  await p.waitForFunction(() => state.phase === "qualifying" && state.qualifying && state.qualifying.handedOver, null, { timeout: 60000 });
  await step(() => { input.throttle = true; });
  const quali = await watch();
  await step(() => { input.throttle = false; Game.backToPitLane(); Game.selectGridMode("back"); Game.startCup(); });
  await p.waitForFunction(() => state.phase === "race" && !state.preparing, null, { timeout: 60000 });
  await step(() => { input.throttle = true; });
  await p.waitForTimeout(2500);
  const race = await watch();
  await step(() => { input.throttle = false; Game.backToPitLane(); });

  // Smooth: the car moves every frame, by an even amount.
  results.smoothInQualifying = (quali.moving > 60 && quali.still === 0 && quali.spread < 0.25) || JSON.stringify(quali);
  results.smoothInTheRace = (race.moving > 60 && race.still === 0 && race.spread < 0.25) || JSON.stringify(race);
  // The speed panel is up on a qualifying lap as in the race; the old 2D
  // speed streaks are not drawn over the 3D view.
  results.speedOnQualifyingLap = quali.speedPanel > 60 || JSON.stringify(quali);
  results.noStreaksOver3D = (quali.speedLines === 0 && race.speedLines === 0) || JSON.stringify({ quali: quali.speedLines, race: race.speedLines });

  await step((s) => {
    if (s.grid === null) localStorage.removeItem("f1pixelcup.grid"); else localStorage.setItem("f1pixelcup.grid", s.grid);
    state.gridMode = s.grid || "back";
  }, saved);
  await context.close();
  return { results, errors };
}
