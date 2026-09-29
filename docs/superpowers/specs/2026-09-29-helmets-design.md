# Driver helmets — design

Date: 2026-09-29 · Stage D of `docs/superpowers/plans/2026-09-29-master-todo.md` · built autonomously (the user's standing instruction).

## Why

The user wants the driver helmets "more accurate and realistic". Today every helmet is one flat colour (`driver.color`, the team colour), so Leclerc's and Hamilton's look identical.

## Rules

- **Original art, inspired by each driver's signature 2025 palette.** Helmets change race to race, so we take the colours each driver is known for. We copy nothing: no logos, sponsor marks, numbers-as-branding or photos. Each design is built from simple shapes (bands, crown, flashes), the way a helmet painter blocks a design out.
- The data lives in `game-data.js` as `driver.helmet = { base, crown, stripe, visor, motif }`. The first three are hex colours; `visor` is a tint hex; `motif` is one of:

  | Motif | Shape |
  |---|---|
  | `band` | a wide band round the helmet at visor height, and a thin pinstripe above it |
  | `crown` | the top of the helmet in the crown colour, with a stripe where it meets the base |
  | `split` | front and back in two colours, split by a diagonal stripe |
  | `flash` | a swept flash along each side, from the visor back to the neck |
  | `tricolore` | three bands across the top: crown, base, stripe |

## The sheet (2025)

| Driver | Base | Crown | Stripe | Motif |
|---|---|---|---|---|
| Verstappen | `#0f1a3c` navy | `#ff6a13` orange | `#e10600` red | `flash` |
| Lawson | `#111111` black | `#ffffff` white | `#1e41b2` blue | `crown` |
| Leclerc | `#ffffff` white | `#d40000` red | `#0b1e4d` navy | `band` |
| Hamilton | `#ffd400` yellow | `#d40000` red | `#111111` black | `crown` |
| Norris | `#e4ff1a` neon yellow | `#1c1c1c` black | `#00a3e0` blue | `flash` |
| Piastri | `#0b1e4d` navy | `#ff8000` papaya | `#ffffff` white | `band` |
| Russell | `#111111` black | `#ffffff` white | `#00c5b5` teal | `split` |
| Antonelli | `#ffffff` white | `#009246` green | `#ce2b37` red | `tricolore` |
| Alonso | `#1a3a8f` blue | `#ffd100` yellow | `#d40000` red | `flash` |
| Stroll | `#ffffff` white | `#111111` black | `#d40000` red | `crown` |
| Gasly | `#ffffff` white | `#0f2a6b` navy | `#3fa9f5` light blue | `split` |
| Doohan | `#0a3d91` blue | `#ffd100` yellow | `#ffffff` white | `band` |
| Albon | `#1d4ed8` blue | `#ffffff` white | `#e10600` red | `crown` |
| Sainz | `#d40000` red | `#ffd100` yellow | `#0b1e4d` navy | `flash` |
| Bearman | `#111111` black | `#ffd400` yellow | `#ffffff` white | `band` |
| Ocon | `#0f2a6b` navy | `#ffffff` white | `#e10600` red | `tricolore` |
| Tsunoda | `#111111` black | `#ffffff` white | `#e10600` red | `split` |
| Hadjar | `#ffffff` white | `#1d4ed8` blue | `#e10600` red | `band` |
| Hülkenberg | `#ffffff` white | `#111111` black | `#ffcc00` yellow | `flash` |
| Bortoleto | `#009c3b` green | `#ffdf00` yellow | `#002776` blue | `crown` |

Every visor is dark smoked (`#10141c`), except Norris (`#1b3a5c`, blue mirror) and Hamilton (`#3a2a0a`, gold mirror).

## The model

`tools/blender/build_f1_car.py` gets a proper helmet in place of today's plain sphere:
- **The shell** is a slightly long egg with a flatter chin and a skirt at the neck, with equirectangular UVs (`calc_uvs`). The seam sits at the back, under the spoiler.
- **The visor** is painted onto the shell: a slot across the front at eye level, in the driver's visor tint, with a dark seal and a highlight. The old separate visor mesh sat mostly inside the shell and showed as a small black wedge. Painted, it follows the shell exactly and cuts through the design as a real visor does.
- **The rear spoiler** is the small wing on top at the back of modern F1 helmets, in the crown colour.

The material is `helmet`, for the shell and spoiler. The spoiler's UVs point at the crown row, so it wears the crown colour. The `visor` material is gone.

## Painting

`r3d/car.js` paints a 256 × 128 canvas per driver:
- x is the angle round the head, with the front at u = 0.5;
- y is the height, with the crown at the top.

The canvas is used as the helmet material's `map` (`flipY` off, to match the UVs), with a glossy finish, cached per driver. The checks read colours back at fixed points, which every motif keeps:
- the crown at (64, 6);
- the base at (64, 100);
- the visor at (128, 57).

The 2D fallback car (`game.js`) draws the helmet from the same data: the base with a crown cap and a stripe.

## Tests

- **Node** (`tests/game-data.test.js`): all 20 drivers have a helmet with valid hex colours and a known motif, and no two drivers share the same base, crown, stripe and motif.
- **Browser** (`tools/checks/helmet-check.js`):
  - every driver's car helmet material has a map, one texture per driver;
  - the colour sampled at the crown and at the base matches the data;
  - Leclerc's and Hamilton's helmets differ.
- **Screenshots:** close-ups of Leclerc, Hamilton, Verstappen, Norris and Alonso in the showroom.

The close-ups of Leclerc, Hamilton, Verstappen, Norris, Alonso and Russell are in `docs/superpowers/specs/assets/2026-09-29-helmets.png`.
