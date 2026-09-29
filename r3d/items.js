// The hand-built power-up models (tools/blender/build_items.py ->
// assets/items/*.glb). They load in the background; until they arrive the
// game draws its simple procedural stand-ins, and every place that shows an
// item swaps to the model the moment it lands (see swapBody), so nothing is
// ever missing and nothing waits on them.
//
// The models' materials are named by role. Most are used as they come; the
// shards get a carbon weave here, the oil pool its slick surface in
// ./powerups.js (dressOil), and each safety-car lamp and each item box's
// glowing materials get their own copies so they can animate on their own.
//
// Each model settles on its own: one that fails to load leaves only that kind
// on its stand-in. Before anything swaps, the caller's prepare step (render3d
// compiles the new shaders) runs, so a swap never stalls a frame.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { canvasTexture } from "./textures.js";

const FILES = {
  itemBox: "item_box",
  oil: "oil",
  debris: "debris",
  undercut: "undercut",
  steward: "steward",
  safetyCar: "safety_car",
};

const templates = {};
const waiting = [];
const failedKinds = new Set();
let ready = false;

let weave = null;
function carbonWeave() {
  if (!weave) {
    weave = canvasTexture(64, 64, (g, w, h) => {
      g.fillStyle = "#15181d";
      g.fillRect(0, 0, w, h);
      // A 2x2 twill: alternating light and dark tows.
      for (let y = 0; y < h; y += 8) {
        for (let x = 0; x < w; x += 8) {
          const light = ((x + y) / 8) % 2 === 0;
          const grad = light ? g.createLinearGradient(x, y, x + 8, y) : g.createLinearGradient(x, y, x, y + 8);
          grad.addColorStop(0, light ? "#2c323b" : "#1b1f25");
          grad.addColorStop(0.5, light ? "#4a525e" : "#2a3038");
          grad.addColorStop(1, light ? "#2c323b" : "#1b1f25");
          g.fillStyle = grad;
          g.fillRect(x + 0.5, y + 0.5, 7, 7);
        }
      }
    });
    weave.repeat.set(3, 3);
  }
  return weave;
}

// The game's own materials for a few roles; everything else as modelled.
const overrides = {
  carbon_weave: () => new THREE.MeshStandardMaterial({ map: carbonWeave(), color: 0xffffff, roughness: 0.3, metalness: 0.55 }),
};

// Materials a copy animates on its own, so each copy gets a clone.
const OWN = new Set(["box_glass", "box_frame", "sc_lamp"]);

function prepare(kind, scene) {
  scene.traverse((node) => {
    if (!node.isMesh) return;
    const mats = () => (Array.isArray(node.material) ? node.material : [node.material]);
    // The oil lies flat on the road; the box's "?" and glass are too slight to
    // shadow (the frame's shadow is the box's).
    node.castShadow = kind !== "oil" && !mats().some((m) => m.name === "box_mark" || m.name === "box_glass");
    node.receiveShadow = true;
    const swap = (m) => (overrides[m.name] ? overrides[m.name]() : m);
    node.material = Array.isArray(node.material) ? node.material.map(swap) : swap(node.material);
    mats().forEach((m) => {
      // See-through glass, both faces in one pass (three otherwise draws a
      // transparent double-sided material twice, re-checking its shader).
      if (m.name === "box_glass") { m.transparent = true; m.depthWrite = false; m.side = THREE.DoubleSide; m.forceSinglePass = true; }
      // What the box's pulse multiplies (see r3d/track.js).
      if ("emissiveIntensity" in m) m.userData.baseEmissive = m.emissiveIntensity;
    });
  });
  scene.userData.kind = kind;
  return scene;
}

// prepare(templates) may return a promise (render3d compiles the shaders);
// the swaps wait for it.
export function loadItemModels({ prepare: beforeSwap } = {}) {
  const loader = new GLTFLoader();
  const kinds = Object.keys(FILES);
  let left = kinds.length;
  const settle = () => {
    left -= 1;
    if (left > 0) return;
    Promise.resolve(beforeSwap ? beforeSwap({ ...templates }) : null).catch(() => {}).then(() => {
      ready = true;
      waiting.splice(0).forEach((fn) => fn());
    });
  };
  kinds.forEach((kind) => {
    loader.load(`./assets/items/${FILES[kind]}.glb`, (gltf) => {
      templates[kind] = prepare(kind, gltf.scene);
      settle();
    }, undefined, (error) => {
      // A missing model is not fatal: that kind keeps its stand-in.
      failedKinds.add(kind);
      console.warn(`Item model ${kind} did not load`, error);
      settle();
    });
  });
}

// A fresh copy of a model, or null while it hasn't loaded. Materials are shared
// between copies, except the ones a copy animates on its own (the item box's
// glow and the safety-car lamps), which are cloned.
export function itemModel(kind) {
  const t = templates[kind];
  if (!t || !ready) return null;
  const copy = t.clone(true);
  copy.traverse((node) => {
    if (!node.isMesh) return;
    const own = (m) => {
      if (!OWN.has(m.name)) return m;
      const c = m.clone();
      c.userData.ownedClone = true;
      return c;
    };
    node.material = Array.isArray(node.material) ? node.material.map(own) : own(node.material);
  });
  copy.userData.fromGlb = true;
  return copy;
}

// Call fn now if the models are in, else as soon as they are.
export function whenItemsReady(fn) {
  if (ready) fn();
  else waiting.push(fn);
}

export const itemsState = () => ({ ready, failed: [...failedKinds] });

// One copy of every loaded model: what render3d compiles before the swaps.
export const itemTemplates = () => ({ ...templates });

// Free what a copy owns (its cloned materials); the shared geometry and the
// shared materials belong to the templates.
export function disposeItemCopy(model) {
  model.traverse((node) => {
    if (!node.isMesh) return;
    (Array.isArray(node.material) ? node.material : [node.material]).forEach((m) => { if (m.userData.ownedClone) m.dispose(); });
  });
}

// Free a stand-in outright: its geometry, materials and textures are its own.
function disposeStandIn(body) {
  body.traverse((node) => {
    if (node.geometry) node.geometry.dispose();
    if (!node.material) return;
    (Array.isArray(node.material) ? node.material : [node.material]).forEach((m) => {
      if (m.map && !m.map.userData.shared) m.map.dispose();
      m.dispose();
    });
  });
}

// Replace a holder's body (its stand-in) with the model's copy.
export function swapBody(holder, model) {
  if (!model) return false;
  const old = holder.userData.body;
  if (old) {
    holder.remove(old);
    if (!old.userData.fromGlb) disposeStandIn(old);
  }
  holder.add(model);
  holder.userData.body = model;
  return true;
}
