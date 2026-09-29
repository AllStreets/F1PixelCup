// Browser check: trackside life (docs/superpowers/specs/2026-09-29-trackside-design.md).
// G1: pit lanes, garages, the Safety Car's way into the pits. G2: the venue
// moments, seen and heard. G3: marshals, the helicopter, fireworks. Run with the
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
  // circuit, its roof (as built) well clear of every car; Suzuka's
  // under-bridge reverb is on the lower road with the deck crossing above.
  results.venueBuilt = await step(() => {
    const bad = [];
    CIRCUITS.forEach((c) => {
      const track = TRACKS.find((t) => t.id === c.id);
      const v = Render3D.auditVenue(track);
      const L = track.totalLength;
      v.corners.forEach((name) => {
        const b = v.boards.find((x) => x.board === name);
        if (!b) bad.push(`${c.id}: no ${name} board`);
        else if (b.clear < 6 || Math.abs(((b.at - b.wanted) % L + L * 1.5) % L - L / 2) > 90) bad.push(`${c.id}: ${name} at ${b.at} (${b.clear} clear)`);
      });
      if (c.id === "monaco" && (!v.tunnel || !(v.tunnel.roof >= 30))) bad.push(`monaco: tunnel ${JSON.stringify(v.tunnel)}`);
      v.bridges.forEach((z) => { if (z.height > 0.5 || z.deckAbove > 60) bad.push(`${c.id}: bridge zone ${JSON.stringify(z)}`); });
      if (c.id === "suzuka" && v.bridges.length !== 1) bad.push("suzuka: no bridge zone");
    });
    return bad.length === 0 || JSON.stringify(bad);
  });

  // Heard, through the real audio graph: the reverb's gain node follows the
  // player into Monaco's tunnel and out again. (A click gives the page its
  // audio, as a player's first key or click does.)
  await p.mouse.click(5, 5);
  const load = (id) => step(async (id) => {
    Game.backToPitLane();
    const cup = CUPS.findIndex((c) => c.tracks.some((t) => t.id === id));
    Game.selectCup(cup); Game.startCup();
    const ti = CUPS[cup].tracks.findIndex((t) => t.id === id);
    if (ti > 0) { state.raceIndex = ti; startRace(ti); }
    for (let i = 0; i < 300 && state.preparing; i += 1) await new Promise((r) => requestAnimationFrame(r));
    state.phase = "race";
    initAudio();
    await audio.ctx.resume();
    return audio.ctx.state;
  }, id);
  const gainAt = (d) => step(async (d) => {
    // The race held (the game would move the player on), the sound playing.
    state.paused = true;
    const pl = getPlayer();
    const L = state.track.totalLength;
    // Hold the player there for 0.8 s of audio time (the gains glide).
    const until = audio.ctx.currentTime + 0.8;
    while (audio.ctx.currentTime < until) {
      pl.trackDistance = ((d % L) + L) % L;
      updateEngineAudio(pl);
      await new Promise((r) => setTimeout(r, 30));
    }
    return { reverb: audio.venue.reverb.gain.value, crowd: audio.venue.crowd.gain.value, feeding: audio.venue.feeding };
  }, d);
  const ctxState = await load("monaco");
  const t = await step(() => state.track.tunnel);
  const before = await gainAt(t.from - 150);
  const inside = await gainAt((t.from + t.to) / 2);
  const after = await gainAt(t.to + 150);
  results.tunnelRings = (ctxState === "running" && inside.feeding && before.reverb < 0.05 && inside.reverb > 0.8 && after.reverb < 0.05) || JSON.stringify({ ctxState, before, inside, after });
  // A circuit with nowhere to ring doesn't run the reverb at all.
  await load("monza");
  const monza = await gainAt(1000);
  results.reverbOnlyWhereItRings = (monza.feeding === false && monza.reverb < 0.05) || JSON.stringify(monza);
  // The crowd: each grandstand is heard at its own stretch of the lap (the
  // point at its lap distance is beside it), loudest there; somewhere far
  // from every stand it is silent.
  results.crowdSwells = await step(() => {
    const bad = [];
    CIRCUITS.forEach((c) => {
      const track = TRACKS.find((x) => x.id === c.id);
      const route = PowerUps.makeRoute(track.points, track.roadWidth);
      const L = track.totalLength;
      const stands = track.crowdStands;
      stands.forEach((st) => {
        const at = route.sample(st.d);
        if (Math.hypot(at.x - st.x, at.y - st.y) > 300) bad.push(`${c.id}: stand at ${st.d} is heard away from it`);
        if (Venue.crowdAt(st.d, stands, L) !== 1) bad.push(`${c.id}: not loudest at its stand`);
      });
      const quiet = Array.from({ length: 200 }, (_, i) => (i / 200) * L).find((d) => stands.every((st) => Math.abs(Venue.delta(st.d, d, L)) > Venue.CROWD_REACH));
      if (quiet !== undefined && Venue.crowdAt(quiet, stands, L) !== 0) bad.push(`${c.id}: crowd heard far from every stand`);
    });
    return bad.length === 0 || JSON.stringify(bad);
  });

  // Seen: the tunnel is dark by its own light, not by where the camera is.
  // From outside, on the sunlit approach, the road just inside the mouth is
  // dark against the road just before it -- in the same picture, so not the
  // camera's doing; and from inside, the road is dark against the sunlit road
  // outside.
  await load("monaco");
  const lumaAt = async (fromOff, atOff, h, marks) => {
    const spots = await step(async ([fromOff, atOff, h, marks]) => {
      const t = state.track.tunnel; const L = state.track.totalLength;
      const route = PowerUps.makeRoute(state.track.points, state.track.roadWidth);
      const at = (off) => { const d = ((t.from + off) % L + L) % L; return { d, ...route.sample(d) }; };
      const a = at(fromOff); const b = at(atOff);
      document.getElementById("screens").style.visibility = "hidden";
      document.getElementById("game").style.visibility = "hidden";
      const fov = 50;
      Render3D.setPhotoCamera({ from: { x: a.x, y: a.y, d: a.d, h }, at: { x: b.x, y: b.y, d: b.d, h: h - 3 }, fov });
      state.paused = false;
      const end = performance.now() + 1200;
      await new Promise((r) => { const f = () => (performance.now() > end ? r() : requestAnimationFrame(f)); f(); });
      state.paused = true; state.pausedAt = performance.now();
      // Where each marked point of the road (on the centreline, just above
      // it) lands on screen, by the same perspective as the photo camera
      // (Monaco is flat: road height 0).
      const C = [a.x, h, a.y]; const T = [b.x, h - 3, b.y];
      const sub = (u, v) => u.map((x, i) => x - v[i]);
      const dot = (u, v) => u.reduce((s, x, i) => s + x * v[i], 0);
      const norm = (u) => { const l = Math.hypot(...u); return u.map((x) => x / l); };
      const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const f = norm(sub(T, C)); const r = norm(cross(f, [0, 1, 0])); const u = cross(r, f);
      const k = Math.tan((fov * Math.PI) / 360);
      return marks.map((off) => {
        const p = at(off); const v = sub([p.x, 1, p.y], C);
        const z = dot(v, f);
        return { x: (dot(v, r) / (z * k * innerWidth / innerHeight) + 1) / 2 * innerWidth, y: (1 - dot(v, u) / (z * k)) / 2 * innerHeight };
      });
    }, [fromOff, atOff, h, marks]);
    const out = [];
    for (const spot of spots) {
      const box = await step(() => ({ w: innerWidth, h: innerHeight }));
      if (!(spot.x > 8 && spot.x < box.w - 8 && spot.y > 4 && spot.y < box.h - 4)) { out.push(`off screen ${Math.round(spot.x)},${Math.round(spot.y)}`); continue; }
      const png = await p.screenshot({ clip: { x: Math.round(spot.x - 8), y: Math.round(spot.y - 4), width: 16, height: 8 } });
      out.push(await step(async (b64) => {
        const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
        const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
        const g = c.getContext("2d"); g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, c.width, c.height).data;
        let sum = 0; for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        return Math.round(sum / (d.length / 4));
      }, png.toString("base64")));
    }
    return out;
  };
  // From 120 before the portal: the road 40 before it, and 70 inside it.
  const [approachRoad, within] = await lumaAt(-120, 80, 12, [-40, 70]);
  // From inside, looking along: the road ahead in the middle of the tunnel
  // (past the row of item boxes, whose glow would light it).
  const [insideRoad] = await lumaAt(330, 430, 12, [370]);
  await step(() => { Render3D.setPhotoCamera(null); state.paused = false; document.getElementById("screens").style.visibility = ""; document.getElementById("game").style.visibility = ""; });
  const numbers = [approachRoad, within, insideRoad].every((v) => typeof v === "number");
  results.tunnelDark = (numbers && within < approachRoad * 0.5 && insideRoad < approachRoad * 0.6) || JSON.stringify({ approachRoad, within, insideRoad });

  // G3 -- trackside life. Marshal posts all round every circuit (a few may
  // have had to give way to other scenery), all on the ground; the starter on
  // clear ground by the line.
  results.marshalsPosted = await step(() => {
    const bad = [];
    CIRCUITS.forEach((c) => {
      const v = Render3D.auditVenue(TRACKS.find((t) => t.id === c.id));
      const m = v.marshals;
      if (m.placed < m.wanted * 0.8 || m.offGround) bad.push(`${c.id}: ${m.placed} of ${m.wanted}, ${m.offGround} off the ground`);
      if (!v.starter || v.starter.clear < 6) bad.push(`${c.id}: starter ${JSON.stringify(v.starter)}`);
    });
    return bad.length === 0 || JSON.stringify(bad);
  });
  // In a race: a car spun just past a post brings out its waved yellow; once
  // the car is away, green; the posts elsewhere stay furled.
  await step(async () => {
    Game.backToPitLane();
    Game.selectCup(0); Game.startCup();
    for (let i = 0; i < 300 && state.preparing; i += 1) await new Promise((r) => requestAnimationFrame(r));
    // Past the lights and the first seconds (no flags off the line).
    const until = performance.now() + 20000;
    while (performance.now() < until && !(state.phase === "race" && state.raceStart && renderClock() - state.raceStart > 5500)) await new Promise((r) => setTimeout(r, 100));
  });
  results.marshalYellow = await step(async () => {
    const frames = (n) => new Promise((r) => { let k = n; const f = () => (--k <= 0 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
    state.paused = true; state.pausedAt = performance.now();
    const posts = state.track.marshalPosts;
    const k = 3;
    const victim = state.racers.find((r) => !r.isPlayer);
    const L = state.track.totalLength;
    state.racers.forEach((r) => { r.speed = r.physics.maxSpeed * 0.8; r.spinUntil = 0; });
    victim.trackDistance = (posts[k].d + 120) % L;
    victim.spinUntil = renderClock() + 5000;
    await frames(3);
    const during = Render3D.inspect().life.posts;
    victim.spinUntil = 0; victim.trackDistance = (posts[k].d + 1500) % L;
    await frames(3);
    const after = Render3D.inspect().life.posts;
    const others = during.filter((q) => q.index !== k && q.flag === "yellow").length;
    state.paused = false;
    const mine = (list) => (list.find((q) => q.index === k) || {}).flag;
    return (mine(during) === "yellow" && mine(after) === "green" && others === 0) || JSON.stringify({ during: mine(during), after: mine(after), others });
  });
  // The helicopter trails the leader by 400, high over the circuit.
  results.helicopterFollows = await step(async () => {
    state.paused = false;
    await new Promise((r) => setTimeout(r, 4000));
    const life = Render3D.inspect().life;
    const leader = firstUnfinished();
    const L = state.track.totalLength;
    const route = PowerUps.makeRoute(state.track.points, state.track.roadWidth);
    // The lap distance the helicopter is beside: the nearest point of the lap.
    // (Only the stretch round where it should be: another stretch may pass
    // nearer the helicopter than its own.)
    let best = { gap: Infinity, d: 0 };
    for (let k = -900; k <= 100; k += 5) { const d = ((leader.trackDistance + k) % L + L) % L; const q = route.sample(d); const gap = Math.hypot(q.x - life.helicopter.x, q.y - life.helicopter.z); if (gap < best.gap) best = { gap, d }; }
    const behind = ((leader.trackDistance - best.d) % L + L) % L;
    return (life.helicopter.height >= 200 && behind > 280 && behind < 560) || JSON.stringify({ height: life.helicopter.height, behind });
  });
  // Its rotor is heard near it, and not far from it: the rotor's gain node,
  // with the audio running.
  await p.mouse.click(5, 5);
  results.helicopterHeard = await step(async () => {
    initAudio();
    await audio.ctx.resume();
    state.paused = true;
    const pl = getPlayer();
    const leader = firstUnfinished();
    const L = state.track.totalLength;
    const keep = pl.trackDistance;
    const hold = async (d) => {
      const until = audio.ctx.currentTime + 1.2;
      while (audio.ctx.currentTime < until) { pl.trackDistance = ((d % L) + L) % L; updateEngineAudio(pl); await new Promise((r) => setTimeout(r, 30)); }
      return audio.venue.rotor.gain.value;
    };
    const near = await hold(leader.trackDistance - 400);
    const far = await hold(leader.trackDistance + L / 2);
    pl.trackDistance = keep;
    state.paused = false;
    return (near > 0.012 && far < 0.002) || JSON.stringify({ near, far, ctx: audio.ctx.state });
  });
  // No fireworks and no chequered flag before the leader finishes; then both.
  results.fireworksAtTheFlag = await step(async () => {
    const frames = (n) => new Promise((r) => { let k = n; const f = () => (--k <= 0 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
    const before = Render3D.inspect().life;
    state.flagOutAt = renderClock();
    // Real time: the race itself runs fast-forward after the flag.
    await new Promise((r) => setTimeout(r, 900));
    const after = Render3D.inspect().life;
    await new Promise((r) => setTimeout(r, 2500));
    const later = Render3D.inspect().life;
    state.flagOutAt = 0;
    await frames(2);
    const show = (x) => ({ fireworks: x.fireworks, starter: x.starterWaving });
    return (before.fireworks === 0 && !before.starterWaving && after.fireworks > 0 && after.starterWaving && later.fireworks > 0) || JSON.stringify({ before: show(before), after: show(after), later: show(later) });
  });

  // The player's own chequered flag: the finish shot looks back at the line,
  // and the starter's flag and the fireworks are in the picture.
  results.finishShotShowsTheShow = await step(async () => {
    const pl = getPlayer();
    pl.finished = true;
    state.chequerAt = renderClock();
    const samples = [];
    for (let i = 0; i < 12; i += 1) {
      await new Promise((r) => setTimeout(r, 300));
      const life = Render3D.inspect().life;
      samples.push({ shot: life.finishShot, starter: life.starterOnScreen, sparks: life.sparksOnScreen });
    }
    state.chequerAt = 0;
    pl.finished = false;
    const shot = samples.every((x) => x.shot);
    const starter = samples.filter((x) => x.starter).length;
    const sparks = Math.max(...samples.map((x) => x.sparks));
    return (shot && starter >= 10 && sparks > 50) || JSON.stringify(samples);
  });

  await context.close();
  return { results, errors };
}
