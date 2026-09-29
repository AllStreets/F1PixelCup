const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("../powerups.js");

// Small seeded generator so the 200,000-roll tests are repeatable.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LATE = { raceTime: 600, lastSafetyCarAt: null, stewardInFlight: false };
const GAP_FOR = { lead: 0, front: 0.03, mid: 0.1, back: 0.2, tail: 0.5 };

test("the roster order runs common to rare", () => {
  assert.deepEqual(P.ITEM_ORDER, ["oilSlick", "debris", "drs", "undercut", "overtakeMode", "stewardPenalty", "formationLap", "safetyCar"]);
});

test("every column adds up to 100", () => {
  P.COLUMNS.forEach((col) => {
    const sum = P.ITEM_ORDER.reduce((s, id) => s + P.ODDS[col][id], 0);
    assert.equal(sum, 100, col);
  });
});

test("the odds table is the one in the spec", () => {
  assert.deepEqual(P.ODDS.lead, { oilSlick: 55, debris: 35, drs: 10, undercut: 0, overtakeMode: 0, stewardPenalty: 0, formationLap: 0, safetyCar: 0 });
  assert.deepEqual(P.ODDS.front, { oilSlick: 35, debris: 30, drs: 15, undercut: 20, overtakeMode: 0, stewardPenalty: 0, formationLap: 0, safetyCar: 0 });
  assert.deepEqual(P.ODDS.mid, { oilSlick: 20, debris: 20, drs: 20, undercut: 25, overtakeMode: 10, stewardPenalty: 5, formationLap: 0, safetyCar: 0 });
  assert.deepEqual(P.ODDS.back, { oilSlick: 10, debris: 10, drs: 20, undercut: 15, overtakeMode: 18, stewardPenalty: 12, formationLap: 10, safetyCar: 5 });
  assert.deepEqual(P.ODDS.tail, { oilSlick: 5, debris: 5, drs: 20, undercut: 10, overtakeMode: 20, stewardPenalty: 13, formationLap: 18, safetyCar: 9 });
});

test("columnFor uses the gap to the leader, not the place", () => {
  assert.equal(P.columnFor(0, true), "lead");
  assert.equal(P.columnFor(0, false), "front");
  assert.equal(P.columnFor(0.0599, false), "front");
  assert.equal(P.columnFor(0.06, false), "mid");
  assert.equal(P.columnFor(0.1599, false), "mid");
  assert.equal(P.columnFor(0.16, false), "back");
  assert.equal(P.columnFor(0.2999, false), "back");
  assert.equal(P.columnFor(0.3, false), "tail");
  assert.equal(P.columnFor(4, false), "tail");
  assert.equal(P.columnFor(-0.2, false), "front");
});

test("200,000 rolls per column land within one point of the table", () => {
  P.COLUMNS.forEach((col, i) => {
    const rng = mulberry32(1234 + i);
    const counts = Object.fromEntries(P.ITEM_ORDER.map((id) => [id, 0]));
    const n = 200000;
    for (let k = 0; k < n; k += 1) {
      counts[P.rollItem({ gapFraction: GAP_FOR[col], isLeader: col === "lead", ...LATE, rng })] += 1;
    }
    P.ITEM_ORDER.forEach((id) => {
      const pct = (counts[id] / n) * 100;
      assert.ok(Math.abs(pct - P.ODDS[col][id]) <= 1, `${col}/${id}: ${pct.toFixed(2)} vs ${P.ODDS[col][id]}`);
    });
  });
});

test("overall shares for a typical 20-car spread match the spec", () => {
  const s = P.overallShares();
  const expected = { oilSlick: 18.5, drs: 18.5, debris: 16.5, undercut: 16.5, overtakeMode: 12, stewardPenalty: 7.5, formationLap: 7, safetyCar: 3.5 };
  Object.entries(expected).forEach(([id, pct]) => assert.ok(Math.abs(s[id] - pct) < 1e-9, `${id} ${s[id]}`));
});

test("the stronger the item, the rarer it is", () => {
  const s = P.overallShares();
  const byStrength = ["oilSlick", "drs", "debris", "undercut", "overtakeMode", "stewardPenalty", "formationLap", "safetyCar"];
  for (let i = 1; i < byStrength.length; i += 1) {
    assert.ok(s[byStrength[i]] <= s[byStrength[i - 1]], `${byStrength[i]} should not beat ${byStrength[i - 1]}`);
  }
});

test("rarity badges", () => {
  const s = P.overallShares();
  assert.equal(P.rarityFor(s.oilSlick), "Common");
  assert.equal(P.rarityFor(s.undercut), "Common");
  assert.equal(P.rarityFor(s.overtakeMode), "Uncommon");
  assert.equal(P.rarityFor(s.stewardPenalty), "Rare");
  assert.equal(P.rarityFor(s.formationLap), "Rare");
  assert.equal(P.rarityFor(s.safetyCar), "Very rare");
});
