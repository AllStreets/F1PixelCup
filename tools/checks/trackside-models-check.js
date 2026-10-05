// Browser check: the trackside's final look, every venue
// (docs/superpowers/specs/2026-10-01-trackside-blender-design.md, section 8).
// Every venue's landmark built from its Blender model (the 2025 venues'
// too: docs/superpowers/specs/2026-10-01-landmarks-2025-design.md), the
// yachts on the water at Monaco, Singapore and the 2025 harbours, nothing
// over the track, nobody on the road,
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
  // Only the raced venue's models are held: built for Albert Park, then for
  // Shanghai, Melbourne's towers are let go and Shanghai's grandstand is in
  // (before anything asks for every venue's models, which keeps them all).
  results.onlyTheRacedVenueHeld = await step(async () => {
    const loaded = () => Render3D.inspect().trackside.models.loaded;
    const until = async (name) => { for (let i = 0; i < 400 && !loaded().includes(name); i += 1) await new Promise((r) => setTimeout(r, 50)); };
    Render3D.auditScenery(TRACKS.find((t) => t.id === "albertpark"), { step: 80, lanes: 1 });
    await until("melbourneSkyline");
    const first = loaded().slice();
    Render3D.auditScenery(TRACKS.find((t) => t.id === "shanghai"), { step: 80, lanes: 1 });
    await until("shanghaiGrandstand");
    const then = loaded();
    return (first.includes("melbourneSkyline") && !then.includes("melbourneSkyline") && then.includes("shanghaiGrandstand") && then.includes("people"))
      || JSON.stringify({ first, then });
  });

  // Every venue's models in (each loads with its circuit; the checks ask for them all).
  await step(() => (Render3D.loadAllModels ? Render3D.loadAllModels() : null));

  // Each venue's landmarks, from their models.
  const WANT = {
    monza: ["monzaBanking"], spa: ["spaPits"], silverstone: ["silverstoneWing"], suzuka: ["suzukaWheel"],
    monaco: ["casino"], singapore: ["marinaBaySands", "singaporeFlyer"], bahrain: ["sakhirTower"], interlagos: ["spTowers"],
    // The 2025 venues (docs/superpowers/specs/2026-10-01-landmarks-2025-design.md).
    albertpark: ["melbourneSkyline"], shanghai: ["shanghaiGrandstand"], jeddah: ["jeddahFountain"], miami: ["miamiStadium"],
    imola: ["hillside"], barcelona: ["barcelonaGrandstand"], montreal: ["biosphere"], redbullring: ["spielbergGrandstand", "hillside"],
    hungaroring: ["hillside"], zandvoort: ["hugenholtz"], baku: ["bakuOldCity", "flameTowers"], cota: ["cotaTower", "hillside"],
    mexico: ["foroSol"], lasvegas: ["vegasSphere", "vegasStrip"], losail: ["losailGrandstand", "lusailTowers"], yasmarina: ["yasHotel"],
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

  // Miami's stadium inside the circuit's loop, as in life (the track runs
  // round it), at no more than the city's scale and no less than the map's.
  results.miamiStadiumInside = await step(() => {
    const track = TRACKS.find((t) => t.id === "miami");
    Render3D.auditScenery(track, { step: 50, lanes: 1 });
    const L = Render3D.inspect().trackside.landmarks.find((l) => l.name === "miamiStadium");
    if (!L) return "no stadium";
    const pts = track.points;
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) {
      const a = pts[i];
      const b = pts[j];
      if ((a.y > L.z) !== (b.y > L.z) && L.x < ((b.x - a.x) * (L.z - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    }
    return (inside && L.scale >= 1.3 && L.scale <= 2.5) || JSON.stringify(L);
  });

  // The yachts: Monaco's moored at the quays (packed along the harbour front)
  // and anchored out, Singapore's in the bay; every hull past the quay, no
  // two touching, Singapore's wholly inside Marina Bay. The 2025 harbours:
  // Yas Marina's, Baku's and Jeddah's at anchor at sea, every hull on its
  // water.
  results.yachtsOnTheWater = await step(() => {
    const out = {};
    ["monaco", "singapore", "yasmarina", "baku", "jeddah"].forEach((id) => { out[id] = Render3D.auditYachts(TRACKS.find((t) => t.id === id)); });
    const m = out.monaco;
    const s = out.singapore;
    // (Monaco's harbour front: 15 or more moored right behind the barrier,
    // the quay 14 behind it, as on race weekend.)
    const onWater = (y, least, clear) => y && y.anchored >= least && y.inBay && y.outsideBay === 0 && y.overlaps === 0 && y.leastClearance >= clear;
    // Monaco's front: 16 past the barrier (the quay and a little water), the
    // rest 190 (past the town); none against the land, and nothing else
    // standing on the front's water. The sea harbours: their own water.
    return (m && m.moored >= 20 && m.front >= 15 && m.anchored >= 8 && m.leastFront >= 16 && (m.leastOther === null || m.leastOther >= 190)
      && m.onLand === 0 && m.onWater === 0 && m.overlaps === 0
      && s && s.anchored >= 4 && s.inBay && s.outsideBay === 0 && s.overlaps === 0 && s.leastClearance >= 40
      && onWater(out.yasmarina, 10, 100) && onWater(out.baku, 6, 100) && onWater(out.jeddah, 6, 100)) || JSON.stringify(out);
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
  // A tier's frames: how many of 120 ran long (over 25 ms: under 40 a
  // second), and the median of what they drew (triangles) and how long the
  // drawing took on the main thread. The frame is held to the display's
  // refresh, so the long frames show stutter; the drawing time and the
  // triangles show the headroom. Read cheaply (Render3D.frameStats), so the
  // measuring adds nothing to what is measured.
  const sample = () => step(() => new Promise((resolve) => {
    let long = 0;
    let n = 0;
    const tris = [];
    const cpu = [];
    let last = performance.now();
    const tick = () => {
      const t = performance.now();
      if (n > 0 && t - last > 25) long += 1;
      last = t;
      const s = Render3D.frameStats();
      tris.push(s.triangles);
      cpu.push(s.cpuMs);
      n += 1;
      if (n < 121) requestAnimationFrame(tick);
      else {
        const mid = (a) => a.slice(10).sort((x, y) => x - y)[55];
        resolve({ long, tris: mid(tris), cpu: mid(cpu) });
      }
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
    const crowd = {};
    for (const tier of ["high", "medium", "low", "low", "medium", "high"]) {
      await step((t) => Render3D.setGraphics(t), tier);
      got[tier].push(await sample());
      crowd[tier] = await step(() => Render3D.inspect().trackside.people.standsDrawn3d);
    }
    frames[c] = Object.fromEntries(Object.entries(got).map(([k, v]) => [k, {
      long: v[0].long + v[1].long, cpu: +((v[0].cpu + v[1].cpu) / 2).toFixed(1), ktris: Math.round(Math.max(v[0].tris, v[1].tris) / 1000), crowd3d: crowd[k],
    }]));
  }
  await step(() => Render3D.setGraphics("auto"));
  // Smooth (under 5 % of frames long), the drawing well inside a frame (under
  // 8 ms on the main thread), the triangles within budget: 2.5 million on
  // High, 1.8 on Medium, 1.2 on Low; on High the near stand's crowd drawn in
  // 3D while measured, on Low none.
  const BUDGET = { high: 2500, medium: 1800, low: 1200 };
  results.frameTimeHoldsEverywhere = Object.values(frames).every((f) => Object.entries(f).every(([tier, x]) => x.long <= 12 && x.cpu < 8 && x.ktris < BUDGET[tier])
    && f.high.crowd3d >= 1 && f.low.crowd3d === 0) || JSON.stringify(frames);

  await context.close();
  return { results, errors };
}
