const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const FILE = path.join(__dirname, "..", "assets", "driver.glb");
function gltf(file) {
  const buf = fs.readFileSync(file);
  const jsonLength = buf.readUInt32LE(12);
  return JSON.parse(buf.subarray(20, 20 + jsonLength).toString("utf8"));
}

// Column-major 4x4 matrices, as glTF writes them.
function compose(n) {
  if (n.matrix) return n.matrix.slice();
  const [x, y, z, w] = n.rotation || [0, 0, 0, 1];
  const [sx, sy, sz] = n.scale || [1, 1, 1];
  const [tx, ty, tz] = n.translation || [0, 0, 0];
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ];
}
function mul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c += 1) for (let r = 0; r < 4; r += 1) for (let k = 0; k < 4; k += 1) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
function apply(m, [x, y, z]) {
  return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
}

// The figure's bounds in its rest pose, every mesh through its node's chain.
function bounds(doc, skip = () => false) {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  const walk = (i, parent) => {
    const n = doc.nodes[i];
    const m = mul(parent, compose(n));
    if (n.mesh !== undefined && !skip(n)) {
      doc.meshes[n.mesh].primitives.forEach((p) => {
        const a = doc.accessors[p.attributes.POSITION];
        for (const cx of [a.min[0], a.max[0]]) for (const cy of [a.min[1], a.max[1]]) for (const cz of [a.min[2], a.max[2]]) {
          apply(m, [cx, cy, cz]).forEach((v, k) => { lo[k] = Math.min(lo[k], v); hi[k] = Math.max(hi[k], v); });
        }
      });
    }
    (n.children || []).forEach((c) => walk(c, m));
  };
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  doc.scenes[doc.scene || 0].nodes.forEach((i) => walk(i, identity));
  return { lo, hi };
}

test("the driver has every part, material and pose the podium uses", () => {
  const doc = gltf(FILE);
  const names = doc.nodes.map((n) => n.name);
  ["driver", "helmet", "body", "trophy", "bottle", "hand_R", "hand_L", "boot_L", "boot_R"]
    .forEach((n) => assert.ok(names.includes(n), `${n} is missing`));
  const mats = doc.materials.map((m) => m.name);
  ["suit", "suit_trim", "gloves", "boots", "balaclava", "helmet", "trophy", "bottle", "foil"]
    .forEach((m) => assert.ok(mats.includes(m), `material ${m} is missing`));
  const poses = doc.animations.map((a) => a.name);
  ["stand", "wave", "arms_up", "trophy", "spray"].forEach((a) => assert.ok(poses.includes(a), `pose ${a} is missing`));
  doc.animations.forEach((a) => assert.ok(a.channels.length > 10, `${a.name} moves the rig`));
});

test("standing, the driver is about 1.78 m on the ground, facing forward", () => {
  const doc = gltf(FILE);
  // The props in the hand don't count toward the figure's height.
  const { lo, hi } = bounds(doc, (n) => n.name === "trophy" || n.name === "bottle");
  assert.ok(Math.abs(lo[1]) < 0.02, `the soles are at ${lo[1]}`);
  assert.ok(hi[1] > 1.72 && hi[1] < 1.86, `the driver stands ${hi[1].toFixed(2)} m`);
  // Facing +x: the boots reach further forward than back.
  assert.ok(hi[0] > -lo[0], "the figure faces forward");
});

test("the driver's helmet is the car's shell, with UVs for the painted design", () => {
  const doc = gltf(FILE);
  const helmet = doc.nodes.find((n) => n.name === "helmet");
  const prim = doc.meshes[helmet.mesh].primitives[0];
  assert.ok("TEXCOORD_0" in prim.attributes);
  const a = doc.accessors[prim.attributes.POSITION];
  // The car's shell: 0.135 round, 1.12 x longer front to back.
  assert.ok(Math.abs((a.max[2] - a.min[2]) / 2 - 0.135 * 1.05) < 0.01, "the helmet is the same shell");
});

