// The Safety Car's service entrances (entrances.js):
// docs/superpowers/specs/2026-10-05-safety-car-entries-design.md.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const Pit = require("../pitlane.js");
const PowerUps = require("../powerups.js");
const Entrances = require("../entrances.js");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "tracks-data.js"), "utf8");
const sandbox = {};
vm.runInNewContext(`${source}\nthis.TRACK_SHAPES = TRACK_SHAPES;`, sandbox);
const SHAPES = JSON.parse(JSON.stringify(sandbox.TRACK_SHAPES));
// The road's half-width in the game: roadWidth 33 x TRACK_WIDTH_SCALE 1.5.
const W = 49.5;
const trackJs = fs.readFileSync(path.join(root, "r3d", "track.js"), "utf8");

// Each circuit as the game hands it over (game.js trackDefinition).
function circuit(id) {
  const shape = SHAPES[id];
  const points = shape.points;
  let total = 0;
  const starts = [];
  points.forEach((a, i) => {
    const b = points[(i + 1) % points.length];
    starts.push(total);
    total += Math.hypot(b.x - a.x, b.y - a.y);
  });
  const lane = Pit.lane(shape.pit, total, W);
  const bridges = (shape.bridges || []).flatMap((b) => [
    { d: starts[b.over % starts.length], raised: true },
    { d: starts[b.under % starts.length], raised: false },
  ]);
  const input = { points, total, halfWidth: W, street: Entrances.STREET.includes(id), pit: lane, tunnel: shape.tunnel || null, bridges, decor: shape.decor || [] };
  return { id, shape, points, total, lane, bridges, input, entrances: Entrances.place(input) };
}
const CIRCUITS = Object.keys(SHAPES).map(circuit);

