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
        gap: c === 0 ? 0 : c * 0.731 + r(), steer: r() * 2 - 1, throttle: r(), brake: r() < 0.5 ? 0 : r(),
        lap: Math.floor(k / 900), place: ((c + k) % cars) + 1, item: ITEMS[Math.floor(r() * ITEMS.length)],
        spinning: r() < 0.1, drs: r() < 0.2, boosting: r() < 0.2, formation: r() < 0.05, protected: r() < 0.05,
        drifting: r() < 0.3, driftRight: r() < 0.5, finished: r() < 0.02, trailingOil: r() < 0.05,
        offroad: r() < 0.1, underRoof: r() < 0.05, roulette: r() < 0.05, charge: Math.floor(r() * 3),
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
      // The brake as applied (a fraction in traffic, full for a corner).
      assert.ok(Math.abs(g.brake - c.brake) <= 1 / 510 + 1e-12, "brake");
      ["lap", "place", "item", "spinning", "drs", "boosting", "formation", "protected", "drifting", "driftRight", "finished", "trailingOil", "offroad", "underRoof", "roulette", "charge"]
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

test("the edges of every field read back as written out here (clamps, wraps, unknowns)", () => {
  const h = header(1);
  const rec = Replay.createRecording(h);
  const base = { x: 1, y: 2, d: 3, heading: 0, speed: 0, lat: 0, gap: 0, steer: 0, throttle: 0, brake: 0, lap: 0, place: 1, item: "none" };
  const cases = [
    [{ gap: 1400 }, { gap: 1310.7 }],
    [{ gap: -1 }, { gap: 0 }],
    [{ heading: 3 * Math.PI }, { heading: -Math.PI }],
    [{ heading: Math.PI }, { heading: -Math.PI }],
    [{ heading: -4 * Math.PI }, { heading: 0 }],
    [{ lap: 300 }, { lap: 255 }],
    [{ place: -2 }, { place: 0 }],
    [{ item: "not an item" }, { item: "none" }],
    [{ speed: 600 }, { speed: 511.984375 }],
    [{ speed: -700 }, { speed: -512 }],
    [{ lat: 300 }, { lat: 255.9921875 }],
    [{ steer: 3 }, { steer: 1 }],
    [{ throttle: -1, brake: 2 }, { throttle: 0, brake: 1 }],
    [{ charge: 7 }, { charge: 3 }],
  ];
  cases.forEach(([given]) => rec.push({ cars: [{ ...base, ...given }], objects: [], safetyCar: null, boxes: [], flags: [], keys: {} }));
  cases.forEach(([given, want], k) => {
    const got = rec.sampleAt(k).cars[0];
    Object.entries(want).forEach(([field, value]) => assert.equal(got[field], value, `${JSON.stringify(given)} -> ${field} ${got[field]}`));
  });
  // A shot's id wraps at 16 bits; its age is held to 65 s.
  rec.push({ cars: [base], objects: [{ id: 65537, type: "debris", d: 1, lat: 0, age: 99 }], safetyCar: null, boxes: [], flags: [], keys: {} });
  const shot = rec.sampleAt(cases.length).objects[0];
  assert.equal(shot.id, 1);
  assert.equal(shot.age, 65.535);
});

