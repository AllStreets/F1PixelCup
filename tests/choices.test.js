const test = require("node:test");
const assert = require("node:assert/strict");
const Choices = require("../choices.js");
const Data = require("../game-data.js");

const POOL = Data.CIRCUITS.map((c) => c.id);
// A pool larger than the 2025 calendar, as the historical circuits will make it.
const BIG = Array.from({ length: 40 }, (_, i) => `circuit${i}`);

test("the choices: cup, season, random cup, custom cup, single race", () => {
  assert.deepEqual(Choices.MODES, ["cup", "season", "random", "custom", "single"]);
  assert.equal(Choices.CUP_SIZE, 4);
  assert.deepEqual(Object.values(Choices.KINDS).map((k) => k.id), ["randomCup", "customCup", "singleRace"]);
  // None of them is a calendar cup or the season.
  Object.values(Choices.KINDS).forEach((k) => {
    assert.ok(!Data.CUP_DEFS.some((c) => c.id === k.id) && k.id !== Data.SEASON.id);
    assert.ok(k.name);
  });
});

test("a draw: four circuits from the pool, no repeats", () => {
  for (let seed = 1; seed < 400; seed += 7) {
    const ids = Choices.draw(POOL, 4, seed);
    assert.equal(ids.length, 4);
    assert.equal(new Set(ids).size, 4, `repeat with seed ${seed}: ${ids}`);
    ids.forEach((id) => assert.ok(POOL.includes(id)));
  }
});

test("a draw is seeded: the same seed, the same circuits in the same order", () => {
  assert.deepEqual(Choices.draw(POOL, 4, 12345), Choices.draw(POOL, 4, 12345));
  assert.notDeepEqual(Choices.draw(POOL, 4, 12345), Choices.draw(POOL, 4, 12346));
  // The pool given is never changed.
  const copy = [...POOL];
  Choices.draw(copy, 4, 9);
  assert.deepEqual(copy, POOL);
});

test("every circuit can be drawn, at every place, and the draw spreads evenly", () => {
  const counts = Object.fromEntries(POOL.map((id) => [id, 0]));
  const first = new Set();
  for (let seed = 0; seed < 6000; seed += 1) {
    const ids = Choices.draw(POOL, 4, seed);
    ids.forEach((id) => { counts[id] += 1; });
    first.add(ids[0]);
  }
  assert.equal(first.size, POOL.length);
  const expected = (6000 * 4) / POOL.length;
  Object.entries(counts).forEach(([id, n]) => assert.ok(n > expected * 0.8 && n < expected * 1.2, `${id}: ${n} of ~${expected}`));
});

test("the draw takes every circuit there is: nothing assumes 24", () => {
  const seen = new Set();
  for (let seed = 0; seed < 2000; seed += 1) Choices.draw(BIG, 4, seed).forEach((id) => seen.add(id));
  assert.equal(seen.size, 40);
  // More asked for than there are: the whole pool, shuffled, still no repeats.
  const all = Choices.draw(["a", "b", "c"], 4, 5);
  assert.deepEqual([...all].sort(), ["a", "b", "c"]);
  assert.deepEqual(Choices.draw([], 4, 5), []);
  // A single race is a draw of one.
  assert.equal(Choices.draw(POOL, 1, 77).length, 1);
});

test("seeds are 32-bit, and any seed draws", () => {
  assert.deepEqual(Choices.draw(POOL, 4, 2 ** 32 + 5), Choices.draw(POOL, 4, 5));
  assert.equal(Choices.draw(POOL, 4, -1).length, 4);
  assert.equal(Choices.draw(POOL, 4, "abc").length, 4);
  const next = Choices.nextSeed(5);
  assert.ok(Number.isInteger(next) && next >= 0 && next < 2 ** 32 && next !== 5);
});

test("a reroll: another draw, never the one on screen, and deterministic", () => {
  for (let seed = 1; seed < 200; seed += 3) {
    const current = Choices.draw(POOL, 4, seed);
    const r = Choices.reroll(POOL, 4, seed, current);
    assert.notDeepEqual(r.ids, current);
    assert.equal(r.same, false);
    assert.deepEqual(r.ids, Choices.draw(POOL, 4, r.seed));
    assert.notEqual(r.seed, seed);
    assert.deepEqual(Choices.reroll(POOL, 4, seed, current), r);
    // Rerolled again, it moves on again.
    const again = Choices.reroll(POOL, 4, r.seed, r.ids);
    assert.notDeepEqual(again.ids, r.ids);
  }
  // A single race reroll: another circuit.
  const one = Choices.draw(POOL, 1, 3);
  assert.notDeepEqual(Choices.reroll(POOL, 1, 3, one).ids, one);
});

