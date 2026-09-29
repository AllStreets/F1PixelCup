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

  // The player's own settings, put back at the end (the checks run in the
  // browser they play in).
  const saved = await step(() => ({
    weather: localStorage.getItem("f1pixelcup.weather"),
    grid: localStorage.getItem("f1pixelcup.grid"),
    graphics: Render3D.graphics().choice,
  }));

  // The pit lane offers Dry, Wet and Changeable; the choice is kept (and read
  // back on the next visit), and is fixed for a cup once it starts.
  results.weatherPills = await step(() => {
    const pills = [...document.querySelectorAll("#weather-pills [data-weather]")].map((b) => b.textContent.trim());
    const pill = document.querySelector('#weather-pills [data-weather="wet"]');
    pill.focus();
    pill.click();
    const saved = localStorage.getItem("f1pixelcup.weather") === "wet";
    const on = document.querySelector('#weather-pills [data-weather="wet"]').getAttribute("aria-pressed") === "true";
    // The rebuilt row keeps the keyboard where it was.
    const focusKept = document.activeElement && document.activeElement.dataset.weather === "wet";
    state.weatherMode = "dry";
    loadGridPreference();
    const reloaded = state.weatherMode === "wet";
    Game.startCup();
    Game.selectWeatherMode("dry");
    const locked = state.weatherMode === "wet" && state.cupWeatherMode === "wet" && state.weather === "wet";
    Game.backToPitLane();
    const dryAfter = state.weather === "dry";
    Game.selectWeatherMode("dry");
    const ok = pills.join() === "Dry,Wet,Changeable" && saved && on && focusKept && reloaded && locked && dryAfter && state.weatherMode === "dry";
    return ok || JSON.stringify({ pills, saved, on, focusKept, reloaded, locked, dryAfter, mode: state.weatherMode });
  });

  // Changeable: each race decided once for the cup run (its qualifying and
  // its race share it), and another run rolls its own.
  results.changeableIsSeeded = await step(() => {
    state.selectedCup = 0; state.activeCupIndex = 0;
    buildCupEntries();
    state.cupWeatherMode = "changeable";
    const run = (id) => { state.cupRunId = id; return [0, 1, 2, 3, 4].map((i) => { setRaceWeather(i); return state.weather; }).join(); };
    const a = run("check-run");
    // Qualifying then the race of the same weekend: the same weather.
    let shared = true;
    for (let i = 0; i < getActiveCup().tracks.length; i += 1) {
      startQualifying(i);
      const q = state.weather;
      startRace(i);
      if (state.weather !== q) shared = false;
    }
    const again = run("check-run");
    const sequences = new Set(Array.from({ length: 12 }, (_, k) => run(`run-${k}`)));
    Game.backToPitLane();
    state.cupWeatherMode = "dry";
    return (a === again && shared && sequences.size > 1) || JSON.stringify({ a, again, shared, sequences: sequences.size });
  });

  // The grip, measured in the game at half, three-quarter and top speed: full
  // steer and a drift, the hardest the car can corner. Wet, its lateral
  // acceleration is the grip's share of the dry at every speed; dry, the car
  // turns exactly as the steering always turned it.
  results.gripMeasured = await step(() => {
    state.selectedCup = 0; state.activeCupIndex = 0;
    buildCupEntries();
    const measure = (weather, share) => {
      startRace(0);
      state.weather = weather;
      state.phase = "race";
      const racer = getPlayer();
      const now0 = 100000;
      state.raceStart = now0;
      Object.assign(input, { throttle: true, right: true, drift: true, left: false, brake: false });
      let most = 0;
      let turnedAsSteered = true;
      for (let i = 0; i < 20; i += 1) {
        racer.speed = racer.physics.maxSpeed * share;
        racer.spinUntil = 0;
        racer.formationUntil = 0;
        // The yaw the steering asks for, from the speed the step starts at;
        // the step turns the car by the yaw it applies (before the car is
        // eased along the road's surface).
        const turn = racer.physics.turnRate * (0.45 + Math.min(Math.max(racer.speed / 180, 0.2), 1));
        const asked = turn + Weather.DRIFT_YAW;
        updateRacer(racer, 1 / 60, now0 + i * 16);
        most = Math.max(most, racer.latAccel);
        if (Math.abs(racer.yawRate - asked) > 1e-9) turnedAsSteered = false;
      }
      Object.assign(input, { throttle: false, right: false, drift: false });
      return { most, turnedAsSteered };
    };
    const out = [0.5, 0.75, 1].map((share) => {
      const dry = measure("dry", share);
      const wet = measure("wet", share);
      return { share, ratio: +(wet.most / dry.most).toFixed(4), dryTurned: dry.turnedAsSteered, wetTurned: wet.turnedAsSteered };
    });
    Game.backToPitLane();
    const ok = out.every((o) => Math.abs(o.ratio - Weather.WET.corner) <= 0.03 && o.dryTurned && !o.wetTurned);
    return ok || JSON.stringify(out);
  });

  // Under Monaco's tunnel roof the road is dry: the grip is the dry's.
  results.roofIsDry = await step(() => {
    const cup = CUPS.findIndex((c) => c.tracks.some((t) => t.tunnel));
    state.selectedCup = cup; state.activeCupIndex = cup;
    buildCupEntries();
    startRace(CUPS[cup].tracks.findIndex((t) => t.tunnel));
    state.weather = "wet";
    state.phase = "race";
    const racer = getPlayer();
    const t = state.track.tunnel;
    const middle = t.from + (((t.to - t.from) % state.track.totalLength + state.track.totalLength) % state.track.totalLength) / 2;
    const at = sampleRouteSurfaceAtDistance(getMainRoute(state.track), middle);
    Object.assign(racer, { x: at.point.x, y: at.point.y, heading: Math.atan2(at.tangentY, at.tangentX), trackDistance: middle, formationUntil: 0, spinUntil: 0 });
    Object.assign(input, { throttle: true, right: true, drift: true });
    racer.speed = racer.physics.maxSpeed;
    updateRacer(racer, 1 / 60, 100000);
    Object.assign(input, { throttle: false, right: false, drift: false });
    const full = Weather.dryLimitAt(racer.physics, racer.speed);
    const ok = racer.underRoof && racer.latAccel > full * 0.95;
    Game.backToPitLane();
    return ok || JSON.stringify({ underRoof: racer.underRoof, latAccel: racer.latAccel, full });
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
    try {
      for (const [cup, index] of [[0, 1], [1, 0]]) {
        const dry = race(cup, index, "dry");
        const wet = race(cup, index, "wet");
        out.push({ track: state.track.id, dry, wet, slower: +(wet.fastest / dry.fastest).toFixed(3), slowerAvg: +(wet.avg / dry.avg).toFixed(3) });
      }
    } finally {
      Math.random = realRandom;
    }
    Game.backToPitLane();
    state.weather = "dry";
    // The field's average best lap: a single fastest lap is one car's luck.
    const ok = out.every((o) => o.dry.finished === 20 && o.wet.finished === 20 && o.slowerAvg >= 1.04);
    return ok || JSON.stringify(out);
  });

  // A wet race looks and sounds wet; a dry one doesn't; Low keeps the rain
  // and drops the spray and the lens.
  const race = async (weather, tier) => {
    await step(({ weather, tier }) => {
      Render3D.setGraphics(tier);
      Game.backToPitLane();
      Game.selectCup(0);
      Game.selectGridMode("back");
      Game.selectWeatherMode(weather);
      Game.startCup();
    }, { weather, tier });
    const started = await p.waitForFunction(() => state.phase === "race" && !state.preparing, null, { timeout: 30000 }).then(() => true, () => false);
    if (!started) return step(() => ({ notStarted: true, phase: state.phase, preparing: state.preparing, view: worldView(), drawing: Render3D.inspect().drawing }));
    await step(() => { input.throttle = true; });
    await p.waitForTimeout(4500);
    const seen = await step(() => ({
      ...Render3D.inspect().weather,
      lens: Render3D.inspect().postfx.rain,
      rainGain: audio.venue ? audio.venue.rain.gain.value : null,
      hissGain: audio.venue ? audio.venue.hiss.gain.value : null,
      feed: state.feed.map((f) => f.message).join(" | "),
    }));
    await step(() => { input.throttle = false; });
    return seen;
  };
  const wetHigh = await race("wet", "high");
  const dryHigh = await race("dry", "high");
  const wetLow = await race("wet", "low");
  results.wetLooks = (wetHigh.wet && wetHigh.roadRoughness < 0.35 && wetHigh.kerbWet === 1 && wetHigh.streaks === 5000 && wetHigh.spray > 50
    && wetHigh.lens > 0.5 && wetHigh.rainGain > 0.01 && wetHigh.hissGain > 0.01 && /Rain at/.test(wetHigh.feed))
    || JSON.stringify(wetHigh);
  results.dryIsDry = (!dryHigh.wet && dryHigh.roadRoughness > 0.8 && dryHigh.kerbWet === 0 && dryHigh.streaks === 0 && dryHigh.spray === 0
    && dryHigh.lens === 0 && dryHigh.rainGain < 0.002 && dryHigh.hissGain < 0.002 && dryHigh.sunIntensity > wetHigh.sunIntensity * 2)
    || JSON.stringify(dryHigh);
  results.lowTiered = (wetLow.wet && wetLow.streaks === 1000 && wetLow.spray === 0) || JSON.stringify(wetLow);

  // Nothing new stands over the track.
  results.sceneryClear = await step(() => {
    const bad = TRACKS.filter((t) => Render3D.auditScenery(t).length > 0).map((t) => t.id);
    return bad.length === 0 || bad.join();
  });
  // The player's settings as they were.
  await step((s) => {
    Game.backToPitLane();
    const put = (key, value) => (value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value));
    Render3D.setGraphics(s.graphics);
    put("f1pixelcup.weather", s.weather);
    put("f1pixelcup.grid", s.grid);
    state.weatherMode = s.weather || "dry";
    state.gridMode = s.grid || "back";
  }, saved);

  await context.close();
  return { results, errors };
}
