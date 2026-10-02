# TV-camera replays: design

Date: 2026-10-01 · Stage M of `docs/superpowers/plans/2026-10-01-work-order.md` (roadmap stage 13) · built autonomously (no design review; the user's standing instruction).

## What the player gets

After a race, the results screen has a **Replay** button. It plays the race just run, from lights out to the last car home, as television shows it:
- **trackside cameras** round the circuit that pan and zoom to follow a car and cut to the next camera as it moves on;
- an **onboard** T-cam above and behind the airbox;
- the **helicopter**, high and wide;
- a **director** that cuts between them by itself and follows the closest battle at the front, or the player;
- **broadcast graphics** over the picture: a REPLAY tag, a timing tower with positions and gaps, a lower third naming the driver and team in shot, the lap counter, and on the onboard view the car's controls as an input trace.

The viewer can pause, play at 0.25x, 0.5x, 1x, 2x or 4x, seek anywhere in the race instantly, choose the camera and the car, and leave back to the results screen.

Replays are of the race just run. Nothing is saved to disk in this stage: the recording lives in memory until the next race starts or the player goes back to the pit lane.

## Rules

- **The replay is the race, exactly.** It is drawn from a recording of the race's own state, not re-simulated from inputs. Every recorded sample plays back exactly as it was stored, every time, at any speed, after any seek. Nothing in the replay is decided by `Math.random` or the frame rate.
- **Honest numbers.** The tower's gaps, the positions, the lap counter and the input trace are the race's own values at that moment, recorded as the race computed them.
- **Nothing over the track.** Trackside cameras stand off the track, claimed through the same claim system the scenery uses (`course.claim` rules: clear of the barriers by their radius plus a margin, clear of anything already placed). No camera is ever drawn as an object, so `auditScenery` is unaffected; the check proves every camera position is outside the barriers.
- **Responsive.** The graphics and the controls stay on screen at every window size, with no black bars (the canvases already fill the window).
- **No real marks.** The graphics are in the game's own style (Titillium, the game's red, dark panels). No broadcaster's or series' logos, fonts or layouts are copied.
- **No em dashes** in any text the player reads.

## Recording (`replay.js`, pure, UMD, tested in Node)

### What and when

A recording starts at lights out and takes a **sample every second physics step (30 Hz on the race clock)**. The race steps at a fixed 60 Hz (`PHYSICS_STEP_MS`), so sample `k` is exactly step `2k`, at race time `t0 + 2k · PHYSICS_STEP_MS` where `t0` is lights out (`state.raceStart`). Steps happen only when the race moves (never while paused, and seven per frame after the flag, each on its own tick), so the recording is on the race clock, not the wall clock.

**Positions every step, the rest every second step.** Each car's x, y and heading are also kept at the step between two samples (the odd steps), so every step the race drew is in the replay exactly: a contact can shove a car in a single step, and a straight line between samples would smooth that over. Everything else (speed, gaps, controls, on/off states, the road's objects) changes smoothly or only matters at a frame's resolution, so it is kept every second step:
- Drawing goes straight between two steps, as the live game draws between steps (`placeForDrawing`).
- On/off states (DRS, a spin starting) can appear up to 1/60 s late; a frame at 60 Hz.

### Per car, per sample

| field | storage | resolution |
|---|---|---|
| x, y | Float32 | 0.5 mm at 8,000 units |
| lap distance `d` | Float32 | as x, y |
| heading | Int16 | 2π/65536 ≈ 0.0001 rad |
| speed | Int16, 1/64 unit/s | 0.016 units/s |
| lateral offset `lat` (shots, oil trails) | Int16, 1/128 unit | 0.008 units |
| gap to the leader (s), as the tower computes it | Uint16, 1/50 s (to 21 minutes) | 0.02 s (the tower shows tenths) |
| steer, throttle, brake (applied controls) | Int8 · /127, Uint8 · /255, Uint8 · /255 | 0.008 |
| lap, place in the running order, item held | Uint8 each | exact |
| state bits | Uint16 | exact |
| x, y, heading at the odd step after the sample | Float32, Float32, Int16 | as above |

State bits: spinning, DRS open, boosting, Formation Lap, Overtake Mode, drifting, drift to the right, finished, trailing oil, off the road, under a roof, item roulette spinning, and the drift's charge (two bits: none, blue, orange, as the smoke colours it).

