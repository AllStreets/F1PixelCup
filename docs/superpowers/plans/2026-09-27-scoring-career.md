# Scoring and Career Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every player career points, a skill rating, best laps per circuit and a race history, saved in the browser in a format that can be uploaded to accounts later.

**Architecture:** A new classic-script module `career.js` holds pure scoring rules and a profile store that reads and writes one JSON document in `localStorage`. `game.js` calls it at two points (race finalised, cup podium) and displays what it returns in the results modal, the podium modal and a new Career panel in the garage. `career.js` has no DOM code and is unit-tested in Node.

**Tech Stack:** Vanilla JavaScript (no build step), `localStorage`, Node 22 built-in test runner (`node --test`), Playwright (already available) for the in-browser check.

**Spec:** `docs/superpowers/specs/2026-09-27-scoring-career-design.md`

## Global Constraints

- No build step and no new dependencies. `career.js` is a classic script loaded before `game.js`.
- Storage key `f1pixelcup.profile`; corrupt saves are copied to `f1pixelcup.profile.backup.<timestamp>` and never deleted.
- Profile `version` is `1`. History capped at the newest 5,000 entries; totals unaffected by the cap.
- Difficulty ids are `"rookie"`, `"pro"`, `"legend"` (from `DIFFICULTIES` in `game.js`). Multipliers ×1, ×2, ×3. Field strengths 1000, 1400, 1800.
- Race points 25-18-15-12-10-8-6-4-2-1, +1 fastest lap only inside the top ten. Cup bonus 50 / 30 / 20.
- Rating starts at 1200; `S = (n - p) / (n - 1)`; `E = 1 / (1 + 10^((field - rating)/400))`; `Δ = round(K × (S − E))`; K = 40 for the first 10 rated races, then 24.
- Tiers: below 1100 Karting, 1100–1299 F4, 1300–1499 F3, 1500–1699 F2, 1700–1849 F1, 1850+ World Champion.
- `recordRace` / `recordCup` never throw into the game; they report `saved: false` when storage fails.
- Only the player's car is recorded. A race abandoned before the flag records nothing; a cup that is not completed gets no bonus.
- No change to race physics, AI or the in-race HUD.
- After the work is verified, commit and `git push origin main` (standing user instruction).

## Review Focus

- **Podium shown twice for the same cup** (re-render, or reopening) — the cup bonus must be added exactly once. Test in Task 2 (`recordCup twice with the same cupRunId adds the bonus once`) and Task 5.
- **Two tabs open at once** — progress from the other tab must not be wiped by this one's next save. Test in Task 2 (`reads fresh from storage before every record`).
- **Storage full or blocked** (private window, quota) — the race result still shows what was earned, no exception reaches the game, and progress keeps adding up in memory for the session. Tests in Task 2 (`storage that throws`, `setItem quota failure`).
- **Player with no timed lap** (e.g. reversed or spun through the line) — no best-lap record, no crash, `bestLapMs` saved as `null`. Test in Task 2 (`no timed lap leaves best laps alone`).
- **Odd field sizes** (a field of 1, or a position outside 1..n) — rating maths must not divide by zero or produce NaN. Test in Task 1 (`rateRace handles a field of one and clamps position`).

---

## File Structure

| File | Responsibility |
|---|---|
| `career.js` (create) | Scoring rules (pure) and the profile store. Exposes `window.Career` in the browser, `module.exports` in Node. |
| `tests/career.rules.test.js` (create) | Unit tests for the pure rules. |
| `tests/career.store.test.js` (create) | Unit tests for the profile store with a fake storage. |
| `package.json` (create) | Only a `test` script (`node --test`); no dependencies. |
| `index.html` (modify) | Load `career.js`; add result/podium career strips and the garage Career panel. |
| `game.js` (modify) | Call `Career` from `startCup`, `finalizeRace`, `showPodium`; render the strips and the Career panel. |
| `styles.css` (modify) | Styles for the strips and the Career panel. |
| `README.md` (modify) | Document the career system. |

---

### Task 1: Scoring rules

