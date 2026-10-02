// Reading a GLB in Node, for the model tests: its glTF document, its
// accessors' numbers, and each named part's bounds (through its nodes'
// transforms) and triangle count. (Not a test file itself.)
const fs = require("node:fs");

function load(file) {
  const buf = fs.readFileSync(file);
  const jsonLength = buf.readUInt32LE(12);
  const doc = JSON.parse(buf.subarray(20, 20 + jsonLength).toString("utf8"));
  const bin = buf.subarray(20 + jsonLength + 8);
  return { doc, bin };
}

const SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const READ = {
  5126: (b, o) => b.readFloatLE(o),
  5125: (b, o) => b.readUInt32LE(o),
  5123: (b, o) => b.readUInt16LE(o),
  5121: (b, o) => b.readUInt8(o),
};
const BYTES = { 5126: 4, 5125: 4, 5123: 2, 5121: 1 };

// An accessor's values, one array per element.
function read({ doc, bin }, index) {
  const a = doc.accessors[index];
  const view = doc.bufferViews[a.bufferView];
  const size = SIZE[a.type];
  const base = (view.byteOffset || 0) + (a.byteOffset || 0);
  const stride = view.byteStride || size * BYTES[a.componentType];
  const get = READ[a.componentType];
  return Array.from({ length: a.count }, (_, k) => Array.from({ length: size }, (_, c) => get(bin, base + k * stride + c * BYTES[a.componentType])));
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
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

// Every node with its world matrix (the scene's roots down).
function walk({ doc }, visit) {
  const go = (i, parent) => {
    const n = doc.nodes[i];
    const m = mul(parent, compose(n));
    visit(n, m, i);
    (n.children || []).forEach((c) => go(c, m));
  };
  doc.scenes[doc.scene || 0].nodes.forEach((i) => go(i, IDENTITY));
}

// The subtree under a named node (or the whole scene): its bounds in world
// space, its triangles, and its materials' names.
function part(glb, name = null) {
  const { doc } = glb;
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  let tris = 0;
  const materials = new Set();
  const inside = new Set();
  walk(glb, (n, m, i) => {
    const parentIn = doc.nodes.some((p, pi) => inside.has(pi) && (p.children || []).includes(i));
    if (name === null || n.name === name || parentIn) inside.add(i);
    if (!inside.has(i) || n.mesh === undefined) return;
    doc.meshes[n.mesh].primitives.forEach((p) => {
      const a = doc.accessors[p.attributes.POSITION];
      for (const cx of [a.min[0], a.max[0]]) for (const cy of [a.min[1], a.max[1]]) for (const cz of [a.min[2], a.max[2]]) {
        apply(m, [cx, cy, cz]).forEach((v, k) => { lo[k] = Math.min(lo[k], v); hi[k] = Math.max(hi[k], v); });
      }
      tris += (p.indices !== undefined ? doc.accessors[p.indices].count : a.count) / 3;
      if (p.material !== undefined) materials.add(doc.materials[p.material].name);
    });
  });
  return { lo, hi, size: hi.map((v, k) => v - lo[k]), tris, materials: [...materials], found: inside.size > 0 };
}

function node({ doc }, name) {
  return doc.nodes.find((n) => n.name === name);
}

// A node's world position.
function at(glb, name) {
  let out = null;
  walk(glb, (n, m) => { if (n.name === name) out = [m[12], m[13], m[14]]; });
  return out;
}

module.exports = { load, read, part, node, at, walk, apply };
