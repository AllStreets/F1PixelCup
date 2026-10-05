// The yachts (tools/blender/build_yachts.py -> assets/yachts.glb),
// docs/superpowers/specs/2026-10-01-trackside-blender-design.md section 8.1.
// Real metres, glTF axes: x toward the bow, y up, the waterline at y = 0.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { ready, load, part, node, signedVolume } = require("./glb-read.js");

// The models ship compressed: the decoder first.
test.before(ready);

const glb = () => load(path.join(__dirname, "..", "assets", "yachts.glb"));

// Each model: its length overall (m), and what it must have.
const YACHTS = {
  superyacht: { length: [56, 64], decks: 4, parts: ["hull", "boot", "deck", "super", "glass", "rail", "gear", "lit"] },
  motor: { length: [42, 48], decks: 3, parts: ["hull", "boot", "deck", "super", "glass", "rail", "gear", "lit"] },
  explorer: { length: [35, 41], decks: 3, parts: ["hull", "boot", "deck", "super", "glass", "rail", "gear", "lit"] },
  // (A sailing yacht's detail is its rig: fewer triangles than a motor yacht's tiers.)
  sail: { length: [47, 53], decks: 1, least: 1200, parts: ["hull", "boot", "deck", "super", "glass", "rail", "gear"] },
};

Object.entries(YACHTS).forEach(([name, want]) => {
  test(`the ${name}: its hull, decks and details, near and far`, () => {
    const g = glb();
    const near = part(g, `${name}_lod0`);
    const far = part(g, `${name}_lod1`);
    assert.ok(near.found && far.found, `${name}_lod0 and _lod1 exist`);
    want.parts.forEach((m) => assert.ok(near.materials.includes(m), `the near ${name} has no ${m}`));
    ["hull", "super"].forEach((m) => assert.ok(far.materials.includes(m), `the far ${name} has no ${m}`));
    // Its length along x, the bow forward; afloat (a little of the hull
    // below the water), never deep under it.
    assert.ok(near.size[0] >= want.length[0] && near.size[0] <= want.length[1], `${name} is ${near.size[0].toFixed(1)} m long`);
    assert.ok(near.lo[1] < 0 && near.lo[1] > -4, `${name}'s keel at ${near.lo[1].toFixed(2)} m`);
    assert.ok(near.size[2] < near.size[0] / 3.2, `${name} is ${near.size[2].toFixed(1)} m in the beam`);
    // Its origin midships: the game places and rocks it about its middle.
    assert.ok(Math.abs(near.lo[0] + near.hi[0]) < 0.1, `${name}'s middle is at x ${((near.lo[0] + near.hi[0]) / 2).toFixed(2)}`);
    assert.ok(Math.abs(far.lo[0] + far.hi[0]) < 0.1, `the far ${name}'s middle is at x ${((far.lo[0] + far.hi[0]) / 2).toFixed(2)}`);
    // The far model the same size, much lighter.
    assert.ok(Math.abs(far.size[0] - near.size[0]) < 1.5, "the far model is as long");
    assert.ok(near.tris > (want.least || 1500) && near.tris <= 7000, `near: ${near.tris} triangles`);
    assert.ok(far.tris <= 400, `far: ${far.tris} triangles`);
    // Its deck tiers, as empties the game can read.
    const tiers = node(g, `${name}_lod0`).extras;
    assert.ok(tiers && tiers.decks === want.decks, `${name} has ${tiers && tiers.decks} decks`);
  });
});

test("the sailing yacht's mast stands far taller than the motor yachts", () => {
  const g = glb();
  const sail = part(g, "sail_lod0");
  const motor = part(g, "superyacht_lod0");
  assert.ok(sail.hi[1] > 50, `the mast's top is at ${sail.hi[1].toFixed(1)} m`);
  assert.ok(motor.hi[1] < 22, `the superyacht's top is at ${motor.hi[1].toFixed(1)} m`);
});

test("the tender: a small boat", () => {
  const t = part(glb(), "tender");
  assert.ok(t.found && t.size[0] > 6 && t.size[0] < 11, `the tender is ${t.size[0].toFixed(1)} m`);
  assert.ok(t.tris <= 600, `${t.tris} triangles`);
});

test("every yacht faces outward (no face turned in, no hole)", () => {
  const g = glb();
  g.doc.nodes.filter((n) => n.mesh !== undefined).forEach((n) => assert.ok(signedVolume(g, n.name) > 0, `${n.name}`));
});
