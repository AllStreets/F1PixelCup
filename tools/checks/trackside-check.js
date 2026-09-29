// Browser check: trackside life (docs/superpowers/specs/2026-09-29-trackside-design.md).
// G1: pit lanes, garages, the Safety Car's way into the pits. Run with the
// Playwright MCP tool browser_run_code_unsafe, filename:
// tools/checks/trackside-check.js, dev server on http://localhost:8765.
// Expected: every value in `results` true, errors [].
// Returns { results, errors } (the shared convention of every check in tools/checks).
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
  const cdp = await context.newCDPSession(p);
  const { windowId } = await cdp.send("Browser.getWindowForTarget");
  await cdp.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "normal" } });
  await cdp.send("Browser.setWindowBounds", { windowId, bounds: { width: 1440, height: 900 } });
  await p.goto(`http://localhost:8765/play.html?${Date.now()}`);
  await p.waitForFunction(() => window.Render3D && Render3D.ready, null, { timeout: 30000 });
  const step = async (fn, arg) => { try { return await p.evaluate(fn, arg); } catch (e) { return `error: ${String(e).split("\n")[0].slice(0, 160)}`; } };

  // Every circuit has its pit complex: eleven bays with the Safety Car's
  // nearest the exit, the garages behind the working lane (clear of every
  // road), the teams' stands on the pit wall, never over the road, and the
  // start gantry's pit-side post on the pit wall, not in the lane or a garage.
  results.pitsOnEveryCircuit = await step(() => {
    const bad = [];
    CIRCUITS.forEach((c) => {
      const a = Render3D.auditPits(TRACKS.find((t) => t.id === c.id));
      if (!a.lane || a.bays !== 11 || !a.safetyCarBayLast || a.garagesFromOwnRoad < a.garagesOwnNeed || a.garagesFromOtherRoads < a.garagesOtherNeed || a.stands !== 10 || a.standsFromRoad < a.roadEdge + 5 || !a.gantryPostClear) bad.push({ id: c.id, ...a });
    });
    return bad.length === 0 || JSON.stringify(bad).slice(0, 400);
  });

  // Nothing of the scenery over the track, the pit lane included; the advert
  // barriers still read forward, loop-free, with the pit side's barrier
  // opening along the garages.
  results.sceneryClearWithPits = await step(() => {
    const bad = [];
    CIRCUITS.forEach((c) => {
      const track = TRACKS.find((t) => t.id === c.id);
      const hits = Render3D.auditScenery(track);
      const ads = Render3D.auditAdverts(track);
      if (hits.length || ads.some((x) => x.loops || x.backwards.length || x.onRoad.length)) bad.push({ id: c.id, hits: hits.slice(0, 3), ads });
    });
    return bad.length === 0 || JSON.stringify(bad).slice(0, 400);
  });

  // No print reads backwards: barriers, billboards and banners seen from
  // behind show their words forward too.
  results.noPrintReadsBackwards = await step(() => {
    const bad = [];
    CIRCUITS.forEach((c) => {
      const a = Render3D.auditPrint(TRACKS.find((t) => t.id === c.id));
      if (a.print < 3 || a.backwards.length) bad.push({ id: c.id, ...a });
    });
    return bad.length === 0 || JSON.stringify(bad).slice(0, 300);
  });

  // In a race, called in, the Safety Car is drawn going into the pit lane with
  // its lights off, then parked in front of its own garage.
  await step(async () => {
    Game.selectGridMode("back");
    Game.startCup();
    for (let i = 0; i < 300 && state.preparing; i += 1) await new Promise((r) => requestAnimationFrame(r));
  });
  results.safetyCarParksAtItsGarage = await step(async () => {
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    state.paused = true; state.pausedAt = performance.now();
    const pl = getSortedRacers()[10];
    pl.currentItem = "safetyCar"; useItem(pl, performance.now());
    await frame();
    const out = Render3D.inspect().safetyCarAt;
    const sc = state.safetyCar;
    sc.until = performance.now();
    let t = performance.now();
    let lane = null;
    for (let i = 0; i < 60 * 150 && !sc.parked; i += 1) {
      t += 16.7;
      updateSafetyCar(1 / 60, t);
      if (!lane && sc.inLane && state.track.pitLane.wallAt(sc.d) !== null) {
        await frame();
        lane = Render3D.inspect().safetyCarAt;
      }
    }
    await frame();
    const parked = Render3D.inspect().safetyCarAt;
    // Against the garage as built: in front of its own door (the working
    // lane is 10 from the doors), no nearer any other.
    const door = Render3D.auditPits(state.track).safetyCarDoor;
    state.paused = false;
    const toDoor = parked && door ? Math.hypot(parked.x - door.x, parked.z - door.z) : Infinity;
    const ok = out && out.flashing && lane && !lane.flashing && parked && !parked.flashing && toDoor <= 13;
    return ok || JSON.stringify({ out, lane, parked, door, toDoor });
  });

  await context.close();
  return { results, errors };
}
