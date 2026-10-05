# Landmarks for the 2025 venues (Stage J's treatment for Stage L's sixteen)

Stage J (`2026-10-01-trackside-blender-design.md`) gave the original eight venues hand-built Blender landmarks, real grandstands with their crowds, and yachts on the water. Stage L added the other sixteen circuits of 2025, each with a `landmarks` note naming what it should get. This stage builds those landmarks, gives every new venue its stand type, and puts yachts on the honest harbours. It is a design review item: nothing merges until the user says yes.

## 1. Conventions (unchanged from Stage J)

- Real metres in Blender, Z up, the front toward +Y (the circuit side; three.js -Z). Drawn at `LANDMARK_SCALE` (2.5 units a metre), the city's scale.
- Materials by role, named in the GLB and dressed in `r3d/landmarks.js` (`dressLandmark`). New roles: `screen` (an LED surface painted by its vertex colours, unlit, glowing: the Sphere), `spray` and `mist` (a fountain's jet and the softer water falling round it, translucent), `grass` and `sand` (landforms, in the venue's own ground colour), `gridshell` (the Yas hotel's lit lattice), `red_steel` (the Austin tower), `facade_blue`, `facade_bronze` and `facade_hotel` (the window shader with blue or bronze glass, or a hotel's narrower rooms), `crowd` (the rows of fans in a landmark's stands and on the banks: the painted crowd texture, a row to a step, by the UVs in metres), `seat` (in the venue's stand colour).
- No logos, no trademarks, no text, no sponsor marks. Shapes from public photographs, used only as reference.
- Budgets: a landmark up to 40,000 triangles. Every mesh facing outward (the Node test from Stage J covers every file in `assets/landmarks/`): a mesh is closed, or open only where it stands on the ground.
- **Nothing over the track.** Where the real building spans the circuit (the Yas hotel's bridge, Shanghai's bridge building), the span is left out and the halves stand either side.

## 2. The models (`tools/blender/build_landmarks_2025.py` → `assets/landmarks/*.glb`)

A new script, separate from `build_landmarks.py` (which another stage edits), with its own copy of the small mesh kit.

