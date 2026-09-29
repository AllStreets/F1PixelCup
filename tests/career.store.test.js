const test = require("node:test");
const assert = require("node:assert/strict");
const Career = require("../career.js");

// v2 lives under its own key; a v1 save stays under the old one, untouched.
const V2 = Career.STORAGE_KEY;
const LEGACY = Career.LEGACY_KEY;

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => (Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null),
    setItem: (key, value) => { data[key] = String(value); },
    removeItem: (key) => { delete data[key]; },
  };
}

function fixedClock(iso = "2026-09-27T12:00:00.000Z") {
  return () => new Date(iso);
}

function counter() {
  let n = 0;
  return () => `id-${(n += 1)}`;
}

function make(storage = memoryStorage()) {
  return { storage, career: Career.createCareer({ storage, now: fixedClock(), uuid: counter() }) };
}

const ZERO_TOTALS = { races: 0, wins: 0, podiums: 0, cupsCompleted: 0, cupsWon: 0, poles: 0 };

const monzaWin = {
  cupId: "trophyCup", cupRunId: "run-1", raceIndex: 0, trackId: "monza", difficulty: "pro",
  driverId: "verstappen", teamId: "redBull", position: 1, fieldSize: 20, bestLapMs: 38214, fastestLap: true,
};

// ---------------------------------------------------------------------------
// One career per driver
// ---------------------------------------------------------------------------

test("a new player has no drivers; any driver starts at 1200 · F4 with nothing recorded", () => {
  const { career } = make();
  const profile = career.getProfile();
  assert.equal(profile.version, 2);
  assert.deepEqual(profile.drivers, {});
  const leclerc = career.getDriver("leclerc");
  assert.equal(leclerc.driverId, "leclerc");
  assert.equal(leclerc.rating, 1200);
  assert.equal(leclerc.careerPoints, 0);
  assert.deepEqual(leclerc.totals, ZERO_TOTALS);
  assert.deepEqual(leclerc.bestLaps, {});
  assert.deepEqual(leclerc.history, []);
  assert.deepEqual(career.listDrivers(), []);
});

test("recordRace awards points, rates, records history and saves -- for that driver", () => {
  const { career, storage } = make();
  const summary = career.recordRace(monzaWin);
  assert.equal(summary.driverId, "verstappen");
  assert.equal(summary.racePoints, 26);
  assert.equal(summary.multiplier, 2);
  assert.equal(summary.careerPoints, 52);
  assert.equal(summary.careerTotal, 52);
  assert.deepEqual(summary.rating, { before: 1200, after: 1230, delta: 30 });
  assert.equal(summary.tier, "F4");
  assert.deepEqual(summary.newBestLap, { trackId: "monza", ms: 38214, previousMs: null });
  assert.equal(summary.saved, true);

  const stored = JSON.parse(storage.data[V2]);
  assert.equal(stored.version, 2);
  assert.equal(stored.lastDriverId, "verstappen");
  const max = stored.drivers.verstappen;
  assert.equal(max.careerPoints, 52);
  assert.equal(max.rating, 1230);
  assert.equal(max.ratedRaces, 1);
  assert.deepEqual(max.totals, { ...ZERO_TOTALS, races: 1, wins: 1, podiums: 1 });
  assert.deepEqual(max.bestLaps.monza, { ms: 38214, at: "2026-09-27T12:00:00.000Z", difficulty: "pro", teamId: "redBull" });
  assert.deepEqual(max.history[0], {
    id: "id-2", type: "race", at: "2026-09-27T12:00:00.000Z", cupId: "trophyCup", cupRunId: "run-1",
    raceIndex: 0, trackId: "monza", difficulty: "pro", driverId: "verstappen", teamId: "redBull",
    position: 1, fieldSize: 20, bestLapMs: 38214, fastestLap: true, racePoints: 26,
    careerPointsEarned: 52, qualifying: null, ratingBefore: 1200, ratingAfter: 1230,
  });
});

test("each driver's career is their own", () => {
  const { career } = make();
  career.recordRace(monzaWin);
  career.recordRace({ ...monzaWin, driverId: "leclerc", teamId: "ferrari", position: 5, fastestLap: false, bestLapMs: 39000 });
  const max = career.getDriver("verstappen");
  const charles = career.getDriver("leclerc");
  assert.equal(max.careerPoints, 52);
  assert.equal(charles.careerPoints, 20);
  assert.equal(max.totals.races, 1);
  assert.equal(charles.totals.races, 1);
  assert.equal(max.bestLaps.monza.ms, 38214);
  assert.equal(charles.bestLaps.monza.ms, 39000);
  // Each rating starts from 1200 on its own.
  assert.equal(charles.history[0].ratingBefore, 1200);
  assert.equal(career.getProfile().lastDriverId, "leclerc");
});

test("recordRace needs to know who drove", () => {
  const { career } = make();
  assert.throws(() => career.recordRace({ ...monzaWin, driverId: undefined }), /driverId/);
});

