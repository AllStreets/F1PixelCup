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

// The glTF document of a GLB.
function gltf(file) {
  const buf = fs.readFileSync(file);
  const jsonLength = buf.readUInt32LE(12);
  return JSON.parse(buf.subarray(20, 20 + jsonLength).toString("utf8"));
}
const CAR = path.join(__dirname, "..", "assets", "f1_car.glb");

test("car v2 keeps every part and material the game uses", () => {
  const doc = gltf(CAR);
  const names = doc.nodes.map((n) => n.name);
  ["car_body", "drs_flap", "wheel_FL", "wheel_FR", "wheel_RL", "wheel_RR"].forEach((n) => assert.ok(names.includes(n), `${n} is missing`));
  const mats = doc.materials.map((m) => m.name);
  ["livery_body", "livery_trim", "carbon", "tyre", "tyre_band", "rim", "helmet", "halo", "rain_light"]
    .forEach((m) => assert.ok(mats.includes(m), `material ${m} is missing`));
});

test("the wheels sit on their axles, 18-inch tyres touching the ground", () => {
  const doc = gltf(CAR);
  const node = (n) => doc.nodes.find((x) => x.name === n);
  // glTF axes: x forward, y up, z across (Blender's y left becomes -z).
  for (const [n, x, z] of [["wheel_FL", 1.85, -0.8], ["wheel_FR", 1.85, 0.8], ["wheel_RL", -1.72, -0.78], ["wheel_RR", -1.72, 0.78]]) {
    const t = node(n).translation;
    assert.ok(Math.abs(t[0] - x) < 1e-3 && Math.abs(t[1] - 0.36) < 1e-3 && Math.abs(t[2] - z) < 1e-3, `${n} at ${t}`);
  }
  // Its lowest point is the ground.
  const mesh = doc.meshes[node("wheel_FL").mesh];
  const low = Math.min(...mesh.primitives.map((p) => doc.accessors[p.attributes.POSITION].min[1]));
  assert.ok(Math.abs(low + 0.36) < 0.005, `the tyre reaches ${low}`);
});

test("the DRS flap turns about its leading edge, at the front of the flap", () => {
  const doc = gltf(CAR);
  const flap = doc.nodes.find((x) => x.name === "drs_flap");
  const mesh = doc.meshes[flap.mesh];
  const acc = doc.accessors[mesh.primitives[0].attributes.POSITION];
  // In the flap's own space, the whole flap lies behind its origin (x <= 0) and the origin is on it.
  assert.ok(acc.max[0] < 0.01 && acc.max[0] > -0.01, `the flap reaches ${acc.max[0]} ahead of its pivot`);
  assert.ok(acc.min[0] < -0.15, "the flap has its chord behind the pivot");
});

test("every part carries the baked occlusion, and the tyre band its lettering UVs", () => {
  const doc = gltf(CAR);
  doc.meshes.forEach((m) => m.primitives.forEach((p) => assert.ok("COLOR_0" in p.attributes, `${m.name} has no baked AO`)));
  const band = doc.materials.findIndex((m) => m.name === "tyre_band");
  const wheel = doc.meshes[doc.nodes.find((n) => n.name === "wheel_FL").mesh];
  const prim = wheel.primitives.find((p) => p.material === band);
  assert.ok(prim && "TEXCOORD_0" in prim.attributes, "the sidewall band has UVs");
  // The lettering repeats round the tyre: u spans several repeats.
  const buf = fs.readFileSync(CAR);
  const bin = buf.subarray(20 + buf.readUInt32LE(12) + 8);
  const acc = doc.accessors[prim.attributes.TEXCOORD_0];
  const view = doc.bufferViews[acc.bufferView];
  const base = (view.byteOffset || 0) + (acc.byteOffset || 0);
  const stride = view.byteStride || 8;
  const us = Array.from({ length: acc.count }, (_, i) => bin.readFloatLE(base + i * stride));
  const span = Math.max(...us) - Math.min(...us);
  assert.ok(span >= 3.9, `u spans ${span}`);
});
