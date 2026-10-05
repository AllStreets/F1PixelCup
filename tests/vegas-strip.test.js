// The Las Vegas Strip (tools/vegas/build_strip_data.py -> tools/vegas/strip.json,
// tools/blender/build_vegas.py -> assets/landmarks/vegas_strip.glb, r3d/vegas.js),
// docs/superpowers/specs/2026-10-05-vegas-strip-design.md.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { ready, load, part, node } = require("./glb-read.js");

const ROOT = path.join(__dirname, "..");
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, "tools", "vegas", "strip.json"), "utf8"));
const FILE = path.join(ROOT, "assets", "landmarks", "vegas_strip.glb");

test.before(() => ready());

test("the map's data: credited, the circuit's own centre, fitted to the game's outline", () => {
  assert.match(DATA.attribution, /OpenStreetMap/);
  assert.ok(DATA.origin.fitError < 6, `the outline fits within ${DATA.origin.fitError} units`);
  // r3d/vegas.js puts the model's origin where the data says.
  const src = fs.readFileSync(path.join(ROOT, "r3d", "vegas.js"), "utf8");
  const m = src.match(/VEGAS_ORIGIN = \{ x: ([\d.]+), z: ([\d.]+) \}/);
  assert.ok(m, "no VEGAS_ORIGIN");
  assert.ok(Math.abs(+m[1] - DATA.origin.game.x) < 0.11 && Math.abs(+m[2] - DATA.origin.game.z) < 0.11, `${m[1]}, ${m[2]} against ${JSON.stringify(DATA.origin.game)}`);
  assert.ok(src.includes("VEGAS_SCALE = 1.3"), "drawn at the circuit map's own scale");
});

test("every major resort of the Strip is in the data, with its towers", () => {
  const resorts = new Set(DATA.buildings.map((b) => b.resort));
  ["bellagio", "caesars", "venetian", "palazzo", "wynn", "encore", "cosmopolitan", "aria", "paris", "linq", "flamingo", "planethollywood",
    "mirage", "treasureisland", "mgm", "nyny", "excalibur", "fontainebleau", "resortsworld", "strat"].forEach((r) => assert.ok(resorts.has(r), `no ${r}`));
  ["eiffel", "balloon", "arc", "campanile", "sphere", "strat", "luxor", "highroller", "colosseum", "liberty", "rialto"].forEach((a) => assert.ok(DATA.anchors[a], `no anchor ${a}`));
  // Heights as the map has them: Palazzo 196 m, Wynn 187 m.
  assert.equal(Math.max(...DATA.buildings.filter((b) => b.resort === "palazzo").map((b) => b.h)), 196);
  assert.equal(Math.max(...DATA.buildings.filter((b) => b.resort === "wynn").map((b) => b.h)), 187);
});

test("the model: a node per building, the landmarks by hand, in proportion", () => {
  const glb = load(FILE);
  const buildings = glb.doc.nodes.filter((n) => /^b_/.test(n.name));
  assert.ok(buildings.length >= 180, `${buildings.length} buildings`);
  const h = (n) => part(glb, n).hi[1];
  assert.ok(h("eiffel") > 160 && h("eiffel") < 170, `the Eiffel Tower is ${h("eiffel").toFixed(0)} m`);
  assert.ok(h("high_roller") > 160 && h("high_roller") < 180, `the High Roller is ${h("high_roller").toFixed(0)} m`);
  assert.ok(h("campanile") > 93 && h("campanile") < 99, `the campanile is ${h("campanile").toFixed(0)} m`);
  assert.ok(h("strat_tower") > 345 && h("strat_tower") < 356, `the Strat is ${h("strat_tower").toFixed(0)} m`);
  assert.ok(h("luxor_pyramid") > 104 && h("luxor_pyramid") < 110, `the pyramid is ${h("luxor_pyramid").toFixed(0)} m`);
  ["balloon", "arc", "doges_palace", "rialto", "colosseum", "liberty", "sphinx", "luxor_beam", "bellagio_lake", "bellagio_fountains",
    "led_planethollywood", "led_cosmopolitan", "led_resortsworld", "eiffel_lights", "high_roller_lights", "anchor_sphere"].forEach((n) => assert.ok(node(glb, n), `no ${n}`));
  ["facade_vegas", "neon", "video", "fountain", "beam", "lake"].forEach((m) => assert.ok(part(glb).materials.includes(m), `no ${m}`));
  assert.ok(part(glb).tris <= 400000, `${part(glb).tris} triangles`);
  assert.ok(Math.abs(part(glb).lo[1]) < 0.05, "on the ground");
});
