const test = require("node:test");
const assert = require("node:assert/strict");
const TwoPlayer = require("../twoplayer.js");

const area = (r) => r.w * r.h;
const inside = (r, W, H) => r.x >= 0 && r.y >= 0 && r.x + r.w <= W && r.y + r.h <= H;
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

test("ordinary windows are split one view above the other; ultra-wide ones side by side", () => {
  assert.equal(TwoPlayer.layout(1600, 900).arrangement, "stacked");
  assert.equal(TwoPlayer.layout(1920, 1080).arrangement, "stacked");
  assert.equal(TwoPlayer.layout(1440, 900).arrangement, "stacked");
  assert.equal(TwoPlayer.layout(1920, 970).arrangement, "stacked");
  assert.equal(TwoPlayer.layout(900, 1400).arrangement, "stacked");
  assert.equal(TwoPlayer.layout(2100, 1000).arrangement, "stacked");
  assert.equal(TwoPlayer.layout(2110, 1000).arrangement, "side");
  assert.equal(TwoPlayer.layout(3440, 1440).arrangement, "side");
  assert.equal(TwoPlayer.layout(2560, 1080).arrangement, "side");
});

test("the two views are the same whole-pixel size and, with the divider, tile the whole window", () => {
  const sizes = [[1600, 900], [1601, 901], [900, 1400], [3440, 1440], [2561, 1081], [1024, 576], [320, 568], [800, 500], [1366, 768], [7, 5], [2, 2]];
  sizes.forEach(([W, H]) => {
    const { views, divider } = TwoPlayer.layout(W, H);
    assert.equal(views.length, 2);
    const [a, b] = views;
    [a, b, divider].forEach((r) => {
      Object.values(r).forEach((v) => assert.ok(Number.isInteger(v) && v >= 0, `${W}x${H}: ${JSON.stringify(r)}`));
      assert.ok(inside(r, W, H), `${W}x${H}: ${JSON.stringify(r)} outside`);
    });
    assert.equal(a.w, b.w, `${W}x${H}`);
    assert.equal(a.h, b.h, `${W}x${H}`);
    assert.ok(!overlap(a, b) && !overlap(a, divider) && !overlap(b, divider), `${W}x${H} overlap`);
    // Every pixel is in exactly one of the three.
    assert.equal(area(a) + area(b) + area(divider), W * H, `${W}x${H} not tiled`);
  });
});

test("the divider is a thin rule between the views: 4 or 5 px", () => {
  [[1600, 900], [1600, 901], [900, 1400], [3440, 1440], [3441, 1440]].forEach(([W, H]) => {
    const { arrangement, views, divider } = TwoPlayer.layout(W, H);
    const thickness = arrangement === "stacked" ? divider.h : divider.w;
    assert.ok(thickness === 4 || thickness === 5, `${W}x${H}: ${thickness}`);
    if (arrangement === "stacked") {
      assert.equal(views[0].y, 0);
      assert.equal(divider.y, views[0].h);
      assert.equal(views[1].y + views[1].h, H);
      assert.equal(views[0].w, W);
    } else {
      assert.equal(views[0].x, 0);
      assert.equal(divider.x, views[0].w);
      assert.equal(views[1].x + views[1].w, W);
      assert.equal(views[0].h, H);
    }
  });
});

test("each view's HUD area covers the 1024x576 safe area, as the single view's does", () => {
  [[1600, 448], [800, 900], [1024, 576], [2000, 300], [400, 900], [1, 1]].forEach(([w, h]) => {
    const fit = TwoPlayer.hudFit(w, h);
    assert.ok(fit.width >= 1024 - 1e-9 && fit.height >= 576 - 1e-9, `${w}x${h}: ${JSON.stringify(fit)}`);
    // One of the two is exactly the safe size: the HUD is as large as it can be.
    assert.ok(Math.abs(fit.width - 1024) < 1e-9 || Math.abs(fit.height - 576) < 1e-9);
    // Logical units scale to the real pixels.
    assert.ok(Math.abs(fit.width * fit.scale - w) < 1e-9 && Math.abs(fit.height * fit.scale - h) < 1e-9);
  });
  const stacked = TwoPlayer.layout(1600, 900).views[0];
  const fit = TwoPlayer.hudFit(stacked.w, stacked.h);
  assert.equal(Math.round(fit.height), 576);
});