test("every sample reads back within the documented resolution of the race's own values", () => {
  const race = synthRace(600, 20, 4);
  const rec = Replay.createRecording(header());
  race.forEach((s) => rec.push(s));
  race.forEach((s, k) => {
    const got = rec.sampleAt(k);
    s.cars.forEach((c, i) => {
      const g = got.cars[i];
      assert.ok(Math.abs(g.x - c.x) <= Math.abs(c.x) * 2 ** -23 && Math.abs(g.y - c.y) <= Math.abs(c.y) * 2 ** -23, "x, y Float32");
      assert.ok(Math.abs(g.speed - c.speed) <= 1 / 128 + 1e-12 && Math.abs(g.gap - c.gap) <= 0.01 + 1e-12);
      assert.ok(Math.abs(g.throttle - c.throttle) <= 1 / 510 + 1e-12 && Math.abs(g.brake - c.brake) <= 1 / 510 + 1e-12);
      assert.equal(g.place, c.place);
      assert.equal(g.item, c.item);
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

test("the replay runs to the race's last step: the step after the last sample, when recorded", () => {
  const h = header(1);
  const rec = Replay.createRecording(h);
  const car = (x) => ({ x, y: 0, d: x, heading: 0, speed: 100, lat: 0, gap: 0, steer: 0, throttle: 1, lap: 0, place: 1, item: "none" });
  const s = (c) => ({ cars: [c], objects: [], safetyCar: null, boxes: [], flags: [], keys: {} });
  rec.push(s(car(100)));
  rec.pushMid([{ x: 104, y: 0, heading: 0 }]);
  rec.push(s(car(108)));
  assert.equal(rec.duration, rec.sampleMs);
  rec.pushMid([{ x: 112, y: 0, heading: 0 }]);
  assert.equal(rec.duration, rec.sampleMs + h.stepMs);
  assert.equal(rec.frameAt(h.t0 + rec.duration).cars[0].x, 112);
  assert.equal(rec.frameAt(h.t0 + 1e9).cars[0].x, 112);
  assert.ok(Math.abs(rec.frameAt(h.t0 + rec.sampleMs + h.stepMs / 2).cars[0].x - 110) < 1e-4);
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
  // (The last sample's step after it was recorded: the race's last step.)
  assert.equal(rec.duration, 499 * ms + h.stepMs);
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
  assert.deepEqual(rec.frameAt(h.t0 + 1e9).cars, rec.frameAt(h.t0 + rec.duration).cars);
});

test("memory: a 20-car race is within budget", () => {
  const perMinute = 30 * 60;
  const rec = Replay.createRecording(header());
  // Four minutes (a typical race), so the last chunk's slack is not a quarter of it.
  synthRace(perMinute * 4).forEach((s) => { rec.push(s); if (s.mid) rec.pushMid(s.mid); });
  const total = rec.bytes() / 1e6;
  const mb = total / 4;
  assert.ok(mb <= 1.5, `${mb.toFixed(3)} MB a minute`);
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

// Coverage from what each camera can see: four cameras round a 4000 lap.
function coverageCams() {
  const L = 4000;
  const cams = [500, 1500, 2500, 3500].map((d) => ({ d }));
  cams.forEach((c, k) => {
    const prev = cams[(k + 3) % 4];
    c.from = ((prev.d + 0.35 * 1000) % L + L) % L;
  });
  cams.forEach((c, k) => { c.to = cams[(k + 1) % 4].from; });
  return { L, cams };
}

test("coverage: each stretch goes to its own camera while that camera sees the car", () => {
  const { L, cams } = coverageCams();
  const cover = Replay.assignTvCoverage(cams, L, () => true);
  for (let d = 0; d < L; d += 7) assert.equal(Replay.tvCameraAt(cover, d), Replay.tvCameraFor(cams, d, L), `d ${d}`);
});

test("coverage: where a camera's view is blocked, a neighbour that sees the car takes it", () => {
  const { L, cams } = coverageCams();
  // A building hides 1000 to 1300 from camera 1 (it covers 850 to 1850);
  // camera 0 sees that stretch.
  const sees = (k, d) => !(k === 1 && d >= 1000 && d < 1300);
  const cover = Replay.assignTvCoverage(cams, L, sees);
  for (let d = 0; d < L; d += 5) {
    const k = Replay.tvCameraAt(cover, d);
    assert.ok(k >= 0 && sees(k, d), `d ${d}: camera ${k} cannot see it`);
  }
  assert.equal(Replay.tvCameraAt(cover, 1150), 0);
  // Once the car is clear again, the stretch's own camera has it.
  assert.equal(Replay.tvCameraAt(cover, 1600), 1);
});

test("coverage: where no camera sees the car (a tunnel) there is none, and only there", () => {
  const { L, cams } = coverageCams();
  const sees = (k, d) => !(d >= 2000 && d < 2400);
  const cover = Replay.assignTvCoverage(cams, L, sees);
  for (let d = 0; d < L; d += 5) {
    const k = Replay.tvCameraAt(cover, d);
    if (d >= 2000 + cover.bin && d < 2400 - cover.bin) assert.equal(k, -1, `d ${d}`);
    if (d < 2000 - cover.bin || d >= 2400 + cover.bin) assert.ok(k >= 0, `d ${d}`);
  }
});

test("coverage: a blip of a few metres (a lamp post) does not cut away and back", () => {
  const { L, cams } = coverageCams();
  // The post hides a little of the car: most of it is still in view.
  const sees = (k, d) => (k === 2 && d >= 2600 && d < 2620 ? 0.8 : 1);
  const cover = Replay.assignTvCoverage(cams, L, sees);
  for (let d = 2400; d < 2800; d += 2) assert.equal(Replay.tvCameraAt(cover, d), 2, `d ${d}`);
});

test("coverage: a short stretch where the car is really hidden is never handed back to the blind camera", () => {
  const { L, cams } = coverageCams();
  const sees = (k, d) => !(k === 2 && d >= 2600 && d < 2640);
  const cover = Replay.assignTvCoverage(cams, L, sees);
  for (let d = 2600; d < 2640; d += 2) assert.notEqual(Replay.tvCameraAt(cover, d), 2, `d ${d}`);
});

test("coverage: a blip across the line is kept as one, and the lap's two ends agree", () => {
  const { L, cams } = coverageCams();
  // Camera 3 (3500, covering 2850 to 3850 and on round to 0 by its stretch
  // ... here the line falls inside camera 0's stretch: 3850 to 850).
  const sees = (k, d) => (k === 0 && (d >= L - 20 || d < 20) ? 0.8 : 1);
  const cover = Replay.assignTvCoverage(cams, L, sees);
  for (const d of [L - 30, L - 10, 0, 10, 30]) assert.equal(Replay.tvCameraAt(cover, d), 0, `d ${d}`);
  // And a real blind run across the line goes elsewhere, with no -1.
  const blind = Replay.assignTvCoverage(cams, L, (k, d) => !(k === 0 && (d >= L - 40 || d < 40)));
  for (const d of [L - 30, L - 10, 0, 10, 30]) {
    const k = Replay.tvCameraAt(blind, d);
    assert.ok(k >= 0 && k !== 0, `d ${d}: ${k}`);
  }
  // The same camera both sides of the line (no cut at the line itself).
  assert.equal(Replay.tvCameraAt(blind, L - 10), Replay.tvCameraAt(blind, 10));
});

test("coverage: a lap that is not a whole number of bins tests its short last bin inside the lap", () => {
  const L = 4010;
  const cams = [500, 1500, 2500, 3500].map((d) => ({ d }));
  cams.forEach((c, k) => { c.from = ((cams[(k + 3) % 4].d + 350) % L + L) % L; });
  cams.forEach((c, k) => { c.to = cams[(k + 1) % 4].from; });
  const asked = [];
  Replay.assignTvCoverage(cams, L, (k, d) => { asked.push(d); return true; });
  assert.ok(asked.every((d) => d >= 0 && d < L), JSON.stringify(asked.filter((d) => d >= L)));
  assert.ok(asked.includes(4005), "the last bin's middle");
});

test("coverage: the cut to the next stretch falls on its boundary only when that camera sees there", () => {
  const { L, cams } = coverageCams();
  // Camera 1 (stretch from 850) cannot see 850 to 880: the cut waits.
  const cover = Replay.assignTvCoverage(cams, L, (k, d) => !(k === 1 && d >= 850 && d < 880));
  assert.equal(Replay.tvCameraAt(cover, 855), 0);
  assert.equal(Replay.tvCameraAt(Replay.assignTvCoverage(cams, L, () => true), 855), 1);
});

test("coverage: where no camera sees all of a stretch, the one that sees most of it (and most of the car) has it", () => {
  const { L, cams } = coverageCams();
  const sees = (k, d) => (d >= 2000 && d < 2200 ? [0.2, 0.5, 0.8, 0.4][k] : 1);
  const cover = Replay.assignTvCoverage(cams, L, sees);
  assert.equal(Replay.tvCameraAt(cover, 2100), 2);
  // Most of it, or none: below that the stretch has no camera.
  const dark = Replay.assignTvCoverage(cams, L, (k, d) => (d >= 2000 && d < 2200 ? 0.4 : 1));
  assert.equal(Replay.tvCameraAt(dark, 2100), -1);
});

test("coverage by lane: a car on the side of the road a camera cannot see goes to one that can", () => {
  const { L, cams } = coverageCams();
  // Camera 1 cannot see the outside lane (lane 2) from 1000 to 1300; it sees
  // the other lanes there.
  const sees = (k, d, lane) => !(k === 1 && lane === 2 && d >= 1000 && d < 1300);
  const cover = Replay.assignTvCoverageLanes(cams, L, sees, [-33, -11, 11, 33]);
  assert.equal(Replay.tvCameraAt(cover, 1150, 20), 0);
  assert.equal(Replay.tvCameraAt(cover, 1150, 0), 1);
  assert.equal(Replay.tvCameraAt(cover, 1150, -25), 1);
  // Off the road's edge counts as the outermost lane.
  assert.equal(Replay.tvCameraAt(cover, 1150, 40), 0);
  assert.equal(Replay.tvCameraAt(cover, 1600, 20), 1);
});

test("a TV camera goes only as high as it must to see its stretch (over a catch fence)", () => {
  const course = fakeCourse();
  // A fence: nothing is seen from below 50 up.
  const cams = Replay.placeTvCameras(course, { heights: [26, 50, 70], visible: (from) => from.y >= 50 });
  assert.ok(cams.length > 0 && cams.every((c) => c.y === 50), JSON.stringify(cams.map((c) => c.y)));
  // With a clear view it stays at the lowest.
  const low = Replay.placeTvCameras(fakeCourse(), { heights: [26, 50, 70], visible: () => true });
  assert.ok(low.every((c) => c.y === 26));
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
      assert.equal(c.brake, full.cars[i].brake);
      assert.equal(c.steer, full.cars[i].steer);
      assert.deepEqual(c.keys, full.keys);
    }
  }
});

test("a two-player race: player 2's keys are recorded and read back exactly, apart from player 1's", () => {
  const h = header(6, { players: ["car3", "car5"] });
  h.cars[5].isPlayer = true;
  const rec = Replay.createRecording(h);
  const race = synthRace(400, 6, 21);
  const r = rng(7);
  race.forEach((s) => { s.keys2 = { throttle: r() < 0.5, brake: r() < 0.3, left: r() < 0.3, right: r() < 0.3, drift: r() < 0.2, item: r() < 0.1 }; rec.push(s); });
  let differ = 0;
  race.forEach((want, k) => {
    const got = rec.sampleAt(k);
    assert.deepEqual(got.keys2, want.keys2, `sample ${k}`);
    assert.deepEqual(got, Replay.quantizeSample(want, rec.header), `sample ${k}`);
    assert.deepEqual(rec.controls(k, 5).keys2, want.keys2);
    if (JSON.stringify(got.keys) !== JSON.stringify(got.keys2)) differ += 1;
  });
  assert.ok(differ > 300, String(differ));
  // A single-player recording has no player 2: nothing pressed.
  const solo = Replay.createRecording(header(2));
  solo.push({ ...synthRace(1, 2)[0] });
  assert.deepEqual(solo.sampleAt(0).keys2, { throttle: false, brake: false, left: false, right: false, drift: false, item: false });
});

test("with no battle at the front the director alternates between two players", () => {
  const h = header(4, { playerId: "car1", players: ["car1", "car3"] });
  const rec = Replay.createRecording(h);
  for (let k = 0; k < 900; k += 1) {
    rec.push({ cars: [0, 5, 11, 18].map((gap, i) => ({ x: i, y: 0, d: k, heading: 0, speed: 1, lat: 0, gap, steer: 0, throttle: 1, lap: 0, place: i + 1, item: "none", finished: i === 3 && k > 600 })), objects: [], safetyCar: null, boxes: [], flags: [], keys: {} });
  }
  const shots = Replay.directorShots(rec);
  const early = shots.slice(1).filter((s) => s.start < 600 * rec.sampleMs - 6000);
  assert.ok(early.some((s) => s.focusId === "car1") && early.some((s) => s.focusId === "car3"), JSON.stringify(early.map((s) => s.focusId)));
  assert.ok(early.every((s) => s.focusId === "car1" || s.focusId === "car3"));
  // Once a player has finished, the one still racing.
  const late = shots.filter((s) => s.start > 601 * rec.sampleMs);
  assert.ok(late.length > 0 && late.every((s) => s.focusId === "car1"), JSON.stringify(late.map((s) => s.focusId)));
});

// ---- The viewer's choices: cameras and cars ----

test("switching cameras never changes the car the viewer is watching", () => {
  // The director has car "b" on screen when the viewer takes a camera.
  let view = Replay.viewChoice();
  view = Replay.chooseCamera(view, "trackside", "b");
  assert.equal(Replay.viewShot(view, { mode: "onboard", focusId: "z" }, "p").focusId, "b");
  for (const mode of ["onboard", "helicopter", "director", "trackside", "director", "onboard", "helicopter"]) {
    view = Replay.chooseCamera(view, mode, "x");
    // Whatever the director would cut to, and whichever car it would pick.
    for (const shot of [{ mode: "trackside", focusId: "q" }, { mode: "helicopter", focusId: "r" }]) {
      assert.equal(Replay.viewShot(view, shot, "p").focusId, "b", `${mode}`);
    }
  }
});

test("under the director with no car chosen, the director picks the cars; a chosen car stays", () => {
  let view = Replay.viewChoice();
  assert.deepEqual(Replay.viewShot(view, { mode: "helicopter", focusId: "q" }, "p"), { mode: "helicopter", focusId: "q", director: true, carChosen: false });
  // Picking a car keeps the director cutting cameras, on that car.
  view = Replay.chooseCar(view, "c");
  assert.deepEqual(Replay.viewShot(view, { mode: "onboard", focusId: "q" }, "p"), { mode: "onboard", focusId: "c", director: true, carChosen: true });
  // A camera chosen: that camera, still on that car.
  view = Replay.chooseCamera(view, "trackside", "q");
  assert.deepEqual(Replay.viewShot(view, { mode: "onboard", focusId: "q" }, "p"), { mode: "trackside", focusId: "c", director: false, carChosen: true });
  // Director again: cuts cameras on the same car.
  view = Replay.chooseCamera(view, "director", "q");
  assert.equal(Replay.viewShot(view, { mode: "onboard", focusId: "q" }, "p").focusId, "c");
  // Director pressed while it is on: the car choice goes back to the director.
  view = Replay.chooseCamera(view, "director", "c");
  assert.equal(Replay.viewShot(view, { mode: "onboard", focusId: "q" }, "p").focusId, "q");
});

test("a camera chosen with no car on screen yet watches the player", () => {
  const view = Replay.chooseCamera(Replay.viewChoice(), "onboard", null);
  assert.equal(Replay.viewShot(view, { mode: "trackside", focusId: "q" }, "p").focusId, "p");
});

// ---- What happened between two moments (the replay's sounds) ----

function eventsRecording() {
  const h = header(2);
  const rec = Replay.createRecording(h);
  const car = (extra = {}) => ({ x: 10, y: 20, d: 5, heading: 0, speed: 100, lat: 0, gap: 0, steer: 0, throttle: 1, lap: 0, place: 1, item: "none", ...extra });
  const boxes = (taken) => Array.from({ length: 15 }, (_, i) => taken && i === 4);
  for (let k = 0; k < 60; k += 1) {
    rec.push({
      cars: [car({ boosting: k >= 20 && k < 30, x: 10 + k }), car({ spinning: k >= 40, x: 500 })],
      objects: k >= 10 ? [{ id: 7, type: "undercut", d: 50 + k, lat: 0, age: 0 }] : [],
      safetyCar: null, boxes: boxes(k >= 25), flags: [], keys: {},
    });
  }
  rec.addFlash({ x: 300, y: 40, d: 9, color: "#ff3b30", size: 12, at: h.t0 + 35 * rec.sampleMs, until: h.t0 + 45 * rec.sampleMs });
  return rec;
}

test("the replay's events between two moments: a hit, an item fired, a box taken, a boost, a spin", () => {
  const rec = eventsRecording();
  const ms = rec.sampleMs;
  const at = (a, b) => Replay.eventsBetween(rec, rec.header.t0 + a * ms, rec.header.t0 + b * ms).map((e) => e.type).sort();
  assert.deepEqual(at(9, 10), ["item"]);
  assert.deepEqual(at(19, 20), ["boost"]);
  assert.deepEqual(at(24, 25), ["box"]);
  assert.deepEqual(at(34, 35), ["impact"]);
  assert.deepEqual(at(39, 40), ["spin"]);
  assert.deepEqual(at(0, 9), []);
  // Each is placed where it happened, for how loud it is from the camera.
  const hit = Replay.eventsBetween(rec, rec.header.t0 + 34 * ms, rec.header.t0 + 35 * ms)[0];
  assert.deepEqual([hit.x, hit.y], [300, 40]);
  const boost = Replay.eventsBetween(rec, rec.header.t0 + 19 * ms, rec.header.t0 + 20 * ms)[0];
  assert.equal(boost.car, 0);
  assert.equal(boost.x, 30);
});

test("a seek (or going backwards, or a long jump) has no events: they are heard only as the race plays", () => {
  const rec = eventsRecording();
  const ms = rec.sampleMs;
  assert.deepEqual(Replay.eventsBetween(rec, rec.header.t0 + 35 * ms, rec.header.t0 + 34 * ms), []);
  assert.deepEqual(Replay.eventsBetween(rec, rec.header.t0, rec.header.t0 + 59 * ms), []);
  assert.deepEqual(Replay.eventsBetween(rec, rec.header.t0 + 20 * ms, rec.header.t0 + 20 * ms), []);
});

test("contacts between cars are kept (once per knock) and heard; so is the player's chequered flag", () => {
  const rec = eventsRecording();
  const ms = rec.sampleMs;
  const t0 = rec.header.t0;
  // A knock, felt over several steps: kept once.
  for (let i = 0; i < 6; i += 1) rec.addContact({ x: 200 + i, y: 50, at: t0 + 15 * ms + i * 5 });
  // Another, elsewhere at the same time: kept too.
  rec.addContact({ x: 900, y: 50, at: t0 + 15 * ms + 3 });
  assert.equal(rec.contacts.length, 2);
  const at = (a, b) => Replay.eventsBetween(rec, t0 + a * ms, t0 + b * ms).map((e) => e.type).sort();
  assert.deepEqual(at(14, 16), ["contact", "contact"]);
  rec.chequerAt = t0 + 50 * ms;
  assert.deepEqual(at(49, 50), ["finish"]);
});
