const test = require("node:test");
const assert = require("node:assert/strict");
const Career = require("../career.js");

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

const monzaWin = {
  cupId: "trophyCup", cupRunId: "run-1", raceIndex: 0, trackId: "monza", difficulty: "pro",
  driverId: "verstappen", teamId: "redBull", position: 1, fieldSize: 20, bestLapMs: 38214, fastestLap: true,
};

test("a new player starts at 1200 with nothing recorded", () => {
  const { career } = make();
  const profile = career.getProfile();
  assert.equal(profile.version, 1);
  assert.equal(profile.rating, 1200);
  assert.equal(profile.careerPoints, 0);
  assert.deepEqual(profile.totals, { races: 0, wins: 0, podiums: 0, cupsCompleted: 0, cupsWon: 0 });
  assert.deepEqual(profile.bestLaps, {});
  assert.deepEqual(profile.history, []);
});

test("recordRace awards points, rates, records history and saves", () => {
  const { career, storage } = make();
  const summary = career.recordRace(monzaWin);
  assert.equal(summary.racePoints, 26);
  assert.equal(summary.multiplier, 2);
  assert.equal(summary.careerPoints, 52);
  assert.equal(summary.careerTotal, 52);
  assert.deepEqual(summary.rating, { before: 1200, after: 1230, delta: 30 });
  assert.equal(summary.tier, "F4");
  assert.deepEqual(summary.newBestLap, { trackId: "monza", ms: 38214, previousMs: null });
  assert.equal(summary.saved, true);

  const stored = JSON.parse(storage.data["f1pixelcup.profile"]);
  assert.equal(stored.careerPoints, 52);
  assert.equal(stored.rating, 1230);
  assert.equal(stored.ratedRaces, 1);
  assert.deepEqual(stored.totals, { races: 1, wins: 1, podiums: 1, cupsCompleted: 0, cupsWon: 0 });
  assert.deepEqual(stored.bestLaps.monza, { ms: 38214, at: "2026-09-27T12:00:00.000Z", difficulty: "pro", driverId: "verstappen", teamId: "redBull" });
  assert.equal(stored.history.length, 1);
  assert.deepEqual(stored.history[0], {
    id: "id-2", type: "race", at: "2026-09-27T12:00:00.000Z", cupId: "trophyCup", cupRunId: "run-1",
    raceIndex: 0, trackId: "monza", difficulty: "pro", driverId: "verstappen", teamId: "redBull",
    position: 1, fieldSize: 20, bestLapMs: 38214, fastestLap: true, racePoints: 26,
    careerPointsEarned: 52, ratingBefore: 1200, ratingAfter: 1230,
  });
});

test("a slower lap does not replace the best lap; a faster one does", () => {
  const { career } = make();
  career.recordRace(monzaWin);
  assert.equal(career.recordRace({ ...monzaWin, bestLapMs: 39000 }).newBestLap, null);
  assert.deepEqual(career.recordRace({ ...monzaWin, bestLapMs: 37000 }).newBestLap, { trackId: "monza", ms: 37000, previousMs: 38214 });
  assert.equal(career.getProfile().bestLaps.monza.ms, 37000);
});

test("no timed lap leaves best laps alone", () => {
  const { career } = make();
  const summary = career.recordRace({ ...monzaWin, bestLapMs: 0 });
  assert.equal(summary.newBestLap, null);
  const profile = career.getProfile();
  assert.deepEqual(profile.bestLaps, {});
  assert.equal(profile.history[0].bestLapMs, null);
});

test("podium and win totals follow the position", () => {
  const { career } = make();
  career.recordRace({ ...monzaWin, position: 3 });
  career.recordRace({ ...monzaWin, position: 4 });
  assert.deepEqual(career.getProfile().totals, { races: 2, wins: 0, podiums: 1, cupsCompleted: 0, cupsWon: 0 });
});

test("recordCup adds the bonus and cup totals", () => {
  const { career } = make();
  const summary = career.recordCup({ cupId: "trophyCup", cupRunId: "run-1", difficulty: "legend", position: 1, cupPoints: 92 });
  assert.deepEqual(summary, { bonus: 50, multiplier: 3, careerPoints: 150, careerTotal: 150, alreadyRecorded: false, saved: true });
  const profile = career.getProfile();
  assert.deepEqual(profile.totals, { races: 0, wins: 0, podiums: 0, cupsCompleted: 1, cupsWon: 1 });
  assert.equal(profile.history[0].type, "cup");
  assert.equal(profile.history[0].cupPoints, 92);
});

