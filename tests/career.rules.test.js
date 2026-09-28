const test = require("node:test");
const assert = require("node:assert/strict");
const Career = require("../career.js");

test("raceAward scales F1 points by difficulty", () => {
  assert.deepEqual(Career.raceAward({ position: 1, fastestLap: false, difficulty: "rookie" }), { racePoints: 25, multiplier: 1, careerPoints: 25 });
  assert.deepEqual(Career.raceAward({ position: 3, fastestLap: false, difficulty: "pro" }), { racePoints: 15, multiplier: 2, careerPoints: 30 });
  assert.deepEqual(Career.raceAward({ position: 10, fastestLap: false, difficulty: "legend" }), { racePoints: 1, multiplier: 3, careerPoints: 3 });
  assert.deepEqual(Career.raceAward({ position: 11, fastestLap: false, difficulty: "legend" }), { racePoints: 0, multiplier: 3, careerPoints: 0 });
});

test("fastest lap adds a point only inside the top ten", () => {
  assert.equal(Career.raceAward({ position: 10, fastestLap: true, difficulty: "rookie" }).racePoints, 2);
  assert.equal(Career.raceAward({ position: 11, fastestLap: true, difficulty: "rookie" }).racePoints, 0);
  assert.equal(Career.raceAward({ position: 1, fastestLap: true, difficulty: "pro" }).careerPoints, 52);
});

test("cupAward gives 50/30/20 scaled by difficulty", () => {
  assert.deepEqual(Career.cupAward({ position: 1, difficulty: "pro" }), { bonus: 50, multiplier: 2, careerPoints: 100 });
  assert.deepEqual(Career.cupAward({ position: 2, difficulty: "legend" }), { bonus: 30, multiplier: 3, careerPoints: 90 });
  assert.deepEqual(Career.cupAward({ position: 3, difficulty: "rookie" }), { bonus: 20, multiplier: 1, careerPoints: 20 });
  assert.deepEqual(Career.cupAward({ position: 4, difficulty: "legend" }), { bonus: 0, multiplier: 3, careerPoints: 0 });
});

test("unknown difficulty is an error", () => {
  assert.throws(() => Career.raceAward({ position: 1, fastestLap: false, difficulty: "easy" }), /Unknown difficulty/);
});

test("rateRace matches the worked examples at 1200 with K = 40", () => {
  const at = (position, difficulty) => Career.rateRace({ rating: 1200, ratedRaces: 0, position, fieldSize: 20, difficulty }).delta;
  assert.equal(at(1, "legend"), 39);
  assert.equal(at(10, "legend"), 20);
  assert.equal(at(1, "pro"), 30);
  assert.equal(at(20, "pro"), -10);
  assert.equal(at(1, "rookie"), 10);
  assert.equal(at(20, "rookie"), -30);
});

test("rateRace uses K = 40 for the first 10 races, then 24", () => {
  const nine = Career.rateRace({ rating: 1200, ratedRaces: 9, position: 1, fieldSize: 20, difficulty: "pro" });
  const ten = Career.rateRace({ rating: 1200, ratedRaces: 10, position: 1, fieldSize: 20, difficulty: "pro" });
  assert.equal(nine.k, 40);
  assert.equal(ten.k, 24);
  assert.equal(ten.delta, 18);
  assert.equal(ten.after, 1218);
  assert.equal(ten.before, 1200);
});

test("rateRace handles a field of one and clamps position", () => {
  const solo = Career.rateRace({ rating: 1200, ratedRaces: 0, position: 1, fieldSize: 1, difficulty: "pro" });
  assert.equal(solo.actual, 1);
  assert.ok(Number.isFinite(solo.after));
  const beyond = Career.rateRace({ rating: 1200, ratedRaces: 0, position: 25, fieldSize: 20, difficulty: "pro" });
  assert.equal(beyond.actual, 0);
  const before = Career.rateRace({ rating: 1200, ratedRaces: 0, position: 0, fieldSize: 20, difficulty: "pro" });
  assert.equal(before.actual, 1);
});

test("tierFor uses the spec boundaries", () => {
  assert.equal(Career.tierFor(1099), "Karting");
  assert.equal(Career.tierFor(1100), "F4");
  assert.equal(Career.tierFor(1299), "F4");
  assert.equal(Career.tierFor(1300), "F3");
  assert.equal(Career.tierFor(1500), "F2");
  assert.equal(Career.tierFor(1700), "F1");
  assert.equal(Career.tierFor(1849), "F1");
  assert.equal(Career.tierFor(1850), "World Champion");
  assert.equal(Career.tierFor(400), "Karting");
});
