# Two-player split-screen: design

Date: 2026-10-01 · Stage N of `docs/superpowers/plans/2026-10-01-work-order.md` (roadmap stage 14) · built autonomously (no design review; the user's standing instruction).

## What the players get

A **Players** choice in the pit lane: **1 player** (always the default) or **2 players**, split screen. With two players:
- each player picks a driver (player 1 from the driver strip as now, player 2 from a picker that appears under it); the two must be different drivers;
- both race in the same 20-car field, against the 18 CPU drivers, in the same cup, with the same difficulty, grid mode and weather;
- the window is cut into two views, one per player, each with its own chase camera and its own complete HUD (lap, lap times, position, intervals, speed, power-up, mini map, start lights, the chequered flag);
- each player drives with their own keys or their own gamepad;
- results, cup points, careers, qualifying and the replay all count both players.

The choice is never remembered: every visit starts at **1 player**, and nothing about single-player changes.

## Rules

- **Real players, real cars.** Both humans drive real racers in the race's physics, exactly as the single player does. No ghosting in the race: they collide with each other and with the field.
- **Off by default.** `1 player` on every load; the game behaves exactly as before until `2 players` is picked.
- **Responsive.** Both views together fill the window at any size, live as it resizes, with no black bars; each HUD stays fully on screen inside its own view at every size.
- **Honest copy.** The pit lane names the real keys and pads; nothing claims what the game does not do.
- **Performance.** Nothing new is created after `Render3D.prepare()`: the split renders the same scene with the same materials, so no shader compiles mid-race. Frame time is measured on all three tiers (see Performance).
- **No em dashes** in any text the players read.

## Controls

Two key sets on the keyboard, read by **physical key** (`event.code`, so they sit in the same place on AZERTY or QWERTZ), plus gamepads.

| | Player 1 | Player 2 |
|---|---|---|
| Throttle / brake, reverse | W / S | ↑ / ↓ |
| Steer | A / D | ← / → |
| Drift | Left Shift | Right Shift |
| Power-up (hold to trail oil) | Space | / (the key left of Right Shift) |
| Gamepad | the first pad connected | the second pad connected |

Shared: **P** or **Esc** pauses for both, **Q** quits from the pause, as now.

Why these: the single-player race uses the arrows *or* WASD, Shift, Space, P, Q, Esc and Enter. Split, WASD with Left Shift and Space is the left hand's natural cluster; the arrows with Right Shift and `/` are the right side's. Enter stays off both sets: on the results screen Enter means "next race", and a player still mashing a power-up key as the results appear must not skip them.

**Gamepads** (the Gamepad API, standard mapping): left stick or d-pad steers (the stick proportionally, past a 0.25 dead zone), right trigger or A is the throttle (the trigger proportionally), left trigger or B brakes and reverses, RB or LB drifts, X or Y fires the power-up (held, it trails oil), Start pauses. A pad and that player's keys work together (whichever asks for more). In single-player the first pad drives player 1 as well; it is the same code.

All of the mapping is pure (`twoplayer.js`, tested in Node): which key belongs to which player and action, the pad's reading, the dead zones, and the merging.

## Layout

`TwoPlayer.layout(width, height)` (pure, tested) cuts the window, in CSS pixels:
- **Stacked** (one view above the other) unless the window is more than **2.1 times as wide as it is tall**; then **side by side**.
- The two views are exactly the same size (whole pixels), and a **4 to 5 px divider** between them takes the leftover. The divider is painted (a dark band with a thin red rule, the game's red), so it reads as a split-screen frame, not a gap. The views and the divider tile the whole window: there is no other uncovered pixel.

Why stacked for ordinary windows: a chase camera needs width more than height. At 16:9 (the user's 1600x900 and every full-screen 16:9 or 16:10 display) stacked views are wide strips that keep the road, the corners and the cars beside you; side-by-side views would be 0.89:1 slots that lose the sides. Tall and portrait windows are also stacked: their halves come out near square or wider. Only on ultra-wide windows (21:9 and wider) do stacked strips get too thin (over 4.2:1), and side by side then gives each player a near 16:9 picture.

**Each view's HUD** uses the same rule as the single-player view (`fitViewToElement`): the logical view covers at least the 1024x576 area the HUD is designed for and grows in whichever direction the view is longer; panels anchored to the right or bottom stay on that view's real edge. `TwoPlayer.hudFit(w, h)` is that rule, pure and shared. At 1600x900 stacked, each view is 1600x448 CSS px, which is 2057x576 logical: the HUD is the same size as single-player at 1600x900 with the same height to work in, so nothing is crowded.

**Field of view.** Single-player keeps its rule (wider windows see more to the sides; taller ones open up vertically). In a split view the picture can be much wider than 16:9 (3.6:1 stacked at 16:9), so `TwoPlayer.viewFov(fov, aspect)` caps the horizontal view at what a 2.4:1 picture would show at that vertical angle, and narrows the vertical angle to fit. The strip then shows a natural, undistorted road rather than a fisheye. Below 16:9 it opens up exactly as single-player does.

## Rendering (`render3d.js`, `r3d/postfx.js`, `r3d/rain.js`)

One WebGL renderer, one scene, **two viewports with the scissor test**. The game calls `Render3D.setViewports(rects)` with the layout (or `null` for one view) and then `Render3D.render(frame)` once per view with `frame.viewIndex`.

Per frame, done once (on view 0): the cars posed, the power-ups, the particles, the item boxes' animation, the landmarks' animation, the trackside life (marshals, helicopter, fireworks, starter), the weather state, the graphics tier's frame sampling. Per view: the viewport and scissor, the camera (its own speed-dependent field of view, rumble, tunnel exposure adaptation and finish shot), the item boxes' "?" turned to that camera, the rain streaks round that camera, the sun and its shadow following that view's car, the sky following that camera, and the post-processing.

**Post-processing per view.** The effects composer is sized to one view (the views are equal), and runs once per view: the frame is copied from that view's rectangle, and the last pass draws back into it. The grade, vignette, speed blur, rain on the lens and sun flare are each centred on their own view. The bursts (gold for Overtake Mode, red when hit, the DRS surge) belong to the player whose view it is: player 2 being hit pulses only player 2's view. Low draws the scene straight into each viewport.

**Prepare.** Nothing new is drawn: no new materials, meshes or shaders. `setViewports` is called before the circuit is prepared, so the composer's buffers are sized for the split before the first frame.

## The game (`game.js`)

**Racers.** Both humans are racers with `isPlayer: true` and a `playerSlot` (0 or 1). `state.playerIds` lists them in order; `state.playerId` stays player 1 (everything single-player reads it unchanged). Each player's controls come from their keys plus their pad, through `controlsFor(racer)`.

**Views.** Each view draws with its own camera rig and HUD state (camera heading and position, roll, the place-change flash, the final-lap call, screen shake). Player 1's live in the existing `state` fields; player 2's are swapped in while player 2's view is drawn, and back out after (the same save-and-restore the qualifying simulation already uses).

**CPU catch-up** (the easier difficulties' rubber band) measures each CPU car against the nearest human, so it keeps the racing close round both players.

**The flag.** The trackside show starts when the first human takes the chequered flag. The field is fast-forwarded only once **both** humans have finished; until then the race runs in real time, and the finished player's view shows their result and "2P still racing" (or 1P). The pause hint and Q (save the result and leave) count the race as done only once both have finished.

**Qualifying** (when the cup has it): both humans run their flying laps at the same time, from a rolling start side by side, as **ghosts to each other** (in qualifying the cars pass through one another, so neither can spoil the other's lap; the CPU laps are simulated alone, as now). Each player's lap ends on its own; the session ends when both are done. The classification has both times, and each player's qualifying result goes to their own career.

**Grid from the back:** both humans start at the back, side by side on the last row, the one higher in the cup standings ahead (player 1 ahead in the first race). `Grid.gridFromBack` takes the list of humans (pure, tested).

**Audio.** Each human car has its own engine voice (player 2's a touch higher, so the two can be told apart); tyre scrub plays when either slides; lap, item and hit sounds play for both. The venue sound (crowd, reverb, rain) follows whichever player is nearer each source, taking the louder.

## Results, cup points and careers

- **Cup points:** each human scores from their own finishing place, exactly as every other driver does, and both appear in the cup standings and on the podium.
- **Careers:** every driver already has their own career. Each human's race goes to their own driver's career (points, rating, best laps, qualifying), and each human's cup bonus to theirs. Each player has their own cup run id (`Career.startCupRun()` twice), because the cup bonus is recorded once per run id. Player 2 is recorded first, so player 1's driver stays the one the game returns to.
- **Results screen and tower:** both humans are highlighted, each with a small **1P** or **2P** tag in their own colour (1P sky blue, 2P pink). The timing tower always shows both humans, even outside the top ten. The career strip has one set of lines per player, each starting with the driver's surname.
- **Podium title:** names the result of each human, e.g. "Cup winner: Leclerc" or "Leclerc 3rd · Hamilton 6th".

## Replays after a two-player race

The recording keeps both humans: `header.players` lists their car ids, each car's entry says which player drove it, and **both players' keys** are recorded (player 2's in a second byte per sample), so the onboard input trace shows each player's own keys. The director, when there is no battle to show, alternates between the two humans. The replay itself is one full-screen broadcast picture, as in single-player.

## HUD per view

Each view has the full single-player HUD, plus a small **player tag** at the top centre (1P or 2P in the player's colour, with the driver's code). On the mini map, the other human shows in their own colour. The power-up hint names that player's key (and their pad's button when a pad is connected). The pause overlay covers the whole window once. The timing tower and the feed ticker are the race's own (one each, as now): the tower sits in the first view's top left, where it sits in single-player.

## Performance

The split draws the scene twice (two cameras, two shadow passes) at half the pixels each. The browser check measures the time per frame of `Render3D.render` for one view and for two, on each tier, and reports them. Low already drops every effect; the split adds no tier rule of its own unless the measurement shows one is needed.

## Tests and checks

- **Node (`tests/twoplayer.test.js`):** the layout (stacked and side-by-side thresholds, equal views, the tiling covers every pixel, whole pixels, tiny and huge windows); the HUD fit (covers the safe area, matches single-player's rule); the field of view (unchanged below 16:9, capped above, never larger than single-player's); the key sets (every key belongs to exactly one player and action, no overlap, nothing on Enter or P); the pad reading (dead zones, proportional stick and trigger, buttons); the merging; player 2's default driver.
- **Node (grid, replay):** two humans at the back in standings order; player 2's keys recorded and read back exactly; the director alternating between the humans.
- **Browser (`tools/checks/split-check.js`, in `run-all.js`):** off by default (one view, `1 player` pressed, no player 2 picker); both players drive independently (each key set and each pad moves only its own car); the HUDs are independent (each view's HUD shows its own player's numbers, and every HUD panel lies inside its own view and the window); the layout fills the window at several sizes, resized through CDP only; a two-player race finishes and its replay opens and plays; no errors. Proven to fail on `main`.
- **Screenshots:** 1600x900 and a tall window, judged and committed to `docs/review/2026-10-01/split-*.jpg`.
