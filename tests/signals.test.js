// The chequered flag official, the SAFETY CAR sign and the two signal sounds
// (docs/design/specs/2026-10-11-flag-and-safety-car-signals-design.md).
const test = require("node:test");
const assert = require("node:assert/strict");
const Marshals = require("../marshals.js");
const Entrances = require("../entrances.js");
const SignalSounds = require("../signal-sounds.js");

test("the chequered flag waves only on the last lap, and stops when the first car finishes, whoever it is", () => {
  const laps = 5;
  const field = (leaderLap, finished = []) => [{ lap: leaderLap, finished: finished.includes(0) }, { lap: leaderLap - 1, finished: finished.includes(1), isPlayer: true }];
  assert.equal(Marshals.chequered(field(0), laps), false);
  assert.equal(Marshals.chequered(field(3), laps), false);
  // The leader starts the last lap (four completed of five).
  assert.equal(Marshals.chequered(field(4), laps), true);
  // The winner (a CPU car here) takes the flag: it stops, the player still racing.
  assert.equal(Marshals.chequered(field(5, [0]), laps), false);
  // And when it is the player who wins.
  assert.equal(Marshals.chequered([{ lap: 5, finished: true, isPlayer: true }, { lap: 4, finished: false }], laps), false);
  assert.equal(Marshals.chequered([], laps), false);
});

test("the SAFETY CAR sign: in when it is called, held while it is out, fading once it goes in; the FIA's flag yellow", () => {
  assert.equal(Entrances.SIGN.colour, "#FEDD00");
  const m = {};
  assert.equal(Entrances.sign(m, false, 0), 0);
  assert.equal(Entrances.sign(m, true, 1000), 0);
  assert.ok(Entrances.sign(m, true, 1000 + Entrances.SIGN.inMs / 2) > 0.4);
  assert.equal(Entrances.sign(m, true, 1000 + Entrances.SIGN.inMs), 1);
  assert.equal(Entrances.sign(m, true, 9000), 1);
  // It goes in: fading over outMs, then gone.
  assert.ok(Math.abs(Entrances.sign(m, false, 9000 + 15) - (1 - 15 / Entrances.SIGN.outMs)) < 1e-9);
  const half = Entrances.sign(m, false, 9000 + Entrances.SIGN.outMs / 2);
  assert.ok(half > 0.3 && half < 0.7, `${half}`);
  assert.equal(Entrances.sign(m, false, 9000 + Entrances.SIGN.outMs + 20), 0);
  assert.equal(Entrances.sign(m, false, 60000), 0);
  // A replay sought back to before it was out: nothing left over.
  assert.equal(Entrances.sign(m, false, 500), 0);
  // Called again later: in again from nothing.
  assert.equal(Entrances.sign(m, true, 70000), 0);
  assert.equal(Entrances.sign(m, true, 70000 + Entrances.SIGN.inMs), 1);
});

test("the two signal sounds: their own recipes, unlike each other, each audible when rendered", () => {
  const { SAFETY_CAR, STEWARD_HIT } = SignalSounds;
  [SAFETY_CAR, STEWARD_HIT].forEach((recipe) => {
    assert.ok(recipe.length >= 3);
    recipe.forEach((n) => assert.ok(n.frequency > 0 && n.duration > 0 && n.volume > 0 && n.delay >= 0));
    const pcm = SignalSounds.render(recipe, 24000);
    const peak = pcm.reduce((a, v) => Math.max(a, Math.abs(v)), 0);
    assert.ok(peak > 0.1 && peak <= 1, `peak ${peak}`);
    const seconds = SignalSounds.length(recipe);
    assert.ok(seconds > 0.4 && seconds < 2, `${seconds} s`);
    assert.equal(pcm.length, Math.ceil((seconds + 0.05) * 24000));
  });
  // The Safety Car's: two notes alternating, four times.
  const notes = SAFETY_CAR.map((n) => n.frequency);
  assert.equal(new Set(notes).size, 2);
  assert.equal(notes.length, 8);
  notes.forEach((f, i) => assert.equal(f, notes[i % 2]));
  // The Steward's: high whistles and a low thud, none of the Safety Car's notes.
  assert.ok(STEWARD_HIT.some((n) => n.frequency > 2000) && STEWARD_HIT.some((n) => n.frequency < 200));
  assert.ok(STEWARD_HIT.every((n) => !notes.includes(n.frequency)));
});

