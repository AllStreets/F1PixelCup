# The full 2025 calendar, as 4-race cups, and a season (Stage L)

Work order item 3 (`docs/superpowers/plans/2026-10-01-work-order.md`). All 24 circuits of 2025, raced as six 4-race cups in calendar order, and the whole calendar as a season with drivers' and constructors' standings that are saved and resumed.

Built autonomously: circuits get review pages, but they do not block. Landmarks (Stage J) are on another branch: this stage leaves each new venue a hook for them and builds none.

## 1. The cups

Six cups, in the order the 2025 season ran. Each is named for where it falls in the year.

| # | Id | Name | Races |
|---|---|---|---|
| 1 | `openingCup` | Opening Cup | Australia (Albert Park), China (Shanghai), Japan (Suzuka), Bahrain (Sakhir) |
| 2 | `springCup` | Spring Cup | Saudi Arabia (Jeddah), Miami, Emilia-Romagna (Imola), Monaco |
| 3 | `summerCup` | Summer Cup | Spain (Barcelona), Canada (Montréal), Austria (Spielberg), Britain (Silverstone) |
| 4 | `classicsCup` | Classics Cup | Belgium (Spa), Hungary (Hungaroring), Netherlands (Zandvoort), Italy (Monza) |
| 5 | `autumnCup` | Autumn Cup | Azerbaijan (Baku), Singapore, United States (Austin), Mexico City |
| 6 | `finaleCup` | Finale Cup | Brazil (Interlagos), Las Vegas, Qatar (Lusail), Abu Dhabi (Yas Marina) |

The Classics Cup holds three of the oldest venues on the calendar (Monza 1922, Spa 1925, Zandvoort 1948) and the Hungaroring (1986), the first Grand Prix behind the old Iron Curtain.

`CIRCUITS` in `game-data.js` lists all 24 in calendar order; `CUP_DEFS` lists the six cups. Every circuit is in exactly one cup.

### Game ids of the new circuits

`albertpark`, `shanghai`, `jeddah`, `miami`, `imola`, `barcelona`, `montreal`, `redbullring`, `hungaroring`, `zandvoort`, `baku`, `cota`, `mexico`, `lasvegas`, `losail`, `yasmarina`. The eight existing ids are unchanged.

### While the batches are built

Each batch adds one complete cup. Until the last batch, the two old cups stay as they are beside the finished calendar cups (a circuit may be in an old cup and a calendar cup for a while), so the branch is playable at every commit. The last batch retires the old cups (the migration, below).

## 2. Migration from the two old cups

The Trophy Cup (Monza, Spa, Silverstone, Suzuka) and the Constructor Cup (Monaco, Singapore, Bahrain, Interlagos) become the calendar cups.

- **Careers, best laps and history** are keyed by circuit id and driver id (`career.js`), so they carry over untouched. Old history entries keep the cup id they were raced in (`trophyCup`, `constructorCup`): that is what happened. A Node test loads a saved profile written before the change (races and cups in both old cups, best laps at all eight circuits) and checks every driver's points, rating, totals, best laps and history come through unchanged.
- **The pit lane remembers the cup** (new, `f1pixelcup.cup`), by id, never by index, so a later reordering can't pick the wrong cup. `Season.resolveCup(stored, cups)` (pure, in `season.js`) reads it: a current cup id is itself, anything else is the first cup. No earlier build stored a cup (the selected cup was never saved), so there is no cup key to migrate; the old cup ids live on only in career history, where they stay.

## 3. Weather odds per circuit

Changeable weather rains as often as the circuit does, not one race in three everywhere. Each circuit has `rainChance` in `CIRCUITS`, read by `Weather.raceWeather(mode, seed, raceIndex, chance)` (the old one-in-three stays the default). The chances are rounded from how often rain has really touched each Grand Prix weekend: the desert and the night races at almost nothing, Spa and Interlagos the wettest.

