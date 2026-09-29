# Post-processing and graphics quality — design

Date: 2026-09-29 · Stage F of `docs/superpowers/plans/2026-09-29-master-todo.md` · built autonomously (the user's standing instruction).

## Why

The user picked a hybrid look: a Broadcast base, the way a TV feed grades a race, with short Arcade bursts on the player's own big moments. It must never cost a slow machine its frame rate. So the graphics tier is detected automatically, and the player can override it in Settings.

## Rules

- **High is Low plus the effects, never a different picture.** Every tier draws the scene the same way, straight to the canvas. The sky and the fog are authored in display space, and three.js only tone-maps a draw to the screen. A first build rendered into an HDR target and tone-mapped in an `OutputPass`, which tone-mapped the sky and fog twice and washed High out: Monza's sky came out `171,190,187` on High against `93,153,181` on Low. The effects tiers now copy the finished frame off the canvas (`copyFramebufferToTexture`) and work on it in display space. `RenderPass`, `OutputPass` and `OutputShader` are no longer vendored.
- **Effects follow real events.** Bursts fire only on the player's own `f1:fx` events. The flare shows only when the sun is on screen and nothing stands between it and the camera.
- **Physically honest.** The flare is a raycast against the scenery, bloom only catches real highlights, and the heat haze only runs at Bahrain.

## The look (`r3d/postfx.js`)

The chain is: the frame copied off the canvas → `UnrealBloomPass` → a finish `ShaderPass`. The finish pass, in order:

| Part | What it does |
|---|---|
| Heat haze | Bahrain only: a shimmer in the band just above the horizon. |
| Speed blur | A radial blur at the edges of the frame. It starts above 55 % of top speed and is capped at 0.4 from speed alone, with +0.12 while boosting. |
| Colour split | The Arcade punch on a hit or Overtake Mode. |
| Grade | Per circuit: contrast, gain, lift, saturation (the table below). |
| Sun flare | A glow round the sun and three ghosts along the line through the frame's centre. Day circuits only. |
| Overtake glow | Warm light round the edges of the frame. |
| Vignette | 0.28, with a red pulse through it when the player is hit. |

**Bloom** works in display space with a threshold of 0.9, so the sky and the white kerbs never bloom. Strength is 0.3 by day and 0.32 at night, +0.35 during a gold burst.

**Grades:**

| Circuit | Character |
|---|---|
| Monza | Warm, a touch of contrast |
| Spa | Cool, desaturated (the Ardennes' grey light) |
| Silverstone | Neutral, a faint blue lift |
| Suzuka | Slightly green, vivid |
| Monaco | Warm, the most saturated day grade |
| Singapore | Warm under floodlights, lifted blacks, night |
| Bahrain | Hot, blue pulled down, with the heat haze |
| Interlagos | Vivid, slightly warm |

**Bursts.** Each burst is set by the player's own event and decays on race time, so it freezes with a paused race.

| Event | Burst | Fades over |
|---|---|---|
| `overtakeMode` | gold | 0.5 s |
| `hitTaken` | red | 0.3 s |
| `itemUsed` with `drs` | blur | 0.7 s |

- Ruling: the to-do list named `boostStart` for a burst. DRS is the boost the player fires on purpose, so it gets the blur surge. A plain boost only adds 0.12 to the speed blur, so it doesn't flash on every pickup.

**The sun.** It is placed at `camera + SUN_DIR × 4000` and projected with the camera's current matrices (`updateMatrixWorld` first). While it is on screen, a ray is cast toward it every six frames against the scenery and landmarks; the ground doesn't count. Visibility eases on wall-clock time, so the flare settles even while paused.

## Tiers (`quality.js`, pure rules; tested in `tests/quality.test.js`)

| Tier | Composer | Bloom | Grade | Bursts | Flare | Speed blur | Haze |
|---|---|---|---|---|---|---|---|
| High | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Medium | ✓ | ✓ | ✓ | ✓ | – | – | – |
| Low | – (drawn directly) | – | – | – | – | – | – |

- **First guess (`initialTier`).** The tier is guessed from the device:
  - a software renderer, or 2 cores or 2 GB or less → Low;
  - touch-only, integrated PC graphics, or no information → Medium;
  - Apple silicon, discrete GPUs, or 6+ cores → High.
- **Auto adjustment (`adjustTier`).** The first 90 unpaused racing frames are measured, less the first 10. If the median is slower than 22 ms, the tier steps down once. It never steps up on its own.
- **The player's choice.** Settings → Graphics cycles Auto, High, Medium, Low. The choice is kept in `f1pixelcup.graphics`, and Auto shows what it picked (for example "Auto (High)").

## Found on the way (fixed here)

- **Smoke and dust sprites.** Each point sprite is one flat square at one depth, so the road under it cut it off in a hard line. On every tier this showed as grey boxes behind the cars. The vertex shader now brings the sprite's depth forward by about its own radius; where it lands on screen is unchanged.
- **Advert barriers.** The texture ran with the lap, so the right-hand barrier read backwards from the track ("ꟼIXEL"), and the back of every barrier showed the adverts mirrored across a corner. The right-hand barrier now wears the print mirrored, and each barrier is printed only on its track side; the back is plain barrier grey. `Render3D.inspect().adverts` reports both, checked with a ray from the road.

## Tests

- **Node** (`tests/quality.test.js`): the device guess, the step-down (once, never up, not before 60 frames), choice parsing, the choice overriding auto, and which passes each tier runs.
- **Browser** (`tools/checks/postfx-check.js`, 11 steps):
  - each tier switches the real passes;
  - the player's Overtake Mode sets off a gold burst that fades, and another car's does nothing;
  - a hit and DRS set off their bursts; there are no bursts on Low;
  - the flare shows looking at the sun and not looking away;
  - `highKeepsLowExposure`: the sky reads within 24 levels per channel on High and Low. It failed on the HDR build (`44,113,153` against `141,189,194`);
  - the adverts read from the track;
  - Low is never slower than High;
  - the Settings row shows Auto's pick, cycles, and keeps the choice across a reload.
- **Screenshots:** High against Low at Monza, Singapore and Bahrain, in `docs/superpowers/specs/assets/2026-09-29-postfx-tiers.jpg`.
