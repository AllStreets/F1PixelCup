# F1 Pixel Cup

A pixel-art F1 racing game built with vanilla HTML5 Canvas — no frameworks, no build step. Race as any of the 20 drivers from the **2025 F1 season** across 8 circuits in two four-race cups.

---

## Features

- **Full 2025 F1 roster** — all 20 drivers across 10 constructor teams (Red Bull, Ferrari, McLaren, Mercedes, Aston Martin, Alpine, Williams, Haas, Racing Bulls, Kick Sauber)
- **8 circuits** — Monza, Spa, Silverstone, Suzuka, Monaco, Singapore, Bahrain, Interlagos — each with its own layout: chicanes, esses, hairpins and switchbacks that turn *both* ways, generated from hand-placed control points and spline-smoothed so every corner stays drivable
- **Two cups** — Trophy Cup (Monza → Spa → Silverstone → Suzuka) and Constructor Cup (Monaco → Singapore → Bahrain → Interlagos)
- **F1 power-up system** — Overtake Button, Power Deploy, Safety Car, Graining, Undercut, Debris, Oil Slick, Engine Blast, Formation Lap, Steward Penalty, DRS Sign
- **F1-authentic scoring** — 25/18/15/12/10/8/6/4/2/1 points system
- **Pixel-art F1 cars** — team livery colours, front wing, rear wing, halo, helmet
- **Driver-locked constructor cars** — pick a driver, race their team car
- **Live championship standings** updated after each race
- **Podium ceremony** at cup end

## Heads-up display

Always on screen while racing:

- **POSITION** — your live place out of the field, flashing green or red when a place changes hands
- **LAP** — current lap of the total, with a lap-progress bar
- **INTERVAL** — gap in seconds to the car ahead and the car behind
- **SPEED** — km/h with a redline bar
- **Mini map** — rotated so *up is always the direction you are driving*, with a field-of-view wedge showing exactly the slice of track filling the main screen, every rival as a heading-aware blip, and the podium places ringed in gold

## Race feel

- **F1 start gantry** — five red lights come on one column at a time, then out. Lights out, go.
- **Drift smoke that tells you something** — the smoke off the rear tyres turns from white to blue to orange as the drift boost charges, so you can read the charge without looking away from the road
- **Boost flame, dirt off the kerbs, and impact shake** on contact and spins
- **Catch-up racing** — cars behind you run up to 10% quicker and cars ahead up to 10% slower, so the field stays in touch instead of stringing out over a lap

## Rendering

- Chase-cam pseudo-3D road, drawn through **one** perspective camera (`projectScene`) shared by the road, the cars, the scenery and the item boxes — so everything agrees on where the ground is
- Rear-view F1 car sprites that lean into the direction the car is pointing
- Parallax horizon that pans as you turn, and a horizon that banks into corners
- Cars on other parts of the circuit are culled, so nothing appears to float across the infield

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
├── index.html      # Shell, HUD panels, modals
├── styles.css      # Dark F1 theme (carbon/scarlet/gold)
└── game.js         # All game logic and rendering
    ├── TEAMS[]         10 constructor cars with stats
    ├── DRIVERS[]       20 F1 2025 drivers with stats
    ├── TRACKS[]        8 circuits (waypoints, decor, item boxes)
    ├── CUPS[]          Trophy Cup + Constructor Cup
    ├── Physics         updateRacer, alignRacerToSurface, barriers
    ├── AI              waypoint steering, traffic avoidance
    ├── Items           F1 power-up system
    ├── Camera          CAMERA, projectScene, updateCameraRig
    ├── Rendering       drawDriverView, drawDriverRoad, drawKartRear
    ├── HUD              drawDriverHud, drawMiniMap (heading-up radar)
    ├── Effects          particles, screen shake, start lights
    └── UI              renderGarage, standings, results, podium
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
| Full Screen | Button on UI |

---

## Deployment

This is a static site — no build step required.

### Local

```bash
npx serve .
# or
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

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

## License

MIT — do whatever you want with it.
