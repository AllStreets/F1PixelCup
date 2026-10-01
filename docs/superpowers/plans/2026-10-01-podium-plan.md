# Plan: the 3D podium ceremony (Stage K)

From `docs/superpowers/specs/2026-09-30-podium-design.md`. The figures come from `r3d/driver.js` (`loadDriver`, `buildDriver`, `play`, `looks`), built against its API only, so a new `assets/driver.glb` (or the faces branch) drops in. On the podium the drivers stand bareheaded: `buildDriver(driver, team, { headwear: "none" })` (the user's instruction of 2026-10-01; the current API ignores the option).

## Pieces

1. **`ceremony.js`** (pure, UMD, tested in `tests/ceremony.test.js`):
   - the timeline as a function of real time: `poseAt(place, t)`, `forwardAt(place, t)` (the step forward with the arms), `beatAt(t)`, `trophyShown(t)`, `confettiOn(t)`, `sprayOn(t, tier)`;
   - the camera as a function of time: the sweep in (0 to 2.5 s), a slow push in on P1 while the trophy is lifted, then the slow orbit, a pendulum arc in front of the wall that loops;
   - the step layout (P1 middle and highest, P2 on the left and P3 on the right as seen from the camera, the way the 2D steps and a real ceremony show them);
   - the counts per tier (confetti 600, 300, 120; spray 900, 450, none on Low) and the cup's colour;
   - the confetti's physics, one step: gravity against paper's drag (a fall of about 1 m/s), a flutter, landing on the floor or a step and lying there.
2. **`r3d/podium.js`**: `createPodium(renderer, environment)` builds the set (steps numbered in front and faced in the cup's colour, the backdrop with the game's own mark, the floor, the team banners), the TV light (warm key from the front, cool rim from behind), the three dressed drivers, the confetti (an `InstancedMesh` of paper squares) and the spray (a pooled `Points`). `prepare()` compiles everything (scene, shadow casters, its effects) in the background with `compileAsync` and uploads its textures; nothing draws until that is done. `render(now)` advances the timeline; `anchors()` gives each plate's screen point; `dispose()` frees geometries, materials, textures, mixers.
3. **`render3d.js`**: `Render3D.podium` = `{ preload, begin(summary), frame(now), end(), inspect() }`. `begin` frees the race's world, `frame` returns `{ drawing, anchors }` (drawing false while it loads, so the 2D steps show). A second `createPostFx` for the podium scene (bloom, vignette), released on `end`.
4. **`game.js`**: `showPodium` hands the real top three (driver ids, teams, points, the cup) to the screen and to `Render3D.podium.begin`; the update loop draws the podium phase through `drawPodiumScene`; leaving (`resetToGarage`) calls `end()`. The last race's results start loading the driver model (`preload`).
5. **`screens.js` / `play.css`**: the podium screen keeps its title, Continue and the career strip; with 3D it turns transparent over the scene (`is-3d`), the 2D steps hide and name plates (place, driver, team, points) sit under each driver at the projected point, clamped on screen at any size.

## Checks

- `tests/ceremony.test.js` first, seen to fail.
- `tools/checks/podium-check.js` (in `run-all.js`): the real cup's top three in order with P1 in the middle; suit colours per team, the helmet texture only when a helmet is worn, each its own look when `looks()` reports a face; poses advance; the trophy only while P1 lifts it; confetti falls and spray flies; no new shader programs on the first frame; plates on screen at 1600x900 and 700x900; leaving stops and frees it; the 2D fallback without 3D; no errors. Proven to fail against the old code.
- Review shots at each beat, Leclerc P1 and Hamilton P2 (a cup scored by the game's own `finalizeRace`), and a short recording.
