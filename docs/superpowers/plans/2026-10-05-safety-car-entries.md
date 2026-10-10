# Plan: the Safety Car's service entrances

Spec: `docs/superpowers/specs/2026-10-05-safety-car-entries-design.md`. Branch `sc-entries`.

1. `tests/entrances.test.js`: placement (count, straight, clear ground, clear of start/pit/tunnel/bridges, spacing, slip-road line), `ways`, `choose`, `passingLat`, and the simulated pick-up time on every circuit. See them fail (no module).
2. `entrances.js` (pure, UMD): `place`, `ways`, `runTime`, `choose`, `passingLat`, `cornerNear`, constants. Tests pass. Load it in play.html.
3. `tools/checks/safety-car-check.js`: extend (32 circuits, several leader starts, a field moved at racing speed under the game's hold rule; appears clear, never overlaps, legal, no jumps, pick-up within 8 s, parks in its bay). Run it on main's code: it must fail.
4. `game.js`: `track.entrances` in trackDefinition; deploySafetyCar plans a way (choose); updateSafetyCar's phases (hold, join, give way, road: catching then leading; leaving unchanged); `safetyCarHolds(racer)` replaces the blanket hold; the Safety Car's heading on its access road; the feed line. Keep edits inside the Safety Car's functions (another branch is retuning power-up strengths).
5. `r3d/entrances.js` + r3d/track.js (barrier and fence gaps) + render3d.js (build before the decor, claims, gates per frame, audit targets) + r3d/people.js (the gate marshals).
6. Checks: safety-car, trackside (auditScenery 0 on all 32), trackside-models, people, replay, split, powerups. Screenshots `docs/review/2026-10-05/sc-*.jpg`.
7. Copy: game-data.js Safety Car effect, site power-up copy if it changes.
8. npm test, full run, fresh reviewer, fix all, push `sc-entries`.