test("the split view's field of view: as single-player up to 2.4:1, capped beyond it", () => {
  const deg = (r) => (r * 180) / Math.PI;
  const rad = (d) => (d * Math.PI) / 180;
  const horizontal = (fov, aspect) => 2 * deg(Math.atan(Math.tan(rad(fov) / 2) * aspect));
  // Narrower than 16:9 opens up vertically exactly as single-player's fitFov.
  const fitFov = (fov, aspect) => (aspect >= 16 / 9 ? fov : 2 * deg(Math.atan(Math.tan(rad(fov) / 2) * (16 / 9) / aspect)));
  [0.5, 0.89, 1.2, 16 / 9].forEach((a) => assert.ok(Math.abs(TwoPlayer.viewFov(62, a) - fitFov(62, a)) < 1e-9, `aspect ${a}`));
  // Between 16:9 and 2.4:1 it is the given angle.
  [2, 2.4].forEach((a) => assert.ok(Math.abs(TwoPlayer.viewFov(62, a) - 62) < 1e-9));
  // Wider: the horizontal view stays what 2.4:1 shows, never wider.
  const cap = horizontal(62, 2.4);
  [2.5, 3.57, 5, 8].forEach((a) => {
    const v = TwoPlayer.viewFov(62, a);
    assert.ok(v < 62, `aspect ${a}: ${v}`);
    assert.ok(Math.abs(horizontal(v, a) - cap) < 1e-6, `aspect ${a}`);
  });
  // Faster (a wider lens) stays wider.
  assert.ok(TwoPlayer.viewFov(85, 3.57) > TwoPlayer.viewFov(62, 3.57));
});

test("the key sets: every key belongs to one player and one action, and the sets never overlap", () => {
  const actions = ["throttle", "brake", "left", "right", "drift", "item"];
  const seen = new Map();
  [0, 1].forEach((player) => {
    actions.forEach((action) => {
      const codes = TwoPlayer.KEYS[player][action];
      assert.ok(Array.isArray(codes) && codes.length > 0, `${player} ${action}`);
      codes.forEach((code) => {
        assert.ok(!seen.has(code), `${code} used twice`);
        seen.set(code, [player, action]);
        assert.deepEqual(TwoPlayer.keyFor(code), { player, action });
      });
    });
  });
  // The game's own keys stay free: pause, quit, Escape, and Enter (next race).
  ["KeyP", "KeyQ", "Escape", "Enter", "NumpadEnter"].forEach((code) => assert.equal(TwoPlayer.keyFor(code), null));
  assert.deepEqual(TwoPlayer.keyFor("KeyW"), { player: 0, action: "throttle" });
  assert.deepEqual(TwoPlayer.keyFor("Space"), { player: 0, action: "item" });
  assert.deepEqual(TwoPlayer.keyFor("ShiftLeft"), { player: 0, action: "drift" });
  assert.deepEqual(TwoPlayer.keyFor("ArrowUp"), { player: 1, action: "throttle" });
  assert.deepEqual(TwoPlayer.keyFor("ShiftRight"), { player: 1, action: "drift" });
  assert.deepEqual(TwoPlayer.keyFor("Slash"), { player: 1, action: "item" });
  assert.equal(TwoPlayer.keyFor("KeyX"), null);
});

const pad = ({ axes = [0, 0, 0, 0], pressed = [], values = {} } = {}) => ({
  connected: true,
  axes,
  buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i) || (values[i] || 0) > 0.5, value: values[i] ?? (pressed.includes(i) ? 1 : 0) })),
});

test("a pad at rest asks for nothing; the stick has a dead zone, then steers in proportion", () => {
  assert.deepEqual(TwoPlayer.readPad(pad()), { throttle: 0, brake: 0, steer: 0, drift: false, item: false, pause: false });
  assert.equal(TwoPlayer.readPad(pad({ axes: [0.2, 0] })).steer, 0);
  assert.equal(TwoPlayer.readPad(pad({ axes: [-0.24, 0] })).steer, 0);
  const half = TwoPlayer.readPad(pad({ axes: [0.625, 0] })).steer;
  assert.ok(Math.abs(half - 0.5) < 1e-9, String(half));
  assert.equal(TwoPlayer.readPad(pad({ axes: [1, 0] })).steer, 1);
  assert.equal(TwoPlayer.readPad(pad({ axes: [-1, 0] })).steer, -1);
  // The d-pad is full lock.
  assert.equal(TwoPlayer.readPad(pad({ pressed: [14] })).steer, -1);
  assert.equal(TwoPlayer.readPad(pad({ pressed: [15] })).steer, 1);
});

