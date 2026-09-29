# F1 Pixel Cup — master to-do list

Written 2026-09-29, after the user's instruction: "go ahead until a rate limit and plan everything we talked about, write specs, revise tests, build again, and perfect all the way up to stopping before supabase … DO NOT DISRUPT THE WORKFLOW".

Work this list top to bottom and tick each item as it ships. It covers every source:

- the staged roadmap, `docs/superpowers/plans/2026-09-28-roadmap.md`;
- the specs in `docs/superpowers/specs/`;
- the memory notes;
- the user's messages of 2026-09-28 and 2026-09-29.

## Working rules (they apply to every item)

1. **Spec, then plan.** Write `docs/superpowers/specs/<date>-<topic>-design.md` and `docs/superpowers/plans/<date>-<topic>.md` and commit them. Then build straight on: no approval stops.
2. **Tests first.** Write the Node test (`tests/*.test.js`, run with `npm test`) or the browser check (`tools/checks/*.js`) before the code. Show every new check failing on the old code, and record that in the commit message or the plan.
3. **Build on a branch.** Use one branch per stage, off `main`.
4. **Verify in the real game at real window sizes.**
   - Use Playwright with `newContext({ viewport: null })`. Resize only through CDP `Browser.setWindowBounds`. Never force a viewport.
   - Minimise the test tool's own blank tab.
   - Close the test pages afterwards, leaving nothing mid-race on screen.
   - Check at narrow, wide, portrait-ish and fullscreen sizes. The view must have no black bars and the HUD must stay on screen.
5. **The quality bar.**
   - Real features only: the copy never promises what the game doesn't do.
   - Physically honest.
   - Intense beauty, judged from real screenshots.
   - `Render3D.auditScenery(track)` returns 0 on every circuit after any scenery change.
   - Leclerc first and Hamilton second in showcase content, but the promo spreads across the whole grid.
6. **A fresh reviewer at the end of each stage.** Use a new subagent with no build context. Fix **every** finding, minors included, and re-run all tests and checks.
7. **Ship it.** Merge to `main` and `git push origin main`, which auto-deploys to https://f1-pixel-cup.vercel.app. Check the live site loads, then tick the item here.
8. **No user check-ins.** The only exceptions are true user-only decisions: money, accounts, or anything destructive. Never upload `.env*`.
9. **Stop before Supabase** (see the end of this list).

The full regression set, run before every merge:

- `npm test`
- `tools/checks/` play, keys, loading, landing, career, grid, powerups and race-clock
- the audit on all circuits

---

## Stage A — Finish stage 3: one career per driver (branch `driver-careers`)

- [x] Spec: `docs/superpowers/specs/2026-09-29-driver-careers-design.md` (`4019515`)
- [ ] Build a profile v2 in `career.js`:
  - [ ] the `drivers` map, `lastDriverId`, `getDriver` and `listDrivers`;
  - [ ] v1 → v2 migration, with the raw backup `f1pixelcup.profile.backup.v1-<ts>`;
  - [ ] `recordRace` and `recordCup` require `driverId`.
- [ ] Rewrite `tests/career.store.test.js` for v2: independence, cups once per `cupRunId`, two tabs, corrupt/newer/throwing storage, quota failures.
- [ ] Migration tests:
  - [ ] a mixed history splits exactly, with ratings replayed per driver;
  - [ ] cups go by `cupRunId`;
  - [ ] leftovers go to the most-raced driver;
  - [ ] an empty save goes to Leclerc;
  - [ ] a backup failure leaves the save untouched;
  - [ ] migrating twice changes nothing.
- [ ] Wire up the UI:
  - [ ] the pit-lane career chip follows the selected driver (`screens.js`, `game.js`, `play.css`);
  - [ ] the career screen gets its "Your drivers" list, and choosing a row selects that driver;
  - [ ] the results and podium strips name the driver.
- [ ] The landing "Your drivers" section (`index.html`, `landing.js`, `landing.css`): a feature card plus rows, and the empty state "1200 · F4".
- [ ] The README and How to play say one career per driver.
- [ ] Extend the browser checks:
  - [ ] `career-check.js`: two drivers keep two careers, the chip follows, and the row selects;
  - [ ] `landing-check.js`: renders from v2, and from v1 through migration;
  - [ ] update `grid-check.js` for the v2 profile.
- [ ] Fix the check harness: `tools/checks/keys-check.js` returns a flat `{ ...out, errors }`, not `{ results, errors }`. Make the harness and plan docs read it correctly, or align it with the other checks. Pick one convention and document it at the top of each check.
- [ ] Investigate the `pauseFreezesPicture` flake (`tools/checks/powerups-check.js:423`).
  - [ ] Reproduce it 20× and find the root cause: rAF timing versus the fixed-step clock, or the render still easing after pause.
  - [ ] Fix the cause rather than widening a tolerance.
  - [ ] Pass 20/20.
