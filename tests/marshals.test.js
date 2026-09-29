const test = require("node:test");
const assert = require("node:assert/strict");
const Marshals = require("../marshals.js");

const car = (d, extra = {}) => ({ trackDistance: d, speed: 200, physics: { maxSpeed: 240 }, spinUntil: 0, ...extra });

test("posts every SPACING round the lap, evenly", () => {
  const posts = Marshals.posts(6000);
  assert.equal(posts.length, 10);
  posts.forEach((p, i) => { if (i) assert.equal(Math.round(p.d - posts[i - 1].d), 600); });
  assert.ok(posts.every((p) => p.d >= 0 && p.d < 6000));
});

test("a post waves yellow while a car ahead of it is spun or stopped", () => {
  const posts = [{ index: 0, d: 1000 }];
  const memory = {};
  assert.deepEqual(Marshals.flags(posts, [car(1100)], 5000, 6000, memory, true), ["none"]);
  assert.deepEqual(Marshals.flags(posts, [car(1100, { spinUntil: 6000 })], 5000, 6000, memory, true), ["yellow"]);
  assert.deepEqual(Marshals.flags(posts, [car(1250, { speed: 5 })], 5100, 6000, memory, true), ["yellow"]);
  // Behind the post, or beyond its stretch: not its business.
  assert.deepEqual(Marshals.flags(posts, [car(900, { spinUntil: 9e9 })], 5200, 6000, {}, true), ["none"]);
  assert.deepEqual(Marshals.flags(posts, [car(1000 + Marshals.AHEAD + 10, { speed: 0 })], 5200, 6000, {}, true), ["none"]);
  // Every stretch is watched: each post covers up to the next.
  assert.equal(Marshals.AHEAD, Marshals.SPACING);
  assert.deepEqual(Marshals.flags(posts, [car(1000 + Marshals.SPACING - 20, { speed: 0 })], 5200, 6000, {}, true), ["yellow"]);
  // A finished car parked after the line is not an incident.
  assert.deepEqual(Marshals.flags(posts, [car(1100, { speed: 0, finished: true })], 5200, 6000, {}, true), ["none"]);
});

test("then green for GREEN_MS once it clears, then furled; nothing before the start", () => {
  const posts = [{ index: 0, d: 1000 }];
  const memory = {};
  Marshals.flags(posts, [car(1100, { spinUntil: 6000 })], 5000, 6000, memory, true);
  assert.deepEqual(Marshals.flags(posts, [car(1400)], 6500, 6000, memory, true), ["green"]);
  assert.deepEqual(Marshals.flags(posts, [car(1400)], 5000 + Marshals.GREEN_MS + 10, 6000, memory, true), ["none"]);
  // A memory from a later clock (a previous race run fast-forward after its
  // flag) is not a recent incident.
  assert.deepEqual(Marshals.flags(posts, [car(1400)], 3000, 6000, { 0: 9000 }, true), ["none"]);
  // On the grid every car is still: no yellow flags.
  assert.deepEqual(Marshals.flags(posts, [car(1100, { speed: 0 })], 5000, 6000, {}, false), ["none"]);
  // Round the line: a post near the end of the lap watches the start of the next.
  assert.deepEqual(Marshals.flags([{ index: 0, d: 5900 }], [car(50, { speed: 0 })], 5000, 6000, {}, true), ["yellow"]);
});
