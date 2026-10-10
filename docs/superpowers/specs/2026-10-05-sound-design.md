# The engine's voice, and sound in the replays: design

Date: 2026-10-05. These are the user's requests of 2026-10-05, built on the replays branch (`stage-m-replays`):
- "could we preserve sound in the replays?"
- "since I mostly sit at full speed, could we incorporate a turbo crackle or something in the engine so it is not mostly a static sound at full speed on the straights?"

## The engine (`engine-sound.js`, pure, UMD, tested in Node)

A model of one car's power unit, stepped with the race. Each step it takes the car's speed as a share of its top speed, and its throttle and brake as the race applied them. It returns what the engine sounds like.

- **Revs through eight gears.**
  - Each gear reaches 12,000 rpm at a set share of top speed, and top speed falls in eighth at about 11,800.
  - An upshift comes at the shift point under throttle, and the revs drop at once.
  - A downshift comes when the gear below would turn under 11,000, and it brings a blip of throttle.
  - A shift takes 0.15 s.
- **Life at full speed, on a long straight:**
  - **A slow wander and a shimmer.** The road, the wind and the drivetrain keep the note moving by a few tens of revs, smoothly, never a jump.
  - **The hybrid deploys, then clips.** Its whine sits above the note while it deploys. Its store runs dry after 18 s flat out, and then the whine stops and the note sags by about 120 rpm, as a modern car's does. Braking or lifting refills the store in about 3 s.
  - **The turbo spools** with throttle and revs, and its whistle is faint.
- **Crackles and pops:**
  - Lifting off above 9,000 rpm gives three to seven pops over 0.7 s, with a rush of air from the turbo.
  - Each downshift off the throttle adds a pop or two.
  - At a steady throttle there are none, so it never becomes tiring.
- **Seeded:** the same seed and inputs give the same sound, step for step.
- **Primed:** a car joined at speed (a replay cutting to it) starts in its gear at its revs.

**Synthesis (Web Audio, in `game.js`):**
- **The note:** three orders of the V6, an rpm-locked saw at half the firing rate (rpm / 40) with its octave (the firing rate) and the crank's half order beneath.
- **The chain:** the note goes through a soft clip, and then a lowpass that opens with the throttle.
- **Vibrato:** a few cents, deeper under load.
- **Shifts:** a cut of a few hundredths of a second for each upshift, and a lift for each downshift's blip.
- **Above the note, both quiet:** the turbo's whistle (2.6 to 4.4 kHz) and the hybrid's whine, which follows the speed.
- **Pops:** a sharp bandpassed crack and a low thump each.
- **Overall level:** the same as the old engine's.

## The replays' sound

The replay is heard from its camera.

- **The car in view:**
  - Its engine runs from its recorded speed, throttle and brake, through its own model, primed when the shot changes car.
  - Onboard it is close and level.
  - From a trackside camera or the helicopter it fades with distance (`distanceGain`).
  - Its note shifts as it comes and goes: the Doppler shift, from how fast it is getting nearer the camera or farther away (the speed of sound is 2,042 units/s).
- **The car passing nearest the camera** (within 600 units) is heard through the second engine voice, with its own distance and Doppler shift. It is kept unless another is clearly nearer (by 15%), so two cars side by side do not chirp.
- **Tyres sliding:** the car in view or the passing car drifting, or off the road at speed.
- **The venue:**
  - The crowd, the reverb, the floodlights' hum and the rain, at the car in view.
  - The helicopter's rotor loud from the helicopter view.
- **One-off sounds, as the race plays** (`Replay.eventsBetween`):
  - **What they are:** hits and bounces (the recorded flashes), knocks between cars (recorded once per knock), items fired, item boxes taken, boosts and spins starting, and the player's chequered flag. The lap chimes and the kerbs are not in a replay.
  - **How loud:** each is as loud as it is far from the camera (height included), and the nearest goes first.
  - **On a seek:** none (going back, or a jump of more than half a second).
