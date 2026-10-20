# Power-ups overhaul — design

Date: 2026-09-28 · Status: approved in brainstorming, awaiting spec review

## Purpose

F1 Pixel Cup is a cross between Mario Kart and a traditional F1 game. Today several power-ups do not do what their descriptions say (hazards are invisible in 3D, shots fly through walls, "untouchable" is not, "shrink" does not show, Graining does nothing to AI, item boxes never deplete). This project replaces the roster with eight items that each map an F1 idea onto a Mario Kart counterpart, makes every one of them work exactly as described, shows every one in 3D, randomises them the way Mario Kart 8 Deluxe does, and adds a site section that explains them from the same data the game runs.

It comes before the cinematic post-processing project because post-processing's "hybrid" look (Broadcast base, Arcade punch bursts on real events) is driven by events this project emits.

## Quality bar (binding)

- Every item does in the game exactly what its card, HUD and feed say. No copy describes behaviour that does not exist.
- Shots, hazards and the safety car live on the road: never through barriers, never between bridge levels, never over scenery. `Render3D.auditScenery` stays at 0 hits on every circuit.
- The game view keeps filling any window size (no forced viewports in checks).

## Roster

| id | Name | Mario Kart counterpart | Behaviour |
|---|---|---|---|
| `drs` | DRS | Mushroom | Boost ×1.22 target speed for 2.0 s; 3.0 s if fired on a straight (track curvature at the car below the straight threshold, see Rules). The car's `drs_flap` opens 12° while active. |
| `overtakeMode` | Overtake Mode | Star | 5.0 s: target speed ×1.10, **protected** (cannot be spun by shots, oil or contact), any car it touches spins 0.7 s. Gold glow and gold light trail. |
| `undercut` | Undercut | Red shell | Track-following shot at 1.35× the firer's max speed, homing on the car directly ahead at fire time. Spins the target 0.85 s. If the target finishes or is more than a quarter lap ahead, it continues as Debris. |
| `stewardPenalty` | Steward Penalty | Blue shell | Flies along the centreline at 1.6× max speed, one car-height above the field, touching no one until it reaches the leader, then drops: leader spins 1.6 s, any other car within one car width (lateral) and one car length (along track) of the leader spins 1.0 s. |
| `debris` | Debris | Green shell | Fired straight ahead at 1.2× max speed, bounces off road edges, lives 6.0 s, hits anyone including its owner after arming. Spins 0.85 s. |
| `oilSlick` | Oil Slick | Banana | Tap Space: dropped 18 units behind, lies 20 s, spins whoever drives through it 0.82 s. Hold Space: trailed 14 units behind the owner; blocks one incoming Undercut or Debris from behind (both destroyed); dropped on release. |
| `safetyCar` | Safety Car | Lightning | A safety car mesh enters the track just ahead of the leader and drives the racing line for 5.0 s. Every rival's target speed is capped at 55% of its max and a rival cannot pass the car ahead of it (it holds station one car length behind). The user of the item is not capped. Then the car pulls off. |
| `formationLap` | Formation Lap | Bullet Bill | 4.0 s autopilot along the racing line at 1.42× max speed, protected like Overtake Mode, spins cars it touches. White-hot glow and speed wake. |

Removed: Graining, Engine Blast, DRS Sign, the old Overtake/Power Deploy ids, the `shrinkUntil`/`inkUntil` effects and the dead `blueShell`/`bobOmb` branches.

`POWER_UPS` in `game-data.js` holds, per item: `id`, `name`, `counterpart`, `effect` (one-sentence card copy), `controls` (key copy), in the order above.

## Randomisation

Weakest items are most common, strongest rarest. The column is chosen from the racer's **gap to the leader**, not their place (as in Mario Kart 8 Deluxe).

`gapFraction = (leaderProgress − racerProgress) / track.totalLength`, clamped to ≥ 0.

| Column | gapFraction |
|---|---|
| `lead` | racer is the leader |
| `front` | < 0.06 |
| `mid` | 0.06 – < 0.16 |
| `back` | 0.16 – < 0.30 |
| `tail` | ≥ 0.30 |

Odds (percent, each column sums to 100; item order is the "next item" order for blocked rolls):

