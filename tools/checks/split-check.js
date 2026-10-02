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
    const hint = /W A S D/.test(document.getElementById("players-hint").textContent) && /Right Shift/.test(document.getElementById("players-hint").textContent);
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

  const humansNow = () => step(() => humans().map((h) => ({ id: h.id, speed: h.speed, steer: h.steer, throttle: h.throttleIn, brake: h.brakeIn })));
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
    const pad = (index, rt) => ({ index, id: `pad${index}`, connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: i === 7 && rt > 0.5, value: i === 7 ? rt : 0 })) });
    window.__pads = [pad(0, 0), pad(1, 0.55)];
    navigator.getGamepads = () => window.__pads;
  });
  await p.waitForTimeout(800);
  const c = await humansNow();
  results.padsDriveTheirOwn = (Math.abs(c[1].throttle - 0.5) < 1e-6 && c[0].throttle === 0) || JSON.stringify(c);
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

  // Frame time: the 3D draw for one view against two, on each tier.
  info.frameMs = await step(() => {
    const tiers = {};
    const was = Render3D.graphics().choice;
    const time = (n, fn) => { const t = performance.now(); for (let i = 0; i < n; i += 1) fn(); return (performance.now() - t) / n; };
    ["low", "medium", "high"].forEach((tier) => {
      Render3D.setGraphics(tier);
      const [p1, p2] = humans();
      const frame = (player, viewIndex, alsoShow) => ({ track: state.track, player, racers: state.racers, cameraHeading: player.heading, camPos: null, roll: 0, shake: { x: 0, y: 0 }, powerUps: powerUpFrame(raceNow()), particles: [], now: raceNow(), racing: false, trackside: tracksideFrame(raceNow()), weather: state.weather, viewIndex, alsoShow });
      const views = Render3D.inspect().split.rects;
      const two = time(20, () => { Render3D.render(frame(p1, 0, p2.id)); Render3D.render(frame(p2, 1, p1.id)); });
      Render3D.setViewports(null);
      const one = time(20, () => Render3D.render(frame(p1)));
      Render3D.setViewports(views);
      tiers[tier] = { one: Math.round(one * 10) / 10, two: Math.round(two * 10) / 10 };
    });
    Render3D.setGraphics(was);
    return tiers;
  });

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
    && race.rows.length === 2 && race.rows.some((r) => /1P/.test(r)) && race.rows.some((r) => /2P/.test(r))
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
    const ok = opened && state.phase === "replay" && view && view.mode === "onboard" && view.focusId === state.humanIds[1]
      && Render3D.inspect().split === null && label === "2P inputs";
    Game.replay.exit();
    return ok || JSON.stringify({ opened, phase: state.phase, view, label });
  });

  results.cupReachesPodium = await step(async () => {
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
      && Game.splitInfo() === null && Render3D.inspect().split === null;
    return ok || JSON.stringify({ phase: state.phase, totals: careers.map((c) => c.totals), title, strip });
  });

  // Back in the pit lane: one view again, ready for a one-player cup.
  results.backToOneView = await step(async () => {
    Game.backToPitLane();
    for (let i = 0; i < 5; i += 1) await new Promise((r) => requestAnimationFrame(r));
    return (state.phase === "garage" && Render3D.inspect().split === null && Game.getPitLaneState().players === 2) || state.phase;
  });

  await context.close();
  return { results, errors, info };
}
