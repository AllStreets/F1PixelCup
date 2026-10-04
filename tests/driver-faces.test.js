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

// An accessor's values, as arrays of its components (floats; sparse ones,
// as morph targets often are, filled in over zeros).
function values(index) {
  const a = doc.accessors[index];
  const size = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
  let out = Array.from({ length: a.count }, () => new Array(size).fill(0));
  if (a.bufferView !== undefined) {
    const view = doc.bufferViews[a.bufferView];
    const base = (view.byteOffset || 0) + (a.byteOffset || 0);
    // (Joints are bytes or shorts; everything else here floats.)
    const [width, read] = { 5121: [1, (o) => bin.readUInt8(o)], 5123: [2, (o) => bin.readUInt16LE(o)], 5125: [4, (o) => bin.readUInt32LE(o)], 5126: [4, (o) => bin.readFloatLE(o)] }[a.componentType];
    const stride = view.byteStride || size * width;
    out = out.map((_, k) => Array.from({ length: size }, (__, c) => read(base + k * stride + c * width)));
  }
  if (a.sparse) {
    const iv = doc.bufferViews[a.sparse.indices.bufferView];
    const ib = (iv.byteOffset || 0) + (a.sparse.indices.byteOffset || 0);
    const read = { 5121: (o) => bin.readUInt8(o), 5123: (o) => bin.readUInt16LE(o), 5125: (o) => bin.readUInt32LE(o) }[a.sparse.indices.componentType];
    const width = { 5121: 1, 5123: 2, 5125: 4 }[a.sparse.indices.componentType];
    const vv = doc.bufferViews[a.sparse.values.bufferView];
    const vb = (vv.byteOffset || 0) + (a.sparse.values.byteOffset || 0);
    for (let k = 0; k < a.sparse.count; k += 1) {
      const i = read(ib + k * width);
      out[i] = Array.from({ length: size }, (_, c) => bin.readFloatLE(vb + (k * size + c) * 4));
    }
  }
  return out;
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
    // Only the eye's own size scales it: a wider or longer head moves it,
    // never stretches it.
    Object.entries(keys).filter(([k]) => !k.startsWith("eye_size")).forEach(([k, v]) => assert.ok(Math.abs(v[3]) < 0.02, `${k} scales the eye by ${v[3]}`));
    Object.keys(keys).forEach((k) => assert.ok(Faces.MORPH_KEYS.includes(k), `${k} is a key`));
    assert.equal((node.extras.eye_centre || []).length, 3);
    // The eyeball: 29 mm across (driver_head.py's ball()).
    const pts = positions(node, "eye_sclera");
    const across = Math.max(...pts.map((p) => p[2])) - Math.min(...pts.map((p) => p[2]));
    assert.ok(across > 0.027 && across < 0.0305, `${(across * 1000).toFixed(1)} mm across`);
  });
  // Left and right: the figure's left eye on its left (glTF's -Z).
  assert.ok(meshNode("eye_L").extras.eye_centre[2] < 0 && meshNode("eye_R").extras.eye_centre[2] > 0);
});

// How far a brow's hairs reach above its patch's middle line, at most, for a
// thickness and an arch (r3d/driver.js's brow shader: the arch lifts the
// line by up to 3.5 mm, the half height is 5.2 mm times the thickness, the
// hairs thin out to 1.25 half heights).
const browReach = (thickness, arch) => 0.0035 * Math.max(0, arch) + 1.25 * 0.0052 * thickness;

// Bound to the head: each vertex names three head vertices (_BIND, their _VID)
// and its barycentric weights on them (_BARY), so it follows the head's shape.
// Every id is one of the head's own vertices and the weights sum to 1.
const headIds = new Set(attribute(meshNode("head_skin"), "_VID").map((v) => Math.round(v[0])));
function bound(node) {
  if (!hasAll(node, ["_BIND", "_BARY"])) return false;
  const ids = attribute(node, "_BIND"), weights = attribute(node, "_BARY");
  return ids.every((t) => t.every((i) => Number.isInteger(Math.round(i)) && Math.abs(i - Math.round(i)) < 1e-3 && headIds.has(Math.round(i))))
    && weights.every((w) => Math.abs(w[0] + w[1] + w[2] - 1) < 1e-3 && w.every((x) => x > -0.05));
}

