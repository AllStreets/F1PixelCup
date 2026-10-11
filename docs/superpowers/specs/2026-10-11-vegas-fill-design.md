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

- **The ground** is painted where the plain one lay: near the circuit in detail (4.6 km square), the valley beyond it coarser. Roads with kerbs and centre lines, car parks, turf in several greens, pools lit turquoise, the lamps' pools of light, a paved plaza round the Sphere, a promenade to the High Roller, planted beds with a path and low lights where the map leaves a resort's grounds empty. Past the map: the valley's grid of lit streets and house lights thinning to the dark desert.
- **Low buildings** are extruded from their footprints in the Strip's facade shader's quiet kinds (plain walls with lit bays at street level, dim rooms, parking decks as dark ribbons), merged by 700-unit tile into one material. Canopies are lit from beneath; a chapel has its steeple.
- **Instanced:** cars in rows in the car parks near the circuit, lamp posts along the roads and across the car parks, palms along the boulevards, round the pools, in the beds and on the golf course.
- **Also:** the monorail's beam on piers with a station and a train here and there (placed along the line: the map's stations are not used), the footbridges that cross nothing of the circuit, bus shelters, billboards (blank and floodlit, or screens of abstract colour, no lettering), the Fashion Show's oval canopy, the far lamps and windows as points of light.
- **The horizon:** the mountains' silhouette round the valley (higher to the west) and a sodium glow low over the city.

## 3. Rules it keeps

- Built last, after the Strip, the Safety Car's entrances, the stands, the landmarks, the marshals and the people have their ground, and claims none. A piece stands only where every corner of it is 14 units outside the barriers and nothing is already there; otherwise it is left out (never moved). Elevated pieces (the monorail, footbridges) stop short of the track and its run-off.
- Nothing of the Strip is touched: the fill is low, and no fill building stands inside a Strip footprint.
- Among the landmarks for `auditScenery`; the painted ground is ground.
- By tier: Low leaves out the cars, lamp posts and palms; Medium parks half the cars.

## 4. Checks

- Node (`tests/vegas-fill.test.js`): the data's layers and credit, nothing inside a Strip building, the model carries the data, cars in rows inside their car park, lamps along a road, the low buildings' quiet looks, the build order and that the fill claims no ground.
- Browser: `trackside-models` with `CIRCUITS=lasvegas`, the perf check, `auditScenery` 0.
- Screenshots round the lap, with before and after pairs: `docs/review/2026-10-11/vegas-fill-*.jpg`.
