# Trackside life — design

Date: 2026-09-29 · Stage G of `docs/superpowers/plans/2026-09-29-master-todo.md` · built autonomously (the user's standing instruction).

## Why

The circuits look finished, but empty and silent. The user asked for:
- pit lanes and team garages;
- the safety car going into a real pit lane;
- the Monaco tunnel, dark and lit with engine reverb, and an equivalent signature moment at every circuit;
- crowds, flags, marshals, a TV helicopter and fireworks at the finish.

It ships in three parts, each reviewed and merged on its own:
- **G1:** pit lanes, garages and the safety car;
- **G2:** the venue moments, seen and heard;
- **G3:** trackside life.

## Rules (all parts)

- **Nothing over the track.** The pit complex and every new piece of scenery stay outside the barriers. `auditScenery` stays at 0 on every circuit, and it now covers the pit lane too. The one structure that does span the road is a tunnel, as in real life. It is part of the circuit (not scenery), and its roof sits more than 30 units above the road, clear of every car.
- **Real features.** The pit lane is where the safety car really goes. Marshals wave yellow flags where a car really is stopped or spun. The helicopter follows the real race leader. Fireworks go off when the chequered flag really falls.
- **One source of truth.** The pit lane is defined once, in the track data `{ side, entry, exit }`, and turned into geometry by a shared pure module, `pitlane.js`. Physics, rendering and the tests all read it the same way.
- **Quality-tiered where it costs.** Crowds animate on every tier; the helicopter's rotor blur and the fireworks' particle count follow the graphics tier.

---

## G1 — Pit lanes, garages, the safety car

### Real features (OpenStreetMap)

`tools/tracks/fetch_osm.py` fetches, by way id, the pit lane mapped beside each start/finish straight and Monaco's tunnel (Boulevard Louis II). It keeps five points along each, in `tools/tracks/osm-features.json` (© OpenStreetMap contributors, ODbL, credited in the README, `THIRD-PARTY-NOTICES` and the site's footers). Monza and Suzuka have no pit lane mapped there as a raceway, so theirs come from the circuit's shape alone.

Real features are located on the **true** outline (before the relaxation moves anything):
- A pit lane is found by its two ends, which join the track. Its side comes from its middle points, judged against that stretch only: Monaco's pit lane is nearer the swimming-pool section than its own straight.
- The positions are carried to the relaxed outline as the nearest point within 25 points of the same fraction of the way round that runs the same way as the true outline there. The build fails if the match lands on the window's edge or more than 160 away.
- The real pit lane's stretch is recorded in the data as `pit.real` (side, from, to).

**Start lines.** The source's first vertex is the real line on every circuit but two:
- Monaco's is at the Casino;
- Silverstone's is on the old National straight.

Theirs now go halfway between the ends of the real pit lane. This moves both circuits' grids, boxes and scenery, and the lap is resampled from the new start, so its points and length shift slightly.

### The data (`tools/tracks/build_tracks.py`)

`place_pit_lane(pts, bridges, report, real, street)` writes `pit: { side, entry, exit, bays, garageOut? }` for each circuit:
- `side` is +1 or −1 along n = (−ty, tx), the convention of `r3d/track.js`, `powerups.js` and `pitlane.js`;
- `entry` and `exit` are signed distances from the line, within −900…900;
- `bays` holds the eleven bays' signed distances;
- `garageOut` is present only when the garages are shallow.

**Room.** At every point, on each side, it works out whether the lane fits (out to W + 59) and whether garages fit as well (out to W + 95, or W + 83 for shallow ones). A point fits when it is:
- clear of every other stretch (more than 300 round the lap) by that stretch's run-off and barrier with room to spare: `PIT_CLEAR` 46 on circuits, `PIT_CLEAR_STREET` 22 on the street circuits. The other stretches are followed every 10, not just at their points, 30 apart;
- not on the inside of a bend it would fold round: radius < reach + 10 for the lane's tarmac, + 30 for the garages' boxes, which would crowd each other at the back;
- clear of bridges, by 7 points plus a mouth.

**Lanes.** A lane is 650–1100 long: two 160 mouths and at least eleven 30 bays. The bays go on the flat part's 30-long slots that have room, nearest its middle. That is one run where it can be, and split round a tight spot where it can't (Spa). Scoring, in order:
1. on the real side;
2. full-depth garages;
3. bays in one run;
4. overlap with the real pit lane;
5. spanning the line;
6. length;
7. centred.

Item boxes keep out of the zone (`place_item_boxes`), and so does scenery (`place_scenery`, out to the back of the garages).

**Rulings:**
- The real side wins where it has room: Spa, Silverstone and Bahrain. At Monaco (the swimming-pool section), Singapore and Interlagos the real side is too tight at the game's road width (the pit complex reaches out 145, about 110 m), so their lanes are on the other side. Cost if wrong: three pit lanes on the far side from the real ones.
- Spa's and Bahrain's lanes end at the line (their pits run on up to La Source and turn 1 on the real side, where there is no room), so their pit exits are at the line.
- "PIT_CLEAR" was 40, measured from the other road's edge. Review found that the other stretch's own run-off and barrier reach 39 beyond it, so it became 46/22 as above.

