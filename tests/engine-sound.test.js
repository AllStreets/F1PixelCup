const test = require("node:test");
const assert = require("node:assert/strict");
const EngineSound = require("../engine-sound.js");

const DT = 1 / 60;

// Runs the model through a list of [seconds, input] phases; returns every step.
function drive(phases, seed = 7) {
  const model = EngineSound.createModel(seed);
  const out = [];
  phases.forEach(([seconds, input]) => {
    for (let t = 0; t < seconds; t += DT) {
      const inp = typeof input === "function" ? input(t) : input;
      out.push({ ...model.step({ dt: DT, ...inp }), input: inp });
    }
  });
  return out;
}

const full = (ratio) => ({ ratio, throttle: 1, brake: 0 });

test("accelerating flat out climbs through the gears: each upshift drops the revs", () => {
  const run = drive([[14, (t) => full(Math.min(1, t / 12))]]);
  const ups = run.map((s, i) => [s, i]).filter(([s]) => s.shift === "up");
  assert.ok(ups.length >= 6, `${ups.length} upshifts`);
  ups.forEach(([, i]) => assert.ok(run[i].rpm < run[i - 1].rpm - 800, `drop at ${i}: ${run[i - 1].rpm} -> ${run[i].rpm}`));
  assert.equal(run[run.length - 1].gear, EngineSound.GEARS);
  run.forEach((s) => assert.ok(s.rpm >= EngineSound.IDLE_RPM - 1 && s.rpm <= EngineSound.LIMIT_RPM + 1, `rpm ${s.rpm}`));
});

test("flat out at top speed the engine is alive, not a static note, but never wild", () => {
  const run = drive([[6, full(1)], [20, full(1)]]).slice(360);
  const rpms = run.map((s) => s.rpm);
  const range = Math.max(...rpms) - Math.min(...rpms);
  assert.ok(range > 60, `rpm range ${range}`);
  assert.ok(range < 700, `rpm range ${range}`);
  // From one step to the next it moves smoothly (no jumps that would click).
  for (let i = 1; i < rpms.length; i += 1) assert.ok(Math.abs(rpms[i] - rpms[i - 1]) < 40, `step ${i}`);
  // The turbo is spooled; the hybrid deploys, then clips when its store runs
  // dry down a long straight (the note changes with it).
  assert.ok(run.every((s) => s.turbo > 0.8));
  const ers = run.map((s) => s.ers);
  assert.ok(Math.max(...ers) > 0.7 && Math.min(...ers) < 0.2, `ers ${Math.min(...ers)}..${Math.max(...ers)}`);
  // No pops at a steady full throttle.
  assert.equal(run.reduce((n, s) => n + s.pops.length, 0), 0);
});

test("lifting off at high revs crackles and pops; at low revs it does not", () => {
  const high = drive([[8, full(0.95)], [1.2, { ratio: 0.9, throttle: 0, brake: 0 }]]);
  const pops = high.flatMap((s) => s.pops);
  assert.ok(pops.length >= 3 && pops.length <= 12, `${pops.length} pops`);
  pops.forEach((p) => assert.ok(p.delay >= 0 && p.delay < 0.8 && p.level > 0 && p.level <= 1));
  // A lift brings the blow-off whoosh with it.
  assert.ok(high.some((s) => s.whoosh));
  const low = drive([[3, full(0.12)], [1.2, { ratio: 0.1, throttle: 0, brake: 0 }]]);
  assert.equal(low.flatMap((s) => s.pops).length, 0);
});

test("braking into a corner downshifts, with a blip and a pop or two on each", () => {
  const run = drive([[10, full(1)], [3, (t) => ({ ratio: Math.max(0.25, 1 - t / 3 * 0.75), throttle: 0, brake: 1 })]]);
  const late = run.slice(600);
  const downs = late.filter((s) => s.shift === "down");
  assert.ok(downs.length >= 3, `${downs.length} downshifts`);
  assert.ok(downs.every((s) => s.blip > 0));
  // Each downshift off the throttle brings its own pops (not the lift's).
  downs.forEach((s) => assert.ok(s.pops.length >= 1 && s.pops.every((p) => p.delay < 0.25), JSON.stringify(s.pops)));
});

test("the hybrid recharges under braking and deploys again", () => {
  const run = drive([[26, full(1)], [4, { ratio: 0.5, throttle: 0, brake: 1 }], [3, full(0.7)]]);
  const clipped = run[26 * 60 - 1].ers;
  const after = run[run.length - 1].ers;
  assert.ok(clipped < 0.2 && after > 0.6, `${clipped} -> ${after}`);
});

test("the same seed and inputs give the same sound, step for step", () => {
  const phases = [[5, (t) => full(Math.min(1, t / 4))], [1, { ratio: 0.8, throttle: 0, brake: 0.5 }]];
  assert.deepEqual(drive(phases, 3), drive(phases, 3));
  assert.notDeepEqual(drive(phases, 3).map((s) => s.rpm), drive(phases, 4).map((s) => s.rpm));
});

