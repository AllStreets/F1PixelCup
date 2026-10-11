# Race suits that read as race suits

The user, with a podium screenshot of plain one-colour suits, asked for the team's logo on the chest. Real logos are trademarks (the project's licence rule), and the user would rather have no logos than invented ones. So: **no logos, no crests, no team wordmark**. What the suits get instead is what makes a race suit read as one, and each driver's own marks.

## The marks (`suits.js`, pure, UMD)

`Suits.marks(driver)`: the race number, the three-letter code, the surname in capitals, the country. `Suits.LAYOUT`: where each sits on the torso, front and back, as boxes in metres on a panel 48 cm square from 0.96 m up (the belt to the collar):

- **Front:** the race number on the left chest (the heart side), the national flag small under the collar, the code on the belt.
- **Back:** the surname across the shoulders, the race number large under it.

`Suits.sheetUV(side, x, y)` is where a point of the torso lands on the decal sheet (front on its left half, back on its right); `Suits.sheetSize(tier)` the sheet per tier (2048 by 1024 High, 1024 by 512 Medium, 512 by 256 Low); `Suits.ink(suitHex)` the ink that reads on a suit's colour (white on dark, near black on light).

## On the suit (`r3d/suit.js`, used by `r3d/driver.js`)

The body has no UVs (it is remeshed) and needs none: the suit's shader projects the sheet onto the torso from the body's **rest position** (the `position` attribute, before skinning), so the marks stay on the cloth in every pose: front where the rest normal faces forward, back where it faces back, faded out toward the sides, torso only.

- One sheet per figure, a canvas drawn once when the figure is built (the game's typeface; the flag from `r3d/flags.js`); no per-frame cost; freed with the figure.
- **Suit detail**, in the same shader: a front zip, quilted seam lines across the torso, down the arms and legs, a seam down each side of the chest, ankle cuffs in the trim colour; with the collar, epaulettes, side panels, belt, limb stripes and glove cuffs already painted by region, and the boots.
- Only the body's suit and trim wear it (the collar band is its own mesh, in its own space).
- Both headwear modes, every pose, all 20 drivers, all three tiers.
- `looks()` reports `marks` (the number, code, surname and country the sheet was drawn with) and `sheet` (its size), for the checks.

## Checks

- **Node** (`tests/suits.test.js`): every driver's marks (number, code, surname, a flag the game can draw); the layout keeps every mark on its panel, between the belt and the collar's yoke except the code on the belt, none over another, the number on the left chest; the sheet's mapping and sizes; the ink reads on every team's suit colour.
- **Browser** (`tools/checks/driver-check.js`): each figure's sheet is drawn with its own driver's marks; the sheet really has paint where the number, flag, code and surname are and none between them (pixels read back); the body's suit material carries the sheet and the collar's does not; smaller sheets on the lower tiers.
