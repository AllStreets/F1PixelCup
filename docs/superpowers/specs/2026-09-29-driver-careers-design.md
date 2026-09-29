# One career per driver — design

Date: 2026-09-29 · Stage 3 of `docs/superpowers/plans/2026-09-28-roadmap.md` · built autonomously (the user's standing instruction).

## Why

The user wants each driver to have their own career instead of one shared one, "to make this more sticky and make users have to keep racing". Racing as Hamilton should build Hamilton's career; Leclerc's stays his own. This needs no Supabase: the profile stays local in this browser. When accounts arrive, the whole profile, every driver included, uploads under the account.

## What the player sees

- **The pit lane career chip** shows the *selected* driver's career, for example "LECLERC · F3 1352 · 184 PTS". A driver never raced shows "NEW CAREER · F4 1200".
- **The career screen** (Career, or `play.html#career`) shows the selected driver's career:
  - the tier, rating, points, races, wins, podiums, poles and cups;
  - their best laps and their recent races.
  - Under it, **Your drivers** lists every driver raced with their tier, rating, points, races and wins, sorted by rating. Choosing a row in the pit lane selects that driver.
- **Results and podium strips** show the driver being raced, for example "Leclerc: +52 career points …".
- **The landing page's career section** becomes **Your drivers**:
  - a feature card for the driver raced most recently (Leclerc when there's no history, as the favourite);
  - a compact row for each other driver raced.
  - The empty state explains that every driver starts their own career at 1200 · F4.
- **How to play and the README** say it: one career per driver, each starting at 1200 · F4.

## Rules (unchanged per driver)

- Career points, rating (Elo against a fixed field per difficulty), tiers, qualifying points and poles, cup bonus, best laps and history all work exactly as before, but each is kept **per driver**.
- A race counts for the driver who drove it.
- A cup counts for the driver who drove its races.

## Data: profile v2

`f1pixelcup.profile`:

```
{ version: 2, profileId, createdAt, updatedAt, lastDriverId,
  drivers: { [driverId]: { driverId, careerPoints, rating, ratedRaces,
                           totals: { races, wins, podiums, cupsCompleted, cupsWon, poles },
                           bestLaps: { [trackId]: { ms, at, difficulty, teamId } },
                           history: [ … race and cup entries, as in v1 … ] } } }
```

**Migrating v1 to v2.** Nothing is lost, and the result is deterministic.

1. The v1 save is first copied, raw, to `f1pixelcup.profile.backup.v1-<timestamp>`. If the copy can't be written, the save is left untouched and the session plays from memory, as with a damaged save today.
2. The v1 history is replayed in order.
   - **A race** goes to its `driverId`:
     - its career points, including qualifying points, are added;
     - the driver's own rating is recomputed with `rateRace` from the race's position, field size and difficulty, starting at 1200 per driver, and the entry's `ratingBefore`/`ratingAfter` are rewritten to match;
     - totals, poles and best laps are rebuilt from the entry.
   - **A cup** goes to the driver whose races share its `cupRunId`. If none do, it goes to the driver of the latest race before it.
3. Anything the history can't explain goes to the **most-raced driver**. This covers points or totals beyond what the history adds up to (trimmed or hand-made saves), and a rating with no rated races in the history. If there's no history, it goes to Leclerc, the game's default driver.
4. `lastDriverId` is the driver of the last race, or Leclerc.

## API (`career.js`)

- `recordRace(result)` records against `result.driverId`, which is required.
- `recordCup(result)` requires `result.driverId`. It is added once per `cupRunId` across the whole profile, and the summary is unchanged.
- `getProfile()` returns a copy of the v2 profile.
- `getDriver(driverId)` returns a copy of that driver's career, or a fresh one at 1200 · F4 if they've never raced.
- `listDrivers()` returns `[{ driverId, careerPoints, rating, tier, races, wins, lastRaceAt }]` sorted by rating, highest first.
- `startCupRun()` is unchanged.
- All the storage safety stays:
  - a fresh read before every record, so a second tab isn't overwritten;
  - a single write;
  - a corrupt save is backed up and never deleted;
  - a save from a newer version is left untouched;
  - failed saves keep adding up in memory;
  - a history cap of 5000 entries, now per driver.

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