**Files:**
- Create: `career.js`
- Create: `package.json`
- Test: `tests/career.rules.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces (on the exported object, used by Task 2 and Task 3):
  - `raceAward({ position, fastestLap, difficulty })` → `{ racePoints, multiplier, careerPoints }`
  - `cupAward({ position, difficulty })` → `{ bonus, multiplier, careerPoints }`
  - `rateRace({ rating, ratedRaces, position, fieldSize, difficulty })` → `{ before, after, delta, expected, actual, k }`
  - `tierFor(rating)` → `string`
  - `multiplierFor(difficulty)` → `number` (throws on an unknown difficulty)
  - constants `START_RATING = 1200`, `DIFFICULTY_NAMES = { rookie: "Rookie", pro: "Pro", legend: "Legend" }`

- [ ] **Step 1: Write the failing tests**

Create `tests/career.rules.test.js`:

```js
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
```

Create `package.json`:

```json
{
  "name": "f1-pixel-cup",
  "private": true,
  "description": "F1 racing game in the browser. No build step; this file only runs the tests.",
  "scripts": {
    "test": "node --test tests/"
  }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../career.js'`.

- [ ] **Step 3: Write the rules**

Create `career.js`:

```js
// Career scoring and the saved player profile.
//
// Two numbers, as agreed in docs/superpowers/specs/2026-09-27-scoring-career-design.md:
// career points (race points scaled by difficulty, plus a cup bonus; only ever
// go up) and a skill rating (Elo against a fixed-strength AI field per
// difficulty; goes up and down). This file has no DOM code. In the browser it
// defines window.Career; in Node it is require()-able for the tests.

(function attach(root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Career = api;
}(typeof globalThis !== "undefined" ? globalThis : this, (root) => {
  const POINTS_TABLE = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
  const CUP_BONUS = [50, 30, 20];
  const MULTIPLIER = { rookie: 1, pro: 2, legend: 3 };
  const FIELD_STRENGTH = { rookie: 1000, pro: 1400, legend: 1800 };
  const DIFFICULTY_NAMES = { rookie: "Rookie", pro: "Pro", legend: "Legend" };
  const START_RATING = 1200;
  const PROVISIONAL_RACES = 10;
  const K_PROVISIONAL = 40;
  const K_SETTLED = 24;
  // Highest first: the first threshold the rating reaches names the tier.
  const TIERS = [
    [1850, "World Champion"],
    [1700, "F1"],
    [1500, "F2"],
    [1300, "F3"],
    [1100, "F4"],
    [-Infinity, "Karting"],
  ];

  function multiplierFor(difficulty) {
    if (!Object.prototype.hasOwnProperty.call(MULTIPLIER, difficulty)) {
      throw new Error(`Unknown difficulty: ${difficulty}`);
    }
    return MULTIPLIER[difficulty];
  }

  function raceAward({ position, fastestLap, difficulty }) {
    const multiplier = multiplierFor(difficulty);
    const base = POINTS_TABLE[position - 1] || 0;
    const bonus = fastestLap && position >= 1 && position <= 10 ? 1 : 0;
    const racePoints = base + bonus;
    return { racePoints, multiplier, careerPoints: racePoints * multiplier };
  }

  function cupAward({ position, difficulty }) {
    const multiplier = multiplierFor(difficulty);
    const bonus = CUP_BONUS[position - 1] || 0;
    return { bonus, multiplier, careerPoints: bonus * multiplier };
  }

  function rateRace({ rating, ratedRaces, position, fieldSize, difficulty }) {
    multiplierFor(difficulty);
    const field = FIELD_STRENGTH[difficulty];
    const place = Math.min(Math.max(position, 1), Math.max(fieldSize, 1));
    const actual = fieldSize > 1 ? (fieldSize - place) / (fieldSize - 1) : 1;
    const expected = 1 / (1 + 10 ** ((field - rating) / 400));
    const k = ratedRaces < PROVISIONAL_RACES ? K_PROVISIONAL : K_SETTLED;
    const delta = Math.round(k * (actual - expected)) || 0;
    return { before: rating, after: rating + delta, delta, expected, actual, k };
  }

  function tierFor(rating) {
    return TIERS.find(([floor]) => rating >= floor)[1];
  }

  return {
    START_RATING,
    DIFFICULTY_NAMES,
    multiplierFor,
    raceAward,
    cupAward,
    rateRace,
    tierFor,
  };
}));
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — 8 tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add career.js package.json tests/career.rules.test.js
git commit -m "Add career scoring rules: points, rating, tiers"
```

---

### Task 2: Profile store

**Files:**
- Modify: `career.js` (add the store inside the same factory)
- Test: `tests/career.store.test.js`

**Interfaces:**
- Consumes: `raceAward`, `cupAward`, `rateRace`, `tierFor`, `START_RATING` from Task 1.
- Produces:
  - `createCareer({ storage, now, uuid })` → `{ recordRace, recordCup, getProfile, startCupRun }` (exported for tests)
  - In the browser only, the same four functions are also attached directly to `window.Career`, bound to `localStorage`.
  - `recordRace(result)` where `result = { cupId, cupRunId, raceIndex, trackId, difficulty, driverId, teamId, position, fieldSize, bestLapMs, fastestLap }` → `{ racePoints, multiplier, careerPoints, careerTotal, rating: { before, after, delta }, tier, newBestLap: null | { trackId, ms, previousMs }, saved }`
  - `recordCup(result)` where `result = { cupId, cupRunId, difficulty, position, cupPoints }` → `{ bonus, multiplier, careerPoints, careerTotal, alreadyRecorded, saved }`
  - `getProfile()` → deep copy of the profile (shape in the spec)
  - `startCupRun()` → new id string
  - Constants `STORAGE_KEY = "f1pixelcup.profile"`, `BACKUP_PREFIX = "f1pixelcup.profile.backup."`, `HISTORY_LIMIT = 5000`, `PROFILE_VERSION = 1`

- [ ] **Step 1: Write the failing tests**

Create `tests/career.store.test.js`:

```js
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
```

Note on ids in the `recordRace` test: `id-1` is used for the fresh profile's `profileId`, so the first history entry is `id-2`. The backup key uses `Date.parse("2026-09-27T12:00:00.000Z")` = `1790510400000`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Career.createCareer is not a function`.

- [ ] **Step 3: Add the store to `career.js`**

In `career.js`, replace the final `return { ... };` of the factory with the store code and the new return block below:

```js
  // ---------------------------------------------------------------------------
  // The saved profile. One JSON document under one key, read fresh before every
  // record (so a second tab's progress is never overwritten) and written whole
  // in one setItem (so a crash cannot leave half a profile).
  // ---------------------------------------------------------------------------

  const STORAGE_KEY = "f1pixelcup.profile";
  const BACKUP_PREFIX = "f1pixelcup.profile.backup.";
  const PROFILE_VERSION = 1;
  const HISTORY_LIMIT = 5000;

  function defaultUuid() {
    if (root.crypto && typeof root.crypto.randomUUID === "function") return root.crypto.randomUUID();
    const part = () => Math.random().toString(36).slice(2, 10);
    return `${Date.now().toString(36)}-${part()}-${part()}`;
  }

  function freshProfile(at, uuid) {
    return {
      version: PROFILE_VERSION,
      profileId: uuid(),
      createdAt: at,
      updatedAt: at,
      careerPoints: 0,
      rating: START_RATING,
      ratedRaces: 0,
      totals: { races: 0, wins: 0, podiums: 0, cupsCompleted: 0, cupsWon: 0 },
      bestLaps: {},
      history: [],
    };
  }

  const isNumber = (value) => typeof value === "number" && Number.isFinite(value);

  // A save this version of the game understands.
  function recognised(raw) {
    return Boolean(raw) && typeof raw === "object" && !Array.isArray(raw)
      && isNumber(raw.version) && raw.version >= 1 && raw.version <= PROFILE_VERSION;
  }

  // Fill in anything an older or partial save lacks, keeping what it has.
  // Future format changes add their upgrade steps here, keyed on raw.version.
  function upgrade(raw, at, uuid) {
    const base = freshProfile(at, uuid);
    return {
      ...base,
      ...raw,
      version: PROFILE_VERSION,
      totals: { ...base.totals, ...(raw.totals || {}) },
      bestLaps: { ...(raw.bestLaps || {}) },
      history: Array.isArray(raw.history) ? raw.history : [],
    };
  }

  const clone = (value) => JSON.parse(JSON.stringify(value));

  function createCareer({ storage = null, now = () => new Date(), uuid = defaultUuid } = {}) {
    // Used when storage is missing or throws, so a session still adds up.
    let memory = null;

    function write(profile) {
      if (!storage) return false;
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify(profile));
        return true;
      } catch (error) {
        return false;
      }
    }

    function read() {
      const at = now().toISOString();
      let raw;
      try {
        raw = storage ? storage.getItem(STORAGE_KEY) : null;
      } catch (error) {
        memory = memory || freshProfile(at, uuid);
        return memory;
      }
      if (raw === null || raw === undefined) {
        memory = memory || freshProfile(at, uuid);
        return memory;
      }
      let parsed = null;
      try {
        parsed = JSON.parse(raw);
      } catch (error) {
        parsed = null;
      }
      if (!recognised(parsed)) {
        // Never throw a save away: keep it under a backup key, then start over.
        try {
          storage.setItem(`${BACKUP_PREFIX}${Date.parse(at)}`, raw);
        } catch (error) {
          // A fresh profile is still better than none.
        }
        memory = freshProfile(at, uuid);
        write(memory);
        return memory;
      }
      memory = upgrade(parsed, at, uuid);
      return memory;
    }

    function commit(profile) {
      profile.updatedAt = now().toISOString();
      if (profile.history.length > HISTORY_LIMIT) {
        profile.history = profile.history.slice(-HISTORY_LIMIT);
      }
      memory = profile;
      return write(profile);
    }

    function recordRace(result) {
      const profile = read();
      const at = now().toISOString();
      const award = raceAward(result);
      const rating = rateRace({
        rating: profile.rating,
        ratedRaces: profile.ratedRaces,
        position: result.position,
        fieldSize: result.fieldSize,
        difficulty: result.difficulty,
      });
      const lap = isNumber(result.bestLapMs) && result.bestLapMs > 0 ? result.bestLapMs : null;

      profile.careerPoints += award.careerPoints;
      profile.rating = rating.after;
      profile.ratedRaces += 1;
      profile.totals.races += 1;
      if (result.position === 1) profile.totals.wins += 1;
      if (result.position >= 1 && result.position <= 3) profile.totals.podiums += 1;

      let newBestLap = null;
      if (lap !== null) {
        const previous = profile.bestLaps[result.trackId];
        if (!previous || lap < previous.ms) {
          profile.bestLaps[result.trackId] = {
            ms: lap, at, difficulty: result.difficulty, driverId: result.driverId, teamId: result.teamId,
          };
          newBestLap = { trackId: result.trackId, ms: lap, previousMs: previous ? previous.ms : null };
        }
      }

      profile.history.push({
        id: uuid(),
        type: "race",
        at,
        cupId: result.cupId,
        cupRunId: result.cupRunId,
        raceIndex: result.raceIndex,
        trackId: result.trackId,
        difficulty: result.difficulty,
        driverId: result.driverId,
        teamId: result.teamId,
        position: result.position,
        fieldSize: result.fieldSize,
        bestLapMs: lap,
        fastestLap: Boolean(result.fastestLap),
        racePoints: award.racePoints,
        careerPointsEarned: award.careerPoints,
        ratingBefore: rating.before,
        ratingAfter: rating.after,
      });

      const saved = commit(profile);
      return {
        racePoints: award.racePoints,
        multiplier: award.multiplier,
        careerPoints: award.careerPoints,
        careerTotal: profile.careerPoints,
        rating: { before: rating.before, after: rating.after, delta: rating.delta },
        tier: tierFor(rating.after),
        newBestLap,
        saved,
      };
    }

    function recordCup(result) {
      const profile = read();
      const award = cupAward(result);
      const existing = result.cupRunId
        && profile.history.find((entry) => entry.type === "cup" && entry.cupRunId === result.cupRunId);
      if (existing) {
        return {
          bonus: award.bonus,
          multiplier: award.multiplier,
          careerPoints: existing.careerPointsEarned,
          careerTotal: profile.careerPoints,
          alreadyRecorded: true,
          saved: true,
        };
      }
      profile.careerPoints += award.careerPoints;
      profile.totals.cupsCompleted += 1;
      if (result.position === 1) profile.totals.cupsWon += 1;
      profile.history.push({
        id: uuid(),
        type: "cup",
        at: now().toISOString(),
        cupId: result.cupId,
        cupRunId: result.cupRunId,
        difficulty: result.difficulty,
        position: result.position,
        cupPoints: result.cupPoints,
        careerPointsEarned: award.careerPoints,
      });
      const saved = commit(profile);
      return {
        bonus: award.bonus,
        multiplier: award.multiplier,
        careerPoints: award.careerPoints,
        careerTotal: profile.careerPoints,
        alreadyRecorded: false,
        saved,
      };
    }

    return {
      recordRace,
      recordCup,
      getProfile: () => clone(read()),
      startCupRun: () => uuid(),
    };
  }

  function browserStorage() {
    try {
      return root.localStorage || null;
    } catch (error) {
      return null;
    }
  }

  const api = {
    START_RATING,
    DIFFICULTY_NAMES,
    STORAGE_KEY,
    BACKUP_PREFIX,
    PROFILE_VERSION,
    HISTORY_LIMIT,
    multiplierFor,
    raceAward,
    cupAward,
    rateRace,
    tierFor,
    createCareer,
  };
  // In the page, Career.recordRace etc. work straight away on localStorage.
  if (typeof root.document !== "undefined") Object.assign(api, createCareer({ storage: browserStorage() }));
  return api;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — 24 tests (8 from Task 1, 16 here), 0 failures.

If `recordRace awards points...` fails on the `id-2` expectation, check that `freshProfile` is the only `uuid()` call before the history entry; the fresh profile consumes `id-1`.

- [ ] **Step 5: Commit**

```bash
git add career.js tests/career.store.test.js
git commit -m "Add the local career profile store"
```

---

### Task 3: Record races and cups from the game, and show what was earned

**Files:**
- Modify: `index.html` (load `career.js`; add two strips)
- Modify: `game.js` (`ui` map, `state`, `startCup`, `finalizeRace`, `showResults`, `showPodium`)
- Modify: `styles.css` (strip styles)

**Interfaces:**
- Consumes: `window.Career.startCupRun()`, `window.Career.recordRace(result)`, `window.Career.recordCup(result)`, `window.Career.DIFFICULTY_NAMES` (Task 2).
- Produces: `state.cupRunId`, `state.cupRecordedFor`, `state.lastRaceCareer`, `state.lastCupCareer`; DOM nodes `#results-career`, `#podium-career`. Task 4 relies on `renderCareerPanel()` being callable after records; Task 3 calls it only if it exists (`typeof renderCareerPanel === "function"`), so Task 3 works on its own.

- [ ] **Step 1: Load `career.js` and add the strips**

In `index.html`, change the script tags at the end of `<body>`:

```html
  <script src="./tracks-data.js"></script>
  <script src="./career.js"></script>
  <script src="./game.js"></script>
```

In the results modal, add the strip between `#results-table` and `.modal-actions`:

```html
      <div id="results-table" class="results-table"></div>
      <div id="results-career" class="career-strip hidden" aria-live="polite"></div>
      <div class="modal-actions">
```

In the podium modal, add the strip between `#podium-scene` and `.modal-actions`:

```html
      <div id="podium-scene" class="podium-scene"></div>
      <div id="podium-career" class="career-strip hidden" aria-live="polite"></div>
      <div class="modal-actions">
```

- [ ] **Step 2: Add the `ui` references and state fields**

In `game.js`, in the `ui` object (top of the file), add after `restartButton`:

```js
  resultsCareer: document.getElementById("results-career"),
  podiumCareer: document.getElementById("podium-career"),
```

In the `state` object, add after `raceIndex: 0,`:

```js
  cupRunId: null,
  cupRecordedFor: null,
  lastRaceCareer: null,
  lastCupCareer: null,
```

- [ ] **Step 3: Start a cup run**

In `startCup()`, after `buildCupEntries();` add:

```js
  // One id per cup attempt ties its races to its cup bonus (see career.js).
  state.cupRunId = window.Career ? window.Career.startCupRun() : null;
  state.cupRecordedFor = null;
```

- [ ] **Step 4: Record the player's race**

In `game.js`, add these functions just above `function finalizeRace()`:

```js
// The player's race, handed to the career profile. Called once per race, from
// finalizeRace, so a race abandoned before the flag is never recorded.
function recordPlayerRace(finishers, fastest) {
  const player = finishers.find((racer) => racer.isPlayer);
  if (!player || !window.Career) return null;
  try {
    return window.Career.recordRace({
      cupId: getActiveCup().id,
      cupRunId: state.cupRunId,
      raceIndex: state.raceIndex,
      trackId: state.track.id,
      difficulty: getDifficulty().id,
      driverId: player.driver.id,
      teamId: player.kart.id,
      position: finishers.indexOf(player) + 1,
      fieldSize: finishers.length,
      bestLapMs: player.bestLapTime || 0,
      fastestLap: Boolean(fastest && fastest.id === player.id),
    });
  } catch (error) {
    console.warn("Career: race not recorded", error);
    return null;
  }
}

function careerDifficultyName(id) {
  return (window.Career && window.Career.DIFFICULTY_NAMES[id]) || id;
}

function renderCareerStrip(node, lines, saved) {
  if (!node) return;
  if (!lines.length) {
    node.innerHTML = "";
    node.classList.add("hidden");
    return;
  }
  const warning = saved === false
    ? `<p class="career-strip-warning">Progress couldn't be saved in this browser.</p>`
    : "";
  node.innerHTML = lines.map((line) => `<p>${line}</p>`).join("") + warning;
  node.classList.remove("hidden");
}