| Item | lead | front | mid | back | tail |
|---|---|---|---|---|---|
| oilSlick | 55 | 35 | 20 | 10 | 5 |
| debris | 35 | 30 | 20 | 10 | 5 |
| drs | 10 | 15 | 20 | 20 | 20 |
| undercut | 0 | 20 | 25 | 15 | 10 |
| overtakeMode | 0 | 0 | 10 | 18 | 20 |
| stewardPenalty | 0 | 0 | 5 | 12 | 13 |
| formationLap | 0 | 0 | 0 | 10 | 18 |
| safetyCar | 0 | 0 | 0 | 5 | 9 |

With a typical 20-car spread (1/4/5/5/5 cars per column) the overall shares are oilSlick 18.5, drs 18.5, debris 16.5, undercut 16.5, overtakeMode 12, stewardPenalty 7.5, formationLap 7, safetyCar 3.5.

Limits (`LIMITS`):

- No `stewardPenalty`, `formationLap` or `safetyCar` before 15 s of race time.
- No `safetyCar` before 20 s of race time or within 30 s of the last deployment.
- At most one `stewardPenalty` in flight.
- A blocked roll moves to the next item in the table order within the same column that has non-zero odds and is not blocked, wrapping to the top; `oilSlick` is never blocked, so a roll always returns an item.

Player and AI use identical odds. The roll happens when the 1.1 s roulette ends, using the gap at that moment.

## Architecture

### `powerups.js` (new, classic script with `module.exports` guard, like `career.js`)

Pure rules, no DOM or rendering. Exposes `window.PowerUps` in the browser.

