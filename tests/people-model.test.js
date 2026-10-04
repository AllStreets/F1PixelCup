// The people figures (tools/blender/build_people.py -> assets/people.glb),
// docs/superpowers/specs/2026-10-01-trackside-blender-design.md section 4.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { load, read, part, node } = require("./glb-read.js");

const FILE = path.join(__dirname, "..", "assets", "people.glb");
const CROWD = ["crowd_a", "crowd_b", "crowd_c", "crowd_d"];
const PEOPLE = [...CROWD, "crew", "photographer", "camera_operator"];
// The shader's parts, marked in the UVs: u = (part + 0.5) / 16 (r3d/people.js).
const PARTS = ["torso", "head", "upper_arm_L", "forearm_L", "upper_arm_R", "forearm_R", "thigh_L", "shin_L", "thigh_R", "shin_R", "fixed"];

test("every figure is there, with its materials by role", () => {
  const glb = load(FILE);
  PEOPLE.concat("tv_platform").forEach((n) => assert.ok(node(glb, n), `${n} is missing`));
  CROWD.forEach((n) => {
    const { materials } = part(glb, n);
    ["skin", "hair", "shirt", "trousers", "shoes"].forEach((m) => assert.ok(materials.includes(m), `${n} has no ${m}`));
  });
  ["skin", "shirt", "trousers", "trim", "gear"].forEach((m) => assert.ok(part(glb, "crew").materials.includes(m), `the crew has no ${m}`));
  ["gear", "lens"].forEach((m) => {
    assert.ok(part(glb, "photographer").materials.includes(m), `the photographer has no ${m}`);
    assert.ok(part(glb, "camera_operator").materials.includes(m), `the camera operator has no ${m}`);
  });
  assert.ok(part(glb, "tv_platform").materials.includes("steel"), "the platform has no steel");
});

test("people are people-sized, on the ground, facing forward (+x)", () => {
  const glb = load(FILE);
  PEOPLE.forEach((n) => {
    const p = part(glb, n);
    assert.ok(Math.abs(p.lo[1]) < 0.02, `${n}'s feet are at ${p.lo[1].toFixed(3)}`);
    // Standing height (the camera on its tripod may stand a little higher than a head).
    assert.ok(p.hi[1] > 1.55 && p.hi[1] < 1.95, `${n} is ${p.hi[1].toFixed(2)} m tall`);
  });
  CROWD.forEach((n) => {
    const p = part(glb, n);
    // A person's width across the shoulders, and less deep than wide.
    assert.ok(p.size[2] > 0.35 && p.size[2] < 0.75, `${n} is ${p.size[2].toFixed(2)} m wide`);
    assert.ok(p.size[0] < p.size[2], `${n} is deeper than wide`);
  });
  // The photographer's lens and the TV camera point forward.
  assert.ok(part(glb, "photographer").hi[0] > 0.45, "the photographer's lens points forward");
  assert.ok(part(glb, "camera_operator").hi[0] > 0.5, "the TV camera is in front of its operator");
  // The platform: a deck a person stands on, about 3 m up.
  const deck = node(glb, "tv_platform").extras;
  assert.ok(deck && deck.deck > 2.4 && deck.deck < 3.6, `the platform's deck is at ${deck && deck.deck}`);
});

test("triangle budgets: crowds are instanced by the thousand", () => {
  const glb = load(FILE);
  CROWD.forEach((n) => {
    const { tris } = part(glb, n);
    assert.ok(tris >= 120 && tris <= 300, `${n} has ${tris} triangles`);
  });
  ["crew", "photographer", "camera_operator", "tv_platform"].forEach((n) => {
    const { tris } = part(glb, n);
    assert.ok(tris <= 1500, `${n} has ${tris} triangles`);
  });
});

test("each crowd figure's limbs are marked for the shader, with their joints", () => {
  const glb = load(FILE);
  CROWD.concat("crew").forEach((n) => {
    const nd = node(glb, n);
    const j = nd.extras && nd.extras.joints;
    assert.ok(j, `${n} has no joints`);
    ["shoulder_L", "elbow_L", "shoulder_R", "elbow_R", "hip_L", "knee_L", "hip_R", "knee_R"].forEach((k) => assert.ok(Array.isArray(j[k]) && j[k].length === 3, `${n}: ${k}`));
    // Left is -z in glTF (Blender's +y); hips below shoulders, knees below hips.
    assert.ok(j.shoulder_L[2] < 0 && j.shoulder_R[2] > 0, `${n}: shoulders`);
    assert.ok(j.hip_L[1] > j.knee_L[1] + 0.3 && j.shoulder_L[1] > j.hip_L[1] + 0.35, `${n}: proportions`);
    // Every part is there, and each sits where its joint says.
    const byPart = new Map();
    glb.doc.meshes[nd.mesh].primitives.forEach((p) => {
      const pos = read(glb, p.attributes.POSITION);
      assert.ok(p.attributes.TEXCOORD_0 !== undefined, `${n} has no part marks`);
      read(glb, p.attributes.TEXCOORD_0).forEach(([u], i) => {
        const k = Math.floor(u * 16);
        if (!byPart.has(k)) byPart.set(k, []);
        byPart.get(k).push(pos[i]);
      });
    });
    PARTS.slice(0, 10).forEach((name, k) => assert.ok(byPart.has(k), `${n} has no ${name}`));
    const ys = (k) => byPart.get(k).map((v) => v[1]);
    // A thigh runs from its hip to its knee; a forearm hangs below its elbow.
    assert.ok(Math.max(...ys(6)) <= j.hip_L[1] + 0.12 && Math.min(...ys(6)) >= j.knee_L[1] - 0.08, `${n}: the left thigh`);
    assert.ok(Math.max(...ys(7)) <= j.knee_L[1] + 0.08, `${n}: the left shin`);
    assert.ok(Math.max(...ys(5)) <= j.elbow_R[1] + 0.08, `${n}: the right forearm`);
  });
});
