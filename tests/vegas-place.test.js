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
