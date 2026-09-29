# Power-ups beauty pass — design

Date: 2026-09-29 · Stage C of `docs/superpowers/plans/2026-09-29-master-todo.md` · built autonomously (the user's standing instruction).

## Why

The user said the power-ups, and the **icons** above all, "still look AI". The site's cards and the promo shots also lean on Leclerc alone, and the promo should show the whole grid.

## 1. Icons: one broadcast glyph system

**Decision: hand-built SVG glyphs, not renders of the 3D models.** A render softens to mush at the HUD's 32 px and clashes with the flat HUD. A glyph system in the manner of F1's TV graphics (flat, bold, one accent colour) reads at 32 px, scales to the site's cards, and costs nothing to load.

The style guide, which every icon follows:

- **Canvas and tile.** The canvas is 64 × 64. The tile is a rounded square (radius 14) with a top-lit vertical gradient from `#1d212b` to `#0c0e13`. It has a 1 px inner hairline in white at 9% and a 4 px accent bar along the bottom inside edge, like a team-colour chip on the timing tower.
- **Glyph.** The glyph sits in the central 40 × 40 (12 px margins) on a 4 px grid. It's built from filled shapes with 2 px corner radii.
  - Colours are white `#f5f7fb` for the main form and the item's accent for the one detail that tells the story.
  - It has no outlines, except the stopwatch ring, which is a 4 px stroke.
  - No gradients, glows or drop shadows in the glyph. The light comes only from the tile.
- **Accents carry meaning:**

  | Item | Accent | Glyph |
  |---|---|---|
  | DRS | `#00d46a` DRS green | the letters **DRS** as block letterforms on a green plate: the real on-screen DRS mark |
  | Overtake Mode | `#ffd400` | a bold lightning bolt over three speed lines |
  | Oil Slick | `#9b7bff` | a white droplet over an iridescent puddle |
  | Debris | `#8a94a6` carbon | three angular carbon shards flying apart |
  | Undercut | `#e8002d` soft compound | a tyre in side view (tread, red soft band, rim) with a homing chevron |
  | Steward Penalty | `#2f7bff` FIA blue | a stopwatch with a **+** badge |
  | Formation Lap | `#ff8a00` | three forward chevrons, the lead one white and the rest fading in the accent |
  | Safety Car | `#ffb000` amber | a GT car silhouette with the amber light bar on the roof |

- **Letterforms** (DRS, and the + badge) are drawn as paths, so they never depend on a font.
- **Checked** on a comparison sheet at 32, 48 and 96 px, before and after. It lives at `docs/superpowers/specs/assets/2026-09-29-icons-before-after.png`.

## 2. The 3D items: hand-modelled in Blender

These are built by `tools/blender/build_items.py` through the Blender MCP and exported as `assets/items/<name>.glb`. Each is modelled with bevelled edges and real materials (baked ambient occlusion where it helps), and each stays under 3k triangles:

- **Item box.** A rounded translucent cube with bevelled frame edges and an inner "?" plate in the game's red. It keeps today's size (`ITEM_BOX_SIZE`) and its bob and spin.
- **Oil pool.** An irregular, flattened puddle mesh with a glossy dark material and thin-film tint. It sits flush with the road, with no z-fighting, lifted 0.02.
- **Debris.** Three carbon-fibre shards (a woven texture baked to the base colour) that tumble.
- **Undercut puck.** A small tyre: a torus with tread grooves and a red soft band.
- **Steward Penalty.** A blue puck with an FIA-style ring halo that spins above it.
- **Safety car.** A modern GT silhouette (long bonnet, fastback) in white and green with an amber light bar. It stays within today's footprint.

`r3d/powerups.js` loads these GLBs the way `r3d/car.js` loads the car. Until they arrive it uses today's meshes, so nothing is ever missing, and it keeps its pools. Sizes and positions keep today's gameplay footprint. The quality bar still applies: nothing sits over the track, and `auditScenery` stays at 0.

## 3. Promo shots: the whole grid

`tools/capture-shots.js` recaptures `assets/shots/items/*.jpg` and `assets/shots/circuit-*.jpg`:

- **Items**, in order: Leclerc (Oil Slick), Hamilton (DRS), Norris (Overtake Mode), Verstappen (Undercut), Piastri (Debris), Russell (Steward Penalty), Alonso (Formation Lap), Albon (Safety Car).
- **Circuits**: Monza with Leclerc, Monaco with Hamilton, Silverstone with Norris, Spa with Verstappen, Suzuka with Tsunoda, Singapore with Russell, Bahrain with Gasly, Interlagos with Hülkenberg.
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