- [ ] Final fresh review of the whole branch, with every finding fixed.
- [ ] Run the full regression set, merge `driver-careers` to `main`, push, check live, and tick this stage in the roadmap.

## Stage B — Quick wins

### B1. MIT license

- [ ] Add `LICENSE` at the repo root: the standard MIT text, `Copyright (c) 2026 Connor Evans`.
- [ ] Make the README "License" section link to `LICENSE`.
- [ ] Mention it in the landing footer (`index.html`).
- [ ] Check `.vercelignore` doesn't matter here (LICENSE may deploy; harmless). Merge and push.

### B2. No item boxes on the starting grid (the user has seen them twice)

- [ ] Root-cause it.
  - `tools/tracks/build_tracks.py` `place_item_boxes` puts its last row anywhere up to index `n-1`, just before the line, which is where `layoutGrid` (`game.js`) lines up 20 cars behind the line.
  - Confirm on every circuit which boxes fall inside the grid's length.
- [ ] Write the Node test first, `tests/track-boxes.test.js`:
  - For every circuit in `tracks-data.js`, no box's along-track distance lies within the grid zone (the 20 slots plus a margin behind the line) or the qualifying run-up (`QUALI_RUN_UP` = 320 before the line).
  - It must fail on the current data.
- [ ] Fix the generator: exclude the grid and run-up window, plus a margin after the line, from box placement. Regenerate `tracks-data.js`.
- [ ] Add a runtime guard in `game.js`: drop any box inside the grid zone, as a belt-and-braces fix that also protects future circuits.
- [ ] Browser check, added to `grid-check.js` as `noBoxesOnGrid`:
  - At lights-out on all 8 circuits, no visible box mesh (`render3d.js` `world.boxes`) is within the grid zone.
  - In qualifying, the run-up shows no boxes.
- [ ] Take a real screenshot of the grid at the start on Monza and Monaco. Review, merge, push.

### B3. Earlier deferred minors (professional standard: nothing left parked)

- [ ] Re-check each one and fix any still open:
  - the phone note shows twice or is hidden by `#career`;
  - overlays don't trap focus;
  - focus is lost after picking a pill or tile;
  - an arrow-selected tile isn't scrolled into view;
  - career strip lines are trusted HTML, so escape them;
  - the first feed line never reaches the ticker;
  - Q-quit after the flag discards a finished race;
  - a "not saved" warning shows for 4th and below;
  - the panel doesn't refresh on another tab's `storage` event.
- [ ] Add a check for each fix (in `keys-check.js`, `play-check.js` and `career-check.js`). Review, merge, push.

## Stage C — Power-ups beauty pass (roadmap stage 4)

- [ ] Spec `2026-09-29-power-ups-beauty-design.md` and plan: the art direction for each item, the icon style guide, and the promo shot list.
- [ ] Build the Blender models through the Blender MCP (start it with `tools/start-blender-mcp.sh`). Add `tools/blender/build_items.py`, which exports `assets/items/*.glb`.
  - The models are hand-modelled with baked materials, not primitives:
    - the item box;
    - the oil pool;
    - carbon debris;
    - the Undercut puck;
    - the Steward Penalty puck and ring;
    - a proper safety car with its light bar.
- [ ] `r3d/powerups.js` loads the GLBs through the car loader (`r3d/car.js` pattern), falls back to today's meshes while loading, and keeps pooling.
- [ ] **Icons redo:** rewrite `item-icons.js`. The current SVGs read as AI-made.
  - Use one consistent hand-drawn style: shared stroke weight, light direction, palette and silhouette-first shapes.
  - Or render the icons from the new Blender models as crisp PNG/SVG, then pick one approach.
  - The icons must read at HUD size (32px) and at card size.
  - Show them on a comparison sheet before and after.
- [ ] Update `tests/game-data.test.js`: every item has an icon, and every icon is valid SVG or a present file.
- [ ] Extend `powerups-check.js`: every item's GLB mesh is visible on the road, correctly sized, and `auditScenery` stays at 0.
- [ ] **Varied promo shots:** update `tools/capture-shots.js`.
  - Items and circuits each feature different drivers and teams across the grid: Leclerc first and Hamilton second, then Norris, Piastri, Verstappen, Russell, Alonso, Albon, Gasly, Hülkenberg and others.
  - Recapture `assets/shots/items/*.jpg` and `assets/shots/circuit-*.jpg`.
