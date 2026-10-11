// Moving a piece of the Las Vegas Strip off the track (r3d/vegas-place.js).
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

// A straight track along x (z = 0), its barriers 40 either side.
const course = {
  clearance: (x, z) => Math.abs(z) - 40,
  nearestSample: (x) => ({ x, y: 0, nx: 0, ny: 1 }),
};
let place;
test.before(async () => { place = await import(path.join(__dirname, "..", "r3d", "vegas-place.js")); });

test("a piece clear of the track stays where it is", () => {
  assert.deepEqual(place.shiftClear([[0, 60], [20, 80]], course), { dx: 0, dz: 0, shift: 0 });
});

test("a piece in the run-off moves straight away from the track until clear", () => {
  const r = place.shiftClear([[0, 45], [10, 70]], course, { margin: 10 });
  assert.ok(Math.abs(r.dx) < 1e-9 && r.dz > 4.9, JSON.stringify(r));
  assert.ok(Math.abs(45 + r.dz) - 40 >= 10, "its nearest point 10 past the barrier");
});

test("every point counts, not just the lowest: an edge across the margin moves the piece", () => {
  // The far corner is clear; the near one is not.
  const r = place.shiftClear([[0, 120], [0, 44]], course, { margin: 10 });
  assert.ok(r.shift > 5, JSON.stringify(r));
});

test("one that would have to go too far, or across the road, is left out (and says why)", () => {
  assert.equal(place.shiftClear([[0, 0], [0, 10]], course, { maxShift: 30 }).dropped, "too far");
  assert.ok(place.shiftClear([[0, -50], [0, 45]], course, { maxShift: 500 }).dropped, "a piece either side of the road");
});

test("a moved piece keeps off ground already taken", () => {
  const taken = (x, z) => z > 50 && z < 60;
  assert.equal(place.shiftClear([[0, 45]], course, { margin: 10, blocked: taken }).dropped, "crowded");
  // (Ground taken only matters for a piece that moves.)
  assert.equal(place.shiftClear([[0, 55]], course, { margin: 10, blocked: taken }).shift, 0);
});

test("tiles: points in the same 600-unit cell share a key", () => {
  assert.equal(place.tileKey(10, 10), place.tileKey(590, 599));
  assert.notEqual(place.tileKey(10, 10), place.tileKey(610, 10));
});

test("a stand's place: beside the track, its front a gap past the barrier, facing it", () => {
  // The track runs along +x here; its right is +y (the game's z), its barrier 40 out.
  const p = { x: 100, y: 0, nx: 0, ny: 1, outerL: 30, outerR: 40 };
  const right = place.standSite(p, 1, 10, 34);
  assert.ok(Math.abs(right.x - 100) < 1e-9 && Math.abs(right.y - (40 + 2 + 10 + 34)) < 1e-9, JSON.stringify(right));
  // It faces back at the track (-y), its length along the track.
  assert.ok(Math.abs(Math.cos(right.face)) < 1e-9 && Math.sin(right.face) < -0.99);
  assert.ok(Math.abs(Math.abs(Math.cos(right.angle)) - 1) < 1e-9, "its length lies along the track");
  const left = place.standSite(p, -1, 10, 34);
  assert.ok(Math.abs(left.y + (30 + 2 + 10 + 34)) < 1e-9 && Math.sin(left.face) > 0.99);
  // As the track data's own stands are written: angle = face + a quarter turn.
  assert.ok(Math.abs(right.angle - right.face - Math.PI / 2) < 1e-9);
});

test("a footprint's points cover it closely, corners and all", () => {
  const pts = place.rectPoints(0, 0, 0, 78, 34, 20);
  [[-78, -34], [78, -34], [78, 34], [-78, 34], [0, 0]].forEach(([x, y]) => assert.ok(pts.some((q) => Math.abs(q[0] - x) < 1e-9 && Math.abs(q[1] - y) < 1e-9), `no ${x}, ${y}`));
  pts.forEach(([x, y]) => assert.ok(Math.abs(x) <= 78 + 1e-9 && Math.abs(y) <= 34 + 1e-9));
  assert.ok(pts.length >= 9 * 5);
  // Turned a quarter: its length along y.
  assert.ok(place.rectPoints(0, 0, Math.PI / 2, 78, 34, 20).some((q) => Math.abs(q[1] - 78) < 1e-6));
});

test("Las Vegas has its race-weekend stands, and the check counts them", () => {
  const fs = require("node:fs");
  const src = fs.readFileSync(path.join(__dirname, "..", "r3d", "landmarks.js"), "utf8");
  const vegas = src.slice(src.indexOf("  lasvegas: {"), src.indexOf("\n  },", src.indexOf("  lasvegas: {")));
  assert.ok(/stands: \{/.test(vegas), "Las Vegas lists no stands of its own");
  const track = fs.readFileSync(path.join(__dirname, "..", "r3d", "track.js"), "utf8");
  assert.ok(track.includes("venueStands(course, venue, bg, group)"), "the venue's stands are not built with the decor");
  const check = fs.readFileSync(path.join(__dirname, "..", "tools", "checks", "trackside-models-check.js"), "utf8");
  assert.ok(check.includes("results.vegasStands"), "the browser check does not count the stands");
});
