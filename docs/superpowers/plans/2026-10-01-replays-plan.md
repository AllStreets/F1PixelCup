# Stage M plan: TV-camera replays

Spec: `docs/superpowers/specs/2026-10-01-replays-design.md`.

1. **Tests first:** `tests/replay.test.js` against a not-yet-written `replay.js` (seen failing).
2. **`replay.js`** (pure UMD): recorder (chunked typed arrays), `sampleAt`, `frameAt`, `indexAt`, `bytes`, `placeTvCameras`, `tvCameraFor`, `zoomFov`, `directorShots`. Tests pass.
3. **game.js:** load `replay.js` in `play.html`; `racer.steer` set each step; a recorder per race, fed every step in `updateRace`; a `replay` phase with its own clock, ghost cars built from `Replay.frameAt`, particles re-emitted from them; `powerUpFrame` reads from a source so the replay reuses it; keys; `window.Game.replay` actions.
4. **render3d.js:** `frame.view` (trackside / onboard / helicopter + focus) computes the camera; TV cameras placed lazily per circuit with occlusion rays; trackside `showMs` override; `inspect().view` for the checks.
5. **screens.js / play.css:** results-screen Replay button; the broadcast graphics and controls; `updateReplay` each frame.
6. **`tools/checks/replay-check.js`** in `run-all`; prove it fails on `main`.
7. Screenshots of each camera at 1600x900 into `docs/review/2026-10-01/replay-*.jpg`; iterate on the look.
8. `npm test`, full headless checks, fresh reviewer, fix all, commit, push the branch (no merge).
