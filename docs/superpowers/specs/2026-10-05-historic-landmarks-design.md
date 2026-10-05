# Landmarks for the historic circuits, and Barcelona's main grandstand back by the straight

Two items the user approved on 2026-10-05 ("add in the things I might still want"). Built to Stage J's and landmarks-2025's pipeline and conventions (`2026-10-01-trackside-blender-design.md`, `2026-10-01-landmarks-2025-design.md`): real metres in Blender, Z up, the front toward +Y; drawn at `LANDMARK_SCALE`; materials by role (`dressLandmark`); no logos, no trademarks, no text; public photographs as shape reference only; up to 40,000 triangles a model; every mesh facing outward; placed through `placeModel` (nothing over the circuit, nothing over what is placed, nothing in the sea); compressed with `tools/compress-models.mjs`; loaded per venue (`r3d/models.js` `VENUE_MODELS`).

## 1. Barcelona's main grandstand where the real one is

Since Stage L moved Barcelona's pit lane to its real side, the circuit data's three covered stands (laid out with the circuit, built before the landmarks) take the ground across the main straight from the pits, and the main grandstand ends up some 95 m behind trees, 600 units from the pits along the lap.

- **The main stand claims first.** A venue may name a `mainStand` (Barcelona: `barcelonaGrandstand`). It is placed before the circuit data's decor (`buildMainStand`, called by `buildWorld` before `buildDecor`), with its anchors across from the middle of the pit lane and its smallest gap first, so it stands at the barrier, facing the pit building, as in life. It joins the landmarks' group (the checks and the people see it as before).
- **The other stands rearranged round it, honestly.** A decor grandstand whose ground the main stand has taken is not dropped: it moves along the lap on its own side, at its own distance from the track, to the nearest place clear of everything (`slideStand` in `r3d/track.js`), so the main straight's other stands stand beyond the main stand's ends, as the real ones line the straight to Turn 1 and the last corner. A stand with nowhere to go within 600 units each way is dropped, as before. Only stands blocked by a claimed landmark move; every other venue's decor is unchanged.
- **Checks:** the main grandstand within 40 units of the barrier (its front) and opposite the pits' middle (within a quarter of the pit lane's zone along the lap); the three decor stands all still built; `auditScenery` 0; the people and trackside-models checks pass.

## 2. The historic circuits' landmarks (`tools/blender/build_landmarks_historic.py`)

Each era as the layout raced: the cars, stands and graphics stay the game's own (`2026-10-04-historic-cups-design.md`), so what is built is what stands at the place in the layout's years.

| Venue | File | What it is, in proportion |
| --- | --- | --- |
| Hockenheim | `motodrom.glb` | The Motodrom's great stand opposite the pits (the main and south grandstands along the straight, 2002 on): about 320 m of three tiers of concrete terraces, the upper tier ("Oberrang") over the middle, a long roof over the centre on slender columns, stair towers at the back |
| Nürburgring | `nurburg_castle.glb` | The ruined Nürburg on its wooded volcanic hill: the round keep (about 20 m), the ring walls with their round towers, crenellated and broken, on a forested cone, seen from the GP circuit to the north-west |
| Estoril | `estoril_grandstand.glb` | The main grandstand opposite the pits: about 200 m of seats under a long flat roof on a row of columns, the boxes' glass along the back |
| Estoril | `sintra_hills.glb` | The Serra de Sintra above the coast to the north-west: a long forested ridge with its rocky crest and, on its summit, the Pena Palace (its red and yellow towers, small at that distance) |
| Kyalami | `joburg_skyline.glb` | Johannesburg's skyline to the south: the Hillbrow Tower (269 m, its pod), Ponte City (173 m, the hollow cylinder; no sign on its crown), the Carlton Centre (223 m) |
| Kyalami | `hillside.glb` (shared) | The grass bank at Sunset, the crowd's corner |
| Sepang | `sepang_grandstand.glb` | The double-fronted main grandstand between the main and back straights: stands on both sides of a central spine, each side under a row of canopies shaped like oil-palm leaves (a pointed leaf on its curved mid-rib, ribs either side), on raking masts |
| Istanbul Park | `istanbul_grandstand.glb` | The main grandstand opposite the pits: about 260 m of seats under a roof hung from tall white masts by stays |
| Istanbul Park | `hillside.glb` (shared) | The natural bank on the outside of Turn 8 (no board: a share of the lap, by its four-apex left-hander) |
| Mugello | `tuscan_hill.glb` | A Tuscan hillside: a rounded hill terraced with olive groves (stone-walled terraces stepping up it, rows of olive trees), a stone farmhouse (casa colonica) with its terracotta roof and dovecote tower, a line of cypresses up the track to it |
| Mugello | `hillside.glb` (shared) | The grass terraces fans fill at Arrabbiata |
| Watkins Glen | `finger_lakes.glb` | The Finger Lakes' landscape to the north-east: a long narrow lake in its valley between wooded ridges, the woods in autumn colour |
| Watkins Glen | `hillside.glb` (shared) | The bank at the Esses |

Every model checks itself in the build (budget, on the ground, its top in its range) and in Node (`tests/landmark-models-historic.test.js`: its parts, materials, sizes, budget; facing outward is `landmark-models.test.js`'s, for every file). Blender renders of each: `docs/review/2026-10-05/historic-blender-<name>.jpg`.

New material roles: `terracotta` (roof tiles), `olive` (olive trees' grey-green), `cypress` (dark green), `forest` (wooded hillsides, darker than `planting`), `forest_autumn` (Watkins Glen's woods in their colours), `rock` (crags), `water` (a lake), `palace_red` and `palace_yellow` (the Pena Palace's colours).

## 3. In the game

- `VENUES` (`r3d/landmarks.js`): each historic venue's `extras` gains `siteLandmarks` and its `landmarks` name its models (the Stage L2 hooks replaced by the real names); `hillside` gives its corner or share.
- `SITES`: the grandstands opposite the pits (gap first, facing the track; Sepang's faces both ways, so it must stand between the two straights, not face away from either); the castle, the hills, the skyline and the lake far back on their real bearings (`anchorsFacing`); the Tuscan hill on the outside of the lap.
- `VENUE_MODELS` (`r3d/models.js`): each historic venue's models, loaded with its circuit only.
- Stands: the decor stands (Stage J's models, their 3D crowds) are unchanged; the landmark stands carry the painted crowd rows like every landmark stand (the 3D figures are at the car's scale, the landmarks at the city's).

## 4. Checks

- Node: `tests/landmark-models-historic.test.js` (above); `tests/venue-models.test.js`: every historic venue lists its landmarks from models it loads and builds them.
- Browser: `trackside-models-check` (every historic venue's landmarks built from their models; Barcelona's grandstand by the straight opposite the pits; `auditScenery` 0 and nobody on the road everywhere; frame time on every circuit, all three tiers).
- Review: screenshots from the track of each historic venue at 1600x900, `docs/review/2026-10-05/historic-<id>.jpg`, and Barcelona's stand, `docs/review/2026-10-05/barcelona-grandstand.jpg`; the site's Historic cups section shows them; the README's note that the historic circuits have no landmark is replaced.
