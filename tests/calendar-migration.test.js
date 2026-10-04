// The two old cups became the calendar cups
// (docs/superpowers/specs/2026-10-01-calendar-design.md, section 2). A
// regression guard: careers are keyed by circuit and driver, never by cup, so
// a career saved in the old cups must keep loading exactly as it was and go on
// counting in the new ones.
const test = require("node:test");
const assert = require("node:assert/strict");
const Career = require("../career.js");
const Season = require("../season.js");
const Data = require("../game-data.js");

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => (Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null),
    setItem: (key, value) => { data[key] = String(value); },
    removeItem: (key) => { delete data[key]; },
  };
}
const clock = () => new Date("2026-09-30T12:00:00.000Z");
let n = 0;
const uuid = () => `id-${(n += 1)}`;

const OLD_CUPS = { trophyCup: ["monza", "spa", "silverstone", "suzuka"], constructorCup: ["monaco", "singapore", "bahrain", "interlagos"] };

// A career saved before the calendar: both old cups raced in full, Leclerc
// and Hamilton, a best lap at every one of the eight circuits.
function savedBeforeTheCalendar() {
  const storage = memoryStorage();
  const career = Career.createCareer({ storage, now: clock, uuid });
  Object.entries(OLD_CUPS).forEach(([cupId, tracks], k) => {
    const driverId = k ? "hamilton" : "leclerc";
    const cupRunId = career.startCupRun();
    tracks.forEach((trackId, raceIndex) => career.recordRace({
      cupId, cupRunId, raceIndex, trackId, difficulty: "pro", driverId, teamId: "ferrari",
      position: raceIndex + 1, fieldSize: 20, bestLapMs: 36000 + raceIndex * 1000, fastestLap: raceIndex === 0,
    }));
    career.recordCup({ cupId, cupRunId, driverId, difficulty: "pro", position: 1, cupPoints: 80 });
  });
  return storage;
}

test("a career saved in the old cups loads exactly as it was saved", () => {
  const storage = savedBeforeTheCalendar();
  const before = JSON.parse(storage.data[Career.STORAGE_KEY]);
  const career = Career.createCareer({ storage, now: clock, uuid });
  const after = career.getProfile();
  ["leclerc", "hamilton"].forEach((id) => {
    const was = before.drivers[id];
    const is = career.getDriver(id);
    assert.equal(is.careerPoints, was.careerPoints, id);
    assert.equal(is.rating, was.rating, id);
    assert.deepEqual(is.totals, was.totals, id);
    assert.deepEqual(is.bestLaps, was.bestLaps, id);
    assert.deepEqual(is.history, was.history, id);
    // The history keeps the cup it was raced in.
    assert.ok(is.history.every((h) => h.cupId === "trophyCup" || h.cupId === "constructorCup"));
  });
  assert.equal(after.lastDriverId, before.lastDriverId);
  // Every best lap is at a circuit still raced, in a calendar cup.
  const raced = Data.CUP_DEFS.flatMap((cup) => cup.circuitIds);
  Object.values(OLD_CUPS).flat().forEach((id) => assert.ok(raced.includes(id), id));
  assert.equal(Object.keys(career.getDriver("leclerc").bestLaps).length + Object.keys(career.getDriver("hamilton").bestLaps).length, 8);
});

test("racing on in a calendar cup adds to the old career", () => {
  const storage = savedBeforeTheCalendar();
  const career = Career.createCareer({ storage, now: clock, uuid });
  const was = career.getDriver("leclerc");
  const summary = career.recordRace({
    cupId: "classicsCup", cupRunId: career.startCupRun(), raceIndex: 3, trackId: "monza", difficulty: "pro",
    driverId: "leclerc", teamId: "ferrari", position: 1, fieldSize: 20, bestLapMs: 35000, fastestLap: false,
  });
  const is = career.getDriver("leclerc");
  assert.equal(is.totals.races, was.totals.races + 1);
  assert.equal(is.bestLaps.monza.ms, 35000);
  assert.equal(summary.newBestLap.previousMs, was.bestLaps.monza.ms);
});

test("the remembered cup is a cup of the calendar or the season, by id", () => {
  const cups = [...Data.CUP_DEFS, Data.SEASON];
  assert.equal(Season.resolveCup("season", cups), "season");
  assert.equal(Season.resolveCup("finaleCup", cups), "finaleCup");
  assert.equal(Season.resolveCup(null, cups), "openingCup");
});
