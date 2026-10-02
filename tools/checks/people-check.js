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

  // Every figure faces the track: the crowd from its stand, the crews from
  // their garages, the photographers and the camera at their corner, the
  // marshals from their posts. (A figure faces its own +x, turned by its yaw
  // about the vertical.) Facing it: some of the road within 600 lies within
  // 70 degrees of where they look. And every marshal's head clears the roof
  // of their post.
  results.everyoneFacesTheTrack = await step(() => {
    const bad = [];
    const cone = Math.cos(70 * Math.PI / 180);
    CIRCUITS.forEach((c) => {
      const track = TRACKS.find((t) => t.id === c.id);
      const people = Render3D.auditPeople(track);
      const figures = people.figures || [];
      let away = 0;
      let sample = null;
      figures.forEach((f) => {
        const fx = Math.cos(f.yaw);
        const fz = -Math.sin(f.yaw);
        const sees = typeof f.yaw === "number" && track.points.some((p) => {
          const dx = p.x - f.x;
          const dz = p.y - f.z;
          const l = Math.hypot(dx, dz);
          return l > 1 && l < 600 && (dx * fx + dz * fz) / l > cone;
        });
        if (!sees) { away += 1; if (!sample) sample = { kind: f.kind, x: f.x, z: f.z, yaw: f.yaw }; }
      });
      if (!figures.length || away || (people.headroom !== null && !(people.headroom > 0))) bad.push({ id: c.id, figures: figures.length, away, sample, headroom: people.headroom });
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

  // Changing circuits frees what the last one held: there and back twice,
  // the GPU holds no more geometries or textures the second time round.
  const held = [];
  for (const id of ["monaco", "singapore", "monaco", "singapore"]) {
    await race(id);
    await frames(10);
    held.push(await step(() => Render3D.inspect().trackside.memory));
  }
  results.circuitChangeFreesTheLast = (held[3].geometries <= held[1].geometries + 2 && held[3].textures <= held[1].textures) || JSON.stringify(held);

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

  // From here the field is held away (every other car parked 100 km off and
  // counted as finished, so it neither drives nor is put back on the track),
  // and the player is parked where a step puts it: nothing else moves in the
  // pictures or turns a head.
  await step(() => {
    window.peopleCheckHold = null;
    const hold = () => {
      const h = window.peopleCheckHold;
      if (h) {
        state.racers.forEach((r, i) => {
          if (r === getPlayer()) { r.x = h.x; r.y = h.y; r.speed = 0; } else { r.x = 1e5 + i * 50; r.y = 1e5; r.speed = 0; r.finished = true; }
        });
      }
      requestAnimationFrame(hold);
    };
    hold();
  });
  const park = (x, y) => step(([x, y]) => { window.peopleCheckHold = { x, y }; }, [x, y]);
  // A point of the road (off it, the game would put the car back on it): the
  // nearest to (x, z), or the farthest, or the first that `pick` accepts.
  const roadPoint = (x, z, how) => step(([x, z, how]) => {
    const pts = state.track.points.map((p) => ({ x: p.x, z: p.y, d: Math.hypot(p.x - x, p.y - z) }));
    if (how === "far") return pts.reduce((a, b) => (b.d > a.d ? b : a));
    return pts.reduce((a, b) => (b.d < a.d ? b : a));
  }, [x, z, how || "near"]);

  // The crowd: the camera on a stand at Singapore, the player parked on the
  // road nearest the stand (out of the picture), then as far away as the
  // circuit goes. Near, the spectators are
  // on their feet (the pose the shader gives them, as inspect reports it)
  // and waving: two moments differ on the stand's pixels. Far, seated and
  // still: they don't.
  const shot = async () => {
    const png = await p.screenshot({ clip: { x: 420, y: 250, width: 600, height: 400 } });
    return png.toString("base64");
  };
  // The stand nearest the road.
  const stand = await step(() => {
    const t = Render3D.inspect().trackside;
    const gap = (st) => Math.min(...state.track.points.map((p) => Math.hypot(p.x - st.x, p.y - st.z)));
    return t && t.standSpots.length ? t.standSpots.reduce((a, b) => (gap(b) < gap(a) ? b : a)) : null;
  });
  const cheer = () => step(() => Render3D.inspect().trackside.people.cheer);
  if (stand && stand.x !== undefined) {
    const f = { x: -Math.sin(stand.yaw), z: -Math.cos(stand.yaw) };
    await step(([st, f]) => {
      document.getElementById("game").style.visibility = "hidden";
      Render3D.setPhotoCamera({ from: { x: st.x + f.x * 150, y: st.z + f.z * 150, d: 0, h: 60 }, at: { x: st.x, y: st.z, d: 0, h: 30 }, fov: 50 });
    }, [stand, f]);
    const by = await roadPoint(stand.x, stand.z);
    await park(by.x, by.z);
    await frames(20);
    const near = await cheer();
    const nearA = await shot();
    await p.waitForTimeout(130);
    const nearB = await shot();
    const away = await roadPoint(stand.x, stand.z, "far");
    await park(away.x, away.z);
    await frames(20);
    const far = await cheer();
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
    const ok = typeof diffs === "object" && diffs.waving > 0.004 && diffs.still < diffs.waving / 4
      && near && near.near.count > 50 && near.near.excited > 0.95 && far && far.near.count === 0 && far.far.count > 500 && far.far.excited < 0.02;
    results.crowdCheersAsThePlayerPasses = ok || JSON.stringify({ diffs, near, far });

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

  // The pit crews turn to watch a car by their garage: the player parked on
  // the road off to one side of a crew member, they turn to face it (as far
  // as a body turns); with the car gone they face the lane again.
  const crew = await step(() => {
    const c = Render3D.auditPeople(state.track).figures.find((x) => x.kind === "crew");
    if (!c) return null;
    // A road point in range, 0.5 to 1.5 rad off the way they face at rest.
    const car = state.track.points.map((p) => ({ x: p.x, z: p.y })).find((p) => {
      const d = Math.hypot(p.x - c.x, p.z - c.z);
      const toward = Math.atan2(-(p.z - c.z), p.x - c.x);
      const off = Math.abs(Math.atan2(Math.sin(toward - c.base), Math.cos(toward - c.base)));
      return d > 40 && d < 250 && off > 0.5 && off < 1.5;
    });
    return car && { ...c, car };
  });
  if (crew && crew.car) {
    const { car } = crew;
    await park(car.x, car.z);
    await p.waitForTimeout(2000);
    const turned = await step((c) => {
      const f = Render3D.inspect().trackside.people.watchers.find((w) => Math.abs(w.x - c.x) < 0.5 && Math.abs(w.z - c.z) < 0.5);
      return f;
    }, crew);
    const want = Math.atan2(-(car.z - crew.z), car.x - crew.x);
    const off = turned ? Math.abs(Math.atan2(Math.sin(turned.yaw - want), Math.cos(turned.yaw - want))) : 9;
    const gone = await roadPoint(crew.x, crew.z, "far");
    await park(gone.x, gone.z);
    await p.waitForTimeout(2500);
    const back = await step((c) => Render3D.inspect().trackside.people.watchers.find((w) => Math.abs(w.x - c.x) < 0.5 && Math.abs(w.z - c.z) < 0.5), crew);
    const home = back ? Math.abs(Math.atan2(Math.sin(back.yaw - crew.base), Math.cos(back.yaw - crew.base))) : 9;
    results.crewsWatchTheCars = (off < 0.15 && home < 0.05) || JSON.stringify({ off, home, turned, back });
  } else {
    results.crewsWatchTheCars = `no crew: ${JSON.stringify(crew)}`;
  }

  // Frame time per tier at Singapore, the race running, the player parked
  // in front of a stand so the near crowd is drawn (in 3D on High and
  // Medium, painted on Low): each tier's median frame stays smooth
  // (measured there and back, so warming up doesn't count).
  if (stand && stand.x !== undefined) {
    const by = await roadPoint(stand.x, stand.z);
    await park(by.x, by.z);
  }
  const samples = { high: [], medium: [], low: [] };
  const drawn = {};
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
    drawn[tier] = await step(() => Render3D.inspect().trackside.people.standsDrawn3d);
  }
  const measured = {};
  Object.keys(samples).forEach((tier) => { measured[tier] = +((samples[tier][0] + samples[tier][1]) / 2).toFixed(1); });
  results.frameTimeHolds = (Object.values(measured).every((ms) => ms < 22) && drawn.high >= 1 && drawn.medium >= 1 && drawn.low === 0) || JSON.stringify({ measured, drawn });
  await step(() => { window.peopleCheckHold = null; Render3D.setGraphics("auto"); });

  await context.close();
  return { results, errors };
}
