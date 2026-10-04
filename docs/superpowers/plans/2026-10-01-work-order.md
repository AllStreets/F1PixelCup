# F1 Pixel Cup: the work order from 2026-10-01

This is the single ordered list of everything still to build. It folds in:
- the user's message of 2026-10-01;
- every unfinished stage of `docs/superpowers/plans/2026-09-29-master-todo.md` (Stages J to N);
- the standing rules in that file's "Working rules", which still apply.

Work it top to bottom and tick each item as it ships. Stop before Supabase.

## What changed on 2026-10-01 (the user's own words, summarised)

1. **Keep going.** Build out amazing trackside monuments, life, buildings, stands and people.
2. **All the 2025 races.** Build every 2025 circuit, as many 4-race cups, the same as or better than the existing eight, with high focus on accuracy and vividness.
3. **Historical tracks.** Add some amazing historical tracks too.
4. **More ways to choose races,** after everything else already planned: a random race choice and a choose-specific-races choice, both also as 4-race cups.
5. **Everything planned and committed, all the way through the two-player option.** The items still being debated stay out (see "Not in this order").
6. **A README like the Chicago one.** Rewrite it to the level of detail of `~/Downloads/Chicago_open_world/README.md`. It can be a half or a third of the length, with fewer pictures, but it needs images, so people see what the game is, and it must be fun. Compare it with popular, high-star game READMEs on GitHub and borrow what works: varied text styles, info blocks, our screenshots. **No em dashes** (the user hates them). Make it attractive.
7. **Design reviews: the user wants a say.** Show the user, and wait for a yes, before merging:
   - what the drivers look like;
   - what the podium ceremony looks like;
   - the trackside elements (monuments, buildings, stands, people).

   Everything else runs without check-ins.

## How design reviews work (the checkpoints)

At a checkpoint the work goes like this:
1. Build on the stage's branch.
2. Render the look: in-game screenshots at real window sizes, plus Blender renders for models.
3. Commit them under `docs/review/<date>/`.
4. Publish a private review page (the Artifact tool) with the images and a short list of the choices made, and send the user its link.
5. **Do not merge that stage's visual work until the user says yes.**

Keep working while waiting: carry on with the next non-visual item, or with the next part of the same stage on its branch. Fold the user's changes in, re-render, and ask again.

Checkpoints in this order are marked **[REVIEW]**.

## Not in this order (debated, not committed)

These were saved for after the batch and are still being debated:
- real elevation from terrain data (Eau Rouge and so on);
- an onboard cockpit camera;
- strategy (tyre compounds and wear, pit stops, a real safety car);
- photo mode.

Accounts and Supabase are last of all, and not part of this order.

---

## 0. Now: the driver figure, for the user's eyes **[REVIEW]**

- [ ] Show the user the driver renders already built in Stage I: `docs/review/2026-10-01/driver_*.png`, all five poses.
  - Those renders show the raw model: a red default suit and a plain white helmet.
  - In the game, the suit takes the team colours and the helmet takes the driver's painted design.
- [ ] Render the figure dressed for real before asking: Leclerc in Ferrari colours with his helmet, and Hamilton likewise, via a small three.js preview page or the podium prototype.
- [x] Driver v2 (branch `driver-v2`): the mannequin rebuilt as one smooth skinned body with a suit painted by region, gloved hands and real boots; `r3d/driver.js` dresses it per driver; studio at `tools/preview/driver.html`. Review page published 2026-10-01.
- [ ] **Faces (user, 2026-10-01):** "realistic faces that look at least slightly like the driver they are supposed to look like ... they will not be wearing helmets on the podium." A realistic head (CC0 MakeHuman base and morph targets, or sculpted to that standard), eyes, brows, hair and facial hair styles, and a `look` per driver in `game-data.js` (skin, hair, beard, eyes, face shape) so each of the 20 resembles the real driver, Leclerc and Hamilton best of all. No photos of the drivers in the game; public photos as reference only. `buildDriver(driver, team, { headwear: "none" | "helmet" })`; the podium is bareheaded. Branch `driver-faces`. Review with the driver figure.
- [ ] **Faces review notes (user, 2026-10-02):** slim the neck-to-torso junction (too wide, awkward); more specific features per driver from public photos (reference only), own brows, faces further apart; less plasticky skin; trim Hamilton's beard; braids that read as raised plaits, not flat black hair. Re-review before merge.
- [ ] Apply the user's notes to `tools/blender/build_driver.py`. For example: face or no face, helmet on or a team cap, proportions, suit detail, more sculpted limbs. Rebuild `assets/driver.glb` and keep the Node tests green.

