# Stage N plan: two-player split-screen

Spec: `docs/superpowers/specs/2026-10-01-split-screen-design.md`. Branch `stage-n-split`.

1. **Tests first (Node).** `tests/twoplayer.test.js` for the new pure module (layout, HUD fit, field of view, key sets, pad reading, merging, player 2's default driver); add to `tests/grid.test.js` (two humans at the back) and `tests/replay.test.js` (player 2's keys, the director alternating). See them fail.
2. **Pure code.** `twoplayer.js` (UMD, `window.TwoPlayer`), loaded in `play.html` before `game.js`; `Grid.gridFromBack` takes `playerIds`; `replay.js` records `keys2` and reads `header.players`.
3. **Renderer.** `Render3D.setViewports(rects)`; `render(frame)` split into once-per-frame and per-view work by `frame.viewIndex`; per-view field of view, rumble and tunnel exposure; `postfx.render` into a viewport with per-view bursts and sun; `rain` streaks aimed per view; `renderGarage` back to one full viewport.
4. **Game.** `state.players`, `state.playerIds`, player 2's driver; `controlsFor(racer)` from keys and pads; the key sets in `bindEvents`; item press and release per player; per-view drawing with the camera and HUD state swapped for player 2; the divider; per-player shake, sounds and engine voice; the flag once both have finished; qualifying with two ghosts; grid, results, careers, podium and the recording for both.
5. **Screens.** The Players row, player 2's driver picker and the key hint; the tower and results showing both humans with their tags; the replay's lower third and trace naming 1P or 2P.
6. **Browser check** `tools/checks/split-check.js` (in `run-all.js`), proven to fail on `main`.
7. **Screenshots** at 1600x900 and a tall window, judged and iterated, committed to `docs/review/2026-10-01/split-*.jpg`.
8. `npm test`, the full headless check run, a fresh reviewer, fix every finding, commit and push the branch.
