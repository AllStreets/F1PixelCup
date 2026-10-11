// A crowd that sounds like people (docs/superpowers/specs/2026-10-12-crowd-sound-design.md):
// the podium's roar, cheering, applause and murmur (podium-sound.js) and the
// grandstands' crowd in a race (game.js). Shaped noise reads as water, so a
// crowd here is made of voices: each one a pulse train at a speaking or
// shouting pitch through a vowel's formants, shouting in syllables of its
// own, wandering in pitch; a few of them near and loud; a low hubbub under
// them; whistles, a horn or two and hand claps on top; a hall round it all.
// Nothing above about 5 kHz, where hiss and spray live. Rendered to samples
// by this file, the same in the game, the tests and the WAVs. Pure;
// window.CrowdSound in the page.
(function attach(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CrowdSound = api;
}(typeof globalThis !== "undefined" ? globalThis : this, () => {
  function seeded(seed) {
    let s = (seed >>> 0) || 1;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // The vowels a crowd shouts, as three formants each (Hz) with their levels:
  // "aah", "ooh", "yeah" (eh), "oh", "ay".
  const VOWELS = [
    [[730, 1], [1090, 0.9], [2440, 0.55]],
    [[400, 1], [850, 0.7], [2300, 0.35]],
    [[560, 1], [1780, 0.8], [2500, 0.55]],
    [[520, 1], [920, 0.8], [2450, 0.4]],
    [[470, 1], [2050, 0.7], [2650, 0.5]],
  ];

  const TILT = 0.8;
  // A two-pole resonator (a formant) as its coefficients: y = x*g + a1*y1 + a2*y2.
  function resonator(freq, bandwidth, rate) {
    const r = Math.exp((-Math.PI * bandwidth) / rate);
    const a1 = 2 * r * Math.cos((2 * Math.PI * freq) / rate);
    return { a1, a2: -r * r, g: 1 - r };
  }

  // One voice into out (at the crowd's own rate): shouts of 0.25 to 1.4 s with
  // breaths between, each on a vowel, the pitch rising into the shout and
  // sagging out of it, with a slow wander and a little roughness. level(t)
  // is the crowd's excitement: it sets how loud and how often the voice shouts.
  function voice(out, rate, rnd, level, { gain, female, eager }) {
    const base = female ? 210 + rnd() * 170 : 105 + rnd() * 95;
    const stretch = female ? 1.16 : 1;
    const wander = 0.35 + rnd() * 0.5;
    const phase0 = rnd() * 6.28;
    let phase = rnd();
    let at = Math.floor(rnd() * 0.35 * rate);
    const n = out.length;
    while (at < n) {
      const t0 = at / rate;
      const mood = Math.max(0, Math.min(1.4, level(t0)));
      // Quiet crowds leave longer gaps; an eager voice shouts more.
      const gap = (0.12 + rnd() * 0.75) * (1.5 - Math.min(1, mood) * eager);
      if (rnd() > 0.25 + mood * 0.75) { at += Math.floor((gap + 0.3 + rnd() * 0.6) * rate); continue; }
      const length = 0.25 + rnd() * rnd() * 1.15 + mood * 0.25;
      const samples = Math.floor(length * rate);
      const vowel = VOWELS[Math.floor(rnd() * VOWELS.length)];
      const f = vowel.map(([hz, amp]) => ({ ...resonator(hz * stretch * (0.94 + rnd() * 0.12), 70 + hz * 0.06, rate), amp, y1: 0, y2: 0 }));
      // Shouting lifts the pitch: up to a fifth over speaking with the crowd's mood.
      const pitch = base * (1 + 0.5 * Math.min(1, mood) * (0.5 + rnd() * 0.5));
      const loud = gain * (0.45 + 0.55 * rnd()) * (0.25 + 0.75 * Math.min(1.2, mood));
      const attack = 0.03 + rnd() * 0.05;
      const release = 0.08 + rnd() * 0.16;
      const rough = 0.004 + rnd() * 0.012;
      let last = 0;
      for (let i = 0; i < samples && at + i < n; i += 1) {
        const t = i / rate;
        const env = Math.min(1, t / attack) * Math.min(1, (length - t) / release);
        const bend = 1 + 0.07 * Math.min(1, t / 0.12) - 0.1 * (t / length) ** 2
          + 0.012 * Math.sin(phase0 + (t0 + t) * wander * 6.28) + rough * (rnd() - 0.5);
        phase += (pitch * bend) / rate;
        if (phase >= 1) phase -= 1;
        // The glottal pulse of a shout: a falling ramp, its edge barely
        // softened (a pressed voice is rich in harmonics).
        const pulse = (1 - 2 * phase) * (phase < 0.02 ? phase / 0.02 : 1);
        // (Tilted up, as a shout is: the upper formants carry, not only the first.)
        const x = pulse - TILT * last;
        last = pulse;
        let y = 0;
        for (let k = 0; k < 3; k += 1) {
          const r = f[k];
          const v = x * r.g + r.a1 * r.y1 + r.a2 * r.y2;
          r.y2 = r.y1;
          r.y1 = v;
          y += v * r.amp;
        }
        out[at + i] += y * env * loud;
      }
      at += samples + Math.floor(gap * rate);
    }
  }

  // The hubbub under the voices: noise held between about 300 Hz and 3 kHz
  // (two poles each side, so nothing bright is left), swelling slowly.
  function hubbub(out, rate, rnd, level, gain) {
    const lp = Math.exp((-2 * Math.PI * 2400) / rate);
    const hp = Math.exp((-2 * Math.PI * 450) / rate);
    let l1 = 0;
    let l2 = 0;
    let h1 = 0;
    let h2 = 0;
    const p1 = rnd() * 6.28;
    const p2 = rnd() * 6.28;
    for (let i = 0; i < out.length; i += 1) {
      const t = i / rate;
      const x = rnd() * 2 - 1;
      l1 = x * (1 - lp) + l1 * lp;
      l2 = l1 * (1 - lp) + l2 * lp;
      h1 = l2 * (1 - hp) + h1 * hp;
      h2 = h1 * (1 - hp) + h2 * hp;
      out[i] += (l2 - h2) * gain * level(t) * (0.75 + 0.15 * Math.sin(t * 1.9 + p1) + 0.1 * Math.sin(t * 3.3 + p2));
    }
  }

  // A whistle: a pure tone that swoops up, with a fast flutter.
  function whistle(out, rate, rnd, at, gain) {
    const length = 0.25 + rnd() * 0.5;
    const from = 1500 + rnd() * 700;
    const to = from * (1.25 + rnd() * 0.5);
    const flutter = 18 + rnd() * 14;
    let phase = 0;
    const start = Math.floor(at * rate);
    for (let i = 0; i < length * rate && start + i < out.length; i += 1) {
      const t = i / rate;
      const u = t / length;
      const f = Math.min(rate * 0.42, from + (to - from) * Math.min(1, u * 1.6) ** 0.6);
      phase += (2 * Math.PI * f * (1 + 0.012 * Math.sin(t * flutter * 6.28))) / rate;
      out[start + i] += Math.sin(phase) * Math.min(1, t / 0.03) * Math.min(1, (length - t) / 0.08) * gain;
    }
  }

  // An air horn: two reedy notes a third apart.
  function horn(out, rate, rnd, at, gain) {
    const length = 0.5 + rnd() * 0.5;
    const base = 290 + rnd() * 90;
    const start = Math.floor(at * rate);
    const res = [resonator(base * 3, 300, rate), resonator(base * 5.2, 500, rate)].map((r) => ({ ...r, y1: 0, y2: 0 }));
    let p1 = 0;
    let p2 = 0;
    for (let i = 0; i < length * rate && start + i < out.length; i += 1) {
      const t = i / rate;
      p1 = (p1 + base / rate) % 1;
      p2 = (p2 + (base * 1.26) / rate) % 1;
      const x = (p1 < 0.5 ? 1 : -1) * 0.6 + (p2 < 0.5 ? 1 : -1) * 0.5;
      let y = 0;
      res.forEach((r) => {
        const v = x * r.g + r.a1 * r.y1 + r.a2 * r.y2;
        r.y2 = r.y1;
        r.y1 = v;
        y += v;
      });
      out[start + i] += y * Math.min(1, t / 0.04) * Math.min(1, (length - t) / 0.1) * gain;
    }
  }

  // A hand clap: a click through a resonance of its own between about 900 Hz
  // and 2.2 kHz (cupped hands low, flat hands high), a few milliseconds long.
  function clap(out, rate, rnd, at, gain) {
    const r = resonator(900 + rnd() * 1300, 500 + rnd() * 500, rate);
    const start = Math.floor(at * rate);
    const burst = Math.floor((0.002 + rnd() * 0.002) * rate);
    const n = Math.floor(0.03 * rate);
    let y1 = 0;
    let y2 = 0;
    for (let i = 0; i < n && start + i < out.length; i += 1) {
      const x = i < burst ? rnd() * 2 - 1 : 0;
      const v = x * r.g * 3 + r.a1 * y1 + r.a2 * y2;
      y2 = y1;
      y1 = v;
      out[start + i] += v * gain;
    }
  }

  // A hall: four comb filters into two all-passes (Schroeder), mixed under.
  function hall(dry, rate, wet = 0.3) {
    const out = new Float32Array(dry.length);
    const combs = [0.0353, 0.0437, 0.0491, 0.0571].map((d) => ({ buf: new Float32Array(Math.floor(d * rate)), i: 0, low: 0 }));
    const passes = [0.0061, 0.0019].map((d) => ({ buf: new Float32Array(Math.floor(d * rate)), i: 0 }));
    for (let n = 0; n < dry.length; n += 1) {
      let sum = 0;
      for (let c = 0; c < combs.length; c += 1) {
        const comb = combs[c];
        const y = comb.buf[comb.i];
        comb.low = y * 0.6 + comb.low * 0.4;
        comb.buf[comb.i] = dry[n] + comb.low * 0.8;
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

  function normalise(samples, peak) {
    let max = 0;
    for (let i = 0; i < samples.length; i += 1) max = Math.max(max, Math.abs(samples[i]));
    if (max > 0) for (let i = 0; i < samples.length; i += 1) samples[i] *= peak / max;
    return samples;
  }

  // A crowd, in steps (a few voices each, then the hall), for the game to
  // spread over as many tasks. length: seconds. level(t): its excitement, 0
  // to about 1.2. voices: how many (a few of them near and loud). whistles,
  // horns: how many, placed where the crowd is most excited. claps: per
  // second at full excitement (applause). loop: the end is crossfaded into
  // the start, to play round and round.
  // It is made at half the output rate and doubled, which also keeps it dark
  // (nothing above a quarter of the output rate).
  function crowdSteps(length, level, seed, { rate = 24000, voices = 36, whistles = 0, horns = 0, claps = 0, loop = false, peak = 0.8, hubbubGain = 0.5, nearEvery = 6 } = {}) {
    const rnd = seeded(seed);
    const inner = rate / 2;
    const fade = loop ? 1.2 : 0;
    const dry = new Float32Array(Math.ceil((length + fade) * inner));
    const shape = loop ? () => level(0) : level;
    let out = null;
    const steps = [];
    const VOICES_A_STEP = 4;
    for (let v = 0; v < voices; v += VOICES_A_STEP) {
      steps.push(() => {
        for (let k = v; k < Math.min(voices, v + VOICES_A_STEP); k += 1) {
          // One in six (nearEvery) is near: louder, so a voice or two can be told apart.
          const near = k % nearEvery === 0;
          voice(dry, inner, rnd, shape, { gain: near ? 2.1 : 0.5 + rnd() * 0.3, female: rnd() < 0.42, eager: 0.6 + rnd() * 0.5 });
        }
      });
    }
    steps.push(() => {
      hubbub(dry, inner, rnd, shape, hubbubGain * Math.sqrt(voices / 36));
      // Where it is most excited: the moments the whistles, horns and claps favour.
      const moment = () => {
        let best = 0;
        let bestAt = 0;
        for (let k = 0; k < 6; k += 1) {
          const t = rnd() * (length - 0.8);
          const l = shape(t) * (0.6 + rnd() * 0.4);
          if (l > best) { best = l; bestAt = t; }
        }
        return [bestAt, best];
      };
      for (let k = 0; k < whistles; k += 1) { const [t, l] = moment(); if (l > 0.2) whistle(dry, inner, rnd, t, 0.5 + rnd() * 0.4); }
      for (let k = 0; k < horns; k += 1) { const [t, l] = moment(); if (l > 0.3) horn(dry, inner, rnd, t, 0.9); }
      const total = Math.floor(claps * length);
      for (let k = 0; k < total; k += 1) {
        const t = rnd() * (length - 0.05);
        if (rnd() < Math.min(1, shape(t))) clap(dry, inner, rnd, t, 0.5 + rnd() * 0.9);
      }
    });
    steps.push(() => {
      const wet = hall(dry, inner);
      const n = Math.ceil(length * rate);
      out = new Float32Array(n);
      const at = (j) => {
        // Doubled by linear interpolation; a loop's tail folded onto its head.
        const x = j / 2;
        const i = Math.floor(x);
        const a = wet[i] || 0;
        return a + ((wet[i + 1] || 0) - a) * (x - i);
      };
      for (let j = 0; j < n; j += 1) out[j] = at(j);
      if (loop) {
        const f = Math.floor(fade * rate);
        for (let j = 0; j < f; j += 1) {
          const u = j / f;
          out[j] = out[j] * Math.sqrt(u) + at(n + j) * Math.sqrt(1 - u);
        }
      } else {
        // In from nothing over 80 ms: a crowd doesn't start mid-roar.
        const f = Math.floor(0.08 * rate);
        for (let j = 0; j < f && j < n; j += 1) out[j] *= j / f;
      }
      normalise(out, peak);
    });
    return { steps, result: () => out };
  }

  function render(length, level, seed, options) {
    const work = crowdSteps(length, level, seed, options);
    work.steps.forEach((step) => step());
    return work.result();
  }

  // The grandstands' crowd in a race: a steady, excited crowd to loop, the
  // game setting its level by how near the stands are.
  const STANDS_SECONDS = 7;
  const standsSteps = (rate = 24000) => crowdSteps(STANDS_SECONDS, () => 0.75, 4201, { rate, voices: 32, nearEvery: 4, whistles: 3, horns: 1, claps: 5, loop: true, peak: 0.8 });

  // ---- Measures, for the tests that keep it a crowd ----

  // The power spectrum's summary: the centroid (Hz), the share of the energy
  // above 5 kHz, and how peaked it is between 300 Hz and 3 kHz (flatness: 1
  // for noise, towards 0 for voices' harmonics and formants).
  function spectrum(samples, rate) {
    const N = 4096;
    const frames = Math.max(1, Math.floor((samples.length - N) / (N / 2)));
    const power = new Float64Array(N / 2);
    const re = new Float64Array(N);
    const im = new Float64Array(N);
    for (let fr = 0; fr < frames; fr += 1) {
      for (let i = 0; i < N; i += 1) {
        re[i] = (samples[fr * (N / 2) + i] || 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
        im[i] = 0;
      }
      fft(re, im);
      for (let k = 0; k < N / 2; k += 1) power[k] += re[k] * re[k] + im[k] * im[k];
    }
    const hz = rate / N;
    let total = 0;
    let weighted = 0;
    let high = 0;
    let logSum = 0;
    let linSum = 0;
    let count = 0;
    for (let k = 1; k < N / 2; k += 1) {
      total += power[k];
      weighted += power[k] * k * hz;
      if (k * hz > 5000) high += power[k];
      if (k * hz >= 300 && k * hz <= 3000) { logSum += Math.log(power[k] + 1e-20); linSum += power[k]; count += 1; }
    }
    return { centroid: weighted / total, above5k: high / total, flatness: Math.exp(logSum / count) / (linSum / count) };
  }

  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i += 1) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = (-2 * Math.PI) / len;
      for (let i = 0; i < n; i += len) {
        for (let k = 0; k < len / 2; k += 1) {
          const wr = Math.cos(ang * k);
          const wi = Math.sin(ang * k);
          const a = i + k;
          const b = a + len / 2;
          const xr = re[b] * wr - im[b] * wi;
          const xi = re[b] * wi + im[b] * wr;
          re[b] = re[a] - xr; im[b] = im[a] - xi;
          re[a] += xr; im[a] += xi;
        }
      }
    }
  }

  // How much the loudness moves at the rate of syllables (2 to 8 Hz), against
  // its mean, once the sound's own slow shape (under 1 Hz) is taken out: the
  // envelope every 10 ms, its ripple in that band over its average.
  function syllableDepth(samples, rate) {
    const hop = Math.floor(rate / 100);
    const env = [];
    for (let i = 0; i + hop <= samples.length; i += hop) {
      let s = 0;
      for (let j = 0; j < hop; j += 1) s += samples[i + j] * samples[i + j];
      env.push(Math.sqrt(s / hop));
    }
    // Band-pass by two moving averages: over 0.12 s (keeps under about 8 Hz)
    // less over 0.5 s (drops under about 2 Hz).
    const mean = (a, w) => a.map((_, i) => {
      let s = 0;
      let c = 0;
      for (let j = Math.max(0, i - w); j <= Math.min(a.length - 1, i + w); j += 1) { s += a[j]; c += 1; }
      return s / c;
    });
    const fast = mean(env, 6);
    const slow = mean(env, 25);
    let ripple = 0;
    let level = 0;
    for (let i = 25; i < env.length - 25; i += 1) {
      ripple += (fast[i] - slow[i]) ** 2;
      level += slow[i];
    }
    const n = Math.max(1, env.length - 50);
    return Math.sqrt(ripple / n) / (level / n);
  }

  return { crowdSteps, render, standsSteps, STANDS_SECONDS, spectrum, syllableDepth, VOWELS };
}));
