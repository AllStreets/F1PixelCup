// Browser check: where the Safety Car drives, on every circuit
// (pitlane.js wayOut and wayIn, game.js updateSafetyCar). Called from its
// garage it drives down its own pit lane and onto the road at the exit,
// leads, then goes round to the entry, down the lane, and parks in front of
// its own bay; called again on its way in, it parks and comes straight back
// out. At every step it is on the road or in its own pit lane, never jumps,
// and it parks nowhere but its spot. The game's own code, stepped by hand on
// each circuit in turn. Run with the Playwright MCP tool
// browser_run_code_unsafe, filename: tools/checks/safety-car-check.js, dev
// server on http://localhost:8765. Expected: every value in `results` true,
// errors []. Returns { results, errors }.
async (page) => {
  const errors = [];
  const results = {};
  try {
    const own = await page.context().newCDPSession(page);
    const { windowId } = await own.send("Browser.getWindowForTarget");
    await own.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "minimized" } });
  } catch (e) { /* not fatal */ }
  const context = await page.context().browser().newContext({ viewport: null });
  const p = await context.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await p.goto(`http://localhost:8765/play.html?${Date.now()}`);
  await p.waitForFunction(() => window.Render3D && Render3D.ready, null, { timeout: 60000 });
  const step = async (fn, arg) => { try { return await p.evaluate(fn, arg); } catch (e) { return `error: ${String(e).split("\n")[0].slice(0, 160)}`; } };

  // A race (for the field the Safety Car is paced on), paused.
  await step(async () => {
    Game.selectGridMode("back");
    Game.startCup();
    for (let i = 0; i < 900 && (state.phase !== "race" || state.preparing); i += 1) await new Promise((r) => requestAnimationFrame(r));
    state.paused = true;
    state.pausedAt = performance.now();
  });

  const drive = (callBack) => step((callBack) => {
    const bad = [];
    const home = state.track;
    const racers = state.racers;
    const caller = getSortedRacers()[5];
    CIRCUITS.forEach((c) => {
      const track = TRACKS.find((t) => t.id === c.id);
      const lane = track.pitLane;
      if (!lane) { bad.push({ id: c.id, why: "no pit lane" }); return; }
      state.track = track;
      state.racers = racers;
      state.safetyCar = null;
      let t = 1e6;
      deploySafetyCar(caller, t);
      // Nobody else on the road: only its own path counts here.
      state.racers = [];
      let sc = state.safetyCar;
      const route = getItemRoute(track);
      const L = track.totalLength;
      const spot = Pit.parkAt(lane);
      const where = (why) => ({ id: c.id, why, d: Math.round(sc.d), lat: Math.round(sc.lat), inLane: sc.inLane, exiting: sc.exiting });
      // On the road (within its half-width), or in its own lane: inside the
      // zone, on the pit side, no further out than the working lane.
      const legal = () => {
        if (Math.abs(sc.lat) <= route.halfWidthAt(sc.d) + 1e-6) return true;
        return lane.inZone(sc.d) && Math.sign(sc.lat) === lane.side && Math.abs(sc.lat) <= lane.workOut + 1e-6;
      };
      const started = { d: sc.d, lat: sc.lat };
      if (Math.abs(started.d - spot.d) > 1e-6 || Math.abs(started.lat - spot.lat) > 1e-6) bad.push(where("it did not start in front of its bay"));
      let joined = false;
      let called = !callBack;
      let last = { d: sc.d, lat: sc.lat };
      for (let i = 0; i < 60 * 400 && !sc.parked; i += 1) {
        t += 1000 / 60;
        // Out on the road: its time is up (it goes in).
        if (!sc.exiting && !joined) { joined = true; sc.until = t; }
        updateSafetyCar(1 / 60, t);
        if (!state.safetyCar) { bad.push({ id: c.id, why: "gone" }); break; }
        // Called again once it is in the lane on its way in.
        if (!called && sc.inLane && sc.leaving && !sc.exiting) { called = true; joined = false; state.racers = racers; deploySafetyCar(caller, t); state.racers = []; sc = state.safetyCar; }
        const along = ((sc.d - last.d) % L + L * 1.5) % L - L / 2;
        if (!legal()) { bad.push(where("off the road and its lane")); break; }
        if (Math.abs(along) > 10 || Math.abs(sc.lat - last.lat) > 3) { bad.push(where(`a jump of ${along.toFixed(1)}, ${(sc.lat - last.lat).toFixed(1)}`)); break; }
        last = { d: sc.d, lat: sc.lat };
      }
      if (!joined) bad.push(where("never reached the road"));
      if (!sc.parked) bad.push(where("never parked"));
      else if (Math.abs(sc.d - spot.d) > 1e-6 || Math.abs(sc.lat - spot.lat) > 1e-6) bad.push(where("parked somewhere other than its spot"));
    });
    state.track = home;
    state.racers = racers;
    state.safetyCar = null;
    return bad.length === 0 || JSON.stringify(bad).slice(0, 500);
  }, callBack);

  results.outLeadsInParksEveryCircuit = await drive(false);
  results.calledBackOnItsWayInEveryCircuit = await drive(true);
  await context.close();
  return { results, errors };
}