test("faces: lashes along the lids, bound to them; brows of strands, bound to the brow", () => {
  const lashes = meshNode("lashes");
  assert.ok(lashes && bound(lashes), "the lashes follow the lids");
  assert.ok(hasAll(lashes, ["TEXCOORD_0"]), "drawn with strands");
  // Both eyes: lashes either side of the face (glTF's Z across it).
  const across = positions(lashes).map((p) => p[2]);
  assert.ok(across.some((z) => z < -0.02) && across.some((z) => z > 0.02));
  const brows = meshNode("brows");
  assert.ok(brows && bound(brows), "the brows follow the brow ridge");
  assert.ok(hasAll(brows, ["_TIP", "_FLOW", "_HAIR", "_BROW"]), "the brows grow strands, each driver's own shape");
  // Room for the thickest, most arched brow a look may have: r3d/driver.js
  // draws hairs out to its middle line's arch plus 1.25 half heights.
  const b = attribute(brows, "_BROW");
  assert.ok(Math.min(...b.map((v) => v[0])) === 0 && Math.max(...b.map((v) => v[0])) === 1, "inner end to tail");
  const reach = browReach(Faces.BROW_SHAPE.thickness[1], Faces.BROW_SHAPE.arch[1]);
  assert.ok(Math.min(...b.map((v) => v[1])) < -reach && Math.max(...b.map((v) => v[1])) > reach, `room above and below for ${reach}`);
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
  // Braids stand off the scalp as raised rows (the shader plaits them).
  assert.ok(depth("BRAIDS") > 0.006, `braids ${depth("BRAIDS")}`);
  // A buzz cut a few millimetres; swept hair centimetres deep on top.
  assert.ok(depth("BUZZ") < 0.004, `buzz ${depth("BUZZ")}`);
  assert.ok(depth("SWEPT") > 0.02, `swept ${depth("SWEPT")}`);
  assert.ok(depth("CURLY") > depth("CROP"), "curls stand deeper than a crop");
  // Every style: on the forehead the hair grows only above the brows, never
  // on the ears (where the target that swings them out acts), and down to
  // the nape.
  const eyeLine = meshNode("eye_L").extras.eye_centre[1];
  const head = meshNode("head_skin");
  const ear = targetNames(head).indexOf("ear_out_incr");
  const earDeltas = values(doc.meshes[head.mesh].primitives[0].targets[ear].POSITION);
  const earPts = positions(head).filter((p, i) => Math.hypot(...earDeltas[i]) > 0.004);
  assert.ok(earPts.length > 20, "the ears are found");
  Faces.HAIR_STYLES.forEach((style) => {
    const edge = attribute(hair, `_HAIR_${style.toUpperCase()}`).map((v) => v[0]);
    const front = pos.filter((p, i) => edge[i] > 0 && p[0] > 0.07 && Math.abs(p[2]) < 0.045);
    assert.ok(front.length > 20, `${style}: hair on the front of the head`);
    // (Above a plain brow's top, 2.3 cm over the eyes' centre; a fringe's
    // reach against each driver's own brows is checked below.)
    front.forEach((p) => assert.ok(p[1] > eyeLine + 0.024, `${style}: hair on the forehead at ${p[1].toFixed(3)} m`));
    pos.forEach((p, i) => {
      if (edge[i] > 0) assert.ok(earPts.every((q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) > 0.003), `${style}: hair on an ear`);
    });
    assert.ok(pos.some((p, i) => edge[i] > 0 && p[0] < -0.04 && p[1] < 1.6), `${style}: hair down to the nape`);
  });
});

// The head's outline where the plane of the collar's inner lip (y = 1.488)
// cuts it: a point on every edge of its triangles that crosses the plane.
const headTris = values(doc.meshes[meshNode("head_skin").mesh].primitives[0].indices).map((v) => v[0]);
function cut(pts, y = 1.488) {
  const out = [];
  for (let t = 0; t < headTris.length; t += 3) {
    for (let e = 0; e < 3; e += 1) {
      const a = pts[headTris[t + e]], b = pts[headTris[t + (e + 1) % 3]];
      if ((a[1] - y) * (b[1] - y) < 0) {
        const f = (y - a[1]) / (b[1] - a[1]);
        out.push([a[0] + (b[0] - a[0]) * f, y, a[2] + (b[2] - a[2]) * f]);
      }
    }
  }
  return out;
}
// The collar's inner lip (build_driver.py's collar band), its middle, and how
// far out a set of points reaches at a bearing round it.
const collarEdge = positions(meshNode("collar")).filter((p) => Math.abs(p[1] - 1.488) < 0.0006);
const cx = collarEdge.reduce((n, p) => n + p[0], 0) / collarEdge.length;
const cz = collarEdge.reduce((n, p) => n + p[2], 0) / collarEdge.length;
const around = (pts, a) => Math.max(...pts.filter((p) => Math.abs(Math.atan2(p[2] - cz, p[0] - cx) - a) < 0.3).map((p) => Math.hypot(p[0] - cx, p[2] - cz)));
const gaps = (pts) => {
  const ring = cut(pts);
  const out = [];
  for (let a = -Math.PI + 0.4; a < Math.PI; a += Math.PI / 4) out.push([a, around(collarEdge, a) - around(ring, a)]);
  return out;
};

