# Plan: historic landmarks and Barcelona's main grandstand

Spec: `docs/superpowers/specs/2026-10-05-historic-landmarks-design.md`.

1. Barcelona: a check that fails (the grandstand opposite the pits' middle, at the barrier, the three stands kept); `mainStand` placed before the decor, `slideStand` for the stands it displaces; the pit lane's middle across the line. The check passes; every other venue's landmarks unchanged or as approved.
2. Node tests for the nine models (`tests/landmark-models-historic.test.js`) and the venues (`tests/venue-models.test.js`), seen to fail.
3. `tools/blender/build_landmarks_historic.py`: the nine models, checked in the build; compressed.
4. The venues: `VENUES`, `SITES`, `VENUE_MODELS`; the browser check's list. Placement fixes found on the way (Sepang's stand, the hills over far landmarks).
5. Screenshots from the track at 1600x900, judged and improved; Blender renders; `docs/review/2026-10-05/`.
6. The site's Historic cups section (capture-shots part `historic`, landing.js, the landing check) and the README.
7. `npm test`, the full browser run, a fresh reviewer, every finding fixed; push the branch.