| Circuit | Chance | Circuit | Chance | Circuit | Chance |
|---|---|---|---|---|---|
| Albert Park | 0.2 | Barcelona | 0.1 | Baku | 0.05 |
| Shanghai | 0.3 | Montréal | 0.3 | Singapore | 0.25 |
| Suzuka | 0.3 | Red Bull Ring | 0.3 | COTA | 0.1 |
| Bahrain | 0.02 | Silverstone | 0.35 | Mexico City | 0.15 |
| Jeddah | 0.02 | Spa | 0.5 | Interlagos | 0.4 |
| Miami | 0.15 | Hungaroring | 0.2 | Las Vegas | 0.02 |
| Imola | 0.3 | Zandvoort | 0.3 | Lusail | 0.02 |
| Monaco | 0.15 | Monza | 0.15 | Yas Marina | 0.02 |

The pit lane's hint says so: "Each race rains as often as it really does there: Spa one in two, the desert almost never." Wet and Dry are unchanged. Seeded as before (cup run and race), so a race never rerolls.

## 4. The season

The whole calendar, 24 races in order, as one championship.

- **In the pit lane** the season is the seventh choice beside the six cups: "2025 Season". With a season saved, the start button reads "Resume season · Race 8 of 24" and a "New season" button starts over (it asks once more before it throws the saved one away, on the button itself: no dialogs).
- **Fixed for the season** when it starts: the driver, difficulty, grid mode and weather mode. Resuming restores them.
- **Points** as the cups score them: 25-18-15-12-10-8-6-4-2-1, and one for the fastest lap if it is in the top ten.
- **Standings,** worked out by `season.js` (pure, UMD, Node tests):
  - drivers: points, then the countback (most wins, then most seconds, and so on), then name;
  - constructors: the sum of both drivers' points, the same countback over both drivers' results.
