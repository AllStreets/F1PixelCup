// Where trackside pieces go round a circuit (siting.js),
// docs/superpowers/specs/2026-10-05-historic-landmarks-design.md.
const test = require("node:test");
const assert = require("node:assert/strict");
const Siting = require("../siting.js");

test("the pit lane's middle, also where the lane runs across the line", () => {
  // Barcelona's: from 270 before the line to 460 after it.
  assert.equal(Siting.laneMiddle(-270, 460, 5934), 95);
  assert.equal(Siting.laneMiddle(100, 500, 5000), 300);
  // Entered late in the lap, left after the line.
  assert.equal(Siting.laneMiddle(4800, 5200, 5000), 0);
});

test("the lap from a point: nearest first, the far side first at each, half the lap each way", () => {
  const a = Siting.lapFrom(1000, 100, 100, -1);
  assert.deepEqual(a.slice(0, 6), [{ d: 100, side: -1 }, { d: 100, side: 1 }, { d: 200, side: -1 }, { d: 200, side: 1 }, { d: 0, side: -1 }, { d: 0, side: 1 }]);
  const ds = a.map((x) => x.d);
  assert.equal(Math.max(...ds), 600);
  assert.equal(Math.min(...ds), -400);
});

// A straight course along +x, the left (-n) at +y: sample i at d = i.
function straight(total = 4000) {
  return {
    track: { totalLength: total },
    sampleAt: (d) => ({ x: d, y: 0, tx: 1, ty: 0, nx: 0, ny: 1, outerL: 60, outerR: 60, d }),
  };
}

test("a stand moved along the lap: its own side, its own distance past the barrier, the nearest clear place", () => {
  const course = straight();
  const piece = { type: "grandstand", x: 1000, y: -150, d: 1000, angle: 0, face: Math.PI / 2 };
  const moved = Siting.slidePiece(course, piece, (x) => x >= 1300 || x <= 600);
  assert.equal(moved.d, 1320);
  assert.equal(moved.x, 1320);
  assert.equal(moved.y, -150, "as far past the barrier, on its side");
  assert.ok(Math.abs(moved.face - Math.PI / 2) < 1e-9, "facing the track");
  assert.equal(moved.moved, true);
  // The other way when that is nearer.
  assert.equal(Siting.slidePiece(course, piece, (x) => x <= 760).d, 760);
  // Nowhere within its reach: none.
  assert.equal(Siting.slidePiece(course, piece, () => false), null);
  assert.equal(Siting.slidePiece(course, piece, (x) => x > 2300), null);
});

test("a round footprint against a placed model's rectangles, turned and scaled", () => {
  const claim = { x: 0, z: 0, yaw: 0, scale: 2, rects: [{ x0: -10, x1: 10, z0: 0, z1: 20 }] };
  assert.equal(Siting.touchesRects(claim, 0, 50, 5), false, "10 past its back");
  assert.equal(Siting.touchesRects(claim, 0, 50, 12), true);
  assert.equal(Siting.touchesRects(claim, 0, 20, 1), true, "inside");
  // Turned a quarter: its depth now runs along x.
  const turned = { ...claim, yaw: Math.PI / 2 };
  assert.equal(Siting.touchesRects(turned, 0, 50, 5), false);
  assert.equal(Siting.touchesRects(turned, 30, 0, 2), true);
});
