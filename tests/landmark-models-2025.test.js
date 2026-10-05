// The 2025 venues' landmarks (tools/blender/build_landmarks_2025.py ->
// assets/landmarks/*.glb), docs/superpowers/specs/2026-10-01-landmarks-2025-design.md.
// Real metres, glTF axes: y up, the front (the circuit side) toward -z.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { load, part, node, triangles } = require("./glb-read.js");

const DIR = path.join(__dirname, "..", "assets", "landmarks");
const file = (n) => path.join(DIR, `${n}.glb`);

// Every model: its file, its named parts, on the ground, within budget, and
// its top in the range it has in life.
const MODELS = {
  melbourne_skyline: { parts: ["eureka", "australia108", "rialto"], top: [300, 325] },
  shanghai_grandstand: { parts: ["stand", "wing_L", "wing_R"], top: [45, 60] },
  jeddah_fountain: { parts: ["jet", "platform"], top: [250, 275] },
  miami_stadium: { parts: ["bowl", "canopy", "masts"], top: [80, 100] },
  hillside: { parts: ["slope", "terraces"], top: [16, 34] },
  barcelona_grandstand: { parts: ["stand", "roof"], top: [20, 34] },
  biosphere: { parts: ["lattice", "plinth"], top: [60, 66] },
  spielberg_grandstand: { parts: ["stand", "roof", "bank"], top: [18, 40] },
  hugenholtz: { parts: ["terraces", "dune"], top: [10, 26] },
  flame_towers: { parts: ["flame_1", "flame_2", "flame_3"], top: [178, 192] },
  baku_old_city: { parts: ["walls", "maiden_tower"], top: [28, 34] },
  cota_tower: { parts: ["core", "deck", "veil"], top: [74, 80] },
  foro_sol: { parts: ["stands", "lights"], top: [30, 60] },
  vegas_sphere: { parts: ["sphere", "base"], top: [108, 116] },
  vegas_strip: { parts: ["curved_slab", "y_tower", "needle"], top: [340, 360] },
  losail_grandstand: { parts: ["stand", "canopy", "pylons"], top: [18, 45] },
  lusail_towers: { parts: ["crescent_1", "crescent_2"], top: [185, 215] },
  yas_hotel: { parts: ["block", "gridshell"], top: [50, 70] },
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

test("Melbourne: Eureka with its gold crown, Australia 108 the tallest, the Rialto's twin blue towers", () => {
  const glb = load(file("melbourne_skyline"));
  const eureka = part(glb, "eureka");
  const a108 = part(glb, "australia108");
  const rialto = part(glb, "rialto");
  assert.ok(eureka.hi[1] > 290 && eureka.hi[1] < 302, `Eureka is ${eureka.hi[1].toFixed(0)} m`);
  assert.ok(eureka.materials.includes("gold"), "Eureka's gold crown");
  assert.ok(a108.hi[1] > eureka.hi[1] && a108.hi[1] < 322, `Australia 108 is ${a108.hi[1].toFixed(0)} m`);
  assert.ok(a108.materials.includes("gold"), "its starburst");
  assert.ok(rialto.hi[1] > 240 && rialto.hi[1] < 258, `the Rialto is ${rialto.hi[1].toFixed(0)} m`);
  [eureka, a108, rialto].forEach((tw) => assert.ok(tw.materials.some((m) => m.startsWith("facade")), "their windows"));
});

test("Shanghai: the wings rise at either end of a long grandstand, above its roof", () => {
  const glb = load(file("shanghai_grandstand"));
  const stand = part(glb, "stand");
  const L = part(glb, "wing_L");
  const R = part(glb, "wing_R");
  assert.ok(stand.size[0] > 260 && stand.size[0] < 340, `the stand is ${stand.size[0].toFixed(0)} m long`);
  assert.ok(L.hi[1] > stand.hi[1] + 15 && R.hi[1] > stand.hi[1] + 15, "the wings above the stand");
  assert.ok((L.lo[0] + L.hi[0]) / 2 < 0 && (R.lo[0] + R.hi[0]) / 2 > 0, "one at each end");
});

test("Jeddah: the fountain's jet is water (spray) from a low platform", () => {
  const glb = load(file("jeddah_fountain"));
  assert.ok(part(glb, "jet").materials.includes("spray"));
  assert.ok(part(glb, "platform").hi[1] < 8, "the platform is low on the sea");
});

test("Miami: the bowl under its canopy, the masts above both", () => {
  const glb = load(file("miami_stadium"));
  const bowl = part(glb, "bowl");
  const canopy = part(glb, "canopy");
  const masts = part(glb, "masts");
  assert.ok(bowl.size[0] > 250 && bowl.size[0] < 300 && bowl.size[2] > 200 && bowl.size[2] < 260, `the bowl is ${bowl.size[0].toFixed(0)} by ${bowl.size[2].toFixed(0)} m`);
  assert.ok(canopy.hi[1] > 38 && canopy.hi[1] < 55, `the canopy at ${canopy.hi[1].toFixed(0)} m`);
  assert.ok(masts.hi[1] > canopy.hi[1] + 25, "the masts above the canopy");
});

test("the Biosphère: a 76 m lattice sphere cut at 62 m", () => {
  const glb = load(file("biosphere"));
  const lat = part(glb, "lattice");
  assert.ok(lat.size[0] > 74 && lat.size[0] < 79, `${lat.size[0].toFixed(1)} m across`);
  assert.ok(lat.hi[1] > 60 && lat.hi[1] < 64, `${lat.hi[1].toFixed(1)} m tall`);
  assert.ok(lat.tris > 6000, "a lattice, not a ball");
});

test("Spielberg: a neutral grandstand set into its bank (no sculpture, no mark)", () => {
  assert.ok(!require("node:fs").existsSync(file("spielberg_bull")), "the bull (a brand's emblem) is gone");
  const glb = load(file("spielberg_grandstand"));
  const stand = part(glb, "stand");
  assert.ok(stand.size[0] > 120 && stand.size[0] < 220, `the stand is ${stand.size[0].toFixed(0)} m long`);
  ["crowd", "seat"].forEach((m) => assert.ok(stand.materials.includes(m), `no ${m}`));
  assert.ok(part(glb, "bank").materials.includes("grass"), "the hillside behind it");
});

test("Miami: an open bowl, its ends lower than its sides (the far tiers seen over them)", () => {
  const glb = load(file("miami_stadium"));
  const pts = triangles(glb, "bowl").flat();
  const top = (f) => Math.max(...pts.filter(f).map((v) => v[1]));
  const ends = top((v) => Math.abs(v[0]) > 120);
  const sides = top((v) => Math.abs(v[2]) > 100);
  assert.ok(sides > 34 && ends < sides - 12, `the rim is ${ends.toFixed(0)} m at the ends, ${sides.toFixed(0)} m at the sides`);
  // Its concourses open in the outer wall (dark bands), not a smooth drum.
  assert.ok(part(glb, "bowl").materials.includes("gear"), "the concourse openings");
});

test("Yas Marina: the hotel's rooms are a hotel's (finer than an office's)", () => {
  const glb = load(file("yas_hotel"));
  assert.ok(part(glb, "block").materials.includes("facade_hotel"));
});

test("the Las Vegas Sphere: 157 m wide, 112 m tall, an LED skin", () => {
  const glb = load(file("vegas_sphere"));
  const s = part(glb, "sphere");
  assert.ok(s.size[0] > 150 && s.size[0] < 162, `${s.size[0].toFixed(0)} m wide`);
  assert.ok(s.materials.includes("screen"), "its LED skin");
  const screen = glb.doc.meshes[node(glb, "sphere").mesh].primitives.find((p) => glb.doc.materials[p.material].name === "screen");
  assert.ok(screen.attributes.COLOR_0 !== undefined, "the image painted on it");
});

test("Baku: the Flame Towers tallest 182 m, the Maiden Tower 29.5 m behind the walls", () => {
  const glb = load(file("flame_towers"));
  const tops = ["flame_1", "flame_2", "flame_3"].map((n) => part(glb, n).hi[1]).sort((a, b) => b - a);
  assert.ok(tops[0] > 178 && tops[0] < 186 && tops[2] > 140, `the towers' tops: ${tops.map((t) => t.toFixed(0))}`);
  const old = load(file("baku_old_city"));
  const walls = part(old, "walls");
  const maiden = part(old, "maiden_tower");
  assert.ok(maiden.hi[1] > 28 && maiden.hi[1] < 32, `the Maiden Tower is ${maiden.hi[1].toFixed(1)} m`);
  assert.ok(walls.size[0] > 150, `${walls.size[0].toFixed(0)} m of wall`);
  // Wholly behind the walls (their back, towers included, is their highest z).
  assert.ok(maiden.lo[2] > walls.hi[2], `the tower starts ${maiden.lo[2].toFixed(1)} m back, the walls end at ${walls.hi[2].toFixed(1)}`);
});

test("Hugenholtz: the six pieces of its arc the game places it by", () => {
  const glb = load(file("hugenholtz"));
  [0, 1, 2, 3, 4, 5].forEach((k) => ["terraces", "dune"].forEach((n) => assert.ok(node(glb, `${n}_${k}`), `no ${n}_${k}`)));
  // The arc's ends reach forward (toward the track, -z) of its middle.
  assert.ok(part(glb, "terraces_0").lo[2] < part(glb, "terraces_2").lo[2] - 5, "the bowl opens toward the track");
});

test("the Austin tower: the deck at about 70 m, its red veil", () => {
  const glb = load(file("cota_tower"));
  const deck = part(glb, "deck");
  assert.ok(deck.lo[1] > 64 && deck.lo[1] < 72, `the deck at ${deck.lo[1].toFixed(0)} m`);
  assert.ok(part(glb, "veil").materials.includes("red_steel"));
});

test("Yas Marina: a hotel block under its lit gridshell", () => {
  const glb = load(file("yas_hotel"));
  const block = part(glb, "block");
  const shell = part(glb, "gridshell");
  assert.ok(shell.materials.includes("gridshell"));
  assert.ok(shell.hi[1] > block.hi[1] + 5, "the gridshell over the block");
  assert.ok(block.hi[1] > 38 && block.hi[1] < 55, `the block is ${block.hi[1].toFixed(0)} m`);
});
