// The trackside models built in Blender (tools/blender/build_landmarks.py,
// tools/blender/build_people.py; docs/superpowers/specs/2026-10-01-trackside-blender-design.md):
// loaded once, with the car, before any circuit is built, so everything that
// draws is in the scene when Render3D.prepare() compiles it. A model that
// fails to load leaves its procedural stand-in in place.

import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const FILES = {
  casino: "./assets/landmarks/casino.glb",
  marinaBaySands: "./assets/landmarks/marina_bay_sands.glb",
  grandstand: "./assets/landmarks/grandstand.glb",
  people: "./assets/people.glb",
};

const templates = {};
const failed = [];
let settled = false;

// Calls done() once every model has loaded or failed.
export function loadTracksideModels(done, files = FILES) {
  const loader = new GLTFLoader();
  // Each chunk that arrives is progress: a slow connection keeps the loader
  // up (game.js) rather than calling the download stalled.
  const progress = () => { if (window.Render3DBoot) window.Render3DBoot.progressAt = performance.now(); };
  const names = Object.keys(files);
  let left = names.length;
  const finish = () => {
    left -= 1;
    if (left === 0) {
      settled = true;
      done();
    }
  };
  names.forEach((name) => {
    loader.load(files[name], (gltf) => {
      templates[name] = gltf.scene;
      finish();
    }, progress, (error) => {
      console.warn(`Trackside model ${name} failed to load; using the stand-in.`, error);
      failed.push(name);
      finish();
    });
  });
}

// A loaded model's scene, or null (not loaded, or failed).
export function tracksideModel(name) {
  return templates[name] || null;
}

// Every loaded model's scene (their geometry is shared by every copy).
export function tracksideTemplates() {
  return Object.values(templates);
}

export function tracksideModelsState() {
  return { settled, loaded: Object.keys(templates), failed: [...failed] };
}
