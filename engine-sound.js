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
  // A change of speed this large in one step is a jump, not driving.
  const JUMP_RATIO = 0.2;

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
    let lastRatio = 0;
    return {
      // A car already at speed: in the gear it would be in, at its revs, the
      // turbo spooled to suit (a replay cutting to it).
      prime({ ratio = 0, throttle = 0 } = {}) {
        ratio = clamp(Number(ratio) || 0, 0, 1.25);
        gear = 1;
        while (gear < GEARS && rpmIn(ratio, gear) >= SHIFT_RPM * 0.995) gear += 1;
        rpm = clamp(rpmIn(ratio, gear), IDLE_RPM, LIMIT_RPM);
        lastRatio = ratio;
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
        // The speed jumping between two steps (rolled out at speed, a
        // rescue): straight into the gear for it, not up through them all.
        if (Math.abs(ratio - lastRatio) > JUMP_RATIO) {
          gear = 1;
          while (gear < GEARS && rpmIn(ratio, gear) >= SHIFT_RPM * 0.995) gear += 1;
          rpm = clamp(rpmIn(ratio, gear), IDLE_RPM, LIMIT_RPM);
          sinceShift = 0;
        }
        lastRatio = ratio;
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

  // ---- Starting up ----
  // A car's engine being started, as a timeline (seeded: every car's is a
  // little its own): the starter turns it over slowly; it catches on a few
  // uneven fires; the revs run up, flare over idle and settle to it, roughly
  // at first; then two or three blips of throttle. at(t) gives the moment:
  // { rpm, load (0..1), starter (0..1, the starter motor), rough (0..1, how
  //   unevenly it is firing) }.
  function startup(seed = 1) {
    const random = rng((seed >>> 0) * 2654435761 + 97);
    const between = (lo, hi) => lo + random() * (hi - lo);
    const crankRpm = between(260, 380);
    const catchAt = between(0.5, 0.85);
    const fires = [];
    let t = catchAt;
    const count = 3 + Math.floor(random() * 3);
    for (let i = 0; i < count; i += 1) {
      fires.push(t);
      // Uneven: a short gap, a long one, a stumble.
      t += i % 2 === 0 ? between(0.05, 0.085) : between(0.1, 0.16);
    }
    const runAt = t;
    const flare = between(5300, 6600);
    const riseS = between(0.22, 0.32);
    const settleS = between(0.55, 0.8);
    const blips = [];
    let b = runAt + riseS + settleS + between(0.25, 0.45);
    const blipCount = 2 + Math.floor(random() * 2);
    for (let i = 0; i < blipCount; i += 1) {
      const blip = { at: b, peak: between(7000, 9800), rise: between(0.1, 0.15), fall: between(0.3, 0.42) };
      blips.push(blip);
      b += blip.rise + blip.fall + between(0.12, 0.3);
    }
    const duration = b + 0.15;
    const smooth = (x) => { const c = clamp(x, 0, 1); return c * c * (3 - 2 * c); };
    function at(time) {
      if (time < catchAt) {
        // Cranking: lumpy, as each cylinder comes up on compression.
        return { rpm: crankRpm * (0.6 + 0.4 * smooth(time / 0.15)) * (1 + 0.12 * Math.sin(time * 41)), load: 0, starter: smooth(time / 0.06), rough: 1 };
      }
      if (time < runAt) {
        // Catching: each fire kicks the revs, which sag before the next.
        let rpm = crankRpm;
        let n = 0;
        fires.forEach((f) => { if (time >= f) { n += 1; rpm = crankRpm + n * 260; rpm -= (time - f) * 900; } });
        return { rpm: Math.max(crankRpm, rpm), load: 0.5, starter: clamp(1 - (time - catchAt) / (runAt - catchAt), 0, 1), rough: 1 };
      }
      const from = crankRpm + fires.length * 260;
      const since = time - runAt;
      let rpm;
      let load = 0.15;
      let rough;
      if (since < riseS) {
        rpm = from + (flare - from) * smooth(since / riseS);
        load = 0.8;
        rough = 0.8;
      } else {
        const k = (since - riseS) / settleS;
        // Down to idle with a hunt either side of it, dying away.
        rpm = IDLE_RPM + (flare - IDLE_RPM) * Math.exp(-k * 3.2) + 160 * Math.exp(-k * 1.4) * Math.sin(k * 9);
        rough = 0.12 + 0.6 * Math.exp(-k * 2.2);
      }
      blips.forEach((blip) => {
        const x = time - blip.at;
        if (x < 0 || x > blip.rise + blip.fall) return;
        const up = x < blip.rise ? smooth(x / blip.rise) : Math.pow(1 - (x - blip.rise) / blip.fall, 1.8);
        rpm = IDLE_RPM + (blip.peak - IDLE_RPM) * up;
        load = x <= blip.rise ? 1 : 0.1;
        rough = 0.15;
      });
      return { rpm, load, starter: 0, rough };
    }
    return { seed, catchAt, fires, runAt, flare, blips, duration, at };
  }

  // The start-up as sound: samples (-1..1) at `sampleRate`. A turbo V6's
  // voice is noise and uneven harmonics, not a clean note: every firing is
  // a pulse of its own (its strength and its timing a little off the last,
  // more so while the engine is rough), rung through the exhaust's
  // resonances, with the gas rushing out as noise in step with the
  // firings, and the starter motor's whirr and the turbo's breath as
  // filtered noise.
  function renderStartup(seed = 1, sampleRate = 24000) {
    const s = startup(seed);
    const random = rng((seed >>> 0) * 40503 + 5);
    const n = Math.ceil(s.duration * sampleRate);
    const out = new Float32Array(n);
    const dt = 1 / sampleRate;
    // Simple resonators (two-pole) and one-pole filters, by hand.
    const resonator = (freq, q) => {
      const w = (2 * Math.PI * freq) / sampleRate;
      const r = Math.exp(-w / (2 * q));
      const a1 = 2 * r * Math.cos(w);
      const a2 = -r * r;
      let y1 = 0;
      let y2 = 0;
      return (x) => { const y = x + a1 * y1 + a2 * y2; y2 = y1; y1 = y; return y * (1 - r); };
    };
    const lowpass = (freq) => {
      const a = 1 - Math.exp((-2 * Math.PI * freq) / sampleRate);
      let y = 0;
      return (x) => { y += a * (x - y); return y; };
    };
    const body = [resonator(95 + random() * 30, 1.6), resonator(210 + random() * 60, 1.8), resonator(460 + random() * 120, 1.5), resonator(980 + random() * 250, 1.2)];
    const bodyGain = [1, 0.8, 0.55, 0.3];
    const starterBand = [resonator(620 + random() * 160, 2.5), resonator(1500 + random() * 300, 2)];
    const air = lowpass(5000);
    const breath = lowpass(3200);
    const hiss = lowpass(900);
    const rumble = lowpass(140);
    let phase = 0;
    let pulse = 0;
    let strength = 1;
    let jitter = 1;
    let crankPhase = 0;
    for (let i = 0; i < n; i += 1) {
      const time = i * dt;
      const m = s.at(time);
      const noise = random() * 2 - 1;
      let x = 0;
      const running = time >= s.runAt;
      if (running) {
        // The firings: six a cycle of two turns, rpm / 20 a second.
        phase += (m.rpm / 20) * dt * jitter;
        if (phase >= 1) {
          phase -= 1;
          // Each firing its own: uneven while rough, a little always.
          strength = 1 + (random() - 0.5) * (0.45 + 1.2 * m.rough);
          jitter = 1 + (random() - 0.5) * (0.1 + 0.3 * m.rough);
          if (random() < m.rough * 0.12) strength *= 0.25;
          pulse = strength;
        }
        const drive = pulse * (0.55 + 0.45 * m.load);
        pulse *= Math.exp(-dt * (m.rpm / 20) * 5);
        // The gas: noise let out with each firing, more under load.
        const gas = noise * (0.3 + 0.7 * Math.min(1.5, pulse)) * (0.7 + 0.5 * m.load);
        let ring = 0;
        for (let k = 0; k < body.length; k += 1) ring += body[k](drive * 6 + gas * 3) * bodyGain[k];
        x = ring * 0.3 + breath(gas) * (2.2 + 0.8 * m.load) + hiss(noise) * 0.3;
        // The turbo's breath on a blip.
        x += breath(noise) * 0.12 * m.load * Math.min(1, m.rpm / 9000);
        x *= 0.24;
      } else {
        // The starter: its motor's whirr (noise through its two bands,
        // beating as each cylinder comes up on compression), and the
        // engine's own lumps as it is turned.
        crankPhase += (m.rpm / 20) * dt;
        const lump = 0.6 + 0.4 * Math.sin(crankPhase * 2 * Math.PI);
        const whirr = (starterBand[0](noise * 5) + starterBand[1](noise * 3) * 0.5) * m.starter * lump;
        x = whirr * 0.5 + air(noise) * 0.22 * m.starter * lump + rumble(noise) * 1.2 * lump * m.starter;
        // The fires as it catches: a thump each, rung through the exhaust.
        let kick = 0;
        for (let f = 0; f < s.fires.length; f += 1) {
          const since = time - s.fires[f];
          if (since >= 0 && since < 0.09) kick += Math.exp(-since * 45) * (0.7 + 0.5 * ((f * 37) % 5) / 5);
        }
        if (kick > 0) {
          let ring = 0;
          for (let k = 0; k < body.length; k += 1) ring += body[k](kick * 5 + noise * kick * 4) * bodyGain[k];
          x += ring * 0.9 + breath(noise) * kick * 0.5;
        } else {
          for (let k = 0; k < body.length; k += 1) body[k](0);
        }
      }
      // Fades at the ends, and a soft clip.
      const edge = Math.min(1, time / 0.02, (s.duration - time) / 0.08);
      out[i] = Math.tanh(x * 0.45) * 0.9 * Math.max(0, edge);
    }
    return out;
  }

  // Whose start-ups are heard at a start. Qualifying: your own car. A race:
  // yours, and up to six of the field's around you (the nearest first:
  // `field` is their seeds in that order), each a little after the last,
  // quieter with distance, and turning over a touch faster or slower.
  function startPlan(kind, ownSeed, field = []) {
    const plan = [{ seed: ownSeed, delay: 0, gain: 1, rate: 1, own: true }];
    if (kind !== "race") return plan;
    const random = rng((ownSeed >>> 0) + 4099);
    let delay = 0;
    field.slice(0, 6).forEach((seed, i) => {
      delay += 0.12 + random() * 0.14;
      const rate = 0.93 + random() * 0.14;
      plan.push({ seed, delay, gain: 0.5 / (1 + i * 0.45), rate: Math.abs(rate - 1) < 0.005 ? 1.02 : rate, own: false });
    });
    return plan;
  }

  // How noise-like a sound is, 0 (pure tones) to 1 (white noise): the
  // spectral flatness of its power spectrum from 60 Hz to 6 kHz, averaged
  // over windows.
  function spectralFlatness(samples, sampleRate) {
    const N = 2048;
    if (samples.length < N) return 0;
    const re = new Float64Array(N);
    const im = new Float64Array(N);
    let total = 0;
    let windows = 0;
    for (let start = 0; start + N <= samples.length; start += N) {
      for (let i = 0; i < N; i += 1) {
        re[i] = samples[start + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
        im[i] = 0;
      }
      // In-place radix-2 FFT.
      for (let i = 1, j = 0; i < N; i += 1) {
        let bit = N >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) { const tr = re[i]; re[i] = re[j]; re[j] = tr; const ti = im[i]; im[i] = im[j]; im[j] = ti; }
      }
      for (let len = 2; len <= N; len <<= 1) {
        const ang = (-2 * Math.PI) / len;
        for (let i = 0; i < N; i += len) {
          for (let k = 0; k < len / 2; k += 1) {
            const wr = Math.cos(ang * k);
            const wi = Math.sin(ang * k);
            const ur = re[i + k];
            const ui = im[i + k];
            const vr = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi;
            const vi = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr;
            re[i + k] = ur + vr; im[i + k] = ui + vi;
            re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
          }
        }
      }
      const lo = Math.max(1, Math.round((60 * N) / sampleRate));
      const hi = Math.min(N / 2 - 1, Math.round((6000 * N) / sampleRate));
      let logSum = 0;
      let sum = 0;
      for (let k = lo; k <= hi; k += 1) {
        const power = re[k] * re[k] + im[k] * im[k] + 1e-12;
        logSum += Math.log(power);
        sum += power;
      }
      const bins = hi - lo + 1;
      total += Math.exp(logSum / bins) / (sum / bins);
      windows += 1;
    }
    return total / windows;
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

  return { IDLE_RPM, SHIFT_RPM, LIMIT_RPM, GEARS, TOPS, SOUND_SPEED, createModel, startup, renderStartup, startPlan, spectralFlatness, doppler, distanceGain, replayMix };
}));