test("listDrivers: every driver raced, highest rating first", () => {
  const { career } = make();
  career.recordRace({ ...monzaWin, driverId: "hamilton", teamId: "ferrari", position: 12 });
  career.recordRace(monzaWin);
  career.recordRace({ ...monzaWin, driverId: "leclerc", teamId: "ferrari", position: 2 });
  const list = career.listDrivers();
  assert.deepEqual(list.map((d) => d.driverId), ["verstappen", "leclerc", "hamilton"]);
  assert.deepEqual(Object.keys(list[0]).sort(), ["careerPoints", "driverId", "lastRaceAt", "races", "rating", "tier", "wins"]);
  assert.equal(list[0].tier, "F4");
});

test("a slower lap does not replace the best lap; a faster one does", () => {
  const { career } = make();
  career.recordRace(monzaWin);
  assert.equal(career.recordRace({ ...monzaWin, bestLapMs: 39000 }).newBestLap, null);
  assert.deepEqual(career.recordRace({ ...monzaWin, bestLapMs: 37000 }).newBestLap, { trackId: "monza", ms: 37000, previousMs: 38214 });
  assert.equal(career.getDriver("verstappen").bestLaps.monza.ms, 37000);
});

test("no timed lap leaves best laps alone", () => {
  const { career } = make();
  const summary = career.recordRace({ ...monzaWin, bestLapMs: 0 });
  assert.equal(summary.newBestLap, null);
  const max = career.getDriver("verstappen");
  assert.deepEqual(max.bestLaps, {});
  assert.equal(max.history[0].bestLapMs, null);
});

test("podium and win totals follow the position", () => {
  const { career } = make();
  career.recordRace({ ...monzaWin, position: 3 });
  career.recordRace({ ...monzaWin, position: 4 });
  assert.deepEqual(career.getDriver("verstappen").totals, { ...ZERO_TOTALS, races: 2, podiums: 1 });
});

test("recordCup adds the bonus and cup totals to the driver who drove it", () => {
  const { career } = make();
  const summary = career.recordCup({ cupId: "trophyCup", cupRunId: "run-1", driverId: "leclerc", difficulty: "legend", position: 1, cupPoints: 92 });
  assert.deepEqual(summary, { bonus: 50, multiplier: 3, careerPoints: 150, careerTotal: 150, alreadyRecorded: false, saved: true });
  const charles = career.getDriver("leclerc");
  assert.deepEqual(charles.totals, { ...ZERO_TOTALS, cupsCompleted: 1, cupsWon: 1 });
  assert.equal(charles.history[0].type, "cup");
  assert.equal(charles.history[0].cupPoints, 92);
  assert.equal(career.getDriver("verstappen").careerPoints, 0);
});

test("recordCup twice with the same cupRunId adds the bonus once", () => {
  const { career } = make();
  const cup = { cupId: "trophyCup", cupRunId: "run-1", driverId: "leclerc", difficulty: "pro", position: 2, cupPoints: 70 };
  career.recordCup(cup);
  const again = career.recordCup(cup);
  assert.equal(again.alreadyRecorded, true);
  assert.equal(again.careerTotal, 60);
  const charles = career.getDriver("leclerc");
  assert.equal(charles.careerPoints, 60);
  assert.equal(charles.totals.cupsCompleted, 1);
  assert.equal(charles.history.length, 1);
});

test("recordCup needs to know who drove", () => {
  const { career } = make();
  assert.throws(() => career.recordCup({ cupId: "trophyCup", cupRunId: "r", difficulty: "pro", position: 1, cupPoints: 1 }), /driverId/);
});

test("reads fresh from storage before every record (two tabs)", () => {
  const storage = memoryStorage();
  const tabA = Career.createCareer({ storage, now: fixedClock(), uuid: counter() });
  const tabB = Career.createCareer({ storage, now: fixedClock(), uuid: () => `b-${Math.random()}` });
  tabA.recordRace(monzaWin);
  tabB.recordRace({ ...monzaWin, trackId: "spa" });
  tabA.recordRace({ ...monzaWin, trackId: "suzuka", driverId: "hamilton", teamId: "ferrari" });
  const max = tabA.getDriver("verstappen");
  assert.equal(max.totals.races, 2);
  assert.deepEqual(Object.keys(max.bestLaps).sort(), ["monza", "spa"]);
  assert.equal(tabA.getDriver("hamilton").totals.races, 1);
});

test("a corrupt save is backed up, never deleted, and replaced with a fresh profile", () => {
  const storage = memoryStorage({ [V2]: "{not json" });
  const { career } = make(storage);
  assert.deepEqual(career.getProfile().drivers, {});
  assert.equal(storage.data["f1pixelcup.profile.backup.1790510400000"], "{not json");
  assert.equal(JSON.parse(storage.data[V2]).version, 2);
});

