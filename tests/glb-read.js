// Reading a GLB in Node, for the model tests: its glTF document, its
// accessors' numbers, and each named part's bounds (through its nodes'
// transforms), triangle count and triangles. (Not a test file itself.)
const fs = require("node:fs");

// The trackside models ship compressed (EXT_meshopt_compression and
// KHR_mesh_quantization, tools/compress-models.mjs): the game's own decoder
// (vendor/three/addons/libs/meshopt_decoder.module.js) unpacks them here too.
// Call `await ready()` once (a test file's before()) before load().
let decoder = null;
async function ready() {
  if (decoder) return;
  const url = require("node:url").pathToFileURL(require("node:path").join(__dirname, "..", "vendor", "three", "addons", "libs", "meshopt_decoder.module.js")).href;
  decoder = (await import(url)).MeshoptDecoder;
  await decoder.ready;
}

function load(file) {
  const buf = fs.readFileSync(file);
  const jsonLength = buf.readUInt32LE(12);
  const doc = JSON.parse(buf.subarray(20, 20 + jsonLength).toString("utf8"));
  let bin = buf.subarray(20 + jsonLength + 8);
  // Compressed views, unpacked into a buffer of their own (appended).
  const packed = doc.bufferViews.filter((v) => v.extensions && v.extensions.EXT_meshopt_compression);
  if (packed.length) {
    if (!decoder) throw new Error("compressed model: call glb-read's ready() first");
    const parts = [bin];
    let at = bin.length;
    packed.forEach((v) => {
      const m = v.extensions.EXT_meshopt_compression;
      const source = bin.subarray(m.byteOffset || 0, (m.byteOffset || 0) + m.byteLength);
      const out = new Uint8Array(m.count * m.byteStride);
      decoder.decodeGltfBuffer(out, m.count, m.byteStride, source, m.mode, m.filter);
      v.byteOffset = at;
      v.byteLength = out.length;
      delete v.extensions;
      parts.push(Buffer.from(out));
      at += out.length;
    });
    bin = Buffer.concat(parts);
  }
  return { doc, bin };
}

const SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const READ = {
  5126: (b, o) => b.readFloatLE(o),
  5125: (b, o) => b.readUInt32LE(o),
  5123: (b, o) => b.readUInt16LE(o),
  5122: (b, o) => b.readInt16LE(o),
  5121: (b, o) => b.readUInt8(o),
  5120: (b, o) => b.readInt8(o),
};
const BYTES = { 5126: 4, 5125: 4, 5123: 2, 5122: 2, 5121: 1, 5120: 1 };
// Normalized integers to their values (glTF's rules).
const NORM = { 5123: (v) => v / 65535, 5122: (v) => Math.max(v / 32767, -1), 5121: (v) => v / 255, 5120: (v) => Math.max(v / 127, -1) };

// An accessor's values, one array per element.
function read({ doc, bin }, index) {
  const a = doc.accessors[index];
  const view = doc.bufferViews[a.bufferView];
  const size = SIZE[a.type];
  const base = (view.byteOffset || 0) + (a.byteOffset || 0);
  const stride = view.byteStride || size * BYTES[a.componentType];
  const raw = READ[a.componentType];
  const get = a.normalized ? (b, o) => NORM[a.componentType](raw(b, o)) : raw;
  return Array.from({ length: a.count }, (_, k) => Array.from({ length: size }, (_, c) => get(bin, base + k * stride + c * BYTES[a.componentType])));
}

// An accessor's bounds, from its values (a quantized one's min and max are
// in its stored integers).
function bounds(glb, index) {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  read(glb, index).forEach((v) => v.forEach((x, k) => { lo[k] = Math.min(lo[k], x); hi[k] = Math.max(hi[k], x); }));
  return { min: lo, max: hi };
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
      const box = a.componentType === 5126 ? a : bounds(glb, p.attributes.POSITION);
      for (const cx of [box.min[0], box.max[0]]) for (const cy of [box.min[1], box.max[1]]) for (const cz of [box.min[2], box.max[2]]) {
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

// Every triangle of a named node's own meshes, in world space.
function triangles(glb, name) {
  const out = [];
  walk(glb, (n, m) => {
    if (n.name !== name || n.mesh === undefined) return;
    glb.doc.meshes[n.mesh].primitives.forEach((p) => {
      const pos = read(glb, p.attributes.POSITION).map((v) => apply(m, v));
      const idx = p.indices !== undefined ? read(glb, p.indices).map((v) => v[0]) : pos.map((_, i) => i);
      for (let i = 0; i < idx.length; i += 3) out.push([pos[idx[i]], pos[idx[i + 1]], pos[idx[i + 2]]]);
    });
  });
  return out;
}

// The highest surface of `tris` straight below (x, top, z), or -Infinity.
function groundBelow(tris, x, top, z) {
  let best = -Infinity;
  tris.forEach(([a, b, c]) => {
    const d = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
    if (Math.abs(d) < 1e-12) return;
    const u = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / d;
    const v = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / d;
    const w = 1 - u - v;
    if (u < -1e-6 || v < -1e-6 || w < -1e-6) return;
    const y = u * a[1] + v * b[1] + w * c[1];
    if (y <= top && y > best) best = y;
  });
  return best;
}

// The volume a node's own mesh encloses, signed: positive when its faces
// face outward (an open mesh, missing its floor, still comes out positive).
function signedVolume(glb, name) {
  let v = 0;
  triangles(glb, name).forEach(([a, b, c]) => {
    v += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  });
  return v;
}

module.exports = { ready, load, read, part, node, at, walk, apply, triangles, groundBelow, signedVolume };
