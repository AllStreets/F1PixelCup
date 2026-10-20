# Website overhaul — design

Date: 2026-09-27
Status: approved in conversation, awaiting written-spec review

## Context

F1 Pixel Cup is a static browser racing game (Three.js world, 2D canvas HUD,
no build step, deployed from GitHub). Today it is one long scrolling page
(`index.html`): a masthead, a pit-lane panel (driver grid, car card, stats,
cup and difficulty, cup schedule, Career panel, controls), and a race panel
where the game view sits beside hud pills, sound/fullscreen buttons and three
panels underneath it (power-up, championship standings, race feed). Races
jump into fullscreen; results and the podium are modal cards.

This is the website step of the roadmap. Career scoring is already built and
saved locally (`career.js`). Accounts, profile upload, leaderboards and a
"how scoring works" explainer are deliberately **not** part of this step:
the user wants everything Supabase-related done last.

## Decisions (from the user)

- **Shape:** a landing page that shows the game off, with a Play button that
  opens a full-window, game-first experience (option C).
- **Look:** "Broadcast" — like F1 TV graphics: dark, F1 red, bold italic
  condensed type, a timing-tower motif. The same style carries into the game
  menus.
- **Landing sections:** hero, Circuits, Your career, The grid, How to play.
  No leaderboard teaser and no scoring explainer (both come with Supabase).
- **Pit lane layout:** "Showroom" — the 3D car on its turntable fills the
  screen, with driver and stats on the left, cup and difficulty top right, a
  strip of all 20 drivers along the bottom, and a Start Cup button.
- **Phones and tablets:** the landing page works on phones; the game stays
  computer-only for now. It must also look right on desktop at any window
  size.
- **Architecture:** two pages (approach 1): `index.html` (landing) and
  `play.html` (game), sharing one stylesheet, no build step.

## Standing requirements

- Every page shows the full picture at any window size and resizes live; no
  letterboxing, black bars, cut-off HUD or sideways scrolling.
- Browser checks use the real window size (no forced viewports larger than
  the window).
- No change to race physics, AI, lap logic or career scoring rules.

## Pages

### `index.html` — landing page

Loads no Three.js and no 3D assets, so it is quick to open.

- **Top bar:** "F1 PIXEL CUP" wordmark; links Circuits · Your career · The
  grid · How to play (scrolling to sections); a red skewed **Play** button.
  Sticky while scrolling. Collapses to wordmark + Play on phones.
- **Hero:** full-width real game shot with a dark gradient, kicker
  "2025 SEASON · 8 REAL CIRCUITS", headline "LIGHTS OUT. YOUR RACE.", one line
  of copy, the Play button, and a small timing-tower accent. On phones the
  tower is hidden and the text sits over a shorter image.
- **Circuits:** eight cards, one per circuit, each with:
  - a track map drawn as SVG from the game's real circuit outline
    (`TRACK_SHAPES`), start/finish marked;
  - a game shot from that circuit;
  - name, country, real length (source data: Monza 5.793 km, Spa 7.004 km,
    Silverstone 5.891 km, Suzuka 5.807 km, Monaco 3.337 km, Marina Bay
    4.928 km, Bahrain 5.412 km, Interlagos 4.309 km) and "5 laps";
  - which cup it belongs to.
- **Your career:** reads the saved profile through `career.js`:
  tier and rating, career points, races, wins, podiums, cups won, and the
  best lap on each circuit. A player with no races sees a "Your career starts
  at 1200 · F4" state instead of zeros. A link "Open career" goes to
  `play.html#career`.
- **The grid:** ten team cards, each with a showroom shot of that team's car
  in its livery, the team name and car, and both drivers with numbers.
- **How to play:** controls (throttle, brake/reverse, steer, drift boost,
  power-up, pause), drift-boost explanation (smoke colour shows the charge),
  and the power-ups list.
- **Footer:** credits — circuit outlines (bacinger/f1-circuits, MIT),
  textures (Poly Haven, CC0), Three.js (MIT).

**Phones/tablets:** detected as a device whose primary pointer is coarse and
that has no hover (`(pointer: coarse) and (hover: none)`). There, Play opens a
short message: "Best played on a computer with a keyboard", with a small
"Play anyway" link. Visiting `play.html` directly on such a device shows the
same message over the pit lane, with the same link.

### `play.html` — the game

Every screen fills the window at any size. The 3D canvas and the 2D HUD
canvas behave exactly as today (they already fill their box and resize live).

- **Pit lane (Showroom):**
  - The 3D showroom car fills the window (the existing turntable), framed so
    the car sits in the right half.
  - Left column over a dark gradient: `#number · Team Car` kicker, driver
    name large in italic caps, stat bars (speed, handling, acceleration,
    traction), and a career chip (`F4 · 1230 · 176 PTS`) that opens the Career
    screen.
  - Top right: Cup choice (Trophy Cup / Constructor Cup) and Difficulty
    (Rookie / Pro / Legend) as pills; below them the chosen cup's four
    circuits in order.
  - Bottom: a strip of all 20 drivers as team-coloured tiles with numbers;
    the selected one outlined. Arrow keys / clicks change driver.
  - Bottom right: skewed red **Start cup** button (Enter also starts).
  - Top left: wordmark linking back to the landing page, plus Settings.
