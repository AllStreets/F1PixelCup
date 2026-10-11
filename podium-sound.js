// The podium's sound (docs/superpowers/specs/2026-10-11-podium-sound-design.md):
// the winner's national anthem, synthesized here from note lists
// (anthem-data.js; never a recording), and the celebration around it: the
// crowd, applause, the trophy's fanfare, the confetti cannons, a cork for each
// bottle and the fizz of the spray. Everything is rendered to samples by this
// file, the same in the game, in the tests and in the WAVs for listening
// (tools/render-podium-sound.js), and placed on the ceremony's timeline
// (ceremony.js) by cues(). Pure; window.PodiumSound in the page.
(function attach(root, factory) {
  const node = typeof module === "object" && module.exports;
  const api = factory(node ? require("./anthem-data.js") : root.AnthemData, node ? require("./crowd-sound.js") : root.CrowdSound);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PodiumSound = api;
}(typeof globalThis !== "undefined" ? globalThis : this, (ANTHEMS, Crowd) => {
  const RATE = 24000;

  // Each driver's racing nationality (game-data.js: country) to its anthem.
  const BY_COUNTRY = new Map(Object.entries(ANTHEMS).map(([key, a]) => [a.country, key]));
  const has = (key) => typeof key === "string" && Object.prototype.hasOwnProperty.call(ANTHEMS, key);

  // The anthem a driver's win plays, or null: then the game's own fanfare
  // stands in (a country whose melody has no source free to use here).
  function anthemFor(driver) {
    return (driver && BY_COUNTRY.get(driver.country)) || null;
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

  // The presentation's processional: stately, the game's own, played as the
  // trophies are brought to the drivers.
  // Four phrases of eight beats, then its last note (processional(): held
  // as the winner's trophy is raised to them). bpm here is its own tempo.
  const PROCESSION = {
    title: "Trophy processional", bpm: 108, beats: 32,
    melody: [[67, 0, 1.5], [72, 1.5, 0.5], [76, 2, 1], [79, 3, 1], [81, 4, 1.5], [79, 5.5, 0.5], [76, 6, 1], [72, 7, 1],
      [77, 8, 1.5], [76, 9.5, 0.5], [74, 10, 1], [71, 11, 1], [72, 12, 1], [74, 13, 1], [76, 14, 2],
      [79, 16, 1.5], [81, 17.5, 0.5], [83, 18, 1], [81, 19, 1], [79, 20, 1.5], [77, 21.5, 0.5], [76, 22, 1], [74, 23, 1],
      [72, 24, 1.5], [74, 25.5, 0.5], [76, 26, 1], [77, 27, 1], [79, 28, 1], [77, 29, 1], [74, 30, 1], [71, 31, 1]],
    bass: [[48, 0, 2], [52, 2, 2], [53, 4, 2], [48, 6, 2], [50, 8, 2], [43, 10, 2], [48, 12, 2], [45, 14, 2],
      [52, 16, 2], [53, 18, 2], [53, 20, 2], [48, 22, 2], [45, 24, 2], [53, 26, 2], [48, 28, 1], [43, 29, 3]],
    last: [72, 48],
  };
  // The processional for a ceremony, in time with it: it starts with the
  // presentation, its four phrases bring the presenter to the winner, its
  // last note sounds as the winner's trophy is raised to them, and it has
  // died away as they take it (the sting and the roar are that moment's).
  const PROCESSION_TAIL = 0.38;
  function processional(ceremony) {
    const B = ceremony.BEATS;
    const raise = ceremony.HANDOVERS.find((h) => h.place === 1).raise;
    const bpm = (PROCESSION.beats * 60) / (raise - B.present);
    const held = ((B.trophy - PROCESSION_TAIL - raise) * bpm) / 60;
    return {
      title: PROCESSION.title, bpm, beats: PROCESSION.beats + held, tail: PROCESSION_TAIL,
      melody: [...PROCESSION.melody, [PROCESSION.last[0], PROCESSION.beats, held]],
      bass: [...PROCESSION.bass, [PROCESSION.last[1], PROCESSION.beats, held]],
    };
  }

  // key: an anthem's, "sting", a piece itself (the processional), or anything else for the fanfare.
  const piece = (key) => (key && typeof key === "object" ? key : key === "sting" ? STING : has(key) ? ANTHEMS[key] : FANFARE);
  // The hall has died away this long after a piece's last note (s).
  const TAIL = 1.1;
  // How long a piece sounds: its notes, then the hall dying away.
  const seconds = (key) => (piece(key).beats * 60) / piece(key).bpm + (piece(key).tail ?? TAIL);
  // How long the ceremony stands for it (ceremony.js: withAnthem).
  const anthemSeconds = (key) => seconds(key);

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
  // Each note is tongued: it stops a moment before the next begins, so the
  // same note twice is heard as two.
  const TONGUE = 0.045;
  function voice(out, rate, notes, secondsPerBeat, { level, harmonics, attack, octave = 0, vibrato = 0.004 }) {
    notes.forEach(([midi, start, length]) => {
      const f = hz(midi + octave * 12);
      const from = Math.floor(start * secondsPerBeat * rate);
      const release = 0.04;
      const held = Math.max(attack, length * secondsPerBeat - TONGUE - release);
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
  // (anthem-data.js), "sting", a piece itself, or anything else for the fanfare.
  function renderPiece(key, rate = RATE) {
    const work = pieceSteps(key, rate);
    work.steps.forEach((step) => step());
    return work.result();
  }

  // The same in small steps (a few notes of one instrument at a time, then
  // the hall), for the game to spread over as many tasks: no frame waits on
  // more than a few notes.
  const NOTES_A_STEP = 2;
  function pieceSteps(key, rate = RATE) {
    const p = piece(key);
    const spb = 60 / p.bpm;
    const dry = new Float32Array(Math.ceil(seconds(key) * rate));
    // A tune written above the trumpets' comfortable top (the C two octaves
    // over middle C) sits an octave lower; a bass under the tuba's reach, an
    // octave higher.
    const top = p.melody.reduce((m, n) => Math.max(m, n[0]), 0);
    const shift = top >= 84 ? -1 : 0;
    const lift = p.bass.reduce((m, n) => Math.min(m, n[0]), 127) < 36 ? 1 : 0;
    const parts = [
      [p.melody, { level: 0.5, harmonics: 9, attack: 0.045, octave: shift }],
      [p.melody, { level: 0.3, harmonics: 5, attack: 0.07, octave: shift - 1, vibrato: 0.002 }],
      [p.bass, { level: 0.42, harmonics: 6, attack: 0.05, octave: lift, vibrato: 0 }],
    ];
    let out = null;
    const steps = [];
    parts.forEach(([notes, how]) => {
      for (let i = 0; i < notes.length; i += NOTES_A_STEP) steps.push(() => voice(dry, rate, notes.slice(i, i + NOTES_A_STEP), spb, how));
    });
    steps.push(() => {
      out = normalise(hall(dry, rate));
      // (The last of the hall, faded to nothing: no piece ends on a click.)
      const fade = Math.floor(Math.min(0.25, p.tail ?? TAIL) * rate);
      for (let i = 0; i < fade; i += 1) out[out.length - 1 - i] *= i / fade;
    });
    return { steps, result: () => out, octaves: { melody: shift, bass: lift } };
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

  // A cork: a hollow "thoonk". A click (the cork letting go) rings the neck
  // of the bottle, one damped resonance that falls from about 900 Hz to 400
  // as the neck opens; a puff of gas right behind it; a soft thump under it;
  // dry at the front, then a touch of the hall. Each bottle its own pitch.
  const CORK_SECONDS = 0.22;
  function renderCork(seed, rate = RATE) {
    const rnd = seeded(seed);
    const dry = new Float32Array(Math.ceil(CORK_SECONDS * rate));
    const from = 840 + rnd() * 160;
    const to = 380 + rnd() * 70;
    const fall = 0.034 + rnd() * 0.014;
    const ring = 0.046 + rnd() * 0.01;
    const gasAt = 0.004 + rnd() * 0.003;
    const gas = band(rnd, 2000, 6000, rate);
    let phase = 0;
    for (let i = 0; i < dry.length; i += 1) {
      const t = i / rate;
      phase += (2 * Math.PI * (to + (from - to) * Math.exp(-t / fall))) / rate;
      // (A cosine: the resonance starts at its full swing, as a struck cavity does.)
      const neck = Math.cos(phase) * Math.exp(-t / ring);
      const click = t < 0.002 ? (rnd() * 2 - 1) * (1 - t / 0.002) : 0;
      const g = gas();
      const puff = t > gasAt ? g * Math.min(1, (t - gasAt) / 0.003) * Math.exp(-(t - gasAt) / 0.013) : 0;
      const thump = Math.sin(2 * Math.PI * 95 * t) * Math.exp(-t / 0.03);
      dry[i] = neck + click * 0.7 + puff * 0.8 + thump * 0.3;
    }
    // Faded to nothing over its last 30 ms.
    const out = hall(dry, rate, 0.12);
    const tail = Math.floor(0.03 * rate);
    for (let i = 0; i < tail; i += 1) out[out.length - 1 - i] *= i / tail;
    return normalise(out, 0.9);
  }

  // The spray: effervescence. Thousands of tiny bubble ticks (two-sample
  // clicks, so all high: 4 kHz and up), thick when the bottle is shaken and
  // thinning as it empties; a narrow hissing jet under them, fluttering fast
  // with the shake; and the splatter of drops landing (sparse, lower ticks).
  // It starts hard, with the pop.
  function renderFizz(length, seed, rate = RATE) {
    const rnd = seeded(seed);
    const n = Math.ceil(length * rate);
    const out = new Float32Array(n);
    // The shake (the spray pose pumps the bottle a little over once a second)
    // and how full the bottle still is.
    const shakeRate = 1.1 + rnd() * 0.25;
    const shakePhase = rnd() * 6.28;
    const full = (t) => Math.exp(-t * (2.6 / length)) * Math.min(1, (length - t) * 4);
    const shake = (t) => 0.55 + 0.45 * Math.max(0, Math.sin(t * shakeRate * 6.28 + shakePhase)) ** 2;
    // The jet: 3 to 8 kHz, fluttering at 20 to 40 Hz.
    const jet = band(rnd, 3000, 8000, rate);
    const flutter = 22 + rnd() * 14;
    for (let i = 0; i < n; i += 1) {
      const t = i / rate;
      out[i] = jet() * 0.5 * full(t) * shake(t) * (0.55 + 0.45 * Math.sin(t * flutter * 6.28 + 3 * Math.sin(t * 5.1)));
    }
    // The bubbles: at up to a few thousand a second. Each a click of two
    // samples, up then down (no low end at all), most of them tiny and a few big.
    let t = 0;
    for (;;) {
      const level = full(t) * shake(t);
      t += -Math.log(1 - rnd() * 0.999) / (300 + 3600 * level);
      const i = Math.floor(t * rate);
      if (i + 2 >= n) break;
      const a = (0.25 + 2.6 * rnd() ** 4) * (0.35 + 0.65 * level) * (rnd() < 0.5 ? 1 : -1);
      out[i] += a;
      out[i + 1] -= a * (0.7 + rnd() * 0.3);
      if (rnd() < 0.3) out[i + 2] += a * 0.3;
    }
    // The drops landing: a few dozen a second, each a short ring between 800 Hz and 3 kHz.
    t = 0.08;
    for (;;) {
      const level = full(Math.max(0, t - 0.25));
      t += -Math.log(1 - rnd() * 0.999) / (6 + 45 * level);
      const start = Math.floor(t * rate);
      if (start >= n) break;
      const f = 800 + rnd() * 2200;
      const a = (0.2 + rnd() * 0.5) * (0.4 + 0.6 * level);
      const len = Math.floor(0.008 * rate);
      for (let k = 0; k < len && start + k < n; k += 1) out[start + k] += Math.sin((2 * Math.PI * f * k) / rate) * Math.exp(-k / (0.0018 * rate)) * a;
    }
    return normalise(out, 0.85);
  }

  // A trophy lifted: a soft ring of struck metal, a bell's uneven partials
  // dying over a second; lower for the bigger trophy.
  const RING_PITCH = { 3: 1320, 2: 988, 1: 740 };
  const RING_SECONDS = 1.3;
  function renderRing(place, rate = RATE) {
    const rnd = seeded(300 + place);
    const out = new Float32Array(Math.ceil(RING_SECONDS * rate));
    const f0 = RING_PITCH[place] || RING_PITCH[1];
    const partials = [[1, 1, 3.2], [2.76, 0.5, 4.5], [5.4, 0.25, 7], [8.93, 0.12, 10]].filter(([k]) => f0 * k < rate * 0.45);
    for (let i = 0; i < out.length; i += 1) {
      const t = i / rate;
      let v = 0;
      partials.forEach(([k, amp, decay]) => { v += Math.sin(2 * Math.PI * f0 * k * t) * amp * Math.exp(-t * decay); });
      // (The touch that sets it off: a few milliseconds of click.)
      const tick = t < 0.004 ? (rnd() * 2 - 1) * (1 - t / 0.004) * 0.6 : 0;
      out[i] = (v + tick) * Math.min(1, t * 2000) * Math.min(1, (RING_SECONDS - t) / 0.2);
    }
    return normalise(out, 0.8);
  }

  // A confetti cannon: the thump of the charge and the rush of paper.
  const CANNON_SECONDS = 0.9;
  function renderCannon(seed, rate = RATE) {
    const rnd = seeded(seed);
    const out = new Float32Array(Math.ceil(CANNON_SECONDS * rate));
    const rush = band(rnd, 700, 5200, rate);
    let phase = 0;
    for (let i = 0; i < out.length; i += 1) {
      const t = i / rate;
      phase += (2 * Math.PI * (48 + 110 * Math.exp(-t * 30))) / rate;
      out[i] = Math.sin(phase) * Math.exp(-t * 9) * 0.9 + rush() * Math.min(1, t * 200) * Math.exp(-t * 5.5) * 0.8;
    }
    return normalise(out, 0.9);
  }

  const MURMUR_SECONDS = 9;
  const bump = (t, at, rise, fall) => (t < at ? Math.exp(-(((at - t) / rise) ** 2)) : Math.exp(-(t - at) / fall));

  // Every sound the ceremony uses, by name: each a piece of work in steps
  // ({ steps, result }), so the game can spread it over tasks; run() does one
  // at once. winner: the anthem's key (or null for the fanfare). The crowd
  // (crowd-sound.js: voices, not noise) follows the ceremony's beats (a
  // Ceremony.withAnthem() instance).
  const once = (make) => { let out = null; return { steps: [() => { out = make(); }], result: () => out }; };
  // How long each sound runs (s), from the ceremony's beats: the same
  // numbers sounds() renders to and cues() says.
  function lengths(ceremony, winner) {
    const B = ceremony.BEATS;
    return {
      welcome: B.anthem,
      anthem: seconds(winner || "fanfare"),
      procession: seconds(processional(ceremony)),
      ovation: B.trophy - B.present,
      ring1: RING_SECONDS, ring2: RING_SECONDS, ring3: RING_SECONDS,
      sting: seconds("sting"),
      // (From a moment before the winner takes it, to the champagne.)
      roar: B.spray - B.trophy + 0.2,
      cannon1: CANNON_SECONDS, cannon2: CANNON_SECONDS,
      cheer: 12, murmur: MURMUR_SECONDS,
      cork1: CORK_SECONDS, cork2: CORK_SECONDS, cork3: CORK_SECONDS,
      fizz1: 4.2, fizz2: 3.8, fizz3: 4.0,
    };
  }

  function sounds(ceremony, winner, rate = RATE) {
    const B = ceremony.BEATS;
    const L = lengths(ceremony, winner);
    const crowd = (length, level, seed, options) => Crowd.crowdSteps(length, level, seed, { rate, ...options });
    const out = (length, t) => Math.min(1, (length - t) / 0.9);
    return {
      anthem: () => pieceSteps(winner || "fanfare", rate),
      procession: () => pieceSteps(processional(ceremony), rate),
      sting: () => pieceSteps("sting", rate),
      // The walk on: a murmur swelling, a cheer as each driver steps up;
      // quiet by the anthem's first note.
      welcome: () => crowd(L.welcome, (t) => Math.min(1.1, 0.25 + 0.2 * (t / B.sweepEnd)
        + [3, 2, 1].reduce((sum, place) => sum + 0.6 * bump(t, B.arms[place] + 0.35, 0.25, 0.9), 0)) * out(L.welcome, t), 11, { voices: 32, whistles: 3, claps: 14 }),
      // The presentation: applause as the first trophy is taken up, swelling
      // at each handover (more for second than third), hushed again between,
      // rising as the winner's is raised to them and held until they have
      // it (the roar is that moment's, and takes over).
      ovation: () => crowd(L.ovation, (t) => Math.min(1.1, 0.3 + 0.3 * bump(t, 0.9, 0.5, 1.2)
        + ceremony.HANDOVERS.reduce((sum, h) => sum + (h.place === 1 ? 0.6 * Math.min(1, Math.exp(-(((h.release - B.present - t) / 0.9) ** 2)))
          : (h.place === 2 ? 0.75 : 0.6) * bump(t, h.release - B.present + 0.3, 0.3, 1.1)), 0)) * Math.min(1, (L.ovation - t) / 0.25), 23,
      { voices: 32, claps: 40, whistles: 3, hubbubGain: 0.3 }),
      ring1: () => once(() => renderRing(1, rate)),
      ring2: () => once(() => renderRing(2, rate)),
      ring3: () => once(() => renderRing(3, rate)),
      // The winner's trophy: the roar going up with it, fast, and held
      // through the lift; over as the champagne begins.
      roar: () => crowd(L.roar, (t) => Math.min(1.2, 0.3 + 1.0 * bump(t, 0.6, 0.35, 4.5)) * Math.min(1, (L.roar - t) / 0.5), 37, { voices: 44, whistles: 5, horns: 2, claps: 10 }),
      // The champagne: cheering that settles and fades.
      cheer: () => crowd(L.cheer, (t) => (0.35 + 0.75 * bump(t, 1.0, 0.5, 3.5)) * Math.min(1, (L.cheer - t) / 4), 53, { voices: 40, whistles: 5, horns: 1, claps: 12 }),
      // And for as long as the podium stays up: the crowd talking, looped.
      murmur: () => crowd(L.murmur, () => 0.35, 67, { voices: 24, loop: true }),
      cannon1: () => once(() => renderCannon(71, rate)),
      cannon2: () => once(() => renderCannon(72, rate)),
      cork1: () => once(() => renderCork(101, rate)),
      cork2: () => once(() => renderCork(102, rate)),
      cork3: () => once(() => renderCork(103, rate)),
      fizz1: () => once(() => renderFizz(L.fizz1, 201, rate)),
      fizz2: () => once(() => renderFizz(L.fizz2, 202, rate)),
      fizz3: () => once(() => renderFizz(L.fizz3, 203, rate)),
    };
  }
  const run = (work) => { work.steps.forEach((step) => step()); return work.result(); };

  // When each sound starts (seconds into the ceremony), how long it runs,
  // how loud, and which scene it belongs to (it ends before the next scene
  // begins), in order. tier: Low has no spray (quality.js), so no fizz; the
  // corks still go. spray: false where no spray is drawn at all (reduced
  // motion). winner: whose anthem (for its length). A cue with loop plays
  // round and round from its start, faded in over fadeIn s.
  function cues(ceremony, { tier = "high", spray = true, winner = null } = {}) {
    const B = ceremony.BEATS;
    const L = lengths(ceremony, winner);
    const list = [
      { id: "welcome", at: 0, gain: 0.5 },
      { id: "anthem", at: B.anthem, gain: 0.9 },
      { id: "ovation", at: B.present, gain: 0.42 },
      { id: "procession", at: B.present, gain: 0.6 },
      { id: "roar", at: B.trophy - 0.2, gain: 0.38 },
      { id: "sting", at: B.trophy + ceremony.PROP_SWAP, gain: 0.5 },
      { id: "cannon1", at: B.trophy + 0.02, gain: 0.42 },
      { id: "cannon2", at: B.trophy + 0.2, gain: 0.34 },
      { id: "cheer", at: B.spray, gain: 0.4 },
      { id: "murmur", at: B.spray + 7, gain: 0.14, loop: true, fadeIn: 4 },
    ];
    // A ring as each trophy is lifted.
    ceremony.HANDOVERS.forEach((h) => list.push({ id: `ring${h.place}`, at: h.release + 0.3, gain: 0.3, place: h.place }));
    [1, 2, 3].forEach((place) => {
      list.push({ id: `cork${place}`, at: ceremony.corkAt(place), gain: 0.8, place });
      if (spray && ceremony.sprayOn(ceremony.corkAt(place) + 0.01, tier, place)) list.push({ id: `fizz${place}`, at: ceremony.corkAt(place) + 0.012, gain: 0.46, place });
    });
    list.forEach((c) => { c.sound = c.id; c.seconds = L[c.id]; c.scene = ceremony.sceneAt(c.at); });
    return list.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  }

  // The whole ceremony mixed down (for the WAVs and the tests): every cue's
  // sound at its time and level (a looped one once round, faded in and out).
  // without: a cue's id to leave out.
  function mix(ceremony, winner, { tier = "high", spray = true, rate = RATE, until = null, without = null } = {}) {
    const made = sounds(ceremony, winner, rate);
    const plan = cues(ceremony, { tier, spray, winner }).filter((c) => c.id !== without).map((c) => ({ ...c, samples: run(made[c.sound]()) }));
    const end = until ?? Math.max(...plan.map((c) => c.at + c.samples.length / rate));
    const out = new Float32Array(Math.ceil(end * rate));
    plan.forEach((c) => {
      const from = Math.round(c.at * rate);
      const n = c.samples.length;
      for (let i = 0; i < n && from + i < out.length; i += 1) {
        const fade = c.loop ? Math.min(1, i / (c.fadeIn * rate), (n - i) / (2 * rate)) : 1;
        out[from + i] += c.samples[i] * c.gain * fade;
      }
    });
    return out;
  }

  // ---- Measures, for the tests that keep the champagne a pop and a fizz ----

  // A pop: when its loudest moment comes (s), how long until 95% of its
  // energy is out (s), and the pitch of its ring (Hz, by zero crossings of
  // the sound smoothed to under about 1.5 kHz) early and late.
  function popShape(samples, rate) {
    let peak = 0;
    let peakAt = 0;
    let total = 0;
    for (let i = 0; i < samples.length; i += 1) {
      if (Math.abs(samples[i]) > peak) { peak = Math.abs(samples[i]); peakAt = i; }
      total += samples[i] * samples[i];
    }
    let sum = 0;
    let done = 0;
    for (let i = 0; i < samples.length && sum < total * 0.95; i += 1) { sum += samples[i] * samples[i]; done = i; }
    const k = Math.exp((-2 * Math.PI * 1500) / rate);
    const smooth = new Float32Array(samples.length);
    let y1 = 0;
    let y2 = 0;
    for (let i = 0; i < samples.length; i += 1) { y1 = samples[i] * (1 - k) + y1 * k; y2 = y1 * (1 - k) + y2 * k; smooth[i] = y2; }
    const pitch = (from, to) => {
      let crossings = 0;
      const a = Math.floor(from * rate);
      const b = Math.floor(to * rate);
      for (let i = a + 1; i < b; i += 1) if ((smooth[i] >= 0) !== (smooth[i - 1] >= 0)) crossings += 1;
      return crossings / (to - from) / 2;
    };
    // The share of the energy above 2 kHz (the gas) in a stretch.
    const bright = (from, to) => {
      const h = Math.exp((-2 * Math.PI * 2000) / rate);
      let lp = 0;
      let hi = 0;
      let all = 0;
      for (let i = Math.floor(from * rate); i < Math.floor(to * rate); i += 1) {
        lp = samples[i] * (1 - h) + lp * h;
        hi += (samples[i] - lp) ** 2;
        all += samples[i] * samples[i];
      }
      return hi / Math.max(1e-12, all);
    };
    return { attack: peakAt / rate, done: done / rate, length: samples.length / rate, early: pitch(0.004, 0.024), late: pitch(0.06, 0.1), gasEarly: bright(0.004, 0.03), gasLate: bright(0.08, 0.14) };
  }

  // Crackle: the middle value of peak over RMS in each 10 ms of the sound
  // (about 3 for a steady hiss; higher the more it is made of separate ticks).
  function crackle(samples, rate, from = 0.2, to = 2) {
    const hop = Math.floor(rate / 100);
    const crests = [];
    for (let i = Math.floor(from * rate); i + hop <= Math.min(samples.length, to * rate); i += hop) {
      let peak = 0;
      let sum = 0;
      for (let j = 0; j < hop; j += 1) { peak = Math.max(peak, Math.abs(samples[i + j])); sum += samples[i + j] * samples[i + j]; }
      crests.push(peak / Math.sqrt(sum / hop + 1e-20));
    }
    crests.sort((a, b) => a - b);
    return crests[Math.floor(crests.length / 2)];
  }

  return { popShape, crackle, RATE, ANTHEMS, FANFARE, STING, PROCESSION, processional, TAIL, lengths, renderRing, anthemFor, seconds, anthemSeconds, renderPiece, pieceSteps, run, renderCork, renderFizz, renderCannon, sounds, cues, mix };
}));