test("a replay hears them too: the Safety Car's sound when it appears, the Steward's at the penalty's blast", () => {
  const Replay = require("../replay.js");
  const sample = (sc) => ({ objects: [], boxes: [], cars: [], safetyCar: sc });
  const samples = [sample(null), sample(null), sample({ d: 1, lat: 0 }), sample({ d: 2, lat: 0 })];
  const rec = {
    count: samples.length, chequerAt: 0, contacts: [],
    // (The penalty's blast is the big flash; a shot's bounce a small one.)
    flashes: [{ at: 150, x: 1, y: 2, size: 40 }, { at: 160, x: 1, y: 2, size: 5 }],
    indexAt: (t) => Math.max(0, Math.min(samples.length - 1, Math.floor(t / 100))),
    sampleAt: (k) => samples[k],
  };
  const types = (a, b) => Replay.eventsBetween(rec, a, b).map((e) => e.type).sort();
  assert.deepEqual(types(100, 199), ["impact", "steward"]);
  // Shrugged off (the smaller flash): no whistle. A car the blast spins: the
  // whistle, not a spin's sound too; a spin elsewhere still sounds.
  const car = (spinning, x) => ({ spinning, boosting: false, x, y: 2 });
  const spun = [{ ...sample(null), cars: [car(false, 1), car(false, 900)] }, { ...sample(null), cars: [car(true, 1), car(true, 900)] }];
  const rec2 = { ...rec, count: 2, flashes: [{ at: 150, x: 1, y: 2, size: 40 }], sampleAt: (k) => spun[k], indexAt: (t) => (t >= 100 ? 1 : 0) };
  assert.deepEqual(Replay.eventsBetween(rec2, 50, 199).map((e) => e.type).sort(), ["spin", "steward"]);
  assert.deepEqual(Replay.eventsBetween({ ...rec2, flashes: [{ at: 150, x: 1, y: 2, size: 20 }] }, 50, 199).map((e) => e.type).sort(), ["impact", "spin", "spin"]);
  // Called again after going in: its sound again.
  const again = [sample({ d: 1, lat: 0, leaving: true }), sample({ d: 1, lat: 0, leaving: false })];
  assert.deepEqual(Replay.eventsBetween({ ...rec, count: 2, flashes: [], sampleAt: (k) => again[k], indexAt: (t) => (t >= 100 ? 1 : 0) }, 50, 199).map((e) => e.type), ["safetyCar"]);
  assert.deepEqual(types(150, 250), ["impact", "safetyCar"]);
  // Once out, no more of it.
  assert.deepEqual(types(250, 350), []);
});

test("the flag is in the official's hand: the pole's foot at the wrist, the pole along the raised arm, held out low at rest", () => {
  const { FLAG_ARM } = Marshals;
  const length = Math.hypot(FLAG_ARM.wrist[0] - FLAG_ARM.shoulder[0], FLAG_ARM.wrist[1] - FLAG_ARM.shoulder[1]);
  // At rest: the arm down, the wrist where the model has it, the pole held out low, towards the road.
  const rest = Marshals.flagPose(0, 1.23);
  assert.equal(rest.angle, 0);
  assert.deepEqual(rest.wrist.map((v) => +v.toFixed(6)), FLAG_ARM.wrist);
  assert.equal(rest.lean, FLAG_ARM.rest);
  // Waving: through a whole swing the wrist stays the arm's length from the
  // shoulder, above the head, and the pole runs on along the arm.
  let low = Infinity;
  let high = -Infinity;
  for (let t = 0; t < 1; t += 0.01) {
    const p = Marshals.flagPose(1, t);
    const ax = p.wrist[0] - FLAG_ARM.shoulder[0];
    const ay = p.wrist[1] - FLAG_ARM.shoulder[1];
    assert.ok(Math.abs(Math.hypot(ax, ay) - length) < 1e-9);
    assert.ok(p.wrist[1] > FLAG_ARM.shoulder[1] + 0.3, "raised over the shoulder");
    // The pole's direction in the figure's frame: (sin lean, cos lean) forward and up.
    assert.ok(Math.abs(Math.sin(p.lean) - ax / length) < 1e-9 && Math.abs(Math.cos(p.lean) - ay / length) < 1e-9, "the pole along the arm");
    low = Math.min(low, p.angle);
    high = Math.max(high, p.angle);
  }
  assert.ok(high - low > 0.5, "it swings");
  // Halfway up: between the two.
  const half = Marshals.flagPose(0.5, 0);
  assert.ok(half.angle > 1 && half.angle < 1.6);
});
