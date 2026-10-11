// The Earth on the Las Vegas Sphere (tools/sphere/fetch_earth.py ->
// assets/landmarks/vegas_earth.glb, r3d/landmarks.js sphereScreen).
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

const ROOT = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

// A JPEG's width and height, from its frame header.
function jpegSize(buf) {
  for (let i = 2; i < buf.length;) {
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc2) return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)];
    i += 2 + len;
  }
  return null;
}

test("the model carries NASA's Earth and its clouds, sized for the Sphere", () => {
  const buf = fs.readFileSync(path.join(ROOT, "assets", "landmarks", "vegas_earth.glb"));
  assert.equal(buf.toString("latin1", 0, 4), "glTF");
  const jsonLen = buf.readUInt32LE(12);
  const doc = JSON.parse(buf.toString("utf8", 20, 20 + jsonLen));
  const bin = 20 + jsonLen + 8;
  assert.match(doc.asset.copyright, /NASA/);
  assert.deepEqual(doc.materials.map((m) => m.name), ["earth", "clouds"]);
  const image = (name) => {
    const k = doc.images.findIndex((im) => im.name === name);
    const view = doc.bufferViews[doc.images[k].bufferView];
    return buf.subarray(bin + view.byteOffset, bin + view.byteOffset + view.byteLength);
  };
  assert.deepEqual(jpegSize(image("earth")), [2048, 1024]);
  assert.deepEqual(jpegSize(image("clouds")), [1024, 512]);
  assert.ok(image("earth").length < 400 * 1024, `the Earth's map is ${Math.round(image("earth").length / 1024)} KB`);
  assert.ok(buf.length < 520 * 1024, `the model is ${Math.round(buf.length / 1024)} KB`);
  // It repeats round the globe (no seam at the date line) and is loaded with Las Vegas.
  assert.equal(doc.samplers[0].wrapS, 10497);
  assert.ok(/lasvegas: \[[^\]]*"vegasEarth"/.test(read("r3d/models.js")), "Las Vegas does not load it");
});

test("NASA is credited: the notices, the README, the site, the script that fetched it", () => {
  const url = "https://visibleearth.nasa.gov/images/73909";
  assert.ok(read("THIRD-PARTY-NOTICES").includes(url) && /NASA Earth Observatory \/ Visible Earth/.test(read("THIRD-PARTY-NOTICES")));
  assert.ok(/public\s+domain/i.test(read("THIRD-PARTY-NOTICES")));
  assert.ok(read("README.md").includes(url) && read("index.html").includes(url));
  const script = read("tools/sphere/fetch_earth.py");
  assert.ok(script.includes(url) && script.includes("world.topo.bathy.200412.3x5400x2700.jpg") && /fetched 2026-10-12/.test(script));
});

test("the Earth turns by the race's clock about a tilted axis, with a fallback", () => {
  const src = read("r3d/landmarks.js");
  const turn = +src.match(/export const SPHERE_TURN = ([\d.]+);/)[1];
  const tilt = +src.match(/export const SPHERE_TILT = ([\d.]+);/)[1];
  assert.ok(turn >= 40 && turn <= 60, `a turn in ${turn} s`);
  assert.equal(tilt, 23.4);
  const body = src.slice(src.indexOf("function sphereScreen()"), src.indexOf("function spherePlanet()"));
  assert.ok(body.includes("float turn = -uSphereTime * ${(2 * Math.PI / SPHERE_TURN).toFixed(6)}"), "the turn is not the clock's, west to east");
  assert.ok(body.includes("return spherePlanet();"), "no fallback when the map is missing");
  // The date line: the map's fineness from the reading that does not jump, given to the sampler.
  assert.ok(/abs\(d1\.x\) < abs\(d2\.x\)/.test(body) && body.includes("textureGrad(uEarth, at, grad.xy, grad.zw)"), "the date line's seam is not handled");
  assert.ok(!/position\b(?!s)/.test(body.replace(/mvPosition/g, "")), "the shader reads the model's positions (quantized)");
  // The clock is the race's own (seconds), set, not summed, where the frame gives it.
  assert.ok(read("render3d.js").includes("world.landmarks.userData.animate?.(dt, now / 1000);"));
  assert.ok(/earthClocks\.forEach\(\(t\) => \{ t\.value = now === undefined \? t\.value \+ dt : now; \}\);/.test(read("r3d/vegas.js")));
});
