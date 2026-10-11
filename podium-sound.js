// The podium's sound (docs/superpowers/specs/2026-10-11-podium-sound-design.md):
// the winner's national anthem, synthesized here from note lists
// (anthem-data.js; never a recording), and the celebration around it: the
// crowd, applause, the trophy's fanfare, the confetti cannons, a cork for each
// bottle and the fizz of the spray. Everything is rendered to samples by this
// file, the same in the game, in the tests and in the WAVs for listening
// (tools/render-podium-sound.js), and placed on the ceremony's timeline
// (ceremony.js) by cues(). Pure; window.PodiumSound in the page.
(function attach(root, factory) {
  const data = typeof module === "object" && module.exports ? require("./anthem-data.js") : root.AnthemData;
  const api = factory(data);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PodiumSound = api;
}(typeof globalThis !== "undefined" ? globalThis : this, (ANTHEMS) => {
  const RATE = 24000;

  // Each driver's racing nationality (game-data.js: country) to its anthem.
  const BY_COUNTRY = {};
  Object.entries(ANTHEMS).forEach(([key, a]) => { BY_COUNTRY[a.country] = key; });

  // The anthem a driver's win plays, or null: then the game's own fanfare
  // stands in (a country whose melody has no source free to use here).
  function anthemFor(driver) {
    return (driver && BY_COUNTRY[driver.country]) || null;
  }

  // The game's own processional, for a winner without an anthem here: an
  // original tune (not any nation's), in the anthems' own note format.
  const FANFARE = {
    title: "Podium fanfare", bpm: 96, beats: 16,
    melody: [[67, 0, 0.75], [67, 0.75, 0.25], [72, 1, 1], [76, 2, 1], [79, 3, 1.5], [76, 4.5, 0.5], [77, 5, 1], [74, 6, 1], [71, 7, 1],
      [72, 8, 0.75], [72, 8.75, 0.25], [76, 9, 1], [79, 10, 1], [84, 11, 1.5], [81, 12.5, 0.5], [79, 13, 0.75], [77, 13.75, 0.25], [74, 14, 0.5], [71, 14.5, 0.5], [72, 15, 1]],
    bass: [[48, 0, 2], [48, 2, 2], [41, 4, 2], [43, 6, 2], [48, 8, 2], [45, 10, 2], [41, 12, 1], [43, 13, 2], [48, 15, 1]],
  };
  // The trophy's sting: a short rising call, also the game's own.
  const STING = {
    title: "Trophy sting", bpm: 132, beats: 6,
    melody: [[67, 0, 0.34], [67, 0.34, 0.33], [67, 0.67, 0.33], [72, 1, 0.5], [76, 1.5, 0.5], [79, 2, 0.5], [76, 2.5, 0.5], [84, 3, 3]],
    bass: [[48, 0, 1], [48, 1, 2], [48, 3, 3]],
  };

  const piece = (key) => (key === "sting" ? STING : ANTHEMS[key] || FANFARE);
  const TAIL = 1.6;
  // How long a piece sounds: its notes, then the hall dying away.
  const seconds = (key) => (piece(key).beats * 60) / piece(key).bpm + TAIL;
  // How long the ceremony stands for it (ceremony.js: withAnthem).
  const anthemSeconds = (key) => (piece(key).beats * 60) / piece(key).bpm + 0.6;

  function seeded(seed) {
    let s = (seed >>> 0) || 1;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

  // One brass voice: a note's harmonics, brighter as it swells, a soft
  // attack, a little vibrato once it has settled, a short release.
  function voice(out, rate, notes, secondsPerBeat, { level, harmonics, attack, octave = 0, vibrato = 0.004 }) {
    notes.forEach(([midi, start, length]) => {
      const f = hz(midi + octave * 12);
      const from = Math.floor(start * secondsPerBeat * rate);
      const held = length * secondsPerBeat;
      const release = 0.09;
      const n = Math.floor((held + release) * rate);
      let phase = 0;
      for (let i = 0; i < n && from + i < out.length; i += 1) {
        const t = i / rate;
        const env = Math.min(1, t / attack) * (t > held ? Math.max(0, 1 - (t - held) / release) : 1) * (0.86 + 0.14 * Math.exp(-t * 3));
        const wobble = t > 0.18 ? vibrato * Math.min(1, (t - 0.18) * 4) * Math.sin(2 * Math.PI * 5.2 * t) : 0;
        phase += (2 * Math.PI * f * (1 + wobble)) / rate;
        let v = 0;
        for (let h = 1; h <= harmonics; h += 1) {
          if (f * h > rate * 0.45) break;
          // Brass: strong low harmonics, the upper ones opening with the swell.
          v += (Math.sin(phase * h) / h ** 1.15) * (h <= 2 ? 1 : Math.min(1, env * 1.2) ** (h * 0.35));
        }
        out[from + i] += v * env * level;
      }
    });
  }

  // A hall: four comb filters into two all-passes (Schroeder), mixed under
  // the dry sound.
  function hall(dry, rate, wet = 0.24) {
    const out = new Float32Array(dry.length);
    const combs = [0.0297, 0.0371, 0.0411, 0.0437].map((d) => ({ buf: new Float32Array(Math.floor(d * rate)), i: 0, low: 0 }));
    const passes = [0.005, 0.0017].map((d) => ({ buf: new Float32Array(Math.floor(d * rate)), i: 0 }));
    for (let n = 0; n < dry.length; n += 1) {
      let sum = 0;
      for (let c = 0; c < combs.length; c += 1) {
        const comb = combs[c];
        const y = comb.buf[comb.i];
        comb.low = y * 0.72 + comb.low * 0.28;
        comb.buf[comb.i] = dry[n] + comb.low * 0.83;
        comb.i = (comb.i + 1) % comb.buf.length;
        sum += y;
      }
      let v = sum * 0.25;
      for (let a = 0; a < passes.length; a += 1) {
        const pass = passes[a];
        const y = pass.buf[pass.i];
        const x = v + y * 0.5;
        pass.buf[pass.i] = x;
        pass.i = (pass.i + 1) % pass.buf.length;
        v = y - x * 0.5;
      }
      out[n] = dry[n] * (1 - wet) + v * wet;
    }
    return out;
  }

  function normalise(samples, peak = 0.9) {
    let max = 0;
    for (let i = 0; i < samples.length; i += 1) max = Math.max(max, Math.abs(samples[i]));
    if (max > 0) for (let i = 0; i < samples.length; i += 1) samples[i] *= peak / max;
    return samples;
  }

  // A piece played by a small brass band in a hall: the tune on trumpets, the
  // same an octave down on horns, the bass on a tuba. key: an anthem's
  // (anthem-data.js), "sting", or anything else for the fanfare.
  function renderPiece(key, rate = RATE) {
    const work = pieceSteps(key, rate);
    work.steps.forEach((step) => step());
    return work.result();
  }

  // The same in four steps (each instrument, then the hall), for the game to
  // spread over as many tasks: no frame waits on a whole anthem.
  function pieceSteps(key, rate = RATE) {
    const p = piece(key);
    const spb = 60 / p.bpm;
    const dry = new Float32Array(Math.ceil(seconds(key) * rate));
    // Tunes written high (above the staff) sit an octave lower on the trumpets.
    const top = p.melody.reduce((m, n) => Math.max(m, n[0]), 0);
    const shift = top > 86 ? -1 : 0;
    let out = null;
    const steps = [
      () => voice(dry, rate, p.melody, spb, { level: 0.5, harmonics: 9, attack: 0.045, octave: shift }),
      () => voice(dry, rate, p.melody, spb, { level: 0.3, harmonics: 5, attack: 0.07, octave: shift - 1, vibrato: 0.002 }),
      () => voice(dry, rate, p.bass, spb, { level: 0.42, harmonics: 6, attack: 0.05, vibrato: 0 }),
      () => { out = normalise(hall(dry, rate)); },
    ];
    return { steps, result: () => out };
  }

  // White noise through a band-pass (two one-pole filters), for the crowd and
  // the bottles.
  function band(rnd, low, high, rate) {
    const a = Math.exp((-2 * Math.PI * high) / rate);
    const b = Math.exp((-2 * Math.PI * low) / rate);
    let lp = 0;
    let hp = 0;
    return () => {
      const x = rnd() * 2 - 1;
      lp = x * (1 - a) + lp * a;
      hp = lp * (1 - b) + hp * b;
      return lp - hp;
    };
  }

  // A crowd's roar: voices as bands of noise, each swelling and falling on
  // its own, under an overall shape (level(t), 0 to 1).
  function renderCrowd(length, level, seed, rate = RATE) {
    const rnd = seeded(seed);
    const out = new Float32Array(Math.ceil(length * rate));
    const layers = [[260, 900], [600, 1900], [1100, 3200]].map(([lo, hi], k) => ({ next: band(rnd, lo, hi, rate), rate: 0.6 + k * 0.37 + rnd() * 0.3, phase: rnd() * 6.28, gain: [1, 0.8, 0.45][k] }));
    for (let i = 0; i < out.length; i += 1) {
      const t = i / rate;
      let v = 0;
      for (let k = 0; k < layers.length; k += 1) {
        const l = layers[k];
        v += l.next() * l.gain * (0.72 + 0.28 * Math.sin(t * l.rate * 6.28 + l.phase));
      }
      out[i] = v * level(t);
    }
    return normalise(out, 0.8);
  }

  // Applause: many hands, each clap a few milliseconds of bright noise, thick
  // at first and thinning out.
  function renderApplause(length, seed, rate = RATE) {
    const rnd = seeded(seed);
    const out = new Float32Array(Math.ceil(length * rate));
    const claps = Math.floor(length * 260);
    for (let c = 0; c < claps; c += 1) {
      // More claps early: the square of a uniform draw leans to the start.
      const at = Math.floor((rnd() ** 1.6) * (length - 0.05) * rate);
      const n = Math.floor((0.004 + rnd() * 0.006) * rate);
      const gain = 0.25 + rnd() * 0.75;
      const tone = band(rnd, 900 + rnd() * 900, 2600 + rnd() * 2400, rate);
      for (let i = 0; i < n && at + i < out.length; i += 1) out[at + i] += tone() * gain * (1 - i / n);
    }
    const fade = Math.floor(0.9 * rate);
    for (let i = 0; i < fade; i += 1) out[out.length - 1 - i] *= i / fade;
    return normalise(out, 0.8);
  }

  // A cork: the pop (a short thump whose pitch falls, as the neck empties)
  // and the first hiss of gas.
  function renderCork(seed, rate = RATE) {
    const rnd = seeded(seed);
    const out = new Float32Array(Math.ceil(0.32 * rate));
    const pitch = 780 + rnd() * 240;
    const hiss = band(rnd, 2500, 9000, rate);
    let phase = 0;
    for (let i = 0; i < out.length; i += 1) {
      const t = i / rate;
      phase += (2 * Math.PI * (pitch * Math.exp(-t * 22) + 140)) / rate;
      out[i] = Math.sin(phase) * Math.exp(-t * 38) + hiss() * 0.5 * Math.exp(-t * 16) * Math.min(1, t * 400);
    }
    return normalise(out, 0.9);
  }

  // The spray: fizz (high, bright noise, pulsing as the bottle is shaken)
  // dying away as it empties.
  function renderFizz(length, seed, rate = RATE) {
    const rnd = seeded(seed);
    const out = new Float32Array(Math.ceil(length * rate));
    const fizz = band(rnd, 3200, 10500, rate);
    const splash = band(rnd, 500, 2200, rate);
    const wobble = 6 + rnd() * 3;
    for (let i = 0; i < out.length; i += 1) {
      const t = i / rate;
      const shape = Math.min(1, t * 30) * Math.exp(-t * (2.2 / length)) * Math.min(1, (length - t) * 3);
      out[i] = (fizz() * (0.62 + 0.38 * Math.sin(t * wobble * 6.28)) + splash() * 0.3) * shape;
    }
    return normalise(out, 0.7);
  }

  // A confetti cannon: the thump of the charge and the rush of paper.
  function renderCannon(seed, rate = RATE) {
    const rnd = seeded(seed);
    const out = new Float32Array(Math.ceil(0.9 * rate));
    const rush = band(rnd, 700, 5200, rate);
    let phase = 0;
    for (let i = 0; i < out.length; i += 1) {
      const t = i / rate;
      phase += (2 * Math.PI * (48 + 110 * Math.exp(-t * 30))) / rate;
      out[i] = Math.sin(phase) * Math.exp(-t * 9) * 0.9 + rush() * Math.min(1, t * 200) * Math.exp(-t * 5.5) * 0.8;
    }
    return normalise(out, 0.9);
  }

  const bump = (t, at, rise, fall) => (t < at ? Math.exp(-(((at - t) / rise) ** 2)) : Math.exp(-(t - at) / fall));

  // Every sound the ceremony uses, by name, rendered once. winner: the
  // anthem's key (or null for the fanfare). The crowd's shapes follow the
  // ceremony's beats (a Ceremony.withAnthem() instance).
  function sounds(ceremony, winner, rate = RATE) {
    const B = ceremony.BEATS;
    return {
      anthem: () => renderPiece(winner || "fanfare", rate),
      sting: () => renderPiece("sting", rate),
      // The walk on: a murmur swelling, a cheer as each driver steps up.
      welcome: () => renderCrowd(B.anthem + 0.4, (t) => Math.min(1, 0.22 + 0.2 * (t / B.sweepEnd)
        + [3, 2, 1].reduce((s, place) => s + 0.5 * bump(t, B.arms[place] + 0.35, 0.3, 0.9), 0)) * Math.min(1, (B.anthem + 0.4 - t) / 0.9), 11, rate),
      applause: () => renderApplause(3.4, 23, rate),
      // The trophy: the roar going up with it.
      roar: () => renderCrowd(ceremony.BEATS.spray - B.trophy + 1.2, (t) => Math.min(1, 0.3 + 0.9 * bump(t, 1.1, 0.7, 2.6)) * Math.min(1, (B.spray - B.trophy + 1.2 - t) / 1.0), 37, rate),
      // The champagne: cheering that settles to a murmur and fades.
      cheer: () => renderCrowd(12, (t) => (0.35 + 0.65 * bump(t, 1.0, 0.6, 3.5)) * Math.min(1, (12 - t) / 4), 53, rate),
      cannon1: () => renderCannon(71, rate),
      cannon2: () => renderCannon(72, rate),
      cork1: () => renderCork(101, rate),
      cork2: () => renderCork(102, rate),
      cork3: () => renderCork(103, rate),
      fizz1: () => renderFizz(3.2, 201, rate),
      fizz2: () => renderFizz(2.9, 202, rate),
      fizz3: () => renderFizz(3.0, 203, rate),
    };
  }

  // When each sound starts (seconds into the ceremony) and how loud, in
  // order. tier: Low has no spray (quality.js), so no fizz; the corks still go.
  function cues(ceremony, { tier = "high" } = {}) {
    const B = ceremony.BEATS;
    const list = [
      { id: "welcome", sound: "welcome", at: 0, gain: 0.5 },
      { id: "anthem", sound: "anthem", at: B.anthem, gain: 0.9 },
      { id: "applause", sound: "applause", at: B.anthemEnd - 0.2, gain: 0.55 },
      { id: "roar", sound: "roar", at: B.trophy - 0.2, gain: 0.6 },
      { id: "sting", sound: "sting", at: B.trophy + ceremony.PROP_SWAP, gain: 0.7 },
      { id: "cannon1", sound: "cannon1", at: B.trophy + 0.02, gain: 0.75 },
      { id: "cannon2", sound: "cannon2", at: B.trophy + 0.2, gain: 0.6 },
      { id: "cheer", sound: "cheer", at: B.spray, gain: 0.55 },
    ];
    [1, 2, 3].forEach((place) => {
      list.push({ id: `cork${place}`, sound: `cork${place}`, at: ceremony.corkAt(place), gain: 0.8, place });
      if (ceremony.sprayOn(ceremony.corkAt(place) + 0.01, tier, place)) list.push({ id: `fizz${place}`, sound: `fizz${place}`, at: ceremony.corkAt(place) + 0.03, gain: 0.4, place });
    });
    return list.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  }

  // The whole ceremony mixed down (for the WAVs and the tests): every cue's
  // sound at its time and level.
  function mix(ceremony, winner, { tier = "high", rate = RATE, until = null } = {}) {
    const made = sounds(ceremony, winner, rate);
    const plan = cues(ceremony, { tier }).map((c) => ({ ...c, samples: made[c.sound]() }));
    const end = until ?? Math.max(...plan.map((c) => c.at + c.samples.length / rate));
    const out = new Float32Array(Math.ceil(end * rate));
    plan.forEach((c) => {
      const from = Math.round(c.at * rate);
      for (let i = 0; i < c.samples.length && from + i < out.length; i += 1) out[from + i] += c.samples[i] * c.gain;
    });
    return out;
  }

  return { RATE, ANTHEMS, FANFARE, STING, anthemFor, seconds, anthemSeconds, renderPiece, pieceSteps, renderCrowd, renderApplause, renderCork, renderFizz, renderCannon, sounds, cues, mix };
}));
