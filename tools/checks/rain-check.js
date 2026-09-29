// Browser check: rain races (docs/superpowers/specs/2026-09-29-rain-design.md).
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
  await p.waitForFunction(() => window.Render3D && (Render3D.ready || Render3D.failed), null, { timeout: 30000 });
  const results = {};
  const step = async (fn, arg) => {
    try { return await p.evaluate(fn, arg); } catch (e) { return String(e).slice(0, 300); }
  };

  // The pit lane offers Dry, Wet and Changeable; the choice is kept, and is
  // fixed for a cup once it starts.
  results.weatherPills = await step(() => {
    const pills = [...document.querySelectorAll("#weather-pills [data-weather]")].map((b) => b.textContent.trim());
    document.querySelector('#weather-pills [data-weather="wet"]').click();
    const saved = localStorage.getItem("f1pixelcup.weather") === "wet";
    const on = document.querySelector('#weather-pills [data-weather="wet"]').getAttribute("aria-pressed") === "true";
    Game.startCup();
    Game.selectWeatherMode("dry");
    const locked = state.weatherMode === "wet" && state.cupWeatherMode === "wet" && state.weather === "wet";
    Game.backToPitLane();
    Game.selectWeatherMode("dry");
    const ok = pills.join() === "Dry,Wet,Changeable" && saved && on && locked && state.weatherMode === "dry";
    return ok || JSON.stringify({ pills, saved, on, locked, mode: state.weatherMode });
  });

  // Changeable: each race decided once, the same every time for the cup run.
  results.changeableIsSeeded = await step(() => {
    state.cupWeatherMode = "changeable";
    state.cupRunId = "check-run";
    const a = [0, 1, 2, 3, 4].map((i) => { setRaceWeather(i); return state.weather; });
    const b = [0, 1, 2, 3, 4].map((i) => { setRaceWeather(i); return state.weather; });
    state.cupWeatherMode = "dry";
    state.weather = "dry";
    return a.join() === b.join() || JSON.stringify({ a, b });
  });

  // The grip, measured in the game: the car at top speed, full steer and a
  // drift -- the hardest it can corner. Wet, its lateral acceleration is the
  // grip share of the dry; dry, it is exactly what it always was.
  results.gripMeasured = await step(() => {
    state.selectedCup = 0; state.activeCupIndex = 0;
    buildCupEntries();
    const measure = (weather) => {
      startRace(0);
      state.weather = weather;
      state.phase = "race";
      const racer = getPlayer();
      const now0 = 100000;
      state.raceStart = now0;
      Object.assign(input, { throttle: true, right: true, drift: true, left: false, brake: false });
      let most = 0;
      let expected = 0;
      for (let i = 0; i < 20; i += 1) {
        racer.speed = racer.physics.maxSpeed;
        racer.spinUntil = 0;
        racer.formationUntil = 0;
        updateRacer(racer, 1 / 60, now0 + i * 16);
        most = Math.max(most, racer.latAccel);
        const turn = racer.physics.turnRate * (0.45 + Math.min(Math.max(racer.speed / 180, 0.2), 1));
        expected = Math.max(expected, Math.abs((turn + Weather.DRIFT_YAW) * racer.speed));
      }
      Object.assign(input, { throttle: false, right: false, drift: false });
      return { most, expected };
    };
    const dry = measure("dry");
    const wet = measure("wet");
    state.weather = "dry";
    const ratio = wet.most / dry.most;
    // (The turn rate is set by the speed at the start of a step, the lateral
    // acceleration read at its end: the same to within a thousandth.)
    const dryUnchanged = Math.abs(dry.most - dry.expected) < 1e-3 * dry.expected;
    return (Math.abs(ratio - Weather.WET.corner) <= 0.03 && dryUnchanged) || JSON.stringify({ ratio, dry, wet });
  });

  // A whole race, dry and wet, every car on autopilot: the wet is slower, and
  // everyone still finishes.
  results.wetLapsSlower = await step(() => {
    const race = (cup, index, weather) => {
      state.selectedCup = cup; state.activeCupIndex = cup;
      buildCupEntries();
      startRace(index);
      state.weather = weather;
      state.racers.forEach((r) => { r.isPlayer = false; });
      state.phase = "race";
      let now = 100000;
      state.raceStart = now;
      state.racers.forEach((r) => { r.lapStartAt = now; });
      // The same random numbers for the dry race and the wet.
      let seed = 7;
      Math.random = () => {
        seed = (seed + 0x6d2b79f5) >>> 0;
        let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
        return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
      };
      const dt = 1 / 60;
      let t = 0;
      while (t < 900 && !state.racers.every((r) => r.finished)) { now += dt * 1000; t += dt; updateRace(dt, now); }
      const best = state.racers.map((r) => r.bestLapTime).filter(Boolean).sort((a, b) => a - b);
      const avg = state.racers.reduce((sum, r) => sum + (r.bestLapTime || 0), 0) / state.racers.length;
      return { finished: state.racers.filter((r) => r.finished).length, fastest: best[0], avg };
    };
    const realRandom = Math.random;
    const out = [];
    for (const [cup, index] of [[0, 1], [1, 0]]) {
      const dry = race(cup, index, "dry");
      const wet = race(cup, index, "wet");
      out.push({ track: state.track.id, dry, wet, slower: +(wet.fastest / dry.fastest).toFixed(3), slowerAvg: +(wet.avg / dry.avg).toFixed(3) });
    }
    Math.random = realRandom;
    state.weather = "dry";
    // The field's average best lap: a single fastest lap is one car's luck.
    const ok = out.every((o) => o.dry.finished === 20 && o.wet.finished === 20 && o.slowerAvg >= 1.04);
    return ok || JSON.stringify(out);
  });

  await context.close();
  return { results, errors };
}
