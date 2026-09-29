# Rain races (Stage H)

Roadmap stage 8. A race can be wet. A wet race has real grip loss in the physics, and it looks and sounds wet.

## What the player chooses

The pit lane gets a **Weather** row next to Grid:
- **Dry** (the default);
- **Wet**: every race of the cup is wet;
- **Changeable**: each race has a one-in-three chance of rain.

The choice is kept like the grid choice (`f1pixelcup.weather`) and is fixed for the cup once it starts. Changeable is decided per race and is seeded by the cup run and the race index. So the same cup attempt always has the same weather, and a restart of the page mid-cup can't reroll it. The feed says when a race is wet ("Rain at Spa: the grip is down."). The race's weather also shows in the loading panel and on the timing tower's header.

## The physics (`weather.js`, pure, UMD like `marshals.js`)

The physics was pure yaw. Heading turned by steer × turn rate, and nothing limited how hard a car could corner. Rain needs a grip limit, so there now is one:

- **The lateral limit.** A car's lateral acceleration is its speed × its yaw rate, including the drift yaw. It may not exceed `grip × DRY_LIMIT(physics)`.
  - `DRY_LIMIT` is the most the car can pull in the dry: top speed × (full-speed turn rate + drift yaw). So **dry handling is untouched**.
  - In the wet, `grip` is `WET.corner` = **0.72**, so a car asking for more yaw at speed gets less: it understeers.
  - `capYaw(yaw, speed, limit)` returns the yaw that respects the limit.
- **Scrub.** A wet tyre cornering near its limit slides, and scrubs speed. The share of speed kept over a step is `exp(−WET.scrub × load² × dt)`, where load is the lateral acceleration against the wet limit, capped at 1, and `WET.scrub` = 0.4/s.
  - This is what makes flowing circuits slower in the rain, not only the ones with hairpins.
  - It is none going straight, and none in the dry.
- **Traction and brakes.** In the wet, acceleration is × `WET.accel` (0.85) and braking is × `WET.brake` (0.75).
- **Off the road.** The off-road speed factor is × `WET.offroad` (0.85): wet grass is worse.
- **The oil slick is worse in the wet.** Its spin lasts × `WET.oilSpin` (1.4).
- **The CPU drivers know it is wet.** The speed at which they lift for a corner scales with √grip (the cornering speed for a given radius goes as √μ). So they slow for corners instead of running wide.
- **Per-race weather.** `raceWeather(mode, seed, raceIndex)` returns `"dry"` or `"wet"`: always for Dry and Wet; for Changeable, wet when `hash(seed, raceIndex)` is under `RAIN_CHANCE` (1/3).

## How it looks

Everything is quality-tiered, and all of it is off in a dry race.

- **Wet road.**
  - The track's tarmac, the pit lane and the run-off get lower roughness (0.85 becomes 0.28) and a darker albedo. The sky is then reflected in the road through the scene's environment.
  - The kerbs and paint get lower roughness too.
  - The dry values are kept, and a dry race restores them.
- **Overcast.** In the wet the sun is dimmer (× 0.45), the sky and fog are greyed and the fog comes in closer. It reads as rain, not night; night circuits keep their night.
- **Rain.** Streaks fall in a box that moves with the camera (`THREE.LineSegments`), slanted by the car's speed. Counts are 5000 on High, 2500 on Medium and 1000 on Low.
- **Spray.** A rooster tail rises from each rear wheel, at the real wheel positions from the car model. It scales with the car's speed, and the cars near the camera get the most. It is a pooled `THREE.Points` system (sizes by tier; none on Low).
- **Droplets on the camera.** In the post-FX finish pass, procedural drops refract the frame, and they streak sideways with speed. On High and Medium (Low has no effects pass).

## How it sounds

- **Rain ambience.** Filtered noise, a steady hiss, on its own loop.
- **Tyre hiss.** Band-passed noise whose gain follows the player's speed.

Both are silent in the dry and follow the master volume and mute.

## Tests

- **Node** (`tests/weather.test.js`):
  - `raceWeather` is fixed for Dry and Wet;
  - Changeable is deterministic, and wet for about a third of races over many seeds;
  - `capYaw` leaves yaw alone under the limit and caps it at `limit / speed` above it;
  - `scrub` is 1 going straight, grows toward the limit, and costs `WET.scrub` a second at it;
  - `DRY_LIMIT` is at least anything the car can do (so the dry is unchanged);
  - the wet factors are below 1.
- **Browser** (`tools/checks/rain-check.js`):
  - `weatherPills`: Dry, Wet and Changeable in the pit lane; the choice persists and is locked in a cup.
  - `gripMeasured`: the player car is held at full steer and full throttle on a long straight-ish stretch. Its measured lateral acceleration is measured dry and wet, and the wet is within 0.72 ± 0.03 of the dry *at the limit*. Dry handling is unchanged from before: the same yaw as without weather.
  - `wetLapsSlower`: a headless full race on Spa and Monaco, dry and wet (every car on autopilot, the same seeded random numbers for both). The field's average best lap is at least 4 % slower in the wet, and every car still finishes.
  - `wetLooks`: in a wet race the road roughness is under 0.35, the rain streaks exist and move with the camera, spray points are live behind cars at speed, the droplets uniform is on (High), and the rain and hiss gain nodes are above zero. In a dry race all of that is off.
  - `noErrors`, and `auditScenery` is still 0.
- **Screenshots**: a wet race at Spa and one at Monaco (High), and one on Low.