function renderRaceCareer(summary) {
  if (!summary) {
    renderCareerStrip(ui.resultsCareer, [], true);
    return;
  }
  const difficulty = careerDifficultyName(getDifficulty().id);
  const { before, after, delta } = summary.rating;
  const trend = delta > 0 ? `▲ +${delta}` : delta < 0 ? `▼ ${delta}` : "=";
  const lines = [
    `<strong>+${summary.careerPoints} career points</strong> (${summary.racePoints} × ${difficulty} ×${summary.multiplier})`,
    `Rating ${before} → <strong>${after}</strong> ${trend} · ${summary.tier}`,
  ];
  if (summary.newBestLap) {
    lines.push(`New best at ${state.track.name}: <strong>${formatLapTime(summary.newBestLap.ms)}</strong>`);
  }
  renderCareerStrip(ui.resultsCareer, lines, summary.saved);
}
```

In `finalizeRace()`, after the fastest-lap block (the `if (fastest && finishers.indexOf(fastest) < 10) { ... }` block) and before `state.cupEntries.sort(...)`, add:

```js
  state.lastRaceCareer = recordPlayerRace(finishers, fastest);
  if (typeof renderCareerPanel === "function") renderCareerPanel();
```

In `showResults(finishers)`, just before `ui.resultsModal.classList.remove("hidden");`, add:

```js
  renderRaceCareer(state.lastRaceCareer);
