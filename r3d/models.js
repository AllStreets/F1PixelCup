// The trackside models built in Blender (tools/blender/build_landmarks.py,
// build_people.py, build_yachts.py; docs/superpowers/specs/2026-10-01-trackside-blender-design.md).
//
// Two sets:
// - the core (the people, at every circuit) loads with the car, and the
//   renderer is ready once it has loaded or failed;
// - each venue's own models (its landmarks, its yachts, its type of stand)
//   load when its circuit is prepared: Render3D.prepare() waits for them
//   behind the loading panel, so everything that draws is in the scene when
//   its shaders compile. Once a race is ready, the cup's next circuits'
//   models are fetched one circuit at a time (preloadVenues), so the next
//   loading panel is short; a slow connection fetches only what the cup
//   shows.
// The models are compressed (tools/compress-models.mjs): meshoptimizer's
// decoder, as three.js ships it, unpacks them. A model that fails to load
// leaves its procedural stand-in in place.

import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { Float32BufferAttribute } from "three";

// Landmarks (and the yachts) are drawn at the city's scale: its windows are
// 8 units a storey (buildingMaterial), about 2.5 units a metre
// (docs/superpowers/specs/2026-10-01-trackside-blender-design.md).
export const LANDMARK_SCALE = 2.5;

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

export const CORE_MODELS = ["people"];
// The stand each type of venue builds (r3d/landmarks.js VENUES: stand).
export const STAND_MODELS = { covered: "grandstand", open: "grandstandOpen" };
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

// A download that brings nothing for this long has stalled: it is tried once
// more, then the model counts as failed (its stand-in is used) rather than
// holding the loading panel up.
export const STALL_MS = 20000;

function load(name, files) {
  if (loading[name]) return loading[name];
  if (!loader) {
    loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
  }
  loading[name] = new Promise((resolve) => {
    let done = false;
    // How long the download has been silent, counted only in the watch's
    // own on-time seconds: a busy page (building a circuit, say) holds its
    // events back, and that is not the network's silence.
    let silent = 0;
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
      silent = 0;
      if (window.Render3DBoot) window.Render3DBoot.progressAt = performance.now();
    };
    let lastTick = performance.now();
    const watch = setInterval(() => {
      const now = performance.now();
      silent += Math.min(now - lastTick, 1100);
      lastTick = now;
      if (silent > STALL_MS) {
        if (tries < 2) attempt();
        else settle(false, null, "the download stalled");
      }
    }, 1000);
    // A download that fails or stalls is tried once more before the model
    // counts as failed.
    let tries = 0;
    const attempt = () => {
      tries += 1;
      silent = 0;
      // Each attempt its own: a stalled first request that errors (or
      // trickles in) later never fails or feeds the retry.
      const mine = tries;
      loader.load(`${files[name]}${tries > 1 ? `?retry=${tries}` : ""}`, (gltf) => settle(true, gltf.scene), () => { if (mine === tries) progress(); }, (error) => {
        if (mine !== tries) return;
        if (tries < 2) attempt();
        else settle(false, null, error);
      });
    };
    attempt();
  });
  return loading[name];
}

// Calls done() once every core model has loaded or failed.
export function loadTracksideModels(done, files = FILES) {
  Promise.all(CORE_MODELS.map((n) => load(n, files))).then(() => {
    settled = true;
    done();
  });
}

// Every venue's models (for the checks, which audit every circuit);
// resolves when all have settled.
export function loadAllVenueModels(files = FILES) {
  return Promise.all([...Object.values(VENUE_MODELS).flat(), ...Object.values(STAND_MODELS)].map((n) => load(n, files)));
}

// Models that failed while fetched ahead (not for a circuit being
// prepared): tried again when a circuit needs them.
const failedAhead = new Set();
let ahead = Promise.resolve();

// The cup's next circuits' models, one circuit at a time, after whatever is
// already being fetched.
export function preloadVenues(groups, files = FILES) {
  groups.forEach((names) => {
    ahead = ahead.then(() => Promise.all(names.map((n) => {
      const known = n in loading;
      return load(n, files).then(() => { if (!known && failed.includes(n)) failedAhead.add(n); });
    })));
  });
}

// Has a venue's every model loaded or failed? Starts any not yet asked for
// (and tries again any that failed only while fetched ahead).
// `extra`: more it needs (its stand's model).
export function venueModelsSettled(venueId, extra = [], files = FILES) {
  const names = [...(VENUE_MODELS[venueId] || []), ...extra];
  names.forEach((n) => {
    if (!failedAhead.has(n)) return;
    failedAhead.delete(n);
    failed.splice(failed.indexOf(n), 1);
    delete loading[n];
  });
  names.forEach((n) => load(n, files));
  return names.every((n) => n in templates || failed.includes(n));
}

// An attribute as plain floats, its values unpacked (a compressed model's are
// quantized integers), ready to be transformed and merged.
export function floats(attribute) {
  const n = attribute.count;
  const size = attribute.itemSize;
  const out = new Float32Array(n * size);
  const get = [attribute.getX, attribute.getY, attribute.getZ, attribute.getW];
  for (let i = 0; i < n; i += 1) for (let k = 0; k < size; k += 1) out[i * size + k] = get[k].call(attribute, i);
  return new Float32BufferAttribute(out, size);
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
