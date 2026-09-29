const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const Pit = require("../pitlane.js");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "tracks-data.js"), "utf8");
const sandbox = {};
vm.runInNewContext(`${source}\nthis.TRACK_SHAPES = TRACK_SHAPES;`, sandbox);
const SHAPES = JSON.parse(JSON.stringify(sandbox.TRACK_SHAPES));
// The road's half-width in the game: roadWidth 33 x TRACK_WIDTH_SCALE 1.5.
const W = 49.5;

// The lap as the game builds it: segments between the points, closing the loop.
function lapOf(points) {
  const segs = [];
  let run = 0;
  points.forEach((a, i) => {
    const b = points[(i + 1) % points.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    segs.push({ a, dx: b.x - a.x, dy: b.y - a.y, len, start: run });
    run += len;
  });
  const at = (d) => {
    const w = ((d % run) + run) % run;
    let s = segs[segs.length - 1];
    for (const seg of segs) if (seg.start + seg.len >= w) { s = seg; break; }
    const t = s.len ? (w - s.start) / s.len : 0;
    const tx = s.dx / s.len;
    const ty = s.dy / s.len;
    return { x: s.a.x + s.dx * t, y: s.a.y + s.dy * t, nx: -ty, ny: tx };
  };
  return { total: run, at };
}

test("every circuit has a pit lane long enough for ten garages and the Safety Car's", () => {
  Object.entries(SHAPES).forEach(([id, shape]) => {
    const pit = shape.pit;
    assert.ok(pit, `${id}: no pit lane`);
    assert.ok(pit.side === 1 || pit.side === -1, `${id}: side ${pit.side}`);
    // Along the start/finish stretch: from before the line to short of the
    // first item boxes (450 after it). Spanning the line where the stretch
    // allows (all but Monaco, whose stretch bends hard after the line).
    assert.ok(pit.entry >= -900 && pit.entry < 0 && pit.exit <= 440 && pit.exit > pit.entry, `${id}: ${pit.entry}..${pit.exit}`);
    if (id !== "monaco") assert.ok(pit.entry < -Pit.MOUTH && pit.exit > Pit.MOUTH, `${id}: the lane should span the line`);
    const { total } = lapOf(shape.points);
    const lane = Pit.lane(pit, total, W);
    assert.ok(lane.flatTo - lane.flatFrom >= Pit.BAY * Pit.BAYS, `${id}: flat part ${lane.flatTo - lane.flatFrom}`);
    assert.ok(lane.garages.from >= lane.flatFrom && lane.garages.to <= lane.flatTo, `${id}: garages off the flat part`);
    assert.equal(lane.garages.bays.filter((b) => b.safetyCar).length, 1);
  });
});

test("the constants agree with tools/tracks/build_tracks.py", () => {
  const py = fs.readFileSync(path.join(root, "tools", "tracks", "build_tracks.py"), "utf8");
  const read = (name) => Number((py.match(new RegExp(`^PIT_${name} = (\\d+)`, "m")) || [])[1]);
  ["WALL_IN", "WALL_OUT", "LANE_CENTRE", "LANE_HALF", "WORK_OUT", "GARAGE_OUT", "EDGE_IN", "MOUTH", "BAY", "BAYS"].forEach((k) => {
    assert.equal(read(k), Pit[k], `PIT_${k}`);
  });
});

test("latAt: from the road's edge, out to the lane, flat, and back", () => {
  const lane = Pit.lane({ side: -1, entry: -600, exit: 400 }, 6000, W);
  assert.equal(lane.latAt(-601), null);
  assert.equal(lane.latAt(401), null);
  assert.ok(Math.abs(lane.latAt(-600) - -(W - Pit.EDGE_IN)) < 1e-9);
  assert.ok(Math.abs(lane.latAt(400) - -(W - Pit.EDGE_IN)) < 1e-9);
  for (let d = lane.flatFrom; d <= lane.flatTo; d += 10) assert.ok(Math.abs(lane.latAt(d) - -(W + Pit.LANE_CENTRE)) < 1e-9);
  // Continuous: no step bigger than the smoothstep's steepest slope allows.
  let prev = lane.latAt(-600);
  for (let d = -599; d <= 400; d += 1) {
    const lat = lane.latAt(d);
    assert.ok(Math.abs(lat - prev) < 0.6, `step at ${d}`);
    prev = lat;
  }
  // Wraps: a lap distance just short of the total is just before the line.
  assert.equal(lane.latAt(6000 - 10), lane.latAt(-10));
});

test("the pit wall leaves the mouths open and runs where the lane has cleared it", () => {
  const lane = Pit.lane({ side: 1, entry: -600, exit: 400 }, 6000, W);
  assert.equal(lane.wallAt(-590), null);
  assert.equal(lane.wallAt(390), null);
  assert.equal(lane.wallAt(0), W + Pit.WALL_IN);
  // Wherever there is a wall, the whole lane is beyond it.
  for (let d = -600; d <= 400; d += 5) {
    if (lane.wallAt(d) !== null) assert.ok(Math.abs(lane.latAt(d)) - Pit.LANE_HALF >= W + Pit.WALL_OUT);
  }
  // The circuit's pit-side boundary takes in the lane, then the working lane.
  for (let d = -600; d <= 400; d += 5) assert.ok(lane.outerAt(d) >= Math.abs(lane.latAt(d)) + Pit.LANE_HALF);
  assert.equal(lane.outerAt(0), W + Pit.WORK_OUT);
});

test("every pit complex is clear of every other stretch of the lap", () => {
  Object.entries(SHAPES).forEach(([id, shape]) => {
    const { total, at } = lapOf(shape.points);
    const lane = Pit.lane(shape.pit, total, W);
    const pts = shape.points;
    for (let r = lane.entry; r <= lane.exit; r += 10) {
      const p = at(r);
      const reach = r >= lane.garages.from && r <= lane.garages.to ? W + Pit.GARAGE_OUT : lane.outerAt(r);
      for (const off of [W + Pit.WALL_IN, (W + Pit.WALL_IN + reach) / 2, reach]) {
        const x = p.x + p.nx * lane.side * off;
        const y = p.y + p.ny * lane.side * off;
        // Other stretches: more than 300 round the lap from here.
        let run = 0;
        pts.forEach((q, j) => {
          const next = pts[(j + 1) % pts.length];
          const gap = Math.abs(((run - r) % total + total * 1.5) % total - total / 2);
          run += Math.hypot(next.x - q.x, next.y - q.y);
          if (gap <= 300) return;
          const clear = Math.hypot(q.x - x, q.y - y) - W;
          assert.ok(clear >= 40, `${id}: at ${r} (offset ${off.toFixed(0)}) only ${clear.toFixed(0)} from another stretch's edge`);
        });
      }
    }
  });
});

test("no item box sits in the pit lane's mouths", () => {
  Object.entries(SHAPES).forEach(([id, shape]) => {
    const { total, at } = lapOf(shape.points);
    const lane = Pit.lane(shape.pit, total, W);
    shape.itemBoxes.forEach((b) => {
      let best = { gap: Infinity, d: 0 };
      for (let d = 0; d < total; d += 3) {
        const p = at(d);
        const gap = Math.hypot(p.x - b.x, p.y - b.y);
        if (gap < best.gap) best = { gap, d };
      }
      assert.ok(!lane.inZone(best.d), `${id}: a box at lap distance ${best.d} is in the pit zone`);
    });
  });
});
