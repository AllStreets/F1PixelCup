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

## 2b. Each resort in its own architecture (`tools/blender/vegas_resorts.py`)

A footprint from the map is a building's true plan (the Wynn's curve, the Mirage's Y, MGM Grand's cross); the second pass gives each resort the rest of its look, from public photographs used only as reference, with no names, logos or marks. One facade material draws every wall; a face's vertex colour is its tint and its alpha its kind:

| Kind | What it is | Where |
| --- | --- | --- |
| Stone (1.0) | a window set in each room's bay, the wall floodlit warm at night, a room in five softly lit | Caesars, Bellagio, Paris, the Venetian and Palazzo, Treasure Island (coral), Excalibur, Harrah's |
| Quiet (0.9) | the same, dim and unlit | the towers the map gives no resort, so the named stand out |
| Plain (0.8) | stone without windows | cornices, belts, attics, tiled roofs, low casino halls |
| Ribbon (0.65) | glass over two thirds of each floor between pale bands | the Mirage and Mandalay Bay (gold), the Flamingo (pink), Planet Hollywood, the LINQ, Vdara |
| Lined (0.5) | tinted glass, a fine pale line every second floor | the Wynn and Encore (bronze), Aria |
| Glass (0.35) | a curtain of tinted glass | MGM Grand (emerald), the Cosmopolitan and the Fontainebleau (blue), Resorts World (red), the Luxor (black) |

Glass at night is not a wall of lamps: it carries the street's glow in the tower's own colour, brighter low down and where it is seen aslant, with smears of the lights below and a few rooms softly lit. Rooms smaller than a pixel give way to the wall's average.

By resort: Caesars has cornices, three belts, an attic and a temple front (six columns before a lit recess, a pediment) on each long face of its towers, the Colosseum's three tiers of lit arches, and three fountain basins before it. The Bellagio's tower is built by hand (the map has it without a height): two wings in one curve hollow toward the lake and a third behind, 151 m, its cupola on the hub, and tiled houses along the shore. Paris has its slate mansard and lit dormers; the Venetian and Palazzo an arcade of lit arches, a tiled hip roof, the Palazzo's lantern. The Wynn, Mirage, Mandalay Bay, MGM Grand and the rest of the glass towers have a pale cap and a band of light in their own colour; the Cosmopolitan a box of light. Planet Hollywood's curved base is wrapped in screens. New York-New York's towers are each a tower of the skyline it copies (stone or glass of its own, a mast on setbacks, a needle on narrowing tiers, a pediment, a ziggurat, a green hip roof). Excalibur is white walls and battlements with round turrets under cones of red, blue and gold. The Luxor is a black glass pyramid with its four edges lit their whole length and a beam 14 m across.

A resort's own pieces are placed together (the Bellagio's lake with its tower and village, the Colosseum and fountains with Caesars). The whole Strip is about 96,000 triangles.

## 3. In the game (`r3d/vegas.js`)

- The venue's **city** is built first (`buildCity`), before the track data's grandstands, so they fill in round it.
- **Nothing on the track:** the game's road and run-off are wider than the real streets. A piece whose ground (every corner and edge of it, dropped to the ground) would come within 10 units of the barrier is moved straight away from the track until clear, a resort's towers, parts, screens and sign together so they never come apart (`r3d/vegas-place.js`; the moves are recorded, at most 70 units; the Sphere 140, since the circuit runs round its own corner). A moved piece also keeps off ground already taken where it can; where its neighbours stand wall to wall it moves all the same (recorded as touching). One that can't clear the track is left out, with why. `auditScenery` stays 0.
- **Night:** the facades are the Strip's own shader (section 2b): stone hotels floodlit warm, glass towers carrying the street's glow in their own colour; neon bands, the LED walls, the fountains and the beam are their own materials. The desert night is clear, so the fog starts far out (1800 to 7000 units).
- **Performance:** the 200 buildings are merged by material and by 600-unit tile after they are placed (a few dozen draw calls, each tile still left out of a view it isn't in); the whole Strip is about 96,000 triangles; only this venue loads it. The screens each show their own picture (an id in their vertex colours); the Sphere's image turns with the Strip's clock.

## 4. Checks

- Node (`tests/vegas-strip.test.js`): the data credited and fitted; every major resort and anchor present; the model's buildings and landmarks, their heights (Eiffel 165 m, High Roller 167 m, campanile 96 m, the Strat 350 m, the pyramid 107 m), the materials, the budget; each resort's kind of wall and tint, the unnamed towers quiet, the shader's thresholds; the resorts' own shapes (the Bellagio's tower and cupola, the castle's cones, the skyline's crowns built down from the map's heights, light in the temple fronts, arcade, dormers and arches, the screens on their buildings).
- Browser: `trackside-models-check` (Las Vegas built from its models, nothing on the track, frame time on every tier).
- Screenshots from the track at night: `docs/review/2026-10-10/vegas-*.jpg`.
