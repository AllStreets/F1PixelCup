const test = require("node:test");
const assert = require("node:assert/strict");
const Ceremony = require("../ceremony.js");
const PodiumSound = require("../podium-sound.js");

const RATE = 8000;
const rms = (s, from, to, rate = RATE) => {
  let sum = 0;
  const a = Math.max(0, Math.floor(from * rate));
  const b = Math.min(s.length, Math.floor(to * rate));
  for (let i = a; i < b; i += 1) sum += s[i] * s[i];
  return Math.sqrt(sum / Math.max(1, b - a));
};
// The strongest frequency in a stretch, by Goertzel over candidate pitches.
const power = (s, hz, from, to, rate = RATE) => {
  const w = (2 * Math.PI * hz) / rate;
  let re = 0;
  let im = 0;
  for (let i = Math.floor(from * rate); i < Math.floor(to * rate); i += 1) { re += s[i] * Math.cos(w * i); im += s[i] * Math.sin(w * i); }
  return re * re + im * im;
};
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

test("an anthem is played from its notes: the right pitches at the right times, for as long as it says", () => {
  const key = "gb";
  const a = PodiumSound.ANTHEMS[key];
  const samples = PodiumSound.renderPiece(key, RATE);
  assert.ok(Math.abs(samples.length / RATE - PodiumSound.seconds(key)) < 0.01);
  assert.ok(PodiumSound.anthemSeconds(key) > (a.beats * 60) / a.bpm && PodiumSound.anthemSeconds(key) < PodiumSound.seconds(key));
  const spb = 60 / a.bpm;
  // Each of the first dozen notes: its own pitch is the strongest of the scale's around it.
  a.melody.slice(0, 12).forEach(([midi, start, length]) => {
    const from = start * spb + 0.08;
    const to = (start + length) * spb - 0.02;
    const own = power(samples, hz(midi), from, to);
    [-2, -1, 1, 2].forEach((d) => assert.ok(own > power(samples, hz(midi + d), from, to) * 2, `note ${midi} at ${start} against ${midi + d}`));
  });
  // Loud while it plays, quiet by the end of the tail, never clipped, no NaN.
  assert.ok(rms(samples, 2, 4) > 0.1);
  assert.ok(rms(samples, samples.length / RATE - 0.2, samples.length / RATE) < 0.03);
  assert.ok(samples.every((v) => Number.isFinite(v) && Math.abs(v) <= 1));
});

test("rendering is deterministic, and every anthem and the fanfare render", () => {
  const a = PodiumSound.renderPiece("mc", RATE);
  const b = PodiumSound.renderPiece("mc", RATE);
  assert.deepEqual(a, b);
  [...Object.keys(PodiumSound.ANTHEMS), null, "sting"].forEach((key) => {
    const s = PodiumSound.renderPiece(key, 4000);
    assert.ok(rms(s, 0.5, 2, 4000) > 0.05, String(key));
  });
  // A winner without an anthem here gets the fanfare: the game's own tune, the same every time.
  assert.deepEqual(PodiumSound.renderPiece(null, 4000), PodiumSound.renderPiece("fanfare", 4000));
  assert.ok(Math.abs(PodiumSound.anthemSeconds(null) - (PodiumSound.FANFARE.beats * 60) / PodiumSound.FANFARE.bpm - 0.6) < 1e-9);
});

test("the cues: each sound at its beat on the ceremony's timeline, whatever the anthem's length", () => {
  [["nz", "high"], ["jp", "medium"], [null, "low"]].forEach(([winner, tier]) => {
    const C = Ceremony.withAnthem(PodiumSound.anthemSeconds(winner));
    const B = C.BEATS;
    const cues = PodiumSound.cues(C, { tier });
    const at = (id) => { const c = cues.find((x) => x.id === id); return c ? c.at : null; };
    assert.equal(at("welcome"), 0);
    assert.equal(at("anthem"), B.anthem);
    // The anthem's last note is over before the trophy goes up; the applause meets its end.
    assert.ok(B.anthem + (PodiumSound.seconds(winner) - 1.6) <= B.anthemEnd + 1e-9);
    assert.ok(Math.abs(at("applause") - B.anthemEnd) < 0.5);
    assert.ok(Math.abs(at("sting") - B.trophy) < 0.3 && Math.abs(at("roar") - B.trophy) < 0.3);
    assert.ok(at("cannon1") >= B.trophy && at("cannon1") < B.trophy + 0.1 && at("cannon2") > at("cannon1"));
    // A cork for each bottle, at the moment that driver's spray starts.
    [1, 2, 3].forEach((p) => {
      assert.equal(at(`cork${p}`), C.corkAt(p));
      if (tier === "low") assert.equal(at(`fizz${p}`), null);
      else assert.ok(at(`fizz${p}`) >= C.corkAt(p) && at(`fizz${p}`) < C.corkAt(p) + 0.1);
    });
    assert.equal(at("cheer"), B.spray);
    // In order, each naming a sound that exists.
    const made = PodiumSound.sounds(C, winner, 2000);
    cues.forEach((c, i) => {
      assert.ok(typeof made[c.sound] === "function", c.sound);
      assert.ok(c.gain > 0 && c.gain <= 1 && (i === 0 || c.at >= cues[i - 1].at));
    });
  });
});

