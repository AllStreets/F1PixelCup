// Browser check: the trackside models and people, Stage J's first look
// (docs/superpowers/specs/2026-10-01-trackside-blender-design.md, section 7).
// The landmarks and the covered grandstand built from their Blender models,
// nothing over the track, nobody on the road, the crowd on its feet as the
// player passes, no 3D crowd on Low, and the frame time holding on every
// tier. Run with the Playwright MCP tool browser_run_code_unsafe, filename:
// tools/checks/people-check.js, dev server on http://localhost:8765.
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
  await p.waitForFunction(() => window.Render3D && Render3D.ready, null, { timeout: 30000 });
  const step = async (fn, arg) => { try { return await p.evaluate(fn, arg); } catch (e) { return `error: ${String(e).split("\n")[0].slice(0, 160)}`; } };
  const frames = (n) => p.evaluate((n) => new Promise((resolve) => {
    let left = n;
    const tick = () => (--left <= 0 ? resolve() : requestAnimationFrame(tick));
    requestAnimationFrame(tick);
  }), n);

  // Every circuit: nothing over the track (the people included), and every
  // figure placed outside the barriers. Each circuit has its pit crews, its
  // photographers and one TV camera operator on a platform.
  results.nothingOnTheTrack = await step(() => {
    const bad = [];
    CIRCUITS.forEach((c) => {
      const track = TRACKS.find((t) => t.id === c.id);
      const hits = Render3D.auditScenery(track);
      const people = Render3D.auditPeople ? Render3D.auditPeople(track) : null;
      if (!people) { bad.push({ id: c.id, people: "none" }); return; }
      const k = people.byKind;
      if (hits.length || people.onRoad.length || !(k.crew >= 30) || !(k.photographer >= 3) || k.camera_operator !== 1) {
        bad.push({ id: c.id, hits: hits.slice(0, 2), onRoad: people.onRoad.slice(0, 3), byKind: k });
      }
    });
    return bad.length === 0 || JSON.stringify(bad).slice(0, 400);
  });

  const race = (id) => step(async (id) => {
    Game.backToPitLane();
    const cup = CUPS.findIndex((c) => c.tracks.some((t) => t.id === id));
    Game.selectCup(cup);
    Game.selectGridMode("back");
    Game.startCup();
    const ti = CUPS[cup].tracks.findIndex((t) => t.id === id);
    if (ti > 0) { state.raceIndex = ti; startRace(ti); }
    for (let i = 0; i < 900 && (state.phase !== "race" || state.preparing); i += 1) await new Promise((r) => requestAnimationFrame(r));
    return state.track.id;
  }, id);

  // The landmarks come from their models at Monaco and Singapore, the
  // covered stands too, each with its crowd.
  const built = {};
  for (const [id, name] of [["monaco", "casino"], ["singapore", "marinaBaySands"]]) {
    await race(id);
    await frames(10);
    built[id] = await step((name) => {
      const t = Render3D.inspect().trackside;
      if (!t) return { none: true };
      const lm = t.landmarks.find((l) => l.name === name);
      return { fromModel: Boolean(lm && lm.fromModel), stands: t.modelStands, crowd: t.people ? t.people.crowd3d : 0, failed: t.models.failed };
    }, name);
  }
  results.landmarksFromModels = Object.values(built).every((b) => b.fromModel && b.stands >= 2 && b.crowd > 500 && !b.failed.length) || JSON.stringify(built);

  // Marina Bay Sands is lit for the night race: seen from across the bay,
  // the towers' rooms glow warm.
  const towers = await step(() => {
    const L = Render3D.inspect().trackside.landmarks.find((l) => l.name === "marinaBaySands");
    if (!L) return null;
    const f = { x: -Math.sin(L.yaw), z: -Math.cos(L.yaw) };
    document.getElementById("game").style.visibility = "hidden";
    Render3D.setPhotoCamera({ from: { x: L.x + f.x * 1000, y: L.z + f.z * 1000, d: 0, h: 250 }, at: { x: L.x, y: L.z, d: 0, h: 250 }, fov: 40 });
    return { w: innerWidth, h: innerHeight };
  });
  if (towers && towers.w) {
    await frames(10);
    // The middle tower, in the middle of the picture.
    const png = (await p.screenshot({ clip: { x: towers.w / 2 - 50, y: towers.h * 0.25, width: 100, height: towers.h * 0.35 } })).toString("base64");
    const warm = await step(async (b64) => {
      const im = await new Promise((resolve) => { const i = new Image(); i.onload = () => resolve(i); i.src = `data:image/png;base64,${b64}`; });
      const c = document.createElement("canvas");
      c.width = im.width; c.height = im.height;
      const g = c.getContext("2d");
      g.drawImage(im, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] > 150 && d[i + 1] > 110 && d[i] > d[i + 2] + 15) n += 1;
      return n / (d.length / 4);
    }, png);
    results.marinaBaySandsLitAtNight = warm > 0.03 || `warm share ${JSON.stringify(warm)}`;
    await step(() => { Render3D.setPhotoCamera(null); document.getElementById("game").style.visibility = ""; });
  } else {
    results.marinaBaySandsLitAtNight = "no Marina Bay Sands";
  }

  // The crowd: the camera on a stand at Singapore, the race running, the
  // player (no throttle: parked) behind the stand, out of the picture, and
  // then far away. Near, the crowd is on its feet and waving: two moments
  // differ on the stand's pixels. Far, seated and still: they don't.
  const shot = async () => {
    const png = await p.screenshot({ clip: { x: 420, y: 250, width: 600, height: 400 } });
    return png.toString("base64");
  };
  const stand = await step(() => {
    const t = Render3D.inspect().trackside;
    return t && t.standSpots[0];
  });
  if (stand && stand.x !== undefined) {
    await step((st) => {
      document.getElementById("game").style.visibility = "hidden";
      const f = { x: -Math.sin(st.yaw), z: -Math.cos(st.yaw) };
      Render3D.setPhotoCamera({ from: { x: st.x + f.x * 150, y: st.z + f.z * 150, d: 0, h: 60 }, at: { x: st.x, y: st.z, d: 0, h: 30 }, fov: 50 });
      const pl = getPlayer();
      pl.x = st.x - f.x * 60;
      pl.y = st.z - f.z * 60;
      pl.speed = 0;
    }, stand);
    await frames(20);
    const nearA = await shot();
    await p.waitForTimeout(130);
    const nearB = await shot();
    await step((st) => { const pl = getPlayer(); pl.x = st.x + 5000; pl.y = st.z + 5000; pl.speed = 0; }, stand);
    await frames(20);
    const farA = await shot();
    await p.waitForTimeout(130);
    const farB = await shot();
    const diffs = await step(async (imgs) => {
      const load = (b64) => new Promise((resolve) => { const im = new Image(); im.onload = () => resolve(im); im.src = `data:image/png;base64,${b64}`; });
      const pixels = async (b64) => {
        const im = await load(b64);
        const c = document.createElement("canvas");
        c.width = im.width; c.height = im.height;
        const g = c.getContext("2d");
        g.drawImage(im, 0, 0);
        return g.getImageData(0, 0, c.width, c.height).data;
      };
      const [a, b, c, d] = await Promise.all(imgs.map(pixels));
      // The share of pixels that changed visibly.
      const share = (x, y) => { let n = 0; for (let i = 0; i < x.length; i += 4) if (Math.abs(x[i] - y[i]) + Math.abs(x[i + 1] - y[i + 1]) + Math.abs(x[i + 2] - y[i + 2]) > 30) n += 1; return n / (x.length / 4); };
      return { waving: share(a, b), still: share(c, d) };
    }, [nearA, nearB, farA, farB]);
    results.crowdCheersAsThePlayerPasses = (typeof diffs === "object" && diffs.waving > 0.004 && diffs.still < diffs.waving / 4) || JSON.stringify(diffs);

    // Low: no 3D crowd, the painted crowd instead. High: the near stands in 3D.
    const tiers = {};
    for (const tier of ["low", "high"]) {
      await step((t) => Render3D.setGraphics(t), tier);
      await frames(5);
      tiers[tier] = await step(() => { const q = Render3D.inspect().trackside.people; return { drawn3d: q.standsDrawn3d, painted: q.standsPainted, stands: q.stands }; });
    }
    results.lowHasNoCrowdFigures = (tiers.low.drawn3d === 0 && tiers.low.painted === tiers.low.stands && tiers.high.drawn3d >= 1) || JSON.stringify(tiers);
    await step(() => { Render3D.setPhotoCamera(null); document.getElementById("game").style.visibility = ""; });
  } else {
    results.crowdCheersAsThePlayerPasses = `no stand: ${JSON.stringify(stand)}`;
    results.lowHasNoCrowdFigures = "no stand";
  }

  // The pit crews turn to watch a car passing their garage.
  results.crewsWatchTheCars = await step(async () => {
    const t = Render3D.inspect().trackside;
    return t.people.watcherYaw.filter((w) => w.kind === "crew").some((w) => Math.abs(w.turned) > 0.1) || JSON.stringify(t.people.watcherYaw.slice(0, 6));
  });

  // Frame time per tier at Singapore, the race running: each tier's median
  // frame stays smooth (measured there and back, so warming up doesn't count).
  const samples = { high: [], medium: [], low: [] };
  for (const tier of ["high", "medium", "low", "low", "medium", "high"]) {
    await step((t) => Render3D.setGraphics(t), tier);
    samples[tier].push(await step(() => new Promise((resolve) => {
      const times = [];
      let last = performance.now();
      const tick = () => {
        const t = performance.now();
        times.push(t - last);
        last = t;
        if (times.length < 90) requestAnimationFrame(tick);
        else resolve(times.slice(10).sort((a, b) => a - b)[40]);
      };
      requestAnimationFrame(tick);
    })));
  }
  const measured = {};
  Object.keys(samples).forEach((tier) => { measured[tier] = +((samples[tier][0] + samples[tier][1]) / 2).toFixed(1); });
  results.frameTimeHolds = Object.values(measured).every((ms) => ms < 22) || JSON.stringify(measured);
  await step(() => Render3D.setGraphics("auto"));

  await context.close();
  return { results, errors };
}
