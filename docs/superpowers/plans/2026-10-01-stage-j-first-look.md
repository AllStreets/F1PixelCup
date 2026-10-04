# Stage J first look: the plan

Spec: `docs/superpowers/specs/2026-10-01-trackside-blender-design.md` (section 6).

1. **Tests first:** `tests/people-model.test.js` and `tests/landmark-models.test.js` (parts, materials, sizes, budgets, the shader's part marks), seen to fail with no GLBs.
2. **People:** `tools/blender/build_people.py` → `assets/people.glb`. Preview renders, looked at, iterated.
3. **Landmarks and the stand:** `tools/blender/build_landmarks.py` → `assets/landmarks/casino.glb`, `marina_bay_sands.glb`, `grandstand.glb`. Preview renders, iterated.
4. **The check first:** `tools/checks/people-check.js`, run against the old code (it must fail: no models, no figures).
5. **In the game:**
   - `r3d/models.js`: loads the GLBs; the renderer is ready once they have loaded or failed.
   - `r3d/landmarks.js`: the casino and Marina Bay Sands from their models at their places, the stand-ins as the fallback; the garages' door opening and height.
   - `r3d/track.js`: the covered grandstand from its model where the venue uses it (Monaco, Singapore), the painted crowd kept on its rows.
   - `r3d/people.js`: the people material (roles coloured per instance, the pose in the vertex shader), the crowd in the stands, the pit crews, photographers and the TV platform, the near/far swap, the tiers, and their life each frame.
   - `render3d.js`: builds them with the world, updates them per frame, `inspect().trackside`.
6. **Screenshots** at 1600x900, looked at and iterated; the best set to `docs/review/2026-10-01/trackside-*.jpg`, with the Blender renders.
7. `npm test`, the full headless check run, a fresh reviewer, every finding fixed, commit, push the branch.