// The lap, densely: positions every 3 along it, with their lap distance.
function dense(points, total) {
  const out = [];
  let run = 0;
  points.forEach((a, i) => {
    const b = points[(i + 1) % points.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    for (let s = 0; s < len; s += 3) out.push({ x: a.x + ((b.x - a.x) * s) / len, y: a.y + ((b.y - a.y) * s) / len, d: run + s, nx: -(b.y - a.y) / len, ny: (b.x - a.x) / len });
    run += len;
  });
  return out.map((p) => ({ ...p, d: (p.d / run) * total }));
}
const wrap = (d, L) => ((d % L) + L) % L;
const inSpan = (d, a, b, L) => wrap(d - a, L) <= wrap(b - a, L);

test("the renderer's street circuits, run-off and scenery footprints are the ones entrances.js assumes", () => {
  const street = trackJs.match(/const STREET = new Set\(\[([^\]]*)\]\)/)[1].split(",").map((s) => s.trim().replace(/"/g, ""));
  assert.deepEqual([...street].sort(), [...Entrances.STREET].sort());
  assert.match(trackJs, new RegExp(`street \\? width \\+ ${Entrances.RUNOFF_STREET} : width \\+ ${Entrances.RUNOFF}`));
  Object.entries(Entrances.FOOTPRINT).forEach(([type, r]) => {
    const m = trackJs.match(new RegExp(`${type}: \\[(\\d+), (\\d+)\\]`));
    assert.ok(m, type);
    assert.equal(r, Math.max(Number(m[1]), Number(m[2])), type);
  });
});

test("every circuit has 3 to 7 service entrances, spread round the lap", () => {
  CIRCUITS.forEach((c) => {
    const list = c.entrances;
    assert.ok(list.length >= Entrances.MIN_COUNT && list.length <= Entrances.MAX_COUNT, `${c.id}: ${list.length}`);
    list.forEach((e, i) => {
      assert.equal(e.index, i);
      if (i) assert.ok(e.mergeD > list[i - 1].mergeD, `${c.id}: sorted`);
      list.forEach((f) => {
        if (f === e) return;
        const apart = Math.abs(Entrances.delta(e.mergeD, f.mergeD, c.total));
        assert.ok(apart >= Entrances.SEP, `${c.id}: ${Math.round(e.mergeD)} and ${Math.round(f.mergeD)} only ${Math.round(apart)} apart`);
      });
    });
  });
});

test("each slip road runs from its standby spot, through the barrier at its gate, to the road's edge lane", () => {
  CIRCUITS.forEach((c) => {
    c.entrances.forEach((e) => {
      const at = (d) => e.latAt(d);
      assert.ok(Math.abs(at(e.startD) - e.side * e.far) < 1e-6, `${c.id}: starts at its standby spot`);
      assert.ok(Math.abs(at(e.mergeD) - e.side * (W - Pit.EDGE_IN)) < 1e-6, `${c.id}: ends on the edge lane`);
      // The carport (its half-depth either side of the standby line) stands
      // wholly outside the barrier.
      const carportIn = Math.abs(at(e.startD)) - Entrances.CARPORT.half;
      assert.ok(carportIn > e.barrier + 2, `${c.id}: carport ${carportIn.toFixed(1)} inside the barrier at ${e.barrier}`);
      assert.ok(Math.abs(Math.abs(at(e.gateD)) - e.barrier) < 0.5, `${c.id}: crosses the barrier at its gate`);
      // Inward all the way, and the gap is over the gate.
      let last = Infinity;
      for (let r = 0; r <= e.length; r += 2) {
        const lat = Math.abs(at(e.startD + r));
        assert.ok(lat <= last + 1e-9, `${c.id}: always heading in`);
        last = lat;
      }
      assert.ok(inSpan(e.gateD, e.gap.from, e.gap.to, c.total), `${c.id}: gate inside its gap`);
      assert.ok(e.gap.length > 2 * e.halfWidth && e.gap.length < 120, `${c.id}: gap ${e.gap.length}`);
      assert.equal(at(e.startD - 5), null);
      assert.equal(at(e.mergeD + 5), null);
    });
  });
});

test("every entrance is clear of the start, its pit lane's side of the pit zone, the tunnel and the raised road", () => {
  CIRCUITS.forEach((c) => {
    c.entrances.forEach((e) => {
      const from = e.startD - Entrances.CARPORT.back;
      const to = e.mergeD;
      const hits = (a, b) => inSpan(a, from, to, c.total) || inSpan(b, from, to, c.total) || inSpan(from, a, b, c.total);
      assert.ok(!hits(-Entrances.START_BEFORE, Entrances.START_AFTER), `${c.id}: on the start`);
      if (e.side === c.lane.side) assert.ok(!hits(c.lane.entry - Entrances.PIT_MARGIN, c.lane.exit + Entrances.PIT_MARGIN), `${c.id}: in the pit zone`);
      if (c.shape.tunnel) assert.ok(!hits(c.shape.tunnel.from - Entrances.TUNNEL_MARGIN, c.shape.tunnel.to + Entrances.TUNNEL_MARGIN), `${c.id}: in the tunnel`);
      c.bridges.forEach((b) => {
        const m = b.raised ? Entrances.BRIDGE_MARGIN : Entrances.UNDER_MARGIN;
        assert.ok(!hits(b.d - m, b.d + m), `${c.id}: on or under a bridge`);
      });
    });
  });
});

test("every slip road's line never folds over itself: never on the inside of a bend tighter than its reach", () => {
  CIRCUITS.forEach((c) => {
    const lap = dense(c.points, c.total);
    c.entrances.forEach((e) => {
      // Its line, measured afresh from the dense lap: each point's offset
      // along the local normal; consecutive points must keep moving along
      // the lap (no backwards step), and stay on its side.
      let prev = null;
      for (let r = 0; r <= e.length; r += 3) {
        const d = (e.startD + r) % c.total;
        const p = e.lap.point(d, e.latAt(d));
        if (prev) {
          const q = lap.reduce((best, x) => (Math.abs(((x.d - d) % c.total + c.total * 1.5) % c.total - c.total / 2) < Math.abs(((best.d - d) % c.total + c.total * 1.5) % c.total - c.total / 2) ? x : best));
          const tx = q.ny;
          const ty = -q.nx;
          const step = (p.x - prev.x) * tx + (p.y - prev.y) * ty;
          assert.ok(step > 0, `${c.id}: entrance ${e.index} runs backwards at ${Math.round(d)}`);
        }
        prev = p;
      }
    });
  });
});

test("every entrance's road, carport and booth stand on clear ground, away from the rest of the circuit and its scenery", () => {
  CIRCUITS.forEach((c) => {
    const lap = dense(c.points, c.total);
    const lane = c.lane;
    c.entrances.forEach((e) => {
      assert.ok(e.footprint.length > 4, `${c.id}: a footprint`);
      assert.ok(e.footprint.some((f) => f.kind === "carport") && e.footprint.some((f) => f.kind === "booth"), `${c.id}: carport and booth`);
      e.footprint.forEach((f) => {
        lap.forEach((q) => {
          // (Its own stretch is the road it joins.)
          if (inSpan(q.d, e.startD - 120, e.mergeD + 80, c.total)) return;
          // (On the pit side of the pit zone, the garages reach further out.)
          const pitSide = lane.inZone(q.d) && ((f.x - q.x) * q.nx + (f.y - q.y) * q.ny) * lane.side > 0;
          const reach = pitSide ? (lane.atGarage(q.d, 4) ? lane.garages.outer : lane.outerAt(q.d)) : e.runoff;
          const dist = Math.hypot(f.x - q.x, f.y - q.y);
          assert.ok(dist >= reach + f.r, `${c.id}: entrance ${e.index} ${f.kind} ${Math.round(dist)} from the lap at ${Math.round(q.d)}`);
        });
        (c.shape.decor || []).forEach((s) => {
          const r = Entrances.FOOTPRINT[s.type];
          if (!r) return;
          assert.ok(Math.hypot(f.x - s.x, f.y - s.y) >= r + f.r, `${c.id}: entrance ${e.index} on a ${s.type}`);
        });
      });
    });
  });
});

test("the ways on: the pit lane from the Safety Car's bay to the exit, and each entrance from its standby spot", () => {
  const c = CIRCUITS.find((x) => x.id === "monza");
  const list = Entrances.ways(c.entrances, c.lane, c.total);
  assert.equal(list[0].kind, "pit");
  const park = Pit.parkAt(c.lane);
  assert.equal(list[0].startD, park.d);
  assert.equal(list[0].startLat, park.lat);
  assert.equal(list[0].mergeD, wrap(c.lane.exit, c.total));
  assert.equal(list[0].length, c.lane.exit - park.rel);
  assert.equal(list.length, c.entrances.length + 1);
  list.slice(1).forEach((w, i) => {
    const e = c.entrances[i];
    assert.equal(w.kind, "access");
    assert.equal(w.startLat, e.side * e.far);
    assert.equal(w.latAt(w.startD), e.latAt(e.startD));
    assert.ok(w.giveWayU > 0 && w.giveWayU < e.gateU, "it gives way just before its gate");
  });
});

test("run time: from rest at ACCEL up to the way's speed", () => {
  const { ACCEL } = Entrances;
  assert.equal(Entrances.runTime(0, 100), 0);
  // Never reaching full speed: s = a t^2 / 2.
  assert.ok(Math.abs(Entrances.runTime(10, 100) - Math.sqrt(20 / ACCEL)) < 1e-9);
  // Reaching it: ramp, then cruise.
  const v = 100;
  const ramp = (v * v) / (2 * ACCEL);
  assert.ok(Math.abs(Entrances.runTime(ramp + 300, v) - (v / ACCEL + 3)) < 1e-9);
});

test("choose: waits for the leader where there is time to drive the whole way first, chases from behind otherwise", () => {
  const total = 6000;
  const access = (mergeD) => ({ kind: "access", index: 0, mergeD, length: 200, startD: mergeD - 200, giveWayU: 110 });
  const pit = { kind: "pit", index: -1, mergeD: 500, length: 400, startD: 100, giveWayU: 240 };
  const opts = { total, leaderSpeed: 160, fieldSpeed: 188, scPace: 0.55 * 188 };
  // An entrance 1,000 ahead of the leader: ahead, joining LEAD before them.
  let pick = Entrances.choose([access(3000)], { ...opts, leaderD: 2000 });
  assert.equal(pick.ahead, true);
  assert.ok(Math.abs(pick.time - (1000 / 160 - Entrances.LEAD)) < 1e-9);
  // Just past it: behind, and catching up.
  pick = Entrances.choose([access(3000)], { ...opts, leaderD: 3050 });
  assert.equal(pick.ahead, false);
  assert.ok(pick.time > Entrances.runTime(200, Entrances.ACCESS_SPEED * 188));
  // With a pack of cars coming past the gate, it has to wait for them (and
  // a gap) first: later.
  const pack = Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, d: 3050 - 40 * (i + 1), speed: 160 }));
  const packed = Entrances.choose([access(3000)], { ...opts, leaderD: 3050, bodies: pack });
  assert.ok(packed.time > pick.time + 1, `${packed.time} vs ${pick.time}`);
  // Well over half a lap ahead is still ahead (not "just gone by").
  pick = Entrances.choose([access(5000)], { ...opts, leaderD: 1500 });
  assert.equal(pick.ahead, true);
  assert.ok(Math.abs(pick.time - (3500 / 160 - Entrances.LEAD)) < 1e-9);
  // Of several, the sooner: the pit lane when it is.
  pick = Entrances.choose([access(3000), access(2600)], { ...opts, leaderD: 1800 });
  assert.equal(pick.way.mergeD, 2600);
  pick = Entrances.choose([pit, access(3000)], { ...opts, leaderD: -1500 });
  assert.equal(pick.way.kind, "pit");
  assert.equal(pick.ahead, true);
  // On a tie, the first listed (the pit lane).
  const twin = { ...pit };
  pick = Entrances.choose([pit, twin], { ...opts, leaderD: -1500 });
  assert.equal(pick.way, pit);
});

