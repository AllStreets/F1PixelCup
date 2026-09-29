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

- **Where.** It is the real one: Boulevard Louis II's tunnel section in OpenStreetMap, found on the true outline (by its two ends, which join the track). The track data holds it as `tunnel: { from, to }`: 2019 to 2521 after the line, 502 units against the real 356 m × 1.3 = 463. `tests/track-features.test.js` checks it against the OSM length (within 20 %) and racing order, and that only Monaco has one.
- **Built** as part of the circuit (`buildTunnel`, `r3d/track.js`), like a bridge:
  - walls 1 outside the barrier lines, up to a roof 36 above the road (`TUNNEL_ROOF`, clear of every car);
  - the roof's dark underside, and a slab 8 thick on top;
  - the hotel's floors (the Fairmont) rising 48 over the middle 60 %, windows and all;
  - two rows of lit lamp panels along the ceiling.

  The hotel is a closed, double-sided block with end walls, and the slab is capped at both portals. The walls, roof, slab and hotel are all sun occluders for the flare. The street catch fence stops at the portals.
- **Seen: the tunnel's own light** (`r3d/tunnel-light.js`).
  - The tunnel is handed to the shaders as a chain of 24 boxes along its stretch, with a bounding-circle early-out, so other circuits pay nothing.
  - Every lit (standard) material, and the kerbs' shader, scales its light by how deep inside the tunnel the pixel is. Sky (hemisphere), environment and sun all drop to 8 % deep inside, easing in over the 40 at each portal as daylight spills in. The lamps' warm light (0.3) is added in their place.
  - So a car, or the road, is dark or lit by where it is, not by where the camera is. From the sunlit approach the mouth is dark; from inside, the exit is blown out.
  - Only the exposure is camera-based. It adapts toward ×2.4 inside, with a 0.5 s time constant (`updateTunnelLight`, `render3d.js`): dark going in, bright coming out, as a TV camera does. The venue's own light is kept per world, so each frame starts from it; this also fixes the showroom's exposure lingering.
  - Ruling: a first version dimmed the whole scene by the camera's position, plus a scene-wide ambient. Review found it physically dishonest: the approach saw the interior lit, and the world outside went dark from inside. It was replaced by the above.
- **Heard.** The engine also feeds a `ConvolverNode`, but only on circuits with a reverb zone. It is a generated impulse of stereo noise decaying over 1.1 s, with its wet level at 0.9 × `Venue.reverbAt(d, zones)`. The level is 0 outside, 1 inside, and eases over the first and last 40 (`RAMP`).

### The other circuits

