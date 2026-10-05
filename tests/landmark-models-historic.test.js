// The historic circuits' landmarks (tools/blender/build_landmarks_historic.py
// -> assets/landmarks/*.glb), docs/superpowers/specs/2026-10-05-historic-landmarks-design.md.
// Real metres, glTF axes: y up, the front (the circuit side) toward -z.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { ready, load, part, node, triangles } = require("./glb-read.js");

// (The models are compressed: the decoder first.)
test.before(() => ready());

const DIR = path.join(__dirname, "..", "assets", "landmarks");
const file = (n) => path.join(DIR, `${n}.glb`);

// Every model: its file, its named parts, on the ground, within budget, and
// its top in the range it has in life.
const MODELS = {
  motodrom: { parts: ["stand", "end_L", "end_R", "roof"], top: [30, 45] },
  nurburg_castle: { parts: ["hill", "trees", "castle"], top: [95, 110] },
  estoril_grandstand: { parts: ["stand", "roof"], top: [16, 26] },
  sintra_hills: { parts: ["ridge", "pena_palace"], top: [200, 260] },
  joburg_skyline: { parts: ["hillbrow", "ponte", "carlton", "city"], top: [265, 275] },
  sepang_grandstand: { parts: ["stand", "canopy", "masts"], top: [34, 42] },
  istanbul_grandstand: { parts: ["stand", "roof", "masts"], top: [50, 60] },
  tuscan_hill: { parts: ["terraces", "olives", "cypresses", "farmhouse"], top: [78, 90] },
  finger_lakes: { parts: ["hills", "trees", "lake"], top: [110, 175] },
};

Object.entries(MODELS).forEach(([name, want]) => {
  test(`${name}: its parts, on the ground, within budget, ${want.top[0]} to ${want.top[1]} m tall`, () => {
    assert.ok(fs.existsSync(file(name)), `${name}.glb is missing`);
    const glb = load(file(name));
    want.parts.forEach((p) => assert.ok(node(glb, p), `${name} has no ${p}`));
    const all = part(glb);
    assert.ok(Math.abs(all.lo[1]) < 0.05, `${name} starts ${all.lo[1].toFixed(2)} m from the ground`);
    assert.ok(all.hi[1] > want.top[0] && all.hi[1] < want.top[1], `${name}'s top is at ${all.hi[1].toFixed(1)} m`);
    assert.ok(all.tris > 300 && all.tris <= 40000, `${name}: ${all.tris} triangles`);
    // (That every mesh faces outward is landmark-models.test.js's, for every file.)
  });
});

// The stands carry their crowd and seats, like every landmark stand.
["motodrom", "estoril_grandstand", "sepang_grandstand", "istanbul_grandstand"].forEach((name) => {
  test(`${name}: rows of fans and seats`, () => {
    const stand = part(load(file(name)), "stand");
    ["crowd", "seat"].forEach((m) => assert.ok(stand.materials.includes(m), `no ${m}`));
  });
});

test("Hockenheim: the Motodrom's stand is long and tiered, its ends turned toward the track", () => {
  const glb = load(file("motodrom"));
  const stand = part(glb, "stand");
  assert.ok(stand.size[0] > 240 && stand.size[0] < 300, `the stand is ${stand.size[0].toFixed(0)} m long`);
  assert.ok(stand.hi[1] > 26, `three tiers reach ${stand.hi[1].toFixed(0)} m`);
  // Each end reaches forward (toward the track, -z) of the middle's front.
  ["end_L", "end_R"].forEach((e) => assert.ok(part(glb, e).lo[2] < stand.lo[2] - 5, `${e} doesn't turn toward the track`));
  assert.ok(part(glb, "end_L").hi[0] < stand.lo[0] + 5 && part(glb, "end_R").lo[0] > stand.hi[0] - 5, "an end at each end");
});

test("the Nurburg: a round keep on top of a wooded hill", () => {
  const glb = load(file("nurburg_castle"));
  const hill = part(glb, "hill");
  const castle = part(glb, "castle");
  assert.ok(hill.size[0] > 300 && hill.hi[1] > 60, `the hill is ${hill.size[0].toFixed(0)} m across, ${hill.hi[1].toFixed(0)} m high`);
  assert.ok(hill.materials.includes("forest"), "the hill is wooded");
  assert.ok(castle.lo[1] > 60, `the castle stands on the summit (from ${castle.lo[1].toFixed(0)} m)`);
  assert.ok(castle.hi[1] - castle.lo[1] > 18, "its keep stands above its walls");
  assert.ok(castle.size[0] < 70, "a castle, not a town");
});