test("passingLat: a clear line past the cars just ahead, or the centre line on an empty road", () => {
  const total = 5000;
  assert.equal(Entrances.passingLat({ d: 100, lat: 20 }, [], total, W), 0);
  const car = { d: 140, lat: 0 };
  const lat = Entrances.passingLat({ d: 100, lat: 5 }, [car], total, W);
  assert.ok(Math.abs(lat - car.lat) >= PowerUps.CAR_WIDTH + 3, `${lat}`);
  // Never through a car alongside to reach a line.
  const boxed = Entrances.passingLat({ d: 100, lat: 30 }, [{ d: 105, lat: 10 }, { d: 140, lat: 30 }], total, W);
  assert.ok(boxed >= 10 + PowerUps.CAR_WIDTH, `${boxed}`);
  assert.ok(lat > 0, "the nearer side to where it is");
  assert.ok(Math.abs(lat) <= W - 10);
  // Cars far behind it, or far ahead, don't count.
  assert.equal(Entrances.passingLat({ d: 100, lat: 0 }, [{ d: 40, lat: 0 }, { d: 400, lat: 0 }], total, W), 0);
});

test("drive: on its way on its speed is its pace (what the cars behind it see), and it never moves while still easing out of its garage", () => {
  const c = CIRCUITS.find((x) => x.id === "monza");
  const list = Entrances.ways(c.entrances, c.lane, c.total);
  const way = list[1];
  const sc = { phase: "join", way: { kind: way.kind, index: way.index }, d: way.startD, lat: way.startLat, speed: 0, pace: 0, leading: false, until: 1e9, holdUntil: 1e9 };
  const ctx = { now: 0, dt: 1 / 60, total: c.total, way, bodies: [], leader: null, fieldSpeed: 190, scPace: 100, spellMs: 5000, halfWidthAt: () => W };
  for (let i = 0; i < 30; i += 1) Entrances.drive(sc, ctx);
  assert.ok(sc.speed > 0 && sc.pace === sc.speed, `${sc.pace} vs ${sc.speed}`);
  // Called while still backing into its garage: out to its spot first, in place.
  const pit = list[0];
  const parked = { phase: "hold", way: { kind: "pit", index: -1 }, d: pit.startD, lat: pit.startLat + 14 * c.lane.side, speed: 0, pace: 0, leading: false, until: 1e9, holdUntil: 0 };
  let last = parked.lat;
  let steps = 0;
  while (parked.phase === "hold" && steps < 600) {
    Entrances.drive(parked, { ...ctx, way: pit });
    assert.ok(Math.abs(parked.lat - last) <= 0.5, "eases, never jumps");
    last = parked.lat;
    steps += 1;
  }
  assert.equal(parked.phase, "join");
});

