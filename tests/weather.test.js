const test = require("node:test");
const assert = require("node:assert/strict");
const Weather = require("../weather.js");

const physics = { maxSpeed: 238, turnRate: 3.6 };

test("Dry and Wet are fixed; Changeable is seeded and wet about a third of the time", () => {
  assert.equal(Weather.raceWeather("dry", 123, 0), "dry");
  assert.equal(Weather.raceWeather("wet", 123, 4), "wet");
  assert.equal(Weather.raceWeather("changeable", 99, 2), Weather.raceWeather("changeable", 99, 2));
  let wet = 0;
  const n = 3000;
  for (let i = 0; i < n; i += 1) if (Weather.raceWeather("changeable", i * 7919, i % 5) === "wet") wet += 1;
  assert.ok(Math.abs(wet / n - Weather.RAIN_CHANCE) < 0.04, `wet share ${wet / n}`);
  // Anything unknown is dry.
  assert.equal(Weather.raceWeather("storm", 1, 1), "dry");
});

test("Changeable rains as often as the circuit does: its own chance, seeded", () => {
  const share = (chance) => {
    let wet = 0;
    for (let i = 0; i < 3000; i += 1) if (Weather.raceWeather("changeable", i * 7919, i % 5, chance) === "wet") wet += 1;
    return wet / 3000;
  };
  assert.equal(share(0), 0);
  assert.equal(share(1), 1);
  assert.ok(Math.abs(share(0.5) - 0.5) < 0.04, `Spa-like ${share(0.5)}`);
  assert.ok(share(0.02) < 0.04, `desert ${share(0.02)}`);
  // No chance given (or a broken one): the old one in three.
  assert.equal(Weather.raceWeather("changeable", 99, 2, undefined), Weather.raceWeather("changeable", 99, 2));
  assert.equal(Weather.raceWeather("changeable", 99, 2, "x"), Weather.raceWeather("changeable", 99, 2));
  // Wet and Dry ignore it.
  assert.equal(Weather.raceWeather("dry", 1, 1, 1), "dry");
  assert.equal(Weather.raceWeather("wet", 1, 1, 0), "wet");
});

test("grip is 1 in the dry and the wet factors are all losses", () => {
  assert.equal(Weather.grip("dry"), 1);
  assert.equal(Weather.grip("wet"), Weather.WET.corner);
  for (const key of ["corner", "accel", "brake", "offroad"]) assert.ok(Weather.WET[key] > 0 && Weather.WET[key] < 1, key);
  assert.ok(Weather.WET.oilSpin > 1);
});

test("the dry limit is the dry car's own hardest cornering at its speed", () => {
  // Full steer, drifting: turn rate x (0.45 + speed/180, capped at 1), plus the drift yaw.
  assert.ok(Math.abs(Weather.dryLimitAt(physics, 90) - 90 * (3.6 * (0.45 + 0.5) + 0.8)) < 1e-9);
  assert.ok(Math.abs(Weather.dryLimitAt(physics, 238) - 238 * (3.6 * 1.45 + 0.8)) < 1e-9);
  // Past 180 the turn rate stops growing; reversing counts its speed.
  assert.ok(Math.abs(Weather.dryLimitAt(physics, 300) - 300 * (3.6 * 1.45 + 0.8)) < 1e-9);
  assert.equal(Weather.dryLimitAt(physics, -50), Weather.dryLimitAt(physics, 50));
});

test("wet, the most a car can corner is the grip share of the dry at every speed", () => {
  for (const v of [60, 119, 178, 238]) {
    const dryMost = Weather.dryLimitAt(physics, v);
    const yaw = dryMost / v;
    const wet = Weather.capYaw(yaw, v, Weather.dryLimitAt(physics, v) * Weather.grip("wet"));
    assert.ok(Math.abs(wet * v / dryMost - Weather.WET.corner) < 1e-9, `at ${v}`);
    // A gentle corner asks for less than the wet limit: untouched.
    assert.equal(Weather.capYaw(yaw * 0.5, v, dryMost * Weather.grip("wet")), yaw * 0.5);
  }
});

test("capYaw leaves yaw under the limit alone, and caps it at limit / speed above it", () => {
  assert.equal(Weather.capYaw(1, 100, 500), 1);
  assert.equal(Weather.capYaw(-1, 100, 500), -1);
  assert.equal(Weather.capYaw(8, 100, 500), 5);
  assert.equal(Weather.capYaw(-8, 100, 500), -5);
  // Standing still or reversing slowly: nothing to cap.
  assert.equal(Weather.capYaw(3, 0, 500), 3);
  assert.equal(Weather.capYaw(3, -50, 100), 2);
});

test("a wet tyre sliding near its limit scrubs speed: none going straight, most at the limit", () => {
  assert.equal(Weather.scrub(0, 1000, 1 / 60), 1);
  const half = Weather.scrub(500, 1000, 1 / 60);
  const full = Weather.scrub(1000, 1000, 1 / 60);
  assert.ok(half < 1 && full < half);
  // Past the limit it scrubs no more than at it.
  assert.equal(Weather.scrub(3000, 1000, 1 / 60), full);
  // At the limit, a second of it costs WET.scrub of the speed (compounded).
  let v = 1;
  for (let i = 0; i < 60; i += 1) v *= Weather.scrub(1000, 1000, 1 / 60);
  assert.ok(Math.abs(v - Math.exp(-Weather.WET.scrub)) < 0.01);
});

test("a car standing still (no grip limit yet) keeps its speed: never NaN", () => {
  assert.equal(Weather.scrub(0, 0, 1 / 60), 1);
  assert.equal(Weather.scrub(5, 0, 1 / 60), 1);
  assert.ok(Number.isFinite(Weather.scrub(0, 1e-12, 1 / 60)));
});