- **Race:** the existing canvas HUD (lap panel, mini map, position, interval,
  power-up, speed) unchanged. Added:
  - a **timing tower** on the left edge below the lap panel: live position,
    three-letter code and gap for the top of the field and the player,
    Broadcast-styled, as a DOM overlay;
  - a **race feed ticker**: the latest feed line appears briefly at the
    bottom centre above the power-up badge and fades out.
  The page's current championship, power-up and feed panels are removed
  (their information is in the HUD, the tower and the ticker).
- **Pause:** unchanged (drawn on the HUD canvas).
- **Results and podium:** full-window overlays in the Broadcast style
  (replacing the modal cards), with the career strip leading the results and
  the cup bonus on the podium. Buttons as today; Esc back to the pit lane.
- **Career screen:** opened from the pit-lane chip or `play.html#career`:
  - header with tier, rating and career points;
  - totals (races, wins, podiums, cups won / completed);
  - best lap on each circuit;
  - recent races: the newest 20 history entries (circuit, difficulty,
    position, points earned, rating change), newest first.
  Esc or Back returns to the pit lane.
- **Settings:** sound on/off and fullscreen on/off (the two existing toggles),
  as a small overlay.
- **Keys:** Esc keeps its current meaning on every screen (close overlay →
  pit lane; pause/resume in a race). Enter starts the cup from the pit lane.

## Architecture

Classic scripts and plain CSS, no build step, as today.

| File | Responsibility |
|---|---|
| `game-data.js` (new) | `TEAMS`, `DRIVERS`, `DIFFICULTIES`, circuit info (id, name, country, theme, colours, real length in metres, cup), `CUPS` definitions by circuit id. Moved out of `game.js` unchanged so both pages can use them. |
| `trackmap.js` (new) | Pure function: circuit points → SVG path data and start/finish marker, fitted to a box. Also exported for Node tests. |
| `career.js` | Unchanged. |
| `landing.js` (new) | Builds the Circuits, Your career and The grid sections from `game-data.js`, `trackmap.js`, `TRACK_SHAPES` and `Career.getProfile()`; phone detection and the Play message. |
| `screens.js` (new) | The game's DOM screens: pit lane, results, podium, career, settings, timing tower, feed ticker, phone message. Owns all DOM rendering currently in `game.js`. |
| `game.js` | Racing, AI, items, audio, camera and the canvas HUD. Calls `Screens.*` to show screens; exposes a small set of actions the screens call. |
| `site.css` (new) | Shared Broadcast tokens and components (colours, type, skewed buttons, pills, tower rows). |
| `landing.css`, `play.css` (new) | Page-specific layout. |
| `index.html` | Rewritten as the landing page. |
| `play.html` (new) | The game page. Loads `tracks-data.js`, `game-data.js`, `career.js`, `screens.js`, `game.js`, `render3d.js`. |
| `tools/capture-shots.js` (new) | Playwright script (run through the Playwright MCP tool) that drives the real game to capture `assets/shots/hero.jpg`, one shot per circuit and one showroom shot per team, with the HUD hidden. |
| `styles.css` | Deleted once both pages use the new stylesheets. |

### The game ↔ screens boundary

`screens.js` defines `window.Screens`; `game.js` defines `window.Game`. Each
calls only the other's public functions:

- `Game` actions used by screens: `selectDriver(index)`, `selectCup(index)`,
  `selectDifficulty(index)`, `startCup()`, `nextRace()`, `backToPitLane()`,
  `setSound(on)`, `toggleFullscreen()`, `getPitLaneState()`,
  `getRaceStandings()`.
- `Screens` functions used by the game: `showPitLane(state)`,
  `showRace()`, `showResults(summary)`, `showPodium(summary)`,
  `showCareer()`, `updateTower(standings)`, `pushFeed(message)`,
  `hideOverlays()`.

Data passed across is plain objects (no DOM nodes, no racer internals).
`screens.js` must not read `state` directly; `game.js` must not touch
screen DOM.

## Error handling

- **Storage unavailable / no profile:** landing shows the "starts here" state;
  Career screen shows zeros with the same note. `career.js` already never
  throws into callers.
- **No WebGL:** `play.html` falls back to the existing 2D renderer; the pit
  lane shows the driver and stats over the dark background without the 3D car.
- **Missing shot images:** cards fall back to a styled team-colour or circuit
  gradient; never a broken-image icon.
- **Phone detection wrong:** "Play anyway" always lets the player through.
- **Old links:** `index.html` is now the landing page; its Play button is the
  way into the game. No redirect is needed.

## Testing

- **Unit tests** (`npm test`): `trackmap.js` (path fits the box, start marker
  at the first point, aspect preserved), and the phone-detection helper.
- **Browser checks** at real window sizes (1440×900, 1000×700, 1900×760, and
  a narrow ~520px window), plus a phone-sized viewport for the landing page:
  - landing: every section present, no horizontal scroll, images and maps
    load, "Your career" reflects a seeded profile, Play goes to `play.html`;
  - play: canvases fill the window at every size and after resizing; pit lane
    controls change driver/cup/difficulty; Start cup races; results, podium,
    career and settings open and close with Esc; `play.html#career` opens the
    Career screen; timing tower and ticker update during a race;
  - no console errors on either page.
- **Regression:** the career browser checks (full cup, podium twice, quit
  mid-race) and the five-lap race simulation on all eight circuits pass
  unchanged.

## Out of scope

- Accounts, sign-in, profile upload, leaderboards, a scoring explainer
  (Supabase step, last).
- Touch controls / mobile gameplay.
- Changes to racing, AI, circuits, liveries or scoring rules.
