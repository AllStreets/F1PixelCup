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
// The street circuits (narrower run-off), as the track builder has them.
const STREET = new Set(JSON.parse(fs.readFileSync(path.join(root, "tools", "tracks", "build_tracks.py"), "utf8")
  .match(/^STREET = \{([^}]*)\}/m)[1].replace(/^/, "[").replace(/$/, "]")));

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
    // Along the stretch either side of the line, reaching it.
    assert.ok(pit.entry >= -900 && pit.exit <= 900 && pit.exit - pit.entry <= 1100, `${id}: ${pit.entry}..${pit.exit}`);
    assert.ok(pit.entry < 0 && pit.exit >= 0, `${id}: the lane should reach the line`);
    const { total } = lapOf(shape.points);
    const lane = Pit.lane(pit, total, W);
    assert.ok(lane.flatTo - lane.flatFrom >= Pit.BAY * Pit.BAYS, `${id}: flat part ${lane.flatTo - lane.flatFrom}`);
    // Eleven bays from the track data, on the flat part, not overlapping, in
    // racing order; the Safety Car's is the last, nearest the exit.
    assert.equal(pit.bays.length, Pit.BAYS, `${id}: bays`);
    const rels = lane.garages.bays.map((b) => lane.rel(b.d));
    rels.forEach((r, i) => {
      assert.ok(r - Pit.BAY / 2 >= lane.flatFrom - 1e-6 && r + Pit.BAY / 2 <= lane.flatTo + 1e-6, `${id}: bay ${i} at ${r} off the flat part`);
      if (i) assert.ok(r - rels[i - 1] >= Pit.BAY - 1e-6, `${id}: bays ${i - 1} and ${i} overlap`);
    });
    assert.equal(lane.garages.bays.filter((b) => b.safetyCar).length, 1);
    assert.ok(lane.garages.bays[Pit.BAYS - 1].safetyCar);
    assert.ok(lane.atGarage(lane.garages.bays[3].d) && !lane.atGarage(lane.entry < 0 ? total + lane.entry + 1 : lane.entry + 1));
  });
});