- [ ] Extend `landing-check.js`: the item and circuit shots cover at least 6 different teams.
- [ ] Visual check of the HUD roulette and the site cards at desktop and phone widths. Review, fix everything, merge, push.

## Stage D — Driver helmet realism pass

- [ ] Write a spec, with a helmet-reference sheet for all 20 of the 2025 drivers.
  - It gives each driver's base colours, the main motif and its placement.
  - The designs are original art *inspired by* each design: no logos, sponsor marks or copied photos.
- [ ] Add a `helmet` data block per driver in `game-data.js`: base, stripe, crown and visor colours, and a motif id.
- [ ] Update `tests/game-data.test.js`: all 20 drivers have a valid helmet spec.
- [ ] Update `tools/blender/build_f1_car.py` and `assets/f1_car.glb`: a better helmet shape (shell, visor and peak), with UV areas for the livery.
- [ ] `r3d/car.js`: paint each driver's helmet design with a canvas texture on the helmet material, replacing today's flat `driver.color`.
- [ ] Update the 2D fallback helmet (`game.js` around line 3176) to match.
- [ ] Browser check: each driver's helmet material carries its own texture, and the colours match the data.
- [ ] Take close-up screenshots of Leclerc, Hamilton, Verstappen, Norris and Alonso in the showroom or pit lane. Review, merge, push.

## Stage E — Website: the 2025 grid, properly (roadmap stage 5)

- [ ] Spec and plan for the driver and team pages. The facts come from F1DB (CC BY 4.0) and the user's own writing, reused from the INFOrmula project's prose. Never use its hotlinked images.
- [ ] Add `tools/site/build_grid_data.js` (or `.py`): it pulls F1DB and writes `assets/data/grid-2025.json` with the drivers, teams, stats and a CC BY attribution. The JSON is committed, so there's no runtime fetch.
- [ ] Node test: the JSON validates (20 drivers, 10 teams, required fields and attribution present).
- [ ] The pages: `drivers.html` and `teams.html` (or anchors in `index.html`), plus `landing.js` renderers.
  - They use the game's own renders only, including the new helmets and team car shots.
  - There are no official photos or logos.
- [ ] Footer on every page: "Fan-made, not affiliated with Formula 1, the FIA or the teams", plus the F1DB CC BY credit.
- [ ] Extend `landing-check.js`: the new pages render 20 and 10 cards, with no horizontal scroll at phone width, and the footer and attribution are present.
- [ ] Update `.vercelignore` so `tools/site` stays out of the deploy. Review, merge, push.

## Stage F — Cinematic post-processing (roadmap stage 6)

- [ ] Spec: the hybrid look.
  - A Broadcast base: bloom, grade, vignette and lens flare.
  - Arcade-punch bursts on real `f1:fx` events: `boostStart`, `overtakeMode` and `hitTaken` from `game.js:1378`.
  - Per-circuit grades, heat haze and speed blur.
- [ ] Add `r3d/postfx.js`, using the Three.js r186 EffectComposer from `vendor/`, and wire it into `render3d.js`.
- [ ] Automatic quality detection (High/Medium/Low) from device and frame time (`device.js`), plus a manual override in the pit-lane Settings (`screens.js`, `play.html`), which is persisted.
- [ ] Node test for the tier-detection rules. Browser check (`tools/checks/postfx-check.js`):
  - each tier switches the real passes on and off;
  - an `f1:fx` event triggers a burst that decays;
  - the Low tier meets its frame-time budget.
- [ ] Screenshots per tier on 3 circuits. Review, merge, push.

## Stage G — Trackside life (roadmap stage 7)

- [ ] Spec, covering all of:
  - moving crowds, flags, marshals, a TV helicopter and fireworks at the finish;
  - **pit lanes and team garages** on every circuit;
  - **signature venue moments, seen and heard**, per circuit: the Monaco tunnel (dark, lit, engine reverb), Eau Rouge at Spa, the Parabolica at Monza, the 130R and the bridge at Suzuka, the night lights at Singapore, the floodlights at Bahrain, and Senna S at Interlagos.
- [ ] `tools/tracks/build_tracks.py`: generate the pit-lane geometry (entry, lane and exit) clear of the racing surface, then regenerate `tracks-data.js`.
- [ ] Add `r3d/trackside.js`: instanced crowds, flags, marshals, the helicopter path, garages and pit wall. Wire it into `r3d/track.js` and `render3d.js`.
- [ ] The **safety car exits into the real pit lane** instead of the run-off (`game.js`, `r3d/powerups.js`), with the `powerups-check.js` assertion updated.
- [ ] Audio reverb zones tied to real track distances (a `ConvolverNode` in `game.js` audio), with a test that the zones map to the tunnel's real distances.
- [ ] Checks:
  - `auditScenery` returns 0 on all circuits, pit lanes included;
  - the tunnel reverb switches in and out at the right distance;
  - the safety car's path enters the pit lane.
