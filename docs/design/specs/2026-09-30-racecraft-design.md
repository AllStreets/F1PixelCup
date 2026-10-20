# Racecraft: CPU drivers that brake like drivers

Found in play (2026-09-29): the player takes pole almost every time on Pro. Measured at Silverstone, a human lap of about 32.0 s beat the CPU pole (32.3–32.6 s), and most of the grid was 2–3 s slower.

## Why

The CPU drivers braked hard to 62 % of top speed whenever the point they were aiming at swung past a fixed angle, whatever the corner really needed. But this game's cars turn hard: about 5 rad/s at top speed, a radius of about 46 units. So every corner on the calendar can be taken flat out in the dry. The CPUs threw away time a human doesn't, braking for corners that needed nothing.

## What changed

`racecraft.js` is pure, UMD, and tested in `tests/racecraft.test.js`:

- `curvatureFromHeadings`: how tight the road is along the lap. It is sampled every 8 units from the route's headings and averaged over ±3 samples (a car's line cuts a corner's sharpest point). Worked out once per circuit (`curvatureProfile` in `game.js`).
- `cornerSpeed(physics, k, { margin, grip })`: the fastest the car can take a curve of curvature k, from its own full-steer yaw. Wet, that yaw is capped by the grip (`weather.js`).
  - It is the curve's own limit, not the car's top speed: a straight has none. So a car on a pace edge (Legend's 1.05) is never braked by it for nothing.
- `mustBrake(speed, corners, decel)`: brake when some corner ahead can't be reached at its speed with the brakes the car has.

Each CPU driver looks ahead as far as it would take to stop, checks every corner there, and brakes only when it must. The difficulty's `cornerMargin` is how near the limit they dare go:

| Difficulty | `cornerMargin` |
|---|---|
| Rookie | 0.7 |
| Pro | 0.85 |
| Legend | 0.93 |

It replaces `brakeBias`. In the dry the limit rarely binds, so now the laps are decided by what should decide them: the cars, the line, mistakes and pace. In the wet the grip cap makes the corners bite, and the CPUs slow for them honestly.

## Measured (`tools/checks/grid-check.js`)

- **`poleBeatsACleanLap`**: on Pro the CPU pole is quicker than the player's own car driven clean (no mistakes, on the line) at Monza, Silverstone and Monaco. Pole takes a genuinely good lap.
- **`difficultyLadder`** still holds: Pro is 10–12 % quicker than Rookie on single laps and about 7 % in races; Legend is 5–7 % quicker than Pro on single laps and about 6 % in races.