test("faces: the suit's collar stands up round the neck from a sloping shoulder line", () => {
  const collar = positions(meshNode("collar"));
  const top = Math.max(...collar.map((p) => p[1])), low = Math.min(...collar.map((p) => p[1]));
  assert.ok(top - low > 0.03 && top - low < 0.06, `the band is ${((top - low) * 100).toFixed(1)} cm tall`);
  // Close round a racing driver's thick neck: no wider than 14.5 cm across.
  const across = Math.max(...collar.map((p) => p[2])) - Math.min(...collar.map((p) => p[2]));
  assert.ok(across < 0.145, `the collar is ${(across * 100).toFixed(1)} cm across`);
  // The body slopes down from the collar to the shoulders (the trapezius),
  // never a flat ledge: it meets the collar a centimetre or more below its
  // top and falls away outward.
  const body = positions(meshNode("body"));
  const at = (y) => Math.max(...body.filter((p) => Math.abs(p[2] - y) < 0.006 && Math.abs(p[0]) < 0.03).map((p) => p[1]));
  assert.ok(at(0.07) < top - 0.01 && at(0.12) < at(0.07) - 0.01, `the shoulder line falls ${at(0.07).toFixed(3)} to ${at(0.12).toFixed(3)} m`);
});

test("faces: the neck stands in the collar, filling it, never floating above it", () => {
  const head = positions(meshNode("head_skin"));
  const low = Math.min(...head.map((p) => p[1]));
  const top = Math.max(...head.map((p) => p[1]));
  // The suit's collar stands up to 1.4905 m (build_driver.py).
  assert.ok(collarEdge.length >= 24, "the collar's inner lip");
  assert.ok(low < 1.458 && low > 1.40, `the neck's bottom is at ${low.toFixed(3)} m`);
  assert.ok(top > 1.72 && top < 1.80, `the crown is at ${top.toFixed(3)} m`);
  // At the collar's top edge, the neck is just inside it all the way round.
  gaps(head).forEach(([a, gap]) => assert.ok(gap > 0 && gap < 0.005, `a gap of ${(gap * 1000).toFixed(1)} mm round the neck at ${a.toFixed(2)}`));
});

test("faces: a fringe falls clear of its own driver's brows; a side part is a clean line", () => {
  const hair = meshNode("hair");
  const pos = positions(hair);
  const eyeLine = meshNode("eye_L").extras.eye_centre[1];
  const { DRIVERS } = require("../game-data.js");
  const edge = attribute(hair, "_HAIR_FRINGE").map((v) => v[0]);
  const tip = attribute(hair, "_TIP_FRINGE");
  DRIVERS.filter((d) => d.look.hair.style === "fringe").forEach((d) => {
    // The brow's top: the patch's middle line (1.72 cm over the eyes,
    // arching up to 2 mm more) plus the driver's own reach.
    const browTop = eyeLine + 0.0172 + 0.002 + browReach(d.look.brows.thickness, d.look.brows.arch);
    pos.forEach((p, i) => {
      if (edge[i] <= 0 || p[0] < 0.07 || Math.abs(p[2]) > 0.045) return;
      // (glTF's Y is Blender's Z: the tip's height is its third component.)
      const lowest = p[1] + Math.min(0, tip[i][2] * d.look.hair.volume);
      assert.ok(lowest > browTop, `${d.id}'s fringe reaches ${lowest.toFixed(4)} m, his brows ${browTop.toFixed(4)} m`);
    });
  });
  // The part: along its whole length the shell has vertices on the part's
  // middle and both its edges, and the hair stops there (edge 0 or less),
  // so the line of scalp is drawn exactly.
  const part = attribute(hair, "_HAIR_SIDE_PART").map((v) => v[0]);
  const partZ = -0.024; // the figure's left, Blender's +Y
  const on = pos.map((p, i) => [p, part[i]]).filter(([p]) => Math.abs(p[2] - partZ) < 0.0001 && p[1] > 1.72 && p[0] > -0.015);
  assert.ok(on.length >= 8, `${on.length} vertices on the part`);
  on.forEach(([p, e]) => assert.ok(e < 0, `bare scalp on the part at ${p[0].toFixed(3)}`));
  const xs = on.map(([p]) => p[0]).sort((a, b) => a - b);
  for (let k = 1; k < xs.length; k += 1) assert.ok(xs[k] - xs[k - 1] < 0.02, `the part runs unbroken (a gap at ${xs[k - 1].toFixed(3)})`);
});