test("Doppler: coming closer raises the note, going away lowers it", () => {
  assert.equal(EngineSound.doppler(0), 1);
  assert.ok(EngineSound.doppler(-200) > 1.05);
  assert.ok(EngineSound.doppler(200) < 0.95);
  // 238 units/s (about 40 m/s) straight at the listener: about 13% up.
  assert.ok(Math.abs(EngineSound.doppler(-238) - 2042 / (2042 - 238)) < 1e-9);
  // Held within sane bounds whatever the input.
  assert.ok(EngineSound.doppler(-1e6) <= 1.5 && EngineSound.doppler(1e6) >= 0.6);
});

test("how loud a sound is from the camera: near is full, far fades, onboard is close", () => {
  assert.equal(EngineSound.distanceGain(0), 1);
  assert.ok(EngineSound.distanceGain(300) < 0.5 && EngineSound.distanceGain(300) > 0.1);
  assert.ok(EngineSound.distanceGain(3000) < 0.05);
  assert.ok(EngineSound.distanceGain(100) > EngineSound.distanceGain(200));
});

test("replay speed: real time is heard as it is; 0.5x and 2x are pitched gently; 0.25x, 4x and pause are quiet", () => {
  assert.deepEqual(EngineSound.replayMix(1, true), { engine: 1, pitch: 1, events: true, ambience: 1 });
  const half = EngineSound.replayMix(0.5, true);
  const twice = EngineSound.replayMix(2, true);
  assert.ok(half.engine > 0 && half.pitch < 1 && half.pitch > 0.6 && half.events);
  assert.ok(twice.engine > 0 && twice.pitch > 1 && twice.pitch < 1.5 && twice.events);
  for (const s of [0.25, 4]) {
    const m = EngineSound.replayMix(s, true);
    assert.equal(m.engine, 0);
    assert.equal(m.events, false);
    assert.ok(m.ambience > 0 && m.ambience < 1);
  }
  assert.deepEqual(EngineSound.replayMix(1, false), { engine: 0, pitch: 1, events: false, ambience: 0 });
});

test("primed for a car already at speed (a replay cutting to it), the engine is in its gear at once", () => {
  for (const ratio of [0.1, 0.35, 0.6, 0.8, 1]) {
    const model = EngineSound.createModel(5);
    model.prime({ ratio, throttle: 1 });
    const first = model.step({ dt: DT, ratio, throttle: 1, brake: 0 });
    assert.equal(first.shift, null, `ratio ${ratio}`);
    assert.ok(first.rpm > 7000 || ratio < 0.2, `ratio ${ratio}: ${first.rpm}`);
    // And it stays there: no gear change for a second at that speed.
    for (let i = 0; i < 60; i += 1) assert.equal(model.step({ dt: DT, ratio, throttle: 1, brake: 0 }).shift, null);
  }
});

// ---- Starting up ----

test("start-up: the starter turns it over, it catches unevenly, flares, settles roughly to idle, then blips", () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const s = EngineSound.startup(seed);
    // The starter cranks for about half a second or more, slowly.
    assert.ok(s.catchAt > 0.45 && s.catchAt < 0.95, `catch at ${s.catchAt}`);
    for (let t = 0.05; t < s.catchAt; t += 0.05) assert.ok(s.at(t).rpm < 700 && s.at(t).starter > 0.5, `cranking at ${t}`);
    // It catches on a few fires, unevenly spaced.
    assert.ok(s.fires.length >= 3 && s.fires.length <= 6);
    const gaps = s.fires.slice(1).map((f, i) => f - s.fires[i]);
    assert.ok(Math.max(...gaps) / Math.min(...gaps) > 1.25, `gaps ${gaps}`);
    // The flare over idle, then idle (roughly at first) before the first blip.
    const flare = Math.max(...Array.from({ length: 60 }, (_, i) => s.at(s.runAt + i * 0.01).rpm));
    assert.ok(flare > EngineSound.IDLE_RPM + 800 && flare < 7500, `flare ${flare}`);
    const settled = s.at(s.blips[0].at - 0.05);
    assert.ok(Math.abs(settled.rpm - EngineSound.IDLE_RPM) < 350, `settled ${settled.rpm}`);
    assert.ok(s.at(s.runAt + 0.3).rough > settled.rough && settled.rough < 0.35);
    assert.equal(settled.starter, 0);
    // Two or three blips of throttle, each up and back.
    assert.ok(s.blips.length >= 2 && s.blips.length <= 3);
    s.blips.forEach((b) => {
      assert.ok(b.peak > 6500 && b.peak < 10500);
      assert.ok(s.at(b.at + b.rise).rpm > b.peak - 300);
      assert.ok(s.at(b.at + b.rise * 0.9).load > 0.6);
    });
    assert.ok(Math.abs(s.at(s.duration).rpm - EngineSound.IDLE_RPM) < 500);
    assert.ok(s.duration > 2.6 && s.duration < 4.9, `duration ${s.duration}`);
  }
});

