# Las Vegas: the ground between the towers

The user (2026-10-11): the Strip's buildings are right, but the space between and behind them is "just low ground, gray areas, brown areas". Fill it with what really stands there, at night, without moving, hiding or restyling any Strip building.

## 1. Data (`tools/vegas/build_fill_data.py`)

From OpenStreetMap (ODbL, already credited), in the Strip's own metres and origin (`tools/vegas/strip.json`):

- every low building the Strip's model leaves out (about 3,500), each with a height (the map's, or one by its kind and size) and a kind: plain, parking garage, house, hotel or apartments, canopy, chapel, shed;
- surface car parks, swimming pools, gardens and the golf course;
- roads by class with their widths, the monorail, the footbridges;
- where the Sphere and the High Roller stand.

Written to `tools/vegas/fill.json` and, for the game's loader, to `assets/landmarks/vegas_fill.glb` (a model without geometry, the data in its scene's extras), loaded only with this venue. No names or marks are kept.

## 2. In the game (`r3d/vegas-fill.js`, `r3d/vegas-fill-plan.js`)

- **The ground** is painted where the plain one lay: near the circuit in detail (4.6 km square), the valley beyond it coarser. Roads with kerbs and centre lines, car parks with their rows' lines, turf in several greens, pools lit turquoise, the lamps' pools of light, a paved plaza round the Sphere, a promenade to the High Roller, planted beds scattered (never in rows) with a path and low lights where the map leaves a resort's grounds empty. Past the map: the valley's grid of lit streets and house lights thinning to the dark desert.
- **Low buildings** are extruded from their footprints in the Strip's facade shader's quiet kinds (a lit front on a main road and for about a third of the rest, dark blocks with a few windows otherwise, parking decks as dark ribbons), merged by 700-unit tile into one material. Canopies are lit from beneath; a chapel has its steeple.
- **Instanced:** cars in rows in every car park near the circuit (the 2,600 nearest are drawn), lamp posts along the roads and across the car parks, palms along the boulevards, round the pools, in the beds and on the golf course.
- **Also:** the monorail's beam on piers with a station and a train here and there (placed along the line: the map's stations are not used), the footbridges that cross nothing of the circuit, bus shelters, billboards (blank and floodlit, or screens of abstract colour, no lettering), the Fashion Show's oval canopy, the far lamps and windows as points of light.
- **The horizon:** the mountains' silhouette round the valley (higher to the west) and a sodium glow low over the city.

## 3. Rules it keeps

- Built last, after the Strip, the Safety Car's entrances, the stands, the landmarks, the marshals and the people have their ground, and claims none. A building stands only where every point round its outline (sampled every 15 units) is 14 units outside the barriers and nothing is already there; a palm by its own fronds' reach plus 5; a lamp post 9; a parked car 8; a planted bed 12. Otherwise it is left out (never moved). Nothing of the fill stands in the Bellagio's lake or in another fill building. The monorail's beam stops short of the track and its run-off and starts again, with piers only under the beam; a footbridge that would cross the circuit is left out.
- Nothing of the Strip is touched: the fill is low, and no fill building stands inside a Strip footprint.
- Among the landmarks for `auditScenery`; the painted ground is ground.
- By tier: Low leaves out the cars, lamp posts and palms; Medium parks half the cars; the near ground is painted at 4096 pixels on High and 2048 otherwise.
- The painted ground is drawn in the plain ground's place (which is hidden) and is wet in the rain as it was. In the rain the mountains fog over into the night and the glow dims with the overcast, as the sky does. Las Vegas is raced at night only, so there is no day version.
- Only a footprint's outer ring is used, so a courtyard is roofed over.

## 4. Checks

- Node (`tests/vegas-fill.test.js`): the data's layers and credit, nothing inside a Strip building, the model carries the data, cars in rows inside their car park, lamps along a road and along a car park's own aisles, the low buildings' looks, outlines sampled closely, the monorail cut at the track, the build order and that the fill claims no ground.
- Browser: `trackside-models` with `CIRCUITS=lasvegas` (its `vegasFillBuilt`: every kind of piece built, cars in most car parks, trees on the golf course, piers only under the beam), the perf check, `auditScenery` 0.
- Screenshots round the lap, with before and after pairs: `docs/review/2026-10-11/vegas-fill-*.jpg`.

## 5. The race weekend (added 2026-10-11)

- **Grandstands** (`r3d/track.js` `venueStands`, the venue's `stands`): the track data has five and the Strip crowded two out, so the venue places its own: a covered stand tried every 180 units round the lap on both sides (slid a little along the lap, set further back, until it fits), facing the stretch it stands beside, clear of the city, the Safety Car's entrances, the pits, the marshals' posts and the starter's stand. Where none fits (the Strip's straight), a small open bleacher (26 m, five rows on scaffold). Every one has its crowd, lamps at night, seats in four colours.
- **Beside the barriers** (`r3d/vegas-fill.js` `raceWeekend`), at the trackside's own scale (6 units a metre): paddock-club suites with warm lit windows, marquees, broadcast compounds, floodlight towers, signage frames with a soft abstract picture (no lettering), rows of palms. The largest kind that fits each place; the city's low buildings then stand round them.
- **The Strip is pinned.** Where each piece of the Strip stands is decided by the same ground points as when it was approved; its ground is claimed closely only afterwards. `tools/vegas/strip-places.json` holds every named resort's, landmark's, screen's and sign's place, and `trackside-models-check` (`vegasStripPinned`) fails if any moves by more than a unit.

## 6. The Sphere's Earth (added 2026-10-12)

The Sphere shows the Earth: NASA's Blue Marble (Visible Earth, public domain, credited in the notices, the README and the site), 2048 by 1024, with its cloud map as a second layer, fetched and packed by `tools/sphere/fetch_earth.py` into `assets/landmarks/vegas_earth.glb` and loaded and released with the venue's models. `r3d/landmarks.js` `sphereScreen` reads it per pixel from the direction out of the Sphere's centre: no seam at the date line (the map's fineness is taken from the longitude reading that does not jump there), a faint LED grid close to, a blue rim of air, whites held under white. The Earth turns west to east about an axis tilted 23.4 degrees, once in 48 seconds, by the race's own clock (the same in both split-screen views, still in a pause, the same in a replay); the clouds drift a little faster. If the map fails to load, the drawn planet is shown as before. One map size serves every tier. Where stands line a whole lap, at most 14 stands' crowds (8 on Medium) are in 3D at once, the nearest.
