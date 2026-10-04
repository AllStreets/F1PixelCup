# The site shows race day: replays, the podium, two players (design)

Date: 2026-10-02 · branch `site-showcase` · built autonomously (no design review).

The user (2026-10-02): "after major updates like this, don't forget to also update the site, not just the game; the site is for advertising." Three features are live in the game and missing from the landing page (`index.html`): TV-camera replays (Stage M), the 3D podium ceremony (Stage K) and two-player split-screen (Stage N). The power-up pictures and the drivers' helmet portraits still show car v1.

## What the visitor gets

A new section, **Race day** (`#race-day`, linked from the top nav), between the circuits and the careers. It has three feature blocks, each a large real screenshot with copy beside it and a strip of smaller shots under it, alternating sides on wide windows and stacking on narrow ones:

1. **TV-camera replays** (`#replays`). Main shot: a trackside camera with the broadcast graphics (tower, lower third, REPLAY tag). Strip: the onboard camera with the throttle, brake and steering trace; the helicopter; the director on a battle. Points: four cameras (Director, Trackside, Onboard, Helicopter); the director follows the closest battle at the front; 0.25x to 4x, pause and seek anywhere; "Watch the replay" on the results screen. Honest limits: a replay is of the race just run (not saved).
2. **The podium** (`#podium`). Main shot: the champagne spray. Strip: arms up, the trophy, the orbit with the confetti. Copy: the cup's real top three in their team suits, bareheaded with their own faces (the driver faces merged to main on 2026-10-04; the shots were retaken with them), arms up, P1 lifts the trophy, champagne, confetti in the team colours, the camera orbits.
3. **Two players** (`#two-player`). Main shot: the stacked split at 1600x900 with both HUDs (P1 and P2 tags). Strip: side by side on an ultra-wide window; the pit lane's Players choice. A key map built from `TwoPlayer.KEYS` (the game's own data): P1 on W A S D, Left Shift, Space; P2 on the arrows, Right Shift, "/"; gamepads. Copy: same race, same field, each player's own career credited, the replay after.

Leclerc first, Hamilton second in every showcase shot (Leclerc on the top step, Hamilton second; P1 Leclerc, P2 Hamilton; the replay on Leclerc's car, the onboard on Hamilton's). The alt text names who is in the picture.

**How to play** gets a two-player block (the key map, shared Pause), and the single-player controls mention a gamepad (the first pad drives in single-player too).

The hero gets three links under its lead (Replays, Podium, Two players) pointing at the blocks.

## Pictures

All taken from the real game by `tools/capture-shots.js` with new parts `replay`, `podium`, `split` (and the old `items` and `helmets` retaken, since they still show car v1). The HUD is shown where it is the point: the replay's broadcast graphics and the split views' HUDs. The podium shots keep the 3D name plates and hide the page's own title and buttons.

Web sizes: main shots 1600 px wide plus an 800 px copy (`srcset`), strip shots 800 px, JPEG at about quality 80 via `sips`. Every image has `width`, `height`, `loading="lazy"` and `decoding="async"`. A missing shot falls back to a styled panel (the existing `guardImages`).

## Rules

- Copy claims only what the game does (checked against the specs and the code: `REPLAY_SPEEDS`, the results button label, `TwoPlayer.KEYS`).
- No em dashes anywhere on the site (the three pages' titles and text; the existing ones are removed too). The tags are P1 and P2, never 1P or 2P.
- The circuits section is left alone (Stage L rewrites it for 24 circuits).
- Responsive: no side scroll and no overlap at 1600x900, 1000x700 and a 390x844 window (sized through CDP `Browser.setWindowBounds`).

## Check (`tools/checks/landing-check.js`)

New results, all `true`, proven `false` on the page before this change:
- `raceDay`: the section, its nav link and the three blocks, each with a main shot and three strip shots;
- `raceDayImages`: every shot in the section loads (scrolled into view), is lazy, and has width and height;
- `raceDayAlts`: each block's main alt names Charles Leclerc, and Lewis Hamilton is in the section's alts;
- `replayCopyTrue`: the copy's speeds are the game's `REPLAY_SPEEDS` ends and its button name is the one `screens.js` draws;
- `twoPlayerKeys`: the key map and the how-to-play block show both players' keys as `TwoPlayer.KEYS` has them, with P1 and P2 labels;
- `noEmDashes`, `noOldTags`: no em dash and no 1P or 2P on the three pages;
- `raceDayStacks390`, `raceDaySideBySide1600`: the blocks stack on a phone-sized window and sit side by side on a wide one; `noSideScroll1600`, `noSideScroll390`.

## Plan

1. Landing check first; run it on the old page and see the new results fail.
2. Extend `capture-shots.js`; take the shots; look at every one and iterate.
3. `sips` the shots to web sizes into `assets/shots/race-day/`.
4. The section, the how-to-play block and the em dash fixes; landing check green.
5. Look at the page at the three sizes; `npm test`; the full headless run; a fresh reviewer; fix everything; commit and push `site-showcase`.
