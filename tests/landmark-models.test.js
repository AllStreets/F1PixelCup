// The landmark and grandstand models (tools/blender/build_landmarks.py ->
// assets/landmarks/*.glb), docs/superpowers/specs/2026-10-01-trackside-blender-design.md
// sections 1 to 3. Real metres, glTF axes: y up, the front toward -z.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { load, part, node, at, triangles, groundBelow } = require("./glb-read.js");

const DIR = path.join(__dirname, "..", "assets", "landmarks");
const file = (n) => path.join(DIR, `${n}.glb`);

test("the casino: its front, its towers and the Hôtel de Paris beside it", () => {
  const glb = load(file("casino"));
  ["casino", "hotel_de_paris"].forEach((n) => assert.ok(node(glb, n), `${n} is missing`));
  const casino = part(glb, "casino");
  ["stone", "roof_slate", "glass", "gold"].forEach((m) => assert.ok(casino.materials.includes(m), `the casino has no ${m}`));
  // About 60 m across the front, the towers' tops 30 to 40 m up, on the ground.
  assert.ok(casino.size[0] > 50 && casino.size[0] < 75, `the casino is ${casino.size[0].toFixed(1)} m across`);
  assert.ok(casino.hi[1] > 30 && casino.hi[1] < 42, `the casino's top is at ${casino.hi[1].toFixed(1)} m`);
  assert.ok(Math.abs(casino.lo[1]) < 0.05, "the casino stands on the ground");
  // Its front toward -z: the entrance canopy stands proud of the front, the
  // harbour-side towers behind.
  const front = part(glb, "tower_L").lo[2];
  assert.ok(part(glb, "tower_sea_L").lo[2] > front + 20, "the harbour-side towers are behind the front");
  const hotel = part(glb, "hotel_de_paris");
  ["stone", "roof_slate", "glass"].forEach((m) => assert.ok(hotel.materials.includes(m), `the hotel has no ${m}`));
  assert.ok(Math.max(hotel.size[0], hotel.size[2]) > 50, "the hotel's front is long");
  assert.ok(hotel.hi[1] > 24 && hotel.hi[1] < 40, `the hotel is ${hotel.hi[1].toFixed(1)} m tall`);
  // The two towers either side of the front.
  ["tower_L", "tower_R"].forEach((n) => assert.ok(node(glb, n), `${n} is missing`));
  const all = part(glb);
  assert.ok(all.tris > 4000 && all.tris <= 40000, `${all.tris} triangles`);
});

test("Marina Bay Sands: three towers and the SkyPark on top", () => {
  const glb = load(file("marina_bay_sands"));
  ["tower_1", "tower_2", "tower_3", "skypark"].forEach((n) => assert.ok(node(glb, n), `${n} is missing`));
  const all = part(glb);
  ["facade", "skypark", "window_lit"].forEach((m) => assert.ok(all.materials.includes(m), `no ${m}`));
  // 194 m to the SkyPark's deck, the SkyPark about 340 m long.
  assert.ok(all.hi[1] > 190 && all.hi[1] < 206, `${all.hi[1].toFixed(1)} m tall`);
  const sky = part(glb, "skypark");
  assert.ok(sky.size[0] > 325 && sky.size[0] < 355, `the SkyPark is ${sky.size[0].toFixed(1)} m long`);
  assert.ok(sky.lo[1] > 180, "the SkyPark is on top");
  // The towers in a row under it, each standing on the ground.
  const xs = ["tower_1", "tower_2", "tower_3"].map((n) => {
    const t = part(glb, n);
    assert.ok(Math.abs(t.lo[1]) < 0.05 && t.hi[1] > 185, `${n} runs from the ground to the top`);
    return (t.lo[0] + t.hi[0]) / 2;
  });
  assert.ok(xs[0] < xs[1] && xs[1] < xs[2], "the towers in a row");
  // The cantilever: the SkyPark reaches well past the last tower.
  assert.ok(sky.hi[0] - part(glb, "tower_3").hi[0] > 50, "the SkyPark's cantilever");
  // Its front toward -z: each tower's curved leg reaches out at its foot, in
  // front of the straight leg, and the SkyPark's pool runs along that side.
  const t1 = part(glb, "tower_1");
  assert.ok(t1.lo[2] < -35 && t1.hi[2] < 32, `tower_1 runs ${t1.lo[2].toFixed(1)}..${t1.hi[2].toFixed(1)} m front to back`);
  assert.ok(all.tris > 1000 && all.tris <= 40000, `${all.tris} triangles`);
});

test("the covered grandstand: rows of seats rising from the front, under a roof, in its footprint", () => {
  const glb = load(file("grandstand"));
  const all = part(glb);
  ["seat", "concrete", "steel", "roof_membrane"].forEach((m) => assert.ok(all.materials.includes(m), `no ${m}`));
  // The track data's footprint: 156 by 68 units at the car's scale (6 a metre).
  assert.ok(all.size[0] <= 26.01 && all.size[0] > 22, `${all.size[0].toFixed(2)} m long`);
  assert.ok(all.size[2] <= 11.34, `${all.size[2].toFixed(2)} m deep`);
  assert.ok(all.hi[1] > 7 && all.hi[1] < 10.5, `the roof at ${all.hi[1].toFixed(1)} m`);
  assert.ok(Math.abs(all.lo[1]) < 0.05, "on the ground");
  // Rows from the front (-z) back and up, each with its seats.
  const rows = [];
  for (let k = 0; node(glb, `row_${k}`); k += 1) rows.push(at(glb, `row_${k}`));
  assert.ok(rows.length >= 8, `${rows.length} rows`);
  rows.slice(1).forEach((r, k) => {
    assert.ok(r[1] > rows[k][1] + 0.25 && r[2] > rows[k][2] + 0.5, `row ${k + 1} rises behind row ${k}`);
  });
  const seats = node(glb, "row_0").extras && node(glb, "row_0").extras.seats;
  assert.ok(Array.isArray(seats) && seats.length >= 30, "row 0 lists its seats");
  // A seat per person: 0.55 m apart or more (a fan is up to 0.6 m across
  // the arms; neighbours side by side, not through each other).
  seats.slice(1).forEach((x, k) => assert.ok(x - seats[k] >= 0.549, `seats ${k} and ${k + 1} are ${(x - seats[k]).toFixed(2)} m apart`));
  // Each row's point is where its fans' feet are: on the tread, not inside
  // the step behind it, with the seat pan a seat's height above and behind.
  const solid = triangles(glb, "stand");
  const pans = triangles(glb, "seats");
  rows.forEach((r, k) => {
    const floor = groundBelow(solid, 1.2, r[1] + 2, r[2]);
    assert.ok(Math.abs(floor - r[1]) < 0.03, `row ${k}'s feet are ${(r[1] - floor).toFixed(2)} m off the tread`);
    const pan = groundBelow(pans, 1.2, r[1] + 0.8, r[2] + 0.3);
    assert.ok(pan - r[1] > 0.4 && pan - r[1] < 0.5, `row ${k}'s seat is ${(pan - r[1]).toFixed(2)} m above its feet`);
  });
  ["roof", "stairs"].forEach((n) => assert.ok(node(glb, n), `${n} is missing`));
  assert.ok(all.tris > 1500 && all.tris <= 12000, `${all.tris} triangles`);
});
