// The hand-built power-up models (tools/blender/build_items.py ->
// assets/items/*.glb). They load in the background; until they arrive the
// game draws its simple procedural stand-ins, and every place that shows an
// item swaps to the model the moment it lands (see swapBody), so nothing is
// ever missing and nothing waits on them.
//
// The models' materials are named by role. Most are used as they come; a few
// are swapped for the game's own: the oil pool gets the thin-film slick
// texture, the shards a carbon weave, and each safety-car lamp its own copy so
// the two can flash in turn.
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
let ready = false;
let failed = false;

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

function prepare(kind, scene) {
  scene.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = kind !== "oil";
    node.receiveShadow = true;
    const swap = (m) => (overrides[m.name] ? overrides[m.name]() : m);
    node.material = Array.isArray(node.material) ? node.material.map(swap) : swap(node.material);
    (Array.isArray(node.material) ? node.material : [node.material]).forEach((m) => {
      if (m.name === "box_glass") { m.transparent = true; m.depthWrite = false; m.side = THREE.DoubleSide; }
    });
  });
  scene.userData.kind = kind;
  return scene;
}

export function loadItemModels() {
  const loader = new GLTFLoader();
  const kinds = Object.keys(FILES);
  let left = kinds.length;
  kinds.forEach((kind) => {
    loader.load(`./assets/items/${FILES[kind]}.glb`, (gltf) => {
      templates[kind] = prepare(kind, gltf.scene);
      left -= 1;
      if (left === 0) {
        ready = true;
        waiting.splice(0).forEach((fn) => fn());
      }
    }, undefined, (error) => {
      // A missing model is not fatal: the stand-ins stay.
      failed = true;
      console.warn(`Item model ${kind} did not load`, error);
    });
  });
}

// A fresh copy of a model, or null while it hasn't loaded. Materials are shared
// between copies, except the ones a copy animates on its own (the item box's
// glow and the safety-car lamps), which are cloned.
export function itemModel(kind) {
  const t = templates[kind];
  if (!t) return null;
  const copy = t.clone(true);
  copy.traverse((node) => {
    if (!node.isMesh) return;
    const own = kind === "itemBox" || /^lamp_/.test(node.name);
    if (own) node.material = Array.isArray(node.material) ? node.material.map((m) => m.clone()) : node.material.clone();
  });
  copy.userData.fromGlb = true;
  return copy;
}

// Call fn now if the models are in, else as soon as they are.
export function whenItemsReady(fn) {
  if (ready) fn();
  else waiting.push(fn);
}

export const itemsState = () => ({ ready, failed });

// Replace a holder's body (its stand-in) with the model's copy.
export function swapBody(holder, model) {
  if (!model) return false;
  const old = holder.userData.body;
  if (old) holder.remove(old);
  holder.add(model);
  holder.userData.body = model;
  return true;
}
