# Stage P plan: choosing races

Spec: `docs/superpowers/specs/2026-10-01-race-choices-design.md`.

1. **Tests first.** `tests/choices.test.js` (the draw, reroll, custom validation, parse, toggle, move, search, the remembered choice, a 40-circuit pool) and the three new podium colours in `tests/ceremony.test.js`. Run them: they fail (no `choices.js`).
2. **`choices.js`** (pure, UMD): make the tests pass. Load it in `play.html`.
3. **The game** (`game.js`): the Race choice in the state; `getSelectedCup()` builds the random, custom or single cup from the pool; `beginCup` snapshots the active cup; `getActiveCup()` returns it; careers (`randomCup`, `customCup`, `singleRace`; no cup bonus for a single race); the single race's podium and results labels; preferences and `?race=`; the `Game` actions (`selectRaceMode`, `rerollDraw`, `toggleCustomCircuit`, `moveCustomCircuit`, `clearCustomCircuits`, `selectSinglePick`, `chooseSingleCircuit`). `ceremony.js`: the three colours.
4. **The screens** (`screens.js`, `play.css`): the Race row, the per-choice rows, the circuit picker overlay (search, order, cards with outlines).
5. **`tools/checks/choices-check.js`** in `run-all`: every mode end to end; run it against main first (it fails), then the branch. `showroom-check` gains the new choices.
6. **Screenshots** at 1600x900, 1280x720 and 500x844 of each choice and the picker, looked at and improved, to `docs/review/2026-10-01/choices-*.jpg`.
7. **The site:** the circuits section explains the ways to race, with a pit-lane screenshot from `tools/capture-shots.js` and `?race=` links; `landing-check` updated.
8. `npm test`, the full headless run, a fresh reviewer, fix every finding; commit and push `stage-p-choices`.
