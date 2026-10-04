// Browser check: TV-camera replays (docs/superpowers/specs/2026-10-01-replays-design.md).
// A short real race is run; its positions are kept independently as it runs;
// the replay is opened from the results screen and must show the race exactly,
// from every camera, with its cameras where they belong; seeking, speeds and
// Exit work, and the window can be any size. Run with the Playwright MCP tool
// browser_run_code_unsafe, filename: tools/checks/replay-check.js, dev server
// on http://localhost:8765. Expected: every value in `results` true, errors [].
// Returns { results, errors, info } (the shared convention of every check in tools/checks).
async (page) => {
  const errors = [];
  const results = {};
  const info = {};
  try {
    const own = await page.context().newCDPSession(page);
    const { windowId } = await own.send("Browser.getWindowForTarget");
    await own.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "minimized" } });
  } catch (e) { /* not fatal */ }
  const context = await page.context().browser().newContext({ viewport: null });
  const p = await context.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  const cdp = await context.newCDPSession(p);
  const { windowId } = await cdp.send("Browser.getWindowForTarget");
  const resize = async (width, height) => {
    await cdp.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "normal" } });
    await cdp.send("Browser.setWindowBounds", { windowId, bounds: { width, height } });
    await p.waitForTimeout(400);
  };
  await resize(1600, 900);
  await p.goto(`http://localhost:8765/play.html?${Date.now()}`);
  await p.waitForFunction(() => window.Render3D && Render3D.ready, null, { timeout: 30000 });
  const step = async (fn, arg) => { try { return await p.evaluate(fn, arg); } catch (e) { return `error: ${String(e).split("\n")[0].slice(0, 200)}`; } };
  const frames = (n = 2) => p.evaluate((n) => new Promise((done) => { let i = 0; const f = () => (++i >= n ? done() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

  // The circuit built for real (Spa, by id: the first race of its cup, so a
  // next race follows), then the
  // same seeded two-lap race run twice: once with the recorder switched off,
  // once with it on. Every car on autopilot.
  const race = await step(async () => {
    const ci = CUPS.findIndex((c) => !c.season && c.tracks.some((t) => t.id === "spa"));
    const ti = CUPS[ci].tracks.findIndex((t) => t.id === "spa");
    Game.selectCup(ci); Game.selectGridMode("back"); Game.startCup();
    if (ti > 0) { state.raceIndex = ti; startRace(ti); }
    for (let i = 0; i < 900 && state.preparing; i += 1) await new Promise((r) => requestAnimationFrame(r));
    const seed = (n) => {
      let s = n >>> 0;
      Math.random = () => { s = (s + 0x6d2b79f5) >>> 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    };
    const run = (truth) => {
      seed(11);
      buildCupEntries();
      startRace(ti);
      state.preparing = null;
      state.track.laps = 2;
      const player = getPlayer();
      player.isPlayer = false;
      state.phase = "race";
      // The same race clock both times (the AI's wobbles read it).
      let now = 100000;
      state.raceStart = now; state.lastTick = now; state.simOffset = 0; state.stepAccum = 0;
      state.racers.forEach((r) => { r.lapStartAt = now; });
      const snap = () => state.racers.map((r) => ({ id: r.id, x: r.x, y: r.y, d: r.trackDistance }));
      // The race's own positions, kept here, independently of the recorder,
      // by physics step: at lights out, then after each call (one step, or
      // seven once the flag is out and the field is fast-forwarded).
      if (truth) truth[0] = snap();
      let steps = 0;
      let calls = 0;
      let ms = 0;
      let recordUs = null;
      let midMs = 0;
      let midSteps = 0;
      while (state.phase === "race" && calls < 60 * 300) {
        now += 1000 / 60;
        const these = state.flagOutAt ? FLAG_FAST_FORWARD : 1;
        // The player's keys are recorded whoever drives: throttle held from
        // step 600 to 1200 (the AI driving the player's car ignores them).
        input.throttle = steps >= 600 && steps < 1200;
        const t = performance.now();
        updateRace(1 / 60, now);
        const took = performance.now() - t;
        ms += took;
        // The race's own steps around the moment the recorder is timed (below).
        if (steps >= 2000 && steps < 2800) { midMs += took; midSteps += these; }
        steps += these;
        calls += 1;
        if (truth) truth[steps] = snap();
        // Forty seconds in, with the field racing, the recorder's cost per
        // step (a sample every second step, the cars' positions on the
        // others), timed over a batch (one step is under the browser's clock
        // resolution) into a scratch recording; the race's own is put back.
        if (truth && recordUs === null && steps >= 2400) {
          const keep = ["recording", "recordSteps", "recordKeys", "recordIds", "recordNextId", "recordFlashes", "recordMarshals", "recordYellowAt", "recordPool"].map((k) => [k, state[k]]);
          startRecording(state.lastTick);
          const N = 4000;
          const t1 = performance.now();
          for (let i = 0; i < N; i += 1) recordStep(state.lastTick);
          recordUs = ((performance.now() - t1) / N) * 1000;
          keep.forEach(([k, v]) => { state[k] = v; });
        }
      }
      player.isPlayer = true;
      return { steps, calls, ms, recordUs, midUs: (midMs / midSteps) * 1000, final: state.racers.map((r) => [r.id, r.finishPosition, Math.round(r.finishTime * 1000)]) };
    };
    // Off: the recorder's two entry points stubbed.
    const start = window.startRecording;
    const rec = window.recordStep;
    window.startRecording = () => {};
    window.recordStep = () => {};
    const off = run(null);
    window.startRecording = start;
    window.recordStep = rec;
    const truth = [];
    const on = run(truth);
    window.__truth = truth;
    const kept = state.recording;
    return {
      sameRace: JSON.stringify(off.final) === JSON.stringify(on.final),
      // A step's own cost at the same point of the race, run with the recorder off.
      steps: on.steps, stepUs: off.midUs, recordUs: on.recordUs,
      samples: kept.count, bytes: kept.bytes(), duration: kept.duration, sampleMs: kept.sampleMs,
      phase: state.phase,
    };
  });
  info.race = race;
  results.raceRunsToResults = (race && race.phase === "results") || JSON.stringify(race);
  // Recording only reads the race: the same seeded race ends identically without it.
  results.recordingDoesNotChangeRace = (race && race.sameRace === true) || JSON.stringify(race);
  // Every second step is a sample; memory and cost within the spec's budget.
  results.recordedEverySecondStep = (race && race.samples === Math.floor(race.steps / 2) + 1) || JSON.stringify(race);
  const mbPerMinute = race && race.bytes / 1e6 / (race.duration / 60000);
  info.mbPerMinute = mbPerMinute;
  info.recordPercentOfStep = race && (race.recordUs / race.stepUs) * 100;
  results.memoryWithinBudget = (mbPerMinute > 0 && mbPerMinute <= 1.5) || `${mbPerMinute} MB a minute`;
  results.recordingCheap = (info.recordPercentOfStep < 2) || `${info.recordPercentOfStep}% of a step`;

  // The results screen offers the replay; it opens from the button.
  results.replayButtonShown = await step(() => {
    const b = document.getElementById("results-replay");
    return Boolean(b && !b.hidden && b.getClientRects().length) || "no replay button";
  });
  try { await p.click("#results-replay", { timeout: 3000 }); } catch (e) { errors.push(`click replay: ${String(e).slice(0, 120)}`); }
  await frames(3);
  results.replayOpens = await step(() => (state.phase === "replay" && !document.getElementById("replay-screen").classList.contains("hidden")) || state.phase);

  // At sampled race times, the cars are drawn exactly where the race had them
  // (the recording's Float32 positions: within a millimetre), and at the
  // steps between samples too (positions are kept every step).
  const match = await step(async () => {
    const truth = window.__truth;
    Game.replay.setCamera("trackside");
    if (state.replay.playing) Game.replay.togglePlay();
    const ms = state.replay.rec.sampleMs;
    const worst = { sample: 0, between: 0, drawn: 0, checked: 0 };
    const n = state.replay.rec.count;
    for (let k = 0; k < n - 1; k += Math.max(1, Math.floor(n / 37))) {
      for (const half of [0, 0.5]) {
        const want = truth[2 * k + (half ? 1 : 0)];
        if (!want) continue;
        Game.replay.seek((k + half) * ms);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const drawn = Render3D.inspect().drawn;
        want.forEach((w) => {
          const g = state.replay.ghosts.get(w.id);
          const err = Math.hypot(g.x - w.x, g.y - w.y);
          const key = half ? "between" : "sample";
          worst[key] = Math.max(worst[key], err);
          const at = drawn[w.id];
          if (at && at.visible) worst.drawn = Math.max(worst.drawn, Math.hypot(at.x - g.x, at.y - g.y));
          worst.checked += 1;
        });
      }
    }
    return worst;
  });
  info.positions = match;
  results.replayPositionsMatchRace = (match && match.checked > 400 && match.sample < 0.01) || JSON.stringify(match);
  results.betweenSamplesExact = (match && match.between < 0.01) || JSON.stringify(match);
  results.carsDrawnWhereReplayHasThem = (match && match.drawn < 0.01) || JSON.stringify(match);

  // Every camera renders, from where it should be: trackside cameras outside
  // the barriers and up on their platforms, the onboard above its own car,
  // the helicopter high over the road.
  const cams = await step(async () => {
    const out = {};
    const dur = state.replay.rec.duration;
    for (const mode of ["trackside", "onboard", "helicopter"]) {
      Game.replay.setCamera(mode);
      const seen = [];
      for (const f of [0.05, 0.2, 0.4, 0.6, 0.8, 0.97]) {
        Game.replay.seek(dur * f);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const v = Render3D.inspect().view;
        const drawing = Render3D.inspect().drawing;
        seen.push(v ? { mode: v.mode, cam: v.cam, clearance: Math.round(v.clearance), up: Math.round(v.y - v.ground), toCar: Math.round(v.toCar), aboveCar: v.carY === null ? null : +(v.y - v.carY).toFixed(1), camsClearance: v.camsClearance, cams: v.cams, drawing } : null);
      }
      out[mode] = seen;
    }
    return out;
  });
  info.cameras = cams;
  const all = (mode, fn) => Array.isArray(cams && cams[mode]) && cams[mode].every((v) => v && v.mode === mode && v.drawing && fn(v));
  results.tracksideCamerasOffTheTrack = all("trackside", (v) => v.cam >= 0 && v.clearance >= 0 && v.camsClearance >= 0 && v.cams >= 8 && v.up >= 20) || `trackside: ${JSON.stringify(cams && cams.trackside)}`;
  results.onboardAboveItsCar = all("onboard", (v) => v.toCar < 10 && v.aboveCar > 6) || `onboard: ${JSON.stringify(cams && cams.onboard)}`;
  results.helicopterHighAndWide = all("helicopter", (v) => v.up >= 200 && v.toCar > 150) || `helicopter: ${JSON.stringify(cams && cams.helicopter)}`;

  // The director cuts between cameras and cars by itself.
  const director = await step(async () => {
    Game.replay.setCamera("director");
    const modes = new Set();
    const focus = new Set();
    const dur = state.replay.rec.duration;
    for (let i = 0; i < 24; i += 1) {
      Game.replay.seek((dur * i) / 24);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const v = Render3D.inspect().view;
      if (v) { modes.add(v.mode); focus.add(v.focusId); }
    }
    return { modes: [...modes], focus: focus.size };
  });
  results.directorCuts = (director && director.modes && director.modes.length === 3) || JSON.stringify(director);

  // Seeking lands where asked, at once; the seek bar and the clock follow.
  results.seekLands = await step(async () => {
    const r = state.replay;
    Game.replay.seek(r.rec.duration * 0.3);
    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    const bar = Number(document.getElementById("bc-seek").value);
    const k = r.rec.indexAt(r.rec.header.t0 + r.time);
    return (Math.abs(r.time - r.rec.duration * 0.3) < 1e-6 && Math.abs(bar - 300) <= 1 && k === Math.floor((r.rec.duration * 0.3) / r.rec.sampleMs + 1e-9)) || JSON.stringify({ time: r.time, bar, k });
  });

  // Speeds: the replay clock runs at the chosen speed (clicked on the bar).
  const advance = async (speed) => {
    try { await p.click(`#replay-screen [data-replay=speed][data-value="${speed}"]`, { timeout: 3000 }); } catch (e) { return `no ${speed}x button`; }
    await step(() => { Game.replay.seek(state.replay.rec.duration * 0.2); if (!state.replay.playing) Game.replay.togglePlay(); });
    const a = await step(() => ({ t: state.replay.time, w: performance.now() }));
    await p.waitForTimeout(700);
    const b = await step(() => ({ t: state.replay.time, w: performance.now() }));
    return (b.t - a.t) / (b.w - a.w);
  };
  const rates = { 0.25: await advance(0.25), 1: await advance(1), 4: await advance(4) };
  info.rates = rates;
  results.speedsWork = (typeof rates[1] === "number" && rates[1] > 0.5 && rates[1] < 1.2 && rates[4] / rates[1] > 3 && rates[4] / rates[1] < 5 && rates[0.25] / rates[1] > 0.15 && rates[0.25] / rates[1] < 0.35) || JSON.stringify(rates);

  // Keys: Space pauses, the arrows seek five seconds and change car.
  results.keysWork = await step(() => {
    const r = state.replay;
    document.activeElement && document.activeElement.blur && document.activeElement.blur();
    const key = (k) => window.dispatchEvent(new KeyboardEvent("keydown", { key: k, code: k === " " ? "Space" : k, bubbles: true }));
    Game.replay.setCamera("director");
    const wasPlaying = r.playing;
    key(" ");
    const paused = r.playing !== wasPlaying;
    if (r.playing) Game.replay.togglePlay();
    Game.replay.seek(20000);
    key("ArrowRight");
    const seeked = Math.abs(r.time - 25000) < 1e-6;
    // The car the director has at this moment (no frame drawn since the seek).
    const before = replayShot().focusId;
    key("ArrowDown");
    const manual = r.camera !== "director" && r.focusId && r.focusId !== before;
    return (paused && seeked && manual) || JSON.stringify({ paused, seeked, manual, before, after: r.focusId, camera: r.camera });
  });

  // The broadcast graphics: the tag, the tower (20 cars' worth, the car in
  // view highlighted), the lower third naming it, the lap counter; the input
  // trace on the onboard view only.
  results.graphicsShown = await step(async () => {
    Game.replay.setCamera("onboard");
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const q = (s) => document.querySelector(s);
    const rows = document.querySelectorAll("#bc-rows .bc-row").length;
    const focusRow = q("#bc-rows .bc-row.is-focus");
    const third = q("#bc-third").textContent;
    const ghost = state.replay.ghosts.get(state.replay.focusId);
    const name = ghost ? ghost.driver.name.split(" ").pop().toUpperCase() : "?";
    const traceOn = !q("#bc-trace").classList.contains("hidden");
    Game.replay.setCamera("trackside");
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const traceOff = q("#bc-trace").classList.contains("hidden");
    const ok = q(".bc-tag").textContent.includes("REPLAY") && rows >= 10 && focusRow && third.includes(name)
      && /LAP \d\/\d|FINAL LAP|FINISH/.test(q("#bc-lap").textContent) && traceOn && traceOff;
    return ok || JSON.stringify({ rows, focusRow: Boolean(focusRow), third, name, lap: q("#bc-lap").textContent, traceOn, traceOff });
  });

  // On the player's car the trace is the player's keys: throttle held through
  // the stretch the race had it held, and the speed in the race's own km/h.
  results.traceShowsPlayersKeys = await step(async () => {
    const r = state.replay;
    Game.replay.setCamera("onboard");
    r.focusId = state.playerId;
    Game.replay.seek(1100 * PHYSICS_STEP_MS);
    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    const label = document.getElementById("bc-trace-label").textContent;
    const bar = document.getElementById("bc-thr").style.height;
    const kph = document.getElementById("bc-kph").textContent;
    const ghost = r.ghosts.get(state.playerId);
    const want = Math.round(Math.abs(ghost.speed) * KPH_PER_UNIT);
    Game.replay.seek(1500 * PHYSICS_STEP_MS);
    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    const after = document.getElementById("bc-thr").style.height;
    return (label === "Your inputs" && bar === "100%" && after === "0%" && kph.includes(String(want)) && kph.includes("KM/H")) || JSON.stringify({ label, bar, after, kph, want });
  });

  // At any window size the graphics and every control are on screen, and the
  // picture fills the window (onboard, so the input trace is measured too).
  const fits = {};
  await step(() => Game.replay.setCamera("onboard"));
  for (const [w, h] of [[1600, 900], [1024, 640], [800, 500], [1280, 1000], [700, 400], [420, 820]]) {
    await resize(w, h);
    await frames(3);
    fits[`${w}x${h}`] = await step(() => {
      const W = window.innerWidth;
      const H = window.innerHeight;
      const inside = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.left >= -0.5 && r.top >= -0.5 && r.right <= W + 0.5 && r.bottom <= H + 0.5; };
      const els = [...document.querySelectorAll("#replay-screen .bc-btn, #bc-seek, .bc-tower, .bc-third-card, .bc-tag, .bc-trace")]
        .filter((el) => el.getClientRects().length);
      const out = els.filter((el) => !inside(el)).map((el) => el.className || el.id);
      const c = document.getElementById("game3d").getBoundingClientRect();
      const tower = document.querySelector(".bc-tower").getBoundingClientRect();
      const third = document.querySelector(".bc-third-card").getBoundingClientRect();
      const controls = document.querySelector(".bc-controls").getBoundingClientRect();
      const trace = document.querySelector(".bc-trace");
      const tr = trace.getClientRects().length ? trace.getBoundingClientRect() : null;
      const overlap = tower.bottom > third.top || third.bottom > controls.top + 1
        || (tr && (tr.bottom > controls.top + 1 || (tr.left < third.right && tr.top < third.bottom)));
      const fills = Math.abs(c.width - W) < 1 && Math.abs(c.height - H) < 1;
      return (out.length === 0 && !overlap && fills) || JSON.stringify({ out, overlap, fills, W, H });
    });
  }
  await resize(1600, 900);
  results.fitsEveryWindow = Object.values(fits).every((v) => v === true) || JSON.stringify(fits);

  // Exit goes back to the results screen, with the race's results as they were.
  const before = await step(() => [...document.querySelectorAll("#results-table .result-row")].map((r) => r.textContent.replace(/\s+/g, " ").trim()).join("|"));
  try { await p.click("#replay-screen [data-replay=exit]", { timeout: 3000 }); } catch (e) { errors.push(`click exit: ${String(e).slice(0, 120)}`); }
  await frames(2);
  results.exitReturnsToResults = await step((before) => {
    const rows = [...document.querySelectorAll("#results-table .result-row")].map((r) => r.textContent.replace(/\s+/g, " ").trim()).join("|");
    const shown = !document.getElementById("results-screen").classList.contains("hidden");
    const gone = document.getElementById("replay-screen").classList.contains("hidden");
    return (state.phase === "results" && shown && gone && rows === before && rows.split("|").length === 20) || JSON.stringify({ phase: state.phase, shown, gone, same: rows === before });
  }, before);
  // Focus is back on the replay button: Enter on it opens the replay (it is
  // not taken as "next race").
  results.enterOnReplayButtonOpensIt = await step(() => document.activeElement && document.activeElement.id) === "results-replay"
    ? await (async () => { await p.keyboard.press("Enter"); await frames(2); return await step(() => state.phase === "replay" || state.phase); })()
    : "focus not on the replay button";
  // And Esc from a replay does the same (not the pit lane).
  results.escapeLeavesReplayOnly = await step(async () => {
    if (state.phase !== "replay") Game.replay.open();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await new Promise((r) => requestAnimationFrame(r));
    return state.phase === "results" || state.phase;
  });
  // The next race starts as before, and its recording is a new one.
  results.nextRaceAfterReplay = await step(() => {
    const old = state.recording;
    Game.nextRace();
    return (state.phase === "countdown" && state.recording === null && old !== null && state.replay === null) || JSON.stringify({ phase: state.phase });
  });

  await context.close();
  return { results, errors, info };
}
