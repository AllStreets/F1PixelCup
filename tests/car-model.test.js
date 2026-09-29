const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// Positions of every primitive drawn with a given material, from the GLB.
function positions(file, materialName) {
  const buf = fs.readFileSync(file);
  const jsonLength = buf.readUInt32LE(12);
  const doc = JSON.parse(buf.subarray(20, 20 + jsonLength).toString("utf8"));
  const bin = buf.subarray(20 + jsonLength + 8);
  const mat = doc.materials.findIndex((m) => m.name === materialName);
  const out = [];
  doc.meshes.forEach((mesh) => mesh.primitives.filter((p) => p.material === mat).forEach((p) => {
    const acc = doc.accessors[p.attributes.POSITION];
    const view = doc.bufferViews[acc.bufferView];
    const base = (view.byteOffset || 0) + (acc.byteOffset || 0);
    const stride = view.byteStride || 12;
    for (let i = 0; i < acc.count; i += 1) {
      const o = base + i * stride;
      out.push([bin.readFloatLE(o), bin.readFloatLE(o + 4), bin.readFloatLE(o + 8)]);
    }
  }));
  return out;
}

test("the helmet's spoiler sits on the shell instead of floating above it", () => {
  const verts = positions(path.join(__dirname, "..", "assets", "f1_car.glb"), "helmet");
  assert.ok(verts.length > 200, "the helmet is there");
  // The shell: an ellipsoid round (-0.12, 0.74, 0) in glTF axes (y up), 0.151 long, 0.135 round.
  const reach = ([x, y, z]) => Math.hypot((x + 0.12) / 0.151, (y - 0.74) / 0.135, z / 0.142);
  const upper = verts.filter(([, y]) => y > 0.74);
  const furthest = Math.max(...upper.map(reach));
  // The spoiler stands proud by at most its own thickness (~0.02 on a 0.135 shell).
  assert.ok(furthest < 1.2, `something on the helmet stands ${((furthest - 1) * 0.135 * 1000).toFixed(0)} mm off the shell`);
  // ...and it is there: something at the top rear reaches past the shell.
  assert.ok(upper.some((v) => v[0] < -0.17 && reach(v) > 1.02), "the spoiler is missing");
});