```

- [ ] **Step 5: Record the cup, exactly once**

In `showPodium()`, just before `ui.podiumModal.classList.remove("hidden");`, add:

```js
  // Guarded here and again inside career.js by cupRunId, so showing the podium
  // again can never add the bonus twice.
  if (window.Career && state.cupRunId && state.cupRecordedFor !== state.cupRunId) {
    state.cupRecordedFor = state.cupRunId;
    const playerEntry = state.cupEntries.find((entry) => entry.isPlayer);
    try {
      state.lastCupCareer = playerEntry ? window.Career.recordCup({
        cupId: activeCup.id,
        cupRunId: state.cupRunId,
        difficulty: getDifficulty().id,
        position: state.cupEntries.indexOf(playerEntry) + 1,
        cupPoints: playerEntry.points,
      }) : null;
    } catch (error) {
      console.warn("Career: cup not recorded", error);
      state.lastCupCareer = null;
    }
    if (typeof renderCareerPanel === "function") renderCareerPanel();
  }
  const cup = state.lastCupCareer;
  renderCareerStrip(ui.podiumCareer, cup && cup.bonus > 0
    ? [`<strong>Cup ${formatOrdinal(state.cupEntries.findIndex((entry) => entry.isPlayer) + 1)} bonus +${cup.careerPoints}</strong> (${cup.bonus} × ${careerDifficultyName(getDifficulty().id)} ×${cup.multiplier}) · Career total ${cup.careerTotal.toLocaleString()}`]
    : [], cup ? cup.saved : true);
