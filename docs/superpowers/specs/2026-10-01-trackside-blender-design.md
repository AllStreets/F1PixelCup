# Trackside monuments, grandstands and people, built in Blender (Stage J)

Work order item 1 (`docs/superpowers/plans/2026-10-01-work-order.md`). The circuits are dressed with hand-built Blender models in place of the procedural stand-ins: each venue's landmark, grandstands that are real stands, and people (crowds, pit crews, photographers, TV crews) that live as the race goes by.

The stage has two design reviews. **This document covers the whole stage; the first look (section 6) is what is built before the first review.** Everything else waits for the user's yes.

## 1. Scale and conventions

- **Models are built in real metres** in Blender (Z up), exported as glTF (three.js: Y up). Two conventions for which way a model faces:
  - **Buildings and stands** face Blender's +Y, which is three.js's -Z after the export's axis change.
  - **People** face Blender's +X (Y to their left), which stays +X in three.js; the game turns each figure about the vertical so +X looks where it should.
- **Two scales in the game, as the scene already has them:**
  - **People and grandstands** stand next to the cars, so they share the car's scale: `CAR_SCALE` = 6 game units per metre (`r3d/car.js`). A 1.78 m person is 10.7 units tall, as tall as a car is long a third of the way.
  - **Landmarks** sit with the city around them. The street blocks' windows are 8 units a storey (`buildingMaterial`, about 3.2 m), so the city reads at about 2.5 units per metre; the procedural casino (80 wide) and Marina Bay Sands (200 tall) are close to that. `LANDMARK_SCALE` = 2.5. The circuit's own map is 1.3 units per metre (`build_tracks.py`), so a landmark at 2.5 is a little larger than its true footprint on the map: it reads as the size it is from the car, without crowding the circuit.
- **Materials by role,** named in the GLB, so three.js recolours or lights them: `stone`, `stone_dark`, `roof_slate`, `roof_copper`, `glass`, `window_lit`, `gold`, `facade` (the window shader), `steel`, `concrete`, `seat`, `roof_membrane`, and for people `skin`, `hair`, `shirt`, `trousers`, `shoes`, `gear`, `lens`.
- **No logos, no trademarks, no text** on any model. Shapes come from public photographs, used only as reference in the head.
- **Triangle budgets** (browser): a landmark up to 40,000 triangles; a grandstand up to 12,000; a crowd figure up to 300 (it is instanced hundreds of times); a crew, photographer or camera operator up to 1,500.

## 2. Landmarks (`tools/blender/build_landmarks.py` → `assets/landmarks/*.glb`)

One per venue that has one, accurate in shape and proportion:

