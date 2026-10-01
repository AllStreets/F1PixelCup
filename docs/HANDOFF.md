# Handoff: picking up F1 Pixel Cup (written 2026-10-01)

For the next Claude Code session, which the user will remote-control through the day. Read this first, then the work order.

## Where things stand

- **Live:** https://f1-pixel-cup.vercel.app. Every push to `main` auto-deploys (Vercel).
- **`main`** is at the merge of Stage I, car v2 and the drivers (`9293b2e`, plus this plan). Everything is merged; there are no open branches with work in them.
- **Shipped and live:**
  - Stages A to I of `docs/superpowers/plans/2026-09-29-master-todo.md`:
    - careers per driver, the power-ups, helmets and the website;
    - post-processing and trackside life (pit lanes, venue moments, marshals, the helicopter, fireworks);
    - rain (real wet grip), car v2 and the Blender driver figure.
  - Fixes made on 2026-09-30:
    - smooth motion at any refresh rate (`placeForDrawing` in `game.js`);
    - CPU drivers that brake like drivers (`racecraft.js`), so qualifying is contested;
    - the speed panel on the qualifying lap;
    - no stray 2D streaks;
    - a wet-grid NaN hotfix.
- **Tests:** `npm test` is 200/200. The full browser regression is green: 16 checks, see "Checks".

## What to do next

**`docs/superpowers/plans/2026-10-01-work-order.md`** is the ordered list, with the user's 2026-10-01 instructions folded in. Start at item 0.

1. **Item 0, the drivers [REVIEW].** The user wants to see the drivers before anything is built on them.
   - The raw renders are in `docs/review/2026-10-01/driver_*.png`: a red default suit and a plain white helmet. In the game the suit takes team colours and the helmet the driver's painted design.
   - Render them dressed: Leclerc in Ferrari colours and Hamilton in his, with their helmets.
   - Publish a private review page (the Artifact tool) and send the link. Wait for the user's notes.
2. Meanwhile, start **Stage J** (monuments, stands, people): write its spec, build the first two landmarks, one grandstand and the people figures, then **[REVIEW]** that first look.
3. Then K (podium) **[REVIEW]**, L (all 24 circuits of 2025, in 4-race cups), L2 (historical cups), P (random, custom and single races), M (replays), N (two-player split-screen), R (the README), and stop before Supabase.

### Design reviews

The user wants a say on:
- the drivers;
- the podium ceremony;
- the trackside elements (monuments, buildings, stands, people).

For those:
1. Build on the branch and render the look (game screenshots, Blender renders).
2. Commit the images to `docs/review/<date>/` and publish a review page.
3. **Do not merge until the user says yes.**

Everything else runs without check-ins, as before. Circuits get review pages too, but those don't block.

## Starting up

```bash
cd "/Users/connorevans/Desktop/My Projects (Programming)/F1_Pixel_Cup"
python3 tools/dev-server.py .        # http://localhost:8765, no caching; run it in the background
npm test                             # Node tests
```

Browser checks run through the Playwright MCP tool `browser_run_code_unsafe`:

```js
async (page) => eval(await (await page.request.get("http://localhost:8765/tools/checks/run-all.js")).text())(page)
```

Set `globalThis.CHECKS = "rain,car"` first to run a subset, and `globalThis.LONG = true` for full failure text. A full run takes about 8 to 10 minutes. The tool moves anything over 120 s to the background and notifies you when it finishes. A single check: `eval(await (await page.request.get(".../tools/checks/<name>-check.js")).text())(page)`.

In the results, **play, landing, career and race-sim always list plain values** (counts, strings) under "bad". Those are informational, compared by eye; a real failure says so.

## Blender

- **Builds run headless and never touch an open Blender:**
  ```bash
  F1_CAR_OUT=assets/f1_car.glb /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -P tools/blender/build_f1_car.py
  F1_DRIVER_OUT=assets/driver.glb F1_DRIVER_PREVIEW=<dir> /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -P tools/blender/build_driver.py
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -P tools/blender/preview.py -- model.glb out_prefix 900
  ```
