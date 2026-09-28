# Scoring and career — design

Date: 2026-09-27
Status: approved in conversation, awaiting written-spec review

## Context

F1 Pixel Cup is a static Three.js + canvas racing game (no build step,
deployed from GitHub). Today the only scoring is the cup championship: F1
points (25-18-15-12-10-8-6-4-2-1, plus 1 for the fastest lap inside the top
ten) that reset with every cup. Nothing is saved between sessions except the
difficulty and sound settings.

This is step 1 of a four-step roadmap:

1. **Scoring model** (this spec) — career points, skill rating, records. Local.
2. Accounts and saved records — login, profile uploaded to a backend (Supabase).
3. Website overhaul — home, play, profile/history, leaderboards.
4. Global competition — leaderboards, later ghosts or head-to-head.

Step 1 must work entirely offline and be shaped so step 2 can upload it
without changes to the game code.

## Decisions (from the user)

- Two numbers: **career points** for progression and a separate **skill
  rating** for fair rankings.
- Career points come from **race results scaled by difficulty**, plus a cup
  bonus. No points for in-race actions.
- The rating is measured **against the AI field**, each difficulty being a
  fixed-strength opponent. Best lap per circuit is kept as a separate record.
- **Local first**: the profile lives in the browser now and is uploaded to the
  player's account when accounts arrive; nothing earned before then is lost.
- Implementation approach: a separate **`career.js` module**, called from two
  points in `game.js`.

## Rules

### Career points

Career points only ever increase.

- **Per race:** the player's F1 race points (from `POINTS_TABLE`, plus the
  1-point fastest-lap bonus when the player set the fastest lap and finished in
  the top ten) multiplied by the difficulty multiplier.
- **Per completed cup:** a bonus for the player's final cup championship
  position: 1st = 50, 2nd = 30, 3rd = 20, otherwise 0, multiplied by the
  difficulty multiplier.
- **Difficulty multiplier:** Rookie ×1, Pro ×2, Legend ×3.
- A race abandoned before the flag (quit from pause, back to pit lane) earns
  nothing and is not recorded. Races already completed in that cup keep what
  they earned. A cup that is not completed earns no cup bonus.
- The difficulty used is the one the race was run on.

### Skill rating

Elo-style, rises and falls.

- New profiles start at **1200**.
- Field strength by difficulty: **Rookie 1000, Pro 1400, Legend 1800**.
- Actual score from finishing position `p` in a field of `n` cars:
  `S = (n - p) / (n - 1)` — 1 for a win, 0 for last.
- Expected score: `E = 1 / (1 + 10 ^ ((field - rating) / 400))`.
- Change: `Δ = K × (S − E)`, rounded to the nearest whole number.
  `K = 40` for the player's first 10 rated races, then `24`.
- Every completed race is rated, including races in a cup that is later
  abandoned.
- Worked examples at 1200 with K = 40: Legend win +39, Legend 10th +20,
  Pro win +30, Pro last −10, Rookie win +10, Rookie last −30.

### Tier names

Displayed with the rating, derived from it (never stored):

| Rating | Tier |
|---|---|
| below 1100 | Karting |
| 1100–1299 | F4 |
| 1300–1499 | F3 |
| 1500–1699 | F2 |
| 1700–1849 | F1 |
| 1850 and above | World Champion |

### Records

- **Best lap per circuit**: the player's fastest single lap on each circuit,
  any difficulty, with the difficulty, date, driver and team it was set with.
  Only laps timed at normal speed count (the game already excludes
  fast-forwarded laps).
- **Totals**: races, wins, podiums (top three), cups completed, cups won.

## Saved profile

Stored in `localStorage` under `f1pixelcup.profile` as JSON:

```json
{
  "version": 1,
  "profileId": "uuid",
  "createdAt": "ISO timestamp",
  "updatedAt": "ISO timestamp",
  "careerPoints": 0,
  "rating": 1200,
  "ratedRaces": 0,
  "totals": { "races": 0, "wins": 0, "podiums": 0, "cupsCompleted": 0, "cupsWon": 0 },
  "bestLaps": {
    "monza": { "ms": 38214, "at": "ISO", "difficulty": "pro", "driverId": "verstappen", "teamId": "redBull" }
  },
  "history": [
    {
      "id": "uuid",
      "type": "race",
      "at": "ISO timestamp",
      "cupId": "trophyCup",
      "cupRunId": "uuid",
      "raceIndex": 0,
      "trackId": "monza",
      "difficulty": "pro",
      "driverId": "verstappen",
      "teamId": "redBull",
      "position": 3,
      "fieldSize": 20,
      "bestLapMs": 38214,
      "fastestLap": false,
      "racePoints": 15,
      "careerPointsEarned": 30,
      "ratingBefore": 1200,
      "ratingAfter": 1226
    },
    {
      "id": "uuid",
      "type": "cup",
      "at": "ISO timestamp",
      "cupId": "trophyCup",
      "cupRunId": "uuid",
      "difficulty": "pro",
      "position": 1,
      "cupPoints": 92,
      "careerPointsEarned": 100
    }
  ]
}
```