- **Speed and pause** (`replayMix`):
  - 1x is heard as it was.
  - 0.5x and 2x are pitched gently (the speed to the power 0.35), not a tape's full shift.
  - 0.25x and 4x play only the venue, at half level.
  - Paused, or in a tab out of sight (it pauses), there is silence.
  - **Coming back:** after a pause or 4x, the engines are primed again at each car's speed, so there is no swoop from idle.
- **Two players:** the second voice is player 2's in the race, and the passing car's in a replay.

## Checks

- **Node** (`tests/engine-sound.test.js`, and `tests/replay.test.js` for the events):
  - the gears and the drop at each upshift;
  - the note alive but bounded at top speed (a range of more than 60 rpm and less than 700, no step over 40);
  - the hybrid deploying then clipping, and recharging;
  - no pops at a steady throttle, pops on a lift at high revs and none at low revs;
  - downshifts with blips and pops;
  - determinism and priming;
  - Doppler, fall-off with distance and the replay mix;
  - the events between two moments, and none on a seek.
- **Browser** (`tools/checks/sound-check.js`, read back from `state.engineSound` and `state.replaySound`):
  - flat out at top speed in a real race the note moves, the turbo is spooled and the hybrid deploys, and a lift crackles;
  - in a replay the onboard engine is level and close;
  - a trackside camera hears the Doppler shift both ways and the fall-off;
  - 2x is pitched up, while 4x and pause have no engine;
  - the first event of the race is heard as it plays, and a seek past events is silent.

## Starting up (user, 2026-10-10)

"The sound at the start of qualifying is a little too artificial; it almost sounds like an EDM sound or song and not an engine. I want the sound to be an engine starting up, either from the back or for qualifying."

**The cause.** A qualifying lap begins with the car rolled out at speed. The engine model began in first gear at idle, so it ran up through six gears in about a second, each with its cut, on clean oscillators: an arpeggio.

**The fix:**
- **No run up through the gears.** A jump in a car's speed between two steps (more than a fifth of its top speed) puts the engine straight into the gear for it.
- **A start-up** (`EngineSound.startup`, a seeded timeline, every car's a little its own):
  - the starter turns the engine over for 0.5 to 0.85 s, slowly and in lumps;
  - it catches on three to five unevenly spaced fires;
  - the revs run up, flare to 5,300 to 6,600 and settle to idle, hunting and rough at first;
  - then two or three blips of throttle to 7,000 to 9,800.
- **Its sound** (`EngineSound.renderStartup`) has no oscillator in it:
  - every firing is a pulse of its own, its strength and timing a little off the last, more so while the engine is rough;
  - the pulses ring through four exhaust resonances;
  - the gas rushes out as noise in step with the firings;
  - the starter motor's whirr and the turbo's breath are filtered noise.
- **Qualifying:** the player's own car is started while the field is timed. Once it has settled and the session is on, the running engine takes over as the car rolls out, in its gear.
- **A race:** when the grid is on screen, the player's car and six of the field's nearest it start one after another (`EngineSound.startPlan`: each later, quieter with distance, turning over a touch faster or slower) and blip before the lights. The running engine takes over when the start-up ends, or at lights out.
- **Not changed:** the start lights' beeps, which are the lights' own signal.

**Checks:**
- **Node:** the start-up's shape for eight seeds, its determinism, the plan, the jump into gear, and its spectral flatness (how noise-like it is) against the old oscillators' note: cranking and blips over five times it, the settle over four.
- **Browser** (`sound-check`): qualifying plays the player's start-up (cranking under 900 rpm, a flare, handed over only once settled) and rolls out in one gear. The grid plays the player's and at least four of the field's, staggered. The flatness is checked again in the page.
- **Proof against the old code:** the old code fails all four new results, rolling out through gears 1 to 6.
- **To listen:** `node tools/render-engine-start.js` writes `docs/review/2026-10-10/engine-start.wav` from the same code: a qualifying start, then a grid start from the back.