test("the mix: the crowd as they step up, the anthem alone while they stand, the pops at the corks", () => {
  const winner = "nz";
  const C = Ceremony.withAnthem(PodiumSound.anthemSeconds(winner));
  const B = C.BEATS;
  const out = PodiumSound.mix(C, winner, { rate: RATE });
  assert.ok(out.every((v) => Number.isFinite(v)));
  // The crowd cheers each driver stepping up: louder there than during the sweep.
  assert.ok(rms(out, B.arms[1] + 0.2, B.arms[1] + 0.8) > rms(out, 0.3, 1.2) * 1.5);
  // The anthem's first note is there, at its pitch, and the crowd has gone quiet under it.
  const a = PodiumSound.ANTHEMS[winner];
  const first = a.melody[0];
  const from = B.anthem + 0.1;
  const to = B.anthem + (first[2] * 60) / a.bpm;
  assert.ok(power(out, hz(first[0]), from, to) > power(out, hz(first[0] + 1), from, to) * 2);
  // Each cork is a sharp rise over the moment before it.
  [1, 2, 3].forEach((p) => {
    const t = C.corkAt(p);
    const before = PodiumSound.mix(C, winner, { rate: RATE, until: t + 0.2 });
    const cork = PodiumSound.renderCork(100 + p, RATE);
    assert.ok(rms(cork, 0, 0.03) > rms(cork, 0.2, 0.3) * 8, "a pop: all at the start");
    assert.ok(before.length === Math.ceil((t + 0.2) * RATE));
  });
  // It ends: silence after the cheering fades.
  assert.ok(rms(out, out.length / RATE - 0.3, out.length / RATE) < 0.02);
});

test("the celebration's sounds are what they say: a cork is short and falls in pitch, fizz is bright, a cannon thumps", () => {
  const R = 24000;
  const cork = PodiumSound.renderCork(1, R);
  assert.ok(cork.length / R < 0.4);
  const zero = (s, from, to) => { let n = 0; for (let i = Math.floor(from * R) + 1; i < Math.floor(to * R); i += 1) if ((s[i] >= 0) !== (s[i - 1] >= 0)) n += 1; return n / (to - from) / 2; };
  const fizz = PodiumSound.renderFizz(3, 2, R);
  const cannon = PodiumSound.renderCannon(3, R);
  // Fizz crosses zero thousands of times a second; a cannon starts with a low thump.
  assert.ok(zero(fizz, 0.5, 1.5) > 2500, `fizz ${zero(fizz, 0.5, 1.5)}`);
  assert.ok(zero(cannon, 0, 0.08) < 1500, `cannon ${zero(cannon, 0, 0.08)}`);
  assert.ok(rms(cannon, 0, 0.1, R) > rms(cannon, 0.6, 0.9, R) * 4);
  // A cork's pitch falls: more crossings in its first 10 ms than in the next 20.
  const tone = PodiumSound.renderCork(1, R).map((v, i, all) => (i ? (v + all[i - 1]) / 2 : v));
  assert.ok(zero(tone, 0, 0.01) > zero(tone, 0.02, 0.04), `cork ${zero(tone, 0, 0.01)} then ${zero(tone, 0.02, 0.04)}`);
  assert.ok(rms(fizz, 0.2, 0.8, R) > rms(fizz, 2.4, 3, R) * 1.5, "the bottle empties");
  const applause = PodiumSound.renderApplause(3, 5, R);
  assert.ok(rms(applause, 0.2, 1, R) > rms(applause, 2.2, 3, R) * 1.5);
  // Different seeds, different bottles; the same seed, the same sound.
  assert.notDeepEqual(PodiumSound.renderCork(1, R), PodiumSound.renderCork(2, R));
  assert.deepEqual(PodiumSound.renderCork(1, R), cork);
});
