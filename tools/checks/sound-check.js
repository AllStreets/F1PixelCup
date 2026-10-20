// Browser check: the engine's voice and the replay's sound
// (docs/design/specs/2026-10-05-sound-design.md). The sound is made by
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

  // The engine as the game voices it, on the race's own clock and with no
  // luck in it (no circuit, traffic or frame timing): at Monza, by name, the
  // game's own audio update is fed a car that accelerates flat out for
  // twelve seconds, holds top speed for eight (a long straight), then lifts.
  // Flat out at top speed the note is alive (it moves, the turbo is spooled,
  // the hybrid deploys); the crackles on the lift are counted from the
  // engine's own log of the pops it played.
  const live = await step(async () => {
    initAudio();
    const cup = CUP_DEFS.findIndex((c) => c.circuitIds.includes("monza"));
    Game.selectCup(cup); Game.selectGridMode("back"); Game.startCup();
    for (let i = 0; i < 900 && state.preparing; i += 1) await new Promise((r) => requestAnimationFrame(r));
    startRace(getActiveCup().tracks.findIndex((t) => t.id === "monza"));
    state.preparing = null;
    const track = state.track.id;
    const max = getPlayer().physics.maxSpeed;
    const car = { speed: 0, physics: { maxSpeed: max }, throttleIn: 1, brakeIn: 0, finished: false, trackDistance: 0 };
    state.phase = "race";
    state.paused = false;
    state.lastTick = 100000;
    freshEngines();
    const top = [];
    let topTurbo = 0;
    let topErs = 0;
    const tick = () => { state.lastTick += 1000 / 60; updateEngineAudio(car); return state.engineSound; };
    tick();
    for (let n = 0; n < 60 * 12; n += 1) { car.speed = max * Math.min(1, n / (60 * 11)); tick(); }
    for (let n = 0; n < 60 * 8; n += 1) {
      const e = tick();
      top.push(e.rpm);
      topTurbo = Math.max(topTurbo, e.turbo);
      topErs = Math.max(topErs, e.ers);
    }
    const popsBefore = state.engineSound.pops;
    car.throttleIn = 0;
    for (let n = 0; n < 60; n += 1) { car.speed *= 0.998; tick(); }
    const popsAfter = state.engineSound.pops;
    state.phase = "results";
    const range = Math.max(...top) - Math.min(...top);
    return { track, frames: top.length, range: Math.round(range), gear: state.engineSound.gear, topTurbo: +topTurbo.toFixed(2), topErs: +topErs.toFixed(2), popsBefore, popsAfter };
  });
  info.live = live;
  results.engineAliveAtTopSpeed = (live && live.track === "monza" && live.frames === 480 && live.range > 60 && live.range < 900 && live.topTurbo > 0.7 && live.topErs > 0.7) || JSON.stringify(live);
  // No pops on the way up or flat out; three or more on the lift.
  results.liftOffCrackles = (live && live.popsBefore === 0 && live.popsAfter >= 3) || JSON.stringify(live);

  // The tunnel is heard on the engine: at Monaco, by name, the same car held
  // flat out in the open and then in the middle of the tunnel. In the open
  // nothing rings; in the tunnel the engine's filter rings sharply, the
  // engine is louder and most of it goes to the reverb. (The engine rebuilt
  // in 2026-10 hid the tunnel: the same send on a softer note.)
  const tunnel = await step(async () => {
    // (After the other results: from the pit lane, the sound on, no replay open.)
    if (state.replay) Game.replay.exit();
    resetToGarage();
    audio.enabled = true;
    initAudio();
    const cup = CUP_DEFS.findIndex((c) => c.circuitIds.includes("monaco"));
    Game.selectCup(cup); Game.selectGridMode("back"); Game.startCup();
    for (let i = 0; i < 900 && state.preparing; i += 1) await new Promise((r) => requestAnimationFrame(r));
    startRace(getActiveCup().tracks.findIndex((t) => t.id === "monaco"));
    state.preparing = null;
    const t = state.track;
    const L = t.totalLength;
    const mid = (t.tunnel.from + ((((t.tunnel.to - t.tunnel.from) % L) + L) % L) / 2) % L;
    const max = getPlayer().physics.maxSpeed;
    const car = { speed: max, physics: { maxSpeed: max }, throttleIn: 1, brakeIn: 0, finished: false, trackDistance: (mid + L / 2) % L };
    state.phase = "race"; state.paused = false; state.lastTick = 100000;
    freshEngines();
    const hold = () => { for (let n = 0; n < 90; n += 1) { state.lastTick += 1000 / 60; updateEngineAudio(car); } const e = state.engineSound || {}; return { ring: e.ring, q: e.q, send: e.send, swell: e.swell, ready: audio.ready, last: Boolean(audio.engine && audio.engine.last) }; };
    const open = hold();
    car.trackDistance = mid;
    const inside = hold();
    resetToGarage();
    return { open, inside };
  });
  results.tunnelHeardOnTheEngine = (tunnel && tunnel.open && tunnel.inside && tunnel.open.ring === 0 && tunnel.open.send === 0 && tunnel.open.swell === 1
    && tunnel.inside.ring > 0.95 && tunnel.inside.q >= 6 && tunnel.inside.send >= 1.5 && tunnel.inside.swell >= 1.25) || JSON.stringify(tunnel);

  // Starting up. Qualifying: the player's own car is fired up (the starter
  // turning it over, the catch, a flare over idle, a settle) and the running
  // engine takes over as it rolls out, in its gear at once: no run up
  // through the gears (the old start was that, a quick arpeggio of shifts on
  // clean oscillators). The grid: the player's and the field's around them.
  // The start-up's own sound (rendered noise and uneven firings) is far
  // from a pure note: its spectral flatness against the oscillators' note.
  const starts = await step(async () => {
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    Game.backToPitLane();
    Game.selectCup(0); Game.selectGridMode("qualifying"); Game.startCup();
    const quali = { log: null, gears: new Set(), startingFrames: 0, runningWhileStarting: 0 };
    for (let i = 0; i < 3000 && !(state.phase === "qualifying" && state.qualifying && state.qualifying.handedOver); i += 1) {
      await frame();
      const e = state.engineSound;
      if (state.phase === "qualifying" && e && !e.starting) quali.gears.add(e.gear);
      if (state.engineStart && audio.start) quali.startingFrames += 1;
    }
    const qs = state.engineStart;
    quali.kind = qs && qs.kind;
    quali.field = qs && qs.field;
    quali.log = qs ? qs.log : [];
    quali.ended = qs && qs.endedAt;
    quali.settledAt = qs && qs.settledAt;
    const shape = (log) => {
      const crank = log.filter((x) => x.starter > 0.5);
      const peak = Math.max(0, ...log.map((x) => x.rpm));
      return { frames: log.length, cranking: crank.length, crankMax: Math.max(0, ...crank.map((x) => x.rpm)), peak, last: log.length ? log[log.length - 1].rpm : 0 };
    };
    quali.shape = shape(quali.log);
    quali.gears = [...quali.gears];
    // The grid.
    Game.backToPitLane();
    Game.selectGridMode("back"); Game.startCup();
    for (let i = 0; i < 3000 && state.phase !== "race"; i += 1) await frame();
    const rs = state.engineStart;
    const race = { kind: rs && rs.kind, field: rs && rs.field, shape: shape(rs ? rs.log : []), delays: rs ? rs.plan.map((p) => +p.delay.toFixed(2)) : [], ended: rs && rs.endedAt };
    Game.backToPitLane();
    // The sound itself.
    let flat = null;
    if (EngineSound.renderStartup) {
      const sr = 16000;
      const audioData = EngineSound.renderStartup(qs ? qs.seed : 1, sr);
      const p = EngineSound.startup(qs ? qs.seed : 1);
      const cut = (a, b) => audioData.slice(Math.floor(a * sr), Math.floor(b * sr));
      const old = new Float32Array(sr / 2);
      for (let i = 0; i < old.length; i += 1) { const t = i / sr; const saw = (f) => 2 * ((t * f) % 1) - 1; old[i] = 0.5 * saw(100) + 0.2 * saw(200) + 0.2 * Math.sign(Math.sin(2 * Math.PI * 50 * t)); }
      flat = { old: EngineSound.spectralFlatness(old, sr), crank: EngineSound.spectralFlatness(cut(0.1, p.catchAt), sr), settle: EngineSound.spectralFlatness(cut(p.runAt + 0.2, p.blips[0].at), sr), blip: EngineSound.spectralFlatness(cut(p.blips[0].at, p.blips[0].at + 0.4), sr) };
      Object.keys(flat).forEach((k) => { flat[k] = +flat[k].toFixed(4); });
    }
    return { quali, race, flat };
  });
  info.starts = starts && typeof starts === "object" ? { ...starts, quali: { ...starts.quali, log: undefined } } : starts;
  const sq = starts && starts.quali;
  results.qualifyingStartsAnEngine = (sq && sq.kind === "qualifying" && sq.field === 0 && sq.shape.cranking >= 10 && sq.shape.crankMax < 900
    && sq.shape.peak > 4800 && sq.shape.peak < 7500 && sq.ended >= sq.settledAt) || `quali: ${JSON.stringify(sq && { ...sq, log: undefined })}`;
  results.rollsOutInGearNoArpeggio = (sq && sq.gears.length === 1) || `gears while rolling out: ${JSON.stringify(sq && sq.gears)}`;
  const sr2 = starts && starts.race;
  results.gridStartsTheField = (sr2 && sr2.kind === "race" && sr2.field >= 4 && sr2.shape.cranking >= 10 && sr2.shape.peak > 6500 && sr2.delays.every((d, i) => !i || d > sr2.delays[i - 1])) || `race: ${JSON.stringify(sr2)}`;
  const fl = starts && starts.flat;
  results.startSoundsLikeAnEngine = (fl && fl.crank > fl.old * 5 && fl.settle > fl.old * 4 && fl.blip > fl.old * 5) || `flatness: ${JSON.stringify(fl)}`;

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
    // Onboard at 1x: the car in view's engine, at speed, in a high gear.
    Game.replay.setCamera("onboard");
    r.focusId = state.playerId;
    Game.replay.seek(r.rec.duration * 0.4);
    await frames(20);
    out.onboard = { ...state.replaySound.engine, mix: state.replaySound.mix };
    // Paused for a second, then played; and four times, then real time:
    // the engine comes back where it was, not from idle in first gear.
    const resume = async (stop, go) => {
      const before = { ...state.replaySound.engine };
      stop();
      await frames(60);
      go();
      await frames(2);
      const after = { ...state.replaySound.engine };
      // Where an engine at this car's speed would be (the car has moved on
      // while it was not heard): its gear, its revs.
      const ghost = r.ghosts.get(r.focusId);
      const model = EngineSound.createModel(1);
      const ratio = Math.abs(ghost.speed) / ghost.physics.maxSpeed;
      model.prime({ ratio, throttle: ghost.throttleIn || 0 });
      const want = model.step({ dt: 0, ratio, throttle: ghost.throttleIn || 0, brake: 0 });
      return { before: [Math.round(before.rpm), before.gear], after: [Math.round(after.rpm), after.gear], want: [Math.round(want.rpm), want.gear] };
    };
    out.afterPause = await resume(() => Game.replay.togglePlay(), () => Game.replay.togglePlay());
    out.after4x = await resume(() => Game.replay.setSpeed(4), () => Game.replay.setSpeed(1));
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
      // Playing, seek over the race and back (past every event): no sound.
      Game.replay.togglePlay();
      const seeked = state.replaySound.events;
      Game.replay.seek(r.rec.duration * 0.95);
      await frames(1);
      const forward = state.replaySound.events - seeked;
      Game.replay.seek(r.rec.duration * 0.05);
      await frames(1);
      out.heardOnSeek = state.replaySound.events - seeked;
      out.seekForward = forward;
      out.playingAtSeek = state.replaySound.mix.events;
      Game.replay.togglePlay();
    }
    out.ms = ms;
    Game.replay.exit();
    return out;
  });
  info.replay = replay;
  const ok = replay && typeof replay === "object";
  results.replayOnboardEngine = (ok && replay.onboard.rpm > 8000 && replay.onboard.gear >= 4) || `onboard: ${JSON.stringify(replay && replay.onboard)} (${typeof replay === "string" ? replay : ""})`;
  const same = (x) => x && Math.abs(x.after[0] - x.want[0]) < 1500 && Math.abs(x.after[1] - x.want[1]) <= 1 && x.after[0] > 6000;
  results.replayEngineResumesWhereItWas = (ok && same(replay.afterPause) && same(replay.after4x)) || `resume: ${JSON.stringify(replay && { pause: replay.afterPause, x4: replay.after4x })}`;
  results.replayTracksideDoppler = (ok && replay.trackside.up > 1.02 && replay.trackside.down < 0.98 && replay.trackside.loud > replay.trackside.quiet * 2) || `trackside: ${JSON.stringify(replay && replay.trackside)}`;
  results.replaySpeedsAndPause = (ok && replay.double.pitch > 1 && replay.double.engine > 0
    && replay.quadruple.engine === 0 && replay.quadruple.ambience > 0
    && replay.paused.engine === 0 && replay.paused.ambience === 0) || `speeds: ${JSON.stringify(replay && { double: replay.double, quadruple: replay.quadruple, paused: replay.paused })}`;
  results.replayEventsHeard = (ok && replay.firstEventAt && replay.heard > 0 && replay.heardOnSeek === 0 && replay.playingAtSeek === true) || `events: ${JSON.stringify(replay && { first: replay.firstEventAt, heard: replay.heard, heardOnSeek: replay.heardOnSeek, playing: replay.playingAtSeek })}`;

  await step((s) => {
    if (s.grid === null) localStorage.removeItem("f1pixelcup.grid"); else localStorage.setItem("f1pixelcup.grid", s.grid);
    if (s.sound === null) localStorage.removeItem("f1pixelcup.sound"); else localStorage.setItem("f1pixelcup.sound", s.sound);
  }, saved);
  await context.close();

  return { results, errors, info };
}
