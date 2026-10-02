// The driver's head, eyes, hair and beards in assets/driver.glb
// (docs/superpowers/specs/2026-10-01-driver-faces-design.md).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Faces = require("../faces.js");

const FILE = path.join(__dirname, "..", "assets", "driver.glb");
const buf = fs.readFileSync(FILE);
const jsonLength = buf.readUInt32LE(12);
const doc = JSON.parse(buf.subarray(20, 20 + jsonLength).toString("utf8"));
const bin = buf.subarray(20 + jsonLength + 8);

const meshNode = (name) => doc.nodes.find((n) => n.name === name && n.mesh !== undefined);
const targetNames = (node) => (doc.meshes[node.mesh].extras || {}).targetNames || [];
const tris = (node) => doc.meshes[node.mesh].primitives.reduce((n, p) => n + doc.accessors[p.indices].count / 3, 0);
const materials = (node) => doc.meshes[node.mesh].primitives.map((p) => doc.materials[p.material].name);

// A skinned mesh's vertices in the rest pose: glTF skinned meshes are drawn
// in the skeleton's space, which here is the figure's (Y up, metres).
function positions(node) {
  const out = [];
  doc.meshes[node.mesh].primitives.forEach((p) => {
    const a = doc.accessors[p.attributes.POSITION];
    const view = doc.bufferViews[a.bufferView];
    const base = (view.byteOffset || 0) + (a.byteOffset || 0);
    const stride = view.byteStride || 12;
    for (let k = 0; k < a.count; k += 1) out.push([0, 1, 2].map((c) => bin.readFloatLE(base + k * stride + c * 4)));
  });
  return out;
}

test("faces: the head is a skinned mesh with every shape key and its masks", () => {
  const head = meshNode("head_skin");
  assert.ok(head, "there is a head");
  assert.ok(head.skin !== undefined, "the head is skinned to the rig");
  const t = tris(head);
  assert.ok(t > 5000 && t < 12000, `${t} triangles`);
  assert.ok(materials(head).includes("skin"));
  const names = targetNames(head);
  Faces.MORPH_KEYS.forEach((k) => assert.ok(names.includes(k), `shape key ${k}`));
  doc.meshes[head.mesh].primitives.forEach((p) => {
    assert.ok("_MASKS" in p.attributes, "the skin's masks (lips, beard, warmth, sockets)");
    assert.ok("_VID" in p.attributes, "each vertex's own id, which the hair and beards are bound to");
    assert.equal(p.targets.length, names.length);
  });
});

test("faces: real eyes (sclera, iris, cornea), brows and lashes", () => {
  ["eye_L", "eye_R"].forEach((e) => {
    const node = meshNode(e);
    assert.ok(node, `${e}`);
    ["eye_sclera", "eye_iris", "eye_cornea"].forEach((m) => assert.ok(materials(node).includes(m), `${e} has ${m}`));
    assert.ok(targetNames(node).includes("eye_size_incr"), `${e} follows the eye keys`);
  });
  assert.ok(meshNode("lashes"), "lashes");
  assert.ok(targetNames(meshNode("lashes")).includes("eye_open_incr"), "the lashes follow the lids");
  assert.ok(bound(meshNode("brows")), "the brows are bound to the brow ridge");
});

// Bound to the head: each vertex names three head vertices (_BIND, their _VID)
// and its barycentric weights on them (_BARY), so it follows the head's shape.
function bound(node) {
  return doc.meshes[node.mesh].primitives.every((p) => "_BIND" in p.attributes && "_BARY" in p.attributes);
}

test("faces: every hair style and facial hair is a mesh, bound to the head's shape", () => {
  // (A buzz cut is shaded on the scalp, like stubble.)
  Faces.HAIR_STYLES.filter((s) => s !== "buzz").forEach((s) => {
    const node = meshNode(`hair_${s}`);
    assert.ok(node, `hair_${s}`);
    assert.ok(materials(node).includes("hair"), `hair_${s} wears hair`);
    assert.ok(bound(node), `hair_${s} is bound to the head`);
    assert.ok(doc.meshes[node.mesh].primitives.every((p) => "_FLOW" in p.attributes), `hair_${s} carries its strands' direction`);
  });
  Faces.FACIAL_HAIR.filter((s) => s !== "none" && s !== "stubble").forEach((s) => {
    const node = meshNode(`beard_${s}`);
    assert.ok(node, `beard_${s}`);
    assert.ok(materials(node).includes("beard"));
    assert.ok(bound(node), `beard_${s} is bound to the jaw`);
  });
});

test("faces: the head sits on the neck, its neck reaching down into the collar", () => {
  const head = positions(meshNode("head_skin"));
  const low = Math.min(...head.map((p) => p[1]));
  const top = Math.max(...head.map((p) => p[1]));
  // The suit's collar runs from 1.458 m to 1.478 m (build_driver.py).
  assert.ok(low < 1.47 && low > 1.40, `the neck's bottom is at ${low.toFixed(3)} m`);
  assert.ok(top > 1.72 && top < 1.80, `the crown is at ${top.toFixed(3)} m`);
  // At the top of the collar the neck fills it: no gap round it wider than 6 mm.
  const ring = head.filter((p) => Math.abs(p[1] - 1.478) < 0.006);
  const radius = Math.max(...ring.map((p) => Math.hypot(p[0], p[2])));
  assert.ok(radius > 0.05 && radius < 0.075, `the neck's radius at the collar is ${radius.toFixed(3)} m`);
});

test("faces: the file stays small enough to load fast", () => {
  assert.ok(buf.length < 4 * 1024 * 1024, `${(buf.length / 1048576).toFixed(2)} MB`);
});