| Venue | File | What it is, in proportion |
| --- | --- | --- |
| Albert Park | `melbourne_skyline.glb` | Melbourne's tallest three, seen across the park: Eureka Tower (297 m, its gold crown and the red stripe up one face), Australia 108 (317 m, its curved plan and the gold "starburst" cantilevered at about 210 m), the twin Rialto towers (251 m, blue glass, saw-tooth tops) |
| Shanghai | `shanghai_grandstand.glb` | The main grandstand (about 300 m), its two great wing roofs at either end sweeping up to 52 m with upturned, pagoda-like eaves; the bridge across the track left out |
| Jeddah | `jeddah_fountain.glb` | King Fahd's Fountain: its jet 260 m up from a small platform at sea, the plume widening and falling back as spray, lit at night |
| Miami | `miami_stadium.glb` | The stadium the circuit runs round in life: an open oval bowl about 280 by 235 m, its upper tiers along the sides (rim 38 m), its ends low (10 m) so the far tiers and the canopy's underside show over them from the track; concourses as dark bands in the ribbed outer wall; the canopy ring at 45 m, held by four corner masts to 90 m, their cables fanning over it. It stands inside the loop as in life, as far from the road as the infield allows. At the city's scale the infield has no room for a bowl this size, so it is drawn smaller, down to the circuit map's own scale (1.3 units a metre: its true size against the track) before it would stand anywhere else. It fills the infield: the painted "marina" has no room beside it, so Miami has no yachts |
| Imola, Hungaroring, Red Bull Ring, Circuit of the Americas | `hillside.glb` | The grass bank spectators watch from (Imola's Tosa, the Hungaroring's bowl, the Styrian slopes, Austin's Turn 1 hill): a long sculpted slope with concrete terraces stepped into its face, a fence at its foot and a path along its crest |
| Barcelona | `barcelona_grandstand.glb` | The main grandstand opposite the pits: about 240 m of two tiers under a roof cantilevered from steel trusses |
| Montréal | `biosphere.glb` | The Biosphère: a 76 m geodesic sphere cut at 62 m, a double lattice (triangles outside, hexagons in), on its plinth |
| Red Bull Ring | `spielberg_grandstand.glb` | The main grandstand across from the pits, set into the green bank of the Styrian hillside: rows of fans under a light roof pitched up on raking masts, the grass rising behind. Neutral: the bull sculpture there is a brand's emblem, so the game has none |
| Zandvoort | `hugenholtz.glb` | The Hugenholtz bowl: terraces curving round on their dune, in six pieces so the ground is claimed piece by piece. At the city's scale the bowl is larger than the circuit's own map has room for round the hairpin itself, so it stands on the dunes nearest it that are clear and face the track |
| Baku | `flame_towers.glb` | The Flame Towers on the hill: three glass towers of curved, flame-shaped plan (182, 165 and 152 m) tapering to their tips |
| Baku | `baku_old_city.glb` | The old city's walls (crenellated, with round towers) along the circuit, and the Maiden Tower (29.5 m, its buttress) behind them |
| Circuit of the Americas | `cota_tower.glb` | The observation tower: 77 m, its deck at 70 m, the red steel tubes falling from its top in a veil to the stage below |
| Mexico City | `foro_sol.glb` | The stadium section: a horseshoe of steep stands about 30 m high, its floodlight towers |
| Las Vegas | `vegas_sphere.glb` | The Sphere: 157 m wide and 112 m tall, its LED skin showing a planet (an abstract image, no mark), drawn per pixel in the game (crisp at any distance) and turning slowly; the model's vertex colours are only for the Blender render |
| Las Vegas | `vegas_strip.glb` | Strip towers: a curved bronze-glass slab, a Y-plan gold-glass tower, and the 350 m observation tower with its pod. Their ground in front is kept clear and the generic blocks along the Strip are one row, so they are seen from the track |
| Losail | `losail_grandstand.glb` | The floodlit main grandstand: a long covered stand under a scalloped white canopy on masts, its floodlight pylons |
| Losail | `lusail_towers.glb` | Lusail's twin crescent towers (about 200 m) on the skyline |
| Yas Marina | `yas_hotel.glb` | Half of the hotel the circuit runs through: a curved 12-storey block with a hotel's narrow rooms (2.4 m bays, a calm share lit at night) under the gridshell, a fine lattice of diamonds softly lit. Both halves are placed either side of the track where there is room (the bridge between them left out); Yas's infield is too narrow for the second half at the city's scale, so the marina-side half stands alone |

Each is checked in the build (budget, on the ground, its size) and in Node (`tests/landmark-models-2025.test.js`: its parts, materials, sizes and budget, and that every mesh faces outward).

## 3. In the game

- **Venue settings** (`r3d/landmarks.js` `VENUES`): each new venue's `extras` gains its landmark builders; its `stand` type is set (covered or open, as Stage J did); harbour venues list their `harbour`.
- **Stand types:** covered at Shanghai, Jeddah, Barcelona, Circuit of the Americas, Mexico City, Losail and Yas Marina; open terraces at Albert Park, Miami, Imola, Montréal, the Red Bull Ring, the Hungaroring, Zandvoort, Baku and Las Vegas (temporary or hillside stands).
- **Placement:** each landmark through `placeModel` (its parts' rectangles claimed, never over the circuit, never over what is placed, never in the sea), at the lap share or corner where it is in life (Tosa at Tosa, the Niki Lauda bank at Spielberg's first corner, Austin's at Turn 1, the main grandstands opposite the pits, Baku's walls along the old city, the Strip to the west). Stands and banks face the track they watch (`faceTrack`: no other stretch nearer their back than their front). The skyline pieces stand far back on their bearing; the fountain stands out at sea, past the shore.
- **Yachts** (`r3d/yachts.js`): `harbour.anchorIn` also takes `"sea"` (at anchor offshore, past the coast's shore, clear of the fountain). Baku's bay, Jeddah's yacht club and Yas Marina (whose infield has no room for a marina at this scale) anchor at sea. The fleet stays on its water: `auditYachts` reports any hull out of its water.
- **Loading only the current venue:** the venue's models load when its circuit is prepared (behind the loading panel). The background load of every venue's models after the core is dropped: with 24 venues it would download and hold every landmark of the calendar. When the next circuit's world is built, the models of the venues not raced are released (their geometry leaves the GPU and they load again if their venue comes round), so a season never holds more than one venue's landmarks. `Render3D.loadAllModels()` (for the checks, which visit every circuit) keeps every venue's.
- **Performance:** each venue's landmarks within the budget; the frame-time check runs every circuit on all three tiers.

## 4. Checks

- Node: `tests/landmark-models-2025.test.js` (above), `tests/venue-models.test.js` (every venue's landmark names are models with files; every new venue has a stand type and a landmark).
- Browser: `trackside-models-check` grows: every new venue's landmarks built from their models; yachts at Yas Marina, Baku and Jeddah on their water; Miami's stadium inside the loop; `auditScenery` 0 and nobody on the road everywhere; frame time on every circuit, all tiers.
- Review: screenshots from the track of every new venue's landmark at 1600x900 (`docs/review/2026-10-04/landmark-<id>.jpg`) and the Blender renders, on the site's Trackside section too.
