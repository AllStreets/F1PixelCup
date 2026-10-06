# The Las Vegas Strip, building by building

The user (2026-10-05): a beauty pass on the Las Vegas Strip Circuit, every major building of the Strip represented where it really stands, to the standard of the Monaco casino, lit for the night race, accuracy first, and no lag (60 fps on Medium at Retina).

## 1. Where the buildings come from

- **OpenStreetMap** (ODbL, credited): every building and building part round the circuit, with its footprint, height (or levels), colour and roof shape (`tools/vegas/build_strip_data.py` → `tools/vegas/strip.json`). The tall ones are kept (20 m and over): about 210 footprints from the Strat in the north to Mandalay Bay in the south.
- **Where they stand:** the footprints are projected exactly as `tools/tracks/build_tracks.py` projects the circuit (its own centre, metres), and that centre is placed in the game by sliding the true circuit outline onto the game's (a fit of about 3 units). Drawn at the circuit map's own scale (1.3 units a metre), so each building stands where it does relative to Koval Lane, Harmon Avenue, Sands Avenue and the Strip.
- **Each resort's look:** its towers grouped by name or position (the towers the map doesn't place in a resort get a neutral stone colour and no band of light) (Bellagio, Caesars Palace, the Venetian and the Palazzo, Wynn and Encore, the Cosmopolitan, Aria, Paris, the LINQ, Flamingo, Planet Hollywood, the Mirage, Treasure Island, MGM Grand, New York-New York, Excalibur, the Luxor, Fontainebleau, Resorts World, the Strat, Mandalay Bay), each with its own colour and glass, and its band of light round the top of its tall towers in its own colour.

## 2. The landmarks, by hand (`tools/blender/build_vegas.py`)

On their map anchors, in proportion from public photographs used only as reference, with no names, logos or marks:

| Landmark | What it is |
| --- | --- |
| Paris | the half-scale Eiffel Tower (165 m): four lattice legs curving in, X-braced faces, two platforms, the top and mast, lit gold, a beacon; the hot-air balloon (46 m) in blue gores with gold, rings of light; the Arc de Triomphe |
| The Venetian | the campanile (96 m): brick shaft, belfry arches, green spire; the Doge's Palace front (arcade, loggia, pink wall, parapet); the Rialto bridge |
| Caesars Palace | the Colosseum: a white drum ringed by columns, its crown lit blue |
| The LINQ | the High Roller (167.6 m, 158.5 m across its cabins): a rim, cable spokes, 28 glass cabins, raked legs, its rim's lights |
| Bellagio | its lake (the map's outline) and the fountains: rows of jets that rise and fall in a show along the rows, all of them together every half minute |
| New York-New York | the Statue of Liberty replica on its pedestal, her torch lit |
| Luxor | the pyramid (107 m) in black glass with lit edges, the sphinx facing the Strip, the beam from the apex into the sky |
| The Strat | the 350 m tower, its pod's lit glass, the mast |
| LED walls | Planet Hollywood's along its front, the Cosmopolitan's marquee pillar, Resorts World's on its tower: abstract moving colour (no image, no mark) |
| The Sphere | the existing model, now where it stands and at the same scale |

## 3. In the game (`r3d/vegas.js`)

- The venue's **city** is built first (`buildCity`), before the track data's grandstands, so they fill in round it.
- **Nothing on the track:** the game's road and run-off are wider than the real streets. A piece whose ground (every corner and edge of it, dropped to the ground) would come within 10 units of the barrier is moved straight away from the track until clear, a resort's towers, parts, screens and sign together so they never come apart (`r3d/vegas-place.js`; the moves are recorded, at most 70 units; the Sphere 140, since the circuit runs round its own corner). A moved piece also keeps off ground already taken. One that can't is left out, with why. `auditScenery` stays 0.
- **Night:** the facades are the window shader with each building's colour from its vertex colours; stone hotels are floodlit warm, glass towers carry their lit rooms; neon bands, the LED walls, the fountains and the beam are their own materials. The desert night is clear, so the fog starts far out (1800 to 7000 units).
- **Performance:** the 200 buildings are merged by material and by 600-unit tile after they are placed (a few dozen draw calls, each tile still left out of a view it isn't in); the whole Strip is about 47,000 triangles; only this venue loads it. The screens each show their own picture (an id in their vertex colours); the Sphere's image turns with the Strip's clock.

## 4. Checks

- Node (`tests/vegas-strip.test.js`): the data credited and fitted; every major resort and anchor present; the model's buildings and landmarks, their heights (Eiffel 165 m, High Roller 167 m, campanile 96 m, the Strat 350 m, the pyramid 107 m), the materials, the budget.
- Browser: `trackside-models-check` (Las Vegas built from its models, nothing on the track, frame time on every tier).
- Screenshots from the track at night: `docs/review/2026-10-05/vegas-*.jpg`.