test("a save from a newer version is left untouched and the session plays from memory", () => {
  const future = JSON.stringify({ version: 3, drivers: { verstappen: { careerPoints: 999 } } });
  const storage = memoryStorage({ [V2]: future });
  const { career } = make(storage);
  assert.equal(career.getDriver("verstappen").careerPoints, 0);
  const summary = career.recordRace(monzaWin);
  assert.equal(summary.saved, false);
  assert.equal(career.recordRace(monzaWin).careerTotal, 104);
  assert.equal(storage.data[V2], future);
  assert.deepEqual(Object.keys(storage.data), [V2]);
});

test("storage that throws: nothing reaches the game and progress adds up in memory", () => {
  const broken = {
    getItem: () => { throw new Error("SecurityError"); },
    setItem: () => { throw new Error("SecurityError"); },
  };
  const { career } = make(broken);
  const first = career.recordRace(monzaWin);
  assert.equal(first.saved, false);
  assert.equal(first.careerPoints, 52);
  const second = career.recordRace(monzaWin);
  assert.equal(second.saved, false);
  assert.equal(second.careerTotal, 104);
});

test("setItem quota failure reports saved: false", () => {
  const storage = memoryStorage();
  storage.setItem = () => { throw new Error("QuotaExceededError"); };
  const { career } = make(storage);
  const summary = career.recordRace(monzaWin);
  assert.equal(summary.saved, false);
  assert.equal(summary.careerPoints, 52);
});

test("the history keeps its newest 5000 entries across all drivers; totals keep counting", () => {
  const entry = (driverId, i) => ({ id: `${driverId}-${i}`, type: "race", driverId,
    at: new Date(Date.UTC(2026, 0, 1) + i * 60000).toISOString() });
  const driver = (driverId, history) => ({ driverId, careerPoints: 0, rating: 1200, ratedRaces: history.length,
    totals: { races: history.length, wins: 0, podiums: 0, cupsCompleted: 0, cupsWon: 0, poles: 0 }, bestLaps: {}, history });
  // Verstappen's 3000 races are the older ones; Hamilton's 2000 came after.
  const max = Array.from({ length: 3000 }, (_, i) => entry("verstappen", i));
  const lewis = Array.from({ length: 2000 }, (_, i) => entry("hamilton", 3000 + i));
  const seeded = JSON.stringify({ version: 2, profileId: "p", lastDriverId: "hamilton",
    drivers: { verstappen: driver("verstappen", max), hamilton: driver("hamilton", lewis) } });
  const { career } = make(memoryStorage({ [V2]: seeded }));
  career.recordRace({ ...monzaWin, driverId: "hamilton", teamId: "ferrari" });
  const v = career.getDriver("verstappen");
  const h = career.getDriver("hamilton");
  assert.equal(v.history.length + h.history.length, 5000);
  // The oldest entry of all went, whoever it belonged to.
  assert.equal(v.history[0].id, "verstappen-1");
  assert.equal(h.history.length, 2001);
  assert.equal(h.history[2000].trackId, "monza");
  assert.equal(h.totals.races, 2001);
  assert.equal(v.totals.races, 3000);
});

test("getProfile and getDriver return copies the caller cannot corrupt", () => {
  const { career } = make();
  career.recordRace(monzaWin);
  const copy = career.getProfile();
  copy.drivers.verstappen.careerPoints = 1e9;
  const driver = career.getDriver("verstappen");
  driver.history.length = 0;
  assert.equal(career.getDriver("verstappen").careerPoints, 52);
  assert.equal(career.getDriver("verstappen").history.length, 1);
});

test("startCupRun returns a new id each time", () => {
  const { career } = make();
  assert.notEqual(career.startCupRun(), career.startCupRun());
});

test("a profile removed from storage mid-session starts fresh instead of coming back", () => {
  const { career, storage } = make();
  career.recordRace(monzaWin);
  delete storage.data[V2];
  assert.deepEqual(career.getProfile().drivers, {});
  assert.equal(career.recordRace(monzaWin).careerTotal, 52);
});

test("while saves are failing, progress keeps adding up in memory", () => {
  const storage = memoryStorage();
  const { career } = make(storage);
  career.recordRace(monzaWin);
  storage.setItem = () => { throw new Error("QuotaExceededError"); };
  assert.equal(career.recordRace(monzaWin).careerTotal, 104);
  assert.equal(career.recordRace(monzaWin).careerTotal, 156);
});

test("a corrupt save that cannot be backed up is left in place, not overwritten", () => {
  const storage = memoryStorage({ [V2]: "{not json" });
  const realSet = storage.setItem;
  storage.setItem = (key, value) => {
    if (key.startsWith("f1pixelcup.profile.backup.")) throw new Error("QuotaExceededError");
    realSet(key, value);
  };
  const { career } = make(storage);
  assert.deepEqual(career.getProfile().drivers, {});
  assert.equal(career.recordRace(monzaWin).saved, false);
  assert.equal(storage.data[V2], "{not json");
});

