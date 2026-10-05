# Historic cups (Stage L2)

Work order item 4. Two 4-race cups of famous circuits no longer on the calendar, approved by the user on 2026-10-04: the **Legends Cup** and the **Golden Era Cup**. Built to the care standard of Stage L (`docs/superpowers/specs/2026-10-01-calendar-design.md`, section 5): real outline and length, the real pit lane from OpenStreetMap where it is mapped, corner boards where OpenStreetMap names the corners, each venue's own look, weather odds, marshals and the helicopter, careers, best laps and the podium as every cup has them.

## The cups

| Cup | Races |
|---|---|
| Legends Cup (`legendsCup`) | Hockenheimring, Nürburgring, Estoril, Kyalami |
| Golden Era Cup (`goldenEraCup`) | Sepang, Istanbul Park, Mugello, Watkins Glen |

## Which layout each is, named honestly

The outlines come from `tools/tracks/f1-circuits.geojson` (bacinger/f1-circuits, MIT), which holds each circuit as it is laid out now (or as last raced). That is not always the layout of the circuit's most famous era, so each card names the layout it is:

| Game id | Name in the game | The layout | Its Formula 1 years |
|---|---|---|---|
| `hockenheim` | Hockenheimring | The short Grand Prix circuit of 2002 on (4.574 km), not the old forest loop | 2002 to 2019 |
| `nurburgring` | Nürburgring GP-Strecke | The modern Grand Prix circuit of 1984 (5.148 km), not the Nordschleife | 1984 to 2020 |
| `estoril` | Autódromo do Estoril | The circuit as last raced in F1 (4.349 km, with the 1994 chicane) | 1984 to 1996 |
| `kyalami` | Kyalami | Today's circuit (4.529 km), rebuilt after F1 left; its 1990s F1 layout was close to it but not the same | (F1 1967 to 1993 on older layouts) |
| `sepang` | Sepang International Circuit | The F1 circuit (5.543 km) | 1999 to 2017 |
| `istanbul` | Istanbul Park | The F1 circuit (5.338 km), with its four-apex turn 8 | 2005 to 2011, 2020 to 2021 |
| `mugello` | Mugello | The circuit (5.245 km) | 2020 |
| `watkinsglen` | Watkins Glen | The long circuit with the Boot (5.430 km) | 1975 to 1980 |

Each circuit's `era` field carries the last column's wording, shown on the site's cards and in the pit lane's circuit line.

## In the game

- `CIRCUITS` lists the 24 calendar circuits first, then the eight historic ones, each with `historic: true` and its `era`. `CUP_DEFS` lists the six calendar cups, then the two historic cups (`historic: true`). The **season stays the 2025 calendar** (`SEASON.circuitIds` is the 24 calendar circuits only).
- The pit lane offers the two cups after the calendar cups, before the season.
- **Period looks, only where honest:** the ground, trees, hills, sky and grade of each place (the Eifel's forest, Estoril's pines above the Atlantic coast, the Highveld's dry grass at Kyalami, Sepang's palms and tropical rain, Istanbul's dry hills, Tuscany's cypresses at Mugello, the Finger Lakes' woods at Watkins Glen). The cars, the stands and the graphics stay the game's own: the cups race the 2025 grid on these circuits; they are not period recreations.
- **Weather odds** as the calendar's: Sepang the wettest of them (tropical afternoon storms), the Nürburgring next.
- **Landmarks:** each venue lists its hook for Stage J (`landmarks` in its venue settings), drawing nothing yet: Hockenheim's Motodrom stadium, the Nürburg castle, Estoril's coast, Kyalami's Highveld, Sepang's leaf-roof grandstand, Istanbul's tower grandstand, Mugello's Tuscan villa, Watkins Glen's Boot.

## Checks and tests

- Node: every circuit's data as the calendar's (outline, length within 8 %, pit lane, rain odds, colours), the two historic cups and their order, the season still the 24 calendar circuits, every historic circuit's `era` named, the real pit lanes and named corners where OpenStreetMap has them.
- Browser: `trackside-check` (pit lanes, `auditScenery` 0, boards, floodlights none), `race-sim` (all 20 finish on every circuit), `season-check` (nine choices in the pit lane, the season still 24 races), `landing-check` (the site's historic cups), `showroom-check` (nine cup choices still clear of the car).
- Screenshots of every historic circuit at 1600x900, looked at and improved: `docs/review/2026-10-04/circuit-<id>.jpg`; the site's card shots in `assets/shots/`.

## The site and the README

The circuits section gets a "Historic cups" part after the calendar: the two cups, each card naming its layout's era. The README's circuit table gets the eight with their eras.