test("a pad's triggers are proportional past a small dead zone; A and B are full throttle and brake", () => {
  assert.equal(TwoPlayer.readPad(pad({ values: { 7: 0.05 } })).throttle, 0);
  assert.ok(Math.abs(TwoPlayer.readPad(pad({ values: { 7: 0.55 } })).throttle - 0.5) < 1e-9);
  assert.equal(TwoPlayer.readPad(pad({ values: { 7: 1 } })).throttle, 1);
  assert.equal(TwoPlayer.readPad(pad({ pressed: [0] })).throttle, 1);
  assert.ok(Math.abs(TwoPlayer.readPad(pad({ values: { 6: 0.4 } })).brake - 1 / 3) < 1e-9);
  assert.equal(TwoPlayer.readPad(pad({ pressed: [1] })).brake, 1);
  assert.equal(TwoPlayer.readPad(pad({ pressed: [4] })).drift, true);
  assert.equal(TwoPlayer.readPad(pad({ pressed: [5] })).drift, true);
  assert.equal(TwoPlayer.readPad(pad({ pressed: [2] })).item, true);
  assert.equal(TwoPlayer.readPad(pad({ pressed: [3] })).item, true);
  assert.equal(TwoPlayer.readPad(pad({ pressed: [9] })).pause, true);
  // A pad that reports fewer buttons or axes reads as nothing pressed.
  assert.deepEqual(TwoPlayer.readPad({ connected: true, axes: [], buttons: [] }), { throttle: 0, brake: 0, steer: 0, drift: false, item: false, pause: false });
  assert.deepEqual(TwoPlayer.readPad(null), { throttle: 0, brake: 0, steer: 0, drift: false, item: false, pause: false });
});

test("keys and pad together: whichever asks for more; the keys' steering wins when held", () => {
  const none = TwoPlayer.readPad(null);
  const keys = { throttle: false, brake: false, left: false, right: false, drift: false, item: false };
  assert.deepEqual(TwoPlayer.merge(keys, none), { throttle: 0, brake: 0, steer: 0, drift: false, item: false });
  assert.deepEqual(TwoPlayer.merge({ ...keys, throttle: true, right: true }, none), { throttle: 1, brake: 0, steer: 1, drift: false, item: false });
  assert.deepEqual(TwoPlayer.merge({ ...keys, left: true, right: true }, none).steer, 0);
  const stick = { ...none, steer: -0.4, throttle: 0.3, drift: true };
  assert.deepEqual(TwoPlayer.merge(keys, stick), { throttle: 0.3, brake: 0, steer: -0.4, drift: true, item: false });
  assert.equal(TwoPlayer.merge({ ...keys, right: true }, stick).steer, 1);
  assert.equal(TwoPlayer.merge({ ...keys, throttle: true }, stick).throttle, 1);
  assert.equal(TwoPlayer.merge({ ...keys, item: true }, none).item, true);
  // The single player's own keys (Space for the item) read the same way.
  assert.equal(TwoPlayer.merge({ throttle: true, space: true }, none).item, true);
});

test("the pads in play: connected ones, in the order the browser lists them", () => {
  const a = { id: "a", index: 0, connected: true };
  const b = { id: "b", index: 2, connected: true };
  const gone = { id: "c", index: 1, connected: false };
  assert.deepEqual(TwoPlayer.padsInOrder([null, a, gone, b]).map((p) => p.id), ["a", "b"]);
  assert.deepEqual(TwoPlayer.padsInOrder(undefined), []);
  assert.deepEqual(TwoPlayer.padsInOrder([]), []);
});

test("player 2's driver: Hamilton, or Leclerc when player 1 is Hamilton; never the same as player 1", () => {
  const ids = ["verstappen", "leclerc", "hamilton", "norris"];
  assert.equal(TwoPlayer.secondDriver(ids, "leclerc"), "hamilton");
  assert.equal(TwoPlayer.secondDriver(ids, "verstappen"), "hamilton");
  assert.equal(TwoPlayer.secondDriver(ids, "hamilton"), "leclerc");
  assert.equal(TwoPlayer.secondDriver(["a", "b"], "a"), "b");
  // Picking: round the list, skipping player 1's driver.
  assert.equal(TwoPlayer.stepDriver(ids, "hamilton", 1, "norris"), "verstappen");
  assert.equal(TwoPlayer.stepDriver(ids, "verstappen", 1, "leclerc"), "hamilton");
  assert.equal(TwoPlayer.stepDriver(ids, "verstappen", -1, "norris"), "hamilton");
  assert.equal(TwoPlayer.stepDriver(ids, "hamilton", -1, "leclerc"), "verstappen");
});

test("the CPU catch-up measures against the nearest human", () => {
  // Progress round the race: the CPU car at 1000; humans at 1300 and 900.
  assert.equal(TwoPlayer.nearestGap([1300, 900], 1000), -100);
  assert.equal(TwoPlayer.nearestGap([1300, 400], 1000), 300);
  assert.equal(TwoPlayer.nearestGap([1300], 1000), 300);
  assert.equal(TwoPlayer.nearestGap([], 1000), 0);
});
