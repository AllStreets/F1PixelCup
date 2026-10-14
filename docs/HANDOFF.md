# Handoff: picking up F1 Pixel Cup (written 2026-10-13)

For the next Claude Code session. Read this first, then `docs/AGENT-RULES.md`.

## Where things stand

- **Live:** https://f1-pixel-cup.vercel.app. Every push to `main` deploys to production on Vercel. Repo: github.com/AllStreets/F1PixelCup.
- **`main` is clean and pushed** at `d9e8d87` (plus this handoff). Nothing is in progress: no agent is running, no branch holds unmerged work, no worktree has uncommitted changes.
- **The work order is finished:** `docs/superpowers/plans/2026-10-01-work-order.md` has every box ticked, including everything the user added through 2026-10-12.
- **The only thing left on the roadmap is accounts and Supabase, and it is PARKED until the user says so.** Do not start it, plan it or provision anything for it unasked.
- **Tests:** `npm test` is 566 of 566. There are 30 browser checks (list in `tools/checks/run-all.js`).

## What the game is now

- **Racing:** 32 circuits (all 24 of 2025 in six calendar cups, plus the Legends and Golden Era historic cups), the 2025 Season, random and custom cups, single races. 20 drivers, 10 teams. One or two players (split screen; players are **P1** and **P2**, never 1P or 2P).
- **Feel:** steering matters (an unsteered car runs wide into the barrier and glances off with sparks); comebacks from last are possible on every difficulty; eight power-ups, each true to its Mario Kart counterpart; the Steward Penalty is the heaviest hit. Settings has "Spinning cars block the road", off by default.
- **Safety Car:** joins through service gates round every circuit where it reaches the leader soonest, catches up, leads, drives back to its garage. A yellow SAFETY CAR sign (`#FEDD00`) and its own warning sound.
- **Trackside:** Blender-built landmarks at all 32 circuits, yachts in the harbours, stands with 3D crowds (at most 14 stands' crowds in 3D at once on High, 8 on Medium), pit crews, marshals, a chequered-flag official who waves only on the last lap until the winner is home, a moon and stars at night races.
- **Las Vegas:** every major Strip resort placed from OpenStreetMap and pinned (`tools/vegas/strip-places.json`; a check fails if one moves), the ground between filled in, 30 stands, the Sphere showing NASA's Blue Marble Earth turning.
- **Race day:** TV-camera replays with sound (Director/Auto, Trackside, Onboard, Helicopter); a 3D podium in a real podium's order: step up, the winner's national anthem (13 anthems cover all 20 drivers, synthesized from public-domain scores), the trophy presentation (bronze, silver, gold, handed over by a presenter), champagne.
- **Drivers:** real faces, race suits with number, surname, code, national flag and the team's name in plain capitals on the chest.
- **Sound:** all procedural WebAudio: an engine that starts up, lives at full throttle and rings in tunnels; a crowd made of voices.
- **Graphics:** High by default, with a resolution cap per tier and dynamic resolution. F toggles the full screen.

## Decisions the user has made (do not reopen unasked)

- **No team logos, no crests, no sponsor marks, no brand emblems anywhere.** The user asked for real logos on 2026-10-12, was told non-commercial use is not a defence and the risk is a takedown, and chose "either real logos or none": so none. Team names appear as plain words only. A test holds the suit painter to words, numbers and flags.
- **Thailand's anthem is included at the user's decision** (its composer died in 1968; the notices say so).
- **Las Vegas leads the site's Trackside section**, not the page.
- **The trophy presentation shipped at about 21.7 s**, with painted-on formal wear and the presenter in the first seconds of the winner's lift. The user saw these flagged and said "I love it."
- **No em dashes or en dashes in anything a reader sees** (README, site, in-game text, review pages).
- **Showcase content:** Leclerc first, Hamilton second.

## Things only the user's ear can judge (still unconfirmed)

The user has not yet said how these sound; adjust on their word:
- the champagne pop and fizz (rebuilt 2026-10-12);
- the engine start-up at the start of qualifying and on the grid;
- the tunnel on the engine at Monaco (four constants at the top of the audio code in `game.js`: `TUNNEL_SEND`, `ENGINE_Q`, `TUNNEL_Q`, `TUNNEL_SWELL`);
- the Safety Car warning and the Steward Penalty whistle;
- the grandstand crowd's level in a race (raised from 0.07 to 0.11 as a guess).

Renders to listen to are in `docs/review/2026-10-10/`, `2026-10-11/` and `2026-10-12/` (`*.wav`).

## Known small things, not blocking

- Lap chimes and kerb thuds are not in replays.
- The SAFETY CAR sign, the two signal sounds and the flag official are covered in replays by Node tests only, and were not tested separately in two-player views.
- The Sphere's rotation was not tested in split screen or replays; one Earth map serves all three tiers.
- The Safety Car's first call shows it appearing under a carport beside the track; its catch-up pace is 1.5 times the field's top speed. The user was told and has not objected.
- Rookie is very easy after the balance pass (the simulated player wins every time); Pro comebacks reach the top 5 in 94% of simulated races. The user was told.
- Interlagos and Singapore keep their pit lanes across the road from the real side; Sepang's grandstand sits inside the loop; Watkins Glen's lake is brought close to the fence. All explained to the user.
- Three framing nits in README pictures (the presenter's head at an edge, cars cut by the bottom edge in two shots).

## How the work has been run (and how to run more)

- **The main session orchestrates; helper agents build.** Each stage gets its own git worktree beside the main checkout (`F1_Pixel_Cup-<letters>`) and its own branch and port. Agents push their branches only. The main session merges into `main`, re-runs the affected checks on `main`, pushes, and publishes review pages (the Artifact tool).
- **Rules every agent follows:** `docs/AGENT-RULES.md` (in the repo; `/private/tmp/claude-501/AGENT-RULES.md` is only a link to it).
- **The headless browser runner:** `~/.f1pixelcup/pw/run.js` (a copy is in `tools/agents/`). `node ~/.f1pixelcup/pw/run.js <port> checks name,name [--long]` or `... code script.js`. It allows two agent browsers at once across all agents and cuts a run off after 50 minutes (`RUN_MAX_MIN` to change). `CIRCUITS=id,id` limits `trackside-models` and `people` to some circuits; the full 32-circuit sweep takes about ten minutes on a quiet machine.
- **Main's own dev server:** `python3 tools/dev-server.py . 8770`, run from the main checkout (it may need restarting).
- **The headed Retina perf check:** `node tools/perf/check-headed.js 8770`. It opens a visible browser on the user's screen and needs a quiet machine; one result (`ratioClimbsBack`) fails under load and passes when quiet.
- **Never use the Playwright MCP window or the Blender MCP for this project's checks or builds:** the user watches that window; Blender runs headless (`/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -P <script>`).

### Things learnt the hard way

- **The user plays on this same Mac.** Seven agents' browsers at once made the game lag for them (load average about 250). Run at most two agents at a time, the nearest-to-done first. If the user says the game is laggy, check `uptime` and the agents' processes before blaming the game, and offer to pause.
- **Usage limits** (session and weekly) were hit repeatedly. Be economical: checks in small groups, no repeated full runs, short agent reports, the main session doing merges and small fixes itself. Resume stopped agents with SendMessage after a reset.
- **Checks that fail under machine load** (grid, motion, split, podium timing, perf) must be re-run alone before being called real. Checks must not depend on frame timing or on which circuit a cup starts with: name the circuit and step the game's own clock.
- **macOS empties `/private/tmp/claude-501`** of files untouched for a few days. Keep nothing lasting there.
- **Merges between long-lived branches** have conflicted mostly where two branches each added to the same spot (the renderer's build order, `r3d/landmarks.js`, the check files): keep both sides, then run the checks. The build order in `render3d.js` is: a venue's city (the Strip), the Safety Car's entrances, a venue's main stand, the track data's decor, landmarks, then the fill.
- **Design reviews:** the user wants a say on how things look (drivers, podium, trackside, buildings). Build on a branch, publish a review page with real screenshots and an honest "what I'd point out myself" list, and merge only on their yes. They often approve with "merge" and usually accept flagged fixes; do those fixes while they look.
- **After a major feature, update the site and the README too** (the user asked twice). `tests/readme.test.js` fails on any emoji, dash, 1P/2P, missing picture or count that differs from the data.

## Map of the code (what you'll touch most)

- **`game.js`:** physics on a fixed 60 Hz step, AI, laps, items, the HUD, audio, the pit lane and cup flow, the keys.
- **Pure modules,** UMD and tested in `tests/`: `weather.js`, `racecraft.js`, `pitlane.js`, `entrances.js`, `runoff.js`, `siting.js`, `venue.js`, `marshals.js`, `grid.js`, `powerups.js`, `choices.js`, `season.js`, `career.js`, `quality.js`, `twoplayer.js`, `replay.js`, `ceremony.js`, `engine-sound.js`, `suits.js`, `faces.js`.
- **`render3d.js`:** the three.js renderer: `prepare()` builds a circuit behind the loading panel (everything that draws must be in the scene then), `render()`, `inspect()` (what the checks read), the audits.
- **`r3d/`:** `car.js`, `driver.js`, `suit.js`, `podium.js`, `trophies.js`, `track.js`, `landmarks.js`, `models.js` (per-venue loading, compressed GLBs), `yachts.js`, `people.js`, `entrances.js`, `trackside.js`, `rain.js`, `postfx.js`, `tunnel-light.js`, `items.js`, `powerups.js`.
- **`screens.js`, `play.html`, `play.css`:** the pit lane, results, podium screen, settings, replay graphics.
- **`game-data.js`:** drivers (with `look` and `country`), teams, difficulties, circuits, cups, power-up copy (the site's cards read it).
- **Blender:** `tools/blender/build_*.py` (car, driver, people, landmarks, yachts), `tools/compress-models.mjs`.
- **Tracks:** `tools/tracks/build_tracks.py`, `fetch_osm.py` → `tracks-data.js`. Las Vegas: `tools/vegas/`. Anthems: `tools/anthems/`. The Sphere's Earth: `tools/sphere/fetch_earth.py`.
- **The site:** `index.html`, `landing.css`, `landing.js`, `drivers.html`, `teams.html`; pictures by `tools/capture-shots.js`.
- **Specs and plans:** `docs/superpowers/specs/`, `docs/superpowers/plans/`. Review images: `docs/review/<date>/`.
- **Licences:** `THIRD-PARTY-NOTICES` (F1DB, OpenStreetMap, Poly Haven, MakeHuman, NASA, the anthem sources, three.js, meshoptimizer, fonts).

## Housekeeping left as it is

- **14 sibling worktrees** (`F1_Pixel_Cup-B`, `-F`, `-H`, `-J`, `-K`, `-L`, `-M`, `-N`, `-P`, `-PF`, `-R`, `-S`, `-SC`, `-V`) and their branches are all fully merged into `main` and clean. They are kept so a stage's agent can be resumed with its context; they can be removed with `git worktree remove` if the user wants the disk space back. Ask first.
- Some old dev servers may still be listening (8770, 8772). They are idle and harmless; stop them if they are in the way.

## The next step

Wait for the user. If they ask what is next: the roadmap's last item is accounts and Supabase, parked until they say; otherwise it is whatever they ask for.
