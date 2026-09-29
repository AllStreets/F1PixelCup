# F1 Pixel Cup

An F1 racing game in the browser — Three.js for the world, HTML5 Canvas for the HUD, no build step. Race as any of the 20 drivers from the **2025 F1 season** across 8 circuits in two four-race cups.

---

## Features

- **Full 2025 F1 roster** — all 20 drivers across 10 constructor teams (Red Bull, Ferrari, McLaren, Mercedes, Aston Martin, Alpine, Williams, Haas, Racing Bulls, Kick Sauber)
- **8 real circuits** — Monza, Spa, Silverstone, Suzuka, Monaco, Singapore, Bahrain, Interlagos, traced from the real layouts (see *The circuits* below). Suzuka keeps its figure-of-eight crossover, on a bridge
- **Three difficulties** — Rookie, Pro and Legend. On Pro and Legend the rivals run exactly your physics; what changes is how well they drive: how far down the road they look, how late they brake, how tightly they hold the line and how often they make a mistake. Rookie is the only setting that hands the AI a speed handicap
- **Two cups** — Trophy Cup (Monza → Spa → Silverstone → Suzuka) and Constructor Cup (Monaco → Singapore → Bahrain → Interlagos)
- **Five-lap races** — and the full 20-car field is classified having actually completed the distance, not force-retired at the flag
- **Power-ups: Mario Kart chaos, F1 rules** — eight items, each an F1 idea with a Mario Kart counterpart (see *Power-ups* below)
- **F1-authentic scoring** — 25/18/15/12/10/8/6/4/2/1, plus the bonus point for fastest lap (top ten finishers only)
- **Real race times** — every driver's total race time and gap to the winner, timed to the millisecond at the line, including cars fast-forwarded home after you finish. The race clock is simulated time: it advances exactly as far as the physics does, so times stay true on a slow machine and stop while paused
- **One career per driver** — every driver keeps their own career points, rating, tier, poles, cup record and best laps, each starting at 1200 · F4; an older single career is split by driver the first time it loads (kept as a backup too)
- **Starting grid, your choice per cup** — *From the back* (the default): you start last, Mario Kart style, with the CPU cars in championship order. *Qualifying*: before each race, one flying lap from a rolling start sets the grid; every CPU lap is simulated with the same physics and AI (alone on track, at the chosen difficulty), and qualifying pays career points (pole 10, P2 6, P3 4, P4–P10 2, × difficulty) and counts poles
- **Difficulty that really changes the field** — measured by simulation: Legend CPUs lap 2.5–9.5% quicker than Pro depending on the circuit (least at Monza, where corners rather than top speed set the lap), and Pro 7–15% quicker than Rookie; the same ladder holds in full races (`tools/checks/grid-check.js` asserts it and reports the margins)
- **Real timing gaps** — the tower and the interval panel measure gaps at 24 timing points a lap, as real timing loops do, not from distance
- **Pixel-art F1 cars** — team livery colours, front wing, rear wing, halo, helmet
- **Driver-locked constructor cars** — pick a driver, race their team car
- **Live championship standings** updated after each race
- **Podium ceremony** at cup end

## Power-ups

Drive through the red boxes. Each box is gone for three seconds once a car has
been through it, and the item you get depends on how far you are behind the
leader (not your place), as in Mario Kart 8 Deluxe: the weakest items are the
most common and the strongest the rarest.

| Item | Mario Kart | What it does |
|---|---|---|
| Oil Slick | Banana | Tap Space to drop it behind you; hold Space to trail it, where it blocks one Undercut or Debris from behind |
| Debris | Green shell | Fired straight ahead, bounces off the edges of the track for six seconds |
| DRS | Mushroom | The rear-wing flap opens for a 2 s boost, 3 s on a straight |
| Undercut | Red shell | Follows the track to the car ahead and spins it |
| Overtake Mode | Star | Five seconds faster and untouchable; cars you touch spin |
| Steward Penalty | Blue shell | Flies over the field to the leader: a long spin for them and anyone beside them |
| Formation Lap | Bullet Bill | Four seconds of autopilot at huge speed, untouchable |
| Safety Car | Lightning | A safety car comes out ahead of the leader for five seconds; every rival is slowed and queues single file behind it |

Shots, oil and the safety car move in track coordinates (distance round the
lap and offset from the centreline), so they follow every corner, can't pass
through a barrier and never meet a car on the other level of Suzuka's bridge.
The rules live in `powerups.js`; the odds table on the landing page is drawn
from the same data.

## Heads-up display

Always on screen while racing:

- **POSITION** — your live place out of the field, flashing green or red when a place changes hands
- **LAP** — current lap of the total, with a lap-progress bar
- **INTERVAL** — gap in seconds to the car ahead and the car behind
- **SPEED** — km/h with a redline bar
- **Timing tower** — live order and gaps down the left, with a feed ticker for race news
- **Mini map** — rotated so *up is always the direction you are driving*, with a field-of-view wedge showing exactly the slice of track filling the main screen, every rival as a heading-aware blip, and the podium places ringed in gold

## Career

Your progress is saved in the browser and carries across sessions (and will
upload to your account when accounts arrive).

- **Career points** only go up: each race's F1 points (plus the fastest-lap
  point in the top ten) × difficulty — Rookie ×1, Pro ×2, Legend ×3 — and a
  cup bonus of 50 / 30 / 20 for finishing the cup 1st / 2nd / 3rd, also
  scaled by difficulty.
- **Rating** goes up and down. You start at 1200; each difficulty is a
  fixed-strength field (Rookie 1000, Pro 1400, Legend 1800), and your finishing
  position against it moves your rating Elo-style. Tiers run Karting, F4, F3,
  F2, F1 and World Champion (1850+).
- **Best laps** on every circuit, and a full race history.
- The garage shows your career; the results and podium screens show what each
  race and cup earned.

Run the scoring tests with `npm test` (Node 22, no dependencies).

## The rivals

Every car on the grid, yours included, runs identical machinery. There is no
hidden player advantage: the traffic throttle and brake penalty, the reverse
speed and the road-alignment assist are the same numbers for all 20 cars. The
only thing reserved for the AI is steering avoidance, which stands in for the
hands you have on the keyboard.

A full five-lap race with all 20 cars on autopilot (Pro difficulty), simulated
headless on every circuit. Every car finished the distance on every track:

| Circuit | Fastest AI lap | Median AI lap |
|---|---|---|
| Monza | 38.0s | 39.6s |
| Spa-Francorchamps | 44.3s | 46.9s |
| Silverstone | 37.6s | 39.5s |
| Suzuka | 39.3s | 42.6s |
| Monaco | 20.3s | 22.0s |
| Marina Bay | 30.3s | 32.6s |
| Bahrain | 34.2s | 36.2s |
| Interlagos | 25.9s | 29.2s |

## The circuits