test("a reroll with nothing else to draw says so", () => {
  const r = Choices.reroll(["monza"], 1, 3, ["monza"]);
  assert.deepEqual(r.ids, ["monza"]);
  assert.equal(r.same, true);
  // Two circuits for a cup of two: the other order is another draw.
  const two = Choices.draw(["a", "b"], 2, 1);
  const r2 = Choices.reroll(["a", "b"], 2, 1, two);
  assert.deepEqual(r2.ids, [...two].reverse());
});

test("a custom cup: exactly four known circuits, no repeats", () => {
  assert.deepEqual(Choices.validateCustom(["monaco", "spa", "monza", "suzuka"], POOL), { ok: true, reason: null });
  assert.equal(Choices.validateCustom(["monaco", "spa", "monza"], POOL).reason, "count");
  assert.equal(Choices.validateCustom([], POOL).reason, "count");
  assert.equal(Choices.validateCustom(["monaco", "spa", "monza", "suzuka", "bahrain"], POOL).reason, "count");
  assert.equal(Choices.validateCustom(["monaco", "spa", "monza", "monaco"], POOL).reason, "repeat");
  assert.equal(Choices.validateCustom(["monaco", "spa", "monza", "brands"], POOL).reason, "unknown");
  assert.equal(Choices.validateCustom("monaco", POOL).reason, "count");
  assert.equal(Choices.validateCustom(null, POOL).reason, "count");
  // Any order is allowed: the order given is the order raced.
  assert.equal(Choices.validateCustom(["suzuka", "monza", "spa", "monaco"], POOL).ok, true);
  // Any circuit in the pool, whatever the pool.
  assert.equal(Choices.validateCustom(["circuit39", "circuit0", "circuit25", "circuit30"], BIG).ok, true);
  assert.equal(Choices.validateCustom(["a", "b"], ["a", "b", "c"], 2).ok, true);
});

test("a stored custom cup is read safely: bad text, unknown ids and repeats dropped", () => {
  assert.deepEqual(Choices.parseCustom(JSON.stringify(["spa", "monza"]), POOL), ["spa", "monza"]);
  assert.deepEqual(Choices.parseCustom("not json", POOL), []);
  assert.deepEqual(Choices.parseCustom(null, POOL), []);
  assert.deepEqual(Choices.parseCustom(JSON.stringify({ a: 1 }), POOL), []);
  assert.deepEqual(Choices.parseCustom(JSON.stringify(["spa", "gone", "spa", 4, "monaco"]), POOL), ["spa", "monaco"]);
  assert.deepEqual(Choices.parseCustom(JSON.stringify(["spa", "monza", "monaco", "suzuka", "bahrain"]), POOL), ["spa", "monza", "monaco", "suzuka"]);
});

test("the picker's edits: toggle in and out, never a fifth, never a repeat", () => {
  let ids = [];
  ["spa", "monza", "monaco", "suzuka"].forEach((id) => { ids = Choices.toggle(ids, id, 4); });
  assert.deepEqual(ids, ["spa", "monza", "monaco", "suzuka"]);
  const before = ids;
  assert.deepEqual(Choices.toggle(ids, "bahrain", 4), ids);
  assert.deepEqual(before, ["spa", "monza", "monaco", "suzuka"]);
  assert.deepEqual(Choices.toggle(ids, "monza", 4), ["spa", "monaco", "suzuka"]);
  assert.deepEqual(Choices.toggle(["spa"], "spa", 4), []);
});

test("the picker's order: move earlier or later, off the ends it stays", () => {
  const ids = ["spa", "monza", "monaco", "suzuka"];
  assert.deepEqual(Choices.move(ids, 1, -1), ["monza", "spa", "monaco", "suzuka"]);
  assert.deepEqual(Choices.move(ids, 1, 1), ["spa", "monaco", "monza", "suzuka"]);
  assert.deepEqual(Choices.move(ids, 0, -1), ids);
  assert.deepEqual(Choices.move(ids, 3, 1), ids);
  assert.deepEqual(Choices.move(ids, 9, 1), ids);
  assert.deepEqual(Choices.move(ids, NaN, 1), ids);
  assert.deepEqual(Choices.move(ids, 1.5, 1), ids);
  assert.deepEqual(Choices.move(ids, "1", 1), ids);
  assert.deepEqual(ids, ["spa", "monza", "monaco", "suzuka"]);
});

