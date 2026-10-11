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
  // The ceremony stands for all of it, the hall's last echo included.
  assert.equal(PodiumSound.anthemSeconds(key), PodiumSound.seconds(key));
  assert.ok(PodiumSound.seconds(key) > (a.beats * 60) / a.bpm + 1);
  const spb = 60 / a.bpm;
  // Each of the first dozen notes: its own pitch is the strongest of the scale's around it.
  a.melody.slice(0, 12).forEach(([midi, start, length]) => {
    const from = start * spb + 0.08;
    const to = (start + length) * spb - 0.02;
    const own = power(samples, hz(midi), from, to);
    [-2, -1, 1, 2].forEach((d) => assert.ok(own > power(samples, hz(midi + d), from, to) * 2, `note ${midi} at ${start} against ${midi + d}`));
  });
  // The same note twice is heard as two: the level dips between the first
  // two notes (both F) to well under the level of the notes themselves.
  assert.equal(a.melody[0][0], a.melody[1][0]);
  const joint = a.melody[1][1] * spb;
  assert.ok(rms(samples, joint - 0.03, joint + 0.005) < rms(samples, joint - 0.4, joint - 0.1) * 0.6,
    `the joint ${rms(samples, joint - 0.03, joint + 0.005)} against the note ${rms(samples, joint - 0.4, joint - 0.1)}`);
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
  // In steps (as the game renders it, a task each) it is the same sound.
  const work = PodiumSound.pieceSteps("mc", RATE);
  assert.ok(work.steps.length > 20);
  work.steps.forEach((step) => step());
  assert.deepEqual(work.result(), a);
  // Kimigayo is written an octave above where it is sung: the band plays it
  // down the octave. No other anthem moves; O Canada's bass, under the tuba, goes up one.
  Object.keys(PodiumSound.ANTHEMS).forEach((key) => {
    const o = PodiumSound.pieceSteps(key, 2000).octaves;
    assert.equal(o.melody, key === "jp" ? -1 : 0, key);
    assert.equal(o.bass, key === "ca" ? 1 : 0, key);
  });
  // A name that is no anthem's (even an object's own) is the fanfare.
  assert.deepEqual(PodiumSound.renderPiece("constructor", 2000), PodiumSound.renderPiece(null, 2000));
  assert.equal(PodiumSound.anthemFor({ country: "constructor" }), null);
  // A winner without an anthem here gets the fanfare: the game's own tune, the same every time.
  assert.deepEqual(PodiumSound.renderPiece(null, 4000), PodiumSound.renderPiece("fanfare", 4000));
  assert.ok(Math.abs(PodiumSound.anthemSeconds(null) - (PodiumSound.FANFARE.beats * 60) / PodiumSound.FANFARE.bpm - PodiumSound.TAIL) < 1e-9);
});