## 1. Stage J: trackside monuments, buildings, stands and people (Blender) **[REVIEW]**

Scope grew on 2026-10-01: not only landmarks but buildings, stands and people.

- [ ] **Spec** `docs/superpowers/specs/<date>-trackside-blender-design.md`:
  - **Landmarks, hand built in Blender, one per venue where it has one:**
    - the Monaco casino and the Hôtel de Paris front;
    - Marina Bay Sands and the Singapore Flyer;
    - the Suzuka Ferris wheel;
    - the Monza old banking;
    - Spa's Raidillon pit buildings and the Eau Rouge grandstand;
    - Silverstone's Wing building;
    - the Bahrain Sakhir tower;
    - the Interlagos skyline.
    - Each is accurate in shape and proportion, from public photographs used as reference only. No logos and no trademarks.
  - **Grandstands as real 3D models:** roofs, rows of seats, stairs and supports. Each venue gets its stand type, from the open terraces at Spa to the covered stands at Silverstone.
  - **People:**
    - crowds that are 3D figures (instanced, low poly, from the driver rig's proportions) in the stands near the camera, with the painted crowd texture far away;
    - pit crews in team colours at their garages;
    - marshals (they exist already, as figures);
    - TV camera crews on platforms;
    - photographers at the corners.
  - **Life:** the crowd stands and waves as the player passes, and pit crews react when a car passes the garages.
- [ ] `tools/blender/build_landmarks.py` writes `assets/landmarks/*.glb`, and `tools/blender/build_people.py` writes the crowd, crew and photographer figures.
- [ ] `r3d/landmarks.js` loads the models in place of the procedural stand-ins, and `r3d/trackside.js` places the people.
- [ ] **[REVIEW] first look,** before building all of it: two landmarks (the Monaco casino and Marina Bay Sands), one grandstand and the crowd and crew figures, in game screenshots. Wait for the user's yes, then build the rest.
- [ ] **Checks:**
  - `auditScenery` is 0 on every circuit (nothing over the track);
  - every landmark loads;
  - the people stay off the road;
  - frame time holds on all three tiers (Low keeps the far crowd texture only).
- [x] First look approved (user, 2026-10-02): people are good, the Monaco casino loved. Additions: detailed realistic yachts in the water (Monaco harbour above all, every harbour venue), another really good building or two per venue, inspired by the user's Chicago open world buildings at ultra, with no lag on any tier.
- [ ] **[REVIEW] final look** across all eight circuits. A fresh reviewer, then fix every finding. Merge and push.

## 2. Stage K: the 3D podium ceremony **[REVIEW]**

The spec is written: `docs/superpowers/specs/2026-09-30-podium-design.md`. It uses the driver figure from item 0 and the people from Stage J.

- [x] Plan, then build `r3d/podium.js`:
  - the set: three steps, a backdrop with the game's own mark, banners in team colours;
  - the three real cup winners, dressed;
  - the timeline: stand, arms up, trophy, spray;
  - confetti and champagne spray;
  - an orbiting camera.
  - Hook it into `showPodium` (`game.js`) and the podium screen (`screens.js`), with name plates over the 3D scene. The 2D steps stay as the fallback.
- [x] `tools/checks/podium-check.js`, as the spec lists.
- [x] **[REVIEW]** the ceremony: screenshots at each beat, with Leclerc and Hamilton on the podium, and if possible a short screen recording. Approved by the user on 2026-10-02.
- [x] A fresh reviewer, then fix everything. Merge and push.

## 3. Stage L: the full 2025 calendar, as 4-race cups

All 24 circuits of 2025. The eight we have are Monza, Spa, Silverstone, Suzuka, Monaco, Singapore, Bahrain and Interlagos. Sixteen are new, and every one is already in `tools/tracks/f1-circuits.geojson`:
- Albert Park, Shanghai, Jeddah, Miami, Imola, Barcelona-Catalunya, Gilles-Villeneuve, Red Bull Ring;
- Hungaroring, Zandvoort, Baku, Circuit of the Americas, Hermanos Rodríguez, Las Vegas, Losail, Yas Marina.

- [x] **Spec:** the cups, the season mode and the care standard.
  - **Proposed cups, in 2025 calendar order:**

    | Cup | Races |
    |---|---|
    | 1 | Australia, China, Japan, Bahrain |
    | 2 | Saudi Arabia, Miami, Imola, Monaco |
    | 3 | Spain, Canada, Austria, Britain |
    | 4 | Belgium, Hungary, Netherlands, Italy |
    | 5 | Azerbaijan, Singapore, United States, Mexico |
    | 6 | Brazil, Las Vegas, Qatar, Abu Dhabi |

    Cup names are decided in the spec.
  - **Migration:** the two existing cups (Trophy Cup, Constructor Cup) become the calendar cups. Careers, best laps and history are keyed by circuit id, so they carry over. Any cup-index keys in saved data are migrated, with a test.
  - **The care standard,** for every circuit:
    - accurate outline, length and corner names;
    - the real pit lane and garages, from OpenStreetMap (ODbL);
    - signature corners named on boards;
    - its venue moments, seen and heard (a tunnel, bridges, a night race, harbours and skylines);
    - its own look: ground, run-off, trees or city, sky, grade and weather odds;
    - landmarks and stands from Stage J where it has them;
    - marshals and the helicopter.
- [x] **Batches of four (one cup each),** in calendar order. Each batch:
  1. `build_tracks.py` and `fetch_osm.py`, then regenerate `tracks-data.js`;
  2. venue data and landmarks;
  3. the checks: relaxation, bridge detection, no boxes on the grid, `auditScenery` at 0, and a headless race where all 20 finish;
  4. screenshots of every circuit, published on a review page for the user to see. They don't block the build: carry on, and fold in any notes.
- [x] **Season mode** (the original Stage L): all 24 in order, with drivers' and constructors' standings and progress saved and resumed. Per-driver careers are credited. Node tests for the standings maths; a browser check that a season runs, saves and resumes.
- [x] The site's circuits section and the README circuit table cover all 24. A fresh reviewer, then fix everything. Merge and push, per batch.

## 4. Stage L2: historical circuits

- [ ] **Spec, proposing two 4-race cups of famous circuits no longer on the calendar,** all in the geojson. The proposal is shown to the user; it is a content choice, so a short **[REVIEW]** of the list only.
  - A "Legends" cup: Hockenheimring, Nürburgring, Estoril, Kyalami.
  - A "Golden Era" cup: Sepang, Istanbul Park, Mugello, Watkins Glen.
  - Alternates: Indianapolis, Magny-Cours, Portimão, Paul Ricard, Buenos Aires, Jacarepaguá.
  - Each is the layout in the data, named honestly; the spec says which era's layout it is.
- [ ] Built to the same care standard as Stage L, with each venue's period look where it is honest to show it.

## 5. Stage P: choosing races

After everything else is planned, per the user's instruction.

- [ ] **Spec**, in the pit lane next to Cup:
  - **Cup:** the calendar and historical cups, as now.
  - **Random cup:** four circuits drawn at random from all of them (seeded and shown before the start, with a reroll).
  - **Custom cup:** the player picks any four circuits, in any order, from a map or a list with search.
  - **Single race:** one circuit, random or chosen.

  Grid, difficulty and weather apply to all of them, and careers and best laps count in all of them.
- [ ] Node tests for the draw (no repeats in a cup, seeded) and for the custom-cup validation. A browser check covers each mode end to end.
- [ ] A fresh reviewer, then fix everything. Merge and push.

## 6. Stage M: TV-camera replays

From the master to-do, unchanged.

- [x] Record the inputs and state on the fixed-step clock and play them back deterministically. Trackside, onboard and helicopter cameras, with broadcast graphics. A replay button on the results screen.
- [x] A Node test that a recording replays bit-identically; a browser check that the replay's positions match the race. Review, merge and push.

## 7. Stage N: two-player split-screen

Committed (user, 2026-10-01: "all the way through the two player option").

- [x] A pit-lane option, never the default: two players, separate key sets or gamepads, two views and independent HUDs, both within the responsive rules (no black bars, the HUD on screen at every size).
- [x] A browser check: both drive, the HUDs are independent, it is off by default, and there are no errors. Review, merge and push.

## 8. Stage R: the README

- [ ] Study `~/Downloads/Chicago_open_world/README.md` for its level of detail and structure:
  - a centred hero with badges;
  - a full-width hero shot with a caption;
  - "What this is";
  - a phase-by-phase story with images;
  - quickstart, controls, under the hood, data, roadmap.
- [ ] Study three to five popular game READMEs on GitHub with many stars (for example SuperTuxKart, Mindustry, Veloren, OpenTTD) for what makes them inviting:
  - screenshot galleries in tables;
  - a quick feature grid;
  - a controls table;
  - a short "how to play";
  - credits.
- [ ] Rewrite `README.md` at a half to a third of the Chicago length, built on our own screenshots:
  - a hero shot;
  - a gallery of circuits, cars, rain, the podium and the drivers;
  - a feature grid;
  - how the cups and race choices work;
  - controls;
  - the honest physics notes;
  - credits and licences (F1DB, OSM, Poly Haven, three.js).

  Vary the text styles (badges, tables, callouts, captions). **No em dashes anywhere.** Fun to read.
- [ ] Capture a fresh set of README screenshots from the real game at real window sizes (`tools/capture-shots.js` gets a README part), sized for GitHub. A fresh reviewer for tone, accuracy (no claim the game can't back) and dashes. Merge and push.

Stage R comes last because its screenshots should show the finished game. If a README pass is wanted sooner, a first version can follow Stage K, since the podium is the best image.

## 9. Stop before Supabase

Accounts, cloud saves and anything with keys wait for the user.

---

## Order and why

| # | Stage | Why here |
|---|---|---|
| 0 | Driver look **[REVIEW]** | The user asked to see the drivers. Everything later (podium, crowds, crews) reuses the figure. |
| 1 | J: monuments, stands, people **[REVIEW]** | Next per the user. It builds the people and the stand models that K and L reuse. |
| 2 | K: podium **[REVIEW]** | Needs the drivers (item 0) and benefits from J's people. |
| 3 | L: all 2025 circuits, season | The biggest block. It reuses J's landmark and stand pipeline for every new venue. |
| 4 | L2: historical circuits | The same pipeline, after the calendar. |
| 5 | P: random, custom, single race | Needs every circuit in place (the user: "after doing everything else already planned"). |
| 6 | M: TV replays | Independent; benefits from the finished venues. |
| 7 | N: two-player split-screen | Committed; last of the game features. |
| 8 | R: README | Shows the finished game. |
| 9 | Stop before Supabase | |

The standing rules still hold for every stage:
- a spec and a plan first;
- tests first, shown failing;
- a branch per stage;
- checks in the real game at real window sizes, never forcing a viewport;
- `auditScenery` at 0;
- a fresh reviewer, with every finding fixed;
- merge, then `git push origin main` (Vercel auto-deploys);
- never upload `.env*`.
