# Car v2 and the drivers (Stage I)

Roadmap stage 9, plus the drivers the podium ceremony needs (user, 2026-09-29: "make racers in other Blender projects too to make the eventual podium ceremony more impressive").

Both are built by scripts in Blender, run headless (`Blender -b --factory-startup -P …`), so they are reproducible and never touch an open Blender session. `tools/blender/preview.py` renders a GLB from four angles for review.

## Car v2 (`tools/blender/build_f1_car.py` → `assets/f1_car.glb`)

The 2025 shape. It is original, and after the look of the class, not any one team's car.

- **Nose and front wing.**
  - A long, slim nose whose tip reaches the second element.
  - Four elements that sweep up toward the tips and curl into the endplates, with footplates and a pylon pair.
- **Sidepods.**
  - A high, narrow ("letterbox") inlet.
  - A deep undercut below it, where the floor shows.
  - A top that ramps steeply down toward the rear (the downwash ramp).
  - Cooling louvres on the ramp.
- **Floor.**
  - Wider and flat, with its edge visible, an edge wing along each side, and fences at the front.
  - A large diffuser with strakes at the back.
- **Engine cover.** A narrow spine, a small fin and a blade roll hoop over the airbox.
- **Rear wing.**
  - A spoon mainplane, a DRS flap and rounded tips flowing into the endplates.
  - A two-element beam wing below.
  - A DRS actuator pod.
- **Wheels.**
  - 18-inch rims with flat wheel covers, and low-profile tyres (18-inch, 720 mm).
  - Wheel-wake winglets over the fronts, and brake-duct fairings.
- **Tyre lettering.** An original wordmark ("PIXEL CUP") and the compound, repeated four times round each sidewall. The tyre's sidewall band has UVs for it, and `r3d/car.js` paints the lettering texture: yellow mediums in the dry, green intermediates in the wet.
- **Baked AO.** Cycles bakes ambient occlusion into a vertex colour (`COLOR_0`), and `r3d/car.js` multiplies it into every material, the painted livery included. So the undercut, the floor and the cockpit are shaded as the real thing is.

**Kept exactly:**
- Every part the game uses: `car_body`, `wheel_FL/FR/RL/RR` (origins on the axles), `drs_flap` (origin on its leading edge).
- The materials by role: `livery_body`, `livery_trim`, `carbon`, `tyre`, `tyre_band`, `rim`, `helmet` (equirectangular UVs, the spoiler's crown-colour UV), `halo`, `rain_light`.
- The axes, the scale (metres, x forward) and the ground at z = 0.

## The drivers (`tools/blender/build_driver.py` → `assets/driver.glb`)

A driver in a race suit, about 1.78 m.
- **The rig.** The figure is a jointed rig: each part (torso, upper and lower arms, hands, thighs, shins, boots, head and neck) is its own rounded mesh, parented to its bone. That holds its shape in any pose, needs no skin weights, and exports to glTF as a node hierarchy three.js animates directly.
- **Materials by role, recoloured per team and driver as the car is:**
  - `suit` (the team's base colour);
  - `suit_trim` (a side panel and a collar in the trim colour);
  - `gloves`, `boots`;
  - `balaclava` (the neck);
  - `helmet`: the same shell and UVs as the car's helmet (`tools/blender/f1parts.py`), so each driver's painted design, visor included, carries over;
  - the props' `trophy`, `bottle` and `foil`.
- **Animations (glTF actions):**
  - `stand`: a relaxed idle;
  - `wave`: one arm waving;
  - `arms_up`: both arms up in triumph;
  - `trophy`: holding a trophy above the head;
  - `spray`: shaking and spraying a bottle.

  The props (`trophy`, `bottle`) are separate objects that the poses place.

## Checks

- **Node** (`tests/car-model.test.js`, `tests/driver-model.test.js`), reading the GLBs:
  - Car:
    - every required part and material is present;
    - the DRS flap's origin is on its leading edge;
    - the wheels are on their axles at the right radii;
    - the helmet spoiler still sits on the shell;
    - `COLOR_0` is present.
  - Driver:
    - every part, material and action is present;
    - the figure stands on the ground, about 1.78 m tall;
    - the helmet has UVs.
- **Browser**:
  - the car still loads in the game;
  - all ten liveries recolour;
  - the DRS flap still opens to 12°;
  - `auditScenery` stays at 0;
  - no errors.
- **Screenshots**: the showroom and races with varied drivers (Leclerc and Hamilton first), and the driver figure in every pose.
