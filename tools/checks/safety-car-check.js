// Browser check: the Safety Car on every circuit
// (docs/superpowers/specs/2026-10-05-safety-car-entries-design.md; the game's
// own code: game.js deploySafetyCar and updateSafetyCar, entrances.js,
// pitlane.js wayIn and parkAt).
//
// - everyWayLegalEveryCircuit: forced onto each of a circuit's ways in turn
//   (its pit lane and each service entrance), with nobody else about, it
//   drives the whole way onto the track, joins at that way's merge point,
//   then goes in and parks in front of its own bay. At every step it is on
//   the road, in its own pit lane or on an access road, and it never jumps.
// - reachesLeaderEveryCircuit: a field of twenty racing round each circuit
//   (moved at racing speed under the game's own holds: safetyCarHolds, the
//   hold-station rule, cars moving over to let it by), the leader started at
//   six points round the lap. Called, it appears clear of every car (a car
//   length at least), never overlaps one, is always on the road, its lane or
//   an access road, never jumps, is in front of the leader (on the road,
//   ahead of them by no more than 250) soon enough
//   (Entrances.TARGET_MEDIAN_S half the time, never past TARGET_WORST_S), and
//   after its spell parks in front of its bay. `timing` has each circuit's
//   median and worst, in seconds.
// - calledBackOnItsWayInEveryCircuit: called again in the pit lane on its
//   way in, it parks and comes straight back out of the pit exit.
// - callsAndEdges: called again in every phase, its deadline passing, put
//   away after parking, every rival finished (see the test).
// Run with the Playwright MCP tool browser_run_code_unsafe, filename:
// tools/checks/safety-car-check.js, dev server on http://localhost:8765.
// Expected: every value in `results` true, errors []. Returns
// { results, timing, errors }.
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

  // A race (for its field), paused; then what every test shares.
  await step(async () => {
    Game.selectGridMode("back");
    Game.startCup();
    for (let i = 0; i < 900 && (state.phase !== "race" || state.preparing); i += 1) await new Promise((r) => requestAnimationFrame(r));
    state.paused = true;
    state.pausedAt = performance.now();
    window.scCheck = {
      home: state.track,
      racers: state.racers,
      // Where it may be: on the road, in its own pit lane, or on one of the
      // circuit's access roads (its standby spot included).
      where(track, sc) {
        const route = getItemRoute(track);
        const lane = track.pitLane;
        if (Math.abs(sc.lat) <= route.halfWidthAt(sc.d) + 1e-6) return "road";
        if (lane && lane.inZone(sc.d) && Math.sign(sc.lat) === lane.side && Math.abs(sc.lat) <= lane.workOut + 1e-6) return "lane";
        if (window.Entrances && Entrances.entranceAt(track.entrances, sc.d, sc.lat)) return "access";
        return null;
      },
    };
  });

  results.everyWayLegalEveryCircuit = await step(() => {
    const bad = [];
    const { home, racers, where } = window.scCheck;
    const caller = racers[racers.length - 1];
    CIRCUITS.forEach((c) => {
      const track = TRACKS.find((t) => t.id === c.id);
      if (!track.pitLane) { bad.push({ id: c.id, why: "no pit lane" }); return; }
      state.track = track;
      const ways = safetyCarWays(track);
      if (ways.filter((w) => w.kind === "access").length < (c.id === "monaco" ? 2 : Entrances.MIN_COUNT)) bad.push({ id: c.id, why: `${ways.length - 1} entrances` });
      ways.forEach((way) => {
        state.racers = racers;
        state.safetyCar = null;
        let t = 1e6;
        deploySafetyCar(caller, t);
        // Nobody else on the road: only its own path counts here.
        state.racers = [];
        const sc = state.safetyCar;
        Object.assign(sc, { phase: "hold", way: { kind: way.kind, index: way.index }, d: way.startD, lat: way.startLat, inLane: way.kind === "pit", exiting: way.kind === "pit", holdUntil: t });
        const tag = (why) => ({ id: c.id, way: `${way.kind}${way.index}`, why, d: Math.round(sc.d), lat: Math.round(sc.lat), phase: sc.phase });
        const spot = Pit.parkAt(track.pitLane);
        let last = { d: sc.d, lat: sc.lat };
        let joined = false;
        let crossed = false;
        const L = track.totalLength;
        for (let i = 0; i < 60 * 400 && !sc.parked; i += 1) {
          t += 1000 / 60;
          updateSafetyCar(1 / 60, t);
          if (state.safetyCar !== sc) { bad.push(tag("gone")); break; }
          // On the road: its time is up (it goes in).
          if (sc.phase === "road" && !joined) {
            joined = true;
            if (Math.abs(Entrances.delta(sc.d, way.mergeD, L)) > 1) bad.push(tag("joined away from its merge point"));
            sc.until = t;
          }
          if (!where(track, sc)) { bad.push(tag("off the road, its lane and its access road")); break; }
          const along = Entrances.delta(sc.d, last.d, L);
          if (Math.abs(along) > 10 || Math.abs(sc.lat - last.lat) > 4) { bad.push(tag(`a jump of ${along.toFixed(1)}, ${(sc.lat - last.lat).toFixed(1)}`)); break; }
          // Through the barrier only where the 3D world leaves it open: where
          // it crosses the barrier's line (r3d/track.js lays it at the
          // run-off's edge, buildCourse) the barrier must have its gap.
          if (way.kind === "access" && !joined) {
            const e = track.entrances[way.index];
            const line = e.barrier;
            if ((Math.abs(last.lat) - line) * (Math.abs(sc.lat) - line) <= 0 && last.lat !== sc.lat) {
              const into = Entrances.wrap(sc.d - e.gap.from, L);
              if (into > e.gap.length) bad.push(tag("through the barrier outside its gate"));
              crossed = true;
            }
          }
          last = { d: sc.d, lat: sc.lat };
        }
        if (way.kind === "access" && !crossed) bad.push(tag("never came through its gate"));
        if (!joined) bad.push(tag("never reached the road"));
        if (!sc.parked) bad.push(tag("never parked"));
        else if (Math.abs(sc.d - spot.d) > 1e-6 || Math.abs(sc.lat - spot.lat) > 1e-6) bad.push(tag("parked somewhere other than its spot"));
      });
    });
    state.track = home;
    state.racers = racers;
    state.safetyCar = null;
    return bad.length === 0 || JSON.stringify(bad).slice(0, 600);
  });

  // The field, racing: each circuit in its own step (they take a while).
  const timing = {};
  const problems = [];
  const ids = await step(() => CIRCUITS.map((c) => c.id));
  for (const id of (Array.isArray(ids) ? ids : [])) {
    const r = await step((id) => {
      const { home, racers, where } = window.scCheck;
      const track = TRACKS.find((t) => t.id === id);
      const L = track.totalLength;
      const route = getItemRoute(track);
      const spot = Pit.parkAt(track.pitLane);
      const bad = [];
      const times = [];
      state.track = track;
      // (The game's own rule for who is held; an older game's, where there
      // is no such function, so the check runs, and fails, on it too.)
      const holds = window.safetyCarHolds || ((r, now) => safetyCarActive(now) && r.id !== state.safetyCar.ownerId);
      const wrapDelta = (a, b) => PowerUps.wrapDelta(a, b, L);
      for (let k = 0; k < 6; k += 1) {
        // The field in race order, the quicker cars ahead, spread out behind
        // the leader; the caller last.
        const order = [...racers].sort((a, b) => b.physics.maxSpeed - a.physics.maxSpeed);
        const leaderD = (L * k) / 6 + 53;
        let gap = 0;
        order.forEach((r, i) => {
          gap += i ? 45 + ((i * 37) % 70) : 0;
          const progress = L * 3 + leaderD - gap;
          r.finished = false;
          r.startedRaceLap = true;
          r.lap = Math.floor(progress / L);
          r.trackDistance = ((progress % L) + L) % L;
          r.lat = ((i * 23) % 50) - 25;
          r.speed = r.physics.maxSpeed * 0.82;
          r.currentItem = "none";
        });
        state.racers = order;
        state.safetyCar = null;
        const caller = order[order.length - 1];
        let t = 2e6 + k * 1e6;
        deploySafetyCar(caller, t);
        const sc = state.safetyCar;
        const tag = (why) => ({ id, k, why, d: Math.round(sc.d), lat: Math.round(sc.lat), phase: sc.phase });
        // Where it first shows: a car length clear of everyone.
        const first = route.toWorld(sc.d, sc.lat);
        order.forEach((r) => {
          const w = route.toWorld(r.trackDistance, r.lat);
          if (Math.hypot(w.x - first.x, w.y - first.y) < PowerUps.CAR_LENGTH) bad.push(tag(`appeared on ${r.id}`));
        });
        const t0 = t;
        let last = { d: sc.d, lat: sc.lat };
        let pickedUp = null;
        // (Its spell: an older game's ran out on its own clock.)
        for (let i = 0; i < 60 * 240 && !sc.parked; i += 1) {
          if (!window.Entrances && pickedUp !== null && !sc.leaving) sc.until = Math.min(sc.until, t);
          t += 1000 / 60;
          updateSafetyCar(1 / 60, t);
          if (state.safetyCar !== sc) { bad.push(tag("gone")); break; }
          // In front of the leader: on the road, ahead of the first car still
          // racing (not its caller) and within PICKUP of it.
          const leader = order.find((r) => r !== caller);
          const ahead = wrapDelta(sc.d, leader.trackDistance);
          if (pickedUp === null && Math.abs(sc.lat) <= route.halfWidthAt(sc.d) && ahead > PowerUps.CAR_LENGTH && ahead <= 250) pickedUp = (t - t0) / 1000;
          // The field: racing speed, held as game.js holds it; nobody drives
          // through the Safety Car or the car ahead; over to let it by.
          const bodies = itemBodies();
          const scBody = { id: "safetyCar", d: sc.d, lat: sc.lat, speed: sc.pace ?? sc.speed };
          const scOnRoad = !sc.parked && Math.abs(sc.lat) - PowerUps.CAR_WIDTH / 2 < route.halfWidthAt(sc.d);
          order.forEach((r) => {
            const me = { id: r.id, d: r.trackDistance, lat: r.lat };
            let v = Math.min(r.physics.maxSpeed * 0.82, PowerUps.holdStationSpeed(me, bodies, L));
            const held = holds(r, t);
            if (held) v = Math.min(v, r.physics.maxSpeed * PowerUps.FACTORS.safetyCar);
            if (scOnRoad) v = Math.min(v, held ? PowerUps.holdStationSpeed(me, [...bodies, scBody], L, { singleFile: true }) : PowerUps.holdStationSpeed(me, [scBody], L));
            r.speed += Math.max(-400 / 60, Math.min(150 / 60, v - r.speed));
            const aside = window.Entrances ? Entrances.yieldLat(sc, me, L, route.halfWidthAt(r.trackDistance)) : null;
            if (aside !== null) r.lat += Math.max(-25 / 60, Math.min(25 / 60, aside - r.lat));
          });
          order.forEach((r) => {
            const next = r.trackDistance + r.speed / 60;
            if (next >= L) r.lap += 1;
            r.trackDistance = next % L;
          });
          if (!where(track, sc)) { bad.push(tag("off the road, its lane and its access road")); break; }
          const along = wrapDelta(sc.d, last.d);
          if (Math.abs(along) > 10 || Math.abs(sc.lat - last.lat) > 4) { bad.push(tag(`a jump of ${along.toFixed(1)}, ${(sc.lat - last.lat).toFixed(1)}`)); break; }
          last = { d: sc.d, lat: sc.lat };
          const hit = order.find((r) => Math.abs(wrapDelta(r.trackDistance, sc.d)) < PowerUps.CAR_LENGTH && Math.abs(r.lat - sc.lat) < PowerUps.CAR_WIDTH);
          if (hit) { bad.push(tag(`overlapped ${hit.id}`)); break; }
        }
        times.push(pickedUp === null ? Infinity : pickedUp);
        if (!sc.parked) bad.push(tag("never parked"));
        else if (Math.abs(sc.d - spot.d) > 1e-6 || Math.abs(sc.lat - spot.lat) > 1e-6) bad.push(tag("parked somewhere other than its spot"));
      }
      state.track = home;
      state.racers = racers;
      state.safetyCar = null;
      racers.forEach((r) => { r.lap = 0; r.trackDistance = 0; });
      return { times, bad: bad.slice(0, 3) };
    }, id);
    if (typeof r === "string") { problems.push({ id, error: r }); continue; }
    const sorted = [...r.times].sort((a, b) => a - b);
    timing[id] = { median: +sorted[sorted.length >> 1].toFixed(1), worst: +sorted[sorted.length - 1].toFixed(1) };
    problems.push(...r.bad);
  }
  // The targets (entrances.js; the same numbers here for an older game).
  const targets = await step(() => (window.Entrances ? { median: Entrances.TARGET_MEDIAN_S, worst: Entrances.TARGET_WORST_S } : { median: 8.5, worst: 15 }));
  const slow = Object.entries(timing).filter(([, v]) => !(v.median <= targets.median) || !(v.worst <= targets.worst));
  results.reachesLeaderEveryCircuit = (problems.length === 0 && slow.length === 0 && Array.isArray(ids) && Object.keys(timing).length === ids.length)
    || JSON.stringify({ problems: problems.slice(0, 6), slow }).slice(0, 700);

  results.calledBackOnItsWayInEveryCircuit = await step(() => {
    const bad = [];
    const { home, racers, where } = window.scCheck;
    const caller = racers[racers.length - 1];
    CIRCUITS.forEach((c) => {
      const track = TRACKS.find((t) => t.id === c.id);
      state.track = track;
      state.racers = racers;
      state.safetyCar = null;
      let t = 1e7;
      deploySafetyCar(caller, t);
      state.racers = [];
      const sc = state.safetyCar;
      const pit = safetyCarWays(track)[0];
      Object.assign(sc, { phase: "road", d: pit.mergeD, lat: pit.latAt(pit.mergeD), inLane: false, exiting: false, until: t });
      const L = track.totalLength;
      let called = false;
      let backOut = false;
      let last = { d: sc.d, lat: sc.lat };
      for (let i = 0; i < 60 * 400; i += 1) {
        t += 1000 / 60;
        updateSafetyCar(1 / 60, t);
        if (!called && sc.inLane && sc.leaving) { called = true; state.racers = racers; deploySafetyCar(caller, t); state.racers = []; }
        if (called && sc.phase === "road" && !sc.leaving) { backOut = Math.abs(Entrances.delta(sc.d, pit.mergeD, L)) < 1; break; }
        if (!where(track, sc)) { bad.push({ id: c.id, why: "off its way", d: Math.round(sc.d), lat: Math.round(sc.lat) }); break; }
        const along = Entrances.delta(sc.d, last.d, L);
        if (Math.abs(along) > 10 || Math.abs(sc.lat - last.lat) > 4) { bad.push({ id: c.id, why: "a jump" }); break; }
        last = { d: sc.d, lat: sc.lat };
      }
      if (!called) bad.push({ id: c.id, why: "never in the lane on its way in" });
      else if (!backOut) bad.push({ id: c.id, why: "did not come back out of the pit exit" });
    });
    state.track = home;
    state.racers = racers;
    state.safetyCar = null;
    return bad.length === 0 || JSON.stringify(bad).slice(0, 500);
  });
  // Called again in every phase, and the edges: never a jump, never in two
  // places (parked, it is put away in its garage before it can be anywhere
  // else), a new call while catching up restarts its deadline, a deadline
  // passed on its way on sends it in without claiming a spell, and with every
  // rival finished it simply goes in. On the season's first circuit, with the
  // race's own field racing as the game races it (updateRace).
  results.callsAndEdges = await step(() => {
    const bad = [];
    const { home, racers } = window.scCheck;
    state.track = home;
    state.racers = racers;
    const L = home.totalLength;
    const caller = racers[racers.length - 1];
    const race = (n, t, each) => {
      for (let i = 0; i < n; i += 1) {
        t += 1000 / 60;
        const sc = state.safetyCar;
        const was = sc ? { d: sc.d, lat: sc.lat, sc } : null;
        updateRace(1 / 60, t);
        const now = state.safetyCar;
        if (was && now === was.sc && (Math.abs(Entrances.delta(now.d, was.d, L)) > 10 || Math.abs(now.lat - was.lat) > 4)) { bad.push(`a jump in ${now.phase}`); return t; }
        if (each && each(t) === false) return t;
      }
      return t;
    };
    racers.forEach((r, i) => { r.finished = false; r.lap = 1; r.trackDistance = (L - i * 60 + L) % L; r.speed = r.physics.maxSpeed * 0.8; });
    state.paused = false;
    // Each phase in turn: called again there, it carries on from where it is.
    for (const phase of ["hold", "join", "road", "leading"]) {
      state.safetyCar = null;
      let t = 3e7;
      deploySafetyCar(caller, t);
      const sc = state.safetyCar;
      const reached = () => (phase === "leading" ? sc.leading : sc.phase === phase);
      if (!reached()) t = race(60 * 20, t, () => !reached());
      if (!reached()) { bad.push(`never reached ${phase}`); continue; }
      const before = { d: sc.d, lat: sc.lat, phase: sc.phase };
      const untilBefore = sc.until;
      deploySafetyCar(caller, t + 1);
      if (state.safetyCar !== sc || sc.d !== before.d || sc.lat !== before.lat || sc.phase !== before.phase) bad.push(`${phase}: a new call moved it`);
      if (phase !== "leading" && !(sc.until > untilBefore || sc.until >= t + 1 + Entrances.TARGET_WORST_S * 1000 - 1)) bad.push(`${phase}: deadline not restarted`);
      race(60, t + 1);
    }
    // Its deadline passing on its way on: it joins and goes in, "called in".
    state.safetyCar = null;
    let t = 5e7;
    deploySafetyCar(caller, t);
    const sc = state.safetyCar;
    sc.holdUntil = t;
    t = race(60 * 2, t, () => sc.phase !== "join");
    // (Long past, whatever clock the race's physics steps keep.)
    sc.until = 0;
    let said = null;
    t = race(60 * 30, t, () => { if (sc.leaving) said = state.feed[0] && state.feed[0].message; return !sc.leaving; });
    if (!sc.leaving) bad.push("deadline: never went in");
    else if (sc.led || said !== "Safety Car called in.") bad.push(`deadline: claimed a spell it never led (${said})`);
    // Parked: a while at its bay, then backed into its garage and put away.
    t = race(60 * 120, t, () => !sc.parked);
    if (!sc.parked) bad.push("never parked");
    else {
      t = race(60 * 12, t, () => state.safetyCar === sc);
      if (state.safetyCar !== null) bad.push("parked: never put away");
    }
    // Every rival finished: called, it goes on and simply goes in.
    racers.forEach((r) => { if (r !== caller) r.finished = true; });
    state.safetyCar = null;
    t = 7e7;
    deploySafetyCar(caller, t);
    const alone = state.safetyCar;
    // (The race itself would end: the Safety Car alone, stepped by hand.)
    for (let i = 0; i < 60 * 90 && !alone.parked; i += 1) { t += 1000 / 60; updateSafetyCar(1 / 60, t); }
    if (!alone.parked) bad.push(`alone: never went in (${alone.phase}, leaving ${alone.leaving})`);
    racers.forEach((r) => { r.finished = false; r.lap = 0; r.trackDistance = 0; });
    state.safetyCar = null;
    state.paused = true;
    return bad.length === 0 || JSON.stringify(bad).slice(0, 500);
  });
  await context.close();
  return { results, timing, errors };
}