- [ ] Screenshots of each venue moment. Review, merge, push.

## Stage H — Rain races (roadmap stage 8)

- [ ] Spec: per-race weather (a pit-lane option, plus a chance of rain in the cup), with **real grip loss** in the `game.js` physics. The oil slick behaves worse in the wet.
- [ ] Node or headless sim test (`tools/checks/race-sim.js` pattern): wet lap times are measurably slower, and cornering grip drops by the specified factor.
- [ ] Visuals:
  - wet road reflections;
  - tyre spray from the real wheel positions;
  - droplets on the camera (post-FX);
  - rain particles, all quality-tiered.
- [ ] Sound: rain ambience and a wet tyre hiss (WebAudio).
- [ ] Browser check: the weather toggles, the grip change is measured in game, and there are no errors. Screenshots. Review, merge, push.

## Stage I — Blender car v2 (roadmap stage 9)

- [ ] Spec: the 2025 shape, with undercut sidepods, floor, sponsor-style (original) livery art, tyre lettering and baked AO.
- [ ] Update `tools/blender/build_f1_car.py`, keeping every part name, including the working **`drs_flap`** (with its pivot at the leading edge), `helmet` and the livery materials. Re-export `assets/f1_car.glb`.
- [ ] Node or browser check: every required part name is present, the DRS flap still rotates 12°, and all 10 liveries recolour correctly.
- [ ] Recapture the showroom, team and site shots with varied drivers (`tools/capture-shots.js`). Review, merge, push.

## Stage J — Blender landmarks (roadmap stage 10)

- [ ] Spec: the Monaco casino, Marina Bay Sands, the Suzuka Ferris wheel, the Monza banking, the Interlagos skyline and more, built by hand in Blender.
- [ ] Add `tools/blender/build_landmarks.py`, which exports `assets/landmarks/*.glb`. `r3d/landmarks.js` loads them in place of the procedural stand-ins.
- [ ] `auditScenery` returns 0 on all circuits, and a check confirms each landmark loads. Screenshots, review, merge, push.

## Stage K — 3D podium ceremony (roadmap stage 11)

- [ ] Spec: the podium set, the drivers (helmets from stage D), champagne spray, confetti and an orbiting camera. It is driven by the **real** cup results.
- [ ] Add `r3d/podium.js`, and hook it into the cup-end flow in `screens.js` and `game.js`. The 2D podium stays as the fallback.
- [ ] Browser check: the top three on the podium equal the real cup standings, the scene skips cleanly, and there are no errors. Screenshots, review, merge, push.

## Stage L — The full calendar: a 24-race season (roadmap stage 12)

- [ ] Spec: the season mode, with drivers' and constructors' standings, saved progress, and per-driver careers credited.
- [ ] Add the new circuits from `tools/tracks/f1-circuits.geojson` through `build_tracks.py`, in batches, until all 24 of the real 2025 calendar are in.
- [ ] Each new circuit passes:
  - [ ] relaxation;
  - [ ] bridge detection;
  - [ ] box placement (no boxes on the grid, from stage B2);
  - [ ] `auditScenery` at 0;
  - [ ] a headless AI race in which every car finishes.
- [ ] Node tests for the standings maths. Browser check: a season can run, and it is saved and resumed.
- [ ] The site's circuits section and the README circuit table are updated. Review, merge, push.

## Stage M — TV-camera replays (roadmap stage 13)

- [ ] Spec: record inputs and state on the fixed-step clock, then play back **deterministically**. Trackside, onboard and helicopter cameras, with Broadcast graphics.
- [ ] Node test: a recording replays bit-identically. Browser check: the replay's positions match the race.
- [ ] A replay button on the results screen. Review, merge, push.

## Stage N — Two-player split-screen (roadmap stage 14, optional, never the default)

- [ ] Spec: a pit-lane option with two real players, separate key sets or gamepads, two views and independent HUDs, both respecting the responsive rules.
- [ ] Browser check: both players drive, the HUDs are independent, the mode is off by default, and there are no errors. Review, merge, push.

---

## STOP — do not start Supabase

Stop here. Report to the user and wait. The Supabase stage (roadmap stage 16) is left for the user to start. It covers:

- accounts;
- profile upload linking the per-driver careers;
- global leaderboards;
- the "how scoring works" explainer.

**Saved for after** (roadmap stage 15, not in this run):

- real elevation (Eau Rouge and the rest);
- a cockpit camera;
- strategy: tyres, pit stops, and a real safety car;
- photo mode.