That is 38 bytes per car per sample (28 for the sample, 10 for the step after it). Quantisation is honest: every field keeps more precision than anything it is drawn or shown with (the tower shows tenths of a second; the input trace is 60 px tall).

### Per sample, the rest of the race

- **Shots and oil** on the road (Undercut, Debris, Steward Penalty, dropped oil): a variable list, each with a recording-wide id (so a shot can be matched between samples and drawn smoothly), its type, `d`, `lat` and age.
- **The Safety Car:** present, leaving, parked, `d`, `lat`.
- **Item boxes:** one bit each, hidden or not.
- **Marshal flags:** each post's flag (none, yellow, green), computed at each sample from the race's cars by `Marshals.flags` with the recording's own memory, so the replay's flags are the race's, not recomputed during playback.
- **The player's keys:** throttle, brake, left, right, drift, and the item key (pressed at any time since the last sample).
- **Events:** the coloured flashes of hits and bounces (`state.fxFlashes`), each kept once with its start and end, and the moment the player took the chequered flag (for the fireworks).
- **Once per race (the header):** the circuit, laps, weather, lights-out time, each car's id, driver, code, number, team and colour, and the player's id.

### Storage

Typed arrays in chunks of 128 samples, allocated as the race goes (never a reallocation of everything). The budget: **at most 1.5 MB a minute; a typical race of 3 to 4 minutes is about 5.5 MB** (20 cars × 30 samples/s × 38 bytes ≈ 1.37 MB a minute, plus the small extras and the last chunk's slack). The Node test measures bytes per minute; the browser check measures a real race.

### Cost

Recording runs during every race. Its cost per step is measured (the browser check times a batch of samples against the race's own steps) and must stay negligible: under 2% of a physics step's own time at the same point of the race (measured at about 1.6%, some 5 µs a step). The browser check reports it.

### Playback

- `Replay.sampleAt(recording, k)` returns sample `k` exactly as stored (every field decoded, bit for bit).
- `Replay.frameAt(recording, t)` returns the state at any race time `t`: positions, `d`, heading (the short way round), speed, `lat`, gap, steer and throttle interpolated between the samples either side; on/off states, lap, place and item from the earlier sample (what the race had at the last step). A jump of more than 60 units between two samples (a rescue by the watchdog) is drawn as it is, as `placeForDrawing` does. Shots are matched by id; one that appears or disappears between samples is drawn where it is.
- **Seeking** is instant: the sample index is `floor((t − t0) / sampleMs)`.
- Smoke, sparks and dust are decoration, as in the live race: re-emitted from the replay's cars as they were (drifting, boosting, off the road) with the visual generator, never the race's. They are not part of the recording, so they may differ between two viewings; everything recorded plays back exactly. A seek clears them, and whatever the renderer eases from frame to frame (a spin, the DRS flap, an item box growing back) starts from the moment itself.
- The playback clock is the race clock: at 1x a second of replay is a second of the race (so the field's fast-forwarded laps after the player's flag play at their true speed).

## Cameras

All three are computed in the renderer from the replay frame and the circuit; their maths is in `replay.js` where it is pure, and tested.

### Trackside (the classic broadcast cut)

- **Placement** (`Replay.placeTvCameras`), once per circuit, when a replay first opens there:
  - anchors every ~450 units round the lap, adjusted to divide the lap evenly;
  - candidates on both sides of the road at each anchor, beyond the barrier;
  - each candidate is moved to the nearest spot the claim system allows (clearance from the barriers of at least its radius plus a margin, not blocked by anything placed), scored by how much of its stretch it can see (rays from the camera to the car's height along the stretch, against the scenery, landmarks and the circuit's own walls and stands), and the best is claimed.
  - Camera height above the road: the lowest of 26, 40, 60 and 80 units (about 4 m up to a 13 m crane) from which it sees its whole stretch, with the catch fences counted as in the way (seen through from right behind, a fence fills the shot; the street circuits' fences stand 32 high). Failing that, the height that sees most of it.
- **Coverage:** camera `k` covers the lap from 35% of the way after the previous camera to 35% of the way to the next. It sees the car coming, follows it past, and the broadcast cuts to the next camera.
- **Pan and zoom:** the camera aims at the car (a little ahead of it), and its field of view keeps the car the same size in the frame (a subject ~110 units wide), between 4° and 40°.

### Onboard (T-cam)

On the focus car's own transform: above and behind the airbox, looking down the road over the nose. It moves with the car exactly (its spin included). The camera's near plane comes in for this view only, so the airbox is not clipped.

### Helicopter

The existing TV helicopter, which in the race trails the leader. In the helicopter view it trails the focus car (250 behind, 220 aside, 260 up, as before) and the picture is taken from it, looking down at the car with a wide lens. Its own body is hidden while the camera is in it.

### The director

`Replay.directorShots(recording)` cuts the race into shots once, when the replay opens, so seeking always lands in the same shot:
- the first shot is the helicopter over the start;
- after that, a shot every 6 seconds of race time;
- at each shot's start it looks at the running order: the closest pair among the first six (gap under 1.5 s) is the battle, and the car behind (the attacker) is followed; with no battle, the player's car;
- cameras rotate trackside, trackside, onboard, trackside, helicopter, so trackside is the staple and onboard and helicopter punctuate it, as on TV;
- a battle shot stays on the same pair while it lasts (only the camera cuts).

**Manual:** choosing a camera, or another car, takes the director off; choosing Director puts it back.

## Broadcast graphics (HTML over the canvas, `screens.js`, `play.css`)

- **REPLAY** tag, top right, with the current speed when it is not 1x.
- **Timing tower**, top left: position, team colour, code, gap to the leader (LEADER, then +s.s; FIN once home). The focus car is highlighted. Top ten and the focus car.
- **Lower third**, bottom left: position, number, driver's name, team, in the team's colour. It names whichever car the camera is on.
- **Lap counter:** LAP n/N (the leader's lap), FINAL LAP, or FINISH.
- **Input trace** on the onboard view: throttle and brake bars, a steering bar, and four seconds of throttle and brake trace, from the car's recorded controls. On the player's car the trace is drawn from the player's own keys.
- **Controls**, bottom: play/pause, speed (0.25x to 4x), a seek bar over the whole race with the time, camera (Director, Trackside, Onboard, Helicopter), previous/next car, and Exit. Keyboard: Space play/pause, ← → seek 5 s, ↑ ↓ previous/next car, − + speed, C camera, Esc or X exit. Everything is reachable by mouse and by Tab.

The canvas HUD (speed panel, minimap, item badge) is not drawn during the replay: the broadcast graphics replace it.

## What does not change

- The race itself: recording only reads the state, except for one thing it needs. `racer.steer` was never set (always 0); it is now the steering the car actually applied each step, so the recording has it, and the live race's front wheels now turn with the steering as well.
- Sound: the replay is silent apart from the venue (no engine note follows the replay's cars in this stage).

## Tests

**Node (`tests/replay.test.js`):**
- A synthetic 20-car race of several thousand steps, recorded and played back: every field of every car, the shots, the Safety Car, the boxes, the flags and the keys, at every sample, equals what was recorded (after the documented quantisation), exactly.
- Quantisation stays inside the table's bounds.
- Interpolation between samples: halfway is halfway, headings go the short way round across ±π, a jump is not smeared, discrete states come from the earlier sample, shots match by id.
- Seeking lands on the right sample, before the start and after the end included.
- Memory: bytes per minute of a 20-car recording are within budget (≤ 1.5 MB a minute; a typical four-minute race under 6 MB).
- Camera maths: TV camera placement never places a camera inside the barriers or on a claimed spot, covers the lap without gaps, and the coverage cut goes to the next camera; the zoom keeps the subject's size; the director's shots are deterministic, cover the race and follow the closest battle.

**Browser (`tools/checks/replay-check.js`, in `run-all`):**
- A short real race run headless; the race's own positions are sampled independently during it; the replay is opened from the results screen's button.
- At sampled race times the replay's car positions equal the race's recorded positions.
- Every camera mode renders, and its camera is where it should be: trackside cameras outside the barriers (clearance ≥ 0), the onboard camera above its car, the helicopter high above the road.
- Seeking and speeds work; Exit returns to the results screen with the race's results intact; no errors.
- The check is shown to fail against the code without replays.