test("faces: Hamilton's beard runs full along the jaw, not in patches", () => {
  const beard = meshNode("beard");
  const pos = positions(beard);
  const edge = attribute(beard, "_HAIR_MOUSTACHE").map((v) => v[0]);
  // Round the jaw past the chin toward the ear, either side: in every few
  // degrees' slice the beard is full (not thinned at an edge) over a band
  // at least 5 mm deep, never only a vertex or two.
  for (const sgn of [1, -1]) {
    for (let a = 0.45; a < 1.1; a += 0.1) {
      const full = pos.filter((p, i) => {
        const b = Math.atan2(sgn * p[2], p[0] - 0.04);
        return b > a - 0.05 && b < a + 0.05 && p[1] < 1.575 && edge[i] > 0.95;
      }).map((p) => p[1]);
      const depth = full.length ? Math.max(...full) - Math.min(...full) : 0;
      assert.ok(depth > 0.005, `the jaw beard is full over ${(depth * 1000).toFixed(1)} mm at ${(a * sgn).toFixed(2)} rad`);
    }
  }
});

// The head as a driver's look shapes it: the rest shape plus each morph
// target times its weight.
function shaped(look) {
  const head = meshNode("head_skin");
  const names = targetNames(head);
  const w = Faces.morphWeights(look);
  const prim = doc.meshes[head.mesh].primitives[0];
  const pts = values(prim.attributes.POSITION);
  names.forEach((k, t) => {
    if (!w[k]) return;
    values(prim.targets[t].POSITION).forEach((d, i) => { for (let c = 0; c < 3; c += 1) pts[i][c] += w[k] * d[c]; });
  });
  return pts;
}

test("faces: every driver's own face keeps its chin clear of the collar and its neck in it", () => {
  const { DRIVERS } = require("../game-data.js");
  DRIVERS.forEach((d) => {
    const pts = shaped(d.look);
    // The chin's underside: the lowest point in front of the neck, 1.5 cm or
    // more above the collar (a driver's short neck).
    const chin = Math.min(...pts.filter((p) => p[0] - cx > 0.075 && Math.abs(p[2] - cz) < 0.03).map((p) => p[1]));
    const collarTop = Math.max(...positions(meshNode("collar")).map((p) => p[1]));
    assert.ok(chin > collarTop + 0.015, `${d.id}'s chin comes down to ${chin.toFixed(3)} m, the collar's top ${collarTop.toFixed(3)} m`);
    // Never more than a millimetre through the collar, never a gap you could
    // see into.
    gaps(pts).forEach(([a, gap]) => {
      assert.ok(gap > -0.001 && gap < 0.006, `${d.id}: a gap of ${(gap * 1000).toFixed(1)} mm round the neck at ${a.toFixed(2)}`);
    });
  });
});

test("faces: the hair and beard ride the head bone; the neck bends only below them", () => {
  const head = meshNode("head_skin");
  const prim = doc.meshes[head.mesh].primitives[0];
  const pts = values(prim.attributes.POSITION);
  const joints = values(prim.attributes.JOINTS_0), weights = values(prim.attributes.WEIGHTS_0);
  const skin = doc.skins[head.skin];
  const headJoint = skin.joints.findIndex((j) => doc.nodes[j].name === "head");
  // Where the skin is all head bone.
  const rigid = (i) => joints[i].reduce((n, j, k) => n + (Math.round(j) === headJoint ? weights[i][k] : 0), 0) > 0.999;
  const lowestRigid = Math.min(...pts.filter((p, i) => !rigid(i)).map((p) => p[1]).filter((y) => y > 0), 9);
  const highestBent = Math.max(...pts.filter((p, i) => !rigid(i)).map((p) => p[1]));
  ["hair", "beard"].forEach((name) => {
    const node = meshNode(name);
    const low = Math.min(...positions(node).map((p) => p[1]));
    assert.ok(low > highestBent, `${name} reaches down to ${low.toFixed(3)} m, the neck bends up to ${highestBent.toFixed(3)} m`);
  });
  assert.ok(lowestRigid < 9);
});

test("faces: the file stays small enough to load fast", () => {
  assert.ok(buf.length < 4 * 1024 * 1024, `${(buf.length / 1048576).toFixed(2)} MB`);
});