test("holds: a rival is slowed only once the Safety Car leads, or while it is coming up to them; never its caller, never off the road", () => {
  const total = 5000;
  const sc = { phase: "road", d: 1000, lat: 0, ownerId: "me", leading: false, leaving: false, until: 0 };
  const near = { id: "a", d: 1000 + Entrances.NEAR - 20 };
  const far = { id: "b", d: 1000 + Entrances.NEAR + 200 };
  const behind = { id: "c", d: 1000 - 100 };
  assert.equal(Entrances.holds(sc, near, total, 0), true);
  assert.equal(Entrances.holds(sc, far, total, 0), false);
  // Coming up behind it while it catches up (or waits for the leader): free.
  assert.equal(Entrances.holds(sc, behind, total, 0), false);
  assert.equal(Entrances.holds({ ...sc, leading: true, until: 100 }, behind, total, 50), true);
  assert.equal(Entrances.holds(sc, { id: "me", d: 990 }, total, 0), false);
  assert.equal(Entrances.holds({ ...sc, phase: "join" }, near, total, 0), false);
  assert.equal(Entrances.holds({ ...sc, phase: "hold" }, near, total, 0), false);
  assert.equal(Entrances.holds({ ...sc, leaving: true }, near, total, 0), false);
  assert.equal(Entrances.holds({ ...sc, leading: true, until: 100 }, far, total, 50), true);
  assert.equal(Entrances.holds({ ...sc, leading: true, until: 100 }, far, total, 150), false);
});

