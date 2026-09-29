// Browser check: trackside life (docs/superpowers/specs/2026-09-29-trackside-design.md).
// G1: pit lanes, garages, the Safety Car's way into the pits. G2: the venue
// moments, seen and heard. Run with the
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
      if (!a.lane || a.bays !== 11 || !a.safetyCarBayLast || a.garagesFromOwnRoad < a.garagesOwnNeed || a.garagesFromOtherRoads < a.garagesOtherNeed || a.stands !== a.standsExpected || a.standsExpected < 9 || a.standsFromRoad < a.roadEdge + 5 || !a.gantryPostClear) bad.push({ id: c.id, ...a });
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

  // G2 -- the venue moments. Every signature corner has its name board,
  // beside the track (past the barrier) at its corner; Monaco's tunnel is
  // circuit, its roof well clear of every car.
  results.venueBuilt = await step(() => {
    const bad = [];
    CIRCUITS.forEach((c) => {
      const track = TRACKS.find((t) => t.id === c.id);
      const v = Render3D.auditVenue(track);
      const L = track.totalLength;
      v.corners.forEach((name) => {
        const b = v.boards.find((x) => x.board === name);
        if (!b) bad.push(`${c.id}: no ${name} board`);
        else if (b.clear < 6 || Math.abs(((b.at - b.wanted) % L + L * 1.5) % L - L / 2) > 130) bad.push(`${c.id}: ${name} at ${b.at} (${b.clear} clear)`);
      });
      if (c.id === "monaco" && (!v.tunnel || v.tunnel.roof < 30)) bad.push("monaco: tunnel");
    });
    return bad.length === 0 || JSON.stringify(bad);
  });

  // Heard: the engine rings through Monaco's tunnel -- no reverb before it,
  // full reverb inside, none after -- and under Suzuka's bridge; the crowd
  // swells level with a grandstand. Through the real audio graph.
  const soundAt = (id, fn) => step(async ([id, src]) => {
    Game.backToPitLane();
    const cup = CUPS.findIndex((c) => c.tracks.some((t) => t.id === id));
    Game.selectCup(cup); Game.startCup();
    const ti = CUPS[cup].tracks.findIndex((t) => t.id === id);
    if (ti > 0) { state.raceIndex = ti; startRace(ti); }
    for (let i = 0; i < 300 && state.preparing; i += 1) await new Promise((r) => requestAnimationFrame(r));
    initAudio();
    const pl = getPlayer();
    const hear = (d) => { pl.trackDistance = ((d % state.track.totalLength) + state.track.totalLength) % state.track.totalLength; return venueSound(pl, true); };
    return (0, eval)(`(${src})`)(hear, state.track, Boolean(audio.venue && audio.venue.reverb && audio.venue.crowd));
  }, [id, fn.toString()]);
  results.tunnelRings = await soundAt("monaco", (hear, track, wired) => {
    const t = track.tunnel;
    const before = hear(t.from - 100).reverb;
    const portal = hear(t.from + Venue.RAMP / 2).reverb;
    const inside = hear((t.from + t.to) / 2).reverb;
    const after = hear(t.to + 100).reverb;
    return (wired && before === 0 && portal > 0.2 && portal < 0.8 && inside === 1 && after === 0) || JSON.stringify({ wired, before, portal, inside, after });
  });
  results.bridgeRings = await soundAt("suzuka", (hear, track) => {
    const zone = track.reverbZones.find((z) => z.kind === "bridge");
    if (!zone) return "no bridge zone";
    const under = (zone.from + Venue.UNDER_BRIDGE);
    return (hear(under).reverb === 1 && hear(under + 300).reverb === 0) || JSON.stringify(zone);
  });
  results.crowdSwells = await soundAt("monza", (hear, track) => {
    const stand = track.crowdStands[0];
    if (!stand) return "no grandstands";
    const at = hear(stand.d).crowd;
    const far = hear(stand.d + Venue.CROWD_REACH * 3);
    return (at > 0.95 && (far.crowd < at)) || JSON.stringify({ at, far: far.crowd });
  });

  // Seen: inside the tunnel the road is dark against the sunlit approach
  // (the roof's shadow, no sky), with the lamps overhead.
  const roadAt = async (offset) => {
    await step(async (offset) => {
      const t = state.track.tunnel; const L = state.track.totalLength;
      const route = PowerUps.makeRoute(state.track.points, state.track.roadWidth);
      const d0 = ((t.from + offset) % L + L) % L; const d1 = ((t.from + offset + 60) % L + L) % L;
      const a = route.sample(d0); const b = route.sample(d1);
      document.getElementById("screens").style.visibility = "hidden";
      document.getElementById("game").style.visibility = "hidden";
      Render3D.setPhotoCamera({ from: { x: a.x, y: a.y, d: d0, h: 10 }, at: { x: b.x, y: b.y, d: d1, h: 2 }, fov: 50 });
      state.paused = false;
      const end = performance.now() + 1200;
      await new Promise((r) => { const f = () => (performance.now() > end ? r() : requestAnimationFrame(f)); f(); });
      state.paused = true; state.pausedAt = performance.now();
    }, offset);
    const box = await step(() => ({ w: innerWidth, h: innerHeight }));
    const png = await p.screenshot({ clip: { x: Math.round(box.w * 0.3), y: Math.round(box.h * 0.75), width: Math.round(box.w * 0.4), height: Math.round(box.h * 0.2) } });
    return step(async (b64) => {
      const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
      const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
      const g = c.getContext("2d"); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      let sum = 0; for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      return sum / (d.length / 4);
    }, png.toString("base64"));
  };
  await step(async () => {
    Game.backToPitLane();
    const cup = CUPS.findIndex((c) => c.tracks.some((t) => t.id === "monaco"));
    Game.selectCup(cup); Game.startCup();
    const ti = CUPS[cup].tracks.findIndex((t) => t.id === "monaco");
    if (ti > 0) { state.raceIndex = ti; startRace(ti); }
    for (let i = 0; i < 300 && state.preparing; i += 1) await new Promise((r) => requestAnimationFrame(r));
  });
  const outside = await roadAt(-220);
  const inside = await roadAt(200);
  await step(() => { Render3D.setPhotoCamera(null); state.paused = false; document.getElementById("screens").style.visibility = ""; document.getElementById("game").style.visibility = ""; });
  const onMonaco = await step(() => state.track.id === "monaco");
  results.tunnelDark = (onMonaco === true && typeof outside === "number" && typeof inside === "number" && inside < outside * 0.6) || JSON.stringify({ onMonaco, outside, inside });

  await context.close();
  return { results, errors };
}