- Every history entry has a unique `id` so an upload can skip duplicates.
- `cupRunId` ties the races of one cup attempt to its cup entry.
- History is the record of truth; totals are kept alongside it so the garage
  never has to replay history. History is capped at the newest 5,000 entries;
  totals are unaffected by the cap.
- `version` lets the format change later. Loading a profile with an older
  version runs an upgrade step; a newer or unrecognised version is treated as
  corrupt (below).
- IDs come from `crypto.randomUUID()`, with a timestamp-plus-random fallback
  where that is unavailable.

## Architecture

### `career.js`

A classic script (the game has no build step and `game.js` is a classic
script) that defines `window.Career`, and also exports the same object via
`module.exports` when loaded in Node for tests. It has no DOM or rendering
code.

Two layers:

- **Rules** — pure functions, no storage:
  - `raceAward({ position, fieldSize, fastestLap, difficulty })` → `{ racePoints, multiplier, careerPoints }`
  - `cupAward({ position, difficulty })` → `{ bonus, multiplier, careerPoints }`
  - `rateRace({ rating, ratedRaces, position, fieldSize, difficulty })` → `{ before, after, delta, expected, actual }`
  - `tierFor(rating)` → tier name
- **Profile store** — load, update and save the profile through a storage
  object passed in (defaults to `window.localStorage`, a fake in tests):
  - `Career.recordRace(result)` → summary of what was earned, including
    `{ careerPoints, racePoints, multiplier, rating: { before, after, delta }, newBestLap, tier, saved }`
  - `Career.recordCup(result)` → `{ bonus, careerPoints, multiplier, saved }`
  - `Career.getProfile()` → a copy of the current profile for display
  - `Career.startCupRun()` → a fresh `cupRunId`

### Hooks in `game.js`

- `startCup()` calls `Career.startCupRun()` and keeps the id in `state`.
- `finalizeRace()` builds the player's result (position, field size, best lap,
  whether they set the fastest lap, track, cup, race index, difficulty, driver,
  team) and calls `Career.recordRace`. The returned summary is kept in `state`
  for the results screen.
- `showPodium()` calls `Career.recordCup` with the player's final cup
  position, once per cup run (guarded so re-showing the podium cannot double
  count).
- Only the player's car is recorded. AI results are used for the maths and not
  saved.
- `game.js` never reads or writes the profile directly.

`index.html` loads `career.js` before `game.js`.

## Display

- **Race results modal**: a strip below the table, e.g.
  `+30 career points (15 × Pro ×2) · Rating 1200 → 1226 ▲ F4`, plus
  `New best at Monza: 0:38.214` when a personal best was set.
- **Podium modal**: the cup bonus in the same style, e.g.
  `Cup win bonus +100 (50 × Pro ×2)`.
- **Garage**: a Career panel with career points, rating and tier, races, wins,
  podiums and cups won, and a list of the player's best lap on each of the
  eight circuits (a dash where none is set).
- The race HUD is unchanged.

## Error handling

- **Storage unavailable** (private browsing, blocked, quota): the game plays
  normally and the results strip still shows what was earned, with a note that
  progress could not be saved. `recordRace` / `recordCup` report
  `saved: false`; they never throw into the game.
- **Corrupt or unrecognised save**: the raw value is copied to
  `f1pixelcup.profile.backup.<timestamp>` (never deleted), and a fresh profile
  starts.
- **Atomic writes**: the whole profile is serialised and written with one
  `setItem`, so a crash cannot leave a half-written profile.

## Testing

- **Unit tests** for `career.js` with Node's built-in test runner
  (`node --test`), no new dependencies: race and cup awards at each
  difficulty, fastest-lap bonus rules, rating maths against the worked
  examples, the K-factor switch after 10 races, tier boundaries, best-lap
  updates, history cap, corrupt-save backup, storage failure, and the version
  upgrade path.
- **In-game check**: a headless race in the browser with the player on
  autopilot confirms a finished race updates the profile and the results
  strip, a completed cup adds the bonus exactly once, and quitting mid-race
  records nothing.

## Out of scope

- Accounts, upload and sync (step 2).
- Leaderboards, anti-cheat, server-side verification (steps 2 and 4).
- Website redesign (step 3).
- Achievements or badges.
- Any change to race physics, AI or the in-race HUD.
