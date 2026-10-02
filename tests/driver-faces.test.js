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
const attributes = (node) => doc.meshes[node.mesh].primitives.map((p) => Object.keys(p.attributes));
const hasAll = (node, names) => attributes(node).every((a) => names.every((n) => a.includes(n)));

// An accessor's values, as arrays of its components.
function values(index) {
  const a = doc.accessors[index];
  const size = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
  const view = doc.bufferViews[a.bufferView];
  const base = (view.byteOffset || 0) + (a.byteOffset || 0);
  const stride = view.byteStride || size * 4;
  return Array.from({ length: a.count }, (_, k) => Array.from({ length: size }, (_, c) => bin.readFloatLE(base + k * stride + c * 4)));
}
// A mesh's vertices in the rest pose. The figure's meshes are all drawn in
// its own space (Y up, metres): the skinned ones in the skeleton's, the
// rigid ones placed so that it is theirs too.
const positions = (node, material) => doc.meshes[node.mesh].primitives
  .filter((p) => !material || doc.materials[p.material].name === material)
  .flatMap((p) => values(p.attributes.POSITION));
const attribute = (node, name) => doc.meshes[node.mesh].primitives.flatMap((p) => values(p.attributes[name]));

test("faces: the head is a skinned mesh with every shape key, its masks and its shading", () => {
  const head = meshNode("head_skin");
  assert.ok(head, "there is a head");
  assert.ok(head.skin !== undefined, "the head is skinned to the rig");
  const t = tris(head);
  assert.ok(t > 5000 && t < 12000, `${t} triangles`);
  assert.deepEqual(materials(head), ["skin"]);
  const names = targetNames(head);
  Faces.MORPH_KEYS.forEach((k) => assert.ok(names.includes(k), `shape key ${k}`));
  // _MASKS (lips, beard, warmth, sockets), _SCALP (where hair grows), _AO (the
  // folds' shade, baked) and _VID (each vertex's id, which the hair is bound by).
  assert.ok(hasAll(head, ["_MASKS", "_SCALP", "_AO", "_VID"]));
  doc.meshes[head.mesh].primitives.forEach((p) => assert.equal(p.targets.length, names.length));
  // The shade is real: open on the cheeks, closed in the folds.
  const ao = attribute(head, "_AO").map((v) => v[0]);
  assert.ok(Math.min(...ao) < 0.4 && Math.max(...ao) > 0.9, `occlusion from ${Math.min(...ao)} to ${Math.max(...ao)}`);
});

test("faces: real eyes (sclera, iris, cornea) that follow the face's keys", () => {
  ["eye_L", "eye_R"].forEach((e) => {
    const node = meshNode(e);
    assert.ok(node, e);
    ["eye_sclera", "eye_iris", "eye_cornea"].forEach((m) => assert.ok(materials(node).includes(m), `${e} has ${m}`));
    // How each key moves and scales the eye: [dx, dy, dz, scale - 1].
    const keys = (node.extras || {}).eye_keys || {};
    ["eye_size_incr", "eye_spacing_incr", "head_width_incr", "ethnic_asian"].forEach((k) => {
      assert.ok(Array.isArray(keys[k]) && keys[k].length === 4, `${e} follows ${k}`);
    });
    assert.ok(keys.eye_size_incr[3] > 0 && keys.eye_size_decr[3] < 0, "a bigger eye is bigger");
    Object.keys(keys).forEach((k) => assert.ok(Faces.MORPH_KEYS.includes(k), `${k} is a key`));
    assert.equal((node.extras.eye_centre || []).length, 3);
    // The eyeball is about an eye's size: 24 to 30 mm across.
    const pts = positions(node, "eye_sclera");
    const across = Math.max(...pts.map((p) => p[2])) - Math.min(...pts.map((p) => p[2]));
    assert.ok(across > 0.024 && across < 0.03, `${(across * 1000).toFixed(1)} mm across`);
  });
  // Left and right: the figure's left eye on its left (glTF's -Z).
  assert.ok(meshNode("eye_L").extras.eye_centre[2] < 0 && meshNode("eye_R").extras.eye_centre[2] > 0);
});

// Bound to the head: each vertex names three head vertices (_BIND, their _VID)
// and its barycentric weights on them (_BARY), so it follows the head's shape.
const bound = (node) => hasAll(node, ["_BIND", "_BARY"]);

test("faces: lashes along the lids, bound to them; brows of strands, bound to the brow", () => {
  const lashes = meshNode("lashes");
  assert.ok(lashes && bound(lashes), "the lashes follow the lids");
  assert.ok(hasAll(lashes, ["TEXCOORD_0"]), "drawn with strands");
  // Both eyes, upper and lower lids: four strips, either side of the face.
  const ys = positions(lashes).map((p) => p[2]);
  assert.ok(ys.some((z) => z < -0.02) && ys.some((z) => z > 0.02));
  const brows = meshNode("brows");
  assert.ok(brows && bound(brows), "the brows follow the brow ridge");
  assert.ok(hasAll(brows, ["_TIP", "_FLOW", "_HAIR"]), "the brows grow strands");
});

