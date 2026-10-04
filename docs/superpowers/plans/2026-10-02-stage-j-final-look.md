# Stage J final look: the plan

Spec: `docs/superpowers/specs/2026-10-01-trackside-blender-design.md`, section 8.

1. **Tests first:** `tests/yacht-models.test.js` and more of `tests/landmark-models.test.js` (the new models' parts, sizes and budgets), seen to fail with no GLBs.
2. **Yachts:** `tools/blender/build_yachts.py` → `assets/yachts.glb`; renders looked at, iterated.
3. **Landmarks:** the Flyer, the Suzuka wheel, the Monza banking, Spa's pits, the Wing, the Sakhir tower, the São Paulo towers, the open terrace; Marina Bay Sands's prow; renders iterated.
4. **People:** the marshal figure.
5. **The check first** (`tools/checks/trackside-models-check.js`), proven failing on the first look's code.
6. **In the game:** `r3d/yachts.js`; per-venue model loading in `r3d/models.js` and `prepare()`; each landmark placed; the stand types; the marshals; the facade shader's floors.
7. **Screenshots** of every circuit at 1600x900, judged and iterated, to `docs/review/2026-10-02/trackside-*.jpg`, with the Blender renders.
8. `npm test`, the full headless run, a fresh reviewer, every finding fixed, commit, push.