test("a version-2 save with bad field types is repaired instead of breaking the game", () => {
  const bad = JSON.stringify({
    version: 2, profileId: 42, lastDriverId: 7,
    drivers: {
      verstappen: {
        careerPoints: null, rating: "fast", ratedRaces: -Infinity,
        totals: { races: 3, wins: "<img src=x onerror=alert(1)>", podiums: null },
        bestLaps: { monza: { ms: "quick" }, spa: { ms: 41000, at: "2026-01-01T00:00:00.000Z" }, silverstone: null },
        history: [1, null, "x", { id: "keep", type: "race" }],
      },
      broken: "not a career",
    },
  });
  const { career } = make(memoryStorage({ [V2]: bad }));
  const profile = career.getProfile();
  assert.equal(typeof profile.profileId, "string");
  assert.deepEqual(Object.keys(profile.drivers), ["verstappen"]);
  const max = career.getDriver("verstappen");
  assert.equal(max.careerPoints, 0);
  assert.equal(max.rating, 1200);
  assert.equal(max.ratedRaces, 0);
  assert.deepEqual(max.totals, { ...ZERO_TOTALS, races: 3 });
  assert.deepEqual(Object.keys(max.bestLaps), ["spa"]);
  assert.deepEqual(max.history, [{ id: "keep", type: "race" }]);
  assert.equal(career.recordRace(monzaWin).careerTotal, 52);
});

// ---------------------------------------------------------------------------
// Qualifying
// ---------------------------------------------------------------------------

test("qualifying earns career points by position and difficulty, and counts poles", () => {
  const { career } = make();
  const pole = career.recordRace({ ...monzaWin, qualifying: { position: 1, timeMs: 34998.4 } });
  assert.deepEqual(pole.qualifying, { position: 1, timeMs: 34998.4, points: 10, multiplier: 2, careerPoints: 20 });
  const third = career.recordRace({ ...monzaWin, raceIndex: 1, trackId: "spa", position: 5, qualifying: { position: 3, timeMs: 41000 } });
  assert.equal(third.qualifying.careerPoints, 8);
  const max = career.getDriver("verstappen");
  assert.equal(max.totals.poles, 1);
  // Race points (26, and 10 + 1 for the fastest lap, x2) plus qualifying (20 and 8).
  assert.equal(max.careerPoints, (26 + 11) * 2 + 20 + 8);
  const last = max.history[max.history.length - 1];
  assert.deepEqual(last.qualifying, { position: 3, timeMs: 41000, points: 4, careerPoints: 8 });
});

test("a race without qualifying records none and earns nothing extra", () => {
  const { career } = make();
  const summary = career.recordRace(monzaWin);
  assert.equal(summary.qualifying, null);
  const max = career.getDriver("verstappen");
  assert.equal(max.history[0].qualifying, null);
  assert.equal(max.totals.poles, 0);
  assert.equal(max.careerPoints, 26 * 2);
});

test("qualifying outside the points or with a bad time is recorded honestly", () => {
  const { career } = make();
  const summary = career.recordRace({ ...monzaWin, qualifying: { position: 14, timeMs: "fast" } });
  assert.deepEqual(summary.qualifying, { position: 14, timeMs: null, points: 0, multiplier: 2, careerPoints: 0 });
});

test("qualifying points: P1 10, P2 6, P3 4, P4-P10 2, times the difficulty multiplier", () => {
  assert.deepEqual(Career.QUALI_POINTS, [10, 6, 4, 2, 2, 2, 2, 2, 2, 2]);
  assert.deepEqual(Career.qualifyingAward({ position: 1, difficulty: "legend" }), { points: 10, multiplier: 3, careerPoints: 30 });
  assert.deepEqual(Career.qualifyingAward({ position: 4, difficulty: "pro" }), { points: 2, multiplier: 2, careerPoints: 4 });
  assert.deepEqual(Career.qualifyingAward({ position: 11, difficulty: "rookie" }), { points: 0, multiplier: 1, careerPoints: 0 });
});

// ---------------------------------------------------------------------------
// From one shared career (v1) to one per driver (v2)
// ---------------------------------------------------------------------------

