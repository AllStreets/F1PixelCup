const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// The JSON chunk of a .glb (header 12 bytes, then chunk length, type, data).
function gltf(name) {
  const buf = fs.readFileSync(path.join(__dirname, "..", "assets", "items", `${name}.glb`));
  const length = buf.readUInt32LE(12);
  return JSON.parse(buf.subarray(20, 20 + length).toString("utf8"));
}

function triangles(doc) {
  return doc.meshes.flatMap((m) => m.primitives).reduce((n, p) => n + doc.accessors[p.indices].count / 3, 0);
}

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const hex = (h) => [1, 3, 5].map((i) => srgbToLinear(parseInt(h.slice(i, i + 2), 16) / 255));
const material = (doc, name) => doc.materials.find((m) => m.name === name);
const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 0.01);

const MODELS = ["item_box", "oil", "debris", "undercut", "steward", "safety_car"];

test("colours are authored in sRGB and stored linear, as glTF wants", () => {
  const band = material(gltf("undercut"), "tyre_band").pbrMetallicRoughness.baseColorFactor;
  assert.ok(near(band.slice(0, 3), hex("#e8002d")), `soft band ${band}`);
  const blue = material(gltf("steward"), "fia_blue").pbrMetallicRoughness.baseColorFactor;
  assert.ok(near(blue.slice(0, 3), hex("#0054e6")), `FIA blue ${blue}`);
  const stripe = material(gltf("safety_car"), "sc_stripe").pbrMetallicRoughness.baseColorFactor;
  assert.ok(near(stripe.slice(0, 3), hex("#00a06b")), `stripe ${stripe}`);
});

test("only the glass is double-sided; everything else culls its back faces", () => {
  MODELS.forEach((name) => gltf(name).materials.forEach((m) => {
    assert.equal(Boolean(m.doubleSided), m.name === "box_glass", `${name}: ${m.name}`);
  }));
});

test("triangle budgets: each item under 3k, the one safety car under 5k", () => {
  MODELS.forEach((name) => {
    const n = triangles(gltf(name));
    assert.ok(n < (name === "safety_car" ? 5000 : 3000), `${name} has ${n} triangles`);
  });
});

test("the debris turns about its own middle", () => {
  const doc = gltf("debris");
  const pos = doc.meshes.flatMap((m) => m.primitives).map((p) => doc.accessors[p.attributes.POSITION]);
  const min = [0, 1, 2].map((i) => Math.min(...pos.map((a) => a.min[i])));
  const max = [0, 1, 2].map((i) => Math.max(...pos.map((a) => a.max[i])));
  [0, 1, 2].forEach((i) => assert.ok(Math.abs((min[i] + max[i]) / 2) < 0.2, `axis ${i} centre ${(min[i] + max[i]) / 2}`));
});
