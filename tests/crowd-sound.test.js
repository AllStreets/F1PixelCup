const test = require("node:test");
const assert = require("node:assert/strict");
const Ceremony = require("../ceremony.js");
const CrowdSound = require("../crowd-sound.js");
const PodiumSound = require("../podium-sound.js");

const RATE = 24000;
const measure = (samples) => ({ ...CrowdSound.spectrum(samples, RATE), syllables: CrowdSound.syllableDepth(samples, RATE) });

// What the crowd used to be (three bands of noise, each swelling slowly): it
// read as water. Kept here so the guard below is seen to refuse it.
function noiseCrowd(seconds, seed) {
  let s = seed >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const out = new Float32Array(seconds * RATE);
  const bands = [[260, 900, 1], [600, 1900, 0.8], [1100, 3200, 0.45]].map(([lo, hi, gain], k) => ({
    a: Math.exp((-2 * Math.PI * hi) / RATE), b: Math.exp((-2 * Math.PI * lo) / RATE), lp: 0, hp: 0, gain, rate: 0.6 + k * 0.37, phase: k * 2,
  }));
  for (let i = 0; i < out.length; i += 1) {
    const t = i / RATE;
    let v = 0;
    bands.forEach((f) => {
      const x = rnd() * 2 - 1;
      f.lp = x * (1 - f.a) + f.lp * f.a;
      f.hp = f.lp * (1 - f.b) + f.hp * f.b;
      v += (f.lp - f.hp) * f.gain * (0.72 + 0.28 * Math.sin(t * f.rate * 6.28 + f.phase));
    });
    out[i] = v;
  }
  return out;
}

// A crowd of people, not water: its weight where voices are (not up with
// hiss and spray), next to nothing above 5 kHz, a spectrum with peaks (the
// voices' harmonics and formants) rather than flat like noise, and loudness
// that moves at the rate of syllables.
function isACrowd(m, name) {
  assert.ok(m.centroid > 600 && m.centroid < 1900, `${name}: centroid ${m.centroid.toFixed(0)} Hz`);
  assert.ok(m.above5k < 0.03, `${name}: ${(m.above5k * 100).toFixed(1)}% above 5 kHz`);
  assert.ok(m.flatness < 0.72, `${name}: flatness ${m.flatness.toFixed(2)}`);
  assert.ok(m.syllables > 0.085, `${name}: syllable depth ${m.syllables.toFixed(3)}`);
}

test("the podium's crowd is voices: the roar, the welcome, the cheer and the ovation, measured", () => {
  const made = PodiumSound.sounds(Ceremony.withAnthem(20), "mc", RATE);
  ["roar", "welcome", "cheer", "ovation"].forEach((name) => isACrowd(measure(PodiumSound.run(made[name]())), name));
  // The murmur is the same people talking, lower and darker.
  const murmur = measure(PodiumSound.run(made.murmur()));
  assert.ok(murmur.centroid > 350 && murmur.centroid < 1200 && murmur.above5k < 0.02 && murmur.flatness < 0.5 && murmur.syllables > 0.085, JSON.stringify(murmur));
});

test("the guard refuses shaped noise (what the crowd was: it read as water)", () => {
  const water = measure(noiseCrowd(5, 37));
  assert.throws(() => isACrowd(water, "noise"));
  // On each count, not just one of them.
  assert.ok(water.centroid > 1900, `centroid ${water.centroid}`);
  assert.ok(water.above5k > 0.1, `above 5 kHz ${water.above5k}`);
  assert.ok(water.flatness > 0.85, `flatness ${water.flatness}`);
  assert.ok(water.syllables < 0.085, `syllables ${water.syllables}`);
});

test("the grandstands' crowd in a race is the same people, and loops without a seam", () => {
  const work = CrowdSound.standsSteps(RATE);
  assert.ok(work.steps.length >= 8, "in steps, for the game to spread out");
  work.steps.forEach((step) => step());
  const stands = work.result();
  assert.equal(stands.length, CrowdSound.STANDS_SECONDS * RATE);
  isACrowd(measure(stands), "grandstands");
  // The join: the step from the last sample to the first is no bigger than the steps inside it.
  let inside = 0;
  for (let i = 1; i < stands.length; i += 1) inside = Math.max(inside, Math.abs(stands[i] - stands[i - 1]));
  assert.ok(Math.abs(stands[0] - stands[stands.length - 1]) <= inside);
  // And as loud at the join as elsewhere (no dip, no bump).
  const rms = (from, to) => { let s = 0; for (let i = from; i < to; i += 1) s += stands[i] * stands[i]; return Math.sqrt(s / (to - from)); };
  const edge = rms(0, RATE / 2);
  const middle = rms(3 * RATE, 4 * RATE);
  assert.ok(edge > middle * 0.6 && edge < middle * 1.6, `${edge} against ${middle}`);
});

test("the champagne stays what it is: the fizz bright and short, nothing like the crowd", () => {
  const fizz = measure(PodiumSound.renderFizz(3, 2, RATE));
  const roar = measure(PodiumSound.run(PodiumSound.sounds(Ceremony.withAnthem(20), "mc", RATE).roar()));
  assert.ok(fizz.centroid > 4000 && fizz.above5k > 0.4, JSON.stringify(fizz));
  assert.ok(fizz.centroid > roar.centroid * 3);
});

test("a roar rises fast and dies slowly; a crowd is deterministic and follows its excitement", () => {
  const C = Ceremony.withAnthem(20);
  const roar = PodiumSound.run(PodiumSound.sounds(C, "mc", RATE).roar());
  const rms = (s, from, to) => { let x = 0; const a = Math.floor(from * RATE); const b = Math.floor(to * RATE); for (let i = a; i < b; i += 1) x += s[i] * s[i]; return Math.sqrt(x / (b - a)); };
  const peak = rms(roar, 0.5, 1.5);
  assert.ok(peak > rms(roar, 0, 0.25) * 2, "up within a second");
  assert.ok(rms(roar, 3, 4) > peak * 0.3, "still there three seconds on");
  assert.ok(rms(roar, 3, 4) < peak * 0.85, "but falling");
  assert.deepEqual(CrowdSound.render(1, () => 0.8, 5, { rate: 8000, voices: 6 }), CrowdSound.render(1, () => 0.8, 5, { rate: 8000, voices: 6 }));
  assert.notDeepEqual(CrowdSound.render(1, () => 0.8, 5, { rate: 8000, voices: 6 }), CrowdSound.render(1, () => 0.8, 6, { rate: 8000, voices: 6 }));
  // Excitement: a calm crowd is quieter than a wild one (same people, before the level is set).
  const calm = CrowdSound.render(3, (t) => (t < 1.5 ? 0.15 : 1), 9, { rate: 8000, voices: 20 });
  const r8 = (s, from, to) => { let x = 0; for (let i = from * 8000; i < to * 8000; i += 1) x += s[i] * s[i]; return Math.sqrt(x / ((to - from) * 8000)); };
  assert.ok(r8(calm, 2, 3) > r8(calm, 0.3, 1.3) * 2);
});
