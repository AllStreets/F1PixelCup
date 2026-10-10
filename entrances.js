// The Safety Car's service entrances
// (docs/superpowers/specs/2026-10-05-safety-car-entries-design.md). Pure:
// where each circuit's service roads come through the barrier, which way onto
// the track gets the Safety Car in front of the leader soonest, and how it
// drives that way and catches up. Shared by the physics (game.js), the
// renderer (r3d/entrances.js) and the tests. In the page it defines
// window.Entrances; in Node it is require()-able.
//
// An entrance is a slip road on one side of the lap (`side`, +1 or -1 along
// the normal n = (-ty, tx), as pitlane.js): from its standby spot under a
// carport, `far` out from the centreline and running beside the track, it
// curves in over LENGTH along the lap (a smoothstep), through a gap in the
// barrier (the gate) and across the run-off, to the road's edge lane at
// `mergeD`.
(function attach(root, factory) {
  const node = typeof module === "object" && module.exports;
  const api = factory(node ? require("./pitlane.js") : root.Pit);
  if (node) module.exports = api;
  else root.Entrances = api;
}(typeof globalThis !== "undefined" ? globalThis : this, (Pit) => {
  const STEP = 6;
  // The slip road: its length along the lap, how far past the run-off the
  // standby spot is, and its half-width (a car is 16 wide).
  // (A shorter one where the long one has no room.)
  const SHAPES = [{ length: 200, out: 72 }, { length: 160, out: 48 }, { length: 130, out: 32 }, { length: 110, out: 24 }];
  const LENGTH = SHAPES[0].length;
  const OUT = SHAPES[0].out;
  const HALF = 12;
  // The run-off past the road's half-width (r3d/track.js buildCourse), and the
  // street circuits that have the narrow one. tests/entrances.test.js checks
  // these agree with r3d/track.js.
  const RUNOFF = 38;
  const RUNOFF_STREET = 14;
  const STREET = ["monaco", "singapore", "jeddah", "miami", "baku", "lasvegas"];
  // The track data's scenery (r3d/track.js FOOTPRINT, its larger half-size).
  const FOOTPRINT = { grandstand: 78, billboard: 32, tower: 20 };
  // How far the access road and its buildings keep from the rest of the
  // circuit (past its barrier), and from the scenery.
  const MARGIN = 16;
  const DECOR_MARGIN = 10;
  // How many (enough for the pick-up GOAL_S wherever the leader is, for a
  // typical field: NOMINAL), and how far apart.
  const MIN_COUNT = 3;
  const MAX_COUNT = 7;
  const SEP = 400;
  const GOAL_S = 6;
  const NOMINAL = { field: 188, leader: 160, sc: 0.55 };
  // Where they may not go: the start gantry's posts, the pit zone and its
  // mouths (on the pit side), the tunnel, a bridge.
  const START_BEFORE = 90;
  const START_AFTER = 90;
  const PIT_MARGIN = 150;
  const TUNNEL_MARGIN = 150;
  const BRIDGE_MARGIN = 500;
  const UNDER_MARGIN = 150;
  // Stretches of a side kept for a venue's own landmark right behind the
  // barrier (lap distances; signed from the line where negative): Monaco's
  // harbour front and its moored yachts (r3d/landmarks.js VENUES; all but
  // its last stretch, where one gate leaves fifteen yachts on the front),
  // the Las Vegas Strip's frontage.
  const KEEP_OUT = {
    monaco: [{ from: -1500, to: -700, side: -1 }],
    lasvegas: [{ from: 6000, to: 6900, side: 1 }],
  };
  // A straight: the heading changes by less than this over the slip road.
  const STRAIGHT = 1.2;
  // On the inside of a bend its line (and the carport's far side) runs
  // shorter than the lap by its offset times the bend's curvature: never by
  // more than this share (it would bunch up, and nearer 1 fold over).
  const FOLD = 0.6;
  // Two stretches of the lap closer than this along it are the same stretch
  // (r3d/track.js buildCourse's minArc).
  const SAME_STRETCH = 260;
  // The carport over the standby spot: along the lap behind and in front of
  // the spot, and its half-depth; and the marshal's booth by the gate, past
  // the gap (downstream), just outside the barrier.
  const CARPORT = { back: 30, front: 16, half: 15 };
  const BOOTH = { along: 34, out: 12, r: 8 };

  // Driving it. Speeds are shares of the field's mean top speed.
  const ACCESS_SPEED = 0.6;
  const PIT_SPEED = 0.35;
  const CATCH = 1.5;
  const ACCEL = 120;
  const BRAKE = 240;
  const LAT_RATE = 40;
  // Joining ahead of the leader: this long before them. Picked up: in front
  // of them and no more than PICKUP ahead. Within NEAR a car lifts.
  const LEAD = 1.5;
  const PICKUP = 250;
  // Leading, it waits for the leader to close up to this.
  const CLOSE_UP = 70;
  // Giving way: no car may reach the merge point this soon after it.
  const GIVE_WAY_S = 0.35;
  // Its give-way point at a gate: this far before it (its nose at the gate).
  const GIVE_WAY_BACK = 18;
  // What each car to pass on the way to the leader costs.
  const PASS_S = 0.6;
  const NEAR = 350;
  const CAR_LENGTH = 26;
  const CAR_WIDTH = 16;
  // Waiting for the leader (at its start, or its give-way point), never
  // longer than this; it sets off this much early, to wait at the gate.
  const HOLD_MAX_MS = 12000;
  const HOLD_SLACK = 0.8;
  // How much longer than reckoned a way might take, for choosing.
  const RISK = 0.25;
  const JOIN_MARGIN = 0.15;
  // Called, it should be in front of the leader within these (the tests and
  // the checks), from wherever the leader is: on average over every circuit;
  // half the time on each; and always. (The worst are the circuits with long
  // stretches where no service road fits: Sepang, Suzuka, Estoril, Mugello.)
  const TARGET_TYPICAL_S = 5.5;
  const TARGET_MEDIAN_S = 8.5;
  const TARGET_WORST_S = 15;

  const smooth = (t) => t * t * (3 - 2 * t);
  const wrap = (d, total) => ((d % total) + total) % total;
  // a - b round the lap, in (-total/2, total/2].
  const delta = (a, b, total) => {
    let x = (a - b) % total;
    if (x > total / 2) x -= total;
    if (x <= -total / 2) x += total;
    return x;
  };

  // The lap as samples STEP apart: position, smoothed direction (over three
  // samples either side, as r3d/track.js has it), and the road's width share.
  function lapOf(points, total) {
    const n = points.length;
    const segs = [];
    let run = 0;
    for (let i = 0; i < n; i += 1) {
      const a = points[i];
      const b = points[(i + 1) % n];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      segs.push({ a, b, len, start: run });
      run += len;
    }
    const L = total || run;
    const count = Math.ceil(L / STEP);
    const samples = [];
    let s = 0;
    for (let i = 0; i < count; i += 1) {
      const d = (i / count) * L;
      const w = (d / L) * run;
      while (s < segs.length - 1 && segs[s].start + segs[s].len < w) s += 1;
      const seg = segs[s];
      const t = seg.len ? (w - seg.start) / seg.len : 0;
      samples.push({ i, d, x: seg.a.x + (seg.b.x - seg.a.x) * t, y: seg.a.y + (seg.b.y - seg.a.y) * t, w: (seg.a.w ?? 1) * (1 - t) + (seg.b.w ?? 1) * t });
    }
    const m = samples.length;
    samples.forEach((p, i) => {
      const a = samples[(i - 3 + m) % m];
      const b = samples[(i + 3) % m];
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      p.tx = (b.x - a.x) / len;
      p.ty = (b.y - a.y) / len;
      p.nx = -p.ty;
      p.ny = p.tx;
    });
    const at = (d) => samples[Math.round((wrap(d, L) / L) * m) % m];
    // How sharply the lap turns there (r3d/track.js's `curve`).
    const curveAt = (d) => {
      const p = at(d);
      const q = samples[(p.i + 2) % m];
      return (p.tx * q.ty - p.ty * q.tx) / (2 * STEP);
    };
    // A point at lap distance d, lat across.
    const point = (d, lat) => {
      const f = (wrap(d, L) / L) * m;
      const i0 = Math.floor(f) % m;
      const i1 = (i0 + 1) % m;
      const t = f - Math.floor(f);
      const p = samples[i0];
      const q = samples[i1];
      const x = p.x + (q.x - p.x) * t;
      const y = p.y + (q.y - p.y) * t;
      const nx = p.nx + (q.nx - p.nx) * t;
      const ny = p.ny + (q.ny - p.ny) * t;
      const nl = Math.hypot(nx, ny) || 1;
      return { x: x + (nx / nl) * lat, y: y + (ny / nl) * lat };
    };
    // Samples near a point.
    const cell = 80;
    const grid = new Map();
    samples.forEach((p) => {
      const k = `${Math.floor(p.x / cell)},${Math.floor(p.y / cell)}`;
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(p);
    });
    const near = (x, y, r, visit) => {
      for (let ix = Math.floor((x - r) / cell); ix <= Math.floor((x + r) / cell); ix += 1) {
        for (let iy = Math.floor((y - r) / cell); iy <= Math.floor((y + r) / cell); iy += 1) {
          const list = grid.get(`${ix},${iy}`);
          if (list) for (const p of list) if (visit(p) === false) return false;
        }
      }
      return true;
    };
    return { total: L, samples, at, curveAt, point, near };
  }

  // The slip road's line: its offset from the centreline at lap distance d
  // (null off it), and how fast that changes along the lap.
  function geometry(e, total) {
    const u = (d) => {
      const r = wrap(d - e.startD, total);
      return r <= e.length + 1e-9 ? r : null;
    };
    const span = e.far - e.edge;
    return {
      latAt(d) {
        const r = u(d);
        return r === null ? null : e.side * (e.edge + span * (1 - smooth(Math.min(1, r / e.length))));
      },
      slopeAt(d) {
        const r = u(d);
        if (r === null) return 0;
        const t = Math.min(1, r / e.length);
        return -e.side * span * 6 * t * (1 - t) / e.length;
      },
    };
  }

  // The entrance with its standby spot at startD on `side`, or why not.
  function build(startD, side, o, shape = SHAPES[0]) {
    const { W, runoff, total } = o;
    const far = runoff + shape.out;
    const edge = W - Pit.EDGE_IN;
    const barrier = runoff + 1;
    const e = { side, startD: wrap(startD, total), mergeD: wrap(startD + shape.length, total), far, out: shape.out, edge, barrier, runoff, length: shape.length, halfWidth: HALF };
    Object.assign(e, geometry(e, total));
    // Where the line crosses the barrier (smooth(t) = (far - barrier) / span).
    const want = (far - barrier) / (far - edge);
    let lo = 0;
    let hi = 1;
    for (let k = 0; k < 40; k += 1) {
      const mid = (lo + hi) / 2;
      if (smooth(mid) < want) lo = mid; else hi = mid;
    }
    e.gateU = lo * e.length;
    e.gateD = wrap(e.startD + e.gateU, total);
    // The barrier left open: wherever the road's own width (across its line,
    // so wider where it crosses at an angle) meets the barrier line, plus 2.
    let from = null;
    let to = null;
    for (let r = 0; r <= e.length; r += 0.5) {
      const d = e.startD + r;
      const lat = Math.abs(e.latAt(d));
      const across = HALF * Math.hypot(1, e.slopeAt(d)) + 2;
      if (Math.abs(lat - barrier) <= across) {
        if (from === null) from = r;
        to = r;
      }
    }
    e.gap = { from: wrap(e.startD + from, total), to: wrap(e.startD + to, total), length: to - from };
    e.boothD = wrap(e.startD + to + BOOTH.along, total);
    return e;
  }

  // Ground the entrance takes (circles { x, y, r }): its road outside the
  // barrier, the carport and the marshal's booth. The renderer claims the same.
  function footprint(e, lap) {
    const out = [];
    for (let r = -CARPORT.back; r <= e.gateU + HALF; r += 8) {
      const d = e.startD + r;
      const lat = r < 0 ? e.side * e.far : e.latAt(d);
      if (Math.abs(lat) < e.barrier - HALF) continue;
      const p = lap.point(d, lat);
      out.push({ x: p.x, y: p.y, r: r < CARPORT.front ? CARPORT.half + 3 : HALF + 2, kind: r < CARPORT.front ? "carport" : "road" });
    }
    const b = lap.point(e.boothD, e.side * (e.barrier + BOOTH.out));
    out.push({ x: b.x, y: b.y, r: BOOTH.r, kind: "booth" });
    return out;
  }

  // Does `e` fit here (see the spec)? `o` has the lap and what to keep clear of.
  function fits(e, o) {
    const { lap, total, W, runoff, lane, tunnel, bridges, decor, keepOut } = o;
    const from = e.startD - CARPORT.back - 40;
    const to = e.startD + e.length + 40;
    const inSpan = (d, a, b) => wrap(d - a, total) <= wrap(b - a, total);
    // The start, the pit zone, the tunnel and the bridges.
    const spanHits = (a, b) => inSpan(a, from, to) || inSpan(b, from, to) || inSpan(from, a, b);
    if (spanHits(-START_BEFORE, START_AFTER)) return false;
    if ((keepOut || []).some((k) => k.side === e.side && spanHits(k.from, k.to))) return false;
    // (On the pit side: across the road from the pits there is room.)
    if (lane && e.side === lane.side && spanHits(lane.entry - PIT_MARGIN, lane.exit + PIT_MARGIN)) return false;
    if (tunnel && spanHits(tunnel.from - TUNNEL_MARGIN, tunnel.to + TUNNEL_MARGIN)) return false;
    // (The raised road's whole ramp; the road under it, near the bridge.)
    if ((bridges || []).some((b) => {
      const margin = b.raised ? BRIDGE_MARGIN : UNDER_MARGIN;
      return spanHits(b.d - margin, b.d + margin);
    })) return false;
    // A straight, at full width.
    const own = [];
    for (let r = from - e.startD; r <= to - e.startD; r += STEP) own.push(lap.at(e.startD + r));
    if (own.some((p) => Math.abs(p.w - 1) > 1e-6)) return false;
    // Never on the inside of a bend so tight its line bunches up (FOLD), and
    // no sharp kink in it.
    const road = [];
    for (let r = -CARPORT.back; r <= e.length; r += STEP) road.push(lap.at(e.startD + r));
    for (const p of road) {
      if (lap.curveAt(p.d) * e.side * (e.far + CARPORT.half) > FOLD) return false;
    }
    const mid = lap.at(e.startD + e.length / 2);
    if (road.some((p) => Math.acos(Math.max(-1, Math.min(1, p.tx * mid.tx + p.ty * mid.ty))) > STRAIGHT)) return false;
    const n = lap.samples.length;
    const minArc = Math.ceil(SAME_STRETCH / STEP);
    const otherStretch = (p, q) => {
      const gap = Math.abs(q.i - p.i);
      return Math.min(gap, n - gap) >= minArc;
    };
    // How far another stretch's circuit reaches towards a point: its run-off,
    // or on its pit side in the pit zone, the pit complex.
    const reach = (q, x, y) => {
      if (lane && lane.inZone(q.d) && ((x - q.x) * q.nx + (y - q.y) * q.ny) * lane.side > 0) {
        return lane.atGarage(q.d) ? lane.garages.outer : lane.outerAt(q.d);
      }
      return runoff;
    };
    // Full run-off on this side: no other stretch within twice it (or its pit
    // complex within it), so the barrier is where the gate is.
    // (Each sample's answer is kept: the candidates overlap.)
    const roomy = o.roomy || (o.roomy = new Map());
    const reachMax = lane ? Math.max(lane.garages.outer, runoff) : runoff;
    for (const p of own) {
      const key = p.i * 2 + (e.side > 0 ? 1 : 0);
      if (!roomy.has(key)) {
        roomy.set(key, lap.near(p.x, p.y, reachMax + runoff + 3, (q) => {
          if (!otherStretch(p, q)) return true;
          const dx = q.x - p.x;
          const dy = q.y - p.y;
          if ((dx * p.nx + dy * p.ny) * e.side < 0) return true;
          const dist = Math.hypot(dx, dy);
          const pitFacing = lane && lane.inZone(q.d) && -(dx * q.nx + dy * q.ny) * lane.side > 0;
          const room = pitFacing ? dist - (lane.atGarage(q.d) ? lane.garages.outer : lane.outerAt(q.d)) : dist / 2;
          return room >= runoff + 3;
        }));
      }
      if (!roomy.get(key)) return false;
    }
    // Clear ground: the road outside the barrier, the carport and the booth.
    const ownFrom = e.startD - CARPORT.back - 60;
    const ownTo = e.startD + e.length + 60;
    for (const c of footprint(e, lap)) {
      const ok = lap.near(c.x, c.y, c.r + MARGIN + reachMax, (q) => {
        if (inSpan(q.d, ownFrom, ownTo)) return true;
        return Math.hypot(c.x - q.x, c.y - q.y) >= reach(q, c.x, c.y) + c.r + MARGIN;
      });
      if (!ok) return false;
      if ((decor || []).some((s) => Math.hypot(c.x - s.x, c.y - s.y) < s.r + c.r + DECOR_MARGIN)) return false;
    }
    // (The road's own stretch, where the lap bends back towards the carport.)
    for (const c of footprint(e, lap)) {
      for (const p of own) {
        if (Math.hypot(c.x - p.x, c.y - p.y) < W - 1) return false;
      }
    }
    return true;
  }

  // Every circuit's entrances. `points` the lap's centreline, `total` its
  // length, `halfWidth` the road's, `street` whether its run-off is the narrow
  // one, `pit` its pitlane.js lane (or null), `tunnel` { from, to }, `bridges`
  // where it crosses itself ({ d, raised }: the lap distance on each level,
  // raised on the bridge), `decor` the track data's scenery ({ type, x, y }),
  // `keepOut` the circuit's KEEP_OUT stretches.
  function place({ points, total, halfWidth, street = false, pit = null, tunnel = null, bridges = [], decor = [], keepOut = [] }) {
    const lap = lapOf(points, total);
    const L = lap.total;
    const W = halfWidth;
    const runoff = W + (street ? RUNOFF_STREET : RUNOFF);
    const o = {
      lap, total: L, W, runoff, lane: pit, tunnel, bridges, keepOut,
      decor: decor.filter((s) => FOOTPRINT[s.type]).map((s) => ({ x: s.x, y: s.y, r: FOOTPRINT[s.type] })),
    };
    // Every spot an entrance could join the road (every 24), on either side.
    const candidates = [];
    for (let m = 0; m < L; m += 24) {
      let best = null;
      SHAPES.forEach((shape) => [1, -1].forEach((side) => {
        if (best) return;
        const e = build(m - shape.length, side, o, shape);
        if (fits(e, o)) best = e;
      }));
      if (best) candidates.push(best);
    }
    // Chosen greedily for the soonest pick-up wherever the leader is: each
    // next entrance is the one that most cuts the longest the Safety Car
    // would take (choose()'s own estimate, for a typical field), at least SEP
    // from the others, until that is within GOAL_S and there are MIN_COUNT.
    const nominal = { total: L, leaderSpeed: NOMINAL.leader, fieldSpeed: NOMINAL.field, scPace: NOMINAL.sc * NOMINAL.field };
    const leaders = [];
    for (let d = 0; d < L; d += 50) leaders.push(d);
    const timesOf = (way) => leaders.map((d) => wayTime(way, { ...nominal, leaderD: d }).time);
    const best = leaders.map(() => Infinity);
    ways([], pit, L).forEach((way) => timesOf(way).forEach((t, i) => { best[i] = Math.min(best[i], t); }));
    const options = candidates.map((e) => ({ e, times: timesOf(ways([e], null, L)[0]) }));
    const chosen = [];
    const worstOf = (times) => Math.max(...times);
    const sumOf = (times) => times.reduce((a, b) => a + b, 0);
    while (chosen.length < MAX_COUNT) {
      const now = worstOf(best);
      if (chosen.length >= MIN_COUNT && now <= GOAL_S) break;
      let pick = null;
      options.forEach((c) => {
        if (chosen.some((e) => Math.abs(delta(e.mergeD, c.e.mergeD, L)) < SEP)) return;
        const merged = best.map((t, i) => Math.min(t, c.times[i]));
        const score = [worstOf(merged), sumOf(merged)];
        if (!pick || score[0] < pick.score[0] - 1e-9 || (Math.abs(score[0] - pick.score[0]) <= 1e-9 && score[1] < pick.score[1])) pick = { c, merged, score };
      });
      if (!pick) break;
      // Past the minimum, one only where it helps the worst case.
      if (chosen.length >= MIN_COUNT && pick.score[0] >= now - 1e-9) break;
      chosen.push(pick.c.e);
      pick.merged.forEach((t, i) => { best[i] = t; });
    }
    chosen.sort((a, b) => a.mergeD - b.mergeD);
    return chosen.map((e, index) => {
      e.index = index;
      e.footprint = footprint(e, lap);
      // (Where its road lies, for drawing it and the car on it.)
      Object.defineProperty(e, "lap", { value: lap, enumerable: false });
      return e;
    });
  }

  // Every way onto the track: each entrance from its standby spot, and the pit
  // lane from the Safety Car's bay (pitlane.js wayOut). `giveWayD` is where it
  // stops if a car is coming.
  function ways(entrances, lane, total) {
    const list = [];
    if (lane) {
      const park = Pit.parkAt(lane);
      list.push({
        kind: "pit", index: -1, side: lane.side,
        startD: park.d, startLat: park.lat,
        giveWayD: wrap(lane.exit - lane.mouth, total), giveWayU: lane.exit - lane.mouth - park.rel,
        mergeD: wrap(lane.exit, total), length: lane.exit - park.rel,
        latAt: (d) => Pit.wayOut(lane, d).lat,
        onRoadAt: (d) => Pit.wayOut(lane, d).onRoad,
      });
    }
    (entrances || []).forEach((e) => list.push({
      kind: "access", index: e.index, side: e.side, entrance: e,
      startD: e.startD, startLat: e.side * e.far,
      // (Stopped with its nose at the gate.)
      giveWayD: wrap(e.startD + e.gateU - GIVE_WAY_BACK, total), giveWayU: e.gateU - GIVE_WAY_BACK,
      mergeD: e.mergeD, length: e.length,
      latAt: (d) => e.latAt(d),
      onRoadAt: (d) => wrap(d - e.startD, total) >= e.length - 1e-9,
    }));
    return list;
  }

  // How far a car at lap distance d has to go to reach `at`, or null if it
  // went by within the last quarter of a lap (it is then past it).
  function comingTo(at, d, total) {
    const ahead = wrap(at - d, total);
    return total - ahead < total / 4 ? null : ahead;
  }

  // From rest, at ACCEL up to `speed`: the time to cover `length`.
  function runTime(length, speed, accel = ACCEL) {
    return travelTime(length, 0, speed, accel);
  }

  const wayFactor = (way) => (way.kind === "pit" ? PIT_SPEED : ACCESS_SPEED);

  // How soon a way gets it in front of the leader. `leaderD`, `leaderSpeed`
  // (what the leader averages), `fieldSpeed` (the field's mean top speed),
  // `scPace` (its pace leading), `bodies` (the other cars { d, speed, id },
  // where known; its caller among them is never one to pass).
  // Returns { time, ahead }:
  // - ahead: the leader is far enough off for it to drive its whole way
  //   first, so it waits at its start and joins LEAD ahead of them;
  // - behind: it sets off now, joins behind them at the first gap in the cars
  //   coming (joinTime; each at its own speed), and catches up at
  //   CATCH, the cars near it lifting; each car between it and the leader
  //   costs it PASS_S more.
  function wayTime(way, { leaderD, leaderSpeed, total, fieldSpeed, scPace, bodies = [], ownerId = null }) {
    const vL = Math.max(1, leaderSpeed);
    const catchSpeed = CATCH * fieldSpeed;
    const run = runTime(way.length, wayFactor(way) * fieldSpeed);
    const dist = delta(way.mergeD, leaderD, total);
    // How far the leader has to go to it (all the way round, unless they
    // have only just gone by: then it is behind them).
    const coming = comingTo(way.mergeD, leaderD, total);
    // (A long way to drive first is a less sure thing: the leader may come
    // sooner than reckoned.)
    if (coming !== null && coming / vL >= run * (1 + RISK) + LEAD) return { time: coming / vL - LEAD, ahead: true };
    const eta = dist / vL;
    // When each car reaches the merge point (negative: already past it).
    const cars = bodies.map((b) => ({ at: delta(way.mergeD, b.d, total) / Math.max(b.speed || 0, 0.5 * vL), behindLeader: delta(leaderD, b.d, total) > 1e-6 }));
    const arrivals = [eta, ...cars.map((c) => c.at)];
    const joins = joinTime(way, arrivals, fieldSpeed, vL);
    const between = cars.filter((c, i) => c.behindLeader && c.at < joins && bodies[i].id !== ownerId).length;
    const behind = Math.max(0, vL * joins - dist) + CAR_LENGTH * 1.5;
    const far = Math.max(0, behind - NEAR);
    return { time: joins + far / Math.max(1, catchSpeed - vL) + Math.min(behind, NEAR) / Math.max(1, catchSpeed - scPace) + between * PASS_S, ahead: false };
  }

  // When it would reach the merge point, giving way as drive() does to cars
  // reaching it at `arrivals` (seconds from now; negative: already by). It
  // decides once it would have to start braking for its give-way point: on
  // if no car will be within GIVE_WAY_S of it at the merge point nor just
  // past it; else it stops there and waits for such a gap.
  function joinTime(way, arrivals, fieldSpeed, speed) {
    const top = wayFactor(way) * fieldSpeed;
    const past = (CAR_LENGTH * 2.5) / Math.max(1, speed);
    // (With a margin: in the race it may decide a little later than this.)
    const clash = (t, rem) => arrivals.some((at) => at > t - past - JOIN_MARGIN && at < t + rem + GIVE_WAY_S + JOIN_MARGIN);
    const braking = (top * top) / (2 * BRAKE) + 2;
    const decideAt = Math.max(0, way.giveWayU - braking);
    const tDecide = runTime(decideAt, top);
    const roll = travelTime(way.length - decideAt, Math.min(top, Math.sqrt(2 * ACCEL * decideAt)), top);
    if (!clash(tDecide, roll)) return tDecide + roll;
    const fromStop = runTime(way.length - way.giveWayU, top);
    let t = runTime(way.giveWayU, top) + 0.3;
    for (let k = 0; k < 600 && clash(t, fromStop); k += 1) t += 0.05;
    return t + fromStop;
  }

  // The way that gets it in front of the leader soonest (the pit lane, listed
  // first, on a tie). Returns { way, ahead, time }.
  function choose(list, opts) {
    let best = null;
    list.forEach((way) => {
      const { time, ahead } = wayTime(way, opts);
      if (!best || time < best.time - 1e-9) best = { way, ahead, time };
    });
    return best;
  }

  // Where across the road to pass: the line furthest from every car just
  // ahead, nearest its own line among those clear enough. A car alongside
  // walls off its side: it never cuts across one.
  function passingLat(me, bodies, total, half) {
    const clear = CAR_WIDTH + 6;
    let lo = -Math.max(0, half - 10);
    let hi = -lo;
    let near = 0;
    for (const b of bodies) {
      const ahead = delta(b.d, me.d, total);
      if (Math.abs(ahead) < CAR_LENGTH * 1.1) {
        if (b.lat >= me.lat) hi = Math.min(hi, b.lat - CAR_WIDTH * 1.2);
        else lo = Math.max(lo, b.lat + CAR_WIDTH * 1.2);
      }
      if (ahead > -CAR_LENGTH && ahead < CAR_LENGTH * 5) near += 1;
    }
    if (lo > hi) return me.lat;
    if (!near) return Math.max(lo, Math.min(hi, 0));
    let bestLat = lo;
    let bestScore = -Infinity;
    for (let lat = lo; lat <= hi + 1e-9; lat += 2) {
      let room = Infinity;
      for (const b of bodies) {
        const ahead = delta(b.d, me.d, total);
        if (ahead > -CAR_LENGTH && ahead < CAR_LENGTH * 5) room = Math.min(room, Math.abs(lat - b.lat));
      }
      const score = Math.min(room, clear) * 1000 - Math.abs(lat - me.lat);
      if (score > bestScore) { bestScore = score; bestLat = lat; }
    }
    return bestLat;
  }

  // Where a car moves over to let it by: a rival just ahead of it while it
  // catches up (not its caller) keeps to the side of the road away from it.
  // Null when it need not.
  function yieldLat(sc, body, total, half) {
    if (!sc || sc.parked || sc.leaving || sc.leading || sc.phase !== "road" || body.id === sc.ownerId) return null;
    const ahead = delta(body.d, sc.d, total);
    if (ahead <= -CAR_LENGTH * 0.5 || ahead > CAR_LENGTH * 6) return null;
    const side = body.lat >= sc.lat ? 1 : -1;
    return side * Math.max(0, half - 12);
  }

  // Whether a car is held to safety-car pace: once it leads (for its spell),
  // or, while it is catching up, a car it is coming up to within NEAR (cars
  // behind it come up to it freely: it is waiting for the leader, or passing
  // them). Never its caller, never while it is off the road, nor once it is
  // going in.
  function holds(sc, body, total, now) {
    if (!sc || sc.parked || sc.leaving || sc.phase !== "road" || body.id === sc.ownerId) return false;
    if (sc.leading) return now < sc.until;
    const ahead = delta(body.d, sc.d, total);
    return ahead > -CAR_LENGTH && ahead < NEAR;
  }

  // Whether it may go on past its give-way point now: no car will reach the
  // merge point within half a second of it, and none is just past it.
  function clearToJoin(sc, way, bodies, total, fieldSpeed) {
    const left = wrap(way.mergeD - sc.d, total);
    const tRem = travelTime(left, sc.speed || 0, wayFactor(way) * fieldSpeed) + GIVE_WAY_S;
    return bodies.every((b) => {
      const past = delta(b.d, way.mergeD, total);
      if (past >= 0) return past >= CAR_LENGTH * 2.5;
      const coming = -past;
      if (coming > 900) return true;
      return coming / Math.max(1, b.speed || 0) >= tRem && coming > CAR_LENGTH * 2;
    });
  }

  // The time to cover `length` from speed v0, at ACCEL up to `speed`.
  function travelTime(length, v0, speed, accel = ACCEL) {
    if (!(length > 0)) return 0;
    if (v0 >= speed) return length / speed;
    const ramp = (speed * speed - v0 * v0) / (2 * accel);
    if (length <= ramp) return (-v0 + Math.sqrt(v0 * v0 + 2 * accel * length)) / accel;
    return (speed - v0) / accel + (length - ramp) / speed;
  }

  // One step of its way onto the track and its catching up (game.js runs
  // the leaving). `sc` { phase: "hold" | "join" | "road", way, d, lat, speed,
  // leading, until, ownerId, holdUntil }; `ctx` { now, dt, total, way (the
  // way object), bodies (every car still racing), leader (the body it picks
  // up), fieldSpeed, scPace, spellMs, halfWidthAt(d) }. Returns what
  // happened ("launched", "joined", "leading") or null.
  function drive(sc, ctx) {
    const { now, dt, total, way, bodies, leader, fieldSpeed, scPace } = ctx;
    let event = null;
    const approach = (target) => {
      sc.speed += Math.max(-BRAKE * dt, Math.min(ACCEL * dt, target - sc.speed));
    };
    // How long until the leader reaches the merge point (null once by).
    const leaderEta = (speed) => {
      if (!leader) return null;
      const coming = comingTo(way.mergeD, leader.d, total);
      return coming === null ? null : coming / Math.max(speed, 1);
    };
    if (sc.phase === "hold") {
      sc.d = way.startD;
      sc.speed = 0;
      sc.pace = 0;
      // (Still backing into its garage when called: out to its spot first.)
      if (sc.lat !== way.startLat) {
        sc.lat += Math.max(-LAT_RATE * dt * 0.25, Math.min(LAT_RATE * dt * 0.25, way.startLat - sc.lat));
        if (Math.abs(sc.lat - way.startLat) > 1e-6) return null;
        sc.lat = way.startLat;
      }
      // Still far off (reckoned as if they come fast: better early than
      // late, as it can wait at its give-way point): it waits here.
      const eta = leaderEta(Math.max(leader ? leader.speed || 0 : 0, fieldSpeed));
      const run = runTime(way.length, wayFactor(way) * fieldSpeed);
      if (now < sc.holdUntil && eta !== null && eta > run + LEAD + HOLD_SLACK) return null;
      sc.phase = "join";
      event = "launched";
    }
    if (sc.phase === "join") {
      const u = wrap(sc.d - way.startD, total);
      // Coming up to its give-way point it decides, once it would need to
      // start braking: on if the road is clear and the leader is not still
      // far (it waits for them there, to join LEAD ahead of them); else it
      // stops there and waits.
      let target = wayFactor(way) * fieldSpeed;
      if (!sc.committed) {
        const toStop = Math.max(0, way.giveWayU - u);
        if (toStop <= (sc.speed * sc.speed) / (2 * BRAKE) + 2) {
          const rest = travelTime(way.length - u, sc.speed, wayFactor(way) * fieldSpeed);
          const eta = leaderEta(Math.max(leader ? leader.speed || 0 : 0, 0.5 * fieldSpeed));
          const early = now < sc.holdUntil && eta !== null && eta > rest + LEAD;
          if (!early && clearToJoin(sc, way, bodies, total, fieldSpeed)) sc.committed = true;
          else if (toStop <= 1e-6) {
            sc.d = wrap(way.startD + way.giveWayU, total);
            sc.lat = way.latAt(sc.d);
            sc.speed = 0;
            sc.pace = 0;
            return event;
          } else target = Math.min(target, Math.sqrt(2 * BRAKE * toStop));
        }
      }
      approach(target);
      let next = u + sc.speed * dt;
      if (!sc.committed && next > way.giveWayU) next = Math.max(u, way.giveWayU);
      if (next >= way.length) {
        sc.d = way.mergeD;
        sc.lat = way.latAt(way.mergeD);
        sc.phase = "road";
        sc.pace = sc.speed;
        sc.inLane = false;
        sc.exiting = false;
        sc.committed = false;
        return "joined";
      }
      sc.d = wrap(way.startD + next, total);
      sc.lat = way.latAt(sc.d);
      // (Its speed, for the cars behind it once it is on the road's edge.)
      sc.pace = sc.speed;
      sc.inLane = way.kind === "pit" ? !way.onRoadAt(sc.d) : false;
      return event;
    }
    // On the road: catching the leader, then leading.
    const half = ctx.halfWidthAt(sc.d);
    const ahead = leader ? delta(sc.d, leader.d, total) : 0;
    if (!sc.leading && leader && ahead > CAR_LENGTH * 1.2 && ahead <= PICKUP) {
      sc.leading = true;
      sc.until = now + ctx.spellMs;
      event = "leading";
    }
    let target;
    let lat;
    if (sc.leading || !leader) {
      // Settled in front of them: slower while they close up to a few car
      // lengths behind it.
      const gap = leader ? ahead : 0;
      target = scPace * Math.max(0.6, Math.min(1, 1 - (gap - CLOSE_UP) / 400));
      lat = 0;
    } else if (ahead > 0 && ahead < total / 4) {
      // In front of them, but still far: wait for them.
      target = scPace * 0.6;
      lat = 0;
    } else {
      target = CATCH * fieldSpeed;
      lat = passingLat(sc, bodies, total, half);
    }
    approach(target);
    let next = sc.lat + Math.max(-LAT_RATE * dt, Math.min(LAT_RATE * dt, lat - sc.lat));
    // (Never sideways into a car alongside.)
    bodies.forEach((b) => {
      if (Math.abs(delta(b.d, sc.d, total)) >= CAR_LENGTH * 1.1) return;
      const gap = CAR_WIDTH * 1.2;
      if (b.lat >= sc.lat && next > b.lat - gap) next = Math.max(sc.lat, Math.min(next, b.lat - gap));
      if (b.lat < sc.lat && next < b.lat + gap) next = Math.min(sc.lat, Math.max(next, b.lat + gap));
    });
    sc.lat = next;
    const edge = half - CAR_WIDTH / 2 - 2;
    sc.lat = Math.max(-edge, Math.min(edge, sc.lat));
    const onRoad = Math.abs(sc.lat) - CAR_WIDTH / 2 < half;
    sc.pace = onRoad ? Math.min(sc.speed, blockedAt(sc, bodies, total)) : sc.speed;
    sc.d = wrap(sc.d + sc.pace * dt, total);
    return event;
  }

  // How fast it may go for the cars ahead: no faster than one it would run
  // into (overlapping it across the road, within a car and a half ahead).
  function blockedAt(me, bodies, total) {
    let cap = Infinity;
    bodies.forEach((b) => {
      const ahead = delta(b.d, me.d, total);
      if (ahead > 0 && ahead < CAR_LENGTH * 1.5 && Math.abs(b.lat - me.lat) < CAR_WIDTH + 3) cap = Math.min(cap, Math.max(0, b.speed || 0));
    });
    return cap;
  }

  // The access road a point is on, if any.
  function entranceAt(entrances, d, lat) {
    for (const e of entrances || []) {
      const at = e.latAt(d);
      if (at !== null && Math.abs(at - lat) < 3) return e;
    }
    return null;
  }

  // The road's slope across the lap there, if on an access road (for the
  // Safety Car's heading).
  function slopeOn(entrances, d, lat) {
    const e = entranceAt(entrances, d, lat);
    return e ? e.slopeAt(d) : 0;
  }

  // Where a point of an access road is, { x, y, heading }: on the lap's
  // smoothed line (the one the 3D world draws the road on), facing along it.
  function pointOn(e, d, lat) {
    const a = e.lap.point(d - 1, e.latAt(d - 1) ?? lat);
    const b = e.lap.point(d + 1, e.latAt(d + 1) ?? lat);
    const p = e.lap.point(d, lat);
    return { x: p.x, y: p.y, heading: Math.atan2(b.y - a.y, b.x - a.x) };
  }

  // The name of a corner within `reach` of a lap distance (the track data's
  // corners: { board, aka, d, from, to }), or null.
  function cornerNear(corners, d, total, reach = 350) {
    let best = null;
    let bestDist = Infinity;
    (corners || []).forEach((c) => {
      const from = c.from ?? c.d;
      const to = c.to ?? c.d;
      const inside = wrap(d - from, total) <= wrap(to - from, total);
      const dist = inside ? 0 : Math.min(Math.abs(delta(d, from, total)), Math.abs(delta(d, to, total)));
      if (dist <= reach && dist < bestDist) { bestDist = dist; best = c; }
    });
    return best ? best.board : null;
  }

  return {
    STEP, SHAPES, LENGTH, OUT, FOLD, KEEP_OUT, HALF, RUNOFF, RUNOFF_STREET, STREET, FOOTPRINT, MARGIN, DECOR_MARGIN, MIN_COUNT, MAX_COUNT, SEP, GOAL_S, NOMINAL,
    START_BEFORE, START_AFTER, PIT_MARGIN, TUNNEL_MARGIN, BRIDGE_MARGIN, UNDER_MARGIN, STRAIGHT, CARPORT, BOOTH,
    ACCESS_SPEED, PIT_SPEED, CATCH, ACCEL, BRAKE, LEAD, PICKUP, CLOSE_UP, NEAR, GIVE_WAY_S, GIVE_WAY_BACK, PASS_S, HOLD_MAX_MS, HOLD_SLACK, RISK, JOIN_MARGIN, TARGET_TYPICAL_S, TARGET_MEDIAN_S, TARGET_WORST_S, CAR_LENGTH, CAR_WIDTH,
    place, ways, comingTo, runTime, travelTime, joinTime, wayTime, choose, passingLat, yieldLat, blockedAt, holds, clearToJoin, drive, entranceAt, slopeOn, pointOn, cornerNear, delta, wrap,
  };
}));
