# Landmarks for the 2025 venues: the plan

Spec: `docs/superpowers/specs/2026-10-01-landmarks-2025-design.md`.

1. **Tests first:** `tests/landmark-models-2025.test.js` and `tests/venue-models.test.js`, seen to fail (no GLBs, no venue hooks).
2. **Models:** `tools/blender/build_landmarks_2025.py` → the GLBs; renders looked at and iterated.
3. **The check first:** `trackside-models-check` grows (new venues' landmarks, harbour fleets), proven failing on the current code.
4. **In the game:** `r3d/models.js` (files, venue lists, no background load of every venue), `r3d/landmarks.js` (builders, stand types, dressing for the new roles), `r3d/yachts.js` (sea and lake).
5. **Screenshots** of every new venue's landmark from the track at 1600x900, judged and iterated, to `docs/review/2026-10-04/landmark-<id>.jpg`, with the Blender renders; the site's Trackside section.
6. `npm test`, the full headless run, a fresh reviewer, every finding fixed, commit, push the branch.