- **Saved after every race** (`f1pixelcup.season.v1`): the run id, the settings, the drivers and every race's finishing order and fastest lap (the points are worked out from those). A season quit mid-race resumes at that race (an unfinished race never counts, as in the cups). A save that fails validation, or a finished one, is ignored, never half-loaded. After the last race the save is cleared. If the browser won't store it, the race feed says so.
- **The driver** of a resumed season races it; back in the pit lane, the driver picked there before is back.
- **Shown:** the results screen gives each driver's season points (the cup column), and beneath it the standings: the drivers' table and the constructors' table, with the player and the player's team marked. The last race leads to the podium: the champion on top, and the constructors' champions named in the podium's header line.
- **Careers are credited** exactly as in a cup: every race is recorded (`cupId: "season"`, the season's run id), and the championship is recorded once as the cup at the end, with the cup bonus for the top three.

## 5. The care standard, for every circuit

| Part | What it means |
|---|---|
| Outline | From `tools/tracks/f1-circuits.geojson` (bacinger/f1-circuits, MIT), at the shared scale, in racing direction, relaxed only where the game's wider road needs it. `lengthM` is the outline data's length. |
| Pit lane | Placed from the real one in OpenStreetMap (ODbL) where it is mapped (by way id in `fetch_osm.py`): beside its stretch as near as room allows, on its real side unless the widened road leaves no room for a lane that reaches the line there (then across the road: Shanghai, Barcelona, the Hungaroring and Zandvoort, as Monaco, Singapore and Interlagos before). Where it is not mapped (Albert Park's pit building goes up each year; Las Vegas; Monza; Suzuka), `build_tracks.py` finds a pit lane from the shape alone, and the data records no `pit.real`. `track-features.test.js` lists the exceptions, so a new one fails. |
| Corner boards | Signature corners named on boards, from OpenStreetMap ways named for them. Only names that are not sponsors' (Barcelona's corners carry sponsors' names: no boards there). A circuit whose corners are known by number only gets none. |
| Venue moments | What the place is known for, seen and heard: night races under floodlights (Jeddah, Las Vegas, Lusail, Yas Marina, with Singapore and Bahrain), water (Albert Park's lake, Montréal's rowing basin and river, the Corniche's Red Sea, Yas Marina's marina, Zandvoort's sea and dunes, Baku's Caspian), skylines (Melbourne, Shanghai, Baku, Mexico City, Las Vegas), hills and forest (Imola, the Red Bull Ring, the Hungaroring). |
| Its own look | Ground, run-off tint, trees, hills or city, the sky and fog, a colour grade (`r3d/postfx.js`) and the weather odds above. |
| Landmarks and stands | Stage J's job. Each new venue lists its landmark hook (`landmarks` in its venue settings, unused until Stage J builds it): Melbourne's skyline, the Shanghai main grandstand, Jeddah's fountain, the Miami stadium, the Imola Tamburello monument, Barcelona's hills, Montréal's Biosphere, the Red Bull Ring's hillside, Zandvoort's dunes, Baku's Flame Towers and old city walls, the Austin tower, the Mexico City stadium, the Las Vegas Sphere and Strip, Lusail's lit stands, the Yas hotel. |
| Life | Marshals and the helicopter, as every circuit has (`r3d/trackside.js`): they come with the circuit. |

**Nothing over the track:** `Render3D.auditScenery(track)` is 0 on all 24. The Yas hotel's bridge over the track and Shanghai's grandstand wings over the straight are not built (they would be scenery over the road).

## 6. Per batch (one cup each, in calendar order)

1. `fetch_osm.py` with the new pit lanes and corners, then `build_tracks.py` for the new circuits (`--only` rebuilds just those, keeping the rest byte for byte), regenerating `tracks-data.js`.
2. `CIRCUITS` (name, country, theme, length, colours, `rainChance`), the venue (`r3d/landmarks.js` `VENUES`), the grade (`r3d/postfx.js`), floodlights (`venue.js`), street circuits (`r3d/track.js`, `build_tracks.py`), the cup in `CUP_DEFS`.
3. Checks:
   - Node: relaxation reported clean (no point still tight; at most a couple still close, as Spa and Suzuka), bridges only where the outline crosses itself, no boxes on the grid (`track-boxes.test.js` covers every circuit), real pit lanes and corners where they come from (`track-features.test.js`);
   - browser: `trackside-check` (pits, `auditScenery` 0, boards, print) and `race-sim` (a five-lap race on every circuit, all 20 finish) cover every circuit in `CIRCUITS`.
4. Screenshots of every new circuit at 1600x900, looked at and improved, committed as `docs/review/2026-10-01/circuit-<id>.jpg`.
5. Commit and push the branch.

## 7. The site and the README

The site's circuits section lists all 24 (from `CIRCUITS`), each with its cup; the hero and copy say 24 circuits. The README's circuit table lists all 24 with their cups. Screenshots for the site's cards come from the real game (`tools/capture-shots.js`).

## 8. Follow-up (2026-10-04): real pit sides and Shanghai's snail

- **The pit lane on its real side.** `build_tracks.py` tries, on the real side only and only when the plainer complex has no room there, a real circuit's compromises in turn (`PIT_VARIANTS`): a wall instead of run-off on the other stretch beside the pit lane (the street circuits' clearance), 110-long mouths, then a narrow lane (fast lane 24 wide, a 12 working lane, 20-deep garages). A walled lane may stop up to 60 short of the line where the real one rejoins at it (Shanghai). The track data records what differs (`mouth`, `wall`, `narrow`); `pitlane.js` builds each lane to its own measures and the Safety Car follows it. The other stretch's run-off stops at the pit complex (`r3d/track.js`). Where the real lane runs between two stretches the widened road brings together (the Hungaroring's, between the main straight and turns 2 to 3), the relaxation keeps 50 more between them on the pit side (`PIT_ROOM`).
  - On the real side now: Shanghai, Barcelona, the Hungaroring, Zandvoort (all walled; the narrow lane is there for a circuit that needs it, none does yet). Still across the road: Interlagos (the real lane leaves the track's side through the Senna S), Singapore (its real side bends too tightly for garages beside the road) and Monaco (moved by Stage J). A test lists them, so a new one fails.
- **Shanghai's snail** is as tight as the real one: the road narrows to half its width there (`NARROW`, easing over 120 at each end; a point's `w` in the track data). The relaxation keeps narrow stretches their two half-widths apart plus run-off in proportion, and lets them turn tighter in proportion. The physics (each segment's own width), the CPU drivers' lines (their offset in proportion), the item routes (`halfWidthAt`) and the renderer (road, lines, kerbs, gravel, run-off) all follow it. It never narrows on the grid or beside the pit lane (the build checks).
