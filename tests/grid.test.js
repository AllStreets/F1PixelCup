const test = require("node:test");
const assert = require("node:assert/strict");
const Grid = require("../grid.js");

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const AI = ["a", "b", "c", "d", "e"];

test("from the back: the player lines up last", () => {
  const order = Grid.gridFromBack({ playerId: "me", aiIds: AI, standings: {}, rng: seeded(1) });
  assert.equal(order.length, 6);
  assert.equal(order[order.length - 1], "me");
  assert.deepEqual([...order.slice(0, 5)].sort(), [...AI].sort());
});

test("from the back, first race: the CPU order is drawn, and the draw follows the rng", () => {
  const one = Grid.gridFromBack({ playerId: "me", aiIds: AI, standings: {}, rng: seeded(1) });
  const same = Grid.gridFromBack({ playerId: "me", aiIds: AI, standings: {}, rng: seeded(1) });
  const other = Grid.gridFromBack({ playerId: "me", aiIds: AI, standings: {}, rng: seeded(99) });
  assert.deepEqual(one, same);
  assert.notDeepEqual(one, other);
});

test("from the back, later races: the CPU cars line up by cup standings, leader on pole", () => {
  const standings = { a: 10, b: 43, c: 25, d: 0, e: 25 };
  const order = Grid.gridFromBack({ playerId: "me", aiIds: AI, standings, rng: seeded(3) });
  assert.equal(order[0], "b");
  assert.deepEqual(new Set(order.slice(1, 3)), new Set(["c", "e"]));
  assert.equal(order[3], "a");
  assert.equal(order[4], "d");
  assert.equal(order[5], "me");
});

test("qualifying: the grid is the times in order; a missing or bad time goes to the back", () => {
  const order = Grid.gridFromQualifying([
    { id: "a", timeMs: 35120.4 },
    { id: "b", timeMs: 34998.1 },
    { id: "c", timeMs: null },
    { id: "d", timeMs: 35120.3 },
    { id: "e", timeMs: NaN },
  ]);
  assert.deepEqual(order, ["b", "d", "a", "c", "e"]);
});

test("qualifying delta at a timing point", () => {
  assert.equal(Grid.qualifyingDelta([100, 1100, 2200], [100, 1000, 2050], 2), 150);
  assert.equal(Grid.qualifyingDelta([100, 1100], [100], 1), null);
  assert.equal(Grid.qualifyingDelta([100], [100, 900], 3), null);
});
