const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const Grid = require("../grid.js");

const source = fs.readFileSync(path.join(__dirname, "..", "tracks-data.js"), "utf8");
const sandbox = {};
vm.runInNewContext(`${source}\nthis.TRACK_SHAPES = TRACK_SHAPES;`, sandbox);
const SHAPES = sandbox.TRACK_SHAPES;

// Distance round the lap (from points[0], the start line) of the point on the
// circuit nearest to p.
function lapDistance(points, p) {
  let best = { gap: Infinity, d: 0 };
  let run = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    const t = len ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (len * len))) : 0;
    const gap = Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y);
    if (gap < best.gap) best = { gap, d: run + len * t };
    run += len;
  }
  return { d: best.d, total: run };
}

test("the start zone covers the whole grid and the qualifying run-up", () => {
  // 20 cars in pairs, 36 apart, the first 12 behind the line; qualifying rolls
  // in from 260 + 320 before the line.
  assert.ok(Grid.START_ZONE_BEFORE >= 9 * 36 + 12 + 40);
  assert.ok(Grid.START_ZONE_BEFORE >= 260 + 320 + 20);
  assert.ok(Grid.START_ZONE_AFTER > 0);
});

test("inStartZone: behind the line, just after it, and clear of it", () => {
  const total = 5000;
  assert.equal(Grid.inStartZone(total - 10, total), true);
  assert.equal(Grid.inStartZone(total - Grid.START_ZONE_BEFORE + 1, total), true);
  assert.equal(Grid.inStartZone(5, total), true);
  assert.equal(Grid.inStartZone(Grid.START_ZONE_AFTER + 1, total), false);
  assert.equal(Grid.inStartZone(total - Grid.START_ZONE_BEFORE - 1, total), false);
  assert.equal(Grid.inStartZone(2500, total), false);
});

for (const [id, shape] of Object.entries(SHAPES)) {
  test(`${id}: no item box sits on the grid or the qualifying run-up`, () => {
    assert.ok(shape.itemBoxes.length >= 9, "a circuit keeps at least three rows of boxes");
    for (const box of shape.itemBoxes) {
      const { d, total } = lapDistance(shape.points, box);
      assert.equal(Grid.inStartZone(d, total), false,
        `box at (${box.x}, ${box.y}) is ${Math.round(d)} round a ${Math.round(total)} lap`);
    }
  });
}

for (const [id, shape] of Object.entries(SHAPES)) {
  if (!shape.bridges || !shape.bridges.length) continue;
  test(`${id}: no item box sits at the crossover, under or on the bridge`, () => {
    for (const bridge of shape.bridges) {
      const cross = shape.points[bridge.under];
      for (const box of shape.itemBoxes) {
        const gap = Math.hypot(box.x - cross.x, box.y - cross.y);
        assert.ok(gap > 180, `box at (${box.x}, ${box.y}) is ${Math.round(gap)} from the crossover`);
      }
    }
  });
}

test("boxesClearOfStart drops boxes in the start zone and keeps the rest in order", () => {
  const total = 5000;
  const boxes = [{ id: 1, d: 900 }, { id: 2, d: total - 100 }, { id: 3, d: 40 }, { id: 4, d: 2600 }];
  assert.deepEqual(Grid.boxesClearOfStart(boxes, total).map((b) => b.id), [1, 4]);
});