### The shape (`pitlane.js`, UMD like `quality.js`)

Lateral offsets from the centreline, where W = 49.5 is the road's half-width:

| Part | From | To |
|---|---|---|
| Pit wall | W + 8 | W + 11 |
| Fast lane | W + 11 | W + 47 (centre W + 29) |
| Working lane (painted) | W + 47 | W + 59 |
| Garages | W + 63 | W + 95 (W + 83 shallow) |

- The garages' fronts stand 4 back (`GARAGE_FRONT`), so a straight bay on a curving lane never reaches over the working lane.
- **The mouths** are 160 long (`MOUTH`). Over each, the lane's centre eases on a smoothstep from the road's edge (W − 6) out to W + 29.
- **API.** `Pit.lane(pit, total, halfWidth)` returns `{ side, entry, exit, flatFrom, flatTo, rel, inZone, blend, latAt, wallAt, outerAt, atGarage, garages: { inner, front, outer, bays } }`. `Pit.wayIn(lane, d, entered, lat)` is the Safety Car's way in.

### Rendering (`r3d/track.js`, `r3d/landmarks.js`)

- **The pit side's boundary.** `buildCourse` takes the pit side's outer boundary through the zone out to `outerAt(d)`. The run-off, barrier line, `clearance()` and all scenery then treat the pit complex as circuit.
- **The lane.** The tarmac runs from the lane's edge to the working lane, and up to the garage doors in front of them. The lines:
  - the lane's inner edge, which is also the blend line painted on the road at both mouths;
  - the dashed line between the fast and working lanes;
  - "PIT" painted on the lane just past the entry.
- **The pit wall** has two faces, a cap and end caps. A catch fence on top stops at the teams' stands. There are ten stands, one opposite each team's garage, with roofs over the wall and the lane's edge, never the road. The stands are merged into one mesh per material.
- **Along the garage frontage** there is no barrier, and no catch fence on the street circuits.
- **The start gantry.** Each post stands just outside its own side's barrier, which through a pit zone is past the whole complex. On the pit side, where there is a pit wall at the line, the post stands on the wall, and the team stand that would be there is left out. It is never in the lane, a garage or a stand.
  - Review found the post passing through Interlagos's stand at the line, and, in a mouth, standing inside the run-off at Spa and Bahrain.
