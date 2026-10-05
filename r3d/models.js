// The trackside models built in Blender (tools/blender/build_landmarks.py,
// build_people.py, build_yachts.py; docs/superpowers/specs/2026-10-01-trackside-blender-design.md).
//
// Two sets:
// - the core (the people and the stands, at every circuit) loads with the
//   car, and the renderer is ready once it has loaded or failed;
// - each venue's own models (its landmarks, its yachts) load when its circuit
//   is prepared: Render3D.prepare() waits for them behind the loading panel,
//   so everything that draws is in the scene when its shaders compile. Only
//   the venue raced loads (24 venues' landmarks would be a lot to download
//   and hold for one race); loadAllVenueModels is for the checks.
// A model that fails to load leaves its procedural stand-in in place.

import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// Landmarks (and the yachts) are drawn at the city's scale: its windows are
// 8 units a storey (buildingMaterial), about 2.5 units a metre
// (docs/superpowers/specs/2026-10-01-trackside-blender-design.md).
export const LANDMARK_SCALE = 2.5;

export const FILES = {
  casino: "./assets/landmarks/casino.glb",
  marinaBaySands: "./assets/landmarks/marina_bay_sands.glb",
  singaporeFlyer: "./assets/landmarks/singapore_flyer.glb",
  suzukaWheel: "./assets/landmarks/suzuka_wheel.glb",
  monzaBanking: "./assets/landmarks/monza_banking.glb",
  spaPits: "./assets/landmarks/spa_pits.glb",
  silverstoneWing: "./assets/landmarks/silverstone_wing.glb",
  sakhirTower: "./assets/landmarks/sakhir_tower.glb",
  spTowers: "./assets/landmarks/sp_towers.glb",
  // The 2025 calendar's other venues (tools/blender/build_landmarks_2025.py).
  melbourneSkyline: "./assets/landmarks/melbourne_skyline.glb",
  shanghaiGrandstand: "./assets/landmarks/shanghai_grandstand.glb",
  jeddahFountain: "./assets/landmarks/jeddah_fountain.glb",
  miamiStadium: "./assets/landmarks/miami_stadium.glb",
  hillside: "./assets/landmarks/hillside.glb",
  barcelonaGrandstand: "./assets/landmarks/barcelona_grandstand.glb",
  biosphere: "./assets/landmarks/biosphere.glb",
  spielbergBull: "./assets/landmarks/spielberg_bull.glb",
  hugenholtz: "./assets/landmarks/hugenholtz.glb",
  flameTowers: "./assets/landmarks/flame_towers.glb",
  bakuOldCity: "./assets/landmarks/baku_old_city.glb",
  cotaTower: "./assets/landmarks/cota_tower.glb",
  foroSol: "./assets/landmarks/foro_sol.glb",
  vegasSphere: "./assets/landmarks/vegas_sphere.glb",
  vegasStrip: "./assets/landmarks/vegas_strip.glb",
  losailGrandstand: "./assets/landmarks/losail_grandstand.glb",
  lusailTowers: "./assets/landmarks/lusail_towers.glb",
  yasHotel: "./assets/landmarks/yas_hotel.glb",
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
  albertpark: ["melbourneSkyline"],
  shanghai: ["shanghaiGrandstand"],
  jeddah: ["jeddahFountain", "yachts"],
  miami: ["miamiStadium", "yachts"],
  imola: ["hillside"],
  barcelona: ["barcelonaGrandstand"],
  montreal: ["biosphere"],
  redbullring: ["spielbergBull", "hillside"],
  hungaroring: ["hillside"],
  zandvoort: ["hugenholtz"],
  baku: ["flameTowers", "bakuOldCity", "yachts"],
  cota: ["cotaTower", "hillside"],
  mexico: ["foroSol"],
  lasvegas: ["vegasSphere", "vegasStrip"],
  losail: ["losailGrandstand", "lusailTowers"],
  yasmarina: ["yasHotel", "yachts"],
};

const templates = {};
const failed = [];
// name -> a promise of its settling (loaded or failed).
const loading = {};
let settled = false;
let loader = null;

// A download that brings nothing for this long has stalled: the model counts
// as failed (its stand-in is used) rather than holding the loading panel up.
export const STALL_MS = 20000;

function load(name, files) {
  if (loading[name]) return loading[name];
  loader = loader || new GLTFLoader();
  loading[name] = new Promise((resolve) => {
    let done = false;
    let lastProgress = performance.now();
    let lastTick = lastProgress;
    const settle = (ok, scene, why) => {
      if (done) return;
      done = true;
      clearInterval(watch);
      if (ok) templates[name] = scene;
      else {
        console.warn(`Trackside model ${name} failed to load; using the stand-in.`, why);
        failed.push(name);
      }
      resolve();
    };
    // Each chunk that arrives is progress: a slow connection keeps the loader
    // up (game.js) rather than calling the download stalled.
    const progress = () => {
      lastProgress = performance.now();
      if (window.Render3DBoot) window.Render3DBoot.progressAt = lastProgress;
    };
    const watch = setInterval(() => {
      // While the page itself was busy (a circuit being built), the download
      // could report nothing: that time doesn't count against it.
      const now = performance.now();
      if (now - lastTick > 2500) lastProgress += now - lastTick - 1000;
      lastTick = now;
      if (now - lastProgress > STALL_MS) settle(false, null, "the download stalled");
    }, 1000);
    loader.load(files[name], (gltf) => settle(true, gltf.scene), progress, (error) => settle(false, null, error));
  });
  return loading[name];
}

// Calls done() once every core model has loaded or failed. A venue's own
// models load when its circuit is prepared (venueModelsSettled).
export function loadTracksideModels(done, files = FILES) {
  Promise.all(CORE_MODELS.map((n) => load(n, files))).then(() => {
    settled = true;
    done();
  });
}

// Every venue's models, a venue at a time; resolves when all have settled
// (for the checks, which visit every circuit). From then on none is released.
let everything = null;
let keepAll = false;
export function loadAllVenueModels(files = FILES) {
  keepAll = true;
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

// Release every venue's models but this one's (and the core's): their
// geometry leaves the GPU, and they load again if their venue comes round.
// Called as a new circuit's world is built, the last one's already gone, so
// a season holds one venue's landmarks at a time. (Not once every venue's
// were asked for: the checks visit every circuit in turn.)
export function releaseOtherVenues(venueId) {
  if (keepAll) return [];
  const keep = new Set([...CORE_MODELS, ...(VENUE_MODELS[venueId] || [])]);
  const released = [];
  Object.keys(templates).forEach((name) => {
    if (keep.has(name)) return;
    templates[name].traverse((n) => { if (n.geometry) n.geometry.dispose(); });
    delete templates[name];
    delete loading[name];
    released.push(name);
  });
  return released;
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
