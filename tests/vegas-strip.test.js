// The Las Vegas Strip (tools/vegas/build_strip_data.py -> tools/vegas/strip.json,
// tools/blender/build_vegas.py -> assets/landmarks/vegas_strip.glb, r3d/vegas.js),
// docs/design/specs/2026-10-05-vegas-strip-design.md.
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
    "led_planethollywood", "led_cosmopolitan", "led_resortsworld", "caesars_fountains", "caesars_basins", "b_bellagio_tower", "b_bellagio_village", "b_planethollywood_base", "eiffel_lights", "high_roller_lights", "anchor_sphere"].forEach((n) => assert.ok(node(glb, n), `no ${n}`));
  ["facade_vegas", "neon", "video", "fountain", "beam", "lake"].forEach((m) => assert.ok(part(glb).materials.includes(m), `no ${m}`));
  // The shaders that stretch the jets and fade the beam work in the world's
  // heights (the compressed model's positions are quantized round each
  // node's own box).
  const src = fs.readFileSync(path.join(ROOT, "r3d", "vegas.js"), "utf8");
  ["fountainMaterial", "beamMaterial"].forEach((fn) => {
    const body = src.slice(src.indexOf(`function ${fn}`), src.indexOf("\n}\n", src.indexOf(`function ${fn}`)));
    assert.ok(/modelMatrix \* vec4/.test(body), `${fn} reads model-space positions as heights`);
  });
  assert.ok(part(glb).tris <= 120000, `${part(glb).tris} triangles`);
  // The shaders read the vertex colours: every facade, neon, screen and jet carries them.
  const colourless = [];
  glb.doc.meshes.forEach((m) => m.primitives.forEach((p) => {
    const name = glb.doc.materials[p.material].name;
    if (["facade_vegas", "neon", "video", "fountain"].includes(name) && p.attributes.COLOR_0 === undefined) colourless.push(`${m.name}:${name}`);
  }));
  assert.deepEqual(colourless.slice(0, 5), [], "pieces without their colours");
  // A resort's colour stored linear (as glTF's are): MGM Grand's deep green
  // glass (#0c4a2e in tools/blender/vegas_resorts.py), its alpha its kind
  // of wall (0.35: a curtain of glass).
  const styles = fs.readFileSync(path.join(ROOT, "tools", "blender", "vegas_resorts.py"), "utf8");
  assert.ok(/"mgm": dict\(k=GLASS, c="#0c4a2e"/.test(styles), "MGM Grand's glass is not the test's");
  const c = kindOf(glb, "mgm", 0.35);
  assert.ok(c, "MGM Grand has no curtain of glass");
  const lin = (v) => ((v / 255 + 0.055) / 1.055) ** 2.4;
  assert.ok(Math.abs(c[1] - lin(0x4a)) < 0.02 && Math.abs(c[0] - lin(0x0c)) < 0.02 && Math.abs(c[2] - lin(0x2e)) < 0.02, `MGM's green stored as ${c.map((v) => v.toFixed(3))}`);
  assert.ok(Math.abs(part(glb).lo[1]) < 0.05, "on the ground");
});

// The colour (r, g, b, kind) of a resort's tallest tower's walls of kind k:
// the first of its corners of that kind (none: undefined).
function kindOf(glb, resort, k) {
  const { read } = require("./glb-read.js");
  // (The Bellagio's tallest piece is its cupola: its tower by name.)
  const towers = glb.doc.nodes.filter((n) => /^b_/.test(n.name) && n.extras && n.extras.resort === resort && (resort !== "bellagio" || n.name === "b_bellagio_tower")).sort((a, b) => b.extras.height - a.extras.height);
  assert.ok(towers.length, `no ${resort}`);
  const prim = glb.doc.meshes[towers[0].mesh].primitives.find((p) => glb.doc.materials[p.material].name === "facade_vegas");
  const all = read(glb, prim.attributes.COLOR_0);
  const mine = all.filter((c) => Math.abs(c[3] - k) < 0.03);
  return mine[0];
}

// The materials of a resort's pieces, and how many triangles of each.
function materialsOf(glb, pick) {
  const out = {};
  glb.doc.nodes.filter((n) => n.mesh !== undefined && pick(n)).forEach((n) => glb.doc.meshes[n.mesh].primitives.forEach((p) => {
    const name = glb.doc.materials[p.material].name;
    out[name] = (out[name] || 0) + glb.doc.accessors[p.indices].count / 3;
  }));
  return out;
}