// A race, simulated with the game's own rules for the Safety Car: twenty
// cars at racing speed, the leader anywhere on the lap; the Safety Car is
// called and drives its way on (Entrances.drive), the field held by
// Entrances.holds and PowerUps.holdStationSpeed as game.js applies them.
function simulate(c, leaderD, seed) {
  let s = seed;
  const rand = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const total = c.total;
  // (In race order, roughly in order of pace: the field's spread of top
  // speeds, game.js lerp(138, 238, speed stat), the quicker cars ahead.)
  const cars = Array.from({ length: 20 }, (_, i) => {
    const max = 228 - i * 3.5 + (rand() - 0.5) * 24;
    return { id: `c${i}`, d: wrap(leaderD - i * (40 + rand() * 80), total), lat: (rand() - 0.5) * 60, max, speed: 0.82 * max, lap: 0 };
  });
  cars.forEach((car) => { car.progress = -Entrances.delta(leaderD, car.d, total); });
  const fieldSpeed = cars.reduce((a, b) => a + b.max, 0) / cars.length;
  const scPace = fieldSpeed * PowerUps.FACTORS.safetyCar;
  const owner = cars[cars.length - 1];
  const list = Entrances.ways(c.entrances, c.lane, total);
  const leaderOf = () => cars.filter((x) => x !== owner).reduce((a, b) => (b.progress > a.progress ? b : a));
  const lead = leaderOf();
  const pick = Entrances.choose(list, { leaderD: lead.d, leaderSpeed: 0.85 * lead.max, total, fieldSpeed, scPace, bodies: cars.filter((x) => x !== lead), ownerId: owner.id });
  const way = pick.way;
  const sc = { phase: "hold", way: { kind: way.kind, index: way.index }, d: way.startD, lat: way.startLat, speed: 0, pace: 0, ownerId: owner.id, leading: false, leaving: false, until: 30000, holdUntil: Entrances.HOLD_MAX_MS };
  const dt = 1 / 60;
  const problems = [];
  const bodies = () => cars.map((x) => ({ id: x.id, d: x.d, lat: x.lat, speed: x.speed }));
  // Where it first shows: clear of everyone by a car length.
  cars.forEach((x) => {
    if (Math.abs(Entrances.delta(x.d, sc.d, total)) < Entrances.CAR_LENGTH && Math.abs(x.lat - sc.lat) < Entrances.CAR_LENGTH) problems.push("appeared on a car");
  });
  for (let step = 0; step < 60 * 20; step += 1) {
    const now = step * 1000 * dt;
    const leader = leaderOf();
    Entrances.drive(sc, {
      now, dt, total, way, bodies: bodies(), leader: { id: leader.id, d: leader.d, speed: leader.speed }, fieldSpeed, scPace,
      spellMs: 5000, halfWidthAt: () => W,
    });
    if (sc.leading) return { time: now / 1000, problems, way };
    // The field: racing speed, held near the Safety Car; nobody drives through it.
    const scBody = { id: "safetyCar", d: sc.d, lat: sc.lat, speed: sc.pace ?? sc.speed };
    const onRoad = sc.phase === "road" || (Math.abs(sc.lat) - 8 < W);
    cars.forEach((x) => {
      // (No car drives through another: it holds behind one in its lane.)
      let v = Math.min(0.82 * x.max, PowerUps.holdStationSpeed(x, bodies(), total));
      const held = Entrances.holds(sc, x, total, now);
      if (held) v = Math.min(v, x.max * PowerUps.FACTORS.safetyCar);
      if (onRoad) v = Math.min(v, held ? PowerUps.holdStationSpeed(x, [...bodies(), scBody], total, { singleFile: true }) : PowerUps.holdStationSpeed(x, [scBody], total));
      x.speed += Math.max(-400 * dt, Math.min(150 * dt, v - x.speed));
    });
    cars.forEach((x) => {
      x.d = wrap(x.d + x.speed * dt, total);
      x.progress += x.speed * dt;
      // Moving over to let it by (game.js steers the CPU cars there).
      const aside = Entrances.yieldLat(sc, x, total, W);
      if (aside !== null) x.lat += Math.max(-25 * dt, Math.min(25 * dt, aside - x.lat));
    });
    if (sc.phase === "road" || Math.abs(sc.lat) < W + 8) {
      cars.forEach((x) => {
        if (Math.abs(Entrances.delta(x.d, sc.d, total)) < Entrances.CAR_LENGTH && Math.abs(x.lat - sc.lat) < Entrances.CAR_WIDTH) problems.push(`overlapped ${x.id} at ${Math.round(sc.d)}`);
      });
    }
  }
  return { time: Infinity, problems, way };
}

