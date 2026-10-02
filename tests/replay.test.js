const test = require("node:test");
const assert = require("node:assert/strict");
const Replay = require("../replay.js");

const STEP_MS = 1000 / 60;
const LAP = 6000;
const ITEMS = ["none", "drs", "overtakeMode", "formationLap", "oilSlick", "undercut", "debris", "stewardPenalty", "safetyCar"];
const SHOT_TYPES = Replay.OBJECT_TYPES;

// A seeded generator, so the synthetic race is the same every run.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function header(cars = 20, extra = {}) {
  return {
    trackId: "test", laps: 5, weather: "dry", lapLength: LAP, t0: 100000, stepMs: STEP_MS,
    items: ITEMS, boxes: 15, posts: 10, playerId: "car3",
    cars: Array.from({ length: cars }, (_, i) => ({ id: `car${i}`, name: `Driver ${i}`, code: `D${i}`, number: i + 1, team: `Team ${i % 10}`, color: "#dc0000", isPlayer: i === 3 })),
    ...extra,
  };
}

// A synthetic race: 20 cars driving round a circle-ish lap, with every kind
// of state changing (spins, items, shots appearing and going, the Safety Car,
// boxes, flags, keys).
function synthRace(samples, cars = 20, seed = 1) {
  const r = rng(seed);
  const out = [];
  const flags = Replay.FLAGS;
  let nextShot = 1;
  let shots = [];
  for (let k = 0; k < samples; k += 1) {
    const list = [];
    for (let c = 0; c < cars; c += 1) {
      const d = (k * 7.9 + c * 31 + r()) % LAP;
      list.push({
        x: 900 + Math.cos(d / 955) * 800 + r() * 1e-3, y: 550 + Math.sin(d / 955) * 500 - r() * 1e-3,
        d, heading: (r() - 0.5) * 2 * Math.PI, speed: r() * 260 - 20, lat: (r() - 0.5) * 120,
        gap: c === 0 ? 0 : c * 0.731 + r(), steer: r() * 2 - 1, throttle: r(),
        lap: Math.floor(k / 900), place: ((c + k) % cars) + 1, item: ITEMS[Math.floor(r() * ITEMS.length)],
        spinning: r() < 0.1, drs: r() < 0.2, boosting: r() < 0.2, formation: r() < 0.05, protected: r() < 0.05,
        drifting: r() < 0.3, driftRight: r() < 0.5, finished: r() < 0.02, trailingOil: r() < 0.05,
        offroad: r() < 0.1, underRoof: r() < 0.05, braking: r() < 0.3, roulette: r() < 0.05, charge: Math.floor(r() * 3),
      });
    }
    // About one item fired every second across the field (a busy race).
    if (r() < 0.035) shots.push({ id: nextShot++, type: SHOT_TYPES[Math.floor(r() * SHOT_TYPES.length)], d: r() * LAP, lat: (r() - 0.5) * 40, age: 0 });
    shots = shots.filter(() => r() > 0.05).map((s) => ({ ...s, d: (s.d + 9) % LAP, age: s.age + 1 / 30 }));
    out.push({
      cars: list,
      // Where each car was at the step between this sample and the next.
      mid: k % 97 === 96 ? null : list.map((c) => ({ x: c.x + 3 + r(), y: c.y - 2 - r(), heading: c.heading + 0.01 })),
      objects: shots.map((s) => ({ ...s })),
      safetyCar: r() < 0.5 ? { d: r() * LAP, lat: (r() - 0.5) * 30, leaving: r() < 0.5, parked: r() < 0.2 } : null,
      boxes: Array.from({ length: 15 }, () => r() < 0.3),
      flags: Array.from({ length: 10 }, () => flags[Math.floor(r() * 3)]),
      keys: { throttle: r() < 0.7, brake: r() < 0.2, left: r() < 0.3, right: r() < 0.3, drift: r() < 0.1, item: r() < 0.02 },
    });
  }
  return out;
}

const fround = Math.fround;