test("search: name, short name, places, country, theme and id, any case, accents or none", () => {
  const find = (q) => Choices.search(Data.CIRCUITS, q).map((c) => c.id);
  assert.equal(find("").length, Data.CIRCUITS.length);
  assert.equal(find("   ").length, Data.CIRCUITS.length);
  // Spa first (its id), then Spain's Barcelona: the best match leads.
  assert.deepEqual(find("SPA"), ["spa", "barcelona"]);
  assert.deepEqual(find("francorchamps"), ["spa"]);
  assert.deepEqual(find("japan"), ["suzuka"]);
  // (The historic circuits are in the pool too: Mugello is in Italy, Watkins Glen in the USA.)
  assert.deepEqual(find("italy").sort(), ["imola", "monza", "mugello"]);
  assert.deepEqual(find("jose"), ["interlagos"]);
  assert.deepEqual(find("José"), ["interlagos"]);
  assert.deepEqual(find("rodriguez"), ["mexico"]);
  assert.ok(find("united states").length === 4);
  assert.deepEqual(find("cota"), ["cota"]);
  // The name the place goes by, too.
  assert.deepEqual(find("austin"), ["cota"]);
  assert.deepEqual(find("montreal"), ["montreal"]);
  // And the places the races are named for (the spec: "Sao Paulo" finds Interlagos).
  assert.deepEqual(find("Sao Paulo"), ["interlagos"]);
  assert.deepEqual(find("abu dhabi"), ["yasmarina"]);
  assert.deepEqual(find("melbourne"), ["albertpark"]);
  // Whole words or their starts, never the middle of a word: USA is not
  // Lusail, UK is not Suzuka.
  assert.deepEqual(find("usa").sort(), ["cota", "lasvegas", "miami", "watkinsglen"]);
  assert.deepEqual(find("uk"), ["silverstone"]);
  assert.deepEqual(find("rodr"), ["mexico"]);
  assert.ok(find("night").includes("singapore"));
  assert.deepEqual(find("brands hatch"), []);
  // The historic circuits are found too, accents or none.
  assert.deepEqual(find("nurburgring"), ["nurburgring"]);
  assert.deepEqual(find("Nürburgring"), ["nurburgring"]);
  assert.deepEqual(find("glen"), ["watkinsglen"]);
  // Every word must match somewhere.
  assert.deepEqual(find("street monaco"), ["monaco"]);
});

test("the remembered choice: a stored mode, else the stored cup's, else a cup", () => {
  assert.equal(Choices.resolveMode("random", "openingCup", "season"), "random");
  assert.equal(Choices.resolveMode("single", null, "season"), "single");
  assert.equal(Choices.resolveMode(null, "season", "season"), "season");
  assert.equal(Choices.resolveMode(null, "springCup", "season"), "cup");
  assert.equal(Choices.resolveMode("bogus", "season", "season"), "season");
  assert.equal(Choices.resolveMode(undefined, undefined, "season"), "cup");
});

test("the remembered single race and draws are read safely", () => {
  assert.deepEqual(Choices.parseSingle(JSON.stringify({ pick: "chosen", circuitId: "monaco" }), POOL), { pick: "chosen", circuitId: "monaco" });
  assert.deepEqual(Choices.parseSingle(JSON.stringify({ pick: "chosen", circuitId: "gone" }), POOL), { pick: "chosen", circuitId: null });
  assert.deepEqual(Choices.parseSingle(JSON.stringify({ pick: "bogus" }), POOL), { pick: "random", circuitId: null });
  assert.deepEqual(Choices.parseSingle("{", POOL), { pick: "random", circuitId: null });
  assert.deepEqual(Choices.parseDraw(JSON.stringify({ cup: 7, single: 9 })), { cup: 7, single: 9 });
  assert.deepEqual(Choices.parseDraw(JSON.stringify({ cup: "x", single: 2 ** 40 })), { cup: null, single: null });
  assert.deepEqual(Choices.parseDraw("nope"), { cup: null, single: null });
});