// A v1 career raced with two drivers: Verstappen won at Monza and did a cup,
// Leclerc finished 3rd at Spa with pole, and Verstappen came back for Suzuka.
function mixedV1() {
  const at = "2026-09-20T10:00:00.000Z";
  return {
    version: 1, profileId: "keep-me", createdAt: "2026-09-01T00:00:00.000Z", updatedAt: at,
    // Exactly what the history adds up to: 52 + 60 (cup) + 45 + 30 (pole) + 4.
    careerPoints: 52 + 60 + 45 + 30 + 4, rating: 1277, ratedRaces: 3,
    totals: { races: 3, wins: 1, podiums: 2, cupsCompleted: 1, cupsWon: 0, poles: 1 },
    bestLaps: { monza: { ms: 38214, at, difficulty: "pro", driverId: "verstappen", teamId: "redBull" } },
    history: [
      { id: "r1", type: "race", at, cupId: "trophyCup", cupRunId: "run-a", raceIndex: 0, trackId: "monza", difficulty: "pro",
        driverId: "verstappen", teamId: "redBull", position: 1, fieldSize: 20, bestLapMs: 38214, fastestLap: true,
        racePoints: 26, careerPointsEarned: 52, ratingBefore: 1200, ratingAfter: 1230 },
      { id: "c1", type: "cup", at, cupId: "trophyCup", cupRunId: "run-a", difficulty: "pro", position: 2, cupPoints: 70, careerPointsEarned: 60 },
      { id: "r2", type: "race", at, cupId: "constructorCup", cupRunId: "run-b", raceIndex: 0, trackId: "spa", difficulty: "legend",
        driverId: "leclerc", teamId: "ferrari", position: 3, fieldSize: 20, bestLapMs: 44100, fastestLap: false,
        racePoints: 15, careerPointsEarned: 45, qualifying: { position: 1, timeMs: 43000, points: 10, careerPoints: 30 },
        ratingBefore: 1230, ratingAfter: 1262 },
      { id: "r3", type: "race", at, cupId: "trophyCup", cupRunId: "run-c", raceIndex: 3, trackId: "suzuka", difficulty: "rookie",
        driverId: "verstappen", teamId: "redBull", position: 8, fieldSize: 20, bestLapMs: 40000, fastestLap: false,
        racePoints: 4, careerPointsEarned: 4, ratingBefore: 1262, ratingAfter: 1277 },
    ],
  };
}

test("a v1 career is split by driver exactly, ratings replayed per driver", () => {
  const storage = memoryStorage({ [LEGACY]: JSON.stringify(mixedV1()) });
  const { career } = make(storage);
  const profile = career.getProfile();
  assert.equal(profile.version, 2);
  assert.equal(profile.profileId, "keep-me");
  assert.equal(profile.createdAt, "2026-09-01T00:00:00.000Z");
  assert.equal(profile.lastDriverId, "verstappen");
  const max = career.getDriver("verstappen");
  const charles = career.getDriver("leclerc");
  // Verstappen: Monza win (52) + cup (60) + Suzuka (4). Leclerc: Spa (45) + pole (30).
  assert.equal(max.careerPoints, 52 + 60 + 4);
  assert.equal(charles.careerPoints, 45 + 30);
  assert.deepEqual(max.totals, { ...ZERO_TOTALS, races: 2, wins: 1, podiums: 1, cupsCompleted: 1 });
  assert.deepEqual(charles.totals, { ...ZERO_TOTALS, races: 1, podiums: 1, poles: 1 });
  // Ratings are replayed from 1200 for each driver.
  const r1 = Career.rateRace({ rating: 1200, ratedRaces: 0, position: 1, fieldSize: 20, difficulty: "pro" });
  const r3 = Career.rateRace({ rating: r1.after, ratedRaces: 1, position: 8, fieldSize: 20, difficulty: "rookie" });
  const r2 = Career.rateRace({ rating: 1200, ratedRaces: 0, position: 3, fieldSize: 20, difficulty: "legend" });
  assert.equal(max.rating, r3.after);
  assert.equal(max.ratedRaces, 2);
  assert.equal(charles.rating, r2.after);
  assert.equal(charles.history[0].ratingBefore, 1200);
  assert.equal(charles.history[0].ratingAfter, r2.after);
  assert.equal(max.history[2].ratingBefore, r1.after);
  // Best laps per driver, from each race.
  assert.equal(max.bestLaps.monza.ms, 38214);
  assert.equal(max.bestLaps.suzuka.ms, 40000);
  assert.equal(charles.bestLaps.spa.ms, 44100);
  // The cup went to the driver of its races, by cupRunId.
  assert.deepEqual(max.history.map((h) => h.id), ["r1", "c1", "r3"]);
  assert.deepEqual(charles.history.map((h) => h.id), ["r2"]);
});

test("migration writes v2 under its own key and leaves the v1 save untouched, as the backup", () => {
  const raw = JSON.stringify(mixedV1());
  const storage = memoryStorage({ [LEGACY]: raw });
  const { career } = make(storage);
  career.getProfile();
  assert.equal(storage.data[LEGACY], raw);
  assert.equal(JSON.parse(storage.data[V2]).version, 2);
  // No second copy of the old save.
  assert.deepEqual(Object.keys(storage.data).sort(), [LEGACY, V2].sort());
});

test("if the migrated profile can't be written, the session plays from memory and nothing piles up", () => {
  const raw = JSON.stringify(mixedV1());
  const storage = memoryStorage({ [LEGACY]: raw });
  let writes = 0;
  storage.setItem = () => { writes += 1; throw new Error("QuotaExceededError"); };
  const { career } = make(storage);
  // The session still sees the split careers, from memory...
  assert.equal(career.getDriver("leclerc").careerPoints, 75);
  career.getProfile();
  career.listDrivers();
  const afterReads = writes;
  // ...a race still adds up...
  const summary = career.recordRace({ ...monzaWin, driverId: "leclerc", teamId: "ferrari" });
  assert.equal(summary.saved, false);
  assert.equal(summary.careerTotal, 75 + 52);
  // ...reading again doesn't try to migrate and write again...
  career.getProfile();
  assert.equal(afterReads, 1);
  // ...and the v1 save is untouched.
  assert.deepEqual(storage.data, { [LEGACY]: raw });
});

