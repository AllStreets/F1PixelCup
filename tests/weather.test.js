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

test("grip is 1 in the dry and the wet factors are all losses", () => {
  assert.equal(Weather.grip("dry"), 1);
  assert.equal(Weather.grip("wet"), Weather.WET.corner);
  for (const key of ["corner", "accel", "brake", "offroad"]) assert.ok(Weather.WET[key] > 0 && Weather.WET[key] < 1, key);
  assert.ok(Weather.WET.oilSpin > 1);
});

test("the dry limit is at least anything the car can do, so the dry is unchanged", () => {
  const limit = Weather.dryLimit(physics);
  // Full steer at top speed (turn rate at speed is up to 1.45x), plus the drift yaw.
  const most = physics.maxSpeed * (physics.turnRate * 1.45 + Weather.DRIFT_YAW);
  assert.ok(limit >= most);
  assert.equal(Weather.capYaw(physics.turnRate * 1.45 + Weather.DRIFT_YAW, physics.maxSpeed, limit), physics.turnRate * 1.45 + Weather.DRIFT_YAW);
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

test("CPU drivers lift for corners at a speed scaled by the square root of grip", () => {
  assert.equal(Weather.cornerSpeedScale("dry"), 1);
  assert.ok(Math.abs(Weather.cornerSpeedScale("wet") - Math.sqrt(Weather.WET.corner)) < 1e-9);
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