test("every pose moves over its loop: the spray really shakes, the arms really wave", () => {
  const buf = fs.readFileSync(FILE);
  const doc = gltf(FILE);
  const bin = buf.subarray(20 + buf.readUInt32LE(12) + 8);
  const read = (i) => {
    const a = doc.accessors[i];
    const view = doc.bufferViews[a.bufferView];
    const size = { SCALAR: 1, VEC3: 3, VEC4: 4 }[a.type];
    const base = (view.byteOffset || 0) + (a.byteOffset || 0);
    const stride = view.byteStride || size * 4;
    return Array.from({ length: a.count }, (_, k) => Array.from({ length: size }, (_, c) => bin.readFloatLE(base + k * stride + c * 4)));
  };
  const nodeName = (i) => doc.nodes[i].name;
  // How far a bone's rotation swings over the loop (the largest change of any quaternion component).
  const swing = (anim, bone) => {
    let most = 0;
    anim.channels.filter((c) => c.target.path === "rotation" && nodeName(c.target.node) === bone).forEach((c) => {
      const out = read(anim.samplers[c.sampler].output);
      for (let k = 0; k < 4; k += 1) most = Math.max(most, Math.max(...out.map((q) => q[k])) - Math.min(...out.map((q) => q[k])));
    });
    return most;
  };
  const anim = (name) => doc.animations.find((a) => a.name === name);
  assert.ok(swing(anim("spray"), "upper_arm_R") > 0.02, "the spray's arm shakes");
  assert.ok(swing(anim("wave"), "forearm_R") > 0.05, "the wave's forearm waves");
  assert.ok(swing(anim("stand"), "chest") > 0.001, "standing, the chest breathes");
});

// --- v2 (docs/superpowers/specs/2026-10-01-driver-v2-design.md) ---------------

// Node index -> world matrix in the rest pose.
function worldMatrices(doc) {
  const out = new Map();
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const walk = (i, parent) => {
    const m = mul(parent, compose(doc.nodes[i]));
    out.set(i, m);
    (doc.nodes[i].children || []).forEach((c) => walk(c, m));
  };
  doc.scenes[doc.scene || 0].nodes.forEach((i) => walk(i, identity));
  return out;
}
function nodeBounds(doc, name) {
  const mats = worldMatrices(doc);
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  doc.nodes.forEach((n, i) => {
    if (n.name !== name || n.mesh === undefined) return;
    doc.meshes[n.mesh].primitives.forEach((p) => {
      const a = doc.accessors[p.attributes.POSITION];
      for (const cx of [a.min[0], a.max[0]]) for (const cy of [a.min[1], a.max[1]]) for (const cz of [a.min[2], a.max[2]]) {
        apply(mats.get(i), [cx, cy, cz]).forEach((v, k) => { lo[k] = Math.min(lo[k], v); hi[k] = Math.max(hi[k], v); });
      }
    });
  });
  return { lo, hi };
}

test("v2: the body is one smooth skinned mesh over the whole rig, dressed by region", () => {
  const doc = gltf(FILE);
  const body = doc.nodes.find((n) => n.name === "body");
  assert.ok(body && body.mesh !== undefined, "there is a body mesh");
  assert.ok(body.skin !== undefined, "the body is skinned");
  assert.ok(doc.skins[body.skin].joints.length === 16, "every bone of the rig drives it");
  const prims = doc.meshes[body.mesh].primitives;
  prims.forEach((p) => assert.ok("JOINTS_0" in p.attributes && "WEIGHTS_0" in p.attributes, "weights on every part"));
  const tris = prims.reduce((n, p) => n + doc.accessors[p.indices].count / 3, 0);
  assert.ok(tris > 10000 && tris < 20000, `${tris} triangles`);
  const onBody = prims.map((p) => doc.materials[p.material].name);
  ["suit", "suit_trim", "gloves", "balaclava"].forEach((m) => assert.ok(onBody.includes(m), `the body wears ${m}`));
  // The old jointed parts are gone.
  const names = doc.nodes.map((n) => n.name);
  ["shoulder_ball_L", "knee_ball_R", "upper_arm_L", "arm_stripe_R"].forEach((n) => assert.ok(!names.some((x) => x === n && doc.nodes.find((d) => d.name === x).mesh !== undefined), `${n} is no longer a separate part`));
});

test("v2: no gaps: the boots rise over the ankles and the helmet sits down over the neck", () => {
  const doc = gltf(FILE);
  ["boot_L", "boot_R"].forEach((b) => {
    const { hi } = nodeBounds(doc, b);
    assert.ok(hi[1] > 0.15, `${b} reaches ${hi[1].toFixed(3)} m, over the ankle`);
  });
  const helmet = nodeBounds(doc, "helmet");
  // The neck runs up to about 1.56 m inside the helmet.
  assert.ok(helmet.lo[1] < 1.53, `the helmet's rim is at ${helmet.lo[1].toFixed(3)} m`);
});

test("v2: the hands have fingers", () => {
  const doc = gltf(FILE);
  ["hand_L", "hand_R"].forEach((h) => {
    const node = doc.nodes.find((n) => n.name === h && n.mesh !== undefined);
    assert.ok(node, `${h} has a mesh`);
    const verts = doc.meshes[node.mesh].primitives.reduce((n, p) => n + doc.accessors[p.attributes.POSITION].count, 0);
    assert.ok(verts > 300, `${h} has ${verts} vertices`);
  });
});