- `ODDS` — `{ lead:{…}, front:{…}, mid:{…}, back:{…}, tail:{…} }`, percent per item id.
- `LIMITS` — the numbers above.
- `ITEM_ORDER` — the roster order.
- `columnFor(gapFraction, isLeader)` → column id.
- `rollItem({ gapFraction, isLeader, raceTime, lastSafetyCarAt, stewardInFlight, rng })` → item id.
- `overallShares(spread)` → percent per item for a cars-per-column spread (used by tests and the site's rarity badges).
- `rarityFor(share)` → `"Common"` (≥ 15), `"Uncommon"` (≥ 10), `"Rare"` (≥ 5), `"Very rare"` (< 5).
- `wrapDelta(a, b, lapLength)` → signed shortest along-track distance from `b` to `a`.
- `advanceShot(shot, dt, route)` → mutates `{ type, d, lat, latVel, speed, targetId, ... }`; `route` provides `halfWidthAt(d)` and `length`.
- `shotHits(shot, racer, lapLength)` → boolean, using along-track gap < `CAR_LENGTH` and lateral gap < `CAR_WIDTH`.
- `isStraight(route, d)` → true when heading change over the next 120 units is below 0.12 rad.

### `game.js` (modified)

- Racers gain `lat` (signed offset from centreline, computed each frame from the existing surface lookup) alongside `trackDistance`.
- `useItem` rewritten for the eight items; shots and hazards are stored in track coordinates (`state.shots`, `state.hazards`, `state.safetyCar`).
- Effect timers: `boostUntil`, `drsUntil`, `protectedUntil`, `formationUntil`, `safetyCarUntil` (race-wide), `trailingOil` (per racer). `spinRacer` does nothing while `protectedUntil`/`formationUntil` is active. All added to `RACER_TIME_FIELDS` so pause freezes them.
- Item boxes gain `hiddenUntil`; only a racer touching a visible box triggers it; the box hides for 3.0 s.
- Space: keydown starts a hold; for `oilSlick`, a hold of ≥ 0.2 s trails it until release, a shorter tap drops it. Other items fire on keydown.
- AI item use is rule-based (no random per-frame firing): Undercut when a target is within 0.2 lap ahead; Oil Slick trailed when a car is within 60 units behind, dropped after 6 s trailing; DRS and Overtake Mode on a straight or when a car is within 40 units behind; Steward Penalty, Debris, Safety Car and Formation Lap on receipt after a 0.5–1.5 s reaction delay.
- Safety car: while active, rivals' target speed ×0.55 and a rival within one car length behind another car on the same lateral lane holds station instead of passing.
- Feed lines for the big moments ("Safety Car deployed", "Steward Penalty on LEC", "Undercut hit NOR").
- Events for later post-processing: `window.dispatchEvent(new CustomEvent("f1:fx", { detail: { type, racerId } }))` with `type` in `boostStart`, `boostEnd`, `overtakeMode`, `hitTaken`. Nothing consumes them in this project.
- Old canvas 2D drawing of items/hazards is updated to the new data so the fallback view stays consistent.

### `r3d/powerups.js` (new) and `render3d.js` (modified)

- Pooled meshes, built once: Undercut red puck + red trail; Steward Penalty blue puck with spinning ring flying one car-height up, blue flash on impact; Debris tumbling carbon shard with bounce sparks; Oil Slick glossy dark decal with iridescent sheen conforming to the road height (`course.heightAt(d)`) including bridge decks; trailed oil behind its owner; Overtake Mode gold glow + light trail; Formation Lap white-hot glow + wake; silver safety car mesh with animated amber light bar, placed from its `d`.
- Item boxes scale away with a burst when taken and grow back with a shimmer when `hiddenUntil` passes.
- `render()` receives `shots`, `hazards`, `safetyCar` and box state in the frame.
- Quality tiers: trails and sparks off on Low; every item mesh always visible.
- Minimap draws oil slicks and the safety car.

### Car model

`tools/blender/build_f1_car.py` exports the rear wing upper flap as a separate object named `drs_flap` (pivot at its leading edge); `assets/f1_car.glb` is re-exported. `r3d/car.js` finds `drs_flap` and rotates it 12° open while `drsUntil` is active, easing over 0.15 s. Car v2 keeps the name.

### `item-icons.js` (new)

One painted SVG icon per item (`ITEM_ICONS[id]` → SVG string). The site inlines the SVG; the HUD rasterises each once to an `Image` and draws it in the item slot. The HUD roulette cycles these icons; a trailed Oil Slick shows "TRAILING".

### Site: `#power-ups` section (`index.html`, `landing.js`, `landing.css`)

- New section after How to play, nav link "Power-ups"; the How to play power-ups note links to it; the old plain list is removed.
- Header "Power-ups: Mario Kart chaos, F1 rules" and the one-line odds explanation.
- Eight cards ordered common → rare: icon, in-game screenshot (`assets/shots/items/<id>.jpg`, captured by `tools/capture-shots.js` featuring Leclerc, and Hamilton in some), name · counterpart, `effect`, `controls`, rarity badge from `rarityFor(overallShares(...))`.
- "Who gets what" table rendered from `ODDS` with columns Leading → Back of the field and a note on gap-based columns and limits; on phone widths it becomes one list per item.
- Single column on phones, no horizontal scroll, Broadcast tokens.
- `index.html` loads `powerups.js` and `item-icons.js`.

## Testing

Node (`node --test "tests/*.test.js"`):

- `tests/powerups.odds.test.js`: each column sums to 100; 200,000 seeded rolls per column within ±1 point of `ODDS`; overall shares follow the rarity order; `columnFor` boundaries.
- `tests/powerups.limits.test.js`: time gates; Safety Car cooldown; one Steward Penalty in flight; blocked rolls go to the next allowed item and never return nothing.
- `tests/powerups.shots.test.js`: on a synthetic oval and the real Suzuka and Monaco routes from `tracks-data.js`, shots stay within `halfWidthAt(d)` for 20 s; Undercut reaches a target round a corner; Debris reflects at edges; Steward Penalty passes non-leaders and hits the leader; no hits between Suzuka's bridge levels; `wrapDelta` across the start/finish line.
- `tests/game-data.test.js` (extended): exactly the eight ids, each with name, counterpart, effect, controls; each has an icon in `ITEM_ICONS`; removed ids absent.

Browser (Playwright MCP, `viewport: null`, CDP window sizing):

- `tools/checks/powerups-check.js`: for each item, give it to Leclerc and use it; assert its 3D object appears on the road where applicable, the effect happens (speed change, spin, protection holds against a fired Undercut, safety car leads and caps rivals, DRS flap rotation), and it clears when due; a collected box hides and returns after 3 s; a 5-lap AI race runs with no page errors and every item used at least once; `auditScenery` = 0 on all 8 circuits.
- `tools/checks/landing-check.js` (extended): `#power-ups` renders 8 cards and the odds table at 1440×900 and at phone width with no horizontal scroll.

Done: all tests green, checks clean, item screenshots captured and used on the site, final whole-branch review, pushed to `main` (auto-deploys to f1-pixel-cup.vercel.app).

## Out of scope

Post-processing (consumes the `f1:fx` events later), car v2, rain affecting oil grip, split-screen.
