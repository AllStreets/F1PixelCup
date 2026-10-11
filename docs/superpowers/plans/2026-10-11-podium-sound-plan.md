# Plan: the podium's sound and the winner's anthem

From `docs/superpowers/specs/2026-10-11-podium-sound-design.md`.

1. **Sources** (`tools/anthems/`): MIDI files and scores with clear licences, `midi.js`, the hand transcriptions, `build.js` to `anthem-data.js`.
2. **`ceremony.js`:** `withAnthem(seconds)`: the anthem beat, the camera's slow push, a cork time per bottle. Tests first.
3. **`podium-sound.js`:** the brass synth, the celebration's sounds, `cues()`, `mix()`. Tests first.
4. **Game:** `country` per driver; `r3d/podium.js` on the anthem's timeline, spray per bottle, flags on the banners (`r3d/flags.js`); `game.js` renders ahead and schedules the cues, stops them on leaving.
5. **Checks:** `podium-check` for the new beats and the sound, shown failing on main.
6. **For the user:** WAVs in `docs/review/2026-10-12/`; the site's podium block, README, notices.
7. A fresh reviewer (the melodies against their sources above all), every finding fixed.