test("Estoril: a covered grandstand of about 200 m; the Sintra ridge with the Pena Palace on its summit", () => {
  const stand = part(load(file("estoril_grandstand")), "stand");
  assert.ok(stand.size[0] > 180 && stand.size[0] < 230, `${stand.size[0].toFixed(0)} m`);
  const glb = load(file("sintra_hills"));
  const ridge = part(glb, "ridge");
  const palace = part(glb, "pena_palace");
  assert.ok(ridge.size[0] > 800, `the ridge is ${ridge.size[0].toFixed(0)} m long`);
  assert.ok(["forest", "rock"].every((m) => ridge.materials.includes(m)), "forest and its rocky crest");
  assert.ok(["palace_red", "palace_yellow"].every((m) => palace.materials.includes(m)), "the palace's red and yellow");
  assert.ok(palace.lo[1] > 150, `the palace is on the summit (from ${palace.lo[1].toFixed(0)} m)`);
});

test("Johannesburg: the Hillbrow Tower the tallest at 269 m, Ponte City 173 m, the Carlton Centre 223 m", () => {
  const glb = load(file("joburg_skyline"));
  const hb = part(glb, "hillbrow");
  const ponte = part(glb, "ponte");
  const carlton = part(glb, "carlton");
  assert.ok(hb.hi[1] > 265 && hb.hi[1] < 272, `Hillbrow is ${hb.hi[1].toFixed(0)} m`);
  assert.ok(ponte.hi[1] > 168 && ponte.hi[1] < 178, `Ponte is ${ponte.hi[1].toFixed(0)} m`);
  assert.ok(Math.abs(ponte.size[0] - ponte.size[2]) < 2 && ponte.size[0] > 40, "Ponte is a cylinder");
  assert.ok(carlton.hi[1] > 218 && carlton.hi[1] < 228, `the Carlton Centre is ${carlton.hi[1].toFixed(0)} m`);
  [ponte, carlton].forEach((t) => assert.ok(t.materials.some((m) => m.startsWith("facade")), "their windows"));
});

test("Sepang: the grandstand faces both ways, a leaf canopy over each side", () => {
  const glb = load(file("sepang_grandstand"));
  const pts = triangles(glb, "stand").flat();
  // Its rows step up toward the spine from both fronts: low at each edge.
  const edge = (f) => Math.max(...pts.filter(f).map((v) => v[1]));
  assert.ok(edge((v) => v[2] < -30) < 5 && edge((v) => v[2] > 30) < 5, "low rows at both fronts");
  const canopy = part(glb, "canopy");
  assert.ok(canopy.lo[2] < -35 && canopy.hi[2] > 35, "leaves out over both sides");
  assert.ok(canopy.materials.includes("canopy"), "its fabric");
  // Pointed leaves: narrow at the tip, wide in the middle.
  const tri = triangles(glb, "canopy").flat();
  // (One leaf: the first bay's, on the front side.)
  const width = (z0, z1) => { const s = tri.filter((v) => v[0] < -88 && v[2] < -z0 && v[2] > -z1).map((v) => v[0]); return Math.max(...s) - Math.min(...s); };
  assert.ok(canopy.tris > 2000, `${canopy.tris} triangles of leaves`);
  assert.ok(width(37, 45) < width(18, 24) * 0.6, `the tip ${width(37, 45).toFixed(1)} m wide, the middle ${width(18, 24).toFixed(1)} m`);
});

test("Istanbul Park: the roof hangs from tall masts behind the stand", () => {
  const glb = load(file("istanbul_grandstand"));
  const masts = part(glb, "masts");
  const roof = part(glb, "roof");
  const stand = part(glb, "stand");
  assert.ok(stand.size[0] > 240 && stand.size[0] < 280, `${stand.size[0].toFixed(0)} m`);
  assert.ok(masts.hi[1] > roof.hi[1] + 20, "the masts stand over the roof");
  assert.ok(masts.hi[2] > stand.hi[2], "behind the stand");
});

test("Mugello: a terraced hill, olives on the terraces, a farmhouse with terracotta roofs on top", () => {
  const glb = load(file("tuscan_hill"));
  const terr = part(glb, "terraces");
  assert.ok(terr.materials.includes("stone_dark") && terr.materials.includes("grass"), "dry-stone walls and grass");
  assert.ok(part(glb, "olives").materials.includes("olive"));
  assert.ok(part(glb, "cypresses").materials.includes("cypress"));
  const farm = part(glb, "farmhouse");
  assert.ok(farm.materials.includes("terracotta"));
  assert.ok(farm.lo[1] > terr.hi[1] - 2, "on the top terrace");
});

test("Watkins Glen: a long lake between wooded ridges in autumn", () => {
  const glb = load(file("finger_lakes"));
  const hills = part(glb, "hills");
  const lake = part(glb, "lake");
  assert.ok(lake.materials.includes("water"));
  assert.ok(lake.size[2] > 1000 && lake.size[0] < 400, `the lake is ${lake.size[2].toFixed(0)} m long, ${lake.size[0].toFixed(0)} m wide`);
  assert.ok(["forest_autumn", "forest_gold"].every((m) => hills.materials.includes(m)), "the woods in their colours");
  assert.ok(hills.lo[0] < lake.lo[0] - 200 && hills.hi[0] > lake.hi[0] + 200, "ridges either side");
  // Its near end open toward the track (glTF -z): the lake runs out to near the front.
  assert.ok(lake.lo[2] < hills.lo[2] + 80, "the lake runs from near the front");
});
