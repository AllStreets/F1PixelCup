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

## 8. The final look (approved first look, 2026-10-02)

The user approved the first look ("the trackside features and people are starting to look amazing"; they love the casino). The rest of the stage is built now, with the user's additions.

### 8.1 Yachts

`tools/blender/build_yachts.py` → `assets/yachts.glb`: detailed, realistic yachts, several distinct models, each with a near model and a far one (a level of detail):

- **a 60 m superyacht**, four decks: a long hull with a raked stem and a sheer that rises to the bow, a row of hull windows, a swim platform at the transom, superstructure tiers stepping back, each with its band of dark glass and a raked front, a radar arch, railings round the decks, a tender on the aft deck;
- **a 45 m motor yacht** with a flybridge and its hardtop;
- **a 38 m explorer**, a high bow and a squared-off superstructure, a crane and a tender;
- **a 50 m sailing yacht**, a long low deckhouse, one tall mast with its boom, the sail furled on it, standing rigging;
- **a tender**, the small boat that ferries guests.

Materials by role, recoloured per instance in the game: `hull`, `boot` (the waterline stripe), `deck` (teak), `super` (the superstructure), `glass`, `rail`, `gear` (masts, radar, cranes), `lit` (the glass band that lights at night). Budgets: up to 7,000 triangles near, 400 far.

**In the game** (`r3d/yachts.js`): instanced per model and level of detail, drawn at the city's scale (`LANDMARK_SCALE`). Each yacht bobs, pitches and rolls a little on the water in the vertex shader (its own phase). The near model within a range of the camera, the far one beyond, nothing past the fog.
- **Monaco:** moored stern-to along the harbour's quays (the edge of the town, their sterns to the quay, side by side with a gap between), filling the longest unbroken stretches of open water first, and anchored out in the bay, bows to the wind, with tenders among them.
- **Singapore:** a few on Marina Bay in front of Marina Bay Sands.
- **A hook:** a venue lists `harbour: { quay, moored, anchored }`, and Stage L's harbour venues (Yas Marina, Miami, Baku) take it.
- Every yacht claims its water, never over the track; `auditScenery` stays 0.

### 8.2 The other landmarks

In `build_landmarks.py`, each in proportion from public photographs (no logos, no text):

| Venue | Model | Shape |
| --- | --- | --- |
| Singapore | `singapore_flyer.glb` | 165 m: a 150 m wheel of a triangular truss rim and cable spokes, 28 capsules outside the rim, its hub on two pairs of raked legs, over a three-storey terminal with a curved glass roof; the rim and capsules lit at night |
| Suzuka | `suzuka_wheel.glb` | the amusement park's wheel, about 50 m, gondolas hanging below its rim, A-frame legs either side |
| Monza | `monza_banking.glb` | a stretch of the old banked curve: the concrete deck rising steeply to its outer lip on rows of columns and arches, a rail along the top |
| Spa | `spa_pits.glb` | the old pit building at the foot of Eau Rouge: long and low, a terrace on its roof with a rail |
| Silverstone | `silverstone_wing.glb` | the Wing: a long glass building whose roof sweeps like an aerofoil, its nose cantilevered |
| Bahrain | `sakhir_tower.glb` | the VIP tower: a slim core and, at the top, stacked floors stepping out under sail-like shades |
| Interlagos | `sp_towers.glb` | two São Paulo towers for the skyline: an art deco tower stepping up to its spire, and a modernist slab |

**Facades borrowed from the user's Chicago project (techniques, no assets):** the window light is chosen per floor as well as per room, so whole floors light together and the lit rooms read as offices, not noise; the glass sits in an inset with its frame dark; the walls darken toward the ground. Marina Bay Sands takes this (its lit windows were noisy), and its SkyPark gets its curved prow.

### 8.3 Stands and marshals

- **The open terrace** (`grandstand_open.glb`): stepped concrete terraces with bench seats, no roof. Each venue gets its type: covered at Monaco, Singapore, Silverstone, Suzuka and Bahrain; open at Spa, Interlagos and Monza. The crowd fills both.
- **Marshals** become figures from `people.glb`: the crew figure in orange overalls with white trim, at their posts as now (the posts grown to a person's height), the flag in the right hand.

### 8.4 Performance and loading

- Each venue's landmarks load when its circuit is prepared (the loading panel covers it), not with the car: the game is ready as soon as the car, the people and the stands are in. Nothing of the circuit is built until they have loaded or failed (a download silent for 20 s counts as failed, and the stand-in is used). Every landmark of a venue is in the scene when `prepare()` compiles it.
- Near and far models (yachts), instancing, and the 3D crowd's range per tier keep every circuit's frame time smooth on all three tiers; Low may draw the far models only. **The frame-time check runs on every circuit.**
- Split screen draws both views with the same scenery; nothing is built per view.

### 8.5 Checks

`people-check` grows into the final look's check (`trackside-models-check`):
- every venue's landmark built from its model;
- yachts at Monaco (both moored and anchored) and Singapore, every one on the water and clear of the track;
- `auditScenery` 0 and nobody on the road, every circuit;
- frame time on every circuit, all three tiers.
