// The trackside models built in Blender (tools/blender/build_landmarks.py,
// build_people.py, build_yachts.py; docs/superpowers/specs/2026-10-01-trackside-blender-design.md).
//
// Two sets:
// - the core (the people and the stands, at every circuit) loads with the
//   car, and the renderer is ready once it has loaded or failed;
// - each venue's own models (its landmarks, its yachts) load when its circuit
//   is prepared: Render3D.prepare() waits for them behind the loading panel,
//   so everything that draws is in the scene when its shaders compile. After
//   the core, the rest load quietly in the background, one venue at a time.
// A model that fails to load leaves its procedural stand-in in place.

import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const FILES = {
  casino: "./assets/landmarks/casino.glb",
  marinaBaySands: "./assets/landmarks/marina_bay_sands.glb",
  singaporeFlyer: "./assets/landmarks/singapore_flyer.glb",
  suzukaWheel: "./assets/landmarks/suzuka_wheel.glb",
  monzaBanking: "./assets/landmarks/monza_banking.glb",
  spaPits: "./assets/landmarks/spa_pits.glb",
  silverstoneWing: "./assets/landmarks/silverstone_wing.glb",
  sakhirTower: "./assets/landmarks/sakhir_tower.glb",
  spTowers: "./assets/landmarks/sp_towers.glb",
  grandstand: "./assets/landmarks/grandstand.glb",
  grandstandOpen: "./assets/landmarks/grandstand_open.glb",
  people: "./assets/people.glb",
  yachts: "./assets/yachts.glb",
};

export const CORE_MODELS = ["people", "grandstand", "grandstandOpen"];
// Each venue's own (a venue not listed has none).
export const VENUE_MODELS = {
  monaco: ["casino", "yachts"],
  singapore: ["marinaBaySands", "singaporeFlyer", "yachts"],
  suzuka: ["suzukaWheel"],
  monza: ["monzaBanking"],
  spa: ["spaPits"],
  silverstone: ["silverstoneWing"],
  bahrain: ["sakhirTower"],
  interlagos: ["spTowers"],
};

const templates = {};
const failed = [];
// name -> a promise of its settling (loaded or failed).
const loading = {};
let settled = false;
let loader = null;

function load(name, files) {
  if (loading[name]) return loading[name];
  loader = loader || new GLTFLoader();
  // Each chunk that arrives is progress: a slow connection keeps the loader
  // up (game.js) rather than calling the download stalled.
  const progress = () => { if (window.Render3DBoot) window.Render3DBoot.progressAt = performance.now(); };
  loading[name] = new Promise((resolve) => {
    loader.load(files[name], (gltf) => {
      templates[name] = gltf.scene;
      resolve();
    }, progress, (error) => {
      console.warn(`Trackside model ${name} failed to load; using the stand-in.`, error);
      failed.push(name);
      resolve();
    });
  });
  return loading[name];
}

// Calls done() once every core model has loaded or failed, then starts the
// venues' models in the background.
export function loadTracksideModels(done, files = FILES) {
  Promise.all(CORE_MODELS.map((n) => load(n, files))).then(() => {
    settled = true;
    done();
    loadAllVenueModels(files);
  });
}

// Every venue's models, a venue at a time; resolves when all have settled.
let everything = null;
export function loadAllVenueModels(files = FILES) {
  if (!everything) {
    everything = Object.values(VENUE_MODELS).reduce(
      (chain, names) => chain.then(() => Promise.all(names.map((n) => load(n, files)))),
      Promise.resolve(),
    );
  }
  return everything;
}

// Has a venue's every model loaded or failed? Starts any not yet asked for.
export function venueModelsSettled(venueId, files = FILES) {
  const names = VENUE_MODELS[venueId] || [];
  names.forEach((n) => load(n, files));
  return names.every((n) => n in templates || failed.includes(n));
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
