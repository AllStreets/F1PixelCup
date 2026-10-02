const test = require("node:test");
const assert = require("node:assert/strict");
const Season = require("../season.js");
const Data = require("../game-data.js");

const FIELD = Data.DRIVERS.map((d) => d.id);
const TEAM_OF = Object.fromEntries(Data.DRIVERS.map((d) => [d.id, d.teamId]));
const TRACKS = ["albertpark", "shanghai", "suzuka"];
const fresh = () => Season.start({
  runId: "season-1", driverId: "leclerc", difficulty: "pro", gridMode: "back", weatherMode: "dry",
  trackIds: TRACKS, field: FIELD, teamOf: TEAM_OF,
});
// A finishing order with these drivers first, the rest in roster order.
const order = (...front) => [...front, ...FIELD.filter((id) => !front.includes(id))];

test("a new season: no races run, everyone on nothing", () => {
  const s = fresh();
  assert.equal(s.nextRace, 0);
  assert.equal(Season.isOver(s), false);
  const table = Season.driverStandings(s);
  assert.equal(table.length, 20);
  table.forEach((row) => assert.equal(row.points, 0));
  assert.equal(Season.constructorStandings(s).length, 10);
});

test("points as the cups score them: 25 down to 1, and one for the fastest lap in the top ten", () => {
  assert.deepEqual(Season.POINTS, [25, 18, 15, 12, 10, 8, 6, 4, 2, 1]);
  let s = Season.addRace(fresh(), { order: order("leclerc", "hamilton", "norris"), fastest: "hamilton" });
  const pts = Object.fromEntries(Season.driverStandings(s).map((r) => [r.driverId, r.points]));
  assert.equal(pts.leclerc, 25);
  assert.equal(pts.hamilton, 19);
  assert.equal(pts.norris, 15);
  // Eleventh with the fastest lap: no point.
  const eleventh = order("leclerc")[10];
  s = Season.addRace(s, { order: order("leclerc"), fastest: eleventh });
  assert.equal(Season.driverStandings(s).find((r) => r.driverId === eleventh).points, pts[eleventh] || 0);
  assert.equal(s.nextRace, 2);
});

test("addRace is pure and refuses a broken result", () => {
  const s = fresh();
  const after = Season.addRace(s, { order: order("leclerc"), fastest: null });
  assert.equal(s.nextRace, 0);
  assert.equal(after.nextRace, 1);
  assert.throws(() => Season.addRace(s, { order: order("leclerc").slice(1), fastest: null }), /every driver/);
  assert.throws(() => Season.addRace(s, { order: [...order("leclerc").slice(1), "leclerc", "leclerc"], fastest: null }), /every driver/);
  let done = s;
  TRACKS.forEach(() => { done = Season.addRace(done, { order: order("leclerc"), fastest: null }); });
  assert.equal(Season.isOver(done), true);
  assert.throws(() => Season.addRace(done, { order: order("leclerc"), fastest: null }), /over/);
});

test("drivers level on points are split on countback: most wins, then most seconds", () => {
  let s = fresh();
  s = Season.addRace(s, { order: order("leclerc", "hamilton"), fastest: null }); // LEC 25, HAM 18
  s = Season.addRace(s, { order: order("norris", "hamilton", "piastri", "russell", "verstappen", "antonelli", "alonso", "leclerc"), fastest: null }); // HAM 18 -> 36, LEC 4 -> 29
  const t = Season.driverStandings(s);
  const lec = t.find((r) => r.driverId === "leclerc");
  const ham = t.find((r) => r.driverId === "hamilton");
  assert.equal(ham.points, 36);
  assert.equal(lec.points, 29);
  // Two drivers on the same points: the one with a win is ahead.
  const tie = Season.compareCountback({ points: 25, finishes: [1, 20] }, { points: 25, finishes: [2, 9] });
  assert.ok(tie < 0);
  assert.ok(Season.compareCountback({ points: 18, finishes: [2] }, { points: 18, finishes: [3, 5] }) < 0);
  assert.ok(Season.compareCountback({ points: 20, finishes: [] }, { points: 30, finishes: [] }) > 0);
  // Hamilton 36; Norris 25 + 10 (fifth in the first race) = 35.
  assert.deepEqual(t.slice(0, 3).map((r) => [r.driverId, r.points]), [["hamilton", 36], ["norris", 35], ["leclerc", 29]]);
  // Positions are 1 to 20, in order.
  assert.deepEqual(t.map((r) => r.position), Array.from({ length: 20 }, (_, i) => i + 1));
  // Level on points in the table itself: Leclerc (a win, then nothing) ahead
  // of Norris (a third and a fifth), both on 25.
  let k = fresh();
  k = Season.addRace(k, { order: order("leclerc", "hamilton", "norris"), fastest: null });
  k = Season.addRace(k, { order: order("piastri", "russell", "antonelli", "alonso", "norris", "stroll", "gasly", "albon", "sainz", "bearman"), fastest: null });
  const lead = Season.driverStandings(k);
  const of = (id) => lead.find((r) => r.driverId === id);
  assert.equal(of("leclerc").points, 25);
  assert.equal(of("norris").points, 25);
  assert.ok(of("leclerc").position < of("norris").position);
  assert.equal(of("leclerc").wins, 1);
  assert.ok(Season.compareCountback({ points: 25, finishes: [1] }, { points: 25, finishes: [2, 9, 11] }) < 0);
});

