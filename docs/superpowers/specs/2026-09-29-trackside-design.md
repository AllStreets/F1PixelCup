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

### The data (`tools/tracks/build_tracks.py`)

`place_pit_lane(pts, bridges, report)` writes `pit: { side, entry, exit }` for each circuit:
- `side` is +1 or −1, along the normal `n = (−ty, tx)`, the convention of `r3d/track.js` and `powerups.js`;
- `entry` and `exit` are where the lane leaves and rejoins the road, as signed distances from the line.

**Where it fits.** At every point of the start/finish stretch, from 900 before the line to 440 after it (just short of the first item boxes at 450), and on each side, it works out whether the lane and working lane fit (out to W + 59) and whether the garages fit as well (out to W + 95). A point fits when it is:
- at least 40 units clear of the road edge of any other stretch of the lap (more than 300 units away round the lap);
- not on the inside of a bend tighter than its reach + 30, so the lane never folds;
- more than 7 points plus a mouth's length from a bridge.

**Which lane wins.** The lane must be at least two mouths plus eleven bays long (650), and at most 1100. Among the lanes that fit:
1. one that spans the line wins, as real ones do;
2. then the longest;
3. then the one best centred on the line.

- Ruling: Monaco's stretch bends hard right after the line (radius 76 to 136 on the pit side, where the pit complex reaches out 108). Its lane therefore runs from 900 to 210 before the line: Anthony Noghes onto the start straight. Every other circuit's lane spans the line. Cost if wrong: Monaco's pits sit a little up the road from the line.

**Keeping clear of the lane.**
- `place_scenery` skips anything on the pit complex's footprint, which moved two of Monza's eleven grandstands.
- `place_item_boxes` keeps its rows out of the zone.
- The circuit points themselves are unchanged.

The constants live in `pitlane.js` and in `build_tracks.py`, and `tests/pitlane.test.js` checks they agree (as with `START_ZONE_BEFORE`).

### The shape (`pitlane.js`, UMD like `quality.js`)

Lateral offsets from the centreline, where the road's half-width is W = 49.5:

| Part | From | To |
|---|---|---|
| Pit wall | W + 8 | W + 11 |
| Fast lane | W + 11 | W + 47 (centre W + 29) |
| Working lane (painted) | W + 47 | W + 59 |
| Garages | W + 59 | W + 95 (depth 36) |

- **The mouths.** Over the first and last 200 units, the lane's centre eases from the road's edge (W − 6) out to W + 29 on a smoothstep. The pit wall starts only where the lane's inner edge has cleared it, so the mouths are open.
- **API:**
  - `Pit.lane(track)` returns `{ side, entry, exit, length, inZone(d), latAt(d), wallAt(d), outerAt(d), garageSpan }`;
  - `latAt(d)` is the lane centre's signed offset, or `null` outside the zone;
  - `outerAt(d)` is where the pit-side boundary of the circuit sits, or `null`.

### Rendering (`r3d/track.js`, `r3d/landmarks.js`)

- **The pit-side boundary.** In `buildCourse`, the pit side's outer boundary through the zone becomes `max(outer, outerAt(d))`. The run-off, the barrier line, `clearance()` and therefore every piece of scenery and `auditScenery` all see the pit complex as part of the circuit.
- **In `buildCircuit`:**
  - the lane's tarmac (darker, a fresh surface), its white edge lines, and the dashed line between the fast and working lanes;
  - a painted "PIT" at the entry and the blend lines at both mouths;
  - the pit wall (concrete, 6 high), with team stands along it: roofed boxes on the wall, their roofs never reaching past the wall toward the road;
  - the pit-side barrier through the garage frontage is left out, because the garages are the boundary there.
- **The garages** replace today's `pitBuilding`, in `landmarks.js`:
  - one bay per team (10), in team colours, opening onto the working lane;
  - a hospitality floor above, and the circuit's name (Silverstone keeps the Wing roof);
  - the Safety Car's own bay by the exit;
  - each bay is a straight box on a lane that may curve, so its front stands 4 back from the working lane and no corner reaches over it;
  - the roofs stop at the garages' front, and are light grey rather than white, because the sun on white blooms to a glare.
- **Print reads forward from both sides.** Double-sided print (the advert barriers, billboards and the gantry banner) flips its texture on back faces (`readsBothWays` in `r3d/track.js`). A billboard seen from behind across a corner no longer reads "ᗡƎƎqS".
- `auditScenery` gains the lane: its rays already span `−outerL … outerR`, which now includes the lane.

### The safety car (`game.js`)

- **Leaving.** When its time is up, the safety car turns off its lights, speeds up to 0.85 of the field's mean top speed and moves to the pit side of the road (`lat → side × (W − 6)`). At the pit entry it turns in and follows the lane, slowing to the pit limit (0.35 of the mean top speed). Over the last 40 before its bay it eases into the working lane, then stops in front of its garage. It stays parked there, lights off, until it is next called out.
  - The route is `Pit.wayIn(lane, d, entered)`, a pure helper in `pitlane.js` (the spec's `PowerUps.safetyCarLeaveLat`, which belongs with the lane).
  - If the safety car is already inside the zone when called in, having never taken the entry, it goes round again.
- **The feed** says "Safety Car in this lap. Racing resumes." as it does today.
- **Its body.** While it is on the road it is solid, as now (`holdStationSpeed` by lane). Once in the lane it is past the road's edge, so no car is held by it.
- **A new call** while it is still on its way in, or parked, sends it back out at the leader (as a call does today).

### Tests (G1)

- **Node** (`tests/pitlane.test.js`):
  - every circuit has a pit lane;
  - its constants agree with `build_tracks.py`;
  - at every point of the lane, independently recomputed from the points, the pit wall and garages are clear of every other stretch;
  - `latAt` is continuous, starts and ends at the road's edge, and is flat through the middle;
  - no item box lies in the zone's mouths.
- **Node** (the safety car's path, `Pit.wayIn`):
  - before the entry it holds the road's edge on the pit side;
  - inside the zone without having taken the entry, it stays on the road;
  - at the entry it turns in and follows `latAt`;
  - past its bay it parks in the working lane;
  - both sides are covered.
- **Browser:**
  - `powerups-check`, `safetyCarGoesIntoPitLane`, on all 8 circuits: the safety car stays on the road until the entry, turns in there, is off the road only inside the zone, never passes through the pit wall or past the boundary, and parks at its bay. `safetyCarLeaves` has it park with the whole race running.
  - `trackside-check.js`:
    - `pitsOnEveryCircuit` (`Render3D.auditPits`): eleven bays with the Safety Car's last, garages clear of every road beyond the working lane, and ten stands at least 5 beyond the road's edge;
    - `sceneryClearWithPits`: `auditScenery` 0, and the advert barriers loop-free and reading forward;
    - `noPrintReadsBackwards` (`Render3D.auditPrint`): it failed with the billboards unwrapped;
    - `safetyCarParksAtItsGarage`: drawn with its lights flashing while out, lights off in the lane, then parked within 3 of its bay.
- **Screenshots:** each circuit's pit lane from the main straight.

---

## G2 — Venue moments, seen and heard

### The Monaco tunnel

- **Where.** It is found from the lap's own shape: the section after Portier, the second right-hander after the Grand Hotel hairpin (the tightest corner on the lap), running to the braking zone of the Nouvelle chicane. Its start and end distances are written into the track data by `build_tracks.py` (`tunnel: { from, to }`), and a Node test confirms they sit between those corners.
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
