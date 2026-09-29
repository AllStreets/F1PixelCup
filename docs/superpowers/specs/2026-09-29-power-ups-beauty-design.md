# Power-ups beauty pass — design

Date: 2026-09-29 · Stage C of `docs/superpowers/plans/2026-09-29-master-todo.md` · built autonomously (the user's standing instruction).

## Why

The user said the power-ups, and the **icons** above all, "still look AI". The site's cards and the promo shots also lean on Leclerc alone, and the promo should show the whole grid.

## 1. Icons: one broadcast glyph system

**Decision: hand-built SVG glyphs, not renders of the 3D models.** A render softens to mush at the HUD's 32 px and clashes with the flat HUD. A glyph system in the manner of F1's TV graphics (flat, bold, one accent colour) reads at 32 px, scales to the site's cards, and costs nothing to load.

The style guide, which every icon follows:

- **Canvas and tile.** The canvas is 64 × 64. The tile is a rounded square (radius 14) with a top-lit vertical gradient from `#1d212b` to `#0c0e13`. It has a 1 px inner hairline in white at 9% and a 4 px accent bar along the bottom inside edge, like a team-colour chip on the timing tower.
- **Glyph.** The glyph sits in the central 48 × 48 (8 px margins), on a 4 px grid with half-pixel steps where letterforms and curves need them. It is built from filled shapes with 2 px corner radii.
  - Colours are white `#f5f7fb` for the main form and the item's accent for the one detail that tells the story.
  - Outlines are used only for rings: the stopwatch, and the compound ring of the tyre mark.
  - No gradients, glows or drop shadows in the glyph. The light comes only from the tile.
  - Every icon carries `width="64" height="64"`, so a browser can draw it to a canvas.
  - *(Revised after the first sheet: the 40 × 40 area was too tight for the DRS plate and the safety car at 32 px.)*
- **Accents carry meaning:**

  | Item | Accent | Glyph |
  |---|---|---|
  | DRS | `#00d46a` DRS green | the letters **DRS** as block letterforms on a green plate: the real on-screen DRS mark |
  | Overtake Mode | `#ffd400` | a bold lightning bolt over three speed lines |
  | Oil Slick | `#9b7bff` | a white droplet over an iridescent puddle |
  | Debris | `#8a94a6` carbon | three angular carbon shards flying apart |
  | Undercut | `#e8002d` soft compound | F1 TV's own tyre mark (the compound's ring round an **S**) with a homing chevron. A side-view tyre read as a cog at 32 px. |
  | Steward Penalty | `#2f7bff` FIA blue | a stopwatch with a **+** badge |
  | Formation Lap | `#ff8a00` | three forward chevrons, the lead one white and the rest fading in the accent |
  | Safety Car | `#ffb000` amber | a GT car silhouette with the amber light bar on the roof |

- **Letterforms** (DRS, and the + badge) are drawn as paths, so they never depend on a font.
- **Checked** on a comparison sheet at 32, 48 and 96 px, before and after. It lives at `docs/superpowers/specs/assets/2026-09-29-icons-before-after.png`.

## 2. The 3D items: hand-modelled in Blender

These are built by `tools/blender/build_items.py` through the Blender MCP and exported as `assets/items/<name>.glb`.
- **Colours** are written as sRGB hex and stored linear, as glTF wants.
- **Only the box glass is double-sided**; closed meshes cull their back faces.
- **Budgets:** each item stays under 3k triangles, and the safety car (one on track at most) under 5k.
- **The items:**
  - **Item box:** a red glass cube with bevelled frame edges and one "?" in the middle. The game turns the "?" to face the camera while the glass spins round it. It keeps today's size (`ITEM_BOX_SIZE`) and its bob and spin.
  - **Oil pool:** an irregular, gently domed puddle about 29 × 24, 0.22 high, lifted 0.35 above the road (the height the old plane used), with no z-fighting. The game gives it a dark, matte surface with a thin-film sheen: a glossy coat read as grey water from the chase camera.
  - **Debris:** three carbon shards, with a carbon twill texture painted by the game, turning about their own middle. They spin with a wobble and are lifted clear of their own reach.
  - **Undercut:** a fresh soft, as a slick (F1 tyres have no tread), with a closed inner barrel. It stands on the road and rolls.
  - **Steward Penalty:** a blue puck with a white ring inlay. The game adds a spinning FIA-blue halo above it.
  - **Safety car:** a modern GT silhouette (long bonnet, fastback, arch bulges) in silver with a green stripe, a full-width tail light and two amber roof lamps that flash in turn. It is about 26.5 × 10.1.

`r3d/items.js` loads the GLBs in the background:
- **Until they arrive**, the game uses today's meshes, so nothing is ever missing.
- **Each model settles on its own:** one that fails leaves only that kind on its stand-in.
- **Before anything swaps**, render3d compiles the new shaders, so the swap never stalls a frame.
- **Replaced stand-ins are disposed**, and the shared model geometry survives a circuit change.
- Sizes and positions keep today's gameplay footprint.
- The quality bar still applies: nothing sits over the track, and every item box is over open road on every circuit (`Render3D.auditItemBoxes`).

## 3. Promo shots: the whole grid

`tools/capture-shots.js` recaptures `assets/shots/items/*.jpg` and `assets/shots/circuit-*.jpg`:

- **Items**, in the order the site shows them: Leclerc (Oil Slick), Hamilton (Debris), Norris (DRS), Verstappen (Undercut), Piastri (Overtake Mode), Russell (Steward Penalty), Alonso (Formation Lap), Albon (Safety Car).
- **Circuits**, in the order the site shows them: Monza with Leclerc, Spa with Hamilton, Silverstone with Norris, Suzuka with Tsunoda, Monaco with Verstappen, Singapore with Russell, Bahrain with Gasly, Interlagos with Hülkenberg.
- **The hero** is Leclerc at Spa.
- Items are posed on each circuit's straightest stretch, with a hand-placed photo camera on the item's side of the car (`Render3D.setPhotoCamera`, used only by the capture tool).
- Leclerc first and Hamilton second, and at least 6 teams in each set.
- **Who's in each shot** is data, not a guess. The driver of each shot lives in `SHOT_DRIVERS` in `game-data.js`, which the capture uses and the site uses for its alt text (for example "Norris's McLaren in Overtake Mode at Silverstone"). The check counts teams from that data and from the rendered alt text.

## Tests

- **Node** (`tests/item-icons.test.js`):
  - every power-up has an icon;
  - every icon is well-formed SVG on the 64 viewBox;
  - it contains no `<text>` (letters are paths);
  - its tile uses the shared gradient;
  - its accent is the one in the table.
- **Browser, `powerups-check.js`:**
  - once loaded, every item's 3D model is from its GLB;
  - it is visible and within its footprint;
  - `auditScenery` is 0 on every circuit.
- **Browser, `landing-check.js`:** the item and circuit shots come from at least 6 teams, and the site cards show the new icons.
- **Visual:** the HUD roulette and the site cards at desktop and phone widths.