```

- [ ] **Step 6: Style the strips**

Append to `styles.css`:

```css
/* What a race or cup earned, under the results table and the podium. */
.career-strip {
  margin-top: 14px;
  padding: 12px 14px;
  border-radius: 10px;
  background: rgba(220, 0, 0, 0.08);
  border: 1px solid rgba(220, 0, 0, 0.28);
  line-height: 1.55;
  color: #f0f0f0;
}

.career-strip p {
  margin: 0;
}

.career-strip strong {
  color: #fff;
}

.career-strip-warning {
  margin-top: 6px !important;
  color: #ffb4a8;
  font-size: 0.85rem;
}
```

- [ ] **Step 7: Check the page loads and the unit tests still pass**

Run: `node --check game.js && npm test`
Expected: no syntax errors; 24 tests pass.

With the dev server running (`python3 -m http.server 8765` from the repo root), load `http://localhost:8765` and confirm in the browser console that `typeof Career.recordRace === "function"` and there are no errors.

- [ ] **Step 8: Commit**

```bash
git add index.html game.js styles.css
git commit -m "Record races and cups to the career profile and show what was earned"
```

---

### Task 4: Career panel in the garage

**Files:**
- Modify: `index.html` (Career subpanel in the garage)
- Modify: `game.js` (`ui` refs, `renderCareerPanel`, calls at start-up and on return to the garage)
- Modify: `styles.css`

