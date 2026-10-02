# Driver faces: real heads for the podium

The user, after the driver v2 review: "Make sure there are realistic faces that look at least slightly like the driver they are supposed to look like ... they will not be wearing helmets on the podium."

So the figure gets a head. On the podium the drivers stand bareheaded and each one should be recognisable: Leclerc and Hamilton most of all (the showcase pair), and every one of the 20 drivers of 2025 at least slightly. Respectfully and accurately: a likeness, never a caricature.

## Where the head comes from

**The MakeHuman base mesh and its targets** (makehumancommunity/makehuman, `makehuman/data/3dobjs/base.obj` and `makehuman/data/targets/**`), pinned to commit `a8bc2d54ff0ac92e78ff71431b1023eda42bf482`. MakeHuman's assets (the base mesh, proxies, targets and modifiers) are released under **CC0 1.0** (the repository's `LICENSE.md` section C and `LICENSE.ASSETS.md`, and the header of every file used). MakeHuman's program code is AGPL; none of it is used, only the data files, read by our own parser.

- `tools/blender/makehuman/fetch.py` downloads exactly the files used, at that commit, and `extract.py` cuts out the head and neck and writes `tools/blender/makehuman/head.json`: the vertices, quads, UVs, the helper geometry for the eyes and lashes, and every shape key as sparse deltas. That file is committed (CC0, derived); the build reads it, so it never needs the network.
- The keys that move or scale the whole head are held still somewhere: the ethnic blend (which changes MakeHuman's figure's height by up to 8 cm) and the head's depth at the neck's foot, so a key never lifts the head out of the collar; the face's length at the chin, so a long face grows up, never down into the collar.
- No photo textures of real people anywhere. The skin, eyes, hair and beards are shaded procedurally.

## The head (`tools/blender/driver_head.py`, called by `build_driver.py` → `assets/driver.glb`)

- **Base shape:** MakeHuman's young adult male, a little more muscular than average (racing drivers are lean and have thick necks), the three ethnic blend targets at a third each, the eyes a little more open and the corners of the mouth a little up (MakeHuman's default reads tired and glum).
- **The head and neck** are cut from the base mesh above the shoulders: about 4,400 quads (8,800 triangles), MakeHuman's own topology. Scaled so the whole MakeHuman figure would stand 1.78 m, like ours.
- **The neck fits the collar:** the build measures the collar's real outline off the body (the top edge of its band) and fits the lower neck to it: every point further out than the collar is drawn in to it and down into the suit (further out, further down, so the surface never folds), and the neck's foot is eased out to meet the collar's edge, a gap of about 2 mm all round.
- **Skinned** to the same rig as the body: the head bone from 1.51 m up, blended into the chest bone down to the collar. The hair and beard ride the head bone rigidly, so the bend is all below them (the build checks it): the skin under them moves exactly as they do.
- No key moves the neck where it meets the collar (they fade out over the centimetre above): each key is fitted to the collar on its own, and several together could otherwise push the neck through it or open a gap.
- The morph targets carry positions only, not normals (normals for 79 targets would take the file past its 4 MB budget): a reshaped face is lit with the rest face's normals, which the shapes used here (sliders at most 0.7) keep close.
- **Shape keys** (glTF morph targets), each from MakeHuman targets. Bipolar ones are a pair (`_incr`, `_decr`), so a slider runs -1 to 1:
  - head: width, face length, depth, age, fat, the square, oval, round, triangular, inverted triangular, rectangular and diamond shapes;
  - jaw and chin: jaw width (chin bones), chin width, chin prominence, chin height, chin cleft;
  - cheeks: cheekbones, cheek volume;
  - nose: length, width, projection, hump, tip up/down, nostril flare, volume;
  - brow: forward, up/down, angle; forehead height and slope;
  - lips: volume, mouth width, the corners up/down;
  - eyes: size, the corner angle, how open, eye bag, spacing;
  - ears: size, how far they stand out;
  - neck: thickness;
  - the three ethnic blend targets as differences from the even mix, so a driver's own mix (summing to 1) reproduces MakeHuman's blend exactly.