test("an old tab still writing v1 can't overwrite the v2 profile", () => {
  const storage = memoryStorage({ [LEGACY]: JSON.stringify(mixedV1()) });
  const { career } = make(storage);
  career.recordRace({ ...monzaWin, driverId: "leclerc", teamId: "ferrari" });
  // The old code writes its own v1 over the old key.
  storage.setItem(LEGACY, JSON.stringify({ ...mixedV1(), careerPoints: 1 }));
  assert.equal(make(storage).career.getDriver("leclerc").careerPoints, 75 + 52);
});

test("a corrupt v1 save is left where it is, and the game starts fresh", () => {
  const storage = memoryStorage({ [LEGACY]: "{not json" });
  const { career } = make(storage);
  assert.deepEqual(career.getProfile().drivers, {});
  career.recordRace(monzaWin);
  assert.equal(storage.data[LEGACY], "{not json");
  assert.equal(JSON.parse(storage.data[V2]).drivers.verstappen.totals.races, 1);
});

test("points and totals the v1 history can't explain go to the most-raced driver", () => {
  const v1 = mixedV1();
  v1.careerPoints += 500; // earned in races the history has since trimmed
  v1.totals.races += 4;
  v1.totals.wins += 2;
  const { career } = make(memoryStorage({ [LEGACY]: JSON.stringify(v1) }));
  const max = career.getDriver("verstappen");
  assert.equal(max.careerPoints, 52 + 60 + 4 + 500);
  assert.equal(max.totals.races, 2 + 4);
  assert.equal(max.totals.wins, 1 + 2);
  assert.equal(career.getDriver("leclerc").careerPoints, 75);
});

test("a v1 career with no history goes to Leclerc, the default driver", () => {
  const partial = JSON.stringify({ version: 1, profileId: "keep-me", careerPoints: 40, rating: 1260, ratedRaces: 2,
    totals: { races: 2, wins: 0, podiums: 1 } });
  const { career } = make(memoryStorage({ [LEGACY]: partial }));
  const profile = career.getProfile();
  assert.equal(profile.profileId, "keep-me");
  assert.deepEqual(Object.keys(profile.drivers), ["leclerc"]);
  const charles = career.getDriver("leclerc");
  assert.equal(charles.careerPoints, 40);
  assert.equal(charles.rating, 1260);
  assert.equal(charles.ratedRaces, 2);
  assert.deepEqual(charles.totals, { ...ZERO_TOTALS, races: 2, podiums: 1 });
  assert.equal(profile.lastDriverId, "leclerc");
});

test("a brand-new v1 profile migrates to an empty v2 one", () => {
  const empty = JSON.stringify({ version: 1, profileId: "p", careerPoints: 0, rating: 1200, ratedRaces: 0,
    totals: { races: 0, wins: 0, podiums: 0, cupsCompleted: 0, cupsWon: 0 }, bestLaps: {}, history: [] });
  const { career } = make(memoryStorage({ [LEGACY]: empty }));
  assert.deepEqual(career.getProfile().drivers, {});
});

test("migrating is done once: a migrated profile reads back unchanged", () => {
  const storage = memoryStorage({ [LEGACY]: JSON.stringify(mixedV1()) });
  const first = make(storage).career.getProfile();
  const second = make(storage).career.getProfile();
  assert.deepEqual(second, first);
});

test("migration is deterministic: the same v1 save splits the same way twice", () => {
  const raw = JSON.stringify(mixedV1());
  const one = make(memoryStorage({ [LEGACY]: raw })).career.getProfile();
  const two = make(memoryStorage({ [LEGACY]: raw })).career.getProfile();
  assert.deepEqual(two, one);
});

test("a v1 save with bad field types still migrates instead of breaking the game", () => {
  const bad = JSON.stringify({
    version: 1, profileId: 42, careerPoints: null, rating: "fast", ratedRaces: -Infinity,
    totals: { races: 3, wins: "<img src=x onerror=alert(1)>", podiums: null },
    history: [1, null, "x", { id: "keep", type: "race", driverId: "hamilton", position: "first" }],
  });
  const { career } = make(memoryStorage({ [LEGACY]: bad }));
  const profile = career.getProfile();
  assert.equal(typeof profile.profileId, "string");
  const lewis = career.getDriver("hamilton");
  assert.deepEqual(lewis.history.map((h) => h.id), ["keep"]);
  assert.equal(lewis.rating, 1200);
  assert.equal(career.recordRace(monzaWin).careerTotal, 52);
});

// ---------------------------------------------------------------------------
// Edges from the stage 3 review
// ---------------------------------------------------------------------------

const race = (id, driverId, extra = {}) => ({ id, type: "race", at: "2026-09-20T10:00:00.000Z", trackId: "monza",
  difficulty: "pro", driverId, position: 5, fieldSize: 20, careerPointsEarned: 20, ...extra });
