# One career per driver — design

Date: 2026-09-29 · Stage 3 of `docs/superpowers/plans/2026-09-28-roadmap.md` · built autonomously (the user's standing instruction).

## Why

The user wants each driver to have their own career instead of one shared one, "to make this more sticky and make users have to keep racing". Racing as Hamilton should build Hamilton's career; Leclerc's stays his own. This needs no Supabase: the profile stays local in this browser. When accounts arrive, the whole profile, every driver included, uploads under the account.

## What the player sees

- **The game remembers the driver.** It opens on the driver picked last. If none was picked, it opens on the driver raced last, and Leclerc before any racing. A `play.html?driver=<id>` link, such as the site's "Open career", picks that driver.
- **The pit lane career chip** shows the *selected* driver's career, for example "LECLERC · F3 1352 · 184 PTS". A driver never raced shows "NEW CAREER · F4 1200".
- **The career screen** (Career, or `play.html#career`) shows the selected driver's career:
  - the tier, rating, points, races, wins, podiums, poles and cups;
  - their best laps and their recent races.
  - Under it, **Your drivers** lists every driver raced with their tier, rating, points, races and wins, sorted by rating. Choosing a row between cups selects that driver, including when the screen was opened from the site's link. It works by mouse or keyboard, and focus moves to the career chip afterwards.
- **Results and podium strips** name the driver being raced by surname, as the chip does, for example "Leclerc: +52 career points …".
- **The landing page's career section** becomes **Your drivers**:
  - a feature card for the driver raced most recently (by the latest race if that isn't on record), whose "Open career" link opens that driver;
  - a compact row for each other driver raced.
  - The empty state explains that every driver starts their own career at 1200 · F4.
- **How to play and the README** say it: one career per driver, each starting at 1200 · F4.

## Rules (unchanged per driver)

- Career points, rating (Elo against a fixed field per difficulty), tiers, qualifying points and poles, cup bonus, best laps and history all work exactly as before, but each is kept **per driver**.
- A race counts for the driver who drove it.
- A cup counts for the driver who drove its races.

## Data: profile v2

`f1pixelcup.profile.v2` (v1 lived at `f1pixelcup.profile`):

```
{ version: 2, profileId, createdAt, updatedAt, lastDriverId,
  drivers: { [driverId]: { driverId, careerPoints, rating, ratedRaces,
                           totals: { races, wins, podiums, cupsCompleted, cupsWon, poles },
                           bestLaps: { [trackId]: { ms, at, difficulty, teamId } },
                           history: [ … race and cup entries, as in v1 … ] } } }
```

**Migrating v1 to v2.** Nothing is lost, and the result is deterministic.

1. The v1 save stays exactly where it is, untouched. It is the backup, so no second copy is spent on storage, and a tab still running the old game writes there without touching v2. If the v2 profile can't be written, the session plays from memory and doesn't migrate again on every read.
2. The v1 history is replayed in order.
   - **A race** goes to its `driverId`:
     - its career points, including qualifying points, are added;
     - the driver's own rating is recomputed with `rateRace` from the race's position, field size and difficulty, starting at 1200 per driver, and the entry's `ratingBefore`/`ratingAfter` are rewritten to match;
     - totals, poles and best laps are rebuilt from the entry.
   - **A cup** goes to the driver whose races share its `cupRunId`. If none do, it goes to the driver of the latest race before it.
   - **A cup with no owner yet, or any other entry**, goes to the driver of the race before it; failing that, the race after it; failing that, the heir (step 3).
   - A race with no valid driver belongs to the previous race's driver, and is marked with that driver.
   - A trimmed history starts part-way through a career, so the replay starts from the first race's `ratingBefore`.
3. Anything the history can't explain goes to the **most-raced driver**, the heir. This covers:
   - points or totals beyond what the history adds up to (trimmed or hand-made saves);
   - rated races the history no longer shows;
   - a rating with no rated races in the history.
   - If there's no history, the heir is Leclerc, the game's default driver.
   - When the history adds up to *more* than the v1 totals (only a hand edit can do that), the history stands and nothing is taken away.
   - A best lap that names its driver goes to that driver.
   - A driver left with nothing at all is not a career.
4. `lastDriverId` is the driver of the last race, or else the heir, or Leclerc.

**Driver ids** are plain names (`/^[a-z][a-z0-9_-]{0,39}$/i`), never a name every object already has (`constructor`, `__proto__`, …). Anything else in a save is ignored, and `recordRace`/`recordCup` refuse it.

## API (`career.js`)

- `recordRace(result)` records against `result.driverId`, which is required.
- `recordCup(result)` requires `result.driverId`. It is added once per `cupRunId` across the whole profile, and the summary is unchanged.
- `getProfile()` returns a copy of the v2 profile.
- `getDriver(driverId)` returns a copy of that driver's career, or a fresh one at 1200 · F4 if they've never raced.
- `lastDriverId()` returns the driver raced last, or null.
- `listDrivers()` returns `[{ driverId, careerPoints, rating, tier, races, wins, lastRaceAt }]` sorted by rating, highest first.
- `startCupRun()` is unchanged.
- All the storage safety stays:
  - a fresh read before every record, so a second tab isn't overwritten;
  - a single write;
  - a corrupt save is backed up and never deleted;
  - a save from a newer version is left untouched;
  - failed saves keep adding up in memory;
  - a history cap of 5000 entries **in total**, across every driver, oldest first;
  - when storage is full, the oldest half of the history makes room once, and the save is tried again. The totals, points and ratings are kept whole; only the log is shortened.

## Tests

- Node `tests/career.store.test.js`, rewritten for v2:
  - records go to the right driver and drivers are independent;
  - cups follow their driver and are added once;
  - two-tab reads;
  - corrupt, newer and throwing storage;
  - quota failures;
  - `getDriver` of an unknown driver, and `listDrivers` ordering.
- Node, migration:
  - a mixed v1 history splits exactly, with ratings replayed per driver;
  - cups are attributed by `cupRunId`;
  - leftovers go to the most-raced driver;
  - an empty v1 save goes to Leclerc;
  - the v1 backup is written;
  - a backup failure leaves the save untouched;
  - bad field types are repaired;
  - migrating twice changes nothing.
- Browser `tools/checks/career-check.js`, extended:
  - racing as two drivers keeps two careers;
  - the chip follows the selected driver;
  - the career screen lists Your drivers, and choosing a row selects the driver.
- `landing-check.js`: Your drivers renders from a v2 profile, and from a v1 profile through migration.
- All other checks still pass.