- **The skin:** one `skin` material with per-vertex masks (`_MASKS`, baked from where MakeHuman's targets act: the lips, the beard area, the warm areas of cheeks, nose and ears, and the eye sockets), `_SCALP` (where hair grows) and `_AO` (how open the sky is over each point: rays against the head itself, so the sockets, the corners of the nose and mouth and under the chin are shaded). In three.js the shader uses them for the lips' tone, a warm flush, the sockets, a beard's shadow even when clean shaven (stubble a fine shaded layer, not geometry), the roots at the hairline, mottling and a fine pore bump; the shade of the folds is redder (light that has passed through skin), and a warm wrap at the light's edge fakes light through skin.
- **Eyes:** an eyeball on MakeHuman's eye helper (its front where the helper's is; the helper, 32 mm across, is roomier than an eye, about 24 mm; ours is 29 mm, filling the socket's corners): a sclera, an iris disc with fibres, crypts and a limbal ring in the driver's colour, a black pupil, and a clear glossy cornea. Shaded where the lids hang over it (`_AO`). How each shape key moves and scales the eye is a handful of numbers in the node's extras (`eye_keys`: `[dx, dy, dz, scale - 1]` per key, about `eye_centre`): the keys move it as they move its helper, and only the eye's own size scales it, as much as the lids round it open; `r3d/driver.js` applies them.
- **Eyelashes:** generated along the edge of each lid, found from the front (round the eye, the furthest out a ray from straight ahead still reaches the eyeball before the skin): a curling strip out and forward, the upper lid's long and full, the lower lid's short and sparse, drawn as fine strands (alpha to coverage). Bound to the lid, so they open and close with it.

## Hair, facial hair and brows: fur shells

Each is a thin shell laid on the skin, bound to the head's surface (`_BIND`: three head vertex ids; `_BARY`: their weights), so the same shape keys reshape it with the head (a wide head gets wide hair). Each vertex also carries what the shader needs to grow strands from it: `_TIP` (the offset from the skin to the hair's outer surface), `_FLOW` (the way the strands lie) and `_HAIR` (how far inside the hair's edge, 0 at the edge and 1 well inside; the strand coordinates across and along, in metres).

- **Hair:** one shell over the scalp (`hair`, the head's own faces where any style grows hair, subdivided once and rounded), carrying every style's strands as its own attributes (`_TIP_<STYLE>`, `_FLOW_<STYLE>`, `_HAIR_<STYLE>`); a figure draws its own. The hairline is a smooth line round the head (across the forehead, back at the temples, down the sideburns, over the ears, down to the nape), lowered by some styles; the ears are never under hair. Each style thins out at its edge and is thinner near it (it grows out of the hairline rather than standing up from it), and lies in locks of different fullness.
  - `buzz` (a few millimetres all over), `crop` (short, a little longer on top), `swept` (up and back off the forehead, centimetres deep at the front, short at the sides), `textured` (a fringe brushed forward and over to one side), `curly` (a deeper layer of tight curls), `long_back` (longer, swept back, down over the collar), `braids` (rows from the hairline straight back, tied into a bun at the back of the crown: `hair_bun`).
- **Facial hair:** one shell over the lower face (`beard`) with `short_beard`, `full_beard` (trimmed) and `moustache` (a moustache joined at the corners of the mouth to a beard on the chin, and a short beard along the jaw; Hamilton's). `stubble` is shaded on the skin.
- **Brows:** a patch over each brow ridge (`brows`), the brow's shape in `_HAIR`'s edge: nearly straight, fullest a third of the way out, the hairs standing up near the nose and lying outward along the arch.
- **In three.js** each shell is drawn as stacked layers (an instanced draw: 22 for hair, 12 for a beard, 6 for brows), from the skin out to the outer surface (the lean along the skin growing toward the tip). Each layer keeps fewer strands than the one under it: strands drawn along the flow, in clumps (the furthest reaching), thinning out at the edge; braids as rows of crossing locks, curls as coils. Inner layers are darker (the hair shades itself); light wraps softly through hair, with the two shifted highlights of real hair (Kajiya-Kay) running across the strands. Smaller than a pixel, strands blur to their average and the edge becomes a soft band. The strand parts (hair, beard, brows, lashes) cast no shadows: the shadow pass would draw each shell as a plain surface just off the skin, every layer of it, casting nothing a light would show.

## Each driver's look (`game-data.js`)

`LOOKS`, one per driver, assigned as `driver.look`:

```js
look: {
  skin: "#c58c6a",          // base skin tone
  hair: { style: "swept", color: "#2a1d15" },
  facialHair: "none" | "stubble" | "short_beard" | "full_beard" | "moustache",
  beardColor: "#2a1d15",
  brow: "#24180f",
  eyes: "#4f6b4a",          // iris
  heritage: { african: 0, asian: 0, caucasian: 1 },   // MakeHuman's ethnic blend, summing to 1
  shape: { jaw_width: 0.3, nose_length: 0.2, ... },     // each -1..1 (unipolar ones 0..1)
}
```

Worked out from each driver's public appearance in 2025 (public photos as reference only, nothing private), each with a line describing the appearance it is drawn from. A likeness, never a caricature: no shape slider past 0.7. `heritage` is MakeHuman's shape blend, used only where it clearly shapes the face. Leclerc and Hamilton get the most care: Leclerc's dark brown hair swept up and back, clean shaven, green eyes, a long lean face with a defined jaw, a long straight nose, thick straight brows set low and ears that stand out a little; Hamilton's braids tied back into a bun, his moustache joined to a short beard on the chin and along the jaw, his skin tone, high cheekbones, broad nose and full lips. `faces.js` (pure, UMD) holds the vocabulary, checks a look and turns its shape into the morph weights.

## In three.js (`r3d/driver.js`)

`buildDriver(driver, team, { headwear })`, `headwear` = `"none"` (default; the podium) or `"helmet"`. The two-argument call is unchanged in shape. An incomplete or out-of-range `look` throws. The podium (`r3d/podium.js`) asks for `"none"`.

- **"none":** the face, hair, brows, lashes and beard show; the balaclava part of the body is hidden and the neck is skin above the collar. The helmet is hidden.
- **"helmet":** exactly as before: helmet and balaclava, the head and everything on it hidden.
- Per driver: the morph target influences from `look.shape` and `look.heritage` on the head; each bound part moved by the head's own morph at its triangle, the eyes by their keys, into positions of the figure's own; the skin, lips, iris, brow, hair and beard colours; only that driver's hair style and facial hair drawn.
- Shared geometry otherwise; materials and those positions are per figure, and freed with it.
- `looks()` also reports `headwear`, `helmetShown` and a `face` record: what shows, the hair style and facial hair really drawn, the skin, hair and iris colours, and the shape keys really applied (read off the head mesh), for the checks.

## The studio (`tools/preview/driver.html`)

Adds `head=none|helmet` (default none), the cameras `face` (front close-up of one head), `face3` (three quarters), `side` and `podium` (the whole figure, arms up), `focus=<n>` (the face cameras look at the nth driver), `grid=1` for the 20 heads in a 5 by 4 grid with names, and `pos=&at=&fov=` for a camera of one's own. The close cameras use a portrait's light (the key high and to one side, a warm rim). Review images at 1600x900, headless, committed as `docs/review/2026-10-01/faces-*.jpg`.

## Checks

- **Node** (`tests/driver-faces.test.js`, `tests/driver-looks.test.js`):
  - the GLB has the head (skinned, every shape key, its masks and baked shade), two eyeballs with iris and cornea and their key extras (an eye's size really scales it), lashes on both lids, bound; brows, bound, growing strands; the hair shell with every style's strands and the bun; the beard shell with every shelled facial hair; each bound;
  - each style is its own depth (a buzz under 4 mm, swept hair over 2.5 cm, curls deeper than a crop), on the forehead only above the brows, down to the nape at the back;
  - the neck stands in the collar: its foot inside the suit, and where the plane of the collar's top edge cuts the neck, a gap of under 5 mm all round, never floating; for every driver's own face, the chin at least 2 cm above the collar and the neck neither more than a millimetre through it nor 6 mm short of it;
  - the hair and beard lie wholly above the neck's bend;
  - the eyes: only the eye's own size scales them; bound parts name real head vertices with weights summing to 1;
  - each style's hair is on the forehead only above the brows, never on the ears, down to the nape;
  - the figure's height and the existing tests still hold; the file stays under 4 MB;
  - every driver has a complete `look`, colours are valid, styles exist, `heritage` sums to 1, every shape value is a known key and in range and at most 0.7; no two faces alike; every style and facial hair is worn by somebody; the showcase pair's looks.
- **Browser** (`tools/checks/driver-check.js`): bareheaded figures show their own look (the hair style and facial hair drawn, the bun only with braids, the skin colour, the morph influences match the data); the hair is drawn in layers and follows each face: each hair vertex exactly where its head triangle's morphed corners put it, and each eye where its keys move and scale it (a bigger eye bigger); the helmet option shows the helmet with the driver's own texture and hides the face; the grid of twenty loads; no errors.