- **Another terminal session may be using Blender through the Blender MCP for a different project.** Don't use the Blender MCP tools here; use the headless commands above. They are a separate process, so the two can't clash.
- `tools/blender/f1parts.py` holds the helmet shell, shared by the car and the drivers (the painted designs depend on its UVs).
- The build scripts check themselves (for example, no pose may put a boot below the ground). Keep that habit.

## The rules that always hold

- **A spec and a plan first.** Specs go in `docs/superpowers/specs/<date>-<topic>-design.md`.
- **Tests first,** and seen to fail on the old code.
- **A branch per stage.** Merge to `main` and `git push origin main` after each major piece. Standing permission: no need to ask.
- **A fresh reviewer at the end of each stage.** Use a new subagent on the most capable model. Fix **every** finding, minors included, each with a test that failed first.
- **The quality bar:**
  - real features only (the copy never claims what the game doesn't do);
  - physically honest;
  - intense beauty, judged from real screenshots;
  - `Render3D.auditScenery(track)` returns 0 on every circuit (nothing over the track).
- **Browser checks at real window sizes.** Use `newContext({ viewport: null })` and resize only via CDP `Browser.setWindowBounds`. **Never force a viewport**: the user watches that window. The view must fill any window with no black bars.
- **Showcase content:** Leclerc first, Hamilton second, but the promo spreads across the grid.
- **Licences and secrets:**
  - Data and imagery stay licence-clean: F1DB (CC BY) and OpenStreetMap (ODbL, credited), Poly Haven (CC0). No media.formula1.com images, no official logos and no sponsor marks.
  - Never commit or upload `.env*` or `.vercel/`.
- **Writing for the user's readers** (README, site, review pages): **no em dashes.** The user dislikes them.
- **Stop before Supabase.**

## Map of the code (what you'll touch most)

- **`game.js`:** physics on a fixed 60 Hz step (`takePhysicsSteps`, `updateRacer`), with drawing between steps (`placeForDrawing`). Also the AI, laps, items, audio, the HUD and the pit-lane flow (`startCup`, `startRaceWeekend`, `showPodium`).
- **Pure modules,** UMD and tested in `tests/`:
  - `weather.js` (wet grip and scrub);
  - `racecraft.js` (CPU corner speeds and braking);
  - `pitlane.js`, `venue.js`, `marshals.js`, `grid.js`, `powerups.js`, `career.js`, `quality.js`.
- **`render3d.js`:** the three.js renderer.
  - `prepare()` builds a circuit behind the loading panel: a piecewise shader compile, the shadow and effect shaders, texture uploads. The first frame stalls on nothing.
  - Also `render()`, `inspect()` (what the checks read) and the audits.
- **`r3d/`:**
  - `car.js`: liveries painted in the shader, AO, tyre lettering, number decals;
  - `track.js`, `landmarks.js`, `trackside.js`, `rain.js`, `postfx.js`, `tunnel-light.js`, `items.js`, `powerups.js`.
- **`tools/tracks/`:** `build_tracks.py`, plus `fetch_osm.py` for pit lanes, tunnels and corners. These write `tracks-data.js`. The outlines come from `f1-circuits.geojson`, which has all 24 circuits of 2025 and 16 historical ones.
- **`game-data.js`:** drivers, teams, difficulties, circuits and cups.
- **`tools/capture-shots.js`:** the website's screenshots, taken from the real game.

## Things learnt the hard way

- **Shaders and textures** compile and upload once, in `prepare()`. Anything new that draws (a model, a points system) must be in the scene when `prepare()` runs, or it will stall the first frame it appears.
- **Wet grip is per speed:** `Weather.dryLimitAt(physics, speed)`. At speed 0 there is no limit, so guard divisions. That was the NaN bug.
- **Checks must be able to fail.** Prove every new one against the old code. Reviewers have caught tautological checks more than once.
- **Bash permission hiccups:** the auto-mode safety check sometimes returns no verdict. Retry once. If it persists, work in files (Write/Edit) and come back to the shell.
