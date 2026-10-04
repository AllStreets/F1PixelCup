# Stage L plan: the calendar, as cups, and the season

Spec: `docs/superpowers/specs/2026-10-01-calendar-design.md`. Branch `stage-l-calendar`.

## Groundwork (with batch 1)

1. `build_tracks.py --only <ids>`: rebuild only the named circuits, keep the rest of `tracks-data.js` exactly. Corner boards may come from any named raceway way; pit lanes and corners keyed by game id as now.
2. Tests first: `game-data.test.js` (calendar order, cups, every circuit's data incl. `rainChance`), `weather.test.js` (per-circuit chance), `track-features.test.js` (the new real pit lanes), all failing before the data exists.
3. `Weather.raceWeather(..., chance)` and the pit-lane hint.

## Batches (one cup each)

| Batch | Cup | New circuits |
|---|---|---|
| 1 | Opening Cup | Albert Park, Shanghai |
| 2 | Spring Cup | Jeddah, Miami, Imola |
| 3 | Summer Cup | Barcelona, Montréal, Red Bull Ring |
| 4 | Classics Cup | Hungaroring, Zandvoort |
| 5 | Autumn Cup | Baku, Austin, Mexico City |
| 6 | Finale Cup | Las Vegas, Lusail, Yas Marina |

Each: OSM ways, build, data, venue look, checks (Node and the browser's trackside and race-sim), screenshots looked at and improved, commit, push.

## After the batches

1. Migration: retire the two old cups; `season.js` `resolveCup` and the remembered cup; the saved-profile carry-over test.
2. Season: `season.js` standings maths (Node tests first), the game's season flow (save after each race, resume, standings on the results and the podium), `tools/checks/season-check.js` (runs, saves, resumes; proven to fail on the old code).
3. The site's circuits section and copy, the README circuit table, the site screenshots of the new circuits.
4. `npm test`, the full headless checks, a fresh reviewer, fix everything, push.
