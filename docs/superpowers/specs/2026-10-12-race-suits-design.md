# Race suits that read as race suits

The user, with a podium screenshot of plain one-colour suits, asked for the team's logo on the chest. Real logos are trademarks (the project's licence rule), and the user would rather have no logos than invented ones. So: **no logos, no crests, no team wordmark**. What the suits get instead is what makes a race suit read as one, and each driver's own marks.

## The marks (`suits.js`, pure, UMD)

`Suits.marks(driver)`: the race number, the three-letter code, the surname in capitals, the country. `Suits.LAYOUT`: where each sits on the torso, front and back, as boxes in metres on a panel 34 cm wide (as far as the marks may reach round the torso) and 48 cm tall from 0.96 m up (the belt to the collar):

- **Front:** the race number on the left chest (the heart side), the national flag small under the collar, the code on the belt.
- **Back:** the surname across the shoulders, the race number large under it.

`Suits.sheetUV(side, x, y)` is where a point of the torso lands on the decal sheet (front on its left half, back on its right); `Suits.sheetSize(tier)` the sheet per tier (2048 by 1024 High, 1024 by 512 Medium, 512 by 256 Low); `Suits.ink(hex)` the ink that reads better on a colour, white or near black, by contrast (at least 4.5 to 1 on every suit and trim colour, tested); `Suits.SEAMS` where the suit's seams run, which no mark's box touches. Surnames are upper-cased the same in every locale.

## On the suit (`r3d/suit.js`, used by `r3d/driver.js`)

The body has no UVs (it is remeshed) and needs none: the suit's shader projects the sheet onto the torso from the body's **rest position** (the `position` attribute, before skinning), so the marks stay on the cloth in every pose: front where the rest normal faces forward, back where it faces back, faded out toward the sides, torso only.

- One sheet per figure, a canvas drawn once when the figure is built (the game's typeface; the flag from `r3d/flags.js`), premultiplied so the glyphs' edges stay clean when filtered; no per-frame cost; freed with the figure. The numbers carry a keyline in the trim's colour where that stands apart from both ink and suit.
- The sheet is drawn once, so the typeface must be loaded first: `suitFonts()` resolves when it is, and the podium's `prepare()` and the studio wait for it before building figures. The podium uploads the sheets with its other textures behind the results screen (`suitSheetsUploadedAhead`), so the first frame does not stall.
- **Suit detail**, in the same shader: a front zip on a slightly darker placket, quilted seam lines every 5.5 cm across the torso, the arms and the legs, a seam down each side of the chest and back, a yoke seam across the chest and a higher one across the shoulder blades, ankle cuffs in the trim colour; with the collar, epaulettes, side panels, belt, limb stripes and glove cuffs already painted by region, and the boots.
- Only the body's suit and trim wear it (the collar band is its own mesh, in its own space).
- Both headwear modes, every pose, all 20 drivers, all three tiers.
- `looks()` reports `marks` (the number, code, surname and country the sheet was drawn with) and `sheet` (its size), for the checks.

## Checks

- **Node** (`tests/suits.test.js`): every driver's marks (number, code, surname, a flag the game can draw); the layout keeps every mark on its panel, between the belt and the collar's yoke except the code on the belt, none over another, the number on the left chest; the sheet's mapping and sizes; the ink reads on every team's suit colour.
- **Browser** (`tools/checks/driver-check.js`): each figure's sheet is drawn with its own driver's marks; the sheet really has paint where the number, flag, code and surname are and none between them (pixels read back); the body's suit and trim (the belt) carry the sheet and the collar does not; the typeface is loaded; smaller sheets on the lower tiers; and on the figure as drawn from behind, the number reads the right way round in the suit's ink with bare cloth beside it. `tools/checks/podium-check.js`: the sheets are uploaded before the ceremony's first frame.

## The team's name (user, 2026-10-12)

After seeing a preview, the user chose the team's short name in plain capitals across the chest, under the race number (`LAYOUT.front.team`), in the suit's own lettering and ink. The zip runs through it, which the user accepted. Front only: the back stays the surname over the number. It is words, never a logo or crest; `tests/suits.test.js` holds the painter to drawing words, numbers and flags only.
