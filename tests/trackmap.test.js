const test = require("node:test");
const assert = require("node:assert/strict");
const TrackMap = require("../trackmap.js");

const square = [{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 300, y: 200 }, { x: 100, y: 200 }];

function coords(d) {
  return [...d.matchAll(/[ML]([\d.]+),([\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
}

test("the path fits inside the box with the padding", () => {
  const { d } = TrackMap.path(square, { width: 220, height: 160, padding: 10 });
  coords(d).forEach(([x, y]) => {
    assert.ok(x >= 10 - 1e-9 && x <= 210 + 1e-9, `x ${x}`);
    assert.ok(y >= 10 - 1e-9 && y <= 150 + 1e-9, `y ${y}`);
  });
  assert.match(d, /^M.*Z$/);
});

test("the shape keeps its proportions and is centred", () => {
  const { d } = TrackMap.path(square, { width: 220, height: 160, padding: 10 });
  const pts = coords(d);
  const w = Math.max(...pts.map((p) => p[0])) - Math.min(...pts.map((p) => p[0]));
  const h = Math.max(...pts.map((p) => p[1])) - Math.min(...pts.map((p) => p[1]));
  assert.ok(Math.abs(w / h - 2) < 1e-6);
  assert.ok(Math.abs(Math.min(...pts.map((p) => p[0])) - (220 - w) / 2) < 1e-6);
});

test("start is the first point and heading follows the first leg", () => {
  const map = TrackMap.path(square, { width: 220, height: 160, padding: 10 });
  const first = coords(map.d)[0];
  assert.deepEqual([map.start.x, map.start.y], first);
  assert.equal(map.heading, 0);
  assert.equal(map.viewBox, "0 0 220 160");
});

test("fewer than two points gives an empty path, not an error", () => {
  assert.deepEqual(TrackMap.path([], { width: 10, height: 10 }), { d: "", start: null, heading: 0, viewBox: "0 0 10 10" });
  assert.equal(TrackMap.path([{ x: 1, y: 1 }], { width: 10, height: 10 }).d, "");
});
