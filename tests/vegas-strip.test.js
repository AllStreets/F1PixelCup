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
  assert.ok(Math.abs(+m[1] - DATA.origin.game.x) < 0.005 && Math.abs(+m[2] - DATA.origin.game.z) < 0.005, `${m[1]}, ${m[2]} against ${JSON.stringify(DATA.origin.game)}`);
  assert.ok(src.includes("VEGAS_SCALE = 1.3"), "drawn at the circuit map's own scale");
  // The venue's other model, the Sphere, is built with the Strip.
  assert.ok(src.includes('tracksideModel("vegasSphere")'), "the Sphere is not placed");
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
  assert.ok(h("lm_eiffel") > 160 && h("lm_eiffel") < 170, `the Eiffel Tower is ${h("lm_eiffel").toFixed(0)} m`);
  assert.ok(h("lm_high_roller") > 164 && h("lm_high_roller") < 170, `the High Roller is ${h("lm_high_roller").toFixed(1)} m`);
  assert.ok(h("lm_campanile") > 93 && h("lm_campanile") < 99, `the campanile is ${h("lm_campanile").toFixed(0)} m`);
  assert.ok(h("strat_tower") > 345 && h("strat_tower") < 356, `the Strat is ${h("strat_tower").toFixed(0)} m`);
  assert.ok(h("luxor_pyramid") > 104 && h("luxor_pyramid") < 110, `the pyramid is ${h("luxor_pyramid").toFixed(0)} m`);
  ["lm_balloon", "lm_arc", "doges_palace", "rialto", "colosseum", "liberty", "sphinx", "luxor_beam", "bellagio_lake", "bellagio_fountains",
    "led_planethollywood", "led_cosmopolitan", "led_resortsworld", "eiffel_lights", "high_roller_lights", "anchor_sphere"].forEach((n) => assert.ok(node(glb, n), `no ${n}`));
  ["facade_vegas", "neon", "video", "fountain", "beam", "lake"].forEach((m) => assert.ok(part(glb).materials.includes(m), `no ${m}`));
  // The shaders that stretch the jets and fade the beam work in the world's
  // heights (the compressed model's positions are quantized round each
  // node's own box).
  const src = fs.readFileSync(path.join(ROOT, "r3d", "vegas.js"), "utf8");
  ["fountainMaterial", "beamMaterial"].forEach((fn) => {
    const body = src.slice(src.indexOf(`function ${fn}`), src.indexOf("\n}\n", src.indexOf(`function ${fn}`)));
    assert.ok(/modelMatrix \* vec4/.test(body), `${fn} reads model-space positions as heights`);
  });
  assert.ok(part(glb).tris <= 60000, `${part(glb).tris} triangles`);
  // The shaders read the vertex colours: every facade, neon, screen and jet carries them.
  const colourless = [];
  glb.doc.meshes.forEach((m) => m.primitives.forEach((p) => {
    const name = glb.doc.materials[p.material].name;
    if (["facade_vegas", "neon", "video", "fountain"].includes(name) && p.attributes.COLOR_0 === undefined) colourless.push(`${m.name}:${name}`);
  }));
  assert.deepEqual(colourless.slice(0, 5), [], "pieces without their colours");
  // A resort's colour stored linear (as glTF's are): MGM Grand's green (#11804a).
  const mgm = DATA.buildings.find((b) => b.resort === "mgm" && b.colour === "#11804a");
  const mesh = glb.doc.meshes[glb.doc.nodes.find((n) => n.name === `b_${mgm.id}`).mesh];
  const prim = mesh.primitives.find((p) => glb.doc.materials[p.material].name === "facade_vegas");
  const c = require("./glb-read.js").read(glb, prim.attributes.COLOR_0)[0];
  const lin = (v) => ((v / 255 + 0.055) / 1.055) ** 2.4;
  assert.ok(Math.abs(c[1] - lin(0x80)) < 0.02 && Math.abs(c[0] - lin(0x11)) < 0.02 && Math.abs(c[2] - lin(0x4a)) < 0.02, `MGM's green stored as ${c.map((v) => v.toFixed(3))}`);
  assert.ok(Math.abs(part(glb).lo[1]) < 0.05, "on the ground");
});