**Interfaces:**
- Consumes: `window.Career.getProfile()`, `window.Career.tierFor(rating)` (Tasks 1–2); `TRACKS`, `formatLapTime` (existing in `game.js`).
- Produces: `renderCareerPanel()` (global function in `game.js`, already called conditionally by Task 3).

- [ ] **Step 1: Add the panel markup**

In `index.html`, inside `<section class="panel garage-panel">`, insert this subpanel immediately before the Controls subpanel (the `<section class="subpanel">` whose eyebrow is `Controls`):

```html
        <section class="subpanel" id="career-panel">
          <div class="subpanel-heading">
            <p class="eyebrow">Career</p>
            <strong id="career-tier">F4 · 1200</strong>
          </div>
          <div id="career-stats" class="career-stats"></div>
          <p class="eyebrow career-bests-title">Best laps</p>
          <div id="career-bests" class="career-bests"></div>
        </section>
```

- [ ] **Step 2: Add the renderer**

In `game.js`, add to the `ui` object:

```js
  careerTier: document.getElementById("career-tier"),
  careerStats: document.getElementById("career-stats"),
  careerBests: document.getElementById("career-bests"),
```

Add this function just below `renderRaceCareer` (added in Task 3):

```js
// Career panel in the garage: totals, rating and the best lap on each circuit.
function renderCareerPanel() {
  if (!window.Career || !ui.careerStats) return;
  const profile = window.Career.getProfile();
  const totals = profile.totals;
  ui.careerTier.textContent = `${window.Career.tierFor(profile.rating)} · ${profile.rating}`;
  const stats = [
    ["Career points", profile.careerPoints.toLocaleString()],
    ["Rating", profile.rating],
    ["Races", totals.races],
    ["Wins", totals.wins],
    ["Podiums", totals.podiums],
    ["Cups won", `${totals.cupsWon} / ${totals.cupsCompleted}`],
  ];
  ui.careerStats.innerHTML = stats.map(([label, value]) => `
    <div class="career-stat"><span>${label}</span><strong>${value}</strong></div>
  `).join("");
  ui.careerBests.innerHTML = TRACKS.map((track) => {
    const best = profile.bestLaps[track.id];
    return `<div class="career-best"><span>${track.name}</span><strong>${best ? formatLapTime(best.ms) : "—"}</strong></div>`;
  }).join("");
}
```