- **The garages** replace the old `pitBuilding`: eleven bays (team colours, and the Safety Car's by the exit), hospitality glass and roof, all within their depth. They are merged into one mesh per material, with a frame per team colour. Silverstone keeps the Wing roof. The roofs are light grey, not white, because white glares.
- **Print reads forward from both sides.** This applies to barriers, billboards and the gantry banner (`readsBothWays`).
- **`sampleAt(d)`** rounds to the true sample spacing (`total / n`), where it used to floor to 6, which was up to 12 out near the end of the lap.

### The Safety Car (`game.js`)

- **Leaving.**
  - When its time is up, its lights go out. It picks up to 0.85 of the field's mean top speed and eases to the pit side's road edge at 40/s.
  - At the pit entry it turns in, but only if it is already at the edge; otherwise it goes round again. It never swerves or jumps sideways.
  - Down the lane it slows to the pit limit (0.35) and, over the last 80 before its bay, eases into the working lane. It parks in front of its garage, lights off, until called again, when it comes out at the leader as before.
- **Its body.** It holds racers up only while it is on the road (`|lat| − half a car < W`), just after the entry included.
- **The minimap** flashes it while it leads the field, shows it steady on its way in, and leaves it off once it is parked. The 2D view, which has no pit lane, doesn't draw it parked.

The game's Settings carry the circuit credits (bacinger/f1-circuits, MIT; OpenStreetMap, ODbL), and so do the `tracks-data.js` header, the site's footers, the README and `THIRD-PARTY-NOTICES`.

### Tests (G1)

- **Node** (`tests/pitlane.test.js`):
  - every circuit has a lane, with eleven bays on its flat part in order, not overlapping, and the Safety Car's last;
  - the constants agree with `build_tracks.py`;
  - `latAt` is continuous and flat through the middle;
  - the pit wall leaves the mouths open;
  - every pit complex is clear of every other stretch by the same rule, followed every 5;
  - no item box is in the zone;
  - `wayIn`: road edge, going round when not at the edge, the lane, the ease, parking.
- **Browser, `powerups-check`, `safetyCarGoesIntoPitLane`**, on all 8 circuits, called in both from the leader and just before the entry out in the road. It checks:
  - no sideways step over 1 per frame (the late case failed before the edge rule, jumping 14 to 25);
  - on the road until the entry, and off it only inside the zone;
  - never through the pit wall or past the boundary;
  - parked at its bay.
- **Browser, `trackside-check.js`:**
  - `pitsOnEveryCircuit` (`Render3D.auditPits`): eleven bays with the Safety Car's last; garages clear of their own road beyond the working lane, and of every other road by `CLEAR`; ten stands at least 5 beyond the road's edge; the gantry's pit-side post on the pit wall;
  - `sceneryClearWithPits`: `auditScenery` 0 (its rays now at most 14 apart across the widened pit side), and the advert barriers loop-free and reading forward;
  - `noPrintReadsBackwards` (`Render3D.auditPrint`);
  - `safetyCarParksAtItsGarage`: drawn flashing while out, dark in the lane, and parked within 13 of its own door as built.

## G2 — Venue moments, seen and heard

### The Monaco tunnel

- **Where.** It is the real one: Boulevard Louis II's tunnel section in OpenStreetMap, located on the true outline and written into the track data as `tunnel: { from, to }` (2019 to 2509 after the line: 490, from the real 356 m). A Node test checks it against the OSM data's length and order.
- **Built** as part of the circuit:
  - side walls on the barrier lines;
  - a roof 36 above the road, with the hotel's mass above it;
  - rows of lamps along the ceiling, lit;
  - dark portals, with a short light-to-dark ramp at the entry.
- **Seen.** Inside, the sun can't reach the road: the roof casts the shadow. The camera's exposure adapts over about half a second, darker going in and brighter coming out, so the lamps read as they do on TV.
- **Heard.** A `ConvolverNode` reverb (a generated 1.1 s impulse) on the engine bus. Its wet level rises from 0 to full over the first 40 units inside the tunnel and falls the same way at the exit. The zone is tied to the tunnel's real distances. A Node test for the pure helper `Venue.reverbAt(d, zones)` checks that the level is 0 outside, 1 inside, and ramps at both portals.

### The other circuits

Each gets a moment built from the same pieces: corner name boards, a reverb or crowd zone, and lighting.

| Circuit | Moment | Seen | Heard |
|---|---|---|---|
| Spa | Eau Rouge / Raidillon | Named boards, the packed bank of stands at the top | The crowd swells as you climb through it |
| Monza | Parabolica | Named boards, a long grandstand on its outside | The crowd swells along it |
| Suzuka | 130R and the crossover bridge | Named board at 130R | Reverb under the bridge (its real span, from `bridges`) |
| Singapore | Night lights | The lit skyline and floodlights (already there) | A low floodlight hum near the light towers |
| Bahrain | Floodlights at dusk | The floodlight towers switch on, in pools of light | — |
| Interlagos | Senna S | Named boards, the stands above the S | The crowd swells through it |

Corner names are real place names, so there are no marks and nothing to license. The crowd swell is band-passed noise whose level follows the distance to the nearest grandstand, mixed low under the engine.

### Tests (G2)

- **Node:**
  - `reverbAt` and `crowdAt` level curves;
  - the Monaco tunnel lies between Portier and the Nouvelle chicane;
  - the Suzuka reverb zone matches its bridge's span.
- **Browser** (`trackside-check.js`):
  - in a Monaco race, moving the player through the tunnel's distances switches the reverb's wet gain in and out at the right distances;
  - the tunnel is dark inside, measured on the road's pixels against the approach;
  - `auditScenery` is 0, with the tunnel exempt because it is circuit, not scenery, and the roof is ≥ 30 above the road.
- **Screenshots:** each moment.

---

## G3 — Trackside life

- **Crowds.** The grandstand crowd texture gets a shader: per-seat colour and a small, slow bob, phase-offset by seat. When the player takes the chequered flag or overtakes in front of a stand, a Mexican wave runs along it: a sweep of the bob, following the car.
- **Marshal posts** every 600 units round the lap, outside the barrier (claimed like any scenery): a small orange-clad figure with a flag. A post waves a waved yellow while a car within 300 units ahead of it is spun or stopped (`spinUntil`, or speed < 10 %). Otherwise the flag is furled. The green flag is waved at the post after an incident, for 2 s.
- **The TV helicopter** flies at 260 above the ground, trailing the race leader by 400 units along the lap and offset to the outside. Its rotor turns, with a faint thump only when it is within 600 of the camera. It is never lower than 200, so it is never near anything on the track.
- **Fireworks at the finish.** When the chequered flag falls (`flagOutAt`), bursts go off above the grandstands by the line for 6 s:
  - 8 shells on High, 5 on Medium, 3 on Low;
  - team colours of the winner.
- **Flags on the gantry.** The start gantry's banner is joined by a chequered flag waved by the starter at the finish.

### Tests (G3)

Browser (`trackside-check.js`):
- the marshal nearest a car forced to spin shows a waved yellow within 0.5 s, and furls after the car moves off;
- the helicopter's lap distance tracks the leader's (−400 ± 60), and its height is ≥ 200;
- fireworks start at `flagOutAt`, and none before;
- `auditScenery` is 0 with the marshal posts in place;
- there are no errors on any circuit.