Each circuit is its real outline, from the open
[bacinger/f1-circuits](https://github.com/bacinger/f1-circuits) dataset (MIT),
converted by `tools/tracks/build_tracks.py` into `tracks-data.js`:

- Every circuit uses the same scale, so Spa is the longest lap and Monaco the shortest.
- The game's road is wider, relative to its cars, than a real one. Two things are
  adjusted, locally and only where needed: corners tighter than the road can turn
  are opened out, and stretches that would overlap once widened (Monaco's harbour
  front, parts of Singapore and Interlagos) are nudged apart. The largest shift
  from the real line is about 45 m, at Monaco; Monza's is 12 m.
- Suzuka really crosses itself, so the later pass climbs over the earlier one on
  a bridge. The physics never confuses the two: each car only looks for road
  near where it already is, so it can neither snap across the crossover nor cut
  between two stretches that run side by side.
- Grandstands, billboards, towers and item boxes are placed by the same tool,
  and every piece of scenery in the 3D view checks its whole footprint against
  the entire circuit before it is placed, so nothing ever sits on the track.
  That includes the background: hills, mountains, skyline towers and water are
  slid outwards until they clear it. `Render3D.auditScenery(track)` checks the
  result by dropping a ray onto points right across the road and run-off all
  the way round the lap; every circuit comes back with zero hits.

## Sound

Everything is synthesised with WebAudio — no audio files, nothing to load.

- **Engine note** that rises with speed and steps through fake gears
- **Tyre scrub** while drifting or running wide
- **Start light beeps**, one per light, then the lights-out tone
- Impacts, spins, power-up pickup and use, drift-boost, lap chime, final-lap call and a finishing fanfare
- **Sound on / off** in the pit lane's Settings; the choice is remembered between sessions

The audio context can only start from a user gesture, so it initialises on the first click or key press.

## Race feel

- **F1 start gantry** — five red lights come on one column at a time, then out. Lights out, go.
- **Drift smoke that tells you something** — the smoke off the rear tyres turns from white to blue to orange as the drift boost charges, so you can read the charge without looking away from the road
- **Boost flame, dirt off the kerbs, and impact shake** on contact and spins
- **Catch-up racing** — cars behind you run up to 10% quicker and cars ahead up to 10% slower, so the field stays in touch instead of stringing out over a lap
- **Live lap times** — current lap and your best, alongside the lap counter; the race results carry a best-lap column with the fastest highlighted
- **FINAL LAP** call, and a chequered-flag panel while the remaining cars come home
- **Everyone finishes.** Once you are home the rest of the field is fast-forwarded by sub-stepping its physics, so every car completes the full five laps in about three seconds of real time rather than being retired where it stood

## Rendering

The world is drawn in real 3D with **Three.js**; the HUD stays on a transparent
2D canvas laid over the top. `game.js` still owns physics, AI, laps, items and
audio, and hands the renderer the race state each frame. If WebGL or the car
model is unavailable it falls back to the original pseudo-3D canvas renderer.

- **Blender-built F1 car** (`assets/f1_car.glb`) with a four-element front wing,
  bargeboards, louvres, halo, T-cam, brake drums and a driver. Each team has its
  own paint scheme after its 2025 car (a split lower flank, a nose-to-tail fade,
  a pinstripe, a painted nose), plus the driver's number on the nose and fin and
  their helmet colour. Wheels roll and steer.
- **The circuit** is extruded from the physics centreline: tarmac, kerbs only
  where it bends, gravel traps on the outside of corners, run-off that narrows
  wherever another stretch of the lap is close, advertising barriers, catch
  fences on the street circuits, a start gantry and grid slots.
- **Landmarks per venue.** Monaco's harbour, apartment blocks, yachts, casino and
  mountains; Spa's Ardennes forest and hills; Monza's royal park and the old
  banking; Silverstone's Wing and airfield hangars; Suzuka's Ferris wheel and
  bridge; Marina Bay Sands, the Singapore Flyer and a lit skyline at night;
  Bahrain's Sakhir tower, dunes and palms; the lake and São Paulo skyline at
  Interlagos. Every circuit gets a pit building on the main straight.
- **Camera with a sense of speed.** The field of view opens up as you go faster
  (more under a boost), the camera drops and looks further ahead, and it shakes
  over kerbs and off the track, with a kerb rumble on the audio.
- Photographic ground textures from Poly Haven, reflections on the paint,
  real-time shadows, fog, a sky with the sun, 3D smoke and boost glow.
- **3D showroom** in the pit lane: the selected car on a turntable.

About 1–2 ms to render a frame on every circuit.

Rebuild the car with `tools/blender/build_f1_car.py` (see `tools/BLENDER-MCP.md`),
the power-up models (item box, oil pool, carbon shards, the Undercut's soft tyre,
the Steward Penalty puck and the safety car, in `assets/items/`) with
`tools/blender/build_items.py`, and the circuits with `tools/tracks/build_tracks.py`.
The power-up icons in `item-icons.js` follow one broadcast-graphics style guide
(docs/superpowers/specs/2026-09-29-power-ups-beauty-design.md).

## Physics

- Drift-boost system (hold Shift in corners)
- Traffic avoidance AI with wide lane spread to prevent corner bunching
- Spin immunity window so a driver cannot be chain-spun to a standstill
- Frame-rate independent drag, AI weapon use and lap timing — the game plays the same at 60Hz and 144Hz
- Lap detection works off a wrapped-distance test plus a half-lap accumulator rather than a speed threshold, so a car that crawls over the start line still gets its lap (a threshold here previously cost the front row an entire lap)
- Controlled reverse — limited speed so you can back out of walls without overshooting
- Heading correction disabled while reversing so steering inputs work naturally

---

## Project Structure

```
F1_Pixel_Cup/
├── index.html        # Landing page (no 3D; loads fast)
├── landing.css/.js   # Landing page layout and sections
├── play.html         # The game, full window
├── play.css          # Game page layout
├── screens.js        # Game screens: pit lane, results, podium, career, settings, timing tower
├── site.css          # Shared Broadcast look
├── game.js           # Racing, AI, items, audio, camera and the canvas HUD
├── game-data.js      # Teams, drivers, difficulties, circuits, cups, power-ups
├── career.js         # Career points, rating, best laps and the saved profile
├── grid.js           # Starting grids and qualifying rules
├── powerups.js       # Power-up odds, limits and track-following shots
├── item-icons.js     # Power-up icons, shared by the HUD and the site
├── trackmap.js       # Circuit outline -> SVG map
├── device.js         # Touch-only detection
├── tracks-data.js    # Real circuit outlines, generated by tools/tracks
├── render3d-boot.js  # Starts the 3D renderer, or reports that it can't
├── render3d.js, r3d/ # Three.js renderer (r3d/powerups.js draws the items)
├── assets/           # f1_car.glb, items/ (power-up models), textures/, shots/ (captured from the game)
├── vendor/three/     # Three.js, vendored
├── tests/            # Unit tests (npm test)
└── tools/            # blender/, tracks/, capture-shots.js, checks/
```

---

## Controls

| Action | Key |
|--------|-----|
| Throttle | `W` / `↑` |
| Brake / Reverse | `S` / `↓` |
| Steer | `A` `D` / `←` `→` |
| Drift Boost | Hold `Shift` in corners |
| Use Power-Up | `Space` |
| Pause | `Esc` or `P` |
| Back to the pit lane | `Esc` on the results or podium screen |
| Quit mid-race | `Q` while paused (nothing is recorded; once you've taken the chequered flag, Q keeps your result, and on a cup's last race the cup too) |
| Pick a driver | `←` `→` or click a tile in the pit lane |
| Start the cup | `Enter` or Start cup |
| Sound / Full Screen | Settings in the pit lane |

---

## Deployment

This is a static site — no build step required.

**Live:** https://f1-pixel-cup.vercel.app (game at `/play.html`). The Vercel project is
connected to this GitHub repo, so every push to `main` deploys to production
automatically; pushes to other branches get preview URLs. `.vercelignore` keeps
docs, tests, tools and local env files out of the upload.

### Local

It must be served over HTTP (the 3D renderer is an ES module and loads a model),
so opening `play.html` straight from disk will fall back to the 2D renderer.

```bash
npx serve .
# or
python3 -m http.server 8080
```

Open `http://localhost:8080` for the landing page, or `http://localhost:8080/play.html` to go straight to the game.

### GitHub Pages

1. Push to GitHub.
2. Go to **Settings → Pages**.
3. Set source to **Deploy from branch → main → / (root)**.
4. Live at `https://<username>.github.io/<repo-name>/`.

### Netlify / Vercel / Cloudflare Pages

Drag-and-drop the folder or connect the repo. No build command — publish directory is `/` (root).

---

## 2025 Driver Roster

| # | Driver | Team |
|---|--------|------|
| 1 | Max Verstappen | Red Bull RB21 |
| 4 | Lando Norris | McLaren MCL39 |
| 5 | Gabriel Bortoleto | Kick Sauber C45 |
| 6 | Isack Hadjar | Racing Bulls VCARB 02 |
| 7 | Jack Doohan | Alpine A525 |
| 10 | Pierre Gasly | Alpine A525 |
| 12 | Kimi Antonelli | Mercedes W16 |
| 14 | Fernando Alonso | Aston Martin AMR25 |
| 16 | Charles Leclerc | Ferrari SF-25 |
| 18 | Lance Stroll | Aston Martin AMR25 |
| 22 | Yuki Tsunoda | Racing Bulls VCARB 02 |
| 23 | Alex Albon | Williams FW47 |
| 27 | Nico Hülkenberg | Kick Sauber C45 |
| 30 | Liam Lawson | Red Bull RB21 |
| 31 | Esteban Ocon | Haas VF-25 |
| 44 | Lewis Hamilton | Ferrari SF-25 |
| 55 | Carlos Sainz | Williams FW47 |
| 63 | George Russell | Mercedes W16 |
| 81 | Oscar Piastri | McLaren MCL39 |
| 87 | Oliver Bearman | Haas VF-25 |

---

## Checks

- `npm test` — unit tests (career scoring, power-up odds and shots, game data, track maps, touch detection).
- Browser checks in `tools/checks/` run through the Playwright MCP tool
  (`browser_run_code_unsafe` with the file) against a local server on port
  8765: `play-check.js`, `keys-check.js`, `landing-check.js`, `career-check.js`, `race-sim.js`,
  `powerups-check.js` (every item, in the real game), `grid-check.js` (grids, qualifying, the
  measured difficulty ladder), `race-clock-check.js` (fast-forward after
  the flag, real race times on the results) and `loading-check.js` (no stand-in car while the
  3D car loads; 2D only when 3D fails). Expected for each: every result true, errors [].
  Every check minimises the test tool's own blank tab so only the window under test shows.
- `tools/capture-shots.js` recaptures the landing page's images from the real
  game; resize them afterwards with
  `sips -Z 1920 -s formatOptions 78 assets/shots/hero.jpg` and
  `sips -Z 900 -s formatOptions 76 assets/shots/{circuit,team}-*.jpg` and
  `sips -Z 960 assets/shots/items/*.jpg`. Set `globalThis.CAPTURE_PARTS = ["items"]`
  first to retake only the power-up shots (posed in a paused race on a clear
  straight, with a hand-placed photo camera). Who drives in each shot is
  `SHOT_DRIVERS` in `game-data.js` -- Leclerc first, Hamilton second, then the
  rest of the grid -- and the site's alt text names them from the same data.

## Credits

- Circuit outlines: [bacinger/f1-circuits](https://github.com/bacinger/f1-circuits), MIT
- Ground textures: [Poly Haven](https://polyhaven.com), CC0 (see `assets/textures/CREDITS.md`)
- Three.js: MIT

## License

The code is released under the [MIT License](LICENSE). Third-party pieces keep their own licences: circuit outlines from bacinger/f1-circuits (MIT), textures from Poly Haven (CC0) and Three.js (MIT). Their notices are in [THIRD-PARTY-NOTICES](THIRD-PARTY-NOTICES).
