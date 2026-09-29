# Grid, qualifying and difficulty — design

Date: 2026-09-28 · Stage 2 of `docs/superpowers/plans/2026-09-28-roadmap.md` · built autonomously (user's standing instruction).

## Why

- Today the player always starts on pole, because their entry is simply first in the grid order.
- The user wants three things:
  - a Mario Kart-style start from the back by default;
  - an optional qualifying session that decides the Grand Prix grid and "adds more points and helps out in your career";
  - a per-cup choice to qualify for every race or for none.
- They also want proof that the difficulty setting really changes the CPU drivers.

## The player's view

- **Pit lane, new "Grid" choice** beside Cup and Difficulty:
  - Choices are **From the back** (default) and **Qualifying**.
  - The choice is saved like difficulty is (`f1pixelcup.grid`).
  - It applies to every race of the cup and is locked once the cup starts, as difficulty is.
- **From the back:**
  - The player lines up 20th.
  - The CPU cars line up by cup standings, leader on pole, as in Mario Kart GP races.
  - For the first race of a cup there are no standings yet, so their order is drawn at random.
- **Qualifying** runs before every race of the cup. It is a one-lap shootout:
  - The player's car starts alone on track, 320 units before the line, rolling at 70% of its top speed.
  - The lap is timed from the line back to the line.
  - The HUD shows:
    - a "QUALIFYING" banner;
    - the running lap time;
    - at each timing point, the live delta to the provisional pole, green or red.
  - Power-ups are off: item boxes are hidden, as there are none in real qualifying.
  - Esc pauses. From pause, Q quits to the pit lane, as it does in a race.
  - When the lap ends, a **Qualifying classification** screen shows all 20 times and gaps with the pole sitter highlighted, then **Start the race**.
  - The race grid is that classification, in order.
- **CPU qualifying times are real.** Each CPU driver's lap is simulated with the same physics and AI that race them:
  - The car runs alone on the circuit, from the same rolling start, at the chosen difficulty.
  - The sim includes that difficulty's line noise, braking and mistakes.
  - No numbers are invented.
- **Career:**
  - Qualifying positions earn career points, multiplied by difficulty as race points are: P1 10, P2 6, P3 4, P4–P10 2.
  - They appear on the results screen's career strip and in the race's history record: qualifying position, qualifying time and qualifying points.
  - Pole positions are counted in the career totals.
  - Rating is unaffected: it measures race results.
- **Difficulty is proven:** seeded simulations must show CPU pace ordered Rookie < Pro < Legend, in both race time and qualifying lap time, each by a clear margin.
  - If they don't, the difficulty values are tuned until they do.
  - The measured margins are recorded in the check's output.

## Architecture

- **`grid.js`** (new; UMD like `career.js`, pure):
  - `QUALI_POINTS = [10, 6, 4, 2, 2, 2, 2, 2, 2, 2]`
  - `qualifyingAward({ position, difficulty })` → `{ points, multiplier, careerPoints }` (it uses `Career.multiplierFor`'s table; the multipliers are duplicated, and a test keeps them equal)
  - `gridFromBack({ playerId, aiIds, standings, rng })` → ordered ids. The player is last. AI cars are ordered by standings points, descending; ties and the first race are ordered by `rng`.
  - `gridFromQualifying(times)` → ids sorted by time. A missing or invalid time goes to the back, in the given order.
  - `qualifyingDelta(playerSplits, poleSplits, index)` → ms or null.
- **`game.js`:**
  - `state.gridMode` (`"back"` | `"qualifying"`), plus `selectGridMode(mode)` and persistence.
  - `startRace(index)` builds the grid order through `grid.js`.
  - Qualifying flow:
    - `startQualifying(index)` → `phase = "qualifying"`
    - `simulateQualifyingLap(entry)` runs a headless sim: a temporary racer on an empty track that records splits and lap time.
    - Live qualifying update: player only, no items.
    - `finishQualifying()` → `Screens.showQualifying(...)` → `Game.startRaceFromQualifying()`.
  - The HUD gets a qualifying variant.
  - `recordPlayerRace` passes the qualifying result to `Career.recordRace`.
- **`career.js`:**
  - `recordRace(result)` accepts an optional `qualifying: { position, timeMs, difficulty }`, adds `qualifyingAward` career points, counts poles in `totals.poles`, and stores it in history.
  - Profile schema stays v1: the new fields are optional with safe defaults, and `upgrade()` fills `totals.poles = 0`.
- **`screens.js`, `play.html`, `play.css`:** the Grid pills; a `#qualifying-screen` overlay in the Broadcast style; the career strip line for qualifying.
- **`landing.js`** How to play: one line on grid modes.

## Tests

- **Node:**
  - `tests/grid.test.js`: from-back ordering, including the first race, ties and standings; qualifying ordering, including missing times; qualifying awards and multipliers matching career; delta.
  - `tests/career.store.test.js`: qualifying points added, poles counted, history fields, old profiles upgraded.
- **Browser, `tools/checks/grid-check.js`:**
  - The default grid puts the player 20th.
  - Race 2's AI order follows standings.
  - The grid choice persists and is locked mid-cup.
  - Qualifying mode:
    - The session starts alone with items off.
    - The player's lap is timed at the line to the millisecond.
    - The HUD delta appears.
    - The classification shows 20 rows.
    - The grid equals the classification.
    - Re-running a CPU's sim with the same seed gives the identical time, so times are simulated, not made up.
    - Career points and poles are recorded.
    - Esc and Q work.
  - The difficulty ordering sims: race and qualifying, per difficulty, seeded.
- All existing checks still pass. Every new check is shown to fail on the old code.