- **Corner name boards** at the real signature corners, their positions from OpenStreetMap's named raceway ways (`corners` in the track data):
  - Eau Rouge and Raidillon (Spa);
  - Curva Alboreto, with "Parabolica" beneath (Monza);
  - 130R (Suzuka);
  - S do Senna (Interlagos), both of its ways, turn 1 and turn 2.

  Each stands on the outside of its corner, past the barrier, facing the track, and claims its footprint like any scenery. Where the spot is taken it moves along the corner (up to 80), then to the inside (130R's is on the inside).
- **Suzuka's crossover.** Under the bridge the engine rings: a reverb zone of ±70 (`UNDER_BRIDGE`) round where the lower road passes beneath, from `bridges`.
- **The crowd** swells past every grandstand: band-passed noise (650 Hz, from its own 6 s buffer, so no audible loop) whose level follows `Venue.crowdAt`. It is full level with a stand and gone by 420 (`CROWD_REACH`). Each stand's lap distance is recorded in the track data where it was placed, since the nearest road to a stand can be another stretch.
- **Floodlights** (Singapore at night, Bahrain at dusk):
  - each tower casts a soft warm pool of light across the near half of the road, stronger at night;
  - the pools lie on the ground (tagged as such), so they aren't scenery over the track;
  - a faint 100 Hz mains hum plays while racing at the floodlit circuits (`Venue.FLOODLIT`, tested against `VENUES`).
- Ruling: the spec's table named a "crowd at Eau Rouge / Parabolica / Senna S". The crowd follows every grandstand the circuit really has; the name boards mark the corners. Cost if wrong: no extra crowd where a corner has no stand.

### Tests (G2)

- **Node** (`tests/venue.test.js`, `tests/track-features.test.js`):
  - the reverb and crowd level curves, including round the line;
  - the reverb zones (the tunnel, and under a bridge);
  - the floodlit list against `VENUES`;
  - the tunnel against OpenStreetMap.
- **Node:** the corners data (in racing order, the real length within 35 %) and every grandstand's `d` beside its stand.
- **Browser** (`trackside-check.js`):
  - `venueBuilt`:
    - every corner has its board, past the barrier, within 90 of its corner;
    - the tunnel's roof, measured from the built geometry, is at least 30 up;
    - Suzuka's reverb zone is on the lower road with the bridge deck crossing above it.
  - `tunnelRings`: the reverb gain node itself, with the audio running, is under 0.05 before and after the tunnel and over 0.8 inside. It failed with the gain never set.
  - `reverbOnlyWhereItRings`: at Monza the convolver isn't fed.
  - `crowdSwells`: every stand is heard beside its own stretch and loudest there, and there is silence far from every stand.
  - `tunnelDark`: in one picture from the sunlit approach, the road just inside the mouth is under half as bright as the road just before it; from inside, the road is under 0.6 of the approach's. It failed with the tunnel's light off.
  - `auditScenery` stays at 0 everywhere, with the boards and pools included.

## G3 — Trackside life

- **Marshal posts** (`marshals.js`, pure).
  - **Placement.** There is a post every 600 round the lap (`Marshals.posts`). Each stands on the outside of the bend, 14 past the barrier, on a raised platform so it sees (and is seen) over the barrier. It claims its footprint like any scenery (`r3d/trackside.js`) and moves up to 90 along where the spot is taken; at least 80 % of posts must be placed.
  - **Flags.** A post waves yellow while a car in the 300 ahead of it is spun (`spinUntil`) or crawling (under 10 % of its top speed). It waves green for 2 s after the car clears; otherwise the flag is furled. There are no flags in the first 5 s after the lights, when every car is slow. The flags wave (the pole swings and the cloth ripples).
- **The TV helicopter.** It flies 260 up and 220 aside, keeping station 400 behind the race leader (`game.js tracksideFrame`), easing after them. It jumps there on a new circuit. Its rotor turns, and its beat (low noise pulsed at 11 Hz) is heard faintly when it is within about 700 of the player.
- **Fireworks** start when the chequered flag falls (`flagOutAt`):
  - 8 shells on High, 5 on Medium, 3 on Low, over 6 s, in the winner's team colour, gold and white;
  - they burst over the grandstands near the line (or over the line if it has none);
  - they run on real time, held while paused, because the race itself fast-forwards after the flag.
  - Ruling: the first version ran on race time, and the 7× fast-forward after the flag burned the whole show out in under a second. It was found in the check.
- **The crowd.** The spectators bob in their seats (a UV shift per seat in the crowd's shader), and at the flag a wave runs along the stands.
- **The starter** stands by the line, past the barrier on the side away from the pit wall, and waves the chequered flag for 20 s of the show.
- All of it is scenery for the audit: the marshal posts and the starter are in `auditScenery`'s targets, and it stays at 0 on every circuit.

### Tests (G3)

- **Node** (`tests/marshals.test.js`):
  - the posts are evenly spaced;
  - yellow for a spun or stopped car ahead, and not for one behind, beyond the stretch, or finished;
  - green for 2 s, then furled;
  - nothing before the start;
  - posts watch round the line.
- **Browser** (`trackside-check.js`):
  - `marshalsPosted`: at least 80 % of posts placed on every circuit;
  - `marshalYellow`: a car spun just past a post brings that post's yellow, and green once it is away, with no other post flagging;
  - `helicopterFollows`: 280 to 560 behind the leader (station 400, easing), at least 200 up;
  - `helicopterHeard`: its rotor is heard near it, and silent far from it;
  - `fireworksAtTheFlag`: none before the flag, fireworks and the starter's flag after it, still going 3.4 s in.