| Venue | Landmark |
| --- | --- |
| Monaco | The Casino de Monte-Carlo's front on the Place du Casino (corner towers with their lanterns, the central pavilion, clock and canopy, the mansard roofs, the atrium's lantern), with the Hôtel de Paris's front beside it (arcaded ground floor, balconies, mansard with dormers, the corner rotunda and its dome). |
| Singapore | Marina Bay Sands (three 55-storey towers, each a straight leg and a curved leg meeting above the atrium, the SkyPark's ship on top with its cantilever), lit for the night race. The Singapore Flyer. |
| Suzuka | The Ferris wheel in the amusement park. |
| Monza | The old banking (sopraelevata), its concrete curve and supports. |
| Spa | The pit buildings at the foot of Raidillon and the Eau Rouge grandstand. |
| Silverstone | The Wing (the pit and paddock building's roof). |
| Bahrain | The Sakhir tower. |
| Interlagos | The São Paulo skyline. |

Each landmark claims its footprint through the course's claim system (section 5). The procedural stand-in stays as the fallback while the model loads and if it fails.

## 3. Grandstands

Real 3D stands (`assets/landmarks/grandstand*.glb`): stepped tiers of seats in rows, stairs, the supports, a back wall, a roof where the venue has one. The seats take the venue's stand colour. Each venue gets its type:

- covered stands with a cantilevered roof (Monaco, Singapore, Silverstone, Suzuka, Bahrain);
- open terraces without a roof (Spa, Interlagos, Monza's outer stands).

They fit the footprint the track data gives each stand (156 by 68 units, about 26 by 11 m at the car's scale), so nothing about their placement changes.

## 4. People (`tools/blender/build_people.py` → `assets/people.glb`)

Low poly figures with the driver figure's proportions (1.78 m, hips 0.94 m, shoulders 1.40 m; `build_driver.py`):

- **Crowd:** four variants (build, hair, a cap, a jacket), each one mesh with roles `skin`, `hair`, `shirt`, `trousers`, `shoes`. Instanced in three.js with per-instance shirt, trousers, skin and hair colours. Skin tones varied and realistic.
  - The figure's limbs are marked by part (in the UVs), so the vertex shader can pose it: seated or standing, arms down or raised and waving. One mesh, both poses.
- **Pit crew** in team kit (overalls in the team's colour, the trim colour on the shoulders and legs, a headset).
- **Photographer** with a long lens on a monopod.
- **TV camera operator** behind a broadcast camera on a tripod, and the **TV platform** (a scaffold tower with a deck and a rail) they stand on.
- **Marshals** exist already (`r3d/trackside.js`); they move to these figures in the final look.

## 5. In the game

- `r3d/landmarks.js` loads the landmark and grandstand models (`r3d/models.js` holds the loaded templates), and builds them in place of the stand-ins.
- `r3d/people.js` places the people:
  - **Crowds:** 3D figures in the stands near the camera (instanced, recoloured per instance), the painted crowd texture for stands further away; the swap is per stand, by its distance from the camera. A share of the seats are empty. Some fans stand at the front rail.
  - **Pit crews:** in each team's garage mouth, in that team's colours.
  - **Photographers:** at a few corners, behind the barriers, lenses on the corner's apex.
  - **TV camera crews:** on a platform by the track, the camera on the action.
  - **Marshals:** at their posts (as now).
- **Life:**
  - the crowd near the player stands and waves as the player passes, and sits again after (in the vertex shader: each figure's distance to the player drives its pose, with its own delay and style);
  - the pit crews turn to watch when a car passes their garage (each crew member's heading eases toward the nearest car in the pit straight);
  - the photographers track the cars with their lenses; the TV camera pans with them.
- **Nothing touches the track.** Every model and every figure claims its footprint (`course.findSpot`, `course.claim`, `footprintClear`, `course.occupied`). The grandstand crowd sits inside the stand's own footprint, the pit crews inside their garage's (the garage doors become a real opening: a recess the crew stand in). `Render3D.auditScenery(track)` stays 0 on every circuit.
- **Everything that draws is in the scene when `Render3D.prepare()` runs.** The models load with the car; the renderer is ready once all of them have loaded or failed (a failure falls back to the stand-ins, with a warning).
- **Quality tiers (`quality.js`):** High and Medium draw the 3D crowd; **Low keeps only the far crowd texture** (no 3D crowd figures). Pit crews, photographers and the TV crew are on every tier (a few dozen figures).
- **Inspect:** `Render3D.inspect().trackside` lists what loaded from a model, every placed figure's position (for the check that none stands on the road), the crowd's pose near the player, and what the tier draws.

## 6. The first look (built now, for the first review)

1. **Two landmarks:** the Monaco casino with the Hôtel de Paris front, and Marina Bay Sands (night-lit windows), at their places by the circuit: the casino at Casino Square (about a third of the lap, on the outside of the bend), Marina Bay Sands across the water from the pit straight.
2. **One grandstand:** the covered stand, used at Monaco and Singapore in place of the old stand. The other venues keep the old stand until their types are built.
3. **The people:** four crowd variants, the pit crew, the photographer, the TV camera operator and the platform.
4. **In the game:** the 3D crowd in the new stands (near), the painted crowd far and on Low; pit crews at the garages (every circuit); photographers at a few corners and one TV platform (every circuit); the crowd waving as the player passes; the pit crews turning to watch.
5. **The garages** get a real door opening (the crew stand in it) and the height a person needs: a 2.9 m opening under the hospitality floor.

Then the review images (`docs/review/2026-10-01/trackside-*.jpg`): the casino, Marina Bay Sands at night, the grandstand with its crowd, the pit crews, a photographer and the TV crew, and the Blender renders of each model.

**After the user's yes:** the other six landmarks, the Flyer, the open terrace stand and each venue's stand type, marshals as figures, the photographers and TV camera tracking the cars, and the final look across all eight circuits.

## 7. Checks

- **Node** (`tests/landmark-models.test.js`, `tests/people-model.test.js`):
  - each GLB has its parts and its materials by role;
  - sizes in real metres (the casino's towers, Marina Bay Sands's 194 m height and the SkyPark's length, a 1.78 m person, the stand's rows);
  - triangle budgets;
  - the people's parts are marked for the shader, and the crowd has every role.
- **Browser** (`tools/checks/people-check.js`, in `run-all`):
  - `auditScenery` is 0 on every circuit;
  - the landmark models load at Monaco and Singapore (built from the GLB, not the stand-in);
  - no person stands on the road: every placed figure, against the track's clearance;
  - the crowd animates when the player passes (near the player they stand; far away they sit);
  - Low has no 3D crowd; High has it;
  - frame time holds on all three tiers;
  - no console errors.