test("called, the Safety Car is in front of the leader soon, from wherever the leader is, on every circuit", () => {
  const report = [];
  const medians = [];
  CIRCUITS.forEach((c, ci) => {
    const times = [];
    for (let k = 0; k < 16; k += 1) {
      const r = simulate(c, (c.total * k) / 16 + 37, 1000 + ci * 31 + k);
      assert.deepEqual(r.problems.slice(0, 3), [], `${c.id} from ${Math.round((c.total * k) / 16)}`);
      times.push(r.time);
    }
    times.sort((a, b) => a - b);
    const median = times[times.length >> 1];
    const worst = times[times.length - 1];
    report.push(`${c.id} ${median.toFixed(1)}/${worst.toFixed(1)}`);
    medians.push(median);
    assert.ok(median <= Entrances.TARGET_MEDIAN_S, `${c.id}: median ${median.toFixed(1)} s`);
    assert.ok(worst <= Entrances.TARGET_WORST_S, `${c.id}: worst ${worst.toFixed(1)} s`);
  });
  const typical = medians.reduce((a, b) => a + b, 0) / medians.length;
  assert.ok(typical <= Entrances.TARGET_TYPICAL_S, `typically ${typical.toFixed(1)} s`);
  // (For the record: median / worst per circuit.)
  if (process.env.SC_REPORT) console.log(`${report.join("\n")}\ntypical ${typical.toFixed(1)} s`);
});

test("cornerNear: the corner whose span (or end) is within reach, by its board name", () => {
  const corners = [{ board: "TAMBURELLO", d: 1000, from: 900, to: 1100 }, { board: "TOSA", d: 3000, from: 2950, to: 3050 }];
  assert.equal(Entrances.cornerNear(corners, 1050, 6000), "TAMBURELLO");
  assert.equal(Entrances.cornerNear(corners, 1400, 6000), "TAMBURELLO");
  assert.equal(Entrances.cornerNear(corners, 2000, 6000), null);
  assert.equal(Entrances.cornerNear([], 2000, 6000), null);
});

test("slopeOn: the Safety Car on an access road faces along it", () => {
  const c = CIRCUITS.find((x) => x.id === "spa");
  const e = c.entrances[0];
  const mid = e.startD + e.length / 2;
  assert.ok(Math.abs(Entrances.slopeOn(c.entrances, mid, e.latAt(mid))) > 0.3);
  assert.equal(Entrances.slopeOn(c.entrances, mid, 0), 0);
});
