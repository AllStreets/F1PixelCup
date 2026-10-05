const test = require("node:test");
const assert = require("node:assert/strict");
const Runoff = require("../runoff.js");
const Pit = require("../pitlane.js");

// A track as game.js builds one: segments between points, their starts and the lap.
function trackFrom(points, { id = "test", roadWidth = 49.5, pit = null } = {}) {
  const segments = points.map((a, i) => {
    const b = points[(i + 1) % points.length];
    return { a, b, dx: b.x - a.x, dy: b.y - a.y, length: Math.hypot(b.x - a.x, b.y - a.y) };
  });
  const cumulativeStarts = [];
  let total = 0;
  segments.forEach((s) => { cumulativeStarts.push(total); total += s.length; });
  const track = { id, roadWidth, segments, cumulativeStarts, totalLength: total };
  track.pitLane = pit ? Pit.lane(pit, total, roadWidth) : null;
  return track;
}

// A big circle (counter-clockwise), nothing else near it.
const circle = (r, n = 180) => Array.from({ length: n }, (_, i) => ({ x: 2000 + r * Math.cos((i / n) * 2 * Math.PI), y: 2000 + r * Math.sin((i / n) * 2 * Math.PI) }));

test("open country: the run-off is the full width either side; a street circuit's is narrow", () => {
  const prof = Runoff.profile(trackFrom(circle(1200)));
  prof.samples.forEach((p) => {
    assert.ok(Math.abs(p.outerL - (49.5 + 38)) < 1e-9 && Math.abs(p.outerR - (49.5 + 38)) < 1e-9);
  });
  const street = Runoff.profile(trackFrom(circle(1200), { id: "monaco" }));
  assert.ok(street.samples.every((p) => Math.abs(p.outerR - (49.5 + 14)) < 1e-9));
});

test("two stretches side by side share the room between them", () => {
  // A long thin loop: two straights 160 apart, joined by wide ends.
  const pts = [];
  for (let x = 0; x <= 3000; x += 30) pts.push({ x: 1000 + x, y: 1000 });
  for (let a = 1; a < 30; a += 1) pts.push({ x: 4000 + 80 * Math.sin((a / 30) * Math.PI), y: 1080 - 80 * Math.cos((a / 30) * Math.PI) });
  for (let x = 3000; x >= 0; x -= 30) pts.push({ x: 1000 + x, y: 1160 });
  for (let a = 1; a < 30; a += 1) pts.push({ x: 1000 - 80 * Math.sin((a / 30) * Math.PI), y: 1080 + 80 * Math.cos((a / 30) * Math.PI) });
  const track = trackFrom(pts);
  const prof = Runoff.profile(track);
  // Halfway down the first straight the other stretch is 160 away, on its
  // inside: half of that, less 3, but never less than 10 past the road.
  const p = prof.sampleAt(1500);
  const inside = Math.min(p.outerL, p.outerR);
  assert.ok(Math.abs(inside - Math.max(49.5 + 10, 80 - 3)) < 0.01, `${inside}`);
  assert.ok(Math.abs(Math.max(p.outerL, p.outerR) - (49.5 + 38)) < 1e-6);
});

test("the wall a car meets is the barrier's face, or the pit wall where the lane has left the road", () => {
  const track = trackFrom(circle(1200), { pit: { side: 1, entry: -400, exit: 400 } });
  const prof = Runoff.profile(track);
  // Away from the pits: the barrier, just outside the run-off.
  const far = track.totalLength / 2;
  assert.equal(Runoff.wallOffset(prof, track.pitLane, far, 1), prof.sampleAt(far).outerR + Runoff.BARRIER_GAP);
  assert.equal(Runoff.wallOffset(prof, track.pitLane, far, -1), prof.sampleAt(far).outerL + Runoff.BARRIER_GAP);
  // Beside the garages, on the pit side: the pit wall, not the garages.
  assert.equal(Runoff.wallOffset(prof, track.pitLane, 0, 1), Math.abs(track.pitLane.wallAt(0)));
  assert.ok(Runoff.wallOffset(prof, track.pitLane, 0, 1) < prof.sampleAt(0).outerR);
  // The other side of the road there is the usual barrier.
  assert.equal(Runoff.wallOffset(prof, track.pitLane, 0, -1), prof.sampleAt(0).outerL + Runoff.BARRIER_GAP);
});