test("a recording plays back exactly as recorded, every field of every sample", () => {
  const race = synthRace(3000);
  const rec = Replay.createRecording(header());
  // As the game records: the sample, then (a step later) the cars' positions.
  race.forEach((s) => { rec.push({ ...s, mid: undefined }); if (s.mid) rec.pushMid(s.mid); });
  assert.equal(rec.count, 3000);
  race.forEach((want, k) => {
    const got = rec.sampleAt(k);
    // Exactly the stored (quantised) values, every field.
    assert.deepEqual(got, Replay.quantizeSample(want, rec.header), `sample ${k}`);
  });
  // And again: playback is the same every time (no state left behind by reading).
  assert.deepEqual(rec.sampleAt(1234), rec.sampleAt(1234));
  assert.deepEqual(rec.sampleAt(17), Replay.quantizeSample(race[17], rec.header));
});

test("quantisation stays inside the documented bounds", () => {
  const race = synthRace(400, 20, 9);
  const h = header();
  race.forEach((s) => {
    const q = Replay.quantizeSample(s, h);
    s.cars.forEach((c, i) => {
      const g = q.cars[i];
      assert.equal(g.x, fround(c.x));
      assert.equal(g.y, fround(c.y));
      assert.equal(g.d, fround(c.d));
      assert.ok(Math.abs(g.gap - c.gap) <= 1 / 100 + 1e-12, "gap");
      const dh = Math.abs(((g.heading - c.heading + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
      assert.ok(dh <= Math.PI / 65536 + 1e-12, `heading ${dh}`);
      assert.ok(Math.abs(g.speed - c.speed) <= 1 / 128 + 1e-12);
      assert.ok(Math.abs(g.lat - c.lat) <= 1 / 256 + 1e-12);
      assert.ok(Math.abs(g.steer - c.steer) <= 1 / 254 + 1e-12);
      assert.ok(Math.abs(g.throttle - c.throttle) <= 1 / 510 + 1e-12);
      ["lap", "place", "item", "spinning", "drs", "boosting", "formation", "protected", "drifting", "driftRight", "finished", "trailingOil", "offroad", "underRoof", "braking", "roulette", "charge"]
        .forEach((f) => assert.equal(g[f], c[f], f));
    });
    q.objects.forEach((o, i) => {
      assert.equal(o.id, s.objects[i].id);
      assert.equal(o.type, s.objects[i].type);
      assert.equal(o.d, fround(s.objects[i].d));
      assert.ok(Math.abs(o.age - s.objects[i].age) <= 0.0005 + 1e-12);
    });
  });
});

test("frames between samples are interpolated; discrete states come from the earlier sample", () => {
  const h = header(2);
  const rec = Replay.createRecording(h);
  const car = (x, heading, extra = {}) => ({ x, y: 10, d: x, heading, speed: 100, lat: 0, gap: 0, steer: 0, throttle: 1, lap: 0, place: 1, item: "none", ...extra });
  const s = (a, b, objects = []) => ({ cars: [a, b], objects, safetyCar: null, boxes: [], flags: [], keys: {} });
  rec.push(s(car(100, 3.1), car(500, 0, { spinning: false }), [{ id: 4, type: "debris", d: 50, lat: 2, age: 0.5 }]));
  rec.push(s(car(110, -3.1), car(700, 0, { spinning: true }), [{ id: 4, type: "debris", d: 60, lat: 4, age: 0.6 }, { id: 5, type: "undercut", d: 300, lat: 0, age: 0 }]));
  const ms = rec.sampleMs;
  assert.equal(ms, 2 * STEP_MS);
  const f = rec.frameAt(h.t0 + ms / 2);
  assert.equal(f.k, 0);
  assert.ok(Math.abs(f.alpha - 0.5) < 1e-9);
  assert.ok(Math.abs(f.cars[0].x - 105) < 1e-4);
  // The short way round across ±π: 3.1 to -3.1 passes through π, not 0.
  assert.ok(Math.abs(Math.abs(f.cars[0].heading) - Math.PI) < 0.01, `heading ${f.cars[0].heading}`);
  // A jump (200 in one sample) is not smeared across the gap.
  assert.ok(f.cars[1].x === 500 || f.cars[1].x === 700, `jump drawn at ${f.cars[1].x}`);
  // On/off states from the earlier sample.
  assert.equal(f.cars[1].spinning, false);
  // Shots matched by id are interpolated; a new one is drawn where it is.
  const debris = f.objects.find((o) => o.id === 4);
  assert.ok(Math.abs(debris.d - 55) < 1e-4 && Math.abs(debris.lat - 3) < 1e-3);
  assert.equal(f.objects.find((o) => o.id === 5), undefined);
  // Lap distance wraps the short way across the line.
  const w = Replay.createRecording(header(1));
  w.push({ cars: [car(0, 0, { d: LAP - 4 })], objects: [], safetyCar: null, boxes: [], flags: [], keys: {} });
  w.push({ cars: [car(4, 0, { d: 4 })], objects: [], safetyCar: null, boxes: [], flags: [], keys: {} });
  const mid = w.frameAt(w.header.t0 + w.sampleMs / 2).cars[0].d;
  assert.ok(Math.abs(mid) < 1e-3 || Math.abs(mid - LAP) < 1e-3, `wrapped d ${mid}`);
});

test("positions are kept every step: a frame at an odd step is exactly the car there", () => {
  const h = header(1);
  const rec = Replay.createRecording(h);
  const car = (x, y, heading) => ({ x, y, d: x, heading, speed: 100, lat: 0, gap: 0, steer: 0, throttle: 1, lap: 0, place: 1, item: "none" });
  const s = (c) => ({ cars: [c], objects: [], safetyCar: null, boxes: [], flags: [], keys: {} });
  rec.push(s(car(100, 10, 0)));
  // The step between: not on the straight line (a shove from a contact).
  rec.pushMid([{ x: 104, y: 14, heading: 0.2 }]);
  rec.push(s(car(108, 10, 0)));
  const at = (steps) => rec.frameAt(h.t0 + steps * STEP_MS).cars[0];
  assert.equal(at(1).x, 104);
  assert.equal(at(1).y, 14);
  assert.ok(Math.abs(at(1).heading - 0.2) < 1e-4);
  // Between steps, as the race draws them (placeForDrawing): straight between the two.
  assert.ok(Math.abs(at(0.5).x - 102) < 1e-4 && Math.abs(at(0.5).y - 12) < 1e-4);
  assert.ok(Math.abs(at(1.5).x - 106) < 1e-4 && Math.abs(at(1.5).y - 12) < 1e-4);
  assert.equal(at(2).x, 108);
  // The sample reads back with its step-between positions.
  assert.deepEqual(rec.sampleAt(0).mid, [{ x: 104, y: 14, heading: rec.sampleAt(0).mid[0].heading }]);
  assert.equal(rec.sampleAt(1).mid, null);
});

test("seeking lands on the right sample, before the start and after the end too", () => {
  const race = synthRace(500, 4, 3);
  const h = header(4);
  const rec = Replay.createRecording(h);
  race.forEach((s) => rec.push(s));
  const ms = rec.sampleMs;
  assert.equal(rec.indexAt(h.t0), 0);
  assert.equal(rec.indexAt(h.t0 - 5000), 0);
  assert.equal(rec.indexAt(h.t0 + 123 * ms + 0.1), 123);
  assert.equal(rec.indexAt(h.t0 + 1e9), 499);
  assert.equal(rec.duration, 499 * ms);
  // A frame exactly on a sample is that sample, as recorded.
  const f = rec.frameAt(h.t0 + 321 * ms);
  const q = rec.sampleAt(321);
  f.cars.forEach((c, i) => {
    assert.equal(c.x, q.cars[i].x);
    assert.equal(c.y, q.cars[i].y);
    assert.equal(c.place, q.cars[i].place);
  });
  // Seeking anywhere, in any order, gives the same frame each time.
  const a = JSON.stringify(rec.frameAt(h.t0 + 100.5 * ms));
  rec.frameAt(h.t0 + 400 * ms);
  rec.frameAt(h.t0 + 3 * ms);
  assert.equal(JSON.stringify(rec.frameAt(h.t0 + 100.5 * ms)), a);
  // The end is held.
  assert.deepEqual(rec.frameAt(h.t0 + 1e9).cars, rec.frameAt(h.t0 + 499 * ms).cars);
});

test("memory: a 20-car race is within budget", () => {
  const perMinute = 30 * 60;
  const rec = Replay.createRecording(header());
  // Four minutes (a typical race), so the last chunk's slack is not a quarter of it.
  synthRace(perMinute * 4).forEach((s) => { rec.push(s); if (s.mid) rec.pushMid(s.mid); });
  const total = rec.bytes() / 1e6;
  const mb = total / 4;
  assert.ok(mb <= 1.45, `${mb.toFixed(3)} MB a minute`);
  // A typical race comfortably under 10 MB.
  assert.ok(total < 6, `${total.toFixed(2)} MB for four minutes`);
});

test("flashes and the chequer are kept as events, active over their time", () => {
  const h = header(1);
  const rec = Replay.createRecording(h);
  const base = { cars: [{ x: 0, y: 0, d: 0, heading: 0, speed: 0, lat: 0, gap: 0, steer: 0, throttle: 0, lap: 0, place: 1, item: "none" }], objects: [], safetyCar: null, boxes: [], flags: [], keys: {} };
  for (let k = 0; k < 100; k += 1) rec.push(base);
  rec.addFlash({ x: 5, y: 6, d: 7, color: "#ff3b30", size: 12, at: h.t0 + 500, until: h.t0 + 900 });
  rec.chequerAt = h.t0 + 1200;
  assert.equal(rec.frameAt(h.t0 + 400).flashes.length, 0);
  const on = rec.frameAt(h.t0 + 700).flashes;
  assert.equal(on.length, 1);
  assert.ok(Math.abs(on[0].t - 0.5) < 1e-9);
  assert.equal(rec.frameAt(h.t0 + 950).flashes.length, 0);
});

// A fake course: a circle of radius 1000 round (0, 0), road half-width 40,
// barriers 30 beyond, with an occupied building on one side.
function fakeCourse() {
  const R = 1000;
  const total = 2 * Math.PI * R;
  const n = 1000;
  const samples = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * 2 * Math.PI;
    return { i, d: (i / n) * total, x: Math.cos(a) * R, y: Math.sin(a) * R, h: 0, nx: Math.cos(a), ny: Math.sin(a), outerL: 70, outerR: 70 };
  });
  const placed = [{ x: 0, z: 1200, r: 60 }];
  return {
    track: { totalLength: total }, street: false, samples,
    sampleAt: (d) => samples[((Math.round((d * n) / total) % n) + n) % n],
    clearance: (x, z) => Math.abs(Math.hypot(x, z) - R) - 72,
    occupied: {
      blocked: (x, z, r) => placed.some((o) => (o.x - x) ** 2 + (o.z - z) ** 2 < (o.r + r) ** 2),
      add: (x, z, r) => placed.push({ x, z, r }),
    },
    placed,
  };
}

test("TV cameras stand off the track, claim their ground, and cover the whole lap", () => {
  const course = fakeCourse();
  const before = course.placed.length;
  const cams = Replay.placeTvCameras(course, { height: 26 });
  const L = course.track.totalLength;
  assert.ok(cams.length >= Math.floor(L / 600), `${cams.length} cameras`);
  cams.forEach((c) => {
    assert.ok(course.clearance(c.x, c.z) >= Replay.TV_CAM.radius + Replay.TV_CAM.margin - 1e-9, "outside the barriers");
    assert.ok(Math.hypot(c.x - 0, c.z - 1200) >= 60 + Replay.TV_CAM.radius - 1e-9, "not on the building");
    assert.equal(c.y, 26);
  });
  // Each one claimed.
  assert.equal(course.placed.length, before + cams.length);
  // Every lap distance has exactly one camera; it cuts to the next as the car moves on.
  let last = null;
  let cuts = 0;
  for (let d = 0; d < L; d += 5) {
    const k = Replay.tvCameraFor(cams, d, L);
    assert.ok(k >= 0 && k < cams.length);
    if (last !== null && k !== last) { cuts += 1; assert.equal(k, (last + 1) % cams.length, "cuts to the next camera"); }
    last = k;
  }
  // (Round the lap once: every camera hands over to the next, the last to the first.)
  assert.equal(cuts, cams.length);
  // A camera sees the car coming: it is chosen well before the car reaches it.
  cams.forEach((c, k) => assert.equal(Replay.tvCameraFor(cams, ((c.d - 0.5 * L / cams.length) % L + L) % L, L), k));
});

test("a TV camera prefers the spot that can see its stretch", () => {
  const course = fakeCourse();
  // Everything seen from outside the circle is hidden; from inside, clear.
  const cams = Replay.placeTvCameras(course, { height: 26, visible: (from) => Math.hypot(from.x, from.z) < 1000 });
  assert.ok(cams.every((c) => Math.hypot(c.x, c.z) < 1000), "all on the inside, where they can see");
});

test("the zoom keeps the car the same size in the frame", () => {
  const near = Replay.zoomFov(300);
  const far = Replay.zoomFov(600);
  assert.ok(far < near);
  const width = (fov, dist) => 2 * dist * Math.tan((fov * Math.PI) / 360) * (16 / 9);
  assert.ok(Math.abs(width(near, 300) - width(far, 600)) < 1e-6);
  assert.equal(Replay.zoomFov(1), Replay.TV_CAM.maxFov);
  assert.equal(Replay.zoomFov(1e6), Replay.TV_CAM.minFov);
});

// A small recording where cars 2 and 3 (places 4 and 5) run nose to tail.
function battleRecording(seconds = 60) {
  const h = header(8, { playerId: "car7" });
  const rec = Replay.createRecording(h);
  const n = Math.round((seconds * 1000) / (2 * STEP_MS));
  for (let k = 0; k < n; k += 1) {
    const gaps = [0, 3, 6.5, 9.2, 9.6, 14, 20, 25];
    rec.push({
      cars: gaps.map((gap, i) => ({ x: i, y: 0, d: (k * 4 + 1000 - i * 40) % LAP, heading: 0, speed: 200, lat: 0, gap, steer: 0, throttle: 1, lap: 0, place: i + 1, item: "none" })),
      objects: [], safetyCar: null, boxes: [], flags: [], keys: {},
    });
  }
  return rec;
}

test("the director cuts the race into shots, opens on the helicopter and follows the closest battle", () => {
  const rec = battleRecording();
  const shots = Replay.directorShots(rec);
  assert.equal(shots[0].start, 0);
  assert.equal(shots[0].mode, "helicopter");
  shots.forEach((s, i) => { if (i) assert.equal(s.start, shots[i - 1].end); });
  assert.equal(shots[shots.length - 1].end, rec.duration);
  // The battle for 4th (0.4 s): the attacker in 5th is followed.
  assert.ok(shots.slice(1).every((s) => s.focusId === "car4"), JSON.stringify(shots.map((s) => s.focusId)));
  const modes = new Set(shots.map((s) => s.mode));
  ["trackside", "onboard", "helicopter"].forEach((m) => assert.ok(modes.has(m), m));
  // The same every time.
  assert.deepEqual(Replay.directorShots(rec), shots);
  assert.equal(Replay.shotAt(shots, 13000).start, shots.find((s) => s.start <= 13000 && s.end > 13000).start);
});

test("with no battle at the front the director follows the player", () => {
  const h = header(4, { playerId: "car3" });
  const rec = Replay.createRecording(h);
  for (let k = 0; k < 900; k += 1) {
    rec.push({ cars: [0, 5, 11, 18].map((gap, i) => ({ x: i, y: 0, d: k, heading: 0, speed: 1, lat: 0, gap, steer: 0, throttle: 1, lap: 0, place: i + 1, item: "none" })), objects: [], safetyCar: null, boxes: [], flags: [], keys: {} });
  }
  const shots = Replay.directorShots(rec);
  assert.ok(shots.slice(1).every((s) => s.focusId === "car3"));
});

test("next and previous car go by the running order, round the ends", () => {
  const cars = [{ id: "a", place: 2 }, { id: "b", place: 1 }, { id: "c", place: 3 }];
  assert.equal(Replay.neighbour(cars, "b", 1), "a");
  assert.equal(Replay.neighbour(cars, "a", 1), "c");
  assert.equal(Replay.neighbour(cars, "c", 1), "b");
  assert.equal(Replay.neighbour(cars, "b", -1), "c");
});

test("a car's controls read straight from the recording, as the full sample has them", () => {
  const race = synthRace(300, 6, 5);
  const rec = Replay.createRecording(header(6));
  race.forEach((s) => rec.push(s));
  for (let k = 0; k < 300; k += 37) {
    const full = rec.sampleAt(k);
    for (let i = 0; i < 6; i += 1) {
      const c = rec.controls(k, i);
      assert.equal(c.throttle, full.cars[i].throttle);
      assert.equal(c.brake, full.cars[i].braking);
      assert.equal(c.steer, full.cars[i].steer);
      assert.deepEqual(c.keys, full.keys);
    }
  }
});
