// Compress the trackside models in place, after a Blender build:
//
//   node tools/compress-models.mjs [file.glb ...]
//
// With no files, every model in assets/landmarks/ plus assets/people.glb and
// assets/yachts.glb. Each is quantized (KHR_mesh_quantization) and packed
// with meshoptimizer (EXT_meshopt_compression), about a quarter of its size;
// the game (r3d/models.js) and the tests (tests/glb-read.js) unpack them with
// three.js's own decoder (vendor/three/addons/libs/meshopt_decoder.module.js).
// Node names, empties and their extras (rows, seats, joints, decks) are kept.
// A model already compressed is left as it is. Runs gltf-transform through
// npx (fetched on first use; nothing is added to the project).
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const files = process.argv.slice(2).length ? process.argv.slice(2)
  : [...readdirSync(join(root, "assets", "landmarks")).filter((f) => f.endsWith(".glb")).map((f) => join(root, "assets", "landmarks", f)),
    join(root, "assets", "people.glb"), join(root, "assets", "yachts.glb")];

const compressed = (file) => {
  const buf = readFileSync(file);
  const json = buf.subarray(20, 20 + buf.readUInt32LE(12)).toString("utf8");
  return json.includes("EXT_meshopt_compression");
};

files.forEach((file) => {
  if (compressed(file)) { console.log(`${file}: already compressed`); return; }
  const before = statSync(file).size;
  execFileSync("npx", ["--yes", "@gltf-transform/cli@4.1.1", "meshopt", file, file, "--level", "medium"], { stdio: "inherit" });
  console.log(`${file}: ${Math.round(before / 1024)} KB -> ${Math.round(statSync(file).size / 1024)} KB`);
});