test("start-up: every car's is its own, and the same every time for that car", () => {
  const a = EngineSound.startup(11);
  const b = EngineSound.startup(12);
  assert.deepEqual(EngineSound.startup(11).fires, a.fires);
  assert.notDeepEqual(a.fires, b.fires);
  assert.notEqual(a.catchAt, b.catchAt);
  const x = EngineSound.renderStartup(11, 8000);
  assert.deepEqual(Array.from(EngineSound.renderStartup(11, 8000).slice(0, 4000)), Array.from(x.slice(0, 4000)));
});

// The old sound at a start: the oscillators' steady note (a saw and a square
// a fifth apart, as the engine was before; or the idle's saw and octave).
function oldNote(seconds, sr) {
  const out = new Float32Array(Math.floor(seconds * sr));
  for (let i = 0; i < out.length; i += 1) {
    const t = i / sr;
    const saw = (f) => 2 * ((t * f) % 1) - 1;
    out[i] = 0.5 * saw(100) + 0.2 * saw(200) + 0.2 * Math.sign(Math.sin(2 * Math.PI * 50 * t));
  }
  return out;
}

test("start-up: it sounds like an engine, noise and uneven harmonics, not a clean synthesiser note", () => {
  const sr = 16000;
  const audio = EngineSound.renderStartup(5, sr);
  const s = EngineSound.startup(5);
  assert.equal(audio.length, Math.ceil(s.duration * sr));
  audio.forEach((v) => assert.ok(v >= -1 && v <= 1 && !Number.isNaN(v)));
  const slice = (from, to) => audio.slice(Math.floor(from * sr), Math.floor(to * sr));
  const old = EngineSound.spectralFlatness(oldNote(0.5, sr), sr);
  // Cranking is mostly noise; the settle and the blips are far less pure than the old note.
  const crank = EngineSound.spectralFlatness(slice(0.1, s.catchAt), sr);
  const settle = EngineSound.spectralFlatness(slice(s.runAt + 0.2, s.blips[0].at), sr);
  const blip = EngineSound.spectralFlatness(slice(s.blips[0].at, s.blips[0].at + 0.4), sr);
  assert.ok(old < 0.02, `old ${old}`);
  assert.ok(crank > old * 5 && crank > 0.06, `crank ${crank}`);
  assert.ok(settle > old * 4 && settle > 0.04, `settle ${settle} against ${old}`);
  assert.ok(blip > old * 5 && blip > 0.06, `blip ${blip}`);
  // Loud enough to hear all through, and never clipping flat.
  const rms = (a) => Math.sqrt(a.reduce((n, v) => n + v * v, 0) / a.length);
  const levels = [rms(slice(0.1, s.catchAt)), rms(slice(s.runAt, s.duration))];
  assert.ok(levels[0] > 0.03 && levels[1] > 0.08 && levels[0] < 0.45 && levels[1] < 0.45, `levels ${levels}`);
});

test("a car's speed jumping (rolled out of the pit lane, a rescue) does not run up through the gears", () => {
  const model = EngineSound.createModel(3);
  for (let i = 0; i < 30; i += 1) model.step({ dt: DT, ratio: 0, throttle: 0, brake: 0 });
  // From a standstill to 60% of top speed in one step, and held there.
  let shifts = 0;
  let first = null;
  for (let i = 0; i < 120; i += 1) {
    const s = model.step({ dt: DT, ratio: 0.6, throttle: 1, brake: 0 });
    if (!first) first = s;
    if (s.shift) shifts += 1;
  }
  assert.equal(shifts, 0);
  assert.ok(first.gear >= 5 && first.rpm > 9000, `${first.gear} ${first.rpm}`);
});

test("the start plan: qualifying is your own car; a race start is yours and the field's around you, staggered", () => {
  const quali = EngineSound.startPlan("qualifying", 7, []);
  assert.deepEqual(quali, [{ seed: 7, delay: 0, gain: 1, rate: 1, own: true }]);
  const field = [21, 22, 23, 24, 25, 26, 27, 28];
  const race = EngineSound.startPlan("race", 7, field);
  assert.equal(race[0].own, true);
  const others = race.slice(1);
  assert.ok(others.length >= 4 && others.length <= 6);
  others.forEach((o, i) => {
    assert.ok(field.includes(o.seed));
    assert.ok(o.gain < 0.6 && o.gain > 0.1 && o.delay > 0 && o.delay < 1.6);
    assert.ok(o.rate > 0.9 && o.rate < 1.1 && o.rate !== 1);
    if (i) assert.ok(o.delay > others[i - 1].delay, "one after another");
  });
  assert.deepEqual(EngineSound.startPlan("race", 7, field), race);
});
