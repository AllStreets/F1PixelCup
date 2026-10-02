// Browser check: the trackside's final look, every venue
// (docs/superpowers/specs/2026-10-01-trackside-blender-design.md, section 8).
// Every venue's landmark built from its Blender model, the yachts on the
// water at Monaco and Singapore, nothing over the track, nobody on the road,
// and the frame time holding on every circuit on all three tiers. Run with
// the Playwright MCP tool browser_run_code_unsafe, filename:
// tools/checks/trackside-models-check.js, dev server on http://localhost:8765.
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
  p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  const cdp = await context.newCDPSession(p);
  const { windowId } = await cdp.send("Browser.getWindowForTarget");
  await cdp.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "normal" } });
  await cdp.send("Browser.setWindowBounds", { windowId, bounds: { width: 1440, height: 900 } });
  await p.goto(`http://localhost:8765/play.html?${Date.now()}`);
  await p.waitForFunction(() => window.Render3D && Render3D.ready, null, { timeout: 60000 });
  const step = async (fn, arg) => { try { return await p.evaluate(fn, arg); } catch (e) { return `error: ${String(e).split("\n")[0].slice(0, 160)}`; } };
  // Every venue's models in (they load in the background, a venue at a time).
  await step(() => (Render3D.loadAllModels ? Render3D.loadAllModels() : null));

  // Each venue's landmarks, from their models.
  const WANT = {
    monza: ["monzaBanking"], spa: ["spaPits"], silverstone: ["silverstoneWing"], suzuka: ["suzukaWheel"],
    monaco: ["casino"], singapore: ["marinaBaySands", "singaporeFlyer"], bahrain: ["sakhirTower"], interlagos: ["spTowers"],
  };
  results.everyLandmarkFromItsModel = await step((WANT) => {
    const bad = [];
    CIRCUITS.forEach((c) => {
      const track = TRACKS.find((t) => t.id === c.id);
      Render3D.auditScenery(track, { step: 50, lanes: 1 });
      const built = Render3D.inspect().trackside.landmarks.filter((l) => l.fromModel).map((l) => l.name);
      const missing = (WANT[c.id] || []).filter((n) => !built.includes(n));
      if (missing.length) bad.push({ id: c.id, missing, built });
    });
    return bad.length === 0 || JSON.stringify(bad).slice(0, 400);
  }, WANT);

  // The yachts: Monaco's moored at the quays and anchored out, Singapore's in
  // the bay; every hull past the quays (190 past the barrier at Monaco).
  results.yachtsOnTheWater = await step(() => {
    const out = {};
    ["monaco", "singapore"].forEach((id) => { out[id] = Render3D.auditYachts(TRACKS.find((t) => t.id === id)); });
    const m = out.monaco;
    const s = out.singapore;
    return (m && m.moored >= 20 && m.anchored >= 8 && m.leastClearance >= 190 && s && s.anchored >= 4 && s.leastClearance >= 40) || JSON.stringify(out);
  });

  // Nothing over the track and nobody on the road, every circuit.
  results.nothingOnTheTrack = await step(() => {
    const bad = [];
    CIRCUITS.forEach((c) => {
      const track = TRACKS.find((t) => t.id === c.id);
      const hits = Render3D.auditScenery(track);
      const people = Render3D.auditPeople(track);
      if (hits.length || people.onRoad.length || !people.byKind.marshal) bad.push({ id: c.id, hits: hits.slice(0, 2), onRoad: people.onRoad.slice(0, 2), marshals: people.byKind.marshal });
    });
    return bad.length === 0 || JSON.stringify(bad).slice(0, 400);
  });

  // Frame time on every circuit, all three tiers, the race running with the
  // player parked by its nearest stand (the crowd drawn): each tier's
  // median frame smooth (there and back, so warming up doesn't count).
  const race = (id) => step(async (id) => {
    Game.backToPitLane();
    const cup = CUPS.findIndex((c) => c.tracks.some((t) => t.id === id));
    Game.selectCup(cup);
    Game.selectGridMode("back");
    Game.startCup();
    const ti = CUPS[cup].tracks.findIndex((t) => t.id === id);
    if (ti > 0) { state.raceIndex = ti; startRace(ti); }
    for (let i = 0; i < 1800 && (state.phase !== "race" || state.preparing); i += 1) await new Promise((r) => requestAnimationFrame(r));
    return state.phase;
  }, id);
  // The median frame, and the median of what the frames drew (triangles)
  // and how long drawing them took on the main thread (the frame itself is
  // held to the display's refresh: the drawing time shows the headroom).
  const median = () => step(() => new Promise((resolve) => {
    const times = [];
    const tris = [];
    const cpu = [];
    let last = performance.now();
    const mid = (a) => a.slice(10).sort((x, y) => x - y)[30];
    const tick = () => {
      const t = performance.now();
      times.push(t - last);
      last = t;
      const s = Render3D.inspect().trackside.stats;
      tris.push(s.triangles);
      cpu.push(s.cpuMs);
      if (times.length < 70) requestAnimationFrame(tick);
      else resolve({ ms: mid(times), tris: mid(tris), cpu: mid(cpu) });
    };
    requestAnimationFrame(tick);
  }));
  const frames = {};
  for (const c of await step(() => CIRCUITS.map((x) => x.id))) {
    await race(c);
    await step(() => {
      const t = Render3D.inspect().trackside;
      const gap = (st) => Math.min(...state.track.points.map((q) => Math.hypot(q.x - st.x, q.y - st.z)));
      const st = t.standSpots.length ? t.standSpots.reduce((a, b) => (gap(b) < gap(a) ? b : a)) : null;
      if (!st) return;
      const by = state.track.points.reduce((a, b) => (Math.hypot(b.x - st.x, b.y - st.z) < Math.hypot(a.x - st.x, a.y - st.z) ? b : a));
      const pl = getPlayer();
      pl.x = by.x; pl.y = by.y; pl.speed = 0;
    });
    const got = { high: [], medium: [], low: [] };
    for (const tier of ["high", "medium", "low", "low", "medium", "high"]) {
      await step((t) => Render3D.setGraphics(t), tier);
      got[tier].push(await median());
    }
    frames[c] = Object.fromEntries(Object.entries(got).map(([k, v]) => [k, {
      ms: +((v[0].ms + v[1].ms) / 2).toFixed(1), cpu: +((v[0].cpu + v[1].cpu) / 2).toFixed(1), ktris: Math.round(Math.max(v[0].tris, v[1].tris) / 1000),
    }]));
  }
  await step(() => Render3D.setGraphics("auto"));
  // Smooth (under 22 ms a frame), the drawing well inside a frame (under
  // 8 ms on the main thread), the triangles within budget: 2.5 million on
  // High, 1.8 on Medium, 1.2 on Low.
  const BUDGET = { high: 2500, medium: 1800, low: 1200 };
  results.frameTimeHoldsEverywhere = Object.values(frames).every((f) => Object.entries(f).every(([tier, x]) => x.ms < 22 && x.cpu < 8 && x.ktris < BUDGET[tier])) || JSON.stringify(frames);

  await context.close();
  return { results, errors };
}