const v1With = (history, extra = {}) => JSON.stringify({ version: 1, profileId: "p", careerPoints: 0, rating: 1200,
  ratedRaces: 0, totals: {}, bestLaps: {}, history, ...extra });

test("a cup already recorded for one driver isn't added again for another", () => {
  const { career } = make();
  career.recordRace({ ...monzaWin, driverId: "leclerc", teamId: "ferrari", cupRunId: "run-x" });
  const first = career.recordCup({ cupId: "trophyCup", cupRunId: "run-x", difficulty: "pro", position: 1, cupPoints: 90, driverId: "leclerc" });
  const again = career.recordCup({ cupId: "trophyCup", cupRunId: "run-x", difficulty: "pro", position: 1, cupPoints: 90, driverId: "hamilton" });
  assert.equal(again.alreadyRecorded, true);
  // It reports the career the cup counted for.
  assert.equal(again.careerTotal, first.careerTotal);
  assert.deepEqual(career.listDrivers().map((d) => d.driverId), ["leclerc"]);
});

test("a repeated cup leaves no empty career behind, even while saves fail", () => {
  const storage = memoryStorage();
  const { career } = make(storage);
  career.recordRace({ ...monzaWin, driverId: "leclerc", teamId: "ferrari", cupRunId: "run-x" });
  career.recordCup({ cupId: "trophyCup", cupRunId: "run-x", difficulty: "pro", position: 1, cupPoints: 90, driverId: "leclerc" });
  storage.setItem = () => { throw new Error("QuotaExceededError"); };
  career.recordRace({ ...monzaWin, driverId: "leclerc", teamId: "ferrari" });
  career.recordCup({ cupId: "trophyCup", cupRunId: "run-x", difficulty: "pro", position: 1, cupPoints: 90, driverId: "hamilton" });
  assert.deepEqual(career.listDrivers().map((d) => d.driverId), ["leclerc"]);
});

test("migration: a cup whose run has no race goes to the driver of the race before it", () => {
  const cup = { id: "c", type: "cup", cupRunId: "lost-run", position: 1, careerPointsEarned: 100 };
  const { career } = make(memoryStorage({ [LEGACY]: v1With([race("r1", "hamilton"), cup, race("r2", "leclerc")]) }));
  assert.deepEqual(career.getDriver("hamilton").history.map((h) => h.id), ["r1", "c"]);
  assert.equal(career.getDriver("hamilton").totals.cupsWon, 1);
  assert.equal(career.getDriver("hamilton").history[1].driverId, "hamilton");
});

test("migration: a cup or note before any race goes with the next race's driver, not an empty Leclerc", () => {
  const cup = { id: "c", type: "cup", cupRunId: "lost-run", position: 2, careerPointsEarned: 60 };
  const { career } = make(memoryStorage({ [LEGACY]: v1With([{ id: "n", type: "note" }, cup, race("r1", "hamilton")]) }));
  assert.deepEqual(career.listDrivers().map((d) => d.driverId), ["hamilton"]);
  const lewis = career.getDriver("hamilton");
  assert.deepEqual(lewis.history.map((h) => h.id), ["n", "c", "r1"]);
  assert.equal(lewis.careerPoints, 60 + 20);
  assert.equal(lewis.totals.cupsCompleted, 1);
});

test("migration: a race with no driver is filed, and marked, as the previous race's driver", () => {
  const { career } = make(memoryStorage({ [LEGACY]: v1With([race("r1", "hamilton"), race("r2", undefined)]) }));
  const lewis = career.getDriver("hamilton");
  assert.deepEqual(lewis.history.map((h) => [h.id, h.driverId]), [["r1", "hamilton"], ["r2", "hamilton"]]);
});

test("migration: best laps with a driver go to that driver only; lastDriverId follows", () => {
  const bestLaps = { monza: { ms: 38000, at: "2026-09-01T00:00:00.000Z", driverId: "hamilton", difficulty: "pro" } };
  const { career } = make(memoryStorage({ [LEGACY]: v1With([], { bestLaps }) }));
  const profile = career.getProfile();
  assert.deepEqual(Object.keys(profile.drivers), ["hamilton"]);
  assert.equal(profile.lastDriverId, "hamilton");
  assert.equal(career.getDriver("hamilton").bestLaps.monza.ms, 38000);
});

test("migration: an empty v1 save names Leclerc as the last driver, with no career", () => {
  const { career } = make(memoryStorage({ [LEGACY]: v1With([]) }));
  const profile = career.getProfile();
  assert.deepEqual(profile.drivers, {});
  assert.equal(profile.lastDriverId, "leclerc");
});

test("migration: when the history adds up to more than the v1 totals, the history wins", () => {
  // Only a hand-edited save can do this; nothing is taken away from anyone.
  const { career } = make(memoryStorage({ [LEGACY]: v1With([race("r1", "hamilton"), race("r2", "leclerc")],
    { careerPoints: 5, totals: { races: 1 } }) }));
  assert.equal(career.getDriver("hamilton").careerPoints, 20);
  assert.equal(career.getDriver("leclerc").careerPoints, 20);
  assert.equal(career.getDriver("hamilton").totals.races + career.getDriver("leclerc").totals.races, 2);
});