At the bottom of `game.js`, in the start-up calls, add `renderCareerPanel();` after `renderGarage();`:

```js
renderGarage();
renderCareerPanel();
```

In `resetToGarage()`, add at the end of the function (after `addFeed("Back in the pit lane.");`):

```js
  renderCareerPanel();
```

- [ ] **Step 3: Style the panel**

Append to `styles.css`:

```css
/* Career panel in the garage. */
.career-stats,
.career-bests {
  display: grid;
  gap: 8px;
}

.career-stats {
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
}

.career-bests {
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
}

.career-bests-title {
  margin: 14px 0 8px;
}

.career-stat,
.career-best {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 9px 11px;
  border-radius: 8px;
  background: rgba(8, 8, 18, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.career-stat span,
.career-best span {
  font-size: 0.72rem;
  color: rgba(240, 240, 240, 0.6);
}

.career-stat strong,
.career-best strong {
  font-size: 1rem;
  color: #fff;
}
```

- [ ] **Step 4: Check it renders**

Run: `node --check game.js`
Expected: no output.

Load `http://localhost:8765` (hard refresh). The garage shows a Career panel headed **`F4 · 1200`** (1200 is in the F4 band), six stat cards (Career points 0, Rating 1200, Races 0, Wins 0, Podiums 0, Cups won 0 / 0) and eight best-lap cards, each showing "—". Check it at a narrow window width (about 700px) as well: cards wrap, nothing overflows (standing responsive-view requirement).

- [ ] **Step 5: Commit**

```bash
git add index.html game.js styles.css
git commit -m "Add a Career panel to the garage"
```

---

### Task 5: Verify in the browser, document, push

**Files:**
- Create: `.playwright-mcp/career-check.js` (throwaway harness; `.playwright-mcp/` is git-ignored)
- Modify: `README.md`

**Interfaces:**
- Consumes: everything above; the game globals `state`, `CUPS`, `startCup`, `startRace`, `updateRace`, `getPlayer`, `nextRace`, `showPodium`, `resetToGarage`.
- Produces: verified behaviour, README section, pushed `main`.

- [ ] **Step 1: Write the browser harness**

Create `.playwright-mcp/career-check.js`. It clears the profile, runs a full four-race cup with every car on autopilot, shows the podium twice, then starts a race and quits it:

```js
async (page) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("http://localhost:8765/?" + Date.now());
  await page.waitForTimeout(1000);
  return await page.evaluate(() => {
    localStorage.removeItem("f1pixelcup.profile");
    const runRace = () => {
      state.racers.forEach((r) => { r.isPlayer = r.id === state.playerId ? true : false; });
      const player = getPlayer();
      player.isPlayer = false; // autopilot for the drive
      state.phase = "race";
      let now = 100000;
      state.raceStart = now;
      state.racers.forEach((r) => { r.lapStartAt = now; });
      for (let t = 0; t < 900 && !state.resultsQueued; t += 1 / 60) {
        now += 1000 / 60;
        if (state.racers.every((r) => r.finished)) player.isPlayer = true; // restore before scoring
        updateRace(1 / 60, now);
      }
    };
    const strips = [];
    startCup();
    for (let race = 0; race < 4; race += 1) {
      runRace();
      strips.push(document.getElementById("results-career").innerText);
      nextRace();
    }
    const afterCup = Career.getProfile();
    showPodium();
    const afterSecondPodium = Career.getProfile();
    const podiumStrip = document.getElementById("podium-career").innerText;
    resetToGarage();
    // A race quit before the flag records nothing.
    startCup();
    const before = Career.getProfile().totals.races;
    state.phase = "race";
    for (let i = 0; i < 120; i += 1) updateRace(1 / 60, 200000 + i * 16);
    resetToGarage();
    const afterQuit = Career.getProfile().totals.races;
    return {
      strips,
      podiumStrip,
      races: afterCup.totals.races,
      cupsCompleted: afterCup.totals.cupsCompleted,
      careerAfterCup: afterCup.careerPoints,
      careerAfterSecondPodium: afterSecondPodium.careerPoints,
      historyTypes: afterCup.history.map((h) => h.type),
      bestLaps: Object.keys(afterCup.bestLaps),
      quitRecorded: afterQuit - before,
      panel: document.getElementById("career-tier").innerText,
    };
  }).then((result) => ({ ...result, errors }));
}
```

Note: `updateRace` finalises the race itself when every car has finished (it calls `finalizeRace`, which calls `recordPlayerRace`). The harness flips the player back to `isPlayer = true` before that final frame so `recordPlayerRace` can find the player. If the harness finds `races: 0`, check that `isPlayer` is `true` on the player when `finalizeRace` runs.

- [ ] **Step 2: Run it**

With the dev server running, run the harness through the Playwright MCP tool `browser_run_code_unsafe` with `filename: ".playwright-mcp/career-check.js"`.

Expected:
- `errors`: `[]`
- `races`: `4`, `cupsCompleted`: `1`
- `historyTypes`: `["race","race","race","race","cup"]`
- `careerAfterSecondPodium` equals `careerAfterCup` (bonus added once)
- each entry of `strips` contains `career points` and `Rating 1200` for the first race
- `bestLaps` lists the four Trophy Cup circuits (`monza`, `spa`, `silverstone`, `suzuka`)
- `quitRecorded`: `0`
- `panel` matches the tier and rating in the last strip

- [ ] **Step 3: Check the strips and panel by eye**

Take screenshots of the results modal after a race and of the garage Career panel at a normal and a narrow window width. Confirm the strip sits under the results table without overflowing, and the panel cards wrap cleanly.

- [ ] **Step 4: Document it**

In `README.md`, add this section directly after the `## Heads-up display` section:

```markdown
## Career

Your progress is saved in the browser and carries across sessions (and will
upload to your account when accounts arrive).

- **Career points** only go up: each race's F1 points (plus the fastest-lap
  point in the top ten) × difficulty — Rookie ×1, Pro ×2, Legend ×3 — and a
  cup bonus of 50 / 30 / 20 for finishing the cup 1st / 2nd / 3rd, also
  scaled by difficulty.
- **Rating** goes up and down. You start at 1200; each difficulty is a
  fixed-strength field (Rookie 1000, Pro 1400, Legend 1800), and your finishing
  position against it moves your rating Elo-style. Tiers run Karting, F4, F3,
  F2, F1 and World Champion (1850+).
- **Best laps** on every circuit, and a full race history.
- The garage shows your career; the results and podium screens show what each
  race and cup earned.

Run the scoring tests with `npm test` (Node 22, no dependencies).
```

Also add `career.js` and `tests/` to the Project Structure tree, under `render3d.js`:

```
├── career.js       # Career points, rating, best laps and the saved profile
├── tests/          # Unit tests for career.js (npm test)
```

- [ ] **Step 5: Run everything once more**

Run: `npm test && node --check game.js`
Expected: 24 tests pass, no syntax errors.

- [ ] **Step 6: Commit and push**

```bash
git add README.md
git commit -m "Document the career system"
git push origin main
```
