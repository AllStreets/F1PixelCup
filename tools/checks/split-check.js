// Browser check: two-player split screen (docs/superpowers/specs/2026-10-01-split-screen-design.md).
// It is off by default; with two players each key set and each gamepad drives
// only its own car; each view's HUD is its own player's and lies inside its
// view; the views fill the window at several sizes (resized through CDP
// only); a two-player race's replay plays; a two-player cup reaches the
// podium and credits both careers; no errors. Run with the Playwright MCP
// tool browser_run_code_unsafe, filename: tools/checks/split-check.js, dev
// server on http://localhost:8765. Expected: every value in `results` true,
// errors []. Returns { results, errors, info } (the shared convention of every
// check in tools/checks).
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
  p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  const cdp = await context.newCDPSession(p);
  const { windowId } = await cdp.send("Browser.getWindowForTarget");
  const resize = async (width, height) => {
    await cdp.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "normal" } });
    await cdp.send("Browser.setWindowBounds", { windowId, bounds: { width, height } });
    await p.waitForTimeout(600);
  };
  const step = async (fn, arg) => { try { return await p.evaluate(fn, arg); } catch (e) { return `error: ${String(e).split("\n")[0].slice(0, 200)}`; } };
  const frames = (n = 3) => p.evaluate((n) => new Promise((done) => { let i = 0; const f = () => (++i >= n ? done() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

  await resize(1600, 900);
  await p.goto(`http://localhost:8765/play.html?${Date.now()}`);
  await p.waitForFunction(() => window.Render3D && Render3D.ready, null, { timeout: 30000 });
  await p.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("f1pixelcup.profile")).forEach((k) => localStorage.removeItem(k)));
  // What each view draws (its HUD panels and values) is noted for the check.
  await step(() => Game.probeHud(true));

  // Off by default: one player chosen, no player 2 picker, and a cup started
  // as it comes is one view.
  results.offByDefault = await step(async () => {
    const pill = document.querySelector('[data-players="1"]');
    const two = document.querySelector('[data-players="2"]');
    const picker = document.getElementById("second-driver");
    const atLoad = Game.getPitLaneState().players === 1 && pill && pill.getAttribute("aria-pressed") === "true"
      && two && two.getAttribute("aria-pressed") === "false" && picker.hidden;
    Game.selectGridMode("back"); Game.selectWeatherMode("dry"); Game.startCup();
    for (let i = 0; i < 900 && state.phase !== "race"; i += 1) await new Promise((r) => requestAnimationFrame(r));
    for (let i = 0; i < 5; i += 1) await new Promise((r) => requestAnimationFrame(r));
    const one = Game.splitInfo() === null && Render3D.inspect().split === null && state.racers.filter((r) => r.isPlayer).length === 1;
    Game.backToPitLane();
    return (atLoad && one) || JSON.stringify({ atLoad, one });
  });

  // Two players: the picker appears, player 2 can't take player 1's driver.
  results.pitLaneTwoPlayers = await step(() => {
    document.querySelector('[data-players="2"]').click();
    const shown = !document.getElementById("second-driver").hidden && Game.getPitLaneState().players === 2;
    const first = Game.getPitLaneState().driver.id;
    const second = Game.getPitLaneState().secondDriver.id;
    // Player 1 picks player 2's driver: player 2 moves off it.
    Game.selectDriver(DRIVERS.findIndex((d) => d.id === second));
    const moved = Game.getPitLaneState().secondDriver.id !== Game.getPitLaneState().driver.id;
    Game.selectDriver(DRIVERS.findIndex((d) => d.id === first));
    document.querySelector('[data-second="1"]').click();
    const stepped = Game.getPitLaneState().secondDriver.id !== Game.getPitLaneState().driver.id;
    const hint = /Right Shift/.test(document.getElementById("players-hint").textContent)
      && /P1 and P2/.test(document.getElementById("grid-hint").textContent);
    return (shown && first !== second && moved && stepped && hint) || JSON.stringify({ shown, first, second, moved, stepped, hint });
  });

  // A two-player race, to lights out.
  info.start = await step(async () => {
    Game.selectCup(0); Game.selectGridMode("back"); Game.selectWeatherMode("dry"); Game.startCup();
    for (let i = 0; i < 1500 && state.phase !== "race"; i += 1) await new Promise((r) => requestAnimationFrame(r));
    for (let i = 0; i < 10; i += 1) await new Promise((r) => requestAnimationFrame(r));
    return { phase: state.phase, humans: state.humanIds, players: state.racers.filter((r) => r.isPlayer).length, field: state.racers.length };
  });
  results.bothInTheField = (info.start.players === 2 && info.start.field === 20 && info.start.humans.length === 2) || JSON.stringify(info.start);

  // (Empty if the race never started, so a failure reports instead of crashing.)
  const humansNow = async () => {
    const got = await step(() => humans().map((h) => ({ id: h.id, speed: h.speed, steer: h.steer, throttle: h.throttleIn, brake: h.brakeIn, asked: controlsFor(h).throttle })));
    return Array.isArray(got) && got.length === 2 ? got : [{}, {}];
  };
  const release = async () => { for (const k of ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft", "ShiftRight"]) await p.keyboard.up(k); };

  // Player 1's keys move only player 1's car.
  await p.keyboard.down("KeyW"); await p.keyboard.down("KeyD");
  await p.waitForTimeout(1500);
  const a = await humansNow();
  await release();
  results.player1KeysOnly = (a[0].speed > 40 && a[0].throttle > 0.5 && a[0].steer > 0.5 && a[1].throttle === 0 && Math.abs(a[1].speed) < 20) || JSON.stringify(a);
  await p.waitForTimeout(1500);

  // Player 2's keys move only player 2's car, at the same time as player 1 steers the other way.
  await p.keyboard.down("ArrowUp"); await p.keyboard.down("ArrowLeft"); await p.keyboard.down("KeyA");
  await p.waitForTimeout(1200);
  const b = await humansNow();
  await release();
  results.player2KeysOnly = (b[1].speed > 40 && b[1].throttle > 0.5 && b[1].steer < -0.5 && b[0].throttle === 0 && b[0].steer < -0.5) || JSON.stringify(b);

  // Player 1's left (KeyA) types q on an AZERTY keyboard: while paused it
  // steers, it does not quit the cup.
  results.azertyLeftDoesNotQuit = await step(() => {
    togglePause();
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyA", key: "q" }));
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyA", key: "q" }));
    const phase = state.phase;
    togglePause();
    return phase === "race" || phase;
  });

  // Each player's power-up key fires their own item.
  results.powerUpKeys = await step(async () => {
    const [p1, p2] = humans();
    p1.currentItem = "drs"; p2.currentItem = "drs";
    const key = (code, type) => window.dispatchEvent(new KeyboardEvent(type, { code, key: code === "Space" ? " " : "/" }));
    key("Slash", "keydown"); key("Slash", "keyup");
    const after2 = { p1: p1.currentItem, p2: p2.currentItem, drs2: p2.drsUntil > raceNow() };
    key("Space", "keydown"); key("Space", "keyup");
    const after1 = { p1: p1.currentItem, drs1: p1.drsUntil > raceNow() };
    return (after2.p1 === "drs" && after2.p2 === "none" && after2.drs2 && after1.p1 === "none" && after1.drs1) || JSON.stringify({ after2, after1 });
  });

  // Gamepads: the second pad drives player 2 alone (its trigger in proportion).
  await step(() => {
    const pad = (index, rt) => ({ index, id: `pad${index}`, connected: true, mapping: "standard", axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: i === 7 && rt > 0.5, value: i === 7 ? rt : 0 })) });
    window.__pads = [pad(0, 0), pad(1, 0.55)];
    navigator.getGamepads = () => window.__pads;
  });
  await p.waitForTimeout(800);
  const c = await humansNow();
  // (What each pad asks for; the car's applied throttle can be trimmed by traffic.)
  results.padsDriveTheirOwn = (Math.abs(c[1].asked - 0.5) < 1e-6 && c[1].throttle > 0 && c[0].asked === 0 && c[0].throttle === 0) || JSON.stringify(c);
  await step(() => { window.__pads = []; });

  // The HUDs are independent: each view shows its own player's numbers, and
  // every HUD panel lies inside its own view.
  await p.keyboard.down("KeyW");
  await p.waitForTimeout(1200);
  const hud = await step(() => {
    const s = Game.splitInfo();
    const [p1, p2] = humans();
    const kph = (r) => Math.round(Math.abs(r.speed) * KPH_PER_UNIT);
    const place = (r) => getSortedRacers().findIndex((x) => x.id === r.id) + 1;
    return { s, want: [{ id: p1.id, code: p1.driver.code, kph: kph(p1), place: place(p1) }, { id: p2.id, code: p2.driver.code, kph: kph(p2), place: place(p2) }] };
  });
  await p.keyboard.up("KeyW");
  const inside = (box, r) => box.x >= r.x - 0.5 && box.y >= r.y - 0.5 && box.x + box.w <= r.x + r.w + 0.5 && box.y + box.h <= r.y + r.h + 0.5;
  results.hudsIndependent = (hud.s && hud.s.views.length === 2 && hud.s.views.every((v, i) => v.playerId === hud.want[i].id && v.hud.driver === hud.want[i].code
    && Math.abs(v.hud.kph - hud.want[i].kph) <= 25 && v.hud.place >= 1)
    && hud.s.views[0].hud.kph !== hud.s.views[1].hud.kph) || JSON.stringify(hud).slice(0, 600);

  // The layout fills the window at several sizes, live, and every HUD panel stays inside its view.
  const sizes = [[1600, 900, "stacked"], [900, 1300, "stacked"], [2400, 900, "side"], [1100, 700, "stacked"], [1600, 900, "stacked"]];
  const layouts = [];
  for (const [w, h, want] of sizes) {
    await resize(w, h);
    await frames(4);
    const got = await step(() => {
      const s = Game.splitInfo();
      const r3 = Render3D.inspect().split;
      const W = innerWidth;
      const H = innerHeight;
      const c2 = document.getElementById("game").getBoundingClientRect();
      const c3 = document.getElementById("game3d").getBoundingClientRect();
      return { W, H, s, r3, c2: [c2.width, c2.height], c3: [c3.width, c3.height] };
    });
    const s = got.s;
    const area = (r) => r.w * r.h;
    const ok = s && s.arrangement === want && got.c2[0] === got.W && got.c2[1] === got.H && got.c3[0] === got.W && got.c3[1] === got.H
      && area(s.views[0].rect) + area(s.views[1].rect) + area(s.divider) === got.W * got.H
      && s.views.every((v) => v.boxes.length >= 5 && v.boxes.every((box) => inside(box, v.rect)))
      && got.r3 && JSON.stringify(got.r3.rects) === JSON.stringify(s.views.map((v) => v.rect))
      && got.r3.cams.every((cam, i) => Math.abs(cam.aspect - s.views[i].rect.w / s.views[i].rect.h) < 1e-6 && cam.playerId === s.views[i].playerId);
    layouts.push(ok ? true : JSON.stringify({ w, h, want, got }).slice(0, 500));
    // No bars: the picture reaches every corner of both views (sampled off the screenshot).
    if (ok && w === 1600) {
      const shot = await p.screenshot();
      const pixels = await p.evaluate(async ({ b64, views }) => {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const cv = document.createElement("canvas");
        cv.width = img.width; cv.height = img.height;
        const g = cv.getContext("2d");
        g.drawImage(img, 0, 0);
        const k = img.width / innerWidth;
        const at = (x, y) => Array.from(g.getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data.slice(0, 3));
        // Each view's four edges, 30 points along each.
        const along = (x0, y0, x1, y1) => Array.from({ length: 30 }, (_, i) => at(x0 + ((x1 - x0) * (i + 0.5)) / 30, y0 + ((y1 - y0) * (i + 0.5)) / 30));
        return views.map((r) => [along(r.x, r.y + 2, r.x + r.w, r.y + 2), along(r.x, r.y + r.h - 3, r.x + r.w, r.y + r.h - 3),
          along(r.x + 2, r.y, r.x + 2, r.y + r.h), along(r.x + r.w - 3, r.y, r.x + r.w - 3, r.y + r.h)]);
      }, { b64: shot.toString("base64"), views: s.views.map((v) => v.rect) });
      // A bar is an edge that is all the page's own dark background (#080812).
      const dark = ([r, g2, b2]) => r < 14 && g2 < 14 && b2 < 24;
      const bars = pixels.flat().filter((edge) => edge.every(dark)).length;
      layouts.push(bars === 0 || `bars: ${bars}`);
    }
  }
  results.layoutFillsEveryWindow = layouts.every((x) => x === true) || layouts.filter((x) => x !== true).join(" | ");

  // Frame time on each tier, real frames (the time between animation frames),
  // with the effects compiled and drawing: two views here, one view in a
  // one-player race further down. Medium and High must draw their effects
  // in each view.
  const tierFrames = () => step(async () => {
    const out = {};
    const was = Render3D.graphics().choice;
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    for (const tier of ["low", "medium", "high"]) {
      Render3D.setGraphics(tier);
      for (let i = 0; i < 240 && tier !== "low" && !Render3D.inspect().postfx.drawing; i += 1) await frame();
      for (let i = 0; i < 20; i += 1) await frame();
      const gaps = [];
      let last = performance.now();
      for (let i = 0; i < 90; i += 1) { await frame(); const t = performance.now(); gaps.push(t - last); last = t; }
      gaps.sort((a, b) => a - b);
      const fx = Render3D.inspect().postfx;
      out[tier] = { medianMs: Math.round(gaps[45] * 10) / 10, effects: fx.drawing, frame: fx.frame };
    }
    Render3D.setGraphics(was);
    return out;
  });
  info.frameMsTwoViews = await tierFrames();
  const viewPx = await step(() => { const r = Game.splitInfo().views[0].rect; const d = Math.min(devicePixelRatio || 1, 2); return { w: Math.round(r.w * d), h: Math.round(r.h * d) }; });
  results.effectsDrawInEachView = ["medium", "high"].every((t) => info.frameMsTwoViews[t].effects && info.frameMsTwoViews[t].frame
    && info.frameMsTwoViews[t].frame.width === viewPx.w && info.frameMsTwoViews[t].frame.height === viewPx.h) || JSON.stringify({ viewPx, f: info.frameMsTwoViews });

  // Full-window pictures after the split (replay, a one-player race): the
  // renderer is back to the whole canvas, and no edge of the window is bare.
  const windowBars = async () => {
    const shot = await p.screenshot();
    return p.evaluate(async (b64) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const cv = document.createElement("canvas");
      cv.width = img.width; cv.height = img.height;
      const g = cv.getContext("2d");
      g.drawImage(img, 0, 0);
      const k = img.width / innerWidth;
      const at = (x, y) => Array.from(g.getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data.slice(0, 3));
      const along = (x0, y0, x1, y1) => Array.from({ length: 30 }, (_, i) => at(x0 + ((x1 - x0) * (i + 0.5)) / 30, y0 + ((y1 - y0) * (i + 0.5)) / 30));
      const W = innerWidth; const H = innerHeight;
      // The middle third of each half of the window, edge to edge, top and bottom halves too.
      const lines = [along(0, H * 0.25, W, H * 0.25), along(0, H * 0.75, W, H * 0.75), along(W * 0.25, 0, W * 0.25, H), along(W * 0.75, 0, W * 0.75, H)];
      const dark = ([r, g2, b2]) => r < 14 && g2 < 14 && b2 < 24;
      // A run of more than a third of a line all bare background is a bar.
      return lines.filter((line) => { let run = 0; let worst = 0; line.forEach((px) => { run = dark(px) ? run + 1 : 0; worst = Math.max(worst, run); }); return worst > 10; }).length;
    }, shot.toString("base64"));
  };

  // A two-player race to the flag (both on autopilot, one lap), its replay,
  // and both careers; then the rest of the cup, to the podium.
  const race = await step(async () => {
    const people = humans();
    people.forEach((h) => { h.isPlayer = false; });
    state.track.laps = 1;
    let now = state.lastTick;
    // Player 2 holds the throttle through the recording: their keys are kept.
    input2.throttle = true;
    for (let i = 0; i < 60 * 240 && state.phase === "race"; i += 1) {
      now += 1000 / 60;
      people.forEach((h) => { if (h.finished) h.isPlayer = true; });
      updateRace(1 / 60, now);
    }
    input2.throttle = false;
    people.forEach((h) => { h.isPlayer = true; });
    const rec = state.recording;
    const p2Index = rec.header.cars.findIndex((c) => c.player === 2);
    const keys2 = rec.sampleAt(Math.floor(rec.count / 2)).keys2;
    const rows = [...document.querySelectorAll("#results-screen .result-row.is-player")].map((r) => r.textContent.replace(/\s+/g, " ").trim());
    const strip = document.getElementById("results-career").textContent;
    return { phase: state.phase, players: rec.header.players, p2Index, p2Meta: rec.header.cars[p2Index], keys2, rows, strip,
      names: people.map((h) => surnameOf(h.driver.name)) };
  });
  info.race = race;
  results.raceCreditsBoth = (race.phase === "results" && race.players && race.players.length === 2 && race.p2Index >= 0 && race.keys2 && race.keys2.throttle === true
    && race.rows.length === 2 && race.rows.some((r) => /P1/.test(r)) && race.rows.some((r) => /P2/.test(r))
    && race.names.every((n) => race.strip.includes(`${n}:`))) || JSON.stringify(race).slice(0, 600);

  // The replay opens and plays after a two-player race, full screen, on the players' cars.
  results.replayAfterTwoPlayers = await step(async () => {
    const opened = Game.replay.open();
    for (let i = 0; i < 30; i += 1) await new Promise((r) => requestAnimationFrame(r));
    Game.replay.setCamera("onboard");
    Game.replay.focusStep(0);
    state.replay.focusId = state.humanIds[1];
    for (let i = 0; i < 20; i += 1) await new Promise((r) => requestAnimationFrame(r));
    const view = Render3D.inspect().view;
    const label = document.getElementById("bc-trace-label").textContent;
    const scissor = Render3D.inspect().scissor;
    const ok = opened && state.phase === "replay" && view && view.mode === "onboard" && view.focusId === state.humanIds[1]
      && Render3D.inspect().split === null && scissor === false && label === "P2 inputs";
    return ok || JSON.stringify({ opened, phase: state.phase, view, label, scissor });
  });
  const replayBars = await windowBars();
  results.replayFillsTheWindow = replayBars === 0 || `bars: ${replayBars}`;
  await step(() => Game.replay.exit());

  // The flag with both players racing: the first one home starts the show and
  // coasts off the racing line; the field is fast-forwarded only once both are in.
  results.flagWaitsForBoth = await step(async () => {
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    Game.nextRace();
    for (let i = 0; i < 1500 && state.phase !== "race"; i += 1) await frame();
    const [p1, p2] = humans();
    const route = getItemRoute(state.track);
    p1.speed = 160;
    finishRacer(p1, raceNow());
    for (let i = 0; i < 200; i += 1) await frame();
    const view1 = Game.splitInfo().views[0].hud;
    const one = { flagOut: state.flagOutAt, chequer: state.chequerAt > 0, p2Racing: !p2.finished, speed: p1.speed,
      lat: Math.abs(p1.lat), edge: route.halfWidthAt(p1.trackDistance || 0), waiting: view1.waiting };
    finishRacer(p2, raceNow());
    for (let i = 0; i < 10; i += 1) await frame();
    const both = { flagOut: state.flagOutAt > 0 };
    const ok = one.flagOut === 0 && one.chequer && one.p2Racing && one.speed === 0 && one.lat > one.edge * 0.6 && /still racing/.test(one.waiting || "") && both.flagOut;
    // The field (fast-forwarded now) is placed at once, as the time limit would.
    for (let i = 0; i < 60 && state.phase === "race"; i += 1) await frame();
    if (state.phase === "race") { state.resultsQueued = true; completeRemainingFinishers(raceNow()); finalizeRace(); }
    return ok || JSON.stringify({ one, both });
  });

  results.cupReachesPodium = await step(async () => {
    // (The flag test ran a race of its own; the rest are settled at once.)
    for (let guard = 0; guard < 6 && state.phase === "results"; guard += 1) {
      if (state.raceIndex >= getActiveCup().tracks.length - 1) { Game.nextRace(); break; }
      Game.nextRace();
      for (let i = 0; i < 1500 && state.phase !== "race"; i += 1) await new Promise((r) => requestAnimationFrame(r));
      for (let i = 0; i < 5; i += 1) await new Promise((r) => requestAnimationFrame(r));
      const two = Game.splitInfo() && Game.splitInfo().views.length === 2;
      if (!two) return `race ${state.raceIndex} not split`;
      state.raceStart = state.lastTick;
      completeRemainingFinishers(raceNow());
      state.resultsQueued = true;
      finalizeRace();
    }
    for (let i = 0; i < 20; i += 1) await new Promise((r) => requestAnimationFrame(r));
    const [a, b] = [humanEntry(0), humanEntry(1)];
    const careers = [a, b].map((e) => Career.getDriver(e.driver.id));
    const title = document.getElementById("podium-title").textContent;
    const strip = document.getElementById("podium-career").textContent;
    const ok = state.phase === "podium" && careers.every((c) => c.totals.cupsCompleted === 1 && c.totals.races === 4)
      && strip.includes(`${surnameOf(a.driver.name)}:`) && strip.includes(`${surnameOf(b.driver.name)}:`)
      && (title.includes(surnameOf(a.driver.name)) || title.includes(surnameOf(b.driver.name)))
      && Game.splitInfo() === null && Render3D.inspect().split === null && Render3D.inspect().scissor === false;
    // Player 2 still holding the throttle as the cup ends (let go in the pit lane).
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "ArrowUp", key: "ArrowUp" }));
    return ok || JSON.stringify({ phase: state.phase, totals: careers.map((c) => c.totals), title, strip, scissor: Render3D.inspect().scissor });
  });

  // Back in the pit lane: one view again, ready for a one-player cup.
  results.backToOneView = await step(async () => {
    Game.backToPitLane();
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "ArrowUp", key: "ArrowUp" }));
    for (let i = 0; i < 5; i += 1) await new Promise((r) => requestAnimationFrame(r));
    return (state.phase === "garage" && Render3D.inspect().split === null && Render3D.inspect().scissor === false && Game.getPitLaneState().players === 2) || state.phase;
  });

  // A one-player race after a two-player cup: the whole window, as ever.
  results.onePlayerAfterTwo = await step(async () => {
    Game.selectPlayers(1); Game.selectCup(0); Game.selectGridMode("back"); Game.startCup();
    for (let i = 0; i < 1500 && state.phase !== "race"; i += 1) await new Promise((r) => requestAnimationFrame(r));
    for (let i = 0; i < 30; i += 1) await new Promise((r) => requestAnimationFrame(r));
    const ok = Game.splitInfo() === null && Render3D.inspect().split === null && Render3D.inspect().scissor === false && state.humanIds.length === 1;
    return ok || JSON.stringify({ split: Render3D.inspect().split, scissor: Render3D.inspect().scissor });
  });
  const oneBars = await windowBars();
  results.onePlayerFillsTheWindow = oneBars === 0 || `bars: ${oneBars}`;
  info.frameMsOneView = await tierFrames();

  // Two-player qualifying: both run their laps at once as ghosts to each
  // other, both times are classified, and the keys held as the last cup
  // ended are not still held.
  results.qualifyingTwoPlayers = await step(async () => {
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    Game.backToPitLane();
    Game.selectPlayers(2); Game.selectGridMode("qualifying"); Game.startCup();
    const keysClear = Object.values(input2).every((v) => !v) && !input.throttle;
    for (let i = 0; i < 3000 && state.phase !== "qualifying"; i += 1) await frame();
    const [p1, p2] = humans();
    const apart = Math.abs(p1.lat - p2.lat) > 20;
    // Right behind the other player on their line: no lift, no brake.
    const keep = { x: p2.x, y: p2.y, d: p2.trackDistance };
    const w = getItemRoute(state.track).toWorld(p1.trackDistance - 30, p1.lat);
    Object.assign(p2, { x: w.x, y: w.y, trackDistance: p1.trackDistance - 30 });
    const ghost = applyTrafficAvoidance(p2, 1, 0, 0);
    Object.assign(p2, { x: keep.x, y: keep.y, trackDistance: keep.d });
    p1.isPlayer = false; p2.isPlayer = false;
    let now = performance.now();
    for (let i = 0; i < 60 * 150 && state.phase === "qualifying"; i += 1) { now += 1000 / 60; updateQualifying(1 / 60, now); }
    p1.isPlayer = true; p2.isPlayer = true;
    const q = state.qualifying;
    const rows = [...document.querySelectorAll("#qualifying-screen .quali-row")];
    const tags = rows.map((r) => r.textContent).filter((t) => /P[12]\b/.test(t)).length;
    const ok = keysClear && apart && ghost.throttle === 1 && ghost.brake === 0 && state.phase === "qualifyingResults"
      && q.playerTimeMs > 10000 && q.secondTimeMs > 10000 && rows.length === 20 && tags === 2
      && q.order.includes(p1.driver.id) && q.order.includes(p2.driver.id);
    return ok || JSON.stringify({ keysClear, apart, ghost, phase: state.phase, t1: q.playerTimeMs, t2: q.secondTimeMs, rows: rows.length, tags });
  });

  // One player backs over the line: that lap is aborted (no time, "Lap
  // aborted" on their HUD, NO TIME on the tower) while the other carries on.
  results.qualifyingAbortIsPerPlayer = await step(async () => {
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    Game.backToPitLane(); Game.startCup();
    for (let i = 0; i < 3000 && state.phase !== "qualifying"; i += 1) await frame();
    const q = state.qualifying;
    const [p1, p2] = humans();
    q.readyElapsed = QUALI_READY_MS; q.handedOver = true; p1.qualiAutopilot = false; p2.qualiAutopilot = false;
    const L = state.track.totalLength;
    const route = getItemRoute(state.track);
    const drive = (d) => { const w = route.toWorld(d, 0); Object.assign(p2, { x: w.x, y: w.y, speed: 0, segmentHint: null }); updateLapProgress(p2, raceNow() + 16.7, 1 / 60); };
    [L - 20, L - 5, 10, 30].forEach(drive);
    [10, L - 5].forEach(drive);
    for (let i = 0; i < 30; i += 1) await frame();
    const tower = document.getElementById("tower").textContent;
    const label = Game.splitInfo().views[1].hud.label;
    const mid = { phase: state.phase, aborted: q.secondAborted, p1Out: !p1.finished, tower: /NO TIME/.test(tower), label };
    q.releasedAt = state.lastTick - QUALI_TIME_LIMIT_MS - 1;
    updateQualifying(1 / 60, performance.now());
    const ok = mid.phase === "qualifying" && mid.aborted && mid.p1Out && mid.tower && mid.label === "Lap aborted"
      && state.phase === "qualifyingResults" && q.secondTimeMs === null && q.playerTimeMs === null;
    Game.backToPitLane();
    return ok || JSON.stringify({ mid, phase: state.phase, t2: q.secondTimeMs });
  });

  await context.close();
  return { results, errors, info };
}