test("constructors: both drivers' points together, the same countback", () => {
  let s = fresh();
  s = Season.addRace(s, { order: order("leclerc", "hamilton", "norris", "piastri"), fastest: "leclerc" });
  const c = Season.constructorStandings(s);
  assert.equal(c[0].teamId, "ferrari");
  assert.equal(c[0].points, 25 + 1 + 18);
  assert.equal(c[1].teamId, "mclaren");
  assert.equal(c[1].points, 15 + 12);
  assert.deepEqual(c[0].drivers.sort(), ["hamilton", "leclerc"]);
  // Every point is someone's: the tables add up to the same.
  const sum = (rows) => rows.reduce((a, r) => a + r.points, 0);
  assert.equal(sum(c), sum(Season.driverStandings(s)));
});

test("a saved season comes back exactly; a broken save is ignored, never half-loaded", () => {
  let s = fresh();
  s = Season.addRace(s, { order: order("leclerc", "hamilton"), fastest: "norris" });
  const text = Season.serialize(s);
  const back = Season.parse(text, { trackIds: TRACKS, field: FIELD, teamOf: TEAM_OF });
  assert.deepEqual(back, s);
  assert.deepEqual(Season.driverStandings(back), Season.driverStandings(s));
  const ctx = { trackIds: TRACKS, field: FIELD, teamOf: TEAM_OF };
  assert.equal(Season.parse("not json", ctx), null);
  assert.equal(Season.parse(null, ctx), null);
  const raw = JSON.parse(text);
  const broken = (fn) => { const copy = JSON.parse(text); fn(copy); return Season.parse(JSON.stringify(copy), ctx); };
  assert.equal(broken((x) => { x.version = 99; }), null);
  assert.equal(broken((x) => { x.results[0].order.pop(); }), null);
  assert.equal(broken((x) => { x.results[0].order[0] = "nobody"; }), null);
  assert.equal(broken((x) => { x.driverId = "nobody"; }), null);
  assert.equal(broken((x) => { x.trackIds = ["monza"]; }), null, "a season of other circuits");
  assert.equal(broken((x) => { x.results[0].fastest = "nobody"; }), null);
  assert.equal(broken((x) => { x.difficulty = "impossible"; }), null);
  assert.equal(broken((x) => { x.results = Array(9).fill(x.results[0]); }), null, "more races than the calendar");
  // A finished season is nothing to resume (its save should be gone).
  assert.equal(broken((x) => { x.results = Array(3).fill(x.results[0]); }), null, "a finished season");
  assert.ok(raw.runId);
});

test("resolveCup: the remembered cup by id, anything else the first cup", () => {
  const cups = [{ id: "openingCup" }, { id: "springCup" }, { id: "season" }];
  assert.equal(Season.resolveCup("springCup", cups), "springCup");
  assert.equal(Season.resolveCup("season", cups), "season");
  assert.equal(Season.resolveCup("trophyCup", cups), "openingCup");
  assert.equal(Season.resolveCup("1", cups), "openingCup");
  assert.equal(Season.resolveCup(null, cups), "openingCup");
});

test("the season scores exactly as the cups do (game.js POINTS_TABLE)", () => {
  const src = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "game.js"), "utf8");
  const table = JSON.parse(src.match(/^const POINTS_TABLE = (\[[^\]]*\]);/m)[1]);
  assert.deepEqual(table.filter((p) => p > 0), Season.POINTS);
});