test("each resort in its own kind of wall, the unnamed towers quiet", () => {
  const glb = load(FILE);
  const kinds = { caesars: 1, bellagio: 1, paris: 1, venetian: 1, palazzo: 1, treasureisland: 1, excalibur: 1, wynn: 0.5, encore: 0.5, aria: 0.5,
    mirage: 0.65, mandalay: 0.65, flamingo: 0.65, planethollywood: 0.65, linq: 0.65, cosmopolitan: 0.35, mgm: 0.35, resortsworld: 0.35, fontainebleau: 0.35, luxor: 0.35 };
  Object.entries(kinds).forEach(([resort, k]) => {
    assert.ok(kindOf(glb, resort, k), `${resort}'s walls are not kind ${k}`);
  });
  // Red glass, blue glass, gold, bronze, pink: each resort's tint its own.
  const tint = (r) => kindOf(glb, r, kinds[r]);
  assert.ok(tint("resortsworld")[0] > 2 * tint("resortsworld")[2], "Resorts World is not red");
  assert.ok(tint("fontainebleau")[2] > 2 * tint("fontainebleau")[0], "the Fontainebleau is not blue");
  assert.ok(tint("flamingo")[0] > 2 * tint("flamingo")[1], "the Flamingo is not pink");
  // The towers no resort owns: one quiet kind (0.9), so the named stand out.
  const unnamed = glb.doc.nodes.filter((n) => /^b_/.test(n.name) && n.extras && !n.extras.resort);
  assert.ok(unnamed.length > 50, `${unnamed.length} unnamed`);
  const { read } = require("./glb-read.js");
  unnamed.slice(0, 20).forEach((n) => {
    const prim = glb.doc.meshes[n.mesh].primitives.find((p) => glb.doc.materials[p.material].name === "facade_vegas");
    assert.ok(Math.abs(read(glb, prim.attributes.COLOR_0)[0][3] - 0.9) < 0.03, `${n.name} is not quiet`);
  });
  // The shader reads those kinds (r3d/vegas.js).
  const src = fs.readFileSync(path.join(ROOT, "r3d", "vegas.js"), "utf8");
  // (Each threshold halfway between two of the kinds the model writes.)
  ["step(0.95, kind)", "step(0.85, kind)", "step(0.72, kind)", "step(0.58, kind)", "step(0.42, kind)"].forEach((k) => assert.ok(src.includes(k), `the facade shader has no ${k}`));
  const py = fs.readFileSync(path.join(ROOT, "tools", "blender", "vegas_resorts.py"), "utf8");
  assert.ok(py.includes("STONE, QUIET, PLAIN, RIBBON, LINED, GLASS = 1.0, 0.9, 0.8, 0.65, 0.5, 0.35"), "the kinds' numbers changed: the shader's thresholds with them");
});

test("the resorts' own shapes: the Bellagio's curved tower and cupola, the castle's turrets, the skyline's crowns", () => {
  const glb = load(FILE);
  const h = (n) => part(glb, n).hi[1];
  const top = (resort) => Math.max(...glb.doc.nodes.filter((n) => /^b_/.test(n.name) && n.extras && n.extras.resort === resort).map((n) => h(n.name)));
  assert.ok(h("b_bellagio_tower") > 150 && h("b_bellagio_tower") < 162, `the Bellagio's tower is ${h("b_bellagio_tower").toFixed(0)} m`);
  assert.ok(top("bellagio") > 170 && top("bellagio") < 182, `its cupola tops out at ${top("bellagio").toFixed(0)} m`);
  const tower = part(glb, "b_bellagio_tower");
  assert.ok(tower.hi[2] - tower.lo[2] > 220, "its wings span the lake");
  // The castle's turrets wear cones of red, blue and gold.
  const castle = new Set();
  glb.doc.nodes.filter((n) => n.extras && n.extras.resort === "excalibur").forEach((n) => glb.doc.meshes[n.mesh].primitives.forEach((p) => castle.add(glb.doc.materials[p.material].name)));
  ["roof_red", "roof_blue", "roof_gold"].forEach((m) => assert.ok(castle.has(m), `no ${m} on the castle`));
  // New York-New York's tallest carries its mast well above its roof.
  const ny = glb.doc.nodes.filter((n) => n.extras && n.extras.resort === "nyny").sort((a, b) => b.extras.height - a.extras.height)[0];
  // (The map's height is its tip: the crown is built down from it.)
  assert.ok(Math.abs(h(ny.name) - ny.extras.height) < 3, `the skyline's tallest tips out at ${h(ny.name).toFixed(0)} m, the map's ${ny.extras.height}`);
  assert.ok(materialsOf(glb, (n) => n.name === ny.name).white_steel > 10, "the skyline's tallest has no mast");
  // The castle's turrets tip out where the map has them (54 m at most);
  // the hotel's corner turrets a little over its 68 m roof.
  assert.ok(top("excalibur") < 84, `a turret reaches ${top("excalibur").toFixed(0)} m`);
  // Light in the arches and recesses: Caesars' temple fronts, the Venetian's
  // arcade, Paris's dormers, the Colosseum's tiers.
  const lit = (resort) => materialsOf(glb, (n) => n.extras && n.extras.resort === resort && /^b_/.test(n.name)).neon || 0;
  assert.ok(lit("caesars") > 150, `Caesars' temple fronts: ${lit("caesars")} triangles of light`);
  assert.ok(lit("venetian") > 1000, `the Venetian's arcade: ${lit("venetian")} triangles of light`);
  assert.ok(lit("paris") > 600, `Paris's dormers: ${lit("paris")} triangles of light`);
  assert.ok(materialsOf(glb, (n) => n.name === "colosseum").neon > 2000, "the Colosseum's arches are dark");
  // The screens lie on their buildings: Resorts World's within its tower's
  // footprint (and a metre), Planet Hollywood's round its hall.
  const within = (a, b, by) => a.lo[0] > b.lo[0] - by && a.hi[0] < b.hi[0] + by && a.lo[2] > b.lo[2] - by && a.hi[2] < b.hi[2] + by;
  const rw = glb.doc.nodes.filter((n) => n.extras && n.extras.resort === "resortsworld").sort((a, b) => b.extras.height - a.extras.height)[0];
  assert.ok(within(part(glb, "led_resortsworld"), part(glb, rw.name), 1), "Resorts World's screen stands off its tower");
  assert.ok(within(part(glb, "led_planethollywood"), part(glb, "b_planethollywood_base"), 1.5), "Planet Hollywood's screens are not on its hall");
  // No tower of Planet Hollywood stands in its hall.
  const hall = part(glb, "b_planethollywood_base");
  glb.doc.nodes.filter((n) => n.extras && n.extras.resort === "planethollywood" && n.extras.height > 45).forEach((n) => {
    assert.ok(part(glb, n.name).lo[0] >= hall.hi[0] - 2.5, `${n.name} stands in the hall`);
  });
  // The Luxor's beam is the tallest thing on the Strip.
  assert.ok(h("luxor_beam") > 2000, "the beam stops short");
});