test("migration: rated races the history no longer shows still count, so the rating isn't provisional again", () => {
  const { career } = make(memoryStorage({ [LEGACY]: v1With([], { careerPoints: 10, rating: 1200, ratedRaces: 7, totals: { races: 7 } }) }));
  assert.equal(career.getDriver("leclerc").ratedRaces, 7);
  const trimmed = v1With([race("r9", "hamilton", { ratingBefore: 1400, ratingAfter: 1390 })], { ratedRaces: 12, totals: { races: 12 } });
  const lewis = make(memoryStorage({ [LEGACY]: trimmed })).career.getDriver("hamilton");
  // The trimmed history starts part-way through a career: the replay starts from the rating it had then.
  const r = Career.rateRace({ rating: 1400, ratedRaces: 0, position: 5, fieldSize: 20, difficulty: "pro" });
  assert.equal(lewis.rating, r.after);
  assert.equal(lewis.ratedRaces, 12);
});

test("driver ids that clash with built-in object names never break the career", () => {
  const history = [race("r1", "constructor"), race("r2", "__proto__"), race("r3", "toString"),
    { id: "c", type: "cup", cupRunId: "constructor", position: 1, careerPointsEarned: 10 }, race("r4", "hamilton")];
  const { career } = make(memoryStorage({ [LEGACY]: v1With(history) }));
  const profile = career.getProfile();
  assert.deepEqual(Object.keys(profile.drivers).sort(), ["hamilton", "leclerc"]);
  assert.equal(career.getDriver("hamilton").totals.races, 1);
  assert.equal(career.getDriver("constructor").totals.races, 0);
  assert.throws(() => career.recordRace({ ...monzaWin, driverId: "constructor" }), /driverId/);
  assert.throws(() => career.recordRace({ ...monzaWin, driverId: "__proto__" }), /driverId/);

  const v2 = JSON.parse(JSON.stringify({ version: 2, profileId: "p", lastDriverId: "toString", drivers: {} }));
  v2.drivers = JSON.parse('{"__proto__": {"careerPoints": 5}, "toString": {"careerPoints": 5}, "norris": {"careerPoints": 5}}');
  const other = make(memoryStorage({ [V2]: JSON.stringify(v2) })).career;
  assert.deepEqual(other.listDrivers().map((d) => d.driverId), ["norris"]);
  assert.equal(other.lastDriverId(), null);
});

test("listDrivers: equal ratings go by points; lastRaceAt is the latest race", () => {
  const { career } = make();
  career.recordRace({ ...monzaWin, driverId: "hamilton", teamId: "ferrari", position: 20 });
  career.recordRace({ ...monzaWin, driverId: "leclerc", teamId: "ferrari", position: 20, fastestLap: false });
  const list = career.listDrivers();
  assert.equal(list[0].rating, list[1].rating);
  assert.deepEqual(list.map((d) => d.driverId), ["hamilton", "leclerc"].sort((a, b) => (
    list.find((d) => d.driverId === b).careerPoints - list.find((d) => d.driverId === a).careerPoints)));
  assert.equal(list[0].lastRaceAt, "2026-09-27T12:00:00.000Z");
});

test("lastDriverId: who raced last, or null", () => {
  const { career } = make();
  assert.equal(career.lastDriverId(), null);
  career.recordRace({ ...monzaWin, driverId: "hamilton", teamId: "ferrari" });
  assert.equal(career.lastDriverId(), "hamilton");
});

test("when storage is full, the oldest history makes room and the race is still saved", () => {
  const history = Array.from({ length: 400 }, (_, i) => ({ id: `old-${i}`, type: "race", driverId: "verstappen",
    at: new Date(Date.UTC(2026, 0, 1) + i * 60000).toISOString(), trackId: "monza", note: "x".repeat(200) }));
  const seeded = JSON.stringify({ version: 2, profileId: "p", lastDriverId: "verstappen",
    drivers: { verstappen: { driverId: "verstappen", careerPoints: 0, rating: 1200, ratedRaces: 400,
      totals: { races: 400, wins: 0, podiums: 0, cupsCompleted: 0, cupsWon: 0, poles: 0 }, bestLaps: {}, history } } });
  const storage = memoryStorage({ [V2]: seeded });
  const realSet = storage.setItem;
  const room = seeded.length;
  storage.setItem = (key, value) => {
    if (value.length > room) throw new Error("QuotaExceededError");
    realSet(key, value);
  };
  const { career } = make(storage);
  const summary = career.recordRace(monzaWin);
  assert.equal(summary.saved, true);
  const max = JSON.parse(storage.data[V2]).drivers.verstappen;
  assert.ok(max.history.length < 401);
  assert.equal(max.history[max.history.length - 1].trackId, "monza");
  assert.equal(max.totals.races, 401);
});
