# Driver helmets — design

Date: 2026-09-29 · Stage D of `docs/superpowers/plans/2026-09-29-master-todo.md` · built autonomously (the user's standing instruction).

## Why

The user wants the driver helmets "more accurate and realistic". Today every helmet is one flat colour (`driver.color`, the team colour), so Leclerc's and Hamilton's look identical.

## Rules

- **Original art, inspired by each driver's signature 2025 palette.** Helmets change race to race, so we take the colours each driver is known for. We copy nothing: no logos, sponsor marks, numbers-as-branding or photos. Each design is built from simple shapes (bands, crown, flashes), the way a helmet painter blocks a design out.
- The data lives in `game-data.js` as `driver.helmet = { base, crown, stripe, visor, motif }`. The first three are hex colours; `visor` is a tint hex; `motif` is one of:

  | Motif | Shape |
  |---|---|
  | `band` | a crown cap, then a wide band at visor height with a pinstripe above it and a thinner one below |
  | `crown` | a cap on top (about 40° down) in the crown colour, with a stripe where it meets the base; the base colour carries the rest of the helmet |
  | `split` | front and back in two colours, split by a diagonal stripe |
  | `flash` | a crown cap, then a swept flash along each side, from the visor back to the neck |
  | `tricolore` | three bands across the top: crown, base, stripe |

## The sheet (2025)

No two drivers are close in both base and crown colour: the RGB distances of the bases plus the crowns must exceed 120, so every pair can be told apart on track. This was revised after review, which had found Russell, Tsunoda and Lawson nearly alike. Hülkenberg, Hadjar, Piastri, Doohan, Ocon and Gasly changed to meet the rule.

| Driver | Base | Crown | Stripe | Motif |
|---|---|---|---|---|
| Verstappen | `#0f1a3c` | `#ff6a13` | `#e10600` | `flash` |
| Lawson | `#111111` | `#ffffff` | `#1e41b2` | `crown` |
| Leclerc | `#ffffff` | `#d40000` | `#0b1e4d` | `band` |
| Hamilton | `#ffd400` | `#d40000` | `#111111` | `crown` |
| Norris | `#e4ff1a` | `#1c1c1c` | `#00a3e0` | `flash` |
| Piastri | `#ff8000` | `#0b1e4d` | `#ffffff` | `band` |
| Russell | `#111111` | `#00c5b5` | `#ffffff` | `split` |
| Antonelli | `#ffffff` | `#009246` | `#ce2b37` | `tricolore` |
| Alonso | `#1a3a8f` | `#ffd100` | `#d40000` | `flash` |
| Stroll | `#ffffff` | `#111111` | `#d40000` | `crown` |
| Gasly | `#ffffff` | `#3fa9f5` | `#0f2a6b` | `split` |
| Doohan | `#ffd100` | `#0a3d91` | `#ffffff` | `band` |
| Albon | `#1d4ed8` | `#ffffff` | `#e10600` | `crown` |
| Sainz | `#d40000` | `#ffd100` | `#0b1e4d` | `flash` |
| Bearman | `#111111` | `#ffd400` | `#ffffff` | `band` |
| Ocon | `#e10600` | `#ffffff` | `#0f2a6b` | `tricolore` |
| Tsunoda | `#111111` | `#e10600` | `#ffffff` | `split` |
| Hadjar | `#5ab4ff` | `#ffffff` | `#0f2a6b` | `band` |
| Hülkenberg | `#ffffff` | `#ffcc00` | `#111111` | `flash` |
| Bortoleto | `#009c3b` | `#ffdf00` | `#002776` | `crown` |

Every visor is dark smoked (`#10141c`), except Norris (`#1b3a5c`, blue mirror) and Hamilton (`#3a2a0a`, gold mirror).

## The model

`tools/blender/build_f1_car.py` gets a proper helmet in place of today's plain sphere:
- **The shell** is a slightly long egg with a flatter chin and a skirt at the neck, with equirectangular UVs (`calc_uvs`). The seam sits at the back, under the spoiler.
- **The visor** is painted onto the shell: a slot across the front at eye level, in the driver's visor tint, with a dark seal and a highlight. The old separate visor mesh sat mostly inside the shell and showed as a small black wedge. Painted, it follows the shell exactly and cuts through the design as a real visor does.
- **The rear spoiler** is a lip moulded to the top back of the shell, in the crown colour. Its underside follows the shell, and it thickens toward the trailing edge. `tests/car-model.test.js` reads the GLB and fails if anything on the helmet stands more than its thickness off the shell.

The material is `helmet`, for the shell and spoiler. The spoiler's UVs point at the crown row, so it wears the crown colour. The `visor` material is gone.

## Painting

`r3d/car.js` paints a canvas per driver: a 256 × 128 plan, painted at 512 × 256 for crisp close-ups.
- x is the angle round the head, with the front at u = 0.5;
- y is the height, with the crown at the top.

The canvas is used as the helmet material's `map` (`flipY` off, to match the UVs), with a glossy finish, cached per driver. The checks read colours back at fixed points, which every motif keeps:
- the crown at (64, 6);
- the base at (64, 100);
- the visor at (128, 57);
- a point on each motif's stripe.

The 2D fallback car (`game.js`, `drawKartRear`) draws the helmet from the same data, over the rear wing: the base with a crown cap (a thin stripe doesn't read at that size).

## Tests

- **Node** (`tests/game-data.test.js`): all 20 drivers have a helmet with valid hex colours and a known motif, and no two drivers share the same base, crown, stripe and motif.
- **Browser** (`tools/checks/helmet-check.js`), with a stripe sample per motif and a fingerprint of the whole design:
  - every driver's car helmet material has a map, one texture per driver;
  - the colour sampled at the crown and at the base matches the data;
  - Leclerc's and Hamilton's helmets differ (every design does);
  - the car on track wears its driver's texture, read off its own material;
  - rendered pixels: from behind, the top of Hamilton's helmet is his crown colour; from the front, the visor is dark. An upside-down texture fails both;
  - the 2D fallback car shows the crown and base over its rear wing.
- **Screenshots:** close-ups of Leclerc, Hamilton, Verstappen, Norris and Alonso in the showroom.

The close-ups of Leclerc, Hamilton, Verstappen, Norris, Alonso and Russell are in `docs/superpowers/specs/assets/2026-09-29-helmets.png`.
