# The driver figure, v2 (work order item 0)

The Stage I driver was a jointed mannequin: a capsule per limb, balls at the joints, boots that floated off the shins and a gap under the helmet. It reads as a toy next to car v2. Before the user reviews the drivers, the figure is rebuilt so it reads as a person in a race suit.

## What changes (`tools/blender/build_driver.py` → `assets/driver.glb`)

- **One skinned body.** Torso, arms, legs and neck are one smooth mesh, skinned to the same 16-bone rig, so a bent elbow or a raised arm stays one limb with no seams.
  - Built as overlapping lofts with real proportions (chest, waist, hips, shoulders, calf and forearm swell), merged by a voxel remesh, smoothed and reduced to about 14,000 triangles.
  - The rest pose is an A-pose (arms 45 degrees down and out), so the arms never fuse into the torso when the shapes are merged.
  - Each vertex's weights come from the loft it was nearest to, smoothed across the joints, at most four bones per vertex.
- **The suit is painted by region, on the body itself** (no floating stripes):
  - `suit`: the body;
  - `suit_trim`: the collar band, the belt, side panels down the torso, a stripe down the outside of each arm and leg, and epaulettes on the shoulders;
  - `gloves`: a cuff at each wrist, meeting the glove;
  - `balaclava`: the neck between the collar and the helmet.
- **Hands** have a palm, four fingers in two segments, curled a little, and a thumb on the forward side.
- **Boots** have a sole, a heel and a collar that rises over the ankle into the trouser leg, so there is no gap.
- **The helmet** (the car's shell, `f1parts.py`, the painted designs unchanged) sits down over the balaclava.
- **Unchanged:** the bone names, the material names, the five actions (`stand`, `wave`, `arms_up`, `trophy`, `spray`), the props on the right hand, about 1.78 m tall standing on the ground, facing +X.
- **No face.** The helmet stays on, as the Stage I spec has it: the drivers are real people and the helmet design is how the game shows who is who.

## In three.js (`r3d/driver.js`)

`loadDriver()` loads the template; `buildDriver(driver)` clones it (`SkeletonUtils.clone`, as the body is skinned) and dresses it:
- the suit in the team's livery base colour and the trim in its trim colour (`liveryFor` in `r3d/car.js`, so the suit matches the car);
- the helmet with the driver's painted design (`helmetTexture`, shared with the car);
- an `AnimationMixer` with the five actions, and `play(name)` cross-fading between them and showing only the prop that pose uses.

## The review (`tools/preview/driver.html`)

A studio page that loads the real `r3d/driver.js` and shows Leclerc and Hamilton dressed, in every pose, for the user's review. Screenshots go to `docs/review/2026-10-01/`.

## Checks

- **Node** (`tests/driver-model.test.js`):
  - the body is one skinned mesh (`JOINTS_0`, `WEIGHTS_0`) on a skin with all 16 bones, about 10k to 20k triangles, with the suit, trim, glove and balaclava materials on it;
  - the boots rise above the ankle joint (no gap) and the helmet's rim sits below the top of the neck;
  - each hand has fingers (more than 300 vertices);
  - and every Stage I test still holds (parts, materials, actions, height, facing, the helmet's UVs, the poses moving).
- **Blender build:** no pose puts a boot below the ground (as before).
- **Browser** (`tools/checks/driver-check.js`): the preview loads, both drivers wear their team's suit colour and their own helmet texture, every pose plays, no errors.