test("the constants agree with tools/tracks/build_tracks.py", () => {
  const py = fs.readFileSync(path.join(root, "tools", "tracks", "build_tracks.py"), "utf8");
  const read = (name) => Number((py.match(new RegExp(`^PIT_${name} = (\\d+)`, "m")) || [])[1]);
  ["WALL_IN", "WALL_OUT", "LANE_CENTRE", "LANE_HALF", "WORK_OUT", "GARAGE_OUT", "GARAGE_OUT_SHALLOW", "GARAGE_FRONT", "EDGE_IN", "MOUTH", "BAY", "BAYS", "CLEAR", "CLEAR_STREET"].forEach((k) => {
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

test("the renderer and the track builder agree on the street circuits", () => {
  const track = fs.readFileSync(path.join(root, "r3d", "track.js"), "utf8").match(/^const STREET = new Set\((\[[^\]]*\])\);/m)[1];
  assert.deepEqual([...new Set(JSON.parse(track))].sort(), [...STREET].sort());
  assert.ok(STREET.has("monaco") && STREET.has("jeddah"));
});

test("every pit complex is clear of every other stretch of the lap, run-off and barrier included", () => {
  // The same rule as build_tracks.py: beyond the other stretch's road edge
  // by its run-off and barrier with room to spare; the street circuits' run-off
  // is narrower. The other stretches are followed every 5, not just at their
  // points.
  Object.entries(SHAPES).forEach(([id, shape]) => {
    const { total, at } = lapOf(shape.points);
    const lane = Pit.lane(shape.pit, total, W);
    const need = STREET.has(id) ? Pit.CLEAR_STREET : Pit.CLEAR;
    const others = [];
    for (let d = 0; d < total; d += 5) others.push({ d, ...at(d) });
    for (let r = lane.entry; r <= lane.exit; r += 10) {
      const p = at(r);
      const reach = lane.atGarage(r) ? lane.garages.outer : lane.outerAt(r);
      for (const off of [W + Pit.WALL_IN, (W + Pit.WALL_IN + reach) / 2, reach]) {
        const x = p.x + p.nx * lane.side * off;
        const y = p.y + p.ny * lane.side * off;
        others.forEach((q) => {
          const gap = Math.abs(((q.d - r) % total + total * 1.5) % total - total / 2);
          if (gap <= 300) return;
          const clear = Math.hypot(q.x - x, q.y - y) - W;
          assert.ok(clear >= need - 1, `${id}: at ${r} (offset ${off.toFixed(0)}) only ${clear.toFixed(0)} from another stretch's edge`);
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

test("the Safety Car's way in: the road's edge on the pit side, then the lane, then its bay", () => {
  const lane = Pit.lane({ side: 1, entry: -600, exit: 400 }, 6000, W);
  // Without bays in the data, eleven in one run across the middle of the flat part.
  assert.equal(lane.garages.bays.length, Pit.BAYS);
  const bay = lane.garages.bays.find((b) => b.safetyCar);
  const edge = W - Pit.EDGE_IN;
  // Not yet in the lane: the road's edge on the pit side, wherever it is.
  assert.deepEqual(Pit.wayIn(lane, 3000, false, 0), { lat: edge, inLane: false, park: false });
  // Inside the zone but it never took the entry (it was called out past it):
  // it stays on the road and goes round again.
  assert.deepEqual(Pit.wayIn(lane, 0, false, edge), { lat: edge, inLane: false, park: false });
  // At the entry, from the road's edge, it turns in and follows the lane.
  const turn = Pit.wayIn(lane, 6000 - 600 + 5, false, edge);
  assert.equal(turn.inLane, true);
  // Still out in the road at the entry: it can't swerve in, so it goes round.
  assert.deepEqual(Pit.wayIn(lane, 6000 - 600 + 5, false, 10), { lat: edge, inLane: false, park: false });
  // Still closing on the edge (not on it yet): turning in would jump it
  // sideways onto the lane's line, so it doesn't.
  assert.equal(Pit.wayIn(lane, 6000 - 600 + 5, false, edge - 1.5).inLane, false);
  assert.ok(Math.abs(turn.lat - lane.latAt(6000 - 595)) < 1e-9);
  // Down the lane, until it eases into the working lane before its bay.
  const before = bay.rel - 150;
  assert.ok(Math.abs(Pit.wayIn(lane, 6000 + before, true, 0).lat - lane.latAt(6000 + before)) < 1e-9);
  const easing = Pit.wayIn(lane, 6000 + bay.rel - 20, true, 0).lat;
  assert.ok(easing > lane.latAt(6000 + bay.rel - 20) && easing < W + (Pit.LANE_CENTRE + Pit.LANE_HALF + Pit.WORK_OUT) / 2);
  // Past its bay it stops there, in the working lane in front of its garage.
  const parked = Pit.wayIn(lane, bay.d + 1, true);
  assert.equal(parked.park, true);
  assert.equal(parked.lat, W + (Pit.LANE_CENTRE + Pit.LANE_HALF + Pit.WORK_OUT) / 2);
  // On the left, the same, mirrored.
  const left = Pit.lane({ side: -1, entry: -600, exit: 400 }, 6000, W);
  assert.equal(Pit.wayIn(left, 3000, false, 0).lat, -edge);
});

test("the lane's own ends are in it exactly, whatever the lap's length", () => {
  // A lap of a fractional length: (440 + total) - total is not 440 in floats.
  const total = 7962.291717719002;
  const lane = Pit.lane({ side: 1, entry: -660, exit: 440 }, total, W);
  assert.equal(lane.rel(440), 440);
  assert.equal(lane.rel(-660), -660);
  assert.ok(lane.inZone(440) && lane.inZone(-660) && lane.inZone(total - 660));
  assert.notEqual(lane.outerAt(440), null);
  assert.equal(lane.rel(total - 10), -10);
  assert.equal(lane.inZone(450), false);
});
