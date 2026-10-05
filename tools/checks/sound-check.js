// Browser check: the engine's voice and the replay's sound
// (docs/superpowers/specs/2026-10-05-sound-design.md). The sound is made by
// Web Audio; what it is told to do is read back from state.engineSound and
// state.replaySound. Run with the Playwright MCP tool browser_run_code_unsafe,
// dev server on http://localhost:8765. Returns { results, errors, info };
// every result should be true.
async (page) => {
  const errors = [];
  const results = {};
  const info = {};
  const context = await page.context().browser().newContext({ viewport: null });
  const p = await context.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  p.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
  await p.goto(`http://localhost:8765/play.html?${Date.now()}`);
  await p.waitForFunction(() => window.Render3D && Render3D.ready, null, { timeout: 30000 });
  const step = async (fn, arg) => { try { return await p.evaluate(fn, arg); } catch (e) { return `error: ${String(e).split("\n")[0].slice(0, 200)}`; } };
  const saved = await step(() => ({ grid: localStorage.getItem("f1pixelcup.grid"), sound: localStorage.getItem("f1pixelcup.sound") }));

  // The race, live: the player's car on autopilot for twenty seconds of
  // real play, the engine's state read every frame. Flat out at top speed
  // the note is alive (it moves, the turbo is spooled, the hybrid deploys);
  // lifting off at speed crackles.
  const live = await step(async () => {
    initAudio();
    Game.selectCup(0); Game.selectGridMode("back"); Game.startCup();
    for (let i = 0; i < 900 && state.preparing; i += 1) await new Promise((r) => requestAnimationFrame(r));
    for (let i = 0; i < 900 && state.phase !== "race"; i += 1) await new Promise((r) => requestAnimationFrame(r));
    const player = getPlayer();
    player.isPlayer = false;
    const top = [];
    let topTurbo = 0;
    let topErs = 0;
    const t0 = performance.now();
    while (performance.now() - t0 < 20000 && state.phase === "race") {
      await new Promise((r) => requestAnimationFrame(r));
      const e = state.engineSound;
      if (!e) continue;
      if (Math.abs(player.speed) > player.physics.maxSpeed * 0.95 && (player.throttleIn || 0) > 0.8) {
        top.push(e.rpm);
        topTurbo = Math.max(topTurbo, e.turbo);
        topErs = Math.max(topErs, e.ers);
      }
    }
    // A lift at speed.
    const popsBefore = state.engineSound ? state.engineSound.pops : 0;
    player.isPlayer = true;
    input.throttle = false;
    for (let i = 0; i < 40; i += 1) await new Promise((r) => requestAnimationFrame(r));
    const popsAfter = state.engineSound ? state.engineSound.pops : 0;
    const range = top.length ? Math.max(...top) - Math.min(...top) : 0;
    return { frames: top.length, range: Math.round(range), topTurbo: +topTurbo.toFixed(2), topErs: +topErs.toFixed(2), popsBefore, popsAfter, speed: Math.round(player.speed) };
  });
  info.live = live;
  results.engineAliveAtTopSpeed = (live && live.frames > 30 && live.range > 60 && live.range < 900 && live.topTurbo > 0.5 && live.topErs > 0.5) || JSON.stringify(live);
  results.liftOffCrackles = (live && live.popsAfter > live.popsBefore) || JSON.stringify(live);

  // The replay: a one-lap race run on autopilot, its replay opened.
  const replay = await step(async () => {
    Game.backToPitLane();
    Game.selectCup(0); Game.selectGridMode("back"); Game.startCup();
    for (let i = 0; i < 900 && state.preparing; i += 1) await new Promise((r) => requestAnimationFrame(r));
    state.track.laps = 1;
    const player = getPlayer();
    player.isPlayer = false;
    state.phase = "race";
    let now = 100000;
    state.raceStart = now; state.lastTick = now; state.simOffset = 0; state.stepAccum = 0;
    state.racers.forEach((r) => { r.lapStartAt = now; });
    for (let n = 0; state.phase === "race" && n < 60 * 300; n += 1) { now += 1000 / 60; updateRace(1 / 60, now); }
    player.isPlayer = true;
    if (!Game.replay.open()) return `no replay (${state.phase})`;
    const r = state.replay;
    const frames = (n) => new Promise((res) => { let i = 0; const f = () => (++i >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); });
    const out = {};
    // Onboard at 1x: the car in view's engine, close and level.
    Game.replay.setCamera("onboard");
    r.focusId = state.playerId;
    Game.replay.seek(r.rec.duration * 0.4);
    await frames(20);
    out.onboard = { ...state.replaySound.engine, mix: state.replaySound.mix };
    // Trackside over a whole stretch of play: the note rises as the car
    // comes and falls as it goes (Doppler), louder near, quieter far.
    Game.replay.setCamera("trackside");
    const pitches = [];
    const gains = [];
    const t0 = performance.now();
    while (performance.now() - t0 < 6000) {
      await frames(1);
      pitches.push(state.replaySound.engine.pitch);
      gains.push(state.replaySound.engine.gain);
    }
    out.trackside = { up: Math.max(...pitches), down: Math.min(...pitches), loud: Math.max(...gains), quiet: Math.min(...gains) };
    // Speeds: double is pitched up a little; four times and paused, no engine.
    Game.replay.setSpeed(2);
    await frames(10);
    out.double = { ...state.replaySound.mix };
    Game.replay.setSpeed(4);
    await frames(10);
    out.quadruple = { ...state.replaySound.mix, engine: state.replaySound.engine.gain };
    Game.replay.setSpeed(1);
    Game.replay.togglePlay();
    await frames(10);
    out.paused = { ...state.replaySound.mix, engine: state.replaySound.engine.gain };
    // The events: the first thing that happens in the race (a hit, an item,
    // a box taken, a boost or a spin), played through at 1x, is heard; a
    // seek past things is not.
    const ms = r.rec.sampleMs;
    let first = null;
    for (let t = 500; t < r.rec.duration && !first; t += 400) {
      if (Replay.eventsBetween(r.rec, r.rec.header.t0 + t - 400, r.rec.header.t0 + t).length) first = t;
    }
    out.firstEventAt = first;
    if (first) {
      Game.replay.seek(Math.max(0, first - 1200));
      await frames(3);
      const before = state.replaySound.events;
      Game.replay.togglePlay();
      const t1 = performance.now();
      while (performance.now() - t1 < 1800) await frames(1);
      Game.replay.togglePlay();
      out.heard = state.replaySound.events - before;
      const seeked = state.replaySound.events;
      Game.replay.seek(r.rec.duration * 0.9);
      await frames(3);
      Game.replay.seek(r.rec.duration * 0.1);
      await frames(3);
      out.heardOnSeek = state.replaySound.events - seeked;
    }
    out.ms = ms;
    Game.replay.exit();
    return out;
  });
  info.replay = replay;
  const ok = replay && typeof replay === "object";
  results.replayOnboardEngine = (ok && replay.onboard.gain === 1 && replay.onboard.pitch === 1 && replay.onboard.rpm > 4500) || `onboard: ${JSON.stringify(replay && replay.onboard)} (${typeof replay === "string" ? replay : ""})`;
  results.replayTracksideDoppler = (ok && replay.trackside.up > 1.02 && replay.trackside.down < 0.98 && replay.trackside.loud > replay.trackside.quiet * 2) || `trackside: ${JSON.stringify(replay && replay.trackside)}`;
  results.replaySpeedsAndPause = (ok && replay.double.pitch > 1 && replay.double.engine > 0
    && replay.quadruple.engine === 0 && replay.quadruple.ambience > 0
    && replay.paused.engine === 0 && replay.paused.ambience === 0) || `speeds: ${JSON.stringify(replay && { double: replay.double, quadruple: replay.quadruple, paused: replay.paused })}`;
  results.replayEventsHeard = (ok && replay.firstEventAt && replay.heard > 0 && replay.heardOnSeek === 0) || `events: ${JSON.stringify(replay && { first: replay.firstEventAt, heard: replay.heard, heardOnSeek: replay.heardOnSeek })}`;

  await step((s) => {
    if (s.grid === null) localStorage.removeItem("f1pixelcup.grid"); else localStorage.setItem("f1pixelcup.grid", s.grid);
    if (s.sound === null) localStorage.removeItem("f1pixelcup.sound"); else localStorage.setItem("f1pixelcup.sound", s.sound);
  }, saved);
  await context.close();
  return { results, errors, info };
}
