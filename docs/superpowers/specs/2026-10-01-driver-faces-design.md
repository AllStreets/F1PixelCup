# Driver faces: real heads for the podium

The user, after the driver v2 review: "Make sure there are realistic faces that look at least slightly like the driver they are supposed to look like ... they will not be wearing helmets on the podium."

So the figure gets a head. On the podium the drivers stand bareheaded and each one should be recognisable: Leclerc and Hamilton most of all (the showcase pair), and every one of the 20 drivers of 2025 at least slightly. Respectfully and accurately: a likeness, never a caricature.

## Where the head comes from

**The MakeHuman base mesh and its targets** (makehumancommunity/makehuman, `makehuman/data/3dobjs/base.obj` and `makehuman/data/targets/**`), pinned to commit `a8bc2d54ff0ac92e78ff71431b1023eda42bf482`. MakeHuman's assets (the base mesh, proxies, targets and modifiers) are released under **CC0 1.0** (the repository's `LICENSE.md` section C and `LICENSE.ASSETS.md`, and the header of every file used). MakeHuman's program code is AGPL; none of it is used, only the data files, read by our own parser.

- `tools/blender/makehuman/fetch.py` downloads exactly the files used, at that commit, and `extract.py` cuts out the head and neck and writes `tools/blender/makehuman/head.json`: the vertices, quads, UVs, the helper geometry for the eyes and lashes, and every shape key as sparse deltas. That file is committed (CC0, derived); the build reads it, so it never needs the network.
- No photo textures of real people anywhere. The skin, eyes, hair and beards are shaded procedurally.

## The head (`tools/blender/build_driver.py` → `assets/driver.glb`)

- **Base shape:** MakeHuman's young adult male, a little more muscular than average (racing drivers are lean and have thick necks), the three ethnic blend targets at a third each.
- **The head and neck** are cut from the base mesh above the collar: about 4,000 quads (about 8,000 triangles), MakeHuman's own topology, enough for a podium close-up. Scaled so the whole MakeHuman figure would stand 1.78 m, like ours, and placed so its neck rises out of the suit's collar.
- **Skinned** to the same rig as the body: the head bone above the jaw, blended into the chest bone down the neck, so the head turns with the head bone and the neck stays one surface into the collar.
- **Shape keys** (glTF morph targets), each from MakeHuman targets. Bipolar ones are a pair (`_incr`, `_decr`), so a slider runs -1 to 1:
  - head: width, face length, depth, the square, oval, round, triangular and inverted triangular shapes, age;
  - jaw and chin: jaw width (chin bones), chin width, chin prominence, chin height;
  - cheeks: cheekbones, cheek volume;
  - nose: length, width, projection, bridge (hump), tip up/down, nostril flare;
  - brow: forward, up/down, angle; forehead height;
  - lips: volume, mouth width;
  - eyes: size, the corner angle, the fold, eye bag;
  - ears: size, how far they stand out;
  - neck: thickness;
  - the three ethnic blend targets as differences from the even mix, so a driver's own mix (summing to 1) reproduces MakeHuman's blend exactly.
- **Eyes:** real eyeballs on MakeHuman's eye helper (its centre and size follow the shape keys): a white sclera with faint warmth at the edges, an iris disc with radial fibres in the driver's colour, a black pupil, and a clear glossy cornea over them.
- **Eyelashes** on MakeHuman's lash helpers, and **eyebrows** as thin strips over the brow ridge, both shaded as fine strands with alpha.
- **The skin:** one `skin` material, per-vertex masks (`_MASKS`) baked from where MakeHuman's targets act: the lips, the beard area, the warm areas (cheeks, nose, ears) and the eye sockets. In three.js the shader uses them for a slightly darker, redder lip tone, a warm flush, a little darkness round the eyes, stubble (a fine shaded skin layer, not geometry) and fine pore detail. Roughness about 0.5, with a warm wrap at the light's edge to fake light through skin.

## Hair and facial hair

Meshes, built on the scalp and on the jaw, each on the head bone. Every one is bound to the head's surface, so the same shape keys reshape it with the head (a wide head gets wide hair).

- **Styles:** `crop` (short crop), `swept` (swept up and back), `textured` (short, textured, a fringe forward), `curly`, `long_back` (longer, swept back), `braids` (braids along the scalp, tied back into a bun), `buzz` (a buzz cut: scalp shading, barely any volume).
- **Facial hair:** `stubble` (shaded on the skin), `short_beard`, `full_beard`, `moustache` (with a chin beard; Hamilton's).
- **Strand detail:** the volume carries a strand-flow direction; the shader draws fine strands along it with an anisotropic highlight, and clumps of tapered locks break the outline at the hairline and the crown, so it never reads as a helmet of plastic.
- Colours per driver.

## Each driver's look (`game-data.js`)

`look` on every driver:

```js
look: {
  skin: "#c58c6a",          // base skin tone
  hair: { style: "swept", color: "#2a1d15" },
  facialHair: "none" | "stubble" | "short_beard" | "full_beard" | "moustache",
  beardColor: "#2a1d15",
  brow: "#24180f",
  eyes: "#4f6b4a",          // iris
  heritage: { african: 0, asian: 0, caucasian: 1 },   // MakeHuman's ethnic blend, summing to 1
  shape: { jawWidth: 0.3, noseLength: 0.2, ... },     // each -1..1 (unipolar ones 0..1)
}
```

Worked out from each driver's public appearance in 2025 (public photos as reference only, nothing private). Leclerc and Hamilton get the most care: Leclerc's dark brown swept hair, clean shaven, green eyes, long narrow face and straight nose; Hamilton's braids tied back, his beard and moustache, his skin tone and his face shape.

## In three.js (`r3d/driver.js`)

`buildDriver(driver, team, { headwear })`, `headwear` = `"none"` (default; the podium) or `"helmet"`. The two-argument call is unchanged in shape, so the podium branch's code keeps working.

- **"none":** the face, hair, brows, lashes and beard show; the balaclava part of the body is hidden and the neck is skin above the collar. The helmet is hidden.
- **"helmet":** exactly as before: helmet and balaclava, the head and everything on it hidden.
- Per driver: the morph target influences from `look.shape` and `look.heritage` on the head and every bound part; the skin, lips, iris, brow, hair and beard colours; only that driver's hair style and facial hair visible.
- Shared geometry; only materials are per figure, as now.
- `looks()` also reports `headwear` and a `face` record: skin, hair style and colour, facial hair, eyes, and the shape keys really applied (read off the head mesh), for the checks.

## The studio (`tools/preview/driver.html`)

Adds `head=none|helmet` (default none) and the cameras `face` (front close-up of one head) and `face3` (three quarter), and `grid=1` for the 20 heads in a 5 by 4 grid with names. Review images at 1600x900, headless, committed as `docs/review/2026-10-01/faces-*.jpg`.

## Checks

- **Node** (`tests/driver-model.test.js`, `tests/driver-looks.test.js`):
  - the GLB has the head (skinned, with shape keys, about 5,000 to 12,000 triangles), two eyeballs with iris and cornea, brows, lashes, every hair style and facial hair mesh, each bound (with the head's cranium keys);
  - the head sits on the neck: its lowest ring is inside the collar, with no gap between it and the suit;
  - the figure's height and the existing tests still hold; the file stays under 4 MB;
  - every driver has a complete `look`, colours are valid, styles exist, `heritage` sums to 1, every shape value is a known key and in range.
- **Browser** (`tools/checks/driver-check.js`): bareheaded figures show their own look (the hair style, the facial hair, the skin colour, the morph influences match the data); the helmet option still shows the helmet with the driver's own texture and hides the face; no errors.
