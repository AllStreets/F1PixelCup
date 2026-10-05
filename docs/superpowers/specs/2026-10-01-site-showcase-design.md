# The site shows race day: replays, the podium, two players (design)

Date: 2026-10-02 · branch `site-showcase` · built autonomously (no design review).

The user (2026-10-02): "after major updates like this, don't forget to also update the site, not just the game; the site is for advertising." Three features are live in the game and missing from the landing page (`index.html`): TV-camera replays (Stage M), the 3D podium ceremony (Stage K) and two-player split-screen (Stage N). The power-up pictures and the drivers' helmet portraits still show car v1.

## What the visitor gets

A new section, **Race day** (`#race-day`, linked from the top nav on all three pages), between the circuits and the careers. It has three feature blocks, each a gallery beside its copy (alternating sides on wide windows, stacked under 900 px): a large picture with a caption, and a strip of four thumbnails (buttons, `aria-pressed`) that pick which picture is large, the first being the one shown at load.

1. **TV-camera replays** (`#replays`). Pictures: trackside on Leclerc in the pack at Monaco (broadcast graphics: tower, lower third, REPLAY tag, controls), onboard Hamilton with the throttle and brake trace and steering bar, the helicopter, the director's cut. Points: four cameras (Director, Trackside, Onboard, Helicopter); the director follows the closest battle at the front; 0.25x to 4x, pause and seek; "Watch the replay" on the results screen; a replay is of the race just run (not saved).
2. **The podium** (`#podium`). Pictures: the champagne, arms up, the trophy, the orbit. Copy: the cup's real top three in their team suits, bareheaded with their own faces (the driver faces merged to main on 2026-10-04; the shots were retaken with them), arms up, P1 lifts the trophy, confetti, champagne (Medium and High graphics), the camera orbits.
3. **Two players** (`#two-player`). Pictures: the stacked split at Spa with both HUDs (P1 and P2 tags), the split at Monaco in the rain, side by side on a 1600x700 window, the pit lane with 2 players picked. A key map built from `TwoPlayer.KEYS` (P1 W A S D, Left Shift, Space; P2 the arrows, Right Shift, "/"), with a note that keys go by position (Z Q S D on AZERTY). Copy: same race and field, two careers credited, gamepads, the replay after (the director cuts between the two players when there is no battle; each trace shows that player's keys).

The 3D-only features are said to be so ("In the 3D view ...").

Leclerc first, Hamilton second in every showcase picture (`SHOT_DRIVERS.raceDay` in `game-data.js`, tested); the alt text names them from that data.

**How to play** gets a two-player block (the key map, shared pause) and a complete gamepad row. The hero gets three chips under the Play button: TV replays, 3D podium, Two players.

## Pictures

All taken from the real game by `tools/capture-shots.js`, parts `replay`, `podium`, `split` (and `items` and `helmets` retaken, since they still showed car v1). The HUD is shown where it is the point. The podium pictures keep the name plates (HTML placed under each driver) and hide the page's own title and button.

Web sizes per picture (`sips`, see the header of tools/capture-shots.js): 1600 px (quality 76), 800 px (74) and 400 px (72). The large picture's `srcset` offers 800 and 1600 (`sizes` the gallery's real slot), a thumbnail's 400 and 800. Every image has `width`, `height`, `loading="lazy"` and `decoding="async"`. A missing picture falls back to a styled panel (`guardImages`), and a thumbnail still shows its picture afterwards.

## Rules

- Copy claims only what the game does (checked against the specs and the code: `REPLAY_SPEEDS`, `REPLAY_CAMERAS`, the results button label, `TwoPlayer.KEYS`).
- No em dashes anywhere on the site (titles, text, alt, aria labels, titles). The tags are P1 and P2, never 1P or 2P.
- The circuits section is left alone (Stage L rewrites it for 24 circuits).
- Responsive: no side scroll and no overlap at 1600x900, 1000x700 and a 390x844 window (sized through CDP `Browser.setWindowBounds`, and checked to have reached that size); the top nav stays on one line from 870 px up.

## Checks

`tools/checks/landing-check.js`, new results, proven `false` on the page before this change: `raceDay`, `raceDayImages` (every picture loads, is lazy and async, its width and height match the file, and every offered file exists), `raceDayAlts`, `raceDayGallery` (a thumbnail swaps the picture, alt and caption, and only it is pressed), `replayCopyTrue`, `twoPlayerKeys`, `raceDayLayout1600/1000/390`, `navOneLine870/900/1000/1600/1900`, and `indexTextClean`, `driversTextClean`, `teamsTextClean`.

`tools/checks/podium-check.js` gains `plateNamesWhole` (an italic name is never clipped at its last letter); its existing `plates380x800` was failing on and off (on a narrow window the two plates beside each other were never pushed apart) and is fixed in `screens.js` `placePodium`.

## Plan

1. Landing check first; run it on the old page and see the new results fail.
2. Extend `capture-shots.js`; take the shots; look at every one and iterate.
3. `sips` the shots to web sizes into `assets/shots/race-day/`.
4. The section, the how-to-play block and the em dash fixes; landing check green.
5. Look at the page at the three sizes; `npm test`; the full headless run; a fresh reviewer; fix everything; commit and push `site-showcase`.
