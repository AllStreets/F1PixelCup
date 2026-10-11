# Team crests on the race suits

The user, with a podium screenshot of plain one-colour suits: "we should put the team logo ... in an attractive manner on the chest of all of the racers so that when they're on the podium we see their corresponding team on their race uniform."

The project's licence rule forbids official logos, sponsor marks, trademarks and brand emblems. So each team gets an **original crest**, designed for this game: the team's colours, a silhouette of its own, an abstract motif and the team's three-letter code in the game's typeface. No real mark is copied or evoked by shape: no horse, bull, star in a ring, wings, real lettering or real logo outlines. No sponsor names anywhere.

## The crests (`crests.js`, pure, UMD)

One record per team (all 10 of `game-data.js`): `shape` (the silhouette, unique per team), `code` (three letters), the colours (the team's own body and trim, with a dark or light ink), and a `motif`. Everything is geometry in a 100 by 100 box:

| Team | Silhouette | Motif |
|---|---|---|
| Red Bull Racing | hexagon | two wedges driving forward |
| Scuderia Ferrari | roundel | a four-point compass star |
| McLaren | diamond | a level bar with a notch |
| Mercedes | heater shield | an arrowhead |
| Aston Martin | octagon | a peak (one chevron) |
| Alpine | triangle | a snow cap |
| Williams | swallowtail pennant | two waves |
| Haas | bevelled square | a diagonal band |
| Racing Bulls | home plate | twin pillars |
| Sauber | stadium | two slashes |

- `Crests.for(team)` returns the record; `Crests.svg(team, size)` an SVG string (the site, the pit lane, the name plates); `Crests.draw(ctx, team, x, y, size)` paints the same paths on a 2D canvas (the suit's texture). Both come from one list of paths, so they cannot drift apart.
- `Crests.BANNED`: real sponsor and brand names no crest text may contain (tested).

## On the suit (`r3d/suit.js`, used by `r3d/driver.js`)

The body has no UVs (it is remeshed), and needs none: the suit's shader projects a per-driver decal sheet onto the torso from the body's **rest position** (the `position` attribute, before skinning), so the decals stay on the cloth in every pose. Front where the rest normal faces forward, back where it faces back, faded out toward the sides, torso only.

- **Front:** the crest large on the left chest (the heart side), the race number on the right chest, the team's short name across the chest under them, the driver's national flag small under the collar (from `country`, `r3d/flags.js`).
- **Back:** the team's name across the shoulders, the race number large under it, the crest small at the nape.
- **Suit detail**, so it stops reading as a plain bodysuit: a front zip with piping, a stitched yoke seam, quilted seam lines on the torso, arms and legs, ankle cuffs in the trim colour; with the collar, epaulettes, side panels, belt and limb stripes already painted by region.
- One sheet per figure (a canvas texture, front and back side by side): 2048 by 1024 on High, 1024 by 512 on Medium, 512 by 256 on Low. Drawn once when the figure is built; no per-frame cost. Freed with the figure.
- Both headwear modes, every pose, all 20 drivers.
- `looks()` reports `crest` (the team the sheet was drawn for) and `number`, for the checks.

## Elsewhere

The crest also shows on the podium's name plates and on the site's team cards (inline SVG).

## Checks

- **Node** (`tests/crests.test.js`): every team has a crest; silhouettes, motifs and codes all differ; colours are the team's; the SVG is well formed and holds the code; no crest text contains a banned name; the decal layout keeps every decal inside its panel, the crest on the left chest and the number on the right, clear of each other.
- **Browser** (`tools/checks/driver-check.js`): each figure wears its own team's crest and its own number; the sheet really has paint where the crest and number are (pixels read back); the suit's shader carries the sheet.
