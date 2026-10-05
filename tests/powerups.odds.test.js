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
const STRONG = ["overtakeMode", "formationLap", "stewardPenalty", "safetyCar"];

test("the roster order runs common to rare", () => {
  assert.deepEqual(P.ITEM_ORDER, ["drs", "oilSlick", "debris", "undercut", "overtakeMode", "formationLap", "stewardPenalty", "safetyCar"]);
  // Common to rare is the order of the overall shares.
  const s = P.overallShares();
  for (let i = 1; i < P.ITEM_ORDER.length; i += 1) {
    assert.ok(s[P.ITEM_ORDER[i]] <= s[P.ITEM_ORDER[i - 1]], `${P.ITEM_ORDER[i]} is commoner than ${P.ITEM_ORDER[i - 1]}`);
  }
});

test("every column adds up to 100", () => {
  P.COLUMNS.forEach((col) => {
    const sum = P.ITEM_ORDER.reduce((s, id) => s + P.ODDS[col][id], 0);
    assert.equal(sum, 100, col);
  });
});

test("the odds table is the one in the spec", () => {
  assert.deepEqual(P.ODDS.lead, { drs: 10, oilSlick: 55, debris: 35, undercut: 0, overtakeMode: 0, formationLap: 0, stewardPenalty: 0, safetyCar: 0 });
  assert.deepEqual(P.ODDS.front, { drs: 15, oilSlick: 40, debris: 33, undercut: 12, overtakeMode: 0, formationLap: 0, stewardPenalty: 0, safetyCar: 0 });
  assert.deepEqual(P.ODDS.mid, { drs: 24, oilSlick: 25, debris: 15, undercut: 20, overtakeMode: 12, formationLap: 2, stewardPenalty: 2, safetyCar: 0 });
  assert.deepEqual(P.ODDS.back, { drs: 30, oilSlick: 5, debris: 8, undercut: 16, overtakeMode: 20, formationLap: 10, stewardPenalty: 6, safetyCar: 5 });
  assert.deepEqual(P.ODDS.tail, { drs: 33, oilSlick: 0, debris: 4, undercut: 12, overtakeMode: 24, formationLap: 16, stewardPenalty: 6, safetyCar: 5 });
});

test("columnFor uses the gap to the leader without a place", () => {
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

test("columnFor: the place counts too, whichever is further back", () => {
  // 20 cars: P2-P5 front, P6-P10 mid, P11-P15 back, P16-P20 tail (the
  // spread overallShares assumes).
  const col = (place, gap = 0) => P.columnFor(gap, place === 1, place, 20);
  assert.deepEqual([1, 2, 5, 6, 10, 11, 15, 16, 20].map((p) => col(p)),
    ["lead", "front", "front", "mid", "mid", "back", "back", "tail", "tail"]);
  // A bunched field: last, though close behind the leader, rolls from the tail.
  assert.equal(col(20, 0.02), "tail");
  // Strung out: P3 a third of a lap down rolls from the tail.
  assert.equal(col(3, 0.35), "tail");
  // Other field sizes scale (19 CPU cars and two players is 21).
  assert.equal(P.columnFor(0, false, 21, 21), "tail");
  assert.equal(P.columnFor(0, false, 3, 10), "mid");
  // The leader is the leader, whatever is asked.
  assert.equal(P.columnFor(0.5, true, 1, 20), "lead");
});

test("rollItem rolls from the place's column: last in a bunched field gets the strong items", () => {
  let tail = 0;
  const rng = mulberry32(99);
  for (let k = 0; k < 20000; k += 1) {
    if (STRONG.includes(P.rollItem({ gapFraction: 0.01, isLeader: false, place: 20, field: 20, ...LATE, rng }))) tail += 1;
  }
  // The tail column's strong share is 51 %.
  assert.ok(Math.abs(tail / 200 - 51) < 1.5, `${tail / 200}`);
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
  const expected = { drs: 25.25, oilSlick: 18.25, debris: 15.1, undercut: 14.4, overtakeMode: 14, formationLap: 7, stewardPenalty: 3.5, safetyCar: 2.5 };
  Object.entries(expected).forEach(([id, pct]) => assert.ok(Math.abs(s[id] - pct) < 1e-9, `${id} ${s[id]}`));
});

test("the stronger the item, the rarer it is", () => {
  const s = P.overallShares();
  const weak = P.ITEM_ORDER.filter((id) => !STRONG.includes(id));
  // Every strong item is rarer than every weak one.
  STRONG.forEach((strong) => weak.forEach((w) => assert.ok(s[strong] < s[w], `${strong} vs ${w}`)));
  // Overtake Mode is the commonest strong item, the Safety Car the rarest.
  ["formationLap", "stewardPenalty", "safetyCar"].forEach((id) => assert.ok(s[id] < s.overtakeMode, id));
  ["overtakeMode", "formationLap", "stewardPenalty"].forEach((id) => assert.ok(s.safetyCar < s[id], id));
});

test("rarity badges", () => {
  const s = P.overallShares();
  assert.equal(P.rarityFor(s.drs), "Common");
  assert.equal(P.rarityFor(s.oilSlick), "Common");
  assert.equal(P.rarityFor(s.debris), "Common");
  assert.equal(P.rarityFor(s.undercut), "Uncommon");
  assert.equal(P.rarityFor(s.overtakeMode), "Uncommon");
  assert.equal(P.rarityFor(s.formationLap), "Rare");
  assert.equal(P.rarityFor(s.stewardPenalty), "Very rare");
  assert.equal(P.rarityFor(s.safetyCar), "Very rare");
});
