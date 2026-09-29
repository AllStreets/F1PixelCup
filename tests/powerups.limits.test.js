const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("../powerups.js");

// An rng that always lands on the given item in the given column.
function rngFor(col, id) {
  let before = 0;
  for (const other of P.ITEM_ORDER) {
    if (other === id) break;
    before += P.ODDS[col][other];
  }
  const mid = (before + P.ODDS[col][id] / 2) / 100;
  return () => mid;
}

const base = { gapFraction: 0.5, isLeader: false, lastSafetyCarAt: null, stewardInFlight: false };

test("strong items are held back for the first 15 seconds", () => {
  ["stewardPenalty", "formationLap", "safetyCar"].forEach((id) => {
    const got = P.rollItem({ ...base, raceTime: 14.9, rng: rngFor("tail", id) });
    assert.ok(!["stewardPenalty", "formationLap", "safetyCar"].includes(got), `${id} -> ${got}`);
    assert.equal(P.rollItem({ ...base, raceTime: 40, rng: rngFor("tail", id) }), id);
  });
});

test("a blocked roll moves to the next allowed item in that column, wrapping to the top", () => {
  // safetyCar is last in the order, so a blocked one wraps to oilSlick (5% in tail).
  assert.equal(P.rollItem({ ...base, raceTime: 10, rng: rngFor("tail", "safetyCar") }), "oilSlick");
  // stewardPenalty blocked early -> formationLap blocked early -> safetyCar blocked -> oilSlick.
  assert.equal(P.rollItem({ ...base, raceTime: 10, rng: rngFor("tail", "stewardPenalty") }), "oilSlick");
  // In flight: stewardPenalty -> formationLap once the time gate has passed.
  assert.equal(P.rollItem({ ...base, raceTime: 60, stewardInFlight: true, rng: rngFor("tail", "stewardPenalty") }), "formationLap");
});

test("no safety car before 20 seconds or within 30 seconds of the last", () => {
  const sc = rngFor("tail", "safetyCar");
  assert.notEqual(P.rollItem({ ...base, raceTime: 19.9, rng: sc }), "safetyCar");
  assert.equal(P.rollItem({ ...base, raceTime: 20, rng: sc }), "safetyCar");
  assert.notEqual(P.rollItem({ ...base, raceTime: 49.9, lastSafetyCarAt: 20, rng: sc }), "safetyCar");
  assert.equal(P.rollItem({ ...base, raceTime: 50, lastSafetyCarAt: 20, rng: sc }), "safetyCar");
});

test("only one steward penalty in flight", () => {
  assert.equal(P.isBlocked("stewardPenalty", { raceTime: 60, lastSafetyCarAt: null, stewardInFlight: true }), true);
  assert.equal(P.isBlocked("stewardPenalty", { raceTime: 60, lastSafetyCarAt: null, stewardInFlight: false }), false);
});

test("a roll always returns an item, whatever the rng returns", () => {
  [0, 0.5, 0.999999, 1].forEach((r) => {
    P.COLUMNS.forEach((col) => {
      const got = P.rollItem({ ...base, gapFraction: { lead: 0, front: 0.01, mid: 0.1, back: 0.2, tail: 0.9 }[col], isLeader: col === "lead", raceTime: 0, rng: () => r });
      assert.ok(P.ITEM_ORDER.includes(got), `${col} ${r} -> ${got}`);
      assert.ok(P.ODDS[col][got] > 0, `${col} ${r} -> ${got} has zero odds`);
    });
  });
});
