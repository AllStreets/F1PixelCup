// The engine's voice (docs/superpowers/specs/2026-10-05-sound-design.md).
// Pure: from a car's speed, throttle and brake, step by step, what a modern
// F1 power unit sounds like: the revs through eight gears, a little life in
// the note at full speed (the drivetrain's shimmer, the hybrid deploying and
// then clipping down a long straight), the turbo spooling, crackles and pops
// on lift-off and on downshifts, and the blip with each downshift. Also the
// Doppler shift and the fall-off with distance that a replay's cameras hear,
// and how a replay's speed is heard. In the page it defines
// window.EngineSound; in Node it is require()-able. The sound itself (Web
// Audio) is made in game.js from what this says.
(function attach(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.EngineSound = api;
}(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const IDLE_RPM = 4000;
  const SHIFT_RPM = 12000;
  const LIMIT_RPM = 12500;
  const GEARS = 8;
  // The share of the car's top speed at which each gear reaches SHIFT_RPM.
  const TOPS = [0.2, 0.31, 0.42, 0.53, 0.64, 0.75, 0.87, 1.02];
  // A downshift when the gear below would turn under this.
  const DOWN_RPM = 11000;
  // A shift takes this long; no other comes in it.
  const SHIFT_S = 0.15;
  // The hybrid's store: emptied by this many seconds flat out, filled by
  // this many of braking or lifting.
  const ERS_DEPLOY_S = 18;
  const ERS_HARVEST_S = 3;
  // Revs given up when the hybrid stops deploying (clipping).
  const CLIP_RPM = 120;
  // Lifting off above these revs crackles.
  const POP_RPM = 9000;

  function rng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const ease = (from, to, dt, tau) => from + (to - from) * (1 - Math.exp(-dt / tau));
  const rpmIn = (ratio, gear) => (ratio / TOPS[gear - 1]) * SHIFT_RPM;

  // One car's engine. step({ dt, ratio, throttle, brake }) (ratio: speed over
  // the car's top speed) returns the sound this step:
  // { rpm, gear, shift ("up", "down" or null), blip (0..1, the downshift's
  //   throttle blip), load (0..1), turbo (0..1), ers (0..1), whoosh (a lift's
  //   rush of air), pops: [{ delay (s), level (0..1) }] }.
  function createModel(seed = 1) {
    const random = rng(seed);
    let gear = 1;
    let rpm = IDLE_RPM;
    let sinceShift = SHIFT_S;
    let load = 0;
    let lastThrottle = 0;
    let turbo = 0;
    let ers = 0;
    let store = 1;
    let sag = 0;
    let wander = 0;
    let time = 0;
    let blip = 0;
    return {
      // A car already at speed: in the gear it would be in, at its revs, the
      // turbo spooled to suit (a replay cutting to it).
      prime({ ratio = 0, throttle = 0 } = {}) {
        ratio = clamp(Number(ratio) || 0, 0, 1.25);
        gear = 1;
        while (gear < GEARS && rpmIn(ratio, gear) >= SHIFT_RPM * 0.995) gear += 1;
        rpm = clamp(rpmIn(ratio, gear), IDLE_RPM, LIMIT_RPM);
        sinceShift = SHIFT_S;
        load = throttle;
        lastThrottle = throttle;
        turbo = throttle * Math.pow(rpm / LIMIT_RPM, 1.5);
      },
      step({ dt, ratio = 0, throttle = 0, brake = 0 }) {
        ratio = clamp(Number(ratio) || 0, 0, 1.25);
        throttle = clamp(Number(throttle) || 0, 0, 1);
        brake = clamp(Number(brake) || 0, 0, 1);
        time += dt;
        sinceShift += dt;
        let shift = null;
        const pops = [];
        if (sinceShift >= SHIFT_S) {
          if (gear < GEARS && rpmIn(ratio, gear) >= SHIFT_RPM * 0.995 && throttle > 0.3) {
            gear += 1;
            shift = "up";
          } else if (gear > 1 && rpmIn(ratio, gear - 1) < DOWN_RPM) {
            gear -= 1;
            shift = "down";
          }
          if (shift) sinceShift = 0;
        }
        // The hybrid: deploying flat out until its store is empty (then it
        // clips, and the note sags a little); harvesting under braking or
        // off the throttle.
        const deploying = throttle > 0.8 && ratio > 0.3 && store > 0;
        if (deploying) store = Math.max(0, store - dt / ERS_DEPLOY_S);
        else if (brake > 0 || throttle < 0.3) store = Math.min(1, store + dt / ERS_HARVEST_S);
        ers = ease(ers, deploying ? 1 : 0, dt, 0.4);
        const clipping = throttle > 0.8 && ratio > 0.3 && store <= 0;
        sag = ease(sag, clipping ? CLIP_RPM : 0, dt, 0.8);
        // Life in the note: a slow wander (the road, the wind, the car
        // working) and the drivetrain's shimmer, both a few tens of revs.
        wander = wander * Math.exp(-dt / 0.6) + (random() - 0.5) * 140 * dt;
        const shimmer = Math.sin(time * Math.PI * 2 * 3.1) * 22 + Math.sin(time * Math.PI * 2 * 0.37) * 30;
        const target = clamp(rpmIn(ratio, gear) + (wander + shimmer) * (0.4 + 0.6 * throttle) - sag, IDLE_RPM, LIMIT_RPM);
        // On a shift the revs go at once (the ignition is cut and the next
        // gear engaged in a few hundredths); otherwise they follow quickly.
        rpm = shift ? target : ease(rpm, target, dt, 0.05);
        load = ease(load, throttle, dt, 0.06);
        turbo = ease(turbo, throttle * Math.pow(rpm / LIMIT_RPM, 1.5), dt, 0.35);
        // The downshift's blip: a stab of throttle to match the revs.
        blip = shift === "down" ? 1 : Math.max(0, blip - dt / 0.12);
        // Off the throttle from high revs: the exhaust crackles and pops for
        // a moment, with a rush of air from the turbo; a downshift off the
        // throttle adds a pop or two.
        const lifted = lastThrottle > 0.7 && throttle < 0.3 && rpm > POP_RPM;
        if (lifted) {
          const count = 3 + Math.floor(random() * 5);
          for (let i = 0; i < count; i += 1) pops.push({ delay: random() * 0.7, level: 0.35 + random() * 0.5 });
        }
        if (shift === "down" && throttle < 0.3) {
          const count = 1 + Math.floor(random() * 2);
          for (let i = 0; i < count; i += 1) pops.push({ delay: 0.03 + random() * 0.18, level: 0.25 + random() * 0.4 });
        }
        pops.sort((a, b) => a.delay - b.delay);
        lastThrottle = throttle;
        return { rpm, gear, shift, blip, load, turbo, ers, whoosh: lifted, pops };
      },
    };
  }

  // The speed of sound in the game's units (1 unit is about 0.168 m).
  const SOUND_SPEED = 2042;
  // A sound's pitch heard from a listener it moves away from at `away`
  // units/s (negative: coming closer), within sane bounds.
  function doppler(away) {
    return clamp(SOUND_SPEED / (SOUND_SPEED + (Number(away) || 0)), 0.6, 1.5);
  }

  // How loud a sound is at `distance` from the camera (1 close by).
  function distanceGain(distance) {
    return 1 / (1 + Math.pow(Math.max(0, distance) / 150, 1.3));
  }

  // A replay at `speed`, playing or not: how the engines and one-off sounds
  // are heard. Real time as it is; half and double speed pitched gently (a
  // tape's full shift is a chipmunk or a growl); a quarter and four times
  // only the venue, quieter; paused, silence.
  function replayMix(speed, playing) {
    if (!playing) return { engine: 0, pitch: 1, events: false, ambience: 0 };
    if (speed === 1) return { engine: 1, pitch: 1, events: true, ambience: 1 };
    if (speed >= 0.5 && speed <= 2) return { engine: 0.8, pitch: Math.pow(speed, 0.35), events: true, ambience: 1 };
    return { engine: 0, pitch: 1, events: false, ambience: 0.5 };
  }

  return { IDLE_RPM, SHIFT_RPM, LIMIT_RPM, GEARS, TOPS, SOUND_SPEED, createModel, doppler, distanceGain, replayMix };
}));
