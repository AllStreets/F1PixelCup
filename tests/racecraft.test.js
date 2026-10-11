const test = require("node:test");
const assert = require("node:assert/strict");
const Racecraft = require("../racecraft.js");
const Weather = require("../weather.js");

const physics = { maxSpeed: 238, turnRate: 3.6, brakeRate: 150 };
// The yaw full steer gives at speed v (game.js).
const turnAt = (v) => physics.turnRate * (0.45 + Math.min(Math.max(v / 180, 0.2), 1));

test("curvature: a straight is 0, a circle of radius R is 1/R, smoothed over the window", () => {
  const straight = Racecraft.curvatureFromHeadings(new Array(50).fill(0.3), 8, 2);
  assert.ok(straight.every((k) => Math.abs(k) < 1e-12));
  // A lap is a loop: a circle of 160 samples 8 apart has radius 8 x 160 / 2pi,
  // and its headings wrap past +-pi on the way round.
  const n = 160;
  const radius = (8 * n) / (2 * Math.PI);
  const circle = Array.from({ length: n }, (_, i) => ((i * 2 * Math.PI) / n + Math.PI) % (2 * Math.PI) - Math.PI);
  const k = Racecraft.curvatureFromHeadings(circle, 8, 3);
  assert.ok(k.every((v) => Math.abs(v - 1 / radius) < 1e-9));
  // One sharp kink spreads over the window (a car cuts the corner).
  const kink = new Array(40).fill(0).map((_, i) => (i >= 20 ? 0.8 : 0));
  const kk = Racecraft.curvatureFromHeadings(kink, 8, 2);
  assert.ok(Math.max(...kk) < 0.8 / 8 && Math.max(...kk) > 0);
});

test("corner speed: the fastest the car can take a curve with full steer, times the margin", () => {
  // A straight has no limit; a gentle curve's limit is its own, not the
  // car's top speed (a car on a pace edge may run past its top speed).
  assert.equal(Racecraft.cornerSpeed(physics, 0, { margin: 1 }), Infinity);
  const gentle = Racecraft.cornerSpeed(physics, 0.0001, { margin: 1 });
  assert.ok(gentle > physics.maxSpeed * 10);
  assert.ok(Math.abs(gentle * 0.0001 - turnAt(gentle)) < 1e-9);
  // A tight curve: the speed at which full steer just holds it.
  const k = 1 / 30;
  const v = Racecraft.cornerSpeed(physics, k, { margin: 1 });
  assert.ok(v < physics.maxSpeed);
  assert.ok(Math.abs(v * k - turnAt(v)) < 0.02, `yaw needed ${v * k} vs ${turnAt(v)}`);
  // A smaller margin is slower through the same curve.
  assert.ok(Racecraft.cornerSpeed(physics, k, { margin: 0.8 }) < v);
});

test("wet, the corner speed respects the grip cap on yaw", () => {
  // Tight enough that the wet cap, not the steering, sets the speed.
  const k = 1 / 45;
  const dry = Racecraft.cornerSpeed(physics, k, { margin: 1 });
  const wet = Racecraft.cornerSpeed(physics, k, { margin: 1, grip: Weather.WET.corner });
  assert.ok(wet < dry);
  // At the wet speed, the yaw needed fits under the wet cap.
  const cap = Weather.WET.corner * Weather.dryLimitAt(physics, wet) / wet;
  assert.ok(wet * k <= Math.min(turnAt(wet), cap) + 0.02);
});

test("brake when a corner ahead can't be reached at its speed with the brakes the car has", () => {
  const decel = 150;
  // A slow corner 400 ahead, at 238: 238^2 - 80^2 needs (238^2 - 80^2)/300 = 167 to slow -- room enough.
  assert.equal(Racecraft.mustBrake(238, [{ at: 400, speed: 80 }], decel), false);
  // The same corner 120 ahead: not enough room.
  assert.equal(Racecraft.mustBrake(238, [{ at: 120, speed: 80 }], decel), true);
  // Already slow enough: no.
  assert.equal(Racecraft.mustBrake(70, [{ at: 10, speed: 80 }], decel), false);
});

test("the tow: closest in a car's wake is the strongest, nothing out of it", () => {
  const T = Racecraft.TOW;
  // Right in the wake (as close as a car can follow): the full tow.
  assert.equal(Racecraft.towShare(T.from, 0), 1);
  // It fades with the gap and is gone at its reach.
  const mid = Racecraft.towShare((T.from + T.reach) / 2, 0);
  assert.ok(Math.abs(mid - 0.5) < 1e-9, `${mid}`);
  assert.equal(Racecraft.towShare(T.reach, 0), 0);
  assert.equal(Racecraft.towShare(T.reach + 1, 0), 0);
  // Too close is a car you are touching, not a tow; behind it is no tow either.
  assert.equal(Racecraft.towShare(T.from - 1, 0), 0);
  assert.equal(Racecraft.towShare(-40, 0), 0);
  // Out of the wake to either side: none.
  assert.ok(Racecraft.towShare(40, T.width) > 0);
  assert.equal(Racecraft.towShare(40, T.width + 0.5), 0);
  assert.equal(Racecraft.towShare(40, -(T.width + 0.5)), 0);
  // A tow is worth a few per cent of top speed, never a boost item's worth.
  assert.ok(T.speed > 0.03 && T.speed < 0.12, `${T.speed}`);
  assert.ok(T.drag > 0 && T.drag < 0.008, `${T.drag}`);
});

test("the rubber band only slows CPU cars well ahead of the player, never those near or behind", () => {
  const R = Racecraft.RUBBER_BAND;
  // Behind the player, beside them, or just ahead: untouched.
  [-2000, -10, 0, R.near].forEach((ahead) => assert.equal(Racecraft.rubberBand(ahead, 0.12), 1, `${ahead}`));
  // Further ahead it eases off gradually, up to the full strength.
  const half = Racecraft.rubberBand(R.near + R.span / 2, 0.12);
  assert.ok(Math.abs(half - 0.94) < 1e-9, `${half}`);
  assert.ok(Math.abs(Racecraft.rubberBand(R.near + R.span, 0.12) - 0.88) < 1e-9);
  assert.ok(Math.abs(Racecraft.rubberBand(R.near + R.span * 5, 0.12) - 0.88) < 1e-9);
  // No strength, no band.
  assert.equal(Racecraft.rubberBand(5000, 0), 1);
});