test("the cues: each sound at its beat on the ceremony's timeline, whatever the anthem's length", () => {
  [["nz", "high"], ["jp", "medium"], [null, "low"]].forEach(([winner, tier]) => {
    const C = Ceremony.withAnthem(PodiumSound.anthemSeconds(winner));
    const B = C.BEATS;
    const cues = PodiumSound.cues(C, { tier });
    const at = (id) => { const c = cues.find((x) => x.id === id); return c ? c.at : null; };
    assert.equal(at("welcome"), 0);
    assert.equal(at("anthem"), B.anthem);
    // The presentation: its own processional from the presenter's first
    // steps, the crowd's ovation through it, a ring as each trophy is lifted.
    assert.ok(at("procession") >= B.present && at("procession") < B.present + 0.5);
    assert.equal(at("ovation"), B.present);
    C.HANDOVERS.forEach((h) => assert.ok(at(`ring${h.place}`) > h.release && at(`ring${h.place}`) < h.release + 0.6, `ring ${h.place}`));
    assert.equal(at("applause"), null, "the old applause over the anthem's end is gone");
    assert.ok(Math.abs(at("sting") - B.trophy) < 0.3 && Math.abs(at("roar") - B.trophy) < 0.3);
    assert.ok(at("cannon1") >= B.trophy && at("cannon1") < B.trophy + 0.1 && at("cannon2") > at("cannon1"));
    // A cork for each bottle, at the moment that driver's spray starts.
    [1, 2, 3].forEach((p) => {
      assert.equal(at(`cork${p}`), C.corkAt(p));
      if (tier === "low") assert.equal(at(`fizz${p}`), null);
      else {
        // The fizz starts with the pop, and is loud enough to read over the cheering.
        assert.ok(at(`fizz${p}`) >= C.corkAt(p) && at(`fizz${p}`) < C.corkAt(p) + 0.03);
        assert.ok(cues.find((c) => c.id === `fizz${p}`).gain >= cues.find((c) => c.id === "cheer").gain);
      }
    });
    assert.equal(at("cheer"), B.spray);
    // The crowd's murmur carries on for as long as the podium is up.
    const murmur = cues.find((c) => c.id === "murmur");
    assert.ok(murmur.loop === true && murmur.fadeIn > 1 && murmur.at > B.spray && murmur.at < B.spray + 12 - murmur.fadeIn);
    // Where no spray is drawn at all there is no fizz, on any tier.
    assert.ok(PodiumSound.cues(C, { tier, spray: false }).every((c) => !c.id.startsWith("fizz")));
    assert.equal(PodiumSound.cues(C, { tier, spray: false }).filter((c) => c.id.startsWith("cork")).length, 3);
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
  // Each cork is in the mix at its moment: taking it out changes those 30 ms
  // by the pop's own level, and nothing before them.
  [1, 2, 3].forEach((p) => {
    const t = C.corkAt(p);
    const without = PodiumSound.mix(C, winner, { rate: RATE, without: `cork${p}`, until: t + 0.5 });
    const diff = out.slice(0, without.length).map((v, i) => v - without[i]);
    assert.ok(rms(diff, t, t + 0.03) > 0.1, `cork ${p}: ${rms(diff, t, t + 0.03)}`);
    assert.ok(rms(diff, t - 1, t - 0.001) === 0);
    assert.ok(rms(diff, t, t + 0.03) > rms(diff, t + 0.15, t + 0.21) * 8, "a pop: all at the start");
  });
  // Never clipped, whoever wins (the corks over the cheering are the loudest moment).
  let peak = 0;
  out.forEach((v) => { peak = Math.max(peak, Math.abs(v)); });
  assert.ok(peak > 0.5 && peak <= 0.98, `peak ${peak}`);
  // A crowd comes in from nothing.
  assert.ok(Math.abs(out[0]) < 1e-6 && rms(out, 0, 0.01) < rms(out, 0.3, 0.6) * 0.5);
  // It ends: silence after the cheering fades.
  assert.ok(rms(out, out.length / RATE - 0.3, out.length / RATE) < 0.02);
});

// What the champagne was (a falling sine with a long hiss; steady bright
// noise): kept so the tests below are seen to refuse it.
function oldCork(rate) {
  let s = 101;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const out = new Float32Array(Math.ceil(0.32 * rate));
  let phase = 0;
  let lp = 0;
  for (let i = 0; i < out.length; i += 1) {
    const t = i / rate;
    phase += (2 * Math.PI * (900 * Math.exp(-t * 22) + 140)) / rate;
    const x = rnd() * 2 - 1;
    lp = x * 0.1 + lp * 0.9;
    out[i] = Math.sin(phase) * Math.exp(-t * 38) + (x - lp) * 0.5 * Math.exp(-t * 16) * Math.min(1, t * 400);
  }
  return out;
}
function oldFizz(seconds, rate) {
  let s = 201;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const out = new Float32Array(seconds * rate);
  let lp = 0;
  for (let i = 0; i < out.length; i += 1) {
    const t = i / rate;
    const x = rnd() * 2 - 1;
    lp = x * 0.45 + lp * 0.55;
    out[i] = (x - lp) * (0.62 + 0.38 * Math.sin(t * 7 * 6.28)) * Math.exp(-t * (2.2 / seconds));
  }
  return out;
}

// A cork: one sharp attack, one ring that falls from the neck's pitch as it
// opens and is gone in about a tenth of a second, a puff of gas right behind
// the attack and none later; a fifth of a second in all.
function isAPop(m, name) {
  assert.ok(m.attack < 0.005, `${name}: loudest at ${m.attack} s`);
  assert.ok(m.length >= 0.15 && m.length <= 0.25, `${name}: ${m.length} s long`);
  assert.ok(m.done > 0.06 && m.done < 0.14, `${name}: 95% of it out by ${m.done} s`);
  assert.ok(m.early > 600 && m.early < 950, `${name}: rings at ${m.early} Hz at first`);
  assert.ok(m.late > 380 && m.late < 560 && m.late < m.early - 150, `${name}: rings at ${m.late} Hz later`);
  assert.ok(m.gasEarly > 0.05 && m.gasLate < m.gasEarly * 0.7, `${name}: gas ${m.gasEarly} then ${m.gasLate}`);
}

test("the cork is a hollow pop: a sharp attack, one falling ring, a puff of gas, a fifth of a second", () => {
  const R = 24000;
  const corks = [101, 102, 103].map((seed) => PodiumSound.renderCork(seed, R));
  corks.forEach((cork, i) => isAPop(PodiumSound.popShape(cork, R), `cork ${i + 1}`));
  // Each bottle its own: three different pitches at the start.
  const early = corks.map((cork) => PodiumSound.popShape(cork, R).early);
  assert.ok(new Set(early).size >= 2 && Math.max(...early) - Math.min(...early) >= 25, `pitches ${early}`);
  assert.notDeepEqual(corks[0], corks[1]);
  assert.deepEqual(PodiumSound.renderCork(101, R), corks[0]);
  // What it was is refused (too long, and hissing on after the pop).
  assert.throws(() => isAPop(PodiumSound.popShape(oldCork(R), R), "the old cork"));
});

test("the spray is effervescence: bright, made of ticks (not a steady hiss), thick at first and thinning, shaken", () => {
  const R = 24000;
  const fizz = PodiumSound.renderFizz(4, 201, R);
  const CrowdSound = require("../crowd-sound.js");
  const isFizz = (samples, name) => {
    const sp = CrowdSound.spectrum(samples, R);
    assert.ok(sp.centroid > 5000 && sp.above5k > 0.5, `${name}: centroid ${sp.centroid.toFixed(0)} Hz, ${sp.above5k.toFixed(2)} above 5 kHz`);
    // Crackle: in each 10 ms the peak stands well over the level (a hiss: about 3).
    assert.ok(PodiumSound.crackle(samples, R) > 4.5, `${name}: crackle ${PodiumSound.crackle(samples, R).toFixed(2)}`);
  };
  isFizz(fizz, "fizz");
  assert.throws(() => isFizz(oldFizz(4, R), "the old fizz"));
  // It starts hard (with the pop) and the bottle empties.
  assert.ok(rms(fizz, 0, 0.05, R) > rms(fizz, 0.3, 0.8, R) * 0.7, "hard from the first moment");
  assert.ok(rms(fizz, 0.2, 0.8, R) > rms(fizz, 3, 3.8, R) * 2, "the bottle empties");
  // Shaken: the loudness over tenths of a second rises and falls by a good third.
  const tenths = [];
  for (let t = 0.2; t < 2; t += 0.1) tenths.push(rms(fizz, t, t + 0.1, R) / Math.exp(-t * (2.6 / 4)));
  assert.ok(Math.max(...tenths) > Math.min(...tenths) * 1.35, `shake ${Math.min(...tenths)} to ${Math.max(...tenths)}`);
  assert.deepEqual(PodiumSound.renderFizz(4, 201, R), fizz);
});

test("a cannon thumps", () => {
  const R = 24000;
  const zero = (s, from, to) => { let n = 0; for (let i = Math.floor(from * R) + 1; i < Math.floor(to * R); i += 1) if ((s[i] >= 0) !== (s[i - 1] >= 0)) n += 1; return n / (to - from) / 2; };
  const cannon = PodiumSound.renderCannon(3, R);
  assert.ok(zero(cannon, 0, 0.08) < 1500, `cannon ${zero(cannon, 0, 0.08)}`);
  assert.ok(rms(cannon, 0, 0.1, R) > rms(cannon, 0.6, 0.9, R) * 4);
});

test("no sound overlaps the next scene: every cue ends before the scene after its own begins", () => {
  [["nz", "high"], ["jp", "high"], ["fr", "medium"], [null, "low"]].forEach(([winner, tier]) => {
    const C = Ceremony.withAnthem(PodiumSound.anthemSeconds(winner));
    const B = C.BEATS;
    const cues = PodiumSound.cues(C, { tier, winner });
    const made = PodiumSound.sounds(C, winner, 2000);
    cues.forEach((c) => {
      const scene = C.SCENES.find((s) => c.at >= s.start - 1e-9 && c.at < s.end);
      assert.equal(c.scene, scene.name, `${c.id} is the ${scene.name}'s`);
      if (c.loop) { assert.equal(scene.name, "champagne"); return; }
      assert.ok(c.seconds > 0, c.id);
      assert.ok(c.at + c.seconds <= scene.end + 1e-6, `${c.id} (${c.scene}) runs to ${(c.at + c.seconds).toFixed(2)}, past ${scene.end.toFixed(2)}`);
      // And the length it says is the length it renders to.
      assert.ok(Math.abs(PodiumSound.run(made[c.sound]()).length / 2000 - c.seconds) < 0.01, `${c.id}: ${c.seconds}`);
    });
    const cue = (id) => cues.find((c) => c.id === id);
    const end = (id) => cue(id).at + cue(id).seconds;
    // The music, one piece at a time: anthem, then the processional, then the sting, then the corks.
    assert.ok(end("anthem") <= cue("procession").at, "the anthem's last echo before the processional");
    assert.ok(end("procession") <= cue("sting").at, "the processional before the winner's sting");
    assert.ok(end("procession") <= B.trophy + 1e-6, `the processional has died away as the winner takes the trophy: ${end("procession") - B.trophy}`);
    // No dead air: the processional starts within half a second of the
    // anthem's last echo, plays until the winner has the trophy in reach
    // (its last note as it is raised to them), and the sting follows at once.
    assert.ok(cue("procession").at - end("anthem") <= 0.5, `${cue("procession").at - end("anthem")} s of nothing after the anthem`);
    assert.ok(cue("sting").at - end("procession") <= 0.3);
    const gold = C.HANDOVERS.find((h) => h.place === 1);
    const tune = PodiumSound.processional(C);
    const last = tune.melody[tune.melody.length - 1];
    assert.ok(Math.abs(cue("procession").at + (last[1] * 60) / tune.bpm - gold.raise) < 0.02, "its last note as the gold is raised");
    assert.ok(cue("procession").at + ((last[1] + last[2]) * 60) / tune.bpm > gold.contact - 0.2, "held until the winner's hand is on it");
    assert.ok(tune.bpm >= 92 && tune.bpm <= 120, `a stately ${tune.bpm} to the minute`);
    assert.ok(end("sting") <= Math.min(...[1, 2, 3].map((p) => cue(`cork${p}`).at)), "the sting before the first cork");
    // The arrival's crowd is quiet by the anthem's first note; nothing of the champagne before the spray.
    assert.ok(end("welcome") <= cue("anthem").at);
    cues.filter((c) => /^(cork|fizz|cheer|murmur)/.test(c.id)).forEach((c) => assert.ok(c.at >= B.spray, c.id));
    // Each scene has its sound: none is silent.
    C.SCENES.forEach((s) => assert.ok(cues.some((c) => c.scene === s.name), s.name));
    // The sting, the cannons and the roar are played once: the winner's lift.
    ["sting", "cannon1", "cannon2", "roar", "procession", "ovation", "anthem"].forEach((id) => assert.equal(cues.filter((c) => c.id === id).length, 1, id));
    assert.ok(Math.abs(cue("sting").at - B.trophy) < 0.3 && Math.abs(cue("roar").at - B.trophy) < 0.3);
  });
});

test("the presentation's sounds: a processional that is no anthem, a ring for each trophy (lower for the bigger)", () => {
  const R = 24000;
  const P = PodiumSound.PROCESSION;
  // Its own tune: not the fanfare, not the sting, not any anthem's opening.
  const opening = (piece) => piece.melody.slice(0, 6).map((n) => n[0] - piece.melody[0][0]).join(",");
  [PodiumSound.FANFARE, PodiumSound.STING, ...Object.values(PodiumSound.ANTHEMS)].forEach((other) => assert.notEqual(opening(P), opening(other)));
  const C = Ceremony.withAnthem(20);
  const tune = PodiumSound.processional(C);
  assert.deepEqual(tune.melody.slice(0, P.melody.length), P.melody);
  const music = PodiumSound.renderPiece(tune, 8000);
  assert.ok(Math.abs(music.length / 8000 - (C.BEATS.trophy - C.BEATS.present)) < 0.01, "as long as the presentation, to the winner's taking it");
  assert.ok(rms(music, 1, 3, 8000) > 0.05);
  // Its end is no click: the last few milliseconds are all but silent.
  assert.ok(rms(music, music.length / 8000 - 0.01, music.length / 8000, 8000) < 0.01);
  // The crowd: applause held until the winner has the trophy (no hush
  // before it), and the roar held through the lift (no quiet at its end).
  const made = PodiumSound.sounds(C, null, 8000);
  const ovation = PodiumSound.run(made.ovation());
  const L = ovation.length / 8000;
  const walk = C.HANDOVERS[2].arrive - 1 - C.BEATS.present;
  assert.ok(rms(ovation, L - 0.9, L - 0.3, 8000) > rms(ovation, walk - 0.4, walk + 0.4, 8000) * 1.25, `the applause rises to the winner's handover: ${rms(ovation, L - 0.9, L - 0.3, 8000) / rms(ovation, walk - 0.4, walk + 0.4, 8000)}`);
  const roar = PodiumSound.run(made.roar());
  const R8 = roar.length / 8000;
  assert.ok(rms(roar, R8 - 1.6, R8 - 0.6, 8000) > rms(roar, 0.6, 1.6, 8000) * 0.45, "the roar holds through the lift");
  // A ring: a struck metal sound, sharp at the start, dying over about a second, with partials that are not harmonics.
  const rings = [3, 2, 1].map((place) => PodiumSound.renderRing(place, R));
  rings.forEach((ring) => {
    assert.ok(ring.length / R > 0.9 && ring.length / R < 1.8);
    assert.ok(rms(ring, 0, 0.05, R) > rms(ring, 0.6, 0.9, R) * 4);
    assert.ok(rms(ring, ring.length / R - 0.05, ring.length / R, R) < 0.01);
  });
  // Lower for the bigger trophy: bronze highest, gold lowest (by zero crossings).
  const zero = (s) => { let n = 0; for (let i = 1; i < R * 0.3; i += 1) if ((s[i] >= 0) !== (s[i - 1] >= 0)) n += 1; return n; };
  assert.ok(zero(rings[0]) > zero(rings[1]) && zero(rings[1]) > zero(rings[2]), `${rings.map(zero)}`);
});
