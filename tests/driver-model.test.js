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
  ["driver", "helmet", "torso", "trophy", "bottle", "hand_R", "hand_L", "boot_L", "boot_R"]
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