test("recordCup twice with the same cupRunId adds the bonus once", () => {
  const { career } = make();
  const cup = { cupId: "trophyCup", cupRunId: "run-1", difficulty: "pro", position: 2, cupPoints: 70 };
  career.recordCup(cup);
  const again = career.recordCup(cup);
  assert.equal(again.alreadyRecorded, true);
  assert.equal(again.careerTotal, 60);
  const profile = career.getProfile();
  assert.equal(profile.careerPoints, 60);
  assert.equal(profile.totals.cupsCompleted, 1);
  assert.equal(profile.history.length, 1);
});

test("reads fresh from storage before every record (two tabs)", () => {
  const storage = memoryStorage();
  const tabA = Career.createCareer({ storage, now: fixedClock(), uuid: counter() });
  const tabB = Career.createCareer({ storage, now: fixedClock(), uuid: () => `b-${Math.random()}` });
  tabA.recordRace(monzaWin);
  tabB.recordRace({ ...monzaWin, trackId: "spa" });
  tabA.recordRace({ ...monzaWin, trackId: "suzuka" });
  const profile = tabA.getProfile();
  assert.equal(profile.totals.races, 3);
  assert.equal(profile.history.length, 3);
  assert.deepEqual(Object.keys(profile.bestLaps).sort(), ["monza", "spa", "suzuka"]);
});

test("a corrupt save is backed up, never deleted, and replaced with a fresh profile", () => {
  const storage = memoryStorage({ "f1pixelcup.profile": "{not json" });
  const { career } = make(storage);
  assert.equal(career.getProfile().rating, 1200);
  assert.equal(storage.data["f1pixelcup.profile.backup.1790510400000"], "{not json");
  assert.equal(JSON.parse(storage.data["f1pixelcup.profile"]).version, 1);
});

test("a save from a newer version is treated as unrecognised and backed up", () => {
  const future = JSON.stringify({ version: 2, careerPoints: 999 });
  const storage = memoryStorage({ "f1pixelcup.profile": future });
  const { career } = make(storage);
  assert.equal(career.getProfile().careerPoints, 0);
  assert.equal(storage.data["f1pixelcup.profile.backup.1790510400000"], future);
});

test("a version-1 save with missing fields is filled in and keeps its data", () => {
  const partial = JSON.stringify({ version: 1, profileId: "keep-me", careerPoints: 40, rating: 1260 });
  const { career } = make(memoryStorage({ "f1pixelcup.profile": partial }));
  const profile = career.getProfile();
  assert.equal(profile.profileId, "keep-me");
  assert.equal(profile.careerPoints, 40);
  assert.equal(profile.rating, 1260);
  assert.equal(profile.ratedRaces, 0);
  assert.deepEqual(profile.totals, { races: 0, wins: 0, podiums: 0, cupsCompleted: 0, cupsWon: 0 });
  assert.deepEqual(profile.history, []);
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

test("history keeps the newest 5000 entries; totals keep counting", () => {
  const history = Array.from({ length: 5000 }, (_, i) => ({ id: `old-${i}`, type: "race" }));
  const seeded = JSON.stringify({
    version: 1, profileId: "p", careerPoints: 0, rating: 1200, ratedRaces: 5000,
    totals: { races: 5000, wins: 0, podiums: 0, cupsCompleted: 0, cupsWon: 0 }, bestLaps: {}, history,
  });
  const { career } = make(memoryStorage({ "f1pixelcup.profile": seeded }));
  career.recordRace(monzaWin);
  const profile = career.getProfile();
  assert.equal(profile.history.length, 5000);
  assert.equal(profile.history[0].id, "old-1");
  assert.equal(profile.history[4999].trackId, "monza");
  assert.equal(profile.totals.races, 5001);
});

test("getProfile returns a copy the caller cannot corrupt", () => {
  const { career } = make();
  career.recordRace(monzaWin);
  const copy = career.getProfile();
  copy.careerPoints = 1e9;
  copy.history.length = 0;
  assert.equal(career.getProfile().careerPoints, 52);
  assert.equal(career.getProfile().history.length, 1);
});

test("startCupRun returns a new id each time", () => {
  const { career } = make();
  assert.notEqual(career.startCupRun(), career.startCupRun());
});

test("a profile removed from storage mid-session starts fresh instead of coming back", () => {
  const { career, storage } = make();
  career.recordRace(monzaWin);
  delete storage.data["f1pixelcup.profile"];
  const profile = career.getProfile();
  assert.equal(profile.careerPoints, 0);
  assert.deepEqual(profile.history, []);
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