test("faces: every hair style and facial hair grows on a shared shell, bound to the head", () => {
  const hair = meshNode("hair");
  assert.ok(hair && bound(hair), "the hair's shell follows the head's shape");
  assert.deepEqual(materials(hair), ["hair"]);
  Faces.HAIR_STYLES.forEach((s) => {
    const k = s.toUpperCase();
    assert.ok(hasAll(hair, [`_TIP_${k}`, `_FLOW_${k}`, `_HAIR_${k}`]), `the ${s} style's strands`);
  });
  const bun = meshNode("hair_bun");
  assert.ok(bun && bound(bun) && hasAll(bun, ["_TIP", "_FLOW", "_HAIR"]), "the braids' bun");
  const beard = meshNode("beard");
  assert.ok(beard && bound(beard), "the beard's shell follows the jaw");
  assert.deepEqual(materials(beard), ["beard"]);
  Faces.FACIAL_HAIR.filter((s) => s !== "none" && s !== "stubble").forEach((s) => {
    const k = s.toUpperCase();
    assert.ok(hasAll(beard, [`_TIP_${k}`, `_FLOW_${k}`, `_HAIR_${k}`]), `the ${s}'s strands`);
  });
});

test("faces: each style's hair is where it should be: on the scalp, its own depth", () => {
  const hair = meshNode("hair");
  const pos = positions(hair);
  const depth = (style) => {
    const tip = attribute(hair, `_TIP_${style}`);
    const edge = attribute(hair, `_HAIR_${style}`).map((v) => v[0]);
    // The deepest point inside the hair, metres.
    return Math.max(...tip.map((t, i) => (edge[i] > 0.9 ? Math.hypot(...t) : 0)));
  };
  // A buzz cut a few millimetres; swept hair centimetres deep on top.
  assert.ok(depth("BUZZ") < 0.004, `buzz ${depth("BUZZ")}`);
  assert.ok(depth("SWEPT") > 0.025, `swept ${depth("SWEPT")}`);
  assert.ok(depth("CURLY") > depth("CROP"), "curls stand deeper than a crop");
  // On the forehead, the hair grows only above the brows (the brow ridge is
  // about 2 cm over the eyes' centre).
  const edge = attribute(hair, "_HAIR_CROP").map((v) => v[0]);
  const eyeLine = meshNode("eye_L").extras.eye_centre[1];
  const front = pos.filter((p, i) => edge[i] > 0 && p[0] > 0.07 && Math.abs(p[2]) < 0.045);
  assert.ok(front.length > 20, "hair on the front of the head");
  front.forEach((p) => assert.ok(p[1] > eyeLine + 0.035, `hair on the forehead at ${p[1].toFixed(3)} m`));
  // And it reaches down to the nape at the back.
  assert.ok(pos.some((p, i) => edge[i] > 0 && p[0] < -0.04 && p[1] < 1.6), "hair down to the nape");
});

test("faces: the neck stands in the collar, filling it, never floating above it", () => {
  const head = positions(meshNode("head_skin"));
  const low = Math.min(...head.map((p) => p[1]));
  const top = Math.max(...head.map((p) => p[1]));
  // The suit's collar runs from 1.458 m to 1.478 m (build_driver.py).
  assert.ok(low < 1.458 && low > 1.40, `the neck's bottom is at ${low.toFixed(3)} m`);
  assert.ok(top > 1.72 && top < 1.80, `the crown is at ${top.toFixed(3)} m`);
  // At the collar's top edge, the neck is just inside it all the way round.
  const body = positions(meshNode("body"), "suit_trim").filter((p) => Math.abs(p[1] - 1.478) < 0.0015);
  const cx = body.reduce((n, p) => n + p[0], 0) / body.length;
  const cz = body.reduce((n, p) => n + p[2], 0) / body.length;
  const around = (pts, a) => {
    const near = pts.filter((p) => Math.abs(Math.atan2(p[2] - cz, p[0] - cx) - a) < 0.3);
    return Math.max(...near.map((p) => Math.hypot(p[0] - cx, p[2] - cz)));
  };
  const ring = head.filter((p) => Math.abs(p[1] - 1.478) < 0.004);
  for (let a = -Math.PI + 0.4; a < Math.PI; a += Math.PI / 4) {
    const gap = around(body, a) - around(ring, a);
    assert.ok(gap > -0.001 && gap < 0.005, `a gap of ${(gap * 1000).toFixed(1)} mm round the neck at ${a.toFixed(2)}`);
  }
});

test("faces: the file stays small enough to load fast", () => {
  assert.ok(buf.length < 4 * 1024 * 1024, `${(buf.length / 1048576).toFixed(2)} MB`);
});
